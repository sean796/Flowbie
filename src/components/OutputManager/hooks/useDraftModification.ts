import { useState, useCallback, useEffect, useRef } from "react";
import { streamChatCompletion, Message } from "@/lib/api";
import { toast } from "sonner";
import { 
  buildFlowAssistSystemPrompt, 
  buildChecklistGenerationPrompt, 
  buildDraftReportModificationPrompt, 
  generateSectionsPrompt 
} from "@/lib/prompt-builders";
import {
  parseMarkdownSections,
  extractSectionsWithContext,
  identifySectionsFromChecklist,
  mergeSectionsIntoMarkdown,
  validateSectionMerge,
} from "@/lib/section-parser";
import { useModificationTimer } from "./useModificationTimer";

interface UseDraftModificationProps {
  draft: string;
  plan: string;
  isModifyingDraft: boolean;
  draftModificationChecklist: string[];
  isGeneratingDraftChecklist: boolean;
  isUpdatingDraft: boolean;
  setDraftModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingDraftChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingDraft?: (isUpdating: boolean) => void;
  setGenerationResult?: (result: any) => void;
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  flowTitle: string;
  flowPurpose: string;
  agents: any[];
  activeKnowledgeBaseText: string;
}

export function useDraftModification({
  draft,
  plan,
  isModifyingDraft,
  draftModificationChecklist,
  isGeneratingDraftChecklist,
  isUpdatingDraft,
  setDraftModificationChecklist,
  setIsGeneratingDraftChecklist,
  setIsUpdatingDraft,
  setGenerationResult,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowTitle,
  flowPurpose,
  agents,
  activeKnowledgeBaseText,
}: UseDraftModificationProps) {
  const [draftChatMessages, setDraftChatMessages] = useState<Message[]>([]);
  const [draftUserInput, setDraftUserInput] = useState("");
  const [hasGeneratedDraftChecklist, setHasGeneratedDraftChecklist] = useState(false);
  const [draftUpdated, setDraftUpdated] = useState(false);
  const draftRef = useRef<string>(draft);
  const planRef = useRef<string>(plan);
  const draftChatEndRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync with props
  draftRef.current = draft;
  planRef.current = plan;

  // Use timer hook
  const draftElapsedTime = useModificationTimer(isUpdatingDraft);

  // Reset chat when modification mode changes
  useEffect(() => {
    if (!isModifyingDraft) {
      setDraftChatMessages([]);
      setDraftUserInput("");
      setHasGeneratedDraftChecklist(false);
      setDraftUpdated(false);
    }
  }, [isModifyingDraft]);

  const handleGenerateDraftChecklist = useCallback(async () => {
    if (!draftUserInput.trim() || !apiKey || !setIsGeneratingDraftChecklist || !setDraftModificationChecklist) {
      toast.error("Please provide modification instructions.");
      return;
    }

    setIsGeneratingDraftChecklist(true);
    setDraftChatMessages(prev => [...prev, { role: 'user', content: draftUserInput }]);
    const userMessage = draftUserInput;
    setDraftUserInput("");

    try {
      // Build section structure info for checklist generation
      let sectionStructure = "";
      if (draft) {
        const sections = parseMarkdownSections(draft);
        if (sections.length > 0) {
          sectionStructure = "Available Sections:\n" + sections.map((section, idx) => 
            `${idx + 1}. [Section: ${"#".repeat(section.headerLevel)} ${section.header}]`
          ).join("\n");
        }
      }
      
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, draft, activeKnowledgeBaseText, sectionStructure);
      const userPrompt = buildChecklistGenerationPrompt(userMessage, sectionStructure);

      let checklistContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          checklistContent += chunk;
          setDraftChatMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = checklistContent;
            } else {
              newMessages.push({ role: 'assistant', content: checklistContent });
            }
            return newMessages;
          });
        }
      });

      // Parse checklist from response
      const checklistItems = checklistContent
        .split('\n')
        .filter(line => line.trim().match(/^\d+[\.\)]\s+/))
        .map(line => line.replace(/^\d+[\.\)]\s+/, '').trim())
        .filter(item => item.length > 0);

      if (checklistItems.length < 3) {
        const altItems = checklistContent
          .split(/\n+/)
          .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'))
          .slice(0, 10)
          .map(line => line.replace(/^[-*•]\s+/, '').trim())
          .filter(item => item.length > 0);
        
        if (altItems.length >= 3) {
          setDraftModificationChecklist(altItems);
          setHasGeneratedDraftChecklist(true);
        } else {
          toast.error("Could not generate a valid checklist. Please try again.");
        }
      } else {
        setDraftModificationChecklist(checklistItems);
        setHasGeneratedDraftChecklist(true);
      }
    } catch (error) {
      console.error("Draft checklist generation error:", error);
      toast.error("Failed to generate checklist. Please try again.");
      setDraftChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGeneratingDraftChecklist(false);
    }
  }, [draftUserInput, apiKey, draft, flowTitle, flowPurpose, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsGeneratingDraftChecklist, setDraftModificationChecklist]);

  const handleUpdateDraft = useCallback(async () => {
    if (!draftModificationChecklist.length || !apiKey || !setIsUpdatingDraft || !setGenerationResult) {
      toast.error("No checklist available.");
      return;
    }

    // Read the latest draft and plan from refs to ensure we use the most recent values
    const currentDraft = draftRef.current;
    const currentPlan = planRef.current;

    setIsUpdatingDraft(true);
    toast.info("Updating draft report based on checklist...");

    try {
      const sectionsPrompt = generateSectionsPrompt(agents);
      
      // Parse draft and identify affected sections
      const allSections = currentDraft ? parseMarkdownSections(currentDraft) : [];
      const { markdownSections } = identifySectionsFromChecklist(draftModificationChecklist, allSections);
      
      let isPartialContent = false;
      let sectionsToModify: string = "";
      let contextInfo = "";
      
      if (markdownSections.length > 0 && allSections.length > 0) {
        // Section-based modification: only modify specific sections
        isPartialContent = true;
        const sectionContext = extractSectionsWithContext(allSections, markdownSections, 1, 1);
        
        // Build content string with context
        const contentParts: string[] = [];
        if (sectionContext.beforeContext && sectionContext.beforeContext.length > 0) {
          contentParts.push("--- Context (Previous Sections) ---");
          sectionContext.beforeContext.forEach(s => contentParts.push(s.fullText));
        }
        contentParts.push("--- Sections to Modify ---");
        sectionContext.sections.forEach(s => contentParts.push(s.fullText));
        if (sectionContext.afterContext && sectionContext.afterContext.length > 0) {
          contentParts.push("--- Context (Following Sections) ---");
          sectionContext.afterContext.forEach(s => contentParts.push(s.fullText));
        }
        
        sectionsToModify = contentParts.join("\n\n");
        contextInfo = `Modifying ${markdownSections.length} section(s): ${markdownSections.map(s => s.header).join(", ")}`;
        
        const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentDraft, activeKnowledgeBaseText);
        const userPrompt = buildDraftReportModificationPrompt(
          draftModificationChecklist, 
          sectionsToModify, 
          flowTitle, 
          flowPurpose, 
          sectionsPrompt, 
          currentPlan,
          isPartialContent,
          contextInfo
        );

        let updatedSectionsContent = "";
        await streamChatCompletion({
          apiKey,
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          maxTokens,
          topP,
          onContentChunk: (chunk) => {
            updatedSectionsContent += chunk;
            // Stream updates in real-time by merging as we go
            try {
              const partialSections = parseMarkdownSections(updatedSectionsContent);
              if (partialSections.length > 0) {
                const partialMerged = mergeSectionsIntoMarkdown(currentDraft, partialSections, markdownSections);
                setGenerationResult((prev: any) => ({
                  ...prev,
                  draft: partialMerged
                }));
              }
            } catch (e) {
              // Ignore parsing errors during streaming
            }
          }
        });

        if (updatedSectionsContent) {
          // Parse updated sections and merge back into full draft
          const updatedSections = parseMarkdownSections(updatedSectionsContent);
          const mergedDraft = mergeSectionsIntoMarkdown(currentDraft, updatedSections, markdownSections);
          
          // Validate merge
          const validation = validateSectionMerge(allSections, mergedDraft);
          if (!validation.valid && validation.missing.length > 0) {
            console.warn("Some sections may be missing after merge:", validation.missing);
          }
          
          // Final update with complete merged content
          setGenerationResult((prev: any) => ({
            ...prev,
            draft: mergedDraft
          }));
          toast.success("Draft report updated successfully!");
          setDraftUpdated(true);
          setDraftChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `Draft report has been updated based on the checklist. Modified ${markdownSections.length} section(s). Please review the updated draft in the Draft Report tab above.` 
          }]);
          return;
        } else {
          throw new Error("No draft report content generated");
        }
      }
      
      // Fallback to full draft modification if no specific sections identified
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentDraft, activeKnowledgeBaseText);
      const userPrompt = buildDraftReportModificationPrompt(draftModificationChecklist, currentDraft, flowTitle, flowPurpose, sectionsPrompt, currentPlan, false);

      let updatedDraftContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          updatedDraftContent += chunk;
          // Stream updates in real-time
          setGenerationResult((prev: any) => ({
            ...prev,
            draft: updatedDraftContent
          }));
        }
      });

      if (updatedDraftContent) {
        // Final update to ensure complete content is set
        setGenerationResult((prev: any) => ({
          ...prev,
          draft: updatedDraftContent
        }));
        toast.success("Draft report updated successfully!");
        setDraftUpdated(true);
        setDraftChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Draft report has been updated based on the checklist. Please review the updated draft in the Draft Report tab above." 
        }]);
      } else {
        throw new Error("No draft report content generated");
      }
    } catch (error) {
      console.error("Draft report update error:", error);
      toast.error("Failed to update draft report. Please try again.");
    } finally {
      setIsUpdatingDraft(false);
    }
  }, [draftModificationChecklist, apiKey, flowTitle, flowPurpose, agents, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsUpdatingDraft, setGenerationResult]);

  return {
    draftChatMessages,
    draftUserInput,
    setDraftUserInput,
    hasGeneratedDraftChecklist,
    draftUpdated,
    draftElapsedTime,
    draftChatEndRef,
    handleGenerateDraftChecklist,
    handleUpdateDraft,
    setHasGeneratedDraftChecklist,
    setDraftUpdated,
    setDraftChatMessages,
  };
}

