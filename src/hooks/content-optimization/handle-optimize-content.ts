import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { resolveWordPressUrls, getWordPressPostContent, fetchGSCPagePerformance } from "@/lib/wordpress-api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { processGSCQueriesAndAnalyze } from "@/lib/content-optimization-helpers";
import {
  updateOptimizationProgress,
  setOptimizingState,
  handleOptimizationError,
  validateGSCData,
  savePostData,
  saveGSCData,
  subtypeToEndpoint,
  findEndpointFromSitemap,
} from "./optimization-helpers";
import { handleNoGSCData, handleTestModeACF } from "./handle-optimize-helpers";
import { runSEMFixOnly } from "./sem-fix-only";
import { processGSCAndShowSelection } from "./gsc-processing";
import type { PendingOptimization } from "./use-optimization-state";
import { getACFFieldsForPost } from "@/lib/wordpress-api/acf-discovery";
import { getPromptModifierValueFromACFFields } from "@/lib/content-generation/acf-field-mapper";
import { interpretPromptModifier } from "@/lib/prompt-modifier-interpreter";
import React from "react";

/** Derive a keyword hint from SEM task suggestedAction (e.g. "Optimize for 'zebra shades'" -> "zebra shades"). */
function deriveKeywordHintFromSuggestedAction(suggestedAction: string): string | undefined {
  const t = suggestedAction.trim();
  if (!t) return undefined;
  const quoted = t.match(/for\s+['"]([^'"]+)['"]/i) || t.match(/['"]([^'"]+)['"]/);
  if (quoted?.[1]) return quoted[1].trim().substring(0, 80);
  if (t.length <= 80 && !/^fix\s+(title|meta|link)/i.test(t)) return t;
  return undefined;
}

interface HandleOptimizeContentParams {
  site: WordPressSite;
  url: string;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  updateMode: 'update' | 'draft';
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  skipOnNoGSC: boolean;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    featuredImageType?: 'ai-generated' | 'google-maps';
    autoOptimize?: boolean;
    testMode?: boolean;
    hasEntity?: boolean;
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
  };
  inContentImageRequest?: { imageType: string; userPrompt?: string };
  resolvedPost?: { id: number; subtype: string; link?: string; slug?: string; endpoint?: string };
  testMode: boolean;
  /** When set (e.g. SEM "Fix it"), skip GSC and use suggestedAction + checklist for minimal fix flow */
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] };
  // State setters
  setIsOptimizingContent: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  setOptimizationFileManagers: (prev: any) => any;
  setPendingOptimization: (prev: any) => any;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean) => Promise<void>) | null>;
}

export type HandleOptimizeContentResult = { optimizationChanges: Record<string, unknown> } | void | undefined;

export async function handleOptimizeContent(params: HandleOptimizeContentParams): Promise<HandleOptimizeContentResult> {
  const {
    site,
    url,
    wordPressPosts = [],
    updateMode,
    setGscQueriesForSelection,
    setIsKeywordSelectionOpen,
    setGscClusterAnalysis,
    setIsAnalyzingClusters,
    skipOnNoGSC,
    optimizationOptions,
    inContentImageRequest: initialInContentImageRequest,
    resolvedPost,
    testMode,
    semTaskContext,
    setIsOptimizingContent,
    setOptimizationProgress,
    setOptimizationFileManagers,
    setPendingOptimization,
    optimizationFileManagers,
    continueOptimizationRef,
  } = params;
  
  let inContentImageRequest = initialInContentImageRequest;

  const isTestMode = testMode === true || optimizationOptions?.testMode === true;

  if (!url || !url.trim()) {
    toast.error('Please enter a URL to optimize');
    return;
  }

  try {
    setOptimizingState(setIsOptimizingContent, site.id, true);
    updateOptimizationProgress(setOptimizationProgress, site.id, 'Fetching content...', 10);
  } catch (stateError) {
    console.error('[Optimize Content] Error setting initial state:', stateError);
    toast.error('Failed to initialize optimization. Please try again.');
    return;
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      throw new Error('OpenRouter API key not found. Please set it in settings.');
    }

    toast.info('Fetching existing post content...');
    updateOptimizationProgress(setOptimizationProgress, site.id, 'Fetching existing post content...', 10, 'Resolving URL...');

    // Resolve post URL
    let resolved;
    const hasRealPost = resolvedPost?.id && resolvedPost?.endpoint;

    if (hasRealPost) {
      resolved = {
        id: resolvedPost.id,
        subtype: resolvedPost.subtype,
        url: url,
        link: resolvedPost.link || url,
        slug: resolvedPost.slug
      };
    }

    if (!resolved) {
      let knownEndpoint = site.manualEndpoint || resolvedPost?.endpoint || subtypeToEndpoint(resolvedPost?.subtype);
      if (!knownEndpoint) {
        knownEndpoint = findEndpointFromSitemap(url, site);
      }

      const resolveResult = await resolveWordPressUrls(
        site.siteUrl,
        site.username,
        site.appPassword,
        [url],
        site.entitySitemapUrl || undefined,
        knownEndpoint
      );

      if (resolveResult.resolved.length === 0) {
        throw new Error(`Could not resolve URL to a WordPress post. ${resolveResult.unresolvable[0]?.reason || 'Please check the URL and ensure the post exists.'}`);
      }

      resolved = resolveResult.resolved[0];
    }

    // Fetch post content
    const postContentResult = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      undefined,
      [{ id: resolved.id, subtype: resolved.subtype }]
    );

    if (postContentResult.error) {
      throw new Error(postContentResult.error);
    }

    if (postContentResult.errors && postContentResult.errors.length > 0) {
      const errorDetails = postContentResult.errors.map((e: any) => {
        const obj = e.resolvedObject || e;
        return `Failed to fetch ${obj.subtype || 'post'}/${obj.id}: ${e.error || 'Unknown error'}`;
      }).join('; ');
      throw new Error(`Failed to fetch post content: ${errorDetails}`);
    }

    if (!postContentResult.posts || postContentResult.posts.length === 0) {
      const resolvedInfo = `ID: ${resolved.id}, Type: ${resolved.subtype}`;
      throw new Error(`Failed to fetch post content for ${resolvedInfo}. Please verify the post exists and you have permission to access it.`);
    }

    const existingPost = postContentResult.posts[0];
    const existingTitle = existingPost.title || '';
    const existingContent = existingPost.content || '';
    const existingExcerpt = existingPost.excerpt || '';

    // Initialize file manager
    let fileManager = new OptimizationFileManager();
    setOptimizationFileManagers((prev: any) => ({ ...prev, [site.id]: fileManager }));
    savePostData(fileManager, existingPost, existingPost.id?.toString() || 'post');

    // Handle test mode
    if (isTestMode) {
      await handleTestModeACF(site, resolved, existingPost, setOptimizationProgress, setIsOptimizingContent);
      return;
    }

    // Read ACF fields and interpret seo_prompt_modifier
    let acfFields: Record<string, any> = {};
    let interpretedModifier: Awaited<ReturnType<typeof interpretPromptModifier>> | null = null;
    
    try {
      updateOptimizationProgress(setOptimizationProgress, site.id, 'Reading ACF fields...', 12, 'Fetching ACF fields from WordPress...');
      
      const postTypeEndpoint = resolved?.endpoint || 
        (resolved?.subtype === 'post' ? 'posts' : resolved?.subtype) || 
        'posts';
      
      const acfResult = await getACFFieldsForPost(
        site,
        resolved.id,
        resolved.subtype || 'post',
        postTypeEndpoint
      );

      if (acfResult.success && acfResult.fields) {
        acfFields = acfResult.fields;
        console.log('[Optimize Content] Retrieved ACF fields:', Object.keys(acfFields));

        // Discover prompt modifier from WordPress JSON (no hardcoded field names)
        const promptModifier = getPromptModifierValueFromACFFields(acfFields);
        if (promptModifier && typeof promptModifier === 'string' && promptModifier.trim().length > 0) {
          updateOptimizationProgress(setOptimizationProgress, site.id, 'Interpreting prompt modifier...', 13, 'Analyzing optimization instructions...');
          interpretedModifier = await interpretPromptModifier(promptModifier, site.id);
          console.log('[Optimize Content] Prompt modifier interpretation:', interpretedModifier);
        } else {
          console.log('[Optimize Content] No prompt modifier field found or empty - proceeding with full optimization');
        }
      } else {
        console.warn('[Optimize Content] Failed to read ACF fields or no fields found:', acfResult.error);
      }
    } catch (acfError) {
      console.warn('[Optimize Content] Error reading ACF fields, proceeding with full optimization:', acfError);
      // Continue with full optimization if ACF read fails
    }

    // Apply interpreted actions from seo_prompt_modifier
    if (interpretedModifier) {
      // Handle skip instruction
      if (interpretedModifier.shouldSkipOptimization) {
        toast.info('Optimization skipped per prompt modifier instruction', {
          description: interpretedModifier.interpretedInstruction
        });
        updateOptimizationProgress(setOptimizationProgress, site.id, 'Optimization skipped', 100, interpretedModifier.interpretedInstruction);
        setOptimizingState(setIsOptimizingContent, site.id, false);
        return;
      }

      // Handle image instructions
      if (interpretedModifier.shouldAddImages && !inContentImageRequest) {
        // Enable image generation if not already set
        inContentImageRequest = { imageType: 'infographic', userPrompt: '' };
        console.log('[Optimize Content] Enabled image generation based on prompt modifier');
        toast.info('Image generation enabled per prompt modifier');
      }

      if (interpretedModifier.shouldSkipImages) {
        // Disable image generation
        inContentImageRequest = undefined;
        // Also disable in optimization options if present
        if (optimizationOptions) {
          optimizationOptions.optimizeFeaturedImage = false;
        }
        console.log('[Optimize Content] Disabled image generation based on prompt modifier');
        toast.info('Image generation disabled per prompt modifier');
      }
    }

    // Minimal SEM "Fix it" path: API → OpenRouter (checklist) → upload back. No GSC, DataForSEO, or blueprint.
    if (skipOnNoGSC && semTaskContext) {
      toast.info("Applying SEM checklist...");
      const semResult = await runSEMFixOnly({
        site,
        url,
        existingPost,
        resolved,
        existingTitle,
        existingContent,
        existingExcerpt,
        semTaskContext: {
          suggestedAction: semTaskContext.suggestedAction,
          checklist: semTaskContext.checklist ?? [],
          promptModifier: semTaskContext.promptModifier,
          focusCategories: semTaskContext.focusCategories,
        },
        acfFields,
        setOptimizationProgress,
        setPendingOptimization,
        setIsOptimizingContent,
      });
      return semResult ? { optimizationChanges: semResult.optimizationChanges } : undefined;
    }

    // When skipOnNoGSC is true: SEM fix flow OR retry after GSC already returned no keywords. Never skip GSC on first attempt (Death Star always pings GSC first).
    if (skipOnNoGSC) {
      const focusCategories = semTaskContext?.focusCategories || [];
      toast.info(`No GSC keywords – optimizing with AI (focus: ${focusCategories.join(', ') || 'selected areas'})...`);
      const keywordHint = semTaskContext?.suggestedAction
        ? deriveKeywordHintFromSuggestedAction(semTaskContext.suggestedAction)
        : undefined;
      updateOptimizationProgress(setOptimizationProgress, site.id, 'Optimizing selectively (no GSC)...', 25, keywordHint ? `Task focus: ${keywordHint}` : `Focus areas: ${focusCategories.join(', ') || 'all'}`);
      await handleNoGSCData({
        site,
        url,
        existingTitle,
        existingContent,
        existingExcerpt,
        existingPost,
        resolved,
        wordPressPosts,
        updateMode,
        optimizationOptions,
        inContentImageRequest,
        acfFields,
        fileManager,
        setPendingOptimization,
        setIsKeywordSelectionOpen,
        setIsAnalyzingClusters,
        setOptimizationProgress,
        continueOptimizationRef,
        keywordHint,
        focusCategories,
        semTaskContext,
      });
      return;
    }

    // Always try GSC first (Death Star / every update). Fallback to AI only when GSC returns no keywords.
    toast.info('Analyzing GSC performance data...');
    updateOptimizationProgress(setOptimizationProgress, site.id, 'Analyzing GSC performance data...', 25, 'Fetching page performance...');

    const now = new Date();
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endDateUTC = new Date(nowUTC);
    endDateUTC.setUTCDate(endDateUTC.getUTCDate() - 3);
    const startDateUTC = new Date(endDateUTC);
    startDateUTC.setUTCMonth(startDateUTC.getUTCMonth() - 3);
    const startDateStr = startDateUTC.toISOString().split('T')[0];
    const endDateStr = endDateUTC.toISOString().split('T')[0];

    console.log('[Optimize Content] Calling GSC API first (fetching page performance)...', { url: url?.substring(0, 60), startDateStr, endDateStr });
    let gscResult;
    try {
      gscResult = await fetchGSCPagePerformance(site.siteUrl, url, startDateStr, endDateStr);
      const queryCount = gscResult?.queries?.length ?? 0;
      console.log('[Optimize Content] GSC API response received', { queryCount, success: gscResult?.success });
    } catch (error) {
      // Check if error indicates "no queries found" (backend returns 400 for this)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNoQueriesError = errorMessage.toLowerCase().includes('no valid search queries found') || 
                               errorMessage.toLowerCase().includes('no search traffic') ||
                               errorMessage.toLowerCase().includes('page may not have received');
      
      if (isNoQueriesError) {
        // ALWAYS continue without GSC data - update anyway using AI to analyze title
        console.log('[Optimize Content] No GSC data found - proceeding with AI-based optimization from title');
        const keywordHint = semTaskContext?.suggestedAction
          ? deriveKeywordHintFromSuggestedAction(semTaskContext.suggestedAction)
          : undefined;
        const focusCategories = semTaskContext?.focusCategories;
        await handleNoGSCData({
          site,
          url,
          existingTitle,
          existingContent,
          existingExcerpt,
          existingPost,
          resolved,
          wordPressPosts,
          updateMode,
          optimizationOptions,
          inContentImageRequest,
          acfFields, // Pass ACF fields
          fileManager,
          setPendingOptimization,
          setIsKeywordSelectionOpen,
          setIsAnalyzingClusters,
          setOptimizationProgress,
          continueOptimizationRef,
          keywordHint,
          focusCategories,
          semTaskContext,
        });
        return;
      }
      
      // For other errors (backend down, network, etc): GSC call failed (not the optional 7258 debug ingest)
      console.error('[Optimize Content] GSC API call failed:', errorMessage);
      throw error;
    }

    const { hasValidData, isNoQueriesError: isNoQueries } = validateGSCData(gscResult);

    if (!gscResult.success && !isNoQueries) {
      throw new Error(gscResult.error || 'Failed to fetch GSC performance data. Please check your GSC connection and try again.');
    }

    // Handle no GSC data - ALWAYS update anyway using AI to analyze title
    if (!hasValidData) {
      console.log('[Optimize Content] No valid GSC data - proceeding with AI-based optimization from title');
      const keywordHint = semTaskContext?.suggestedAction
        ? deriveKeywordHintFromSuggestedAction(semTaskContext.suggestedAction)
        : undefined;
      const focusCategories = semTaskContext?.focusCategories;
      await handleNoGSCData({
        site,
        url,
        existingTitle,
        existingContent,
        existingExcerpt,
        existingPost,
        resolved,
        wordPressPosts,
        updateMode,
        optimizationOptions,
        inContentImageRequest,
        acfFields, // Pass ACF fields
        fileManager,
        setPendingOptimization,
        setIsKeywordSelectionOpen,
        setIsAnalyzingClusters,
        setOptimizationProgress,
        continueOptimizationRef,
        keywordHint,
        focusCategories,
        semTaskContext,
      });
      return;
    }

    // Process GSC queries
    fileManager = optimizationFileManagers[site.id] || fileManager;
    if (!optimizationFileManagers[site.id]) {
      setOptimizationFileManagers((prev: any) => ({ ...prev, [site.id]: fileManager }));
    }

    saveGSCData(fileManager, gscResult, url);

    try {
      await processGSCAndShowSelection({
        gscResult,
        site,
        url,
        existingTitle,
        existingPost,
        resolved,
        existingContent,
        existingExcerpt,
        wordPressPosts,
        updateMode,
        optimizationOptions,
        inContentImageRequest,
        acfFields,
        focusCategories: semTaskContext?.focusCategories,
        semTaskContext,
        setGscQueriesForSelection,
        setIsKeywordSelectionOpen,
        setGscClusterAnalysis,
        setIsAnalyzingClusters,
        setPendingOptimization,
        setOptimizationProgress,
        continueOptimizationRef,
      });
    } catch (processError) {
      // No GSC/keyword errors: proceed with AI analysis instead of failing or skipping
      const msg = processError instanceof Error ? processError.message : String(processError);
      const noQueriesOrKeyword = /no valid (search )?queries|no keyword recommendation|no valid queries (found|available)|selected keyword is invalid|primary keyword is empty/i.test(msg);
      if (noQueriesOrKeyword) {
        console.log('[Optimize Content] GSC/keyword path failed - proceeding with AI-based optimization from title/content');
        const keywordHint = semTaskContext?.suggestedAction
          ? deriveKeywordHintFromSuggestedAction(semTaskContext.suggestedAction)
          : undefined;
        const focusCategories = semTaskContext?.focusCategories;
        await handleNoGSCData({
          site,
          url,
          existingTitle,
          existingContent,
          existingExcerpt,
          existingPost,
          resolved,
          wordPressPosts,
          updateMode,
          optimizationOptions,
          inContentImageRequest,
          acfFields,
          fileManager,
          setPendingOptimization,
          setIsKeywordSelectionOpen,
          setIsAnalyzingClusters,
          setOptimizationProgress,
          continueOptimizationRef,
          keywordHint,
          focusCategories,
          semTaskContext,
        });
        return;
      }
      throw processError;
    }

  } catch (error) {
    handleOptimizationError(
      error,
      site.id,
      setIsOptimizingContent,
      setOptimizationProgress,
      setIsAnalyzingClusters
    );
    throw error;
  }
}


interface HandleNoGSCDataParams {
  site: WordPressSite;
  url: string;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  existingPost: any;
  resolved: any;
  updateMode: 'update' | 'draft';
  optimizationOptions?: any;
  inContentImageRequest?: any;
  fileManager: OptimizationFileManager;
  setPendingOptimization: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean) => Promise<void>) | null>;
}

