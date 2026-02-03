import Papa from 'papaparse';
import { sanitizeFileName } from './file-processing';
import { summarizeContentWithAI, type SummarizationOptions } from './content-summarizer';
import { getResearchModel } from './optimization-settings-storage';

export interface WikipediaChunk {
  title: string;
  section: string;
  text: string;
  url: string;
  revision_id?: number;
  timestamp?: string;
}

export interface WikipediaFetchOptions {
  summarizeWithAI?: boolean;
  openRouterApiKey?: string;
  onSummarizeProgress?: (message: string) => void;
}

/**
 * Sections to exclude from Wikipedia content (non-semantic)
 */
const EXCLUDED_SECTIONS = [
  'References',
  'External links',
  'Further reading',
  'See also',
  'Notes',
  'Bibliography',
  'Sources',
  'Citations',
];

/**
 * Checks if a Wikipedia page exists for an entity (lightweight check, no content fetch)
 * @param entity - The Wikipedia entity/title to check
 * @param retries - Number of retry attempts (default: 3)
 * @returns Promise resolving to object with exists flag and Wikipedia URL if found
 */
export async function checkWikipediaPageExists(
  entity: string,
  retries: number = 3
): Promise<{ exists: boolean; url?: string; title?: string }> {
  if (!entity || !entity.trim()) {
    return { exists: false };
  }

  const entityName = entity.trim();
  
  // Build Wikipedia API URL - just check if page exists
  const params = new URLSearchParams({
    action: 'query',
    prop: 'info',
    titles: entityName,
    redirects: '1', // Follow redirects
    format: 'json',
    formatversion: '2',
    utf8: '1',
    origin: '*',
  });

  const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

  let lastError: Error | null = null;
  let attempts = 0;
  
  while (attempts < retries) {
    try {
      attempts++;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        // Retry on server errors (5xx), but not on client errors (4xx)
        if (response.status >= 500 && attempts < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          continue;
        }
        console.warn(`[Wikipedia API] HTTP error ${response.status} for "${entityName}"`);
        return { exists: false };
      }

      const data = await response.json();

      if (!data.query) {
        console.warn(`[Wikipedia API] No query in response for "${entityName}"`);
        return { exists: false };
      }

      if (!data.query.pages || data.query.pages.length === 0) {
        console.warn(`[Wikipedia API] No pages in response for "${entityName}"`);
        return { exists: false };
      }

      const page = data.query.pages[0];
      
      // Check if page exists (not missing)
      if (page.missing !== undefined) {
        console.log(`[Wikipedia API] Page missing for "${entityName}"`);
        return { exists: false };
      }

      // Page exists - return URL
      const title = page.title || entityName;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      
      console.log(`[Wikipedia API] ✓ Page exists for "${entityName}": ${url}`);
      return { exists: true, url, title };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Retry on network errors
      if (attempts < retries) {
        console.warn(`[Wikipedia API] Error checking page existence for "${entityName}" (attempt ${attempts}/${retries}), retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        continue;
      }
      
      console.warn(`[Wikipedia API] Error checking page existence for "${entityName}" after ${attempts} attempts:`, lastError);
      return { exists: false };
    }
  }
  
  return { exists: false };
}

/** Result for one candidate in batch exists check (agentic wiki research) */
export interface ValidatedEntityResult {
  entity: string;
  exists: boolean;
  url?: string;
  title?: string;
}

const WIKI_BATCH_SIZE = 50;

/**
 * Batch-check Wikipedia page existence for many entities (agentic wiki research).
 * Uses action=query with pipe-separated titles. Returns one result per candidate.
 */
export async function validateEntitiesExist(
  candidates: string[]
): Promise<ValidatedEntityResult[]> {
  if (!candidates || candidates.length === 0) return [];
  const trimmed = candidates.map((c) => c.trim()).filter((c) => c.length > 0);
  const results: ValidatedEntityResult[] = [];
  for (let i = 0; i < trimmed.length; i += WIKI_BATCH_SIZE) {
    const batch = trimmed.slice(i, i + WIKI_BATCH_SIZE);
    const titlesParam = batch.join('|');
    const params = new URLSearchParams({
      action: 'query',
      prop: 'info',
      titles: titlesParam,
      redirects: '1',
      format: 'json',
      formatversion: '2',
      utf8: '1',
      origin: '*',
    });
    const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (!data.query?.pages) continue;
      const pages = data.query.pages as Array<{ title?: string; missing?: boolean }>;
      const existingByTitle = new Map<string, { url: string; title: string }>();
      for (const p of pages) {
        if (p.missing === undefined && p.title) {
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s+/g, '_'))}`;
          existingByTitle.set(p.title.toLowerCase(), { url, title: p.title });
        }
      }
      for (const entity of batch) {
        const key = entity.toLowerCase();
        const found = existingByTitle.get(key);
        if (found) {
          results.push({ entity, exists: true, url: found.url, title: found.title });
          existingByTitle.delete(key);
        } else {
          results.push({ entity, exists: false });
        }
      }
    } catch (err) {
      console.warn('[Wikipedia API] Batch exists error:', err);
      for (const entity of batch) {
        results.push({ entity, exists: false });
      }
    }
  }
  return results;
}

/**
 * Wikipedia category discovery is AI-only (entity layer). No pattern matching, no search, no logs.
 */
export async function getWikipediaCategoryPages(_area: string, _modifier?: string): Promise<string[]> {
  return [];
}

/**
 * Search Wikipedia for pages matching a query
 * @param query - Search query (e.g., "buildings in Edmonton")
 * @returns Promise resolving to array of page titles
 */
export async function searchWikipediaPages(query: string): Promise<string[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query.trim(),
    srlimit: '50',
    format: 'json',
    formatversion: '2',
    utf8: '1',
    origin: '*',
  });

  const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (data.query && data.query.search) {
      return data.query.search.map((result: any) => result.title);
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error searching Wikipedia for "${query}":`, error);
  }

  return [];
}

export interface GetPagesInCategoryOptions {
  /** Max articles to return (default 500). Uses continue to fetch more. */
  limit?: number;
  /** If true, only return main-namespace pages (articles), not subcategories/files. */
  pageOnly?: boolean;
}

/**
 * Gets pages in a Wikipedia category (articles only by default, with pagination).
 * @param categoryTitle - The category title (e.g. "Category:Neighbourhoods_in_Winnipeg")
 * @param options - Optional limit and pageOnly (cmtype=page, filter ns=0)
 * @returns Promise resolving to array of page titles in the category
 */
export async function getPagesInCategory(
  categoryTitle: string,
  options: GetPagesInCategoryOptions = {}
): Promise<string[]> {
  const { limit = 500, pageOnly = true } = options;
  const pageLimit = Math.min(500, Math.max(1, limit));
  const allTitles: string[] = [];
  let cmcontinue: string | undefined;

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: categoryTitle,
      cmlimit: String(pageLimit),
      format: 'json',
      formatversion: '2',
      utf8: '1',
      origin: '*',
    });
    if (pageOnly) {
      params.set('cmtype', 'page');
    }
    if (cmcontinue) {
      params.set('cmcontinue', cmcontinue);
    }

    const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
      });

      if (!response.ok) break;

      const data = await response.json();
      const members = data.query?.categorymembers ?? [];
      for (const member of members) {
        if (pageOnly && member.ns !== undefined && member.ns !== 0) continue;
        if (member.title) allTitles.push(member.title);
      }
      if (allTitles.length >= limit) break;
      cmcontinue = data.continue?.cmcontinue;
    } catch (error) {
      console.warn(`[Wikipedia API] Error getting pages in category "${categoryTitle}":`, error);
      break;
    }
  } while (cmcontinue);

  return allTitles.slice(0, limit);
}

/**
 * Gets links from a Wikipedia page (for any page type - entity or list)
 * @param pageTitle - The Wikipedia page title
 * @param options - Optional limit and filters
 * @returns Promise resolving to array of linked page titles
 */
export async function getLinksFromWikipediaPage(
  pageTitle: string,
  options: { limit?: number; filterNamespaces?: boolean } = {}
): Promise<string[]> {
  const { limit = 500, filterNamespaces = true } = options;
  
  if (!pageTitle || !pageTitle.trim()) {
    return [];
  }

  const pageTitleTrimmed = pageTitle.trim();
  let allLinks: string[] = [];
  let plcontinue: string | undefined;

  do {
    const linksParams = new URLSearchParams({
      action: 'query',
      prop: 'links',
      titles: pageTitleTrimmed,
      pllimit: '500',
      format: 'json',
      formatversion: '2',
      utf8: '1',
      origin: '*',
    });

    if (plcontinue) {
      linksParams.set('plcontinue', plcontinue);
    }

    const linksApiUrl = `https://en.wikipedia.org/w/api.php?${linksParams.toString()}`;

    try {
      const linksResponse = await fetch(linksApiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!linksResponse.ok) {
        break;
      }

      const linksData = await linksResponse.json();
      if (linksData.query?.pages && linksData.query.pages.length > 0) {
        const page = linksData.query.pages[0];
        if (page.links && Array.isArray(page.links)) {
          const pageLinks = page.links
            .map((link: any) => link.title)
            .filter((title: string) => {
              if (!title || title.trim().length === 0) return false;
              // Filter out non-entity links if requested
              if (filterNamespaces) {
                if (title.includes(':')) {
                  // Allow "List of" but filter other namespaces
                  if (!title.startsWith('List of')) return false;
                }
                // Filter out very short or very long titles
                if (title.length < 3 || title.length > 100) return false;
                // Filter out common Wikipedia meta pages
                const lower = title.toLowerCase();
                if (lower.includes('disambiguation') || 
                    lower.includes('category:') ||
                    lower.includes('template:') ||
                    lower.includes('file:') ||
                    lower.includes('help:')) return false;
              }
              return true;
            });
          
          allLinks.push(...pageLinks);
        }
      }
      
      plcontinue = linksData.continue?.plcontinue;
      if (allLinks.length >= limit) break;
    } catch (error) {
      console.warn(`[Wikipedia API] Error getting links from "${pageTitleTrimmed}":`, error);
      break;
    }
  } while (plcontinue);

  return allLinks.slice(0, limit);
}

/**
 * Extracts list items from a Wikipedia list page
 * @param pageTitle - The Wikipedia page title
 * @returns Promise resolving to array of entity names extracted from the list
 */
export async function extractEntitiesFromWikipediaList(pageTitle: string): Promise<string[]> {
  // First, try to get internal links (these are often the list items)
  const linksParams = new URLSearchParams({
    action: 'query',
    prop: 'links',
    titles: pageTitle,
    pllimit: '500',
    format: 'json',
    formatversion: '2',
    utf8: '1',
    origin: '*',
  });

  const linksApiUrl = `https://en.wikipedia.org/w/api.php?${linksParams.toString()}`;

  try {
    const linksResponse = await fetch(linksApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors',
    });

    if (linksResponse.ok) {
      const linksData = await linksResponse.json();
      if (linksData.query && linksData.query.pages && linksData.query.pages.length > 0) {
        const page = linksData.query.pages[0];
        if (page.links && page.links.length > 0) {
          // Extract link titles (these are often the neighborhood/entity names)
          const entities = page.links
            .map((link: any) => link.title)
            .filter((title: string) => {
              // Filter out non-entity links (like "Category:", "File:", "Template:", etc.)
              if (title.includes(':') && !title.startsWith('List of')) return false;
              // Filter out very short or very long titles
              if (title.length < 3 || title.length > 100) return false;
              // Filter out common Wikipedia meta pages
              if (title.toLowerCase().includes('disambiguation') || 
                  title.toLowerCase().includes('category:') ||
                  title.toLowerCase().includes('template:')) return false;
              return true;
            });
          
          if (entities.length > 0) {
            console.log(`[Wikipedia API] Extracted ${entities.length} entities from links`);
            return entities.slice(0, 200); // Limit to first 200
          }
        }
      }
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error getting links from "${pageTitle}":`, error);
  }

  // Fallback: Try to extract from page content using extracts
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    titles: pageTitle,
    explaintext: '1',
    exsectionformat: 'plain',
    format: 'json',
    formatversion: '2',
    utf8: '1',
    origin: '*',
  });

  const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors',
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (data.query && data.query.pages && data.query.pages.length > 0) {
      const page = data.query.pages[0];
      const extract = page.extract || '';
      
      if (!extract) {
        console.warn(`[Wikipedia API] No extract content for "${pageTitle}"`);
        return [];
      }

      console.log(`[Wikipedia API] Extracting from text content (${extract.length} chars)`);
      
      // Extract list items using multiple patterns
      const lines = extract.split('\n');
      const entities: string[] = [];
      const seen = new Set<string>();
      
      for (const line of lines) {
        // Pattern 1: Bullet points with * or -
        let match = line.match(/^[\*\•\-\u2022]\s+(.+?)(?:\s*[\(\[]|$)/);
        if (!match) {
          // Pattern 2: Numbered lists
          match = line.match(/^\d+[\.\)]\s+(.+?)(?:\s*[\(\[]|$)/);
        }
        if (!match) {
          // Pattern 3: Lines starting with capital letters (potential neighborhood names)
          match = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s*[\(\[,;]|$)/);
        }
        if (!match) {
          // Pattern 4: Lines with [[links]]
          match = line.match(/\[\[([^\|\]]+)(?:\|[^\]]+)?\]\]/);
        }
        
        if (match) {
          let entity = match[1].trim();
          
          // Clean up common Wikipedia formatting
          entity = entity
            .replace(/\[\[([^\|\]]+)(?:\|[^\]]+)?\]\]/g, '$1') // Remove [[links|display text]]
            .replace(/'''([^']+)'''/g, '$1') // Remove bold
            .replace(/''([^']+)''/g, '$1') // Remove italic
            .replace(/\([^)]*\)/g, '') // Remove parenthetical notes
            .replace(/\[.*?\]/g, '') // Remove any remaining brackets
            .replace(/^\d+[\.\)]\s*/, '') // Remove leading numbers
            .replace(/^[\*\•\-\u2022]\s*/, '') // Remove leading bullets
            .trim();
          
          // Additional cleanup
          entity = entity.split(/[,\[\(;]/)[0].trim(); // Take first part before comma/bracket
          
          if (entity.length > 2 && entity.length < 100 && !seen.has(entity.toLowerCase())) {
            // Filter out common non-entity words
            const lower = entity.toLowerCase();
            if (!lower.match(/^(the|a|an|and|or|of|in|on|at|for|with|from|to|by|as|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can)$/)) {
              entities.push(entity);
              seen.add(entity.toLowerCase());
            }
          }
        }
      }
      
      console.log(`[Wikipedia API] Extracted ${entities.length} entities from text content`);
      return entities.slice(0, 200); // Limit to first 200
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error extracting entities from "${pageTitle}":`, error);
  }

  return [];
}

/**
 * Fetches Wikipedia content for an entity using the extracts API
 * @param entity - The Wikipedia entity/title to fetch
 * @param options - Optional configuration including AI summarization
 * @param retries - Number of retry attempts (default: 3)
 * @returns Promise resolving to array of chunks with cleaned content
 */
export async function fetchWikipediaContent(
  entity: string,
  options?: WikipediaFetchOptions,
  retries: number = 3
): Promise<WikipediaChunk[]> {
  if (!entity || !entity.trim()) {
    throw new Error('Entity cannot be empty');
  }

  const entityName = entity.trim();
  console.log('[Wikipedia API] Fetching content for entity:', entityName);

  // Build Wikipedia API URL with optimal parameters
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1', // Plain text, no HTML
    exsectionformat: 'wiki', // Preserves section boundaries
    titles: entityName,
    redirects: '1', // Follow redirects
    format: 'json',
    formatversion: '2', // Cleaner JSON structure
    utf8: '1', // UTF-8 encoding
    origin: '*', // CORS helper
  });

  const apiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  console.log('[Wikipedia API] Request URL:', apiUrl);

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < retries) {
    try {
      attempts++;
      console.log(`[Wikipedia API] Starting fetch request (attempt ${attempts}/${retries})...`);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
      });
      
      console.log('[Wikipedia API] Response status:', response.status, response.statusText);

      if (!response.ok) {
        // Retry on server errors (5xx), but not on client errors (4xx)
        if (response.status >= 500 && attempts < retries) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          console.warn(`[Wikipedia API] Server error ${response.status}, retrying... (attempt ${attempts}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          continue;
        }
        
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error('[Wikipedia API] Error response body:', errorText);
        throw new Error(`Wikipedia API HTTP error: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`);
      }

      const contentType = response.headers.get('content-type');
    console.log('[Wikipedia API] Content-Type:', contentType);

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[Wikipedia API] Non-JSON response:', text.substring(0, 500));
      throw new Error(`Expected JSON response but got: ${contentType}. Response: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('[Wikipedia API] Response data structure:', {
      hasQuery: !!data.query,
      hasPages: !!(data.query?.pages),
      pagesLength: data.query?.pages?.length || 0,
      keys: Object.keys(data),
    });

    // Check if query was successful
    if (!data.query) {
      console.error('[Wikipedia API] No query in response:', data);
      throw new Error(`Invalid Wikipedia API response: missing 'query' field. Response keys: ${Object.keys(data).join(', ')}`);
    }

    if (!data.query.pages || data.query.pages.length === 0) {
      console.error('[Wikipedia API] No pages in query:', data.query);
      throw new Error(`No Wikipedia page found for "${entityName}". Try a different search term.`);
    }

    const page = data.query.pages[0];
    console.log('[Wikipedia API] Page data:', {
      pageId: page.pageid,
      title: page.title,
      missing: page.missing,
      hasExtract: !!page.extract,
      extractLength: page.extract?.length || 0,
    });

    // Check if page is missing
    if (page.missing) {
      throw new Error(`Wikipedia page not found: "${entityName}". The page may not exist or the name may be incorrect.`);
    }

    const title = page.title;
    const extract = page.extract || '';
    const pageId = page.pageid;
    const revisionId = page.revisions?.[0]?.revid;
    
    // Build Wikipedia URL
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    console.log('[Wikipedia API] Built Wikipedia URL:', wikiUrl);

    if (!extract) {
      throw new Error(`No content found for "${entityName}". The page exists but has no extractable content.`);
    }

      console.log('[Wikipedia API] Processing extract, length:', extract.length);
      // Process and chunk the content
      const chunks = await processWikipediaExtract(title, extract, wikiUrl, revisionId, options);
      console.log('[Wikipedia API] Generated', chunks.length, 'chunks');

      return chunks;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Retry on network errors
      if (attempts < retries) {
        console.warn(`[Wikipedia API] Fetch error (attempt ${attempts}/${retries}), retrying...`, {
          error: lastError.message,
          entityName,
        });
        
        // Handle network errors specifically
        if (lastError instanceof TypeError && lastError.message.includes('fetch')) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          continue;
        }
        
        // Retry on other errors too (might be transient)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        continue;
      }
      
      // Final attempt failed
      console.error('[Wikipedia API] Fetch error details:', {
        error: lastError,
        errorType: lastError instanceof Error ? lastError.constructor.name : typeof lastError,
        errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
        errorStack: lastError instanceof Error ? lastError.stack : undefined,
        attempts,
      });

      // Handle network errors specifically
      if (lastError instanceof TypeError && lastError.message.includes('fetch')) {
        throw new Error(`Network error: Unable to connect to Wikipedia API after ${attempts} attempts. This may be a CORS issue or network problem. Error: ${lastError.message}`);
      }

      // Handle CORS errors
      if (lastError instanceof Error && (lastError.message.includes('CORS') || lastError.message.includes('cross-origin'))) {
        throw new Error(`CORS error: Wikipedia API may not allow requests from this origin. Error: ${lastError.message}`);
      }

      // Re-throw with context
      if (lastError instanceof Error) {
        throw new Error(`Failed to fetch Wikipedia content for "${entityName}" after ${attempts} attempts: ${lastError.message}`);
      }
      throw new Error(`Failed to fetch Wikipedia content for "${entityName}" after ${attempts} attempts: ${String(lastError)}`);
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw new Error(`Failed to fetch Wikipedia content for "${entityName}" after ${retries} attempts`);
}

/**
 * Processes Wikipedia extract text into chunks
 * Removes references, excludes non-semantic sections, and chunks by section
 * Optionally applies AI summarization to each chunk while preserving URLs
 */
async function processWikipediaExtract(
  title: string,
  extract: string,
  url: string,
  revisionId?: number,
  options?: WikipediaFetchOptions
): Promise<WikipediaChunk[]> {
  const chunks: WikipediaChunk[] = [];
  
  // Split by sections (Wikipedia format uses == for level 2 headings)
  const sections = extract.split(/\n(?==+\s)/);
  
  // Process introduction (first section before any == heading)
  if (sections.length > 0) {
    const introMatch = extract.match(/^([^=]+?)(?=\n==|\n$)/s);
    if (introMatch && introMatch[1].trim()) {
      let introText = cleanText(introMatch[1].trim());
      if (introText.length > 50) { // Only include substantial introductions
        // Apply AI summarization if requested
        if (options?.summarizeWithAI && options?.openRouterApiKey && introText.trim().length > 200) {
          try {
            const summarizationOptions: SummarizationOptions = {
              apiKey: options.openRouterApiKey,
              model: "google/gemini-2.5-flash-lite",
              temperature: 0.7,
              maxTokens: 4000,
              topP: 0.9,
              onProgress: (message) => {
                options.onSummarizeProgress?.(`Introduction: ${message}`);
              },
            };
            
            options.onSummarizeProgress?.(`Analyzing introduction section...`);
            const result = await summarizeContentWithAI(introText, summarizationOptions);
            introText = result.summarizedContent;
          } catch (error) {
            console.error(`[Wikipedia API] Error summarizing introduction:`, error);
            // Fallback to original content on error
          }
        }
        
        chunks.push({
          title,
          section: 'Introduction',
          text: introText,
          url,
          revision_id: revisionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    // Extract section title (between == markers)
    const titleMatch = section.match(/^==+\s*(.+?)\s*==+\s*\n?(.*)/s);
    if (!titleMatch) continue;

    const sectionTitle = titleMatch[1].trim();
    let sectionContent = titleMatch[2] || '';

    // Skip excluded sections
    if (EXCLUDED_SECTIONS.some(excluded => 
      sectionTitle.toLowerCase().includes(excluded.toLowerCase())
    )) {
      continue;
    }

    // Clean the section content
    sectionContent = cleanText(sectionContent);

    if (!sectionContent || sectionContent.length < 50) {
      continue; // Skip very short sections
    }

    // Chunk by paragraphs if section is too long
    const sectionChunks = chunkByParagraphs(sectionContent, 300, 500);
    
    for (const chunkText of sectionChunks) {
      let finalChunkText = chunkText;
      
      // Apply AI summarization if requested
      if (options?.summarizeWithAI && options?.openRouterApiKey && chunkText.trim().length > 200) {
        try {
          const summarizationOptions: SummarizationOptions = {
            apiKey: options.openRouterApiKey,
            model: "google/gemini-2.5-flash-lite",
            temperature: 0.7,
            maxTokens: 4000,
            topP: 0.9,
            onProgress: (message) => {
              options.onSummarizeProgress?.(`${sectionTitle}: ${message}`);
            },
          };
          
          options.onSummarizeProgress?.(`Analyzing section "${sectionTitle}"...`);
          const result = await summarizeContentWithAI(chunkText, summarizationOptions);
          finalChunkText = result.summarizedContent;
        } catch (error) {
          console.error(`[Wikipedia API] Error summarizing chunk in section "${sectionTitle}":`, error);
          // Fallback to original content on error
        }
      }
      
      chunks.push({
        title,
        section: sectionTitle,
        text: finalChunkText,
        url,
        revision_id: revisionId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // If no sections were found, process entire extract as one chunk
  if (chunks.length === 0) {
    const cleanedText = cleanText(extract);
    if (cleanedText.length > 50) {
      const textChunks = chunkByParagraphs(cleanedText, 300, 500);
      for (const chunkText of textChunks) {
        let finalChunkText = chunkText;
        
        // Apply AI summarization if requested
        if (options?.summarizeWithAI && options?.openRouterApiKey && chunkText.trim().length > 200) {
          try {
            const summarizationOptions: SummarizationOptions = {
              apiKey: options.openRouterApiKey,
              model: "google/gemini-2.5-flash-lite",
              temperature: 0.7,
              maxTokens: 4000,
              topP: 0.9,
              onProgress: (message) => {
                options.onSummarizeProgress?.(`Overview: ${message}`);
              },
            };
            
            options.onSummarizeProgress?.(`Analyzing overview section...`);
            const result = await summarizeContentWithAI(chunkText, summarizationOptions);
            finalChunkText = result.summarizedContent;
          } catch (error) {
            console.error(`[Wikipedia API] Error summarizing overview chunk:`, error);
            // Fallback to original content on error
          }
        }
        
        chunks.push({
          title,
          section: 'Overview',
          text: finalChunkText,
          url,
          revision_id: revisionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return chunks;
}

/**
 * Cleans Wikipedia text by removing references and normalizing whitespace
 */
function cleanText(text: string): string {
  return text
    // Remove reference markers like [1], [2], [citation needed]
    .replace(/\[\d+\]/g, '')
    .replace(/\[citation needed\]/gi, '')
    .replace(/\[who\]/gi, '')
    .replace(/\[when\]/gi, '')
    .replace(/\[where\]/gi, '')
    .replace(/\[clarification needed\]/gi, '')
    .replace(/\[.*?\]/g, '') // Remove any remaining bracketed references
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
    .trim();
}

/**
 * Chunks text by paragraphs, aiming for target token range
 * Uses approximate token count (4 chars per token)
 */
function chunkByParagraphs(text: string, minTokens: number = 300, maxTokens: number = 500): string[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const paragraphTokens = Math.ceil(paragraph.length / 4);
    const currentTokens = Math.ceil(currentChunk.length / 4);

    // If adding this paragraph would exceed max, save current chunk
    if (currentChunk && currentTokens + paragraphTokens > maxTokens) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      // Add paragraph to current chunk
      currentChunk = currentChunk 
        ? `${currentChunk}\n\n${paragraph}` 
        : paragraph;
    }
  }

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If chunks are too small, merge them
  const mergedChunks: string[] = [];
  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(chunk.length / 4);
    if (chunkTokens < minTokens && mergedChunks.length > 0) {
      // Merge with previous chunk if it's too small
      mergedChunks[mergedChunks.length - 1] += `\n\n${chunk}`;
    } else {
      mergedChunks.push(chunk);
    }
  }

  return mergedChunks.length > 0 ? mergedChunks : [text]; // Fallback to original if empty
}

/**
 * Extracts structured data from Wikipedia content using AI based on criteria
 * @param entity - The entity name
 * @param criteria - The criteria to extract data for (e.g., "high income", "south edmonton")
 * @param openRouterApiKey - OpenRouter API key for AI extraction
 * @returns Promise resolving to structured data object
 */
export async function extractStructuredDataFromWikipedia(
  entity: string,
  criteria: string,
  openRouterApiKey: string
): Promise<Record<string, any>> {
  try {
    // Fetch Wikipedia content for the entity
    const chunks = await fetchWikipediaContent(entity);
    const fullContent = chunks.map(chunk => chunk.text).join('\n\n').substring(0, 8000); // Limit content length

    // Use AI to extract structured data based on criteria
    const extractionPrompt = `Extract relevant structured data from this Wikipedia content about "${entity}" based on the criteria: "${criteria}"

Wikipedia content:
${fullContent}

Criteria: "${criteria}"

IMPORTANT: Extract whatever data is available, even if incomplete. If specific data isn't found, make reasonable inferences based on available information (e.g., if a neighborhood is mentioned as affluent/upscale, infer higher income).

Extract the following types of data based on the criteria:
- If criteria mentions income/wealth: extract median income, household income, per capita income, economic indicators, or infer from descriptions (e.g., "affluent", "upscale", "wealthy" = high income)
- If criteria mentions location/direction (north, south, east, west): extract geographic location, coordinates, region, or infer from context
- If criteria mentions size: extract population, area, size metrics
- If criteria mentions demographics: extract demographic data, age distribution, education levels
- If criteria mentions other attributes: extract relevant statistics and data points, or infer from descriptions

For "matches": 
- Return true if the entity could reasonably match the criteria based on available data or context
- Return false only if there's strong evidence it doesn't match (e.g., explicitly says "low income" when looking for "high income")
- If data is unavailable but context suggests it might match, return true with lower confidence

Return a JSON object with:
{
  "matches": true/false (true if entity could match criteria, false only if strong evidence it doesn't),
  "confidence": 0-100 (confidence score based on data quality and specificity),
  "extractedData": {
    // Key-value pairs of extracted data (e.g., "medianIncome": 75000, "location": "south", "population": 50000, "description": "affluent neighborhood")
  },
  "rankingValue": number (numeric value for sorting - use extracted value if available, or estimate based on context)
}

Return ONLY valid JSON, no explanations.`;

    // Import streamChatCompletion dynamically to avoid circular dependency
    const { streamChatCompletion } = await import('./api');
    
    let extractionResponse = '';
    await streamChatCompletion({
      apiKey: openRouterApiKey,
      model: getResearchModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a data extraction expert. Extract structured data from Wikipedia content based on specific criteria. Return only valid JSON objects.'
        },
        {
          role: 'user',
          content: extractionPrompt
        }
      ],
      temperature: 0.3,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        extractionResponse += chunk;
      }
    });

    extractionResponse = extractionResponse.trim();
    extractionResponse = extractionResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    
    try {
      const extractedData = JSON.parse(extractionResponse);
      return extractedData;
    } catch (parseError) {
      console.warn(`[Wikipedia API] Failed to parse extraction response for "${entity}":`, parseError);
      // Return default structure if parsing fails
      return {
        matches: false,
        confidence: 0,
        extractedData: {},
        rankingValue: 0
      };
    }
  } catch (error) {
    console.warn(`[Wikipedia API] Error extracting structured data for "${entity}":`, error);
    return {
      matches: false,
      confidence: 0,
      extractedData: {},
      rankingValue: 0
    };
  }
}

/**
 * Generates CSV content from Wikipedia chunks
 * Format: title,url,content (where content includes section context)
 */
export function generateWikipediaCSV(chunks: WikipediaChunk[]): string {
  if (chunks.length === 0) {
    throw new Error('No chunks to convert to CSV');
  }

  // Prepare data rows
  const rows = chunks.map(chunk => [
    chunk.title,
    chunk.url,
    chunk.section !== 'Introduction' && chunk.section !== 'Overview'
      ? `${chunk.section} - ${chunk.text}`
      : chunk.text
  ]);

  // Use PapaParse to generate CSV with proper escaping
  const csv = Papa.unparse({
    fields: ['title', 'url', 'content'],
    data: rows,
  });

  return csv;
}

