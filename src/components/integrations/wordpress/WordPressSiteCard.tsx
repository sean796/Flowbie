import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Settings,
  History,
  Layers,
  Clock,
  Loader2,
  Wrench,
} from "lucide-react";
import { type WordPressSite } from "../types";
import { GSCReportControls } from "./GSCReportControls";
import { ContentOptimizationControls } from "./ContentOptimizationControls";
import { OptimizationSettingsPanel, type OptimizationSettings, DEFAULT_SETTINGS } from "./OptimizationSettingsPanel";
import { OptimizationHistoryPanel, type OptimizationHistoryEntry } from "./OptimizationHistoryPanel";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { DateRangePreset } from "@/lib/gsc-date-helpers";
import { WordPressCardHeader } from "./WordPressCardHeader";
import { WordPressCardStatus } from "./WordPressCardStatus";
import { WordPressCardActions } from "./WordPressCardActions";
import { LocationsSection } from "./LocationsSection";
import { SitemapSection } from "./SitemapSection";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getCyberpunkButtonClasses, BREATHE_NEON_ANIMATION } from "./cyberpunk-theme";
import type { ImageType } from "@/lib/image-section-analyzer";

interface WordPressSiteCardProps {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isFetchingScheduled: boolean;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isIndexingSitemap?: Record<string, boolean>;
  isFetchingGSC?: string | null;
  isGeneratingReport?: string | null;
  isOptimizingContent: boolean;
  optimizationProgress?: { step: string; progress: number; message?: string };
  optimizationFileManager?: OptimizationFileManager;
  optimizeUrl: string | string[];
  optimizeUpdateMode: 'update' | 'draft';
  multiSelect?: boolean;
  dateRangePreset: DateRangePreset;
  customDateRanges: {
    currentStart: Date | undefined;
    currentEnd: Date | undefined;
    comparisonStart: Date | undefined;
    comparisonEnd: Date | undefined;
  };
  onTest: () => void;
  onDetect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  onGSCFetch?: () => void;
  onGenerateGSCReport?: () => void;
  onDateRangePresetChange: (preset: DateRangePreset) => void;
  onCustomDateRangeChange: (dates: {
    currentStart?: Date;
    currentEnd?: Date;
    comparisonStart?: Date;
    comparisonEnd?: Date;
  }) => void;
  onOptimizeUrlChange: (url: string | string[]) => void;
  onOptimizeUpdateModeChange: (mode: 'update' | 'draft') => void;
  onOptimize: (postData?: { id: number; subtype: string; link: string; slug?: string } | null) => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onOptimizeLatest?: () => void;
  onBulkOptimize?: () => void;
  onViewHistory?: () => void;
  onViewSettings?: () => void;
  optimizationSettings?: OptimizationSettings;
  onOptimizationSettingsChange?: (settings: OptimizationSettings) => void;
  optimizationHistory?: OptimizationHistoryEntry[];
  onViewHistoryDetails?: (entry: OptimizationHistoryEntry) => void;
  onDownloadHistoryFiles?: (entry: OptimizationHistoryEntry) => void;
  onClearHistory?: () => void;
  optimizationOptions?: { optimizeTitle: boolean; optimizeMeta: boolean; optimizeExcerpt: boolean; optimizeContent: boolean; optimizeFeaturedImage: boolean; autoOptimize?: boolean };
  onOptimizationOptionsChange?: (options: { optimizeTitle: boolean; optimizeMeta: boolean; optimizeExcerpt: boolean; optimizeContent: boolean; optimizeFeaturedImage: boolean; autoOptimize?: boolean }) => void;
  isLoadingCalendar?: Record<string, boolean>;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
  onSiteUpdate?: (updatedSite: WordPressSite) => void;
  isDetectingLocations?: boolean;
  onDetectLocations?: () => void;
  isExtractingNAPAndGraph?: boolean;
  onExtractNAPAndGraph?: () => void;
  inContentImageType?: ImageType | '';
  inContentImagePrompt?: string;
  onInContentImageTypeChange?: (imageType: ImageType | '') => void;
  onInContentImagePromptChange?: (prompt: string) => void;
  onOpenSEMTaskList?: () => void;
}

export const WordPressSiteCard: React.FC<WordPressSiteCardProps> = ({
  site,
  isTesting,
  isDetecting,
  isFetchingScheduled,
  isScrapingSitemap,
  isGeneratingEntities = {},
  isIndexingSitemap = {},
  isFetchingGSC,
  isGeneratingReport,
  isOptimizingContent,
  optimizationProgress,
  optimizationFileManager,
  optimizeUrl,
  optimizeUpdateMode,
  multiSelect = false,
  dateRangePreset,
  customDateRanges,
  onTest,
  onDetect,
  onEdit,
  onDelete,
  onToggle,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onIndexSitemap,
  onGSCFetch,
  onGenerateGSCReport,
  onDateRangePresetChange,
  onCustomDateRangeChange,
  onOptimizeUrlChange,
  onOptimizeUpdateModeChange,
  onOptimize,
  getScrapingKey,
  onOptimizeLatest,
  onBulkOptimize,
  onViewHistory,
  onViewSettings,
  optimizationSettings,
  onOptimizationSettingsChange,
  optimizationHistory,
  onViewHistoryDetails,
  onDownloadHistoryFiles,
  onClearHistory,
  optimizationOptions,
  onOptimizationOptionsChange,
  isLoadingCalendar = {},
  onLoadCalendarPosts,
  isDetectingLocations = false,
  onDetectLocations,
  isExtractingNAPAndGraph = false,
  onExtractNAPAndGraph,
  inContentImageType = '',
  inContentImagePrompt = '',
  onInContentImageTypeChange,
  onInContentImagePromptChange,
  onOpenSEMTaskList,
}) => {
  const isEnabled = site.enabled !== false;

  return (
    <>
      <style>{BREATHE_NEON_ANIMATION}</style>
      <Card className={`p-3 ${getCyberpunkCardClasses(false, true)} transition-all duration-300 ${!isEnabled ? 'opacity-60' : ''}`}>
        {/* Header Section */}
        <WordPressCardHeader
          site={site}
          onEdit={onEdit}
          onDelete={onDelete}
        />

        {/* Status Section */}
        <WordPressCardStatus
          site={site}
          isTesting={isTesting}
          onToggle={onToggle}
        />

        {/* Sitemap Summary */}
        {site.sitemaps && (
          <div className={`mt-2 py-1.5 px-2 bg-green-500/5 border border-green-500/20 rounded ${getCyberpunkTextClasses('muted')} text-sm`}>
            <span>Sitemap: </span>
            <span className={getCyberpunkTextClasses('secondary')}>
              {site.sitemaps.type === 'index' 
                ? `${site.sitemaps.childSitemaps?.length || 0} child sitemaps`
                : `${site.sitemaps.urls?.length || 0} URLs`
              }
            </span>
            {isFetchingScheduled ? (
              <span className="ml-3">
                | <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                Fetching scheduled posts...
              </span>
            ) : site.scheduledPosts !== undefined ? (
              <span className={`ml-3 ${getCyberpunkTextClasses('secondary')}`}>
                | Scheduled: {site.scheduledPosts.count} posts
              </span>
            ) : null}
          </div>
        )}

        {/* Optimization Stats */}
        {optimizationProgress && typeof optimizationProgress === 'object' && optimizationProgress.progress === 100 && (
          <div className={`mt-1.5 pt-1.5 border-t border-green-500/20 text-sm ${getCyberpunkTextClasses('muted')}`}>
            <span>Last optimized: {new Date().toLocaleDateString()}</span>
          </div>
        )}

        {/* Actions Section */}
        <WordPressCardActions
          site={site}
          isTesting={isTesting}
          isDetecting={isDetecting}
          isExtractingNAPAndGraph={isExtractingNAPAndGraph}
          onTest={onTest}
          onDetect={onDetect}
          onExtractNAPAndGraph={onExtractNAPAndGraph}
        />

        {/* Quick Actions */}
        {(onOptimizeLatest || onBulkOptimize || onViewHistory || onViewSettings || onOpenSEMTaskList) && (
          <div className="mt-2 pt-2 border-t border-green-500/20">
            <div className={`text-sm font-bold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider mb-1.5`}>
              Quick Actions
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {onOpenSEMTaskList && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenSEMTaskList}
                  disabled={!isEnabled}
                  className={`h-9 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all border-primary text-primary hover:bg-primary/10`}
                  title="Upload a task list and fix content with AI"
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  Fix it (AI Technical Mechanic)
                </Button>
              )}
              {onOptimizeLatest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOptimizeLatest}
                  disabled={isOptimizingContent || !isEnabled}
                  className={`h-9 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
                  title="Optimize the most recent post"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Latest Post
                </Button>
              )}
              {onBulkOptimize && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBulkOptimize}
                  disabled={isOptimizingContent || !isEnabled}
                  className={`h-9 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
                  title="Optimize multiple posts"
                >
                  <Layers className="h-3 w-3 mr-1" />
                  Bulk Optimize
                </Button>
              )}
              {onViewHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onViewHistory}
                  disabled={!isEnabled}
                  className={`h-9 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
                  title="View optimization history"
                >
                  <History className="h-3 w-3 mr-1" />
                  History
                </Button>
              )}
              {onViewSettings && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onViewSettings}
                  disabled={!isEnabled}
                  className={`h-9 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
                  title="View optimization settings"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Settings
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Locations Section */}
        <LocationsSection
          site={site}
          isDetectingLocations={isDetectingLocations}
          onDetectLocations={onDetectLocations}
        />

        {/* GSC Report Controls */}
        {onGSCFetch && (
          <div className="mt-2 pt-2 border-t border-green-500/20">
            <GSCReportControls
              site={site}
              dateRangePreset={dateRangePreset}
              customDateRanges={customDateRanges}
              isFetchingGSC={isFetchingGSC}
              isGeneratingReport={isGeneratingReport}
              onDateRangePresetChange={onDateRangePresetChange}
              onCustomDateRangeChange={onCustomDateRangeChange}
              onFetch={onGSCFetch}
              onGenerate={onGenerateGSCReport}
            />
          </div>
        )}

        {/* Content Optimization Controls */}
        <div className="mt-2 pt-2 border-t border-green-500/20">
          <ContentOptimizationControls
            site={site}
            url={optimizeUrl}
            updateMode={optimizeUpdateMode}
            isOptimizing={isOptimizingContent}
            progress={optimizationProgress}
            fileManager={optimizationFileManager}
            onUrlChange={onOptimizeUrlChange}
            onUpdateModeChange={onOptimizeUpdateModeChange}
            onOptimize={onOptimize}
            multiSelect={multiSelect}
            optimizationOptions={optimizationOptions}
            onOptimizationOptionsChange={onOptimizationOptionsChange}
            inContentImageType={inContentImageType}
            inContentImagePrompt={inContentImagePrompt}
            onInContentImageTypeChange={onInContentImageTypeChange}
            onInContentImagePromptChange={onInContentImagePromptChange}
          />
        </div>

        {/* Optimization Settings Panel */}
        <OptimizationSettingsPanel
          site={site}
          settings={optimizationSettings || DEFAULT_SETTINGS}
          onSettingsChange={onOptimizationSettingsChange || (() => {})}
          disabled={isOptimizingContent || !isEnabled}
        />

        {/* Optimization History Panel */}
        <OptimizationHistoryPanel
          site={site}
          history={optimizationHistory || []}
          onViewDetails={onViewHistoryDetails}
          onDownloadFiles={onDownloadHistoryFiles}
          onClearHistory={onClearHistory}
          disabled={!isEnabled}
        />

        {/* Sitemap Section */}
        <SitemapSection
          site={site}
          isScrapingSitemap={isScrapingSitemap}
          isGeneratingEntities={isGeneratingEntities}
          isIndexingSitemap={isIndexingSitemap}
          isLoadingCalendar={isLoadingCalendar}
          getScrapingKey={getScrapingKey}
          onScrapeChildSitemap={onScrapeChildSitemap}
          onEntityGeneration={onEntityGeneration}
          onSetEntitySitemap={onSetEntitySitemap}
          onIndexSitemap={onIndexSitemap}
          onLoadCalendarPosts={onLoadCalendarPosts}
        />
      </Card>
    </>
  );
};
