/**
 * Featured Image Handler Module
 * Handles featured image generation, upload, and management
 */

import { toast } from "sonner";
import { streamChatCompletion } from "@/lib/api";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";
import { buildImageChecklistSystemPrompt, buildImageChecklistUserPrompt, parseImageChecklist, type ImageChecklistItem } from "@/lib/image-checklist-builder";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";

export interface FeaturedImageHandlerOptions {
  blueprintResult: any;
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  markdownContent: string;
  existingContent: string;
  existingPost?: any;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  shouldOptimizeFeaturedImage: boolean;
  apiKey: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  entity?: string;
}

export interface FeaturedImageHandlerResult {
  featuredImageId?: number;
}

export async function handleFeaturedImage(
  options: FeaturedImageHandlerOptions
): Promise<FeaturedImageHandlerResult> {
  const {
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    markdownContent,
    existingContent,
    existingPost,
    fileManager,
    setProgress,
    shouldOptimizeFeaturedImage,
    apiKey,
    featuredImageType = 'ai-generated',
    entity
  } = options;

  let featuredImageId: number | undefined = undefined;

  if (!shouldOptimizeFeaturedImage && existingPost) {
    // Featured image optimization disabled - keep existing featured image
    const existingFeaturedMedia = existingPost.fullData?.featured_media || existingPost.fullData?._embedded?.featured_media?.[0]?.id || existingPost.featured_media;
    if (existingFeaturedMedia) {
      featuredImageId = typeof existingFeaturedMedia === 'number' ? existingFeaturedMedia : existingFeaturedMedia.id;
      console.log('[Optimize Content] Keeping existing featured image:', featuredImageId);
      toast.info(`Keeping existing featured image (ID: ${featuredImageId})`, { duration: 3000 });
    } else {
      console.log('[Optimize Content] No existing featured image found');
    }
  } else if (shouldOptimizeFeaturedImage && (markdownContent || existingContent)) {
    // Check if Google Maps image is requested and entity is available
    const useGoogleMaps = featuredImageType === 'google-maps' && entity && entity.trim() && entity.trim() !== 'N/A';
    
    if (useGoogleMaps) {
      // Generate Google Maps screenshot
      try {
        setProgress({ step: 'Generating Google Maps featured image...', progress: 88, message: `Generating Google Maps screenshot for ${entity}...` });
        
        // Call backend API to generate Google Maps image
        const response = await fetch(`${BACKEND_API_BASE}/api/google-maps-image/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ entity: entity.trim() }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to generate Google Maps image' }));
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to generate Google Maps image`);
        }
        
        const result = await response.json();
        
        if (!result.success || !result.imageBase64) {
          throw new Error(result.error || 'No image data returned from Google Maps API');
        }
        
        let imageBase64 = result.imageBase64;
        const mimeType = result.mimeType || 'image/jpeg';
        
        // Remove data URL prefix if present
        if (imageBase64.includes(',')) {
          imageBase64 = imageBase64.split(',')[1];
        }
        
        // Generate SEO-friendly filename
        const imageFileName = await generateSEOImageFilename(
          `${entity.trim()} Google Maps`,
          apiKey,
          getResearchModel(),
          'featured'
        );
        
        // Ensure filename has .jpg extension for Google Maps images
        const fileNameWithoutExt = imageFileName.replace(/\.(png|jpg|jpeg)$/i, '');
        const finalImageFileName = `${fileNameWithoutExt}.jpg`;
        
        // Save image file to fileManager
        const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
        fileManager.addFile(
          finalImageFileName,
          imageDataUrl,
          mimeType
        );
        
        setProgress({ step: 'Uploading Google Maps featured image...', progress: 90, message: 'Uploading Google Maps image to WordPress...' });
        
        // Upload to WordPress
        const uploadResult = await uploadWordPressMedia(
          site.siteUrl,
          site.username,
          site.appPassword,
          imageBase64,
          finalImageFileName,
          `${entity.trim()} - Google Maps`
        );
        
        if (uploadResult.success && uploadResult.mediaId) {
          featuredImageId = uploadResult.mediaId;
          console.log('[Optimize Content] Google Maps featured image uploaded successfully:', featuredImageId);
          toast.success(`Google Maps featured image generated and uploaded (ID: ${featuredImageId})`, { duration: 3000 });
        } else {
          console.warn('[Optimize Content] Failed to upload Google Maps featured image:', uploadResult.error);
          toast.warning('Google Maps featured image generated but upload failed. Continuing without featured image...', { duration: 5000 });
        }
      } catch (error) {
        console.error('[Optimize Content] Error generating/uploading Google Maps featured image:', error);
        toast.warning(`Google Maps featured image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Falling back to AI generation...`, { duration: 5000 });
        
        // Fallback to AI generation if Google Maps fails
        // Continue with AI generation flow below
      }
    }
    
    // Use AI-generated image if Google Maps wasn't used or failed
    if (!featuredImageId) {
      // Generate new featured image using AI
      const contentForImage = markdownContent || existingContent || '';
      try {
      setProgress({ step: 'Generating featured image...', progress: 88, message: 'Creating image checklist and generating featured image...' });
      
      // Generate image checklist
      const flowTitle = blueprintResult.title || existingTitle || primaryKeyword;
      const flowPurpose = blueprintResult.purpose || `Comprehensive guide about ${primaryKeyword}`;
      
      let imageChecklistContent = '';
      const checklistResult = await streamChatCompletion({
        apiKey: apiKey,
        model: getResearchModel(),
        messages: [
          { role: 'system', content: buildImageChecklistSystemPrompt(flowTitle, flowPurpose, contentForImage) },
          { role: 'user', content: buildImageChecklistUserPrompt({
            flowTitle,
            flowPurpose,
            finalOutput: contentForImage,
            includeText: false,
            includePeople: false,
            includeAnimals: false,
            includeCars: false,
            isInfographic: false,
            aspectRatio: '16:9',
            style: 'professional',
            colorScheme: 'vibrant',
          }) },
        ],
        temperature: 1.0,
        maxTokens: 2000,
        topP: 0.9,
        onContentChunk: (chunk) => {
          imageChecklistContent += chunk;
        },
      });
      
      // Get final content from result
      imageChecklistContent = checklistResult.content || imageChecklistContent;
      
      const imageChecklist: ImageChecklistItem[] = parseImageChecklist(imageChecklistContent);
      
      // Save checklist file to fileManager
      const checklistFileName = OptimizationFileManager.generateFilename('featured-image-checklist', primaryKeyword, 'json');
      fileManager.addFile(
        checklistFileName,
        JSON.stringify({
          title: blueprintResult.title || existingTitle || primaryKeyword,
          purpose: blueprintResult.purpose || `Comprehensive guide about ${primaryKeyword}`,
          primaryKeyword,
          imageChecklist: imageChecklist.map(item => ({
            title: item.title,
            description: item.description
          })),
          metadata: {
            aspectRatio: '16:9',
            style: 'professional',
            colorScheme: 'vibrant',
            includeText: false,
            includePeople: false,
            includeAnimals: false,
            includeCars: false,
            generatedAt: new Date().toISOString(),
          }
        }, null, 2),
        'application/json'
      );
      
      // Build image prompt
      const basePrompt = buildImagePrompt(
        {
          flowTitle: blueprintResult.title || existingTitle || primaryKeyword,
          flowPurpose: blueprintResult.purpose || `Comprehensive guide about ${primaryKeyword}`,
          finalOutput: contentForImage,
        },
        {
          includeText: false, // No text - WordPress style
          includePeople: false,
          includeAnimals: false,
          includeCars: false,
          isInfographic: false,
          aspectRatio: '16:9', // WordPress featured image aspect ratio
          style: 'professional',
          colorScheme: 'vibrant',
        }
      );
      
      const checklistText = imageChecklist.length > 0 
        ? `\n\nImage Generation Checklist:\n${imageChecklist.map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n')}`
        : '';
      
      const prompt = basePrompt + checklistText + '\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included. This is a WordPress featured image - no text, words, or labels should be included.';
      
      setProgress({ step: 'Generating featured image...', progress: 89, message: 'Generating image with AI...' });
      
      // Generate image
      const imageResult = await generateImage({
        apiKey: apiKey,
        prompt,
        aspectRatio: '16:9',
      });
      
      if (imageResult.error) {
        throw new Error(imageResult.error);
      }
      
      if (!imageResult.imageBase64 && !imageResult.imageUrl) {
        throw new Error('No image data returned from image generation API');
      }
      
      // Convert URL to base64 if needed
      let imageBase64: string;
      if (imageResult.imageBase64) {
        imageBase64 = imageResult.imageBase64;
      } else if (imageResult.imageUrl) {
        // Fetch image and convert to base64
        const imageResponse = await fetch(imageResult.imageUrl);
        const imageBlob = await imageResponse.blob();
        const reader = new FileReader();
        imageBase64 = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove data URL prefix if present
            const base64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(imageBlob);
        });
      } else {
        throw new Error('No image data available');
      }
      
      // Generate SEO-friendly filename
      const imageFileName = await generateSEOImageFilename(
        blueprintResult.title || existingTitle || primaryKeyword,
        apiKey,
        getResearchModel(),
        'featured'
      );
      
      // Save image file to fileManager (as data URL for proper download handling)
      let imageDataUrl: string;
      if (imageBase64.startsWith('data:')) {
        imageDataUrl = imageBase64;
      } else {
        imageDataUrl = `data:image/png;base64,${imageBase64}`;
      }
      
      fileManager.addFile(
        imageFileName,
        imageDataUrl,
        'image/png'
      );
      
      setProgress({ step: 'Uploading featured image...', progress: 90, message: 'Uploading generated image to WordPress...' });
      
      // Upload to WordPress
      const uploadResult = await uploadWordPressMedia(
        site.siteUrl,
        site.username,
        site.appPassword,
        imageBase64,
        imageFileName,
        blueprintResult.title || existingTitle || primaryKeyword
      );
      
      if (uploadResult.success && uploadResult.mediaId) {
        featuredImageId = uploadResult.mediaId;
        console.log('[Optimize Content] Featured image uploaded successfully:', featuredImageId);
        toast.success(`Featured image generated and uploaded (ID: ${featuredImageId})`, { duration: 3000 });
      } else {
        console.warn('[Optimize Content] Failed to upload featured image:', uploadResult.error);
        toast.warning('Featured image generated but upload failed. Continuing without featured image...', { duration: 5000 });
      }
    } catch (error) {
      console.error('[Optimize Content] Error generating/uploading featured image:', error);
      toast.warning('Featured image generation failed. Continuing without featured image...', { duration: 5000 });
      // Continue without featured image - don't fail the entire process
    }
    }
  }

  return { featuredImageId };
}

