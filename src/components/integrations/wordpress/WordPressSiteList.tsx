import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { CompactWordPressTile } from "./CompactWordPressTile";
import { WordPressSiteCard } from "./WordPressSiteCard";
import type { WordPressSite } from "../types";
import type { DateRangePreset } from "@/lib/gsc-date-helpers";
import type { OptimizationSettings } from "./OptimizationSettingsPanel";
import type { ImageType } from "@/lib/image-section-analyzer";

interface WordPressSiteListProps {
  sites: WordPressSite[];
  filteredSites: WordPressSite[];
  siteSearchQuery: string;
  onSearchChange: (query: string) => void;
  expandedTiles: Set<string>;
  onToggleTile: (siteId: string) => void;
  isTesting: string | null;
  isDetecting: string | null;
  isFetchingScheduled: string | null;
  isScrapingSitemap: Record<string, boolean>;
  isIndexingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isFetchingGSC?: string | null;
  isGeneratingReport?: string | null;
  isOptimizingContent: Record<string, boolean>;
  optimizationProgress: Record<string, any>;
  optimizationFileManagers: Record<string, any>;
  optimizeUrl: Record<string, string | string[]>;
  optimizeUpdateMode: Record<string, 'update' | 'draft'>;
  dateRangePreset: Record<string, DateRangePreset>;
  customDateRanges: Record<string, {
    currentStart: Date | undefined;
    currentEnd: Date | undefined;
    comparisonStart: Date | undefined;
    comparisonEnd: Date | undefined;
  }>;
  optimizationSettings: Record<string, OptimizationSettings>;
  optimizationHistory: Record<string, any[]>;
  optimizationOptions: Record<string, any>;
  inContentImageTypes: Record<string, ImageType | ''>;
  inContentImagePrompts: Record<string, string>;
  isDetectingLocations: Record<string, boolean>;
  isExtractingNAPAndGraph: Record<string, boolean>;
  isLoadingCalendar: Record<string, boolean>;
  onTest: (site: WordPressSite) => void;
  onToggleEnabled: (site: WordPressSite) => void;
  onDetect: (site: WordPressSite) => void;
  onEdit: (site: WordPressSite) => void;
  onDelete: (siteId: string) => void;
  onScrapeChildSitemap: (site: WordPressSite, url: string) => void;
  onIndexSitemap: (site: WordPressSite, url: string) => void;
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  onSetEntitySitemap: (site: WordPressSite, sitemapUrl: string) => void;
  onLoadCalendarPosts: (site: WordPressSite, sitemapUrl: string) => void;
  onGSCFetch?: (site: WordPressSite) => void;
  onDetectLocations: (site: WordPressSite) => void;
  onExtractNAPAndGraph: (site: WordPressSite) => void;
  onGenerateGSCReport?: (site: WordPressSite) => void;
  onDateRangePresetChange: (siteId: string, preset: DateRangePreset) => void;
  onCustomDateRangeChange: (siteId: string, dates: {
    currentStart?: Date;
    currentEnd?: Date;
    comparisonStart?: Date;
    comparisonEnd?: Date;
  }) => void;
  onOptimizeUrlChange: (siteId: string, url: string | string[]) => void;
  onOptimizeUpdateModeChange: (siteId: string, mode: 'update' | 'draft') => void;
  onOptimizationSettingsChange: (siteId: string, settings: OptimizationSettings) => void;
  onClearHistory: (siteId: string) => void;
  onOptimizationOptionsChange: (siteId: string, options: any) => void;
  onInContentImageTypeChange: (siteId: string, imageType: ImageType | '') => void;
  onInContentImagePromptChange: (siteId: string, prompt: string) => void;
  onOptimize: (site: WordPressSite, postData?: { id: number; subtype: string; link: string; slug?: string } | null) => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onBlueprintUpdate?: (agents: any[], title?: string, purpose?: string) => void;
  onOpenSEMTaskList?: (site: WordPressSite) => void;
}

export const WordPressSiteList: React.FC<WordPressSiteListProps> = ({
  sites,
  filteredSites,
  siteSearchQuery,
  onSearchChange,
  expandedTiles,
  onToggleTile,
  isTesting,
  isDetecting,
  isFetchingScheduled,
  isScrapingSitemap,
  isIndexingSitemap,
  isGeneratingEntities = {},
  isFetchingGSC,
  isGeneratingReport,
  isOptimizingContent,
  optimizationProgress,
  optimizationFileManagers,
  optimizeUrl,
  optimizeUpdateMode,
  dateRangePreset,
  customDateRanges,
  optimizationSettings,
  optimizationHistory,
  optimizationOptions,
  inContentImageTypes,
  inContentImagePrompts,
  isDetectingLocations,
  isExtractingNAPAndGraph,
  isLoadingCalendar,
  onTest,
  onToggleEnabled,
  onDetect,
  onEdit,
  onDelete,
  onScrapeChildSitemap,
  onIndexSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onLoadCalendarPosts,
  onGSCFetch,
  onDetectLocations,
  onExtractNAPAndGraph,
  onGenerateGSCReport,
  onDateRangePresetChange,
  onCustomDateRangeChange,
  onOptimizeUrlChange,
  onOptimizeUpdateModeChange,
  onOptimizationSettingsChange,
  onClearHistory,
  onOptimizationOptionsChange,
  onInContentImageTypeChange,
  onInContentImagePromptChange,
  onOptimize,
  getScrapingKey,
  onBlueprintUpdate,
  onOpenSEMTaskList,
}) => {
  if (sites.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <p className="text-lg">No WordPress sites connected</p>
        <p className="mt-2 text-sm">Click "Add Site" to connect your first WordPress site</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="relative mb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-green-500/50" />
          <Input
            type="text"
            placeholder="Search sites by name..."
            value={siteSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`h-8 pl-8 pr-8 bg-card border-green-500/20 ${getCyberpunkTextClasses('primary')} placeholder:text-green-500/40 focus-visible:ring-green-500/50 focus-visible:border-green-500/50 text-sm`}
          />
          {siteSearchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSearchChange('')}
              className={`absolute right-1 h-6 w-6 p-0 ${getCyberpunkButtonClasses()} hover:bg-green-500/20`}
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {filteredSites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <p className="text-sm">No sites found matching "{siteSearchQuery}"</p>
          </div>
        ) : (
          filteredSites.map((site) => {
            const isExpanded = expandedTiles.has(site.id);
            return (
              <div key={site.id}>
                {!isExpanded ? (
                  <CompactWordPressTile
                    site={site}
                    isTesting={isTesting === site.id}
                    isExpanded={isExpanded}
                    onToggle={() => onToggleTile(site.id)}
                    onTest={() => onTest(site)}
                    onToggleEnabled={() => onToggleEnabled(site)}
                  />
                ) : (
                  <>
                    <CompactWordPressTile
                      site={site}
                      isTesting={isTesting === site.id}
                      isExpanded={isExpanded}
                      onToggle={() => onToggleTile(site.id)}
                      onTest={() => onTest(site)}
                      onToggleEnabled={() => onToggleEnabled(site)}
                    />
                    <WordPressSiteCard
                      site={site}
                      isTesting={isTesting === site.id}
                      isDetecting={isDetecting === site.id}
                      isFetchingScheduled={isFetchingScheduled === site.id}
                      isScrapingSitemap={isScrapingSitemap}
                      isIndexingSitemap={isIndexingSitemap}
                      isGeneratingEntities={isGeneratingEntities}
                      isFetchingGSC={isFetchingGSC}
                      isGeneratingReport={isGeneratingReport}
                      isOptimizingContent={isOptimizingContent[site.id] || isOptimizingContent[`${site.id}-batch`] || false}
                      optimizationProgress={optimizationProgress[site.id] || optimizationProgress[`${site.id}-batch`]}
                      optimizationFileManager={optimizationFileManagers[site.id]}
                      optimizeUrl={optimizeUrl[site.id] || []}
                      optimizeUpdateMode={optimizeUpdateMode[site.id] || 'update'}
                      multiSelect={true}
                      dateRangePreset={dateRangePreset[site.id] || 'month-to-month'}
                      customDateRanges={customDateRanges[site.id] || {
                        currentStart: undefined,
                        currentEnd: undefined,
                        comparisonStart: undefined,
                        comparisonEnd: undefined,
                      }}
                      onExtractNAPAndGraph={() => onExtractNAPAndGraph(site)}
                      isExtractingNAPAndGraph={isExtractingNAPAndGraph[site.id] || false}
                      onTest={() => onTest(site)}
                      onDetect={() => onDetect(site)}
                      onEdit={() => onEdit(site)}
                      onDelete={() => onDelete(site.id)}
                      onToggle={() => onToggleEnabled(site)}
                      onScrapeChildSitemap={(url) => onScrapeChildSitemap(site, url)}
                      onIndexSitemap={(url) => onIndexSitemap(site, url)}
                      onEntityGeneration={onEntityGeneration ? (sitemapUrl) => onEntityGeneration(site, sitemapUrl) : undefined}
                      onSetEntitySitemap={(sitemapUrl) => onSetEntitySitemap(site, sitemapUrl)}
                      isLoadingCalendar={isLoadingCalendar}
                      onLoadCalendarPosts={(sitemapUrl) => onLoadCalendarPosts(site, sitemapUrl)}
                      onGSCFetch={onGSCFetch ? () => onGSCFetch(site) : undefined}
                      isDetectingLocations={isDetectingLocations[site.id] || false}
                      onDetectLocations={() => onDetectLocations(site)}
                      onGenerateGSCReport={onBlueprintUpdate ? () => onGenerateGSCReport?.(site) : undefined}
                      onDateRangePresetChange={(preset) => onDateRangePresetChange(site.id, preset)}
                      onCustomDateRangeChange={(dates) => onCustomDateRangeChange(site.id, dates)}
                      onOptimizeUrlChange={(url) => onOptimizeUrlChange(site.id, url)}
                      onOptimizeUpdateModeChange={(mode) => onOptimizeUpdateModeChange(site.id, mode)}
                      optimizationSettings={optimizationSettings[site.id]}
                      onOptimizationSettingsChange={(settings) => onOptimizationSettingsChange(site.id, settings)}
                      optimizationHistory={optimizationHistory[site.id] || []}
                      onClearHistory={() => onClearHistory(site.id)}
                      optimizationOptions={optimizationOptions[site.id] || { optimizeTitle: true, optimizeMeta: true, optimizeExcerpt: true, optimizeContent: true, optimizeFeaturedImage: false, autoOptimize: true, testMode: false }}
                      onOptimizationOptionsChange={(options) => onOptimizationOptionsChange(site.id, options)}
                      inContentImageType={inContentImageTypes[site.id] || ''}
                      inContentImagePrompt={inContentImagePrompts[site.id] || ''}
                      onInContentImageTypeChange={(imageType) => onInContentImageTypeChange(site.id, imageType)}
                      onInContentImagePromptChange={(prompt) => onInContentImagePromptChange(site.id, prompt)}
                      onOptimize={(postData) => onOptimize(site, postData)}
                      getScrapingKey={getScrapingKey}
                      onOpenSEMTaskList={onOpenSEMTaskList ? () => onOpenSEMTaskList(site) : undefined}
                    />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
