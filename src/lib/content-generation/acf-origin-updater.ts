/**
 * ACF Origin Updater Module
 * Handles ACF Origin field updates using entity endpoint directly
 * ALWAYS uses AI extraction from title - NEVER preserves existing origin
 * NO service-area conditionals, NO normalization
 */

import { toast } from "sonner";
import { analyzeAndUpdateOriginField } from "@/lib/wordpress-acf-origin";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";

export interface ACFOriginUpdaterOptions {
  postId: number;
  finalTitle: string;
  site: WordPressSite;
  existingPost?: any;
  resolved?: any;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
}

export interface ACFOriginUpdaterResult {
  success: boolean;
  origin?: string;
}

export async function updateACFOriginField(
  options: ACFOriginUpdaterOptions
): Promise<ACFOriginUpdaterResult> {
  const {
    postId,
    finalTitle,
    site,
    existingPost,
    resolved,
    setProgress
  } = options;

  // Only update ACF Origin if entity sitemap URL is provided (indicates site supports entity-based content)
  if (!site.entitySitemapUrl) {
    console.log('[ACF Origin] No entity sitemap URL provided, skipping ACF Origin update');
    return { success: true };
  }

  if (!postId) {
    console.log('[ACF Origin] Missing postId, skipping ACF Origin update');
    return { success: true };
  }

  if (!finalTitle) {
    console.log('[ACF Origin] No title provided, skipping ACF Origin update');
    return { success: true };
  }

  try {
    // Extract entity endpoint directly from entity sitemap URL - NO normalization
    const entityEndpoint = extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl);

    // Use entityEndpoint directly for ACF update - NO normalization
    const postTypeEndpoint = entityEndpoint;

    console.log('[ACF Origin] Using postTypeEndpoint for ACF update:', {
      postTypeEndpoint,
      existingPostEndpoint: existingPost?.postTypeEndpoint,
      resolvedSubtype: resolved?.subtype,
      title: finalTitle
    });

    // ALWAYS extract origin from title using AI - NEVER preserve existing origin
    // This ensures fresh, accurate entity extraction every time
    setProgress({ step: 'Updating ACF Origin field...', progress: 93, message: `Analyzing title and extracting origin with AI...` });

    const originResult = await analyzeAndUpdateOriginField(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId,
      finalTitle,
      entityEndpoint, // Use entityEndpoint directly
      postTypeEndpoint // Use entityEndpoint directly
    );

    if (originResult.success && originResult.origin && originResult.origin.trim() && originResult.origin.trim() !== "N/A") {
      console.log(`[Content Generation] Successfully updated ACF Origin field to "${originResult.origin}" for post ID ${postId}`);
      toast.success(`Origin field updated: ${originResult.origin}`, { duration: 3000 });
      return { success: true, origin: originResult.origin };
    } else if (originResult.error) {
      console.warn(`[Content Generation] Failed to update ACF Origin field: ${originResult.error}`);
      // Don't fail the whole process if origin update fails
      toast.warning(`Content saved, but Origin field update failed: ${originResult.error}`, { duration: 5000 });
      return { success: false };
    } else {
      // Could not extract origin or extracted "N/A" - this is a regular blog post
      console.log(`[Content Generation] Could not extract valid origin from title: "${finalTitle}" - treating as regular blog post (N/A)`);
      // Don't fail - regular blog posts don't need origin fields
      return { success: true };
    }
  } catch (originError) {
    console.error('[Content Generation] Error updating ACF Origin field:', originError);
    // Don't fail the whole process if origin update fails
    toast.warning('Content saved, but Origin field update encountered an error.', { duration: 5000 });
    return { success: false };
  }
}
