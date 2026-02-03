/**
 * Entity Wiki Validate — agentic wiki research
 * Batch Wikipedia existence check; build EntityWithCriteria[] for entities that exist.
 */

import { validateEntitiesExist } from '@/lib/wikipedia-api';
import type { EntityWithCriteria } from '@/components/integrations/entity-generation/types';

/**
 * Validate candidates against Wikipedia (batch). Return only those with a wiki page.
 */
export async function wikiValidateCandidates(
  candidates: string[]
): Promise<EntityWithCriteria[]> {
  if (candidates.length === 0) return [];
  const results = await validateEntitiesExist(candidates);
  const entities: EntityWithCriteria[] = [];
  for (const r of results) {
    if (r.exists && r.url && r.title) {
      entities.push({
        entity: r.entity,
        wikipediaUrl: r.url,
        wikipediaTitle: r.title,
      });
    }
  }
  return entities;
}
