import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Copy, Download, Trash2, ArrowRight, X, Search, Plus, Save, FileText, Star, StarOff } from "lucide-react";
import {
  getStoredBlueprints,
  deleteBlueprint,
  saveBlueprints,
  StoredBlueprint,
  BlueprintData,
  saveCurrentBlueprint,
  importAndSaveBlueprintFromFile,
} from "@/hooks/use-blueprint-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoredFile, KnowledgeBaseTab } from "./KnowledgeBaseTab";
import { BlueprintInspectorContent } from "./BlueprintInspectorContent";
import { ApiKeyContent } from "./ApiKeyContent"; // Import the new settings content
import { DataForSEOApiKeyContent } from "./DataForSEOApiKeyContent"; // Import DataForSEO API key content
import { LLMSettingsTabContent } from "./LLMSettingsTabContent"; // Import the combined settings component
import { AgentConfig } from "./AgentNode"; // NEW: Import AgentConfig interface
import { AgentManagerContent } from "./AgentManagerContent"; // NEW: Import the new Agent panel content
import { OutputManagerContent } from "./OutputManager/OutputManagerContent"; // Import OutputManagerContent
import { TemplateSelector } from "./TemplateSelector"; // Import TemplateSelector
import { KeywordResearchTab } from "./keyword-research/KeywordResearchTab"; // Import KeywordResearchTab
import { IntegrationsTab } from "./IntegrationsTab"; // Import IntegrationsTab
import { KnowledgeModelFeature } from "./integrations/knowledge-model/KnowledgeModelFeature"; // Import KnowledgeModelFeature
import { GeneratorTab } from "./generator/GeneratorTab"; // Import GeneratorTab
import type { KeywordResearchResult } from "@/lib/keyword-types";
import { saveDataForSEOApiKey } from "@/lib/api";

// Define the type for the props expected by the panel
interface BlueprintManagerPanelProps {
  onLoadBlueprint: (blueprint: StoredBlueprint) => void;
  onClose: () => void;
  // This function is provided by the parent (Index.tsx) to get the current flow state
  generateCurrentBlueprintData: () => BlueprintData;
  currentNodeCount: number;
  // KB related props
  onManualContentUpdate: (content: string) => void; 
  onFilesUpdate: (files: StoredFile[]) => void;
  currentKBFiles: StoredFile[];
  // API Key related props
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
  // LLM Settings Props
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  temperature: number;
  setTemperature: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
  // NEW: Prop for Agent Insertion
  onInsertAgent: (agent: AgentConfig) => void;
  // NEW: Prop for replacing all agents (overwriting blueprint)
  onBlueprintUpdate?: (agents: AgentConfig[]) => void;
  // NEW: Props for updating flow title/purpose
  setFlowTitle?: (title: string) => void;
  setFlowPurpose?: (purpose: string) => void;
  // NEW: Prop for currently selected agent config from Index.tsx
  allAgentsInBlueprint: AgentConfig[];
  // Output Manager props
  output?: string;
  isGenerating?: boolean;
  currentStage?: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  plan?: string;
  draft?: string;
  onAbort?: () => void;
  // Approval props
  planApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  onRetryPlan?: () => void;
  // Plan modification props
  isModifyingPlan?: boolean;
  modificationChecklist?: string[];
  isGeneratingChecklist?: boolean;
  isUpdatingPlan?: boolean;
  onModifyPlan?: () => void;
  onCancelModifyPlan?: () => void;
  onProceedWithModifiedPlan?: () => void;
  setModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingPlan?: (isUpdating: boolean) => void;
  setGenerationResult?: (result: any) => void;
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  activeKnowledgeBaseText?: string;
  // Final report modification props
  isModifyingFinal?: boolean;
  finalModificationChecklist?: string[];
  isGeneratingFinalChecklist?: boolean;
  isUpdatingFinal?: boolean;
  onModifyFinal?: () => void;
  onCancelModifyFinal?: () => void;
  onProceedWithModifiedFinal?: () => void;
  setFinalModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingFinalChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingFinal?: (isUpdating: boolean) => void;
  // Draft report modification props
  isModifyingDraft?: boolean;
  draftModificationChecklist?: string[];
  isGeneratingDraftChecklist?: boolean;
  isUpdatingDraft?: boolean;
  onModifyDraft?: () => void;
  onCancelModifyDraft?: () => void;
  onProceedWithModifiedDraft?: () => void;
  setDraftModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingDraftChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingDraft?: (isUpdating: boolean) => void;
}

// --- Helper Components ---

interface BlueprintTileProps {
  blueprint: StoredBlueprint;
  onLoad: (blueprint: StoredBlueprint) => void;
  onRefresh: () => void;
}

const BlueprintTile: React.FC<BlueprintTileProps> = ({ blueprint, onLoad, onRefresh }) => {
  const handleDelete = useCallback(() => {
    if (window.confirm(`Are you sure you want to delete blueprint: "${blueprint.title}"?`)) {
        deleteBlueprint(blueprint.id);
        toast.info(null, { description: `Blueprint "${blueprint.title}" deleted.` });
        onRefresh(); // Refresh the list of blueprints
    }
  }, [blueprint.id, blueprint.title, onRefresh]);

  const handleDownload = useCallback(() => {
    try {
      // Omit ID and nodeCount from the export JSON, as they are metadata that shouldn't be loaded back generally
      const { id, nodeCount, ...dataToExport } = blueprint; 
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blueprint-${blueprint.title.replace(/\s/g, "-").toLowerCase() || 'export'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(null, { description: "Blueprint downloaded successfully." });
    } catch (error) {
      console.error(error);
      toast.error("Failed to download blueprint.");
    }
  }, [blueprint]);

  const lastUpdated = useMemo(() => {
    return new Date(blueprint.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [blueprint.timestamp]);
  
  return (
    <Card 
      className="p-4 bg-card border-2 border-border hover:border-primary transition-all duration-200 cursor-pointer flex flex-col justify-between"
      onClick={() => onLoad(blueprint)} // Loads on click anywhere on the card
    >
      <div>
        <h3 className="text-lg font-bold text-gray-50 mb-1 truncate">{blueprint.title}</h3>
        <p className="text-xs text-gray-400">Last Updated: {lastUpdated}</p>
      </div>

      {/* Quick Action Icons */}
      <div className="mt-3 flex space-x-3 justify-between items-center text-sm">
        <p className="text-gray-400">{blueprint.nodeCount} Nodes</p>
        <div className="flex space-x-3">
          {/* Load/Open Button */}
          <div className="p-1 rounded-full text-gray-500 hover:text-primary transition-colors duration-200" title="Open/Load">
            <ArrowRight className="h-5 w-5" />
          </div>
        
          {/* Export/Download Button */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleDownload(); }} 
            className="p-1 rounded-full text-gray-500 hover:text-primary transition-colors duration-200" 
            title="Export as JSON"
          >
            <Download className="h-5 w-5" />
          </button>

          {/* Delete Button */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleDelete(); }} 
            className="p-1 rounded-full text-gray-500 hover:text-red-500 transition-colors duration-200" 
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Card>
  );
};

// --- Main Component ---

export const BlueprintManagerPanel: React.FC<BlueprintManagerPanelProps> = ({
  onLoadBlueprint,
  onClose,
  generateCurrentBlueprintData,
  currentNodeCount,
  onManualContentUpdate,
  onFilesUpdate,
  currentKBFiles,
  apiKey, // New prop
  setApiKey, // New prop
  saveApiKey, // New prop
  selectedModel,
  setSelectedModel,
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  topP,
  setTopP,
  onInsertAgent, // NEW: Destructure new prop
  onBlueprintUpdate, // NEW: Destructure blueprint update prop
  setFlowTitle, // NEW: Destructure flow title setter
  setFlowPurpose, // NEW: Destructure flow purpose setter
  allAgentsInBlueprint, // NEW: Destructure new prop
  output, // Output Manager props
  isGenerating,
  currentStage,
  plan,
  draft,
  onAbort,
  planApprovalStatus, // Approval props
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  // Plan modification props
  isModifyingPlan,
  modificationChecklist,
  isGeneratingChecklist,
  isUpdatingPlan,
  onModifyPlan,
  onCancelModifyPlan,
  onProceedWithModifiedPlan,
  setModificationChecklist,
  setIsGeneratingChecklist,
  setIsUpdatingPlan,
  setGenerationResult,
  flowTitle,
  flowPurpose,
  agents,
  activeKnowledgeBaseText,
  // Final report modification props
  isModifyingFinal,
  finalModificationChecklist,
  isGeneratingFinalChecklist,
  isUpdatingFinal,
  onModifyFinal,
  onCancelModifyFinal,
  onProceedWithModifiedFinal,
  setFinalModificationChecklist,
  setIsGeneratingFinalChecklist,
  setIsUpdatingFinal,
  // Draft report modification props
  isModifyingDraft,
  draftModificationChecklist,
  isGeneratingDraftChecklist,
  isUpdatingDraft,
  onModifyDraft,
  onCancelModifyDraft,
  onProceedWithModifiedDraft,
  setDraftModificationChecklist,
  setIsGeneratingDraftChecklist,
  setIsUpdatingDraft,
}) => {
  const [storedBlueprints, setStoredBlueprints] = useState<StoredBlueprint[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [keywordResearchData, setKeywordResearchData] = useState<KeywordResearchResult | null>(null);
  const [dataForSEOApiKey, setDataForSEOApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("dataforseo-api-key") || "";
    } catch {
      return "";
    }
  });

  const refreshBlueprints = useCallback(() => {
    setStoredBlueprints(getStoredBlueprints());
  }, []);

  useEffect(() => {
    refreshBlueprints();
    // Load keyword data from current blueprint if available
    const currentData = generateCurrentBlueprintData();
    if (currentData.targetKeyword && currentData.primaryKeywords) {
      const keywordResult: KeywordResearchResult = {
        primaryKeyword: currentData.targetKeyword,
        keywordData: currentData.primaryKeywords[0],
        semanticKeywords: currentData.primaryKeywords.slice(1),
        searchIntent: currentData.searchIntent || 'informational',
      };
      setKeywordResearchData(keywordResult);
    }
  }, [refreshBlueprints, generateCurrentBlueprintData]);

  const filteredBlueprints = storedBlueprints.filter(
    (bp) =>
      bp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bp.purpose.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by newest first

  const handleSaveCurrentFlow = useCallback(() => {
    // 1. Get the latest data for the current flow to pre-fill the name
    const data = generateCurrentBlueprintData();
    setNewTitle(data.title || `Blueprint - ${new Date().toLocaleDateString()}`); 
    setIsModalOpen(true);
  }, [generateCurrentBlueprintData]);

  const handleConfirmSave = useCallback(() => {
    if (!newTitle.trim()) {
      toast.error("Blueprint title cannot be empty.");
      return;
    }
    
    // 1. Get the latest data for the current flow
    const data = generateCurrentBlueprintData();
    
    // 2. Save it with the new title
    saveCurrentBlueprint(
      { ...data, title: newTitle.trim() }, 
      currentNodeCount
    );

    // 3. Refresh the list and close the modal
    refreshBlueprints();
    setIsModalOpen(false);
    setNewTitle("");
  }, [generateCurrentBlueprintData, currentNodeCount, newTitle, refreshBlueprints]);

  // Handler for New Flow (simply closes the manager and tells parent to handle it)
  const handleNewFlow = useCallback(() => {
    if (window.confirm("Are you sure you want to start a new flow? All unsaved changes in the current flow will be lost.")) {
      // This function will be handled by the parent component (Index.tsx) to reset the workspace
      onLoadBlueprint(null as any); // Passing null to indicate a 'new' flow 
      onClose();
    }
  }, [onClose, onLoadBlueprint]);

  // Update handleImportChange to handle multiple files
  const handleImportChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    let blueprintFile: File | null = null;
    const knowledgeFiles: File[] = [];

    files.forEach(file => {
      if (file.name.endsWith('.json')) {
        blueprintFile = file;
      } else {
        knowledgeFiles.push(file); // Separate attachment: full files
      }
    });

    // Attach files separately: save full content to KB storage for RAG
    if (knowledgeFiles.length > 0) {
      const newStoredFiles: StoredFile[] = await Promise.all(
        knowledgeFiles.map(async (file) => {
          const content = await file.text();
          return {
            name: file.name,
            size: file.size,
            content, // Full content saved separately for RAG
            starred: false,
            timestamp: Date.now(),
          };
        })
      );

      // Get the current files from prop to maintain state integrity
      const existingFiles = currentKBFiles; 
      const updatedFiles = [...existingFiles, ...newStoredFiles];
      
      // Updated to use the prop update function instead of directly setting localStorage
      onFilesUpdate(updatedFiles); 
      toast.success(`${knowledgeFiles.length} files attached separately to KB storage—contents ready for RAG.`);
    }

    // Save blueprint JSON (refs only—files attached via storage)
    if (blueprintFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonContent = e.target?.result as string;
          const blueprint = JSON.parse(jsonContent);
          importAndSaveBlueprintFromFile(blueprintFile!); // Refs to attached files
          setTimeout(() => {
            refreshBlueprints();
          }, 500);
        } catch (error) {
          toast.error("Failed to parse blueprint JSON.");
          console.error("Import error:", error);
        }
      };
      reader.readAsText(blueprintFile);
    } else {
      toast.error("Include blueprint JSON (.json) + files for separate attachment.");
    }

    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }, [refreshBlueprints, currentKBFiles, onFilesUpdate]);

  return (
    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm p-4 md:p-8 overflow-y-auto">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Manager Panel</h1>
          <Button onClick={onClose} variant="ghost" className="text-white hover:text-primary">
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Tabs for Blueprints, Attached Files, and Knowledge Base */}
        <Tabs defaultValue="workflows" className="w-full">
          <TabsList className="grid w-full grid-cols-10 bg-card border-border">
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="inspect-blueprint">Inspect Blueprint</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
            <TabsTrigger value="keyword-research">Keyword Research</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="generator">WP Engine</TabsTrigger>
            <TabsTrigger value="knowledge-graph">Knowledge Graph</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="output">Output Manager</TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="mt-4">
            {/* Controls Header */}
            <div className="bg-card p-4 rounded-lg shadow-lg mb-6 sticky top-0 z-10 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 items-center border border-border">
              
              {/* Action Buttons */}
              <Button 
                onClick={handleSaveCurrentFlow} 
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-black font-bold"
              >
                <Save className="h-4 w-4 mr-2" /> Save Current Flow
              </Button>

              <Button 
                onClick={handleNewFlow} 
                variant="outline" 
                className="w-full sm:w-auto text-primary border-primary hover:bg-primary/50"
              >
                <Plus className="h-4 w-4 mr-2" /> New Flow
              </Button>

              <Button 
                onClick={() => importInputRef.current?.click()} 
                variant="outline" 
                className="w-full sm:w-auto text-white border-border hover:bg-primary/20"
              >
                <Download className="h-4 w-4 mr-2 rotate-180" /> Import JSON + Files
              </Button>
              
              {/* Search Bar */}
              <div className="relative flex-grow w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search workflows by title or purpose..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-input border-border text-white placeholder-gray-400 focus:border-primary/50"
                />
              </div>
            </div>

            {/* Templates Section */}
            <div className="bg-card p-6 rounded-lg shadow-lg mb-6 border border-border">
              <TemplateSelector
                onSelectTemplate={(blueprint) => {
                  onClose();
                  onLoadBlueprint(blueprint);
                }}
              />
            </div>
            
            {/* Flow List (Grid of Tiles) */}
            <div className="min-h-[40vh]">
                {filteredBlueprints.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {filteredBlueprints.map((blueprint) => (
                    <BlueprintTile
                        key={blueprint.id}
                        blueprint={blueprint}
                        onLoad={(bp) => {
                        onClose();
                        onLoadBlueprint(bp);
                        }}
                        onRefresh={refreshBlueprints}
                    />
                    ))}
                </div>
                ) : (
                <div className="text-center p-12 text-muted-foreground border-2 border-dashed border-border rounded-lg bg-card/50">
                    <p className="text-lg">No blueprints found.</p>
                    <p className="mt-2 text-sm">Save your current flow to start managing blueprints! Use the 'Save Current Flow' button above.</p>
                </div>
                )}
            </div>
          </TabsContent>

          {/* Existing: Inspect Blueprint Tab Content */}
          <TabsContent value="inspect-blueprint" className="mt-4">
            <BlueprintInspectorContent 
              generateCurrentBlueprintData={generateCurrentBlueprintData}
            />
          </TabsContent>

          {/* NEW: Agents Tab Content */}
          <TabsContent value="agents" className="mt-4">
            <AgentManagerContent
              onInsertAgent={onInsertAgent}
              allAgentsInBlueprint={allAgentsInBlueprint} // PASS NEW PROP
            />
          </TabsContent>
          
          {/* Existing: Knowledge Base Tab Content */}
          <TabsContent value="knowledge" className="mt-4">
            <KnowledgeBaseTab
              onFilesUpdate={onFilesUpdate}
              onManualContentUpdate={onManualContentUpdate}
              currentFiles={currentKBFiles}
            />
          </TabsContent>

          {/* NEW: Keyword Research Tab Content */}
          <TabsContent value="keyword-research" className="mt-4">
            <KeywordResearchTab
              flowTitle={flowTitle}
              flowPurpose={flowPurpose}
              currentKeywords={keywordResearchData}
              onKeywordsUpdate={(keywords) => {
                setKeywordResearchData(keywords);
                // Update the current blueprint with keyword data
                const currentData = generateCurrentBlueprintData();
                const updatedData: BlueprintData = {
                  ...currentData,
                  primaryKeywords: [keywords.keywordData, ...keywords.semanticKeywords],
                  targetKeyword: keywords.primaryKeyword,
                  keywordDifficulty: keywords.keywordData.difficulty,
                  searchIntent: keywords.searchIntent,
                  semanticKeywords: keywords.semanticKeywords.map(k => k.keyword),
                };
                // Save to current blueprint (this will be persisted when user saves)
                // Note: We need to update the stored blueprint if it exists
                const allBlueprints = getStoredBlueprints();
                const existingIndex = allBlueprints.findIndex(bp => bp.title === flowTitle);
                if (existingIndex >= 0) {
                  const updated = {
                    ...allBlueprints[existingIndex],
                    ...updatedData,
                  };
                  allBlueprints[existingIndex] = updated;
                // Save back to storage
                try {
                  saveBlueprints(allBlueprints);
                } catch (e) {
                  console.error("Failed to save keyword data:", e);
                }
                }
                toast.success("Keyword data saved to blueprint");
              }}
              apiKey={dataForSEOApiKey}
              openRouterApiKey={apiKey}
              generateCurrentBlueprintData={generateCurrentBlueprintData}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              onAddFile={(file) => {
                // Add file to knowledge base
                const updatedFiles = [...currentKBFiles, file];
                onFilesUpdate(updatedFiles);
              }}
              onAgentsAccepted={(agents, title, purpose) => {
                // OVERWRITE the blueprint with new agents (replace all existing agents)
                if (onBlueprintUpdate) {
                  onBlueprintUpdate(agents);
                  if (title && setFlowTitle) {
                    setFlowTitle(title);
                  }
                  if (purpose && setFlowPurpose) {
                    setFlowPurpose(purpose);
                  }
                  toast.success(`Blueprint replaced with ${agents.length} agents${title ? `: ${title}` : ""}`);
                } else {
                  // Fallback: Insert each agent if no blueprint update handler
                  agents.forEach((agent) => {
                    onInsertAgent(agent);
                  });
                  toast.success(`Added ${agents.length} agents to blueprint${title ? `: ${title}` : ""}`);
                }
              }}
            />
          </TabsContent>

          {/* NEW: Integrations Tab Content */}
          <TabsContent value="integrations" className="mt-4">
            <IntegrationsTab 
              onBlueprintUpdate={onBlueprintUpdate ? (agents, title, purpose) => {
                if (onBlueprintUpdate) {
                  onBlueprintUpdate(agents);
                  if (title && setFlowTitle) {
                    setFlowTitle(title);
                  }
                  if (purpose && setFlowPurpose) {
                    setFlowPurpose(purpose);
                  }
                  toast.success(`Blueprint replaced with ${agents.length} agents${title ? `: ${title}` : ""}`);
                }
              } : undefined}
            />
          </TabsContent>

          {/* Generator Tab Content */}
          <TabsContent value="generator" className="mt-4">
            <GeneratorTab />
          </TabsContent>

          {/* Knowledge Graph Tab Content */}
          <TabsContent value="knowledge-graph" className="mt-4">
            <KnowledgeModelFeature />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <div className="space-y-6">
              <ApiKeyContent
                apiKey={apiKey}
                setApiKey={setApiKey}
                saveApiKey={saveApiKey}
              />
              <DataForSEOApiKeyContent
                apiKey={dataForSEOApiKey}
                setApiKey={setDataForSEOApiKey}
                saveApiKey={(key) => {
                  setDataForSEOApiKey(key);
                  saveDataForSEOApiKey(key);
                }}
              />
              <LLMSettingsTabContent
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                temperature={temperature}
                onTemperatureChange={setTemperature}
                maxTokens={maxTokens}
                onMaxTokensChange={setMaxTokens}
                topP={topP}
                onTopPChange={setTopP}
              />
            </div>
          </TabsContent>

          <TabsContent value="output" className="mt-4">
            <div className="bg-card rounded-lg p-6 overflow-hidden h-full flex flex-col">
              <OutputManagerContent
                output={output || ""}
                isGenerating={isGenerating || false}
                currentStage={currentStage || 'idle'}
                plan={plan || ""}
                draft={draft || ""}
                onAbort={onAbort || (() => {})}
                primaryKeywords={keywordResearchData ? [keywordResearchData.keywordData, ...keywordResearchData.semanticKeywords] : undefined}
                planApprovalStatus={planApprovalStatus}
                onApprovePlan={onApprovePlan}
                onRejectPlan={onRejectPlan}
                onRetryPlan={onRetryPlan}
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
                apiKey={apiKey}
                selectedModel={selectedModel}
                temperature={temperature}
                maxTokens={maxTokens}
                topP={topP}
                flowTitle={flowTitle}
                flowPurpose={flowPurpose}
                agents={agents}
                activeKnowledgeBaseText={activeKnowledgeBaseText}
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
                isModifyingDraft={isModifyingDraft}
                draftModificationChecklist={draftModificationChecklist}
                isGeneratingDraftChecklist={isGeneratingDraftChecklist}
                isUpdatingDraft={isUpdatingDraft}
                onModifyDraft={onModifyDraft}
                onCancelModifyDraft={onCancelModifyDraft}
                onProceedWithModifiedDraft={onProceedWithModifiedDraft}
                setDraftModificationChecklist={setDraftModificationChecklist}
                setIsGeneratingDraftChecklist={setIsGeneratingDraftChecklist}
                setIsUpdatingDraft={setIsUpdatingDraft}
              />
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Save Flow Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-foreground">Save Current Blueprint</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Enter a title for your saved flow. This snapshot includes all agents and settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="title" className="text-right text-foreground">
                  Title
                </Label>
                <Input
                  id="title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="col-span-3 bg-input border-border text-foreground placeholder-muted-foreground focus:border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
                />
              </div>
              <div className="text-right text-sm text-muted-foreground mt-2">
                Current Agents: {currentNodeCount}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="text-red-400 border-red-400 hover:bg-red-400/10">
                Cancel
              </Button>
              <Button onClick={handleConfirmSave} className="bg-primary hover:bg-primary/90 text-black font-bold">
                Save Blueprint
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hidden File Input */}
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.txt,.md,.csv,.xml"
          multiple
          className="hidden"
          onChange={handleImportChange}
        />
      </div>
    </div>
  );
};
