/**
 * Entity Filtering Module
 * Filters entities by sitemap, criteria, and selects final entities
 */

import { validateEntityNotInSitemap } from "../validation/entityValidator";
import type { EntityWithCriteria } from "../types";

export interface FilterResult {
  entitiesNotInSitemap: string[];
  sitemapFilteredCount: number;
}

/**
 * Filters entities that exist in sitemap
 */
export function filterEntitiesNotInSitemap(
  entities: string[],
  sitemapUrls: string[]
): FilterResult {
  let sitemapFilteredCount = 0;
  
  const entitiesNotInSitemap = entities.filter(entity => {
    const notInSitemap = validateEntityNotInSitemap(entity, sitemapUrls);
    if (!notInSitemap) {
      sitemapFilteredCount++;
    }
    return notInSitemap;
  });
  
  console.log(`[Entity Generation] After sitemap validation: ${entitiesNotInSitemap.length} entities remain (${sitemapFilteredCount} filtered out as they exist in sitemap)`);
  
  return {
    entitiesNotInSitemap,
    sitemapFilteredCount
  };
}

/**
 * Selects entities for validation (2-3x the requested count)
 */
export function selectEntitiesForValidation(
  entities: string[],
  count: number,
  hasCriteria: boolean
): string[] {
  const selectionMultiplier = hasCriteria ? 3 : 2; // More entities needed if filtering by criteria
  
  if (entities.length > count * selectionMultiplier) {
    // Randomly shuffle and select
    const shuffled = [...entities].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count * selectionMultiplier);
    console.log(`[Entity Generation] Selected ${selected.length} entities from ${entities.length} available for Wikipedia validation`);
    return selected;
  } else {
    // Use all available entities
    console.log(`[Entity Generation] Using all ${entities.length} entities for Wikipedia validation`);
    return entities;
  }
}

/**
 * Formats entities (adds city if needed)
 */
export function formatEntities(
  entities: string[],
  primaryCity: string | null
): string[] {
  return entities.map(entity => {
    // Format: add city if not present and primaryCity exists
    if (primaryCity && !entity.toLowerCase().includes(primaryCity.toLowerCase())) {
      return `${entity} ${primaryCity}`;
    }
    return entity;
  });
}

/**
 * Filters entities by criteria and sorts them
 */
export function filterAndSortByCriteria(
  entitiesWithWikipedia: EntityWithCriteria[],
  promptModifier: string | undefined,
  count: number
): EntityWithCriteria[] {
  // CRITICAL: Filter entities that match criteria (if criteria specified)
  // STRICT: Only include entities where matches === true
  const entitiesMatchingCriteria = promptModifier 
    ? entitiesWithWikipedia.filter(e => {
        // STRICT: If criteria is specified, criteriaData must exist AND matches must be exactly true
        if (!e.criteriaData) {
          console.warn(`[Entity Generation] Entity "${e.entity}" has no criteriaData but criteria was specified - EXCLUDING`);
          return false;
        }
        if (e.criteriaData.matches !== true) {
          console.warn(`[Entity Generation] Entity "${e.entity}" does not match (matches: ${e.criteriaData.matches}) - EXCLUDING`);
          return false;
        }
        return true; // Only explicit matches
      })
    : entitiesWithWikipedia;
  
  console.log(`[Entity Generation] Found ${entitiesWithWikipedia.length} entities with Wikipedia pages${promptModifier ? `, ${entitiesMatchingCriteria.length} matching criteria "${promptModifier}"` : ''}`);
  
  // Sort by ranking value if criteria validation provided ranking
  if (promptModifier && entitiesMatchingCriteria.some(e => e.criteriaData?.rankingValue !== undefined)) {
    entitiesMatchingCriteria.sort((a, b) => {
      const rankA = a.criteriaData?.rankingValue ?? 0;
      const rankB = b.criteriaData?.rankingValue ?? 0;
      return rankB - rankA; // Sort descending (highest first)
    });
    console.log(`[Entity Generation] Sorted entities by ranking value`);
  } else if (entitiesMatchingCriteria.length > count) {
    // If no ranking, sort by confidence (if available) or randomly
    entitiesMatchingCriteria.sort((a, b) => {
      const confA = a.criteriaData?.confidence ?? 50;
      const confB = b.criteriaData?.confidence ?? 50;
      return confB - confA; // Sort descending (highest confidence first)
    });
  }
  
  // Take exactly the requested count (or all available if less)
  return entitiesMatchingCriteria.slice(0, count);
}
