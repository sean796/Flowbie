import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import type { KeywordAIAnalysis, KeywordData } from "@/lib/keyword-types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { cleanTitleForNonEntity, generateLocalKeywordForEntityPage } from "@/lib/content-optimization-helpers";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  updateOptimizationProgress,
  determineEntity,
  saveSelectedKeyword,
  saveKeywordResearch,
} from "./optimization-helpers";
import { getPublishedPosts } from "@/lib/wordpress-api";
import { performKeywordResearchFlow, autoSelectOptimizationItems, updateKeywordResearchFile } from "./keyword-research-flow";
import { generateBlueprintFlow, generateAndUploadFlow } from "./blueprint-content-flow";
import type { PendingOptimization, BulkOptimizationState } from "./use-optimization-state";
import React from "react";
import { isBlocklistedPrimaryKeyword, deriveKeywordFromModifier, firstNonBlocklistedQuery } from "@/lib/gsc-simple-keyword-recommendation";
import { getPromptModifierValueFromACFFields } from "@/lib/content-generation/acf-field-mapper";

interface ContinueOptimizationParams {
  siteId: string;
  selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number };
  clusterKeywords?: string[];
  setIsKeywordSelectionOpen?: (prev: any) => any;
  testMode: boolean;
  secondaryKeywords?: string[]; // Secondary keywords from AI (NOT researched via DataForSEO)
  pendingOptimization: Record<string, PendingOptimization>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  setPendingOptimization: (prev: any) => any;
  setOptimizationFileManagers: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  setIsOptimizingContent: (prev: any) => any;
  setBulkOptimizationState: (prev: any) => any;
}

export async function continueOptimizationWithKeyword(params: ContinueOptimizationParams): Promise<void> {
  const {
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
  } = params;

  if (!selectedKeyword || typeof selectedKeyword !== 'object') {
    throw new Error('Invalid keyword selected. Please try again.');
  }

  if (!selectedKeyword.query || typeof selectedKeyword.query !== 'string' || selectedKeyword.query.trim().length === 0) {
    throw new Error('Selected keyword is invalid. Please select a valid keyword.');
  }

  const pending = pendingOptimization[siteId];
  if (!pending) {
    throw new Error('Optimization data not found. Please try again.');
  }

  const { site, url, updateMode, gscResult, existingPost, resolved, existingTitle, existingContent, existingExcerpt, optimizationOptions, inContentImageRequest, acfFields, cleanedTitle: pendingCleanedTitle, focusCategories: pendingFocus, semTaskContext } = pending;
  // Use focus from task when top-level focus wasn't set (avoids race and ensures checklist drives options)
  const focusCategories = (pendingFocus && pendingFocus.length > 0)
    ? pendingFocus
    : (semTaskContext?.focusCategories ?? []);
  
  // Determine what to optimize based on focus categories (SEM task list)
  const isSemTask = !!semTaskContext;
  const shouldOptimizeTitle = !isSemTask || !focusCategories.length || focusCategories.some(cat => 
    cat.includes('Title') || cat.includes('meta description')
  );
  const shouldOptimizeMeta = !isSemTask || !focusCategories.length || focusCategories.some(cat =>
    cat.includes('Title') || cat.includes('meta description')
  );
  const shouldOptimizeContent = !isSemTask || !focusCategories.length || focusCategories.some(cat =>
    cat.includes('Content') || cat.includes('keyword optimization')
  );
  const shouldOptimizeSchema = !isSemTask || !focusCategories.length || focusCategories.some(cat =>
    cat.includes('Schema') || cat.includes('FAQ')
  );
  const shouldOptimizeLinks = !isSemTask || !focusCategories.length || focusCategories.some(cat =>
    cat.includes('link') || cat.includes('Broken')
  );
  
  // CRITICAL: Override optimizationOptions with calculated values from focus categories (or task checklist)
  // This ensures SEM task list checklist drives what gets fixed – no double list
  const finalOptimizationOptions = isSemTask && focusCategories.length > 0
    ? {
        ...optimizationOptions, // Start with original options
        optimizeTitle: shouldOptimizeTitle, // Override with calculated value
        optimizeMeta: shouldOptimizeMeta, // Override with calculated value
        optimizeExcerpt: shouldOptimizeMeta, // Excerpt goes with meta
        optimizeContent: shouldOptimizeContent, // Override with calculated value
        optimizeFeaturedImage: optimizationOptions?.optimizeFeaturedImage || false,
      }
    : optimizationOptions; // Use original options for non-SEM tasks

  // Skip full pipeline if only title/meta optimization needed
  const isTitleMetaOnly = isSemTask && focusCategories && focusCategories.length > 0 && 
    focusCategories.every(cat => cat.includes('Title') || cat.includes('meta description')) &&
    !shouldOptimizeContent && !shouldOptimizeSchema && !shouldOptimizeLinks;

  // GSC FIRST: When we have GSC data and a keyword from the GSC list, use it. Only use prompt-modifier when there is no GSC selection (no-GSC path).
  const promptMod = acfFields ? getPromptModifierValueFromACFFields(acfFields) : '';
  const fromModifier = (promptMod && promptMod.trim()) ? deriveKeywordFromModifier(promptMod.trim()).trim() : '';
  const gscQueries = gscResult?.queries || [];
  const hasGSCData = Array.isArray(gscQueries) && gscQueries.length > 0;
  const gscSelectedQuery = (selectedKeyword?.query || '').trim();
  let primaryKeyword: string;
  if (hasGSCData && gscSelectedQuery) {
    primaryKeyword = gscSelectedQuery;
  } else if (fromModifier.length > 0) {
    primaryKeyword = fromModifier;
  } else {
    primaryKeyword = gscSelectedQuery || fromModifier;
  }

  // Never use blocklisted phrase in bulk state or Death Star UI (e.g. "extra text field", "text field" – UI/ACF labels only)
  if (primaryKeyword && isBlocklistedPrimaryKeyword(primaryKeyword)) {
    const metaDesc = (resolved?.rank_math_description ?? existingExcerpt ?? '').trim();
    const sourceText = (promptMod || metaDesc || '').trim();
    const replacement = sourceText ? deriveKeywordFromModifier(sourceText).trim() : firstNonBlocklistedQuery(
      (gscResult?.queries || []).filter((q: any) => q?.query).map((q: any) => ({ query: String(q.query).trim(), clicks: q.clicks || 0, impressions: q.impressions || 0, ctr: q.ctr || 0, position: q.position || 0 }))
    );
    if (replacement && !isBlocklistedPrimaryKeyword(replacement)) primaryKeyword = replacement;
  }
  // Final fallback: if still blocklisted (e.g. modifier was literally "extra text field"), use title or URL slug
  if (primaryKeyword && isBlocklistedPrimaryKeyword(primaryKeyword)) {
    const fromTitle = (existingTitle || '').trim().replace(/<[^>]+>/g, '').trim();
    const titleDerived = fromTitle ? deriveKeywordFromModifier(fromTitle).trim() : '';
    if (titleDerived && !isBlocklistedPrimaryKeyword(titleDerived)) {
      primaryKeyword = titleDerived;
    } else {
      try {
        const urlObj = new URL(url);
        const slug = urlObj.pathname.split('/').filter(Boolean).pop() || 'page';
        primaryKeyword = slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      } catch {
        primaryKeyword = 'content optimization';
      }
    }
  }

  if (!primaryKeyword || primaryKeyword.length === 0) {
    throw new Error('Primary keyword is empty. Please select a valid keyword.');
  }

  // Extract and clean entity
  const { entity: extractedEntity, cleanedTitle: entityCleanedTitle } = await extractAndCleanEntity(
    optimizationOptions?.hasEntity,
    existingTitle,
    url,
    primaryKeyword,
    pendingCleanedTitle
  );

  let finalTitle = entityCleanedTitle || existingTitle || primaryKeyword;

  await updateBulkStateWithEntity(site, url, primaryKeyword, extractedEntity, finalTitle, setBulkOptimizationState);

  // Update pending optimization
  setPendingOptimization((prev: any) => {
    const pending = prev[url];
    if (pending) {
      return {
        ...prev,
        [url]: {
          ...pending,
          cleanedTitle: finalTitle,
          extractedEntity: extractedEntity
        }
      };
    }
    return prev;
  });

  // Entity page keyword generation only when we didn't get primary from GSC or prompt modifier, and not using AI recommendation
  const isAIRecommended = clusterKeywords && clusterKeywords.length > 0;
  const usedGSC = hasGSCData && gscSelectedQuery && primaryKeyword === gscSelectedQuery;
  const fromPromptModifier = fromModifier.length > 0 && primaryKeyword === fromModifier;

  if (site.entitySitemapUrl && existingTitle && !isAIRecommended && !fromPromptModifier && !usedGSC) {
    primaryKeyword = await generateEntityPageKeyword(site, existingTitle, url, primaryKeyword);
  } else if (usedGSC) {
    console.log(`[Continue Optimization] Using GSC-selected keyword "${primaryKeyword}"`);
  } else if (fromPromptModifier) {
    console.log(`[Continue Optimization] Using prompt-modifier-derived keyword "${primaryKeyword}" (no GSC selection)`);
  } else if (isAIRecommended) {
    console.log(`[Continue Optimization] Using AI-recommended keyword "${primaryKeyword}"`);
  }

  if (setIsKeywordSelectionOpen) {
    setIsKeywordSelectionOpen((prev: any) => ({ ...prev, [siteId]: false }));
  }

  const optimizationStartTime = Date.now();

  let fileManager = optimizationFileManagers[siteId];
  if (!fileManager) {
    fileManager = new OptimizationFileManager();
    setOptimizationFileManagers((prev: any) => ({ ...prev, [siteId]: fileManager }));
  }

  saveSelectedKeyword(fileManager, primaryKeyword, selectedKeyword);

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      throw new Error('OpenRouter API key not found. Please set it in settings.');
    }

    // For title/meta-only optimization, skip keyword research and blueprint generation
    let keywordData: KeywordData | null = null;
    let aiAnalysis: KeywordAIAnalysis | null = null;
    let paaResult: any = null;
    let paaRawResponse: any = null;
    let relatedKeywords: string[] = [];
    let selectedKeywords: string[] = [];
    let selectedH2Sections: string[] = [];
    let selectedPeopleAlsoAsk: any[] = [];
    let selectedResearchLinks: string[] = [];
    let finalPrimaryKeyword = primaryKeyword;
    let finalSelectedKeywords: string[] = [];

    if (!isTitleMetaOnly) {
      // Perform keyword research only if content optimization is needed
      const researchResult = await performKeywordResearchFlow(
        primaryKeyword,
        selectedKeyword,
        gscResult,
        clusterKeywords,
        site,
        siteId,
        testMode,
        setOptimizationProgress
      );
      keywordData = researchResult.keywordData;
      aiAnalysis = researchResult.aiAnalysis;
      paaResult = researchResult.paaResult;
      paaRawResponse = researchResult.paaRawResponse;
      relatedKeywords = researchResult.relatedKeywords || [];

      // Auto-select items
      const selectionResult = await autoSelectOptimizationItems(
        aiAnalysis,
        keywordData,
        primaryKeyword,
        clusterKeywords,
        testMode
      );
      selectedKeywords = selectionResult.selectedKeywords;
      selectedH2Sections = selectionResult.selectedH2Sections;
      selectedPeopleAlsoAsk = selectionResult.selectedPeopleAlsoAsk;
      selectedResearchLinks = selectionResult.selectedResearchLinks;
      // PROMPT MODIFIER WINS: If primary came from prompt modifier, never replace with DataForSEO/AI selection
      finalPrimaryKeyword = fromModifier.length > 0 ? primaryKeyword : (selectionResult.updatedPrimaryKeyword || primaryKeyword);

      // Keep Death Star and bulk state in sync with the keyword actually used for content/meta/ACF
      await updateBulkStateWithEntity(site, url, finalPrimaryKeyword, extractedEntity, finalTitle, setBulkOptimizationState);

      // Add secondary keywords to selectedKeywords (AFTER DataForSEO research)
      finalSelectedKeywords = secondaryKeywords && secondaryKeywords.length > 0
        ? [...new Set([...selectedKeywords, ...secondaryKeywords])]
        : selectedKeywords;

      // Save keyword research
      saveKeywordResearch(fileManager, finalPrimaryKeyword, {
        primaryKeyword: finalPrimaryKeyword,
        gscMetrics: selectedKeyword,
        keywordData,
        aiAnalysis,
        peopleAlsoAsk: paaResult.items || [],
        relatedGSCKeywords: relatedKeywords || [],
        selectedKeywords: finalSelectedKeywords,
        selectedH2Sections,
        selectedPeopleAlsoAsk,
        selectedResearchLinks,
      });

      // Update keyword research file with selected items
      updateKeywordResearchFile(fileManager, siteId, finalSelectedKeywords, selectedH2Sections, selectedPeopleAlsoAsk, selectedResearchLinks, setOptimizationFileManagers);

      // Ensure blueprint/content use finalPrimaryKeyword: overwrite keywordData.keyword so template and ACF stay in sync
      if (keywordData && keywordData.keyword !== finalPrimaryKeyword) {
        keywordData = { ...keywordData, keyword: finalPrimaryKeyword };
      }
    } else {
      // Title/meta only - minimal setup
      console.log('[Continue Optimization] Title/meta only - skipping keyword research and blueprint generation');
      updateOptimizationProgress(setOptimizationProgress, siteId, 'Optimizing title and meta only...', 50, `Focus: ${focusCategories?.join(', ') || 'title & meta'}`);
    }

    // Use provided WordPress posts if available, otherwise fetch them (EXACT same as bulk prompt generator)
    let wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
    let wordPressRAGContext = '';

    if (pending.wordPressPosts && pending.wordPressPosts.length > 0) {
      // Use provided posts from bulk optimization
      console.log(`[Continue Optimization] Using ${pending.wordPressPosts.length} provided WordPress posts`);
      wordPressPosts = pending.wordPressPosts;
    } else {
      // Fetch posts simply like bulk prompt generator - NO AI filtering, NO RAG context
      if (site.username && site.appPassword) {
        try {
          updateOptimizationProgress(setOptimizationProgress, siteId, 'Fetching WordPress posts...', 55, 'Loading posts from WordPress REST API...');
          const publishedResult = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
          
          if (publishedResult.posts && publishedResult.posts.length > 0) {
            // Helper functions (same as bulk prompt generator)
            const normalizeDomain = (url: string): string =>
              url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            
            const getRootDomain = (domain: string): string => {
              const parts = domain.split('.');
              if (parts.length >= 2) {
                return parts.slice(-2).join('.');
              }
              return domain;
            };
            
            const siteDomain = normalizeDomain(site.siteUrl);
            const siteRootDomain = getRootDomain(siteDomain);
            
            wordPressPosts = publishedResult.posts
              .map((p: any) => ({
                id: p.id,
                slug: p.slug || '',
                title: (typeof p.title === 'object' && p.title?.rendered) ? p.title.rendered : (p.title || ''),
                excerpt: ((typeof p.excerpt === 'object' && p.excerpt?.rendered) ? p.excerpt.rendered : (p.excerpt || '')).replace(/<[^>]+>/g, '').substring(0, 200),
                link: p.link || p.slug || '',
                date_gmt: p.date_gmt || (p as any).date || ''
              }))
              .filter((p: any) => {
                // ROBUST SAFEGUARD: Trust posts fetched from WordPress API
                // Only filter if there's a clear security concern (completely different root domain)
                
                if (!p.link) {
                  console.warn('[WordPress] Post missing link field, keeping for safety:', p.id);
                  return true; // Keep posts without links rather than reject
                }
                
                const postDomain = normalizeDomain(p.link);
                const postRootDomain = getRootDomain(postDomain);
                
                // Only reject if root domain is completely different (security safeguard)
                // Otherwise, trust the API response
                const isCompletelyDifferent = postRootDomain !== siteRootDomain &&
                                             !postDomain.includes(siteRootDomain);
                
                if (isCompletelyDifferent) {
                  console.warn(`[WordPress] Filtering post ${p.id} - domain mismatch: ${postDomain} vs ${siteRootDomain}`);
                  return false;
                }
                
                // Trust all other posts from the API
                return true;
              })
              .filter((p: any) => p.id && p.title && (p.link || p.slug));
            
            console.log(`[Continue Optimization] Fetched ${wordPressPosts.length} WordPress posts`);
          } else if (publishedResult.error) {
            console.error('[WordPress] Error:', publishedResult.error);
          }
        } catch (error) {
          console.error('[Continue Optimization] Error fetching WordPress posts:', error);
        }
      }
    }
    
    // No RAG context needed - use posts metadata directly (same as bulk prompt generator)
    wordPressRAGContext = '';

    let blueprintResult: any = null;
    let checklist: string[] = [];

    // Generate blueprint only if content optimization is needed
    if (!isTitleMetaOnly) {
      const titleForBlueprint = pendingCleanedTitle || finalTitle || existingTitle;
      const blueprintFlowResult = await generateBlueprintFlow(
        finalSelectedKeywords,
        selectedH2Sections,
        selectedPeopleAlsoAsk,
        selectedResearchLinks,
        titleForBlueprint,
        finalPrimaryKeyword,
        keywordData!,
        paaRawResponse,
        site,
        fileManager,
        siteId,
        wordPressPosts,
        url,
        existingPost,
        optimizationOptions?.hasEntity,
        testMode,
        setOptimizationProgress
      );
      blueprintResult = blueprintFlowResult.blueprintResult;
      checklist = blueprintFlowResult.checklist;
    } else {
      // Title/meta only - generate optimized title if needed, create minimal blueprint
      let optimizedTitle = existingTitle;
      if (finalOptimizationOptions?.optimizeTitle === true) {
        console.log('[Continue Optimization] Generating optimized title (blueprint skipped)...');
        const { generateOptimizedTitle } = await import('@/lib/title-optimizer');
        const entity = pending.extractedEntity || (pending.acfFields?.origin || undefined);
        optimizedTitle = await generateOptimizedTitle(
          existingTitle,
          finalPrimaryKeyword,
          siteId,
          entity
        );
        
        
        console.log('[Continue Optimization] Generated optimized title:', {
          original: existingTitle,
          optimized: optimizedTitle,
          changed: optimizedTitle !== existingTitle
        });
      }
      
      blueprintResult = {
        title: optimizedTitle,
        primaryKeyword: finalPrimaryKeyword,
        sections: [],
      };
      console.log('[Continue Optimization] Skipping blueprint generation for title/meta-only optimization');
    }

    setOptimizationFileManagers((prev: any) => ({ ...prev, [siteId]: fileManager }));

    // Generate and upload content (will respect optimizationOptions)
    const { excerpt, changes } = await generateAndUploadFlow(
      blueprintResult,
      existingTitle,
      finalPrimaryKeyword,
      site,
      url,
      updateMode,
      existingPost,
      resolved,
      existingContent,
      existingExcerpt,
      selectedKeyword,
      clusterKeywords,
      wordPressPosts,
      wordPressRAGContext,
      selectedPeopleAlsoAsk,
      finalOptimizationOptions, // Use final options with SEM task overrides
      inContentImageRequest,
      acfFields, // Pass ACF fields
      fileManager,
      siteId,
      setOptimizationProgress,
      setBulkOptimizationState
    );

    // Store changes in pending optimization for SEM task tracking BEFORE cleanup
    // CRITICAL: Store changes with URL so SEMTaskListDialog can find them
    if (changes) {
      
      setPendingOptimization((prev: any) => {
        const pending = prev[siteId];
        if (pending) {
          return {
            ...prev,
            [siteId]: {
              ...pending,
              optimizationChanges: changes,
              url: url // Ensure URL is stored for lookup
            }
          };
        }
        return prev;
      });
      
      // Give UI time to read changes before cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Cleanup
    setPendingOptimization((prev: any) => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });

    setOptimizationFileManagers((prev: any) => ({ ...prev }));

    // Update progress
    const finalFileManager = optimizationFileManagers[siteId] || fileManager;
    const fileCount = finalFileManager.getFileCount();
    const totalOptimizationTime = Math.floor((Date.now() - optimizationStartTime) / 1000);
    const minutes = Math.floor(totalOptimizationTime / 60);
    const seconds = totalOptimizationTime % 60;
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    updateOptimizationProgress(setOptimizationProgress, siteId, 'Complete', 100, `Optimization complete in ${timeString}. ${fileCount} files generated. Click "Download All" below.`);

  } catch (error) {
    console.error('[Optimize Content] Error continuing with selected keyword:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to optimize content';
    toast.error(errorMessage);
    setPendingOptimization((prev: any) => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
    setOptimizationFileManagers((prev: any) => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });

    try {
      const { clearSiteCache } = await import('@/lib/wordpress-site-cache');
      clearSiteCache(siteId);
    } catch (cacheError) {
      console.warn('[Optimize Content] Error clearing cache:', cacheError);
    }
  } finally {
    const batchKey = `${siteId}-batch`;
    setBulkOptimizationState((currentBulkState: Record<string, BulkOptimizationState>) => {
      const isBulkOperation = !!currentBulkState[batchKey];

      if (!isBulkOperation) {
        setIsOptimizingContent((prev: any) => {
          const updated = { ...prev };
          delete updated[siteId];
          return updated;
        });
        setOptimizationProgress((prev: any) => {
          const updated = { ...prev };
          delete updated[siteId];
          return updated;
        });

        try {
          const { clearSiteCache } = require('@/lib/wordpress-site-cache');
          clearSiteCache(siteId);
        } catch (cacheError) {
          console.warn('[Optimize Content] Error clearing cache:', cacheError);
        }
      }
      return currentBulkState;
    });
  }
}

async function extractAndCleanEntity(
  hasEntityOverride: boolean | undefined,
  existingTitle: string,
  url: string,
  primaryKeyword: string,
  pendingCleanedTitle?: string
): Promise<{ entity: string | 'N/A'; cleanedTitle: string }> {
  let extractedEntity: string | 'N/A' = 'N/A';
  let finalTitle = existingTitle || primaryKeyword;

  if (hasEntityOverride === false) {
    return { entity: 'N/A', cleanedTitle: finalTitle };
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
      const result = await determineEntity(hasEntityOverride, existingTitle, url, openRouterApiKey);
      extractedEntity = result.entity;
      
      // CRITICAL: Validate entity before using - entities MUST be geolocations only
      if (extractedEntity && extractedEntity !== 'N/A' && extractedEntity.trim()) {
        const { isValidEntity } = await import('@/lib/content-optimization-helpers');
        if (!isValidEntity(extractedEntity)) {
          console.log(`[Optimize Content] Extracted entity "${extractedEntity}" failed validation - treating as no entity (N/A). Entities must be geolocations only.`);
          extractedEntity = 'N/A';
        }
      }
    }
  } catch (error) {
    console.warn('[Optimize Content] Error during entity extraction:', error);
    extractedEntity = 'N/A';
  }

  const titleToUse = pendingCleanedTitle || cleanTitleForNonEntity(finalTitle, extractedEntity);
  if (titleToUse !== finalTitle) {
    finalTitle = titleToUse;
  }

  return { entity: extractedEntity, cleanedTitle: finalTitle };
}

async function updateBulkStateWithEntity(
  site: WordPressSite,
  url: string,
  primaryKeyword: string,
  extractedEntity: string | 'N/A',
  finalTitle: string,
  setBulkOptimizationState: (prev: any) => any
): Promise<void> {
  // CRITICAL: Validate entity before storing - entities MUST be geolocations only
  let validatedEntity: string | 'N/A' = extractedEntity;
  if (extractedEntity && extractedEntity !== 'N/A' && extractedEntity.trim()) {
    const { isValidEntity } = await import('@/lib/content-optimization-helpers');
    if (!isValidEntity(extractedEntity)) {
      console.log(`[Bulk Optimization] Entity "${extractedEntity}" failed validation - treating as no entity (N/A). Entities must be geolocations only.`);
      validatedEntity = 'N/A';
    }
  }
  
  const batchKey = `${site.id}-batch`;
  setBulkOptimizationState((prev: any) => {
    const current = prev[batchKey];
    if (current && current.urls.includes(url)) {
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlKeywords: { ...(current.urlKeywords || {}), [url]: primaryKeyword },
          urlEntities: { ...(current.urlEntities || {}), [url]: validatedEntity },
          urlTitles: { ...(current.urlTitles || {}), [url]: finalTitle }
        }
      };
    }
    return prev;
  });
}

async function generateEntityPageKeyword(
  site: WordPressSite,
  existingTitle: string,
  url: string,
  primaryKeyword: string
): Promise<string> {
  try {
    const openRouterApiKey = loadApiKey();
    if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
      const researchModel = getResearchModel(site.id);
      const aiGeneratedKeyword = await generateLocalKeywordForEntityPage(
        existingTitle,
        url,
        site.name,
        openRouterApiKey,
        researchModel
      );
      if (aiGeneratedKeyword && aiGeneratedKeyword.trim().length > 0) {
        toast.info(`Generated local keyword for entity page: "${aiGeneratedKeyword}"`, { duration: 3000 });
        return aiGeneratedKeyword.trim();
      }
    }
  } catch (error) {
    console.warn('[Optimize Content] Failed to generate AI keyword for entity page, using original:', error);
  }
  return primaryKeyword;
}

