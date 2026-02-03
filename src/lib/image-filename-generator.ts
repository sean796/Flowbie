import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";

/**
 * Sanitizes a string to be used as a filename
 * Converts to lowercase, replaces spaces and special chars with hyphens
 */
export function sanitizeImageFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length
}

/**
 * Generates an SEO-optimized image filename using AI
 * @param sourceText - The blog title (for featured) or section name (for sections)
 * @param apiKey - OpenRouter API key
 * @param model - Model to use (defaults to "google/gemini-2.5-flash")
 * @param imageType - "featured" or "section"
 * @returns Promise resolving to a sanitized, SEO-friendly filename with .png extension
 */
export async function generateSEOImageFilename(
  sourceText: string,
  apiKey: string,
  model: string = getResearchModel(),
  imageType: "featured" | "section" = "featured"
): Promise<string> {
  if (!sourceText || !sourceText.trim()) {
    // Fallback to timestamp-based name
    return `image-${Date.now()}.png`;
  }

  try {
    const systemPrompt = `You are an SEO expert. Generate a minimal, SEO-friendly filename for an image.

Requirements:
- The filename should be 30-50 characters (excluding extension)
- Use lowercase letters and hyphens only (no spaces, underscores, or special characters)
- Include relevant keywords from the source text
- For featured images: include "featured" or a key keyword from the title
- For section images: use keywords from the section name
- Make it descriptive but concise
- Do NOT include the file extension (.png)
- Do NOT include any explanation, just return the filename

Examples:
- "Complete Guide to Window Treatments" → "window-treatments-featured"
- "Hunter Douglas Blinds Guide" → "hunter-douglas-blinds-guide"
- "Introduction to SEO" → "seo-introduction-guide"`;

    const userPrompt = imageType === "featured"
      ? `Generate an SEO-friendly filename for a featured blog image based on this title: "${sourceText}"`
      : `Generate an SEO-friendly filename for a section image based on this section name: "${sourceText}"`;

    let fullResponse = "";

    const result = await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.9,
      onContentChunk: (chunk: string) => {
        fullResponse += chunk;
      },
    });

    // Use the returned content, or fallback to accumulated response
    const responseText = result.content || fullResponse;

    // Clean up the response - remove markdown, quotes, etc.
    let filename = responseText
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^```\w*\n?|\n?```$/g, '') // Remove markdown code blocks
      .replace(/\.png$/i, '') // Remove .png if included (case insensitive)
      .replace(/\.png$/i, '') // Remove again in case of double extension
      .replace(/\.(jpg|jpeg|webp|gif)$/i, '') // Remove other image extensions
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .toLowerCase()
      .substring(0, 50); // Limit length

    // If the AI response is too short or invalid, fall back to sanitized source
    if (filename.length < 3) {
      filename = sanitizeImageFilename(sourceText);
      if (imageType === "featured") {
        filename = filename + "-featured";
      }
    }

    return `${filename}.png`;
  } catch (error) {
    console.error("Error generating SEO filename:", error);
    // Fallback to sanitized source text
    let fallback = sanitizeImageFilename(sourceText);
    if (imageType === "featured") {
      fallback = fallback + "-featured";
    }
    return `${fallback}.png`;
  }
}

