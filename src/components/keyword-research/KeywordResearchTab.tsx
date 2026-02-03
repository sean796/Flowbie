import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { PeopleAlsoAsk } from "@/lib/keyword-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Search,
  Sparkles,
  Loader2,
  AlertCircle,
  X,
  Globe,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useKeywordResearch } from "@/hooks/use-keyword-research";
import type { KeywordData, KeywordResearchResult, PeopleAlsoAsk, KeywordAIAnalysis } from "@/lib/keyword-types";
import { stopServer } from "@/lib/server-manager";
import { BlogTemplateCreator } from "../BlogTemplateCreator";
import type { AgentConfig } from "../AgentNode";
import { computeLocationString } from "@/lib/keyword-location-utils";
import { LocationSelector } from "./LocationSelector";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { KeywordInput } from "./KeywordInput";
import { fetchWikipediaContent, generateWikipediaCSV, type WikipediaFetchOptions } from "@/lib/wikipedia-api";
import { loadApiKey } from "@/lib/api";
import { createTempKbFile, updateKbFile } from "@/lib/kb-file-utils";
import { sanitizeFileName } from "@/lib/file-processing";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import { KeywordMetricsDisplay } from "./KeywordMetricsDisplay";
import { SemanticKeywordsList } from "./SemanticKeywordsList";
import { RawApiDataViewer } from "./RawApiDataViewer";
import { AIAnalysisTabs } from "./AIAnalysisTabs";
import { useKeywordResearchHandlers } from "@/hooks/use-keyword-research-handlers";
import type { BlueprintData } from "@/hooks/use-blueprint-management";
import { generateChecklistFromSelections, generateBlueprintFromTemplate, type BlogTemplateContext } from "@/lib/blog-template-builder";
import { BulkAutoGeneratePanel } from "./BulkAutoGeneratePanel";
import { getStoredSites } from "@/components/IntegrationsTab";

interface KeywordResearchTabProps {
  flowTitle?: string;
  flowPurpose?: string;
  currentKeywords?: KeywordResearchResult | null;
  onKeywordsUpdate: (keywords: KeywordResearchResult) => void;
  apiKey?: string; // DataForSEO API key
  openRouterApiKey?: string; // OpenRouter API key for AI analysis
  generateCurrentBlueprintData?: () => BlueprintData;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  onAgentsAccepted?: (agents: AgentConfig[], title?: string, purpose?: string) => void;
  onAddFile?: (file: import("@/components/KnowledgeBaseTab").StoredFile) => void;
}

export const KeywordResearchTab: React.FC<KeywordResearchTabProps> = ({
  flowTitle,
  flowPurpose,
  currentKeywords,
  onKeywordsUpdate,
  apiKey, // DataForSEO key
  openRouterApiKey, // OpenRouter key for AI
  generateCurrentBlueprintData,
  selectedModel = getResearchModel(),
  temperature = 1.57,
  maxTokens = 5000000,
  topP = 0.90,
  onAgentsAccepted,
  onAddFile,
}) => {
  const [primaryKeyword, setPrimaryKeyword] = useState(
    currentKeywords?.primaryKeyword || ""
  );
  const [country, setCountry] = useState<"United States" | "Canada">("United States");
  const [stateProvince, setStateProvince] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [entity, setEntity] = useState<string>("");
  const language = "en"; // Always English

  // Auto-generate mode state
  const [autoGenerateMode, setAutoGenerateMode] = useState<boolean>(false);
  const [bulkMode, setBulkMode] = useState<boolean>(false);
  const [autoGenerateTitle, setAutoGenerateTitle] = useState<string>("");
  const [autoGenerateModifier, setAutoGenerateModifier] = useState<string>("");
  const [isAutoGenerating, setIsAutoGenerating] = useState<boolean>(false);
  const [autoGenerateStep, setAutoGenerateStep] = useState<'idle' | 'research' | 'analyzing' | 'generating' | 'complete'>('idle');
  const autoGenerateStepRef = useRef<'idle' | 'research' | 'analyzing' | 'generating' | 'complete'>('idle');
  const isProcessingAutoGenerateRef = useRef<boolean>(false);
  const [generatedBlueprint, setGeneratedBlueprint] = useState<{
    agents: AgentConfig[];
    title?: string;
    purpose?: string;
  } | null>(null);
  const [generatedChecklist, setGeneratedChecklist] = useState<string[]>([]);

  // Compute location string for API calls
  const location = useMemo(() => {
    return computeLocationString(city, stateProvince, country);
  }, [city, stateProvince, country]);

  const [showAIAnalysis, setShowAIAnalysis] = useState(true);
  const [showBlogTemplateCreator, setShowBlogTemplateCreator] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [selectedH2Sections, setSelectedH2Sections] = useState<Set<string>>(new Set());
  const [selectedContentGaps, setSelectedContentGaps] = useState<Set<string>>(new Set());
  const [selectedPeopleAlsoAsk, setSelectedPeopleAlsoAsk] = useState<Set<string>>(new Set());
  const [selectedResearchLinks, setSelectedResearchLinks] = useState<Set<string>>(new Set());
  const [isAnalyzingKeyword, setIsAnalyzingKeyword] = useState(false);
  const [minVolumeFilter, setMinVolumeFilter] = useState<number>(10);
  const [keywordsWithVolumeData, setKeywordsWithVolumeData] = useState<Map<string, KeywordData>>(new Map());
  const [blueprintAnalysisResult, setBlueprintAnalysisResult] = useState<{
    primaryKeyword: string;
    keywordData: KeywordData[];
    reasoning: string;
  } | null>(null);

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

  const {
    isAnalyzing,
    isLoadingSuggestions,
    isAnalyzingWithAI,
    currentResult,
    rawApiData,
    aiAnalysis,
    error,
    analyzeKeyword,
    regenerateKeywords,
    clearResults,
    keywordsVolumeData,
    paaRawResponse,
    paaExtractionLog,
    paaAiRawResponse,
  } = useKeywordResearch({
    apiKey,
    openRouterApiKey,
    flowTitle,
    flowPurpose,
    onKeywordsUpdate,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    entity: entity || undefined,
    connectedSite: connectedSite || undefined,
  });

  // Sync with currentKeywords prop
  useEffect(() => {
    if (currentKeywords) {
      setPrimaryKeyword(currentKeywords.primaryKeyword);
      if (currentKeywords.entity) {
        setEntity(currentKeywords.entity);
      }
    }
  }, [currentKeywords]);

  // Sync keywordsWithVolumeData from hook
  useEffect(() => {
    if (keywordsVolumeData) {
      setKeywordsWithVolumeData(keywordsVolumeData);
    }
  }, [keywordsVolumeData]);

  // Auto-stop server on component mount to allow file operations (like zipping)
  useEffect(() => {
    const stopServerOnMount = async () => {
      try {
        const result = await stopServer();
        if (result.success) {
          console.log('[Keyword Research] Server stopped on mount:', result.message);
        } else {
          console.log('[Keyword Research] Server stop result:', result.message);
        }
      } catch (error) {
        console.error('[Keyword Research] Error stopping server on mount:', error);
      }
    };
    stopServerOnMount();
  }, []);

  const {
    handleAnalyze,
    handleClear,
    handleClearAllCache,
    handleAnalyzeKeyword,
  } = useKeywordResearchHandlers({
    primaryKeyword,
    location,
    language,
    forceRefresh,
    setBlueprintAnalysisResult,
    setIsAnalyzingKeyword,
    analyzeKeyword,
    clearResults,
  });

  // Only show results if they match the current keyword being searched
  // Prioritize currentResult (from actual search), only use currentKeywords if it matches the searched keyword
  let result = currentResult;
  if (!result && currentKeywords && currentKeywords.primaryKeyword === primaryKeyword.trim()) {
    result = currentKeywords;
  }
  
  const keywordData = result?.keywordData;
  
  // Ensure keywordData uses the actual searched keyword, not stale data
  // Only use keywordData if result matches the searched keyword
  const validKeywordData = (result && result.primaryKeyword === primaryKeyword.trim() && keywordData) 
    ? { ...keywordData, keyword: primaryKeyword.trim() } 
    : (keywordData ? { ...keywordData, keyword: primaryKeyword.trim() } : null);

  // Keyword selection handlers
  const handleKeywordToggle = useCallback((keyword: string) => {
    setSelectedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  }, []);

  const handleSelectAllKeywords = useCallback((keywords: string[]) => {
    setSelectedKeywords(prev => {
      const next = new Set(prev);
      keywords.forEach(kw => next.add(kw));
      return next;
    });
  }, []);

  const handleDeselectAllKeywords = useCallback((keywords: string[]) => {
    setSelectedKeywords(prev => {
      const next = new Set(prev);
      keywords.forEach(kw => next.delete(kw));
      return next;
    });
  }, []);

  const handleH2Toggle = useCallback((heading: string) => {
    setSelectedH2Sections(prev => {
      const next = new Set(prev);
      if (next.has(heading)) {
        next.delete(heading);
      } else {
        next.add(heading);
      }
      return next;
    });
  }, []);

  const handleGapToggle = useCallback((topic: string) => {
    setSelectedContentGaps(prev => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  }, []);

  const handleResearchLinkToggle = useCallback((url: string) => {
    setSelectedResearchLinks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(url)) {
        newSet.delete(url);
      } else {
        newSet.add(url);
      }
      return newSet;
    });
  }, []);

  const handlePaaToggle = useCallback((question: string) => {
    setSelectedPeopleAlsoAsk(prev => {
      const next = new Set(prev);
      if (next.has(question)) {
        next.delete(question);
      } else {
        next.add(question);
      }
      return next;
    });
  }, []);

  const handlePaaQuestionsUpdate = useCallback((questions: PeopleAlsoAsk[]) => {
    // The component handles displaying the extracted questions internally
    // This callback can be used for future updates to persist the questions
    console.log('[KeywordResearchTab] PAA questions extracted:', questions.length);
  }, []);

  // Auto-selection helper functions
  const autoSelectKeywords = useCallback((aiAnalysis: KeywordAIAnalysis | null, keywordsWithVolumeData: Map<string, KeywordData>): string[] => {
    if (!aiAnalysis) return [];
    
    const selected: string[] = [];
    const allKeywords: Array<{ keyword: string; volume: number }> = [];
    
    // Collect all keywords with volume data
    [...(aiAnalysis.keywordSuggestions?.variations || []), ...(aiAnalysis.keywordSuggestions?.longTail || []), ...(aiAnalysis.keywordSuggestions?.semantic || [])].forEach(kw => {
      const data = keywordsWithVolumeData.get(kw.toLowerCase());
      allKeywords.push({
        keyword: kw,
        volume: data?.searchVolume || 0,
      });
    });
    
    // Sort by volume (descending) and take top 15
    allKeywords.sort((a, b) => b.volume - a.volume);
    return allKeywords.slice(0, 15).map(kw => kw.keyword);
  }, []);

  const autoSelectH2Sections = useCallback((aiAnalysis: KeywordAIAnalysis | null): string[] => {
    if (!aiAnalysis || !aiAnalysis.h2Suggestions) return [];
    // Select all H2 suggestions
    return aiAnalysis.h2Suggestions.map(h2 => h2.heading);
  }, []);

  const autoSelectContentGaps = useCallback((aiAnalysis: KeywordAIAnalysis | null): string[] => {
    if (!aiAnalysis || !aiAnalysis.contentGaps) return [];
    // Select top 7 content gaps, prioritizing high opportunity
    const sorted = [...aiAnalysis.contentGaps].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.opportunity] - priorityOrder[a.opportunity];
    });
    return sorted.slice(0, 7).map(gap => gap.topic);
  }, []);

  const autoSelectPeopleAlsoAsk = useCallback((aiAnalysis: KeywordAIAnalysis | null): string[] => {
    if (!aiAnalysis || !aiAnalysis.peopleAlsoAsk) return [];
    // Select top 7 PAA questions
    return aiAnalysis.peopleAlsoAsk.slice(0, 7).map(paa => paa.question);
  }, []);

  const autoSelectResearchLinks = useCallback((aiAnalysis: KeywordAIAnalysis | null): string[] => {
    if (!aiAnalysis || !aiAnalysis.researchLinks) return [];
    // Select top 7 research links
    return aiAnalysis.researchLinks.slice(0, 7).map(link => link.url);
  }, []);

  // Auto-generate handler - starts the process
  const handleAutoGenerate = useCallback(async () => {
    // Validate inputs
    if (!primaryKeyword.trim()) {
      toast.error("Please enter a keyword");
      return;
    }
    if (!entity.trim()) {
      toast.error("Please enter an entity");
      return;
    }
    if (!autoGenerateTitle.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!openRouterApiKey || !openRouterApiKey.trim()) {
      toast.error("OpenRouter API key is required for auto-generation");
      return;
    }
    if (!apiKey || !apiKey.trim()) {
      toast.error("DataForSEO API key is required for keyword research");
      return;
    }

    console.log('[Auto-Generate] Starting auto-generation pipeline');
    setIsAutoGenerating(true);
    setAutoGenerateStep('research');
    autoGenerateStepRef.current = 'research';
    isProcessingAutoGenerateRef.current = false;

    let tempFileName: string | null = null;

    try {
      // Step 0: Fetch Wikipedia content for entity (REQUIRED - NON OPTIONAL)
      if (!onAddFile) {
        throw new Error("Knowledge base file upload not available. Wikipedia content cannot be saved.");
      }

      toast.info("Fetching Wikipedia content for entity (required step)...");
      console.log('[Auto-Generate] Step 0: Fetching Wikipedia content for entity:', entity.trim());
      
      const entityName = entity.trim();
      
      // Load OpenRouter API key for AI summarization
      const openRouterApiKeyForSummary = openRouterApiKey || loadApiKey();
      const useAISummarization = !!openRouterApiKeyForSummary && openRouterApiKeyForSummary.trim().length > 0;
      
      // Create temp file immediately to show progress
      if (useAISummarization) {
        toast.info("AI analyzing Wikipedia content to save tokens...");
        tempFileName = createTempKbFile(entityName, "AI summarization in progress. Analyzing content and preserving URLs...");
      }
      
      // Prepare fetch options with AI summarization
      const fetchOptions: WikipediaFetchOptions | undefined = useAISummarization ? {
        summarizeWithAI: true,
        openRouterApiKey: openRouterApiKeyForSummary,
        onSummarizeProgress: (message) => {
          console.log(`[Auto-Generate] AI Progress: ${message}`);
          // Update temp file with progress
          if (tempFileName) {
            const progressContent = `title,url,content
"${entityName}","","[AI SUMMARIZATION IN PROGRESS] ${message}\n\nAnalyzing and summarizing content while preserving all URLs. This file will be updated automatically when complete."`;
            updateKbFile(tempFileName, progressContent);
          }
        },
      } : undefined;
      
      const chunks = await fetchWikipediaContent(entityName, fetchOptions);
      console.log('[Auto-Generate] Received', chunks.length, 'Wikipedia chunks');
      
      if (chunks.length === 0) {
        // Remove temp file if it exists
        if (tempFileName) {
          try {
            const storedFilesString = localStorage.getItem('kb_files') || '[]';
            const files = JSON.parse(storedFilesString) as StoredFile[];
            const updatedFiles = files.filter(f => f.name !== tempFileName);
            localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
            window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
          } catch (e) {
            console.error('Error removing temp file:', e);
          }
        }
        throw new Error("No Wikipedia content found for entity. Please verify the entity name exists on Wikipedia.");
      }

      // Generate CSV
      const csvContent = generateWikipediaCSV(chunks);
      console.log('[Auto-Generate] Generated Wikipedia CSV, length:', csvContent.length, 'bytes');

      // Update temp file with final content if it exists, otherwise create new file
      if (tempFileName) {
        updateKbFile(tempFileName, csvContent, csvContent.length);
        console.log('[Auto-Generate] Wikipedia file updated successfully');
        toast.success(`Wikipedia content saved to Knowledge Base (${chunks.length} chunks, AI summarized, ${Math.round(csvContent.length / 1024)}KB)`);
      } else {
        // Create new file if no temp file was created
        const sanitizedEntity = sanitizeFileName(entityName);
        const timestamp = Date.now();
        const fileName = `wikipedia-${sanitizedEntity}-${timestamp}.csv`;
        
        const file: StoredFile = {
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        };

        console.log('[Auto-Generate] Adding Wikipedia file to knowledge base...');
        onAddFile(file);
        console.log('[Auto-Generate] Wikipedia file added successfully');
        toast.success(`Wikipedia content saved to Knowledge Base (${chunks.length} chunks)`);
      }

      // Step 1: Run keyword research
      toast.info("Running keyword research...");
      console.log('[Auto-Generate] Step 1: Running keyword research for:', primaryKeyword.trim());
      await analyzeKeyword(primaryKeyword.trim(), {
        location: "United States",
        language: "en",
      });
      
      console.log('[Auto-Generate] Keyword research initiated, waiting for analysis to complete...');
      setAutoGenerateStep('analyzing');
      autoGenerateStepRef.current = 'analyzing';
      
      // Set a timeout to detect if we're stuck
      setTimeout(() => {
        if (autoGenerateStepRef.current === 'analyzing' && isAutoGenerating) {
          console.warn('[Auto-Generate] Analysis taking longer than expected. Current state:', {
            isAnalyzingWithAI,
            hasCurrentResult: !!currentResult,
            hasAiAnalysis: !!aiAnalysis,
            currentKeyword: currentResult?.primaryKeyword,
            expectedKeyword: primaryKeyword.trim(),
          });
        }
      }, 60000); // 60 second timeout warning
    } catch (error) {
      // Remove temp file on error
      if (tempFileName) {
        try {
          const storedFilesString = localStorage.getItem('kb_files') || '[]';
          const files = JSON.parse(storedFilesString) as StoredFile[];
          const updatedFiles = files.filter(f => f.name !== tempFileName);
          localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
          window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
        } catch (e) {
          console.error('[Auto-Generate] Error removing temp file:', e);
        }
      }
      
      console.error("[Auto-Generate] Error starting keyword research:", error);
      toast.error(`Failed to start keyword research: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsAutoGenerating(false);
      setAutoGenerateStep('idle');
      autoGenerateStepRef.current = 'idle';
      isProcessingAutoGenerateRef.current = false;
    }
  }, [
    primaryKeyword,
    entity,
    autoGenerateTitle,
    openRouterApiKey,
    apiKey,
    analyzeKeyword,
    isAutoGenerating,
    isAnalyzingWithAI,
    currentResult,
    aiAnalysis,
    onAddFile,
  ]);

  // Effect to continue auto-generation pipeline when analysis completes
  useEffect(() => {
    const shouldContinue = (
      autoGenerateStepRef.current === 'analyzing' && 
      !isAnalyzingWithAI && 
      currentResult && 
      aiAnalysis && 
      isAutoGenerating &&
      !isProcessingAutoGenerateRef.current &&
      currentResult.primaryKeyword?.toLowerCase().trim() === primaryKeyword.toLowerCase().trim()
    );

    console.log('[Auto-Generate] useEffect check:', {
      step: autoGenerateStepRef.current,
      isAnalyzingWithAI,
      hasCurrentResult: !!currentResult,
      hasAiAnalysis: !!aiAnalysis,
      isAutoGenerating,
      isProcessing: isProcessingAutoGenerateRef.current,
      keywordMatch: currentResult?.primaryKeyword?.toLowerCase().trim() === primaryKeyword.toLowerCase().trim(),
      shouldContinue,
    });

    if (shouldContinue) {
      // Analysis is complete, continue with blueprint generation
      console.log('[Auto-Generate] Analysis complete, continuing with blueprint generation');
      isProcessingAutoGenerateRef.current = true;
      const continueAutoGenerate = async () => {
        try {
          setAutoGenerateStep('generating');
          autoGenerateStepRef.current = 'generating';

          // Step 2: Auto-select items
          toast.info("Auto-selecting keywords and content...");
          console.log('[Auto-Generate] Step 2: Auto-selecting items');
          const selectedKeywords = autoSelectKeywords(aiAnalysis, keywordsWithVolumeData);
          const selectedH2Sections = autoSelectH2Sections(aiAnalysis);
          const selectedContentGaps = autoSelectContentGaps(aiAnalysis);
          const selectedPeopleAlsoAsk = autoSelectPeopleAlsoAsk(aiAnalysis);
          const selectedResearchLinks = autoSelectResearchLinks(aiAnalysis);
          
          console.log('[Auto-Generate] Auto-selected:', {
            keywords: selectedKeywords.length,
            h2Sections: selectedH2Sections.length,
            contentGaps: selectedContentGaps.length,
            paa: selectedPeopleAlsoAsk.length,
            researchLinks: selectedResearchLinks.length,
          });

          // Step 3: Generate checklist
          toast.info("Generating blog checklist...");
          console.log('[Auto-Generate] Step 3: Generating checklist');
          if (!currentResult.keywordData) {
            throw new Error("Keyword data is missing");
          }

          const checklist = await generateChecklistFromSelections(
            selectedKeywords,
            selectedH2Sections,
            autoGenerateTitle.trim(),
            currentResult.keywordData,
            {
              apiKey: openRouterApiKey!,
              model: selectedModel,
              temperature,
              maxTokens,
              topP,
              userPrompt: autoGenerateModifier.trim() || undefined,
              entity: entity.trim() || undefined,
              serpData: paaRawResponse,
              selectedPeopleAlsoAsk,
              selectedResearchLinks,
              connectedSite: connectedSite || undefined,
            }
          );

          if (checklist.length === 0) {
            throw new Error("Failed to generate checklist");
          }

          console.log('[Auto-Generate] Checklist generated:', checklist.length, 'items');
          setGeneratedChecklist(checklist);

          // Step 4: Generate blueprint
          toast.info("Generating blog blueprint...");
          console.log('[Auto-Generate] Step 4: Generating blueprint');
          const context: BlogTemplateContext = {
            flowTitle: autoGenerateTitle.trim(),
            flowPurpose: flowPurpose || `Comprehensive guide about ${currentResult.keywordData.keyword}`,
            keywordData: currentResult.keywordData,
            userPrompt: autoGenerateModifier.trim() || undefined,
          };

          const blueprintResult = await generateBlueprintFromTemplate(checklist, context, {
            apiKey: openRouterApiKey!,
            model: selectedModel,
            temperature,
            maxTokens,
            topP,
            connectedSite: connectedSite || undefined,
          });

          if (blueprintResult.agents.length === 0) {
            throw new Error("No agents generated from template");
          }

          console.log('[Auto-Generate] Blueprint generated:', blueprintResult.agents.length, 'agents');
          
          // Store the generated blueprint for preview (don't auto-accept - let user review first)
          setGeneratedBlueprint({
            agents: blueprintResult.agents,
            title: blueprintResult.title || autoGenerateTitle.trim(),
            purpose: blueprintResult.purpose,
          });

          setAutoGenerateStep('complete');
          autoGenerateStepRef.current = 'complete';
          setIsAutoGenerating(false);
          isProcessingAutoGenerateRef.current = false;
          
          toast.success(`Generated ${blueprintResult.agents.length} agents! Review below and click "Add to Blueprint" to add them.`);
        } catch (error) {
          console.error("Error in auto-generate pipeline:", error);
          toast.error(`Auto-generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          setIsAutoGenerating(false);
          setAutoGenerateStep('idle');
          autoGenerateStepRef.current = 'idle';
          isProcessingAutoGenerateRef.current = false;
        }
      };

      continueAutoGenerate();
    }
  }, [
    isAnalyzingWithAI,
    currentResult,
    aiAnalysis,
    isAutoGenerating,
    primaryKeyword,
    keywordsWithVolumeData,
    paaRawResponse,
    autoGenerateTitle,
    autoGenerateModifier,
    entity,
    flowPurpose,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    onAgentsAccepted,
    autoSelectKeywords,
    autoSelectH2Sections,
    autoSelectContentGaps,
    autoSelectPeopleAlsoAsk,
    autoSelectResearchLinks,
  ]);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Keyword Research</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-generate-mode" className="text-sm text-muted-foreground cursor-pointer">
                Auto-Generate
              </Label>
              <Switch
                id="auto-generate-mode"
                checked={autoGenerateMode}
                onCheckedChange={(checked) => {
                  setAutoGenerateMode(checked);
                  if (checked) setBulkMode(false);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="bulk-mode" className="text-sm text-muted-foreground cursor-pointer">
                Bulk Mode
              </Label>
              <Switch
                id="bulk-mode"
                checked={bulkMode}
                onCheckedChange={(checked) => {
                  setBulkMode(checked);
                  if (checked) setAutoGenerateMode(false);
                }}
              />
            </div>
            {!autoGenerateMode && !bulkMode && (
              <Button 
                onClick={handleAnalyzeKeyword} 
                disabled={isAnalyzingKeyword || !primaryKeyword.trim()}
                className="bg-primary hover:bg-primary/90 text-black"
              >
                {isAnalyzingKeyword ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing Keyword...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Analyze Keyword
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {bulkMode 
            ? "Upload a CSV file to bulk generate multiple blog blueprints."
            : autoGenerateMode 
            ? "Enter your keyword, entity, and title to automatically generate a complete blog blueprint."
            : "Analyze keyword difficulty, get semantic suggestions, and identify content opportunities."}
        </p>
      </div>

      {/* Bulk Auto-Generate Mode UI */}
      {bulkMode && (
        <BulkAutoGeneratePanel
          key="bulk-auto-generate-panel"
          apiKey={apiKey}
          openRouterApiKey={openRouterApiKey}
          selectedModel={selectedModel}
          temperature={temperature}
          maxTokens={maxTokens}
          topP={topP}
          flowPurpose={flowPurpose}
        />
      )}

      {/* Auto-Generate Mode UI */}
      {autoGenerateMode && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auto-keyword">Keyword *</Label>
              <Input
                id="auto-keyword"
                value={primaryKeyword}
                onChange={(e) => setPrimaryKeyword(e.target.value)}
                placeholder="Enter primary keyword"
                disabled={isAutoGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-entity">Entity *</Label>
              <Input
                id="auto-entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="Enter entity (e.g., business name, brand)"
                disabled={isAutoGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-title">Title *</Label>
              <Input
                id="auto-title"
                value={autoGenerateTitle}
                onChange={(e) => setAutoGenerateTitle(e.target.value)}
                placeholder="Enter blog title"
                disabled={isAutoGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-modifier">Optional Modifier</Label>
              <Textarea
                id="auto-modifier"
                value={autoGenerateModifier}
                onChange={(e) => setAutoGenerateModifier(e.target.value)}
                placeholder="Optional: Add specific instructions or requirements for the blog content"
                rows={4}
                disabled={isAutoGenerating}
                className="resize-none"
              />
            </div>

            {/* Connected Site Indicator for Auto-Generate Mode */}
            {connectedSite && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
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

            <Button
              onClick={handleAutoGenerate}
              disabled={
                isAutoGenerating ||
                !primaryKeyword.trim() ||
                !entity.trim() ||
                !autoGenerateTitle.trim() ||
                !openRouterApiKey ||
                !apiKey
              }
              className="w-full bg-primary hover:bg-primary/90 text-black text-lg h-12 glow-border"
              size="lg"
            >
              {isAutoGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Generating Blog Blueprint...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Generate Blog Blueprint
                </>
              )}
            </Button>
            {isAutoGenerating && (
              <div className="space-y-2">
                <div className="text-center text-sm text-muted-foreground">
                  This may take a minute. Please wait...
                </div>
                {autoGenerateStep !== 'idle' && (
                  <div className="text-center text-xs text-muted-foreground">
                    Status: {
                      autoGenerateStep === 'research' && 'Running keyword research...'
                      || autoGenerateStep === 'analyzing' && 'AI analyzing keyword data...'
                      || autoGenerateStep === 'generating' && 'Generating blueprint...'
                      || 'Processing...'
                    }
                  </div>
                )}
              </div>
            )}
            {/* Show generated checklist */}
            {generatedChecklist.length > 0 && !isAutoGenerating && (
              <Card className="p-4 border-primary/20">
                <h4 className="font-semibold mb-2">Generated Checklist</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {generatedChecklist.map((item, idx) => (
                    <div key={idx} className="text-sm text-muted-foreground">
                      {idx + 1}. {item}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {/* Show generated blueprint preview */}
            {generatedBlueprint && generatedBlueprint.agents.length > 0 && (
              <Card className="p-4 border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-lg">{generatedBlueprint.title || 'Generated Blueprint'}</h4>
                    {generatedBlueprint.purpose && (
                      <p className="text-sm text-muted-foreground mt-1">{generatedBlueprint.purpose}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{generatedBlueprint.agents.length} Agents</Badge>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {generatedBlueprint.agents.map((agent, idx) => (
                      <Card key={agent.id || idx} className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-muted-foreground">#{agent.step || idx + 1}</span>
                              <h5 className="font-semibold">{agent.title}</h5>
                            </div>
                            {agent.description && (
                              <p className="text-sm text-muted-foreground mb-2">{agent.description}</p>
                            )}
                            {agent.features && agent.features.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {agent.features.map((feature, fIdx) => (
                                  <Badge key={fIdx} variant="outline" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => {
                      if (onAgentsAccepted && generatedBlueprint) {
                        onAgentsAccepted(
                          generatedBlueprint.agents,
                          generatedBlueprint.title,
                          generatedBlueprint.purpose
                        );
                        toast.success(`Added ${generatedBlueprint.agents.length} agents to blueprint!`);
                        setGeneratedBlueprint(null);
                        setGeneratedChecklist([]);
                        setAutoGenerateMode(false);
                      }
                    }}
                    className="flex-1"
                    disabled={!onAgentsAccepted}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Add to Blueprint
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGeneratedBlueprint(null);
                      setGeneratedChecklist([]);
                    }}
                  >
                    Clear Preview
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </Card>
      )}

      {/* Standard Mode UI - Only show when auto-generate mode and bulk mode are OFF */}
      {!autoGenerateMode && !bulkMode && (
        <>

      {/* AI Blueprint Analysis Results - Only show if it doesn't interfere with current search */}
      {blueprintAnalysisResult && (!result || blueprintAnalysisResult.primaryKeyword === primaryKeyword.trim()) && (
        <Card className="p-4 bg-muted/30 border-border">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">AI Blueprint Analysis Results</h3>
              <div className="flex items-center gap-2">
                <Badge variant="default">{blueprintAnalysisResult.keywordData.length} keywords</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBlueprintAnalysisResult(null)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Suggested Primary Keyword:</p>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-foreground">{blueprintAnalysisResult.primaryKeyword}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPrimaryKeyword(blueprintAnalysisResult.primaryKeyword);
                    setBlueprintAnalysisResult(null);
                    toast.info(`Using blueprint keyword: ${blueprintAnalysisResult.primaryKeyword}`);
                  }}
                >
                  Use This Keyword
                </Button>
              </div>
            </div>
            {blueprintAnalysisResult.reasoning && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">AI Reasoning:</p>
                <p className="text-sm text-foreground">{blueprintAnalysisResult.reasoning}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Top Keywords Found:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {blueprintAnalysisResult.keywordData.slice(0, 8).map((kw, idx) => (
                  <div key={idx} className="p-2 bg-card rounded border border-border/50">
                    <p className="text-xs font-medium truncate">{kw.keyword}</p>
                    <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                      <span>Vol: {kw.searchVolume?.toLocaleString() || 0}</span>
                      <span>•</span>
                      <span>Diff: {kw.difficulty || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These keywords are suggestions from your blueprint. Click "Use This Keyword" above to analyze it, or continue with your current search.
            </p>
          </div>
        </Card>
      )}

      {/* Primary Keyword Input */}
      <KeywordInput
        primaryKeyword={primaryKeyword}
        entity={entity}
        forceRefresh={forceRefresh}
        isAnalyzing={isAnalyzing}
        hasResult={!!result}
        onKeywordChange={setPrimaryKeyword}
        onEntityChange={setEntity}
        onForceRefreshChange={setForceRefresh}
        onAnalyze={handleAnalyze}
        onClear={() => {
          setPrimaryKeyword("");
          handleClear();
        }}
        onClearCache={handleClearAllCache}
        onAddFile={onAddFile}
      />

      {/* Location */}
      <LocationSelector
        country={country}
        stateProvince={stateProvince}
        city={city}
        onCountryChange={setCountry}
        onStateProvinceChange={setStateProvince}
        onCityChange={setCity}
      />

      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </Card>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-pulse text-primary" />
              <span className="text-sm font-medium">Analyzing keyword...</span>
            </div>
            <Progress value={isLoadingSuggestions ? 50 : 100} />
          </div>
        </Card>
      )}

      {/* Raw API Data Viewer */}
      {rawApiData && (rawApiData.tasks || rawApiData.keywordOverview) && (
        <RawApiDataViewer rawApiData={rawApiData} />
      )}

      {/* Results - Show if we have data and it matches the searched keyword */}
      {result && validKeywordData && result.primaryKeyword?.toLowerCase().trim() === primaryKeyword.toLowerCase().trim() && (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="space-y-6">
            <KeywordMetricsDisplay
              keywordData={validKeywordData}
              searchIntent={result.searchIntent}
            />

            {/* Semantic Keywords */}
            {result.semanticKeywords && result.semanticKeywords.length > 0 && (
              <SemanticKeywordsList
                keywords={result.semanticKeywords}
                selectedKeywords={selectedKeywords}
                onKeywordToggle={handleKeywordToggle}
                onSelectAll={() => {
                  const allSemantic = result.semanticKeywords.map(kw => kw.keyword);
                  handleSelectAllKeywords(allSemantic);
                  toast.success(`Selected all ${allSemantic.length} semantic keywords`);
                }}
                onDeselectAll={() => {
                  const allSemantic = result.semanticKeywords.map(kw => kw.keyword);
                  handleDeselectAllKeywords(allSemantic);
                  toast.info(`Deselected all ${allSemantic.length} semantic keywords`);
                }}
                openRouterApiKey={openRouterApiKey}
              />
            )}

            {/* AI Analysis Results */}
            {aiAnalysis && (
              <div className="ai-analysis-wrapper">
                <AIAnalysisTabs
                  aiAnalysis={aiAnalysis}
                result={result}
                currentResult={currentResult}
                selectedKeywords={selectedKeywords}
                selectedH2Sections={selectedH2Sections}
                selectedContentGaps={selectedContentGaps}
                selectedPeopleAlsoAsk={selectedPeopleAlsoAsk}
                selectedResearchLinks={selectedResearchLinks}
                keywordsWithVolumeData={keywordsWithVolumeData}
                minVolumeFilter={minVolumeFilter}
                isAnalyzingWithAI={isAnalyzingWithAI}
                showAIAnalysis={showAIAnalysis}
                primaryKeyword={primaryKeyword}
                location={location}
                language={language}
                forceRefresh={forceRefresh}
                paaRawResponse={paaRawResponse}
                paaExtractionLog={paaExtractionLog}
                paaAiRawResponse={paaAiRawResponse}
                openRouterApiKey={openRouterApiKey}
                selectedModel={selectedModel}
                temperature={temperature}
                maxTokens={maxTokens}
                topP={topP}
                onShowAIAnalysisChange={setShowAIAnalysis}
                onKeywordToggle={handleKeywordToggle}
                onH2Toggle={handleH2Toggle}
                onGapToggle={handleGapToggle}
                onPaaToggle={handlePaaToggle}
                onResearchLinkToggle={handleResearchLinkToggle}
                onSelectAllKeywords={handleSelectAllKeywords}
                onSetPrimaryKeyword={setPrimaryKeyword}
                onAnalyzeKeyword={analyzeKeyword}
                onRegenerateKeywords={async (primaryKeyword: string, selectedKeywords: string[], minVolumeFilter: number, options: { location: string; language: string }) => {
                  if (regenerateKeywords) {
                    await regenerateKeywords(primaryKeyword, selectedKeywords, minVolumeFilter, options);
                  }
                }}
                onMinVolumeFilterChange={setMinVolumeFilter}
                onPaaQuestionsUpdate={handlePaaQuestionsUpdate}
                />
              </div>
            )}

            {/* Blog Template Creator */}
            {openRouterApiKey && result && aiAnalysis && (
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Generate Blog</h3>
                    {(selectedKeywords.size > 0 || selectedH2Sections.size > 0 || selectedContentGaps.size > 0 || selectedPeopleAlsoAsk.size > 0 || selectedResearchLinks.size > 0) && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedKeywords.size} keywords, {selectedH2Sections.size} H2s, {selectedContentGaps.size} gaps, {selectedPeopleAlsoAsk.size} questions, {selectedResearchLinks.size} links
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {selectedH2Sections.size === 0 && (
                    <div className="p-4 bg-muted/50 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground">
                        Select H2 sections from the AI Analysis tab to generate your blog template.
                      </p>
                    </div>
                  )}
                  <BlogTemplateCreator
                    apiKey={openRouterApiKey}
                    flowTitle={flowTitle}
                    flowPurpose={flowPurpose}
                    keywordData={validKeywordData ? {
                      ...validKeywordData,
                      keyword: primaryKeyword.trim() || validKeywordData.keyword // ALWAYS use the actual searched keyword from input
                    } : (primaryKeyword.trim() ? {
                      keyword: primaryKeyword.trim(),
                      difficulty: 0,
                      searchVolume: 0,
                      cpc: 0,
                      competition: 'LOW' as const,
                      intent: 'informational' as const,
                      relatedKeywords: [],
                      serpFeatures: [],
                    } : undefined)}
                    selectedKeywords={Array.from(selectedKeywords)}
                    selectedH2Sections={Array.from(selectedH2Sections)}
                    selectedPeopleAlsoAsk={Array.from(selectedPeopleAlsoAsk)}
                    selectedResearchLinks={Array.from(selectedResearchLinks)}
                    selectedModel={selectedModel}
                    temperature={temperature}
                    maxTokens={maxTokens}
                    topP={topP}
                    entity={entity || undefined}
                    serpData={paaRawResponse}
                    onAgentsAccepted={(agents, title, purpose) => {
                      if (onAgentsAccepted) {
                        onAgentsAccepted(agents, title, purpose);
                      } else {
                        toast.info(`${agents.length} agents generated. Use the callback to add them to your blueprint.`);
                      }
                    }}
                  />
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Empty State */}
      {!result && !isAnalyzing && (
        <Card className="p-8 text-center">
          <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Start Keyword Research</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Enter a primary keyword above to analyze difficulty, get suggestions,
            and identify opportunities.
          </p>
        </Card>
      )}
        </>
      )}
    </div>
  );
};

