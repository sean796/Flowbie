/**
 * Service Area Pack Generator
 * Generates service area templates using wiki entities and matching WP formulas
 */

import { loadApiKey } from './api';
import type { WPPageAnalysis } from './wp-page-analyzer';
import type { WordPressSite } from '@/components/integrations/types';
import { parseSitemap } from './wordpress-api';
import { extractEntitiesFromWikipediaList, checkWikipediaPageExists } from './wikipedia-api';
import { parseTitleTemplate } from './title-template-parser';
import { generateEntityTitleFromSitemap } from './bulk-auto-generate';

export interface ServiceAreaPackResult {
  serviceAreas: Array<{
    entity: string;
    title: string;
    keyword: string;
    url?: string;
  }>;
  analysisSummary: {
    entitiesFound: number;
    urlFormula?: string;
    titlePattern?: string;
  };
}

/**
 * Generates service area pack using wiki entities and matching WP formulas
 */
export async function generateServiceAreaPack(
  count: number,
  wpAnalysis: WPPageAnalysis,
  promptModifier: string | undefined,
  site: WordPressSite,
  sitemapUrl: string,
  apiKey: string,
  gscKeywordsByUrl?: Map<string, Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>>,
  entitySitemapUrl?: string,
  openRouterApiKey?: string
): Promise<ServiceAreaPackResult> {
  console.log(`[Service Area Pack Generator] Generating ${count} service areas...`);

  // Step 1: Find Wikipedia list page based on existing service areas
  const primaryLocation = wpAnalysis.entityPatterns?.commonLocations?.[0] || '';
if (!primaryLocation) {
throw new Error('Could not determine primary location from existing service areas. Please ensure service-area URLs contain city names.');
  }

  console.log(`[Service Area Pack Generator] Primary location: ${primaryLocation}`);

  // Step 2: Use wiki AI search to find entities
  let entities: string[] = [];
  
  try {
    // First, try to find a Wikipedia list page based on the modifier or location
    let wikiPageTitle = '';
    
    if (promptModifier && promptModifier.trim()) {
      // Use AI to find similar Wikipedia list pages (similar to EntityGenerationFeature)
      wikiPageTitle = await findWikipediaListPage(promptModifier, primaryLocation, apiKey);
    }
    
    // If no modifier or AI search failed, try common patterns
    if (!wikiPageTitle) {
      // Try common Wikipedia list page patterns
      const commonPatterns = [
        `List of ${primaryLocation.split(',')[0]} neighborhoods`,
        `Neighborhoods in ${primaryLocation}`,
        `List of cities in ${primaryLocation.split(',')[1]?.trim() || primaryLocation}`,
      ];
      
      for (const pattern of commonPatterns) {
        const exists = await checkWikipediaPageExists(pattern);
        if (exists.exists) {
          wikiPageTitle = pattern;
          break;
        }
      }
    }
    
    // If we found a Wikipedia page, extract entities
    if (wikiPageTitle) {
      console.log(`[Service Area Pack Generator] Using Wikipedia page: ${wikiPageTitle}`);
      entities = await extractEntitiesFromWikipediaList(wikiPageTitle);
    } else {
      // Fallback: use existing locations from WP analysis
      entities = wpAnalysis.entityPatterns?.commonLocations || [];
      console.log(`[Service Area Pack Generator] Using existing locations from WP analysis: ${entities.length} entities`);
    }
  } catch (error) {
    console.error('[Service Area Pack Generator] Error finding Wikipedia entities:', error);
    // Fallback to existing locations
    entities = wpAnalysis.entityPatterns?.commonLocations || [];
  }
if (entities.length === 0) {
throw new Error('No entities found. Please ensure service-area URLs contain location names or provide a prompt modifier.');
  }

  // Filter out existing entities by checking sitemap
  const existingEntities = await getExistingServiceAreaEntities(site, sitemapUrl);
  const newEntities = entities.filter(e => !existingEntities.includes(e.toLowerCase()));
  
  // Select entities for generation
  const selectedEntities = newEntities.slice(0, count);
if (selectedEntities.length === 0) {
throw new Error('No new entities available. All entities from Wikipedia already exist in the sitemap.');
  }

  console.log(`[Service Area Pack Generator] Selected ${selectedEntities.length} entities for generation`);

  // Step 3: Generate titles using WP analysis pattern or AI-based sitemap analysis
  const titlePattern = wpAnalysis.titlePattern || `${site.name} Near [Entity]`;
  const urlFormula = wpAnalysis.urlFormula || '/service-area/[location-slug]';
  
  // Generate service area entries
  const serviceAreas = await Promise.all(selectedEntities.map(async (entity, index) => {
    // Generate keyword - prioritize GSC keywords if available
    let keyword = entity; // Default to entity name
    
    if (gscKeywordsByUrl && gscKeywordsByUrl.size > 0) {
      // Try to find GSC keywords for a matching URL
      // Match by checking if any GSC URL contains the location slug or entity
      for (const [gscUrl, keywords] of gscKeywordsByUrl.entries()) {
        const urlLower = gscUrl.toLowerCase();
        const entityLower = entity.toLowerCase();
        const slugLower = entity.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
        
        // Check if URL matches this entity
        if (urlLower.includes(slugLower) || urlLower.includes(entityLower.replace(/\s+/g, '-'))) {
          // Use top keyword from GSC (sorted by impressions)
          if (keywords.length > 0) {
            const topKeyword = keywords.sort((a, b) => b.impressions - a.impressions)[0];
            keyword = topKeyword.query;
            console.log(`[Service Area Pack Generator] Using GSC keyword "${keyword}" for entity "${entity}" from URL "${gscUrl}"`);
            break;
          }
        }
      }
    }
    
    // Use AI-based title generation from entity sitemap if available
    // CRITICAL: All titles MUST include "Near" for "near me" search optimization
    let title: string;
    if (entitySitemapUrl && openRouterApiKey && site.entitySitemapUrl) {
      try {
        title = await generateEntityTitleFromSitemap(
          entity,
          entitySitemapUrl,
          site,
          openRouterApiKey,
          keyword
        );
        // Double-check that "Near" is present
        if (!title.toLowerCase().includes(' near ')) {
          console.warn(`[Service Area Pack Generator] AI-generated title missing "Near", fixing: "${title}"`);
          const serviceName = title.split(/\s+(?:in|at|for|around)\s+/i)[0] || keyword || site.name;
          title = `${serviceName} Near ${entity}`;
        }
        console.log(`[Service Area Pack Generator] Generated AI-based title for "${entity}": "${title}"`);
      } catch (error) {
        console.warn(`[Service Area Pack Generator] AI title generation failed for "${entity}", using pattern fallback:`, error);
        // Fallback to pattern-based generation (which ensures "Near" is included)
        title = generateTitleFromPattern(titlePattern, entity, keyword, site.name);
      }
    } else {
      // Use pattern-based generation (which ensures "Near" is included)
      title = generateTitleFromPattern(titlePattern, entity, keyword, site.name);
    }
    
    // Final validation: Ensure "Near" is always present
    if (!title.toLowerCase().includes(' near ')) {
      console.warn(`[Service Area Pack Generator] Title missing "Near", forcing inclusion: "${title}"`);
      const serviceName = keyword || site.name;
      title = `${serviceName} Near ${entity}`;
    }
    
    // Generate URL from formula
    const locationSlug = entity
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    const url = urlFormula.replace(/\[location-slug\]|\{location-slug\}/gi, locationSlug);
    
    return {
      entity,
      title,
      keyword,
      url
    };
  }));

  console.log(`[Service Area Pack Generator] Generated ${serviceAreas.length} service area entries`);

  return {
    serviceAreas,
    analysisSummary: {
      entitiesFound: entities.length,
      urlFormula,
      titlePattern
    }
  };
}

/**
 * Finds a Wikipedia list page using AI (similar to EntityGenerationFeature)
 */
async function findWikipediaListPage(
  promptModifier: string,
  primaryLocation: string,
  apiKey: string
): Promise<string> {
  const systemPrompt = `You are an expert at finding Wikipedia list pages. Given a prompt modifier and a primary location, suggest Wikipedia list page titles that would contain relevant entities.

Return ONLY the Wikipedia page title, nothing else. Example: "List of U.S. state capitals" or "List of neighborhoods in New York City"`;

  const userPrompt = `Find a Wikipedia list page for: "${promptModifier}" in the area: "${primaryLocation}"

What is the Wikipedia page title?`;

  try {
    const { getResearchModel } = await import("./optimization-settings-storage");
    const researchModel = getResearchModel();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI search failed: ${response.status}`);
    }

    const data = await response.json();
    const pageTitle = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Check if page exists
    if (pageTitle) {
      const exists = await checkWikipediaPageExists(pageTitle);
      if (exists.exists) {
        return pageTitle;
      }
    }
    
    return '';
  } catch (error) {
    console.error('[Service Area Pack Generator] Error finding Wikipedia page:', error);
    return '';
  }
}

/**
 * Gets existing service area entities from sitemap
 */
async function getExistingServiceAreaEntities(
  site: WordPressSite,
  sitemapUrl: string
): Promise<string[]> {
  try {
    const parseResult = await parseSitemap(
      site.siteUrl,
      sitemapUrl,
      site.username,
      site.appPassword
    );

    const existingEntities: string[] = [];
    
    for (const url of parseResult.urls || []) {
      try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
        const serviceAreaIndex = pathSegments.findIndex(seg => 
          seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
        );
        
        if (serviceAreaIndex >= 0 && serviceAreaIndex < pathSegments.length - 1) {
          const locationSegments = pathSegments.slice(serviceAreaIndex + 1);
          if (locationSegments.length > 0) {
            const locationSlug = locationSegments.join('-');
            const readableLocation = locationSlug
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            if (readableLocation) {
              existingEntities.push(readableLocation.toLowerCase());
            }
          }
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }
    
    return [...new Set(existingEntities)]; // Remove duplicates
  } catch (error) {
    console.error('[Service Area Pack Generator] Error getting existing entities:', error);
    return [];
  }
}

/**
 * Helper function to generate title from pattern (fallback when AI is not available)
 * CRITICAL: Always ensures "Near" is included for "near me" search optimization
 */
function generateTitleFromPattern(
  titlePattern: string,
  entity: string,
  keyword: string,
  siteName: string
): string {
  const templateVars: Record<string, string> = {
    Entity: entity,
    entity: entity,
    Keyword: keyword,
    keyword: keyword,
    Location: entity,
    location: entity,
  };
  
  // Use the template parser to replace all placeholders
  let title = parseTitleTemplate(titlePattern, templateVars);
  
  // Handle any remaining placeholders that weren't in the template vars
  // Remove [Benefit/Explanation] and similar if not provided
  title = title.replace(/\[Benefit\/Explanation\]|\{benefit\/explanation\}/gi, '');
  title = title.replace(/\[Benefit\]|\{benefit\}/gi, '');
  title = title.replace(/\[Explanation\]|\{explanation\}/gi, '');
  
  // Clean up any double spaces, colons with nothing after, etc.
  title = title.replace(/\s*:\s*$/g, ''); // Remove trailing colon
  title = title.replace(/\s*:\s*:\s*/g, ': '); // Fix double colons
  title = title.replace(/\s+/g, ' ').trim(); // Clean up spaces
  
  // If title is still just a pattern or empty, generate a proper title
  if (!title || title.includes('[') || title.includes('{')) {
    // Fallback: Generate a proper service area title with "Near" for "near me" searches
    title = `${siteName} Near ${entity}`;
  }
  
  // CRITICAL: Ensure "Near" is always present in the title for "near me" search optimization
  // If the pattern didn't include "Near", add it
  if (!title.toLowerCase().includes(' near ')) {
    // Extract service name (everything before location indicators)
    const nearMatch = title.match(/^(.+?)\s+(?:in|at|for|around)\s+(.+)$/i);
    if (nearMatch) {
      // Replace "in/at/for/around" with "Near"
      title = `${nearMatch[1]} Near ${nearMatch[2]}`;
    } else {
      // If no location indicator found, assume the last part is the entity
      // and add "Near" before it
      const parts = title.split(/\s+/);
      if (parts.length > 1) {
        // Try to identify entity (usually last word or last few words)
        const serviceName = parts.slice(0, -1).join(' ');
        const locationName = parts[parts.length - 1];
        title = `${serviceName} Near ${locationName}`;
      } else {
        // Single word - use site name as service
        title = `${siteName} Near ${title}`;
      }
    }
  }
  
  return title;
}

