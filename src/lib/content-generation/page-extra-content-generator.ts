/**
 * Page Extra Content Generator
 * Generates complementary helpful linked content for pages (seo_extra_text ACF field)
 * and AI-generated images for pages (seo_extra_image ACF field)
 */

import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { WordPressSite } from "@/components/integrations/types";

export interface GenerateExtraTextOptions {
  existingContent: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  wordPressRAGContext?: string;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  site: WordPressSite;
  apiKey: string;
  siteId?: string;
}

export interface GenerateExtraImageOptions {
  existingContent: string;
  primaryKeyword: string;
  site: WordPressSite;
  apiKey: string;
  siteId?: string;
}

/**
 * Generate complementary helpful linked content for pages
 * This content will be placed in the seo_extra_text ACF field
 */
export async function generateExtraTextForPage(
  options: GenerateExtraTextOptions
): Promise<string> {
  const {
    existingContent,
    primaryKeyword,
    secondaryKeywords,
    wordPressRAGContext = '',
    wordPressPosts = [],
    site,
    apiKey,
    siteId
  } = options;

  try {
    const researchModel = getResearchModel(siteId);
    
    // Extract text content from existing page (remove HTML/markdown)
    const textContent = existingContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Remove images
      .replace(/\*\*([^\*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^\*]+)\*/g, '$1') // Remove italic
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 3000); // Limit to 3000 chars for context

    // Build WordPress posts context for linking
    let wordPressPostsContext = '';
    if (wordPressPosts.length > 0) {
      wordPressPostsContext = `\n\n=== AVAILABLE INTERNAL LINKS ===\n${wordPressPosts.map(p => `- [${p.title}](${p.link})`).join('\n')}\n=== END INTERNAL LINKS ===\n`;
    }

    // Build RAG context if available
    const ragContext = wordPressRAGContext 
      ? `\n\n=== RELATED CONTENT FOR REFERENCE ===\n${wordPressRAGContext.substring(0, 2000)}\n=== END RELATED CONTENT ===\n`
      : '';

    const combinedKeywords = [primaryKeyword, ...secondaryKeywords]
      .filter(kw => kw && kw.trim().length > 0)
      .join(', ');

    const systemPrompt = `You are an expert SEO content writer specializing in creating complementary helpful content for existing web pages.

Your task is to generate additional helpful linked content that:
1. Complements the existing page content without repeating it
2. Adds value by providing related information, resources, or deeper insights
3. Includes helpful internal links to related posts/pages
4. Is written in a natural, engaging style
5. Does NOT conflict with or contradict existing content
6. Enhances the user experience by providing additional context

CRITICAL REQUIREMENTS:
- MUST include exactly one H2 heading (## Heading Text) at the beginning of the content. The H2 should summarize the section topic (e.g. ## Related Window Treatment Resources).
- At least one subheading (H2, H3, or H4) MUST include the Focus Keyword (primary keyword) naturally—e.g. "Why [Primary Keyword] Matters", "[Primary Keyword] Tips", "Best [Primary Keyword] Resources". Rank Math requires the focus keyword in subheadings.
- After the H2, write 1-2 overview paragraphs before the first H3. The first H3 must come after this H2 overview content (never put H3 directly under H2 with no paragraph in between).
- MUST include at least one H3 subheading (### Subheading) after the H2 overview paragraph(s), e.g. to introduce a subsection.
- MUST include at least one structured element: either a bullet or numbered list (- item or 1. item) OR a markdown table (| Col1 | Col2 |). This improves HTML structure and content ratio for SEO.
- Good HTML ratio means a mix of headings (H2, H3), paragraphs, and structured elements (lists/tables).
- Use the Focus Keyword a few times naturally in the body (natural keyword density)—do not stuff; Rank Math checks keyword density.
- Generate 2-4 paragraphs of complementary content after the H2 (overview first, then H3 and rest)
- Include 3-5 internal links to related posts/pages from the available links list
- Use markdown format with proper link syntax: [Link Text](URL)
- Do NOT repeat information already in the existing content
- Do NOT contradict existing content
- Focus on related topics, additional resources, or deeper insights
- Write in a helpful, informative tone
- Keep paragraphs concise (2-4 sentences each)

ABSOLUTE FORBIDDEN:
- NO repetition of existing content
- NO conflicting information
- NO external links (except Wikipedia if provided in research)
- NO placeholder links or made-up URLs
- NO generic filler content
- NO "Introduction" or "Conclusion" sections
- NO em dashes (use commas instead)
- NO conditional phrasing ("if X then Y", "it is important to note")

Format your response as clean markdown with proper paragraph breaks and internal links.`;

    const userPrompt = `Generate complementary helpful linked content for a page about "${combinedKeywords}".

EXISTING PAGE CONTENT (DO NOT REPEAT THIS):
${textContent}
${wordPressPostsContext}
${ragContext}

Generate 2-4 paragraphs of complementary content that:
- STARTS with exactly one H2 heading (## Your Heading Here). At least one heading (H2 or H3) must include the primary keyword "${primaryKeyword}" naturally (e.g. "Why ${primaryKeyword} Matters", "${primaryKeyword} Tips").
- After the H2, includes 1-2 overview paragraphs before any H3 (H2 overview paragraph must come before the first H3)
- Includes at least one H3 (### Your Subheading) after the H2 overview paragraph(s)
- Uses the focus keyword "${primaryKeyword}" a few times naturally in the body (natural density, no stuffing)
- Includes at least one list (bullets or numbers) or a small table where it fits the topic
- Adds value beyond what's already on the page
- Includes helpful internal links to related content
- Provides additional context, resources, or insights
- Enhances the user experience
- Does NOT conflict with existing content

Focus on related topics, additional resources, or deeper insights that complement the existing content.`;

    let generatedText = '';
    await streamChatCompletion({
      apiKey,
      model: researchModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        generatedText += chunk;
      }
    });

    let trimmed = generatedText.trim();
    // Ensure H2 at start; prepend if missing
    if (!trimmed.match(/^##\s+.+$/m)) {
      const h2Title = primaryKeyword || 'Related Information';
      trimmed = `## ${h2Title}\n\n${trimmed}`;
    }
    // Ensure at least one H3 for HTML ratio; insert after first H2 overview paragraph (not immediately after H2)
    if (!trimmed.includes('### ')) {
      const h3Title = primaryKeyword ? `Key Points About ${primaryKeyword}` : 'Key Points';
      const h2Match = trimmed.match(/^(##\s+[^\n\r]+)(\r?\n*)([\s\S]*)$/);
      if (h2Match) {
        const [, h2Line, afterH2Newlines, rest] = h2Match;
        const blocks = rest.split(/\n\n+/).filter(Boolean);
        const firstBlock = blocks[0]?.trim() ?? '';
        // Insert H3 after the first paragraph block so we have H2 -> overview paragraph -> H3
        const afterFirstBlock = firstBlock
          ? `${firstBlock}\n\n### ${h3Title}\n\n${blocks.slice(1).join('\n\n').trim()}`
          : `### ${h3Title}\n\n${rest.trim()}`;
        trimmed = `${h2Line}${afterH2Newlines || '\n\n'}${afterFirstBlock}`;
      } else {
        trimmed = `### ${h3Title}\n\n${trimmed}`;
      }
    }
    // Ensure at least one structured element (list or table) for HTML ratio; append list if missing
    const hasList = /^(?:[-*]\s|\d+\.\s)/m.test(trimmed);
    const hasTable = /\|.+\|.+\|/.test(trimmed);
    if (!hasList && !hasTable) {
      const fallbackHeading = primaryKeyword ? `Quick Takeaways: ${primaryKeyword}` : 'Key Takeaways';
      const fallbackList = primaryKeyword
        ? `\n\n### ${fallbackHeading}\n\n- Important points about ${primaryKeyword}\n- Related resources and next steps\n- Further reading`
        : '\n\n### Key Takeaways\n\n- Related resources and next steps\n- Further reading\n- Additional information';
      trimmed = trimmed + fallbackList;
    }
    return trimmed;
  } catch (error) {
    console.error('[Page Extra Text Generator] Error generating extra text:', error);
    throw new Error(`Failed to generate extra text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate AI image for pages (seo_extra_image ACF field)
 * Always 1:1 ratio, never includes people or pets
 */
export async function generateExtraImageForPage(
  options: GenerateExtraImageOptions
): Promise<{ imageBase64: string; imageUrl?: string }> {
  const {
    existingContent,
    primaryKeyword,
    site,
    apiKey,
    siteId
  } = options;

  try {
    // Extract text content for image prompt context
    const textContent = existingContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Remove images
      .trim()
      .substring(0, 1500); // Limit for image prompt

    // Build image prompt using existing prompt builder
    const imagePrompt = buildImagePrompt(
      {
        flowTitle: primaryKeyword,
        flowPurpose: `Visual representation for page about ${primaryKeyword}`,
        finalOutput: textContent
      },
      {
        includeText: false,
        includePeople: false, // NEVER include people
        includeAnimals: false, // NEVER include pets/animals
        includeCars: false,
        isInfographic: false,
        aspectRatio: '1:1', // Always 1:1 ratio
        style: 'professional',
        colorScheme: 'vibrant'
      }
    );

    const imagePromptWithRestrictions = `${imagePrompt} ABSOLUTELY NO text, logos, characters, letters, numbers, symbols, watermarks, or any written content visible in the image. Pure visual representation only.`;

    // Generate image with 1:1 aspect ratio
    const imageResult = await generateImage({
      apiKey,
      prompt: imagePromptWithRestrictions,
      model: 'google/gemini-3-pro-image-preview',
      aspectRatio: '1:1'
    });

    if (imageResult.error) {
      throw new Error(imageResult.error);
    }

    if (!imageResult.imageBase64 && !imageResult.imageUrl) {
      throw new Error('No image data returned from image generation API');
    }

    // Convert URL to base64 if needed, or extract base64 from data URL
    let imageBase64: string;
    if (imageResult.imageBase64) {
      // If it's already a data URL, extract just the base64 part
      if (imageResult.imageBase64.startsWith('data:')) {
        const base64Match = imageResult.imageBase64.match(/base64,(.+)$/);
        imageBase64 = base64Match ? base64Match[1] : imageResult.imageBase64;
      } else {
        imageBase64 = imageResult.imageBase64;
      }
    } else if (imageResult.imageUrl) {
      // Fetch image from URL and convert to base64
      const response = await fetch(imageResult.imageUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      // Convert ArrayBuffer to base64 (browser-compatible)
      const bytes = new Uint8Array(arrayBuffer);
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
      imageBase64 = btoa(binary);
    } else {
      throw new Error('No image data available');
    }

    return {
      imageBase64,
      imageUrl: imageResult.imageUrl
    };
  } catch (error) {
    console.error('[Page Extra Image Generator] Error generating extra image:', error);
    throw new Error(`Failed to generate extra image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
