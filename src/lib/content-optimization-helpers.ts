import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { getKeywordOverview } from "@/lib/keyword-api";
import { fetchPeopleAlsoAsk } from "@/lib/keyword-api";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import { generateChecklistFromSelections } from "@/lib/blog-template-builder";
import { generateBlueprintFromTemplate, type BlogTemplateContext } from "@/lib/blog-template-builder";
import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { generateAndUploadContent } from "@/lib/content-generation-upload";
import { processGSCQueriesAndAnalyze, isNonEnglishKeyword, filterAndRankQueriesWithAI } from "@/lib/gsc-query-processor";
import { getPublishedPosts } from "@/lib/wordpress-api";
import { analyzeTitleForOrigin } from "@/lib/wordpress-acf-origin";
import { getWordPressPostMeta } from "@/lib/wordpress-api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";

/**
 * Extracts entity location from URL slug for service area pages
 * URL like: /service-areas/dental-clinic-near-34-avenue-nw-edmonton
 * Returns: "34 Avenue NW, Edmonton"
 */
export function extractEntityFromUrlSlug(url: string, existingTitle?: string): string | undefined {
  if (!url) return undefined;
  
  try {
    // Get the last path segment (slug)
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.trim());
    const slug = pathSegments[pathSegments.length - 1] || '';
    
    if (!slug) return undefined;
    
    // Convert slug to readable format: dental-clinic-near-34-avenue-nw-edmonton -> dental clinic near 34 avenue nw edmonton
    const slugWords = slug.replace(/-/g, ' ').toLowerCase();
    
    // Common service area patterns to extract location from
    // Pattern: [service] near [location]
    // Pattern: [service] in [location]
    // Pattern: [location] [service]
    const nearMatch = slugWords.match(/(?:near|in|for|serving)\s+(.+)$/i);
    if (nearMatch) {
      const rawLocation = nearMatch[1].trim();
      const location = formatLocationFromSlug(rawLocation);
      
      console.log(`[Entity Extraction] Extracted from URL slug: "${location}" from "${slug}"`);
      return location;
    }
    
    // If no pattern match, try using the title to help identify the location portion
    if (existingTitle) {
      const slugLower = slugWords;
      const slugParts = slugLower.split(' ');
      
      // Look for location-indicating words
      const locationIndicators = ['avenue', 'ave', 'street', 'st', 'road', 'rd', 'drive', 'dr', 'boulevard', 'blvd', 'lane', 'ln', 'place', 'pl', 'way', 'court', 'ct'];
      
      for (let i = 0; i < slugParts.length; i++) {
        if (locationIndicators.includes(slugParts[i])) {
          // Found a street indicator, extract surrounding context
          const start = Math.max(0, i - 2); // Include up to 2 words before
          const end = Math.min(slugParts.length, i + 3); // Include up to 2 words after
          const rawLocation = slugParts.slice(start, end).join(' ');
          const location = formatLocationFromSlug(rawLocation);
          
          console.log(`[Entity Extraction] Extracted location from URL (street indicator): "${location}" from "${slug}"`);
          return location;
        }
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('[Entity Extraction] Error parsing URL:', error);
    return undefined;
  }
}

/**
 * Validates if an entity should be accepted or rejected
 * - Rejects years and dates (entities cannot be years or dates of any kind)
 * - Rejects generic entities like "Your Home", "My Home", "The Home"
 * - Rejects personal entities like "Your Big Day", "My Big Day", "Your Special Day"
 * - Rejects generic personal possessive phrases (Your/My/The + generic term)
 * - Allows hardcoded competitors like "hunter douglas"
 */
export function isValidEntity(entity: string | undefined): boolean {
  if (!entity || !entity.trim()) {
    return false;
  }
  
  const entityLower = entity.toLowerCase().trim();
  
  // Hardcoded allowed competitors (OK to target)
  const allowedCompetitors = [
    'hunter douglas',
    'hunterdouglas'
  ];
  
  // Check if entity is an allowed competitor
  for (const allowed of allowedCompetitors) {
    if (entityLower === allowed || entityLower.includes(allowed)) {
      console.log(`[Entity Validation] ✓ Entity "${entity}" is an allowed competitor - ACCEPTED`);
      return true;
    }
  }
  
  // AGGRESSIVE REJECTION: Reject years and dates (entities cannot be years or dates of any kind)
  // Check for 4-digit years (1900-2099) - even if standalone or in any context
  const yearPattern = /^(19|20)\d{2}$/;
  if (yearPattern.test(entityLower)) {
    console.log(`[Entity Validation] ✗ Entity "${entity}" is a year - REJECTED`);
    return false;
  }
  
  // AGGRESSIVE: Reject ANY entity that is ONLY a number (could be a year)
  if (/^\d+$/.test(entityLower)) {
    console.log(`[Entity Validation] ✗ Entity "${entity}" is only a number - REJECTED`);
    return false;
  }
  
  // AGGRESSIVE: Reject entities that START or END with a 4-digit year
  if (/^(19|20)\d{2}/.test(entityLower) || /(19|20)\d{2}$/.test(entityLower)) {
    console.log(`[Entity Validation] ✗ Entity "${entity}" starts or ends with a year - REJECTED`);
    return false;
  }
  
  // Check for date patterns (YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, etc.)
  const datePatterns = [
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,  // YYYY-MM-DD, YYYY/MM/DD
    /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,  // MM/DD/YYYY, DD-MM-YYYY
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/,  // MM/DD/YY, DD-MM-YY
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i,  // Month Year
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i,  // Month abbreviation Year
    /^\d{4}\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i,  // Year Month
    /^\d{4}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i  // Year Month abbreviation
  ];
  
  for (const pattern of datePatterns) {
    if (pattern.test(entityLower)) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" is a date - REJECTED`);
      return false;
    }
  }
  
  // Check if entity contains a year pattern (4-digit number 1900-2099)
  const containsYearPattern = /\b(19|20)\d{2}\b/;
  if (containsYearPattern.test(entityLower)) {
    // Allow if it's part of a legitimate location name (e.g., "Route 2024" is unlikely but could be valid)
    // But reject if it's clearly a date/year reference
    const dateKeywords = ['year', 'date', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const hasDateKeyword = dateKeywords.some(keyword => entityLower.includes(keyword));
    if (hasDateKeyword || /^\d{4}/.test(entityLower) || /\d{4}$/.test(entityLower)) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" contains a year/date - REJECTED`);
      return false;
    }
  }
  
  // Reject generic home-related entities
  const rejectedPatterns = [
    /^your\s+home$/i,
    /^my\s+home$/i,
    /^the\s+home$/i,
    /^home$/i,
    /^your\s+house$/i,
    /^my\s+house$/i,
    /^the\s+house$/i,
    /^house$/i,
    /^your\s+place$/i,
    /^my\s+place$/i,
    /^the\s+place$/i,
    /^place$/i
  ];
  
  for (const pattern of rejectedPatterns) {
    if (pattern.test(entityLower)) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" matches rejected pattern - REJECTED`);
      return false;
    }
  }
  
  // Reject personal entities (generic personal possessive phrases)
  // Examples: "Your Big Day", "My Big Day", "Your Special Day", "My Special Day", etc.
  const personalEntityPatterns = [
    /^your\s+big\s+day$/i,
    /^my\s+big\s+day$/i,
    /^the\s+big\s+day$/i,
    /^your\s+special\s+day$/i,
    /^my\s+special\s+day$/i,
    /^the\s+special\s+day$/i,
    /^your\s+day$/i,
    /^my\s+day$/i,
    /^the\s+day$/i,
    /^your\s+event$/i,
    /^my\s+event$/i,
    /^the\s+event$/i,
    /^your\s+space$/i,
    /^my\s+space$/i,
    /^the\s+space$/i,
    /^your\s+room$/i,
    /^my\s+room$/i,
    /^the\s+room$/i
  ];
  
  for (const pattern of personalEntityPatterns) {
    if (pattern.test(entityLower)) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" is a personal entity - REJECTED`);
      return false;
    }
  }
  
  // AGGRESSIVE FILTER: Reject ANY entity starting with "Your", "My", or "The" 
  // unless it's clearly a geographic location (which would be unusual for these prefixes)
  // This catches ALL personal/business possessive phrases
  const personalPrefixMatch = entityLower.match(/^(your|my|the)\s+(.+)$/);
  if (personalPrefixMatch) {
    const restOfEntity = personalPrefixMatch[2].trim();
    
    // Generic personal/business terms that should always be rejected
    const genericPersonalTerms = [
      'home', 'house', 'place', 'day', 'big day', 'special day', 'event', 'space', 'room',
      'wedding', 'party', 'celebration', 'occasion', 'moment', 'time', 'life', 'world',
      // Business-related terms
      'business', 'new business', 'company', 'new company', 'organization', 'firm', 'enterprise',
      'office', 'workplace', 'store', 'shop', 'location', 'area', 'region', 'neighborhood',
      // Personal possessive terms
      'property', 'apartment', 'condo', 'townhome', 'residence', 'dwelling'
    ];
    
    // Check if rest matches generic terms
    const matchesGenericTerm = genericPersonalTerms.some(term => {
      return restOfEntity === term || 
             restOfEntity.startsWith(term + ' ') || 
             restOfEntity.endsWith(' ' + term) ||
             restOfEntity.includes(' ' + term + ' ');
    });
    
    if (matchesGenericTerm) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" is a personal/business generic entity - REJECTED`);
      return false;
    }
    
    // CRITICAL: Entities MUST be geolocations ONLY. If it starts with "Your", "My", or "The",
    // it MUST be followed by a CLEAR geographic location (city name, state, street name, etc.)
    // Geographic locations have specific patterns - if it doesn't match, REJECT it
    const looksLikeGeographicLocation = 
      // City, State pattern (e.g., "Your Local Business in Toronto, Ontario")
      /,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*/.test(entity) ||
      // Street/avenue pattern (e.g., "Your Shop on Main Street")
      /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|place|pl|parkway|pkwy)\b/i.test(entity) ||
      // Directional + location (e.g., "Your Business in North Toronto")
      /^(north|south|east|west|northwest|northeast|southwest|southeast)\s+[A-Z]/.test(entity) ||
      // Known city/state/province patterns
      /\b(california|texas|florida|new york|ontario|alberta|british columbia|quebec|toronto|vancouver|edmonton|calgary|montreal|ottawa|winnipeg|halifax|victoria|regina|saskatoon|windsor|hamilton|kitchener|london|barrie|oshawa|sudbury|thunder bay|saint john|fredericton|charlottetown|whitehorse|yellowknife|iqaluit|new jersey|pennsylvania|illinois|ohio|michigan|georgia|north carolina|virginia|massachusetts|tennessee|indiana|arizona|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|louisiana|kentucky|oregon|oklahoma|connecticut|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming|district of columbia)\b/i.test(entity);
    
    if (!looksLikeGeographicLocation) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" starts with personal prefix but is NOT a clear geographic location - REJECTED (entities must be geolocations only)`);
      return false;
    }
  }
  
  // CRITICAL ADDITIONAL CHECK: Reject any entity that contains business/personal terms 
  // UNLESS it's clearly part of a geographic location name
  // CRITICAL: Reject standalone business/workplace terms like "offices", "office", etc.
  const businessPersonalTerms = [
    'business', 'new business', 'company', 'new company', 'organization', 'firm', 'enterprise',
    'office', 'offices', 'workplace', 'workplaces', 'store', 'stores', 'shop', 'shops',
    'home', 'house', 'property', 'properties', 'location', 'locations', 'area', 'areas',
    'region', 'regions', 'neighborhood', 'neighborhoods', 'venue', 'venues', 'facility', 'facilities',
    'building', 'buildings', 'establishment', 'establishments', 'premises', 'site', 'sites'
  ];
  
  // First check: If entity is EXACTLY a business term (standalone), reject immediately
  if (businessPersonalTerms.includes(entityLower)) {
    console.log(`[Entity Validation] ✗ Entity "${entity}" is a standalone business/workplace term - REJECTED (entities must be geolocations only)`);
    return false;
  }
  
  // Second check: If entity contains business terms, only allow if clearly part of geographic location
  const containsBusinessTerm = businessPersonalTerms.some(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(entityLower)) {
      // Only allow if it's clearly part of a geographic location (city, state, street, etc.)
      const hasGeographicContext = /,\s*[A-Z][a-z]+/.test(entity) || // City, State pattern
                                  /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|place|pl|parkway|pkwy)\b/i.test(entity) ||
                                  /\b(california|texas|florida|ontario|alberta|british columbia|quebec|toronto|vancouver|edmonton|calgary|montreal|ottawa|winnipeg|halifax|victoria|regina|saskatoon|windsor|hamilton|kitchener|london|barrie|oshawa|sudbury|thunder bay|saint john|fredericton|charlottetown|whitehorse|yellowknife|iqaluit|new jersey|pennsylvania|illinois|ohio|michigan|georgia|north carolina|virginia|massachusetts|tennessee|indiana|arizona|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|louisiana|kentucky|oregon|oklahoma|connecticut|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming|district of columbia)\b/i.test(entity);
      return !hasGeographicContext; // Reject if it contains business term but no geographic context
    }
    return false;
  });
  
  if (containsBusinessTerm) {
    console.log(`[Entity Validation] ✗ Entity "${entity}" contains business/personal term but is NOT a geographic location - REJECTED (entities must be geolocations only)`);
    return false;
  }
  
  // Additional check: reject if entity is just "Your Home" or similar generic phrases
  const genericPhrases = [
    'your home',
    'my home',
    'the home',
    'your house',
    'my house',
    'the house',
    'your place',
    'my place',
    'the place',
    'your big day',
    'my big day',
    'the big day',
    'your special day',
    'my special day',
    'the special day',
    // Business-related generic phrases
    'your new business',
    'my new business',
    'the new business',
    'your business',
    'my business',
    'the business',
    'new business', // Reject even without "Your/My/The"
    'business', // Reject standalone "business"
    // Generic business/workplace terms - REJECT ALL
    'office', 'offices', 'workplace', 'workplaces', 'store', 'stores', 'shop', 'shops',
    'location', 'locations', 'area', 'areas', 'region', 'regions', 'neighborhood', 'neighborhoods',
    'venue', 'venues', 'facility', 'facilities', 'building', 'buildings', 'establishment', 'establishments',
    'premises', 'site', 'sites',
    'your company',
    'my company',
    'the company',
    'your new company',
    'my new company',
    'the new company',
    'your organization',
    'my organization',
    'the organization'
  ];
  
  // Check if entity exactly matches or starts with a generic phrase
  for (const phrase of genericPhrases) {
    if (entityLower === phrase || entityLower.startsWith(phrase + ' ')) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" is a generic phrase - REJECTED`);
      return false;
    }
  }
  
  return true; // Entity is valid
}

/**
 * Formats a location extracted from URL slug with proper capitalization and comma placement
 * Input: "34 avenue nw edmonton" -> Output: "34 Avenue NW, Edmonton"
 */
function formatLocationFromSlug(rawLocation: string): string {
  const words = rawLocation.split(' ');
  const formattedWords: string[] = [];
  
  // Known city names that should have a comma before them
  const cityNames = ['edmonton', 'calgary', 'toronto', 'vancouver', 'montreal', 'ottawa', 'winnipeg', 'saskatoon', 'regina', 'halifax', 'victoria'];
  // Directional indicators
  const directionals = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
  // Street type indicators (after which comma might come before city)
  const streetTypes = ['avenue', 'ave', 'street', 'st', 'road', 'rd', 'drive', 'dr', 'boulevard', 'blvd', 'lane', 'ln', 'place', 'pl', 'way', 'court', 'ct'];
  
  let lastWasStreetOrDirectional = false;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    const isCity = cityNames.includes(word);
    const isDirectional = directionals.includes(word);
    const isStreetType = streetTypes.includes(word);
    
    // Add comma before city name if previous word was street type or directional
    if (isCity && lastWasStreetOrDirectional && formattedWords.length > 0) {
      // Add comma after last word
      formattedWords[formattedWords.length - 1] += ',';
    }
    
    // Format the word
    if (isDirectional) {
      formattedWords.push(word.toUpperCase());
    } else {
      formattedWords.push(word.charAt(0).toUpperCase() + word.slice(1));
    }
    
    lastWasStreetOrDirectional = isStreetType || isDirectional;
  }
  
  return formattedWords.join(' ');
}

interface KeywordSelection {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Cleans location mentions and placeholders from title when entity is N/A (no entity)
 * Removes: [city], [location], placeholders, location names, "in [location]" patterns
 * 
 * @param title - The title to clean
 * @param entity - Entity value ("N/A" means no entity, any other value means entity exists)
 * @returns Cleaned title without location mentions if entity is N/A, original title otherwise
 */
export function cleanTitleForNonEntity(title: string, entity: string | 'N/A' | undefined): string {
  // If entity exists (not N/A), don't clean - location should remain
  if (entity && entity !== 'N/A' && entity.trim() !== '') {
    return title;
  }

  if (!title || !title.trim()) {
    return title;
  }

  let cleanedTitle = title;

  // Remove placeholder patterns
  const placeholderPatterns = [
    /\s*\[\s*city\s*\]/gi,           // [city] with optional whitespace
    /\s*\[\s*location\s*\]/gi,        // [location]
    /\s*\[\s*area\s*\]/gi,            // [area]
    /\s*\[\s*state\s*\]/gi,           // [state]
    /\s*\[\s*entity\s*\]/gi,          // [entity]
    /\s*<\s*city\s*>/gi,              // <city>
    /\s*<\s*location\s*>/gi,          // <location>
    /\s*\{\s*city\s*\}/gi,            // {city}
    /\s*\{\s*location\s*\}/gi,        // {location}
    /\s*\[\s*[^\]]+\s*\]/g,           // Any other [placeholder] patterns
  ];

  placeholderPatterns.forEach(pattern => {
    cleanedTitle = cleanedTitle.replace(pattern, '');
  });

  // Remove "in [location]" patterns (e.g., "in Edmonton", "in [city]", "in Toronto")
  // Match "in" followed by location name or placeholder at end of title or before punctuation
  cleanedTitle = cleanedTitle
    .replace(/\s+in\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*[,:;.]*$/gi, '') // "in Edmonton", "in New York"
    .replace(/\s+in\s+\[[^\]]+\]\s*[,:;.]*$/gi, '') // "in [city]"
    .replace(/\s+in\s+<[^>]+>\s*[,:;.]*$/gi, '')    // "in <city>"
    .replace(/\s+in\s+\{[^}]+\}\s*[,:;.]*$/gi, ''); // "in {city}"

  // Remove location names that appear at the end (common pattern: "Guide to X in Edmonton")
  // This is a best-effort - will catch common city names
  const commonLocationEndPatterns = [
    /\s+(?:in|at|for|near)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*$/i, // "in Edmonton", "at New York"
  ];
  commonLocationEndPatterns.forEach(pattern => {
    cleanedTitle = cleanedTitle.replace(pattern, '');
  });

  // Clean up formatting issues
  cleanedTitle = cleanedTitle
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/\s*:\s*$/g, '')       // Remove trailing colon
    .replace(/^\s*in\s+/gi, '')     // Remove "in " at start
    .replace(/\s+in\s*$/gi, '')     // Remove " in" at end
    .replace(/\s*,\s*$/, '')        // Remove trailing comma
    .trim();

  return cleanedTitle;
}

/**
 * Removes company name from keyword and cleans it up
 * For entity pages, focuses on local keywords that align with the page title
 */
export function removeCompanyNameFromKeyword(
  keyword: string,
  companyName: string,
  pageTitle?: string,
  pageUrl?: string
): string {
  if (!keyword || !companyName) return keyword;
  
  const keywordLower = keyword.toLowerCase().trim();
  const companyNameLower = companyName.toLowerCase().trim();
  
  // Split company name into words
  const companyWords = companyNameLower.split(/\s+/).filter(w => w.length > 2);
  
  // Remove company name words from keyword
  let cleanedKeyword = keywordLower;
  for (const word of companyWords) {
    // Remove word if it appears in the keyword
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleanedKeyword = cleanedKeyword.replace(regex, '').trim();
  }
  
  // Clean up extra spaces
  cleanedKeyword = cleanedKeyword.replace(/\s+/g, ' ').trim();
  
  // If keyword became empty after removing company name, return original (fallback)
  if (!cleanedKeyword || cleanedKeyword.length < 2) {
    return keyword;
  }
  
  return cleanedKeyword;
}

/**
 * Generates a local-focused keyword for entity pages based on page title and URL
 * Uses Gemini AI to analyze title and URL - simple prompt, no complex logic
 */
export async function generateLocalKeywordForEntityPage(
  pageTitle: string,
  pageUrl: string,
  companyName: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const researchModel = model || getResearchModel();
  try {
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
          {
            role: "user",
            content: `Analyze this entity/service area page and generate a local-focused keyword:

Page Title: "${pageTitle}"
Page URL: "${pageUrl}"
Company Name: "${companyName}"

Generate a keyword that:
- NEVER includes the company name "${companyName}"
- Closely aligns with the page title
- Focuses on local keywords (service type + location)
- Is what users would actually search for (2-4 words)

Return ONLY the keyword phrase, nothing else.`
          },
        ],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const aiKeyword = data.choices?.[0]?.message?.content?.trim() || '';
      if (aiKeyword && aiKeyword.length > 2) {
        // Remove any quotes or extra formatting
        const cleaned = aiKeyword.replace(/^["']|["']$/g, '').trim();
        return cleaned;
      }
    }
  } catch (error) {
    console.warn('[Local Keyword Generation] AI generation failed:', error);
  }
  
  // Fallback: extract from title (remove company name)
  return removeCompanyNameFromKeyword(pageTitle, companyName, pageTitle, pageUrl);
}

/**
 * Uses AI to intelligently select the best keyword from GSC queries for entity pages
 * Analyzes queries like a local SEO expert would
 */
export async function selectBestKeywordForEntityPage(
  pageTitle: string,
  pageUrl: string,
  companyName: string,
  gscQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  apiKey: string,
  model?: string
): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number } | null> {
  const researchModel = model || getResearchModel();
  if (!gscQueries || gscQueries.length === 0) {
    return null;
  }

  // Use unified AI function to filter and rank queries
  let companyNameToCheck = companyName.toLowerCase().trim();
  if (!companyNameToCheck && pageUrl) {
    try {
      const urlObj = new URL(pageUrl);
      const domain = urlObj.hostname.replace('www.', '').split('.')[0];
      companyNameToCheck = domain.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    } catch {}
  }

  const filteredQueries = await filterAndRankQueriesWithAI(
    gscQueries,
    pageUrl,
    apiKey,
    researchModel,
    companyNameToCheck
  );

  if (filteredQueries.length === 0) {
    return null;
  }

  try {
    // Format filtered queries for AI analysis
    const queriesList = filteredQueries.map((q, idx) => 
      `${idx + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || 'N/A'}`
    ).join('\n');

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
          {
            role: "user",
            content: `Select the BEST keyword from these GSC queries for page "${pageTitle}".

Queries:
${queriesList}

Select the keyword that best matches the page content and has good traffic potential. Location+service keywords (e.g., "tooth crown edmonton ab") are valid if they describe a service, not a business name.

Return the exact keyword phrase or 'NONE' if none are suitable.`
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const selectedKeyword = data.choices?.[0]?.message?.content?.trim() || '';
      
      // Check if AI returned 'NONE'
      if (selectedKeyword.toUpperCase().includes('NONE') || selectedKeyword.trim().length === 0) {
        console.log('[Entity Keyword Selection] AI returned NONE - no valid service keywords found');
        return null;
      }
      
      if (selectedKeyword) {
        const cleaned = selectedKeyword.replace(/^["']|["']$/g, '').trim();
        
        // Find matching query from filtered queries array (not original)
        // Normalize spaces for flexible matching: "dental anxiety" matches "dentalanxiety"
        const normalizedCleaned = cleaned.toLowerCase().trim().replace(/\s+/g, '');
        const matchingQuery = filteredQueries.find(q => {
          if (!q.query || typeof q.query !== 'string' || isNonEnglishKeyword(q.query)) {
            return false;
          }
          // Try exact match first
          if (q.query.toLowerCase().trim() === cleaned.toLowerCase().trim()) {
            return true;
          }
          // Try normalized match (remove all spaces)
          const normalizedQuery = q.query.toLowerCase().trim().replace(/\s+/g, '');
          if (normalizedQuery === normalizedCleaned) {
            return true;
          }
          // Try substring match (AI keyword might be part of query or vice versa)
          if (normalizedQuery.includes(normalizedCleaned) || normalizedCleaned.includes(normalizedQuery)) {
            return true;
          }
          return false;
        });
        
        if (matchingQuery) {
          console.log('[Entity Keyword Selection] AI selected and validated:', matchingQuery.query);
          return matchingQuery;
        } else {
          console.warn('[Entity Keyword Selection] AI selected keyword not found in queries:', cleaned);
          console.warn('[Entity Keyword Selection] Available queries (first 10):', filteredQueries.slice(0, 10).map(q => q.query));
          return null;
        }
      }
    }
  } catch (error) {
    console.warn('[Entity Keyword Selection] AI selection failed:', error);
  }
  
  // Fail-safe: return first valid query if AI selection failed
  if (filteredQueries.length > 0) {
    const firstQuery = filteredQueries[0];
    console.log('[Entity Keyword Selection] Using first available query as fallback:', firstQuery.query);
    return firstQuery;
  }
  
  return null;
}

interface AutoSelectHelpers {
  autoSelectKeywords: (aiAnalysis: KeywordAIAnalysis, keywordsWithVolumeData: KeywordData[]) => string[];
  autoSelectH2Sections: (aiAnalysis: KeywordAIAnalysis) => string[];
  autoSelectPeopleAlsoAsk: (aiAnalysis: KeywordAIAnalysis) => string[];
  autoSelectResearchLinks: (aiAnalysis: KeywordAIAnalysis) => string[];
}

export function getAutoSelectHelpers(): AutoSelectHelpers {
  const autoSelectKeywords = (aiAnalysis: KeywordAIAnalysis, keywordsWithVolumeData: KeywordData[]): string[] => {
    // Collect all available keywords
    const allAvailableKeywords: string[] = [];
    
    if (aiAnalysis.keywordSuggestions?.primary) {
      allAvailableKeywords.push(aiAnalysis.keywordSuggestions.primary);
    }
    if (aiAnalysis.keywordSuggestions?.variations) {
      allAvailableKeywords.push(...aiAnalysis.keywordSuggestions.variations);
    }
    if (aiAnalysis.keywordSuggestions?.longTail) {
      allAvailableKeywords.push(...aiAnalysis.keywordSuggestions.longTail);
    }
    if (aiAnalysis.keywordSuggestions?.semantic) {
      allAvailableKeywords.push(...aiAnalysis.keywordSuggestions.semantic);
    }
    
    // Remove duplicates (case-insensitive)
    const uniqueKeywords = Array.from(new Set(allAvailableKeywords.map(kw => kw.toLowerCase())))
      .map(lowerKw => {
        // Find original case from first occurrence
        return allAvailableKeywords.find(kw => kw.toLowerCase() === lowerKw) || lowerKw;
      });
    
    // If less than 5 keywords available, select all of them
    if (uniqueKeywords.length < 5) {
      // Create a map for quick lookup of keyword data
      const keywordDataMap = new Map<string, KeywordData>();
      keywordsWithVolumeData.forEach(kwData => {
        keywordDataMap.set(kwData.keyword.toLowerCase(), kwData);
      });
      
      // Sort by quality: higher search volume, lower difficulty, better competition
      const sortedKeywords = uniqueKeywords.sort((a, b) => {
        const dataA = keywordDataMap.get(a.toLowerCase());
        const dataB = keywordDataMap.get(b.toLowerCase());
        
        // If both have data, compare by metrics
        if (dataA && dataB) {
          // Primary: search volume (higher is better)
          if (dataA.searchVolume !== dataB.searchVolume) {
            return dataB.searchVolume - dataA.searchVolume;
          }
          // Secondary: difficulty (lower is better)
          if (dataA.difficulty !== dataB.difficulty) {
            return dataA.difficulty - dataB.difficulty;
          }
          // Tertiary: competition (LOW < MEDIUM < HIGH)
          const competitionOrder = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2 };
          return competitionOrder[dataA.competition] - competitionOrder[dataB.competition];
        }
        
        // If only one has data, prioritize it
        if (dataA && !dataB) return -1;
        if (dataB && !dataA) return 1;
        
        // If neither has data, maintain original order
        return 0;
      });
      
      return sortedKeywords;
    }
    
    // If 5 or more keywords, use original selection logic
    const selected: string[] = [];
    if (aiAnalysis.keywordSuggestions?.primary) {
      selected.push(aiAnalysis.keywordSuggestions.primary);
    }
    if (aiAnalysis.keywordSuggestions?.variations) {
      selected.push(...aiAnalysis.keywordSuggestions.variations.slice(0, 5));
    }
    if (aiAnalysis.keywordSuggestions?.longTail) {
      selected.push(...aiAnalysis.keywordSuggestions.longTail.slice(0, 3));
    }
    return [...new Set(selected)];
  };

  const autoSelectH2Sections = (aiAnalysis: KeywordAIAnalysis): string[] => {
    if (!aiAnalysis.h2Suggestions || aiAnalysis.h2Suggestions.length === 0) {
      return [];
    }
    return aiAnalysis.h2Suggestions.slice(0, 7).map(h2 => h2.heading);
  };

  const autoSelectPeopleAlsoAsk = (aiAnalysis: KeywordAIAnalysis): string[] => {
    if (!aiAnalysis.peopleAlsoAsk || aiAnalysis.peopleAlsoAsk.length === 0) {
      return [];
    }
    return aiAnalysis.peopleAlsoAsk.slice(0, 7).map(paa => typeof paa === 'string' ? paa : paa.question);
  };

  const autoSelectResearchLinks = (aiAnalysis: KeywordAIAnalysis): string[] => {
    if (!aiAnalysis.researchLinks || aiAnalysis.researchLinks.length === 0) {
      return [];
    }
    return aiAnalysis.researchLinks.slice(0, 7).map(link => link.url);
  };

  return {
    autoSelectKeywords,
    autoSelectH2Sections,
    autoSelectPeopleAlsoAsk,
    autoSelectResearchLinks,
  };
}

/**
 * Find related GSC keywords from available queries
 * Returns keywords that are semantically similar or from the same cluster
 */
export function findRelatedGSCKeywords(
  primaryKeyword: string,
  gscQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }> | undefined,
  clusterKeywords?: string[]
): string[] {
  if (!gscQueries || !Array.isArray(gscQueries) || gscQueries.length === 0) {
    return [];
  }

  // CRITICAL: Filter out non-English queries before processing
  const englishQueries = gscQueries.filter(q => 
    q.query && typeof q.query === 'string' && !isNonEnglishKeyword(q.query)
  );

  const primaryLower = primaryKeyword.toLowerCase().trim();
  const related: string[] = [];
  const seen = new Set<string>([primaryLower]);

  // First, include cluster keywords if provided (filter non-English)
  if (clusterKeywords && Array.isArray(clusterKeywords)) {
    clusterKeywords.forEach(kw => {
      const kwLower = kw.toLowerCase().trim();
      // Skip non-English cluster keywords
      if (isNonEnglishKeyword(kw)) return;
      
      if (kwLower && kwLower !== primaryLower && !seen.has(kwLower)) {
        // Check if this cluster keyword exists in English GSC queries
        const existsInGSC = englishQueries.some(q => 
          q.query && typeof q.query === 'string' && 
          q.query.toLowerCase().trim() === kwLower
        );
        if (existsInGSC) {
          related.push(kw.trim());
          seen.add(kwLower);
        }
      }
    });
  }

  // Find semantically similar keywords from GSC queries (English only)
  // Look for keywords that share common words with the primary keyword
  const primaryWords = primaryLower.split(/\s+/).filter(w => w.length > 2);
  
  englishQueries.forEach(query => {
    if (!query.query || typeof query.query !== 'string') return;
    
    const queryLower = query.query.toLowerCase().trim();
    if (queryLower === primaryLower || seen.has(queryLower)) return;

    // Check for semantic similarity: shared words or similar structure
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const sharedWords = primaryWords.filter(w => queryWords.includes(w));
    
    // If shares at least one significant word (and not just common stop words)
    if (sharedWords.length > 0 && queryWords.length <= 8) {
      related.push(query.query.trim());
      seen.add(queryLower);
    }
  });

  // Limit to top 10 related keywords by impressions/clicks (English only)
  const sortedRelated = related
    .filter(kw => !isNonEnglishKeyword(kw)) // Extra safety filter
    .map(kw => {
      const gscQuery = englishQueries.find(q => 
        q.query && typeof q.query === 'string' && 
        q.query.toLowerCase().trim() === kw.toLowerCase().trim()
      );
      return {
        keyword: kw,
        impressions: gscQuery?.impressions || 0,
        clicks: gscQuery?.clicks || 0
      };
    })
    .sort((a, b) => {
      // Sort by clicks first, then impressions
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.impressions - a.impressions;
    })
    .slice(0, 10)
    .map(item => item.keyword);

  return sortedRelated;
}

export async function performKeywordResearch(
  primaryKeyword: string,
  selectedKeyword: KeywordSelection,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  relatedGSCKeywords?: string[]
): Promise<{ keywordData: KeywordData; paaResult: any; paaRawResponse: any; relatedGSCKeywords?: string[] }> {
  // Validate primaryKeyword
  if (!primaryKeyword || typeof primaryKeyword !== 'string' || primaryKeyword.trim().length === 0) {
    throw new Error('Primary keyword is invalid or empty. Please select a valid keyword.');
  }
  
  const sanitizedKeyword = String(primaryKeyword).trim();
  
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  setProgress({ step: 'Researching keywords...', progress: 40, message: `Fetching data for: ${sanitizedKeyword}${relatedGSCKeywords && relatedGSCKeywords.length > 0 ? ` and ${relatedGSCKeywords.length} related GSC keywords` : ''}` });

  const keywordResearchStartTime = Date.now();
  
  // Fetch keyword data for primary keyword and related GSC keywords
  const keywordsToResearch = [sanitizedKeyword];
  if (relatedGSCKeywords && relatedGSCKeywords.length > 0) {
    keywordsToResearch.push(...relatedGSCKeywords.slice(0, 10)); // Limit to 10 related keywords
  }
  
  let keywordData: KeywordData[] = [];
  try {
    keywordData = await getKeywordOverview(keywordsToResearch, 'United States', 'en', true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.includes('timeout') || msg.includes('ECONNABORTED');
    console.warn('[Optimize Content] DataForSEO keyword overview failed, using GSC-only data:', isTimeout ? 'timeout' : msg);
    toast.info(isTimeout ? 'Keyword API timed out – using GSC data only.' : 'Keyword API error – using GSC data only.');
  }
  
  // If DataForSEO doesn't have data, create a minimal KeywordData from GSC data
  if (!keywordData || keywordData.length === 0) {
    console.log('[Optimize Content] No DataForSEO data found, creating from GSC data:', {
      keyword: sanitizedKeyword,
      clicks: selectedKeyword?.clicks || 0,
      impressions: selectedKeyword?.impressions || 0,
      position: selectedKeyword?.position || 0
    });
    
    keywordData = [{
      keyword: sanitizedKeyword,
      searchVolume: selectedKeyword?.impressions || 0,
      difficulty: 0,
      cpc: 0,
      competition: 'LOW' as const,
      intent: 'informational' as const,
      relatedKeywords: relatedGSCKeywords || [],
      serpFeatures: []
    }];
    
    toast.info(`Using GSC data for "${sanitizedKeyword}" (${selectedKeyword?.impressions || 0} impressions, ${selectedKeyword?.clicks || 0} clicks)${relatedGSCKeywords && relatedGSCKeywords.length > 0 ? `, ${relatedGSCKeywords.length} related keywords included` : ''}`, { duration: 4000 });
  } else {
    // Add related GSC keywords to the primary keyword's relatedKeywords
    const primaryKeywordData = keywordData[0];
    if (primaryKeywordData && relatedGSCKeywords && relatedGSCKeywords.length > 0) {
      primaryKeywordData.relatedKeywords = [
        ...(primaryKeywordData.relatedKeywords || []),
        ...relatedGSCKeywords
      ].filter((kw, idx, arr) => arr.indexOf(kw) === idx); // Remove duplicates
    }
    
    const keywordResearchTime = Math.floor((Date.now() - keywordResearchStartTime) / 1000);
    toast.success(`Keyword research complete in ${keywordResearchTime}s. Search volume: ${keywordData[0]?.searchVolume || 0}.${relatedGSCKeywords && relatedGSCKeywords.length > 0 ? ` Included ${relatedGSCKeywords.length} related GSC keywords.` : ''}`, { duration: 4000 });
  }

  // CRITICAL: Use the entry that matches our chosen primary keyword, not necessarily keywordData[0].
  // getKeywordOverview may return results in a different order (e.g. by volume); using [0] can
  // put a different phrase (e.g. "tree trimming services [city name]") into the blueprint and
  // Keyword Focus instead of the chosen primary (e.g. "Florida window coverings").
  const primaryLower = sanitizedKeyword.toLowerCase().trim();
  let primaryKeywordData = keywordData.find(
    (k) => k && k.keyword && String(k.keyword).toLowerCase().trim() === primaryLower
  ) || keywordData[0];
  // Ensure the object we return has .keyword = our chosen primary so blueprint/content/ACF stay in sync
  if (primaryKeywordData && primaryKeywordData.keyword !== sanitizedKeyword) {
    primaryKeywordData = { ...primaryKeywordData, keyword: sanitizedKeyword };
  }

  // Fetch People Also Ask
  toast.info('Fetching People Also Ask questions from Google SERP...', { duration: 3000 });
  setProgress({ step: 'Fetching SERP data...', progress: 45, message: 'Extracting People Also Ask questions...' });
  
  const paaStartTime = Date.now();
  const paaResult = await fetchPeopleAlsoAsk(sanitizedKeyword, 'United States', 'en', 10);
  
  const paaTime = Math.floor((Date.now() - paaStartTime) / 1000);
  toast.success(`Found ${paaResult.items?.length || 0} People Also Ask questions in ${paaTime}s.`, { duration: 3000 });
  const paaRawResponse = paaResult.rawResponse;

  return { keywordData: primaryKeywordData, paaResult, paaRawResponse, relatedGSCKeywords };
}

export async function performAIAnalysis(
  primaryKeywordData: KeywordData,
  site: WordPressSite,
  paaRawResponse: any,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  relatedGSCKeywords?: string[],
  model?: string
): Promise<KeywordAIAnalysis> {
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  const researchModel = model || getResearchModel(site.id);

  toast.info('Analyzing keyword with AI... Analyzing SERP data and competitor content.');
  setProgress({ step: 'Analyzing keyword with AI...', progress: 50, message: 'Processing keyword suggestions, H2 sections, and PAA questions...' });

  const aiAnalysisStartTime = Date.now();
  const aiAnalysis = await analyzeKeywordWithAI(
    primaryKeywordData,
    undefined,
    {
      apiKey: openRouterApiKey,
      model: researchModel,
      temperature: 1.0,
      maxTokens: 4000,
      topP: 0.9,
      serpData: paaRawResponse,
      connectedSite: { name: site.name, siteUrl: site.siteUrl },
      relatedGSCKeywords: relatedGSCKeywords,
      siteUrl: site.siteUrl, // Pass siteUrl for competitor filtering
      companyName: site.name, // Pass company name for competitor filtering
    }
  );

  const aiAnalysisTime = Math.floor((Date.now() - aiAnalysisStartTime) / 1000);
  toast.success(`AI analysis complete in ${aiAnalysisTime}s.${relatedGSCKeywords && relatedGSCKeywords.length > 0 ? ` Included ${relatedGSCKeywords.length} related GSC keywords.` : ''}`, { duration: 4000 });

  return aiAnalysis;
}

/**
 * Analyzes an entity with AI to get context and information for content optimization
 */
async function analyzeEntityWithAI(
  entity: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const researchModel = model || getResearchModel();
  const systemPrompt = `You are an expert SEO content analyst specializing in entity analysis for local SEO optimization.

Your task is to analyze the provided entity (location/place) and provide rich context that can be naturally scattered throughout content. This context should help create authentic, location-aware content that demonstrates local expertise.

Return a concise analysis (2-3 sentences) that includes:
1. Key characteristics or notable features of the entity
2. Geographic context (region, state/province, nearby areas)
3. Any relevant cultural, historical, or demographic information that would be useful for content creation

Keep it concise and focused on information that would naturally appear in service area or location-based content.`;

  const userPrompt = `Analyze this entity and provide context for content optimization:

"${entity}"

Provide a concise analysis that can be used to naturally scatter this entity throughout content.`;

  try {
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
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI entity analysis failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || "";
    return analysis;
  } catch (error) {
    console.error(`[Entity Analysis] Error analyzing entity:`, error);
    return ""; // Return empty string on error, don't fail the process
  }
}

export async function generateOptimizedBlueprint(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: string[],
  selectedResearchLinks: string[],
  existingTitle: string,
  primaryKeyword: string,
  primaryKeywordData: KeywordData,
  paaRawResponse: any,
  site: WordPressSite,
  fileManager: OptimizationFileManager,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  currentPageUrl?: string, // URL of the page currently being optimized
  existingPost?: any, // WordPress post data (optional, for fetching origin field)
  hasEntityOverride?: boolean // Manual override: true = force entity mode, false = force no entity, undefined = auto-detect
): Promise<{ blueprintResult: any; checklist: string[] }> {
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  toast.info('Generating optimized blueprint... This step may take 30-60 seconds.');
  setProgress({ step: 'Generating optimized blueprint...', progress: 60, message: 'Extracting and analyzing entity from title/origin...' });

  // Extract entity from title using AI - ALWAYS use AI extraction, never trust existing ACF origin field
  // This ensures fresh, accurate entity extraction every time
  let extractedEntity: string | undefined = undefined;
  let entityAnalysis: string | undefined = undefined;

  try {
    // Step 1: ALWAYS extract entity from title using AI (primary method)
    // DO NOT read from existing ACF origin field - we're about to update it with fresh extraction
    if (existingTitle && existingTitle.trim()) {
      try {
        extractedEntity = await analyzeTitleForOrigin(existingTitle, openRouterApiKey);
        // Check if extracted value is a placeholder (e.g., "[city]", "[location]")
        // analyzeTitleForOrigin now filters these out, but double-check here
        if (extractedEntity && extractedEntity.trim()) {
          const placeholderPatterns = [
            /^\[.*\]$/,  // Matches [city], [location], etc.
            /^<.*>$/,    // Matches <city>, <location>, etc.
            /^\{.*\}$/,  // Matches {city}, {location}, etc.
          ];
          const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(extractedEntity.trim()));
          if (isPlaceholder) {
            console.log(`[Optimize Content] Extracted value "${extractedEntity}" is a placeholder - treating as no entity (N/A)`);
            extractedEntity = undefined;
          } else if (!isValidEntity(extractedEntity)) {
            console.log(`[Optimize Content] Extracted entity "${extractedEntity}" failed validation - treating as no entity (N/A)`);
            extractedEntity = undefined;
          } else {
            console.log('[Optimize Content] Extracted entity from title:', extractedEntity);
          }
        } else {
          extractedEntity = undefined; // Ensure empty string becomes undefined
        }
      } catch (error) {
        console.warn('[Optimize Content] Could not extract entity from title:', error);
      }
    }

    // Step 2: Try to extract MORE SPECIFIC entity from URL slug
    // URL often has more detail (e.g., "34-avenue-nw-edmonton") than title ("Near Edmonton")
    if (currentPageUrl) {
      const urlEntity = extractEntityFromUrlSlug(currentPageUrl, existingTitle);
      if (urlEntity && urlEntity.trim()) {
        // Validate URL entity before using it
        if (!isValidEntity(urlEntity)) {
          console.log(`[Optimize Content] URL entity "${urlEntity}" failed validation - REJECTED`);
        } else {
          // If we have a URL entity and it's more specific than what we extracted from title
          // (more words = more specific), use the URL entity
          const urlEntityWords = urlEntity.split(' ').length;
          const titleEntityWords = extractedEntity ? extractedEntity.split(' ').length : 0;
          
          if (!extractedEntity || urlEntityWords > titleEntityWords) {
            console.log('[Optimize Content] URL entity is more specific, using:', {
              urlEntity,
              titleEntity: extractedEntity,
              urlWords: urlEntityWords,
              titleWords: titleEntityWords
            });
            extractedEntity = urlEntity;
          }
        }
      }
    }

    // Step 2.5: Validate extracted entity (reject "Your Home" type entities)
    if (extractedEntity && extractedEntity.trim() && !isValidEntity(extractedEntity)) {
      console.log(`[Optimize Content] Extracted entity "${extractedEntity}" failed validation - treating as no entity (N/A)`);
      extractedEntity = undefined;
    }

    // Step 3: Apply manual override if specified
    // hasEntityOverride === false: Force NO entity mode (regular blog post)
    // hasEntityOverride === true: Force entity mode (use extracted entity or title as fallback)
    // hasEntityOverride === undefined: Auto-detect (use extracted entity if valid)
    if (hasEntityOverride === false) {
      // User explicitly disabled entity mode
      extractedEntity = "N/A";
      console.log('[Optimize Content] Entity mode MANUALLY DISABLED by user - treating as regular blog post');
    } else if (hasEntityOverride === true && (!extractedEntity || !extractedEntity.trim())) {
      // User explicitly enabled entity mode but no entity was extracted - use title as entity
      extractedEntity = existingTitle || primaryKeyword;
      console.log('[Optimize Content] Entity mode MANUALLY ENABLED by user, using title as entity:', extractedEntity);
    } else if (!extractedEntity || !extractedEntity.trim()) {
      // Auto-detect mode with no entity found
      extractedEntity = "N/A";
      console.log('[Optimize Content] No entity found in post - treating as regular blog post (N/A)');
    }

    // Step 4: If we have a real entity (not "N/A"), analyze it with AI to get context
    if (extractedEntity && extractedEntity !== "N/A" && extractedEntity.trim()) {
      setProgress({ step: 'Generating optimized blueprint...', progress: 62, message: `Analyzing entity "${extractedEntity}" with AI...` });
      // Entity analysis will use research model from settings (analyzeEntityWithAI uses getResearchModel() default)
      entityAnalysis = await analyzeEntityWithAI(extractedEntity, openRouterApiKey, undefined);
      if (entityAnalysis) {
        console.log('[Optimize Content] Entity analysis complete:', entityAnalysis.substring(0, 100) + '...');
      }
    }
  } catch (error) {
    console.warn('[Optimize Content] Error during entity extraction/analysis:', error);
    // Continue without entity - don't fail the whole process
    // If override was set to false, respect it
    if (hasEntityOverride === false) {
      extractedEntity = "N/A";
    }
  }

  setProgress({ step: 'Generating optimized blueprint...', progress: 65, message: 'Creating checklist from keywords and H2 sections...' });

  // Get research model for blueprint generation (checklist and blueprint)
  const researchModel = getResearchModel(site.id);

  const checklistStartTime = Date.now();
  
  const checklist = await generateChecklistFromSelections(
    selectedKeywords,
    selectedH2Sections,
    existingTitle || primaryKeyword,
    primaryKeywordData,
    {
      apiKey: openRouterApiKey,
      model: researchModel,
      temperature: 1.0,
      maxTokens: 4000,
      topP: 0.9,
      serpData: paaRawResponse,
      selectedPeopleAlsoAsk,
      selectedResearchLinks,
      connectedSite: { name: site.name, siteUrl: site.siteUrl },
      wordPressPosts,
      currentPageUrl, // Pass current page URL to prevent self-linking
      entity: extractedEntity === "N/A" ? undefined : extractedEntity, // Entity extracted from title/origin field (NOT from NAP/map), or undefined if N/A
      entityAnalysis: extractedEntity === "N/A" ? undefined : entityAnalysis, // AI analysis of the entity for context, or undefined if N/A
      siteId: site.id, // Pass siteId for cache lookup
      primaryKeyword, // Pass primaryKeyword for cache search
    } as any
  );

  if (checklist.length === 0) {
    throw new Error('Failed to generate checklist');
  }

  // Save checklist file
  const checklistFileName = OptimizationFileManager.generateFilename('checklist', primaryKeyword, 'txt');
  fileManager.addFile(
    checklistFileName,
    checklist.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    'text/plain'
  );

  const checklistTime = Math.floor((Date.now() - checklistStartTime) / 1000);
  toast.success(`Checklist created (${checklist.length} items) in ${checklistTime}s. Building blueprint structure...`, { duration: 4000 });
  
  setProgress({ step: 'Generating optimized blueprint...', progress: 70, message: 'Converting checklist to blueprint structure...' });

  const blueprintStartTime = Date.now();
  const blueprintContext: BlogTemplateContext = {
    flowTitle: existingTitle || primaryKeyword,
    flowPurpose: `Comprehensive guide about ${primaryKeyword}`,
    keywordData: primaryKeywordData,
  };

      const blueprintResult = await generateBlueprintFromTemplate(
        checklist,
        blueprintContext,
        {
          apiKey: openRouterApiKey,
          model: researchModel,
          temperature: 1.0,
          maxTokens: 8000,
          topP: 0.9,
          connectedSite: { name: site.name, siteUrl: site.siteUrl },
          wordPressPosts,
          currentPageUrl, // Pass current page URL to exclude it from links
          siteId: site.id, // Pass siteId for cache lookup
          primaryKeyword, // Pass primaryKeyword for cache search
        } as any
      );

      if (blueprintResult.agents.length === 0) {
        throw new Error('Failed to generate blueprint');
      }

      // Final validation: Ensure all agents have [LINK] feature with 3-5 links specification
      const agentsWithoutLinks = blueprintResult.agents.filter(agent => {
        const features = Array.isArray(agent.features) ? agent.features : [];
        const hasLinkFeature = features.some((f: string) => 
          typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
        );
        return !hasLinkFeature;
      });
      
      if (agentsWithoutLinks.length > 0) {
        console.error(`[Content Optimization] ⚠️ ${agentsWithoutLinks.length} agent(s) missing [LINK] feature after generation. This should not happen - validation should have caught this.`);
        // The validation in generateBlueprintFromTemplate should have caught this, but log it anyway
      } else {
        console.log(`[Content Optimization] ✅ All ${blueprintResult.agents.length} agents have [LINK] features`);
      }

      // Store entity information in blueprint result for content generation
      // If entity is "N/A" or undefined, store as undefined (regular blog post)
      const entityForBlueprint = extractedEntity === "N/A" ? undefined : extractedEntity;
      // Add entity properties to blueprint result (type assertion needed since blueprint type doesn't include entity)
      (blueprintResult as any).entity = entityForBlueprint;
      (blueprintResult as any).entityAnalysis = entityForBlueprint ? entityAnalysis : undefined;
      
      // CRITICAL: Clean blueprint title if entity is N/A (no location mentions allowed)
      // The blueprint may have generated a title with location, so clean it here
      if (extractedEntity === "N/A" && blueprintResult.title) {
        const cleanedBlueprintTitle = cleanTitleForNonEntity(blueprintResult.title, extractedEntity);
        if (cleanedBlueprintTitle !== blueprintResult.title) {
          console.log('[Optimize Content] Cleaned location mentions from blueprint title:', {
            original: blueprintResult.title,
            cleaned: cleanedBlueprintTitle,
            entity: extractedEntity
          });
          blueprintResult.title = cleanedBlueprintTitle;
        }
      }
      
      // CRITICAL: Enforce 50 character limit for Death Star module (optimized content)
      if (blueprintResult.title) {
        const originalLength = blueprintResult.title.length;
        blueprintResult.title = truncateTitleForSEO(blueprintResult.title, 50);
        if (originalLength > 50) {
          console.log('[Optimize Content] Truncated blueprint title to 50 characters (Death Star module requirement):', {
            original: blueprintResult.title.substring(0, originalLength),
            truncated: blueprintResult.title,
            originalLength,
            truncatedLength: blueprintResult.title.length
          });
        }
      }
      
      console.log('[Optimize Content] Stored entity in blueprint:', {
        hasEntity: !!entityForBlueprint,
        entity: entityForBlueprint || 'N/A (regular blog post)',
        blueprintTitle: blueprintResult.title
      });

      const blueprintTime = Math.floor((Date.now() - blueprintStartTime) / 1000);
      toast.success(`Blue print created (${blueprintResult.agents.length} sections) in ${blueprintTime}s. Starting content generation...`, { duration: 4000 });

      // Save blueprint file
      const blueprintFileName = OptimizationFileManager.generateFilename('blueprint', primaryKeyword, 'json');
      fileManager.addFile(
        blueprintFileName,
        JSON.stringify(blueprintResult, null, 2),
        'application/json'
      );

      return { blueprintResult, checklist };
}

/**
 * Create mock keyword data for test mode
 */
export function createMockKeywordData(keyword: string): KeywordData {
  return {
    keyword: keyword,
    difficulty: 50,
    searchVolume: 0,
    cpc: 0,
    competition: 'MEDIUM' as const,
    intent: 'informational' as const,
    relatedKeywords: [],
    serpFeatures: []
  };
}

/**
 * Create mock AI analysis for test mode
 */
export function createMockAIAnalysis(keyword: string): KeywordAIAnalysis {
  return {
    keywordSuggestions: {
      primary: keyword,
      variations: [`${keyword} services`, `${keyword} companies`, `${keyword} agency`],
      longTail: [`best ${keyword}`, `affordable ${keyword}`, `professional ${keyword}`],
      semantic: ['online marketing', 'marketing services', 'digital advertising']
    },
    h2Suggestions: [
      {
        heading: `What is ${keyword}?`,
        description: `An introduction to ${keyword} and its importance`,
        priority: 'high' as const,
        reasoning: 'Provides foundational context for readers'
      },
      {
        heading: `Benefits of ${keyword}`,
        description: `Key advantages and benefits of using ${keyword}`,
        priority: 'high' as const,
        reasoning: 'Helps users understand value proposition'
      },
      {
        heading: `How to Choose the Right ${keyword} Provider`,
        description: `Guidance on selecting the best ${keyword} service`,
        priority: 'medium' as const,
        reasoning: 'Addresses common user queries'
      }
    ],
    contentGaps: [
      {
        topic: `${keyword} Best Practices`,
        description: `Industry best practices and recommendations for ${keyword}`,
        opportunity: 'high' as const,
        suggestedH2: `${keyword} Best Practices`
      }
    ],
    peopleAlsoAsk: [],
    researchLinks: []
  };
}

/**
 * Create mock blueprint result for test mode
 */
export function createMockBlueprint(keyword: string, existingTitle: string): any {
  return {
    title: existingTitle || `Complete Guide to ${keyword}`,
    purpose: `Comprehensive guide about ${keyword}`,
    entity: 'N/A',
    agents: [
      {
        id: 'intro',
        step: 1,
        title: `Introduction to ${keyword}`,
        content: `This section introduces ${keyword} and explains its importance.`
      },
      {
        id: 'benefits',
        step: 2,
        title: `Benefits of ${keyword}`,
        content: `This section covers the key benefits and advantages of ${keyword}.`
      },
      {
        id: 'how-to-choose',
        step: 3,
        title: `How to Choose the Right ${keyword} Provider`,
        content: `This section provides guidance on selecting the best ${keyword} service for your needs.`
      }
    ]
  };
}

/**
 * Generates a meaningful alt tag from an image URL
 * Extracts filename and path information to create descriptive alt text
 */
function generateAltTagFromUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return 'Image';
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Extract filename (last segment of path)
    const filename = pathname.split('/').pop() || '';
    
    // Remove file extension
    let nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i, '');
    
    // If filename is empty or generic, try using path segments
    if (!nameWithoutExt || nameWithoutExt.length < 3 || /^(image|img|photo|pic|file|untitled)/i.test(nameWithoutExt)) {
      // Use path segments instead
      const pathSegments = pathname.split('/').filter(seg => seg && seg.length > 0);
      if (pathSegments.length > 0) {
        // Use the last meaningful segment
        const lastSegment = pathSegments[pathSegments.length - 1].replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i, '');
        if (lastSegment && lastSegment.length > 2) {
          nameWithoutExt = lastSegment;
        }
      }
    }
    
    // Clean up the name: replace hyphens, underscores, and numbers with spaces
    let altText = nameWithoutExt
      .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
      .replace(/\d+/g, ' ')   // Remove numbers
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .trim();
    
    // Capitalize first letter of each word
    altText = altText.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
    
    // If we still don't have a good alt text, use domain or generic
    if (!altText || altText.length < 3) {
      const domain = urlObj.hostname.replace('www.', '').split('.')[0];
      altText = domain ? `${domain.charAt(0).toUpperCase() + domain.slice(1)} image` : 'Image';
    }
    
    // Limit length to reasonable alt tag size (125 chars max for accessibility)
    if (altText.length > 125) {
      altText = altText.substring(0, 122) + '...';
    }
    
    return altText || 'Image';
  } catch (error) {
    // If URL parsing fails, try simple extraction
    const match = url.match(/\/([^\/]+)\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
    if (match && match[1]) {
      let altText = match[1]
        .replace(/[-_]/g, ' ')
        .replace(/\d+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      altText = altText.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
      
      return altText || 'Image';
    }
    
    return 'Image';
  }
}

/**
 * Validates that an image URL is valid and points to an actual image
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }
  
  const trimmedUrl = url.trim();
  
  // Must be HTTP or HTTPS
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return false;
  }
  
  // Must have a path (not just domain)
  try {
    const urlObj = new URL(trimmedUrl);
    if (!urlObj.pathname || urlObj.pathname === '/' || urlObj.pathname.length < 2) {
      return false;
    }
  } catch {
    return false;
  }
  
  // Reject placeholder or invalid patterns
  const urlLower = trimmedUrl.toLowerCase();
  const invalidPatterns = [
    'placeholder',
    'example.com',
    'lorem',
    'dummy',
    'fake',
    'test',
    'sample',
    'none',
    'null',
    'undefined',
    '#',
    'javascript:',
    'data:',
  ];
  
  if (invalidPatterns.some(pattern => urlLower.includes(pattern))) {
    return false;
  }
  
  // Reject URLs that are just domains without paths
  if (trimmedUrl.match(/^https?:\/\/[^\/]+\/?$/)) {
    return false;
  }
  
  // Should have an image-like extension or be from a known image hosting domain
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const hasImageExtension = imageExtensions.some(ext => urlLower.includes(ext));
  
  // If no extension, check if it's from a known image hosting service
  const imageHostingDomains = ['wordpress.com', 'wp.com', 'i.imgur.com', 'cdn.', 'images.', 'img.', 'media.'];
  const isFromImageHost = imageHostingDomains.some(domain => urlLower.includes(domain));
  
  // Accept if it has image extension OR is from image hosting OR has query params (dynamic images)
  if (hasImageExtension || isFromImageHost || trimmedUrl.includes('?')) {
    return true;
  }
  
  // Reject if it doesn't look like an image URL at all
  return false;
}

/**
 * Extracts images from existing HTML content using AI
 * Returns array of unique images with URL, alt tag, and context
 * Only includes images with valid URLs AND valid alt tags
 */
export async function extractImagesFromContent(
  htmlContent: string,
  apiKey: string,
  model?: string
): Promise<Array<{ url: string; altTag: string; context: string }>> {
  const researchModel = model || getResearchModel();
  
  if (!htmlContent || htmlContent.trim().length === 0) {
    return [];
  }

  // Quick check if there are any images in the content
  if (!htmlContent.includes('<img') && !htmlContent.includes('![')) {
    console.log('[Image Extraction] No images found in content (quick check)');
    return [];
  }

  try {
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
          {
            role: "system",
            content: `You are an expert at analyzing HTML content and extracting image information.
Your task is to find all REAL, EXISTING images in the provided HTML content and extract their details.

**ABSOLUTELY CRITICAL - ONLY EXTRACT REAL IMAGES**:
- ONLY extract images that actually exist in the HTML content with real URLs
- NEVER create, invent, or generate images that don't exist
- NEVER create placeholder images or fake image references
- If there are no images in the content, return an empty array
- ONLY extract images that have actual <img> tags or markdown image syntax (![alt](url)) in the provided HTML

Return a JSON object with an "images" array containing objects with these fields:
- url: The image source URL (src attribute) - MUST be a real, existing, valid HTTP/HTTPS URL from the HTML with a proper path (not empty, not just a domain)
- altTag: The alt text of the image (alt attribute) - MUST be non-empty if the image is to be included
- context: A brief description of what section or topic the image appears to be related to (based on surrounding text or headings)

CRITICAL RULES:
1. **ONLY include images with valid HTTP/HTTPS URLs that actually exist in the HTML** (not data: URLs, placeholder URLs, or invented URLs)
2. **URLs MUST have a proper path** - reject URLs that are just domains (e.g., "https://example.com" without a path)
3. **URLs MUST look like actual image URLs** - should have image extensions (.jpg, .png, etc.) OR be from image hosting services OR have query parameters
4. **NEVER create or invent image URLs** - only extract URLs that are actually present in the HTML content
5. **MANDATORY: ONLY include images that have BOTH a valid URL AND a valid, non-empty alt tag** - Images missing either will be excluded completely
6. If an image has an empty alt attribute, missing alt attribute, or only whitespace, DO NOT include it in the results
7. If an image URL is empty, invalid, or just a domain without a path, DO NOT include it in the results
8. Deduplicate - if the same URL appears multiple times, only include it once
9. Skip any images that appear to be icons, logos, or decorative (very small, or in header/footer areas)
10. Focus on content images that are part of the main article body
11. **If no images exist in the content, return an empty "images" array** - do NOT create placeholder or fake images

**ABSOLUTELY CRITICAL**: Only return images that have BOTH a valid, non-empty URL with proper path AND meaningful, non-empty alt text. Images missing either will NOT be placed in the content.

Return ONLY valid JSON, no markdown formatting.`
          },
          {
            role: "user",
            content: `Extract all content images from this HTML:

${htmlContent.substring(0, 15000)}

Return JSON format:
{
  "images": [
    { "url": "https://...", "altTag": "...", "context": "..." }
  ]
}`
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn('[Image Extraction] AI request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    if (!content) {
      console.warn('[Image Extraction] No content in AI response');
      return [];
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[Image Extraction] Failed to parse AI response:', parseError);
      return [];
    }

    const images = parsed.images || parsed || [];
    
    if (!Array.isArray(images)) {
      console.warn('[Image Extraction] Response is not an array');
      return [];
    }

    // Validate and deduplicate - ONLY include real images with valid URLs AND valid alt tags
    const seenUrls = new Set<string>();
    const validImages: Array<{ url: string; altTag: string; context: string }> = [];

    for (const img of images) {
      // CRITICAL: Validate URL exists and is not empty
      if (!img.url || typeof img.url !== 'string' || img.url.trim().length === 0) {
        console.error('[Image Extraction] Skipping image with EMPTY or invalid URL:', img);
        continue;
      }
      
      const trimmedUrl = img.url.trim();
      
      // CRITICAL: Validate URL is a valid image URL using the validation function
      if (!isValidImageUrl(trimmedUrl)) {
        console.error(`[Image Extraction] Skipping image with INVALID URL: ${trimmedUrl} - URL must be a valid HTTP/HTTPS image URL with proper path`);
        continue;
      }
      
      if (seenUrls.has(trimmedUrl)) continue;
      
      // CRITICAL: Only include images with valid, non-empty alt tags
      const altTag = (img.altTag || '').trim();
      if (!altTag || altTag.length === 0) {
        console.error(`[Image Extraction] Skipping image without alt text: ${trimmedUrl} - images without alt text will NOT be placed`);
        continue;
      }
      
      seenUrls.add(trimmedUrl);
      validImages.push({
        url: trimmedUrl,
        altTag: altTag,
        context: img.context || ''
      });
      
    }

    console.log(`[Image Extraction] Found ${validImages.length} unique REAL images with valid URLs and alt tags from original content (images with invalid URLs or missing alt text were excluded)`);
    
    if (validImages.length === 0) {
      console.log('[Image Extraction] No valid images (with valid URLs and alt text) found in original content - no images will be placed');
    }
    
    return validImages;

  } catch (error) {
    console.error('[Image Extraction] Error extracting images:', error);
    return [];
  }
}

/**
 * Uses AI to match images to appropriate content sections
 * Excludes intro, conclusion, and FAQ sections
 */
export async function matchImagesToSections(
  images: Array<{ url: string; altTag: string; context: string }>,
  sectionHeadings: string[],
  excludedPatterns: string[],
  apiKey: string,
  model?: string
): Promise<Array<{ imageUrl: string; altTag: string; targetSection: string }>> {
  const researchModel = model || getResearchModel();
  
  if (!images || images.length === 0) {
    return [];
  }

  if (!sectionHeadings || sectionHeadings.length === 0) {
    console.warn('[Image Matching] No section headings provided');
    return [];
  }

  // Filter out excluded sections
  const availableSections = sectionHeadings.filter(heading => {
    const headingLower = heading.toLowerCase();
    return !excludedPatterns.some(pattern => headingLower.includes(pattern.toLowerCase()));
  });

  if (availableSections.length === 0) {
    console.warn('[Image Matching] No available sections after filtering');
    return [];
  }

  try {
    const imagesDescription = images.map((img, idx) => 
      `${idx + 1}. URL: ${img.url}\n   Alt: "${img.altTag || 'No alt text'}"\n   Context: "${img.context || 'Unknown'}"`
    ).join('\n\n');

    const sectionsDescription = availableSections.map((s, idx) => `${idx + 1}. "${s}"`).join('\n');

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
          {
            role: "system",
            content: `You are an expert at matching images to content sections for optimal SEO and user experience.

Your task is to analyze each image's alt tag and context, then match it to the most semantically appropriate section heading.

CRITICAL RULES:
1. **MANDATORY: ONLY match images that have valid, non-empty alt tags** - Images without alt text MUST be excluded from assignments
2. Each image should be matched to exactly ONE section
3. Choose the section where the image would be most relevant based on the alt tag meaning and context
4. If an image doesn't fit well anywhere, still assign it to the most reasonable section (but ONLY if it has a valid alt tag)
5. Ensure no duplicate images - each URL should only appear once in your response
6. NEVER assign images to introduction, conclusion, or FAQ sections (these have been pre-filtered)
7. **ABSOLUTELY CRITICAL**: Do NOT include any images in your response that have empty alt tags, missing alt tags, or only whitespace - these images will NOT be placed in the content

Return a JSON object with an "assignments" array containing objects with:
- imageUrl: The exact image URL
- altTag: The alt tag text
- targetSection: The exact section heading text (must match one from the available sections list)`
          },
          {
            role: "user",
            content: `Match these images to the most appropriate content sections.

IMAGES TO PLACE:
${imagesDescription}

AVAILABLE SECTIONS (choose from these ONLY):
${sectionsDescription}

Return JSON format:
{
  "assignments": [
    { "imageUrl": "https://...", "altTag": "...", "targetSection": "Section Heading" }
  ]
}`
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn('[Image Matching] AI request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    if (!content) {
      console.warn('[Image Matching] No content in AI response');
      return [];
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[Image Matching] Failed to parse AI response:', parseError);
      return [];
    }

    const assignments = parsed.assignments || parsed || [];
    
    if (!Array.isArray(assignments)) {
      console.warn('[Image Matching] Response is not an array');
      return [];
    }

    // Validate assignments
    const seenUrls = new Set<string>();
    const validAssignments: Array<{ imageUrl: string; altTag: string; targetSection: string }> = [];

    for (const assignment of assignments) {
      // CRITICAL: Validate URL exists and is not empty
      if (!assignment.imageUrl || typeof assignment.imageUrl !== 'string' || assignment.imageUrl.trim().length === 0) {
        console.error('[Image Matching] Skipping assignment with EMPTY or invalid URL:', assignment);
        continue;
      }
      
      const trimmedUrl = assignment.imageUrl.trim();
      
      // CRITICAL: Validate URL is a valid image URL
      if (!isValidImageUrl(trimmedUrl)) {
        console.error(`[Image Matching] Skipping assignment with INVALID URL: ${trimmedUrl} - URL must be a valid HTTP/HTTPS image URL with proper path`);
        continue;
      }
      
      if (!assignment.targetSection || typeof assignment.targetSection !== 'string') continue;
      if (seenUrls.has(trimmedUrl)) continue;
      
      // Verify target section exists in available sections
      const matchedSection = availableSections.find(s => 
        s.toLowerCase().trim() === assignment.targetSection.toLowerCase().trim()
      );
      
      if (!matchedSection) {
        // Try partial match
        const partialMatch = availableSections.find(s => 
          s.toLowerCase().includes(assignment.targetSection.toLowerCase()) ||
          assignment.targetSection.toLowerCase().includes(s.toLowerCase())
        );
        if (!partialMatch) {
          console.warn(`[Image Matching] Section "${assignment.targetSection}" not found, skipping image`);
          continue;
        }
        assignment.targetSection = partialMatch;
      } else {
        assignment.targetSection = matchedSection;
      }
      
      // CRITICAL: Only include images with valid, non-empty alt tags
      const altTag = (assignment.altTag || '').trim();
      if (!altTag || altTag.length === 0) {
        console.error(`[Image Matching] Skipping image without alt text: ${trimmedUrl} - images without alt text will NOT be placed`);
        continue;
      }
      
      seenUrls.add(trimmedUrl);
      validAssignments.push({
        imageUrl: trimmedUrl,
        altTag: altTag,
        targetSection: assignment.targetSection
      });
      
    }

    console.log(`[Image Matching] Matched ${validAssignments.length} images with valid URLs and alt tags to sections (images with invalid URLs or missing alt text were excluded)`);
    return validAssignments;

  } catch (error) {
    console.error('[Image Matching] Error matching images:', error);
    return [];
  }
}

/**
 * Extracts H2 section headings from markdown content
 */
export function extractH2Headings(markdownContent: string): string[] {
  if (!markdownContent) return [];
  
  const headings: string[] = [];
  const lines = markdownContent.split('\n');
  
  for (const line of lines) {
    // Match ## heading (H2) but not ### or more
    const match = line.match(/^##\s+(.+)$/);
    if (match && match[1]) {
      headings.push(match[1].trim());
    }
  }
  
  return headings;
}

/**
 * Inserts an image markdown into a specific section of the content
 * Only inserts images with valid URLs AND valid alt tags
 */
export function insertImageIntoSection(
  markdownContent: string,
  sectionHeading: string,
  imageUrl: string,
  altTag: string
): string {
  if (!markdownContent || !sectionHeading) {
    return markdownContent;
  }

  // CRITICAL: Validate image URL is not empty and is valid
  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    console.error(`[Image Insertion] Skipping image with EMPTY URL - cannot place image without valid URL`);
    return markdownContent;
  }
  
  // CRITICAL: Validate URL is a valid image URL
  if (!isValidImageUrl(imageUrl)) {
    console.error(`[Image Insertion] Skipping image with INVALID URL: ${imageUrl} - URL must be a valid HTTP/HTTPS image URL`);
    return markdownContent;
  }

  // CRITICAL: Do not place images without proper alt tags
  const trimmedAltTag = (altTag || '').trim();
  if (!trimmedAltTag || trimmedAltTag.length === 0) {
    console.error(`[Image Insertion] Skipping image without alt text: ${imageUrl} - images without alt text will NOT be placed`);
    return markdownContent;
  }

  const imageMarkdown = `![${trimmedAltTag}](${imageUrl})`;
  
  // Find the section heading in the content
  const lines = markdownContent.split('\n');
  let insertIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if this line is the target H2 heading
    if (line.match(/^##\s+/) && line.toLowerCase().includes(sectionHeading.toLowerCase().substring(0, 20))) {
      // Find the first paragraph after the heading (skip empty lines)
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '') {
          // Insert after this first content line
          insertIndex = j + 1;
          break;
        }
      }
      break;
    }
  }

  if (insertIndex === -1) {
    // Fallback: try exact match
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`## ${sectionHeading}`)) {
        insertIndex = i + 2; // After heading and one line
        break;
      }
    }
  }

  if (insertIndex === -1) {
    console.warn(`[Image Insertion] Could not find section "${sectionHeading}", appending to end`);
    return markdownContent + '\n\n' + imageMarkdown;
  }

  // Insert the image
  lines.splice(insertIndex, 0, '', imageMarkdown, '');
  const result = lines.join('\n');
  
  return result;
}

// Re-export functions from extracted modules
export { generateAndUploadContent } from "@/lib/content-generation-upload";
export { processGSCQueriesAndAnalyze } from "@/lib/gsc-query-processor";
export type { OptimizationContext } from "@/lib/content-generation-upload";

