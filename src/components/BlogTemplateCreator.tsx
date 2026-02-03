import React, { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Globe, Info } from "lucide-react";
import { AgentSuggestionReview } from "./AgentSuggestionReview";
import type { AgentConfig } from "./AgentNode";
import type { KeywordData } from "@/lib/keyword-types";
import {
  generateChecklistFromSelections,
  generateBlueprintFromTemplate,
  type BlogTemplateContext,
} from "@/lib/blog-template-builder";
import { generateTitleOptions } from "@/lib/title-generator";
import { TitleSelector } from "./TitleSelector";
import { getStoredSites } from "@/components/IntegrationsTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getResearchModel } from "@/lib/optimization-settings-storage";

interface BlogTemplateCreatorProps {
  apiKey: string;
  flowTitle?: string;
  flowPurpose?: string;
  keywordData?: KeywordData;
  selectedKeywords?: string[];
  selectedH2Sections?: string[];
  selectedPeopleAlsoAsk?: string[];
  selectedResearchLinks?: string[];
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entity?: string; // Optional entity for content optimization
  serpData?: any; // Full SERP JSON response for context
  onAgentsAccepted: (agents: AgentConfig[], title?: string, purpose?: string) => void;
  onCancel?: () => void;
}

export const BlogTemplateCreator: React.FC<BlogTemplateCreatorProps> = ({
  apiKey,
  flowTitle = "",
  flowPurpose = "",
  keywordData,
  selectedKeywords = [],
  selectedH2Sections = [],
  selectedPeopleAlsoAsk = [],
  selectedResearchLinks = [],
  entity,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 8000,
  topP = 0.9,
  serpData,
  onAgentsAccepted,
  onCancel,
}) => {
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showTitleSelector, setShowTitleSelector] = useState(true);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
  const [blueprintGenerated, setBlueprintGenerated] = useState(false);
  const [suggestedAgents, setSuggestedAgents] = useState<AgentConfig[]>([]);
  const [generatedPurpose, setGeneratedPurpose] = useState<string | undefined>();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showChecklistReview, setShowChecklistReview] = useState(false);
  const [lastUserPrompt, setLastUserPrompt] = useState<string | undefined>();
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [retryPromptModifier, setRetryPromptModifier] = useState<string>("");
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Connected WordPress site (for target topic)
  const [connectedSite, setConnectedSite] = useState<{ name: string; siteUrl: string } | null>(null);

  // Load connected WordPress site on mount
  useEffect(() => {
    const sites = getStoredSites();
    if (sites.length > 0) {
      // Get the first successfully connected site, or most recent if multiple
      const connectedSites = sites.filter(s => s.connectionStatus === 'success');
      const siteToUse = connectedSites.length > 0 
        ? connectedSites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0]
        : sites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0];
      
      if (siteToUse) {
        setConnectedSite({
          name: siteToUse.name,
          siteUrl: siteToUse.siteUrl,
        });
      }
    }
  }, []);

  // Generate title options when we have keyword data and H2 sections
  useEffect(() => {
    // Only generate if we have valid keyword data with an actual keyword (not empty)
    if (keywordData && keywordData.keyword && keywordData.keyword.trim() && selectedH2Sections.length > 0 && titleOptions.length === 0 && !isGeneratingTitles && showTitleSelector) {
      setIsGeneratingTitles(true);
      console.log('[BlogTemplateCreator] Generating titles for keyword:', keywordData.keyword);
      generateTitleOptions(
        keywordData,
        selectedH2Sections,
        {
          apiKey,
          model: selectedModel,
          temperature,
          maxTokens: 2000,
          topP,
          entity: entity || undefined,
        }
      )
        .then((titles) => {
          console.log('[BlogTemplateCreator] Generated title options:', titles);
          setTitleOptions(titles);
          setIsGeneratingTitles(false);
        })
        .catch((error) => {
          console.error("Error generating titles:", error);
          toast.error("Failed to generate title options");
          setIsGeneratingTitles(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordData?.keyword, selectedH2Sections.length, showTitleSelector]);

  // Timer effect for blueprint generation
  useEffect(() => {
    if (isGeneratingBlueprint) {
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
  }, [isGeneratingBlueprint]);

  // Generate checklist (called from title selection or retry)
  const generateChecklist = useCallback(async (title: string, userPrompt?: string) => {
    if (!keywordData) {
      toast.error("Keyword data is required");
      return;
    }

    setIsGeneratingChecklist(true);
    setLastUserPrompt(userPrompt);

    try {
      const generatedChecklist = await generateChecklistFromSelections(
        selectedKeywords,
        selectedH2Sections,
        title,
        keywordData,
        {
          apiKey,
          model: selectedModel,
          temperature,
          maxTokens,
          topP,
          userPrompt: userPrompt?.trim() || undefined,
          entity: entity || undefined,
          serpData: serpData, // Pass SERP data for context
          selectedPeopleAlsoAsk: selectedPeopleAlsoAsk, // Pass selected PAA questions
          selectedResearchLinks: selectedResearchLinks, // Pass selected research links
          connectedSite: connectedSite || undefined,
        }
      );

      if (generatedChecklist.length === 0) {
        toast.error("Failed to generate checklist");
        setIsGeneratingChecklist(false);
        return;
      }

      setChecklist(generatedChecklist);
      setIsGeneratingChecklist(false);
      setShowChecklistReview(true);
      toast.success("Checklist generated! Please review and approve to continue.");
    } catch (error) {
      console.error("Error generating checklist:", error);
      toast.error(
        `Failed to generate checklist: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsGeneratingChecklist(false);
    }
  }, [
    keywordData,
    selectedKeywords,
    selectedH2Sections,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    connectedSite,
  ]);

  // Handle refresh titles
  const handleRefreshTitles = useCallback(async () => {
    if (!keywordData || !keywordData.keyword || !keywordData.keyword.trim() || selectedH2Sections.length === 0) {
      toast.error("Keyword data and H2 sections are required to generate titles");
      return;
    }

    setIsGeneratingTitles(true);
    setTitleOptions([]); // Clear existing titles while generating
    
    try {
      const titles = await generateTitleOptions(
        keywordData,
        selectedH2Sections,
        {
          apiKey,
          model: selectedModel,
          temperature,
          maxTokens: 2000,
          topP,
          entity: entity || undefined,
        }
      );
      setTitleOptions(titles);
      toast.success(`Generated ${titles.length} new title options`);
    } catch (error) {
      console.error("Error refreshing titles:", error);
      toast.error("Failed to refresh title options");
    } finally {
      setIsGeneratingTitles(false);
    }
  }, [keywordData, selectedH2Sections, apiKey, selectedModel, temperature, topP, entity]);

  // Handle title selection - generate checklist for review
  const handleTitleSelect = useCallback(async (title: string, userPrompt?: string) => {
    setSelectedTitle(title);
    setShowTitleSelector(false);
    await generateChecklist(title, userPrompt);
  }, [generateChecklist]);

  // Handle retry checklist generation - opens dialog for prompt modification
  const handleRetryChecklist = useCallback(() => {
    setRetryPromptModifier(lastUserPrompt || "");
    setShowRetryDialog(true);
  }, [lastUserPrompt]);

  // Handle retry with modified prompt
  const handleRetryWithModifier = useCallback(async () => {
    if (!selectedTitle) return;
    setShowRetryDialog(false);
    const modifiedPrompt = retryPromptModifier.trim() || undefined;
    await generateChecklist(selectedTitle, modifiedPrompt);
  }, [selectedTitle, retryPromptModifier, generateChecklist]);

  // Handle approve checklist and proceed to blueprint generation
  const handleApproveChecklist = useCallback(async () => {
    if (!selectedTitle || !keywordData || checklist.length === 0) {
      toast.error("Missing required data to generate blueprint");
      return;
    }

    setShowChecklistReview(false);
    setIsGeneratingBlueprint(true);
    setElapsedTime(0);

    try {
      const context: BlogTemplateContext = {
        flowTitle: selectedTitle,
        flowPurpose: flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
        keywordData,
        userPrompt: lastUserPrompt?.trim() || undefined,
      };

      const result = await generateBlueprintFromTemplate(checklist, context, {
        apiKey,
        model: selectedModel,
        temperature,
        maxTokens,
        topP,
        connectedSite: connectedSite || undefined,
      });

      if (result.agents.length === 0) {
        toast.error("No agents generated from template");
        setIsGeneratingBlueprint(false);
        return;
      }

      setSuggestedAgents(result.agents);
      setGeneratedPurpose(result.purpose);
      setBlueprintGenerated(true);
      setIsGeneratingBlueprint(false);
      setElapsedTime(0);
      toast.success(`Generated ${result.agents.length} agents!`);
    } catch (error) {
      console.error("Error generating blueprint:", error);
      toast.error(
        `Failed to generate blueprint: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsGeneratingBlueprint(false);
    }
  }, [
    selectedTitle,
    keywordData,
    checklist,
    flowPurpose,
    lastUserPrompt,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    connectedSite,
  ]);


  const handleAcceptAgent = useCallback((agent: AgentConfig) => {
    // Individual accept is handled by AgentSuggestionReview
  }, []);

  const handleRejectAgent = useCallback((agentId: string) => {
    setSuggestedAgents((prev) => prev.filter((a) => a.id !== agentId));
  }, []);

  const handleAcceptAll = useCallback(
    (agents: AgentConfig[]) => {
      onAgentsAccepted(agents, selectedTitle || undefined, generatedPurpose);
      toast.success(`Added ${agents.length} agents to blueprint!`);
      // Reset state
      setChecklist([]);
      setBlueprintGenerated(false);
      setSuggestedAgents([]);
      setSelectedTitle(null);
      setGeneratedPurpose(undefined);
      setShowTitleSelector(true);
    },
    [onAgentsAccepted, selectedTitle, generatedPurpose]
  );

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      // Reset everything
      setChecklist([]);
      setBlueprintGenerated(false);
      setSuggestedAgents([]);
      setSelectedTitle(null);
      setShowTitleSelector(true);
      setShowChecklistReview(false);
      setLastUserPrompt(undefined);
    }
  }, [onCancel]);

  // Show agent review if blueprint is generated
  if (blueprintGenerated && suggestedAgents.length > 0) {
    return (
      <Card className="p-6">
        <AgentSuggestionReview
          suggestedAgents={suggestedAgents}
          onAccept={handleAcceptAgent}
          onReject={handleRejectAgent}
          onAcceptAll={handleAcceptAll}
          onCancel={handleCancel}
        />
      </Card>
    );
  }

  // Show checklist review UI
  if (showChecklistReview && checklist.length > 0) {
    return (
      <>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Review Checklist</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleRetryChecklist}
                  disabled={isGeneratingChecklist}
                >
                  {isGeneratingChecklist ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    "Retry Checklist"
                  )}
                </Button>
                <Button
                  onClick={handleApproveChecklist}
                  disabled={isGeneratingChecklist}
                >
                  Approve & Generate Blueprint
                </Button>
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Generated Checklist ({checklist.length} items):
              </p>
              <ol className="list-decimal list-inside space-y-2">
                {checklist.map((item, index) => (
                  <li key={index} className="text-sm">
                    {item}
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Review the checklist above. Click "Retry Checklist" to regenerate, or "Approve & Generate Blueprint" to proceed.
            </p>
          </div>
        </Card>

        {/* Retry Prompt Modifier Dialog */}
        <Dialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Modify Checklist Generation Prompt</DialogTitle>
              <DialogDescription>
                Add or modify instructions for regenerating the checklist. Leave empty to use default generation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="prompt-modifier">Prompt Instructions (Optional)</Label>
                <Textarea
                  id="prompt-modifier"
                  placeholder="e.g., Focus more on local SEO, add more internal linking, emphasize mobile optimization..."
                  value={retryPromptModifier}
                  onChange={(e) => setRetryPromptModifier(e.target.value)}
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Your instructions will be added to the checklist generation prompt to guide the AI.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRetryDialog(false);
                  setRetryPromptModifier("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRetryWithModifier}
                disabled={isGeneratingChecklist}
              >
                {isGeneratingChecklist ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  "Retry with Modifications"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Show loading state for checklist/blueprint generation
  if (isGeneratingChecklist || isGeneratingBlueprint) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">
              {isGeneratingChecklist ? "Generating Checklist..." : "Generating Blueprint..."}
            </p>
            {isGeneratingBlueprint && (
              <p className="text-sm text-muted-foreground mt-1">
                {elapsedTime > 0 && `Time: ${Math.floor(elapsedTime / 60)}:${String(elapsedTime % 60).padStart(2, "0")}`}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Show title selector
  if (showTitleSelector) {
    return (
      <Card className="p-6">
        {/* Connected Site Indicator */}
        {connectedSite && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-primary">Target Site:</span>
                  <span className="text-xs font-medium truncate">{connectedSite.name}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mb-1.5" title={connectedSite.siteUrl}>
                  {connectedSite.siteUrl}
                </div>
                <div className="flex items-start gap-1.5">
                  <Info className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Used as knowledge source for generating relevant blog topics (not used as entity)
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <TitleSelector
          titleOptions={titleOptions}
          isLoading={isGeneratingTitles}
          onTitleSelect={handleTitleSelect}
          onCancel={onCancel}
          onRefreshTitles={handleRefreshTitles}
        />
      </Card>
    );
  }

  return null;
};

