/**
 * Title Suggestion Module
 * Generates AI-suggested title templates for CSV generation
 */

import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { toast } from "sonner";
import type { WordPressSite } from "../../types";

/**
 * Generates an AI-suggested title template
 */
export async function generateAITitleSuggestion(
  entities: string[],
  site: WordPressSite
): Promise<string | null> {
  if (!entities || entities.length === 0) {
    toast.error('No entities available for title suggestion');
    return null;
  }

  const apiKey = loadApiKey();
  if (!apiKey || !apiKey.trim()) {
    toast.error('OpenRouter API key is required. Please set it in Settings.');
    return null;
  }

  const model = getResearchModel();
  const siteName = site.name || 'Service';
  const sampleEntities = entities.slice(0, 5).join(', ');
  
  const systemPrompt = `You are an expert SEO content strategist. Your task is to suggest an optimal title template for bulk blog post generation.

The title template should:
- Use variables: {entity}, {keyword}
- ALWAYS include the word "Near" before {entity}
- NEVER include the site/business name in the template
- Be SEO-friendly and natural
- Work well for local business content

Respond with ONLY the title template, nothing else. Do not include explanations, markdown, or code blocks.`;

  const userPrompt = `Generate a title template for local SEO blog posts.

Sample entities: ${sampleEntities}
Total entities: ${entities.length}

CRITICAL REQUIREMENTS:
1. MUST include "Near" before {entity} (e.g., "Near {entity}")
2. MUST NOT include the site/business name "${siteName}"
3. Can optionally use {keyword} variable
4. Must be optimized for local SEO

Examples of good templates:
- "{keyword} Near {entity}"
- "Services Near {entity}"
- "Near {entity}"

Generate the best title template (must include "Near" and must NOT include "${siteName}"):`;

  let suggestedTemplate = '';
  
  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.9,
      onContentChunk: (chunk) => {
        suggestedTemplate += chunk;
      }
    });

    // Clean up the response - remove markdown, quotes, etc.
    suggestedTemplate = suggestedTemplate
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^```[\w]*\n?|\n?```$/g, '') // Remove code blocks
      .trim();

    if (suggestedTemplate) {
      toast.success('Title template suggested!');
      return suggestedTemplate;
    } else {
      toast.error('Failed to generate title suggestion');
      return null;
    }
  } catch (error) {
    console.error('[Title Suggestion] Error:', error);
    toast.error(`Failed to generate title suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}
