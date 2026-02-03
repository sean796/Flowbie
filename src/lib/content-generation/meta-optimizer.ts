/**
 * Meta Optimizer Module
 * Handles WordPress meta field optimization using entity endpoint directly
 * NO service-area conditionals, NO normalization
 */

import { toast } from "sonner";
import { getWordPressPostMeta, updateWordPressPostMeta } from "@/lib/wordpress-api";
import { generateOptimizedMetaFields } from "@/lib/meta-field-optimizer";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";

export interface MetaOptimizerOptions {
  postId: number;
  markdownContent: string;
  finalTitle: string;
  metaDescription: string | undefined;
  primaryKeyword: string;
  site: WordPressSite;
  postLink: string;
  existingPost?: any;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  shouldOptimizeMeta: boolean;
}

export interface MetaOptimizerResult {
  success: boolean;
}

export async function optimizeMetaFields(
  options: MetaOptimizerOptions
): Promise<MetaOptimizerResult> {
  const {
    postId,
    markdownContent,
    finalTitle,
    metaDescription,
    primaryKeyword,
    site,
    postLink,
    existingPost,
    fileManager,
    setProgress,
    shouldOptimizeMeta
  } = options;

  if (!shouldOptimizeMeta) {
    console.log('[Content Generation] Meta optimization skipped (optimizeMeta option disabled)');
    return { success: true };
  }

  try {
    setProgress({ step: 'Optimizing meta fields...', progress: 94, message: 'Fetching post meta fields and generating optimized SEO fields...' });

    // Determine post type and endpoint from existing post or site config
    // Priority: existingPost.postTypeEndpoint > resolved subtype > entity endpoint > default 'post'
    const resolvedSubtype = existingPost?.postTypeSubtype || existingPost?.subtype || 'post';
    const postTypeEndpoint = existingPost?.postTypeEndpoint 
      || (site.entitySitemapUrl ? extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl) : undefined)
      || 'posts';

    console.log('[Meta Optimizer] Using endpoint for meta fetch:', {
      postId,
      resolvedSubtype,
      postTypeEndpoint,
      hasExistingPost: !!existingPost,
      existingPostEndpoint: existingPost?.postTypeEndpoint
    });

    // Fetch existing meta fields
    // postType: internal type (e.g., 'post', 'page') 
    // postTypeEndpoint: actual WordPress REST API endpoint (e.g., 'posts', 'pages', 'service-areas')
    const metaResult = await getWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      resolvedSubtype, // Internal post type (post, page, etc.)
      postTypeEndpoint // Actual WordPress REST API endpoint
    );

    if (!metaResult.success) {
      const errorMsg = metaResult.error || 'Unknown error';
      console.warn(`[Content Generation] Failed to fetch meta fields for post ID ${postId}: ${errorMsg}`);
      console.warn(`[Content Generation] Attempted with postType: ${resolvedSubtype}, postTypeEndpoint: ${postTypeEndpoint}`);
      // Don't fail - meta optimization is optional, content is already saved
      toast.warning('Content saved, but meta field optimization skipped (could not fetch existing meta).', { duration: 5000 });
      return { success: false };
    }

    if (!metaResult.meta || typeof metaResult.meta !== 'object') {
      console.warn(`[Content Generation] Meta fields fetched but empty or invalid for post ID ${postId}`);
      // Don't fail - meta optimization is optional
      toast.warning('Content saved, but meta field optimization skipped (no meta fields found).', { duration: 5000 });
      return { success: false };
    }

    toast.info('Generating optimized meta fields with AI...', { duration: 3000 });
    setProgress({ step: 'Optimizing meta fields...', progress: 95, message: 'AI analyzing content and generating optimized SEO meta fields...' });

    // Generate optimized meta fields
    const optimizedMeta = await generateOptimizedMetaFields(
      markdownContent, // Use markdown content for better analysis
      finalTitle,
      metaDescription,
      primaryKeyword,
      metaResult.meta,
      site.siteUrl,
      postLink
    );

    // Update meta fields in WordPress
    setProgress({ step: 'Optimizing meta fields...', progress: 96, message: 'Updating optimized meta fields in WordPress...' });

    const updateMetaResult = await updateWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      resolvedSubtype, // Internal post type
      postTypeEndpoint, // Actual WordPress REST API endpoint
      optimizedMeta
    );

    if (updateMetaResult.success) {
      console.log(`[Content Generation] Successfully optimized and updated meta fields for post ID ${postId}`);
      toast.success('Meta fields optimized successfully!', { duration: 3000 });

      // Save optimized meta fields to file manager
      const metaOptimizationFileName = OptimizationFileManager.generateFilename('meta-optimization', primaryKeyword, 'json');
      fileManager.addFile(
        metaOptimizationFileName,
        JSON.stringify({
          postId: postId,
          postLink: postLink,
          primaryKeyword,
          originalMeta: metaResult.meta,
          optimizedMeta: optimizedMeta,
          updatedAt: new Date().toISOString(),
        }, null, 2),
        'application/json'
      );

      return { success: true };
    } else {
      const errorMsg = updateMetaResult.error || 'Unknown error';
      console.warn(`[Content Generation] Failed to update meta fields for post ID ${postId}: ${errorMsg}`);
      console.warn(`[Content Generation] Attempted with postType: ${resolvedSubtype}, postTypeEndpoint: ${postTypeEndpoint}`);
      toast.warning('Content saved, but meta field update failed.', { duration: 5000 });
      return { success: false };
    }
  } catch (metaError) {
    console.error('[Content Generation] Error optimizing meta fields:', metaError);
    // Don't fail the whole process if meta optimization fails
    toast.warning('Content saved, but meta field optimization encountered an error.', { duration: 5000 });
    return { success: false };
  }
}

