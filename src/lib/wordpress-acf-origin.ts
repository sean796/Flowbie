import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

/**
 * Analyzes a WordPress post title to extract the origin entity (location) using AI
 * This is for local SEO service area pages where the origin is the target location
 * 
 * @param title - Post title to analyze
 * @param apiKey - OpenRouter API key (optional, will load from storage if not provided)
 * @returns Promise resolving to the origin entity string (e.g., "Palm City, Florida")
 */
export async function analyzeTitleForOrigin(
  title: string,
  apiKey?: string
): Promise<string> {
  const openRouterApiKey = apiKey || loadApiKey();
  
  if (!openRouterApiKey || !openRouterApiKey.trim()) {
    throw new Error("OpenRouter API key is required for entity analysis");
  }

  const systemPrompt = `You are a local SEO expert specializing in geographic entity extraction for service area pages.

YOUR TASK: Extract the EXACT location phrase from the title, preserving the original format.

CRITICAL RULES:
1. Extract the COMPLETE location exactly as written - including street/avenue numbers, directional indicators (NW, SE, etc.), and city name
2. Keep commas and formatting as they appear in the original title
3. Do NOT simplify "34 Avenue NW, Edmonton" to just "Edmonton"
4. Do NOT simplify "Whyte Avenue, Edmonton" to just "Edmonton"
5. Return "NONE" if there is no geographic location
6. **CRITICAL: NEVER extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01", "2024/01/01") of any kind. Return "NONE" if the title only contains a year or date without a specific geographic location.
7. **CRITICAL: Entities MUST be geolocations ONLY - nothing generic or personal!** NEVER extract personal or generic entities like "home", "Your Home", "My Home", "The Home", "house", "Your House", "My House", "The House", "place", "Your Place", "My Place", "The Place", "Your Big Day", "My Big Day", "The Big Day", "Your Special Day", "My Special Day", "Your Event", "My Event", "Your New Business", "My New Business", "The New Business", "Your Business", "My Business", "Your Company", "My Company", "New Business", "Business", "Office", "Offices", "Workplace", "Store", "Shop", "Location", "Area", "Region", "Neighborhood", "Venue", "Facility", "Building", "Establishment", "Premises", "Site", or ANY other personal/business/workplace terms as entities** - These are generic terms, NOT geographic locations. Entities MUST be geolocations only (cities, states, streets, neighborhoods, etc.). Return "NONE" if the title contains ANY entity starting with "Your", "My", or "The" unless it's clearly followed by a specific geographic location name (city, street, etc.). AGGRESSIVELY REJECT all personal/business/workplace entities. If you see "Your New Business", "Offices", "Office", or similar generic business terms, return "NONE" immediately.

EXAMPLES - Extract the EXACT location phrase:
- Title: "Your Local Dental Clinic Near 34 Avenue NW, Edmonton" → Extract: "34 Avenue NW, Edmonton"
- Title: "Dentist on Whyte Avenue, Edmonton" → Extract: "Whyte Avenue, Edmonton"
- Title: "Dental Services in Sherwood Park, Alberta" → Extract: "Sherwood Park, Alberta"
- Title: "Best Dentist Downtown Toronto" → Extract: "Downtown Toronto"
- Title: "Window Blinds Palm City Florida" → Extract: "Palm City, Florida"

INVALID (return "NONE"):
- "Large Living Room Windows" - no location
- "Kitchen Blinds Installation" - no location
- "Modern Window Treatments" - no location
- "Blinds for Your Home" - "Your Home" is NOT a geographic location, return "NONE"
- "Window Treatments in My Home" - "My Home" is NOT a geographic location, return "NONE"
- "Shades Near Me for Your Home" - "Your Home" is NOT a geographic location, return "NONE"
- "Blinds for Your Big Day" - "Your Big Day" is NOT a geographic location, return "NONE"
- "Window Treatments for My Special Day" - "My Special Day" is NOT a geographic location, return "NONE"
- "Shades for The Event" - "The Event" is NOT a geographic location, return "NONE"
- "Commercial Window Coverings for Your New Business" - "Your New Business" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments for My Business" - "My Business" is NOT a geographic location, return "NONE"
- "Blinds for New Business" - "New Business" is NOT a geographic location, return "NONE"
- "Top Three Commercial Blinds for Offices" - "Offices" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments for Office" - "Office" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments 2024" - "2024" is a year, NOT a geographic location, return "NONE"
- "Blinds January 2024" - "January 2024" is a date, NOT a geographic location, return "NONE"
- "Shades 2024-01-01" - "2024-01-01" is a date, NOT a geographic location, return "NONE"

Return ONLY the exact location phrase from the title, or "NONE". No other text.`;

  const userPrompt = `Extract the EXACT location phrase from this title. Include street/avenue names, directional indicators (NW, SE, etc.), and city name exactly as written:

"${title}"

IMPORTANT: 
- Return the complete location like "34 Avenue NW, Edmonton" - do NOT simplify to just "Edmonton"
- **CRITICAL: Do NOT extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01") of any kind. If the title only contains a year or date without a specific geographic location, return "NONE".
- **CRITICAL: Entities MUST be geolocations ONLY - nothing generic or personal!** Do NOT extract personal or generic entities like "home", "Your Home", "My Home", "house", "Your House", "place", "Your Big Day", "My Big Day", "Your Special Day", "My Event", "Your New Business", "My New Business", "The New Business", "Your Business", "My Business", "New Business", "Business", "Your Company", "My Company", "Office", "Offices", "Workplace", "Store", "Shop", "Location", "Area", "Region", "Neighborhood", "Venue", "Facility", "Building", "Establishment", "Premises", "Site", or ANY other personal/business/workplace possessive phrases (Your/My/The + generic/business term) as entities** - These are NOT geographic locations. Entities MUST be geolocations only (cities, states, streets, neighborhoods, etc.). AGGRESSIVELY REJECT all entities starting with "Your", "My", or "The" unless clearly followed by a specific geographic location. If the title contains any such personal/business/workplace entity without a specific geographic location, return "NONE" immediately. If you see "Offices", "Office", or any standalone business/workplace term, return "NONE" immediately.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: getResearchModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 200, // Increased to handle longer entity names with specific locations
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI analysis failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const origin = data.choices?.[0]?.message?.content?.trim() || "";
// Clean up any markdown formatting or extra text
    let cleanedOrigin = origin
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/`/g, '') // Remove code blocks
      .trim();

    // Check if extracted value is a placeholder, "NONE", or invalid
    // These indicate no actual geographic entity - treat as N/A
    const placeholderPatterns = [
      /^\[.*\]$/,  // Matches [city], [location], [area], etc.
      /^<.*>$/,    // Matches <city>, <location>, etc.
      /^\{.*\}$/,  // Matches {city}, {location}, etc.
      /^placeholder$/i,
      /^n\/a$/i,
      /^none$/i,
      /^not applicable$/i,
      /^no geographic location$/i,
      /^no location$/i,
      /^not found$/i,
    ];

    const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(cleanedOrigin));
    
    if (isPlaceholder) {
      console.log(`[ACF Origin] Extracted value "${cleanedOrigin}" is a placeholder - treating as no entity (N/A)`);
      return "";
    }
if (!cleanedOrigin) {
      console.warn(`[ACF Origin] No origin entity extracted from title: "${title}"`);
      return "";
    }

    // CRITICAL: Validate that extracted entity is a valid geolocation (not personal/business entity)
    const { isValidEntity } = await import('@/lib/content-optimization-helpers');
    
    if (!isValidEntity(cleanedOrigin)) {
      console.log(`[ACF Origin] Extracted value "${cleanedOrigin}" failed validation - treating as no entity (N/A). Entities must be geolocations only.`);
      return "";
    }
    
    console.log(`[ACF Origin] Extracted origin "${cleanedOrigin}" from title: "${title}"`);
    return cleanedOrigin;
  } catch (error) {
    console.error(`[ACF Origin] Error analyzing title:`, error);
    throw error;
  }
}

/**
 * Updates the ACF Origin field for a WordPress post
 * Uses the single field update endpoint (backward compatible)
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID
 * @param origin - Origin value to set
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional exact endpoint name
 * @returns Promise resolving to success status
 */
export async function updateACFOriginField(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  origin: string,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; error?: string }> {
  const BACKEND_API_BASE = typeof window !== 'undefined' 
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : '')
    : 'http://localhost:3001';

  const url = `${BACKEND_API_BASE}/api/wordpress/update-acf-field`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        fieldName: 'origin',
        fieldValue: origin,
        postType,
        postTypeEndpoint,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: data.success === true, error: data.error };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to backend server at ${url}\n\n` +
        `Please ensure the backend server is running on http://localhost:3001`
      );
    }
    
    throw error;
  }
}

/**
 * Updates multiple ACF fields in one request using the batch update endpoint
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID
 * @param fields - Object with field names as keys and values as values
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional exact endpoint name
 * @param options - Optional update options (validateOnly, verifyAfterUpdate, continueOnError)
 * @returns Promise resolving to batch update result
 */
export async function updateACFFields(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  fields: Record<string, any>,
  postType: string = 'post',
  postTypeEndpoint?: string,
  options?: {
    validateOnly?: boolean;
    verifyAfterUpdate?: boolean;
    continueOnError?: boolean;
  }
): Promise<{
  success: boolean;
  updated: string[];
  failed: Array<{ field: string; error: string }>;
  methods: Record<string, string>;
  diagnostics?: any;
  error?: string;
}> {
  const BACKEND_API_BASE = typeof window !== 'undefined' 
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : '')
    : 'http://localhost:3001';

  const url = `${BACKEND_API_BASE}/api/wordpress/update-acf-fields`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        fields,
        postType,
        postTypeEndpoint,
        options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data.success === true,
      updated: data.updated || [],
      failed: data.failed || [],
      methods: data.methods || {},
      diagnostics: data.diagnostics,
      error: data.error,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to backend server at ${url}\n\n` +
        `Please ensure the backend server is running on http://localhost:3001`
      );
    }
    
    throw error;
  }
}

/**
 * Analyzes title and updates ACF Origin field automatically
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID
 * @param title - Post title to analyze
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional exact endpoint name
 * @returns Promise resolving to success status with extracted origin
 */
export async function analyzeAndUpdateOriginField(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  title: string,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; origin?: string; error?: string }> {
  try {
    // Step 1: Analyze title to extract origin
    const origin = await analyzeTitleForOrigin(title);
    
    // If no origin extracted or empty string, this is a regular blog post (N/A)
    // Return success but don't update - regular blog posts don't need origin fields
    if (!origin || !origin.trim() || origin.trim().toLowerCase() === "none") {
      console.log(`[ACF Origin] No origin entity extracted from title: "${title}" - treating as regular blog post (N/A)`);
      return { 
        success: true, 
        origin: undefined // No origin = regular blog post
      };
    }

    // Step 2: Update ACF field
    const result = await updateACFOriginField(
      siteUrl,
      username,
      appPassword,
      postId,
      origin,
      postType,
      postTypeEndpoint
    );

    if (result.success) {
      console.log(`[ACF Origin] Successfully updated origin field to "${origin}" for post ID ${postId}`);
      return { success: true, origin };
    } else {
      return { success: false, origin, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ACF Origin] Error in analyzeAndUpdateOriginField:`, error);
    return { success: false, error: errorMessage };
  }
}

