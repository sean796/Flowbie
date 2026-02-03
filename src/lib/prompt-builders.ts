import { AgentConfig } from "@/components/AgentNode";
import { mapFeatureToInstruction } from "./feature-mapping";
import type { KeywordAIAnalysis } from "./keyword-types";
import { searchSiteCache, getSiteCache } from "./wordpress-site-cache";
import { getLocalEntityPhraseExamples, getLocalExpertisePhrase, getLocalGeneralPhrase } from "./local-entity-phrases";

// --- System Prompt Core ---

export const SYSTEM_PROMPT_CORE = `You are a master AI/SEO content strategist and writer. You specialize in creating high-quality, search-optimized content that ranks and converts. Your mastery lies in the elegant and effective integration of semantic triples (SPO) into fluent, natural prose.
--- Global Output Constraints (Mandatory) ---
1. Avoid all em dashes (Unicode U+2014 or U+2013) in output.
2. Never utilize conditional phrasing (e.g., "if X then Y", "it is important to note").
3. Ensure sentence lengths are concise and highly varied for a natural rhythm and flow. Strictly avoid all run-on sentences.
4. CRITICAL: Every sentence in the final output MUST be derived from or constructed as a Subject-Predicate-Object (SPO) semantic triple. Integrate these dense, factual statements *elegantly and seamlessly* for maximum informational density and correct grammatical reading.
5. CRITICAL KEYWORD INTEGRATION: Keywords must be woven into content as a native speaker would naturally write them - never as forced exact-match phrases. Use semantic variations, split keywords across sentences, vary word order, and integrate them contextually. The goal is human readability first, SEO second. Keywords should feel like they belong in the sentence, not like they were inserted for optimization.`;

// --- Core Link Validation Rule (MUST BE ENFORCED) ---
export const CRITICAL_LINK_RULE = `**ABSOLUTELY CRITICAL - LINKS RESTRICTIONS (NO EXCEPTIONS)**:
- **Internal links**: MUST ONLY be derived from the WordPress posts list provided in the system prompt (under "WORDPRESS POSTS SOURCE")
- **External links**: ONLY Wikipedia links are allowed - NO OTHER EXTERNAL SITES (pfwbs.org, cpsc.gov, nbcnews.com, windowcoverings.org, etc. are FORBIDDEN)
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided in research links
- **NEVER use links from Knowledge Base** - Knowledge Base is for content reference ONLY, NOT for linking
- **NEVER create, invent, fabricate, or make up any links, URLs, or web addresses**
- **NEVER use placeholder links, example URLs, or fictional links**
- If the WordPress posts list is empty or contains no suitable links, you MUST NOT create any links - simply skip linking for that section
- Any link that does not come from the WordPress posts list (for internal) or is not Wikipedia (for external) MUST be removed or not used
- DO NOT assume links exist - if a link is not in the WordPress posts list (internal) or is not Wikipedia (external), it does not exist and must not be used
- **CRITICAL: NEVER link to ANY external site except Wikipedia** - This includes competitors, government sites (cpsc.gov, etc.), news sites (nbcnews.com, etc.), industry sites (pfwbs.org, windowcoverings.org, etc.), manufacturer sites, or ANY other external domain - ONLY Wikipedia is allowed`;

// --- Prompt Generation Logic ---

const headingPrefix = (level: number | undefined) => {
  const l = level && level >= 1 && level <= 6 ? level : 2;
  return "#".repeat(l);
};

export const generateSectionsPrompt = (agents: AgentConfig[]): string => {
  const sectionsPrompt = agents.map((agent) => {
    const hasFAQFeature = agent.features?.some(f => {
      return typeof f === 'string' && (f.toLowerCase().trim().includes('[faq]') || f.toLowerCase().trim().includes('faq'));
    }) ?? false;
    
    // For FAQ agents, enforce table format
    if (hasFAQFeature) {
      const tableFormatInstruction = `\n\n**ABSOLUTELY CRITICAL - FAQ TABLE REQUIREMENTS:**
1. **MANDATORY HEADER**: You MUST include a content header BEFORE the table. Format: "## Frequently Asked Questions About [Topic]" where [Topic] is the main subject of the article.

2. **TABLE FORMAT ONLY**: You MUST generate a TWO-COLUMN markdown table with EXACT format:

## Frequently Asked Questions About [Topic]

| Question | Helpful Answer |
|----------|----------------|
| Question 1 text | Answer 1 text (customer-service tone, clear, practical). |
| Question 2 text | Answer 2 text (customer-service tone, clear, practical). |
| Question 3 text | Answer 3 text (customer-service tone, clear, practical). |
| Question 4 text | Answer 4 text (customer-service tone, clear, practical). |

3. **MINIMUM 4 FAQs REQUIRED**: The table MUST contain AT LEAST 4 question-answer pairs. If you have fewer than 4, generate additional relevant questions to reach the minimum of 4.

4. **FORBIDDEN:**
- NO paragraphs outside the table (except the header)
- NO bullet points
- NO numbered lists
- NO text after the table
- **ABSOLUTELY FORBIDDEN: NEVER use colons (\`:\`) anywhere in the content - they break code and must be replaced with periods**
- **ABSOLUTELY FORBIDDEN: NEVER use em dashes (Unicode U+2014 or U+2013) anywhere in the content - they must be replaced with comma and space (\`, \`)**
- **ABSOLUTELY FORBIDDEN: NEVER start table headers with a colon (\`:\`). Table headers must start with \`|\` not \`: |\`**
- **ABSOLUTELY FORBIDDEN: NEVER start table rows with a period (\`.\`), colon (\`:\`), dash (\`-\`), or any other punctuation before the first pipe. Table rows MUST start with \`|\` not \`. |\`, \`: |\`, \`- |\`, etc.**
- **ABSOLUTELY FORBIDDEN: NEVER use Q./A. format (e.g., "Q. Question?" followed by "A. Answer.") - this is NOT a table format. You MUST use proper markdown table rows: \`| Question | Answer |\`**
- **ABSOLUTELY FORBIDDEN: NEVER use headers like "| Q&A |" or malformed table structures - use EXACTLY the format shown above with "Question" and "Helpful Answer" as column headers**
- ONLY the markdown table format shown above

5. **CRITICAL**: EVERY question and answer MUST be in table cells. NO EXCEPTIONS. The header is MANDATORY and must appear BEFORE the table.
6. **CRITICAL TABLE FORMAT**: Markdown tables MUST start with \`|\` (pipe character) - NEVER use \`. |\`, \`: |\`, \`- |\`, or any other character before the first pipe.
7. **ABSOLUTELY FORBIDDEN: NEVER create duplicate headings - the FAQ header "## Frequently Asked Questions About [Topic]" must appear ONLY ONCE, never twice consecutively. If you see the same heading text appearing twice, remove the duplicate immediately.**
8. **ABSOLUTELY FORBIDDEN: NEVER create empty tables - the FAQ table MUST have at least 4 data rows with actual question-answer pairs. Tables with only headers and separator rows but no data will be removed entirely.**`;
      
      let sectionPrompt = `${headingPrefix(agent.headingLevel)} ${agent.title}${tableFormatInstruction}`;
      
      if (agent.h3Enabled && agent.h3Count > 0) {
        // FAQ shouldn't have H3s, but handle it if present
        for (let i = 1; i <= agent.h3Count; i++) {
          sectionPrompt += `\n\n${headingPrefix(agent.headingLevel + 1)} [H3 Title]\n[Content for this subsection]`;
        }
      }
      
      return sectionPrompt;
    }
    
    // Check if this is the first agent (step 1) - treat as opening section with SEO-friendly header
    const isFirstAgent = agent.step === 1;
    
    const featureInstructions = agent.features.map(mapFeatureToInstruction).join(", ");
    const hasListFeature = agent.features.some(f => f.toLowerCase().trim().startsWith('[list]'));
    const sublistPreventionNote = !hasListFeature ? "\nCRITICAL: Do NOT create sublists, bullet lists, or 'Key Features' lists. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement." : "";
    
    // Special handling for first agent: 3 short paragraphs, minimal linking, SEO-friendly header, Focus Keyword at start (Rank Math)
    const firstAgentSpecialInstructions = isFirstAgent 
      ? "\n**CRITICAL FIRST SECTION FORMAT**: Write exactly 3 short split paragraphs (each paragraph should be 2-3 sentences only, keep paragraphs concise and well-spaced). **FOCUS KEYWORD AT START (Rank Math)**: The first paragraph (or first 1-2 sentences) of this section MUST include the article's Focus Keyword (or a natural variation) near the beginning. **MINIMAL LINKING**: Only link the entity name to its Wikipedia page (if entity exists) and the main service/product name to its service page. Do NOT include excessive links - keep the opening section clean and readable. Do NOT be link-stuffy. **CRITICAL**: The header MUST be SEO-friendly and descriptive (e.g., 'Understanding Child Safe Window Treatments', 'Why Window Covering Safety Matters') - NEVER use 'Introduction' or 'Intro'."
      : "";
    
    let contentInstruction = `[Write content for this section based on: ${agent.description}${agent.features.length > 0 ? `\nKey points to cover: ${featureInstructions}` : ''}${firstAgentSpecialInstructions}${sublistPreventionNote}]`;
    let sectionPrompt = `${headingPrefix(agent.headingLevel)} ${agent.title}\n${contentInstruction}`;

    if (agent.h3Enabled && agent.h3Count > 0) {
      // 1. Modify the H2 instruction to only intro text
      const hasListFeatureForH3 = agent.features.some(f => f.toLowerCase().trim().startsWith('[list]'));
      const sublistPreventionNoteForH3 = !hasListFeatureForH3 ? "\nCRITICAL: Do NOT create sublists, bullet lists, or 'Key Features' lists. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement." : "";
      const introInstruction = `[Write a brief, flowing introductory paragraph based on: ${agent.description}${agent.features.length > 0 ? `\nKey points to cover: ${featureInstructions}` : ''}${sublistPreventionNoteForH3}]\n(Do not add any closing text. The following H3 headings are the main body of this section.)`;
      sectionPrompt = `${headingPrefix(agent.headingLevel)} ${agent.title}\n${introInstruction}`;

      // 2. Append the H3 sections with their own instruction blocks
      const hasListFeatureForH3Subsections = agent.features.some(f => f.toLowerCase().trim().startsWith('[list]'));
      const sublistPreventionNoteForH3Subsections = !hasListFeatureForH3Subsections ? "\nCRITICAL: Do NOT create sublists, bullet lists, or 'Key Features' lists. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement." : "";
      for (let i = 1; i <= agent.h3Count; i++) {
        sectionPrompt += `\n\n${headingPrefix(agent.headingLevel + 1)} [CRITICAL: Compose a highly descriptive, SEO-optimized H3 title for this subsection, based on the section's purpose]\n[Write the detailed content for this sub-section${sublistPreventionNoteForH3Subsections}]`;
      }
    }

    return sectionPrompt;
  }).join("\n\n");
  
  return sectionsPrompt;
};

export const buildSystemPrompt = (
  knowledgeBaseContext: string, 
  apiKey: string, 
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  currentPageUrl?: string, // URL of the page currently being optimized
  entity?: string, // Optional entity for local/entity-based posts (if undefined, this is a regular blog post)
  siteId?: string, // Optional site ID for cache lookup
  primaryKeyword?: string, // Optional primary keyword for cache search
  siteSummary?: string // Optional AI summary of site (posts sitemap scraped + summarized) for aligning service-area content
): string => {
  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  const normalizedSiteUrl = connectedSite?.siteUrl ? connectedSite.siteUrl.replace(/\/+$/, '') : '';
  // Normalize current page URL for comparison
  const normalizedCurrentPageUrl = currentPageUrl ? currentPageUrl.replace(/\/+$/, '').toLowerCase() : '';
  
  const targetSiteContext = connectedSite
    ? `\n\n=== CRITICAL: TARGET SITE FOR INTERNAL LINKS ===
Target Website: ${connectedSite.name} (${normalizedSiteUrl})
${normalizedCurrentPageUrl ? `Current Page Being Optimized: ${currentPageUrl}` : ''}
${siteSummary ? `\n**Site summary (align content with this)**: ${siteSummary}` : ''}

ABSOLUTELY CRITICAL LINK REQUIREMENT:
- ALL internal links MUST use the target site URL: ${normalizedSiteUrl}
- NEVER use example.com, placeholder URLs, or any other domain for internal links
- Internal links must ALWAYS be in markdown format: [descriptive anchor text](${normalizedSiteUrl}/path)
- IMPORTANT: If the path already starts with "/", use it directly: [descriptive anchor text](${normalizedSiteUrl}/path)
- NEVER output raw URLs like "https://example.com/page" - ALWAYS use markdown format: [anchor text](url)
- **ABSOLUTELY FORBIDDEN: NEVER use formats like [URL: https://...] or [url: ...] - these are NOT proper markdown links**
- **ABSOLUTELY FORBIDDEN: NEVER append links at the end of sentences like "...description. [URL: https://...]" - links must be integrated contextually into the text**
- Anchor text must be descriptive, natural, and integrated into sentences (e.g., "window treatments for Jensen Beach" not just "click here")
- Links should flow naturally within sentences, not appear as standalone URLs or appended at the end
- **CRITICAL: Links must be contextually integrated - embed them within descriptive text, not as separate elements**
- If the knowledge base provides relative paths, convert them to full URLs using ${normalizedSiteUrl} as the base domain
- Example CORRECT: [energy-efficient shades for coastal homes](${normalizedSiteUrl}/blog/energy-efficient-shades) 
- Example WRONG: https://${normalizedSiteUrl}/blog/energy-efficient-shades (raw URL)
- Example WRONG: [link](${normalizedSiteUrl}/blog/energy-efficient-shades) (non-descriptive anchor)
**ABSOLUTELY CRITICAL - EXTERNAL LINK RESTRICTIONS (NO EXCEPTIONS)**:
- **ONLY Wikipedia links are allowed as external links** - NO OTHER EXTERNAL SITES PERMITTED
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided
- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia
- **NEVER link to government sites, news sites, industry sites, competitor sites, or ANY other external domain** - ONLY Wikipedia
- External links (if Wikipedia) MUST be in markdown format: [descriptive anchor text](https://en.wikipedia.org/...)

**CRITICAL: CURRENT PAGE EXCLUSION**:
${normalizedCurrentPageUrl ? `- NEVER link to the current page being optimized: ${currentPageUrl}` : ''}
${normalizedCurrentPageUrl ? `- If a link matches or is very similar to "${currentPageUrl}", you MUST exclude it` : ''}
${normalizedCurrentPageUrl ? `- Only link to OTHER pages on ${normalizedSiteUrl}, not the page you're currently optimizing` : ''}

**ABSOLUTELY FORBIDDEN EXTERNAL LINKS**:
- pfwbs.org or ANY window covering association sites
- cpsc.gov or ANY government sites (except Wikipedia)

**ABSOLUTELY FORBIDDEN - NEVER CREATE SECTIONS NAMED "EXTERNAL RESOURCES"**:
- **NEVER create any section with a heading containing "External Resources", "External Links", "External References", "External Sites", "External Websites", "Additional Resources", "Helpful Resources", "Useful Resources", or "Related Resources"**
- **NEVER create dedicated sections for external links or resources** - external links (if Wikipedia) should be integrated contextually into relevant sections, not in a separate section
- **Any section with "External Resources" or similar in the heading will be automatically removed** - do NOT create these sections
- nbcnews.com or ANY news sites
- windowcoverings.org or ANY industry sites
- ANY competitor websites
- ANY business websites
- ANY manufacturer websites
- ANY educational sites (except Wikipedia)
- ANY other external site that is NOT Wikipedia

**ONLY ALLOWED LINKS**:
1. **Internal links to ${normalizedSiteUrl}** - These are REQUIRED (3-5 per section)
2. **Wikipedia links ONLY** - https://en.wikipedia.org/... or https://wikipedia.org/... (if explicitly provided in research links)
=== END TARGET SITE CONTEXT ===`
    : "";

  // Get WordPress posts from cache if siteId and primaryKeyword provided, otherwise use provided wordPressPosts
  let postsToUse: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
  
  if (siteId && primaryKeyword) {
    // Try to use cache search
    try {
      const cache = getSiteCache(siteId);
      if (cache) {
        // Search cache for relevant posts based on primary keyword
        const searchResults = searchSiteCache(siteId, primaryKeyword, 50);
        postsToUse = searchResults.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          link: p.link,
          date_gmt: p.date_gmt
        }));
        console.log(`[Prompt Builder] Using ${postsToUse.length} posts from cache search for keyword: ${primaryKeyword}`);
      } else {
        // Fallback to provided wordPressPosts if cache not available
        postsToUse = wordPressPosts || [];
        console.log(`[Prompt Builder] Cache not available, using provided wordPressPosts (${postsToUse.length} posts)`);
      }
    } catch (error) {
      console.warn('[Prompt Builder] Error using cache, falling back to provided wordPressPosts:', error);
      postsToUse = wordPressPosts || [];
    }
  } else {
    // Use provided wordPressPosts
    postsToUse = wordPressPosts || [];
  }

  // Filter out current page from WordPress posts list for linking
  // Note: normalizedCurrentPageUrl is already declared above (line 65)
  const availablePostsForLinking = postsToUse.length > 0
    ? postsToUse.filter(post => {
        if (!normalizedCurrentPageUrl || !post.link) return true;
        const normalizedPostLink = post.link.replace(/\/+$/, '').toLowerCase();
        // Exclude current page and very similar URLs
        return normalizedPostLink !== normalizedCurrentPageUrl && 
               !normalizedPostLink.includes(normalizedCurrentPageUrl.split('/').pop() || '') &&
               !normalizedCurrentPageUrl.includes(normalizedPostLink.split('/').pop() || '');
      })
    : [];
  
  const wordPressPostsContext = postsToUse.length > 0
    ? `\n=== WORDPRESS POSTS SOURCE (CRITICAL) ===
Available WordPress Posts from ${connectedSite?.name || 'target site'} (${postsToUse.length} total, ${availablePostsForLinking.length} available for linking${normalizedCurrentPageUrl ? ` - current page excluded` : ''}${siteId && primaryKeyword ? ` - filtered by keyword: ${primaryKeyword}` : ''}):

${availablePostsForLinking.slice(0, 50).map((post, idx) => {
// Handle excerpt that might be string or object with rendered property
  let excerptText = '';
  if (typeof post.excerpt === 'string') {
    excerptText = post.excerpt;
  } else if (typeof post.excerpt === 'object' && post.excerpt && 'rendered' in post.excerpt) {
    excerptText = post.excerpt.rendered || '';
  } else {
    excerptText = '';
  }
const cleanExcerpt = (excerptText || '').replace(/<[^>]+>/g, '').substring(0, 150);
  return `${idx + 1}. [ID: ${post.id}] "${post.title}"${cleanExcerpt ? ` - ${cleanExcerpt}` : ''}\n   URL: ${post.link || post.slug}`;
}).join('\n\n')}

**ABSOLUTELY CRITICAL LINK REQUIREMENT - WORDPRESS POSTS ONLY (NO EXCEPTIONS)**:
- **ONLY use links from the WordPress posts list above** - These are the ONLY internal links you are allowed to use
- **NEVER create, invent, fabricate, or hallucinate ANY links** - If a link is not EXACTLY in the WordPress posts list above, you MUST NOT use it
- **NEVER construct URLs by guessing paths** - Do NOT create links like "/blog/some-topic" or "/service-area/city" unless that EXACT URL exists in the WordPress posts list above
- **NEVER use external links** that are NOT Wikipedia - ONLY Wikipedia links are allowed as external links (pfwbs.org, cpsc.gov, nbcnews.com, windowcoverings.org, etc. are FORBIDDEN)
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided in research links
- **NEVER use links from knowledge files** - Knowledge files are for content reference ONLY, NOT for linking
- **ALL internal links MUST come from the WordPress posts list above** - Use the EXACT URLs from the list (${availablePostsForLinking.map(p => p.link).filter(Boolean).slice(0, 5).join(', ')}${availablePostsForLinking.length > 5 ? '...' : ''})
- **CRITICAL**: Copy the EXACT URL from the WordPress posts list - do NOT modify, construct, or guess URLs
- When creating links, use markdown format: [descriptive anchor text](EXACT_URL_FROM_WORDPRESS_POSTS_LIST) where the URL is copied EXACTLY from the list above
- If no relevant WordPress post exists for a topic, do NOT create a link for that topic - simply skip linking for that section
- **VALIDATION**: Before including any link, verify it exists EXACTLY in the WordPress posts list above - if it's not there, DO NOT use it

CRITICAL REQUIREMENT: Your content MUST be INFORMED BY these WordPress posts. The generated content should reflect content themes, topics, and structure patterns found in these existing posts.

- Analyze the available WordPress posts to understand the site's content themes and topics
- Generate content that is RELATED to these posts (it can expand on, complement, or build upon these posts)
- Ensure content aligns with the content style and topics present in these WordPress posts
- Use post titles, excerpts, and themes as inspiration for generating relevant content
- The goal is to create content that would naturally fit alongside these existing posts

Do NOT create content that is completely unrelated to these WordPress posts. All content must be contextually relevant to the content shown above.

${normalizedCurrentPageUrl ? `**CRITICAL: NEVER link to the current page** - The page being optimized is "${currentPageUrl}". You MUST NOT include any links to this page in your content. Only link to OTHER pages from the list above.` : ''}
=== END WORDPRESS POSTS SOURCE ===\n`
    : "";

  // Build entity-specific context ONLY if entity is provided (not N/A or undefined)
  const hasEntity = entity && entity.trim() && entity.trim() !== "N/A";
  const entityContext = hasEntity
    ? (() => {
        const entityName = entity.trim();
        const generalExamples = getLocalEntityPhraseExamples(entityName, 'general', 5);
        const expertiseExamples = getLocalEntityPhraseExamples(entityName, 'expertise', 3);
        
        return `\n=== ENTITY/LOCATION-BASED CONTENT ===
This is a LOCAL/ENTITY-BASED blog post targeting: ${entityName}

CRITICAL LOCAL OPTIMIZATION REQUIREMENTS:
- This content is specifically for ${entityName} and should naturally integrate location context
- Use geographic variations naturally: exact location name (2-3 times max), broader geographic terms frequently (e.g., "Alberta area", "New York region")
- **CRITICAL: USE VARIED PHRASES** - Instead of repeatedly saying "for ${entityName}" or "in ${entityName}", use diverse phrases throughout:
  * ${generalExamples.map(ex => `"${ex}"`).join(', ')}
  * Mix these phrases naturally - don't repeat the same phrase multiple times
- Include real-world expertise examples that demonstrate local knowledge using varied phrasing:
  * ${expertiseExamples.map(ex => `"${ex}"`).join(', ')}
  * Use different expertise phrases in different sections to avoid repetition
- Use location naturally - never stuff location keywords or use placeholders
- Content should feel authentic to readers ${getLocalGeneralPhrase(entityName, 0)}, not generic

**CRITICAL: OVER-OPTIMIZATION PREVENTION**:
- Remove 15-20% of primary keyword mentions and replace with natural variations
- Instead of repeating the exact keyword phrase, use alternatives like "local experts", "our team", "specialists", "professionals", or semantic variations
- Example: Instead of "Edmonton SEO experts" repeatedly, use "local experts", "our team", "SEO specialists in the area", "local professionals"
- This prevents keyword stuffing and makes content feel more natural and human-written

**CRITICAL: ANCHOR TEXT OPTIMIZATION**:
- Keep anchor text SHORT and focused - only link the key phrase, NOT entire sentences
- Example CORRECT: "For more information about [window treatment SEO](link), contact us"
- Example WRONG: "[For more information about window treatment SEO and how it can help your business, contact us today](link)"
- Anchor text should be 2-5 words maximum - just the essential keyword phrase
- Never wrap an entire sentence in a link - extract only the relevant phrase

**CRITICAL: PREVENT DOUBLE ANCHOR TAGS**:
- NEVER nest anchor tags inside other anchor tags - this creates invalid HTML: <a><a>text</a></a>
- Check that no link contains another link within it
- If you need to link multiple related terms, create separate links with proper spacing
- Always validate that anchor tags are properly closed and not nested

**CRITICAL: ENGAGEMENT & AUTHENTICITY**:
- Include at least ONE specific "Fun Fact" or unique detail about ${entityName} that proves human knowledge
- Examples: proximity to landmarks (e.g., "near the Whitemud"), historical context, geographic features, local characteristics, notable neighborhoods or areas nearby
- This detail should be specific and verifiable, proving the content wasn't written by generic AI
- Place this naturally within the content - could be in the introduction, a blockquote, or integrated into a section
- Make it feel like someone with local knowledge wrote this, not a template

ABSOLUTELY FORBIDDEN:
- NEVER use placeholder text like "[city]", "[location]", "[area]" - use the actual entity: ${entityName}
- NEVER hardcode placeholders - if mentioning location, use the real entity name
- NEVER use brackets or placeholder syntax in the content
- NEVER use placeholder names like "Dr. [Name]", "[Hygienist Name]", "[Assistant Name]", "[Team Member]", "[Staff Name]"
- NEVER create fake team member lists with placeholder names - if you don't know real names, don't list individuals
- If mentioning staff/team, use general terms like "our experienced team", "our dental professionals", "our skilled hygienists" - NOT placeholder brackets
=== END ENTITY CONTEXT ===`;
      })()
    : `\n=== REGULAR BLOG POST (NO ENTITY) ===
This is a REGULAR blog post with NO specific location/entity targeting.

CRITICAL REQUIREMENTS:
- This is a general informational blog post, NOT location-specific
- Do NOT mention any specific locations, cities, or entities
- Do NOT use placeholders like "[city]", "[location]", or any bracket notation
- Write general, informative content that applies broadly
- Focus on the topic and information, not location-based optimization

ABSOLUTELY FORBIDDEN:
- NEVER use placeholders like "[city]", "[location]", "[area]", or any bracket notation
- NEVER mention specific locations or entities
- NEVER hardcode placeholder text - write natural, general content
- NEVER use placeholder names like "Dr. [Name]", "[Hygienist Name]", "[Assistant Name]", "[Team Member]", "[Staff Name]"
- NEVER create fake team member lists with placeholder names - if you don't know real names, don't list individuals
- If mentioning staff/team, use general terms like "our experienced team", "our professionals", "our skilled staff" - NOT placeholder brackets
=== END REGULAR BLOG POST CONTEXT ===`;

  return `You are an expert SEO content creation AI. You are provided with a knowledge base context and an API key that you MUST use for all content generation tasks.
  
  Your primary role is to act as the overall orchestrator and final content generator, ensuring highly optimized, contextually relevant, and structurally compliant output.
  
  **ABSOLUTELY CRITICAL - FORBIDDEN CHARACTERS**:
  - **NEVER use colons (\`:\`) anywhere in generated content** - they break code and markdown syntax. Replace colons with periods (\`.\`).
  - **NEVER use em dashes (Unicode U+2014 or U+2013) anywhere in generated content** - replace them with comma and space (\`, \`).
  - **CRITICAL TABLE FORMAT**: Markdown tables must start with \`| Header | Header |\` NOT \`: | Header | Header |\`. NEVER use colons before table headers as this breaks markdown syntax.
  - **ABSOLUTELY FORBIDDEN: NEVER start table rows with a period (\`.\`), colon (\`:\`), dash (\`-\`), or any other punctuation before the first pipe. Table rows MUST start with \`|\` not \`. |\`, \`: |\`, \`- |\`, etc. This breaks markdown table syntax.**
  - **ABSOLUTELY FORBIDDEN: NEVER create duplicate headings - if the same heading text appears consecutively, remove the duplicate immediately. Each heading must appear only once. This applies to ALL headings including FAQ headers.**
  - **ABSOLUTELY FORBIDDEN: NEVER include "Article Title:", "**Article Title.**", or any variation of article title labels in your output. The title is set separately and must not appear in the content body.**
  - **ABSOLUTELY FORBIDDEN: NEVER create empty tables - all tables MUST have at least one data row with actual content after the header and separator. Tables with only headers and separator rows (like "| Header | Header |\n|---|---|") will be removed entirely. Tables with empty data rows (whitespace-only cells) will also be removed.**
  - **ABSOLUTELY FORBIDDEN: NEVER create link columns in tables - links must be contextually integrated into existing content columns (features, descriptions, product names, etc.) for better SEO. NEVER use column headers like 'Relevant Internal Links', 'Links', 'Link', 'Direct Link', 'View Product', 'Related Links', or ANY column that serves only to display links. Links should be embedded naturally within content columns using markdown format: [link text](url).**
  - These restrictions apply to ALL content: paragraphs, lists, tables, headings, and any other text elements.
  
  ${knowledgeBaseContext ? "\n=== START KNOWLEDGE BASE ===\n" + knowledgeBaseContext + "\n=== END KNOWLEDGE BASE ===" : ""}${entityContext}${targetSiteContext}${wordPressPostsContext}`;
};

export const buildUserPrompt = (
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string, 
  connectedSite?: { name: string; siteUrl: string },
  entity?: string, // Optional entity for local/entity-based posts (if undefined, this is a regular blog post)
  acfFields?: { // Optional ACF fields from DFS data
    prompt_modifier?: string;
    keyword_focus?: string;
    service_area_fields?: string;
  }
): string => {
  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  const normalizedSiteUrl = connectedSite?.siteUrl ? connectedSite.siteUrl.replace(/\/+$/, '') : '';
  
  const linkInstructions = connectedSite
    ? `\n**CRITICAL LINK REQUIREMENT**: All internal links MUST use the target site URL: ${normalizedSiteUrl}
- NEVER use example.com or placeholder URLs
- Format: ALWAYS use markdown format [descriptive anchor text](${normalizedSiteUrl}/path)
- IMPORTANT: If the path already starts with "/", use it directly: [descriptive anchor text](${normalizedSiteUrl}/path)
- NEVER output raw URLs - ALWAYS wrap them in markdown link format: [anchor text](url)
- **ABSOLUTELY FORBIDDEN: NEVER use formats like [URL: https://...] or [url: ...] - these are NOT proper markdown links**
- **ABSOLUTELY FORBIDDEN: NEVER append links at the end of sentences like "...description. [URL: https://...]" - links must be integrated contextually into the text**
- Anchor text must be descriptive and natural (e.g., "window treatment options" not "click here" or just the URL)
- Links should be integrated naturally into sentences, not appear as standalone URLs or appended at the end
- **CRITICAL: Links must be contextually integrated - embed them within descriptive text, not as separate appended elements**
- Internal links must point to ${normalizedSiteUrl}, not example.com or any other domain
- Example CORRECT: "For more information, see our guide on [energy-efficient window treatments](${normalizedSiteUrl}/blog/energy-efficient-shades)"
- Example WRONG: "For more information, see https://${normalizedSiteUrl}/blog/energy-efficient-shades" (raw URL)

**ABSOLUTELY CRITICAL - EXTERNAL LINK RESTRICTIONS (NO EXCEPTIONS)**:
- **ONLY Wikipedia links are allowed as external links** - NO OTHER EXTERNAL SITES PERMITTED
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided
- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia
- **NEVER link to government sites, news sites, industry sites, competitor sites, manufacturer sites, or ANY other external domain** - ONLY Wikipedia
- Only link to: (1) ${normalizedSiteUrl} (internal links - REQUIRED), (2) Wikipedia links ONLY (if explicitly provided in research links)

**ABSOLUTELY FORBIDDEN - NEVER CREATE SECTIONS NAMED "EXTERNAL RESOURCES"**:
- **NEVER create any section with a heading containing "External Resources", "External Links", "External References", "External Sites", "External Websites", "Additional Resources", "Helpful Resources", "Useful Resources", or "Related Resources"**
- **NEVER create dedicated sections for external links or resources** - external links (if Wikipedia) should be integrated contextually into relevant sections, not in a separate section
- **Any section with "External Resources" or similar in the heading will be automatically removed** - do NOT create these sections
`
    : "";

  // Build entity-specific instructions if entity exists, otherwise regular blog post instructions
  const hasEntity = entity && entity.trim() && entity.trim() !== "N/A";
  const entityInstructions = hasEntity
    ? (() => {
        const entityName = entity.trim();
        const generalExamples = getLocalEntityPhraseExamples(entityName, 'general', 6);
        const expertiseExamples = getLocalEntityPhraseExamples(entityName, 'expertise', 4);
        
        return `\n--- ENTITY/LOCATION-BASED CONTENT INSTRUCTIONS ---
**THIS IS A LOCAL/ENTITY-BASED BLOG POST FOR: ${entityName}**

CRITICAL LOCAL OPTIMIZATION REQUIREMENTS:
- This content is specifically for ${entityName} - integrate location context naturally
- Use geographic variations: exact location name (${entityName}) 2-3 times maximum, broader terms frequently (e.g., "Alberta area", "local region")
- **CRITICAL: USE VARIED PHRASES FOR ENTITY REFERENCES** - Instead of repeatedly using "for ${entityName}" or "in ${entityName}", rotate through diverse phrases:
  * ${generalExamples.map(ex => `"${ex}"`).join(', ')}
  * Use different phrases in different sections to avoid obvious repetition
- Include authentic expertise examples using varied phrasing:
  * ${expertiseExamples.map(ex => `"${ex}"`).join(', ')}
  * Rotate through different expertise phrases - don't use the same one multiple times
- Location density: 1-2% exact location name, 3-5% broader geographic variations
- Make content feel authentic to readers ${getLocalGeneralPhrase(entityName, 1)}, not generic

**CRITICAL: PREVENT OVER-OPTIMIZATION**:
- Reduce primary keyword mentions by 15-20% and replace with natural variations
- Use alternatives like "local experts", "our team", "specialists", "professionals" instead of exact keyword repetition
- Example: Instead of "Edmonton SEO" repeatedly, use "local experts", "our team", "SEO specialists", "local professionals"
- This prevents keyword stuffing and improves readability

**CRITICAL: SHORTEN ANCHOR TEXT**:
- Keep anchor text SHORT (2-5 words maximum) - only link the key phrase, NOT entire sentences
- Example CORRECT: "Learn more about [window treatment SEO](link) from our experts"
- Example WRONG: "[Learn more about window treatment SEO and how it can help your business](link) from our experts"
- Extract only the essential keyword phrase for linking, leave the rest of the sentence unlinked

**CRITICAL: PREVENT DOUBLE ANCHOR TAGS**:
- NEVER nest anchor tags - this creates invalid HTML like <a><a>text</a></a>
- Each link must be independent and properly closed
- If multiple terms need linking, create separate links with proper spacing between them

**CRITICAL: ADD ENGAGING ENTITY DETAILS**:
- Include at least ONE specific "Fun Fact" or unique detail about ${entityName} that demonstrates real local knowledge
- Examples: proximity to landmarks (e.g., "near the Whitemud"), historical significance, geographic features, nearby neighborhoods, local characteristics
- This detail should be specific, verifiable, and prove the content wasn't written by generic AI
- Place it naturally in the content - could be in introduction, a blockquote, or integrated into a section
- Make readers feel like someone with genuine local knowledge wrote this

ABSOLUTELY FORBIDDEN:
- NEVER use placeholder text like "[city]", "[location]", "[area]" - use the actual entity: ${entityName}
- NEVER hardcode placeholders like [${entity.trim()}] or bracket notation
- NEVER use placeholders in any form - if mentioning location, use the real entity name: ${entity.trim()}
- NEVER nest anchor tags or create double <a> tags
- NEVER link entire sentences - only link key phrases (2-5 words)
- If you see any placeholder notation like [city] in the title or instructions, replace it with: ${entityName}
- NEVER use placeholder names like "Dr. [Name]", "[Hygienist Name]", "[Assistant Name]", "[Team Member]", "[Staff Name]"
- NEVER create fake team member lists with placeholder names - if you don't know real names, don't list individuals
- If mentioning staff/team, use general terms like "our experienced team", "our dental professionals", "our skilled hygienists" - NOT placeholder brackets
=== END ENTITY INSTRUCTIONS ===`;
      })()
    : `\n--- REGULAR BLOG POST INSTRUCTIONS (NO ENTITY) ---
**THIS IS A REGULAR INFORMATIONAL BLOG POST WITH NO LOCATION TARGETING**

CRITICAL REQUIREMENTS:
- This is a general blog post, NOT location-specific
- Do NOT mention any specific locations, cities, or geographic entities
- Write general, informative content that applies broadly
- Focus on the topic and information, not location-based optimization

ABSOLUTELY FORBIDDEN:
- NEVER use placeholders like "[city]", "[location]", "[area]", or ANY bracket notation
- NEVER mention specific locations or entities
- NEVER hardcode placeholder text - write natural, general content
- If you see any placeholder notation like [city] in the title, REMOVE IT or write a general title without location
- Write the content as a regular informational blog post with NO location references
- NEVER use placeholder names like "Dr. [Name]", "[Hygienist Name]", "[Assistant Name]", "[Team Member]", "[Staff Name]"
- NEVER create fake team member lists with placeholder names - if you don't know real names, don't list individuals
- If mentioning staff/team, use general terms like "our experienced team", "our professionals", "our skilled staff" - NOT placeholder brackets
=== END REGULAR BLOG POST INSTRUCTIONS ===`;

  // Build ACF field context if provided
  const acfContext = acfFields ? (() => {
    const parts: string[] = [];
    
    if (acfFields.prompt_modifier && acfFields.prompt_modifier.trim().length > 0) {
      parts.push(`**PROMPT MODIFIER (CRITICAL)**: ${acfFields.prompt_modifier.trim()}\nThis modifier should guide the content generation approach, style, or specific focus for this article.`);
    }
    
    if (acfFields.keyword_focus && acfFields.keyword_focus.trim().length > 0) {
      parts.push(`**KEYWORD FOCUS (CRITICAL)**: ${acfFields.keyword_focus.trim()}\nThis is the primary keyword focus for this article. Ensure this keyword is naturally integrated throughout the content.`);
    }
    
    if (acfFields.service_area_fields && acfFields.service_area_fields.trim().length > 0) {
      parts.push(`**SERVICE AREA FIELDS (CRITICAL)**: ${acfFields.service_area_fields.trim()}\nThis contains service area or location-specific data that should be incorporated into the content naturally.`);
    }
    
    return parts.length > 0 ? `\n=== ACF FIELD DATA (FROM DFS) ===\n${parts.join('\n\n')}\n=== END ACF FIELD DATA ===\n` : '';
  })() : '';

  const promptSections = [
    "Write a complete professional blog article in markdown format with the following structure:",
    "",
    `**Article Title**: ${flowTitle || "Untitled Article"}`,
    `**Purpose**: ${flowPurpose}`,
    acfContext,
    "",
    "**CRITICAL - DO NOT INCLUDE H1 HEADING OR ARTICLE TITLE LABELS**: The article title is already set separately. You MUST NOT include an H1 heading (# title) in your output. **ABSOLUTELY FORBIDDEN: NEVER include text like 'Article Title:', '**Article Title.**', or any variation of article title labels in your output - these are metadata only and must not appear in the content body.** Start directly with the first H2 heading from the structure below.",
    "",
    "Follow this EXACT heading structure and order to ensure a logical information flow:",
    "- CRITICAL: The article MUST contain ONLY the headings listed below. You MUST NOT add, delete, or modify any heading levels, counts (e.g., number of H3s), or titles.",
    "- CRITICAL: Do NOT add an H1 heading for the title - the title is already set separately.",
    "",
    `${sectionsPrompt}`,
    "",
    "--- Output Instructions (CRITICAL) ---",
    "- **DO NOT include an H1 heading** - the title is already set separately. Start directly with the first H2 heading from the structure above.",
    "- Use each heading exactly as provided above.",
    "- Write complete, engaging, SEO-optimized content in prose form under each heading.",
    "- **STRICT LENGTH REQUIREMENT**: Unless specified in the section instruction block (e.g. via H3 sub-sections), the content output for *every single heading* MUST be a single, focused paragraph.",
    "- **MANDATORY INTERNAL LINKS REQUIREMENT (3-5 LINKS PER SECTION)**: Every H2 section AND every H3 subsection MUST include 3-5 internal links to other blog posts and pages. This is MANDATORY and cannot be omitted. Internal links must be naturally integrated into the content with descriptive anchor text. Link to related blog articles, service pages, and relevant content.",
    "- **H3 SUBSECTIONS CAN HAVE FULL FEATURES**: H3 sections are NOT limited to just paragraphs. Each H3 subsection CAN and SHOULD include: [LINK] 3-5 internal links, [LIST] bulleted or numbered lists, and [TABLE] tables where appropriate. Distribute these elements across H3s for better content structure.",
    "- REQUIREMENT: You MUST include all requested links and media items, following the specific anchor text and placement rules provided in the system prompt.${linkInstructions}",
    "",
    "- **MANDATORY CONTENT STRUCTURE ELEMENTS (NON-NEGOTIABLE)**:",
    "  - This article MUST contain **AT LEAST 1 TABLE** (comparison table, feature table, specification table, or data table). Tables break up text and improve readability.",
    "  - This article MUST contain **AT LEAST 1 BULLETED LIST** (unordered list for items, features, benefits, or options). Use markdown bullet points (- item).",
    "  - This article MUST contain **AT LEAST 1 NUMBERED LIST** (ordered list for steps, processes, rankings, or sequences). Use markdown numbered list (1. item).",
    "  - These three elements are **REQUIRED** - a blog without all three is INCOMPLETE.",
    "  - If [TABLE] or [LIST] is specified in a section instruction, you MUST include that element in that section.",
    "  - If NO section explicitly specifies [TABLE] or [LIST], you MUST STILL add them to appropriate sections based on content type.",
    "  - Distribute these elements across DIFFERENT sections for visual variety - do not cluster them all in one section.",
    "",
    entityInstructions,
    "- Flow naturally between sections to create one cohesive document.",
    "- **CRITICAL: PREVENT UNNECESSARY SUBLISTS**: Do NOT create sublists, bullet lists, 'Key Features' lists, or any other list format unless the [LIST] feature is explicitly specified in the section instruction OR you are fulfilling the mandatory list requirement above. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement in the section instruction block OR when adding the mandatory bulleted/numbered list.",
    "- Do NOT include lists, tables, etc., beyond the mandatory minimums unless explicitly requested in a feature.",
    "- Do NOT modify the number, level, or exact title of any heading provided in the sectionsPrompt block.",
    "",
    "- **CRITICAL - NEVER MENTION EXTERNAL SITES OR COMPETITORS**:",
    "  - NEVER write content that promotes or dedicates sections to external websites (Houzz, Reddit, Pinterest, Yelp, Amazon, etc.)",
    "  - NEVER mention competitor business names or treat them as authority sources in the content",
    "  - NEVER reference external bloggers, influencers, or experts from other sites by name",
    "  - Focus ONLY on the target site's expertise, products, services, and value proposition",
    "  - If a heading mentions an external site (which it shouldn't), do NOT write content promoting that external site",
    "  - ONLY Wikipedia links are allowed as external links - NO OTHER EXTERNAL SITES (pfwbs.org, cpsc.gov, nbcnews.com, windowcoverings.org, etc. are FORBIDDEN)",
    "",
    "Begin your article now (starting with the first H2 heading, NOT an H1):",
  ];

  return promptSections.join("\n");
};

export const buildPlannerPrompt = (
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string,
  keywordData?: {
    targetKeyword?: string;
    primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
    searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
    semanticKeywords?: string[];
    keywordDifficulty?: number;
  },
  knowledgeFiles?: Array<{ name: string; content: string }>
): string => {
  const keywordSection = keywordData?.targetKeyword ? [
    "",
    "--- Keyword Research & SEO Context ---",
    `**Primary Target Keyword**: ${keywordData.targetKeyword}`,
    keywordData.keywordDifficulty ? `**Keyword Difficulty**: ${keywordData.keywordDifficulty}/100` : "",
    keywordData.searchIntent ? `**Search Intent**: ${keywordData.searchIntent.charAt(0).toUpperCase() + keywordData.searchIntent.slice(1)}` : "",
    keywordData.primaryKeywords && keywordData.primaryKeywords.length > 0 
      ? `**Primary Keywords**: ${keywordData.primaryKeywords.map(k => k.keyword).join(", ")}`
      : "",
    keywordData.semanticKeywords && keywordData.semanticKeywords.length > 0
      ? `**Semantic Keywords**: ${keywordData.semanticKeywords.slice(0, 10).join(", ")}`
      : "",
    "",
    "**CRITICAL SEO REQUIREMENTS**:",
    keywordData.searchIntent === 'informational' 
      ? "- Optimize for informational search intent: focus on educating, explaining, and providing comprehensive information"
      : keywordData.searchIntent === 'commercial'
      ? "- Optimize for commercial search intent: focus on comparing options, features, and helping users make purchase decisions"
      : keywordData.searchIntent === 'transactional'
      ? "- Optimize for transactional search intent: focus on product/service details, pricing, and conversion-focused content"
      : "- Optimize for navigational search intent: focus on brand-specific information and direct answers",
    keywordData.keywordDifficulty && keywordData.keywordDifficulty > 70
      ? "- High keyword difficulty detected: ensure maximum content quality, depth, and comprehensive coverage"
      : keywordData.keywordDifficulty && keywordData.keywordDifficulty < 30
      ? "- Low keyword difficulty: focus on creating high-quality, unique content that stands out"
      : "",
    "- AVOID KEYWORD STUFFING: Use semantic variations as default approach - limit exact full keyword match to 1-2 instances maximum",
    "- Target 1-2% keyword density (lower end) for primary keyword - prioritize natural language over SEO exact matching",
    "- Write natural, conversational content - if keyword usage feels repetitive or robotic, reduce density and increase semantic variation",
    "- Mix anchor text naturally: 50% descriptive phrases, 30% branded text, 20% keyword-rich (avoid exact full phrase repetition)",
    "",
  ].filter(Boolean).join("\n") : "";

  // Check for knowledge graph files
  const knowledgeGraphFiles = knowledgeFiles?.filter(file => 
    file.name.startsWith('knowledge-graph-') && file.name.endsWith('.json')
  ) || [];
  
  const knowledgeGraphSection = knowledgeGraphFiles.length > 0 ? [
    "",
    "--- Knowledge Graph Integration (CRITICAL) ---",
    `**Knowledge Graph File(s) Detected**: ${knowledgeGraphFiles.map(f => f.name).join(", ")}`,
    "",
    "**HOW THE KNOWLEDGE GRAPH WILL BE USED IN THIS BUILD**:",
    "",
    "1. **Keyword Relationship Analysis**: The knowledge graph contains keyword relationships and connections extracted from your website's content. Flowbie will analyze these relationships to:",
    "   - Identify semantically related keywords that should be naturally integrated into the content",
    "   - Understand keyword clusters and topic connections to improve content coherence",
    "   - Discover related concepts and entities that strengthen the article's topical authority",
    "",
    "2. **Semantic Triple Generation**: The knowledge graph's keyword connections will inform the 'Target Semantic Triples' section of your plan. Flowbie will:",
    "   - Extract relevant Subject-Predicate-Object (SPO) triples from keyword relationships in the graph",
    "   - Prioritize triples that connect your target keywords to related concepts found in the graph",
    "   - Ensure semantic triples align with the keyword clusters and relationships identified in the graph",
    "",
    "3. **Content Structure Optimization**: The knowledge graph will guide how sections are structured by:",
    "   - Identifying which keywords naturally group together (based on graph connections)",
    "   - Suggesting logical content flow based on keyword relationships",
    "   - Ensuring related topics are placed in proximity to maximize topical relevance",
    "",
    "4. **SEO Keyword Integration**: Flowbie will use the knowledge graph to:",
    "   - Identify secondary and tertiary keywords that are semantically connected to your primary keyword",
    "   - Ensure keyword variations and related terms are naturally woven throughout the content",
    "   - Maintain keyword density while avoiding keyword stuffing by leveraging graph relationships",
    "",
    "5. **Internal Linking Strategy**: If the knowledge graph contains URL connections, Flowbie will:",
    "   - Identify relevant internal links based on keyword relationships in the graph",
    "   - Suggest anchor text that aligns with keyword connections",
    "   - Ensure link placement supports the semantic structure revealed by the graph",
    "",
    "**CRITICAL INSTRUCTIONS FOR USING KNOWLEDGE GRAPH DATA**:",
    "- The knowledge graph data is provided in the system prompt context - analyze it carefully",
    "- Extract keyword relationships, connection strengths, and semantic clusters from the graph",
    "- Use these relationships to inform your semantic triple selection and keyword integration strategy",
    "- Ensure the content plan reflects the keyword connections and topic relationships found in the graph",
    "- If the knowledge graph shows strong connections between certain keywords, prioritize including those relationships in your plan",
    "",
  ].join("\n") : "";

  const promptSections = [
    "You are the **Lead SEO Content Strategist**. Your task is to analyze the provided article structure and sections to create a detailed, step-by-step **Execution Plan** for the **Drafting AI** to follow. The plan must ensure the output is hyper-SEO-optimized, logically coherent, and meets all structural requirements.",
    "",
    "--- Article Goal and Structure ---",
    `# ${flowTitle || "Untitled Article"}`,
    `**Purpose**: ${flowPurpose}`,
    keywordSection,
    knowledgeGraphSection,
    "Content Structure (The final output MUST strictly adhere to this exact structure):",
    "- CRITICAL: The content MUST contain ONLY the headings listed below. You MUST NOT add, delete, or modify any heading levels, counts (e.g., number of H3s), or titles.",
    sectionsPrompt,
    "",
    "--- Planning Instructions (CRITICAL) ---",
    "You cant end a table like this '| Question | Answer', needs to have all rows and columns filled out, if you dont have the data, you need to make it up, make sure to include the separator line (e.g. `|---|---|\n`) IMMEDIATELY FOLLOWING THE HEADER ROW.",
    "**CRITICAL TABLE LINK RULES - NO LINK COLUMNS ALLOWED**: When creating tables that include links, you MUST integrate links directly into existing columns (features, descriptions, product names, etc.) rather than creating a separate column just for links. Links should be embedded within the content of feature columns, description columns, or as part of heading text (e.g., H3 headings within table cells). **ABSOLUTELY FORBIDDEN: NEVER create a column with headers like 'Direct Link', 'View Product', 'Link', 'Relevant Internal Links', 'Links', 'Related Links', 'Internal Links', or ANY column that serves only to display links.** Links must be contextually integrated into content columns for better SEO. Always integrate links naturally into the relevant content columns using markdown format: `[link text](url)`.",
    "",
    "--- MANDATORY CONTENT STRUCTURE ELEMENTS (NON-NEGOTIABLE) ---",
    "The plan MUST ensure the final article includes ALL THREE of the following elements to break up text and improve readability:",
    "- **AT LEAST 1 TABLE**: Your plan MUST specify at least one section that includes a comparison table, feature table, specification table, or data table. Tables break up wall-of-text content and improve user experience.",
    "- **AT LEAST 1 BULLETED LIST**: Your plan MUST specify at least one section that includes a bulleted (unordered) list for items, features, benefits, or options.",
    "- **AT LEAST 1 NUMBERED LIST**: Your plan MUST specify at least one section that includes a numbered (ordered) list for steps, processes, rankings, or sequences.",
    "- These THREE elements are MANDATORY and non-negotiable. A blog without all three is INCOMPLETE and will fail quality checks.",
    "- Distribute these elements across DIFFERENT sections for visual variety - do not cluster them all in one section.",
    "- In the 'Detailed Feature Implementation' section, ensure you have generated content for at least one table, one bulleted list, and one numbered list.",
    "",
    "--- AI Draft Style Requirements (ALWAYS APPLY) ---",
    "The AI draft must ALWAYS follow these style requirements (regardless of any other instructions):",
    "- The AI draft should NEVER use em dashes (Unicode U+2014 or U+2013).",
    "- The AI should never talk in 'if x, then y' format.",
    "- The AI should never use words like 'delve' or similar flowery language.",
    "- The AI should be engaging and helpful, not flowery language.",
    "",
    "1. Do not start writing the article; only output the plan.",
    "2. **CRITICAL**: The plan MUST include a section titled 'Target Semantic Triples' containing a markdown list of 5-10 high-value Subject-Predicate-Object (SPO) triples. **These triples must be grouped by the specific article heading (H1, H2, or H3) where they are best integrated.** These triples must be unique, highly specific to the content, and utilized for explicit SEO benefit during drafting.",
    "3. **CRITICAL**: Include a brief note under 'Target Semantic Triples' explaining the purpose of incorporating these specific facts (e.g., historical context, product differentiation).",
    "4. **ABSOLUTELY CRITICAL - TARGET LINKS SECTION**: The plan MUST include a section titled 'Target Links' containing a markdown list of all internal and external URLs to be used. **The links must be grouped by the specific article heading (H1, H2, or H3) where they are best integrated.**",
    "",
    `${CRITICAL_LINK_RULE}`,
    "",
    `**CRITICAL LINK FORMAT**: Each link MUST be displayed in markdown format with optimized anchor text AND the full target URL: [optimized anchor text](full-target-url). Example: [window treatments for Atkins Park](https://dminteriorsanddesign.com/hunter-douglas/blinds). NEVER use placeholders or incomplete URLs. NEVER output raw URLs without markdown formatting. **ABSOLUTELY FORBIDDEN: NEVER use formats like [URL: https://...] or [url: ...] - these are NOT proper markdown links and will be removed.** **ABSOLUTELY FORBIDDEN: NEVER append links at the end of sentences or table cells like "...description. [URL: https://...]" - links must be integrated contextually into the text.** Always show the complete, real target link with its optimized anchor text. The anchor text must be descriptive and natural, integrated into sentences (e.g., 'window treatment options' not just 'click here' or the raw URL). Links must flow naturally within the content, not be appended as separate elements.`,
    "",
    "**CRITICAL: COMPETITOR & LOCATION-MISMATCHED LINK EXCLUSION**",
    "- NEVER include links to competitor websites in the 'Target Links' section",
    "- A competitor is any website in the same industry/business category offering similar products or services as the target site",
    "- NEVER include links to businesses in different states/locations that are irrelevant to your target location",
    "- Example: If content is for Florida (e.g., Oldsmar, FL), do NOT link to California businesses (e.g., Home Smart Designs in Fremont, CA)",
    "- NEVER link to Yelp reviews for competitor businesses in different locations - this confuses Google's location understanding and drives traffic away",
    "- NEVER link to businesses that offer similar services in a different state/region - this is a competitor, even if not the same company name",
    "- If a link from the Knowledge Base points to a competitor's website (different domain, same industry) OR a business in a different state/location, you MUST exclude it from the Target Links section",
    "**ABSOLUTELY CRITICAL - EXTERNAL LINK RESTRICTIONS (NO EXCEPTIONS)**:",
    "- **ONLY Wikipedia links are allowed as external links** - NO OTHER EXTERNAL SITES PERMITTED",
    "- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided",
    "- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia",
    "- **NEVER link to government sites, news sites, industry sites, competitor sites, or ANY other external domain** - ONLY Wikipedia",
    "- Only include links to: (1) the target site itself (internal links - REQUIRED), (2) Wikipedia links ONLY (if explicitly provided in research links)",
    "- When evaluating links, check: (a) Is it Wikipedia? If NO, REJECT IT IMMEDIATELY. (b) Is it the connected site? If YES, it's an internal link (allowed). (c) Is it ANY other external site? If YES, REJECT IT IMMEDIATELY",
    "",
    "**CRITICAL - NEVER CREATE SECTIONS ABOUT EXTERNAL SITES OR COMPETITORS**:",
    "- NEVER create headings (H2 or H3) that mention external websites like Houzz, Reddit, Pinterest, Yelp, Amazon, or any third-party platform",
    "- NEVER create dedicated sections about what external sites or communities say (e.g., 'Topic - Houzz', 'According to Reddit', 'What Pinterest Shows')",
    "- NEVER mention competitor business names in headings or as focal points of sections",
    "- NEVER reference external bloggers, influencers, or experts from other sites by name in headings",
    "- The blog is ONLY about the target site's products/services - external platforms are competitors and must NOT be promoted",
    "- Focus ONLY on the target site's expertise, products, services, and value proposition",
    "- FORBIDDEN heading examples: 'What Houzz Says About...', 'Topic - Reddit Community', 'According to [External Site]...'",
    "- ALLOWED heading examples: 'Types of Window Treatments', 'Benefits of Professional Installation', 'How to Choose the Right Blinds'",
    "",
    "**ABSOLUTELY FORBIDDEN**: Creating links, inventing URLs, using placeholder links, or fabricating any web addresses. Any link not found in the Knowledge Base MUST NOT appear in the Target Links section.",
    "**IF NO LINKS AVAILABLE**: If the Knowledge Base is empty or contains no suitable links, you MUST explicitly state 'No links derived from Knowledge Base' in the Target Links section. DO NOT create fake links to fill this requirement.",
    "5. **CRITICAL FEATURE IMPLEMENTATION**: The plan MUST include a final section titled 'Detailed Feature Implementation'. For *every* section (H2 and H3) that has defined 'Key points to cover' via agent features, you MUST generate the complete, high-quality, rich-markdown content (including multiple paragraphs, Markdown lists, and Markdown tables as appropriate) that fully and expertly addresses all keyed features. This content is FINAL and ready for the Drafting AI to integrate directly into the final article under the corresponding heading.",
    "",
    "**ABSOLUTELY CRITICAL LINK REQUIREMENT FOR FEATURE IMPLEMENTATION**:",
    "- When including links in the feature implementation content, you MUST ONLY use links from the 'Target Links' section",
    "- NEVER create, invent, fabricate, or make up any links for the feature implementation",
    "- You MUST use the actual full target URLs with optimized anchor text from the 'Target Links' section",
    "- Format: `[optimized anchor text](full-target-url)` - ALWAYS use markdown format, NEVER raw URLs",
    "- NEVER use placeholders like '[link]', '[URL]', or '[insert link here]'",
    "- **ABSOLUTELY FORBIDDEN: NEVER use formats like [URL: https://...] or [url: ...] - these are NOT proper markdown links and will be removed**",
    "- **ABSOLUTELY FORBIDDEN: NEVER append links at the end of sentences or table cells like '...description. [URL: https://...]' - links must be integrated contextually into the text**",
    "- NEVER output raw URLs like 'https://example.com/page' - ALWAYS wrap in markdown: [descriptive text](url)",
    "- Anchor text must be descriptive and natural, integrated into sentences (e.g., 'energy-efficient window treatments' not 'click here')",
    "- **CRITICAL: Links must be contextually integrated - embed them within descriptive text, not appended as separate elements at the end**",
    "- Always show the complete, real target link with its optimized anchor text exactly as it should appear in the final article",
    "- If the 'Target Links' section states 'No links derived from Knowledge Base', you MUST NOT include any links in the feature implementation content",
    "",
    "**CRITICAL TABLE LINK RULES - NO LINK COLUMNS ALLOWED**: When creating tables that include links, integrate links directly into existing columns (features, descriptions, product names, etc.) rather than creating a separate column just for links. Links can also be placed in H3 headings within table cells. **ABSOLUTELY FORBIDDEN: NEVER create a column with headers like 'Direct Link', 'View Product', 'Link', 'Relevant Internal Links', 'Links', 'Related Links', 'Internal Links', or ANY column that serves only to display links.** Links must be contextually integrated into content columns for better SEO. Always integrate links naturally into relevant content columns using markdown format: `[link text](url)`. Additionally, ensure all links in tables come ONLY from the 'Target Links' section.",
    "6. The plan must have at least 5 major steps for writing the overall structure.",
    "7. Focus on how the writer AI should approach transitions, flow, and the integration of the feature content.",
    "8. Explicitly mention how the SEO keywords, feature points, and links/media from the original prompt should be integrated.",
    "9. The output should be ONLY the plan, containing the numbered steps, triples section, links section, and feature implementation section. Do not include any other text, greetings, or explanations. You MUST explicitly finish the plan with the sentence: 'Plan complete. Passing to Drafting AI now. yOU NEED TO FULLY WRITE OUT TABLES (MAKE ROWS, COLUMNS, AND DATA), LISTS, AND OTHER MARKDOWN ELEMENTS, if the table does not have a specific instruction, you need to make a table with the headers and data you think is relevant. CRITICAL: ALL MARKDOWN TABLES MUST INCLUDE THE SEPARATOR LINE (e.g. `|---|---|\n`) IMMEDIATELY FOLLOWING THE HEADER ROW. CRITICAL: When tables include links, integrate them into existing columns (features, descriptions, headings) rather than creating a separate link column. **ABSOLUTELY FORBIDDEN: NEVER create columns like 'Relevant Internal Links', 'Links', 'Link', 'Direct Link', or ANY column that serves only to display links.** Links can be embedded in features, descriptions, or H3 headings within table cells for better SEO.'",
    "",
    "Based on the required structure, generate the detailed execution plan now:",
  ];

  return promptSections.join("\n");
};

export const buildDraftPrompt = (
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string, 
  plannerOutput: string,
  keywordData?: {
    targetKeyword?: string;
    primaryKeywords?: Array<{ keyword: string; difficulty: number }>;
    searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
    semanticKeywords?: string[];
    keywordDifficulty?: number;
  }
): string => {
  const keywordSection = keywordData?.targetKeyword ? [
    "",
    "--- Keyword Optimization Reminder ---",
    `**Primary Keyword**: ${keywordData.targetKeyword}`,
    keywordData.semanticKeywords && keywordData.semanticKeywords.length > 0
      ? `**Semantic Keywords to Include**: ${keywordData.semanticKeywords.slice(0, 10).join(", ")}`
      : "",
    "- AVOID KEYWORD STUFFING: Use semantic variations as default, not exact matches. Target 1-2% keyword density (lower end)",
    "- Limit exact full keyword match to 1-2 instances maximum in entire article - use partial matches and semantic variations for 95% of mentions",
    "- Write natural, conversational sentences that prioritize reader experience - if content feels repetitive or robotic, reduce keyword density",
    "- Use semantic variations liberally (e.g., 'wood blinds' instead of full exact phrase most of the time)",
    "- Mix anchor text types: 50% natural descriptive phrases, 30% branded text, 20% keyword-rich (avoid exact full phrase overuse)",
    "- Focus on natural language flow - modern SEO (2026 standards) rewards human-sounding content over keyword-optimized repetition",
    "",
    "--- Location/Entity Variation Requirements (CRITICAL) ---",
    "- VARY location mentions - do NOT repeat exact location name repeatedly (e.g., 'Oldsmar' over and over)",
    "- Use exact location name sparingly (2-3 times maximum in entire article)",
    "- Use broader geographic terms frequently (Tampa Bay area, Pinellas County, coastal Florida, regional, local)",
    "- Mix location references: exact name (rare), broader region (common), general area (frequent)",
    "- Example: Instead of 'Oldsmar home' repeatedly, use 'Tampa Bay area home', 'Pinellas County residence', 'local properties' (varied)",
    "- Location density: Target 1-2% for exact location name, use broader geographic variations for 3-5%",
    "",
    "--- Real-World Expertise Examples (MANDATORY - Include in at least one section) ---",
    "- Add authentic experience statements demonstrating expertise (EEAT signals - Experience, Expertise, Authoritativeness, Trustworthiness)",
    "- Use natural, conversational phrasing showing hands-on experience",
    "- Include statements like: 'After installing hundreds of systems in [location variation], we've found...' or 'Our experience serving [broader area] has shown...' or 'Having worked with [location variation] homeowners for over [time period], we've learned...'",
    "- Place real-world examples naturally in Benefits, Features, or How-To sections",
    "- Make it sound specific and genuine - avoid generic statements",
    "- Real-world examples should feel like authentic expertise, not forced SEO content",
    "",
  ].filter(Boolean).join("\n") : "";

  const promptSections = [
    "You are the **Drafting AI / Master Content Writer**. You have received the Execution Plan from the Lead SEO Content Strategist. Your single task is to write a complete, professional blog article **strictly following the provided plan and structure**.",
    "",
    "--- Article Goal and Structure ---",
    `**Article Title**: ${flowTitle || "Untitled Article"}`,
    `**Purpose**: ${flowPurpose}`,
    keywordSection,
    "**CRITICAL - DO NOT INCLUDE H1 HEADING**: The article title is already set separately. You MUST NOT include an H1 heading (# title) in your output. Start directly with the first H2 heading from the structure below.",
    "",
    "Content Structure (The final output MUST strictly adhere to this exact structure and order):",
    sectionsPrompt,
    "",
    "--- Execution Plan (CRITICAL) ---",
    plannerOutput,
    "",
    "--- Output Instructions (CRITICAL) ---",
    "--- AI Draft Style Requirements (ALWAYS APPLY) ---",
    "The AI draft must ALWAYS follow these style requirements (regardless of any other instructions):",
    "- The AI draft should NEVER use em dashes (Unicode U+2014 or U+2013).",
    "- The AI should never talk in 'if x, then y' format.",
    "- The AI should never use words like 'delve' or similar flowery language.",
    "- The AI should be engaging and helpful, not flowery language.",
    "",
    "- **DO NOT include an H1 heading** - the title is already set separately. Start directly with the first H2 heading from the structure above.",
    "- Adhere to all instructions in the Execution Plan.",
    "- **CRITICAL SEMANTIC TRIPLE REQUIREMENT**: Identify the 'Target Semantic Triples' list within the Execution Plan and, using the section headings as a guide, *elegantly* integrate every single triple into the drafted content under the appropriate section. Each triple must be woven into the prose in a grammatically correct and contextually relevant manner for maximum SEO benefit.",
    "- **FEATURE IMPLEMENTATION INSTRUCTION**: Identify the 'Detailed Feature Implementation' section from the Execution Plan. For any section content provided in that block, you MUST use that content *verbatim* in the final article under the corresponding heading. You are NOT allowed to rewrite this content.",
    "",
    "- **MANDATORY CONTENT STRUCTURE ELEMENTS (NON-NEGOTIABLE)**:",
    "  - This article MUST contain **AT LEAST 1 TABLE** (comparison table, feature table, specification table, or data table). Tables break up text and improve readability.",
    "  - This article MUST contain **AT LEAST 1 BULLETED LIST** (unordered list for items, features, benefits, or options). Use markdown bullet points (- item).",
    "  - This article MUST contain **AT LEAST 1 NUMBERED LIST** (ordered list for steps, processes, rankings, or sequences). Use markdown numbered list (1. item).",
    "  - These three elements are **REQUIRED** - a blog without all three is INCOMPLETE and will fail quality checks.",
    "  - If the Execution Plan specifies [TABLE] or [LIST] in a section, you MUST include that element in that section.",
    "  - If the Execution Plan does NOT specify enough of these elements, you MUST add them to appropriate sections based on content type.",
    "  - Distribute these elements across DIFFERENT sections for visual variety.",
    "",
    "- **ABSOLUTELY CRITICAL LINK REQUIREMENT**: Identify the 'Target Links' list within the Execution Plan. Using the section headings as a guide, ONLY use links from this list in the final output under the appropriate section.",
    "",
    "**ABSOLUTELY FORBIDDEN - DO NOT CREATE, INVENT, OR FABRICATE ANY CONTENT**:",
    "- NEVER create, invent, fabricate, or make up any links, URLs, or web addresses",
    "- NEVER use placeholder links, example URLs, or fictional links",
    "- NEVER use placeholder names like 'Dr. [Name]', '[Hygienist Name]', '[Assistant Name]', '[Team Member]', '[Staff Name]' or ANY bracket notation for people",
    "- NEVER create fake team member lists, staff rosters, or employee names with placeholders",
    "- If you need to mention team/staff, use general terms like 'our experienced team', 'our dental professionals', 'our skilled hygienists' - NEVER use brackets",
    "- If the 'Target Links' section states 'No links derived from Knowledge Base', you MUST NOT include any links in your output - simply skip linking entirely",
    "- Any link directives found in the original structure that are NOT present in the 'Target Links' list MUST be completely disregarded and not used",
    "- You must ONLY use the exact links with their optimized anchor text as specified in the 'Target Links' section",
    "- Each link MUST be displayed in markdown format: `[optimized anchor text](full-target-url)`",
    "- **CRITICAL: NEVER output raw URLs** - ALWAYS use markdown format: [descriptive anchor text](url)",
    "- **NEVER write links like**: `https://example.com/page` or `https://intheshadeflorida.com/blog/article`",
    "- **ALWAYS write links like**: `[energy-efficient window treatments](https://intheshadeflorida.com/blog/article)`",
    "- Anchor text must be descriptive and natural, integrated into sentences (e.g., 'window treatment options' not 'click here' or the raw URL)",
    "- Links should flow naturally within sentences, not appear as standalone URLs",
    "- NEVER use placeholders or incomplete URLs",
    "- Always show the complete, real target link with its optimized anchor text exactly as specified in the plan",
    "- If a link is not in the 'Target Links' section, it does not exist and must not be used",
    "- **CRITICAL: NEVER link to competitor websites** - If a link in the 'Target Links' section points to a competitor (different domain, same industry), you MUST NOT use it even if it's in the plan",
    "- A competitor is any website offering similar products/services in the same industry as the target site",
    "- Only use links to: (1) the target site (internal), (2) authoritative non-competitor sources, or (3) manufacturer/supplier sites that are not direct competitors",
    "- **CRITICAL TABLE LINK RULES - NO LINK COLUMNS ALLOWED**: When creating tables that include links, integrate links directly into existing columns (features, descriptions, product names, headings, etc.) rather than creating a separate column just for links. Links can be embedded within feature columns, description columns, product name columns, or as part of H3 headings within table cells. **ABSOLUTELY FORBIDDEN: NEVER create a column with headers like 'Direct Link', 'View Product', 'Link', 'Relevant Internal Links', 'Links', 'Related Links', 'Internal Links', or ANY column that serves only to display links.** Links must be contextually integrated into content columns for better SEO. Always integrate links naturally into relevant content columns using markdown format: `[link text](url)`.",
    "- **CRITICAL DETAIL REQUIREMENT**: When introductory prose is needed before a feature implementation (due to H3 sub-sections), or when connecting two feature blocks is required, you must write highly-detailed, contextual prose to ensure a natural flow. The content should be detailed and authoritative, drawing upon the Knowledge Base context.",
    "- Output MUST be a complete professional blog article in markdown format.",
    "- Do NOT include the Execution Plan or any planning notes in the final output.",
    "- Ensure smooth, flowing transitions between all sections and sub-sections, as if it were written by a single human expert.",
    "- REQUIREMENT: You must include all requested links and media items, following the specific anchor text and placement rules from the system prompt.",
    "",
    "Begin writing the article now (starting with the first H2 heading, NOT an H1):",
  ];

  return promptSections.join("\n");
};

export const buildReviewerPrompt = (draftContent: string, sectionsPrompt: string): string => {
  const promptSections = [
    "You are the **Ultimate Quality Assurance AI / SEO Strategist**. Your task is to critically review the provided draft content for adherence to the Execution Plan and output the revised, finalized version.",
    "",
    "--- CRITICAL: Review Existing Draft Only ---",
    "**YOU MUST ONLY REVIEW AND POLISH THE EXISTING DRAFT CONTENT PROVIDED BELOW.**",
    "**DO NOT generate new sections or duplicate existing sections.**",
    "**DO NOT write content for sections that are already in the draft.**",
    "**Your job is to IMPROVE the existing content, not to rewrite it from scratch.**",
    "",
    "--- Draft Content to Review and Polish ---",
    draftContent,
    "",
    "--- Article Structure Reference (For Verification Only) ---",
    "Use this structure ONLY to verify the draft matches the required structure. DO NOT use this as a template to write new content:",
    sectionsPrompt,
    "",
    "--- Review Instructions (CRITICAL) ---",
    "1. **CRITICAL**: Review and polish ONLY the draft content provided above. Do NOT create duplicate sections or write new content for sections that already exist in the draft.",
    "2. Review the content for: flow, tone, adherence to SEO best practices, grammar, and compliance with all structural and content requirements (e.g., all links/media/keywords included).",
    "3. **Advanced SEO Constraints**: Ensure the content explicitly employs **passage level optimization**, **High entity salience**, and **monosemantic optimization** throughout the text.",
    "4. **ABSOLUTELY CRITICAL LINK VALIDATION CHECK**: Verify that the content integrates all necessary information derived from the planning stage, including the strategic utilization of **all** target semantic triples in their correct sections. Critically assess the elegance, contextual relevance, and grammatical correctness of the SPO integration.",
    "",
    "**MANDATORY LINK VERIFICATION** (MUST BE PERFORMED):",
    "- Find the 'Target Links' section in the Execution Plan and extract the complete list of approved links",
    "- Verify that EVERY link in the draft content exists in the 'Target Links' list from the plan",
    "- If you find ANY link in the draft that is NOT in the 'Target Links' list, you MUST IMMEDIATELY REMOVE it",
    "- REMOVE any fabricated, invented, or made-up links that were not in the plan",
    "- REMOVE any placeholder links, example URLs, or fictional links",
    "- Ensure that only links listed under 'Target Links' in the plan were used in their correct sections with their full URLs and optimized anchor text",
    "- **CRITICAL: Verify ALL links are in proper markdown format** - NO raw URLs should appear in the content",
    "- If you find any raw URLs (like 'https://example.com/page'), convert them to markdown format with descriptive anchor text",
    "- Verify that NO placeholders or incomplete links exist - all links must be complete markdown format: `[optimized anchor text](full-target-url)`",
    "- Anchor text must be descriptive and natural, not generic like 'click here' or just the URL itself",
    "- **CRITICAL: Remove any links to the current page** - If any link points to the page being optimized, you MUST remove it immediately",
    "- **CRITICAL: Remove any competitor links** - If any link points to a competitor website (different domain, same industry) OR a business in a different state/location, you MUST remove it immediately",
    "- A competitor is any website offering similar products/services in the same industry as the target site, OR any business in a different state/location offering similar services",
    "- NEVER allow links to: (a) competitor websites in the same industry, (b) businesses in different states/locations (e.g., California business when content is for Florida), or (c) Yelp/business listing sites for competitors in different locations",
    "- Example: If content is for Oldsmar, FL, remove links to Home Smart Designs in Fremont, CA or Yelp reviews for that business",
    "- Only allow links to: (1) the target site (internal links to OTHER pages, not the current page), (2) authoritative non-competitor sources (Wikipedia, government sites, educational institutions), (3) manufacturer/supplier sites that are not direct competitors, or (4) local relevant businesses in the SAME state/region as target location",
    "- If the plan states 'No links derived from Knowledge Base', verify that NO links appear in the draft and remove any that do",
    "",
    "**CRITICAL TABLE LINK CHECK - NO LINK COLUMNS**: Verify that any tables with links integrate links into existing columns (features, descriptions, headings, etc.) rather than having a separate column just for links. **ABSOLUTELY FORBIDDEN: If you find tables with columns like 'Direct Link', 'View Product', 'Link', 'Relevant Internal Links', 'Links', 'Related Links', 'Internal Links', or ANY column that serves only to display links, you MUST reformat them to integrate links into the relevant content columns or H3 headings within table cells.** Links must be contextually integrated for better SEO. Additionally, verify that all links in tables exist in the 'Target Links' list and remove any that do not.",
    "5. Correct any semantic errors, awkward phrasing, or grammatical mistakes, paying special attention to run-on sentences and conditional phrasing (see global constraints).",
    "6. Check for natural reading flow between paragraphs and main sections, ensuring the final article reads as a cohesive, single document. The structure in the draft MUST match the structure provided above.",
    "7. **NO DUPLICATES**: Ensure each section appears only ONCE in the final output. If a section heading appears multiple times in the draft, merge them into a single, cohesive section. **ABSOLUTELY FORBIDDEN: NEVER create duplicate headings - if you see the same heading text consecutively, remove the duplicate immediately.**",
    "8. The ONLY output should be the final, validated, complete article in Markdown. Do NOT include any of these instructions, review notes, or explanations.",
    "",
    "Output the finalized, polished article (with NO duplicate sections):",
  ];

  return promptSections.join("\n");
};

export const buildFlowAssistSystemPrompt = (
  flowTitle: string, 
  flowPurpose: string, 
  currentPlan: string, 
  knowledgeBaseContext: string,
  sectionStructure?: string
): string => {
  return `You are Flowbie, an expert AI Flow Assistant specializing in plan modification and optimization. Your role is to help users modify execution plans for content generation.

Current Flow Context:
- Title: ${flowTitle || "Untitled Article"}
- Purpose: ${flowPurpose || "Not specified"}

Current Plan:
${currentPlan}

${sectionStructure ? `\n=== DOCUMENT STRUCTURE (for section identification) ===\n${sectionStructure}\n=== END STRUCTURE ===` : ""}

${knowledgeBaseContext ? `\n=== KNOWLEDGE BASE CONTEXT ===\n${knowledgeBaseContext}\n=== END KNOWLEDGE BASE ===` : ""}

CRITICAL: CONTENT CONFLICT PREVENTION
- When generating new blog posts or content, you MUST ensure the content does NOT conflict with or duplicate existing posts in the knowledge base
- If the user instructions mention existing knowledge base posts, analyze them to ensure uniqueness
- The generated content must be unique and add value without overlapping with existing content
- Avoid creating similar titles, topics, or content structures that already exist in the knowledge base

Your task is to:
1. Understand user modification requests
2. Identify which specific sections or agents are affected by the request
3. Generate a clear, actionable checklist of at least 3 steps to update the plan
4. Ensure the checklist addresses all aspects of the user's request
5. Include explicit section/agent references in checklist items when applicable
6. Present the checklist in a clear, numbered format
7. If generating new content, ensure it does not conflict with existing knowledge base posts

When generating checklists, be specific and actionable. Each step should be clear enough to guide plan modification.
For section-specific modifications, include section references in the format: [Section: ## Header Name] or [Agent: agent-id]`;
};

export const buildChecklistGenerationPrompt = (userInstructions: string, sectionStructure?: string): string => {
  return `The user wants to modify the document with the following instructions:

${userInstructions}

${sectionStructure ? `\n=== AVAILABLE SECTIONS/AGENTS ===\n${sectionStructure}\n=== END SECTIONS ===\n\nIMPORTANT: When the modification request targets specific sections or agents, you MUST include explicit references in your checklist items using one of these formats:
- For markdown sections: [Section: ## Header Name] or [Section: ### Subsection Name]
- For blueprint agents: [Agent: agent-id] or [Agent: agent-title]

Example checklist items:
1. Modify [Section: ## Introduction] to add more SEO focus on target keywords
2. Update [Agent: agent-1] description to emphasize technical details
3. Enhance [Section: ### Key Features] with more specific examples

If the request affects the entire document or multiple sections, you can omit section references, but be as specific as possible about which parts need changes.` : ""}

Generate a detailed checklist with at least 3 specific, actionable steps to update the document based on these instructions. Each step should be:
- Clear and specific
- Actionable
- Include section/agent references when applicable (see format above)
- Focused on targeted modifications

Format your response as a numbered list. Do not include any other text, just the checklist items.`;
};

export const buildPlanModificationPrompt = (
  checklist: string[], 
  originalPlan: string, 
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string,
  isPartialContent: boolean = false,
  contextInfo?: string
): string => {
  const partialInstructions = isPartialContent ? `
--- IMPORTANT: PARTIAL CONTENT MODIFICATION ---
You are ONLY modifying specific sections of the plan. The content provided below represents ONLY the sections that need to be changed, along with minimal context from surrounding sections.

${contextInfo ? `Context Information:\n${contextInfo}\n` : ""}

CRITICAL: 
- Only modify the sections provided below
- Maintain the exact structure and format of the provided sections
- Do NOT add new sections unless explicitly requested in the checklist
- Output ONLY the modified sections in the same format as provided
- Preserve all section headers exactly as they appear
- If modifying "Target Semantic Triples" or "Target Links" sections, maintain the grouping by heading structure
- **ABSOLUTELY CRITICAL LINK RULES**: 
  ${CRITICAL_LINK_RULE}
  - All links MUST be displayed in markdown format with optimized anchor text AND full target URLs: \`[optimized anchor text](full-target-url)\`
  - NEVER use placeholders or incomplete URLs
  - Always show the complete, real target link with its optimized anchor text
  - DO NOT add new links unless they exist in the Knowledge Base
  - Any link not from the Knowledge Base MUST be removed
- **CRITICAL TABLE LINK RULES - NO LINK COLUMNS ALLOWED**: When creating or modifying tables that include links, integrate links directly into existing columns (features, descriptions, headings, etc.) rather than creating a separate column just for links. Links can be embedded in features, descriptions, or H3 headings within table cells. **ABSOLUTELY FORBIDDEN: NEVER create a column with headers like 'Direct Link', 'View Product', 'Link', 'Relevant Internal Links', 'Links', 'Related Links', 'Internal Links', or ANY column that serves only to display links.** Links must be contextually integrated into content columns for better SEO.
` : "";

  return `You are the **Lead SEO Content Strategist**. Your task is to modify the existing execution plan based on the provided checklist.

--- Article Goal and Structure ---
# ${flowTitle || "Untitled Article"}
**Purpose**: ${flowPurpose}

Content Structure (The final output MUST strictly adhere to this exact structure):
${sectionsPrompt}

--- Modification Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

${partialInstructions}

--- ${isPartialContent ? "Sections to Modify" : "Original Plan"} ---
${originalPlan}

--- Modification Instructions (CRITICAL) ---
1. Review the modification checklist above.
2. Update the ${isPartialContent ? "provided sections" : "original plan"} according to each checklist item.
3. Maintain all critical sections: Target Semantic Triples, Target Links, and Detailed Feature Implementation.

**ABSOLUTELY CRITICAL LINK RULES WHEN MODIFYING**:
${CRITICAL_LINK_RULE}
- When modifying or maintaining links, ensure they are always displayed in markdown format with optimized anchor text AND full target URLs: \`[optimized anchor text](full-target-url)\`
- NEVER use placeholders or incomplete URLs
- Always show the complete, real target link with its optimized anchor text
- DO NOT add new links unless they exist in the Knowledge Base
- If modifying the 'Target Links' section, only include links that come from the Knowledge Base
- Any link not from the Knowledge Base MUST be removed
4. Ensure the modified plan still follows the same structure and format as the original.
5. ${isPartialContent ? "Output ONLY the modified sections. Maintain exact section boundaries and headers." : "The modified plan must be complete and ready for the Drafting AI."}
6. Output ONLY the modified ${isPartialContent ? "sections" : "plan"}. Do not include any explanations or notes.

Generate the modified ${isPartialContent ? "sections" : "plan"} now:`;
};

export const buildFinalReportModificationPrompt = (
  checklist: string[], 
  originalFinal: string, 
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string,
  isPartialContent: boolean = false,
  contextInfo?: string
): string => {
  const partialInstructions = isPartialContent ? `
--- IMPORTANT: PARTIAL CONTENT MODIFICATION ---
You are ONLY modifying specific sections of the final report. The content provided below represents ONLY the sections that need to be changed, along with minimal context from surrounding sections.

${contextInfo ? `Context Information:\n${contextInfo}\n` : ""}

CRITICAL: 
- Only modify the sections provided below
- Maintain the exact heading structure (##, ###, etc.) as provided
- Do NOT add new sections unless explicitly requested in the checklist
- Output ONLY the modified sections with their headers
- Preserve all markdown formatting
- Ensure smooth transitions if context sections are provided
` : "";

  return `You are the **Ultimate Quality Assurance AI / SEO Strategist**. Your task is to modify the existing final report based on the provided checklist.

--- Article Goal and Structure ---
# ${flowTitle || "Untitled Article"}
**Purpose**: ${flowPurpose}

Content Structure (The final output MUST strictly adhere to this exact structure):
${sectionsPrompt}

--- Modification Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

${partialInstructions}

--- ${isPartialContent ? "Sections to Modify" : "Original Final Report"} ---
${originalFinal}

--- Modification Instructions (CRITICAL) ---
1. Review the modification checklist above.
2. Update the ${isPartialContent ? "provided sections" : "original final report"} according to each checklist item.
3. Maintain the exact heading structure and order as specified above.
4. Ensure all modifications maintain SEO best practices, flow, tone, and grammatical correctness.
5. ${isPartialContent ? "Ensure the modified sections read naturally and maintain consistency with the overall document style." : "Ensure the modified report reads as a cohesive, single document."}
6. **ABSOLUTELY CRITICAL LINK RULES WHEN MODIFYING**:
${CRITICAL_LINK_RULE}
- All links MUST be displayed in markdown format with optimized anchor text AND full target URLs: \`[optimized anchor text](full-target-url)\`
- NEVER use placeholders or incomplete URLs
- Always show the complete, real target link with its optimized anchor text
- DO NOT add new links unless they exist in the Knowledge Base
- If the Execution Plan contains a 'Target Links' section, ONLY use links from that section
- REMOVE any links that are not in the 'Target Links' section of the plan
- Any fabricated or made-up links MUST be removed immediately
7. Output ONLY the modified ${isPartialContent ? "sections in Markdown format" : "final report in Markdown format"}. Do not include any explanations, notes, or the checklist.

Generate the modified ${isPartialContent ? "sections" : "final report"} now:`;
};

export const buildDraftReportModificationPrompt = (
  checklist: string[], 
  originalDraft: string, 
  flowTitle: string, 
  flowPurpose: string, 
  sectionsPrompt: string, 
  plan: string,
  isPartialContent: boolean = false,
  contextInfo?: string
): string => {
  const partialInstructions = isPartialContent ? `
--- IMPORTANT: PARTIAL CONTENT MODIFICATION ---
You are ONLY modifying specific sections of the draft report. The content provided below represents ONLY the sections that need to be changed, along with minimal context from surrounding sections.

${contextInfo ? `Context Information:\n${contextInfo}\n` : ""}

CRITICAL: 
- Only modify the sections provided below
- Maintain the exact heading structure (##, ###, etc.) as provided
- Do NOT add new sections unless explicitly requested in the checklist
- Output ONLY the modified sections with their headers
- Preserve all markdown formatting
- Ensure smooth transitions if context sections are provided
` : "";

  return `You are the **Drafting AI / Master Content Writer**. Your task is to modify the existing draft report based on the provided checklist.

--- Article Goal and Structure ---
# ${flowTitle || "Untitled Article"}
**Purpose**: ${flowPurpose}

Content Structure (The final output MUST strictly adhere to this exact structure):
${sectionsPrompt}

--- Execution Plan (Reference) ---
${plan}

--- Modification Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

${partialInstructions}

--- ${isPartialContent ? "Sections to Modify" : "Original Draft Report"} ---
${originalDraft}

--- Modification Instructions (CRITICAL) ---
1. Review the modification checklist above.
2. Update the ${isPartialContent ? "provided sections" : "original draft report"} according to each checklist item.
3. Maintain the exact heading structure and order as specified above.
4. Ensure all modifications maintain SEO best practices, flow, tone, and grammatical correctness.
5. ${isPartialContent ? "Ensure the modified sections read naturally and maintain consistency with the overall document style." : "Ensure the modified draft reads as a cohesive, single document."}
6. Continue to follow the Execution Plan while incorporating the modifications.
7. **ABSOLUTELY CRITICAL LINK RULES WHEN MODIFYING**:
${CRITICAL_LINK_RULE}
- All links MUST be displayed in markdown format with optimized anchor text AND full target URLs: \`[optimized anchor text](full-target-url)\`
- NEVER use placeholders or incomplete URLs
- Always show the complete, real target link with its optimized anchor text exactly as specified in the Execution Plan
- DO NOT add new links unless they exist in the Knowledge Base
- If the Execution Plan contains a 'Target Links' section, ONLY use links from that section
- REMOVE any links that are not in the 'Target Links' section of the plan
- Any fabricated or made-up links MUST be removed immediately
8. Output ONLY the modified ${isPartialContent ? "sections in Markdown format" : "draft report in Markdown format"}. Do not include any explanations, notes, or the checklist.

Generate the modified ${isPartialContent ? "sections" : "draft report"} now:`;
};

export const buildBlueprintModificationPrompt = (
  checklist: string[], 
  originalBlueprint: string, 
  flowTitle: string, 
  flowPurpose: string,
  isPartialContent: boolean = false,
  contextInfo?: string
): string => {
  const partialInstructions = isPartialContent ? `
--- IMPORTANT: PARTIAL CONTENT MODIFICATION ---
You are ONLY modifying specific agents in the blueprint. The JSON provided below represents ONLY the agents that need to be changed, along with minimal context from surrounding agents.

${contextInfo ? `Context Information:\n${contextInfo}\n` : ""}

CRITICAL: 
- Only modify the agents provided in the "agents" array below
- Maintain the exact structure of all agent objects
- Do NOT add new agents unless explicitly requested in the checklist
- Preserve all agent IDs exactly as provided
- Maintain step ordering relative to the provided agents
- Output ONLY the modified agents array as valid JSON
` : "";

  return `You are the **Blueprint Architect AI**. Your task is to modify the existing blueprint structure based on the provided checklist.

--- Flow Context ---
Title: ${flowTitle || "Untitled Article"}
Purpose: ${flowPurpose || "Not specified"}

--- Modification Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

${partialInstructions}

--- ${isPartialContent ? "Agents to Modify" : "Original Blueprint"} ---
${originalBlueprint}

--- Modification Instructions (CRITICAL) ---
1. Review the modification checklist above.
2. Update the ${isPartialContent ? "provided agents" : "original blueprint JSON"} according to each checklist item.
3. **CRITICAL TITLE AND PURPOSE**: If the checklist mentions generating, creating, updating, or modifying the "title" or "purpose", you MUST include these fields in your output:
   - "title": A clear, SEO-friendly title for the article/flow
   - "purpose": A concise description of the article's purpose
   - These fields should be at the top level of the JSON object (same level as "agents")
4. **CRITICAL AGENT STRUCTURE**: Every agent object MUST have the following exact structure:
   {
     "id": "unique-agent-id-string",
     "step": 1,
     "title": "Agent Title Here",
     "description": "Detailed description of what this agent does",
     "features": ["[LIST]: description", "[LINK]: description", "[IMAGE]: description"],
     "h2Count": 1,
     "h3Count": 0,
     "h3Enabled": false,
     "headingLevel": 2,
     "maxTokens": 2000
   }
4. **CRITICAL AGENT TITLES - CONTEXT-AWARE GENERATION**: 
   - Agent titles MUST be specific and context-aware based on the Flow Title and Purpose above
   - **ABSOLUTELY FORBIDDEN**: NEVER use "Introduction", "Intro", "Overview", "Getting Started", or any generic non-SEO headers
   - The first agent (step 1) MUST have a SEO-friendly, descriptive, agentic header that helps with SEO (e.g., "Understanding Child Safe Window Treatments", "Why Window Covering Safety Matters", "Complete Guide to Child-Safe Blinds")
   - NEVER use generic titles like "A vs. B: Which is Better?", "Introduction", "Conclusion", "Overview", etc.
   - Agent titles MUST reference specific topics, products, services, or concepts from the Flow Title
   - For comparison/versus content: Use specific product/service names from the Flow Title (e.g., "Zebra Shades vs. Roller Blinds: Feature Comparison" instead of "A vs. B: Which is Better?")
   - For AEO content: Use specific questions or topics from the Flow Title
   - For local content: Include location-specific details from the Flow Title
   - Agent titles should be SEO-friendly, specific, and directly related to the Flow Title and Purpose
   - Example: If Flow Title is "Zebra Shades vs. Roller Blinds: Which Is Best for Your Toronto Home", agent titles should be like "Zebra Shades vs. Roller Blinds: Light Control Comparison" NOT "A vs. B: Which is Better?"
5. **CRITICAL**: Use "title" NOT "name" for the agent title field.
6. **CRITICAL**: The "description" field MUST be a string describing what the agent does, and should reference the Flow Title context.
7. **CRITICAL**: The "features" field MUST be an array of strings. Each feature should follow the format: "[TYPE]: description" where TYPE is one of: LIST, LINK, IMAGE, CUSTOM.
8. **ABSOLUTELY MANDATORY INTERNAL LINKS - 3-5 LINKS REQUIRED - WORDPRESS POSTS ONLY**: EVERY agent MUST include a [LINK] feature with format "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list". This is NON-NEGOTIABLE and cannot be omitted. **CRITICAL REQUIREMENTS**:
   - The number "3-5" is MANDATORY - not "some links", not "a few links", but EXACTLY "3-5 internal links"
   - EVERY agent (including introduction, conclusion, FAQ, and all content sections) MUST have this [LINK] feature
   - The format MUST be: "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list"
   - **CRITICAL: ONLY use links from the WordPress posts list for internal links - NEVER use external links (except Wikipedia if explicitly provided) or knowledge file links**
   - **ABSOLUTELY FORBIDDEN external links**: pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site that is NOT Wikipedia
   - Before outputting, verify that EVERY agent has a [LINK] feature with "3-5" specified. If any agent is missing it, add it immediately.
9. **CRITICAL - SINGLE FAQ TABLE ONLY (ALL PAA QUESTIONS GO HERE)**: 
   - Create exactly ONE FAQ agent at the very END of the blog (after conclusion). NEVER create multiple FAQ sections or tables.
   - **ABSOLUTELY FORBIDDEN: FAQ table must ONLY appear at the bottom of the page, never in the middle of content**
   - **NEVER create a "People Also Ask" section or heading** - this is ABSOLUTELY FORBIDDEN.
   - **NEVER create dedicated agents or sections for individual PAA questions** - they ALL go in the FAQ table.
   - ALL FAQ questions AND all PAA questions must be consolidated into this ONE single FAQ table.
   - FAQ agent must use [FAQ]: 2-column Q&A table format and include [LINK]: 3-5 internal links to [related topic pages].
   - **MANDATORY HEADER**: FAQ section MUST start with "## Frequently Asked Questions About [Topic]" header BEFORE the table
   - **MINIMUM 4 FAQs REQUIRED**: The FAQ table MUST contain AT LEAST 4 question-answer pairs
   - **ABSOLUTELY CRITICAL**: When generating FAQ content, you MUST use this EXACT format:
     ## Frequently Asked Questions About [Topic]
     
     | Question | Helpful Answer |
     |----------|----------------|
     | Question 1 | Answer 1 |
     | Question 2 | Answer 2 |
     | Question 3 | Answer 3 |
     | Question 4 | Answer 4 |
   - NO paragraphs, NO lists, NO bullet points. ONLY the header + table format shown above.
   - **CRITICAL TABLE FORMAT**: Markdown tables MUST start with \`|\` (pipe character) - NEVER use \`. |\`, \`: |\`, \`- |\`, or any other character before the first pipe. This breaks markdown table syntax.
   - If you have multiple PAA questions, put them ALL in the SAME FAQ table as rows, not as separate sections.
10. **CRITICAL**: The "id" field MUST be a unique string for each agent (e.g., "agent-1", "agent-2", etc.).
11. **CRITICAL**: The "step" field MUST be a number indicating the order (1, 2, 3, etc.). Steps MUST be sequential and non-overlapping.
12. **CRITICAL**: When adding new agents, ensure step values are sequential (e.g., if you have steps 1, 2, 3 and add a new agent between step 2 and 3, it should be step 3, and the previous step 3 should become step 4).
13. Maintain proper step ordering for all agents.
14. Integrate any new agents into the blueprint structure logically.
15. **FINAL VALIDATION - 3-5 LINKS MANDATORY**: Before outputting, verify that EVERY agent in the blueprint has a [LINK] feature that SPECIFICALLY mentions "3-5 internal links". Count through each agent:
   - Does EVERY agent have a [LINK] feature? If NO, add it immediately.
   - Does the [LINK] feature specify "3-5" (not just "links")? If NO, update it to include "3-5".
   - The format MUST be: "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list"
   - **CRITICAL: ONLY use links from WordPress posts for internal links - NEVER use external links (except Wikipedia if explicitly provided) or knowledge file links**
   - **ABSOLUTELY FORBIDDEN external links**: pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site that is NOT Wikipedia
   - This validation applies to ALL agents: introduction, content sections, conclusion, FAQ - EVERY SINGLE ONE.
16. Ensure the modified blueprint is valid JSON.
17. Output ONLY the ${isPartialContent ? "modified agents array as valid JSON" : "complete modified blueprint JSON"}. Do not include any explanations, notes, or markdown formatting. The output must be valid JSON that can be parsed directly.

Example of a complete agent object (with context-aware title):
If Flow Title is "Zebra Shades vs. Roller Blinds: Which Is Best for Your Toronto Home":
{
  "id": "agent-introduction",
  "step": 1,
  "title": "Zebra Shades vs. Roller Blinds: Toronto Homeowner's Guide",
  "description": "Introduces the comparison between Zebra Shades and Roller Blinds for Toronto homeowners, setting context for the decision-making process",
  "features": ["[LIST]: Key comparison points overview", "[LINK]: 3-5 relevant links to Toronto installation services"],
  "h2Count": 1,
  "h3Count": 0,
  "h3Enabled": false,
  "headingLevel": 2,
  "maxTokens": 2000
}

BAD EXAMPLE (generic title - DO NOT USE):
{
  "title": "A vs. B: Which is Better? 2024 Comparison and Recommendations"
}

GOOD EXAMPLE (context-aware title - USE THIS):
{
  "title": "Zebra Shades vs. Roller Blinds: Feature-by-Feature Breakdown"
}

Generate the modified ${isPartialContent ? "agents" : "blueprint JSON"} now:`;
};

/**
 * Builds a system prompt for generating blog ideas from user prompts
 */
export const buildBulkBlogIdeasSystemPrompt = (
  flowPurpose: string,
  activeKnowledgeBaseText: string,
  numberOfBlogs: number,
  entityMode: 'auto' | 'manual' | 'blank' = 'auto',
  entityValue: string = '',
  keywordMode: 'same' | 'per-blog' | 'gsc-keywords' = 'per-blog',
  keywordValue: string = '',
  optionalPrompt: string = '',
  titleTemplate: string = '',
  featuredImagePerBlog: boolean = true,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  gscExactKeywords?: string[],
  selectedKeywords?: Array<{ primaryKeyword: string; relatedKeywords: string[]; source: 'gsc' | 'kb' | 'combined' }>,
  keywordAnalysisResults?: Map<string, KeywordAIAnalysis>,
  aiThemesToAvoid?: string[]
): string => {
const prompt = `You are Flowbie, an expert AI content strategist specializing in generating multiple blog post ideas from user prompts. Your role is to analyze user requests and create a structured checklist of blog post ideas that can be used for bulk blog generation.

Flow Context:
- Purpose: ${flowPurpose || "Not specified"}

${connectedSite ? `\n=== TARGET SITE CONTEXT ===\nTarget Website: ${connectedSite.name} (${connectedSite.siteUrl})\n\nIMPORTANT: This website is the target topic for all generated blog ideas. Use information about this site as a source of truth for generating relevant, on-brand blog content. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the blog ideas.\n\nAll generated blog ideas should be relevant to ${connectedSite.name} and aligned with its content focus, audience, and brand positioning.\n=== END TARGET SITE CONTEXT ===\n` : ""}

${activeKnowledgeBaseText ? `\n=== KNOWLEDGE BASE CONTEXT (RAG) - CRITICAL FOR BLOG IDEA GENERATION ===\n${activeKnowledgeBaseText}\n=== END KNOWLEDGE BASE ===\n\n**ABSOLUTELY CRITICAL - KNOWLEDGE BASE USAGE**: The knowledge base above contains scraped pages and content from the target site. You MUST use this knowledge base content as the PRIMARY source for generating blog ideas.${connectedSite ? ` Combined with the target site context above, use this knowledge to ensure all blog ideas are highly relevant to ${connectedSite.name}.` : ""}

**CRITICAL REQUIREMENTS FOR KNOWLEDGE BASE USAGE**:
- Analyze the knowledge base content to understand the site's topics, services, products, and content themes
- Generate blog ideas that are DIRECTLY INFORMED BY and RELATED TO the content in the knowledge base
- Extract keywords, topics, and themes from the knowledge base to create relevant blog ideas
- Use the knowledge base to understand what topics the site covers and generate complementary blog ideas
- The knowledge base contains actual page content - use this to identify gaps, related topics, and expansion opportunities
- Blog ideas should feel natural extensions of the content already in the knowledge base
- If the knowledge base contains specific pages about services/products, generate blog ideas that expand on those topics

**PRIORITY**: When both knowledge base and WordPress posts are available, use BOTH sources, but prioritize the knowledge base content as it contains the actual page content and detailed information. WordPress posts provide additional context about existing content structure, but the knowledge base provides the substantive content to inform blog ideas.` : ""}

${wordPressPosts && wordPressPosts.length > 0 ? `\n=== WORDPRESS POSTS SOURCE (ADDITIONAL CONTEXT - INTERNAL LINKS) ===
Available WordPress Posts from ${connectedSite?.name || 'target site'} (${wordPressPosts.length} total):

${wordPressPosts.slice(0, 50).map((post, idx) => {
  return `${idx + 1}. [ID: ${post.id}] "${post.title}"\n   Internal Link: ${post.link || post.slug}`;
}).join('\n\n')}

**SECONDARY SOURCE - USE ALONGSIDE KNOWLEDGE BASE**: These WordPress posts provide additional context about existing content structure and URL patterns. Use them to supplement the knowledge base content, but do NOT rely solely on WordPress posts if knowledge base content is available.

- Analyze the available WordPress posts' titles and internal link URLs to understand the site's content themes and topics
- Use WordPress posts to understand URL patterns and content structure
- Generate blog ideas that complement both the knowledge base content AND these existing WordPress posts
- Ensure each blog idea aligns with the content style and topics from BOTH the knowledge base and WordPress posts
- Use post titles and internal link URL structures as additional inspiration, but prioritize knowledge base content for substantive topic ideas
- Focus on URL patterns, path structure, and title keywords to understand content organization

**PRIORITY**: When both knowledge base and WordPress posts are available, use the knowledge base as the PRIMARY source for blog idea generation (it contains actual page content), and use WordPress posts as SECONDARY context for understanding content structure and URL patterns.

Do NOT generate blog ideas that are completely unrelated to both the knowledge base content and these WordPress posts. All blog ideas must be contextually relevant to the content shown above.

--- AGENTIC INTENT CANNIBALIZATION FILTER (AI-DRIVEN - MANDATORY) ---
**You MUST apply the agentic intent cannibalization filter.** This is an AI-driven filter (not manual): you MUST proactively avoid intent cannibalization when generating blog ideas.

**Existing post titles on this site** (do NOT duplicate or cannibalize these; generate NEW ideas only):

${wordPressPosts.slice(0, 300).map((post, idx) => `${idx + 1}. "${post.title}"`).join('\n')}

${aiThemesToAvoid && aiThemesToAvoid.length > 0 ? `**AI-identified themes already covered (do NOT suggest these)**:\n${aiThemesToAvoid.map((t) => `- ${t}`).join("\n")}\n\n` : ""}
**CRITICAL - AGENTIC INTENT CANNIBALIZATION FILTER RULES**:
- **Agentic (AI-driven)**: You MUST proactively avoid cannibalization. Do not rely on manual checks; you are responsible for filtering at generation time.
- **NEW titles only**: Do NOT suggest any title that is an exact or near-duplicate of an existing title above. No rephrasing of existing titles.
- **Distinct topics**: Do NOT suggest "Smart vs Traditional" or similar overused angles if already covered. Vary content types (how-to, guide, vs, list, problem-solution).
- **Non-cannibalizing intent**: Each new blog idea MUST target a distinct topic, angle, or search intent from the existing posts.

Apply this filter for every blog idea you output. All ${numberOfBlogs} ideas must pass the agentic intent cannibalization filter.
--- END AGENTIC INTENT CANNIBALIZATION FILTER ---
=== END WORDPRESS POSTS SOURCE ===\n` : ""}

GENERATION SETTINGS:
- Number of blogs to generate: ${numberOfBlogs}
- Entity mode: ${entityMode === 'auto' ? 'Auto-extract from knowledge base' : entityMode === 'manual' ? `Manual: "${entityValue}"` : 'Blank (no entity)'}
- Keyword mode: ${selectedKeywords && selectedKeywords.length > 0 ? `AI-Selected Keywords (pre-selected by AI from knowledge base and GSC data - USE THESE EXACTLY)` : keywordMode === 'gsc-keywords' ? `GSC Keywords (EXACT keywords from Google Search Console - MUST use these exactly)` : keywordMode === 'same' ? `Same for all: "${keywordValue}"` : 'Per blog (different keyword for each)'}
- Featured image per blog: ${featuredImagePerBlog ? 'Yes' : 'No'}
${optionalPrompt ? `- Additional instructions: "${optionalPrompt}"` : ''}
${selectedKeywords && selectedKeywords.length > 0 ? `\n=== AI-SELECTED KEYWORDS (CRITICAL - USE THESE EXACTLY) ===\nThese keywords were intelligently selected by AI from knowledge base content and Google Search Console data. You MUST use these EXACT keywords - no variations, no modifications, no paraphrasing.\n\nAI-Selected Keywords (${selectedKeywords.length} total, one per blog idea):\n${selectedKeywords.map((kw, idx) => `${idx + 1}. Primary: "${kw.primaryKeyword}" (Source: ${kw.source.toUpperCase()})${kw.relatedKeywords.length > 0 ? `\n   Related: ${kw.relatedKeywords.slice(0, 5).map(r => `"${r}"`).join(', ')}` : ''}`).join('\n')}\n\nCRITICAL REQUIREMENTS FOR AI-SELECTED KEYWORDS:\n- Use these keywords EXACTLY as they appear above (character-for-character match)\n- Each blog idea MUST use the corresponding primary keyword (blog #1 uses keyword #1, blog #2 uses keyword #2, etc.)\n- The keyword should LEAD and DRIVE the blog idea generation\n- The blog title and content should be built AROUND the exact primary keyword\n- You may reference the related keywords for additional context, but the PRIMARY keyword is mandatory\n- Do NOT create variations, synonyms, or paraphrases of these keywords\n- The primary keyword is the PRIMARY focus - build the entire blog idea around it\n- Ensure the blog idea directly addresses what users searching for that exact keyword would want\n\nYou will generate ${numberOfBlogs} blog ideas, each using the corresponding primary keyword above. Assign keywords to blog ideas in order (first keyword to first blog, second keyword to second blog, etc.).\n=== END AI-SELECTED KEYWORDS ===\n` : keywordMode === 'gsc-keywords' && gscExactKeywords && gscExactKeywords.length > 0 ? `\n=== EXACT GSC KEYWORDS (CRITICAL - USE THESE EXACTLY) ===\nYou MUST use these EXACT keywords from Google Search Console. Each keyword must be used EXACTLY as shown - no variations, no modifications, no paraphrasing.\n\nAvailable GSC Keywords (${gscExactKeywords.length} total):\n${gscExactKeywords.map((kw, idx) => `${idx + 1}. "${kw}"`).join('\n')}\n\nCRITICAL REQUIREMENTS FOR GSC KEYWORDS:\n- Use these keywords EXACTLY as they appear above (character-for-character match)\n- Each blog idea MUST use one of these exact keywords\n- The keyword should LEAD and DRIVE the blog idea generation\n- The blog title and content should be built AROUND the exact keyword\n- Do NOT create variations, synonyms, or paraphrases of these keywords\n- The keyword is the PRIMARY focus - build the entire blog idea around it\n- Ensure the blog idea directly addresses what users searching for that exact keyword would want\n\nYou will generate ${numberOfBlogs} blog ideas, each using one of the exact keywords above. Assign keywords to blog ideas in order (first keyword to first blog, second keyword to second blog, etc.).\n=== END GSC KEYWORDS ===\n` : ''}
${keywordAnalysisResults && keywordAnalysisResults.size > 0 ? `\n=== KEYWORD AI ANALYSIS (DEATH STAR MODULE) - CRITICAL CONTEXT ===
The following keywords have been analyzed with comprehensive AI analysis (Death Star module). Use this analysis to inform blog idea generation with keyword variations, H2 suggestions, content gaps, and research insights.

${Array.from(keywordAnalysisResults.entries()).slice(0, numberOfBlogs).map(([keyword, analysis], idx) => {
  const variations = analysis.keywordSuggestions?.variations || [];
  const longTail = analysis.keywordSuggestions?.longTail || [];
  const semantic = analysis.keywordSuggestions?.semantic || [];
  const h2s = analysis.h2Suggestions || [];
  const contentGaps = analysis.contentGaps || [];
  
  return `${idx + 1}. Keyword: "${keyword}"
   - Variations: ${variations.length > 0 ? variations.slice(0, 5).map(v => `"${v}"`).join(', ') : 'None'}
   - Long-tail: ${longTail.length > 0 ? longTail.slice(0, 3).map(v => `"${v}"`).join(', ') : 'None'}
   - Semantic: ${semantic.length > 0 ? semantic.slice(0, 3).map(v => `"${v}"`).join(', ') : 'None'}
   ${h2s.length > 0 ? `\n   - Suggested H2 Sections (use as inspiration for content structure):\n     ${h2s.slice(0, 5).map(h2 => `"${h2.heading}"`).join(', ')}` : ''}
   ${contentGaps.length > 0 ? `\n   - Content Gaps (opportunities to cover):\n     ${contentGaps.slice(0, 3).map(gap => `"${gap.topic}"`).join(', ')}` : ''}`;
}).join('\n\n')}

CRITICAL USAGE OF KEYWORD ANALYSIS:
- Use keyword variations, long-tail, and semantic keywords to understand the topic breadth and create comprehensive blog ideas
- H2 suggestions provide structure inspiration - consider these when designing blog content
- Content gaps reveal opportunities - use them to create valuable, unique blog ideas
- The analysis helps you understand what users are searching for and what competitors might be covering
- Use this analysis to create blog ideas that are comprehensive, well-structured, and address user intent

This analysis was performed using comprehensive SERP data and AI insights (Death Star module) to provide deep keyword understanding.
=== END KEYWORD AI ANALYSIS ===\n` : ''}

Your task is to:
1. Analyze the user's prompt to understand:
   - The topic, theme, or focus area
   - Any specific requirements or constraints
   - The target audience or use case
2. Generate EXACTLY ${numberOfBlogs} blog post ideas, where each idea includes:
   - **Keyword**: ${selectedKeywords && selectedKeywords.length > 0 ? `MUST use the AI-selected primary keyword provided above (use them in order: first keyword for first blog, second keyword for second blog, etc.). Use the keyword EXACTLY as shown - no variations. These keywords were intelligently selected by AI from knowledge base and GSC data. IMPORTANT: The keyword may be a long search query or phrase - this is correct, use it exactly.` : keywordMode === 'gsc-keywords' && gscExactKeywords && gscExactKeywords.length > 0 ? `MUST use one of the EXACT GSC keywords provided above (use them in order: first keyword for first blog, second keyword for second blog, etc.). Use the keyword EXACTLY as shown - no variations. IMPORTANT: The keyword may be a long search query or phrase - this is correct, use it exactly.` : keywordMode === 'same' ? `Use "${keywordValue}" for all blogs` : 'A unique primary SEO keyword for each blog post (different for each blog)'}
   - **Entity**: ${entityMode === 'auto' ? 'Extract from knowledge base if available, or use context' : entityMode === 'manual' ? `Use "${entityValue}" for all blogs` : 'Leave blank (no entity)'}
   - **Title**: ${titleTemplate ? `**ABSOLUTELY CRITICAL - TITLE TEMPLATE IS PROVIDED**: You MUST NOT generate your own titles. You MUST use this exact template: "${titleTemplate}". Simply replace [Entity] with the entity value, [Keyword] with the keyword value, [Location] with location if available, and [Number] with sequential number (1, 2, 3, etc.). DO NOT be creative. DO NOT modify the template structure. DO NOT add extra words. The title field in your response MUST be the template with ONLY the variables replaced. Example: Template "Blinds Near [Entity]" with entity "Calgary" = Title "Blinds Near Calgary" (EXACTLY, nothing more).` : `**ABSOLUTELY CRITICAL - SHORT SEO TITLES (UNDER 60 CHARACTERS, NO SEPARATOR)**:
- Each Title MUST be UNDER 60 characters total. Count every character. This is a hard limit for SEO (title tag display).
- NO separator in the title: do NOT use pipe (|), " | ", " – ", " - ", or any suffix like "| Florida Living" or "| Site Name". The title must be a single, short phrase only.
- The Title MUST be DIFFERENT from the Keyword AND DIFFERENT from all other titles. Use COMPLETELY DIFFERENT formats for each blog idea.
- Keep titles concise and punchy: e.g. "PowerView vs SoftTouch for Florida Homes" (under 60 chars, no pipe), not "PowerView's Advanced Features vs. SoftTouch's Everyday Convenience | Florida Living".

**MANDATORY TITLE FORMAT VARIETY** (each under 60 chars, no separator):
- Comparison: "[A] vs [B]: Which Wins?" or "[A] vs [B] for [Topic]"
- How-to: "How to [Action] Without [Problem]"
- Numbered: "7 [Topic] Strategies That Work"
- Question: "Is [Topic] Right for You?"
- Guide: "Complete Guide to [Topic]"
- Problem-solution: "Why [Solution] Matters Now"

**CRITICAL**: Each of the ${numberOfBlogs} titles MUST be under 60 characters, contain NO pipe or separator, and use a DIFFERENT format. Do NOT copy the keyword as the title.`}
   - **Modifier** (optional): ${optionalPrompt ? `Apply this context: "${optionalPrompt}"` : 'Any additional context, tone, or focus (e.g., "beginner-friendly", "step-by-step", "comprehensive guide")'}
   - **FeaturedImage**: ${featuredImagePerBlog ? '"y" for all blogs' : '"n" for all blogs'}

CRITICAL REQUIREMENTS:
- Generate EXACTLY ${numberOfBlogs} blog ideas (no more, no less)
- Each blog idea must be unique and valuable
- **ABSOLUTELY CRITICAL - TITLE LENGTH AND FORMAT**: Every Title MUST be under 60 characters (count them). NO separator: do NOT use pipe (|), " | ", " – ", or location/site suffix. One short phrase only (e.g. "PowerView vs SoftTouch for Florida Homes", not "PowerView's Advanced Features vs. SoftTouch's Everyday Convenience | Florida Living").
- **CRITICAL**: Each generation must produce COMPLETELY NEW titles - do NOT reuse or repeat previous titles
- **ABSOLUTELY CRITICAL - MAXIMUM TITLE VARIETY**: Titles must be unique, under 60 chars, no pipe/separator, AND use COMPLETELY DIFFERENT formats. Never copy keywords as titles.
- **PRIORITY - VERSUS POSTS**: When generating blog ideas, PRIORITIZE versus/comparison posts. If the topic allows for comparison content (comparing products, services, options, or approaches), include at least one versus-style comparison post. Versus posts should use comparison formats like "[Option A] vs [Option B]: Which Wins in 2025?" or "[Product A] vs [Product B]: Complete Comparison Guide". These posts are highly valuable for SEO and user engagement.
- **ICP CONTENT TYPE VARIETY REQUIREMENT**: When generating ${numberOfBlogs} blog ideas, ensure content type diversity. At least 2 different content types must be represented (e.g., versus/comparison post, how-to guide, comprehensive guide). Mix content types across the suggestions to provide variety: versus/comparison posts, how-to guides, comprehensive guides, beginner's guides, problem-solution posts, case studies, etc. Do NOT generate all ${numberOfBlogs} suggestions as the same content type - ensure at least 2 different types are represented.
${selectedKeywords && selectedKeywords.length > 0 ? `- **MANDATORY**: Each blog idea MUST use the corresponding AI-selected primary keyword provided above\n- **MANDATORY**: Use keywords EXACTLY as shown - character-for-character match, no variations\n- **MANDATORY**: The exact keyword must LEAD the blog idea - build the entire idea around it\n- **MANDATORY**: Assign keywords in order (keyword #1 to blog #1, keyword #2 to blog #2, etc.)\n- **OPTIONAL**: You may reference the related keywords provided for additional context, but the PRIMARY keyword is mandatory` : keywordMode === 'gsc-keywords' && gscExactKeywords && gscExactKeywords.length > 0 ? `- **MANDATORY**: Each blog idea MUST use one of the EXACT GSC keywords provided above\n- **MANDATORY**: Use keywords EXACTLY as shown - character-for-character match, no variations\n- **MANDATORY**: The exact keyword must LEAD the blog idea - build the entire idea around it\n- **MANDATORY**: Assign keywords in order (keyword #1 to blog #1, keyword #2 to blog #2, etc.)` : keywordMode === 'per-blog' ? '- Each blog must have a DIFFERENT keyword' : keywordMode === 'same' ? `- All blogs must use the same keyword: "${keywordValue}"` : '- Keywords should be relevant, searchable, and aligned with the knowledge base content'}
${!selectedKeywords && keywordMode !== 'gsc-keywords' ? `- Keywords should be relevant, searchable, and aligned with the knowledge base content${connectedSite ? ` and highly relevant to ${connectedSite.name}` : ''}` : ''}
${titleTemplate ? `- **ABSOLUTE REQUIREMENT - TITLE TEMPLATE PROVIDED**: You MUST use the template "${titleTemplate}" for ALL titles. DO NOT generate creative, SEO-optimized, or engaging titles. DO NOT create your own titles. Simply replace variables in the template: [Entity] → entity value, [Keyword] → keyword value, [Location] → location value, [Number] → sequential number. The title in your response MUST match the template format exactly. If you generate any title that doesn't follow this template, the system will reject it.` : `- **MANDATORY - SHORT SEO TITLES**: Each Title MUST be UNDER 60 characters. NO separator (no pipe |, no " | ", no location/site suffix). One short phrase only. Each of the ${numberOfBlogs} titles MUST use a DIFFERENT format. DO NOT copy keywords as titles.`}
- **CRITICAL**: Use the knowledge base content as the PRIMARY source for generating blog ideas. Extract topics, keywords, services, products, and themes directly from the knowledge base content${connectedSite ? `. Always ensure blog ideas are relevant to ${connectedSite.name} as the target site, but do NOT use the site name as an entity field` : ''}
- When knowledge base content is available, it should be the main driver for blog idea generation - analyze the actual page content to identify topics, gaps, and expansion opportunities
- Ensure ideas are diverse and cover different aspects of the topic when multiple posts are requested${connectedSite ? `, while maintaining relevance to ${connectedSite.name}` : ''}
${optionalPrompt ? `- Apply the following instructions to all blogs: "${optionalPrompt}"` : ''}
${connectedSite ? `- ALL blog ideas MUST be relevant to ${connectedSite.name} and suitable for publication on that website` : ''}

Format your response as a numbered checklist where each item follows this structure:
1. Keyword: "[keyword]", Entity: "[entity]"${entityMode === 'blank' ? ' (leave blank or omit)' : ''}, Title: "[title]", Modifier: "[modifier]" (optional), FeaturedImage: "[y/n]"${featuredImagePerBlog ? ' (should be "y")' : ' (should be "n")'}

${titleTemplate ? `CRITICAL TITLE TEMPLATE REQUIREMENT:
You MUST use the exact template format for ALL titles: "${titleTemplate}"
- Replace [Entity] with the actual entity value from each blog idea
- Replace [Keyword] with the actual keyword value from each blog idea  
- Replace [Location] with location if available, or leave empty
- Replace [Number] with sequential number (1, 2, 3, etc.)
- DO NOT create creative or alternative titles
- DO NOT modify the template structure
- The title MUST match the template exactly with only variable replacements

Example with template "${titleTemplate}":
If template is "Tent Rentals Near [Entity], Edmonton" and entity is "Westmount", title MUST be: "Tent Rentals Near Westmount, Edmonton"
If template is "[Keyword] in [Entity]" and keyword is "clearspan tents" and entity is "Edmonton", title MUST be: "clearspan tents in Edmonton"

` : ''}Example format:
${titleTemplate ? 
  (entityMode === 'blank' ? 
    `1. Keyword: "python web scraping tutorial", Entity: "", Title: "${titleTemplate.replace('[Keyword]', 'python web scraping tutorial').replace('[Entity]', '').replace('[Location]', '').replace('[Number]', '1').trim()}", Modifier: "${optionalPrompt || 'beginner-friendly'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
2. Keyword: "api integration best practices", Entity: "", Title: "${titleTemplate.replace('[Keyword]', 'api integration best practices').replace('[Entity]', '').replace('[Location]', '').replace('[Number]', '2').trim()}", Modifier: "${optionalPrompt || 'step-by-step'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
3. Keyword: "web scraping vs api", Entity: "", Title: "${titleTemplate.replace('[Keyword]', 'web scraping vs api').replace('[Entity]', '').replace('[Location]', '').replace('[Number]', '3').trim()}", Modifier: "${optionalPrompt || 'comparison'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"` :
    `1. Keyword: "${keywordMode === 'same' ? keywordValue : 'python web scraping tutorial'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "${titleTemplate.replace('[Keyword]', keywordMode === 'same' ? keywordValue : 'python web scraping tutorial').replace('[Entity]', entityMode === 'manual' ? entityValue : 'ScraperAPI').replace('[Location]', '').replace('[Number]', '1').trim()}", Modifier: "${optionalPrompt || 'beginner-friendly'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
2. Keyword: "${keywordMode === 'same' ? keywordValue : 'api integration best practices'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "${titleTemplate.replace('[Keyword]', keywordMode === 'same' ? keywordValue : 'api integration best practices').replace('[Entity]', entityMode === 'manual' ? entityValue : 'ScraperAPI').replace('[Location]', '').replace('[Number]', '2').trim()}", Modifier: "${optionalPrompt || 'step-by-step'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
3. Keyword: "${keywordMode === 'same' ? keywordValue : 'web scraping vs api'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "${titleTemplate.replace('[Keyword]', keywordMode === 'same' ? keywordValue : 'web scraping vs api').replace('[Entity]', entityMode === 'manual' ? entityValue : 'ScraperAPI').replace('[Location]', '').replace('[Number]', '3').trim()}", Modifier: "${optionalPrompt || 'comparison'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"`)
  :
  (entityMode === 'blank' ? 
    `1. Keyword: "web scraping vs api", Entity: "", Title: "Web Scraping vs API Integration: Which Should You Choose?", Modifier: "${optionalPrompt || 'versus/comparison'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
2. Keyword: "python web scraping tutorial", Entity: "", Title: "Complete Guide to Python Web Scraping for Beginners", Modifier: "${optionalPrompt || 'comprehensive guide'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
3. Keyword: "api integration best practices", Entity: "", Title: "How to Integrate REST APIs in Python: Step-by-Step Guide", Modifier: "${optionalPrompt || 'how-to guide'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"` :
    `1. Keyword: "${keywordMode === 'same' ? keywordValue : 'web scraping vs api'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "Web Scraping vs API Integration: Which Should You Choose?", Modifier: "${optionalPrompt || 'versus/comparison'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
2. Keyword: "${keywordMode === 'same' ? keywordValue : 'python web scraping tutorial'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "Complete Guide to Python Web Scraping for Beginners", Modifier: "${optionalPrompt || 'comprehensive guide'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"
3. Keyword: "${keywordMode === 'same' ? keywordValue : 'api integration best practices'}", Entity: "${entityMode === 'manual' ? entityValue : 'ScraperAPI'}", Title: "How to Integrate REST APIs in Python: Step-by-Step Guide", Modifier: "${optionalPrompt || 'how-to guide'}", FeaturedImage: "${featuredImagePerBlog ? 'y' : 'n'}"`)
}`;
return prompt;
};

/**
 * Builds a user prompt for generating blog ideas from natural language input
 */
export const buildBulkBlogIdeasUserPrompt = (
  userPrompt: string, 
  numberOfBlogs: number, 
  optionalPrompt: string = '',
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  gscExactKeywords?: string[],
  selectedKeywords?: Array<{ primaryKeyword: string; relatedKeywords: string[]; source: 'gsc' | 'kb' | 'combined' }>
): string => {
  let prompt = `Generate exactly ${numberOfBlogs} blog post ideas based on the following request:

${userPrompt}`;

  if (optionalPrompt) {
    prompt += `\n\n=== TEMPLATE/APPROACH MODIFIER (CRITICAL) ===\nThe following modifier should guide the TYPE, STYLE, STRUCTURE, or APPROACH for ALL blog posts:\n"${optionalPrompt}"\n\nUse this modifier to create a template or pattern that influences:\n- The type of blog posts (e.g., "versus/comparison posts", "how-to guides", "comprehensive guides")\n- The style or structure (e.g., "comparison format", "step-by-step format")\n- The approach or angle (e.g., "detailed analysis", "quick reference")\n\nThis modifier should shape how you generate the blog post ideas - it's a TEMPLATE for the generation approach.\n=== END TEMPLATE MODIFIER ===`;
  }

  prompt += `\n\nCRITICAL SOURCE PRIORITY FOR BLOG IDEA GENERATION:
1. **PRIMARY SOURCE - KNOWLEDGE BASE**: If knowledge base content is provided in the system prompt, you MUST use it as the PRIMARY source for generating blog ideas. The knowledge base contains actual scraped page content with detailed information about topics, services, products, and themes. Analyze this content to identify topics, gaps, and expansion opportunities for blog ideas.

2. **SECONDARY SOURCE - WORDPRESS POSTS**: ${wordPressPosts && wordPressPosts.length > 0 ? `You have access to ${wordPressPosts.length} WordPress posts from the target site (shown in the system prompt). Use these as SECONDARY context to understand content structure, URL patterns, and existing content themes. Combine WordPress post insights with knowledge base content to generate comprehensive blog ideas.` : 'WordPress posts are not available, so rely entirely on the knowledge base content.'}

${wordPressPosts && wordPressPosts.length > 0 ? `**AGENTIC INTENT CANNIBALIZATION FILTER (MANDATORY)**: When existing WordPress posts are provided in the system prompt, you MUST apply the agentic intent cannibalization filter. Generate only NEW blog ideas: no exact or near-duplicate titles, and each idea must target a distinct topic, angle, or search intent from existing posts. This is AI-driven (not manual)—you must proactively avoid cannibalization for every idea.` : ''}

**CRITICAL REQUIREMENT**: When both knowledge base and WordPress posts are available, prioritize the knowledge base content for substantive topic generation, and use WordPress posts for understanding content structure and patterns. All blog ideas must be contextually relevant to BOTH sources when available.

**ABSOLUTELY CRITICAL - SHORT SEO TITLES (UNDER 60 CHARACTERS, NO SEPARATOR)**:
- Each Title MUST be UNDER 60 characters. Count every character. No exceptions.
- NO separator: do NOT use pipe (|), " | ", " – ", or any suffix like "| Florida Living" or "| Site Name". The title must be ONE short phrase only.
- Each of the ${numberOfBlogs} blog titles MUST use a COMPLETELY DIFFERENT format. Keep them concise and punchy (e.g. "PowerView vs SoftTouch for Florida Homes", not long phrases with pipes).

**PRIORITY - VERSUS POSTS**: 
- PRIORITIZE versus/comparison posts when generating blog ideas. If the topic allows for comparison content (comparing products, services, options, or approaches), include at least one versus-style comparison post.
- Versus posts should use comparison formats like "[Option A] vs [Option B]: Which Wins in 2025?" or "[Product A] vs [Product B]: Complete Comparison Guide".
- These posts are highly valuable for SEO and user engagement - prioritize them when appropriate.

**ICP CONTENT TYPE VARIETY REQUIREMENT**: 
- When generating ${numberOfBlogs} blog ideas, ensure content type diversity.
- For ${numberOfBlogs} blog suggestions, at least 2 different content types must be represented (e.g., versus/comparison post, how-to guide, comprehensive guide).
- Mix content types across the suggestions to provide variety: versus/comparison posts, how-to guides, comprehensive guides, beginner's guides, problem-solution posts, case studies, etc.
- Do NOT generate all ${numberOfBlogs} suggestions as the same content type - ensure at least 2 different types are represented.`;

  if (selectedKeywords && selectedKeywords.length > 0) {
    prompt += `\n\nCRITICAL - AI-SELECTED KEYWORDS:\nYou MUST use the AI-selected keywords provided in the system prompt. These keywords were intelligently selected by AI from knowledge base content and Google Search Console data. Use them EXACTLY as shown - no variations, no modifications.\n\n- Each blog idea must use the corresponding primary keyword (blog #1 uses keyword #1, blog #2 uses keyword #2, etc.)\n- The primary keyword must LEAD the blog idea generation\n- Build the entire blog idea (title, content focus) around the exact primary keyword\n- You may reference the related keywords for additional context, but the PRIMARY keyword is mandatory\n- The blog idea should directly address what users searching for that exact keyword would want to know`;
  } else if (gscExactKeywords && gscExactKeywords.length > 0) {
    prompt += `\n\nCRITICAL - EXACT GSC KEYWORDS:\nYou MUST use the EXACT GSC keywords provided in the system prompt. These keywords are from Google Search Console and must be used EXACTLY as shown - no variations, no modifications.\n\n- Each blog idea must use one of the exact keywords\n- The keyword must LEAD the blog idea generation\n- Build the entire blog idea (title, content focus) around the exact keyword\n- Use keywords in order: first keyword for first blog, second keyword for second blog, etc.\n- The blog idea should directly address what users searching for that exact keyword would want to know`;
  }

  prompt += `\n\nPlease create a checklist of exactly ${numberOfBlogs} blog post ideas following the format specified in the system prompt. Each idea should include a keyword, entity, title, optional modifier, and featuredImage preference. **REMEMBER: Each title must use a DIFFERENT format structure - maximum variety is required. Avoid repetitive patterns and formulaic titles.**`;

  return prompt;
};