/**
 * Entity pool from Wikipedia — one AI pick (category or list), one fetch. No pattern matching.
 */

import { getPagesInCategory, extractEntitiesFromWikipediaList } from '@/lib/wikipedia-api';
import { decideWikipediaSourceWithAI } from './decide-wikipedia-source-ai';

export interface CategoryPoolEntity {
  entity: string;
  wikipediaUrl: string;
}

function toUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

/**
 * AI picks one Wikipedia source (category or list) from origins; modifier optional. One call, one fetch.
 */
export async function getEntityPoolFromWikipediaCategory(
  origins: string[],
  modifier: string | undefined,
  apiKey: string,
  options?: { limit?: number }
): Promise<CategoryPoolEntity[]> {
  const source = await decideWikipediaSourceWithAI(origins, modifier, apiKey);
  if (!source) return [];

  const limit = options?.limit ?? 500;
  if (source.type === 'category') {
    const full = source.title.startsWith('Category:') ? source.title : `Category:${source.title}`;
    const titles = await getPagesInCategory(full, { limit, pageOnly: true });
    return titles.map((title) => ({ entity: title, wikipediaUrl: toUrl(title) }));
  }
  const titles = await extractEntitiesFromWikipediaList(source.title);
  return titles.slice(0, limit).map((title) => ({ entity: title, wikipediaUrl: toUrl(title) }));
}
