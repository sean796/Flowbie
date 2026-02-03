/**
 * Content Generation Upload Orchestrator
 * Orchestrates content generation, WordPress upload, and optimization workflows
 * Uses entity endpoint logic directly - NO service-area conditionals, NO normalization
 */

import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { generateImplementationReport } from "@/lib/implementation-report-generator";
import { type WordPressSite } from "@/components/integrations/types";
import { generateOptimizedContent } from "@/lib/content-generation/content-generator";
import { handleFeaturedImage } from "@/lib/content-generation/featured-image-handler";
import { uploadToWordPress } from "@/lib/content-generation/wordpress-uploader";
import { optimizeMetaFields } from "@/lib/content-generation/meta-optimizer";
import { updateACFOriginField } from "@/lib/content-generation/acf-origin-updater";
import { cleanTitleForNonEntity } from "@/lib/content-optimization-helpers";
import type { ImageType } from "@/lib/image-section-analyzer";
import { generateExtraTextForPage, generateExtraImageForPage } from "@/lib/content-generation/page-extra-content-generator";

export interface OptimizationContext {
  site: WordPressSite;
  url: string; // URL of the page being optimized
  updateMode: 'update' | 'draft';
  existingPost: any;
  resolved: any;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  primaryKeyword: string;
  selectedKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  clusterKeywords?: string[];
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  wordPressRAGContext?: string; // WordPress content as RAG context for AI
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; featuredImageType?: 'ai-generated' | 'google-maps'; testMode?: boolean; hasEntity?: boolean; optimizeExtraText?: boolean; optimizeExtraImage?: boolean };
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string }; // Optional in-content image generation request
  selectedPeopleAlsoAsk?: string[]; // PAA questions for FAQ schema generation
}

export async function generateAndUploadContent(
  blueprintResult: any,
  existingTitle: string,
  primaryKeyword: string,
  site: WordPressSite,
  context: OptimizationContext,
  fileManager: OptimizationFileManager,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  onContentChunk?: (chunk: string) => void,
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; featuredImageType?: 'ai-generated' | 'google-maps'; hasEntity?: boolean; optimizeExtraText?: boolean; optimizeExtraImage?: boolean },
  acfFields?: Record<string, any> // ACF fields from WordPress post
): Promise<{ result: any; markdownContent: string; excerpt: string; changes?: { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string } }> {
  // Merge optimization options with defaults, preserving explicit false values
  // CRITICAL: Treat undefined as false (skip) rather than true (do it) to respect unchecked boxes
  const defaultOptions = { 
    optimizeTitle: true, 
    optimizeMeta: true, 
    optimizeExcerpt: true, 
    optimizeContent: true, 
    optimizeFeaturedImage: false 
  };
  
  // Properly merge: if optimizationOptions is provided, merge it with defaults
  // This ensures explicit false values are preserved, and undefined values use defaults
  const opts = optimizationOptions 
    ? { ...defaultOptions, ...optimizationOptions }
    : defaultOptions;

  // CRITICAL FIX: Explicitly check for true - undefined/false means skip
  // This ensures unchecked boxes (false) and missing properties (undefined) both skip
  const shouldOptimizeContent = opts.optimizeContent === true;
  const shouldOptimizeFeaturedImage = opts.optimizeFeaturedImage === true;
  const shouldOptimizeTitle = opts.optimizeTitle === true;
  const shouldOptimizeMeta = opts.optimizeMeta === true;
  const shouldOptimizeExcerpt = opts.optimizeExcerpt === true;
  
  // Log optimization options for debugging
  console.log('[Content Generation Upload] Optimization options:', {
    optimizeContent: opts.optimizeContent,
    shouldOptimizeContent,
    optimizeTitle: opts.optimizeTitle,
    shouldOptimizeTitle,
    optimizeMeta: opts.optimizeMeta,
    shouldOptimizeMeta,
    optimizeExcerpt: opts.optimizeExcerpt,
    shouldOptimizeExcerpt,
    optimizeFeaturedImage: opts.optimizeFeaturedImage,
    shouldOptimizeFeaturedImage,
    rawOptions: optimizationOptions
  });

  // Load API key once for use in content generation, in-content images, and featured images
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  const uploadStartTime = Date.now();

  // Step 1: Generate optimized content (skip if content optimization is disabled)
  let markdownContent: string;
  let htmlContent: string;
  let excerpt: string;
  
  // CRITICAL: Generate meta description FIRST and INDEPENDENTLY - it does NOT depend on content
  // Meta description is generated from keyword + title ONLY, completely independent of content
  if (shouldOptimizeExcerpt) {
    console.log('[Content Generation Upload] 🔥 GENERATING INDEPENDENT AGENTIC META DESCRIPTION (not dependent on content)');
    setProgress({ step: 'Generating meta description...', progress: 20, message: 'Creating SEO-optimized meta description from keyword and title...' });
    
    try {
      const { generateMetaDescription } = await import('@/lib/content-generation/content-generator');
      
      // Meta description is AI-driven and uses WordPress content as context when available
      // User requirement: "fetched when you read the FUCKING WORDPRESS CONTENT!"
      const metaContext = context.existingContent && context.existingContent.trim().length > 0
        ? context.existingContent.substring(0, 3000) // Use WordPress content as context for AI
        : `Blog post title: "${existingTitle || primaryKeyword}". Primary keyword: "${primaryKeyword}".`;
      
      excerpt = await generateMetaDescription(metaContext, primaryKeyword, openRouterApiKey, site.id);
      console.log('[Content Generation Upload] ✅ Generated INDEPENDENT agentic meta description:', excerpt.length, 'chars');
      toast.success(`Meta description generated: ${excerpt.substring(0, 60)}...`, { duration: 3000 });
    } catch (error) {
      console.error('[Content Generation Upload] ❌ Failed to generate meta description:', error);
      // DO NOT fallback to existing - throw error so user knows it failed
      throw new Error(`Failed to generate meta description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Meta description optimization disabled - use existing (but strip HTML)
    excerpt = (context.existingExcerpt || '').replace(/<[^>]*>/g, '').trim();
    console.log('[Content Generation Upload] ⚠️ Meta description optimization disabled - using existing (HTML stripped)');
  }
  
  if (!shouldOptimizeContent) {
    // Content optimization disabled - skip content generation, proceed to meta optimization only
    console.log('[Content Generation Upload] ⚠️ CONTENT OPTIMIZATION DISABLED - Skipping content generation', {
      optimizeContent: opts.optimizeContent,
      shouldOptimizeContent,
      reason: opts.optimizeContent === false ? 'User unchecked Content box' : 'optimizeContent not explicitly set to true'
    });
    markdownContent = context.existingContent || '';
    htmlContent = context.existingContent || '';
    setProgress({ step: 'Skipping content generation...', progress: 90, message: 'Content optimization disabled - meta description generated, proceeding to upload...' });
    toast.info('Content optimization disabled - meta description generated, proceeding to upload...', { duration: 3000 });
  } else {
    console.log('[Content Generation Upload] ✅ Content optimization ENABLED - proceeding with content generation');
    // Generate optimized content
    toast.info(`${context.updateMode === 'update' ? 'Updating' : 'Creating'} post in WordPress...`, { duration: 3000 });
    setProgress({ step: `${context.updateMode === 'update' ? 'Updating' : 'Creating'} post...`, progress: 90, message: 'Generating content and preparing for upload...' });

    const contentResult = await generateOptimizedContent({
      blueprintResult,
      existingTitle,
      primaryKeyword,
      site,
      context: {
        wordPressRAGContext: context.wordPressRAGContext,
        wordPressPosts: context.wordPressPosts,
        url: context.url,
        existingContent: context.existingContent,
        inContentImageRequest: context.inContentImageRequest,
        acfFields // Pass ACF fields to content generator
      },
      fileManager,
      setProgress,
      onContentChunk,
      shouldOptimizeContent,
      hasEntityOverride: optimizationOptions?.hasEntity
    });

    markdownContent = contentResult.markdownContent;
    htmlContent = contentResult.htmlContent;

    // CRITICAL: Never silently upload when user asked for content optimization but we got no generated content
    const generatedTrimmed = (markdownContent || '').trim();
    if (context.updateMode === 'update' && !generatedTrimmed) {
      console.error('[Content Generation Upload] Content optimization was enabled but no content was generated', {
        generatedLength: generatedTrimmed.length,
        existingContentLength: (context.existingContent || '').length,
      });
      throw new Error('Content optimization was enabled but no content was generated. Refusing to overwrite with empty content.');
    }

    // CRITICAL: If meta description was already generated independently above, use that
    // Otherwise, if content generation also generated one, use that (but it should be independent too)
    // If meta description optimization is disabled, use existing
    if (!shouldOptimizeExcerpt) {
      excerpt = context.existingExcerpt || '';
      console.log('[Content Generation Upload] ⚠️ Meta description optimization disabled - using existing excerpt');
    } else {
      // Meta description was already generated independently above - use that one
      // Don't use contentResult.excerpt as it might be content-dependent
      console.log('[Content Generation Upload] ✅ Using independently generated meta description (not from content)');
      // excerpt is already set above from independent generation
    }
  }

  // Step 2: Handle featured image
  // Extract entity from blueprint (for Google Maps image generation)
  const blueprintEntity = (blueprintResult as any)?.entity;
  const entity = blueprintEntity && blueprintEntity !== 'N/A' ? blueprintEntity : undefined;
  const featuredImageType = optimizationOptions?.featuredImageType || 'ai-generated';
  
  const featuredImageResult = await handleFeaturedImage({
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    markdownContent,
    existingContent: context.existingContent,
    existingPost: context.existingPost,
    fileManager,
    setProgress,
    shouldOptimizeFeaturedImage,
    apiKey: openRouterApiKey,
    featuredImageType,
    entity
  });

  const { featuredImageId } = featuredImageResult;

  // Step 3: Upload to WordPress
  // Safety check: Clean existingTitle if entity is N/A (though uploadToWordPress will also clean)
  // This ensures we pass the cleanest title possible
  let cleanedExistingTitle = existingTitle;
  if (!blueprintEntity || blueprintEntity === 'N/A') {
    cleanedExistingTitle = cleanTitleForNonEntity(existingTitle, blueprintEntity || 'N/A');
    if (cleanedExistingTitle !== existingTitle) {
      console.log('[Content Generation Upload] Cleaned existingTitle before upload:', {
        original: existingTitle,
        cleaned: cleanedExistingTitle,
        entity: blueprintEntity || 'N/A'
      });
    }
  }
  
  // DEBUG: Log selectedPeopleAlsoAsk before passing to uploader
  console.log('[Content Generation Upload] PAA questions from context:', {
    hasSelectedPeopleAlsoAsk: !!context.selectedPeopleAlsoAsk,
    selectedPeopleAlsoAskLength: context.selectedPeopleAlsoAsk?.length || 0,
    selectedPeopleAlsoAskPreview: context.selectedPeopleAlsoAsk?.slice(0, 2) || [],
    entity
  });
  
  // Step 2.5: Generate extra text and image for pages if enabled
  let extraTextContent: string | undefined;
  let extraImageBase64: string | undefined;
  
  // Detect if this is a page
  const isPage = context.resolved?.subtype === 'page' || 
                 context.resolved?.endpoint === 'pages' ||
                 context.existingPost?.postTypeEndpoint === 'pages';
  
  // When Extra Text is checked, always generate new content and overwrite the ACF field; never skip because existing content exists
  if (isPage && optimizationOptions?.optimizeExtraText) {
    try {
      setProgress({ step: 'Generating extra text for page...', progress: 78, message: 'Creating complementary helpful linked content...' });
      extraTextContent = await generateExtraTextForPage({
        existingContent: context.existingContent,
        primaryKeyword,
        secondaryKeywords: context.clusterKeywords || [],
        wordPressRAGContext: context.wordPressRAGContext,
        wordPressPosts: context.wordPressPosts || [],
        site,
        apiKey: openRouterApiKey,
        siteId: site.id
      });
      console.log('[Content Generation Upload] Extra text generated for page:', extraTextContent?.substring(0, 100));
    } catch (error) {
      console.error('[Content Generation Upload] Failed to generate extra text:', error);
      toast.warning('Failed to generate extra text. Continuing without it...', { duration: 3000 });
    }
  }
  
  if (isPage && optimizationOptions?.optimizeExtraImage) {
    try {
      setProgress({ step: 'Generating extra image for page...', progress: 79, message: 'Creating AI-generated image (1:1 ratio, no people/pets)...' });
      const extraImageResult = await generateExtraImageForPage({
        existingContent: context.existingContent,
        primaryKeyword,
        site,
        apiKey: openRouterApiKey,
        siteId: site.id
      });
      extraImageBase64 = extraImageResult.imageBase64;
      console.log('[Content Generation Upload] Extra image generated for page');
    } catch (error) {
      console.error('[Content Generation Upload] Failed to generate extra image:', error);
      toast.warning('Failed to generate extra image. Continuing without it...', { duration: 3000 });
    }
  }

  const uploadResult = await uploadToWordPress({
    context,
    blueprintResult,
    existingTitle: cleanedExistingTitle, // Use cleaned title
    primaryKeyword,
    htmlContent,
    excerpt,
    featuredImageId,
    shouldOptimizeTitle,
    setProgress,
    entity, // Pass entity to uploader for ACF origin field update
    faqQuestions: context.selectedPeopleAlsoAsk, // Pass PAA questions for FAQ schema generation
    apiKey: openRouterApiKey, // Pass API key for AI-driven question generation when PAA questions are missing
    extraTextContent, // Pass extra text for pages
    extraImageBase64 // Pass extra image for pages
  });

  const { result, postId, link, finalTitle } = uploadResult;

  // Track what was actually changed - compare with original values
  const existingExcerptClean = (context.existingExcerpt || '').replace(/<[^>]*>/g, '').trim();
  const excerptClean = excerpt ? excerpt.replace(/<[^>]*>/g, '').trim() : '';
  
  const titleChanged = shouldOptimizeTitle && finalTitle !== existingTitle && finalTitle.trim() !== existingTitle.trim();
  const metaChanged = shouldOptimizeMeta && excerptClean !== existingExcerptClean && excerptClean.length > 0;
  const contentChanged = shouldOptimizeContent && markdownContent !== context.existingContent && markdownContent.trim() !== (context.existingContent || '').trim();

  const changes = {
    titleChanged,
    metaChanged,
    contentChanged,
    title: titleChanged ? finalTitle : undefined,
    meta: metaChanged ? excerptClean : undefined,
  };

  console.log('[Content Generation] Changes tracked:', {
    ...changes,
    comparison: {
      title: { existing: existingTitle, final: finalTitle, changed: titleChanged },
      meta: { existing: existingExcerptClean.substring(0, 50), final: excerptClean.substring(0, 50), changed: metaChanged },
      content: { existingLength: context.existingContent?.length, finalLength: markdownContent?.length, changed: contentChanged }
    }
  });

  // Show success notification with post details
  if (result.success && postId && link) {
    toast.success(`Post ${context.updateMode === 'update' ? 'updated' : 'created'} successfully!`, {
      duration: 8000,
      description: `Post ID: ${postId} | Status: ${result.status || 'published'} | View: ${link}`,
      action: {
        label: 'Open Post',
        onClick: () => window.open(link, '_blank'),
      },
    });
    console.log(`[Content Generation] ✅ Post ${context.updateMode === 'update' ? 'updated' : 'created'}: ID ${postId}, Link: ${link}, Status: ${result.status}`);
  } else {
    console.error('[Content Generation] ⚠️ Post upload completed but result indicates failure:', { success: result.success, postId, link, error: result.error });
    toast.warning('Post upload completed but may not have been successful. Check console for details.', { duration: 8000 });
  }

  // Step 4: Update ACF Origin field (if entity sitemap URL is provided)
  // ALWAYS extract fresh origin from title using AI - never preserve existing
  await updateACFOriginField({
    postId,
    finalTitle,
    site,
    existingPost: context.existingPost,
    resolved: context.resolved,
    setProgress
  });

  // Step 5: Optimize meta fields (meta description is set in final step by uploadToWordPress, not here)
  // Defensive check: Only optimize meta if explicitly enabled
  if (shouldOptimizeMeta) {
    console.log('[Content Generation Upload] ✅ Meta optimization ENABLED - proceeding with meta field optimization');
    await optimizeMetaFields({
      postId,
      markdownContent,
      finalTitle,
      metaDescription: excerpt, // Use the generated meta description (previously called excerpt)
      primaryKeyword,
      site,
      postLink: link,
      existingPost: context.existingPost,
      fileManager,
      setProgress,
      shouldOptimizeMeta
    });
  } else {
    console.log('[Content Generation Upload] ⚠️ Meta optimization DISABLED - skipping meta field optimization', {
      optimizeMeta: opts.optimizeMeta,
      shouldOptimizeMeta,
      reason: 'User unchecked Meta optimization option'
    });
  }

  const uploadTime = Math.floor((Date.now() - uploadStartTime) / 1000);
  
  toast.success(`Content optimized successfully! ${context.updateMode === 'update' ? 'Post updated' : 'Draft created'} in ${uploadTime}s.`, { 
    duration: 5000,
    description: `View and download generated files below.`
  });
  if (link) {
    toast.info(`View post: ${link}`, {
      duration: 5000,
      action: {
        label: 'Open',
        onClick: () => window.open(link, '_blank'),
      },
    });
  }

  // Step 6: Generate Implementation Report
  try {
    setProgress({ step: 'Generating implementation report...', progress: 95, message: 'Creating comparison report...' });
    
    // Get original content as markdown for comparison
    let originalContentMarkdown = context.existingContent;
    try {
      // If original content is HTML, convert to markdown
      if (context.existingContent.includes('<') && context.existingContent.includes('>')) {
        originalContentMarkdown = htmlToMarkdown(context.existingContent);
      }
    } catch (error) {
      console.warn('[Content Generation] Could not convert original content to markdown for report:', error);
    }

    await generateImplementationReport(
      {
        originalTitle: context.existingTitle,
        newTitle: blueprintResult.title || context.existingTitle || primaryKeyword,
        originalExcerpt: context.existingExcerpt || '',
        newExcerpt: excerpt,
        originalContent: originalContentMarkdown,
        newContent: markdownContent,
        primaryKeyword,
        clusterKeywords: context.clusterKeywords,
        selectedKeyword: context.selectedKeyword,
        blueprintResult,
        updateMode: context.updateMode,
        url: context.url,
      },
      fileManager
    );

    setProgress({ step: 'Complete', progress: 100, message: 'Implementation report generated successfully!' });
    toast.success('Implementation report generated!', { duration: 3000 });
  } catch (error) {
    console.error('[Content Generation] Error generating implementation report:', error);
    // Don't fail the whole process if report generation fails
    toast.warning('Content optimized, but implementation report generation failed.', { duration: 5000 });
  }

  return { result, markdownContent, excerpt, changes };
}
