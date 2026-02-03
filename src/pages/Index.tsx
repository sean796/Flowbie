import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Settings, Sparkles, Download, Database, RotateCcw, Save, Archive, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { AIChatPanel } from "@/components/AIChatPanel";
import { AgentConfig } from "@/components/AgentNode";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  streamGeneration,
  loadApiKey,
  saveApiKey,
  GenerationResult,
  ChatCompletionRequest,
} from "../lib/api";
import { useBlueprintManagement, StoredBlueprint, BlueprintData } from "../hooks/use-blueprint-management";
import { useAgentGeneration } from "../hooks/use-agent-generation";

import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
} from "reactflow";
import { FlowAgentNode } from "@/components/FlowAgentNode";
import "reactflow/dist/style.css";
import {
  buildSystemPrompt,
  generateSectionsPrompt,
  buildPlannerPrompt,
  buildDraftPrompt,
  buildReviewerPrompt,
} from "../lib/prompt-builders";
import { BlueprintManagerPanel } from "@/components/BlueprintManagerPanel";
import { reassembleChunkedFiles, hexToHslComponents } from "../lib/utils"; // Import reassembly helper and color utils
import { StoredFile } from "../components/KnowledgeBaseTab";
import { useAutosave, loadDraft, clearDraft, hasDraft } from "../hooks/use-autosave";
import { DraftRecoveryDialog } from "../components/DraftRecoveryDialog";
import { useGenerationProgress } from "../hooks/use-generation-progress";
import { GenerationProgress } from "../components/GenerationProgress";
// Import to ensure NAP auto-trigger initializes on page load
import "@/lib/knowledge-graph-auto-trigger";

const nodeTypes = {
  agentNode: FlowAgentNode,
};

const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_TEMPERATURE = 1.57;
// Keep this comfortably under typical OpenRouter/model context limits
const DEFAULT_MAX_TOKENS = 5000000;
const DEFAULT_TOP_P = 0.90;

const INITIAL_GENERATION_RESULT: GenerationResult = {
  plan: "",
  draft: "",
  final: "",
  currentStage: "idle",
  isGenerating: false,
  planApproved: undefined,
};

const Index = () => {
  const [apiKey, setApiKey] = useState<string>(loadApiKey());
  // const [showApiDialog, setShowApiDialog] = useState(false); // Removed
  // const [showKnowledgeBase, setShowKnowledgeBase] = useState(false); // Removed
  const [showBlueprintManager, setShowBlueprintManager] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<StoredFile[]>([]);
  const [manualKnowledgeText, setManualKnowledgeText] = useState(""); // Manual from KB profiles
  const [activeKnowledgeBaseText, setActiveKnowledgeBaseText] = useState(""); // Combined for RAG
  const [flowTitle, setFlowTitle] = useState("");
  const [flowPurpose, setFlowPurpose] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [topP, setTopP] = useState(DEFAULT_TOP_P);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [draftToRecover, setDraftToRecover] = useState<ReturnType<typeof loadDraft>>(null);
  // Removed: const [showInspectBlueprint, setShowInspectBlueprint] = useState(false);

  // Define static sizes for panels managed by ResizablePanelGroup. Sizes are defined in percentage points (0-100).
  const DEFAULT_LEFT_PANEL_SIZE_PERCENTAGE = 25; 
  const DEFAULT_RIGHT_PANEL_SIZE_PERCENTAGE = 25; 

  const [generationResult, setGenerationResult] = useState<GenerationResult>(
    INITIAL_GENERATION_RESULT
  );
  const currentAbortController = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planApprovalStatus, setPlanApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [isModifyingPlan, setIsModifyingPlan] = useState(false);
  const [modificationChecklist, setModificationChecklist] = useState<string[]>([]);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  const [isModifyingFinal, setIsModifyingFinal] = useState(false);
  const [finalModificationChecklist, setFinalModificationChecklist] = useState<string[]>([]);
  const [isGeneratingFinalChecklist, setIsGeneratingFinalChecklist] = useState(false);
  const [isUpdatingFinal, setIsUpdatingFinal] = useState(false);
  const [isModifyingDraft, setIsModifyingDraft] = useState(false);
  const [draftModificationChecklist, setDraftModificationChecklist] = useState<string[]>([]);
  const [isGeneratingDraftChecklist, setIsGeneratingDraftChecklist] = useState(false);
  const [isUpdatingDraft, setIsUpdatingDraft] = useState(false);

  // Initialize the color state and set the CSS variable globally
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const updateAgent = (id: string, updatedAgent: AgentConfig) => {
    setAgents((prevAgents) => prevAgents.map(agent => agent.id === id ? updatedAgent : agent));
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...updatedAgent,
              },
            }
          : node
      )
    );
  };

  const deleteAgent = (id: string) => {
    setAgents((prevAgents) => prevAgents.filter(agent => agent.id !== id));
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  };

  const handleResetBlueprint = () => {
    // Reset only blueprint-related state
    setFlowTitle("");
    setFlowPurpose("");
    setAgents([]);
    setNodes([]);
    setEdges([]);

    // Reset Generation state
    setGenerationResult(INITIAL_GENERATION_RESULT);
    setIsGenerating(false);

    toast.success("Blueprint reset successful. Ready for a new blueprint.");
  };

  const handleResetWorkspace = () => {
    // Clear all AI-related cache from localStorage
    localStorage.removeItem("kb_files");
    localStorage.removeItem("kb_profiles");
    localStorage.removeItem("primaryColor");
    
    // Reset core state
    setFlowTitle("");
    setFlowPurpose("");
    setAgents([]);
    setNodes([]);
    setEdges([]);

    // Reset Knowledge Base state
    setKnowledgeFiles([]);
    setManualKnowledgeText("");
    setActiveKnowledgeBaseText("");

    // Reset LLM parameters to default
    setSelectedModel(DEFAULT_MODEL);
    setTemperature(DEFAULT_TEMPERATURE);
    setMaxTokens(DEFAULT_MAX_TOKENS);
    setTopP(DEFAULT_TOP_P);

    // Reset Generation state
    setGenerationResult(INITIAL_GENERATION_RESULT);
    setIsGenerating(false);

    // Reset API key state (keeps loaded key from local storage)
    setApiKey(loadApiKey());

    // Reset primary color to default by updating CSS variables
    // The color will be reset on next render since localStorage is cleared
    if (typeof document !== "undefined") {
      const defaultColor = "#85a506";
      const hslComponents = hexToHslComponents(defaultColor);
      document.documentElement.style.setProperty("--primary", hslComponents);
      document.documentElement.style.setProperty("--ring", hslComponents);
      document.documentElement.style.setProperty("--accent", hslComponents);
      document.documentElement.style.setProperty("--neural-glow", hslComponents);
      document.documentElement.style.setProperty("--primary-color", defaultColor);
    }

    toast.success("Workspace reset successful. All cache cleared. Ready for a new blueprint.");
  };

  const {
    generateBlueprint,
    downloadBlueprint,
    handleImportBlueprint,
    handleSaveBlueprint,
    loadBlueprint,
  } = useBlueprintManagement({
    flowTitle,
    flowPurpose,
    agents,
    knowledgeFiles,
    activeKnowledgeBaseText: manualKnowledgeText,
    setFlowTitle,
    setFlowPurpose,
    setAgents,
    setKnowledgeFiles,
    setActiveKnowledgeBaseText: setManualKnowledgeText,
    setNodes,
    setEdges,
    updateAgent,
    deleteAgent,
  });

  // Load knowledge base files from localStorage on mount and when updated externally
  useEffect(() => {
const loadKBFiles = () => {
      try {
        const storedFilesString = localStorage.getItem('kb_files') || '[]';
        const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
        setKnowledgeFiles(storedFiles);
} catch (error) {
        console.error('Error loading knowledge base files:', error);
}
    };

    // Load on mount
    loadKBFiles();

    // Listen for custom event when files are added from IntegrationsTab or other components
    const handleKBFilesUpdate = (e: CustomEvent) => {
      if (e.detail?.files) {
        setKnowledgeFiles(e.detail.files);
      } else {
        // If no files in event, reload from localStorage
        loadKBFiles();
      }
    };

    // Listen for storage events (from other tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'kb_files' && e.newValue) {
        try {
          const storedFiles = JSON.parse(e.newValue) as StoredFile[];
          setKnowledgeFiles(storedFiles);
        } catch (error) {
          console.error('Error parsing files from storage event:', error);
        }
      }
    };

    window.addEventListener('kb-files-updated', handleKBFilesUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('kb-files-updated', handleKBFilesUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Auto-save hook
  const { hasUnsavedChanges } = useAutosave({
    flowTitle,
    flowPurpose,
    agents,
    knowledgeFiles,
    activeKnowledgeBaseText: manualKnowledgeText,
    generateBlueprint,
    enabled: !isGenerating, // Disable autosave during generation
  });

  // Check for draft on mount — only show recovery if draft has at least one agent
  useEffect(() => {
    if (hasDraft() && agents.length === 0 && !flowTitle && !flowPurpose) {
      const draft = loadDraft();
      if (draft) {
        const agentCount = draft.blueprint?.agents?.length ?? 0;
        if (agentCount > 0) {
          setDraftToRecover(draft);
          setShowDraftRecovery(true);
        } else {
          clearDraft();
        }
      }
    }
  }, []); // Only run on mount

  // Combine manual + files for full RAG (triggers on load after setKnowledgeFiles + setManualKnowledgeText(''))
  useEffect(() => {
    // Use the reassembly function to correctly group and order file contents before joining
    const fileContents = reassembleChunkedFiles(knowledgeFiles);
    const combined = [manualKnowledgeText, fileContents].filter(Boolean).join('\n\n---\n\n');
    setActiveKnowledgeBaseText(combined); // On load: '' + file contents = files for RAG
  }, [manualKnowledgeText, knowledgeFiles]);

  // Update planApprovalStatus when stage changes to plan_approval_pending
  useEffect(() => {
    if (generationResult.currentStage === 'plan_approval_pending' && planApprovalStatus === null) {
      setPlanApprovalStatus('pending');
    }
  }, [generationResult.currentStage, planApprovalStatus]);
  
  const { handleGenerate, handleAbort, handleRetryPlan, handleApprovePlan } = useAgentGeneration({
    apiKey,
    agents,
    knowledgeFiles,
    activeKnowledgeBaseText,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowTitle,
    flowPurpose,
    isGenerating,
    generationResult,
    currentAbortController,
    generateBlueprint,
    setIsGenerating,
    setGenerationResult,
  });

  // Generation progress tracking
  const progressMetrics = useGenerationProgress({
    currentStage: generationResult.currentStage,
    isGenerating,
  });

  const onApprovePlan = useCallback(() => {
    setPlanApprovalStatus('approved');
    handleApprovePlan();
    toast.success("Plan approved. Continuing to draft generation...");
  }, [handleApprovePlan]);

  const onRejectPlan = useCallback(() => {
    setPlanApprovalStatus('rejected');
    toast.info("Plan rejected. Click Retry to generate a new plan or Modify to edit it.");
  }, []);

  const onModifyPlan = useCallback(() => {
    setIsModifyingPlan(true);
    setModificationChecklist([]);
  }, []);

  const onCancelModifyPlan = useCallback(() => {
    setIsModifyingPlan(false);
    setModificationChecklist([]);
  }, []);

  const onModifyFinal = useCallback(() => {
    setIsModifyingFinal(true);
    setFinalModificationChecklist([]);
  }, []);

  const onCancelModifyFinal = useCallback(() => {
    setIsModifyingFinal(false);
    setFinalModificationChecklist([]);
  }, []);

  const onProceedWithModifiedFinal = useCallback(() => {
    setIsModifyingFinal(false);
    setFinalModificationChecklist([]);
    toast.success("Final report has been updated.");
  }, []);

  const onModifyDraft = useCallback(() => {
    setIsModifyingDraft(true);
    setDraftModificationChecklist([]);
  }, []);

  const onCancelModifyDraft = useCallback(() => {
    setIsModifyingDraft(false);
    setDraftModificationChecklist([]);
  }, []);

  const onProceedWithModifiedDraft = useCallback(() => {
    setIsModifyingDraft(false);
    setDraftModificationChecklist([]);
    toast.success("Draft report has been updated.");
  }, []);

  const onProceedWithModifiedPlan = useCallback(() => {
    setIsModifyingPlan(false);
    setModificationChecklist([]);
    
    // If we're modifying after completion, we need to restart the process
    if (generationResult.currentStage === 'complete' || generationResult.currentStage === 'error') {
      // Reset to plan approval pending and approve to continue
      setGenerationResult((prev) => ({
        ...prev,
        currentStage: 'plan_approval_pending',
        draft: '',
        final: '',
        isGenerating: false,
      }));
      setPlanApprovalStatus('pending');
      // Small delay to ensure state is updated, then approve
      setTimeout(() => {
        setPlanApprovalStatus('approved');
        handleApprovePlan();
      }, 100);
      toast.success("Modified plan approved. Restarting draft generation with updated plan...");
    } else {
      // Normal flow - just approve and continue
      setPlanApprovalStatus('approved');
      handleApprovePlan();
      toast.success("Modified plan approved. Continuing to draft generation...");
    }
  }, [handleApprovePlan, generationResult.currentStage, setGenerationResult]);

  const onRetryPlan = useCallback(() => {
    setPlanApprovalStatus('pending');
    handleRetryPlan();
    toast.info("Regenerating plan...");
  }, [handleRetryPlan]);

  const onLoadBlueprintHandler = (blueprint: StoredBlueprint | BlueprintData | null) => {
    if (!blueprint) {
      // This is a special signal from the BlueprintManagerPanel to reset the flow (New Flow button)
      handleResetWorkspace();
      clearDraft(); // Clear draft when starting new flow
    } else {
      // Blueprint is loaded from the manager or imported from JSON
      loadBlueprint(blueprint as StoredBlueprint);
      clearDraft(); // Clear draft when loading a saved blueprint
    }
  };

  const handleRecoverDraft = useCallback(() => {
    if (!draftToRecover) return;
    
    const { blueprint } = draftToRecover;
    
    // Validate draft has minimum required data (agents array)
    if (!blueprint || !Array.isArray(blueprint.agents)) {
      toast.error("Draft is corrupted or invalid. Cannot recover.");
      clearDraft();
      setShowDraftRecovery(false);
      setDraftToRecover(null);
      return;
    }
    
    // Ensure we have at least empty strings for title/purpose if missing
    // This allows recovery of partial drafts
    const recoveredBlueprint = {
      title: blueprint.title || "",
      purpose: blueprint.purpose || "",
      agents: blueprint.agents || [],
      knowledgeFiles: blueprint.knowledgeFiles || [],
      timestamp: blueprint.timestamp || new Date().toISOString(),
    };
    
    // Match refs to separately attached files in storage for RAG
    const storedFilesString = localStorage.getItem('kb_files') || '[]';
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    const blueprintRefs = recoveredBlueprint.knowledgeFiles || [];
    let missingFiles = 0;
    const matchedFiles = blueprintRefs.map((ref: any) => {
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

    setFlowTitle(recoveredBlueprint.title);
    setFlowPurpose(recoveredBlueprint.purpose);

    // Sort agents by step before setting them
    const sortedAgents = (recoveredBlueprint.agents as AgentConfig[])
      .sort((a, b) => (a.step || 0) - (b.step || 0));

    setAgents(sortedAgents);

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

    clearDraft();
    setShowDraftRecovery(false);
    setDraftToRecover(null);
    toast.success("Draft recovered successfully!");
  }, [draftToRecover, setKnowledgeFiles, setActiveKnowledgeBaseText, setFlowTitle, setFlowPurpose, setAgents, setNodes, setEdges, updateAgent, deleteAgent]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setShowDraftRecovery(false);
    setDraftToRecover(null);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' }, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const addAgent = () => {
    const newId = `agent-${Date.now()}`;

    // Using functional update for setAgents to ensure we use the freshest state
    setAgents((prevAgents) => {
      const newAgent: AgentConfig = {
        id: newId,
        title: `Section ${prevAgents.length + 1}`,
        step: prevAgents.length + 1, // Add step property
        description: "",
        features: [],
        h2Count: 1,
        h3Count: 0,
        h3Enabled: false,
        headingLevel: 2, // Default to H2
        maxTokens: undefined, // Default to undefined
      };
      return [...prevAgents, newAgent];
    });

    // Using functional update for setNodes to ensure we use the freshest state for positioning
    setNodes((prevNodes) => {
      // We duplicate the necessary AgentConfig fields to the node data here.
      const nodeData = {
        id: newId,
        step: prevNodes.length + 1, // Add step property
        title: `Section ${prevNodes.length + 1}`,
        description: "",
        features: [],
        h2Count: 1,
        h3Count: 0,
        h3Enabled: false,
        headingLevel: 2, // Default to H2
        maxTokens: undefined, // Default to undefined
        onUpdate: (updated: AgentConfig) => updateAgent(updated.id, updated),
        onDelete: () => deleteAgent(newId),
      };

      const newNode: Node = {
        id: newId,
        type: 'agentNode',
        position: { x: 250, y: prevNodes.length * 250 },
        data: nodeData,
      };
      return [...prevNodes, newNode];
    });
  };

  const handleInsertAgent = useCallback((agentConfig: AgentConfig) => {
    const newId = `agent-${Date.now()}-i`;
    
    // 1. Update the central agents state with the new agent (retains all original feature/setting data)
    setAgents((prevAgents) => {
      const newAgent = { ...agentConfig, id: newId }; // Ensure a new ID
      return [...prevAgents, newAgent];
    });

    // 2. Update the React Flow nodes state
    setNodes((prevNodes) => {
      // Must include onUpdate and onDelete handlers for FlowAgentNode data
      const nodeData = {
        ...agentConfig,
        id: newId,
        onUpdate: (updated: AgentConfig) => updateAgent(updated.id, updated),
        onDelete: () => deleteAgent(newId),
      };

      const newNode: Node = {
        id: newId,
        type: 'agentNode',
        // Place the new node slightly offset on the canvas near the center
        position: { x: 300 + prevNodes.length * 10, y: 300 + prevNodes.length * 10 },
        data: nodeData,
      };
      return [...prevNodes, newNode];
    });

    toast.success(`Inserted Agent: ${agentConfig.title}`);
    setShowBlueprintManager(false); // Close the manager after insertion
    
  }, [setAgents, setNodes, updateAgent, deleteAgent, setShowBlueprintManager]);

  const handleBlueprintUpdate = useCallback((updatedAgents: AgentConfig[]) => {
    // Sort agents by step to ensure proper ordering
    const sortedAgents = [...updatedAgents].sort((a, b) => (a.step || 0) - (b.step || 0));
    
    // Update agents state
    setAgents(sortedAgents);

    // Regenerate nodes from sorted agents with proper spacing
    const updatedNodes: Node[] = sortedAgents.map((agent: AgentConfig, index: number) => {
      const nodeData = {
        ...agent,
        onUpdate: (updated: AgentConfig) => updateAgent(updated.id, updated),
        onDelete: () => deleteAgent(agent.id),
      };
      return {
        id: agent.id,
        type: 'agentNode',
        position: { x: 350, y: index * 600 }, // Increased spacing to prevent overlap, especially with features
        data: nodeData,
      };
    });

    setNodes(updatedNodes);
    
    // Auto-connect nodes in sequential step order
    const autoEdges: Edge[] = [];
    for (let i = 0; i < updatedNodes.length - 1; i++) {
      autoEdges.push({
        id: `edge-${updatedNodes[i].id}-${updatedNodes[i + 1].id}`,
        source: updatedNodes[i].id,
        target: updatedNodes[i + 1].id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      });
    }
    setEdges(autoEdges);
    
    toast.success("Blueprint structure updated successfully!");
  }, [setAgents, setNodes, setEdges, updateAgent, deleteAgent]);

  // This useEffect is now redundant and removed since KnowledgeBaseManager handles combination
  // and processImportedBlueprint (in use-blueprint-management.ts) sets activeKnowledgeBaseText directly.
try {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Draft Recovery Dialog */}
      <DraftRecoveryDialog
        open={showDraftRecovery}
        draft={draftToRecover}
        onRecover={handleRecoverDraft}
        onDiscard={handleDiscardDraft}
      />

      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-8 py-5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-sm font-semibold text-foreground tracking-tight">Flowbie</h1>
              {hasUnsavedChanges && !isGenerating && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBlueprintManager(true)}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                Manager
            </Button>
            {/* Removed Knowledge Base button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetBlueprint}
              className="h-8 text-xs border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset Blueprint
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetWorkspace}
              className="h-8 text-xs border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset All
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              onClick={() => {
                setPlanApprovalStatus(null);
                handleGenerate();
              }}
              disabled={isGenerating || agents.length === 0}
              size="sm"
              className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
            >
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
            </div>
          </div>
          {/* Progress indicator during generation */}
          {isGenerating && (
            <div className="px-8 pb-3">
              <GenerationProgress progress={progressMetrics} compact />
            </div>
          )}
        </div>
      </header>

      {/* Flow Builder Panel and Settings Panel */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">

        {/* Settings Panel (Left Sidebar) */}
        <ResizablePanel 
          defaultSize={DEFAULT_LEFT_PANEL_SIZE_PERCENTAGE}
          minSize={15}
          maxSize={40}
          className="border-r border-border bg-card overflow-y-hidden h-full flex flex-col flex-shrink-0"
        >
          {/* Add Section Button (Moved to Top) */}
          <div className="p-6 pb-4 border-b border-border flex-shrink-0">
            <Button
              onClick={addAgent}
              variant="secondary"
              size="sm"
              className="w-full h-9 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-2" />
              Add Agent
            </Button>
          </div>

          {/* Scrollable area for controls */}
          <ScrollArea className="flex-1 min-h-0">
            {/* Flow Metadata */}
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                  Flow Title
                </label>
                <Input
                  value={flowTitle}
                  onChange={(e) => setFlowTitle(e.target.value)}
                  placeholder="E.g., Ultimate Guide to SEO"
                  className="bg-input border-border h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                  Purpose
                </label>
                <Textarea
                  value={flowPurpose}
                  onChange={(e) => setFlowPurpose(e.target.value)}
                  placeholder="Describe the purpose..."
                  className="bg-input border-border min-h-[120px] text-sm resize-y"
                />
              </div>
            </div>

            {/* END REMOVED: LLM Controls and Color */}

            {/* REMOVED: LLM Parameters Section, now inside BlueprintManagerPanel */}
            {/* REMOVED: <div className="pt-6 border-t border-border p-6">
              <LLMParameters
                temperature={temperature}
                onTemperatureChange={setTemperature}
                maxTokens={maxTokens}
                onMaxTokensChange={setMaxTokens}
                topP={topP}
                onTopPChange={setTopP}
              />
            </div> */}
          </ScrollArea>
        </ResizablePanel>

        {/* Resizable Handle for Left Panel */}
        <ResizableHandle withHandle />

        {/* Main Canvas */}
        <ResizablePanel>
          <div className="flex-1 h-full">
            <ReactFlow
              proOptions={{ hideAttribution: true }}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              className="bg-background"
              defaultEdgeOptions={{
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
                style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
              }}
            >
              <Background 
                variant={BackgroundVariant.Dots} 
                gap={20} 
                size={1}
                color="hsl(var(--primary) / 0.2)"
                className="bg-background"
              />
              <Controls className="bg-card border-border" />
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Plus className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">No sections yet</p>
                  <Button
                    onClick={addAgent}
                    variant="outline"
                    size="sm"
                    className="border-dashed pointer-events-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Agent
                  </Button>
                </div>
              </div>
            )}
            
          </div>
        </ResizablePanel>

        {/* Resizable Handle for Right Panel */}
        <ResizableHandle withHandle />

        {/* Right Sidebar (Chat Panel) */}
        <ResizablePanel 
          defaultSize={DEFAULT_RIGHT_PANEL_SIZE_PERCENTAGE}
          minSize={15} 
          maxSize={40} 
          className="border-l border-border bg-background p-0 overflow-y-hidden h-full flex flex-col relative"
        >
          <AIChatPanel
            apiKey={apiKey}
            flowTitle={flowTitle}
            flowPurpose={flowPurpose}
            agents={agents}
            selectedModel={selectedModel}
            temperature={temperature}
            maxTokens={maxTokens}
            topP={topP}
            knowledgeBaseText={activeKnowledgeBaseText}
            onInsertAgent={handleInsertAgent}
            onBlueprintUpdate={handleBlueprintUpdate}
            generateCurrentBlueprintData={generateBlueprint}
            onFlowTitleChange={setFlowTitle}
            onFlowPurposeChange={setFlowPurpose}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Removed ApiKeyDialog component */}
      {/* <ApiKeyDialog
        open={showApiDialog}
        onOpenChange={setShowApiDialog}
        onSave={(key) => {
          setApiKey(key);
          saveApiKey(key);
        }}
        currentKey={apiKey}
      /> */}

      {/* Removed KnowledgeBaseManager component */}
      {/* <KnowledgeBaseManager
        open={showKnowledgeBase}
        onOpenChange={setShowKnowledgeBase}
        onFilesUpdate={setKnowledgeFiles}
        onManualContentUpdate={setManualKnowledgeText}
        currentFiles={knowledgeFiles}
      /> */}

      {showBlueprintManager && (
        <BlueprintManagerPanel
          onLoadBlueprint={onLoadBlueprintHandler}
          onClose={() => setShowBlueprintManager(false)}
          generateCurrentBlueprintData={generateBlueprint}
          currentNodeCount={agents.length}
          currentKBFiles={knowledgeFiles}
          onFilesUpdate={setKnowledgeFiles}
          onManualContentUpdate={setManualKnowledgeText}
          // New Props for Settings Tab
          apiKey={apiKey}
          setApiKey={setApiKey}
          saveApiKey={saveApiKey}
          // Passing LLM Settings props
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          temperature={temperature}
          setTemperature={setTemperature}
          maxTokens={maxTokens}
          setMaxTokens={setMaxTokens}
          topP={topP}
          setTopP={setTopP}
          // Plan modification props
          isModifyingPlan={isModifyingPlan}
          modificationChecklist={modificationChecklist}
          isGeneratingChecklist={isGeneratingChecklist}
          isUpdatingPlan={isUpdatingPlan}
          onModifyPlan={onModifyPlan}
          onCancelModifyPlan={onCancelModifyPlan}
          onProceedWithModifiedPlan={onProceedWithModifiedPlan}
          setModificationChecklist={setModificationChecklist}
          setIsGeneratingChecklist={setIsGeneratingChecklist}
          setIsUpdatingPlan={setIsUpdatingPlan}
          setGenerationResult={setGenerationResult}
          flowTitle={flowTitle}
          flowPurpose={flowPurpose}
          agents={agents}
          activeKnowledgeBaseText={activeKnowledgeBaseText}
          // Final report modification props
          isModifyingFinal={isModifyingFinal}
          finalModificationChecklist={finalModificationChecklist}
          isGeneratingFinalChecklist={isGeneratingFinalChecklist}
          isUpdatingFinal={isUpdatingFinal}
          onModifyFinal={onModifyFinal}
          onCancelModifyFinal={onCancelModifyFinal}
          onProceedWithModifiedFinal={onProceedWithModifiedFinal}
          setFinalModificationChecklist={setFinalModificationChecklist}
          setIsGeneratingFinalChecklist={setIsGeneratingFinalChecklist}
          setIsUpdatingFinal={setIsUpdatingFinal}
          allAgentsInBlueprint={agents} // NEW PROP: Passing all active agents for selection
          onInsertAgent={handleInsertAgent} // NEW: Pass the handler
          onBlueprintUpdate={handleBlueprintUpdate} // NEW: Pass blueprint update handler to replace all agents
          setFlowTitle={setFlowTitle}
          setFlowPurpose={setFlowPurpose}
          // Output Manager props
          output={generationResult.final}
          isGenerating={isGenerating}
          currentStage={generationResult.currentStage}
          plan={generationResult.plan}
          draft={generationResult.draft}
          onAbort={handleAbort}
          // Approval props
          planApprovalStatus={planApprovalStatus}
          onApprovePlan={onApprovePlan}
          onRejectPlan={onRejectPlan}
          onRetryPlan={onRetryPlan}
        />
      )}
      {/* Removed BlueprintInspector component */}
      </div>
    );
  } catch (error) {
throw error;
  }
};

export default Index;
