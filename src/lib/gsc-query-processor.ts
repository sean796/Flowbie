import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { getRecommendedKeywordFromGSC, isBlocklistedPrimaryKeyword, deriveKeywordFromModifier, firstNonBlocklistedQuery, isPrimaryKeywordFromGSC, bestGSCQueryForInvalidKeyword } from "@/lib/gsc-simple-keyword-recommendation";
import { type WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "./optimization-settings-storage";

/**
 * Unified AI-forward query filtering and ranking
 * Acts as a local SEO expert, making all filtering and ranking decisions in one pass
 */
export async function filterAndRankQueriesWithAI(
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  pageUrl: string,
  apiKey: string,
  model: string,
  companyName?: string
): Promise<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  if (!queries || queries.length === 0) return queries;

  const companyNameLower = companyName?.toLowerCase().trim() || '';
  const context = pageUrl ? `page "${pageUrl}"` : 'this site';
  
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    batches.push(queries.slice(i, i + batchSize));
  }

  const results = await Promise.all(batches.map(async (batch) => {
    const queriesList = batch.map((q, idx) => 
      `${idx + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || 'N/A'}`
    ).join('\n');

    const prompt = `You are a local SEO expert. Analyze these GSC queries for ${context}${companyNameLower ? ` (company: "${companyNameLower}")` : ''}.

Filter and rank these queries. Return JSON array of query numbers to KEEP, ordered by SEO value (best first).

Consider:
- English only
- Service/product keywords (not competitor business names${companyNameLower ? ` or "${companyNameLower}" queries` : ''})
- Traffic potential (impressions, clicks, position)
- Relevance to content

Queries:
${queriesList}

Return: [3, 1, 5, 7] (query numbers, best first)`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\d\s,]+\]/) || content.match(/```(?:json)?\s*(\[[\d\s,]+\])\s*```/);
    
    if (jsonMatch) {
      const validIndices: number[] = JSON.parse(jsonMatch[0] || jsonMatch[1] || '[]');
      return batch.filter((_, idx) => validIndices.includes(idx + 1));
    }
    return batch;
  }));

  return results.flat();
}

export function isNonEnglishKeyword(query: string): boolean {
  return false; // Deprecated - use unified AI filtering
}

/** ACF context: source of truth for primary keyword (prompt_modifier / seo_prompt_modifier) */
export interface GSCAcfContext {
  promptModifier?: string;
  metaDescription?: string;
}

export async function processGSCQueriesAndAnalyze(
  gscResult: any,
  site: WordPressSite,
  url: string,
  onClusterAnalysisComplete?: (analysis: any) => void,
  onClusterAnalysisError?: (error: any) => void,
  acfContext?: GSCAcfContext
): Promise<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  if (!gscResult.queries || !Array.isArray(gscResult.queries) || gscResult.queries.length === 0) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 3);
    throw new Error(`No valid search queries found for this page in Google Search Console. The page may not have received any search traffic in the selected date range (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}).`);
  }

  const openRouterApiKey = loadApiKey();
  const researchModel = getResearchModel(site.id);

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key is required for query processing');
  }

  // Normalize queries - minimal validation
  const rawQueries = gscResult.queries
    .filter((q: any) => q && typeof q === 'object' && q.query && typeof q.query === 'string' && q.query.trim().length > 0)
    .map((q: any) => ({
      query: String(q.query).trim(),
      clicks: q.clicks || 0,
      impressions: q.impressions || 0,
      ctr: q.ctr || 0,
      position: q.position || 0
    }));

  // Extract company name for entity pages
  const isEntityPage = !!site.entitySitemapUrl;
  let companyNameToCheck = '';
  if (isEntityPage) {
    companyNameToCheck = site.name?.toLowerCase().trim() || '';
    if (!companyNameToCheck && url) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '').split('.')[0];
        companyNameToCheck = domain.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      } catch {}
    }
  }

  // Single AI call does all filtering and ranking
  const serviceFocusedQueries = await filterAndRankQueriesWithAI(
    rawQueries,
    url,
    openRouterApiKey,
    researchModel,
    isEntityPage ? companyNameToCheck : undefined
  );

  if (serviceFocusedQueries.length === 0) {
    throw new Error(`No valid search queries found after AI filtering.`);
  }

  // SIMPLE: Get recommended keyword from AI (non-blocking)
  if (serviceFocusedQueries.length === 0) {
    console.warn('[GSC Query Processor] No service-focused queries remaining after filtering.');
    return [];
  }

  if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
    toast.info('Getting keyword recommendation...', { duration: 2000 });

    // Simple async call - don't block
    Promise.resolve().then(async () => {
      try {
        const researchModel = getResearchModel(site.id);
        const keywordRecommendation = await getRecommendedKeywordFromGSC(serviceFocusedQueries, {
          apiKey: openRouterApiKey,
          model: researchModel,
          pageUrl: url,
          companyName: isEntityPage ? companyNameToCheck : undefined,
          promptModifier: acfContext?.promptModifier,
          metaDescription: acfContext?.metaDescription
        });

        // Never send blocklisted phrase to UI (sanitize before storing in cluster analysis)
        let primaryKeyword = keywordRecommendation.primaryKeyword?.trim() || '';
        if (primaryKeyword && isBlocklistedPrimaryKeyword(primaryKeyword)) {
          const sourceText = (acfContext?.promptModifier || acfContext?.metaDescription || '').trim();
          const replaced = sourceText ? deriveKeywordFromModifier(sourceText).trim() : firstNonBlocklistedQuery(serviceFocusedQueries);
          DEBUG_LOG('gsc-query-processor.ts:sanitize', 'Blocklisted keyword replaced before UI', { from: primaryKeyword, to: replaced, hasSource: !!sourceText }, 'BLOCKLIST');
          primaryKeyword = replaced;
        }
        // Second line of defense: primary keyword MUST be from GSC (verbatim or phrase in a query). Never show invented phrases like "easy clean low".
        if (primaryKeyword && !isPrimaryKeywordFromGSC(primaryKeyword, serviceFocusedQueries)) {
          primaryKeyword = bestGSCQueryForInvalidKeyword(primaryKeyword, serviceFocusedQueries);
          console.warn('[GSC Query Processor] Non-GSC keyword replaced with GSC query before UI');
        }

        // Create simple analysis object for compatibility (never use blocklisted phrase)
        const simpleAnalysis = {
          overallRecommendation: {
            recommendedKeyword: primaryKeyword,
            secondaryKeywords: keywordRecommendation.secondaryKeywords,
            topCluster: 'Recommended',
            reasoning: `AI recommended primary keyword: ${primaryKeyword || 'N/A'}${keywordRecommendation.secondaryKeywords.length > 0 ? `, ${keywordRecommendation.secondaryKeywords.length} secondary keywords` : ''}`
          },
          clusters: [{
            name: 'Recommended',
            queries: serviceFocusedQueries
          }]
        };
        
        if (onClusterAnalysisComplete) {
          onClusterAnalysisComplete(simpleAnalysis);
        }
        console.log('[Optimize Content] Keyword recommendation:', keywordRecommendation.primaryKeyword, keywordRecommendation.secondaryKeywords.length > 0 ? `+ ${keywordRecommendation.secondaryKeywords.length} secondary keywords` : '');
        toast.success('Keyword recommendation complete!', { duration: 2000 });
      } catch (error) {
        console.error('[Optimize Content] Error getting keyword recommendation:', error);
        if (onClusterAnalysisError) {
          onClusterAnalysisError(error);
        }
      }
    }).catch((error) => {
      console.error('[Optimize Content] Unexpected error in keyword recommendation:', error);
      if (onClusterAnalysisError) {
        onClusterAnalysisError(error);
      }
    });
  }

  return serviceFocusedQueries;
}

