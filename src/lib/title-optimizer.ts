import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import { cleanTitleForNonEntity } from "./content-optimization-helpers";

/**
 * Generate an optimized SEO title from existing title and primary keyword.
 * Used when blueprint generation is skipped but title optimization is needed.
 */
export async function generateOptimizedTitle(
  existingTitle: string,
  primaryKeyword: string,
  siteId: string,
  entity?: string | 'N/A'
): Promise<string> {
  if (!existingTitle || !primaryKeyword) {
    return existingTitle || primaryKeyword;
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      // Fallback: use keyword-based title
      const fallbackTitle = truncateTitleForSEO(`${primaryKeyword} | ${existingTitle}`, 50);
      return fallbackTitle;
    }

    const researchModel = getResearchModel(siteId);
    
    const entityContext = entity && entity !== 'N/A' 
      ? `Target location/entity: ${entity}. The title should be optimized for local SEO.`
      : 'This is a general blog post, NOT location-specific. Do NOT include any location mentions.';

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `Optimize this blog post title for SEO:

Existing Title: "${existingTitle}"
Primary Keyword: "${primaryKeyword}"
${entityContext}

Requirements:
- Must include the primary keyword "${primaryKeyword}" naturally
- Maximum 50 characters (critical SEO requirement)
- If the existing title is long or wordy, make the new title SHORTER and more concise. Do not simply return the existing title — re-optimize it.
- ${entity && entity !== 'N/A' ? `Should reference "${entity}" naturally if relevant` : 'NO location mentions - this is a general blog post'}
- Compelling and click-worthy
- Preserve the core topic/meaning of the existing title

Rank Math Title Readability (apply when possible):
- Put the Focus Keyword at the BEGINNING of the title (or in the first few words)
- Include at least one sentiment word (e.g. best, essential, avoid, top, worst)
- Include at least one power word (e.g. ultimate, proven, simple, complete, essential)
- Include a number where it fits (e.g. "5 Tips…", "2024…", "7 Ways…")

Return ONLY the optimized title, nothing else. No quotes, no explanation.`
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const aiTitle = data.choices?.[0]?.message?.content?.trim() || '';

      if (aiTitle && aiTitle.length > 0) {
        // Remove quotes if present
        let cleanedTitle = aiTitle.replace(/^["']|["']$/g, '').trim();
        
        // Clean entity mentions if entity is N/A
        if (!entity || entity === 'N/A') {
          cleanedTitle = cleanTitleForNonEntity(cleanedTitle, 'N/A');
        }
        
        // Enforce 50 character limit
        cleanedTitle = truncateTitleForSEO(cleanedTitle, 50);

        if (cleanedTitle.length >= 10) {
          return cleanedTitle;
        }
      }
    }
  } catch (error) {
    console.warn('[Title Optimizer] Failed to generate optimized title via AI, using fallback:', error);
  }
  
  // Fallback: create keyword-based title
  const fallbackTitle = `${primaryKeyword} | ${existingTitle}`;
  return truncateTitleForSEO(fallbackTitle, 50);
}
