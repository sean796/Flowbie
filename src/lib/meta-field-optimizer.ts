import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export interface OptimizedMetaFields {
  [key: string]: any;
}

/**
 * Generate optimized meta fields using AI based on post content
 * 
 * @param postContent - Full post content (HTML or markdown)
 * @param postTitle - Post title
 * @param metaDescription - Meta description (not excerpt)
 * @param primaryKeyword - Primary keyword for SEO
 * @param existingMeta - Existing meta fields from WordPress
 * @param siteUrl - Site URL for canonical URL generation
 * @param postLink - Post link/URL
 * 
 * @returns Promise resolving to OptimizedMetaFields object
 */
export async function generateOptimizedMetaFields(
  postContent: string,
  postTitle: string,
  metaDescription: string | undefined,
  primaryKeyword: string,
  existingMeta: Record<string, any>,
  siteUrl: string,
  postLink?: string
): Promise<OptimizedMetaFields> {
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  // Extract text content from HTML if needed
  let textContent = postContent;
  if (postContent.includes('<') && postContent.includes('>')) {
    // Remove HTML tags for analysis
    textContent = postContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Limit content length for AI processing (keep first 5000 chars)
  const limitedContent = textContent.substring(0, 5000);
  // Handle meta description safely - it may be undefined
  const limitedMetaDescription = metaDescription 
    ? metaDescription.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)
    : '';

  // Exclude heavy/Elementor fields from prompt to avoid AI echoing them and producing malformed JSON
  const EXCLUDE_FROM_PROMPT = new Set([
    '_elementor_data',
    '_elementor_edit_mode',
    '_elementor_template_type',
    '_elementor_css',
    '_elementor_page_settings',
  ]);
  const MAX_META_VALUE_LENGTH = 2000;
  const existingMetaForPrompt: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existingMeta)) {
    if (EXCLUDE_FROM_PROMPT.has(k)) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.length > MAX_META_VALUE_LENGTH) continue;
    existingMetaForPrompt[k] = v;
  }

  // Build system prompt
  const systemPrompt = `You are an expert SEO specialist specializing in WordPress meta field optimization, particularly RankMath SEO fields. Your task is to analyze post content and generate optimized meta fields that improve search engine visibility and click-through rates.

CRITICAL REQUIREMENTS:
1. SEO Title (rank_math_title): Must be 50-60 characters, include primary keyword naturally near the BEGINNING (first few words), be compelling and click-worthy
2. Meta Description (rank_math_description): MUST include the Focus Keyword (primary keyword) clearly—Rank Math requires it. Must be 150-160 characters, create urgency or value proposition
3. Focus Keyword (rank_math_focus_keyword): Use the exact primary keyword provided
4. Canonical URL (rank_math_canonical_url): Use the post link if provided, otherwise construct from site URL and title
5. Robots Meta (rank_math_robots): Preserve existing value or use ["index", "follow"] if not present
6. Social Meta Fields: Optimize Facebook and Twitter titles/descriptions (can be longer than SEO title/description)
7. Preserve ALL other existing meta fields - only optimize RankMath and common SEO fields

Return ONLY a valid JSON object matching the structure of existing meta fields. For each field, provide the optimized value. If a field doesn't exist in existingMeta, you may still include it if it's a standard RankMath field.

Character limits are STRICT:
- SEO Title: 50-60 characters (optimal: 55)
- Meta Description: 150-160 characters (optimal: 155)
- Social titles can be up to 70 characters
- Social descriptions can be up to 200 characters`;

  // Build user prompt
  const userPrompt = `Analyze this WordPress post and generate optimized meta fields:

POST TITLE: ${postTitle}
META DESCRIPTION: ${limitedMetaDescription || 'Not provided'}
PRIMARY KEYWORD: ${primaryKeyword}
POST CONTENT (first 5000 chars): ${limitedContent}
SITE URL: ${siteUrl}
POST LINK: ${postLink || 'Not provided'}

EXISTING META FIELDS (heavy/Elementor fields excluded; those are preserved automatically):
${JSON.stringify(existingMetaForPrompt, null, 2)}

Generate optimized meta fields. Focus on:
1. rank_math_title - SEO title (50-60 chars, keyword near the start, compelling)
2. rank_math_description - Meta description (150-160 chars). CRITICAL: Must clearly include the Focus Keyword "${primaryKeyword}" in the description—Rank Math requires it. Compelling, urgency or value.
3. rank_math_focus_keyword - Primary focus keyword (exact match: "${primaryKeyword}")
4. rank_math_canonical_url - Canonical URL (use post link if provided)
5. rank_math_robots - Robots directives (preserve existing or use ["index", "follow"])
6. rank_math_facebook_title - Facebook OG title (can be up to 70 chars)
7. rank_math_facebook_description - Facebook OG description (can be up to 200 chars)
8. rank_math_twitter_title - Twitter title (can be up to 70 chars)
9. rank_math_twitter_description - Twitter description (can be up to 200 chars)
10. rank_math_twitter_card_type - Twitter card type (preserve existing or use "summary_large_image")

IMPORTANT:
- Do NOT include _elementor_data, _elementor_edit_mode, _elementor_template_type, or other Elementor/large fields in your JSON. They are preserved automatically.
- Include only RankMath and common SEO meta fields in your response. Preserve other small existing fields as-is if you include them.
- Only optimize RankMath fields and common SEO fields.
- Ensure character limits are strictly followed.
- Make titles and descriptions compelling and click-worthy.
- Include primary keyword naturally (not forced).

Return ONLY a JSON object with the optimized meta fields. Example format:
{
  "rank_math_title": "Optimized SEO Title Here",
  "rank_math_description": "Optimized meta description here...",
  "rank_math_focus_keyword": "${primaryKeyword}",
  "rank_math_canonical_url": "${postLink || siteUrl}",
  "rank_math_robots": ["index", "follow"],
  "rank_math_facebook_title": "Facebook Title",
  "rank_math_facebook_description": "Facebook description...",
  "rank_math_twitter_title": "Twitter Title",
  "rank_math_twitter_description": "Twitter description...",
  "rank_math_twitter_card_type": "summary_large_image",
  ... (all other existing meta fields preserved)
}`;

  let aiResponse = '';
  
  try {
    const result = await streamChatCompletion({
      apiKey: openRouterApiKey,
        model: getResearchModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });

    // Get final content from result if available
    if (result.content) {
      aiResponse = result.content;
    }
  } catch (error) {
    console.error('[Meta Field Optimizer] AI generation failed:', error);
    throw new Error(`AI meta field optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!aiResponse || aiResponse.trim().length === 0) {
    throw new Error('AI meta field optimization returned empty response');
  }

  // Parse AI response to extract JSON
  let optimizedMeta: OptimizedMetaFields = {};
  
  try {
    // Try to extract JSON object from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      
      // Handle unterminated strings by attempting to fix common issues
      // If JSON parsing fails, try to repair the JSON
      try {
        optimizedMeta = JSON.parse(jsonStr);
      } catch (innerError) {
        // Try to fix unterminated strings by finding the last complete field
        // Find the last complete key-value pair before the error
        const lastCompleteMatch = jsonStr.match(/^\{[\s\S]*?("[\w_]+"\s*:\s*"[^"]*")\s*\}?$/);
        if (lastCompleteMatch) {
          // Extract all complete fields before the unterminated one
          const completeFields = jsonStr.match(/"[\w_]+"\s*:\s*(?:"[^"]*"|\[[^\]]*\]|\{[^\}]*\}|[^,}]+)/g) || [];
          if (completeFields.length > 0) {
            // Reconstruct JSON with only complete fields
            const repairedJson = '{' + completeFields.join(',') + '}';
            try {
              optimizedMeta = JSON.parse(repairedJson);
            } catch {
              // If repair fails, use fallback
              throw innerError;
            }
          } else {
            throw innerError;
          }
        } else {
          throw innerError;
        }
      }
    } else {
      // Fallback: try parsing the entire response
      optimizedMeta = JSON.parse(aiResponse);
    }
  } catch (parseError) {
    // Non-fatal: we use fallback meta and continue. Downgrade to warn to avoid noisy console.error.
    console.warn('[Meta Field Optimizer] Failed to parse AI response, using fallback meta:', parseError instanceof Error ? parseError.message : parseError);
    console.warn('[Meta Field Optimizer] AI Response (first 1000 chars):', aiResponse.substring(0, 1000));
    
    // Fallback: create basic optimized meta fields
    optimizedMeta = {
      ...existingMeta, // Preserve existing fields (including Elementor, etc.)
      rank_math_title: postTitle.substring(0, 60),
      rank_math_description: limitedMetaDescription.substring(0, 160) || postTitle.substring(0, 160),
      rank_math_focus_keyword: primaryKeyword,
      rank_math_canonical_url: postLink || siteUrl,
      rank_math_robots: existingMeta.rank_math_robots || ["index", "follow"],
    };
    
    console.warn('[Meta Field Optimizer] Using fallback meta fields due to parse error');
  }

  // Validate and enforce character limits
  if (optimizedMeta.rank_math_title && optimizedMeta.rank_math_title.length > 60) {
    optimizedMeta.rank_math_title = optimizedMeta.rank_math_title.substring(0, 60).trim();
  }
  
  if (optimizedMeta.rank_math_description && optimizedMeta.rank_math_description.length > 160) {
    optimizedMeta.rank_math_description = optimizedMeta.rank_math_description.substring(0, 160).trim();
  }

  // Rank Math: meta description must include Focus Keyword; if missing, append short phrase
  const desc = optimizedMeta.rank_math_description || '';
  if (desc && primaryKeyword && !desc.toLowerCase().includes(primaryKeyword.toLowerCase())) {
    const suffix = ` Learn more about ${primaryKeyword}.`;
    optimizedMeta.rank_math_description = (desc.trim() + suffix).substring(0, 160).trim();
  }

  // Ensure focus keyword is set
  if (!optimizedMeta.rank_math_focus_keyword) {
    optimizedMeta.rank_math_focus_keyword = primaryKeyword;
  }
// Ensure canonical URL is set
  if (!optimizedMeta.rank_math_canonical_url && postLink) {
    optimizedMeta.rank_math_canonical_url = postLink;
  }

  // Merge with existing meta to preserve all fields
  const finalMeta = {
    ...existingMeta,
    ...optimizedMeta,
  };

  // CRITICAL: Always ensure focus keyword is set (Rank Math requirement)
  // Set it after merge to override any existing value with the primary keyword
  finalMeta.rank_math_focus_keyword = primaryKeyword;

  // ACF Keyword Focus: write via post meta so it persists when ACF REST write does not
  // Many sites store ACF keyword_focus in wp_postmeta; including it here ensures it gets saved
  if (primaryKeyword && primaryKeyword.trim()) {
    finalMeta.keyword_focus = primaryKeyword.trim();
  }

  return finalMeta;
}

