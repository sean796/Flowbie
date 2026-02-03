import { useState, useRef, useCallback, useEffect } from 'react';
import { Message, streamChatCompletion } from "@/lib/api";
import { AgentConfig } from "@/components/AgentNode";
import { BlueprintData } from "@/hooks/use-blueprint-management";

// Helper to convert BlueprintData to JSON string format expected by blueprint modification
const blueprintDataToJson = (data: BlueprintData): string => {
    return JSON.stringify(data, null, 2);
};
import { toast } from "sonner";
import { 
    parseBlueprintAgents, 
    findAgentsById, 
    extractAgentsWithContext, 
    identifySectionsFromChecklist,
    mergeAgentsIntoBlueprint 
} from "@/lib/section-parser";
import { buildFlowAssistSystemPrompt, buildChecklistGenerationPrompt, buildBlueprintModificationPrompt } from "@/lib/prompt-builders";
import type { StoredFile } from "@/components/KnowledgeBaseTab";

const KB_FILES_STORAGE_KEY = "kb_files";

// Helper function to get knowledge base posts for conflict checking
const getKnowledgeBasePosts = (): Array<{ title: string; content: string }> => {
  try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const storedFiles = JSON.parse(storedFilesString) as Array<{ name: string; content: string; [key: string]: any }>;
    return storedFiles.map(file => ({
      title: file.name || 'Untitled',
      content: file.content || ''
    }));
  } catch (error) {
    console.error('Error loading knowledge base posts:', error);
    return [];
  }
};

// Helper function to generate title and purpose using AI
const generateTitleAndPurpose = async (
  type: 'versus' | 'aeo' | 'local',
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  topP: number,
  knowledgeBaseText: string
): Promise<{ title: string; purpose: string }> => {
  try {
    const typeDescriptions = {
      versus: 'versus/comparison blog post that compares two or more options, products, services, or approaches',
      aeo: 'Answer Engine Optimization (AEO) blog post optimized for AI-powered search engines and answer engines',
      local: 'local SEO blog post focused on location-based information, local business insights, or region-specific topics'
    };

    const typeGuidance = {
      versus: 'Focus on creating a compelling comparison title that highlights the key differences. The purpose should emphasize helping readers make informed decisions through detailed comparisons.',
      aeo: 'Focus on creating a title optimized for AI answer engines with direct, question-answering formats. The purpose should emphasize structured data, featured snippets, and conversational search optimization.',
      local: 'Focus on creating a location-specific title with local keywords. The purpose should emphasize local SEO, geo-targeting, and location-based content strategies.'
    };

    // Get knowledge base posts for context
    const kbPosts = getKnowledgeBasePosts();
    const kbContext = kbPosts.length > 0
      ? `\n\n=== KNOWLEDGE BASE CONTEXT ===\nExisting knowledge base files: ${kbPosts.map(p => p.title).join(', ')}\n\nUse the knowledge base to inform the title and purpose, ensuring it's relevant to the available content.\n=== END KNOWLEDGE BASE CONTEXT ===`
      : '';

    const systemPrompt = `You are an SEO content strategist. Generate an optimized title and purpose for a ${typeDescriptions[type]}.

${typeGuidance[type]}

${knowledgeBaseText ? `\n=== AVAILABLE KNOWLEDGE BASE ===\n${knowledgeBaseText.substring(0, 2000)}\n=== END KNOWLEDGE BASE ===` : ''}

${kbContext}

Return ONLY a JSON object with this exact structure:
{
  "title": "SEO-optimized title here (50-70 characters, compelling and specific)",
  "purpose": "Detailed purpose description (2-3 sentences explaining what this blueprint will create and why it's valuable)"
}

The title should be:
- SEO-friendly and keyword-rich
- Compelling and specific to the content type
- 50-70 characters for optimal SEO
- Based on available knowledge base content if relevant

The purpose should be:
- Clear and actionable
- Explain what the blueprint will generate
- Highlight the value and approach
- 2-3 sentences maximum`;

    const userPrompt = `Generate an optimized title and purpose for a ${typeDescriptions[type]}. Make it specific, SEO-friendly, and aligned with the knowledge base content if available.`;

    let responseContent = '';
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      maxTokens: Math.min(maxTokens, 500),
      topP,
      onContentChunk: (chunk) => {
        responseContent += chunk;
      }
    });

    // Clean and parse response
    let cleanedResponse = responseContent.trim();
    if (cleanedResponse.includes('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.includes('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to extract JSON
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.purpose) {
        return {
          title: parsed.title.trim(),
          purpose: parsed.purpose.trim()
        };
      }
    }

    // Fallback if parsing fails
    throw new Error('Could not parse AI response');
  } catch (error) {
    console.error('Error generating title and purpose:', error);
    // Fallback values
    const fallbacks = {
      versus: {
        title: 'Versus Post Blueprint',
        purpose: 'Create comprehensive comparison content that helps readers make informed decisions by comparing two or more options, products, services, or approaches. This blueprint focuses on detailed feature comparisons, pros and cons analysis, use case scenarios, and actionable recommendations.'
      },
      aeo: {
        title: 'AEO Post Blueprint',
        purpose: 'Generate Answer Engine Optimization (AEO) content designed to rank in AI-powered search engines and answer engines. This blueprint emphasizes direct answers, structured data, featured snippet optimization, conversational search queries, and comprehensive information architecture for maximum AI visibility.'
      },
      local: {
        title: 'Local Post Blueprint',
        purpose: 'Develop location-focused content optimized for local SEO and geo-targeted audiences. This blueprint includes local keywords, location-specific information, regional business insights, and geo-targeted content strategies to maximize local search visibility and engagement.'
      }
    };
    return fallbacks[type];
  }
};

// Helper function to create a knowledge graph file for quick start buttons
const createKnowledgeGraphFile = (type: 'versus' | 'aeo' | 'local', title: string, purpose: string): void => {
  try {
    const timestamp = Date.now();
    const typeLabels = {
      versus: 'versus',
      aeo: 'aeo',
      local: 'local'
    };
    
    const sanitizeForFilename = (text: string): string => {
      return text
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .substring(0, 50);
    };
    
    const sanitizedTitle = sanitizeForFilename(title);
    const fileName = `knowledge-graph-${typeLabels[type]}-${sanitizedTitle}-${timestamp}.json`;
    
    // Create knowledge graph structure
    const knowledgeGraph = {
      metadata: {
        type: typeLabels[type],
        title: title,
        purpose: purpose,
        generated_at: new Date().toISOString(),
        blueprint_type: typeLabels[type]
      },
      nodes: [
        {
          id: `${typeLabels[type]}-main-topic`,
          label: title,
          type: 'topic',
          properties: {
            title: title,
            purpose: purpose,
            content_type: typeLabels[type]
          }
        }
      ],
      edges: [],
      content_structure: {
        title: title,
        purpose: purpose,
        post_type: typeLabels[type],
        recommended_sections: type === 'versus' 
          ? ['Introduction', 'Comparison Overview', 'Feature-by-Feature Analysis', 'Pros and Cons', 'Use Cases', 'Recommendations', 'Conclusion']
          : type === 'aeo'
          ? ['Introduction', 'Direct Answer Section', 'Structured Data Points', 'FAQ Section', 'Related Topics', 'Conclusion']
          : ['Introduction', 'Location Overview', 'Local Insights', 'Location-Specific Content', 'Local SEO Elements', 'Conclusion']
      }
    };
    
    const jsonContent = JSON.stringify(knowledgeGraph, null, 2);
    
    // Get current files from localStorage
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const files = JSON.parse(storedFilesString) as StoredFile[];
    
    // Create StoredFile object
    const storedFile: StoredFile = {
      name: fileName,
      size: jsonContent.length,
      content: jsonContent,
      starred: false,
      timestamp: timestamp,
    };
    
    // Add to files array
    const updatedFiles = [...files, storedFile];
    
    // Save to localStorage
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(updatedFiles));
    
    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files: updatedFiles } 
    }));
    
    console.log(`[Knowledge Graph] Created knowledge graph file: ${fileName}`);
    toast.success(`Knowledge graph file created for ${typeLabels[type]} post`);
  } catch (error) {
    console.error('Error creating knowledge graph file:', error);
    toast.error(`Failed to create knowledge graph file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

interface UseBlueprintModificationProps {
    apiKey: string;
    flowTitle: string;
    flowPurpose: string;
    knowledgeBaseText: string;
    selectedModel: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    generateCurrentBlueprintData?: () => BlueprintData;
    onBlueprintUpdate?: (updatedAgents: AgentConfig[]) => void;
    onFlowTitleChange?: (title: string) => void;
    onFlowPurposeChange?: (purpose: string) => void;
}

export const useBlueprintModification = ({
    apiKey,
    flowTitle,
    flowPurpose,
    knowledgeBaseText,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    generateCurrentBlueprintData,
    onBlueprintUpdate,
    onFlowTitleChange,
    onFlowPurposeChange,
}: UseBlueprintModificationProps) => {
    const [blueprintModificationChecklist, setBluePrintModificationChecklist] = useState<string[]>([]);
    const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
    const [isUpdatingBlueprint, setIsUpdatingBlueprint] = useState(false);
    const [blueprintChatMessages, setBlueprintChatMessages] = useState<Message[]>([]);
    const [blueprintUserInput, setBlueprintUserInput] = useState("");
    const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
    const [blueprintUpdated, setBlueprintUpdated] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const blueprintChatEndRef = useRef<HTMLDivElement>(null);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const blueprintRef = useRef<string>("");

    // Keep blueprint ref in sync
    useEffect(() => {
        if (generateCurrentBlueprintData) {
            const blueprintData = generateCurrentBlueprintData();
            blueprintRef.current = blueprintDataToJson(blueprintData);
        }
    }, [generateCurrentBlueprintData]);

    // Timer effect for blueprint updates
    useEffect(() => {
        if (isUpdatingBlueprint) {
            setElapsedTime(0);
            timerIntervalRef.current = setInterval(() => {
                setElapsedTime((prev) => prev + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isUpdatingBlueprint]);

    const handleGenerateBlueprintChecklist = useCallback(async () => {
        if (!blueprintUserInput.trim() || !apiKey) {
            toast.error("Please provide modification instructions.");
            return;
        }

        setIsGeneratingChecklist(true);
        setBlueprintChatMessages(prev => [...prev, { role: 'user', content: blueprintUserInput }]);
        const userMessage = blueprintUserInput;
        setBlueprintUserInput("");

        try {
            const currentBlueprint = blueprintRef.current || (generateCurrentBlueprintData ? blueprintDataToJson(generateCurrentBlueprintData()) : "{}");
            
            let sectionStructure = "";
            try {
                const blueprint = JSON.parse(currentBlueprint);
                if (blueprint.agents && Array.isArray(blueprint.agents)) {
                    sectionStructure = "Available Agents:\n" + blueprint.agents.map((agent: any, idx: number) => 
                        `${idx + 1}. [Agent: ${agent.id || `agent-${idx + 1}`}] ${agent.title || 'Untitled'}`
                    ).join("\n");
                }
            } catch (e) {
                // If parsing fails, continue without section structure
            }
            
            const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentBlueprint, knowledgeBaseText, sectionStructure);
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
                    setBlueprintChatMessages(prev => {
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
                    setBluePrintModificationChecklist(altItems);
                    setHasGeneratedChecklist(true);
                } else {
                    toast.error("Could not generate a valid checklist. Please try again.");
                }
            } else {
                setBluePrintModificationChecklist(checklistItems);
                setHasGeneratedChecklist(true);
            }
        } catch (error) {
            console.error("Checklist generation error:", error);
            toast.error("Failed to generate checklist. Please try again.");
            setBlueprintChatMessages(prev => prev.slice(0, -1));
        } finally {
            setIsGeneratingChecklist(false);
        }
    }, [blueprintUserInput, apiKey, flowTitle, flowPurpose, knowledgeBaseText, selectedModel, temperature, maxTokens, topP, generateCurrentBlueprintData]);

    const handleUpdateBlueprint = useCallback(async () => {
        if (!blueprintModificationChecklist.length || !apiKey) {
            toast.error("No checklist available.");
            return;
        }

        if (!onBlueprintUpdate || !generateCurrentBlueprintData) {
            toast.error("Blueprint update handler not available.");
            return;
        }

        const currentBlueprint = blueprintRef.current || (generateCurrentBlueprintData ? blueprintDataToJson(generateCurrentBlueprintData()) : "{}");

        setElapsedTime(0);
        setIsUpdatingBlueprint(true);
        toast.info("Updating blueprint based on checklist...");

        try {
            const allAgents = parseBlueprintAgents(currentBlueprint);
            const { agentIds, referencedAgentTitles } = identifySectionsFromChecklist(blueprintModificationChecklist, undefined, allAgents);
            
            console.log("Blueprint modification - Identified agent IDs:", agentIds);
            console.log("Blueprint modification - Referenced agent titles:", referencedAgentTitles);
            console.log("Blueprint modification - All agents:", allAgents.map(a => ({ id: a.id, title: a.title })));
            
            const isAddingNewAgent = blueprintModificationChecklist.some(item => 
              /(?:add|create|insert|new)\s+(?:a\s+)?(?:new\s+)?agent/i.test(item)
            );
            
            let isPartialContent = false;
            let agentsToModify: any[] = [];
            let contextInfo = "";
            
            if (agentIds.length > 0 && allAgents.length > 0) {
                isPartialContent = true;
                const targetAgents = findAgentsById(allAgents, agentIds);
                
                console.log("Blueprint modification - Target agents found:", targetAgents.map(a => ({ id: a.id, title: a.title })));
                
                if (targetAgents.length > 0) {
                    const contextCount = isAddingNewAgent ? 2 : 1;
                    agentsToModify = extractAgentsWithContext(allAgents, targetAgents, contextCount, contextCount);
                    contextInfo = `Modifying ${targetAgents.length} agent(s): ${targetAgents.map(a => a.id).join(", ")}${isAddingNewAgent ? ". Note: A new agent may be added." : ""}`;
                    
                    const partialBlueprint = {
                        agents: agentsToModify
                    };
                    const partialBlueprintJson = JSON.stringify(partialBlueprint, null, 2);
                    
                    const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentBlueprint, knowledgeBaseText);
                    const userPrompt = buildBlueprintModificationPrompt(
                        blueprintModificationChecklist, 
                        partialBlueprintJson, 
                        flowTitle, 
                        flowPurpose,
                        isPartialContent,
                        contextInfo
                    );
                    
                    let updatedAgentsContent = "";
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
                            updatedAgentsContent += chunk;
                        }
                    });
                    
                    if (!updatedAgentsContent || updatedAgentsContent.trim().length === 0) {
                        throw new Error("No blueprint content generated from AI");
                    }
                    
                    let jsonContent = updatedAgentsContent.trim();
                    if (jsonContent.includes('```')) {
                        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
                        const match = jsonContent.match(codeBlockRegex);
                        if (match && match[1]) {
                            jsonContent = match[1].trim();
                        }
                    }
                    
                    let parsedAgents: any[] = [];
                    try {
                        const parsed = JSON.parse(jsonContent);
                        if (Array.isArray(parsed)) {
                            parsedAgents = parsed;
                        } else if (parsed.agents && Array.isArray(parsed.agents)) {
                            parsedAgents = parsed.agents;
                        } else {
                            throw new Error("Invalid response format");
                        }
                    } catch (e) {
                        const agentsMatch = jsonContent.match(/\[[\s\S]*\]/);
                        if (agentsMatch) {
                            parsedAgents = JSON.parse(agentsMatch[0]);
                        } else {
                            throw new Error("Could not extract agents array from response");
                        }
                    }
                    
                    console.log("Blueprint modification - Parsed agents from AI:", parsedAgents.map((a: any) => ({ id: a.id, title: a.title })));
                    
                    const mergedBlueprint = mergeAgentsIntoBlueprint(currentBlueprint, parsedAgents, targetAgents);
                    
                    try {
                        const finalBlueprint = JSON.parse(mergedBlueprint);
                        console.log("Blueprint modification - Merged blueprint agents:", finalBlueprint.agents?.map((a: any) => ({ id: a.id, title: a.title })));
                        
                        if (!finalBlueprint || typeof finalBlueprint !== 'object') {
                            throw new Error("Parsed blueprint is not a valid object");
                        }

                        const isUpdatingTitle = blueprintModificationChecklist.some(item => 
                            /(?:generate|create|update|modify|change|set).*title/i.test(item)
                        );
                        const isUpdatingPurpose = blueprintModificationChecklist.some(item => 
                            /(?:generate|create|update|modify|change|set).*purpose/i.test(item)
                        );
                        
                        if (isUpdatingTitle && finalBlueprint.title && typeof finalBlueprint.title === 'string' && finalBlueprint.title.trim()) {
                            if (onFlowTitleChange) {
                                onFlowTitleChange(finalBlueprint.title.trim());
                                console.log("Blueprint modification - Updated title:", finalBlueprint.title);
                            }
                        }
                        
                        if (isUpdatingPurpose && finalBlueprint.purpose && typeof finalBlueprint.purpose === 'string' && finalBlueprint.purpose.trim()) {
                            if (onFlowPurposeChange) {
                                onFlowPurposeChange(finalBlueprint.purpose.trim());
                                console.log("Blueprint modification - Updated purpose:", finalBlueprint.purpose);
                            }
                        }

                        if (!finalBlueprint.agents || !Array.isArray(finalBlueprint.agents)) {
                            throw new Error("Invalid blueprint structure: missing or invalid agents array");
                        }

                        const normalizedAgents = finalBlueprint.agents.map((agent: any, index: number) => {
                            if (!agent || typeof agent !== 'object') {
                                return null;
                            }

                            const title = agent.title || agent.name || `Agent ${index + 1}`;
                            const description = agent.description || agent.desc || title;
                            
                            let features = agent.features;
                            if (!Array.isArray(features)) {
                                if (typeof features === 'string') {
                                    features = [features];
                                } else if (features && typeof features === 'object') {
                                    features = Object.values(features);
                                } else {
                                    features = [];
                                }
                            }
                            features = features.map((f: any) => typeof f === 'string' ? f : String(f));
                            
                            // MANDATORY: Ensure every agent has a [LINK] feature with 3-5 links specification
                            const hasLinkFeature = features.some((f: string) => 
                                typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
                            );
                            
                            // Check if link feature specifies 3-5 links (not just any link)
                            const hasCorrectLinkFormat = features.some((f: string) => 
                                typeof f === 'string' && 
                                f.toLowerCase().trim().startsWith('[link]') && 
                                (f.includes('3-5') || f.includes('3 to 5') || f.includes('three to five'))
                            );
                            
                            if (!hasLinkFeature) {
                                // Add the mandatory [LINK] feature if missing
                                features.push("[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list");
                                console.warn(`Agent "${title}" was missing mandatory [LINK] feature. Added automatically.`);
                            } else if (!hasCorrectLinkFormat) {
                                // Replace existing link feature if it doesn't specify 3-5 links
                                const linkIndex = features.findIndex((f: string) => 
                                    typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
                                );
                                if (linkIndex >= 0) {
                                    features[linkIndex] = "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list";
                                    console.warn(`Agent "${title}" had [LINK] feature but didn't specify 3-5 links. Updated automatically.`);
                                }
                            }

                            return {
                                id: agent.id || `agent-${Date.now()}-${index}`,
                                step: typeof agent.step === 'number' ? agent.step : index + 1,
                                title: title,
                                description: description,
                                features: features,
                                h2Count: agent.h2Count !== undefined ? agent.h2Count : 1,
                                h3Count: agent.h3Count !== undefined ? agent.h3Count : 0,
                                h3Enabled: agent.h3Enabled !== undefined ? agent.h3Enabled : false,
                                headingLevel: agent.headingLevel !== undefined ? agent.headingLevel : 2,
                                maxTokens: agent.maxTokens !== undefined ? agent.maxTokens : 2000
                            };
                        }).filter((agent: any) => agent !== null);

                        onBlueprintUpdate(normalizedAgents);

                        toast.success("Blueprint updated successfully!");
                        setBlueprintUpdated(true);
                        setBlueprintChatMessages(prev => [...prev, { 
                            role: 'assistant', 
                            content: "Blueprint has been updated based on the checklist. The modified agents have been integrated into the blueprint structure." 
                        }]);
                        return;
                    } catch (parseError) {
                        console.error("Blueprint parsing error:", parseError);
                        throw new Error(`Failed to parse updated blueprint: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
                    }
                } else {
                    console.warn("Blueprint modification - No target agents found, falling back to full modification");
                }
            } else {
                console.log("Blueprint modification - No agent IDs identified in checklist, using full modification");
            }
            
            const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentBlueprint, knowledgeBaseText);
            const userPrompt = buildBlueprintModificationPrompt(blueprintModificationChecklist, currentBlueprint, flowTitle, flowPurpose, false);

            let updatedBlueprintContent = "";
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
                    updatedBlueprintContent += chunk;
                }
            });

            if (!updatedBlueprintContent || updatedBlueprintContent.trim().length === 0) {
                throw new Error("No blueprint content generated from AI");
            }

            let jsonContent = updatedBlueprintContent.trim();
            
            if (jsonContent.includes('```')) {
                const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
                const match = jsonContent.match(codeBlockRegex);
                if (match && match[1]) {
                    jsonContent = match[1].trim();
                } else {
                    const jsonStart = jsonContent.indexOf('{');
                    const jsonEnd = jsonContent.lastIndexOf('}');
                    if (jsonStart >= 0 && jsonEnd > jsonStart) {
                        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
                    }
                }
            } else {
                const jsonStart = jsonContent.indexOf('{');
                const jsonEnd = jsonContent.lastIndexOf('}');
                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
                }
            }

            if (!jsonContent || jsonContent.trim().length === 0) {
                throw new Error("Could not extract JSON from AI response");
            }

            try {
                const parsedBlueprint = JSON.parse(jsonContent);
                
                if (!parsedBlueprint || typeof parsedBlueprint !== 'object') {
                    throw new Error("Parsed blueprint is not a valid object");
                }

                const isUpdatingTitle = blueprintModificationChecklist.some(item => 
                    /(?:generate|create|update|modify|change|set).*title/i.test(item)
                );
                const isUpdatingPurpose = blueprintModificationChecklist.some(item => 
                    /(?:generate|create|update|modify|change|set).*purpose/i.test(item)
                );
                
                if (isUpdatingTitle && parsedBlueprint.title && typeof parsedBlueprint.title === 'string' && parsedBlueprint.title.trim()) {
                    if (onFlowTitleChange) {
                        onFlowTitleChange(parsedBlueprint.title.trim());
                        console.log("Blueprint modification - Updated title:", parsedBlueprint.title);
                    }
                }
                
                if (isUpdatingPurpose && parsedBlueprint.purpose && typeof parsedBlueprint.purpose === 'string' && parsedBlueprint.purpose.trim()) {
                    if (onFlowPurposeChange) {
                        onFlowPurposeChange(parsedBlueprint.purpose.trim());
                        console.log("Blueprint modification - Updated purpose:", parsedBlueprint.purpose);
                    }
                }

                if (!parsedBlueprint.agents || !Array.isArray(parsedBlueprint.agents)) {
                    console.error("Invalid blueprint structure:", parsedBlueprint);
                    throw new Error("Invalid blueprint structure: missing or invalid agents array");
                }

                const normalizedAgents = parsedBlueprint.agents.map((agent: any, index: number) => {
                    if (!agent || typeof agent !== 'object') {
                        return null;
                    }

                    const title = agent.title || agent.name || `Agent ${index + 1}`;
                    const description = agent.description || agent.desc || title;
                    
                    let features = agent.features;
                    if (!Array.isArray(features)) {
                        if (typeof features === 'string') {
                            features = [features];
                        } else if (features && typeof features === 'object') {
                            features = Object.values(features);
                        } else {
                            features = [];
                        }
                    }
                    
                    features = features.map((f: any) => typeof f === 'string' ? f : String(f));

                    return {
                        id: agent.id || `agent-${Date.now()}-${index}`,
                        step: typeof agent.step === 'number' ? agent.step : index + 1,
                        title: title,
                        description: description,
                        features: features,
                        h2Count: agent.h2Count !== undefined ? agent.h2Count : 1,
                        h3Count: agent.h3Count !== undefined ? agent.h3Count : 0,
                        h3Enabled: agent.h3Enabled !== undefined ? agent.h3Enabled : false,
                        headingLevel: agent.headingLevel !== undefined ? agent.headingLevel : 2,
                        maxTokens: agent.maxTokens !== undefined ? agent.maxTokens : 2000
                    };
                }).filter((agent: any) => agent !== null);

                if (normalizedAgents.length === 0) {
                    throw new Error("No valid agents found in updated blueprint after normalization");
                }

                try {
                    onBlueprintUpdate(normalizedAgents);
                    toast.success("Blueprint updated successfully!");
                    setBlueprintUpdated(true);
                    setBlueprintChatMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: "Blueprint has been updated based on the checklist. The blueprint structure has been rewritten with the new agents incorporated." 
                    }]);
                } catch (updateError) {
                    console.error("Error calling onBlueprintUpdate:", updateError);
                    throw new Error(`Failed to update blueprint: ${(updateError as Error).message}`);
                }
            } catch (parseError) {
                console.error("Blueprint parse error:", parseError);
                console.error("JSON content that failed to parse:", jsonContent.substring(0, 500));
                toast.error(`Failed to parse updated blueprint: ${(parseError as Error).message}. Check console for details.`);
                setBlueprintChatMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: `Error: Failed to parse the updated blueprint. The AI response may not be valid JSON. Error: ${(parseError as Error).message}` 
                }]);
            }
        } catch (error) {
            console.error("Blueprint update error:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            toast.error(`Failed to update blueprint: ${errorMessage}`);
            setBlueprintChatMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `Error occurred while updating blueprint: ${errorMessage}` 
            }]);
        } finally {
            setIsUpdatingBlueprint(false);
        }
    }, [blueprintModificationChecklist, apiKey, flowTitle, flowPurpose, knowledgeBaseText, selectedModel, temperature, maxTokens, topP, onBlueprintUpdate, generateCurrentBlueprintData, onFlowTitleChange, onFlowPurposeChange]);

    const resetState = useCallback(() => {
        setBlueprintChatMessages([]);
        setBlueprintUserInput("");
        setHasGeneratedChecklist(false);
        setBlueprintUpdated(false);
        setElapsedTime(0);
        setBluePrintModificationChecklist([]);
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    const handleShortcutClick = useCallback(async (type: 'versus' | 'aeo' | 'local') => {
        if (!apiKey) {
            toast.error("API key is required.");
            return;
        }

        // Show loading state
        setIsGeneratingChecklist(true);
        toast.info("Generating optimized title and purpose...");

        try {
            // Generate title and purpose using AI
            const { title, purpose } = await generateTitleAndPurpose(
                type,
                apiKey,
                selectedModel,
                temperature,
                maxTokens,
                topP,
                knowledgeBaseText
            );

            // Set title and purpose
            if (onFlowTitleChange) {
                onFlowTitleChange(title);
            }
            if (onFlowPurposeChange) {
                onFlowPurposeChange(purpose);
            }

            // Create knowledge graph file with AI-generated values
            createKnowledgeGraphFile(type, title, purpose);

            // Get knowledge base posts for conflict checking
            const kbPosts = getKnowledgeBasePosts();
            const kbTitles = kbPosts.map(p => p.title).join(', ');
            const kbContext = kbPosts.length > 0 
                ? `\n\n=== EXISTING KNOWLEDGE BASE POSTS (AVOID DUPLICATES) ===\nExisting post titles: ${kbTitles}\n\nCRITICAL: Ensure the generated content does NOT conflict with or duplicate existing posts in the knowledge base. The new post must be unique and add value without overlapping with existing content.\n=== END KNOWLEDGE BASE POSTS ===`
                : '';

            let prompt = '';

            switch (type) {
                case 'versus':
                    prompt = `Generate a comprehensive versus/comparison blog post. Create a detailed comparison between two or more options, products, services, or approaches. Include pros and cons, feature comparisons, use cases, and recommendations.${kbContext}`;
                    break;
                case 'aeo':
                    prompt = `Generate an Answer Engine Optimization (AEO) focused blog post. Create content optimized for AI-powered search engines and answer engines. Focus on direct answers, structured data, featured snippet optimization, and conversational search queries.${kbContext}`;
                    break;
                case 'local':
                    prompt = `Generate a local-oriented blog post. Create content focused on local SEO, location-based information, local business insights, or region-specific topics. Include local keywords, location data, and geo-targeted content.${kbContext}`;
                    break;
            }

            // Set the prompt
            setBlueprintUserInput(prompt);
            
            // Continue with checklist generation
            setBlueprintChatMessages(prev => [...prev, { role: 'user', content: prompt }]);

            // Use the newly generated title and purpose for checklist generation
            const currentBlueprint = blueprintRef.current || (generateCurrentBlueprintData ? blueprintDataToJson(generateCurrentBlueprintData()) : "{}");
            
            let sectionStructure = "";
            try {
                const blueprint = JSON.parse(currentBlueprint);
                if (blueprint.agents && Array.isArray(blueprint.agents)) {
                    sectionStructure = "Available Agents:\n" + blueprint.agents.map((agent: any, idx: number) => 
                        `${idx + 1}. [Agent: ${agent.id || `agent-${idx + 1}`}] ${agent.title || 'Untitled'}`
                    ).join("\n");
                }
            } catch (e) {
                // If parsing fails, continue without section structure
            }
            
            // Use the AI-generated title and purpose for the system prompt
            const systemPrompt = buildFlowAssistSystemPrompt(title, purpose, currentBlueprint, knowledgeBaseText, sectionStructure);
            const userPrompt = buildChecklistGenerationPrompt(prompt, sectionStructure);

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
                    setBlueprintChatMessages(prev => {
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
                    setBluePrintModificationChecklist(altItems);
                    setHasGeneratedChecklist(true);
                } else {
                    toast.error("Could not generate a valid checklist. Please try again.");
                }
            } else {
                setBluePrintModificationChecklist(checklistItems);
                setHasGeneratedChecklist(true);
            }
        } catch (error) {
            console.error("Error in handleShortcutClick:", error);
            toast.error("Failed to generate title, purpose, or checklist. Using fallback values.");
            
            // Use fallback values
            const fallbacks = {
                versus: {
                    title: 'Versus Post Blueprint',
                    purpose: 'Create comprehensive comparison content that helps readers make informed decisions by comparing two or more options, products, services, or approaches. This blueprint focuses on detailed feature comparisons, pros and cons analysis, use case scenarios, and actionable recommendations.'
                },
                aeo: {
                    title: 'AEO Post Blueprint',
                    purpose: 'Generate Answer Engine Optimization (AEO) content designed to rank in AI-powered search engines and answer engines. This blueprint emphasizes direct answers, structured data, featured snippet optimization, conversational search queries, and comprehensive information architecture for maximum AI visibility.'
                },
                local: {
                    title: 'Local Post Blueprint',
                    purpose: 'Develop location-focused content optimized for local SEO and geo-targeted audiences. This blueprint includes local keywords, location-specific information, regional business insights, and geo-targeted content strategies to maximize local search visibility and engagement.'
                }
            };
            
            const fallback = fallbacks[type];
            if (onFlowTitleChange) {
                onFlowTitleChange(fallback.title);
            }
            if (onFlowPurposeChange) {
                onFlowPurposeChange(fallback.purpose);
            }
            createKnowledgeGraphFile(type, fallback.title, fallback.purpose);
        } finally {
            setIsGeneratingChecklist(false);
        }
    }, [apiKey, flowTitle, flowPurpose, knowledgeBaseText, selectedModel, temperature, maxTokens, topP, generateCurrentBlueprintData, onFlowTitleChange, onFlowPurposeChange]);

    return {
        blueprintModificationChecklist,
        isGeneratingChecklist,
        isUpdatingBlueprint,
        blueprintChatMessages,
        blueprintUserInput,
        setBlueprintUserInput,
        hasGeneratedChecklist,
        blueprintUpdated,
        elapsedTime,
        blueprintChatEndRef,
        handleGenerateBlueprintChecklist,
        handleUpdateBlueprint,
        handleShortcutClick,
        resetState,
    };
};

