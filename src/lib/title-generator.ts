import { streamChatCompletion } from "./api";
import type { KeywordData } from "./keyword-types";
import { getResearchModel } from "./optimization-settings-storage";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";

export interface GenerateTitleOptionsParams {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entity?: string; // Optional entity for content optimization
}

/**
 * Generates 3-5 SEO-friendly title options based on keyword data and selected H2 sections
 */
export async function generateTitleOptions(
  keywordData: KeywordData,
  selectedH2Sections: string[],
  options: GenerateTitleOptionsParams
): Promise<string[]> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 2000,
    topP = 0.9,
  } = options;

  const h2Context = selectedH2Sections.length > 0
    ? `\nSelected H2 Sections to cover:\n${selectedH2Sections.map((h2, idx) => `${idx + 1}. ${h2}`).join("\n")}`
    : "";

  const entityContext = options.entity && options.entity.trim()
    ? `\n--- Entity Optimization Context ---
Target Entity: ${options.entity.trim()}

CRITICAL: Optimize all title options to include and optimize for the entity "${options.entity.trim()}". Entity optimization is extremely important for SEO and content relevance. Include the entity naturally in titles where it makes sense.`
    : `\n--- NO Entity / Regular Blog Post ---
CRITICAL: This is a REGULAR BLOG POST with NO entity/location targeting.

ABSOLUTELY FORBIDDEN:
- Do NOT include any city names, location names, geographic references, or place names in the titles
- Do NOT use placeholders like [city], [location], [area], or any bracket notation
- Do NOT add phrases like "in [city]", "near [location]", or similar location-based patterns
- Generate general, non-location-specific titles that are applicable broadly

The titles should be general informational content suitable for any location, with NO geographic targeting.`;

  const systemPrompt = `You are an expert SEO content strategist. Generate 3-5 compelling, SEO-friendly blog title options for the given keyword.

Keyword Context:
- Primary Keyword: ${keywordData.keyword}
- Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
- Difficulty: ${keywordData.difficulty || "N/A"}/100
- Intent: ${keywordData.intent || "N/A"}
${h2Context}${entityContext}

Title Requirements:
- **ABSOLUTELY MANDATORY: Each title MUST be MAXIMUM 50 characters (Death Star module requirement)**
- **CRITICAL: Count every single character including spaces and punctuation**
- **If you generate a title longer than 50 characters, it will be automatically truncated and may lose important information**
- Include the primary keyword naturally (but keep it under 50 chars total)
- Use power words that increase click-through rates (Ultimate, Complete, Best, Guide, How-to, etc.) - but keep titles SHORT
- Vary the title styles (How-to guides, Ultimate guides, Complete guides, Lists, Comparisons, etc.)
- Make titles compelling and clickable - but prioritize staying under 50 characters
- Ensure titles accurately reflect the content based on the H2 sections - but keep them concise
- **EXAMPLES OF CORRECT LENGTH**:
  ✅ "Top Window Treatments Guide" (29 chars)
  ✅ "How to Choose Window Shades" (28 chars)
  ✅ "Best Motorized Blinds Guide" (27 chars)
- **EXAMPLES OF TOO LONG (DO NOT GENERATE)**:
  ❌ "The Ultimate Guide to Hurricane-Proof Window Coverings in Florida: Costs, Benefits & Options" (88 chars - TOO LONG)
  ❌ "Top-Down/Bottom-Up Shades: A Stylish Way to Maximize Privacy and Convenience" (77 chars - TOO LONG)

Output Format:
Return ONLY a JSON array of title strings, like:
["Title Option 1", "Title Option 2", "Title Option 3", "Title Option 4", "Title Option 5"]

Do not include any explanations, markdown formatting, or additional text. Only the JSON array.`;

  const userPrompt = `Generate 3-5 SEO-optimized blog title options for the keyword "${keywordData.keyword}". Make each title unique in style and compelling.`;

  let fullResponse = "";

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Parse JSON response
    const parsed = JSON.parse(cleanedResponse);
    
    // Ensure it's an array and return titles
    if (Array.isArray(parsed)) {
      // CRITICAL: Enforce 50 character limit for Death Star module (optimized content)
      const filteredTitles = parsed.filter((title: any) => typeof title === "string" && title.trim().length > 0);
      return filteredTitles.map((title: string) => {
        const truncated = truncateTitleForSEO(title, 50);
        if (title.length > 50) {
          console.log('[Title Generator] Truncated title to 50 characters (Death Star module requirement):', {
            original: title,
            truncated: truncated,
            originalLength: title.length,
            truncatedLength: truncated.length
          });
        }
        return truncated;
      });
    }

    // Fallback: try to extract titles from text if JSON parsing failed
    const lines = cleanedResponse.split("\n");
    const titles: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Match numbered list items or quoted strings
      const match = trimmed.match(/^(?:\d+\.\s*)?["']?([^"'\n]{20,80})["']?[,;]?$/);
      if (match && match[1]) {
        titles.push(match[1].trim());
      }
    }

    const finalTitles = titles.length > 0 ? titles.slice(0, 5) : [keywordData.keyword];
    // CRITICAL: Enforce 50 character limit for Death Star module (optimized content)
    return finalTitles.map((title: string) => {
      const truncated = truncateTitleForSEO(title, 50);
      if (title.length > 50) {
        console.log('[Title Generator] Truncated fallback title to 50 characters (Death Star module requirement):', {
          original: title,
          truncated: truncated,
          originalLength: title.length,
          truncatedLength: truncated.length
        });
      }
      return truncated;
    });
  } catch (error) {
    console.error("Error generating title options:", error);
    // Fallback: return a simple title based on keyword (truncated to 50 chars)
    const fallbackTitles = [`Complete Guide to ${keywordData.keyword}`, `How to ${keywordData.keyword}`, `Everything You Need to Know About ${keywordData.keyword}`];
    return fallbackTitles.map(title => truncateTitleForSEO(title, 50));
  }
}
