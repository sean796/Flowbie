/**
 * Criteria Validation Module
 * Validates entities against specific criteria using Wikipedia data
 */

import { extractStructuredDataFromWikipedia } from "@/lib/wikipedia-api";
import type { ValidationResult } from "../types";

/**
 * Validates if an entity matches criteria by extracting data from Wikipedia
 */
export async function validateEntityByCriteria(
  entity: string,
  criteria: string,
  openRouterApiKey: string
): Promise<ValidationResult> {
  try {
    const result = await extractStructuredDataFromWikipedia(entity, criteria, openRouterApiKey);
    return {
      matches: result.matches || false,
      confidence: result.confidence || 0,
      extractedData: result.extractedData || {},
      rankingValue: result.rankingValue
    };
  } catch (error) {
    console.warn(`[Entity Generation] Error validating entity "${entity}" by criteria:`, error);
    return {
      matches: false,
      confidence: 0,
      extractedData: {},
      rankingValue: 0
    };
  }
}
