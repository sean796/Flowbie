/**
 * AI-only filter: remove non-places from Wikipedia category pool.
 * No static list, no fallbacks — the model decides which titles are real geographic places.
 * Filters out e.g. "Index of Florida-related articles", list pages, meta articles.
 */

import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import type { CategoryPoolEntity } from './category-pool';

/**
 * Use AI to keep only Wikipedia titles that are real geographic places.
 * Excludes index pages, list pages, meta articles, disambiguation, "X-related articles", etc.
 * No static filter and no fallback: if the API fails, we throw.
 */
export async function filterNonPlacesWithAI(
  pool: CategoryPoolEntity[],
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<CategoryPoolEntity[]> {
  if (pool.length === 0) return [];

  onProgress?.('Filtering non-places with AI (no static list)...');

  const systemPrompt = `You are a geographic place filter. You will receive a list of Wikipedia article TITLES from a category (e.g. cities, regions, neighborhoods).

Your task: Return ONLY the titles that are REAL GEOGRAPHIC PLACES — cities, towns, neighborhoods, regions, states, counties, districts, areas, etc. that a person could visit or that represent a location.

EXCLUDE (return these as NOT real places):
- Index pages: "Index of X", "Index of X-related articles"
- List pages: "List of X", "Lists of X", "Outline of X"
- Meta / navigation: "X-related articles", "X-related lists", "Wikipedia:X"
- Disambiguation pages when they are clearly disambiguation (e.g. "X (disambiguation)" if that's the full title)
- Categories, portals, templates
- Any title that is clearly a container or index, not an actual place name

INCLUDE: Only titles that are names of real geographic places (one place per title).

You must respond with ONLY a JSON array of strings: the exact titles that ARE real places, in the same order as they appear in the input. Use the exact same spelling and capitalization as the input.
Example: ["Baton Rouge, Louisiana", "Florida"] and not ["baton rouge, louisiana"].
No other text, no markdown, no explanation. Only the JSON array of strings.`;

  const titlesList = pool.map((e) => e.entity).join('\n');
  const userPrompt = `Wikipedia article titles (one per line). Return a JSON array of only the titles that are real geographic places. Exclude index/list/meta articles.

${titlesList}

JSON array of real-place titles only (exact same strings as above):`;

  let out = '';
  try {
    const result = await streamChatCompletion({
      apiKey,
      model: getResearchModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 8192,
      topP: 0.9,
      onContentChunk: (chunk) => {
        out += chunk;
      },
    });
    out = (result?.content ?? out).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AI non-place filter failed (no fallback): ${msg}`);
  }

  out = out.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  let allowedTitles: string[] = [];
  try {
    const match = out.match(/\[[\s\S]*\]/);
    if (match) {
      allowedTitles = JSON.parse(match[0]) as string[];
      if (!Array.isArray(allowedTitles)) {
        allowedTitles = [];
      }
    }
  } catch {
    throw new Error('AI non-place filter returned invalid JSON (no fallback).');
  }

  const allowedLower = new Set(allowedTitles.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const filtered = pool.filter((e) => allowedLower.has(e.entity.trim().toLowerCase()));
  onProgress?.(`AI kept ${filtered.length}/${pool.length} real places.`);
  return filtered;
}
