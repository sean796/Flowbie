/**
 * Location Extraction Module
 * Main orchestration for location extraction
 */

import { toast } from "sonner";
import type { WordPressSite } from "../../types";
import type { LocationExtractionResult } from "../types";
import { extractLocationFromUrls, determinePrimaryCity, extractLocationFromUrlsWithRegex, analyzeTitleFormat } from "./urlLocationExtractor";
import { extractLocationFromUrlsWithAI, extractLocationFromModifier } from "./aiLocationExtractor";

/**
 * Main location extraction function
 */
export async function extractLocation(
  urls: string[],
  site: WordPressSite,
  promptModifier: string | undefined,
  openRouterApiKey: string
): Promise<LocationExtractionResult> {
  // Extract from URLs
  const { existingEntities, cityNames, areaKeywords, stateNames } = extractLocationFromUrls(urls, site);

  // Determine primary city (prefer state level for category discovery)
  let primaryCity = determinePrimaryCity(cityNames, site, stateNames);
  
  // If no city found, try regex extraction
  if (!primaryCity) {
    console.log('[Entity Generation] No city found from simple patterns or site location, trying regex extraction from URLs...');
    primaryCity = extractLocationFromUrlsWithRegex(urls);
    
    if (primaryCity) {
      console.log(`[Entity Generation] Regex extracted location from URLs: "${primaryCity}"`);
    } else {
      // If regex didn't work, use AI
      console.log('[Entity Generation] Regex patterns failed, using AI to extract location from URLs...');
      primaryCity = await extractLocationFromUrlsWithAI(urls, openRouterApiKey);
    }
  }
  
  // Extract location from modifier if provided (takes absolute priority)
  let modifierLocation: string | null = null;
  if (promptModifier) {
    modifierLocation = await extractLocationFromModifier(promptModifier, openRouterApiKey);
    
    // CRITICAL: If modifier specifies a location, use that instead of detected city - ABSOLUTE PRIORITY
    if (modifierLocation && modifierLocation !== 'none') {
      const originalCity = primaryCity;
      console.log(`[Entity Generation] ✓ User specified location in modifier: "${modifierLocation}" - OVERRIDING detected city: "${originalCity}" (ABSOLUTE PRIORITY)`);
      primaryCity = modifierLocation;
    } else {
      // Check if modifier clearly mentions a location but we failed to extract it
      const hasLocationKeywords = /\b(calgary|edmonton|toronto|vancouver|montreal|ottawa|winnipeg|halifax|victoria|saskatoon|regina|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas)\b/i.test(promptModifier);
      if (hasLocationKeywords) {
        console.warn(`[Entity Generation] WARNING: Modifier "${promptModifier}" appears to mention a location but extraction failed. Using sitemap-detected city: "${primaryCity}"`);
        toast.error(`Could not extract location from modifier "${promptModifier}". Using detected city: ${primaryCity}`);
      } else {
        console.log(`[Entity Generation] No location found in modifier: "${promptModifier}", using sitemap-detected city: "${primaryCity}"`);
      }
    }
  }
  
  // Analyze title format
  const suggestedTitleFormat = analyzeTitleFormat(urls, existingEntities, site.name);
  
  return {
    primaryCity,
    existingEntities,
    cityNames,
    areaKeywords,
    suggestedTitleFormat
  };
}
