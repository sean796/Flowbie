import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Download } from 'lucide-react';
import { toast } from 'sonner';
import { OptimizationFileManager } from '@/lib/optimization-file-manager';
import { type WordPressSite } from '../types';
import { UnifiedContentSelector } from './UnifiedContentSelector';
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from './cyberpunk-theme';
import type { ImageType } from '@/lib/image-section-analyzer';
import { saveSites, getStoredSites } from '../storage';
import { OptimizationSettingsAccordion } from './OptimizationSettingsPopover';
import { OptimizationProgressDisplay } from './OptimizationProgressDisplay';
import type { OptimizationOptions } from '@/hooks/use-optimization-options';

interface ContentOptimizationControlsProps {
  site: WordPressSite;
  url: string | string[];
  updateMode: 'update' | 'draft';
  isOptimizing: boolean;
  progress?: { step: string; progress: number; message?: string };
  fileManager?: OptimizationFileManager;
  onUrlChange: (url: string | string[]) => void;
  onUpdateModeChange: (mode: 'update' | 'draft') => void;
  onOptimize: (postData?: { id: number; subtype: string; link: string; slug?: string } | null) => void;
  multiSelect?: boolean;
  optimizationOptions?: OptimizationOptions;
  onOptimizationOptionsChange?: (options: OptimizationOptions) => void;
  inContentImageType?: ImageType | '';
  inContentImagePrompt?: string;
  onInContentImageTypeChange?: (imageType: ImageType | '') => void;
  onInContentImagePromptChange?: (prompt: string) => void;
}

export const ContentOptimizationControls: React.FC<ContentOptimizationControlsProps> = ({
  site,
  url,
  updateMode,
  isOptimizing,
  progress,
  fileManager,
  onUrlChange,
  onUpdateModeChange,
  onOptimize,
  multiSelect = false,
  optimizationOptions,
  onOptimizationOptionsChange,
  inContentImageType = '',
  inContentImagePrompt = '',
  onInContentImageTypeChange,
  onInContentImagePromptChange,
}) => {
  const [postType, setPostType] = useState<'post' | 'service-area' | 'page' | 'both'>('post');
  const [selectedPostData, setSelectedPostData] = useState<{
    id: number;
    subtype: string;
    link: string;
    slug?: string;
    endpoint?: string;
  } | null>(null);
  const [manualEndpoint, setManualEndpoint] = useState<string>(site.manualEndpoint || '');

  // Save manual endpoint to site when changed (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (manualEndpoint.trim() !== (site.manualEndpoint || '')) {
        const sites = getStoredSites();
        const updated = sites.map((s) =>
          s.id === site.id ? { ...s, manualEndpoint: manualEndpoint.trim() || undefined } : s
        );
        saveSites(updated);
        if (manualEndpoint.trim()) {
          console.log(`[Content Optimization] Manual endpoint saved: ${manualEndpoint.trim()}`);
        }
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [manualEndpoint, site.id, site.manualEndpoint]);

  const urls = multiSelect ? (Array.isArray(url) ? url : []) : [];
  const urlString = multiSelect ? undefined : typeof url === 'string' ? url : '';
  const hasSelectedPosts = multiSelect ? urls.length > 0 : !!urlString;

  // Default optimization options if not provided
  const defaultOptions: OptimizationOptions = {
    optimizeTitle: true,
    optimizeMeta: true,
    optimizeExcerpt: true,
    optimizeContent: true,
    optimizeFeaturedImage: false,
    optimizeExtraText: false,
    optimizeExtraImage: false,
    autoOptimize: true,
  };

  const currentOptions = optimizationOptions || defaultOptions;

  return (
    <div className="mt-4 p-5 bg-green-500/5 rounded-lg border border-green-500/20">
      <div className={`text-sm font-bold mb-4 ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}>
        Optimize Content
      </div>
      <div className="space-y-4">
        {/* URL Selector */}
        <div className="space-y-2">
          <UnifiedContentSelector
            site={site}
            value={multiSelect ? urls : urlString || ''}
            onValueChange={(newUrl) => {
              onUrlChange(newUrl);
              // Clear post data if URL is manually changed (not from dropdown)
              if (typeof newUrl === 'string' && newUrl !== urlString) {
                setSelectedPostData(null);
              }
            }}
            postType={postType}
            onPostTypeChange={(value: 'post' | 'service-area' | 'page' | 'both') => {
              setPostType(value);
              // Clear selection and post data when switching types
              onUrlChange(multiSelect ? [] : '');
              setSelectedPostData(null);
            }}
            disabled={isOptimizing || site.enabled === false}
            multiSelect={multiSelect}
            onPostDataChange={setSelectedPostData}
          />
        </div>

        {/* Optimization Settings Accordion - Full Width */}
        {onOptimizationOptionsChange && (
          <OptimizationSettingsAccordion
            site={site}
            updateMode={updateMode}
            optimizationOptions={currentOptions}
            onUpdateModeChange={onUpdateModeChange}
            onOptimizationOptionsChange={onOptimizationOptionsChange}
            inContentImageType={inContentImageType}
            inContentImagePrompt={inContentImagePrompt}
            onInContentImageTypeChange={onInContentImageTypeChange}
            onInContentImagePromptChange={onInContentImagePromptChange}
            isOptimizing={isOptimizing}
            disabled={isOptimizing || site.enabled === false}
          />
        )}

        {/* Progress Display */}
        <OptimizationProgressDisplay progress={progress} isOptimizing={isOptimizing} />

        {/* Completion Message */}
        {!isOptimizing && fileManager && fileManager.getFileCount() > 0 && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-bold ${getCyberpunkTextClasses('primary')} font-mono`}>
                  Optimization Complete
                </div>
                <div className={`${getCyberpunkTextClasses('muted')} mt-0.5`}>
                  {fileManager.getFileCount()} files generated
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (fileManager) {
                    fileManager.downloadAllFiles();
                    toast.success(`Downloading ${fileManager.getFileCount()} files...`);
                  }
                }}
                className={`h-8 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
              >
                <Download className="h-3 w-3 mr-1" />
                Download All
              </Button>
            </div>
          </div>
        )}

        {/* Optimize Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[ContentOptimizationControls] Optimize clicked:', {
              hasSelectedPostData: !!selectedPostData,
              selectedPostDataId: selectedPostData?.id,
              selectedPostDataEndpoint: selectedPostData?.endpoint,
              selectedPostDataSubtype: selectedPostData?.subtype,
            });
            onOptimize(selectedPostData);
          }}
          disabled={isOptimizing || site.enabled === false}
          className={`w-full h-10 text-sm font-semibold ${getCyberpunkButtonClasses()} transition-all font-mono uppercase tracking-wider`}
        >
            {isOptimizing ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {multiSelect && urls.length > 0
                ? `Optimizing ${urls.length} ${postType === 'post' ? 'posts' : postType === 'service-area' ? 'service areas' : 'items'}...`
                : 'Optimizing...'}
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              {multiSelect && urls.length > 0
                ? `Optimize ${urls.length} ${postType === 'post' ? 'Posts' : postType === 'service-area' ? 'Service Areas' : 'Items'}`
                : 'Optimize Content'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
