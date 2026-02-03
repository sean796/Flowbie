/** Phrases that must NEVER be used as primary keyword (wrong-topic / known bad for this site). */
const BLOCKLISTED_PHRASES: string[] = [
  'patio',
  'umbrella',
  'text',
  'field', // Never "extra text field" or anything containing "text field" – UI/ACF label, not a real keyword
  'extra',
  'text field',
  'text field',
  'listicle',
  'guide',
  'outdoor furniture'
];

/** Exported so gsc-processing can reject blocklisted keyword from AI. */
export function isBlocklistedPrimaryKeyword(kw: string): boolean {
  const n = (kw || '').toLowerCase().trim();
  if (!n) return false;
  return BLOCKLISTED_PHRASES.some(blocked => n === blocked || n.includes(blocked));
}

/** First query in list that is not blocklisted. Exported for fallbacks in gsc-processing. */
export function firstNonBlocklistedQuery(queries: GSCQuery[]): string {
  for (const q of queries || []) {
    const qq = (q?.query || '').trim();
    if (qq && !isBlocklistedPrimaryKeyword(qq)) return qq;
  }
  return '';
}

/** Normalize for comparison: lowercase, collapse spaces. */
function normalizePhrase(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Primary keyword MUST come from GSC. Returns true if the keyword equals or is a contiguous
 * phrase contained in at least one GSC query (e.g. "easy to clean" in "easy to clean window treatments").
 * Rejects invented phrases like "easy clean low" that mix in words from URL/title (e.g. "low" from "low-maintenance").
 */
export function isPrimaryKeywordFromGSC(keyword: string, queries: GSCQuery[]): boolean {
  const k = normalizePhrase(keyword);
  if (!k) return false;
  for (const q of queries || []) {
    const qq = normalizePhrase(q?.query || '');
    if (!qq) continue;
    if (qq === k) return true;
    if (qq.includes(k)) return true;
  }
  return false;
}

/**
 * When AI returns a keyword that is NOT from GSC, use the first non-blocklisted GSC query
 * so we never show invented phrases like "easy clean low" (from URL "low-maintenance").
 */
export function bestGSCQueryForInvalidKeyword(_keyword: string, queries: GSCQuery[]): string {
  return firstNonBlocklistedQuery(queries);
}

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SimpleKeywordRecommendationOptions {
  apiKey: string;
  model: string;
  pageUrl?: string;
  companyName?: string;
  /** SOURCE OF TRUTH: When provided, primary keyword MUST align with this (from ACF prompt_modifier / seo_prompt_modifier). */
  promptModifier?: string;
  /** Optional: meta description for context (e.g. rank_math_description). */
  metaDescription?: string;
}

export interface KeywordRecommendation {
  primaryKeyword: string;
  secondaryKeywords: string[];
}

/**
 * SIMPLE: ONE AI prompt, returns primary keyword + up to 5 secondary keywords
 * Primary keyword: Best single keyword to optimize for (from GSC queries)
 * Secondary keywords: Related keywords that expand visibility (NOT in GSC queries)
 * No JSON, no clusters, no validation - just newline-separated keywords
 */
export async function getRecommendedKeywordFromGSC(
  queries: GSCQuery[],
  options: SimpleKeywordRecommendationOptions
): Promise<KeywordRecommendation> {
  if (!queries || queries.length === 0) {
    throw new Error('No queries provided');
  }

  if (!options.apiKey || !options.apiKey.trim()) {
    throw new Error('API key is required');
  }

  // Build queries list for prompt
  const queriesList = queries
    .slice(0, 50) // Limit to first 50 to keep prompt manageable
    .map((q, i) => `${i + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || 'N/A'}`)
    .join('\n');

  const promptModifierTrimmed = (options.promptModifier ?? '').trim();
  const metaTrimmed = (options.metaDescription ?? '').trim();
  const hasPromptModifier = promptModifierTrimmed.length > 0;
  const hasMeta = metaTrimmed.length > 0;
  const sourceText = promptModifierTrimmed || metaTrimmed;
  const hasSource = sourceText.length > 0;

  const sourceOfTruthBlock = hasPromptModifier
    ? `**SOURCE OF TRUTH (MANDATORY)**:
The page has an ACF "Prompt Modifier" that defines what this page is about. You MUST use it as the PRIMARY source for the primary keyword.

PROMPT MODIFIER: "${promptModifierTrimmed.substring(0, 500)}"

RULES WHEN PROMPT MODIFIER IS PROVIDED:
1. The PRIMARY keyword (first line) MUST be a short-tailed 2-3 word seed phrase only — for seeding the page and Keyword Focus. Do NOT include locations, cities, or entity names (e.g. no "Florida", "United", city/neighborhood names).
2. Derive the seed from the modifier's topic (e.g. "window coverings", "blinds and shades", "patio covers") — same business/service as the modifier, but 2-3 words only, no geography or entities.
3. If a GSC query fits the modifier's topic, you may use a 2-3 word shortening of it (strip locations/entities). Otherwise derive a short seed from the modifier. Reject any GSC query whose topic does not match the modifier.`
    : '';

  const metaBlock = (options.metaDescription ?? '').trim().length > 0
    ? `META DESCRIPTION (for context): "${(options.metaDescription ?? '').trim().substring(0, 300)}"`
    : '';

  const siteContext = options.companyName ? `**SITE CONTEXT**: This website is ${options.companyName}${options.pageUrl ? ` (${options.pageUrl})` : ''}. Keywords must be relevant to this site's business. Reject irrelevant keywords.` : '';

  const prompt = `From these Google Search Console queries, recommend keywords for content optimization:

${queriesList}

${sourceOfTruthBlock}
${metaBlock ? metaBlock + '\n\n' : ''}
${siteContext}
${options.companyName ? `CRITICAL: DO NOT include "${options.companyName}" in any keywords.` : ''}

FILTERING RULES - SKIP these types of keywords:
1. **MANDATORY: Keywords NOT contextually relevant to the site's business/content**${options.companyName ? ` (${options.companyName})` : ''} - If a keyword doesn't make sense for the site's industry, products, or services, REJECT it immediately
2. **NEVER use "text field", "extra text field", or any phrase containing "text field"** – these are UI/ACF field labels, not real search keywords. Reject them always.
3. Competitor names: Skip any queries that appear to be specific business names or competitor brands
4. Location + Service combinations: Skip queries that combine a neighborhood/location with a service/industry keyword (e.g., "service name neighborhood city" or "business name service")
5. Acronyms or abbreviations that don't relate to the site's industry 
6. Keywords from completely different industries or topics than what the site covers
7. KEEP: Queries in "service/product in neighborhood" format are acceptable
8. KEEP: Queries that are just location names alone (without service/industry terms)

PRIMARY KEYWORD RULE (MANDATORY):
- The primary keyword (first line) MUST be one of the GSC queries above verbatim, OR a contiguous phrase that appears inside one of them (e.g. "easy to clean" from "easy to clean window treatments").
- NEVER invent phrases or combine with words from the page URL/title (e.g. do NOT use "low" from "low-maintenance" — only use words that actually appear in the GSC query list above).

OUTPUT FORMAT (newline-separated, one keyword per line):
1. First line: BEST single primary keyword — ${hasPromptModifier ? 'MUST be 2-3 words only, no locations or entities (short seed for Keyword Focus). Align with the Prompt Modifier topic. MUST still be from the GSC list above (verbatim or contiguous phrase within a query).' : 'From the queries above, after filtering (verbatim or contiguous phrase within a query).'}
2. Next 1-5 lines: Secondary keywords (related keywords NOT in the queries above that would expand visibility)

CRITICAL OUTPUT REQUIREMENTS:
- NO QUOTES (do not use " or ' around keywords)
- NO JSON
- NO explanations
- NO reasoning
- NO markdown
- NO code blocks
- NO numbering or bullets
- Just plain keyword text, one per line
- Apply filtering rules above before selecting keywords

Return the primary keyword on the first line, then up to 5 secondary keywords (one per line).`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 150 // Increased to allow for multiple keywords
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    if (!content || content.length === 0) {
      if (hasSource) {
        const derived = deriveKeywordFromModifier(sourceText);
        return { primaryKeyword: derived || '', secondaryKeywords: [] };
      }
      const fallback = firstNonBlocklistedQuery(queries) || '';
      return { primaryKeyword: fallback, secondaryKeywords: [] };
    }

    // Parse newline-separated keywords
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^["']+|["']+$/g, '').trim()) // Remove quotes
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      if (hasSource) {
        const derived = deriveKeywordFromModifier(sourceText);
        return { primaryKeyword: derived || '', secondaryKeywords: [] };
      }
      const fallback = firstNonBlocklistedQuery(queries) || '';
      return { primaryKeyword: fallback, secondaryKeywords: [] };
    }

    // First line is primary keyword
    let primaryKeyword = lines[0];
    if (isBlocklistedPrimaryKeyword(primaryKeyword)) {
      primaryKeyword = hasSource ? (deriveKeywordFromModifier(sourceText) || '') : firstNonBlocklistedQuery(queries) || '';
    }
    // CRITICAL: Primary keyword MUST be from GSC (verbatim or contiguous phrase in a query). Reject AI inventions like "easy clean low" that mix in URL words.
    if (primaryKeyword && !isPrimaryKeywordFromGSC(primaryKeyword, queries)) {
      primaryKeyword = bestGSCQueryForInvalidKeyword(primaryKeyword, queries);
      if (primaryKeyword) {
        console.warn('[Simple Keyword Recommendation] AI returned non-GSC keyword; replaced with GSC query:', lines[0], '->', primaryKeyword);
      }
    }

    // Remaining lines (up to 5) are secondary keywords
    const secondaryKeywords = lines.slice(1, 6).filter(kw => kw && kw.length > 0);

    return {
      primaryKeyword: primaryKeyword || '',
      secondaryKeywords
    };
  } catch (error) {
    console.error('[Simple Keyword Recommendation] Error:', error);
    const src = (options.promptModifier ?? '').trim() || (options.metaDescription ?? '').trim();
    if (src) {
      const derived = deriveKeywordFromModifier(src);
      return { primaryKeyword: derived || '', secondaryKeywords: [] };
    }
    const fallback = firstNonBlocklistedQuery(queries) || '';
    return { primaryKeyword: fallback, secondaryKeywords: [] };
  }
}

/** Location/entity terms to strip so Keyword Focus is a short 2-3 word seed only (no places or entity names). */
const LOCATION_ENTITY_STOPWORDS = new Set(['florida', 'united', 'states', 'miami', 'tampa', 'orlando', 'city', 'county', 'area', 'near']);

/** Derive a short 2-3 word seed from prompt modifier or meta text when API/parse fails. No locations or entities. Exported for fallbacks. */
export function deriveKeywordFromModifier(modifier: string): string {
  const t = (modifier || '').trim();
  if (!t) return '';
  const stopwords = /^(the|and|in|for|to|of|a|an|this|that|it|is|are|we|our|company|specializes)$/i;
  let words = t.split(/\s+/)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => w.length > 1 && !stopwords.test(w))
    .filter(w => !LOCATION_ENTITY_STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) words = t.split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length > 1 && !stopwords.test(w));
  const phrase = words.slice(0, 3).join(' ').trim(); // 2-3 word seed only
  return phrase.length >= 2 ? phrase.substring(0, 80) : (words[0] || t).substring(0, 80);
}

/**
 * AI-only: Strip all locations/geolocations from a keyword for the ACF Keyword Focus field.
 * DFS and content may use the full keyword (e.g. "window coverings Florida"); keyword_focus gets location-free seed (e.g. "window coverings").
 * Returns the same keyword if API key missing or request fails (caller can keep full keyword or skip ACF).
 */
export async function stripLocationsFromKeywordForACF(
  keyword: string,
  apiKey: string | null | undefined,
  model: string
): Promise<string> {
  const raw = (keyword || '').trim();
  if (!raw) return '';
  if (!apiKey || !apiKey.trim()) return deriveKeywordFromModifier(raw);

  const prompt = `You are a keyword cleaner. Remove ALL locations and geographic terms from the keyword phrase.

KEYWORD: "${raw}"

RULES:
- Remove every location: cities, states, countries, regions, neighborhoods, "near me", area names, etc.
- Keep only the short topic/service seed (2-4 words). Examples:
  * "window coverings Florida" → "window coverings"
  * "blinds installation Tampa Florida" → "blinds installation"
  * "patio covers Miami" → "patio covers"
- Return ONLY the cleaned keyword phrase. No quotes, no explanation, no punctuation.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agent-blueprint-builder.com',
        'X-Title': 'Agent Blueprint Builder',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 30,
      }),
    });
    if (!response.ok) return deriveKeywordFromModifier(raw);
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!content || content.length < 2) return deriveKeywordFromModifier(raw);
    return content.substring(0, 80);
  } catch {
    return deriveKeywordFromModifier(raw);
  }
}
