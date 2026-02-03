/**
 * Entity Sitemap Detector
 * Automatically detects entity sitemaps from child sitemaps by analyzing patterns
 */

import { parseSitemap } from './wordpress-api';
import type { WordPressSite } from '@/components/integrations/types';

/**
 * Detects entity sitemap by analyzing child sitemaps and URL patterns
 * Looks for service-area, service_area, servicearea patterns and entity-like URLs
 * 
 * @param site - WordPress site with sitemaps detected
 * @returns Detected entity sitemap URL or null
 */
export async function detectEntitySitemap(site: WordPressSite): Promise<string | null> {
  if (!site.sitemaps?.childSitemaps || site.sitemaps.childSitemaps.length === 0) {
    console.log('[Entity Sitemap Detector] No child sitemaps available');
    return null;
  }

  if (!site.username || !site.appPassword) {
    console.log('[Entity Sitemap Detector] Missing credentials');
    return null;
  }

  console.log(`[Entity Sitemap Detector] Analyzing ${site.sitemaps.childSitemaps.length} child sitemaps...`);

  // Score each sitemap based on entity indicators
  const sitemapScores: Array<{ url: string; score: number; reasons: string[] }> = [];

  for (const sitemapUrl of site.sitemaps.childSitemaps) {
    let score = 0;
    const reasons: string[] = [];

    // Check sitemap URL for entity patterns
    const urlLower = sitemapUrl.toLowerCase();
    
    // Strong indicators (high score)
    if (urlLower.includes('service-area') || urlLower.includes('service_area') || urlLower.includes('servicearea')) {
      score += 10;
      reasons.push('service-area pattern in URL');
    }
    
    // Medium indicators
    if (urlLower.includes('entity') || urlLower.includes('entities')) {
      score += 5;
      reasons.push('entity keyword in URL');
    }
    
    if (urlLower.includes('location') || urlLower.includes('locations')) {
      score += 5;
      reasons.push('location keyword in URL');
    }

    // Check URL patterns in sitemap content
    try {
      const parseResult = await parseSitemap(
        site.siteUrl,
        sitemapUrl,
        site.username,
        site.appPassword
      );

      if (parseResult.urls && parseResult.urls.length > 0) {
        // Analyze URL patterns
        let entityUrlCount = 0;
        let serviceAreaPathCount = 0;
        
        for (const url of parseResult.urls.slice(0, 20)) { // Sample first 20 URLs
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
            
            // Check for service-area path pattern
            const hasServiceAreaPath = pathSegments.some(seg => 
              seg.toLowerCase().includes('service-area') || 
              seg.toLowerCase().includes('service_area')
            );
            
            if (hasServiceAreaPath) {
              serviceAreaPathCount++;
            }
            
            // Check for entity-like patterns (long slugs, location-like patterns)
            if (pathSegments.length > 0) {
              const lastSegment = pathSegments[pathSegments.length - 1];
              // Entity URLs often have long slugs with location names
              if (lastSegment.split('-').length >= 4) {
                entityUrlCount++;
              }
            }
          } catch {
            // Skip invalid URLs
          }
        }
        
        // Score based on URL patterns
        if (serviceAreaPathCount > 0) {
          score += serviceAreaPathCount * 2;
          reasons.push(`${serviceAreaPathCount} URLs with service-area path`);
        }
        
        if (entityUrlCount > 5) {
          score += 3;
          reasons.push(`${entityUrlCount} entity-like URLs (long slugs)`);
        }
        
        // High URL count suggests entity sitemap
        if (parseResult.urls.length > 50) {
          score += 2;
          reasons.push(`large sitemap (${parseResult.urls.length} URLs)`);
        }
      }
    } catch (error) {
      console.warn(`[Entity Sitemap Detector] Error parsing sitemap ${sitemapUrl}:`, error);
      // Continue with other sitemaps
    }

    if (score > 0) {
      sitemapScores.push({ url: sitemapUrl, score, reasons });
      console.log(`[Entity Sitemap Detector] ${sitemapUrl}: score=${score}, reasons=[${reasons.join(', ')}]`);
    }
  }

  // Return highest scoring sitemap
  if (sitemapScores.length > 0) {
    sitemapScores.sort((a, b) => b.score - a.score);
    const bestMatch = sitemapScores[0];
    
    if (bestMatch.score >= 5) { // Minimum threshold
      console.log(`[Entity Sitemap Detector] Detected entity sitemap: ${bestMatch.url} (score: ${bestMatch.score})`);
      return bestMatch.url;
    }
  }

  console.log('[Entity Sitemap Detector] No entity sitemap detected');
  return null;
}

