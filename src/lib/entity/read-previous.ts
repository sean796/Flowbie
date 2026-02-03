/**
 * Entity Read Previous — agentic wiki research
 * Parses sitemap and extracts existing entities + primary city for DFS query context.
 * Ensures we always scrape the connected site's service-area sitemap (never another site's).
 */

import { parseSitemap } from '@/lib/wordpress-api';
import {
  extractLocationFromUrls,
  determinePrimaryCity,
} from '@/components/integrations/entity-generation/generation/urlLocationExtractor';
import type { WordPressSite } from '@/components/integrations/types';

export interface ReadPreviousResult {
  existingEntities: string[];
  primaryCity: string | null;
  urls: string[];
}

/**
 * Normalize sitemap URL so it always points to the connected site.
 * If sitemapUrl is absolute and its host differs from site.siteUrl, use site origin + pathname.
 */
function ensureSitemapUrlForSite(site: WordPressSite, sitemapUrl: string): string {
  if (!sitemapUrl?.trim()) return sitemapUrl;
  try {
    const siteOrigin = new URL(site.siteUrl).origin;
    const sitemapParsed = new URL(sitemapUrl, site.siteUrl);
    if (sitemapParsed.origin !== siteOrigin) {
      return `${siteOrigin}${sitemapParsed.pathname}${sitemapParsed.search}`;
    }
  } catch {
    // leave as-is on parse error
  }
  return sitemapUrl;
}

/**
 * Read previous entities and primary city from entity sitemap.
 * Used as first step in agentic entity generation (count from user input).
 * Always fetches the connected site's sitemap (normalizes URL to site origin when needed).
 */
export async function readPreviousEntities(
  site: WordPressSite,
  sitemapUrl: string
): Promise<ReadPreviousResult> {
  const resolvedSitemapUrl = ensureSitemapUrlForSite(site, sitemapUrl);
  const parseResult = await parseSitemap(
    site.siteUrl,
    resolvedSitemapUrl,
    site.username,
    site.appPassword
  );
  if (!parseResult.urls || parseResult.urls.length === 0) {
    return { existingEntities: [], primaryCity: null, urls: [] };
  }
  const { existingEntities, cityNames, areaKeywords, stateNames } = extractLocationFromUrls(
    parseResult.urls,
    site
  );
  const primaryCity = determinePrimaryCity(cityNames, site, stateNames);
  return {
    existingEntities,
    primaryCity,
    urls: parseResult.urls,
  };
}
