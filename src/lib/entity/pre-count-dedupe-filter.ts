/**
 * Pre-Count Deduplication Filter
 * Filters Wikipedia locations against entity sitemap titles/locations and existing origin ACF values.
 * Mandatory step: do not pull locations that already exist (origin ACF field or sitemap).
 * Uses high-level vs low-level: include city-level (e.g. Edmonton), exclude neighborhood-level (e.g. Alces, Edmonton).
 * No AI required.
 */

import { extractLocationsFromEntityTitles } from './extract-locations-from-entity-titles';

export interface WikipediaPoolItem {
  entity: string;
  wikipediaUrl: string;
}

/** Normalize for comparison: lowercase, collapse comma to space, collapse runs of spaces. */
function normalizeLocation(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify origin: true = high-level (e.g. city only like "Edmonton"), false = low-level (neighborhood like "Alces, Edmonton").
 * Single-word, no comma → high-level. Has comma or multiple words → low-level (neighborhood).
 */
function isLikelyHighLevelArea(origin: string): boolean {
  const t = origin.trim();
  if (!t) return false;
  const hasComma = t.includes(',');
  const tokens = t.split(/\s+/).filter(Boolean);
  return !hasComma && tokens.length <= 1;
}

/**
 * True if candidate should be excluded: exact match on any existing origin, or "contains" only for
 * low-level (neighborhood) origins. High-level (e.g. "Edmonton") is never used for contains,
 * so we keep generating neighborhoods under that city.
 * Also: candidate starting with existing + " " or "," (e.g. "Alces" excludes "Alces, Edmonton").
 */
function candidateMatchesExclude(
  normalizedCandidate: string,
  normalizedExcludeSet: Set<string>,
  lowLevelExcludeSet: Set<string>
): boolean {
  if (normalizedExcludeSet.has(normalizedCandidate)) return true;
  for (const ex of normalizedExcludeSet) {
    if (!ex) continue;
    if (ex.includes(normalizedCandidate)) return true;
    // e.g. existing "Alces" → exclude candidate "Alces, Edmonton" (neighborhood already exists)
    if (normalizedCandidate.startsWith(ex + ' ') || normalizedCandidate.startsWith(ex + ',')) return true;
  }
  for (const ex of lowLevelExcludeSet) {
    if (!ex) continue;
    const useContains = ex.length > 10 || ex.includes(' ');
    if (useContains && normalizedCandidate.includes(ex)) return true;
  }
  return false;
}

/**
 * Filter Wikipedia pool so that any location that already exists (per origin ACF field
 * or entity sitemap) is removed BEFORE counting. Uses all entities to find high-level
 * (e.g. Edmonton) vs low-level (neighborhoods like Alces, Edmonton): include high-level,
 * exclude low-level duplicates only.
 */
export async function filterWikipediaLocationsBeforeCount(
  wikipediaPool: WikipediaPoolItem[],
  entitySitemapTitles: string[],
  existingEntities: string[],
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<WikipediaPoolItem[]> {
  if (wikipediaPool.length === 0) return wikipediaPool;

  const hasExisting =
    entitySitemapTitles.length > 0 || existingEntities.length > 0;
  if (!hasExisting) {
    return wikipediaPool;
  }

  onProgress?.('Excluding locations that already exist (origin ACF field and sitemap)...');

  let excludeLocations: string[] = [];
  if (entitySitemapTitles.length > 0) {
    excludeLocations = await extractLocationsFromEntityTitles(
      entitySitemapTitles,
      apiKey,
      onProgress
    );
  }

  // Use only location-like strings for EXCLUDE (origin ACF + extracted from titles).
  const locationLikeExisting = existingEntities.filter((s) => {
    const t = s.trim();
    if (!t) return false;
    const parts = t.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length <= 2 && t.length <= 80;
  });
  const combinedExcludeRaw = [...new Set([...locationLikeExisting, ...excludeLocations])]
    .map((s) => s.trim())
    .filter(Boolean);
  // Also add "part before comma" so "Alces, Edmonton" → we exclude by "Alces" too (candidate "Alces, Edmonton" matches startsWith "alces ").
  const withLeadingTokens: string[] = [...combinedExcludeRaw];
  for (const s of combinedExcludeRaw) {
    const commaIdx = s.indexOf(',');
    if (commaIdx > 0) {
      const beforeComma = s.slice(0, commaIdx).trim();
      if (beforeComma.length >= 2) withLeadingTokens.push(beforeComma);
    }
  }
  const combinedExclude = [...new Set(withLeadingTokens)];

  if (combinedExclude.length === 0) {
    return wikipediaPool;
  }

  // Debug: log exclude list size and sample so we can verify slug-derived entities are included
  if (typeof fetch === 'function') {
    fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'pre-count-dedupe-filter.ts:excludeList',
        message: 'Pre-count exclude list (existing entities + title-extracted)',
        data: { combinedExcludeCount: combinedExclude.length, combinedExcludeSample: combinedExclude.slice(0, 20) },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'G',
      }),
    }).catch(() => {});
  }

  const normalizedExcludeSet = new Set(combinedExclude.map(normalizeLocation));
  // Low-level only: use for "candidate contains exclude". High-level (e.g. "Edmonton") not used for contains.
  const lowLevelExcludeSet = new Set<string>();
  for (const raw of combinedExclude) {
    const norm = normalizeLocation(raw);
    if (!isLikelyHighLevelArea(raw)) {
      lowLevelExcludeSet.add(norm);
    }
  }

  const filtered: WikipediaPoolItem[] = [];
  for (const item of wikipediaPool) {
    const norm = normalizeLocation(item.entity);
    if (!candidateMatchesExclude(norm, normalizedExcludeSet, lowLevelExcludeSet)) {
      filtered.push(item);
    }
  }

  const removed = wikipediaPool.length - filtered.length;
  if (removed > 0) {
    onProgress?.(
      `Pre-count dedupe: excluded ${removed} location(s) already in origin ACF field or sitemap.`
    );
  }

  return filtered;
}
