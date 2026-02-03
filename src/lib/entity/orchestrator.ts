/**
 * Entity Orchestrator — WordPress origin fields → OpenRouter (AI) → Wikipedia category/list only.
 * No Google search.
 */

import { loadApiKey } from '@/lib/api';
import { readPreviousEntities } from './read-previous';
import { fetchFullAcfContextForServiceAreas, getOriginOnlyListFromAcfContext } from './read-existing-origins-api';
import { filterDuplicatesWithAI } from './ai-dedupe-filter';
import { runOriginsToWikiFlow } from './origins-to-wiki-flow';
import { fetchScheduledPostTitles, checkConflicts } from '@/components/integrations/entity-generation/filtering/conflictChecker';
import { filterEntitiesNotInSitemap, filterAndSortByCriteria } from '@/components/integrations/entity-generation/filtering/entityFilter';
import { validateEntityByCriteria } from '@/components/integrations/entity-generation/validation/criteriaValidator';
import { analyzeTitleFormat } from '@/components/integrations/entity-generation/generation/urlLocationExtractor';
import type { WordPressSite } from '@/components/integrations/types';
import type { EntityWithCriteria, GenerationOptions } from '@/components/integrations/entity-generation/types';

export interface OrchestratorResult {
  entities: EntityWithCriteria[];
  suggestedTitleFormat: string;
}

/**
 * Run entity generation: WordPress origins → AI picks Wikipedia source → fetch category/list → filter. No Google.
 */
export async function runEntityOrchestrator(
  options: GenerationOptions,
  onProgress?: (message: string) => void,
  onCriteriaInfo?: (entity: string, criteriaData: EntityWithCriteria['criteriaData']) => void
): Promise<OrchestratorResult> {
  const { site, sitemapUrl, count, promptModifier } = options;
  const entitySitemapUrl = site.entitySitemapUrl || sitemapUrl;
  const openRouterApiKey = loadApiKey();
  // #region agent log
  fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrator.ts:entry',message:'Orchestrator entry',data:{count,sitemapUrl:entitySitemapUrl,siteId:site?.id,hasApiKey:!!openRouterApiKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key is required. Please set it in Settings.');
  }

  onProgress?.('Reading previous entities from sitemap...');
  let readResult;
  try {
    readResult = await readPreviousEntities(site, entitySitemapUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('HTML instead of XML') || msg.includes('Invalid sitemap')) {
      throw err;
    }
    throw new Error(`Failed to read sitemap: ${msg}`);
  }

  const { primaryCity, urls } = readResult;
  let existingEntities: string[] = [];

  let existingAcfContext: Awaited<ReturnType<typeof fetchFullAcfContextForServiceAreas>> = [];
  if (entitySitemapUrl?.trim()) {
    existingAcfContext = await fetchFullAcfContextForServiceAreas(
      site,
      entitySitemapUrl,
      onProgress
    );
    // Use ACF origin ONLY for duplicate exclusion — never slug or sitemap-derived names.
    if (existingAcfContext.length > 0) {
      existingEntities = getOriginOnlyListFromAcfContext(existingAcfContext);
    }
    // When ACF context is empty, keep existingEntities = [] (do not fall back to sitemap-derived).
  }

  // #region agent log
  fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrator.ts:afterRead',message:'After readPrevious',data:{existingCount:existingEntities.length,primaryCity,urlsCount:urls.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (!primaryCity) {
    throw new Error('Could not determine geographic area from URLs. Please ensure service-area URLs contain city names.');
  }
  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  const searchLocation = primaryCity;
  let validated: EntityWithCriteria[] = [];

  // --- Wiki path: AI picks one Wikipedia source from existing entities (modifier optional) → one fetch ---
  const wikiResult = await runOriginsToWikiFlow({
    site,
    existingEntities,
    urls,
    count,
    promptModifier,
    apiKey: openRouterApiKey,
    onProgress,
    entitySitemapUrl,
    existingAcfContext,
  });
  if (wikiResult.entities.length >= count) {
    return {
      entities: wikiResult.entities.slice(0, count),
      suggestedTitleFormat: wikiResult.suggestedTitleFormat,
    };
  }
  validated = wikiResult.entities;

  const seen = new Set<string>();
  validated = validated.filter((e) => {
    const k = e.entity.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (validated.length === 0) {
    const originCount = existingEntities.length;
    const wikiSource = wikiResult.entities.length === 0 ? 'no valid location-based Wikipedia source' : 'a Wikipedia source';
    throw new Error(
      `No entities found from Wikipedia. AI picked ${wikiSource} from ${originCount} origin field${originCount !== 1 ? 's' : ''}; none passed filters or may already be in the sitemap. Ensure your origin fields contain geographic locations (cities, neighborhoods, streets, etc.).`
    );
  }

  onProgress?.('Checking for duplicates with AI (validate before adding)...');
  const beforeDedupe = [...validated];
  const candidateNames = validated.map((e) => e.entity);
  const scheduledTitles = await fetchScheduledPostTitles(site);
  const afterAi = await filterDuplicatesWithAI(
    candidateNames,
    existingEntities,
    openRouterApiKey,
    onProgress,
    scheduledTitles,
    existingAcfContext.length > 0 ? existingAcfContext : undefined
  );
  const allowedSet = new Set(afterAi.map((n) => n.toLowerCase()));
  validated = validated.filter((e) => allowedSet.has(e.entity.toLowerCase()));
  // If AI dedupe left fewer than requested but we had enough before, fill back up to count
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

  if (promptModifier?.trim()) {
    onProgress?.(`Validating against criteria: "${promptModifier}"...`);
    const withCriteria: EntityWithCriteria[] = [];
    for (const e of validated) {
      try {
        const result = await validateEntityByCriteria(e.entity, promptModifier, openRouterApiKey);
        const criteriaData = {
          matches: result.matches,
          confidence: result.confidence,
          extractedData: result.extractedData ?? {},
          rankingValue: result.rankingValue,
        };
        onCriteriaInfo?.(e.entity, criteriaData);
        if (result.matches === true) {
          withCriteria.push({ ...e, criteriaData });
        }
      } catch {
        // skip
      }
    }
    validated = filterAndSortByCriteria(withCriteria, promptModifier, count);
  } else {
    validated = validated.slice(0, count);
  }

  const suggestedTitleFormat = analyzeTitleFormat(urls, existingEntities, site.name);
  return {
    entities: validated,
    suggestedTitleFormat,
  };
}
