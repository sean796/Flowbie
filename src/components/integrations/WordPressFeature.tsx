import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./wordpress/cyberpunk-theme";
import type { ImageType } from "@/lib/image-section-analyzer";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useGSCReports } from "@/hooks/use-gsc-reports";
import { useContentOptimization } from "@/hooks/use-content-optimization";
import { useKeywordSelection } from "@/hooks/use-keyword-selection";
import { getOptimizationSettings, saveOptimizationSettings } from "@/lib/optimization-settings-storage";
import { getOptimizationHistory, clearOptimizationHistory } from "@/lib/optimization-history-storage";
import type { OptimizationSettings } from "./wordpress/OptimizationSettingsPanel";
import { MasterOptimizationCard } from "./wordpress/MasterOptimizationCard";
import { MasterGenerateContentCard } from "./wordpress/MasterGenerateContentCard";
import { runMasterGenerateContent } from "@/hooks/content-optimization/master-generate-content-runner";
import { WordPressSiteList } from "./wordpress/WordPressSiteList";
import { WordPressDialogs } from "./wordpress/WordPressDialogs";
import { SEMTaskListDialog } from "./wordpress/SEMTaskListDialog";
import type { WordPressSite } from "./types";
import type { AgentConfig } from "@/components/AgentNode";
import type { DateRangePreset } from "@/lib/gsc-date-helpers";
import { handleLocationDetection } from "@/lib/location-detection-handler";
import { extractNAPAndLinkGraph } from "@/lib/knowledge-graph-auto-trigger";

interface WordPressFeatureProps {
  onGSCFetch?: (site: WordPressSite) => void;
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  isFetchingGSC?: string | null;
  isGeneratingEntities?: Record<string, boolean>;
  onBlueprintUpdate?: (agents: AgentConfig[], title?: string, purpose?: string) => void;
}

export const WordPressFeature: React.FC<WordPressFeatureProps> = ({
  onGSCFetch,
  onEntityGeneration,
  isFetchingGSC,
  isGeneratingEntities = {},
  onBlueprintUpdate,
}) => {
  // Site management hook
  const {
    sites,
    setSites,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isIndexingSitemap,
    isCheckingFuture,
    isLoadingCalendar,
    handleAddSite: handleAddSiteInit,
    handleEditSite: handleEditSiteInit,
    handleDeleteSite,
    handleToggleEnabled,
    handleSaveSite,
    handleTestConnection,
    handleDetectSitemaps,
    handleFetchScheduledPosts,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleCheckFuturePosts,
    handleLoadCalendarPosts,
    handleSetEntitySitemap,
    getScrapingKey,
  } = useWordPressSites();

  // GSC reports hook
  const {
    isGeneratingReport,
    dateRangePreset,
    customDateRanges,
    setCustomDateRanges,
    handleDateRangePresetChange,
    getDateRangesForSite,
    handleGenerateGSCReport,
  } = useGSCReports(onBlueprintUpdate);

  // Content optimization hook
  const {
    isOptimizingContent,
    optimizationProgress,
    optimizationFileManagers,
    pendingOptimization,
    bulkOptimizationState,
    masterOptimizationState,
    masterGenerateContentState,
    setMasterGenerateContentState,
    handleOptimizeContent,
    handleOptimizeMultipleContent,
    handleMasterOptimization,
    continueOptimizationWithKeyword,
    setOptimizationFileManagers,
    clearOptimization,
  } = useContentOptimization();

  // Keyword selection hook
  const {
    gscQueriesForSelection,
    setGscQueriesForSelection,
    isKeywordSelectionOpen,
    setIsKeywordSelectionOpen,
    gscClusterAnalysis,
    setGscClusterAnalysis,
    isAnalyzingClusters,
    setIsAnalyzingClusters,
    selectedCluster,
    setSelectedCluster,
    closeKeywordSelection,
  } = useKeywordSelection();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<WordPressSite | null>(null);
  
  // Bulk optimization modal state
  const [bulkOptimizationModalOpen, setBulkOptimizationModalOpen] = useState<Record<string, boolean>>({});
  
  // SEM task list dialog (one per client – opened from site card)
  const [semDialogSite, setSemDialogSite] = useState<WordPressSite | null>(null);

  // Master optimization modal state
  const [masterOptimizationModalOpen, setMasterOptimizationModalOpen] = useState(false);
  const [selectedSitesForMasterOptimization, setSelectedSitesForMasterOptimization] = useState<Set<string>>(new Set());
  const [isMasterOptimizationActivated, setIsMasterOptimizationActivated] = useState(false);
  const [showOptimizationConfirmDialog, setShowOptimizationConfirmDialog] = useState(false);
  
  // Master optimization options
  const [masterOptimizationOptions, setMasterOptimizationOptions] = useState<{
    optimizeTitle: boolean;
    optimizeMeta: boolean;
    optimizeExcerpt: boolean;
    optimizeContent: boolean;
    optimizeFeaturedImage: boolean;
    featuredImageType?: 'ai-generated' | 'google-maps';
    autoOptimize?: boolean;
    testMode?: boolean;
    hasEntity?: boolean;
  }>({
    optimizeTitle: true,
    optimizeMeta: false,
    optimizeExcerpt: false,
    optimizeContent: false,
    optimizeFeaturedImage: false,
    featuredImageType: 'ai-generated',
    autoOptimize: true,
    testMode: false,
  });
  const [masterUpdateMode, setMasterUpdateMode] = useState<'update' | 'draft'>('update');
  const [masterInContentImageType, setMasterInContentImageType] = useState<ImageType | ''>('');
  const [masterInContentImagePrompt, setMasterInContentImagePrompt] = useState<string>('');
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formSiteUrl, setFormSiteUrl] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formAppPassword, setFormAppPassword] = useState("");

  // Content optimization state (per site)
  const [optimizeUrl, setOptimizeUrl] = useState<Record<string, string | string[]>>({});
  const [optimizeUpdateMode, setOptimizeUpdateMode] = useState<Record<string, 'update' | 'draft'>>({});
  const [optimizationSettings, setOptimizationSettings] = useState<Record<string, OptimizationSettings>>({});
  const [optimizationHistory, setOptimizationHistory] = useState<Record<string, any[]>>({});
  const [optimizationOptions, setOptimizationOptions] = useState<Record<string, { optimizeTitle: boolean; optimizeMeta: boolean; optimizeExcerpt: boolean; optimizeContent: boolean; optimizeFeaturedImage: boolean; autoOptimize?: boolean }>>({});
  const [inContentImageTypes, setInContentImageTypes] = useState<Record<string, ImageType | ''>>({});
  const [inContentImagePrompts, setInContentImagePrompts] = useState<Record<string, string>>({});
  
  // Location detection state
  const [isDetectingLocations, setIsDetectingLocations] = useState<Record<string, boolean>>({});
  
  // NAP + Link graph extraction state
  const [isExtractingNAPAndGraph, setIsExtractingNAPAndGraph] = useState<Record<string, boolean>>({});
  
  // Expanded tiles state
  const [expandedTiles, setExpandedTiles] = useState<Set<string>>(new Set());
  
  // Site search filter state
  const [siteSearchQuery, setSiteSearchQuery] = useState<string>('');
  
  const toggleTileExpansion = useCallback((siteId: string) => {
    setExpandedTiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  }, []);
  
  // Initialize settings and history from localStorage when sites change
  useEffect(() => {
    const settings: Record<string, OptimizationSettings> = {};
    const history: Record<string, any[]> = {};
    sites.forEach(site => {
      settings[site.id] = getOptimizationSettings(site.id);
      history[site.id] = getOptimizationHistory(site.id);
    });
    setOptimizationSettings(settings);
    setOptimizationHistory(history);
  }, [sites.map(s => s.id).join(',')]);

  // Initialize selected sites for master optimization
  useEffect(() => {
    if (sites.length > 0 && selectedSitesForMasterOptimization.size === 0) {
      setSelectedSitesForMasterOptimization(new Set(sites.map(s => s.id)));
    }
  }, [sites]);

  // Filter sites based on search query
  const filteredSites = useMemo(() => {
    if (!siteSearchQuery.trim()) {
      return sites;
    }
    const query = siteSearchQuery.toLowerCase();
    return sites.filter(site => site.name.toLowerCase().includes(query));
  }, [sites, siteSearchQuery]);
  
  const handleOptimizationSettingsChange = useCallback((siteId: string, settings: OptimizationSettings) => {
    saveOptimizationSettings(siteId, settings);
    setOptimizationSettings(prev => ({ ...prev, [siteId]: settings }));
  }, []);
  
  const handleClearHistory = useCallback((siteId: string) => {
    clearOptimizationHistory(siteId);
    setOptimizationHistory(prev => ({ ...prev, [siteId]: [] }));
  }, []);

  const handleAddSite = useCallback(() => {
    const formData = handleAddSiteInit();
    setEditingSite(null);
    setFormName(formData.name);
    setFormSiteUrl(formData.siteUrl);
    setFormUsername(formData.username);
    setFormAppPassword(formData.appPassword);
    setIsDialogOpen(true);
  }, [handleAddSiteInit]);

  const handleEditSite = useCallback((site: WordPressSite) => {
    const formData = handleEditSiteInit(site);
    setEditingSite(site);
    setFormName(formData.name);
    setFormSiteUrl(formData.siteUrl);
    setFormUsername(formData.username);
    setFormAppPassword(formData.appPassword);
    setIsDialogOpen(true);
  }, [handleEditSiteInit]);

  const handleSaveSiteClick = useCallback(() => {
    const success = handleSaveSite(formName, formSiteUrl, formUsername, formAppPassword, editingSite);
    if (success) {
      setIsDialogOpen(false);
    }
  }, [formName, formSiteUrl, formUsername, formAppPassword, editingSite, handleSaveSite]);

  const handleOptimizeContentClick = useCallback(async (site: WordPressSite, url: string, updateMode: 'update' | 'draft', resolvedPost?: { id: number; subtype: string; link: string; slug?: string } | null) => {
    try {
      const opts = optimizationOptions[site.id] || { optimizeTitle: true, optimizeMeta: true, optimizeExcerpt: true, optimizeContent: true, optimizeFeaturedImage: false, autoOptimize: true, testMode: false };
      const inContentImageType = inContentImageTypes[site.id];
      const inContentImagePrompt = inContentImagePrompts[site.id];
      await handleOptimizeContent(site, url, updateMode, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters, false, opts, inContentImageType ? { imageType: inContentImageType as ImageType, userPrompt: inContentImagePrompt } : undefined, resolvedPost || undefined, opts.testMode === true);
    } catch (error) {
      console.error('[Optimize Content] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to optimize content', { duration: 5000 });
      try { setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false })); } catch {}
    }
  }, [handleOptimizeContent, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters, optimizationOptions, inContentImageTypes, inContentImagePrompts]);

  const handleOptimizeMultipleContentClick = useCallback(async (site: WordPressSite, urls: string[], updateMode: 'update' | 'draft') => {
    setBulkOptimizationModalOpen(prev => ({ ...prev, [site.id]: true }));
    try {
      const opts = optimizationOptions[site.id] || { optimizeTitle: true, optimizeMeta: true, optimizeExcerpt: true, optimizeContent: true, optimizeFeaturedImage: false, autoOptimize: true, testMode: false };
      const inContentImageType = inContentImageTypes[site.id];
      const inContentImagePrompt = inContentImagePrompts[site.id];
      await handleOptimizeMultipleContent(site, urls, updateMode, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters, opts, inContentImageType ? { imageType: inContentImageType as ImageType, userPrompt: inContentImagePrompt } : undefined);
    } catch (error) {
      console.error('[Batch Optimize] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to optimize multiple posts', { duration: 5000 });
    }
  }, [handleOptimizeMultipleContent, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters, optimizationOptions, inContentImageTypes, inContentImagePrompts]);

  const handleContinueOptimization = useCallback(async (siteId: string, selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number }, clusterKeywords?: string[]) => {
    try {
      await continueOptimizationWithKeyword(siteId, selectedKeyword, clusterKeywords, setIsKeywordSelectionOpen);
    } catch (error) {
      console.error('[Optimize] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to continue optimization');
    }
  }, [continueOptimizationWithKeyword, setIsKeywordSelectionOpen]);

  const handleKeywordSelectionCancel = useCallback((siteId: string) => {
    closeKeywordSelection(siteId);
    clearOptimization(siteId);
    toast.info('Keyword selection cancelled');
  }, [closeKeywordSelection, clearOptimization]);

  const handleDateRangePresetChangeForSite = useCallback((siteId: string, preset: DateRangePreset) => handleDateRangePresetChange(siteId, preset), [handleDateRangePresetChange]);
  const handleCustomDateRangeChangeForSite = useCallback((siteId: string, dates: { currentStart?: Date; currentEnd?: Date; comparisonStart?: Date; comparisonEnd?: Date }) => {
    setCustomDateRanges(prev => ({ ...prev, [siteId]: { ...prev[siteId], ...dates } }));
    handleDateRangePresetChange(siteId, 'custom');
  }, [setCustomDateRanges, handleDateRangePresetChange]);

  const handleDetectLocations = useCallback(async (site: WordPressSite) => {
    setIsDetectingLocations(prev => ({ ...prev, [site.id]: true }));
    try {
      await handleLocationDetection(site, setSites);
    } catch (error) {
      console.error('[Location Detection] Error:', error);
      toast.error(`Failed to detect locations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDetectingLocations(prev => { const updated = { ...prev }; delete updated[site.id]; return updated; });
    }
  }, [setSites]);

  const handleExtractNAPAndLinkGraph = useCallback(async (site: WordPressSite) => {
    setIsExtractingNAPAndGraph(prev => ({ ...prev, [site.id]: true }));
    try {
      await extractNAPAndLinkGraph(site);
    } catch (error) {
      console.error('[NAP & Link Graph] Error:', error);
    } finally {
      setIsExtractingNAPAndGraph(prev => { const updated = { ...prev }; delete updated[site.id]; return updated; });
    }
  }, []);

  const handleConfirmMasterOptimization = useCallback(async () => {
    const selectedSites = sites.filter(s => selectedSitesForMasterOptimization.has(s.id));
    setMasterOptimizationModalOpen(true);
    const imageRequest = masterInContentImageType ? { imageType: masterInContentImageType as string, userPrompt: masterInContentImagePrompt || '' } : undefined;
    await handleMasterOptimization(masterUpdateMode, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters, masterOptimizationOptions, imageRequest, selectedSites);
  }, [selectedSitesForMasterOptimization, sites, masterInContentImageType, masterInContentImagePrompt, masterUpdateMode, masterOptimizationOptions, handleMasterOptimization, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters]);

  const handleOptimize = useCallback((site: WordPressSite, postData?: { id: number; subtype: string; link: string; slug?: string } | null) => {
    const urlToOptimize = optimizeUrl[site.id] || '';
    const mode = optimizeUpdateMode[site.id] || 'update';
    setOptimizationFileManagers(prev => { const updated = { ...prev }; delete updated[site.id]; return updated; });
    
    // If postData is provided but urlToOptimize is empty, use postData.link
    const finalUrl = (typeof urlToOptimize === 'string' && urlToOptimize) 
      ? urlToOptimize 
      : (postData?.link || '');
    
    if (Array.isArray(urlToOptimize) && urlToOptimize.length > 0) {
      handleOptimizeMultipleContentClick(site, urlToOptimize, mode);
    } else if (finalUrl) {
      handleOptimizeContentClick(site, finalUrl, mode, postData);
    } else {
      toast.error('Please select a post or enter a URL to optimize');
    }
  }, [optimizeUrl, optimizeUpdateMode, handleOptimizeMultipleContentClick, handleOptimizeContentClick, setOptimizationFileManagers]);

  return (
    <div className="bg-card p-4 rounded-lg border border-border">
      {/* Compact Header with Integrated Search */}
      <div className="flex justify-between items-center gap-3 mb-2">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Properties</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect to WordPress sites and detect their sitemaps. All API calls go through the backend server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500/50" />
            <Input
              type="text"
              placeholder="Search sites..."
              value={siteSearchQuery}
              onChange={(e) => setSiteSearchQuery(e.target.value)}
              className={`h-8 pl-8 pr-8 bg-card border-green-500/20 ${getCyberpunkTextClasses('primary')} placeholder:text-green-500/40 focus-visible:ring-green-500/50 focus-visible:border-green-500/50 text-sm`}
            />
            {siteSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSiteSearchQuery('')}
                className={`absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 ${getCyberpunkButtonClasses()} hover:bg-green-500/20`}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button onClick={handleAddSite} className="bg-primary hover:bg-primary/90 text-black h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Site
          </Button>
        </div>
      </div>

      {/* Master Optimization Card */}
      <MasterOptimizationCard
        sites={sites}
        selectedSites={selectedSitesForMasterOptimization}
        onSelectedSitesChange={setSelectedSitesForMasterOptimization}
        isActivated={isMasterOptimizationActivated}
        onActivate={() => setIsMasterOptimizationActivated(true)}
        masterOptimizationState={masterOptimizationState}
        isOptimizingContent={isOptimizingContent}
        masterOptimizationOptions={masterOptimizationOptions}
        onMasterOptimizationOptionsChange={setMasterOptimizationOptions}
        masterUpdateMode={masterUpdateMode}
        onMasterUpdateModeChange={setMasterUpdateMode}
        masterInContentImageType={masterInContentImageType}
        onMasterInContentImageTypeChange={setMasterInContentImageType}
        masterInContentImagePrompt={masterInContentImagePrompt}
        onMasterInContentImagePromptChange={setMasterInContentImagePrompt}
        onOptimize={() => setShowOptimizationConfirmDialog(true)}
      />

      {/* Master Generate Content Card */}
      <MasterGenerateContentCard
        sites={sites}
        selectedSites={selectedSitesForMasterOptimization}
        masterGenerateContentState={masterGenerateContentState}
        gscQueriesForSelection={gscQueriesForSelection}
        onRunAll={async (params) => {
          await runMasterGenerateContent({
            ...params,
            setProgress: (state) => {
              if ('appendRunHistory' in state && state.appendRunHistory != null) {
                const { appendRunHistory: entry, ...rest } = state;
                setMasterGenerateContentState((prev) => ({
                  ...prev,
                  ...rest,
                  runHistory: [...(prev.runHistory || []), entry],
                }));
                return;
              }
              setMasterGenerateContentState((prev) => ({ ...prev, ...state }));
            },
          });
        }}
      />

      {/* Site List */}
      <WordPressSiteList
        sites={sites}
        filteredSites={filteredSites}
        siteSearchQuery={siteSearchQuery}
        onSearchChange={setSiteSearchQuery}
        expandedTiles={expandedTiles}
        onToggleTile={toggleTileExpansion}
        isTesting={isTesting}
        isDetecting={isDetecting}
        isFetchingScheduled={isFetchingScheduled}
        isScrapingSitemap={isScrapingSitemap}
        isIndexingSitemap={isIndexingSitemap}
        isGeneratingEntities={isGeneratingEntities}
        isFetchingGSC={isFetchingGSC}
        isGeneratingReport={isGeneratingReport}
        isOptimizingContent={isOptimizingContent}
        optimizationProgress={optimizationProgress}
        optimizationFileManagers={optimizationFileManagers}
        optimizeUrl={optimizeUrl}
        optimizeUpdateMode={optimizeUpdateMode}
        dateRangePreset={dateRangePreset}
        customDateRanges={customDateRanges}
        optimizationSettings={optimizationSettings}
        optimizationHistory={optimizationHistory}
        optimizationOptions={optimizationOptions}
        inContentImageTypes={inContentImageTypes}
        inContentImagePrompts={inContentImagePrompts}
        isDetectingLocations={isDetectingLocations}
        isExtractingNAPAndGraph={isExtractingNAPAndGraph}
        isLoadingCalendar={isLoadingCalendar}
        onTest={handleTestConnection}
        onToggleEnabled={handleToggleEnabled}
        onDetect={handleDetectSitemaps}
        onEdit={handleEditSite}
        onDelete={handleDeleteSite}
        onScrapeChildSitemap={handleScrapeChildSitemap}
        onIndexSitemap={handleIndexSitemap}
        onEntityGeneration={onEntityGeneration}
        onSetEntitySitemap={handleSetEntitySitemap}
        onLoadCalendarPosts={handleLoadCalendarPosts}
        onGSCFetch={onGSCFetch}
        onDetectLocations={handleDetectLocations}
        onExtractNAPAndGraph={handleExtractNAPAndLinkGraph}
        onGenerateGSCReport={handleGenerateGSCReport}
        onDateRangePresetChange={handleDateRangePresetChangeForSite}
        onCustomDateRangeChange={handleCustomDateRangeChangeForSite}
        onOptimizeUrlChange={(siteId, url) => setOptimizeUrl(prev => ({ ...prev, [siteId]: url }))}
        onOptimizeUpdateModeChange={(siteId, mode) => setOptimizeUpdateMode(prev => ({ ...prev, [siteId]: mode }))}
        onOptimizationSettingsChange={handleOptimizationSettingsChange}
        onClearHistory={handleClearHistory}
        onOptimizationOptionsChange={(siteId, options) => setOptimizationOptions(prev => ({ ...prev, [siteId]: options }))}
        onInContentImageTypeChange={(siteId, imageType) => setInContentImageTypes(prev => ({ ...prev, [siteId]: imageType }))}
        onInContentImagePromptChange={(siteId, prompt) => setInContentImagePrompts(prev => ({ ...prev, [siteId]: prompt }))}
        onOptimize={handleOptimize}
        getScrapingKey={getScrapingKey}
        onBlueprintUpdate={onBlueprintUpdate}
        onOpenSEMTaskList={(site) => setSemDialogSite(site)}
      />

      {/* SEM Task List dialog (per site) */}
      {semDialogSite && (
        <SEMTaskListDialog
          site={semDialogSite}
          open={!!semDialogSite}
          onOpenChange={(open) => !open && setSemDialogSite(null)}
          onOptimizeContent={handleOptimizeContent}
          setGscQueriesForSelection={setGscQueriesForSelection}
          setIsKeywordSelectionOpen={setIsKeywordSelectionOpen}
          setGscClusterAnalysis={setGscClusterAnalysis}
          setIsAnalyzingClusters={setIsAnalyzingClusters}
        />
      )}

      {/* All Dialogs */}
      <WordPressDialogs
        isDialogOpen={isDialogOpen}
        onDialogOpenChange={setIsDialogOpen}
        editingSite={editingSite}
        formName={formName}
        formSiteUrl={formSiteUrl}
        formUsername={formUsername}
        formAppPassword={formAppPassword}
        onFormNameChange={setFormName}
        onFormSiteUrlChange={setFormSiteUrl}
        onFormUsernameChange={setFormUsername}
        onFormAppPasswordChange={setFormAppPassword}
        onSaveSite={handleSaveSiteClick}
        masterOptimizationModalOpen={masterOptimizationModalOpen}
        onMasterOptimizationModalOpenChange={setMasterOptimizationModalOpen}
        masterOptimizationState={masterOptimizationState}
        sites={sites}
        bulkOptimizationModalOpen={bulkOptimizationModalOpen}
        onBulkOptimizationModalOpenChange={(siteId, open) => {
          if (!open) {
            setBulkOptimizationModalOpen(prev => {
              const updated = { ...prev };
              delete updated[siteId];
              return updated;
            });
          }
        }}
        bulkOptimizationState={bulkOptimizationState}
        optimizationProgress={optimizationProgress}
        gscQueriesForSelection={gscQueriesForSelection}
        isKeywordSelectionOpen={isKeywordSelectionOpen}
        gscClusterAnalysis={gscClusterAnalysis}
        isAnalyzingClusters={isAnalyzingClusters}
        selectedCluster={selectedCluster}
        onSelectCluster={(siteId, clusterIdx) => setSelectedCluster(prev => ({ ...prev, [siteId]: clusterIdx }))}
        onSelectKeyword={(siteId, keyword, clusterKeywords) => handleContinueOptimization(siteId, keyword, clusterKeywords)}
        onCancelKeywordSelection={handleKeywordSelectionCancel}
        showOptimizationConfirmDialog={showOptimizationConfirmDialog}
        onShowOptimizationConfirmDialogChange={setShowOptimizationConfirmDialog}
        selectedSitesForMasterOptimization={selectedSitesForMasterOptimization}
        masterUpdateMode={masterUpdateMode}
        masterInContentImageType={masterInContentImageType}
        masterInContentImagePrompt={masterInContentImagePrompt}
        onConfirmMasterOptimization={handleConfirmMasterOptimization}
      />
    </div>
  );
};
