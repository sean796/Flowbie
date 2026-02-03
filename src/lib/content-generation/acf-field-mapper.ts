import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

/**
 * Mapping of field purposes to their actual ACF field names
 */
export interface ACFFieldMapping {
  dateModifier?: string;
  faq?: string;
  metaDescription?: string;
  promptModifier?: string;
  extraText?: string;
  extraImage?: string;
  origin?: string;
  keywordFocus?: string;
}

/**
 * Cache for field mappings to avoid repeated AI calls
 * Key: `${siteUrl}|${postType}`
 * Value: { mapping, timestamp }
 */
const fieldMappingCache = new Map<
  string,
  { mapping: ACFFieldMapping; timestamp: number }
>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get prompt modifier value from ACF fields by discovering the field key from the JSON (no hardcoded names).
 * Uses pattern matching over actual keys so any WordPress/ACF key (e.g. prompt_modifier, seo_prompt_modifier, custom) is found.
 */
export function getPromptModifierValueFromACFFields(acfFields: Record<string, any>): string {
  if (!acfFields || typeof acfFields !== 'object') return '';
  const mapping = fallbackFieldMapping(acfFields);
  const key = mapping.promptModifier;
  if (!key || !(key in acfFields)) return '';
  const v = acfFields[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Get meta description value from ACF fields by discovering the field key from the JSON (no hardcoded names).
 */
export function getMetaDescriptionValueFromACFFields(acfFields: Record<string, any>): string {
  if (!acfFields || typeof acfFields !== 'object') return '';
  const mapping = fallbackFieldMapping(acfFields);
  const key = mapping.metaDescription;
  if (!key || !(key in acfFields)) return '';
  const v = acfFields[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Fallback pattern matching when AI is unavailable
 */
function fallbackFieldMapping(acfFields: Record<string, any>): ACFFieldMapping {
  const fieldNames = Object.keys(acfFields);
  const mapping: ACFFieldMapping = {};

  // Pattern matching for common field name variations
  for (const fieldName of fieldNames) {
    const lowerFieldName = fieldName.toLowerCase();

    // Date modifier patterns
    if (!mapping.dateModifier) {
      if (
        lowerFieldName.includes("date_modifier") ||
        lowerFieldName.includes("date_mod") ||
        lowerFieldName === "seo_date_modifier"
      ) {
        mapping.dateModifier = fieldName;
      }
    }

    // FAQ patterns
    if (!mapping.faq) {
      if (
        lowerFieldName.includes("faq") ||
        lowerFieldName === "seo_faq"
      ) {
        mapping.faq = fieldName;
      }
    }

    // Meta description patterns
    if (!mapping.metaDescription) {
      if (
        lowerFieldName.includes("meta_description") ||
        lowerFieldName.includes("meta_desc") ||
        lowerFieldName === "seo_meta_description"
      ) {
        mapping.metaDescription = fieldName;
      }
    }

    // Prompt modifier patterns
    if (!mapping.promptModifier) {
      if (
        lowerFieldName.includes("prompt_modifier") ||
        lowerFieldName.includes("prompt_mod") ||
        lowerFieldName === "seo_prompt_modifier"
      ) {
        mapping.promptModifier = fieldName;
      }
    }

    // Extra text patterns
    if (!mapping.extraText) {
      if (
        lowerFieldName.includes("extra_text") ||
        lowerFieldName === "seo_extra_text"
      ) {
        mapping.extraText = fieldName;
      }
    }

    // Extra image patterns
    if (!mapping.extraImage) {
      if (
        lowerFieldName.includes("extra_image") ||
        lowerFieldName === "seo_extra_image"
      ) {
        mapping.extraImage = fieldName;
      }
    }

    // Origin patterns
    if (!mapping.origin) {
      if (lowerFieldName === "origin") {
        mapping.origin = fieldName;
      }
    }

    // Keyword focus patterns
    if (!mapping.keywordFocus) {
      if (
        lowerFieldName.includes("keyword_focus") ||
        lowerFieldName.includes("focus_keyword")
      ) {
        mapping.keywordFocus = fieldName;
      }
    }
  }

  return mapping;
}

/**
 * Use AI to intelligently map ACF field purposes to actual field names
 */
export async function discoverACFFieldMapping(
  acfFields: Record<string, any>,
  postType: string,
  apiKey: string,
  siteUrl?: string,
  model?: string
): Promise<ACFFieldMapping> {
  // Check cache first
  if (siteUrl) {
    const cacheKey = `${siteUrl}|${postType}`;
    const cached = fieldMappingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[ACF Field Mapper] Using cached mapping for ${cacheKey}`);
      return cached.mapping;
    }
  }

  // If no API key, use fallback
  if (!apiKey || !apiKey.trim()) {
    console.warn("[ACF Field Mapper] No API key provided, using fallback pattern matching");
    const fallbackMapping = fallbackFieldMapping(acfFields);
    if (siteUrl) {
      const cacheKey = `${siteUrl}|${postType}`;
      fieldMappingCache.set(cacheKey, {
        mapping: fallbackMapping,
        timestamp: Date.now(),
      });
    }
    return fallbackMapping;
  }

  const fieldNames = Object.keys(acfFields);
  if (fieldNames.length === 0) {
    console.warn("[ACF Field Mapper] No ACF fields provided");
    return {};
  }

  const systemPrompt = `You are an expert WordPress developer analyzing ACF (Advanced Custom Fields) field names. Your task is to map field purposes to actual field names found in a WordPress site.

Field purposes to map:
1. dateModifier - A field that stores a date (typically YYYY-MM-DD format) for SEO date modified
2. faq - A field that stores FAQ schema JSON-LD script
3. metaDescription - A field that stores meta description text
4. promptModifier - A field that stores prompt/instruction text for content optimization
5. extraText - A field that stores additional text content (typically for pages)
6. extraImage - A field that stores an image ID or URL (typically for pages)
7. origin - A field that stores location/entity information
8. keywordFocus - A field that stores keyword focus information

Analyze the provided ACF field names and map them to these purposes. Consider:
- Field name patterns (e.g., "seo_" prefix, underscores, abbreviations)
- Common WordPress/ACF naming conventions
- Context clues from field names

Return ONLY a valid JSON object with this exact structure:
{
  "dateModifier": "field_name_or_null",
  "faq": "field_name_or_null",
  "metaDescription": "field_name_or_null",
  "promptModifier": "field_name_or_null",
  "extraText": "field_name_or_null",
  "extraImage": "field_name_or_null",
  "origin": "field_name_or_null",
  "keywordFocus": "field_name_or_null"
}

Use null for purposes that don't have a matching field. Use the exact field name as it appears in the ACF fields object.`;

  const userPrompt = `ACF Fields found (post type: ${postType}):
${JSON.stringify(acfFields, null, 2)}

Field names: ${fieldNames.join(", ")}

Map these fields to the purposes listed above. Return only the JSON mapping object.`;

  try {
    let responseContent = "";
    await streamChatCompletion({
      apiKey,
      model: model || getResearchModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more deterministic mapping
      maxTokens: 1000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        responseContent += chunk;
      },
    });

    // Parse response
    let jsonStr = responseContent.trim();
    jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Try to extract JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    const mapping: ACFFieldMapping = {
      dateModifier: parsed.dateModifier || undefined,
      faq: parsed.faq || undefined,
      metaDescription: parsed.metaDescription || undefined,
      promptModifier: parsed.promptModifier || undefined,
      extraText: parsed.extraText || undefined,
      extraImage: parsed.extraImage || undefined,
      origin: parsed.origin || undefined,
      keywordFocus: parsed.keywordFocus || undefined,
    };

    // Validate that mapped fields actually exist
    const validatedMapping: ACFFieldMapping = {};
    for (const [purpose, fieldName] of Object.entries(mapping)) {
      if (fieldName && fieldNames.includes(fieldName)) {
        validatedMapping[purpose as keyof ACFFieldMapping] = fieldName;
      }
    }

    // Cache the mapping
    if (siteUrl) {
      const cacheKey = `${siteUrl}|${postType}`;
      fieldMappingCache.set(cacheKey, {
        mapping: validatedMapping,
        timestamp: Date.now(),
      });
    }

    console.log(`[ACF Field Mapper] Discovered mapping:`, validatedMapping);
    return validatedMapping;
  } catch (error) {
    console.warn(
      "[ACF Field Mapper] AI mapping failed, using fallback:",
      error
    );
    const fallbackMapping = fallbackFieldMapping(acfFields);
    if (siteUrl) {
      const cacheKey = `${siteUrl}|${postType}`;
      fieldMappingCache.set(cacheKey, {
        mapping: fallbackMapping,
        timestamp: Date.now(),
      });
    }
    return fallbackMapping;
  }
}

/**
 * Clear the field mapping cache (useful for testing or when field structure changes)
 */
export function clearACFFieldMappingCache(siteUrl?: string): void {
  if (siteUrl) {
    // Clear only entries for this site
    for (const key of fieldMappingCache.keys()) {
      if (key.startsWith(`${siteUrl}|`)) {
        fieldMappingCache.delete(key);
      }
    }
  } else {
    // Clear all entries
    fieldMappingCache.clear();
  }
}
