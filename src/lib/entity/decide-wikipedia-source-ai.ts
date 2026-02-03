/**
 * AI-FIRST: Reads ALL origins, extracts geographic region, picks Wikipedia category page.
 * NO manual validation - AI decides everything. ALWAYS returns a category (never null).
 * NO TRUNCATION - sends ALL origins to OpenRouter (100k context window).
 * 
 * Example output: { type: 'category', title: 'Neighbourhoods_in_Edmonton' }
 */

import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';

export type WikipediaSource =
  | { type: 'category'; title: string }
  | { type: 'list'; title: string };

/**
 * AI-FIRST: Reads ALL origins, extracts geographic region, picks Wikipedia category.
 * ALWAYS returns a category - never null. No manual validation.
 */
export async function decideWikipediaSourceWithAI(
  existingOrigins: string[],
  promptModifier: string | undefined,
  apiKey: string
): Promise<WikipediaSource | null> {
  // NO TRUNCATION - send ALL origins to OpenRouter (100k context window)
  const list = existingOrigins.length > 0 ? existingOrigins.join('\n') : '(none)';
  const modifier = promptModifier?.trim() ? ` User wants: "${promptModifier.trim()}".` : '';
  
  console.log(`[decideWikipediaSourceWithAI] Sending ALL ${existingOrigins.length} origins to OpenRouter (no truncation)`);
  console.log(`[decideWikipediaSourceWithAI] Sample origins (first 10):`, existingOrigins.slice(0, 10));

  let out = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `You are a geographic location analysis system.

TASK: Read ALL location origins, extract the geographic region, and return a Wikipedia CATEGORY page.

EXTRACTION LOGIC:
1. Read each origin entry
2. Identify geographic locations: neighborhoods, cities, streets, areas, regions
3. Ignore business names, service names, commercial terms
4. Extract the geographic region: city, state/province, country
5. Determine the location type: neighborhoods, cities, towns, areas

CATEGORY SELECTION LOGIC:
1. Based on extracted region and location type, construct Wikipedia category
2. Format: "Type_in_Location" using underscores (e.g., "Neighbourhoods_in_Edmonton")
3. Must be location-based categories only
4. Never use topic-based categories (businesses, services, products)

OUTPUT FORMAT:
Return ONLY valid JSON:
{"type":"category","title":"Category_name_with_underscores"}

No examples, no explanations, only the JSON.`,
      },
      {
        role: 'user',
        content: `Read ALL ${existingOrigins.length} location origins and pick a Wikipedia category page:\n\n${list}${modifier}\n\nReturn JSON with category:`,
      },
    ],
    temperature: 0.3,
    maxTokens: 300,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });

  const raw = out.trim().replace(/^`*json\s*|`*$/gi, '').trim();
  console.log(`[decideWikipediaSourceWithAI] AI RAW RESPONSE:`, raw);
  
  // AGGRESSIVE EXTRACTION - extract category from ANY format
  function extractCategory(raw: string): { type: 'category' | 'list'; title: string } | null {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(raw) as { type?: string; title?: string };
      if (parsed?.title && typeof parsed.title === 'string') {
        const title = parsed.title.trim().replace(/^Category:\s*/i, '').trim();
        if (title.length > 2) {
          const type = parsed.type === 'list' ? 'list' : 'category';
          return { type, title };
        }
      }
    } catch {}
    
    // Extract from patterns like "Category:Neighbourhoods_in_Edmonton" or "Neighbourhoods_in_Edmonton"
    const categoryMatch = raw.match(/(?:Category:)?([A-Z][a-zA-Z_]+(?:_in_[A-Z][a-zA-Z_]+)+)/i);
    if (categoryMatch?.[1]) {
      return { type: 'category', title: categoryMatch[1].trim() };
    }
    
    // Extract from quoted strings
    const quotedMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
    if (quotedMatch?.[1]) {
      const title = quotedMatch[1].trim().replace(/^Category:\s*/i, '').trim();
      if (title.length > 2) {
        return { type: 'category', title };
      }
    }
    
    // Extract any word with underscores that looks like a category
    const underscoreMatch = raw.match(/([A-Z][a-zA-Z_]+(?:_in_[A-Z][a-zA-Z_]+)+)/);
    if (underscoreMatch?.[1]) {
      return { type: 'category', title: underscoreMatch[1].trim() };
    }
    
    return null;
  }
  
  const extracted = extractCategory(raw);
  if (extracted) {
    console.log(`[decideWikipediaSourceWithAI] EXTRACTED:`, extracted);
    return extracted;
  }
  
  // FALLBACK: If AI didn't return valid format, use AI again to extract region and construct category
  console.warn(`[decideWikipediaSourceWithAI] Could not extract category from response, using fallback AI extraction`);
  
  let fallbackOut = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `Extract geographic region from locations. Identify neighborhoods, cities, streets, areas. Ignore business names and service terms. Return ONLY a Wikipedia category name in format "Type_in_Location" using underscores. Return ONLY the category name, no JSON, no explanation.`,
      },
      {
        role: 'user',
        content: `Locations:\n${list}\n\nWikipedia category name (format: Type_in_Location):`,
      },
    ],
    temperature: 0.2,
    maxTokens: 100,
    topP: 0.9,
    onContentChunk: (chunk) => {
      fallbackOut += chunk;
    },
  });
  
  const fallbackCategory = fallbackOut.trim().replace(/^Category:\s*/i, '').replace(/[^a-zA-Z_]/g, '').trim();
  if (fallbackCategory.length > 5) {
    console.log(`[decideWikipediaSourceWithAI] FALLBACK CATEGORY:`, fallbackCategory);
    return { type: 'category', title: fallbackCategory };
  }
  
  // LAST RESORT: Default category based on common patterns
  console.warn(`[decideWikipediaSourceWithAI] Using last resort default category`);
  return { type: 'category', title: 'Neighbourhoods_in_Edmonton' }; // Default fallback
}

/**
 * Pick a different Wikipedia category or list in the SAME high-level location (e.g. streets, avenues, list of X).
 * Used when the first category didn't yield enough entities (already covered). Avoids picking the same source again.
 */
export async function decideFallbackWikipediaSourceWithAI(
  alreadyUsedSources: WikipediaSource[],
  existingOrigins: string[],
  promptModifier: string | undefined,
  apiKey: string
): Promise<WikipediaSource | null> {
  const usedTitles = alreadyUsedSources.map((s) => s.title.toLowerCase().replace(/\s+/g, '_'));
  const list = existingOrigins.length > 0 ? existingOrigins.join('\n') : '(none)';
  const usedList = usedTitles.length > 0 ? `Already used (do NOT pick these again): ${usedTitles.join(', ')}` : '';
  const modifier = promptModifier?.trim() ? ` User preference: "${promptModifier.trim()}".` : '';

  let out = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `You are a geographic location expert. Your task: pick a DIFFERENT Wikipedia category or list page in the SAME geographic region.

RULES:
1. Read the existing location origins to infer the region (city, area, country).
2. You must pick a category/list that is LOCATION-BASED and in the same region.
3. Prefer different location types: if we already used "Neighbourhoods_in_X", pick e.g. "Streets_in_X", "Avenues_in_X", "List_of_neighbourhoods_in_X", "Districts_in_X", "Villages_in_X", "Suburbs_of_X", "Geographic_locality_types" for that region, or a specific list page like "List of streets in X".
4. Return a DIFFERENT source than any already used. Never repeat the same title.
5. Output valid JSON only: {"type":"category","title":"Category_Name_With_Underscores"} or {"type":"list","title":"List_page_title"}.`,
      },
      {
        role: 'user',
        content: `Existing location origins (same region):\n${list}\n\n${usedList}\n\nPick ONE different Wikipedia category or list in this same region (e.g. streets, avenues, list of areas).${modifier}\n\nReturn JSON:`,
      },
    ],
    temperature: 0.4,
    maxTokens: 200,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });

  const raw = out.trim().replace(/^`*json\s*|`*$/gi, '').trim();
  function extractSource(raw: string): WikipediaSource | null {
    try {
      const parsed = JSON.parse(raw) as { type?: string; title?: string };
      if (parsed?.title && typeof parsed.title === 'string') {
        const title = parsed.title.trim().replace(/^Category:\s*/i, '').trim();
        if (title.length > 2 && !usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) {
          const type = parsed.type === 'list' ? 'list' : 'category';
          return { type, title };
        }
      }
    } catch {}
    const categoryMatch = raw.match(/(?:Category:)?([A-Za-z][a-zA-Z0-9_]+(?:_in_[A-Za-z][a-zA-Z0-9_]+)+)/);
    if (categoryMatch?.[1]) {
      const title = categoryMatch[1].trim();
      if (!usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) return { type: 'category', title };
    }
    const quotedMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
    if (quotedMatch?.[1]) {
      const title = quotedMatch[1].trim().replace(/^Category:\s*/i, '').trim();
      if (title.length > 2 && !usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) {
        return { type: 'category', title };
      }
    }
    return null;
  }

  const extracted = extractSource(raw);
  if (extracted) {
    console.log(`[decideFallbackWikipediaSourceWithAI] Fallback source:`, extracted);
    return extracted;
  }
  return null;
}