import { toast } from "sonner";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { getPromptModifierValueFromACFFields, getMetaDescriptionValueFromACFFields } from "@/lib/content-generation/acf-field-mapper";
import { extractKeywordFromContent, extractKeywordFromTitleOnly, inferPrimaryKeywordFromTitleAndMeta, saveGSCData, updateOptimizationProgress, setOptimizingState } from "./optimization-helpers";
import React from "react";

export interface HandleNoGSCDataParams {
  site: WordPressSite;
  url: string;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  existingPost: any;
  resolved: any;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  updateMode: 'update' | 'draft';
  optimizationOptions?: any;
  inContentImageRequest?: any;
  acfFields?: Record<string, any>; // ACF fields from WordPress post
  fileManager: OptimizationFileManager;
  setPendingOptimization: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean) => Promise<void>) | null>;
  /** When set (SEM "Fix it"), use as primary keyword instead of extracting from content */
  keywordHint?: string;
  /** Focus categories for selective optimization (SEM task list) */
  focusCategories?: string[];
  /** Full SEM task context for selective optimization */
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] };
}

export async function handleNoGSCData(params: HandleNoGSCDataParams): Promise<void> {
  const {
    site,
    url,
    existingTitle,
    existingContent,
    existingExcerpt,
    existingPost,
    resolved,
    wordPressPosts = [],
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
  } = params;

  const isEntityPage = !!site.entitySitemapUrl;
  const isSemTask = !!semTaskContext;

  // 1) ACF keyword_focus first (keyword_focus, seo_keyword_focus, or any variant)
  const acfKeywordFocus = acfFields
    ? (acfFields.keyword_focus ?? acfFields.seo_keyword_focus ?? '').trim()
    : '';
  let extractedKeyword = acfKeywordFocus.length > 0 ? acfKeywordFocus.substring(0, 80) : '';

  // 2) If no ACF keyword_focus, infer from title + meta + research model (use prompt modifier from ACF when present; discover field from JSON)
  if (!extractedKeyword) {
    const metaFromAcf = acfFields ? getMetaDescriptionValueFromACFFields(acfFields) : '';
    const promptModifierFromAcf = acfFields ? getPromptModifierValueFromACFFields(acfFields) : '';
    const inferred = await inferPrimaryKeywordFromTitleAndMeta(
      existingTitle,
      metaFromAcf || undefined,
      existingExcerpt,
      url,
      site.id,
      acfKeywordFocus || undefined,
      promptModifierFromAcf || undefined
    );
    if (inferred.length > 0) extractedKeyword = inferred;
  }

  // 3) Fallback: keywordHint (SEM) or existing extractors
  let keywordSourceLabel: string;
  if (acfKeywordFocus.length > 0 && extractedKeyword === acfKeywordFocus.substring(0, 80)) {
    keywordSourceLabel = 'ACF keyword_focus';
  } else if (extractedKeyword) {
    keywordSourceLabel = 'title/meta (AI)';
  } else {
    extractedKeyword = keywordHint?.trim()
      ? keywordHint.trim().substring(0, 80)
      : isSemTask
        ? await extractKeywordFromTitleOnly(existingTitle, url, site.id)
        : await extractKeywordFromContent(
            existingTitle,
            existingContent,
            url,
            isEntityPage,
            site.name,
            site.id
          );
    keywordSourceLabel = isSemTask ? 'title' : 'content';
  }

  // CRITICAL: Never pass empty keyword – continueOptimizationWithKeyword throws. Use URL slug or safe default.
  if (!extractedKeyword || typeof extractedKeyword !== 'string' || extractedKeyword.trim().length === 0) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter((s: string) => s.length > 0);
      const slug = pathSegments[pathSegments.length - 1] || 'page';
      extractedKeyword = slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    } catch {
      extractedKeyword = 'content optimization';
    }
    keywordSourceLabel = 'URL/fallback';
  }

  const mockKeyword = {
    query: extractedKeyword.trim().substring(0, 80),
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0
  };

  saveGSCData(fileManager, { success: false, error: 'No valid search queries found' }, url, isSemTask ? 'SEM task - optimizing selectively based on focus categories' : 'No valid search queries found - proceeding with content-based optimization');

  // Store focus categories and SEM context in pending optimization for selective optimization
  setPendingOptimization((prev: any) => ({
    ...prev,
    [site.id]: {
      site,
      url,
      updateMode,
      gscResult: { success: false, topKeyword: mockKeyword, queries: [] },
      existingPost,
      resolved,
      existingTitle,
      existingContent,
      existingExcerpt,
      wordPressPosts,
      optimizationOptions,
      inContentImageRequest,
      acfFields, // Store ACF fields in pending optimization
      focusCategories, // Store focus categories for selective optimization
      semTaskContext, // Store full SEM context
    }
  }));

  setIsKeywordSelectionOpen((prev: any) => ({ ...prev, [site.id]: false }));
  setIsAnalyzingClusters((prev: any) => ({ ...prev, [site.id]: false }));

  const focusNote = focusCategories && focusCategories.length > 0 
    ? ` Focus areas: ${focusCategories.join(', ')}`
    : '';
  updateOptimizationProgress(setOptimizationProgress, site.id, 'Starting optimization...', 30, `Using keyword extracted from ${keywordSourceLabel}: "${extractedKeyword}"${focusNote}`);

  if (continueOptimizationRef.current) {
    await continueOptimizationRef.current(site.id, mockKeyword, [], setIsKeywordSelectionOpen);
  } else {
    console.error('[Optimize Content] continueOptimizationWithKeyword not yet available');
    toast.error('Optimization function not ready. Please try again.');
  }
}

export async function handleTestModeACF(
  site: WordPressSite,
  resolved: any,
  existingPost: any,
  setOptimizationProgress: (prev: any) => any,
  setIsOptimizingContent: (prev: any) => any
): Promise<void> {
  toast.info('TEST MODE: Editing ACF fields only...');

  const postId = resolved?.id || existingPost?.id;
  if (!postId) {
    throw new Error('TEST MODE: Could not find post ID to update ACF fields');
  }

  updateOptimizationProgress(setOptimizationProgress, site.id, 'TEST MODE: Editing ACF fields...', 95, 'Updating ACF fields...');

  const { updateACFFields } = await import('@/lib/wordpress-acf-origin');
  const { getACFFieldsForPost } = await import('@/lib/wordpress-api/acf-discovery');
  const { discoverACFFieldMapping } = await import('@/lib/content-generation/acf-field-mapper');
  const { loadApiKey } = await import('@/lib/api');
  
  const postTypeEndpoint = resolved?.endpoint || existingPost?.postTypeEndpoint ||
    (resolved?.subtype === 'post' ? 'posts' : resolved?.subtype) || 'posts';

  // AGENTIC: Fetch actual ACF fields and discover field mapping
  const postType = resolved?.subtype || 'post';
  const acfResult = await getACFFieldsForPost(
    site,
    postId,
    postType,
    postTypeEndpoint
  );

  const existingAcfFields = acfResult.success && acfResult.fields ? acfResult.fields : {};
  
  // Use AI to discover field mapping
  const openRouterApiKey = loadApiKey();
  const fieldMapping = await discoverACFFieldMapping(
    existingAcfFields,
    postType,
    openRouterApiKey || '',
    site.siteUrl
  );

  // Use discovered mapping, with fallbacks for missing fields
  const fieldNames = {
    dateModifier: fieldMapping.dateModifier || 'date_modifier',
    promptModifier: fieldMapping.promptModifier || 'prompt_modifier'
  };

  const todayDate = new Date().toISOString().split('T')[0];
  const testMessage = 'TEST MODE: This post was updated in test mode with keyword "edmonton seo"';

  try {
    const acfUpdateResult = await updateACFFields(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      { 
        [fieldNames.dateModifier]: todayDate, 
        [fieldNames.promptModifier]: testMessage 
      },
      postType,
      postTypeEndpoint
    );

    if (acfUpdateResult.success) {
      toast.success('TEST MODE: ACF fields updated successfully!', {
        duration: 5000,
        description: `${fieldNames.dateModifier}: ${todayDate} | ${fieldNames.promptModifier}: ${testMessage.substring(0, 50)}...`
      });
      updateOptimizationProgress(setOptimizationProgress, site.id, 'TEST MODE: Complete', 100, 'ACF fields updated successfully');
    } else {
      const errorMessage = acfUpdateResult.failed && acfUpdateResult.failed.length > 0
        ? acfUpdateResult.failed.map((f: any) => `${f.field}: ${f.error}`).join('; ')
        : (acfUpdateResult.error || 'Unknown error');
      toast.error(`TEST MODE: Failed to update ACF fields: ${errorMessage}`, { duration: 10000 });
      updateOptimizationProgress(setOptimizationProgress, site.id, 'TEST MODE: Error', 0, errorMessage);
    }
  } catch (acfError) {
    console.error('[Optimize Content] TEST MODE: Error updating ACF fields:', acfError);
    toast.error(`TEST MODE: Error updating ACF fields: ${acfError instanceof Error ? acfError.message : 'Unknown error'}`, { duration: 8000 });
    updateOptimizationProgress(setOptimizationProgress, site.id, 'TEST MODE: Error', 0, acfError instanceof Error ? acfError.message : 'Unknown error');
  } finally {
    setOptimizingState(setIsOptimizingContent, site.id, false);
  }
}
