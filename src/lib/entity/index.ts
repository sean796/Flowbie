/**
 * Entity module — agentic wiki research
 * Public API: generateEntities(options, onProgress?, onCriteriaInfo?).
 * Count is user input: return up to count entities; min 1 when possible.
 */

import { runEntityOrchestrator } from './orchestrator';
import type { GenerationOptions, EntityWithCriteria } from '@/components/integrations/entity-generation/types';

export { readPreviousEntities } from './read-previous';
export type { ReadPreviousResult } from './read-previous';
export { fetchExistingOriginsFromServiceAreas, getEntityPostTitles } from './read-existing-origins-api';
export { filterDuplicatesWithAI } from './ai-dedupe-filter';
export { extractLocationsFromEntityTitles } from './extract-locations-from-entity-titles';
export {
  filterWikipediaLocationsBeforeCount,
  type WikipediaPoolItem,
} from './pre-count-dedupe-filter';
export { getEntityPoolFromWikipediaCategory } from './category-pool';
export type { CategoryPoolEntity } from './category-pool';
export { validateEntityModifierViaGoogle, validatePoolWithModifierViaGoogle } from './validate-modifier-google';
export type { ValidateModifierResult } from './validate-modifier-google';
export {
  generateDfsSearchQuery,
  fetchSerpOrganic,
  deriveEntitySearchKeywordFromSiteName,
  deriveEntitySearchKeywordFromSiteContent,
  deriveTitleFormatFromExistingTitles,
} from './query-google';
export type { SerpOrganicItem } from './query-google';
export { extractCandidates } from './extract-candidates';
export { wikiValidateCandidates } from './wiki-validate';
export { runEntityOrchestrator } from './orchestrator';
export type { OrchestratorResult } from './orchestrator';

/**
 * Generate entities (agentic wiki research): read previous → DFS query → SERP → extract → wiki-validate.
 * Count = user input; returns up to count entities; guarantees at least 1 when possible.
 */
export async function generateEntities(
  options: GenerationOptions,
  onProgress?: (message: string) => void,
  onCriteriaInfo?: (entity: string, criteriaData: EntityWithCriteria['criteriaData']) => void
): Promise<{ entities: EntityWithCriteria[]; suggestedTitleFormat: string }> {
  // #region agent log
  fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entity/index.ts:generateEntities:entry',message:'Death Star generateEntities called',data:{count:options.count,sitemapUrl:options.sitemapUrl?.slice(0,80),siteId:options.site?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  return runEntityOrchestrator(options, onProgress, onCriteriaInfo);
}
