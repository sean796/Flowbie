import { type WordPressSite } from "@/components/integrations/types";
import { processGSCQueriesAndAnalyze } from "@/lib/content-optimization-helpers";
import { updateOptimizationProgress } from "./optimization-helpers";
import { deriveKeywordFromModifier, firstNonBlocklistedQuery, isBlocklistedPrimaryKeyword } from "@/lib/gsc-simple-keyword-recommendation";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { buildFullPostPayload, extractPrimaryKeywordFromFullPostViaAI } from "@/lib/wordpress-primary-keyword-from-post";
import React from "react";

export interface ProcessGSCAndShowSelectionParams {
  gscResult: any;
  site: WordPressSite;
  url: string;
  existingTitle: string;
  existingPost: any;
  resolved: any;
  existingContent: string;
  existingExcerpt: string;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  updateMode: 'update' | 'draft';
  optimizationOptions?: any;
  inContentImageRequest?: any;
  acfFields?: Record<string, any>; // ACF fields from WordPress post
  focusCategories?: string[]; // SEM task focus (from task checklist)
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] };
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  setPendingOptimization: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean, secondaryKeywords?: string[]) => Promise<void>) | null>;
}

export async function processGSCAndShowSelection(params: ProcessGSCAndShowSelectionParams): Promise<void> {
  const {
    gscResult,
    site,
    url,
    existingTitle,
    existingPost,
    resolved,
    existingContent,
    existingExcerpt,
    wordPressPosts = [],
    updateMode,
    optimizationOptions,
    inContentImageRequest,
    acfFields,
    focusCategories,
    semTaskContext,
    setGscQueriesForSelection,
    setIsKeywordSelectionOpen,
    setGscClusterAnalysis,
    setIsAnalyzingClusters,
    setPendingOptimization,
    setOptimizationProgress,
    continueOptimizationRef,
  } = params;

  setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: true }));

  let analysisTimeout: NodeJS.Timeout | null = null;
  let validQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }> = [];

  let clusterAnalysisPromiseResolve: ((analysis: any) => void) | null = null;
  const clusterAnalysisPromise = new Promise<any>((resolve) => {
    clusterAnalysisPromiseResolve = resolve;
  });

  // Single source of truth: full post from API → OpenRouter research model → primary keyword. No pattern matching, no fallbacks.
  let promptModifier: string | undefined;
  try {
    const fullPostPayload = buildFullPostPayload({
      resolved: resolved ?? existingPost ?? null,
      acfFields: acfFields ?? null,
      existingTitle,
      existingContent,
      existingExcerpt,
      pageUrl: url,
    });
    const apiKey = loadApiKey();
    const model = getResearchModel(site.id);
    if (apiKey?.trim() && model?.trim()) {
      const extracted = await extractPrimaryKeywordFromFullPostViaAI(fullPostPayload, { apiKey, model });
      if (extracted?.trim()) promptModifier = extracted.trim();
    }
  } catch (err) {
    console.warn("[GSC Processing] Full-post keyword extraction failed:", err);
  }
  const metaDescription = (resolved?.rank_math_description ?? existingExcerpt ?? '').trim() || undefined;
  const acfContext = (promptModifier || metaDescription)
    ? { promptModifier, metaDescription: metaDescription && metaDescription.length > 0 ? metaDescription : undefined }
    : undefined;

  const acfKeys = acfFields ? Object.keys(acfFields) : [];

  // Fallback when AI fails or times out: use page context (meta/modifier) to derive keyword, never first query when context exists; never blocklisted phrase
  const createSimpleFallback = (queries: typeof validQueries, sourceText?: string) => {
    const recommendedKeyword = sourceText?.trim()
      ? (deriveKeywordFromModifier(sourceText).trim() || "")
      : (firstNonBlocklistedQuery(queries) || queries[0]?.query || "");
    return {
      overallRecommendation: {
        recommendedKeyword,
        secondaryKeywords: [],
        topCluster: "Recommended",
        reasoning: sourceText ? "Derived from page meta/modifier" : "First non-blocklisted query"
      },
      clusters: [{ name: "Recommended", queries }]
    };
  };

  try {
    analysisTimeout = setTimeout(() => {
      setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));
      const sourceText = (promptModifier || metaDescription || '').trim();
      const fallbackAnalysis = createSimpleFallback(validQueries, sourceText || undefined);
      setGscClusterAnalysis((prev: any) => ({ ...prev, [site.id]: fallbackAnalysis }));
      if (clusterAnalysisPromiseResolve) {
        clusterAnalysisPromiseResolve(fallbackAnalysis);
      }
    }, 60000);

    validQueries = await processGSCQueriesAndAnalyze(
      gscResult,
      site,
      url,
      (clusterAnalysis) => {
        if (analysisTimeout) {
          clearTimeout(analysisTimeout);
          analysisTimeout = null;
        }
        try {
          setGscClusterAnalysis((prev: any) => ({ ...prev, [site.id]: clusterAnalysis }));
          setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));
          if (clusterAnalysisPromiseResolve) {
            clusterAnalysisPromiseResolve(clusterAnalysis);
          }
        } catch (stateError) {
          console.error('[Optimize Content] Error updating state:', stateError);
          setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));
        }
      },
      (error) => {
        if (analysisTimeout) {
          clearTimeout(analysisTimeout);
          analysisTimeout = null;
        }
        console.error('[Optimize Content] Error getting keyword recommendation:', error);
        setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));
        const sourceText = (promptModifier || metaDescription || '').trim();
        const fallbackAnalysis = createSimpleFallback(validQueries, sourceText || undefined);
        if (clusterAnalysisPromiseResolve) {
          clusterAnalysisPromiseResolve(fallbackAnalysis);
        }
      },
      acfContext
    );
  } catch (processError) {
    if (analysisTimeout) {
      clearTimeout(analysisTimeout);
      analysisTimeout = null;
    }
    console.error('[Optimize Content] Error processing GSC queries:', processError);
    setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));
    throw processError;
  }

  if (!Array.isArray(validQueries) || validQueries.length === 0) {
    throw new Error('No valid queries found for keyword selection');
  }

  setGscQueriesForSelection((prev: any) => ({ ...prev, [site.id]: validQueries }));
  setPendingOptimization((prev: any) => ({
    ...prev,
    [site.id]: {
      site,
      url,
      updateMode,
      gscResult,
      existingPost,
      resolved,
      existingTitle,
      existingContent,
      existingExcerpt,
      wordPressPosts,
      optimizationOptions,
      inContentImageRequest,
      acfFields,
      focusCategories,
      semTaskContext
    }
  }));

  updateOptimizationProgress(setOptimizationProgress, site.id, 'Getting keyword recommendation...', 30, `Analyzing ${validQueries.length} keywords...`);

  const clusterAnalysis = await clusterAnalysisPromise;
  let updatedClusterAnalysis = clusterAnalysis;

  const shouldAutoOptimize = optimizationOptions?.autoOptimize === true;

  if (shouldAutoOptimize) {
    updateOptimizationProgress(setOptimizationProgress, site.id, 'Auto-optimizing...', 35, 'Processing keyword recommendation...');
    
    const recommendedKeyword = updatedClusterAnalysis?.overallRecommendation?.recommendedKeyword;
    const secondaryKeywords = updatedClusterAnalysis?.overallRecommendation?.secondaryKeywords || [];
    let cleanKeyword = '';
    if (recommendedKeyword && typeof recommendedKeyword === 'string' && recommendedKeyword.trim().length > 0) {
      cleanKeyword = recommendedKeyword.trim();
      const sourceText = (promptModifier || metaDescription || '').trim();
      if (isBlocklistedPrimaryKeyword(cleanKeyword)) {
        cleanKeyword = sourceText ? deriveKeywordFromModifier(sourceText).trim() : firstNonBlocklistedQuery(validQueries);
      }
    }
    if (cleanKeyword) {
      // Extract secondary keywords (ensure they're strings and not empty)
      const cleanSecondaryKeywords = Array.isArray(secondaryKeywords)
        ? secondaryKeywords
            .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0)
            .map(kw => kw.trim())
            .slice(0, 5) // Limit to 5 secondary keywords
        : [];
      
      console.log(`[Auto-Optimize] Using AI-recommended keyword: "${cleanKeyword}"${cleanSecondaryKeywords.length > 0 ? ` + ${cleanSecondaryKeywords.length} secondary keywords` : ''}`);
      
      // USE THE AI-RECOMMENDED KEYWORD DIRECTLY - NO FILTERING, NO VALIDATION, NO EXTRACTION
      const selectedQuery = {
        query: cleanKeyword,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0
      };

      // Get related keywords from queries (exclude the primary keyword)
      const clusterKeywords = validQueries
        .map(q => q.query)
        .filter(q => q && q.toLowerCase().trim() !== cleanKeyword.toLowerCase().trim())
        .slice(0, 10) || [];

      if (!continueOptimizationRef || !continueOptimizationRef.current) {
        console.error('[Auto-Optimize] continueOptimizationRef or current is null/undefined', { 
          hasRef: !!continueOptimizationRef, 
          hasCurrent: !!(continueOptimizationRef?.current) 
        });
        throw new Error('Optimization continuation function not available');
      }
      
      updateOptimizationProgress(setOptimizationProgress, site.id, 'Continuing optimization...', 40, `Using keyword: ${cleanKeyword}`);
      try {
        await continueOptimizationRef.current(site.id, selectedQuery, clusterKeywords, setIsKeywordSelectionOpen, false, cleanSecondaryKeywords);
      } catch (continueError) {
        console.error('[Auto-Optimize] Error in continueOptimizationRef.current:', continueError);
        throw continueError;
      }
      return;
    } else {
      // Fallback: derive from page meta/modifier when available; otherwise first non-blocklisted query (never blocklisted phrase)
      if (validQueries.length > 0) {
        const sourceText = (promptModifier || metaDescription || '').trim();
        const fallbackKeyword = sourceText
          ? deriveKeywordFromModifier(sourceText).trim()
          : (firstNonBlocklistedQuery(validQueries) || validQueries[0]?.query || '').trim();
        if (!fallbackKeyword) {
          throw new Error('No keyword recommendation and derivation/fallback produced empty keyword');
        }
        const selectedQuery = {
          query: fallbackKeyword,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0
        };
        console.warn(`[Auto-Optimize] No AI recommendation, using fallback: "${fallbackKeyword}"`);
        updateOptimizationProgress(setOptimizationProgress, site.id, 'Continuing optimization...', 40, `Using fallback keyword: ${fallbackKeyword}`);
        if (!continueOptimizationRef || !continueOptimizationRef.current) {
          console.error('[Auto-Optimize] continueOptimizationRef or current is null/undefined (fallback)', {
            hasRef: !!continueOptimizationRef,
            hasCurrent: !!(continueOptimizationRef?.current)
          });
          throw new Error('Optimization continuation function not available');
        }
        try {
          await continueOptimizationRef.current(site.id, selectedQuery, [], setIsKeywordSelectionOpen, false, []);
        } catch (continueError) {
          console.error('[Auto-Optimize] Error in continueOptimizationRef.current (fallback):', continueError);
          throw continueError;
        }
        return;
      }
      throw new Error('No keyword recommendation and no valid queries available');
    }
  }

  updateOptimizationProgress(setOptimizationProgress, site.id, 'Select keyword...', 35, 'Please review and select a keyword to optimize');
  setIsKeywordSelectionOpen((prev: any) => ({ ...prev, [site.id]: true }));
}
