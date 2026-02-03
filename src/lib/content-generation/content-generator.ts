/**
 * Content Generator Module
 * Handles markdown content generation, in-content images, and HTML conversion
 */

import { toast } from "sonner";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { markdownToHtml, generateExcerpt } from "@/lib/markdown-to-html";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { generateInContentImage } from "@/lib/in-content-image-generator";
import { insertContentIntoSection } from "@/lib/section-parser";
import type { ImageType } from "@/lib/image-section-analyzer";
import type { WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { 
  extractImagesFromContent, 
  matchImagesToSections, 
  extractH2Headings,
  insertImageIntoSection 
} from "@/lib/content-optimization-helpers";

/**
 * AI-driven function to generate a SEO-optimized meta description
 * Creates a fresh, agentic meta description from WordPress content or keyword+title context
 */
export async function generateMetaDescription(
  markdownContent: string, // This can be WordPress content OR minimal context (keyword + title)
  primaryKeyword: string,
  apiKey: string,
  siteId?: string
): Promise<string> {
  try {
    // CRITICAL: Meta description is INDEPENDENT - but can use WordPress content as context if available
    // Extract text content - remove HTML and markdown formatting
    let textContent = markdownContent
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Remove images
      .replace(/\*\*([^\*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^\*]+)\*/g, '$1') // Remove italic
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 3000); // Use up to 3000 chars if WordPress content is available

    // Get research model
    const researchModel = getResearchModel(siteId);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: researchModel,
        messages: [
          {
            role: "system",
            content: `You are an expert SEO meta description writer. Write ONLY concise meta descriptions for Google search results.

🔥 CRITICAL: This is a SEPARATE META DESCRIPTION for SEO, NOT an excerpt from the blog content, NOT a paragraph from the post, NOT a summary of the article.

You MUST create a BRAND NEW, FRESH meta description that is:
- Written specifically for Google search results (SERP)
- Optimized for click-through rate (CTR)
- Completely independent from the blog content

ABSOLUTE REQUIREMENTS:
- EXACTLY 120-150 characters (count them - this is CRITICAL for SERP display)
- ONE sentence or two short sentences maximum
- Start with direct question or hook ("Looking for...?", "Need...?", "Searching for...?")
- Include key service/benefit (GENERIC service terms, NOT business names)
- End with call to action ("Learn more", "Discover", "Find out", "Get started")
- Plain text ONLY - NO HTML tags, NO <p> tags, NO formatting, NO entities like &hellip;
- Conversational, punchy, attention-grabbing
- Optimized for SERP - this appears in Google search results, make it compelling!

ABSOLUTE FORBIDDEN:
- NO copying text from the content - create something COMPLETELY NEW
- NO "Introduction" or any variation
- NO HTML tags (<p>, <div>, &hellip;, etc.) - PLAIN TEXT ONLY
- NO generic openings ("This article", "In this guide", "Many residents", etc.)
- NO full paragraphs - this is a META DESCRIPTION, not blog content
- NO quotes around text
- NO labels ("Excerpt:", "Meta description:", "Description:", etc.)
- NO company names or competitor names - use GENERIC service terms only
- NO location + business name combinations
- NO ellipsis or truncation indicators (... or &hellip;)

Example (147 characters):
Looking for trusted dental care near Parkallen? Expert family dentistry services including routine cleanings, Invisalign, and emergency care. Schedule your appointment today!

Your output MUST be 120-150 characters. Count them. This is a SEPARATE META DESCRIPTION for Google SERP, NOT a content excerpt. Create something FRESH and NEW, don't copy from the content.`
          },
          {
            role: "user",
            content: `Write a SEPARATE, AGENTIC META DESCRIPTION (120-150 characters) for this blog about "${primaryKeyword}".

🔥 CRITICAL: This is a COMPLETELY INDEPENDENT meta description for Google SERP.
- It is NOT an excerpt from blog content
- It is NOT a paragraph from the post
- It is NOT a summary of the article
- It is a FRESH, NEW meta description written specifically for SEO

You MUST:
- Create a BRAND NEW meta description - do NOT copy text from the content below
- Write it specifically for Google search results (SERP optimization)
- Use GENERIC service terms (e.g., "dental care", "family dentistry", "dental services")
- NEVER include business names, company names, or competitor names
- Focus on the SERVICE/BENEFIT, not the business
- Make it compelling for click-through in search results
- Use the content below ONLY as context to understand the topic - create something NEW

WordPress content (for context only - create a NEW meta description, don't copy):
${textContent.substring(0, 3000)}

Write ONLY the meta description (120-150 characters, plain text, no HTML, no entities, conversational, with call to action, NO business names, completely independent from content):`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    let excerpt = data.choices?.[0]?.message?.content?.trim() || '';
    
    // CRITICAL: Remove ALL HTML tags and entities (AI should not output these, but aggressive cleanup)
    excerpt = excerpt
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/&hellip;/g, '') // Remove HTML ellipsis entity
      .replace(/&nbsp;/g, ' ') // Replace non-breaking space
      .replace(/&[a-z]+;/gi, '') // Remove any other HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Remove quotes, labels, prefixes
    excerpt = excerpt
      .replace(/^["']|["']$/g, '')
      .replace(/^(Excerpt|Meta description|Description|Meta Description):\s*/i, '')
      .replace(/^Introduction:\s*/i, '')
      .replace(/^Many residents/i, '') // Remove common content openings
      .replace(/^This article/i, '')
      .replace(/^In this guide/i, '')
      .trim();
    
    // Final aggressive cleanup - remove any remaining HTML-like patterns
    if (excerpt.includes('<') || excerpt.includes('&')) {
      console.warn('[Content Generator] ⚠️ Meta description still contains HTML-like content, cleaning aggressively');
      excerpt = excerpt.replace(/[<>&]/g, '').trim();
    }
    
    // CRITICAL VALIDATION: Must be 120-150 characters for meta description
    if (!excerpt || excerpt.length < 100) {
      throw new Error(`Meta description too short (${excerpt.length} chars) - must be 120-150 characters`);
    }
    
    // ENFORCE 150 CHARACTER LIMIT - meta descriptions must be concise
    if (excerpt.length > 150) {
      // Truncate at sentence boundary
      const truncated = excerpt.substring(0, 147);
      const lastBreak = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );
      if (lastBreak > 100) {
        excerpt = truncated.substring(0, lastBreak + 1);
      } else {
        // Truncate at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        excerpt = lastSpace > 100 ? truncated.substring(0, lastSpace) + '...' : truncated.substring(0, 147) + '...';
      }
    }
    
    // Final validation - ensure it's a proper meta description
    if (excerpt.length < 100 || excerpt.length > 150) {
      throw new Error(`Meta description invalid length (${excerpt.length} chars) - must be 120-150 characters`);
    }
    
    // CRITICAL: Final check - ensure NO HTML or content excerpt patterns
    if (excerpt.includes('<') || excerpt.includes('&') || excerpt.toLowerCase().includes('many residents') || excerpt.toLowerCase().startsWith('introduction')) {
      console.error('[Content Generator] ❌ Meta description contains HTML or content excerpt patterns:', excerpt);
      throw new Error(`Meta description contains invalid content (HTML or excerpt patterns detected). Must be a fresh, agentic meta description.`);
    }
    
    console.log(`[Content Generator] ✅ AI-generated FRESH agentic meta description (${excerpt.length} chars):`, excerpt);
    return excerpt;
  } catch (error) {
    console.warn('[Content Generator] Failed to generate AI excerpt:', error);
    throw error;
  }
}

export interface ContentGeneratorOptions {
  blueprintResult: any;
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  context: {
    wordPressRAGContext?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    url: string;
    existingContent: string;
    inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
    acfFields?: Record<string, any>; // ACF fields from WordPress post
  };
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  onContentChunk?: (chunk: string) => void;
  shouldOptimizeContent: boolean;
  hasEntityOverride?: boolean; // Manual override: true = force entity mode, false = force no entity, undefined = auto-detect
}

export interface ContentGeneratorResult {
  markdownContent: string;
  htmlContent: string;
  excerpt: string;
}

export async function generateOptimizedContent(
  options: ContentGeneratorOptions
): Promise<ContentGeneratorResult> {
  const {
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    context,
    fileManager,
    setProgress,
    onContentChunk,
    shouldOptimizeContent,
    hasEntityOverride
  } = options;

  // Extract entity from blueprint result (if present)
  // Entity is stored in blueprintResult.entity when blueprint is generated
  // If entity is "N/A" or undefined, this is a regular blog post
  // 
  // MANUAL OVERRIDE LOGIC:
  // - hasEntityOverride === true: Force entity mode (use blueprintResult.entity or title as entity)
  // - hasEntityOverride === false: Force no entity mode (treat as regular blog post)
  // - hasEntityOverride === undefined: Auto-detect from blueprintResult.entity
  let entity: string | undefined;
  
  if (hasEntityOverride === false) {
    // User explicitly disabled entity mode - treat as regular blog post
    entity = undefined;
    console.log('[Content Generator] Entity mode manually DISABLED by user');
  } else if (hasEntityOverride === true) {
    // User explicitly enabled entity mode - use blueprint entity or extract from title
    entity = blueprintResult.entity && blueprintResult.entity !== "N/A" 
      ? blueprintResult.entity 
      : existingTitle || primaryKeyword; // Fallback to title/keyword as entity
    console.log('[Content Generator] Entity mode manually ENABLED by user, entity:', entity);
  } else {
    // Auto-detect from blueprint
    entity = blueprintResult.entity && blueprintResult.entity !== "N/A" 
      ? blueprintResult.entity 
      : undefined;
    console.log('[Content Generator] Entity mode AUTO-DETECTED:', entity ? `"${entity}"` : 'No entity');
  }

  // === DEATHSTAR MODULE: CONTENT GENERATION SPECIFICATION ===
  // This module will generate blog content using the following inputs:
  //
  // KEYWORD:
  //   - PRIMARY KEYWORD: "${primaryKeyword}"
  //   - Will be used as the main SEO target throughout the content
  //   - Will be naturally integrated using semantic variations (95% of mentions)
  //   - Exact match will be limited to 1-2 instances maximum
  //   - Will drive anchor text for internal links
  //
  // TITLE:
  //   - BLUEPRINT TITLE: "${blueprintResult.title || 'N/A'}"
  //   - EXISTING TITLE: "${existingTitle || 'N/A'}"
  //   - FINAL TITLE: Will use blueprint title if available, otherwise existing title, otherwise keyword
  //   - Will be used to structure the article and inform content context
  //   - NO H1 heading will be generated - title is set separately in WordPress
  //
  // ENTITY:
  //   - ENTITY STATUS: ${entity ? `LOCAL/ENTITY-BASED POST for "${entity.trim()}"` : 'REGULAR BLOG POST (NO ENTITY)'}
  //   - ${entity ? `Will use entity "${entity.trim()}" for local optimization and location context` : 'Will generate general informational content with NO location mentions'}
  //   - ${entity ? `Will integrate geographic variations: exact location (2-3x max), broader terms frequently` : 'Will NOT mention any specific locations, cities, or entities'}
  //   - ${entity ? `Will use VARIED PHRASES for entity references (e.g., "near ${entity.trim()}", "residents living by ${entity.trim()}", "the ${entity.trim()} community") instead of repeating "for ${entity.trim()}" or "in ${entity.trim()}"` : 'Will focus on general information applicable broadly'}
  //   - ${entity ? `Will include local expertise examples using varied phrasing to reference "${entity.trim()}" naturally` : 'Will focus on general information applicable broadly'}
  //   - ABSOLUTELY FORBIDDEN: ${entity ? `NEVER use placeholders - always use actual entity: "${entity.trim()}"` : 'NEVER use placeholders like [city], [location], or ANY bracket notation'}
  //
  // PROMPT SELECTION:
  //   - ${entity ? `Using ENTITY-BASED prompt: Local SEO optimization with location context` : 'Using REGULAR BLOG POST prompt: General informational content, no location targeting'}
  // === END DEATHSTAR SPECIFICATION ===

  console.log('[Content Generator] DEATHSTAR MODULE - Content Generation Specification:', {
    primaryKeyword,
    blueprintTitle: blueprintResult.title || 'N/A',
    existingTitle: existingTitle || 'N/A',
    finalTitle: blueprintResult.title || existingTitle || primaryKeyword,
    hasEntity: !!entity,
    entity: entity || 'N/A (regular blog post)',
    promptType: entity ? 'ENTITY-BASED (local SEO)' : 'REGULAR BLOG POST (general informational)',
    blueprintHasEntity: !!blueprintResult.entity
  });

  // Load API key
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  let markdownContent = '';
  
  // CRITICAL: Only generate content if optimizeContent is explicitly enabled
  // Defensive check - log if content generation is being skipped
  if (!shouldOptimizeContent) {
    console.log('[Content Generator] ⚠️ CONTENT GENERATION SKIPPED - shouldOptimizeContent is false', {
      shouldOptimizeContent,
      reason: 'User unchecked Content optimization option'
    });
    // Return existing content without modification - this should never happen as the caller should check first
    // But we include it as a defensive measure
    markdownContent = context.existingContent || '';
  } else {
    // Only generate content if optimizeContent is enabled
    console.log('[Content Generator] ✅ Content generation ENABLED - proceeding with generation');
    toast.info('Generating optimized content... This may take 1-3 minutes for comprehensive articles.');
    setProgress({ step: 'Generating optimized content...', progress: 80, message: 'Initializing content generation...' });

    const { buildSystemPrompt, buildUserPrompt, generateSectionsPrompt } = await import('@/lib/prompt-builders');
    const { streamGeneration } = await import('@/lib/api');

    // Build knowledge base context from WordPress RAG content
    let knowledgeBaseContext = '';
    if (context.wordPressRAGContext && context.wordPressRAGContext.trim().length > 0) {
      knowledgeBaseContext = `=== WORDPRESS CONTENT FOR REFERENCE ===\n${context.wordPressRAGContext}\n=== END WORDPRESS CONTENT ===\n`;
    }

    const sectionsPrompt = generateSectionsPrompt(blueprintResult.agents);
    const systemPrompt = buildSystemPrompt(
      knowledgeBaseContext,
      openRouterApiKey,
      { name: site.name, siteUrl: site.siteUrl },
      context.wordPressPosts,
      context.url, // Pass current page URL to exclude it from links
      entity, // Pass entity (or undefined for regular blog posts)
      site.id, // Pass siteId for cache lookup
      primaryKeyword // Pass primaryKeyword for cache search
    );
    // Extract ACF fields for prompt builder
    // AGENTIC: Check both field name variants (pages use seo_ prefix, posts/service areas use original)
    // This handles reading fields intelligently by checking both variants
    const acfFieldsForPrompt = context.acfFields ? {
      prompt_modifier: context.acfFields.seo_prompt_modifier || context.acfFields.prompt_modifier,
      keyword_focus: context.acfFields.keyword_focus || context.acfFields.seo_keyword_focus,
      service_area_fields: context.acfFields.service_area_fields
    } : undefined;

    const userPrompt = buildUserPrompt(
      blueprintResult.title || existingTitle || primaryKeyword,
      blueprintResult.purpose || `Comprehensive guide about ${primaryKeyword}`,
      sectionsPrompt,
      { name: site.name, siteUrl: site.siteUrl },
      entity, // Pass entity (or undefined for regular blog posts)
      acfFieldsForPrompt // Pass ACF fields to prompt builder
    );

    let lastProgressUpdate = Date.now();
    let lastToastTime = Date.now();
    const progressUpdateInterval = 3000;
    const toastUpdateInterval = 15000;
    const startTime = Date.now();
    
    const timeoutWarning = setTimeout(() => {
      toast.warning('Content generation is taking longer than expected. Still processing...', { duration: 10000 });
    }, 45000);

    setProgress({ step: 'Generating optimized content...', progress: 82, message: 'Streaming content from AI model...' });

    try {
      await streamGeneration({
        apiKey: openRouterApiKey,
        model: getResearchModel(),
        systemPrompt,
        userPrompt,
        temperature: 1.0,
        maxTokens: 16000,
        topP: 0.9,
        onContentChunk: (chunk) => {
          markdownContent += chunk;
          const now = Date.now();
          
          if (onContentChunk) {
            onContentChunk(chunk);
          }
          
          // Update progress every 3 seconds
          if (now - lastProgressUpdate >= progressUpdateInterval) {
            const wordCount = markdownContent.split(/\s+/).length;
            const charCount = markdownContent.length;
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            const wordsPerSecond = elapsedSeconds > 0 ? Math.round(wordCount / elapsedSeconds) : 0;
            
            setProgress({ 
              step: 'Generating optimized content...', 
              progress: Math.min(88, 80 + Math.floor((charCount / 10000) * 8)),
              message: `Writing content... ${wordCount.toLocaleString()} words generated (${wordsPerSecond} words/sec)` 
            });
            
            lastProgressUpdate = now;
          }
          
          // Show "still working" toast every 15 seconds
          if (now - lastToastTime >= toastUpdateInterval) {
            const wordCount = markdownContent.split(/\s+/).length;
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            toast.info(`Still generating... ${wordCount.toLocaleString()} words so far (${elapsedSeconds}s elapsed)`, { 
              duration: 5000,
              id: 'content-generation-progress'
            });
            lastToastTime = now;
          }
        },
      });
      
      clearTimeout(timeoutWarning);
      
      const finalWordCount = markdownContent.split(/\s+/).length;
      const finalCharCount = markdownContent.length;
      const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
      
      setProgress({ 
        step: 'Content generated', 
        progress: 88, 
        message: `Generated ${finalWordCount.toLocaleString()} words in ${totalSeconds}s. Processing...` 
      });
      
      toast.success(`Content generated! ${finalWordCount.toLocaleString()} words, ${finalCharCount.toLocaleString()} characters.`, { duration: 5000 });
    } catch (error) {
      clearTimeout(timeoutWarning);
      throw error;
    }

    if (!markdownContent || markdownContent.trim().length === 0) {
      throw new Error('Content generation returned empty content');
    }

    // Validate that content contains internal links (3-5 per section as specified in blueprint)
    // This is a post-generation check to ensure links were actually included
    try {
      const linkPattern = /\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g;
      const links = markdownContent.match(linkPattern) || [];
      
      // Extract H2 sections to check links per section
      const h2Sections = markdownContent.split(/^##\s+/m).filter(section => section.trim().length > 0);
      
      let sectionsWithLowLinks = 0;
      h2Sections.forEach((section, index) => {
        const sectionLinks = (section.match(linkPattern) || []).length;
        // Check if section has at least 3 links (target is 3-5)
        if (sectionLinks < 3 && index > 0) { // Skip intro section (index 0) as it may have minimal linking
          sectionsWithLowLinks++;
          console.warn(`[Content Generator] Section ${index + 1} has only ${sectionLinks} links (target: 3-5)`);
        }
      });
      
      if (sectionsWithLowLinks > 0) {
        console.warn(`[Content Generator] ⚠️ ${sectionsWithLowLinks} section(s) have fewer than 3 internal links. Total links found: ${links.length}`);
        // Don't throw error - just warn, as the blueprint validation should have caught this
      } else {
        console.log(`[Content Generator] ✅ Content validation: Found ${links.length} total links across ${h2Sections.length} sections`);
      }
    } catch (validationError) {
      // Don't fail content generation if validation fails - just log it
      console.warn('[Content Generator] Link validation check failed:', validationError);
    }

    // Validate and fix colons and em dashes in generated content
    // CRITICAL: This now preserves URLs - colons in https:// and markdown image/link syntax are preserved
    try {
      // Count colons excluding URLs
      const urlPattern = /(https?:\/\/[^\s\)]+|!\[[^\]]*\]\([^\)]+\)|\[[^\]]*\]\([^\)]+\))/g;
      const urlMatches = markdownContent.match(urlPattern) || [];
      const contentWithoutUrls = urlMatches.reduce((acc, url) => acc.replace(url, ''), markdownContent);
      const colonCount = (contentWithoutUrls.match(/:/g) || []).length;
      const emDashPattern = /—|—/g;
      const emDashCount = (contentWithoutUrls.match(emDashPattern) || []).length;
      
      if (colonCount > 0 || emDashCount > 0) {
        // Import sanitization functions
        const { removeColons, removeEmDashes } = await import('@/lib/content-generation/content-sanitizer');
        
        // Remove colons and em dashes (now preserves URLs)
        markdownContent = removeColons(markdownContent);
        markdownContent = removeEmDashes(markdownContent);
        
        console.warn(`[Content Generator] ⚠️ Found and removed ${colonCount} colon(s) and ${emDashCount} em dash(es) from generated content (URLs preserved)`);
      } else {
        console.log(`[Content Generator] ✅ Content validation: No colons or em dashes found`);
      }
    } catch (validationError) {
      // Don't fail content generation if validation fails - just log it
      console.warn('[Content Generator] Colon/em dash validation check failed:', validationError);
    }

    // Save markdown content file
    const markdownFileName = OptimizationFileManager.generateFilename('content', primaryKeyword, 'md');
    fileManager.addFile(
      markdownFileName,
      markdownContent,
      'text/markdown'
    );
  }
  
  // Note: If shouldOptimizeContent is false, markdownContent was already set to existingContent in the if block above

  // Handle in-content image generation if requested
  if (context.inContentImageRequest && markdownContent) {
    try {
      setProgress({ step: 'Generating in-content image...', progress: 87, message: 'Analyzing content and generating image...' });
      toast.info('Generating in-content image...', { duration: 3000 });

      const imageResult = await generateInContentImage({
        markdownContent,
        flowTitle: blueprintResult.title || existingTitle || primaryKeyword,
        flowPurpose: blueprintResult.purpose || `Comprehensive guide about ${primaryKeyword}`,
        imageType: context.inContentImageRequest.imageType,
        site,
        userPrompt: context.inContentImageRequest.userPrompt,
        apiKey: openRouterApiKey,
      });

      // Insert image markdown directly under the H2 section
      console.log('[Content Generation] Inserting in-content image:', {
        sectionHeader: imageResult.sectionHeader,
        markdownImage: imageResult.markdownImage,
        imageUrl: imageResult.imageUrl
      });
      
      const markdownBeforeInsertion = markdownContent;
      markdownContent = insertContentIntoSection(
        markdownContent,
        imageResult.sectionHeader,
        imageResult.markdownImage,
        'start' // Insert right after the H2 header
      );

      // Verify image was inserted
      const imageInserted = markdownContent.includes(imageResult.markdownImage);
      console.log('[Content Generation] Image insertion verification:', {
        imageInserted,
        markdownLengthBefore: markdownBeforeInsertion.length,
        markdownLengthAfter: markdownContent.length,
        markdownImagePreview: imageResult.markdownImage.substring(0, 100)
      });

      if (!imageInserted) {
        console.error('[Content Generation] WARNING: Image markdown not found in content after insertion!');
        toast.warning('Image generated but may not have been inserted correctly. Check console for details.', { duration: 5000 });
      }

      // Update the markdown file with the inserted image
      const markdownFiles = fileManager.getFiles().filter(f => f.name.includes('content') && f.name.endsWith('.md'));
      if (markdownFiles.length > 0) {
        const markdownFile = markdownFiles[0];
        fileManager.removeFile(markdownFile.name);
        fileManager.addFile(
          markdownFile.name,
          markdownContent,
          'text/markdown'
        );
        console.log('[Content Generation] Updated markdown file with inserted image');
      }

      setProgress({ step: 'In-content image generated', progress: 87.5, message: `Image inserted into "${imageResult.sectionHeader}" section` });
      toast.success(`In-content image generated and inserted into "${imageResult.sectionHeader}" section`, { duration: 5000 });
    } catch (error) {
      console.error('[Content Generation] Error generating in-content image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate in-content image';
      toast.warning(`In-content image generation failed: ${errorMessage}. Continuing without image...`, { duration: 7000 });
      // Continue without image - don't fail the entire process
    }
  }

  // === IMAGE PRESERVATION: Extract ONLY REAL images from original post and reinsert into new content ===
  // This preserves ONLY existing, real images when optimizing a post by:
  // 1. Using AI to extract ONLY real images (URL + alt tag) that actually exist in the original content
  // 2. Using AI to determine the best section for each real image based on alt tag and URL
  // 3. Inserting ONLY real images into appropriate sections (excluding intro, conclusion, FAQ)
  // CRITICAL: NEVER creates, generates, or invents images - only preserves images that actually exist
  if (context.existingContent && shouldOptimizeContent && markdownContent) {
    try {
      setProgress({ step: 'Preserving original images...', progress: 87.7, message: 'Extracting images from original content...' });
      
      // Step 1: Extract images from original content using AI
      const originalImages = await extractImagesFromContent(
        context.existingContent,
        openRouterApiKey
      );

      if (originalImages.length > 0) {
        console.log(`[Content Generation] Found ${originalImages.length} REAL images with valid URLs and alt tags from original content to preserve`);
        toast.info(`Found ${originalImages.length} valid images (with URLs and alt tags) to preserve from original post...`, { duration: 3000 });

        setProgress({ step: 'Preserving original images...', progress: 87.8, message: `Matching ${originalImages.length} images to sections...` });

        // Step 2: Get section headings from generated content
        const sectionHeadings = extractH2Headings(markdownContent);
        console.log('[Content Generation] Available sections for image placement:', sectionHeadings);

        // Step 3: Match images to sections using AI (excludes intro, conclusion, FAQ)
        const imageAssignments = await matchImagesToSections(
          originalImages,
          sectionHeadings,
          ['introduction', 'intro', 'conclusion', 'summary', 'faq', 'frequently asked', 'questions'],
          openRouterApiKey
        );

        // Step 4: Insert images into markdown content
        if (imageAssignments.length > 0) {
          setProgress({ step: 'Preserving original images...', progress: 87.9, message: `Inserting ${imageAssignments.length} images into content...` });
          
          for (const assignment of imageAssignments) {
            console.log(`[Content Generation] Inserting image into "${assignment.targetSection}":`, assignment.imageUrl, `Alt: "${assignment.altTag}"`);

            markdownContent = insertImageIntoSection(
              markdownContent,
              assignment.targetSection,
              assignment.imageUrl,
              assignment.altTag
            );
          }
          
          console.log(`[Content Generation] Successfully inserted ${imageAssignments.length} image(s) with valid URLs and alt tags`);

          // Update the markdown file with preserved images
          const markdownFiles = fileManager.getFiles().filter(f => f.name.includes('content') && f.name.endsWith('.md'));
          if (markdownFiles.length > 0) {
            const markdownFile = markdownFiles[0];
            fileManager.removeFile(markdownFile.name);
            fileManager.addFile(
              markdownFile.name,
              markdownContent,
              'text/markdown'
            );
          }

          toast.success(`Preserved ${imageAssignments.length} original images in optimized content`, { duration: 5000 });
          console.log(`[Content Generation] Successfully preserved ${imageAssignments.length} images from original post`);
        } else {
          console.log('[Content Generation] No images with valid URLs and alt text could be matched to sections');
        }
      } else {
        console.log('[Content Generation] No images with valid URLs and alt text found in original content - no images will be placed');
      }
    } catch (error) {
      console.error('[Content Generation] Error preserving original images:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to preserve original images';
      toast.warning(`Image preservation failed: ${errorMessage}. Continuing without preserved images...`, { duration: 5000 });
      // Continue without preserved images - don't fail the entire process
    }
  }

  // Convert to HTML
  const htmlContent = shouldOptimizeContent ? markdownToHtml(markdownContent) : context.existingContent;
  
  // Verify in-content image is in HTML after conversion (if one was generated)
  if (context.inContentImageRequest && shouldOptimizeContent) {
    const imageHtmlPattern = /<img[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/i;
    const hasImageInHtml = imageHtmlPattern.test(htmlContent);
    console.log('[Content Generation] Post-HTML conversion check:', {
      hasImageInHtml,
      htmlContentLength: htmlContent.length,
      htmlPreview: htmlContent.substring(0, 1000)
    });
    if (!hasImageInHtml) {
      console.error('[Content Generation] ERROR: No image HTML found in content after conversion!');
      toast.error('In-content image was not preserved during HTML conversion. Check console for details.', { duration: 7000 });
    }
  }

  // ALWAYS generate engaging, Google-compliant meta description using AI - NO FALLBACKS
  // NEVER output "Introduction" or HTML tags - always full, robust meta description
  setProgress({ step: 'Crafting elegant meta description...', progress: 85, message: 'Generating SEO-optimized meta description excerpt...' });

  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key required to generate meta description. No fallback allowed.');
  }

  // CRITICAL: Meta description is generated INDEPENDENTLY from keyword + title ONLY
  // It does NOT require content - it's a completely separate, agentic SEO meta description
  // This is generated for EVERY blog when the option is enabled, regardless of content generation
  console.log('[Content Generator] 🔥 Generating INDEPENDENT agentic meta description (keyword + title only, NOT content-dependent)');
  
  // Meta description context: keyword + title ONLY (completely independent of content)
  // This ensures meta description is ALWAYS generated independently, not from content
  const metaContext = `Blog post title: "${existingTitle || primaryKeyword}". Primary keyword: "${primaryKeyword}".`;
  const excerpt = await generateMetaDescription(metaContext, primaryKeyword, openRouterApiKey, site.id);
  
  console.log('[Content Generator] ✅ INDEPENDENT meta description generated (not from content):', excerpt.substring(0, 80) + '...');
  
  // Validate excerpt
  if (!excerpt || excerpt.length < 100 || excerpt.length > 150) {
    throw new Error(`Meta description invalid (${excerpt?.length || 0} chars) - must be 120-150 characters. Regenerating...`);
  }
  
  console.log('[Content Generator] AI-generated meta description:', excerpt.length + ' chars');
  setProgress({ step: 'Crafting elegant meta description...', progress: 86, message: `Meta description generated (${excerpt.length} chars)` });
  
  if (shouldOptimizeContent) {
    toast.success('Content converted to HTML. Ready for upload...', { duration: 3000 });
  }

  // Save HTML content file
  const htmlFileName = OptimizationFileManager.generateFilename('content', primaryKeyword, 'html');
  fileManager.addFile(
    htmlFileName,
    htmlContent,
    'text/html'
  );

  return {
    markdownContent,
    htmlContent,
    excerpt
  };
}

