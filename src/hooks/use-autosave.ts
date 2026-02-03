import { useEffect, useRef, useCallback } from "react";
import { BlueprintData } from "./use-blueprint-management";

const DRAFT_AUTOSAVE_KEY = "flowbie-draft-autosave";
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export interface DraftData {
  blueprint: BlueprintData;
  timestamp: number;
}

interface UseAutosaveOptions {
  flowTitle: string;
  flowPurpose: string;
  agents: Array<{ id: string; step: number; title: string; description: string; features: string[]; h2Count?: number; h3Count?: number; h3Enabled?: boolean; headingLevel?: number; maxTokens?: number }>;
  knowledgeFiles: Array<{ name: string; size: number; content: string; starred: boolean; timestamp: number }>;
  activeKnowledgeBaseText: string;
  generateBlueprint: () => BlueprintData;
  enabled?: boolean;
}

export function useAutosave({
  flowTitle,
  flowPurpose,
  agents,
  knowledgeFiles,
  activeKnowledgeBaseText,
  generateBlueprint,
  enabled = true,
}: UseAutosaveOptions) {
  const lastSaveRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousAgentsLengthRef = useRef<number>(agents.length);

  const saveDraft = useCallback(() => {
    if (!enabled) return;

    try {
      const blueprint = generateBlueprint();
      const draftData: DraftData = {
        blueprint,
        timestamp: Date.now(),
      };

      localStorage.setItem(DRAFT_AUTOSAVE_KEY, JSON.stringify(draftData));
      lastSaveRef.current = Date.now();
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  }, [enabled, generateBlueprint]);

  // Auto-save with immediate save for structural changes (agent add/delete)
  // and debounced save for content edits
  useEffect(() => {
    if (!enabled) return;

    // Check if agents array length changed (structural change)
    const isStructuralChange = previousAgentsLengthRef.current !== agents.length;
    
    if (isStructuralChange) {
      // Update ref immediately
      previousAgentsLengthRef.current = agents.length;
      // Save immediately for structural changes
      saveDraft();
      // Clear any pending timeout since we just saved
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // For content edits (non-structural changes), use debounced save
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout to save after 30 seconds of inactivity
    timeoutRef.current = setTimeout(() => {
      saveDraft();
    }, AUTOSAVE_INTERVAL);

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [flowTitle, flowPurpose, agents, knowledgeFiles, activeKnowledgeBaseText, enabled, saveDraft]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (enabled && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        saveDraft();
      }
    };
  }, [enabled, saveDraft]);

  return {
    saveDraft,
    hasUnsavedChanges: Date.now() - lastSaveRef.current > AUTOSAVE_INTERVAL,
  };
}

export function loadDraft(): DraftData | null {
  try {
    const stored = localStorage.getItem(DRAFT_AUTOSAVE_KEY);
    if (stored) {
      return JSON.parse(stored) as DraftData;
    }
  } catch (error) {
    console.error("Failed to load draft:", error);
  }
  return null;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_AUTOSAVE_KEY);
  } catch (error) {
    console.error("Failed to clear draft:", error);
  }
}

export function hasDraft(): boolean {
  try {
    return localStorage.getItem(DRAFT_AUTOSAVE_KEY) !== null;
  } catch {
    return false;
  }
}
