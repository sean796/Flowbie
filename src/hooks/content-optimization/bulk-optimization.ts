import { toast } from "sonner";
import { type WordPressSite } from "@/components/integrations/types";
import { getStepProgress, updateBulkProgress, setOptimizingState } from "./optimization-helpers";
import { handleOptimizeContent } from "./handle-optimize-content";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import React from "react";

interface HandleOptimizeMultipleContentParams {
  site: WordPressSite;
  urls: string[];
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  updateMode: 'update' | 'draft';
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    hasEntity?: boolean;
  };
  inContentImageRequest?: { imageType: string; userPrompt?: string };
  setIsOptimizingContent: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  setBulkOptimizationState: (prev: any) => any;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean) => Promise<void>) | null>;
}

export async function handleOptimizeMultipleContent(params: HandleOptimizeMultipleContentParams): Promise<void> {
  const {
    site,
    urls,
    wordPressPosts = [],
    updateMode,
    setGscQueriesForSelection,
    setIsKeywordSelectionOpen,
    setGscClusterAnalysis,
    setIsAnalyzingClusters,
    optimizationOptions,
    inContentImageRequest,
    setIsOptimizingContent,
    setOptimizationProgress,
    setBulkOptimizationState,
    optimizationFileManagers,
    continueOptimizationRef,
  } = params;

  if (!urls || urls.length === 0) {
    toast.error('Please select at least one post to optimize');
    return;
  }

  const batchKey = `${site.id}-batch`;
  setOptimizingState(setIsOptimizingContent, batchKey, true);

  // CRITICAL FIX: Store pending optimization data locally so continueOptimization can access it
  const pendingOptimizationData: Record<string, any> = {};
  const setPendingOptimization = (updater: (prev: any) => any) => {
    const updated = updater(pendingOptimizationData);
    Object.assign(pendingOptimizationData, updated);
  };

  // CRITICAL FIX: Create a wrapper ref that injects local pendingOptimizationData into continueOptimization
  const bulkContinueOptimizationRef = {
    ...continueOptimizationRef,
    current: async (siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean, secondaryKeywords?: string[]) => {
      // Import and call continueOptimizationWithKeyword directly with local data
      const { continueOptimizationWithKeyword: continueOptimizationWithKeywordModule } = await import('./continue-optimization');
      await continueOptimizationWithKeywordModule({
        siteId,
        selectedKeyword,
        clusterKeywords,
        setIsKeywordSelectionOpen,
        testMode: testMode || false,
        secondaryKeywords, // Pass secondary keywords through
        pendingOptimization: pendingOptimizationData, // Use local data instead of hook state
        optimizationFileManagers,
        setPendingOptimization,
        setOptimizationFileManagers: () => {}, // No-op for bulk
        setOptimizationProgress,
        setIsOptimizingContent,
        setBulkOptimizationState,
      });
    }
  };

  const initialUrlStatuses: Record<string, 'pending' | 'optimizing' | 'completed' | 'skipped' | 'error'> = {};
  urls.forEach(url => {
    initialUrlStatuses[url] = 'pending';
  });

  setBulkOptimizationState((prev: any) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: initialUrlStatuses,
      currentStep: 'Initializing...',
      currentUrl: urls[0],
      urlKeywords: {}
    }
  }));

  try {
    toast.info(`Starting optimization of ${urls.length} posts...`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const currentPost = i + 1;
      const totalPosts = urls.length;

      updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, 'optimizing');

      setOptimizationProgress((prev: any) => ({
        ...prev,
        [batchKey]: {
          step: `Optimizing post ${currentPost} of ${totalPosts}...`,
          progress: Math.round((i / totalPosts) * 100),
          message: url
        }
      }));

      let lastSyncedStep = 'Targeting Computer';
      const progressInterval = setInterval(() => {
        setOptimizationProgress((current: any) => {
          const siteProgress = current[site.id];
          if (siteProgress && siteProgress.step !== lastSyncedStep) {
            lastSyncedStep = siteProgress.step;
            const stepProgress = getStepProgress(siteProgress.step);
            updateBulkProgress(setBulkOptimizationState, batchKey, url, siteProgress.step, stepProgress, siteProgress.message);
          }
          return current;
        });
      }, 500);

      try {
        // CRITICAL: Default optimizeContent to true for bulk so "UPDATE EXISTING" always overwrites content unless user explicitly unchecked Content
        const bulkOptimizationOptions = {
          optimizeContent: optimizationOptions?.optimizeContent !== false, // true when undefined or true
          optimizeTitle: optimizationOptions?.optimizeTitle !== false,
          optimizeMeta: optimizationOptions?.optimizeMeta !== false,
          optimizeExcerpt: optimizationOptions?.optimizeExcerpt !== false,
          optimizeFeaturedImage: optimizationOptions?.optimizeFeaturedImage === true,
          hasEntity: optimizationOptions?.hasEntity,
          ...optimizationOptions,
          autoOptimize: true,
        };

        // ALWAYS try GSC first (Death Star). Only fall back to AI when GSC returns no keywords (see catch retry).
        await handleOptimizeContent({
          site,
          url,
          wordPressPosts,
          updateMode,
          setGscQueriesForSelection,
          setIsKeywordSelectionOpen,
          setGscClusterAnalysis,
          setIsAnalyzingClusters,
          skipOnNoGSC: false,
          optimizationOptions: bulkOptimizationOptions,
          inContentImageRequest,
          resolvedPost: undefined,
          testMode: false,
          setIsOptimizingContent,
          setOptimizationProgress,
          setOptimizationFileManagers: () => {},
          setPendingOptimization, // FIXED: Use actual setter that stores data locally
          optimizationFileManagers,
          continueOptimizationRef: bulkContinueOptimizationRef, // FIXED: Use wrapper ref that has access to local pendingOptimizationData
        });

        if (progressInterval) {
          clearInterval(progressInterval);
        }

        updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, 'completed');
        toast.success(`Completed optimization for post ${currentPost} of ${totalPosts}`);

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isNoGSCOrKeywordError = /no valid (search )?queries|no keyword recommendation|no valid queries (found|available)|selected keyword is invalid|primary keyword is empty|optimization data not found/i.test(errorMessage);

        if (progressInterval) {
          clearInterval(progressInterval);
        }

        if (isNoGSCOrKeywordError) {
          toast.info(`No GSC data for post ${currentPost} – retrying with AI analysis...`);
          try {
            await handleOptimizeContent({
              site,
              url,
              wordPressPosts,
              updateMode,
              setGscQueriesForSelection,
              setIsKeywordSelectionOpen,
              setGscClusterAnalysis,
              setIsAnalyzingClusters,
              skipOnNoGSC: true,
              optimizationOptions: bulkOptimizationOptions,
              inContentImageRequest,
              resolvedPost: undefined,
              testMode: false,
              setIsOptimizingContent,
              setOptimizationProgress,
              setOptimizationFileManagers: () => {},
              setPendingOptimization,
              optimizationFileManagers,
              continueOptimizationRef: bulkContinueOptimizationRef,
            });
            updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, 'completed');
            toast.success(`Completed optimization for post ${currentPost} of ${totalPosts} (AI analysis, no GSC)`);
          } catch (retryError) {
            console.error(`[Batch Optimization] Retry with AI failed for post ${currentPost} (${url}):`, retryError);
            toast.error(`Failed to optimize post ${currentPost}: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, 'error');
          }
        } else {
          console.error(`[Batch Optimization] Error optimizing post ${currentPost} (${url}):`, error);
          toast.error(`Failed to optimize post ${currentPost}: ${errorMessage}`);
          updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, 'error');
        }
      }
    }

    setOptimizationProgress((prev: any) => ({
      ...prev,
      [batchKey]: {
        step: 'Batch optimization complete',
        progress: 100,
        message: `Successfully processed ${urls.length} posts`
      }
    }));

    setBulkOptimizationState((prev: any) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          currentStep: 'Batch complete',
          currentIndex: urls.length
        }
      };
    });

    toast.success(`Batch optimization complete! Processed ${urls.length} posts.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Batch Optimization] Fatal error:', error);
    toast.error(`Batch optimization failed: ${errorMessage}`);
  } finally {
    setOptimizingState(setIsOptimizingContent, batchKey, false);

    try {
      const { clearSiteCache } = await import('@/lib/wordpress-site-cache');
      clearSiteCache(site.id);
    } catch (cacheError) {
      console.warn('[Batch Optimization] Error clearing cache:', cacheError);
    }
  }
}

function updateBulkStateForPost(
  setBulkOptimizationState: (prev: any) => any,
  batchKey: string,
  url: string,
  index: number,
  currentPost: number,
  totalPosts: number,
  status: 'optimizing' | 'completed' | 'skipped' | 'error'
): void {
  setBulkOptimizationState((prev: any) => {
    const current = prev[batchKey];
    if (!current) {
      return prev;
    }

    const stepProgress = status === 'completed' ? 100 : getStepProgress(status === 'optimizing' ? 'Targeting Computer' : status);
    const step = status === 'completed' ? 'Complete' : (status === 'optimizing' ? 'Targeting Computer' : status);

    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentIndex: index,
        currentUrl: url,
        currentStep: step,
        currentProgress: stepProgress,
        currentStepProgress: {
          step,
          progress: stepProgress,
          message: status === 'completed' ? `Post ${currentPost} of ${totalPosts} completed` : `Processing post ${currentPost} of ${totalPosts}...`
        },
        urlStatuses: {
          ...current.urlStatuses,
          [url]: status
        }
      }
    };
  });
}
