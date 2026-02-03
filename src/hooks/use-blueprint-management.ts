import { useRef } from "react";
import { toast } from "sonner";
import { Node, Edge } from "reactflow";
import { AgentConfig } from "@/components/AgentNode";
import { StoredFile } from "@/components/KnowledgeBaseManager";
import type { KeywordData } from "@/lib/keyword-types";

export interface KnowledgeFileRef {
  name: string;
  size: number;
  starred: boolean;
  timestamp: number;
}

// Revert: full StoredFile in blueprint for attached RAG
export interface BlueprintData {
  title: string;
  purpose: string;
  agents: Omit<AgentConfig, "onUpdate" | "onDelete">[];
  knowledgeFiles: KnowledgeFileRef[]; // Separate refs—no content embedded
  timestamp: string;
  // NEW: Keyword research data
  primaryKeywords?: KeywordData[];
  targetKeyword?: string; // Main keyword for the blueprint
  keywordDifficulty?: number;
  searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  semanticKeywords?: string[];
}

export interface StoredBlueprint extends BlueprintData {
  id: string;
  nodeCount: number;
}

const BLUEPRINT_STORAGE_KEY = "stored-blueprints";

export function getStoredBlueprints(): StoredBlueprint[] {
  try {
    const stored = localStorage.getItem(BLUEPRINT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredBlueprint[];
    }
  } catch (e) {
    console.error("Failed to load blueprints from local storage:", e);
  }
  return [];
}

export function saveBlueprints(blueprints: StoredBlueprint[]): void {
  try {
    localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(blueprints));
  } catch (e) {
    console.error("Failed to save blueprints to local storage:", e);
  }
}

export function saveCurrentBlueprint(blueprint: BlueprintData, nodeCount: number): void {
  const allBlueprints = getStoredBlueprints();
  const newBlueprint: StoredBlueprint = {
    id: `bp-${Date.now()}`,
    nodeCount: nodeCount,
    ...blueprint,
  };
  saveBlueprints([newBlueprint, ...allBlueprints]);
  toast.success(`Blueprint "${blueprint.title}" saved successfully!`);
}

export function deleteBlueprint(id: string): void {
  const allBlueprints = getStoredBlueprints();
  const updatedBlueprints = allBlueprints.filter(bp => bp.id !== id);
  saveBlueprints(updatedBlueprints);
  toast.success("Blueprint deleted successfully!");
}

/**
 * Reads a JSON file, validates it as a blueprint, and saves it to local storage.
 * Note: This only saves to the Blueprint Manager, it does NOT load into the workspace.
 */
export function importAndSaveBlueprintFromFile(file: File): void {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const jsonContent = e.target?.result as string;
      const blueprint = JSON.parse(jsonContent);
      
      // Basic validation check
      if (!blueprint || !blueprint.title || !blueprint.purpose || !Array.isArray(blueprint.agents)) {
          toast.error("Invalid blueprint file format for saving.");
          return;
      }
      
      // Node count is the number of agents
      const nodeCount = blueprint.agents.length;
      
      // Refs only from JSON (contents attached separately during import)
      const knowledgeFileRefs = blueprint.knowledgeFiles || [];
      const blueprintData: BlueprintData = {
          ...blueprint,
          knowledgeFiles: knowledgeFileRefs,
          timestamp: new Date().toISOString(),
      };
      
      saveCurrentBlueprint(blueprintData, nodeCount);
      
    } catch (error) {
      toast.error("Failed to parse JSON file.");
      console.error("Import error:", error);
    }
  };
  reader.readAsText(file);
}

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type UpdateAgentFn = (id: string, updatedAgent: AgentConfig) => void;
type DeleteAgentFn = (id: string) => void;

interface BlueprintManagementProps {
  flowTitle: string;
  flowPurpose: string;
  agents: AgentConfig[];
  knowledgeFiles: StoredFile[];
  activeKnowledgeBaseText: string; // Manual only for blueprint
  setFlowTitle: SetState<string>;
  setFlowPurpose: SetState<string>;
  setAgents: SetState<AgentConfig[]>;
  setKnowledgeFiles: SetState<StoredFile[]>;
  setActiveKnowledgeBaseText: SetState<string>; // Sets manual
  setNodes: SetState<Node[]>;
  setEdges: SetState<Edge[]>;
  updateAgent: UpdateAgentFn;
  deleteAgent: DeleteAgentFn;
}

export function useBlueprintManagement({
  flowTitle,
  flowPurpose,
  agents,
  knowledgeFiles,
  activeKnowledgeBaseText,
  setFlowTitle,
  setFlowPurpose,
  setAgents,
  setKnowledgeFiles,
  setActiveKnowledgeBaseText,
  setNodes,
  setEdges,
  updateAgent,
  deleteAgent,
}: BlueprintManagementProps) {

  const blueprintFileInputRef = useRef<HTMLInputElement>(null);

  const generateBlueprint = () => {
    // Get keyword data from current blueprint state if available
    // This will be set by the KeywordResearchTab component
    const currentBlueprint = getStoredBlueprints().find(bp => bp.title === flowTitle);
    
    return {
      title: flowTitle,
      purpose: flowPurpose,
      agents: agents.map(agent => ({
        id: agent.id,
        step: agent.step,
        title: agent.title,
        description: agent.description,
        features: agent.features,
        h2Count: agent.h2Count,
        h3Count: agent.h3Count,
        h3Enabled: agent.h3Enabled,
        headingLevel: agent.headingLevel,
        maxTokens: agent.maxTokens, // Include maxTokens
      })),
      knowledgeFiles: knowledgeFiles.map(f => ({
        name: f.name,
        size: f.size,
        starred: f.starred,
        timestamp: f.timestamp
      })), // Refs only—contents attached separately
      timestamp: new Date().toISOString(),
      // Include keyword data if available
      primaryKeywords: currentBlueprint?.primaryKeywords,
      targetKeyword: currentBlueprint?.targetKeyword,
      keywordDifficulty: currentBlueprint?.keywordDifficulty,
      searchIntent: currentBlueprint?.searchIntent,
      semanticKeywords: currentBlueprint?.semanticKeywords,
    };
  };

  const loadBlueprint = (blueprint: StoredBlueprint) => {
    processImportedBlueprint(blueprint);
  };

  const handleSaveBlueprint = (customFlowTitle?: string) => {
    // Generate blueprint data
    const blueprintData = generateBlueprint();

    // Use agent length as node count, as nodes are generated from agents
    const nodeCount = agents.length; 

    // Custom flow title overrides the current flowTitle
    if (customFlowTitle) {
      blueprintData.title = customFlowTitle;
    }

    saveCurrentBlueprint(blueprintData, nodeCount);
  };

  const downloadBlueprint = () => {
    const blueprint = generateBlueprint();
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blueprint-${Date.now()}.json`;
    a.click();
    toast.success("Blueprint downloaded");
  };

  const processImportedBlueprint = (blueprint: any) => {
    if (!blueprint || !blueprint.title || !blueprint.purpose || !Array.isArray(blueprint.agents)) {
      toast.error("Invalid blueprint file format.");
      return;
    }

    // Match refs to separately attached files in storage for RAG
    const storedFilesString = localStorage.getItem('kb_files') || '[]';
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    const blueprintRefs = blueprint.knowledgeFiles || [];
    let missingFiles = 0;
    const matchedFiles = blueprintRefs.map(ref => {
      const stored = storedFiles.find(f => f.name === ref.name);
      if (!stored) {
        missingFiles++;
        return { ...ref, content: '' }; // Placeholder—generation won't break
      }
      return stored; // Full content from separate attachment for RAG
    });
    setKnowledgeFiles(matchedFiles);

    if (missingFiles > 0) {
      toast.warning(`${missingFiles} attached file(s) missing (e.g., CSV). Upload via KB Manager for full RAG.`);
    }

    // Explicitly join attached file contents for activeKnowledgeBaseText (RAG ready—no manual in blueprint)
    const fileContents = matchedFiles.map(f => f.content).filter(Boolean).join('\n\n---\n\n');
    setActiveKnowledgeBaseText(fileContents); // Force set—generation uses this for prompts, no break

    setFlowTitle(blueprint.title);
    setFlowPurpose(blueprint.purpose);

    // Sort agents by step before setting them
    const sortedAgents = (blueprint.agents as AgentConfig[])
      .sort((a, b) => (a.step || 0) - (b.step || 0));

    setAgents(sortedAgents);

    // Note: Keyword data is preserved in the blueprint but not loaded into workspace state
    // It will be available when the blueprint is saved/loaded

    // Generate nodes/edges
    const importedNodes: Node[] = sortedAgents.map((agent: AgentConfig, index: number) => {
      const nodeData = {
        ...agent,
        onUpdate: (updated: AgentConfig) => updateAgent(updated.id, updated),
        onDelete: () => deleteAgent(agent.id),
      };
      return {
        id: agent.id,
        type: 'agentNode',
        position: { x: 250, y: index * 250 },
        data: nodeData,
      };
    });

    setNodes(importedNodes);
    setEdges([]);

    toast.success("Blueprint loaded! Attached files' contents joined for RAG—generation fixed and ready.");
  };

  const handleImportBlueprint = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json") {
      toast.error("Please select a valid JSON file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = e.target?.result as string;
        const blueprint = JSON.parse(jsonContent);
        processImportedBlueprint(blueprint);
      } catch (error) {
        toast.error("Failed to parse JSON file.");
        console.error("Import error:", error);
      }
    };
    reader.readAsText(file);

    // Reset file input value to allow the same file to be imported again
    if (blueprintFileInputRef.current) {
      blueprintFileInputRef.current.value = "";
    }
  };

  return {
    blueprintFileInputRef,
    generateBlueprint,
    downloadBlueprint,
    handleImportBlueprint,
    handleSaveBlueprint,
    loadBlueprint,
  };
}
