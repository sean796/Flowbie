/**
 * MCP Service for DataForSEO API calls
 * This service calls MCP tools directly for keyword research
 */

import type { KeywordData, KeywordResearchResult } from "./keyword-types";
import { loadDataForSEOApiKey } from "./api";

// Location and language code mappings
const LOCATION_CODES: Record<string, number> = {
  "United States": 2840,
  "United Kingdom": 2826,
  "Canada": 2124,
  "Australia": 2036,
  // Add more as needed
};

const LANGUAGE_CODES: Record<string, number> = {
  "en": 1000,
  "es": 1014,
  "fr": 1015,
  "de": 1011,
  // Add more as needed
};

/**
 * Calls MCP tool for keyword overview
 * Uses DataForSEO MCP tools directly via the MCP function interface
 */
export async function callMCPKeywordOverview(
  keywords: string[],
  location: string = "United States",
  language: string = "en"
): Promise<KeywordData[]> {
  const locationName = location;
  const languageCode = language;

  try {
    console.log('[MCP Service] Calling keyword overview for:', { keywords, locationName, languageCode });
    
    const { 
      mcp_DataForSEO_dataforseo_labs_google_keyword_overview,
      mcp_DataForSEO_dataforseo_labs_google_keyword_ideas 
    } = await import('@/lib/mcp-tools');
    
    // Try keyword overview first
    const result = await mcp_DataForSEO_dataforseo_labs_google_keyword_overview({
      keywords,
      location_name: locationName,
      language_code: languageCode,
    });
    
    console.log('[MCP Service] Raw result from API:', result);
    
    // Check if we got actual data (not just empty items)
    const hasData = result?.tasks?.some((task: any) => {
      if (task.result && Array.isArray(task.result)) {
        return task.result.some((item: any) => {
          // Check if we have keyword_info or items with data
          return item.keyword_info || (item.items && Array.isArray(item.items) && item.items.length > 0);
        });
      }
      return false;
    });
    
    // If no data from overview, try keyword_ideas as fallback
    if (!hasData && keywords.length > 0) {
      console.log('[MCP Service] No data from overview, trying keyword_ideas as fallback...');
      try {
        const ideasResult = await mcp_DataForSEO_dataforseo_labs_google_keyword_ideas({
          keywords,
          location_name: locationName,
          language_code: languageCode,
          limit: 10,
        });
        
        const ideasTransformed = transformMCPSemanticData(ideasResult);
        if (ideasTransformed.length > 0) {
          console.log('[MCP Service] Got data from keyword_ideas fallback:', ideasTransformed.length, 'results');
          return ideasTransformed;
        }
      } catch (ideasError) {
        console.warn('[MCP Service] Keyword ideas fallback failed:', ideasError);
      }
    }
    
    // Transform for compatibility with existing code
    const transformed = transformMCPKeywordData(result);
    
    console.log('[MCP Service] Transformed results:', transformed);
    
    // If still no data, return empty array (will be handled by caller)
    return transformed;
  } catch (error) {
    console.error("[MCP Service] Keyword overview error:", error);
    console.error("[MCP Service] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(
      `Failed to get keyword overview: ${error instanceof Error ? error.message : "Unknown error"}. ` +
      `Please ensure MCP server is configured with DataForSEO credentials.`
    );
  }
}

/**
 * Calls MCP tool for semantic keyword suggestions
 */
export async function callMCPSemanticKeywords(
  keyword: string,
  location: string = "United States",
  language: string = "en",
  limit: number = 20
): Promise<KeywordData[]> {
  const locationName = location;
  const languageCode = language;

  try {
    const { 
      mcp_DataForSEO_dataforseo_labs_google_keyword_ideas,
      mcp_DataForSEO_dataforseo_labs_google_related_keywords 
    } = await import('@/lib/mcp-tools');
    
    // Try keyword ideas first
    try {
      const result = await mcp_DataForSEO_dataforseo_labs_google_keyword_ideas({
        keywords: [keyword],
        location_name: locationName,
        language_code: languageCode,
        limit,
      });
      return transformMCPSemanticData(result);
    } catch (ideasError) {
      // Fallback to related keywords
      const result = await mcp_DataForSEO_dataforseo_labs_google_related_keywords({
        keyword,
        location_name: locationName,
        language_code: languageCode,
        limit,
      });
      return transformMCPSemanticData(result);
    }
  } catch (error) {
    console.error("MCP semantic keywords error:", error);
    throw new Error(
      `Failed to get semantic keywords: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Search intent function removed - using heuristics in classifySearchIntent instead
// Competitor analysis removed - keeping it simple, just keyword data

/**
 * Transform MCP API response to KeywordData format
 */
function transformMCPKeywordData(apiResponse: any): KeywordData[] {
  // Transform based on DataForSEO API response structure
  // Structure: tasks[].result[] where each result has { keyword, keyword_info }
  console.log('[Transform] Raw API response:', JSON.stringify(apiResponse, null, 2));
  
  if (!apiResponse?.tasks || !Array.isArray(apiResponse.tasks)) {
    console.warn('[Transform] No tasks array in response');
    return [];
  }

  const results: KeywordData[] = [];

  for (const task of apiResponse.tasks) {
    console.log('[Transform] Processing task:', {
      status_code: task.status_code,
      status_message: task.status_message,
      result_count: task.result_count,
      has_result: !!task.result,
      result_type: Array.isArray(task.result) ? 'array' : typeof task.result
    });
    
    // Check for errors first
    if (task.status_code && task.status_code !== 20000) {
      console.error('[Transform] Task error:', {
        status_code: task.status_code,
        status_message: task.status_message
      });
      continue;
    }
    
    if (task.result && Array.isArray(task.result)) {
      // DataForSEO keyword_overview returns: tasks[].result[] 
      // Each result item can have: { keyword, keyword_info } OR { items: [...] }
      for (const resultItem of task.result) {
        console.log('[Transform] Processing result item:', {
          has_keyword: !!resultItem.keyword,
          has_keyword_info: !!resultItem.keyword_info,
          has_items: !!resultItem.items,
          items_count: resultItem.items_count,
          item_keys: Object.keys(resultItem)
        });
        
        // Check if result has items array (when items_count > 0)
        if (resultItem.items && Array.isArray(resultItem.items) && resultItem.items.length > 0) {
          // Process items array
          for (const item of resultItem.items) {
            if (item.keyword_info) {
              const keywordInfo = item.keyword_info;
              const keywordData: KeywordData = {
                keyword: item.keyword || keywordInfo.keyword || "",
                difficulty: item.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
                searchVolume: keywordInfo.search_volume || 0,
                cpc: keywordInfo.cpc || 0,
                competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
                intent: 'informational' as const,
                relatedKeywords: [],
                serpFeatures: [],
              };
              results.push(keywordData);
            }
          }
        }
        // DataForSEO API structure: resultItem.keyword and resultItem.keyword_info (direct structure)
        else if (resultItem.keyword_info) {
          const keywordInfo = resultItem.keyword_info;
          const keywordData: KeywordData = {
            keyword: resultItem.keyword || keywordInfo.keyword || "",
            difficulty: resultItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
            searchVolume: keywordInfo.search_volume || 0,
            cpc: keywordInfo.cpc || 0,
            competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          };
          
          console.log('[Transform] Created keyword data:', keywordData);
          results.push(keywordData);
        } 
        // Handle case where items_count is 0 or items is null - no data available
        else if (resultItem.items_count === 0 || resultItem.items === null) {
          console.warn('[Transform] No keyword data available (items_count: 0 or items: null)');
          // Don't create empty entry - let fallback handle it
        }
        else if (resultItem.keyword) {
          // Fallback: if we have keyword but no keyword_info, create minimal entry
          console.warn('[Transform] Item has keyword but no keyword_info:', resultItem.keyword);
          results.push({
            keyword: resultItem.keyword,
            difficulty: 0,
            searchVolume: 0,
            cpc: 0,
            competition: 'LOW' as const,
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          });
        }
      }
    } else if (task.result && typeof task.result === 'object' && !Array.isArray(task.result)) {
      // Handle case where result is a single object, not an array
      console.log('[Transform] Result is single object, not array');
      const resultItem = task.result;
      
      if (resultItem.keyword_info) {
        const keywordInfo = resultItem.keyword_info;
        results.push({
          keyword: resultItem.keyword || keywordInfo.keyword || "",
          difficulty: resultItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
          searchVolume: keywordInfo.search_volume || 0,
          cpc: keywordInfo.cpc || 0,
          competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
          intent: 'informational' as const,
          relatedKeywords: [],
          serpFeatures: [],
        });
      }
    }
  }

  console.log('[Transform] Final results count:', results.length);
  
  if (results.length === 0) {
    console.warn('[Transform] No results extracted. Full response structure:', {
      has_tasks: !!apiResponse.tasks,
      tasks_count: apiResponse.tasks?.length,
      first_task: apiResponse.tasks?.[0] ? {
        status_code: apiResponse.tasks[0].status_code,
        status_message: apiResponse.tasks[0].status_message,
        result_count: apiResponse.tasks[0].result_count,
        has_result: !!apiResponse.tasks[0].result,
        result_type: typeof apiResponse.tasks[0].result,
        result_is_array: Array.isArray(apiResponse.tasks[0].result),
        result_keys: apiResponse.tasks[0].result ? Object.keys(apiResponse.tasks[0].result) : null,
        result_sample: apiResponse.tasks[0].result && Array.isArray(apiResponse.tasks[0].result) 
          ? apiResponse.tasks[0].result[0] 
          : apiResponse.tasks[0].result
      } : null
    });
  }
  
  return results;
}

/**
 * Transform MCP semantic keywords response (keyword_ideas endpoint)
 */
function transformMCPSemanticData(apiResponse: any): KeywordData[] {
  if (!apiResponse?.tasks || !Array.isArray(apiResponse.tasks)) {
    return [];
  }

  const results: KeywordData[] = [];

  for (const task of apiResponse.tasks) {
    if (task.status_code && task.status_code !== 20000) {
      console.error('[Transform Semantic] Task error:', {
        status_code: task.status_code,
        status_message: task.status_message
      });
      continue;
    }
    
    if (task.result && Array.isArray(task.result)) {
      for (const item of task.result) {
        // keyword_ideas returns items with keyword_data array
        if (item.keyword_data && Array.isArray(item.keyword_data)) {
          for (const keywordData of item.keyword_data) {
            results.push({
              keyword: keywordData.keyword || "",
              difficulty: keywordData.keyword_difficulty || keywordData.keyword_info?.keyword_difficulty || 0,
              searchVolume: keywordData.search_volume || keywordData.keyword_info?.search_volume || 0,
              cpc: keywordData.cpc || keywordData.keyword_info?.cpc || 0,
              competition: mapCompetitionLevel(keywordData.competition_level || keywordData.keyword_info?.competition_level || "LOW"),
              intent: 'informational' as const,
              relatedKeywords: [],
              serpFeatures: [],
            });
          }
        }
        // Alternative structure: keyword_data as object (not array)
        else if (item.keyword_data && typeof item.keyword_data === 'object') {
          const kd = item.keyword_data;
          results.push({
            keyword: kd.keyword || "",
            difficulty: kd.keyword_difficulty || kd.keyword_info?.keyword_difficulty || 0,
            searchVolume: kd.search_volume || kd.keyword_info?.search_volume || 0,
            cpc: kd.cpc || kd.keyword_info?.cpc || 0,
            competition: mapCompetitionLevel(kd.competition_level || kd.keyword_info?.competition_level || "LOW"),
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          });
        }
        // Also check for items array (similar to keyword_overview)
        else if (item.items && Array.isArray(item.items) && item.items.length > 0) {
          for (const subItem of item.items) {
            if (subItem.keyword_info) {
              const keywordInfo = subItem.keyword_info;
              results.push({
                keyword: subItem.keyword || keywordInfo.keyword || "",
                difficulty: subItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
                searchVolume: keywordInfo.search_volume || 0,
                cpc: keywordInfo.cpc || 0,
                competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
                intent: 'informational' as const,
                relatedKeywords: [],
                serpFeatures: [],
              });
            }
          }
        }
      }
    }
  }

  console.log('[Transform Semantic] Extracted', results.length, 'keyword results');
  return results;
}

/**
 * Transform MCP search intent response
 * DataForSEO API returns: item.keyword_intent.label and item.keyword_intent.probability
 */
function transformMCPIntentData(apiResponse: any): { keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[] {
  if (!apiResponse?.tasks || !Array.isArray(apiResponse.tasks)) {
    return [];
  }

  const results: { keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[] = [];

  for (const task of apiResponse.tasks) {
    if (task.result && Array.isArray(task.result)) {
      for (const item of task.result) {
        // DataForSEO API returns keyword_intent.label and keyword_intent.probability
        if (item.keyword && item.keyword_intent) {
          const intentLabel = item.keyword_intent.label || "informational";
          const probability = item.keyword_intent.probability || 0.5;
          
          results.push({
            keyword: item.keyword,
            intent: mapIntentType(intentLabel),
            probability: probability,
          });
        }
        // Fallback for older API format (if search_intent exists)
        else if (item.keyword && item.search_intent) {
          results.push({
            keyword: item.keyword,
            intent: mapIntentType(item.search_intent.intent || "informational"),
            probability: item.search_intent.probability || 0.5,
          });
        }
      }
    }
  }

  return results;
}

// Competitor analysis transformation removed - keeping it simple

/**
 * Map competition level string to our type
 */
function mapCompetitionLevel(level: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const upper = level.toUpperCase();
  if (upper.includes('HIGH') || upper.includes('VERY HIGH')) return 'HIGH';
  if (upper.includes('MEDIUM') || upper.includes('MODERATE')) return 'MEDIUM';
  return 'LOW';
}

/**
 * Map intent string to our type
 */
function mapIntentType(intent: string): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const lower = intent.toLowerCase();
  if (lower.includes('commercial')) return 'commercial';
  if (lower.includes('transactional') || lower.includes('transaction')) return 'transactional';
  if (lower.includes('navigational') || lower.includes('navigation')) return 'navigational';
  return 'informational';
}

/**
 * Calls page intersection API to find keywords that multiple pages rank for
 */
export async function callPageIntersection(
  pages: string[],
  location: string = "United States",
  language: string = "en",
  intersectionMode: 'intersect' | 'union' = 'intersect'
): Promise<any> {
  const MCP_API_BASE = import.meta.env.VITE_MCP_API_BASE || 
    (import.meta.env.DEV ? 'http://localhost:3001/api/mcp' : '/api/mcp');
  
  try {
    console.log('[Page Intersection] Calling API with:', { pages, location, language, intersectionMode });
    
    const response = await fetch(`${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_page_intersection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pages: pages,
        location_name: location,
        language_code: language,
        intersection_mode: intersectionMode,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Page Intersection] API error response:', errorText);
      throw new Error(`Page intersection API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('[Page Intersection] API response received');
    
    return result;
  } catch (error) {
    console.error('[Page Intersection] Error:', error);
    throw new Error(
      `Failed to get page intersection data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

