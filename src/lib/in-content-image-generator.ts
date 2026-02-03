import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import { buildImageChecklistSystemPrompt, buildImageChecklistUserPrompt, parseImageChecklist, type ImageChecklistItem } from "@/lib/image-checklist-builder";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";
import { analyzeBestSectionForImage, type ImageType, IMAGE_TYPE_REQUIREMENTS } from "@/lib/image-section-analyzer";
import { parseMarkdownSections, type MarkdownSection } from "@/lib/section-parser";
import type { WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export interface InContentImageResult {
  imageUrl: string;
  sectionHeader: string;
  markdownImage: string;
  mediaId?: number;
}

export interface InContentImageOptions {
  markdownContent: string;
  flowTitle: string;
  flowPurpose: string;
  imageType: ImageType;
  site: WordPressSite;
  userPrompt?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * Generates an in-content image for a blog post
 * 1. Analyzes blog content to find best H2 section
 * 2. Generates image checklist with type-specific requirements
 * 3. Generates image
 * 4. Uploads to WordPress
 * 5. Returns markdown image link and section info
 */
export async function generateInContentImage(
  options: InContentImageOptions
): Promise<InContentImageResult> {
const apiKey = options.apiKey || loadApiKey();
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  const model = options.model || getResearchModel();
  const imageTypeInfo = IMAGE_TYPE_REQUIREMENTS[options.imageType];

  // Step 1: Analyze blog content to find best H2 section
const sectionHeader = await analyzeBestSectionForImage(
    options.markdownContent,
    options.imageType,
    options.flowTitle,
    options.flowPurpose,
    options.userPrompt,
    apiKey,
    model
  );
// Find the selected section object
  const sections = parseMarkdownSections(options.markdownContent);
  const selectedSection = sections.find(s => s.header === sectionHeader && s.headerLevel === 2);
if (!selectedSection) {
    throw new Error(`Selected section "${sectionHeader}" not found in content`);
  }

  // Step 2: Generate image checklist with type-specific requirements
  const systemPrompt = buildImageChecklistSystemPrompt(
    options.flowTitle,
    options.flowPurpose,
    undefined, // No finalOutput for section-based images
    {
      header: selectedSection.header,
      content: selectedSection.content,
      fullText: selectedSection.fullText,
    },
    options.userPrompt
  );

  const checklistContext = {
    flowTitle: options.flowTitle,
    flowPurpose: options.flowPurpose,
    selectedSection: {
      header: selectedSection.header,
      content: selectedSection.content,
      fullText: selectedSection.fullText,
    },
    userPrompt: options.userPrompt,
    includeText: options.imageType === 'infographic', // Infographics MUST include text
    includePeople: false,
    includeAnimals: false,
    includeCars: false,
    isInfographic: options.imageType === 'infographic',
    aspectRatio: imageTypeInfo.aspectRatio,
    style: 'professional' as const,
    colorScheme: 'vibrant' as const,
    imageType: options.imageType, // Pass image type for type-specific requirements
  };

  const userPromptText = buildImageChecklistUserPrompt(checklistContext);

  let checklistContent = '';
  await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPromptText }
    ],
    temperature: options.temperature || 1.0,
    maxTokens: options.maxTokens || 4000,
    topP: options.topP || 0.9,
    onContentChunk: (chunk) => {
      checklistContent += chunk;
    }
  });

  const imageChecklist: ImageChecklistItem[] = parseImageChecklist(checklistContent);

  // Step 3: Generate image
  const checklistText = imageChecklist.length > 0 
    ? `\n\nImage Generation Checklist:\n${imageChecklist.map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n')}`
    : '';

  const basePrompt = buildImagePrompt(
    {
      flowTitle: options.flowTitle,
      flowPurpose: options.flowPurpose,
      selectedSection: {
        header: selectedSection.header,
        content: selectedSection.content,
        fullText: selectedSection.fullText,
      },
    },
    {
      userPrompt: options.userPrompt,
      includeText: options.imageType === 'infographic', // Infographics MUST include text
      includePeople: false,
      includeAnimals: false,
      includeCars: false,
      isInfographic: options.imageType === 'infographic',
      aspectRatio: imageTypeInfo.aspectRatio,
      style: 'professional',
      colorScheme: 'vibrant',
    }
  );

  const prompt = basePrompt + checklistText + '\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included.';
// Use an image-generation capable model (gemini-3-pro-image-preview supports image generation)
  const imageResult = await generateImage({
    apiKey,
    prompt,
    model: 'google/gemini-3-pro-image-preview', // Explicitly use image-generation model
    aspectRatio: imageTypeInfo.aspectRatio,
  });
if (imageResult.error) {
throw new Error(imageResult.error);
  }

  if (!imageResult.imageBase64 && !imageResult.imageUrl) {
throw new Error('No image data returned from image generation API');
  }

  // Convert URL to base64 if needed (same as featured image flow)
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
        // Remove data URL prefix if present (same as featured image)
        const base64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
  } else {
    throw new Error('No image data available');
  }

  // Step 4: Generate SEO-friendly filename (use 'section' type since it's based on a section)
  const imageFileName = await generateSEOImageFilename(
    `${options.flowTitle}-${sectionHeader}`,
    apiKey,
    getResearchModel(), // Use same model as featured image
    'section'
  );

  // Step 5: Upload to WordPress (same format as featured image - pass raw base64)
const uploadResult = await uploadWordPressMedia(
    options.site.siteUrl,
    options.site.username,
    options.site.appPassword,
    imageBase64, // Pass raw base64 like featured image does
    imageFileName,
    `${options.flowTitle} - ${sectionHeader}`
  );
if (!uploadResult.success || !uploadResult.url) {
throw new Error(uploadResult.error || 'Failed to upload image to WordPress');
  }

  // Step 6: Create markdown image link
  const altText = `${sectionHeader} - ${options.flowTitle}`;
  const markdownImage = `![${altText}](${uploadResult.url})`;
return {
    imageUrl: uploadResult.url,
    sectionHeader,
    markdownImage,
    mediaId: uploadResult.mediaId,
  };
}

