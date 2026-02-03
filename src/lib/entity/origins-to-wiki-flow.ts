/**
 * Read origins → one AI call (Wikipedia source) → one fetch (category or list) → filter → return entities.
 * AI dictates the source from existing entities; prompt modifier is optional.
 */

import { decideWikipediaSourceWithAI, decideFallbackWikipediaSourceWithAI, type WikipediaSource } from './decide-wikipedia-source-ai';
import { getPagesInCategory, extractEntitiesFromWikipediaList } from '@/lib/wikipedia-api';
import { filterNonPlacesWithAI } from './filter-non-places-ai';
import { filterDuplicatesWithAI, filterWikipediaPoolWithAI } from './ai-dedupe-filter';
import type { FullAcfPostContext } from './read-existing-origins-api';
import { fetchScheduledPostTitles, checkConflicts, entityConflictsWithExisting } from '@/components/integrations/entity-generation/filtering/conflictChecker';
import { analyzeTitleFormat } from '@/components/integrations/entity-generation/generation/urlLocationExtractor';
import type { WordPressSite } from '@/components/integrations/types';
import type { EntityWithCriteria } from '@/components/integrations/entity-generation/types';

export interface OriginsToWikiFlowOptions {
  site: WordPressSite;
  existingEntities: string[];
  urls: string[];
  count: number;
  promptModifier?: string;
  apiKey: string;
  onProgress?: (message: string) => void;
  /** Entity sitemap URL (for pre-count dedupe: fetch titles and exclude existing locations). */
  entitySitemapUrl?: string;
  /** Full ACF context per service-area post for AI-driven dedupe (no extraction; used when set). */
  existingAcfContext?: FullAcfPostContext[];
}

export interface OriginsToWikiFlowResult {
  entities: EntityWithCriteria[];
  suggestedTitleFormat: string;
}

/**
 * One path: origins → one AI (pick source from entities, modifier optional) → one fetch → filter → return.
 */
export async function runOriginsToWikiFlow(
  options: OriginsToWikiFlowOptions
): Promise<OriginsToWikiFlowResult> {
  const { site, existingEntities, urls, count, promptModifier, apiKey, onProgress, entitySitemapUrl, existingAcfContext } = options;
  const suggestedTitleFormat = analyzeTitleFormat(urls, existingEntities, site.name);

  onProgress?.('Finding Wikipedia source from origin fields (AI)...');
  let source;
  try {
    source = await decideWikipediaSourceWithAI(existingEntities, promptModifier, apiKey);
    
    // Validate source is location-based
    if (source) {
      const titleLower = source.title.toLowerCase();
      const nonLocationKeywords = ['window', 'treatment', 'business', 'product', 'service'];
      if (nonLocationKeywords.some(kw => titleLower.includes(kw))) {
        console.warn(`[Entity Generation] AI picked non-location source "${source.title}", retrying with explicit location requirement...`);
        onProgress?.(`Retrying with explicit location requirement...`);
        // Retry with more explicit prompt
        const retryModifier = promptModifier 
          ? `${promptModifier} (LOCATIONS ONLY - cities, neighborhoods, streets, areas)`
          : 'LOCATIONS ONLY - cities, neighborhoods, streets, areas';
        source = await decideWikipediaSourceWithAI(existingEntities, retryModifier, apiKey);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Entity Generation] Failed to decide Wikipedia source:`, error);
    onProgress?.(`Error finding Wikipedia source: ${errorMsg}`);
    throw new Error(`Failed to find Wikipedia source: ${errorMsg}`);
  }
  
  if (!source) {
    const msg = `AI could not determine a LOCATION-BASED Wikipedia source from ${existingEntities.length} existing origin fields${promptModifier ? ` with modifier "${promptModifier}"` : ''}. Make sure your origin fields contain geographic locations (cities, neighborhoods, etc.).`;
    console.warn(`[Entity Generation] ${msg}`);
    onProgress?.(msg);
    return { entities: [], suggestedTitleFormat };
  }

  const scheduledTitles = await fetchScheduledPostTitles(site);
  const seen = new Set<string>();
  let validated: EntityWithCriteria[] = [];
  const usedSources: WikipediaSource[] = [];
  const maxFallbackAttempts = 3;

  async function fetchPoolFromSource(src: WikipediaSource): Promise<Array<{ entity: string; wikipediaUrl: string }>> {
    if (src.type === 'category') {
      const fullCategory = src.title.startsWith('Category:') ? src.title : `Category:${src.title}`;
      onProgress?.(`Loading pages from ${fullCategory}...`);
      const fetchLimit = Math.max(500, count * 100);
      const pageTitles = await getPagesInCategory(fullCategory, { limit: fetchLimit, pageOnly: true });
      return pageTitles.map((title) => ({
        entity: title,
        wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      }));
    }
    onProgress?.(`Loading entities from list: ${src.title}...`);
    const entityTitles = await extractEntitiesFromWikipediaList(src.title);
    return entityTitles.map((title) => ({
      entity: title,
      wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
    }));
  }

  function processPoolIntoValidated(
    pool: Array<{ entity: string; wikipediaUrl: string }>,
    src: WikipediaSource
  ): Promise<void> {
    return (async () => {
      if (pool.length === 0) return;
      let nextPool = pool;
      if (existingAcfContext && existingAcfContext.length > 0) {
        nextPool = await filterWikipediaPoolWithAI(pool, existingAcfContext, apiKey, onProgress);
      }
      onProgress?.(`Found ${nextPool.length} potential entities from Wikipedia ${src.type} "${src.title}"`);
      const batchSize = Math.min(nextPool.length, Math.max(count * 4, 80));
      for (let offset = 0; validated.length < count && offset < nextPool.length; offset += batchSize) {
        const batch = nextPool.slice(offset, offset + batchSize);
        const poolAfterNonPlaces = await filterNonPlacesWithAI(batch, apiKey, onProgress);
        const filtered = poolAfterNonPlaces.filter((e) => !entityConflictsWithExisting(e.entity, existingEntities));
        const candidates: EntityWithCriteria[] = filtered.map((e) => ({
          entity: e.entity,
          wikipediaUrl: e.wikipediaUrl,
          wikipediaTitle: e.entity,
        }));
        onProgress?.('Checking conflicts with scheduled posts...');
        const entityNames = candidates.map((e) => e.entity);
        const conflictResult = checkConflicts(entityNames, existingEntities, scheduledTitles);
        const allowedNames = new Set(conflictResult.nonConflictingEntities.map((s) => s.toLowerCase()));
        for (const e of candidates) {
          if (!allowedNames.has(e.entity.toLowerCase())) continue;
          const k = e.entity.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          validated.push(e);
        }
      }
    })();
  }

  // First source
  usedSources.push(source);
  let pool = await fetchPoolFromSource(source);
  if (pool.length > 0) {
    await processPoolIntoValidated(pool, source);
  }

  // Fallback: if not enough entities, ask AI for another category in same location (streets, avenues, etc.)
  let fallbackAttempts = 0;
  while (validated.length < count && fallbackAttempts < maxFallbackAttempts) {
    onProgress?.(`Need more entities (${validated.length}/${count}). Asking AI for another Wikipedia category in same location...`);
    const fallbackSource = await decideFallbackWikipediaSourceWithAI(
      usedSources,
      existingEntities,
      promptModifier,
      apiKey
    );
    if (!fallbackSource) break;
    usedSources.push(fallbackSource);
    fallbackAttempts++;
    pool = await fetchPoolFromSource(fallbackSource);
    if (pool.length === 0) {
      onProgress?.(`Fallback source "${fallbackSource.title}" had no pages, trying next...`);
      continue;
    }
    await processPoolIntoValidated(pool, fallbackSource);
  }

  if (validated.length > 0) {
    onProgress?.('Checking for duplicates with AI (validate before adding)...');
    const beforeDedupe = [...validated];
    const candidateNames = validated.map((e) => e.entity);
    const afterAi = await filterDuplicatesWithAI(
      candidateNames,
      existingEntities,
      apiKey,
      onProgress,
      scheduledTitles,
      existingAcfContext
    );
    const allowedSet = new Set(afterAi.map((n) => n.toLowerCase()));
    validated = validated.filter((e) => allowedSet.has(e.entity.toLowerCase()));
    if (validated.length < count && beforeDedupe.length >= count) {
      const validatedSet = new Set(validated.map((e) => e.entity.toLowerCase()));
      for (const e of beforeDedupe) {
        if (validated.length >= count) break;
        if (!validatedSet.has(e.entity.toLowerCase())) {
          validated.push(e);
          validatedSet.add(e.entity.toLowerCase());
        }
      }
    }
  }

  validated = validated.slice(0, count);
  return { entities: validated, suggestedTitleFormat };
}
