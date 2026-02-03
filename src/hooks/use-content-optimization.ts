import { useCallback, useRef, useEffect } from "react";
import { type WordPressSite } from "@/components/integrations/types";
import { useOptimizationState, type PendingOptimization, type BulkOptimizationState, type MasterOptimizationState, type MasterGenerateContentState } from "./content-optimization/use-optimization-state";
import { handleOptimizeContent as handleOptimizeContentModule } from "./content-optimization/handle-optimize-content";
import { continueOptimizationWithKeyword as continueOptimizationWithKeywordModule } from "./content-optimization/continue-optimization";
import { handleOptimizeMultipleContent as handleOptimizeMultipleContentModule } from "./content-optimization/bulk-optimization";
import { handleMasterOptimization as handleMasterOptimizationModule } from "./content-optimization/master-optimization";
import { clearOptimization as clearOptimizationHelper } from "./content-optimization/optimization-helpers";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";

// Re-export types for backward compatibility
export type { 
  PendingOptimization, 
  BulkOptimizationState, 
  MasterOptimizationState,
  MasterOptimizationSiteState,
  MasterGenerateContentState,
} from "./content-optimization/use-optimization-state";

export function useContentOptimization() {
  // Use state management hook
  const {
    isOptimizingContent,
    setIsOptimizingContent,
    optimizationProgress,
    setOptimizationProgress,
    optimizationFileManagers,
    setOptimizationFileManagers,
    pendingOptimization,
    setPendingOptimization,
    bulkOptimizationState,
    setBulkOptimizationState,
    masterOptimizationState,
    setMasterOptimizationState,
    masterGenerateContentState,
    setMasterGenerateContentState,
  } = useOptimizationState();

  const continueOptimizationRef = useRef<((siteId: string, selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number }, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean, secondaryKeywords?: string[]) => Promise<void>) | null>(null);

  // Wrapper for handleOptimizeContent - converts direct parameters to params object
  const handleOptimizeContent = useCallback(async (
    site: WordPressSite, 
    url: string, 
    updateMode: 'update' | 'draft',
    setGscQueriesForSelection: (prev: any) => any,
    setIsKeywordSelectionOpen: (prev: any) => any,
    setGscClusterAnalysis: (prev: any) => any,
    setIsAnalyzingClusters: (prev: any) => any,
    skipOnNoGSC: boolean = false,
    optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; featuredImageType?: 'ai-generated' | 'google-maps'; autoOptimize?: boolean; testMode?: boolean; hasEntity?: boolean },
    inContentImageRequest?: { imageType: string; userPrompt?: string },
    resolvedPost?: { id: number; subtype: string; link?: string; slug?: string; endpoint?: string },
    testMode: boolean = false,
    semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }
  ) => {
    return await handleOptimizeContentModule({
      site,
      url,
      updateMode,
      setGscQueriesForSelection,
      setIsKeywordSelectionOpen,
      setGscClusterAnalysis,
      setIsAnalyzingClusters,
      skipOnNoGSC,
      optimizationOptions,
      inContentImageRequest,
      resolvedPost,
      testMode,
      semTaskContext,
      setIsOptimizingContent,
      setOptimizationProgress,
      setOptimizationFileManagers,
      setPendingOptimization,
      optimizationFileManagers,
      continueOptimizationRef,
    });
  }, [setIsOptimizingContent, setOptimizationProgress, setOptimizationFileManagers, setPendingOptimization, optimizationFileManagers]);

  // Wrapper for continueOptimizationWithKeyword - converts direct parameters to params object
  const continueOptimizationWithKeyword = useCallback(async (
    siteId: string, 
    selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number },
    clusterKeywords?: string[],
    setIsKeywordSelectionOpen?: (prev: any) => any,
    testMode: boolean = false,
    secondaryKeywords?: string[]
  ) => {
    await continueOptimizationWithKeywordModule({
      siteId,
      selectedKeyword,
      clusterKeywords,
      setIsKeywordSelectionOpen,
      testMode,
      secondaryKeywords,
      pendingOptimization,
      optimizationFileManagers,
      setPendingOptimization,
      setOptimizationFileManagers,
      setOptimizationProgress,
      setIsOptimizingContent,
      setBulkOptimizationState,
    });
  }, [pendingOptimization, optimizationFileManagers, setPendingOptimization, setOptimizationFileManagers, setOptimizationProgress, setIsOptimizingContent, setBulkOptimizationState]);

  // Store continueOptimizationWithKeyword in ref for access from handleOptimizeContent
  useEffect(() => {
    continueOptimizationRef.current = continueOptimizationWithKeyword;
  }, [continueOptimizationWithKeyword]);

  // Wrapper for clearOptimization - uses helper function
  const clearOptimization = useCallback((siteId: string) => {
    clearOptimizationHelper(
      setIsOptimizingContent,
      setOptimizationProgress,
      setPendingOptimization,
      siteId
    );
  }, [setIsOptimizingContent, setOptimizationProgress, setPendingOptimization]);

  // Wrapper for handleOptimizeMultipleContent - converts direct parameters to params object
  const handleOptimizeMultipleContent = useCallback(async (
    site: WordPressSite,
    urls: string[],
    updateMode: 'update' | 'draft',
    setGscQueriesForSelection: (prev: any) => any,
    setIsKeywordSelectionOpen: (prev: any) => any,
    setGscClusterAnalysis: (prev: any) => any,
    setIsAnalyzingClusters: (prev: any) => any,
    optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; hasEntity?: boolean },
    inContentImageRequest?: { imageType: string; userPrompt?: string }
  ) => {
    await handleOptimizeMultipleContentModule({
      site,
      urls,
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
    });
  }, [setIsOptimizingContent, setOptimizationProgress, setBulkOptimizationState, optimizationFileManagers]);

  // Wrapper for handleMasterOptimization - converts direct parameters to params object
  const handleMasterOptimization = useCallback(async (
    updateMode: 'update' | 'draft',
    setGscQueriesForSelection: (prev: any) => any,
    setIsKeywordSelectionOpen: (prev: any) => any,
    setGscClusterAnalysis: (prev: any) => any,
    setIsAnalyzingClusters: (prev: any) => any,
    optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; hasEntity?: boolean },
    inContentImageRequest?: { imageType: string; userPrompt?: string },
    selectedSites?: WordPressSite[]
  ) => {
    await handleMasterOptimizationModule({
      updateMode,
      setGscQueriesForSelection,
      setIsKeywordSelectionOpen,
      setGscClusterAnalysis,
      setIsAnalyzingClusters,
      optimizationOptions,
      inContentImageRequest,
      selectedSites,
      setMasterOptimizationState,
      setBulkOptimizationState,
      setIsOptimizingContent,
      setOptimizationProgress,
      optimizationFileManagers,
      continueOptimizationRef,
    });
  }, [setMasterOptimizationState, setBulkOptimizationState, setIsOptimizingContent, setOptimizationProgress, optimizationFileManagers]);

  return {
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
  };
}
