/**
 * WordPress Uploader Module
 * Handles WordPress post creation and updates using entity endpoint directly
 * NO service-area conditionals, NO normalization
 */

import { toast } from "sonner";
import { updateWordPressPost, createWordPressPost, uploadWordPressMedia, updateWordPressPostMeta, filterPostsToValidatedLinksOnly } from "@/lib/wordpress-api";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { cleanTitleForNonEntity } from "@/lib/content-optimization-helpers";
import { sanitizeContentForUpload, validateContentForUpload, truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";
import { loadApiKey } from "@/lib/api";
import { getLocalFAQPhrase } from "@/lib/local-entity-phrases";
import { discoverACFFieldMapping } from "@/lib/content-generation/acf-field-mapper";
import { getACFFieldsForPost } from "@/lib/wordpress-api/acf-discovery";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { stripLocationsFromKeywordForACF } from "@/lib/gsc-simple-keyword-recommendation";
import { generateOptimizedTitle } from "@/lib/title-optimizer";
import { generateSEOSlug } from "@/lib/seo-slug-generator";

/**
 * When no primary keyword is available, infer one from title, meta, and PROMPT MODIFIER using Open Router.
 * The PROMPT MODIFIER (when present) is the source of truth; keyword is derived from it.
 */
async function inferKeywordForKeywordFocus(
  title: string,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  metaDescription?: string,
  promptModifier?: string
): Promise<string> {
  const cleanTitle = (title || "").replace(/<[^>]+>/g, "").trim();
  const excerptText = (excerpt || "").replace(/<[^>]+>/g, "").trim().substring(0, 300);
  const metaText = (metaDescription || excerptText || "").trim().substring(0, 300);
  const modifierText = (promptModifier || "").trim().substring(0, 500);
  if (!cleanTitle && !metaText && !modifierText) return "";

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return "";

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifierText) parts.push(`PROMPT MODIFIER (read first - defines what to prioritize): "${modifierText}"`);
    parts.push(`Page Title: "${cleanTitle || "(none)"}"`, `Page URL: "${url}"`);
    if (metaText) parts.push(`Meta description (use as context for the page topic): "${metaText}"`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `The PROMPT MODIFIER (when provided above) is the SOURCE OF TRUTH for what this company/site specializes in. Your keyword MUST be derived from and consistent with it.

${parts.join("\n")}

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

    if (!response.ok) return "";

    const data = await response.json();
    const aiKeyword = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!aiKeyword || aiKeyword.length < 2) return "";

    const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : "";
  } catch (error) {
    console.warn("[WordPress Uploader] Failed to infer keyword for keyword_focus:", error);
    return "";
  }
}

/**
 * AI-driven function to generate FAQ questions from blog content
 * Analyzes the content and generates 4 relevant questions focused on North America
 */
export async function generateQuestionsFromContent(
  blogContent: string,
  primaryKeyword: string,
  apiKey: string,
  napLocations?: Array<{ city: string; state: string }>
): Promise<string[]> {
  try {
    // Extract text content (remove HTML tags for better AI analysis)
    const textContent = blogContent
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 8000); // Limit to 8000 chars for API efficiency

    // Build location context from NAP data
    let locationContext = '';
    if (napLocations && napLocations.length > 0) {
      const locationStrings = napLocations
        .filter(loc => loc.city && loc.state)
        .map(loc => `${loc.city}, ${loc.state}`)
        .slice(0, 3); // Use up to 3 locations
      if (locationStrings.length > 0) {
        locationContext = `\n\nIMPORTANT: Focus questions on North American locations only. Use these realistic locations from our business: ${locationStrings.join(', ')}. DO NOT reference any locations outside of North America (no Australia, UK, Europe, Asia, etc.).`;
      }
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an SEO expert specializing in North American content. Generate exactly 4 relevant FAQ questions that readers would ask about the topic. CRITICAL: All questions must focus ONLY on North America (United States, Canada, Mexico). NEVER reference locations outside North America (no Australia, UK, Europe, Asia, etc.). Return ONLY a JSON array of 4 question strings, nothing else."
          },
          {
            role: "user",
            content: `Analyze this blog content about "${primaryKeyword}" and generate 4 relevant FAQ questions focused on North America only:${locationContext}\n\n${textContent}\n\nReturn ONLY a JSON array like: ["Question 1?", "Question 2?", "Question 3?", "Question 4?"]\n\nCRITICAL: All questions must be relevant to North America only. No international references.`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse JSON array from AI response
    let questions: string[] = [];
    try {
      // Try to extract JSON array from response
      const jsonMatch = aiResponse.match(/\[.*\]/s);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try parsing entire response
        questions = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      // Fallback: split by lines and clean
      questions = aiResponse
        .split('\n')
        .map(line => line.replace(/^[-*•]\s*/, '').replace(/^["']|["']$/g, '').trim())
        .filter(q => q.length > 10 && q.endsWith('?'))
        .slice(0, 4);
    }

    // Ensure we have exactly 4 questions
    if (questions.length < 4) {
      // Generate fallback questions based on primary keyword
      const fallbackQuestions = [
        `What is ${primaryKeyword}?`,
        `How does ${primaryKeyword} work?`,
        `Why is ${primaryKeyword} important?`,
        `Where can I find ${primaryKeyword}?`
      ];
      questions = [...questions, ...fallbackQuestions].slice(0, 4);
    }

    console.log(`[FAQ Schema] AI generated ${questions.length} questions from blog content`);
    return questions.slice(0, 4);
  } catch (error) {
    console.warn('[FAQ Schema] Failed to generate questions from content:', error);
    // Return fallback questions based on primary keyword
    return [
      `What is ${primaryKeyword}?`,
      `How does ${primaryKeyword} work?`,
      `Why is ${primaryKeyword} important?`,
      `Where can I find ${primaryKeyword}?`
    ];
  }
}

/**
 * Generates Google-compliant FAQ Schema JSON-LD from questions
 * ALWAYS generates schema - never returns empty string
 * Returns properly formatted JSON-LD string (ACF fields handle script tag wrapping)
 * Format: Valid JSON string that can be embedded in script tags
 * CRITICAL: All FAQs focus on North America only - uses NAP locations for realistic references
 */
export function generateFAQSchema(
  questions: string[],
  primaryKeyword: string,
  entity: string | undefined,
  siteUrl: string,
  napLocations?: Array<{ city: string; state: string }>
): string {
  // Filter out any questions that reference non-North American locations
  const northAmericaOnlyQuestions = questions.filter(q => {
    const lowerQ = q.toLowerCase();
    // Block common international references
    const blockedTerms = ['australia', 'uk', 'united kingdom', 'europe', 'asia', 'london', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'england', 'scotland', 'wales', 'ireland', 'new zealand', 'singapore', 'hong kong', 'tokyo', 'paris', 'berlin', 'rome', 'madrid'];
    return !blockedTerms.some(term => lowerQ.includes(term));
  });

  // Take first 4 questions (always ensure we have questions)
  let faqQuestions = northAmericaOnlyQuestions.slice(0, 4);
  
  // Ensure we have at least one question
  if (faqQuestions.length === 0) {
    // Fallback questions focused on North America
    faqQuestions.push(
      `What is ${primaryKeyword}?`,
      `How does ${primaryKeyword} work?`,
      `Why is ${primaryKeyword} important?`,
      `Where can I find ${primaryKeyword} in North America?`
    );
  }
  
  // Get primary location from NAP data for answer context
  let primaryLocation = '';
  if (napLocations && napLocations.length > 0) {
    const defaultLoc = napLocations.find(loc => loc.city && loc.state) || napLocations[0];
    if (defaultLoc && defaultLoc.city && defaultLoc.state) {
      primaryLocation = `${defaultLoc.city}, ${defaultLoc.state}`;
    }
  }
  
  // Use entity if available, otherwise use NAP location
  const locationReference = entity || primaryLocation;
  
  // Generate FAQ schema structure per Google's FAQPage specification
  // https://developers.google.com/search/docs/appearance/structured-data/faqpage
  const faqItems = faqQuestions.slice(0, 4).map((question, index) => {
    // Clean question text - trim and ensure it's a valid string
    const cleanQuestion = String(question || '').trim();
    if (!cleanQuestion) {
      // Skip empty questions
      return null;
    }
    
    // Filter out any international references from the question itself
    const lowerQuestion = cleanQuestion.toLowerCase();
    const hasInternationalRef = ['australia', 'uk', 'united kingdom', 'europe', 'asia'].some(term => lowerQuestion.includes(term));
    if (hasInternationalRef) {
      console.warn(`[FAQ Schema] Filtered out question with international reference: ${cleanQuestion}`);
      return null;
    }
    
    // Generate answer text - use varied phrases for location reference to avoid repetition
    let locationText: string;
    if (locationReference) {
      // Use varied FAQ phrases, rotating through different options for each question
      const variedPhrase = getLocalFAQPhrase(locationReference, index);
      locationText = ` ${variedPhrase}`;
    } else {
      locationText = ' in North America';
    }
    const answerText = `For expert guidance on ${cleanQuestion.toLowerCase()}, contact our team${locationText}. We specialize in ${primaryKeyword} and provide personalized solutions tailored to your needs.`;
    
    return {
      "@type": "Question",
      "name": cleanQuestion,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answerText
      }
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null); // Remove null items

  // Ensure we have at least one valid FAQ item
  if (faqItems.length === 0) {
    faqItems.push({
      "@type": "Question",
      "name": `What is ${primaryKeyword}?`,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": `Learn more about ${primaryKeyword} and how it can help you.`
      }
    });
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems
  };

  // Generate properly formatted JSON string
  // JSON.stringify automatically handles escaping of special characters
  let jsonString: string;
  try {
    // Use JSON.stringify which properly escapes all special characters
    jsonString = JSON.stringify(faqSchema);
    
    // Validate the JSON is parseable
    JSON.parse(jsonString);
  } catch (error) {
    console.error('[FAQ Schema] JSON stringify/parse error:', error);
    // Fallback: create minimal valid schema with safe text
    const safeKeyword = primaryKeyword.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'this topic';
    jsonString = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [{
        "@type": "Question",
        "name": `What is ${safeKeyword}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Learn more about ${safeKeyword} and how it can help you.`
        }
      }]
    });
  }
  
  // Wrap in script tags for Google-compliant JSON-LD embedding
  // ACF fields can store this format, and WordPress themes will render it correctly
  const fullSchema = `<script type="application/ld+json">${jsonString}</script>`;

  console.log(`[FAQ Schema] Generated Google-compliant JSON-LD with ${faqItems.length} questions for "${primaryKeyword}"`);
  return fullSchema;
}

export interface WordPressUploaderOptions {
  context: {
    site: WordPressSite;
    url: string;
    updateMode: 'update' | 'draft';
    existingPost?: any;
    resolved?: any;
    existingTitle: string;
    existingContent?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  };
  blueprintResult: any;
  existingTitle: string;
  primaryKeyword: string;
  htmlContent: string;
  excerpt: string;
  featuredImageId?: number;
  shouldOptimizeTitle: boolean;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  entity?: string; // Entity extracted from title/ACF origin field (e.g., "Edmonton, Alberta")
  faqQuestions?: string[]; // PAA questions for FAQ schema generation
  apiKey?: string; // OpenRouter API key for AI-driven question generation
  extraTextContent?: string; // Extra text content for pages (ACF field: seo_extra_text)
  extraImageBase64?: string; // Extra image base64 for pages (ACF field: seo_extra_image)
}

export interface WordPressUploaderResult {
  result: any;
  postId: number;
  link: string;
  finalTitle: string;
}

export async function uploadToWordPress(
  options: WordPressUploaderOptions
): Promise<WordPressUploaderResult> {
  const {
    context,
    blueprintResult,
    existingTitle,
    primaryKeyword,
    htmlContent,
    excerpt,
    featuredImageId,
    shouldOptimizeTitle,
    setProgress,
    entity,
    faqQuestions,
    apiKey,
    extraTextContent,
    extraImageBase64
  } = options;

  const { site } = context;
  
  // CRITICAL: Strip ALL HTML tags from excerpt - it's a meta description, NOT HTML content
  // WordPress will auto-wrap it in <p> tags if we don't ensure it's pure plain text
  const plainTextExcerpt = excerpt
    ? excerpt.replace(/<[^>]*>/g, '').trim() // Remove ALL HTML tags
    : excerpt;
  
  // DEBUG: Log excerpt to verify it's being passed correctly
  console.log('[WordPress Uploader] Excerpt being uploaded:', {
    hasExcerpt: !!excerpt,
    excerptLength: excerpt?.length || 0,
    plainTextLength: plainTextExcerpt?.length || 0,
    excerptPreview: plainTextExcerpt?.substring(0, 100) || 'N/A',
    hadHTML: excerpt !== plainTextExcerpt
  });
  
  // DEBUG: Log faqQuestions to trace if they're being passed
  console.log('[WordPress Uploader] FAQ Questions received:', {
    hasFaqQuestions: !!faqQuestions,
    faqQuestionsLength: faqQuestions?.length || 0,
    faqQuestionsPreview: faqQuestions?.slice(0, 2) || [],
    entity,
    primaryKeyword
  });

  // CRITICAL: Validate internal links (200 only) at publish time, then sanitize so we never publish broken links
  let postsForSanitizer = context.wordPressPosts;
  if (postsForSanitizer?.length) {
    postsForSanitizer = await filterPostsToValidatedLinksOnly(site.siteUrl, postsForSanitizer);
  }
  // Sanitize content before upload: placeholders, invalid internal links (only from validated list), non-Wikipedia external
  const sanitizedHtmlContent = sanitizeContentForUpload(htmlContent, site.siteUrl, postsForSanitizer);
  
  // Validate content and log warnings (but don't block upload)
  const validation = validateContentForUpload(sanitizedHtmlContent);
  if (validation.warnings.length > 0) {
    console.warn('[WordPress Uploader] Content validation warnings:', validation.warnings);
  }
  
  console.log('[WordPress Uploader] Content sanitization applied:', {
    originalLength: htmlContent.length,
    sanitizedLength: sanitizedHtmlContent.length,
    bytesRemoved: htmlContent.length - sanitizedHtmlContent.length,
    validationWarnings: validation.warnings.length
  });

// AGENTIC LOGIC: Use endpoint from RESOLVED post first (it tells us where the post actually exists)
  // Convert resolved.subtype to REST endpoint: 'post' -> 'posts', 'page' -> 'pages', others stay as-is
  const resolvedEndpoint = context.resolved?.subtype 
    ? (context.resolved.subtype === 'post' ? 'posts' 
      : context.resolved.subtype === 'page' ? 'pages' 
      : context.resolved.subtype)
    : null;
  
  // Extract entity endpoint from sitemap (for new posts or when resolved endpoint not available)
  const entityEndpointFromSitemap = context.site.entitySitemapUrl
    ? extractEndpointFromEntitySitemapUrl(context.site.entitySitemapUrl)
    : null;

  // Priority: resolved endpoint > existing post endpoint > entity sitemap endpoint > default
  const entityEndpoint = resolvedEndpoint 
    || context.existingPost?.postTypeEndpoint 
    || entityEndpointFromSitemap 
    || 'posts';

  const isPage = context.resolved?.subtype === 'page' || 
    context.resolved?.endpoint === 'pages' ||
    context.existingPost?.postTypeEndpoint === 'pages' ||
    entityEndpoint === 'pages';

  // Always use optimized content for update – overwrite existing. Never preserve old content for pages.
  const contentForUpdate = sanitizedHtmlContent;
  
  console.log('[WordPress Uploader] Entity endpoint extracted (AGENTIC):', {
    entitySitemapUrl: context.site.entitySitemapUrl,
    resolvedSubtype: context.resolved?.subtype,
    resolvedEndpoint,
    extractedEndpoint: entityEndpoint,
    fallbackFromExistingPost: context.existingPost?.postTypeEndpoint,
    priority: resolvedEndpoint ? 'resolved' : context.existingPost?.postTypeEndpoint ? 'existingPost' : entityEndpointFromSitemap ? 'sitemap' : 'default'
  });

  let result: any;
  let finalTitle: string = '';

  // NOTE: We NO LONGER read existingOrigin from existing post
  // Origin is ALWAYS extracted fresh from title using AI during optimization
  // This ensures accurate, up-to-date entity extraction every time

  if (context.updateMode === 'update') {
    // Use entityEndpoint directly - NO normalization
    const postTypeEndpoint = entityEndpoint;

    console.log('[Optimize Content] Updating existing post:', {
      id: context.existingPost.id,
      postTypeEndpoint: postTypeEndpoint,
      resolvedSubtype: context.resolved?.subtype,
      existingPostEndpoint: context.existingPost?.postTypeEndpoint
    });

    // Prepare title for update. When title optimization is on, always re-optimize – never fall back to existingTitle without re-optimizing.
    let updateTitle: string;
    if (shouldOptimizeTitle) {
      const blueprintTitle = (blueprintResult.title ?? "").trim();
      if (blueprintTitle) {
        updateTitle = blueprintResult.title!.replace(/\s*\(?\s*[Oo]ptimized\s*\)?\s*/g, '').trim();
      } else {
        // Re-optimize existing title (never skip): generate shorter, more concise title (max 50 chars).
        updateTitle = await generateOptimizedTitle(
          existingTitle || primaryKeyword,
          primaryKeyword,
          site.id,
          entity
        );
      }
    } else {
      updateTitle = existingTitle || primaryKeyword;
    }
    
    if (!isPage) {
      const blueprintEntity = (blueprintResult as any)?.entity;
      if (!blueprintEntity || blueprintEntity === 'N/A') {
        const cleanedUpdateTitle = cleanTitleForNonEntity(updateTitle, blueprintEntity || 'N/A');
        if (cleanedUpdateTitle !== updateTitle) {
          console.log('[WordPress Uploader] Cleaned location mentions from update title:', {
            original: updateTitle,
            cleaned: cleanedUpdateTitle,
            entity: blueprintEntity || 'N/A'
          });
          updateTitle = cleanedUpdateTitle;
        }
      }
    }
    // Always truncate optimized title to 50 chars (Death Star) – posts and pages
    if (shouldOptimizeTitle) {
      const originalLength = updateTitle.length;
      updateTitle = truncateTitleForSEO(updateTitle, 50);
      if (originalLength > 50) {
        console.log('[WordPress Uploader] Truncated title to 50 characters (Death Star module requirement):', {
          original: updateTitle.substring(0, originalLength),
          truncated: updateTitle,
          originalLength,
          truncatedLength: updateTitle.length
        });
      }
    }
    
    finalTitle = updateTitle;
    
    // Preserve the original slug to prevent URL changes
    const originalSlug = context.existingPost?.slug || context.resolved?.slug;

    // Preserve original status from existing post
    const postStatus = context.existingPost?.status === 'publish' ? 'publish' : 'draft';

    console.log('[WordPress Uploader] Updating post:', {
      postId: context.existingPost.id,
      postStatus,
      postTypeEndpoint,
      originalSlug,
      hasFeaturedImage: !!featuredImageId,
      updateTitle,
      existingPostStatus: context.existingPost?.status
    });

    setProgress({ step: 'Updating post...', progress: 90, message: `Updating existing post (ID: ${context.existingPost.id}) with optimized content: "${updateTitle}"...` });
    
    // Update the existing post WITHOUT excerpt first (WordPress will auto-generate, but we'll override it in final step)
    result = await updateWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      context.existingPost.id,
      updateTitle,
      contentForUpdate, // Always optimized content – overwrite existing (posts and pages)
      undefined, // DO NOT set excerpt here - will be set as final step
      postStatus, // Preserve original status
      context.existingPost?.post_type || 'post', // Use post type from existing post
      featuredImageId,
      undefined,
      undefined,
      originalSlug, // Preserve original slug
      postTypeEndpoint // Use entityEndpoint directly - NO normalization
    );
    
    console.log('[WordPress Uploader] Post update result:', {
      success: result.success,
      postId: result.postId,
      link: result.link,
      status: result.status,
      error: result.error,
      title: result.title,
      expectedStatus: postStatus
    });

    // After successful update, set ACF fields
    if (result.success && result.postId) {
      try {
        // AGENTIC: Fetch actual ACF fields and discover field mapping
        setProgress({ 
          step: 'Discovering ACF fields...', 
          progress: 92, 
          message: 'Fetching ACF fields to determine field names...' 
        });

        const postType = context.existingPost?.post_type || context.resolved?.subtype || 'post';
        const acfResult = await getACFFieldsForPost(
          site,
          result.postId,
          postType,
          postTypeEndpoint
        );

        const existingAcfFields = acfResult.success && acfResult.fields ? acfResult.fields : {};
        
        // Use AI to discover field mapping
        const openRouterApiKey = apiKey || loadApiKey();
        const fieldMapping = await discoverACFFieldMapping(
          existingAcfFields,
          postType,
          openRouterApiKey || '',
          site.siteUrl
        );

        // Use discovered mapping, with fallbacks for missing fields
        const fieldNames = {
          dateModifier: fieldMapping.dateModifier || 'date_modifier',
          faq: fieldMapping.faq || 'faq',
          metaDescription: fieldMapping.metaDescription || 'meta_description',
          promptModifier: fieldMapping.promptModifier || 'prompt_modifier',
          extraText: fieldMapping.extraText || 'seo_extra_text',
          extraImage: fieldMapping.extraImage || 'seo_extra_image',
          origin: fieldMapping.origin || 'origin',
          keywordFocus: fieldMapping.keywordFocus || 'keyword_focus'
        };

        // Check if test mode is enabled
        const testMode = (context as any).optimizationOptions?.testMode === true;
        
        if (testMode) {
          // TEST MODE: Explicitly update both ACF fields with test values
          console.log(`[WordPress Uploader] TEST MODE: Explicitly editing ACF fields - ${fieldNames.dateModifier} and ${fieldNames.promptModifier}`);
          setProgress({ step: 'TEST MODE: Updating ACF fields...', progress: 95, message: `TEST MODE: Editing ${fieldNames.dateModifier} (today's date) and ${fieldNames.promptModifier} (test message)...` });
          
          const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
          const testMessage = 'TEST MODE: This post was updated in test mode with keyword "edmonton seo"';
          
          const acfUpdateResult = await updateACFFields(
            site.siteUrl,
            site.username,
            site.appPassword,
            result.postId,
            { 
              [fieldNames.dateModifier]: todayDate,
              [fieldNames.promptModifier]: testMessage
            },
            context.existingPost?.post_type || 'post',
            postTypeEndpoint
          );

          if (acfUpdateResult.success) {
            console.log(`[WordPress Uploader] TEST MODE: Successfully set ${fieldNames.dateModifier} to ${todayDate} and ${fieldNames.promptModifier} to "${testMessage}" for post ID ${result.postId}`);
            console.log(`[WordPress Uploader] TEST MODE: ACF fields updated:`, acfUpdateResult.updated);
          } else {
            console.warn(`[WordPress Uploader] TEST MODE: Failed to update ACF fields:`, acfUpdateResult.error || acfUpdateResult.failed);
            // Don't fail the entire operation if ACF update fails
          }
        } else {
          // NORMAL MODE: Update date_modifier/seo_date_modifier, origin, AND faq/seo_faq fields together
          const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
          
          // Build ACF fields object - always include date_modifier/seo_date_modifier and chosen keyword
          // ACF keyword_focus: location-free seed only (AI strips geolocations). DFS/content use full primaryKeyword.
          let keywordForACF = '';
          if (primaryKeyword && primaryKeyword.trim()) {
            keywordForACF = (await stripLocationsFromKeywordForACF(
              primaryKeyword.trim(),
              apiKey || loadApiKey(),
              getResearchModel(site.id)
            )) || primaryKeyword.trim();
            keywordForACF = keywordForACF.trim();
          }
          const acfFields: Record<string, string> = {
            [fieldNames.dateModifier]: todayDate
          };
          if (keywordForACF) acfFields["keyword_focus"] = keywordForACF;

          // Origin: only set if entity is valid AND not already present (keep service/entity unchanged)
          const originKey = fieldNames.origin;
          const hasExistingOrigin = existingAcfFields[originKey] != null && String(existingAcfFields[originKey]).trim().length > 0;
          if (entity && entity.trim() && entity.trim() !== 'N/A' && entity.trim().toLowerCase() !== 'none' && !hasExistingOrigin) {
            acfFields[originKey] = entity.trim();
          }
          
          // Never overwrite service_area_fields or service_area; do not add them to acfFields.
          
          // === STEP: Create FAQ Schema (ALWAYS GENERATE) ===
          // Always generate FAQ schema - use PAA questions if available, otherwise analyze blog content with AI
          setProgress({ 
            step: 'Creating FAQ Schema...', 
            progress: 93, 
            message: faqQuestions && faqQuestions.length > 0 
              ? `Generating FAQ schema with ${Math.min(faqQuestions.length, 4)} PAA questions...`
              : `Analyzing blog content to generate FAQ questions...`
          });
          
          try {
            let questionsToUse = faqQuestions && faqQuestions.length > 0 
              ? faqQuestions 
              : [];
            
            // If no PAA questions, use AI to generate questions from blog content
            if (questionsToUse.length === 0) {
              const openRouterApiKey = apiKey || loadApiKey();
              if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
                console.log('[WordPress Uploader] No PAA questions - generating questions from blog content using AI...');
                // Extract NAP locations for North American focus
                const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
                questionsToUse = await generateQuestionsFromContent(htmlContent, primaryKeyword, openRouterApiKey, napLocations);
              } else {
                console.warn('[WordPress Uploader] No API key available - using fallback questions');
                // Fallback questions based on primary keyword (North America focused)
                questionsToUse = [
                  `What is ${primaryKeyword}?`,
                  `How does ${primaryKeyword} work?`,
                  `Why is ${primaryKeyword} important?`,
                  `Where can I find ${primaryKeyword} in North America?`
                ];
              }
            }
            
          // Always generate FAQ schema (never skip) - pass NAP locations for North American focus
          const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
          const faqSchema = generateFAQSchema(questionsToUse, primaryKeyword, entity, site.siteUrl, napLocations);
          acfFields[fieldNames.faq] = faqSchema;
          console.log(`[WordPress Uploader] FAQ Schema created successfully with ${questionsToUse.length} questions`);
        } catch (faqError) {
          console.warn('[WordPress Uploader] Failed to generate FAQ schema:', faqError);
          // Generate fallback FAQ schema even on error (North America focused)
          const fallbackQuestions = [
            `What is ${primaryKeyword}?`,
            `How does ${primaryKeyword} work?`,
            `Why is ${primaryKeyword} important?`,
            `Where can I find ${primaryKeyword} in North America?`
          ];
          const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
          acfFields[fieldNames.faq] = generateFAQSchema(fallbackQuestions, primaryKeyword, entity, site.siteUrl, napLocations);
          console.log('[WordPress Uploader] Using fallback FAQ schema');
        }
        
        // === STEP: Set AI-generated meta description in custom ACF field ===
        // Use the same method as FAQ - set meta_description/seo_meta_description ACF field with AI-generated excerpt
        if (plainTextExcerpt && plainTextExcerpt.trim().length > 0) {
          acfFields[fieldNames.metaDescription] = plainTextExcerpt;
          console.log(`[WordPress Uploader] Meta description set in ACF field: ${plainTextExcerpt.length} characters`);
        } else {
          console.warn(`[WordPress Uploader] No excerpt available to set in ${fieldNames.metaDescription} ACF field`);
        }
        
        // === STEP: Handle Extra Text and Extra Image for Pages ONLY ===
        if (isPage) {
          // Always overwrite seo_extra_text when new content is provided (user had Extra Text checked); never preserve existing ACF value
          if (extraTextContent && extraTextContent.trim().length > 0) {
            const extraTextHtml = markdownToHtml(extraTextContent.trim());
            acfFields[fieldNames.extraText] = extraTextHtml;
            console.log(`[WordPress Uploader] Extra text converted to HTML (p tags, links) and set in ACF field: ${extraTextHtml.length} characters`);
          }
          
          // Upload extra image and get media ID if provided (only for pages)
          if (extraImageBase64) {
            try {
              setProgress({ 
                step: 'Uploading extra image...', 
                progress: 94, 
                message: 'Uploading extra image to WordPress media library...' 
              });
              
              // Convert base64 to data URL format for upload
              const imageDataUrl = `data:image/png;base64,${extraImageBase64}`;
              const imageFilename = `extra-image-${primaryKeyword.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
              const extraImageAlt = primaryKeyword ? `Image for ${primaryKeyword}` : undefined;
              const mediaResult = await uploadWordPressMedia(
                site.siteUrl,
                site.username,
                site.appPassword,
                imageDataUrl,
                imageFilename,
                `Extra image for ${primaryKeyword}`,
                extraImageAlt
              );
              
              if (mediaResult.success && mediaResult.mediaId) {
                acfFields[fieldNames.extraImage] = mediaResult.mediaId;
                console.log(`[WordPress Uploader] Extra image uploaded and set in ACF field: Media ID ${mediaResult.mediaId}`);
              } else {
                console.warn('[WordPress Uploader] Failed to upload extra image:', mediaResult.error);
              }
            } catch (imageError) {
              console.error('[WordPress Uploader] Error uploading extra image:', imageError);
              // Don't fail the entire operation if image upload fails
            }
          }
        }

        // keyword_focus: location-free value for ACF (same as acfFields["keyword_focus"])
        const keywordForFocus = keywordForACF || (primaryKeyword && primaryKeyword.trim() ? primaryKeyword.trim() : '');
        if (keywordForFocus) {
          console.log(`[WordPress Uploader] keyword_focus in payload: "${keywordForFocus}"`);
        }

          // === STEP: Update ACF Fields ===
          // Set progress message based on what fields we're updating
          const fieldsToUpdate = Object.keys(acfFields);
          setProgress({ 
            step: 'Updating ACF fields...', 
            progress: 95, 
            message: `Writing ${fieldsToUpdate.join(', ')} to WordPress...` 
          });
          console.log(`[WordPress Uploader] Will update ACF fields: ${fieldsToUpdate.join(', ')}`);
          
          const acfUpdateResult = await updateACFFields(
            site.siteUrl,
            site.username,
            site.appPassword,
            result.postId,
            acfFields,
            context.existingPost?.post_type || 'post',
            postTypeEndpoint
          );
          
          if (acfUpdateResult.success) {
            const updatedFields = acfUpdateResult.updated.join(', ');
            console.log(`[WordPress Uploader] Successfully updated ACF fields [${updatedFields}] for post ID ${result.postId}`);
          } else {
            console.warn(`[WordPress Uploader] Failed to update ACF fields:`, acfUpdateResult.error || acfUpdateResult.failed);
            // Don't fail the entire operation if ACF update fails
          }

          // Always write keyword_focus via post meta so it persists (ACF REST often doesn't return it on read)
          if (keywordForFocus && keywordForFocus.trim()) {
            try {
              const metaResult = await updateWordPressPostMeta(
                site.siteUrl,
                site.username,
                site.appPassword,
                result.postId,
                context.existingPost?.post_type || 'post',
                postTypeEndpoint,
                { keyword_focus: keywordForFocus.trim() }
              );
              if (metaResult.success) {
                console.log(`[WordPress Uploader] keyword_focus written via post meta for post ID ${result.postId}`);
              } else {
                console.warn(`[WordPress Uploader] keyword_focus post-meta failed:`, metaResult.error);
              }
            } catch (metaErr) {
              console.warn(`[WordPress Uploader] keyword_focus post-meta error:`, metaErr);
            }
          }
        }
      } catch (acfError) {
        console.warn(`[WordPress Uploader] Error updating ACF fields:`, acfError);
        // Don't fail the entire operation if ACF update fails
      }
    }
  } else {
    // For drafts, use the blueprint title or existing title. Pages: never adjust title.
    let draftTitle: string;
    if (isPage) {
      draftTitle = existingTitle || primaryKeyword;
    } else if (shouldOptimizeTitle) {
      draftTitle = blueprintResult.title || existingTitle || primaryKeyword;
      draftTitle = draftTitle.replace(/\s*\(?\s*[Oo]ptimized\s*\)?\s*/g, '').trim();
    } else {
      draftTitle = existingTitle || primaryKeyword;
    }
    
    if (!isPage) {
      const blueprintEntity = (blueprintResult as any)?.entity;
      if (!blueprintEntity || blueprintEntity === 'N/A') {
        const cleanedDraftTitle = cleanTitleForNonEntity(draftTitle, blueprintEntity || 'N/A');
        if (cleanedDraftTitle !== draftTitle) {
          console.log('[WordPress Uploader] Cleaned location mentions from draft title:', {
            original: draftTitle,
            cleaned: cleanedDraftTitle,
            entity: blueprintEntity || 'N/A'
          });
          draftTitle = cleanedDraftTitle;
        }
      }
      if (shouldOptimizeTitle) {
        const originalLength = draftTitle.length;
        draftTitle = truncateTitleForSEO(draftTitle, 50);
        if (originalLength > 50) {
          console.log('[WordPress Uploader] Truncated draft title to 50 characters (Death Star module requirement):', {
            original: draftTitle.substring(0, originalLength),
            truncated: draftTitle,
            originalLength,
            truncatedLength: draftTitle.length
          });
        }
      }
    }
    
    finalTitle = draftTitle;

    // Use entityEndpoint directly - NO normalization
    const postTypeEndpoint = entityEndpoint;

    // Extract slug from URL
    let slug: string | undefined;
    if (context.url) {
      try {
        const urlObj = new URL(context.url);
        const pathname = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
        const pathSegments = pathname.split('/').filter(s => s.length > 0);
        // Get the last path segment (the actual slug)
        if (pathSegments.length > 0) {
          slug = pathSegments[pathSegments.length - 1];
          // Remove any file extensions
          slug = slug.replace(/\.(html?|php)$/i, '');
          console.log(`[Optimize Content] Extracted slug from URL: "${slug}" (from: ${context.url})`);
        }
      } catch (error) {
        console.warn(`[Optimize Content] Failed to parse URL for slug extraction: ${context.url}`, error);
        // If URL parsing fails, try manual extraction
        const parts = context.url.replace(/\/$/, '').split('/');
        const lastPart = parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '');
        if (lastPart && !lastPart.includes('http')) {
          slug = lastPart;
          console.log(`[Optimize Content] Manually extracted slug: "${slug}"`);
        }
      }
    }

    // If we couldn't extract a valid slug from URL, use the resolved slug or existing post slug
    if (!slug && context.resolved?.slug) {
      slug = context.resolved.slug;
      console.log(`[Optimize Content] Using resolved slug: "${slug}"`);
    } else if (!slug && context.existingPost?.slug) {
      slug = context.existingPost.slug;
      console.log(`[Optimize Content] Using existing post slug: "${slug}"`);
    }

    // For NEW posts only: use short SEO slug when no slug yet or slug is title-like (very long).
    // Never change URL for existing posts (update path does not touch slug).
    if (!slug || slug.length > 50) {
      try {
        const seoSlug = await generateSEOSlug(draftTitle, primaryKeyword, entity, apiKey || loadApiKey());
        if (seoSlug && seoSlug.length >= 2) {
          slug = seoSlug;
          console.log(`[Optimize Content] Using SEO slug for new post: "${slug}"`);
        }
      } catch (err) {
        console.warn('[Optimize Content] SEO slug generation failed, using existing slug or title-derived:', err);
      }
    }

    console.log('[Optimize Content] Creating draft:', {
      postTypeEndpoint: postTypeEndpoint,
      resolvedSubtype: context.resolved?.subtype,
      existingPostEndpoint: context.existingPost?.postTypeEndpoint,
      slug: slug,
      url: context.url
    });
setProgress({ step: 'Creating draft...', progress: 92, message: `Creating new draft: "${draftTitle}" in ${postTypeEndpoint} endpoint...` });

    // Extract author from existing post (preserve original author)
    const existingAuthor = context.existingPost?.author || context.existingPost?.author_id;
    const authorId = typeof existingAuthor === 'object' && existingAuthor.id 
      ? existingAuthor.id 
      : typeof existingAuthor === 'number' 
        ? existingAuthor 
        : typeof existingAuthor === 'string' && !isNaN(parseInt(existingAuthor))
          ? parseInt(existingAuthor)
          : undefined;

    console.log('[WordPress Uploader] Creating post in DRAFT mode:', {
      postTypeEndpoint,
      slug,
      hasFeaturedImage: !!featuredImageId,
      draftTitle
    });
    // Create post WITHOUT excerpt first (WordPress will auto-generate, but we'll override it in final step)
result = await createWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      draftTitle,
      contentForUpdate, // Always optimized content – overwrite existing (posts and pages)
      undefined, // DO NOT set excerpt here - will be set as final step
      'draft',
      undefined,
      featuredImageId,
      undefined,
      undefined,
      undefined, // No internal type - use endpoint directly
      postTypeEndpoint, // Use entityEndpoint directly - NO normalization
      slug,
      authorId
    );
    
    console.log('[WordPress Uploader] Post creation result (DRAFT mode):', {
      success: result.success,
      postId: result.postId,
      link: result.link,
      status: result.status,
      error: result.error,
      title: result.title
    });

    // After successful draft creation, set ACF fields
    if (result.success && result.postId) {
      try {
        // AGENTIC: Fetch actual ACF fields and discover field mapping
        setProgress({ 
          step: 'Discovering ACF fields...', 
          progress: 92, 
          message: 'Fetching ACF fields to determine field names...' 
        });

        const postType = context.resolved?.subtype || 'post';
        const acfResult = await getACFFieldsForPost(
          site,
          result.postId,
          postType,
          postTypeEndpoint
        );

        const existingAcfFields = acfResult.success && acfResult.fields ? acfResult.fields : {};
        
        // Use AI to discover field mapping
        const openRouterApiKey = apiKey || loadApiKey();
        const fieldMapping = await discoverACFFieldMapping(
          existingAcfFields,
          postType,
          openRouterApiKey || '',
          site.siteUrl
        );

        // Use discovered mapping, with fallbacks for missing fields
        const fieldNames = {
          dateModifier: fieldMapping.dateModifier || 'date_modifier',
          faq: fieldMapping.faq || 'faq',
          metaDescription: fieldMapping.metaDescription || 'meta_description',
          promptModifier: fieldMapping.promptModifier || 'prompt_modifier',
          extraText: fieldMapping.extraText || 'seo_extra_text',
          extraImage: fieldMapping.extraImage || 'seo_extra_image',
          origin: fieldMapping.origin || 'origin',
          keywordFocus: fieldMapping.keywordFocus || 'keyword_focus'
        };

        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // ACF keyword_focus: location-free seed only (AI strips geolocations). DFS/content use full primaryKeyword.
        let keywordForACFDraft = '';
        if (primaryKeyword && primaryKeyword.trim()) {
          keywordForACFDraft = (await stripLocationsFromKeywordForACF(
            primaryKeyword.trim(),
            apiKey || loadApiKey(),
            getResearchModel(site.id)
          )) || primaryKeyword.trim();
          keywordForACFDraft = keywordForACFDraft.trim();
        }
        // Build ACF fields object - always include date_modifier and chosen keyword
        const acfFields: Record<string, string> = {
          [fieldNames.dateModifier]: todayDate
        };
        if (keywordForACFDraft) acfFields["keyword_focus"] = keywordForACFDraft;
        
        // Origin: only set if entity is valid AND not already present (keep service/entity unchanged)
        const originKey = fieldNames.origin;
        const hasExistingOrigin = existingAcfFields[originKey] != null && String(existingAcfFields[originKey]).trim().length > 0;
        if (entity && entity.trim() && entity.trim() !== 'N/A' && entity.trim().toLowerCase() !== 'none' && !hasExistingOrigin) {
          acfFields[originKey] = entity.trim();
        }
        
        // Never overwrite service_area_fields or service_area; do not add them to acfFields.
        
        // === STEP: Create FAQ Schema (ALWAYS GENERATE) ===
        setProgress({ 
          step: 'Creating FAQ Schema...', 
          progress: 93, 
          message: faqQuestions && faqQuestions.length > 0 
            ? `Generating FAQ schema with ${Math.min(faqQuestions.length, 4)} PAA questions...`
            : `Analyzing blog content to generate FAQ questions...`
        });
        
        try {
          let questionsToUse = faqQuestions && faqQuestions.length > 0 
            ? faqQuestions 
            : [];
          
          // If no PAA questions, use AI to generate questions from blog content
          if (questionsToUse.length === 0) {
            const openRouterApiKey = apiKey || loadApiKey();
            if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
              console.log('[WordPress Uploader] DRAFT: No PAA questions - generating questions from blog content using AI...');
              // Extract NAP locations for North American focus
              const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
              questionsToUse = await generateQuestionsFromContent(htmlContent, primaryKeyword, openRouterApiKey, napLocations);
            } else {
              console.warn('[WordPress Uploader] DRAFT: No API key available - using fallback questions');
              // Fallback questions based on primary keyword (North America focused)
              questionsToUse = [
                `What is ${primaryKeyword}?`,
                `How does ${primaryKeyword} work?`,
                `Why is ${primaryKeyword} important?`,
                `Where can I find ${primaryKeyword} in North America?`
              ];
            }
          }
          
          // Always generate FAQ schema (never skip) - pass NAP locations for North American focus
          const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
          const faqSchema = generateFAQSchema(questionsToUse, primaryKeyword, entity, site.siteUrl, napLocations);
          acfFields[fieldNames.faq] = faqSchema;
          console.log(`[WordPress Uploader] DRAFT: FAQ Schema created successfully with ${questionsToUse.length} questions`);
        } catch (faqError) {
          console.warn('[WordPress Uploader] DRAFT: Failed to generate FAQ schema:', faqError);
          // Generate fallback FAQ schema even on error (North America focused)
          const fallbackQuestions = [
            `What is ${primaryKeyword}?`,
            `How does ${primaryKeyword} work?`,
            `Why is ${primaryKeyword} important?`,
            `Where can I find ${primaryKeyword} in North America?`
          ];
          const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
          acfFields[fieldNames.faq] = generateFAQSchema(fallbackQuestions, primaryKeyword, entity, site.siteUrl, napLocations);
          console.log('[WordPress Uploader] DRAFT: Using fallback FAQ schema');
        }
        
        // === STEP: Set AI-generated meta description in custom ACF field ===
        // Use the same method as FAQ - set meta_description/seo_meta_description ACF field with AI-generated excerpt
        if (plainTextExcerpt && plainTextExcerpt.trim().length > 0) {
          acfFields[fieldNames.metaDescription] = plainTextExcerpt;
          console.log(`[WordPress Uploader] DRAFT: Meta description set in ACF field: ${plainTextExcerpt.length} characters`);
        } else {
          console.warn(`[WordPress Uploader] DRAFT: No excerpt available to set in ${fieldNames.metaDescription} ACF field`);
        }
        
        // === STEP: Handle Extra Text and Extra Image for Pages ===
        if (isPage) {
          // Always overwrite extra text when new content is provided (user had Extra Text checked)
          if (extraTextContent && extraTextContent.trim().length > 0) {
            const extraTextHtml = markdownToHtml(extraTextContent.trim());
            acfFields[fieldNames.extraText] = extraTextHtml;
            console.log(`[WordPress Uploader] DRAFT: Extra text converted to HTML (p tags, links) and set in ACF field: ${extraTextHtml.length} characters`);
          }
          
          // Upload extra image and get media ID if provided
          if (extraImageBase64) {
            try {
              setProgress({ 
                step: 'Uploading extra image...', 
                progress: 94, 
                message: 'Uploading extra image to WordPress media library...' 
              });
              
              // Convert base64 to data URL format for upload
              const imageDataUrl = `data:image/png;base64,${extraImageBase64}`;
              const imageFilename = `extra-image-${primaryKeyword.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
              const extraImageAltDraft = primaryKeyword ? `Image for ${primaryKeyword}` : undefined;
              const mediaResult = await uploadWordPressMedia(
                site.siteUrl,
                site.username,
                site.appPassword,
                imageDataUrl,
                imageFilename,
                `Extra image for ${primaryKeyword}`,
                extraImageAltDraft
              );
              
              if (mediaResult.success && mediaResult.mediaId) {
                acfFields[fieldNames.extraImage] = mediaResult.mediaId;
                console.log(`[WordPress Uploader] DRAFT: Extra image uploaded and set in ACF field: Media ID ${mediaResult.mediaId}`);
              } else {
                console.warn('[WordPress Uploader] DRAFT: Failed to upload extra image:', mediaResult.error);
              }
            } catch (imageError) {
              console.error('[WordPress Uploader] DRAFT: Error uploading extra image:', imageError);
              // Don't fail the entire operation if image upload fails
            }
          }
        }

        // keyword_focus: location-free value for ACF (same as acfFields["keyword_focus"])
        const keywordForFocusDraft = keywordForACFDraft || (primaryKeyword && primaryKeyword.trim() ? primaryKeyword.trim() : '');
        if (keywordForFocusDraft) {
          console.log(`[WordPress Uploader] DRAFT: keyword_focus in payload: "${keywordForFocusDraft}"`);
        }
        
        // === STEP: Update ACF Fields ===
        // Set progress message based on what fields we're updating
        const fieldsToUpdate = Object.keys(acfFields);
        setProgress({ 
          step: 'Updating ACF fields...', 
          progress: 95, 
          message: `Writing ${fieldsToUpdate.join(', ')} to WordPress...` 
        });
        console.log(`[WordPress Uploader] DRAFT: Will update ACF fields: ${fieldsToUpdate.join(', ')}`);
        
        const acfUpdateResult = await updateACFFields(
          site.siteUrl,
          site.username,
          site.appPassword,
          result.postId,
          acfFields,
          'post', // Draft mode uses default post type
          postTypeEndpoint
        );

        if (acfUpdateResult.success) {
          const updatedFields = acfUpdateResult.updated.join(', ');
          console.log(`[WordPress Uploader] DRAFT: Successfully updated ACF fields [${updatedFields}] for post ID ${result.postId}`);
        } else {
          console.warn(`[WordPress Uploader] DRAFT: Failed to update ACF fields:`, acfUpdateResult.error || acfUpdateResult.failed);
          // Don't fail the entire operation if ACF update fails
        }

        if (keywordForFocusDraft && keywordForFocusDraft.trim()) {
          try {
            const metaResult = await updateWordPressPostMeta(
              site.siteUrl,
              site.username,
              site.appPassword,
              result.postId,
              'post',
              postTypeEndpoint,
              { keyword_focus: keywordForFocusDraft.trim() }
            );
            if (metaResult.success) {
              console.log(`[WordPress Uploader] DRAFT: keyword_focus written via post meta for post ID ${result.postId}`);
            } else {
              console.warn(`[WordPress Uploader] DRAFT: keyword_focus post-meta failed:`, metaResult.error);
            }
          } catch (metaErr) {
            console.warn(`[WordPress Uploader] DRAFT: keyword_focus post-meta error:`, metaErr);
          }
        }
      } catch (acfError) {
        console.warn(`[WordPress Uploader] DRAFT: Error updating ACF fields:`, acfError);
        // Don't fail the entire operation if ACF update fails
      }
    }
  }

  console.log('[WordPress Uploader] Final result check:', {
    success: result.success,
    postId: result.postId,
    link: result.link,
    status: result.status,
    error: result.error,
    hasPostId: !!result.postId,
    hasLink: !!result.link
  });
if (!result.success) {
    console.error('[WordPress Uploader] ❌ Post creation FAILED:', {
      error: result.error,
      postId: result.postId,
      link: result.link
    });
throw new Error(result.error || 'Failed to save post');
  }

  console.log('[WordPress Uploader] ✅ Post upload SUCCESSFUL:', {
    postId: result.postId,
    link: result.link,
    status: result.status,
    title: result.title,
    finalTitle
  });

  // FINAL STEP: Set AI-generated meta description as excerpt AFTER everything is done
  // This ensures WordPress doesn't overwrite it with auto-generated excerpt from content
  if (result.success && result.postId && plainTextExcerpt && plainTextExcerpt.trim().length > 0) {
    try {
      setProgress({ step: 'Setting final meta description...', progress: 99, message: 'Updating excerpt with AI-generated meta description (final step)...' });
      
      console.log('[WordPress Uploader] FINAL STEP: Setting AI-generated meta description as excerpt:', {
        postId: result.postId,
        excerptLength: plainTextExcerpt.length,
        excerptPreview: plainTextExcerpt.substring(0, 100)
      });

      // Get the endpoint that was used for the post (use entityEndpoint which is available in both update and create paths)
      const finalPostTypeEndpoint = entityEndpoint;

      // Update ONLY the excerpt field using updateWordPressPost with all other fields unchanged
      const excerptUpdateResult = await updateWordPressPost(
        site.siteUrl,
        site.username,
        site.appPassword,
        result.postId,
        finalTitle, // Keep same title
        contentForUpdate, // Keep same content
        plainTextExcerpt, // SET AI-generated meta description as excerpt (FINAL STEP)
        result.status as 'draft' | 'publish', // Keep same status
        context.existingPost?.post_type || 'post',
        featuredImageId, // Keep same featured image
        undefined,
        undefined,
        undefined, // Keep same slug
        finalPostTypeEndpoint
      );

      if (excerptUpdateResult.success) {
        console.log('[WordPress Uploader] ✅ FINAL STEP: AI-generated meta description set as excerpt successfully');
        setProgress({ step: 'Complete', progress: 100, message: 'AI-generated meta description set as excerpt (final step complete)' });
      } else {
        console.warn('[WordPress Uploader] ⚠️ FINAL STEP: Failed to set excerpt:', excerptUpdateResult.error);
      }
    } catch (excerptError) {
      console.error('[WordPress Uploader] ❌ FINAL STEP: Error setting excerpt:', excerptError);
      // Don't fail the entire operation if excerpt update fails
    }
  }

// Origin is now extracted fresh via AI in updateACFOriginField, not preserved from existing post
  return {
    result,
    postId: result.postId!,
    link: result.link || '',
    finalTitle
  };
}

