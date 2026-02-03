import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { analyzeTitleForOrigin } from "@/lib/wordpress-acf-origin";
import { extractEntityFromUrlSlug, generateLocalKeywordForEntityPage, selectBestKeywordForEntityPage } from "@/lib/content-optimization-helpers";
import { getResearchModel } from "@/lib/optimization-settings-storage";

// ============================================================================
// State Management Helpers
// ============================================================================

export function updateOptimizationProgress(
  setProgress: (prev: any) => any,
  key: string,
  step: string,
  progress: number,
  message?: string
) {
  setProgress((prev: any) => ({
    ...prev,
    [key]: { step, progress, message }
  }));
}

export function setOptimizingState(
  setIsOptimizing: (prev: any) => any,
  key: string,
  isOptimizing: boolean
) {
  setIsOptimizing((prev: any) => ({ ...prev, [key]: isOptimizing }));
}

export function clearOptimizationState(
  setIsOptimizing: (prev: any) => any,
  setProgress: (prev: any) => any,
  setPending: (prev: any) => any,
  key: string
) {
  setIsOptimizing((prev: any) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setProgress((prev: any) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setPending((prev: any) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimizationFileManager(
  setFileManagers: (prev: any) => any,
  key: string
) {
  setFileManagers((prev: any) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimization(
  setIsOptimizing: (prev: any) => any,
  setProgress: (prev: any) => any,
  setPending: (prev: any) => any,
  siteId: string
) {
  setIsOptimizing((prev: any) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setProgress((prev: any) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setPending((prev: any) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  
  // Clear site cache when optimization is manually cleared
  try {
    const { clearSiteCache } = require('@/lib/wordpress-site-cache');
    clearSiteCache(siteId);
    console.log(`[Optimize Content] Cleared site cache for ${siteId} (manual clear)`);
  } catch (cacheError) {
    console.warn('[Optimize Content] Error clearing cache:', cacheError);
  }
}

// ============================================================================
// Entity Extraction Helpers
// ============================================================================

export async function extractEntityFromTitle(
  title: string,
  apiKey: string
): Promise<string | 'N/A'> {
  if (!title || !title.trim()) return 'N/A';
  
  try {
    const entityFromTitle = await analyzeTitleForOrigin(title, apiKey);
    
    if (entityFromTitle && entityFromTitle.trim()) {
      const placeholderPatterns = [
        /^\[.*\]$/,  // Matches [city], [location], etc.
        /^<.*>$/,    // Matches <city>, <location>, etc.
        /^\{.*\}$/,  // Matches {city}, {location}, etc.
      ];
      const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(entityFromTitle.trim()));
      
      if (!isPlaceholder) {
        return entityFromTitle.trim();
      }
    }
  } catch (error) {
    console.warn('[Entity Extraction] Error extracting from title:', error);
  }
  
  return 'N/A';
}

export function extractEntityFromUrl(
  url: string,
  title?: string
): string | 'N/A' {
  if (!url) return 'N/A';
  
  try {
    const entityFromUrl = extractEntityFromUrlSlug(url, title);
    if (entityFromUrl && entityFromUrl.trim()) {
      return entityFromUrl.trim();
    }
  } catch (error) {
    console.warn('[Entity Extraction] Error extracting from URL:', error);
  }
  
  return 'N/A';
}

export async function determineEntity(
  hasEntityOverride: boolean | undefined,
  title: string,
  url: string,
  apiKey: string
): Promise<{ entity: string | 'N/A'; cleanedTitle: string }> {
  let extractedEntity: string | 'N/A' = 'N/A';
  let finalTitle = title;
  
  if (hasEntityOverride === false) {
    return { entity: 'N/A', cleanedTitle: finalTitle };
  }
  
  try {
    // Step 1: Extract from title using AI
    if (title && title.trim()) {
      extractedEntity = await extractEntityFromTitle(title, apiKey);
    }
    
    // Step 2: Fallback to URL extraction
    if (extractedEntity === 'N/A' && url) {
      extractedEntity = extractEntityFromUrl(url, title);
    }
    
    // Normalize
    if (!extractedEntity || extractedEntity.trim() === '' || extractedEntity === 'N/A') {
      extractedEntity = 'N/A';
    }
  } catch (error) {
    console.warn('[Entity Extraction] Error during extraction:', error);
    extractedEntity = 'N/A';
  }
  
  return { entity: extractedEntity, cleanedTitle: finalTitle };
}

// ============================================================================
// GSC Data Helpers
// ============================================================================

export function validateGSCData(gscResult: any): {
  hasValidData: boolean;
  primaryKeyword: string | null;
  isNoQueriesError: boolean;
} {
  const isNoQueriesError = gscResult.error && 
    typeof gscResult.error === 'string' && 
    gscResult.error.toLowerCase().includes('no valid search queries found');
  
  let hasValidGSCData = false;
  let primaryKeywordFromGSC: string | null = null;
  
  if (gscResult.success && gscResult.topKeyword) {
    if (gscResult.topKeyword.query !== 'Page-level aggregate' && 
        gscResult.topKeyword.query && 
        gscResult.topKeyword.query.trim().length > 0) {
      if (gscResult.queries && Array.isArray(gscResult.queries) && gscResult.queries.length > 0) {
        const keywordExists = gscResult.queries.some((q: any) => q.query === gscResult.topKeyword.query);
        if (keywordExists) {
          hasValidGSCData = true;
          primaryKeywordFromGSC = gscResult.topKeyword.query.trim();
        }
      }
    }
  }
  
  if (isNoQueriesError) {
    hasValidGSCData = false;
  }
  
  return {
    hasValidData: hasValidGSCData,
    primaryKeyword: primaryKeywordFromGSC,
    isNoQueriesError
  };
}

/**
 * Extract keyword from title ONLY using AI (for SEM tasks when no GSC data).
 * Analyzes the title to determine the primary search intent keyword.
 */
export async function extractKeywordFromTitleOnly(
  title: string,
  url: string,
  siteId: string
): Promise<string> {
  if (!title || !title.trim()) {
    // Fallback to URL slug
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
      const slug = pathSegments[pathSegments.length - 1] || 'content';
      return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch {
      return 'content optimization';
    }
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
      const researchModel = getResearchModel(siteId);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
          "X-Title": "Agent Blueprint Builder",
        },
        body: JSON.stringify({
          model: researchModel,
          messages: [
            {
              role: "user",
              content: `Analyze this page title and extract the primary search keyword that users would use to find this content:

Page Title: "${title.replace(/<[^>]+>/g, '').trim()}"
Page URL: "${url}"

Extract the main keyword phrase (2-5 words) that best represents what this page is about. Focus on the core topic, not generic terms.

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`
            },
          ],
          temperature: 0.3,
          max_tokens: 30,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiKeyword = data.choices?.[0]?.message?.content?.trim() || '';
        if (aiKeyword && aiKeyword.length > 2) {
          const cleaned = aiKeyword.replace(/^["']|["']$/g, '').trim().substring(0, 80);
          if (cleaned.length >= 3) {
            return cleaned;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Keyword Extraction] Failed to extract keyword from title via AI, falling back:', error);
  }
  
  // Fallback: Extract from title (remove HTML, take first meaningful phrase)
  const cleanTitle = title.replace(/<[^>]+>/g, '').trim();
  if (cleanTitle.length > 0) {
    // Take first 5-6 words as keyword
    const words = cleanTitle.split(/\s+/).slice(0, 6);
    return words.join(' ').substring(0, 80);
  }
  
  // Last resort: URL slug
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
    const slug = pathSegments[pathSegments.length - 1] || 'content';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  } catch {
    return 'content optimization';
  }
}

export async function extractKeywordFromContent(
  title: string,
  content: string,
  url: string,
  isEntityPage: boolean,
  siteName: string,
  siteId: string
): Promise<string> {
  let extractedKeyword = '';
  
  // For entity pages, use AI to generate keyword from title and URL
  if (isEntityPage && title) {
    try {
      const openRouterApiKey = loadApiKey();
      if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
        const researchModel = getResearchModel(siteId);
        extractedKeyword = await generateLocalKeywordForEntityPage(
          title,
          url,
          siteName,
          openRouterApiKey,
          researchModel
        );
        if (extractedKeyword && extractedKeyword.trim().length > 0) {
          return extractedKeyword.trim();
        }
      }
    } catch (error) {
      console.warn('[Keyword Extraction] Failed to generate AI keyword, falling back:', error);
    }
  }
  
  // Fallback: Extract from title or content
  if (!extractedKeyword || extractedKeyword.length < 3) {
    if (title && title.trim().length > 0) {
      extractedKeyword = title.trim()
        .replace(/<[^>]+>/g, '')
        .substring(0, 100);
    } else if (content && content.trim().length > 0) {
      const h2Match = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
      if (h2Match && h2Match[1]) {
        extractedKeyword = h2Match[1].replace(/<[^>]+>/g, '').trim().substring(0, 100);
      } else {
        const textContent = content.replace(/<[^>]+>/g, ' ').trim();
        extractedKeyword = textContent.split(/[.!?]/)[0].trim().substring(0, 100);
      }
    }
    
    if (!extractedKeyword || extractedKeyword.length < 3) {
      try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
        const slug = pathSegments[pathSegments.length - 1] || 'content';
        extractedKeyword = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      } catch {
        extractedKeyword = 'content optimization';
      }
    }
  }
  
  return extractedKeyword;
}

/**
 * Infer primary search keyword from title, meta description, and optional ACF keyword_focus
 * using Open Router research model. Used when GSC has no data and ACF keyword_focus is empty.
 */
export async function inferPrimaryKeywordFromTitleAndMeta(
  title: string,
  metaDescription: string | undefined,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  acfKeywordFocus?: string,
  promptModifier?: string
): Promise<string> {
  const cleanTitle = (title || '').replace(/<[^>]+>/g, '').trim();
  const meta = (metaDescription || excerpt || '').trim().substring(0, 300);
  const hint = (acfKeywordFocus || '').trim().substring(0, 100);
  const modifier = (promptModifier || '').trim().substring(0, 500);

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return '';

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifier) parts.push(`PROMPT MODIFIER (read first - defines what to prioritize): "${modifier}"`);
    parts.push(`Page Title: "${cleanTitle || '(none)'}"`, `Page URL: "${url}"`);
    if (meta) parts.push(`Meta description / excerpt: "${meta}"`);
    if (hint) parts.push(`Existing keyword focus hint: "${hint}"`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agent-blueprint-builder.com',
        'X-Title': 'Agent Blueprint Builder',
      },
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: 'user',
            content: `The PROMPT MODIFIER (when provided above) is the SOURCE OF TRUTH for what this company/site specializes in. Your keyword MUST be derived from and consistent with it.

${parts.join('\n')}

RULES:
- If a PROMPT MODIFIER is provided above, it is the SOURCE OF TRUTH. Derive the primary keyword from it. IGNORE the page title, FAQ, or any other page content that suggests a different topic. The modifier overrides everything.
- If no PROMPT MODIFIER is provided, use the meta description as the primary signal for the site's business, then the title. The keyword must reflect what the modifier or meta says the company does.
- Return a 2-5 word keyword phrase that matches the source of truth (modifier first, then meta).

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 30,
      }),
    });

    if (!response.ok) return '';

    const data = await response.json();
    const aiKeyword = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!aiKeyword || aiKeyword.length < 2) return '';

    const cleaned = aiKeyword.replace(/^["']|["']$/g, '').trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : '';
  } catch (error) {
    console.warn('[Keyword Inference] Failed to infer keyword from title/meta via AI:', error);
    return '';
  }
}

export function isNoQueriesError(error: any): boolean {
  if (!error) return false;
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.toLowerCase().includes('no valid search queries found');
}

// ============================================================================
// File Manager Helpers
// ============================================================================

export function savePostData(
  fileManager: OptimizationFileManager,
  post: any,
  postId: string | number
): void {
  const postDataForJson = post.fullData || post;
  const postDownloadFileName = OptimizationFileManager.generateFilename(
    'wordpress-post-download',
    postId.toString(),
    'json'
  );
  fileManager.addFile(
    postDownloadFileName,
    JSON.stringify(postDataForJson, null, 2),
    'application/json'
  );
}

export function saveGSCData(
  fileManager: OptimizationFileManager,
  gscResult: any,
  url: string,
  note?: string
): void {
  const gscFileName = OptimizationFileManager.generateFilename('gsc-data', url, 'json');
  const dataToSave = note ? { ...gscResult, note } : gscResult;
  fileManager.addFile(
    gscFileName,
    JSON.stringify(dataToSave, null, 2),
    'application/json'
  );
}

export function saveKeywordResearch(
  fileManager: OptimizationFileManager,
  keyword: string,
  data: {
    primaryKeyword: string;
    gscMetrics: any;
    keywordData: any;
    aiAnalysis: any;
    peopleAlsoAsk: any[];
    relatedGSCKeywords: string[];
    selectedKeywords: string[];
    selectedH2Sections: string[];
    selectedPeopleAlsoAsk?: any[];
    selectedResearchLinks?: any[];
  }
): void {
  const keywordResearchFileName = OptimizationFileManager.generateFilename('keyword-research', keyword, 'json');
  fileManager.addFile(
    keywordResearchFileName,
    JSON.stringify(data, null, 2),
    'application/json'
  );
}

export function saveSelectedKeyword(
  fileManager: OptimizationFileManager,
  keyword: string,
  selectedKeyword: any
): void {
  const selectedKeywordFileName = OptimizationFileManager.generateFilename('selected-keyword', keyword, 'json');
  fileManager.addFile(
    selectedKeywordFileName,
    JSON.stringify(selectedKeyword, null, 2),
    'application/json'
  );
}

// ============================================================================
// Error Handling Helpers
// ============================================================================

export function handleOptimizationError(
  error: any,
  siteId: string,
  setIsOptimizing: (prev: any) => any,
  setProgress: (prev: any) => any,
  setIsAnalyzing?: (prev: any) => any
): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during optimization';
  const isNoQueries = isNoQueriesError(error);
  
  if (isNoQueries) {
    setIsOptimizing((prev: any) => ({ ...prev, [siteId]: false }));
    if (setIsAnalyzing) {
      setIsAnalyzing((prev: any) => ({ ...prev, [siteId]: false }));
    }
    return;
  }
  
  try {
    setIsOptimizing((prev: any) => ({ ...prev, [siteId]: false }));
    setProgress((prev: any) => ({
      ...prev,
      [siteId]: { step: 'Error', progress: 0, message: errorMessage }
    }));
    if (setIsAnalyzing) {
      setIsAnalyzing((prev: any) => ({ ...prev, [siteId]: false }));
    }
  } catch (stateError) {
    console.error('[Optimization] Error updating error state:', stateError);
  }
  
  if (!isNoQueries) {
    toast.error(errorMessage, { duration: 5000 });
  }
}

// ============================================================================
// Progress Tracking Helpers
// ============================================================================

export function getStepProgress(step: string): number {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('fetch') || stepLower.includes('resolving')) return 10;
  if (stepLower.includes('gsc') || stepLower.includes('performance') || stepLower.includes('analyzing')) return 25;
  if (stepLower.includes('keyword') || stepLower.includes('research')) return 40;
  if (stepLower.includes('ai') || stepLower.includes('analysis')) return 55;
  if (stepLower.includes('blueprint') || stepLower.includes('checklist')) return 70;
  if (stepLower.includes('content') || stepLower.includes('generating')) return 85;
  if (stepLower.includes('upload') || stepLower.includes('updating')) return 95;
  if (stepLower.includes('complete')) return 100;
  return 0;
}

export function updateBulkProgress(
  setBulkState: (prev: any) => any,
  batchKey: string,
  url: string,
  step: string,
  progress: number,
  message?: string
): void {
  setBulkState((prev: any) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentStep: step,
        currentProgress: progress,
        currentStepProgress: {
          step,
          progress,
          message
        }
      }
    };
  });
}

// ============================================================================
// URL Resolution Helpers
// ============================================================================

export function subtypeToEndpoint(subtype?: string): string | undefined {
  const map: Record<string, string> = {
    post: 'posts',
    page: 'pages',
    'service-area': 'service-areas',
  };
  return subtype ? map[subtype] : undefined;
}

export function findEndpointFromSitemap(url: string, site: WordPressSite): string | undefined {
  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
    return undefined;
  }

  const urlPath = new URL(url).pathname.toLowerCase();

  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
    const sitemapFilename = sitemapUrl.split('/').pop() || '';
    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '').toLowerCase();
    
    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
      return endpoint;
    }
  }

  if (urlPath.includes('/page/') || urlPath.match(/^\/[^\/]+$/)) {
    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
      return 'pages';
    }
  }

  return undefined;
}

// ============================================================================
// Entity Page Keyword Selection
// ============================================================================

export async function selectBestKeywordForEntity(
  title: string,
  url: string,
  siteName: string,
  siteId: string,
  validQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number } | null> {
  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      return null;
    }
    
    const researchModel = getResearchModel(siteId);
    const geminiSelectedKeyword = await selectBestKeywordForEntityPage(
      title,
      url,
      siteName,
      validQueries,
      openRouterApiKey,
      researchModel
    );
    
    return geminiSelectedKeyword;
  } catch (error) {
    console.warn('[Entity Keyword Selection] Failed to use Gemini selection:', error);
    return null;
  }
}
