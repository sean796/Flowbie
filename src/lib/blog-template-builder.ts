import { streamChatCompletion, loadApiKey } from "./api";
import type { KeywordData, BlogTemplateChecklist, PeopleAlsoAsk } from "./keyword-types";
import type { AgentConfig } from "@/components/AgentNode";
import { CRITICAL_LINK_RULE } from "./prompt-builders";
import { getResearchModel } from "./optimization-settings-storage";
import { searchSiteCache, getSiteCache } from "./wordpress-site-cache";
import { getLocalEntityPhraseExamples, getLocalExpertisePhrase, getLocalGeneralPhrase } from "./local-entity-phrases";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";

/**
 * Converts a keyword to proper/title case
 * Capitalizes the first letter of each word, except for common prepositions/articles
 */
function toProperCase(keyword: string): string {
  if (!keyword) return keyword;
  
  // Words that should remain lowercase (unless at the start)
  const lowercaseWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'near', 'of', 'on', 'or', 'the', 'to', 'with'];
  
  return keyword
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Always capitalize first word, or if word is not in lowercase list
      if (index === 0 || !lowercaseWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

export interface BlogTemplateContext {
  flowTitle?: string;
  flowPurpose?: string;
  keywordData?: KeywordData;
  userPrompt?: string;
}

/**
 * Uses AI to analyze and select the best PAA questions for FAQ table relative to target site/entity
 */
async function selectBestPAAQuestionsWithAI(
  allPaaQuestions: Array<{ question: string; answer?: string; url?: string }>,
  entity?: string,
  primaryKeyword?: string,
  postTitle?: string,
  connectedSite?: { name: string; siteUrl: string },
  apiKey?: string,
  model?: string,
  temperature?: number,
  maxTokens?: number,
  topP?: number
): Promise<Array<{ question: string; answer?: string; url?: string }>> {
  // If no API key or fewer than 10 questions, return all (no need for AI analysis)
  if (!apiKey || allPaaQuestions.length <= 10) {
    return allPaaQuestions.slice(0, 10);
  }

  try {
    const siteContext = connectedSite 
      ? `Target Site: ${connectedSite.name} (${connectedSite.siteUrl})`
      : '';
    const entityContext = entity ? `Target Entity: ${entity}` : '';
    const keywordContext = primaryKeyword ? `Primary Keyword: ${primaryKeyword}` : '';
    const titleContext = postTitle ? `Post Title: ${postTitle}` : '';

    const systemPrompt = `You are an SEO expert analyzing People Also Ask (PAA) questions to select the BEST ones for an FAQ table that will appear on a specific website.

Your task is to rank and select up to 10 questions that are:
1. **MOST ALIGNED WITH THE POST TITLE** - This is CRITICAL. Questions must directly relate to the main topic of the post title
2. Most relevant to the target entity/site context
3. Most valuable for users searching for information about the entity/topic
4. Most likely to convert visitors into customers or engage them with the content
5. Best suited for a customer-service oriented FAQ table
6. Relevant to the primary keyword and search intent

Consider:
- **TITLE ALIGNMENT IS THE #1 PRIORITY** - If a question is not directly related to the post title's main topic, exclude it
- Questions directly related to the entity/topic AND the post title are highest priority
- Questions that showcase services, products, or location relevance are valuable
- Questions that demonstrate expertise and authority are important
- Questions about pricing, services, locations, comparisons, or practical information rank higher
- Generic or off-topic questions should be DEPRIORITIZED - especially if they don't align with the post title
- If a question is about a completely different topic than the post title, DO NOT include it

Return a JSON object with a "questions" field containing an array of question texts (strings) in order of best to least best, maximum 10 questions.

Example format:
{
  "questions": ["Question 1 text", "Question 2 text", "Question 3 text", ...]
}`;

    const questionsList = allPaaQuestions.map((paa, idx) => 
      `${idx + 1}. "${paa.question}"${paa.answer ? ` (Answer context: ${paa.answer.substring(0, 150)}...)` : ''}`
    ).join('\n');

    const userPrompt = `Analyze these ${allPaaQuestions.length} PAA questions and select the BEST ones for an FAQ table.

${siteContext ? `${siteContext}\n` : ''}${entityContext ? `${entityContext}\n` : ''}${keywordContext ? `${keywordContext}\n` : ''}${titleContext ? `${titleContext}\n` : ''}

**CRITICAL: TITLE ALIGNMENT CHECK**
${postTitle ? `Before selecting ANY question, ask yourself: "Is this question directly aligned with the post title: '${postTitle}'?"\n- If NO, exclude it immediately\n- Only select questions that clearly relate to the main topic in the post title\n` : ''}

Available PAA Questions:
${questionsList}

Select the BEST up to 10 questions that:
1. **ARE DIRECTLY ALIGNED WITH THE POST TITLE** ${postTitle ? `("${postTitle}")` : ''}
2. Are most relevant to ${entity || primaryKeyword || 'the target site'}
3. Are most valuable for the FAQ table

MANDATORY EXCLUSIONS - NEVER include questions that:
- Are NOT in English (no Spanish, French, or any other language - ENGLISH ONLY)
- Contain any person's name (first name, last name, or full name) - generic product/service questions ONLY

Return a JSON object with this exact format:
{
  "questions": ["Question 1 text", "Question 2 text", "Question 3 text", ...]
}

The questions array should contain the question texts in order from best to least best, maximum 10 questions.
DO NOT include explanations, numbering, or any other text. ONLY return the JSON object.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2000,
        top_p: topP ?? 0.9,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn('[PAA Selection] AI analysis failed, using fallback selection');
      return allPaaQuestions.slice(0, 10);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn('[PAA Selection] No content in AI response, using fallback selection');
      return allPaaQuestions.slice(0, 10);
    }

    // Parse the JSON response
    let selectedQuestions: string[] = [];
    try {
      const parsed = JSON.parse(content);
      // Handle both {questions: [...]} and direct array formats
      if (Array.isArray(parsed)) {
        selectedQuestions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        selectedQuestions = parsed.questions;
      } else if (parsed.selectedQuestions && Array.isArray(parsed.selectedQuestions)) {
        selectedQuestions = parsed.selectedQuestions;
      } else {
        // Try to find any array in the response
        const values = Object.values(parsed);
        const arrayValue = values.find(v => Array.isArray(v));
        if (arrayValue) {
          selectedQuestions = arrayValue as string[];
        }
      }
    } catch (parseError) {
      console.warn('[PAA Selection] Failed to parse AI response, trying to extract array from text:', parseError);
      // Fallback: try to extract JSON array from text
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          selectedQuestions = JSON.parse(jsonMatch[0]);
        } catch {
          console.warn('[PAA Selection] Could not parse extracted JSON, using fallback selection');
          return allPaaQuestions.slice(0, 10);
        }
      } else {
        console.warn('[PAA Selection] No JSON array found in response, using fallback selection');
        return allPaaQuestions.slice(0, 10);
      }
    }

    // Map selected questions back to full PAA objects
    const selectedPaaQuestions: Array<{ question: string; answer?: string; url?: string }> = [];
    const questionMap = new Map(
      allPaaQuestions.map(paa => [paa.question.toLowerCase().trim(), paa])
    );

    for (const selectedQuestion of selectedQuestions.slice(0, 10)) {
      const normalized = selectedQuestion.toLowerCase().trim();
      const match = questionMap.get(normalized) || 
        Array.from(questionMap.values()).find(paa => 
          paa.question.toLowerCase().trim().includes(normalized) ||
          normalized.includes(paa.question.toLowerCase().trim())
        );
      
      if (match && !selectedPaaQuestions.find(p => p.question.toLowerCase().trim() === match.question.toLowerCase().trim())) {
        selectedPaaQuestions.push(match);
      }
    }

    // If AI didn't select enough, fill with remaining questions in original order
    if (selectedPaaQuestions.length < 10) {
      const remaining = allPaaQuestions.filter(paa => 
        !selectedPaaQuestions.find(selected => selected.question.toLowerCase().trim() === paa.question.toLowerCase().trim())
      );
      selectedPaaQuestions.push(...remaining.slice(0, 10 - selectedPaaQuestions.length));
    }

    return selectedPaaQuestions.slice(0, 10);
  } catch (error) {
    console.warn('[PAA Selection] Error during AI analysis, using fallback selection:', error);
    return allPaaQuestions.slice(0, 10);
  }
}

/**
 * Builds a system prompt for blog template checklist generation
 */
export const buildBlogTemplateSystemPrompt = (
  flowTitle: string,
  flowPurpose: string,
  keywordData?: KeywordData
): string => {
  const keywordSection = keywordData
    ? `
--- Keyword Context ---
Primary Keyword: ${keywordData.keyword}
Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
Difficulty: ${keywordData.difficulty || "N/A"}/100
Intent: ${keywordData.intent || "N/A"}
`
    : "";

  return `You are an expert blog content strategist and blueprint architect. Your role is to analyze user requirements and create a detailed checklist for generating a blog template blueprint.

Flow Context:
- Title: ${flowTitle || "Untitled"}
- Purpose: ${flowPurpose || "Not specified"}
${keywordSection}

Your task is to:
1. Analyze the user's description of their blog template needs
2. Create a comprehensive, actionable checklist (5-10 items) that will guide blueprint generation
3. Each checklist item should specify what section/agent should be included and what it should cover
4. The checklist will be used to generate a blueprint with multiple agents (sections)

CRITICAL FORMAT REQUIREMENT:
Format your response as a numbered list, one item per line. Each item should be a clear, actionable instruction.

Example format:
1. Create an introduction section that hooks the reader and introduces the main topic
2. Add a section covering [specific topic] with examples and practical tips
3. Include a comparison section between [options]
4. Add a conclusion section that summarizes key points and includes a call-to-action

Output ONLY the numbered checklist items, no additional text or explanations.`;
};

/**
 * Builds a user prompt for blog template checklist generation
 */
export const buildBlogTemplateUserPrompt = (
  context: BlogTemplateContext
): string => {
  const parts: string[] = [];

  parts.push("Generate a comprehensive checklist for creating a blog template blueprint based on the following requirements:\n");

  if (context.userPrompt && context.userPrompt.trim()) {
    parts.push(`User Requirements: ${context.userPrompt.trim()}\n`);
  }

  parts.push("\nThe checklist should specify:");
  parts.push("1. What sections/agents should be included in the blog");
  parts.push("2. What content each section should cover");
  parts.push("3. How sections should be structured");
  parts.push("4. Any specific features or requirements for each section");

  parts.push("\nGenerate 5-10 detailed, actionable checklist items that will guide the blueprint generation.");
  parts.push("Each item should be a clear instruction for what to include in the blog template.");

  return parts.join("\n");
};

/**
 * Parses checklist from AI response
 */
export function parseBlogTemplateChecklist(aiResponse: string, keywords: string[] = []): string[] {
  // Extract numbered list items
  const lines = aiResponse.split("\n");
  const checklist: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered list items (1., 2., etc.) or bullet points
    const match = trimmed.match(/^(?:\d+\.|\-|\*)\s+(.+)$/);
    if (match && match[1]) {
      checklist.push(match[1].trim());
    }
  }

  // If no numbered items found, try splitting by lines and filtering
  if (checklist.length === 0) {
    const items = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 10 && !line.startsWith("#"));
    return validateAndEnforceMandatoryElements(items.slice(0, 10)); // Limit to 10 items
  }

  return validateAndEnforceMandatoryElements(checklist);
}

/**
 * Validates checklist for mandatory content structure elements and adds them if missing
 * MANDATORY: Every blog must have at least 1 TABLE, 1 BULLETED LIST, and 1 NUMBERED LIST
 */
function validateAndEnforceMandatoryElements(checklist: string[]): string[] {
  if (checklist.length === 0) return checklist;
  
  const checklistText = checklist.join('\n').toLowerCase();
  
  // Check for mandatory elements
  const hasTable = checklistText.includes('[table]');
  const hasBulletedList = 
    checklistText.includes('[list]: bullet') || 
    checklistText.includes('[list]:bullet') ||
    checklistText.includes('[list]: unordered') ||
    checklistText.includes('bulleted list');
  const hasNumberedList = 
    checklistText.includes('[list]: number') || 
    checklistText.includes('[list]:number') ||
    checklistText.includes('[list]: ordered') ||
    checklistText.includes('numbered list');
  
  const missingElements: string[] = [];
  if (!hasTable) missingElements.push('TABLE');
  if (!hasBulletedList) missingElements.push('BULLETED LIST');
  if (!hasNumberedList) missingElements.push('NUMBERED LIST');
  
  if (missingElements.length === 0) {
    console.log('[Checklist Validation] All mandatory elements present: TABLE, BULLETED LIST, NUMBERED LIST');
    return checklist;
  }
  
  console.warn(`[Checklist Validation] Missing mandatory elements: ${missingElements.join(', ')} - adding defaults`);
  
  // Find suitable sections to add missing elements (not intro/conclusion)
  const modifiedChecklist = [...checklist];
  let tableAdded = hasTable;
  let bulletedAdded = hasBulletedList;
  let numberedAdded = hasNumberedList;
  
  for (let i = 0; i < modifiedChecklist.length; i++) {
    const item = modifiedChecklist[i].toLowerCase();
    const isIntroOrConclusion = 
      item.includes('introduction') || 
      item.includes('conclusion') || 
      item.includes('intro') ||
      item.includes('faq');
    
    if (isIntroOrConclusion) continue;
    
    // Add TABLE to a section that doesn't already have one
    if (!tableAdded && !item.includes('[table]')) {
      modifiedChecklist[i] = modifiedChecklist[i] + ' [TABLE]: Comparison or feature table to visualize key information.';
      tableAdded = true;
      console.log(`[Checklist Validation] Added TABLE to section ${i + 1}`);
      continue;
    }
    
    // Add NUMBERED LIST to a section that doesn't already have a list
    if (!numberedAdded && !item.includes('[list]')) {
      modifiedChecklist[i] = modifiedChecklist[i] + ' [LIST]: Numbered list of key steps or process order.';
      numberedAdded = true;
      console.log(`[Checklist Validation] Added NUMBERED LIST to section ${i + 1}`);
      continue;
    }
    
    // Add BULLETED LIST to a section that doesn't already have a list
    if (!bulletedAdded && !item.includes('[list]')) {
      modifiedChecklist[i] = modifiedChecklist[i] + ' [LIST]: Bulleted list of features or benefits.';
      bulletedAdded = true;
      console.log(`[Checklist Validation] Added BULLETED LIST to section ${i + 1}`);
      continue;
    }
    
    // All elements added
    if (tableAdded && numberedAdded && bulletedAdded) break;
  }
  
  // If we still couldn't add elements (all sections were intro/conclusion), add to first available
  if (!tableAdded || !numberedAdded || !bulletedAdded) {
    console.warn('[Checklist Validation] Could not find suitable sections, adding to available sections');
    for (let i = 0; i < modifiedChecklist.length && (!tableAdded || !numberedAdded || !bulletedAdded); i++) {
      const item = modifiedChecklist[i].toLowerCase();
      if (!tableAdded && !item.includes('[table]')) {
        modifiedChecklist[i] = modifiedChecklist[i] + ' [TABLE]: Key data table.';
        tableAdded = true;
      } else if (!numberedAdded && !item.includes('[list]')) {
        modifiedChecklist[i] = modifiedChecklist[i] + ' [LIST]: Numbered list of steps.';
        numberedAdded = true;
      } else if (!bulletedAdded && !item.includes('[list]')) {
        modifiedChecklist[i] = modifiedChecklist[i] + ' [LIST]: Bulleted list of items.';
        bulletedAdded = true;
      }
    }
  }
  
  return modifiedChecklist;
}

/**
 * Auto-generates checklist from selected keywords, H2 sections, title, and keyword data
 * No manual user prompt needed - the selections ARE the prompt context
 */
export async function generateChecklistFromSelections(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  title: string,
  keywordData: KeywordData,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    userPrompt?: string;
    entity?: string; // Optional entity for content optimization
    entityAnalysis?: string; // AI analysis of the entity for context
    serpData?: any; // Full SERP JSON response for context
    selectedPeopleAlsoAsk?: string[]; // Selected People Also Ask questions
    peopleAlsoAskItems?: PeopleAlsoAsk[]; // Full PAA items (question + url/answer) for linking
    selectedResearchLinks?: string[]; // Selected research links for external linking
    connectedSite?: { name: string; siteUrl: string }; // Connected WordPress site (target topic)
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>; // WordPress posts for context
    currentPageUrl?: string; // URL of the page currently being optimized
  }
): Promise<string[]> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 4000,
    topP = 0.9,
  } = options;

  // Keep keywords in their natural form (lowercase) - do NOT capitalize them
  // Keywords should only be capitalized when they're proper nouns, geographic locations, or at sentence starts
  const primaryKeywordNatural = keywordData.keyword.toLowerCase();
  const selectedKeywordsNatural = selectedKeywords.map(kw => kw.toLowerCase());

  // Define proper case versions for display purposes (used in template strings)
  const primaryKeywordProper = toProperCase(keywordData.keyword);
  const selectedKeywordsProper = selectedKeywords.map(kw => toProperCase(kw));

  const keywordSection = `
--- Keyword Context ---
Primary Keyword: ${primaryKeywordNatural}
Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
Difficulty: ${keywordData.difficulty || "N/A"}/100
Intent: ${keywordData.intent || "N/A"}
Selected Keywords: ${selectedKeywordsNatural.join(", ") || "None"}

CRITICAL: Each selected keyword listed above MUST be used as anchor text in internal links within relevant sections. When creating checklist items, explicitly specify which keywords should be used as anchor text in each section's internal links.

CRITICAL KEYWORD CAPITALIZATION RULE:
- Keywords should be used in their NATURAL FORM (typically lowercase for generic terms)
- DO NOT randomly capitalize generic keywords like "blinds", "shades", "windows", "roller", "modern", etc.
- Only capitalize keywords when they are:
  * Proper nouns (brand names, product names like "Zebra Blinds", "Roller Shades" as product names)
  * Geographic locations (cities, states, countries)
  * At the start of sentences
- Examples:
  * CORRECT: "blinds for windows near me", "custom blinds near me", "modern roller shades"
  * WRONG: "Blinds for Windows near Me", "Custom Blinds near Me", "Modern Roller Shades"
  * CORRECT: "Zebra Blinds" (product name), "New York" (location), "Blinds are essential" (sentence start)

CRITICAL KEYWORD USAGE - NATURAL LANGUAGE PRIORITY (2026 SEO STANDARDS):
- AVOID KEYWORD STUFFING: Never use exact-match keyword phrases repeatedly. Modern search engines penalize repetitive, robotic-sounding content.
- Use semantic variations as the DEFAULT approach:
  * If primary keyword is "Wood Window Blinds Seagrove Beach", use variations like:
    - "wood blinds" (most of the time)
    - "wood window treatments in Seagrove Beach" (varied)
    - "wooden blinds for coastal homes" (natural alternative)
    - "wood blinds in the Seagrove Beach area" (natural phrasing)
  * Only use exact full keyword match 1-2 times maximum in entire article
  * Split multi-word keywords naturally across sentences - components should appear separately most of the time
- Natural language patterns:
  * Write as a human would speak, not as SEO software would generate
  * Use conversational, engaging language that prioritizes reader experience
  * If a keyword phrase feels forced or awkward, replace it entirely with a natural synonym or rephrase
  * Vary sentence structure - avoid repetitive patterns that make content feel formulaic
- Anchor text variety (CRITICAL for modern SEO):
  * Mix keyword-rich (20%), branded (30%), and natural descriptive (50%) anchor text
  * Branded examples: "In The Shade's collection", "our showroom", "contact our team"
  * Natural descriptive: "this guide to humidity-resistant blinds", "learn more about motorization", "explore your options"
  * Avoid overusing exact keyword phrase as anchor text - this signals over-optimization
- Keyword density guidance:
  * Target 1-2% density for primary keyword (lower end of optimal range)
  * Use exact full match sparingly (1-2 instances total)
  * Use partial matches and semantic variations liberally (95% of keyword mentions)
  * Focus on topical relevance rather than exact keyword repetition
- Content quality over keyword matching:
  * Readability, user value, and natural flow are MORE important than keyword optimization
  * Content should sound like it was written by a human expert, not an SEO tool
  * If keyword density feels high or repetitive, reduce it further - modern SEO rewards natural content
`;

  const h2Section = selectedH2Sections.length > 0
    ? `
--- Selected H2 Sections ---
${selectedH2Sections.map((h2, idx) => `${idx + 1}. ${h2}`).join("\n")}
`
    : "";

  // Extract full PAA data from SERP if available, or use selected questions
  let paaQuestions: Array<{ question: string; answer?: string; url?: string }> = [];
  let paaItems: PeopleAlsoAsk[] = Array.isArray(options.peopleAlsoAskItems) ? options.peopleAlsoAskItems : [];
  if (paaItems.length === 0 && options.serpData) {
    // Best-effort: derive PAA items from SERP JSON so we can link sources in the FAQ table.
    try {
      const { extractPeopleAlsoAskFromSerp } = await import("./paa-extractor");
      const extracted = extractPeopleAlsoAskFromSerp(options.serpData);
      paaItems = extracted.items || [];
    } catch {
      // ignore – links are optional, questions can still be used
    }
  }

  const selectedProvided = Array.isArray(options.selectedPeopleAlsoAsk) && options.selectedPeopleAlsoAsk.length > 0;
  if (selectedProvided || paaItems.length > 0) {
    const selected = selectedProvided
      ? options.selectedPeopleAlsoAsk!.map((q) => q?.trim()).filter((q): q is string => !!q)
      : paaItems.map((p) => p.question).filter((q): q is string => !!q);

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const q of selected) {
      const k = q.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(q);
      }
      // Don't break early - collect all questions for AI analysis if entity is provided
      if (!options.entity && deduped.length >= 10) break; // top 10 "most popular" (SERP order / user-selected order) - only if no entity
    }

    // Create full PAA question objects and filter out international references
    let allPaaQuestions = deduped
      .map((question) => {
        const match = paaItems.find(
          (p) => p?.question && p.question.toLowerCase().trim() === question.toLowerCase().trim()
        );
        return {
          question,
          answer: match?.answer,
          url: match?.url,
        };
      })
      .filter((paa) => {
        // Filter out questions with non-North American location references
        const lowerQuestion = paa.question.toLowerCase();
        const blockedTerms = ['australia', 'uk', 'united kingdom', 'europe', 'asia', 'london', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'england', 'scotland', 'wales', 'ireland', 'new zealand', 'singapore', 'hong kong', 'tokyo', 'paris', 'berlin', 'rome', 'madrid'];
        const hasInternationalRef = blockedTerms.some(term => lowerQuestion.includes(term));
        if (hasInternationalRef) {
          console.log(`[PAA Filter] Filtered out question with international reference: ${paa.question}`);
          return false;
        }
        return true;
      });

    // If entity is provided, use AI to select the BEST questions for the FAQ table
    if (options.entity && allPaaQuestions.length > 10) {
      try {
        const apiKey = options.apiKey || loadApiKey();
        if (apiKey) {
          paaQuestions = await selectBestPAAQuestionsWithAI(
            allPaaQuestions,
            options.entity,
            keywordData.keyword,
            title,
            options.connectedSite,
            apiKey,
            options.model,
            options.temperature,
            options.maxTokens,
            options.topP
          );
        } else {
          // No API key, use fallback (top 10)
          paaQuestions = allPaaQuestions.slice(0, 10);
        }
      } catch (error) {
        console.warn('[PAA Selection] Error in AI selection, using fallback:', error);
        paaQuestions = allPaaQuestions.slice(0, 10);
      }
    } else {
      // No entity or not enough questions - use simple selection (top 10)
      paaQuestions = allPaaQuestions.slice(0, 10);
    }
  }

  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  // Define this early as it's used in template strings below
  const normalizedSiteUrl = options.connectedSite?.siteUrl ? options.connectedSite.siteUrl.replace(/\/+$/, '') : '';

  const paaSection = paaQuestions.length > 0
    ? `
--- Selected People Also Ask Questions (MUST BE ANSWERED) ---
${paaQuestions.map((paa, idx) => {
  let item = `${idx + 1}. Question: "${paa.question}"`;
  if (paa.answer) item += `\n   Answer context: ${paa.answer.substring(0, 200)}${paa.answer.length > 200 ? '...' : ''}`;
  if (paa.url) item += `\n   Source URL: ${paa.url}`;
  return item;
}).join("\n\n")}

**CRITICAL - ALL PAA QUESTIONS GO IN THE FAQ TABLE ONLY**:
- NEVER create a separate "People Also Ask" section or heading - this is FORBIDDEN
- NEVER create dedicated agents for individual PAA questions
- ALL PAA questions MUST be answered in the ONE SINGLE FAQ table at the END of the blog
- Create exactly ONE FAQ agent named: "FAQ for ${options.entity || primaryKeywordProper}"
- **CRITICAL: FAQ MUST BE AT THE BOTTOM OF THE PAGE - This agent must be the LAST agent in the blueprint**
- This agent must produce a markdown section with:
  1. **MANDATORY HEADER**: "## Frequently Asked Questions About [Topic]" where [Topic] is the main subject
  2. **MANDATORY TABLE**: A TWO-COLUMN markdown table with EXACT format:
  
## Frequently Asked Questions About [Topic]

| Question | Helpful Answer |
|----------|----------------|
| Question 1 text | Answer 1 text |
| Question 2 text | Answer 2 text |
| Question 3 text | Answer 3 text |
| Question 4 text | Answer 4 text |

- **MINIMUM 4 FAQs REQUIRED**: The table MUST contain AT LEAST 4 question-answer pairs
- Column 1 header: "Question"
- Column 2 header: "Helpful Answer" (customer-service tone, clear, practical)
- **ABSOLUTELY FORBIDDEN: Do NOT write answers as paragraphs. Do NOT use bullet points. Do NOT use lists. ONLY use the table format above.**
- **ABSOLUTELY FORBIDDEN: NEVER use colons (\`:\`) anywhere in the content - they break code and must be replaced with periods**
- **ABSOLUTELY FORBIDDEN: NEVER use em dashes (Unicode U+2014 or U+2013) anywhere in the content - they must be replaced with comma and space (\`, \`)**
- **ABSOLUTELY FORBIDDEN: NEVER start table headers with a colon (\`:\`). The table header row must start with \`|\` not \`: |\`**
- **ABSOLUTELY FORBIDDEN: NEVER start table rows with a period (\`.\`), colon (\`:\`), dash (\`-\`), or any other punctuation before the first pipe. Table rows MUST start with \`|\` not \`. |\`, \`: |\`, \`- |\`, etc.**
- **ABSOLUTELY FORBIDDEN: NEVER use Q./A. format (e.g., "Q. Question?" followed by "A. Answer.") - this is NOT a table format. You MUST use proper markdown table rows: \`| Question | Answer |\`**
- **ABSOLUTELY FORBIDDEN: NEVER use headers like "| Q&A |" or malformed table structures - use EXACTLY the format shown above with "Question" and "Helpful Answer" as column headers**
- **ABSOLUTELY FORBIDDEN: NEVER create duplicate headings - the FAQ header "## Frequently Asked Questions About [Topic]" must appear ONLY ONCE, never twice consecutively.**
- **EVERY answer MUST be in the table cell format shown above. NO EXCEPTIONS.**
- **CRITICAL TABLE FORMAT**: Markdown tables MUST start with \`|\` (pipe character) - NEVER use \`. |\`, \`: |\`, \`- |\`, or any other character before the first pipe.
- Answer 4-10 questions${options.entity ? ' (these have been AI-analyzed and selected as the BEST questions for the FAQ table relative to the target entity/site and post title)' : ' (use the most popular = the order provided above)'}.
- If a Source URL is provided for a question, include it as a markdown link in the Answer cell (e.g., "Answer text [Source](https://example.com)").
- Do NOT invent URLs. If no URL is provided, omit the source link.
`
    : "";

  // Use only AI-extracted research links - no manual extraction
  // CRITICAL: Filter out competitors and location-mismatched links before including
  const normalizedSiteDomain = options.connectedSite?.siteUrl 
    ? new URL(options.connectedSite.siteUrl.startsWith('http') ? options.connectedSite.siteUrl : `https://${options.connectedSite.siteUrl}`).hostname.replace('www.', '')
    : '';
  
  // CRITICAL: ONLY allow Wikipedia and connected site links - NO OTHER EXTERNAL LINKS
  const validResearchLinks = options.selectedResearchLinks && options.selectedResearchLinks.length > 0
    ? options.selectedResearchLinks.filter(url => {
        try {
          const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
          const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();
          
          // ONLY allow Wikipedia links
          const isWikipedia = linkDomain === 'wikipedia.org' || 
                             linkDomain === 'en.wikipedia.org' || 
                             linkDomain.includes('wikipedia.org');
          
          // ONLY allow connected site links (internal links)
          const isConnectedSite = normalizedSiteDomain && linkDomain === normalizedSiteDomain.toLowerCase();
          
          // REJECT everything else - NO EXCEPTIONS
          if (!isWikipedia && !isConnectedSite) {
            console.warn(`[Link Filter] REJECTED external link (not Wikipedia or connected site): ${url}`);
            return false;
          }
          
          return true;
        } catch {
          // Invalid URL format - exclude it
          return false;
        }
      })
    : [];

  const researchLinksSection = validResearchLinks.length > 0
    ? `
--- Selected Research Links (EXTERNAL LINKS TO INCLUDE - VALIDATED) ---
${validResearchLinks.map((url, idx) => {
  return `${idx + 1}. ${url}`;
}).join("\n\n")}

**ABSOLUTELY CRITICAL - EXTERNAL LINK RESTRICTIONS (NO EXCEPTIONS)**:
- **ONLY Wikipedia links are allowed as external links** - NO OTHER EXTERNAL SITES
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links from the list above
- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia
- **If a link in the list above is NOT Wikipedia, REJECT IT IMMEDIATELY** - do NOT include it in the checklist
- **Internal links to ${normalizedSiteUrl || 'the target website'} are allowed and encouraged** - these are NOT external links

FOR EACH VALIDATED Wikipedia link (that passes the Wikipedia check):
1. MANDATORY: Include "[EXTERNAL LINK]: Link to [FULL URL] with anchor text '[relevant anchor text]'" in at least one checklist item
2. DO NOT skip any VALIDATED Wikipedia links - every Wikipedia link that passes validation must appear in the checklist
3. If a link is NOT Wikipedia, you MUST exclude it - do NOT include it in the checklist

**ABSOLUTELY FORBIDDEN - DO NOT LINK TO**:
- pfwbs.org or ANY window covering association sites
- cpsc.gov or ANY government sites (except Wikipedia)
- nbcnews.com or ANY news sites
- windowcoverings.org or ANY industry sites
- ANY competitor websites
- ANY business websites
- ANY manufacturer websites (except if mentioned in Wikipedia)
- ANY educational sites (except Wikipedia)
- ANY other external site that is NOT Wikipedia

**ONLY ALLOWED EXTERNAL LINKS**:
1. **Wikipedia links ONLY** - https://en.wikipedia.org/... or https://wikipedia.org/...
2. **Internal links to ${normalizedSiteUrl || 'the target website'}** - these are encouraged and required (3-5 per section)

**CRITICAL**: If you see ANY link in the list above that is NOT Wikipedia, you MUST REJECT IT and NOT include it in the checklist. Do NOT hallucinate or create external links - ONLY use Wikipedia links from the validated list above.

**ABSOLUTELY FORBIDDEN - NEVER CREATE SECTIONS NAMED "EXTERNAL RESOURCES"**:
- **NEVER create any section with a heading containing "External Resources", "External Links", "External References", "External Sites", "External Websites", "Additional Resources", "Helpful Resources", "Useful Resources", or "Related Resources"**
- **NEVER create dedicated sections for external links or resources** - external links (if Wikipedia) should be integrated contextually into relevant sections, not in a separate section
- **Any section with "External Resources" or similar in the heading will be automatically removed** - do NOT create these sections
`
    : "";

  const userPromptSection = options.userPrompt && options.userPrompt.trim()
    ? `\n--- USER-SPECIFIED REQUIREMENTS (MUST BE EXPLICITLY REFERENCED) ---\n${options.userPrompt.trim()}\n\nCRITICAL: If the user has provided specific requirements above, you MUST explicitly note and incorporate them in the checklist items. For example, if the user mentions "include a table", "use 3-5 links", or any specific features, you MUST explicitly state these requirements in the relevant checklist items. NOTE: Only include [IMAGE] features if the user explicitly requests images with a specific image link or markdown format.`
    : "";

  const entityContext = options.entity && options.entity.trim()
    ? (() => {
        const entityName = options.entity.trim();
        const generalExamples = getLocalEntityPhraseExamples(entityName, 'general', 6);
        const expertiseExamples = getLocalEntityPhraseExamples(entityName, 'expertise', 4);
        
        return `\n--- Entity/Location Optimization Context ---
Target Entity/Location: ${entityName}
${options.entityAnalysis ? `Entity Analysis: ${options.entityAnalysis}\n\nUse this analysis to naturally scatter entity context throughout the content.` : ''}

CRITICAL LOCATION VARIATION REQUIREMENTS:
- VARY location mentions - do NOT repeat exact location name repeatedly (e.g., "Edmonton" over and over)
- **CRITICAL: USE VARIED PHRASES FOR ENTITY REFERENCES** - Instead of repeatedly saying "for ${entityName}" or "in ${entityName}", rotate through diverse phrases:
  * ${generalExamples.map(ex => `"${ex}"`).join(', ')}
  * Use different phrases in different sections to avoid obvious repetition
- Use geographic variations naturally:
  * Exact location name: Use 2-3 times maximum in entire article (e.g., "Edmonton", "New York", "Toronto")
  * Broader geographic terms: Use frequently (e.g., "Alberta area", "New York region", "Ontario region")
  * Neighboring/regional references: Use naturally (e.g., "local area", "regional", "area")
  * General area references: Use often (e.g., "local homes", "area residences", "regional properties")
- IMPORTANT: Use ONLY generic city names (e.g., "Edmonton", "New York", "Toronto") - DO NOT use specific neighborhoods or directional qualifiers (e.g., "West Edmonton", "North Toronto", "East New York")
- Natural location integration:
  * Use exact location name in title/intro (1-2 times)
  * Use broader geographic terms in body content (most common)
  * Use exact location sparingly in conclusion (1 time maximum)
  * Example: Instead of "${entityName} home" repeatedly, use "local area home", "regional residence", "${entityName} properties" (varied)
- Location density: Target 1-2% for exact location name, 3-5% for broader geographic variations

**CRITICAL: PREVENT OVER-OPTIMIZATION**:
- Remove 15-20% of primary keyword mentions and replace with natural variations
- Instead of repeating exact keyword phrases, use alternatives like "local experts", "our team", "specialists", "professionals"
- Example: Instead of "Edmonton SEO experts" repeatedly, use "local experts", "our team", "SEO specialists in the area", "local professionals"
- This prevents keyword stuffing and makes content feel more natural and human-written

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

CRITICAL: Include REAL-WORLD EXPERTISE EXAMPLES in at least one section:
- Add authentic experience statements that demonstrate expertise (EEAT signals)
- Use natural, conversational phrasing that shows hands-on experience
- **USE VARIED PHRASES** - Rotate through different expertise phrases to avoid repetition:
  * ${expertiseExamples.map(ex => `"${ex}"`).join(', ')}
  * Use different phrases in different sections - don't repeat the same expertise phrase
- Place real-world examples naturally in relevant sections (Benefits, Features, or How-To sections work best)
- Make it sound authentic and specific - avoid generic statements
- Real-world examples should feel like genuine expertise, not forced SEO content

Entity optimization: Ensure checklist items reference the entity/location naturally with variations, not exact matches repeatedly. Use only generic city names, never specific neighborhoods or directional qualifiers. Use varied phrases like ${generalExamples.slice(0, 3).map(ex => `"${ex}"`).join(', ')} instead of repeatedly saying "for ${entityName}" or "in ${entityName}".`;
      })()
    : "";

  const targetSiteContext = options.connectedSite
    ? `\n=== TARGET SITE CONTEXT ===
Target Website: ${options.connectedSite.name} (${normalizedSiteUrl})

IMPORTANT: This website is the target topic for all generated content. Use information about this site as a source of truth for generating relevant, on-brand blog content. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the content.

All generated checklist items and content should be relevant to ${options.connectedSite.name} and aligned with its content focus, audience, and brand positioning. Ensure all content suggestions are suitable for publication on ${options.connectedSite.name}.
=== END TARGET SITE CONTEXT ===`
    : "";

  // Get WordPress posts from cache if siteId and primaryKeyword provided, otherwise use provided wordPressPosts
  let postsToUse: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
  
  if ((options as any).siteId && (options as any).primaryKeyword) {
    // Try to use cache search
    try {
      const cache = getSiteCache((options as any).siteId);
      if (cache) {
        // Search cache for relevant posts based on primary keyword
        const searchResults = searchSiteCache((options as any).siteId, (options as any).primaryKeyword, 50);
        postsToUse = searchResults.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          link: p.link,
          date_gmt: p.date_gmt
        }));
        console.log(`[Blog Template Builder] Using ${postsToUse.length} posts from cache search for keyword: ${(options as any).primaryKeyword}`);
      } else {
        // Fallback to provided wordPressPosts if cache not available
        postsToUse = options.wordPressPosts || [];
        console.log(`[Blog Template Builder] Cache not available, using provided wordPressPosts (${postsToUse.length} posts)`);
      }
    } catch (error) {
      console.warn('[Blog Template Builder] Error using cache, falling back to provided wordPressPosts:', error);
      postsToUse = options.wordPressPosts || [];
    }
  } else {
    // Use provided wordPressPosts
    postsToUse = options.wordPressPosts || [];
  }

  const wordPressPostsContext = postsToUse.length > 0
    ? `\n=== WORDPRESS POSTS SOURCE (CRITICAL - INTERNAL LINKS ONLY) ===
Available WordPress Posts from ${options.connectedSite?.name || 'target site'} (${postsToUse.length} total${(options as any).siteId && (options as any).primaryKeyword ? ` - filtered by keyword: ${(options as any).primaryKeyword}` : ''}):

${postsToUse.slice(0, 50).map((post, idx) => {
  return `${idx + 1}. [ID: ${post.id}] "${post.title}"\n   Internal Link: ${post.link || post.slug}`;
}).join('\n\n')}

CRITICAL REQUIREMENT: Your checklist items MUST be INFORMED BY these WordPress posts' internal links. The checklist should reflect content themes, topics, and structure patterns found in these existing posts' titles and URL structures.

- Analyze the available WordPress posts' titles and internal link URLs to understand the site's content themes and topics
- Generate checklist items that are RELATED to these posts based on title keywords and URL path patterns
- Ensure checklist items align with the content style and topics suggested by these WordPress post titles and URLs
- Use post titles and internal link URL structures as inspiration for generating relevant checklist items
- Focus on URL patterns, path structure, and title keywords rather than full content analysis
- The goal is to create checklist items that would naturally fit alongside these existing posts based on their link structure

CRITICAL: You are ONLY provided with post titles and internal link URLs. Use these to determine relevance - focus on URL structure, path patterns, and title keywords. This saves tokens and improves quality by focusing on link structure.

Do NOT create checklist items that are completely unrelated to these WordPress posts. All checklist items must be contextually relevant to the titles and internal links shown above.
=== END WORDPRESS POSTS SOURCE ===\n`
    : "";

  const currentPageContext = options.currentPageUrl
    ? `\n=== CRITICAL: CURRENT PAGE BEING OPTIMIZED ===
Current Page URL: ${options.currentPageUrl}

**ABSOLUTELY CRITICAL - NEVER SELF-LINK**:
- This is the URL of the existing post/page currently being optimized
- NEVER link this URL to itself in the content
- NEVER include this URL in any internal link suggestions
- NEVER reference this URL in checklist items
- Self-referential links (linking a page to itself) are bad for SEO and must be avoided
- When suggesting internal links, exclude this URL from all link suggestions
- Only suggest links to OTHER pages/posts, never to this current page

This instruction applies to ALL checklist items that mention links or internal links.
=== END CURRENT PAGE CONTEXT ===\n`
    : "";

  const serpDataContext = options.serpData
    ? `
--- SERP Data (Full JSON Response) ---
Below is the complete SERP (Search Engine Results Page) data from DataForSEO API. Use this data to inform your checklist generation:

1. **Top Ranking Content Patterns**: Analyze the top organic results to understand what content structure and topics are ranking well
2. **SERP Features**: Note any featured snippets, People Also Ask, related searches, or other SERP features that indicate content opportunities
3. **Content Gaps**: Identify what top-ranking pages are covering and suggest checklist items that address gaps or improve upon existing content
4. **User Intent Signals**: Use the SERP data to better understand user search intent and create checklist items that match that intent

SERP Data (JSON):
${JSON.stringify(options.serpData, null, 2)}
`
    : "";

  const systemPrompt = `You are an expert blog content strategist and blueprint architect. Your role is to create a detailed, robust checklist for generating a blog template blueprint based on the provided selections.

${keywordSection}

CRITICAL: Use natural, conversational language - avoid keyword stuffing. Use semantic variations as the default (e.g., "wood blinds" instead of exact full phrase). Only use exact full keyword match 1-2 times maximum. Prioritize natural, human-sounding sentences over SEO-exact matches. If content feels repetitive or robotic, reduce keyword density and use more variations.

--- Blog Title ---
${title}
${targetSiteContext}${wordPressPostsContext}${currentPageContext}${h2Section}${paaSection}${researchLinksSection}${userPromptSection}${entityContext}${serpDataContext}

Create a checklist (5-10 items) based on selected H2 sections. Each item must include:

**Structure**:
- H2 sections: 1-2 paragraphs. If more needed: "[STRUCTURE]: Include 3-5 H3 subheadings with 2-3 paragraphs under each covering [specific subtopics]"
- Mix content: Include [TABLE] or [LIST] where appropriate for variety. For lists, suggest both bulleted lists (unordered) and numbered lists (ordered) depending on the content type - use numbered lists for step-by-step processes, rankings, or sequences, and bulleted lists for features, benefits, or general items
- Block quotes: You can creatively present entity facts using [BLOCKQUOTE]: [entity fact description] - use these sparingly, MAXIMUM 1-2 block quotes per entire blueprint, only where entity facts would add value and visual interest

**Links - WORDPRESS POSTS ONLY**:
- Every section: "[LINK]: 3-5 internal links using anchor text: '[selected keywords]' (where relevant) from WordPress posts list"
- **CRITICAL: ONLY use links from WordPress posts - NEVER use external links or knowledge file links**
- Distribute selected keywords across sections as anchor text
- If no keywords: "[LINK]: 3-5 internal links to [topic] from WordPress posts list"
- Weave keywords elegantly into anchor text - integrate them naturally within sentence structure using semantic variations and natural syntax
- Use semantic variations as default (e.g., "wood blinds" instead of full exact phrase)
- Limit exact full keyword matches to 1-2 instances maximum in entire article
- Vary anchor text: 50% natural descriptive, 30% branded, 20% keyword-rich (not exact match)
- If keyword usage feels repetitive, reduce density and increase semantic variation
- **CRITICAL: Keep anchor text SHORT (2-5 words maximum)** - only link the key phrase, NOT entire sentences. Extract only the essential keyword phrase for linking
- **CRITICAL: NEVER nest anchor tags** - prevent double <a> tags that create invalid HTML
${options.currentPageUrl ? `\n**CRITICAL: NEVER SELF-LINK**:
- When optimizing an existing post, NEVER link the post's URL to itself in the content
- The current page URL (${options.currentPageUrl}) must NEVER appear in any internal link suggestions
- Self-referential links are bad for SEO and must be completely avoided
- Only suggest links to OTHER pages/posts, never to the current page being optimized
- This applies to ALL checklist items that mention links or internal links` : ""}

**Research Links (External Links - WIKIPEDIA ONLY)** (if provided above):
- **ABSOLUTELY CRITICAL**: ONLY Wikipedia links are allowed - NO OTHER EXTERNAL SITES
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links from the list above
- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia
- CRITICAL REQUIREMENT: For EACH VALIDATED Wikipedia link listed in the "Selected Research Links" section above, you MUST explicitly include an external link instruction in the checklist
- MANDATORY: Every VALIDATED Wikipedia link MUST appear in at least one checklist item with the format: "[EXTERNAL LINK]: Link to [FULL URL] with anchor text '[relevant anchor text]'"
- DO NOT skip any VALIDATED Wikipedia links - if a Wikipedia link is listed above, it MUST be referenced in the checklist
- **CRITICAL**: If a link in the list above is NOT Wikipedia, you MUST REJECT IT and NOT include it in the checklist

**ABSOLUTELY FORBIDDEN - EXTERNAL LINK EXCLUSION RULES**:
- NEVER link to competitor websites - A competitor is any business in the same industry offering similar products/services
**ABSOLUTELY CRITICAL - EXTERNAL LINK RESTRICTIONS (NO EXCEPTIONS)**:
- **ONLY Wikipedia links are allowed as external links** - NO OTHER EXTERNAL SITES PERMITTED
- **NEVER create, invent, or hallucinate external links** - ONLY use Wikipedia links if explicitly provided in the research links list above
- **NEVER link to pfwbs.org, windowcoverings.org, cpsc.gov, nbcnews.com, or ANY other external site** - ONLY Wikipedia
- **NEVER link to government sites, news sites, industry sites, competitor sites, or ANY other external domain** - ONLY Wikipedia
- If a link in the research links list is NOT Wikipedia, you MUST REJECT IT and NOT include it in the checklist
- If you detect ANY external link that is NOT Wikipedia, you MUST exclude it from the checklist IMMEDIATELY

**ONLY ALLOWED LINKS**:
1. **Internal links to ${normalizedSiteUrl || 'the target website'}** - These are REQUIRED (3-5 per section)
2. **Wikipedia links ONLY** - https://en.wikipedia.org/... or https://wikipedia.org/... (if explicitly provided in research links list above)

- Distribute VALIDATED Wikipedia links (if any) naturally throughout the content where they add value
- Use descriptive, relevant anchor text that fits naturally into the content context
- Example format: "[EXTERNAL LINK]: Link to https://en.wikipedia.org/wiki/... with anchor text 'comprehensive guide'"
- **CRITICAL**: If NO Wikipedia links are provided in the research links list, do NOT create or hallucinate any external links
- IMPORTANT: For internal links, use the target site URL provided in the TARGET SITE CONTEXT above, NOT example.com or placeholder URLs
- If multiple research links are selected, ensure each VALIDATED one is linked to in appropriate sections - do not combine multiple links into a single checklist item unless they are truly related

**People Also Ask Questions** (if provided above):
- **CRITICAL: ALL PAA questions go in the FAQ table ONLY** - NEVER create a separate "People Also Ask" section or dedicated agents for PAA questions
- **NEVER create an H2 or agent titled "People Also Ask"** - this is FORBIDDEN
- ALL People Also Ask questions MUST be answered in the SINGLE FAQ table at the END of the blog
- The FAQ table should use [FAQ]: 2-column Q&A table format with Question and Helpful Answer columns
- Include ALL PAA questions as rows in this single FAQ table
- Do NOT create separate sections, agents, or headings for individual PAA questions
- The FAQ agent at the end is the ONLY place for PAA questions - consolidate everything there

**Location/Entity Variation**:
- VARY location mentions - use exact location name sparingly (2-3 times maximum)
- Use broader geographic terms frequently (Tampa Bay area, Pinellas County, coastal Florida, etc.)
- Mix location references: exact name (rare), broader region (common), general area (frequent)
- Example: "Oldsmar" (2-3 times) → "Tampa Bay area" (frequent) → "Pinellas County" (frequent) → "local homes" (most common)

**Real-World Expertise Examples** (CRITICAL - MUST include in at least one section):
- Add authentic experience statements demonstrating expertise (EEAT signals)
- Use natural phrasing showing hands-on experience
- Include statements like: "After installing hundreds of systems in [location/variation], we've found..." or "Our experience serving [broader area] has shown..."
- Place in Benefits, Features, or How-To sections naturally
- Make it sound specific and genuine - avoid generic statements
- Format: "[REAL-WORLD EXAMPLE]: Include natural expertise statement demonstrating hands-on experience with [topic] in [location variation]"

**Other**:
- DO NOT include [IMAGE] unless user requests it
- **FAQ - SINGLE TABLE ONLY**: Create exactly ONE FAQ agent at the very END of the blog. Use "[FAQ]: 2-column Q&A table" format. NEVER create multiple FAQ tables or sections - consolidate ALL FAQ questions into this single table. If you have multiple People Also Ask questions, put them ALL in the same FAQ table.
- Block quotes: Use [BLOCKQUOTE] for entity facts creatively, but MAXIMUM 1-2 block quotes per entire blueprint

**CRITICAL - NEVER MENTION EXTERNAL SITES OR COMPETITORS**:
- **NEVER create H2 or H3 headings that mention external websites** (e.g., "Topic - Houzz", "Topic - Reddit", "Topic - Pinterest", "According to [Site Name]")
- **NEVER create dedicated sections about external platforms** like Houzz, Reddit, Pinterest, Yelp, Amazon, or any third-party website
- **NEVER mention competitor business names** in headings or as focal points of sections
- **NEVER reference people's names** (bloggers, influencers, experts from other sites) in headings or dedicated content
- The blog is ONLY about the target site's products/services - external sites are competitors and must NOT be promoted
- If research mentions external sources, do NOT create sections dedicated to what those external sites say
- ONLY Wikipedia links are allowed as external links - NO OTHER EXTERNAL SITES (pfwbs.org, cpsc.gov, nbcnews.com, windowcoverings.org, manufacturers, etc. are FORBIDDEN)
- External links (Wikipedia only) can be used for authority but NEVER as the topic of a heading or section
- Focus ONLY on the target site's expertise, products, services, and value proposition
- Example of FORBIDDEN headings: "What Houzz Says About...", "Topic - Reddit Community", "According to [Competitor]..."
- Example of ALLOWED headings: "Types of Window Treatments", "Benefits of Professional Installation", "How to Choose the Right Blinds"

**EXPLICIT USER REQUIREMENTS**:
${options.userPrompt && options.userPrompt.trim() 
  ? `The user has provided specific requirements. You MUST explicitly note these in the checklist. CRITICAL RULES:
- If user provides an EXACT TABLE STRUCTURE (with markdown table format, columns, rows, and data), you MUST include the COMPLETE table structure in the checklist item, preserving the exact format, column headers, and all row data
- If user provides an EXACT IMAGE LINK in markdown format (![ ](url)), you MUST include the COMPLETE markdown image format in the checklist item
- If user mentions "table", include "[TABLE]: [description]" AND if they provide the exact table structure, include the full table markdown
- DO NOT include [IMAGE] features unless the user explicitly provides an image link in markdown format (![ ](url)) - in that case, preserve it exactly as provided
- If user mentions "list", include "[LIST]: [description]" in relevant checklist items, specifying whether it should be a bulleted list (unordered) or numbered list (ordered) based on the content type
- If user mentions "block quote" or "blockquote", include "[BLOCKQUOTE]: [entity fact description]" in relevant checklist items, but remember MAXIMUM 1-2 block quotes per entire blueprint
- If user mentions specific content requirements, explicitly state them in the checklist items
- Add a note like "Note: User specified [requirement]" when incorporating user requirements
- If user provides exact URLs or links in tables, preserve them exactly as provided`
  : "No specific user requirements provided."}


CRITICAL FORMAT REQUIREMENT:
Format your response as a numbered list, one item per line. Each item should be a clear, actionable instruction with explicit feature requirements.

Example format (NOTE: This example shows ALL 3 MANDATORY elements - 1 TABLE, 1 NUMBERED LIST, 1 BULLETED LIST - distributed across sections):
1. Create a first section agent with a SEO-friendly, descriptive header (NEVER use "Introduction" or "Intro" - use something like "Understanding [Topic]", "Why [Topic] Matters", or "Complete Guide to [Topic]"). [STRUCTURE]: 3 short split paragraphs (each paragraph should be 2-3 sentences only, keep paragraphs concise and well-spaced). **FOCUS KEYWORD AT START (Rank Math)**: The first paragraph (or first 1-2 sentences) MUST include the Focus Keyword (or a natural variation) near the beginning. [LINK]: Minimal linking - only link the entity name to its Wikipedia page (if entity exists) and the main service/product name to its service page. Do NOT include excessive links - keep the opening section clean and readable. Note: Use semantic variations as default - limit exact full keyword match to 1-2 times maximum. Write natural, human-sounding sentences that prioritize reader experience. Note: Do NOT create sublists, bullet lists, or 'Key Features' lists unless the [LIST] feature is explicitly specified in this checklist item. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement.
2. Create an agent for H2 "${selectedH2Sections[0] || "Section 1"}". [STRUCTURE]: 1-2 paragraphs, include **[TABLE]: Feature comparison table** (MANDATORY - every blog needs at least 1 table). [LINK]: 3-5 internal links with varied anchor text (natural descriptive phrases like "learn more about humidity-resistant options", branded like "our showroom", keyword-rich like "wood blinds" - not exact full phrase). [REAL-WORLD EXAMPLE]: Include natural expertise statement demonstrating hands-on experience (e.g., "After installing hundreds of systems in the local area, we've found that..."). Note: Target 1-2% keyword density using semantic variations. Vary location mentions (use broader geographic terms, not exact location repeatedly). IMPORTANT: Use ONLY generic city names - NEVER use specific neighborhoods or directional qualifiers. Avoid repetitive keyword patterns.
3. Create an agent for H2 "${selectedH2Sections[1] || "Section 2"}". [STRUCTURE]: Include 3-4 H3 subheadings with 2-3 paragraphs under each covering [specific subtopics]. **H3 FEATURES**: Each H3 can include [LINK]: 3-5 internal links, [LIST]: Bulleted or Numbered lists, and [TABLE] where appropriate - distribute these across H3s. [LINK]: 3-5 internal links to other blog posts with natural anchor text variety (avoid exact full keyword phrase repetition). Note: Use partial keyword matches and semantic equivalents. Vary location references (use "local area", "regional", "local homes" - mix exact location name sparingly with broader terms). IMPORTANT: Use ONLY generic city names (e.g., "Edmonton", "New York") - NEVER use specific neighborhoods or directional qualifiers. Write as a human expert would, not as SEO software generates.
4. Create an agent for H2 "${selectedH2Sections[2] || "Section 3"}". [STRUCTURE]: 1-2 paragraphs, include **[LIST]: Numbered list of key steps** (MANDATORY - every blog needs at least 1 numbered list for processes/rankings/sequences). [LINK]: 3-5 internal links using descriptive, natural anchor text (mix branded and keyword-rich, but avoid exact full phrase). Note: Prioritize natural language flow - if keyword usage feels robotic, reduce density and increase variation. Use location variation naturally (broader geographic terms frequently, exact location name sparingly). IMPORTANT: Use ONLY generic city names - NEVER use specific neighborhoods or directional qualifiers. Note: This checklist item explicitly includes [LIST] feature, so a numbered list IS required here.
5. Create an agent for H2 "${selectedH2Sections[3] || "Section 4"}". [STRUCTURE]: 1-2 paragraphs, include **[LIST]: Bulleted list of features/benefits** (MANDATORY - every blog needs at least 1 bulleted list for items/features/benefits). [LINK]: 3-5 internal links with varied anchor text types (natural descriptive, branded, keyword-rich - no exact full phrase repetition). Note: Modern SEO rewards natural content - avoid keyword stuffing patterns. Use semantic variations liberally. Mix location references (exact name rare, broader region common, general area frequent). IMPORTANT: Use ONLY generic city names - NEVER use specific neighborhoods or directional qualifiers. Note: This checklist item explicitly includes [LIST] feature, so a bulleted list IS required here.${options.entity && options.entity.trim() ? `\n6. Create an agent for H2 "${selectedH2Sections[4] || "Section 5"}". [STRUCTURE]: 1-2 paragraphs, include [BLOCKQUOTE]: Entity fact about ${options.entity.trim()}. [LINK]: 3-5 internal links using natural anchor text variety (avoid exact full keyword phrase overuse). Note: Limit exact full keyword match to 1-2 instances total in article. Vary location mentions (use broader geographic terms frequently, exact location name sparingly - 2-3 times maximum). IMPORTANT: Use ONLY generic city names - NEVER use specific neighborhoods or directional qualifiers. Use semantic variations and natural phrasing throughout. (Note: Only use 1-2 block quotes maximum per blueprint)` : ''}

Output ONLY the numbered checklist items, no additional text or explanations.`;

  // Detect if this is an entity page (has entity parameter)
  const isServiceArea = !!options.entity;

  let userPrompt = `Generate a comprehensive, detailed checklist for creating a blog template blueprint. 

CRITICAL: Weave keywords elegantly into content using natural, human-like syntax. Keywords should flow organically within sentences, enhancing readability rather than disrupting it. Use semantic variations, split keyword phrases naturally across sentences, and vary phrasing to maintain engaging, conversational tone. Always prioritize natural language flow over exact keyword matching - if a keyword feels forced, rephrase it elegantly.

CRITICAL LOCATION VARIATION: Vary location mentions naturally - do NOT repeat exact location name repeatedly (e.g., "Edmonton" over and over). Use exact location name sparingly (2-3 times maximum in entire article). Use broader geographic terms frequently (regional, local, area). IMPORTANT: Use ONLY generic city names (e.g., "Edmonton", "New York", "Toronto") - NEVER use specific neighborhoods or directional qualifiers (e.g., "West Edmonton", "North Toronto", "East New York"). Mix location references: exact name (rare), broader region (common), general area (frequent). Example: Instead of "Edmonton home" repeatedly, use "local area home", "regional residence", "Edmonton properties" (varied).

MANDATORY REAL-WORLD EXAMPLES: Include [REAL-WORLD EXAMPLE] in at least one section (Benefits, Features, or How-To work best). Add authentic expertise statements demonstrating hands-on experience - examples: "After installing hundreds of systems in [location variation], we've found..." or "Our experience serving [broader area] has shown..." or "Having worked with [location variation] homeowners for over [time period], we've learned..." Make it sound specific and genuine, not generic.
${isServiceArea ? `\n\n--- MANDATORY SERVICE AREA REQUIREMENTS ---
CRITICAL: This is a SERVICE AREA page. You MUST include the following three sections in the checklist:

1. "What We Offer" Section (MANDATORY):
   - Create a dedicated agent for a section titled "What We Offer" (or similar variation like "Our Services" or "What We Provide")
   - [STRUCTURE]: 2-3 paragraphs introducing the services/products offered
   - [TABLE]: Create a comprehensive table listing ALL products and services offered by the business. The table should have ONLY TWO columns: Service/Product Name (with internal link embedded in the name itself), and Description
   - [LINK]: Every product/service name in the table MUST be an internal link to its dedicated page. The link should be embedded directly in the service/product name (e.g., the service name itself is the clickable link). If a dedicated page doesn't exist, link to the main services/products page or relevant category page
   - **ABSOLUTELY FORBIDDEN: NEVER use formats like [URL: https://...] or [url: ...] - these are NOT proper markdown links and will be removed. Links must be in proper markdown format: [anchor text](url)**
   - **ABSOLUTELY FORBIDDEN: NEVER append links at the end of table cell descriptions like "...description. [URL: https://...]" - links must be integrated contextually into the text, not appended**
   - The table should be comprehensive and include ALL major products and services
   - Use natural, descriptive language for service/product names and descriptions
   - Ensure the table is well-organized and easy to scan
   - CRITICAL: The table must have exactly TWO columns: "Service/Product Name" (with embedded links) and "Description" - NO separate link column
   - **ABSOLUTELY FORBIDDEN: NEVER create a column with headers like 'Relevant Internal Links', 'Links', 'Link', 'Direct Link', 'View Product', or ANY column that serves only to display links. Links must be contextually integrated into the content columns (like embedding links in product names or descriptions) for better SEO.**

2. "We Care About [Entity]" Section (MANDATORY):
   - Create a dedicated agent for a section titled "We Care About ${options.entity || '[Location/Entity]'}" (use the entity name if provided, otherwise use a location-based variation)
   - [STRUCTURE]: 2-3 paragraphs expressing care, commitment, and local connection to the entity/location, followed by a bullet point list explaining how we understand the area
   - Focus on community involvement, local expertise, understanding of local needs, and commitment to serving the area
   - [LIST]: Include a bullet point list explaining how we understand the area (local needs, community characteristics, regional factors, market conditions, etc.)
   - Use natural, authentic language that demonstrates genuine care and connection
   - [LINK]: 3-5 internal links to relevant pages (about us, testimonials, service pages, etc.)
   - If entity is provided, use it naturally in the section (e.g., "We Care About Edmonton" or "We Care About [Entity Name]")
   - Make it feel personal and authentic, not generic
   - CRITICAL: This section must be placed immediately after the introduction paragraph

3. "Next Steps" Section (MANDATORY):
   - Create a dedicated agent with a CUSTOMER SERVICE AGENT persona for a section titled "Next Steps" (or similar variations like "How to Get Started", "Book Your Appointment", "Take the Next Step")
   - [AGENT PERSONA]: Write from the perspective of a friendly, helpful customer service representative who guides prospective clients through the booking/appointment process
   - [STRUCTURE]: 1-2 introductory paragraphs written in a warm, welcoming customer service tone that invites prospective clients to take action
   - [LIST]: Create a NUMBERED list (ordered list) of 4-6 clear, actionable steps that a prospective client can take to book an appointment or get started. Each step should be specific and easy to follow. Examples: "1. Call our office at [phone number] during business hours", "2. Fill out our online contact form on our website", "3. Schedule a consultation through our booking system", etc.
   - Use encouraging, supportive language that makes the process feel simple and accessible
   - Include specific contact methods (phone, online form, booking link, etc.) when available
   - [LINK]: 2-3 internal links to relevant pages (contact page, booking page, appointment scheduling page, etc.)
   - Make it feel like a helpful guide from a customer service representative who genuinely wants to help clients get started

These three sections are MANDATORY and must be included in the checklist regardless of other H2 sections selected.` : ""}

Blog Details:
- Title: "${title}"
- H2 Sections to cover: ${selectedH2Sections.join(", ")}
- Primary Keyword: "${primaryKeywordProper}"
- Related Keywords: ${selectedKeywordsProper.slice(0, 5).join(", ")}
${paaQuestions.length > 0 ? `- People Also Ask Questions to Answer: ${paaQuestions.map(p => `"${p.question}"`).join(", ")}` : ""}

Requirements:
1. Create 5-10 checklist items (one for each H2 section, plus introduction, conclusion, and ONE FAQ table at the end${isServiceArea ? ", plus the three MANDATORY service area sections: 'What We Offer', 'We Care About [Entity]', and 'Next Steps'" : ""})
2. ${paaQuestions.length > 0 ? "**CRITICAL - PAA QUESTIONS GO IN FAQ TABLE ONLY**: All People Also Ask questions listed above MUST be answered in the SINGLE FAQ table at the end. NEVER create a separate 'People Also Ask' section or heading. NEVER create dedicated agents for individual PAA questions. " : ""}Each checklist item must include:
   - [STRUCTURE]: Use 1-2 paragraphs per H2. If more content is needed, use H3 subheadings: "[STRUCTURE]: Include 3-5 H3 subheadings with 2-3 paragraphs under each covering [specific subtopics]"
   - **H3 SUBHEADING CAPABILITIES**: When using H3 subheadings, each H3 section CAN and SHOULD include its own [LINK], [LIST], or [TABLE] features. H3s are NOT limited to just paragraphs - they can contain internal links, bulleted lists, numbered lists, and tables just like H2 sections. Distribute these elements across H3s for better content structure.
   - Mix content types: Include [TABLE] or [LIST] where appropriate for variety. For lists, suggest both bulleted lists (unordered) and numbered lists (ordered) depending on the content type - use numbered lists for step-by-step processes, rankings, or sequences, and bulleted lists for features, benefits, or general items. For entity facts, you can creatively use [BLOCKQUOTE]: [entity fact description], but MAXIMUM 1-2 block quotes per entire blueprint
   - **[LINK]: 3-5 internal links to other blog posts/pages** - This is MANDATORY for EVERY section. Use anchor text with keywords integrated naturally into sentences. Link to related blog posts, service pages, and relevant content from knowledge files. Every H2 and H3 section MUST have internal links.
   - CRITICAL: Always add a note in each checklist item: "Note: Use natural, conversational language - avoid keyword stuffing. Use semantic variations as default (e.g., 'wood blinds' not full exact phrase). Limit exact full keyword match to 1-2 times maximum. Mix anchor text: 50% natural descriptive, 30% branded, 20% keyword-rich. Prioritize readability and natural flow - if content feels repetitive, reduce keyword density further."
   - CRITICAL: PREVENT UNNECESSARY SUBLISTS: Explicitly state in each checklist item: "Note: Do NOT create sublists, bullet lists, or 'Key Features' lists unless the [LIST] feature is explicitly specified in this checklist item. Write content in flowing paragraphs only. Only include lists when [LIST] is explicitly mentioned as a feature requirement."
3. Distribute keywords naturally across sections - use semantic variations as default, not exact matches
4. AVOID KEYWORD STUFFING: Target 1-2% keyword density (lower end). Use exact full match 1-2 times maximum in entire article. Use partial matches and semantic variations for 95% of mentions. Focus on natural, human-sounding sentences that prioritize reader experience over SEO exact matching. Mix anchor text types (descriptive, branded, keyword-rich) to avoid over-optimization signals.
5. Include first section and conclusion agents. For the first section agent: **CRITICAL - NEVER use "Introduction" or "Intro" as the header**. Use a SEO-friendly, descriptive header like "Understanding [Topic]", "Why [Topic] Matters", or "Complete Guide to [Topic]". [STRUCTURE]: 3 short split paragraphs (each paragraph should be 2-3 sentences only, keep paragraphs concise and well-spaced). **FOCUS KEYWORD AT START (Rank Math)**: The first paragraph (or first 1-2 sentences) MUST include the Focus Keyword (or a natural variation) near the beginning. [LINK]: Minimal linking - only link the entity name to its Wikipedia page (if entity exists) and the main service/product name to its service page. Do NOT include excessive links - keep the opening section clean and readable. For the conclusion agent: [STRUCTURE]: 1-2 paragraphs.
6. **CRITICAL - SINGLE FAQ TABLE ONLY (ALL PAA QUESTIONS GO HERE)**: ${paaQuestions.length > 0 ? `You have ${paaQuestions.length} People Also Ask questions. ALL of them MUST be answered in the ONE SINGLE FAQ table at the END. ` : ""}For FAQ content:
   - Create exactly ONE FAQ agent at the very END of the blog (after conclusion) - this agent MUST be the LAST agent
   - **MANDATORY HEADER**: The FAQ section MUST start with "## Frequently Asked Questions About [Topic]" header
   - **MINIMUM 4 FAQs REQUIRED**: The FAQ table MUST contain AT LEAST 4 question-answer pairs
   - Use [FAQ]: 2-column Q&A table format with ALL questions consolidated into this single table
   - **NEVER create a "People Also Ask" section or heading** - this is FORBIDDEN
   - **NEVER create separate agents or sections for individual PAA questions**
   - ALL PAA questions go as rows in the FAQ table - nowhere else
   - NEVER create multiple FAQ tables or FAQ sections - consolidate everything into one
   - The FAQ table should include [LINK]: 3-5 internal links in the answers where relevant
   - **ABSOLUTELY FORBIDDEN: FAQ table must ONLY appear at the bottom of the page, never in the middle**
7. CRITICAL: Include [REAL-WORLD EXAMPLE] in at least one section (Benefits, Features, or How-To work best). Add authentic expertise statements demonstrating hands-on experience - examples: "After installing hundreds of systems in [location variation], we've found..." or "Our experience serving [broader area] has shown..." Make it sound specific and genuine, not generic
8. **MANDATORY CONTENT STRUCTURE ELEMENTS (NON-NEGOTIABLE)** - Every blog MUST include ALL THREE of the following elements to break up text and improve readability:
   - **AT LEAST 1 TABLE**: You MUST include [TABLE] in at least one section. Use for comparisons, features, specifications, or data. Example: "[TABLE]: Feature comparison table" or "[TABLE]: Product specifications"
   - **AT LEAST 1 BULLETED LIST (Unordered)**: You MUST include [LIST]: Bulleted list in at least one section. Use for features, benefits, items, or options. Example: "[LIST]: Bulleted list of key benefits"
   - **AT LEAST 1 NUMBERED LIST (Ordered)**: You MUST include [LIST]: Numbered list in at least one section. Use for step-by-step processes, rankings, or sequences. Example: "[LIST]: Numbered list of installation steps"
   - These THREE elements are MANDATORY and non-negotiable. A blog without all three is INCOMPLETE.
   - Distribute them across DIFFERENT sections for variety - do not put all three in one section.
   - If the blog has 5+ sections, include 2-3 of each element type for better content structure.
   - **VALIDATION**: Before submitting your checklist, verify that you have included at least 1 [TABLE], 1 [LIST]: Bulleted list, and 1 [LIST]: Numbered list across your sections.`;
  
  // Add user prompt modifier if provided - emphasize it must be explicitly referenced
  if (options.userPrompt && options.userPrompt.trim()) {
    userPrompt += `\n\n--- CRITICAL: USER-SPECIFIED REQUIREMENTS ---\n${options.userPrompt.trim()}\n\nYou MUST explicitly incorporate these requirements in the checklist items. CRITICAL RULES:
- If the user provides an EXACT MARKDOWN TABLE (with | columns | and rows), you MUST include the COMPLETE table structure in the checklist item, preserving the exact markdown format, all column headers, all row data, and any URLs/links within the table cells
- If the user provides an EXACT IMAGE MARKDOWN LINK (![ ](url)), you MUST include the COMPLETE markdown image format in the checklist item exactly as provided
- If the user mentions specific features (tables, lists, links, markdown tables, block quotes, etc.), you MUST explicitly state them in the relevant checklist items with the proper feature format ([TABLE], [LIST], [LINK], [BLOCKQUOTE]). For lists, specify whether it should be a bulleted list (unordered) or numbered list (ordered) based on the content type. For block quotes, remember MAXIMUM 1-2 per entire blueprint, use for entity facts
- DO NOT include [IMAGE] features unless the user explicitly provides an image link in markdown format
- Add notes like "Note: User specified [requirement]" when incorporating user requirements
- Preserve exact URLs, links, and markdown formatting from user input`;
  }
  
  // Always add link requirements
  if (selectedKeywords.length > 0) {
    userPrompt += `\n\n--- MANDATORY: INTERNAL LINK REQUIREMENTS FOR ALL SECTIONS (NON-NEGOTIABLE) ---
- **CRITICAL - EVERY SECTION MUST HAVE 3-5 INTERNAL LINKS**: This is NON-NEGOTIABLE. Every H2 section and every H3 subsection MUST include "[LINK]: 3-5 internal links to other blog posts/pages"
- Internal links connect to OTHER blog posts and pages on the same website - they are CRITICAL for SEO and user navigation
- Link to related blog articles, service pages, product pages, and category pages using natural anchor text
- Distribute keywords naturally in anchor text: use semantic variations as default (not exact matches). Mix anchor text types: 50% natural descriptive phrases, 30% branded text, 20% keyword-rich (avoid exact full phrase repetition)
- Selected keywords for anchor text: ${selectedKeywords.join(", ")}
- **H3 SECTIONS ALSO NEED LINKS**: When a section has H3 subheadings, each H3 should also have 3-5 internal links distributed throughout
- **VALIDATION**: Before generating the checklist, count the [LINK] requirements - every section must have one specifying 3-5 internal links`;
  } else {
    userPrompt += `\n\n--- MANDATORY: INTERNAL LINK REQUIREMENTS FOR ALL SECTIONS (NON-NEGOTIABLE) ---
- **CRITICAL - EVERY SECTION MUST HAVE 3-5 INTERNAL LINKS**: This is NON-NEGOTIABLE. Every H2 section and every H3 subsection MUST include "[LINK]: 3-5 internal links to other blog posts/pages"
- Internal links connect to OTHER blog posts and pages on the same website (e.g., "/blog/related-article", "/services/service-page") - they are CRITICAL for SEO
- Link to related blog articles, service pages, product pages, and relevant content using natural anchor text
- **H3 SECTIONS ALSO NEED LINKS**: When a section has H3 subheadings, each H3 should also have 3-5 internal links distributed throughout
- **CRITICAL: NEVER use external links** - ONLY use links from WordPress posts list. If no relevant WordPress post exists, do NOT create a link.
- **VALIDATION**: Before generating the checklist, count the [LINK] requirements - every section must have one specifying 3-5 internal links`;
  }
  
  // Add self-link prevention instruction if currentPageUrl is provided
  if (options.currentPageUrl) {
    userPrompt += `\n\n--- CRITICAL: NEVER SELF-LINK ---
- When optimizing an existing post, NEVER link the post's URL to itself in the content
- The current page URL (${options.currentPageUrl}) must NEVER appear in any internal link suggestions
- Self-referential links are bad for SEO and must be completely avoided
- Only suggest links to OTHER pages/posts, never to the current page being optimized
- This applies to ALL checklist items that mention links or internal links`;
  }

  let fullResponse = "";

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Combine all keywords for proper case conversion
    const allKeywords = [keywordData.keyword, ...selectedKeywords].filter(Boolean);
    return parseBlogTemplateChecklist(fullResponse, allKeywords);
  } catch (error) {
    console.error("Error generating checklist from selections:", error);
    throw new Error(
      `Failed to generate checklist: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generates a blueprint JSON from template checklist
 */
export async function generateBlueprintFromTemplate(
  checklist: string[],
  context: BlogTemplateContext,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    connectedSite?: { name: string; siteUrl: string };
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    currentPageUrl?: string; // URL of the page currently being optimized
  }
): Promise<{ title?: string; purpose?: string; agents: AgentConfig[] }> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 8000,
    topP = 0.9,
  } = options;

  const userPromptSection = context.userPrompt && context.userPrompt.trim()
    ? `\n--- User Requirements ---\n${context.userPrompt.trim()}`
    : "";

  // Normalize siteUrl: remove trailing slash to prevent double slashes in links
  const normalizedSiteUrlForBlueprint = options.connectedSite?.siteUrl ? options.connectedSite.siteUrl.replace(/\/+$/, '') : '';
  
  const targetSiteContext = options.connectedSite
    ? `\n=== TARGET SITE CONTEXT ===
Target Website: ${options.connectedSite.name} (${normalizedSiteUrlForBlueprint})

IMPORTANT: This website is the target topic for all generated content. Use information about this site as a source of truth for generating relevant, on-brand blog blueprints. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the content.

All generated blueprint agents and content should be relevant to ${options.connectedSite.name} and aligned with its content focus, audience, and brand positioning. Ensure all blueprint suggestions are suitable for publication on ${options.connectedSite.name}.
=== END TARGET SITE CONTEXT ===
`
    : "";

  // Get WordPress posts from cache if siteId and primaryKeyword provided, otherwise use provided wordPressPosts
  let postsToUse: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
  
  if ((options as any).siteId && (options as any).primaryKeyword) {
    // Try to use cache search
    try {
      const cache = getSiteCache((options as any).siteId);
      if (cache) {
        // Search cache for relevant posts based on primary keyword
        const searchResults = searchSiteCache((options as any).siteId, (options as any).primaryKeyword, 50);
        postsToUse = searchResults.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          link: p.link,
          date_gmt: p.date_gmt
        }));
        console.log(`[Blog Template Builder] Using ${postsToUse.length} posts from cache search for keyword: ${(options as any).primaryKeyword}`);
      } else {
        // Fallback to provided wordPressPosts if cache not available
        postsToUse = options.wordPressPosts || [];
        console.log(`[Blog Template Builder] Cache not available, using provided wordPressPosts (${postsToUse.length} posts)`);
      }
    } catch (error) {
      console.warn('[Blog Template Builder] Error using cache, falling back to provided wordPressPosts:', error);
      postsToUse = options.wordPressPosts || [];
    }
  } else {
    // Use provided wordPressPosts
    postsToUse = options.wordPressPosts || [];
  }

  const wordPressPostsContext = postsToUse.length > 0
    ? `\n=== WORDPRESS POSTS SOURCE (CRITICAL FOR INTERNAL LINKS) ===
Available WordPress Posts from ${options.connectedSite?.name || 'target site'} (${postsToUse.length} total${(options as any).siteId && (options as any).primaryKeyword ? ` - filtered by keyword: ${(options as any).primaryKeyword}` : ''}):

${postsToUse.slice(0, 50).map((post, idx) => {
  // Handle excerpt that might be string or object with rendered property
  let excerptText = '';
  if (typeof post.excerpt === 'string') {
    excerptText = post.excerpt;
  } else if (typeof post.excerpt === 'object' && post.excerpt && 'rendered' in post.excerpt) {
    excerptText = post.excerpt.rendered || '';
  } else {
    excerptText = '';
  }
  const cleanExcerpt = (excerptText || '').substring(0, 150);
  return `${idx + 1}. [ID: ${post.id}] "${post.title}"${cleanExcerpt ? ` - ${cleanExcerpt}` : ''}\n   URL: ${post.link || post.slug}`;
}).join('\n\n')}

**ABSOLUTELY CRITICAL REQUIREMENT FOR INTERNAL LINKS (NO EXCEPTIONS)**:
- When the checklist mentions "[LINK]: 3-5 internal links to [topic]", you MUST ONLY suggest links that EXIST EXACTLY in the WordPress posts list above
- **NEVER create, invent, fabricate, construct, or hallucinate links** - If a link is not EXACTLY in the WordPress posts list above, you MUST NOT use it
- **NEVER construct URLs by guessing paths** - Do NOT create links like "/blog/some-topic" or "/service-area/city" unless that EXACT URL exists in the WordPress posts list above
- **CRITICAL**: Copy the EXACT URL from the WordPress posts list - do NOT modify, construct, or guess URLs
- If no relevant post exists for a topic, do NOT suggest an internal link for that topic - simply skip linking for that section
- Only use real URLs from the posts listed above - copy them EXACTLY as shown
- **VALIDATION**: Before including any link in the checklist, verify it exists EXACTLY in the WordPress posts list above - if it's not there, DO NOT use it

**CRITICAL: COMPETITOR LINK EXCLUSION**:
- NEVER suggest links to competitor websites in checklist items
- A competitor is any website in the same industry/business category offering similar products or services as the target site
- If a WordPress post or external link points to a competitor's website (different domain, same industry), you MUST NOT suggest it
- Only suggest links to: (1) the target site itself (internal links), (2) authoritative non-competitor sources, or (3) manufacturer/supplier websites that are not direct competitors
=== END WORDPRESS POSTS SOURCE ===\n`
    : "";

  const currentPageContextForBlueprint = options.currentPageUrl
    ? `\n=== CRITICAL: CURRENT PAGE BEING OPTIMIZED ===
Current Page URL: ${options.currentPageUrl}

**ABSOLUTELY CRITICAL - NEVER SELF-LINK**:
- This is the URL of the existing post/page currently being optimized
- NEVER link this URL to itself in the content
- NEVER include this URL in any internal link suggestions in agent features
- NEVER reference this URL in blueprint agent descriptions or features
- Self-referential links (linking a page to itself) are bad for SEO and must be avoided
- When suggesting internal links in agent features, exclude this URL from all link suggestions
- Only suggest links to OTHER pages/posts, never to this current page

**RE-OPTIMIZED TITLE (existing post)**:
- This is an existing post being re-optimized. The "title" field in the blueprint MUST be a re-optimized, SHORTER, and more concise version (max 50 characters).
- Do NOT copy the existing title (Flow Context Title above) verbatim. Create a shorter, keyword-focused alternative.
- Death Star module requirement: MAXIMUM 50 characters - NO EXCEPTIONS.

This instruction applies to ALL agent features that mention links or internal links.
=== END CURRENT PAGE CONTEXT ===\n`
    : "";

  const systemPrompt = `You are the **Blueprint Architect AI**. Your task is to create a complete blog blueprint structure based on the provided checklist.

--- Flow Context ---
Title: ${context.flowTitle || "Untitled Article"}
Purpose: ${context.flowPurpose || "Not specified"}
${context.keywordData ? `Primary Keyword: ${context.keywordData.keyword.toLowerCase()}` : ""}
${targetSiteContext}${wordPressPostsContext}${currentPageContextForBlueprint}${userPromptSection}

--- Template Checklist ---
${checklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}

--- Your Task ---
Generate a complete blueprint JSON structure with:
1. A clear, SEO-friendly "title" for the blog article
   **CRITICAL: Title MUST be MAXIMUM 50 characters (Death Star module requirement)**
   **ABSOLUTELY MANDATORY: Count every character. Title cannot exceed 50 characters.**
   **If your title is longer than 50 characters, it will be automatically truncated and may lose important information.**
2. A concise "purpose" description
3. An "agents" array with agent objects for each section specified in the checklist

--- CRITICAL: INTERPRETING CHECKLIST ITEMS ---
The checklist items may contain explicit feature requirements in formats like:
- "[LIST]: description" - Include this as a feature
- "[TABLE]: description" OR "[TABLE]: [COMPLETE MARKDOWN TABLE STRUCTURE]" - Include this as a feature. If a complete markdown table is provided in the checklist, preserve it exactly in the agent description or as a [CUSTOM] feature
- "[BLOCKQUOTE]: description" - Include this as a feature for entity facts. Format as a block quote (use markdown > format). MAXIMUM 1-2 block quotes per entire blueprint
- "[IMAGE]: description" OR "[IMAGE]: ![ ](url)" - Only include this if the user explicitly provided an image in the checklist. DO NOT add [IMAGE] features that weren't explicitly provided by the user
- "[LINK]: 3-5 internal links to [topic] from WordPress posts list" - **ABSOLUTELY MANDATORY - 3-5 LINKS REQUIRED**: This feature MUST be included in EVERY agent. The number "3-5" is NON-NEGOTIABLE - not "some links" or "a few links", but EXACTLY "3-5 internal links". Internal links are links to other pages/sections within the same website and are MANDATORY for SEO. **CRITICAL: ONLY use links from WordPress posts list - NEVER use external links or knowledge file links**. This applies to ALL agents: introduction, content sections, conclusion, FAQ - EVERY SINGLE ONE.
- "[FAQ]: 2-column Q&A table" - This must be a separate FAQ agent at the end
- "Note: User specified [requirement]" - Pay special attention to these requirements

When you see these in checklist items, you MUST include them as features in the corresponding agent object.
If a complete markdown table is provided in the checklist, preserve it exactly in the agent description or features.

--- CRITICAL AGENT STRUCTURE ---
Every agent object MUST have the following exact structure:
{
  "id": "unique-agent-id-string",
  "step": 1,
  "title": "Agent Title Here",
  "description": "Detailed description of what this agent does",
  "features": ["[LIST]: description", "[LINK]: description"],
  "h2Count": 1,
  "h3Count": 0,
  "h3Enabled": false,
  "headingLevel": 2,
  "maxTokens": 2000
}

CRITICAL REQUIREMENTS:
- Use "title" NOT "name" for the agent title field
- **ABSOLUTELY FORBIDDEN - NEVER USE "INTRODUCTION"**: NEVER use "Introduction", "Intro", "Overview", "Getting Started", or any generic non-SEO headers as agent titles. The first agent (step 1) MUST have a SEO-friendly, descriptive, agentic header that helps with SEO (e.g., "Understanding Child Safe Window Treatments", "Why Window Covering Safety Matters", "Complete Guide to Child-Safe Blinds"). Generic headers like "Introduction" provide no SEO value and are FORBIDDEN.
- The "description" field MUST be a string describing what the agent does. If checklist contains exact markdown table or image, you may reference it in the description
- The "features" field MUST be an array of strings. Each feature should follow the format: "[TYPE]: description" where TYPE is one of: LIST, LINK, CUSTOM, FAQ, BLOCKQUOTE
- When checklist items mention "[TABLE]" with a complete markdown table structure, include it as "[CUSTOM]: [preserve the complete markdown table structure exactly as provided in checklist]" OR include the table structure in the agent description
- DO NOT include [IMAGE] features unless the user explicitly provided an image in the checklist. If an image markdown format (![ ](url)) is explicitly provided in the checklist, include it as "[IMAGE]: [preserve the exact markdown image format from checklist]"
- When checklist items mention "[LIST]", include it as "[LIST]: [description from checklist]"
- **CRITICAL: PREVENT UNNECESSARY SUBLISTS**: Only include [LIST] features when explicitly specified in the checklist item. If a checklist item does NOT contain "[LIST]" as a feature requirement, the agent description must explicitly state: "Write content in flowing paragraphs only. Do NOT create sublists, bullet lists, or 'Key Features' lists. Only include lists when [LIST] is explicitly mentioned as a feature requirement."
- When checklist items mention "[BLOCKQUOTE]", include it as "[BLOCKQUOTE]: [description from checklist]" - format as a block quote for entity facts
- **ABSOLUTELY MANDATORY - 3-5 LINKS REQUIRED**: When checklist items mention "[LINK]: 3-5 internal links to [topic] from WordPress posts list", include it EXACTLY as "[LINK]: 3-5 internal links to [topic] from WordPress posts list" - the "3-5" specification is CRITICAL and cannot be omitted or changed. Internal links are MANDATORY for every agent.
- **CRITICAL VALIDATION - 3-5 LINKS MANDATORY**: Before outputting the blueprint, verify that EVERY agent has a [LINK] feature that SPECIFICALLY mentions "3-5 internal links". Count through each agent:
  - Does EVERY agent have a [LINK] feature? If NO, add it immediately.
  - Does the [LINK] feature specify "3-5" (not just "links")? If NO, update it to include "3-5".
  - The format MUST be: "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list"
  - **CRITICAL: ONLY use links from WordPress posts - NEVER use external links or knowledge file links**
  - This validation applies to ALL agents without exception.
${options.currentPageUrl ? `- **CRITICAL: NEVER SELF-LINK**: When optimizing an existing post, NEVER link the post's URL (${options.currentPageUrl}) to itself in any agent features. Self-referential links are bad for SEO and must be completely avoided. Only suggest links to OTHER pages/posts, never to the current page being optimized.` : ""}
- CRITICAL: Keywords should be used in their NATURAL FORM (typically lowercase for generic terms) - only capitalize proper nouns, geographic locations, or at sentence starts. Do NOT randomly capitalize generic keywords like "blinds", "shades", "windows", etc.
- **CRITICAL: NEVER use external links** - ONLY use links from WordPress posts list. If no relevant WordPress post exists, do NOT create a link.
- CRITICAL: FAQ features ([FAQ]) are NOT allowed in individual agents. If FAQs are needed, create a separate 'FAQ' agent at the very end of the blog with [FAQ]: 2-column Q&A table and [LINK]: 3-5 internal links to [related topic pages]
- The "id" field MUST be a unique string for each agent (e.g., "agent-1", "agent-2", etc.)
- The "step" field MUST be a number indicating the order (1, 2, 3, etc.). Steps MUST be sequential and non-overlapping
- Create one agent for each major section/requirement in the checklist
- FAQ agent must be the LAST agent in the blueprint (highest step number) and must contain [FAQ]: 2-column Q&A table as its feature, plus [LINK]: 3-5 internal links to [related topic pages]
- **CRITICAL**: FAQ agent MUST generate a header "## Frequently Asked Questions About [Topic]" BEFORE the table
- **CRITICAL**: FAQ table MUST contain AT LEAST 4 question-answer pairs (minimum 4 FAQs required)
- **ABSOLUTELY FORBIDDEN**: FAQ table must ONLY appear at the bottom of the page, never in the middle of content
- **ABSOLUTELY MANDATORY REQUIREMENT - 3-5 LINKS NON-NEGOTIABLE**: EVERY agent MUST include [LINK]: 3-5 internal links to [related topic pages] from WordPress posts list - this is NON-NEGOTIABLE and cannot be omitted. The number "3-5" is MANDATORY - not optional, not "some links", but EXACTLY "3-5 internal links". If an agent does not have a [LINK] feature with "3-5" specified, the blueprint is INVALID. Every single agent in the blueprint (introduction, content sections, conclusion, FAQ - ALL OF THEM) must have exactly one [LINK] feature with the format "[LINK]: 3-5 internal links to [topic] from WordPress posts list". **CRITICAL: ONLY use links from WordPress posts - NEVER use external links or knowledge file links**
- If checklist items mention "Note: User specified [requirement]", ensure those requirements are reflected in the agent features and description
- If checklist contains exact markdown table, preserve the exact format in features or description
- Ensure the blueprint is valid JSON

**ABSOLUTELY CRITICAL - WORDPRESS POSTS ONLY FOR LINKS**:
- **ONLY use links from the WordPress posts list** - These are the ONLY links allowed
- **NEVER use external links** that are NOT in the WordPress posts list
- **NEVER use links from knowledge files** - Knowledge files are for content reference ONLY, NOT for linking
- **NEVER create, invent, or fabricate any links** - If a link is not in the WordPress posts list, you MUST NOT use it
- When including "[LINK]" features in agent objects, use format: "[LINK]: 3-5 internal links to [topic] from WordPress posts list"
- If no relevant WordPress post exists for a topic, do NOT create a link for that topic - simply skip linking for that section

**ABSOLUTELY CRITICAL - TITLE LENGTH REQUIREMENT**:
- The "title" field MUST be EXACTLY 50 characters or LESS
- Count every single character including spaces and punctuation
- If your title exceeds 50 characters, it will be automatically truncated and may lose important information
- Example: "Complete Guide to Window Treatments" (38 chars) ✅ CORRECT
- Example: "The Ultimate Guide to Hurricane-Proof Window Coverings in Florida: Costs, Benefits & Options" (88 chars) ❌ TOO LONG - WILL BE TRUNCATED
- Keep titles concise and focused - prioritize the primary keyword and main topic
- Death Star module requirement: MAXIMUM 50 characters - NO EXCEPTIONS

**ABSOLUTELY FORBIDDEN - NEVER USE "INTRODUCTION" AS A HEADER**:
- NEVER use "Introduction", "Intro", or any variation as an agent title or H2 header
- The first agent (step 1) MUST have a SEO-friendly, descriptive, agentic header that helps with SEO
- Examples of GOOD first headers: "Understanding Child Safe Window Treatments", "Why Window Covering Safety Matters", "Complete Guide to Child-Safe Blinds"
- Examples of BAD first headers: "Introduction", "Intro", "Overview", "Getting Started"

Example structure:
{
  "title": "Complete Guide to [Topic]",
  "purpose": "A comprehensive guide covering [topic] with practical examples and actionable tips",
  "agents": [
    {
      "id": "agent-1",
      "step": 1,
      "title": "Understanding [Primary Topic]",
      "description": "Provides an engaging overview of the topic with SEO-friendly context",
      "features": ["[LIST]: Key points overview", "[LINK]: 3-5 relevant links"],
      "h2Count": 1,
      "h3Count": 0,
      "h3Enabled": false,
      "headingLevel": 2,
      "maxTokens": 2000
    }
  ]
}

Output ONLY valid JSON. Do not include markdown code blocks, explanations, or any text outside the JSON structure.`;

  let userPrompt = `Generate the complete blueprint JSON structure based on the checklist above. Include a title, purpose, and agents array with one agent for each checklist item.`;
  
  // Add user prompt modifier if provided
  if (context.userPrompt && context.userPrompt.trim()) {
    userPrompt += `\n\nPlease incorporate the following requirements: ${context.userPrompt.trim()}`;
  }

  let fullResponse = "";

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Parse JSON response
    const parsed = JSON.parse(cleanedResponse);

    // Validate and structure the response
    let agents: AgentConfig[] = Array.isArray(parsed.agents)
      ? parsed.agents.map((agent: any, index: number) => {
          const features = Array.isArray(agent.features) ? agent.features : [];
          
          // MANDATORY: Ensure every agent has a [LINK] feature with 3-5 links specification
          const hasLinkFeature = features.some((f: string) => 
            typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
          );
          
          // Check if link feature specifies 3-5 links (not just any link)
          const hasCorrectLinkFormat = features.some((f: string) => 
            typeof f === 'string' && 
            f.toLowerCase().trim().startsWith('[link]') && 
            (f.includes('3-5') || f.includes('3 to 5') || f.includes('three to five'))
          );
          
          if (!hasLinkFeature) {
            // Add the mandatory [LINK] feature if missing
            features.push("[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list");
            console.warn(`Agent "${agent.title || `agent-${index + 1}`}" was missing mandatory [LINK] feature. Added automatically.`);
          } else if (!hasCorrectLinkFormat) {
            // Replace existing link feature if it doesn't specify 3-5 links
            const linkIndex = features.findIndex((f: string) => 
              typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
            );
            if (linkIndex >= 0) {
              features[linkIndex] = "[LINK]: 3-5 internal links to [related topic pages] from WordPress posts list";
              console.warn(`Agent "${agent.title || `agent-${index + 1}`}" had [LINK] feature but didn't specify 3-5 links. Updated automatically.`);
            }
          }
          
          let agentTitle = agent.title || `Section ${index + 1}`;
          
          // CRITICAL: Never allow "Introduction" or "Intro" as a header - replace with SEO-friendly alternative
          const titleLower = agentTitle.toLowerCase().trim();
          if (titleLower === 'introduction' || titleLower === 'intro' || titleLower.startsWith('introduction ') || titleLower.startsWith('intro ')) {
            // For first agent, use SEO-friendly descriptive header
            if (index === 0 || (agent.step || index + 1) === 1) {
              // Try to extract topic from flow title or use generic SEO-friendly header
              const flowTitle = context.flowTitle || '';
              const topicMatch = flowTitle.match(/(.+?)(?:\s*[:|]|\s+vs\.|\s+Guide|\s+Complete)/i);
              const topic = topicMatch ? topicMatch[1].trim() : 'the Topic';
              agentTitle = `Understanding ${topic}`;
              console.warn(`[Blueprint Validation] Replaced "Introduction" with SEO-friendly header: "${agentTitle}"`);
            } else {
              // For other agents, use a more descriptive title based on description
              const descWords = agent.description ? agent.description.split(/\s+/).slice(0, 5).join(' ') : 'Content';
              agentTitle = descWords.length > 50 ? descWords.substring(0, 47) + '...' : descWords;
              console.warn(`[Blueprint Validation] Replaced "Introduction" with descriptive header: "${agentTitle}"`);
            }
          }
          
          return {
            id: agent.id || `agent-${index + 1}`,
            step: agent.step || index + 1,
            title: agentTitle,
            description: agent.description || "",
            features: features,
            h2Count: agent.h2Count ?? 1,
            h3Count: agent.h3Count ?? 0,
            h3Enabled: agent.h3Enabled ?? false,
            headingLevel: agent.headingLevel ?? 2,
            maxTokens: agent.maxTokens ?? 2000,
          };
        })
      : [];

    // CRITICAL: Ensure only ONE FAQ agent exists and it's at the END
    const faqAgents = agents.filter((agent, index) => {
      const hasFAQFeature = agent.features?.some((f: string) => 
        typeof f === 'string' && (f.toLowerCase().trim().includes('[faq]') || f.toLowerCase().trim().includes('faq'))
      ) ?? false;
      return hasFAQFeature;
    });

    if (faqAgents.length > 1) {
      // Multiple FAQ agents found - keep only the last one, remove others
      console.warn(`[Blueprint Validation] Found ${faqAgents.length} FAQ agents. Removing all except the last one.`);
      
      // Find the last FAQ agent index
      let lastFAQIndex = -1;
      for (let i = agents.length - 1; i >= 0; i--) {
        const hasFAQFeature = agents[i].features?.some((f: string) => 
          typeof f === 'string' && (f.toLowerCase().trim().includes('[faq]') || f.toLowerCase().trim().includes('faq'))
        ) ?? false;
        if (hasFAQFeature) {
          lastFAQIndex = i;
          break;
        }
      }
      
      // Remove all FAQ agents except the last one
      agents = agents.filter((agent, index) => {
        const hasFAQFeature = agent.features?.some((f: string) => 
          typeof f === 'string' && (f.toLowerCase().trim().includes('[faq]') || f.toLowerCase().trim().includes('faq'))
        ) ?? false;
        return !hasFAQFeature || index === lastFAQIndex;
      });
    }

    // Ensure FAQ agent is at the end (highest step number)
    const faqAgentIndex = agents.findIndex((agent) => {
      const hasFAQFeature = agent.features?.some((f: string) => 
        typeof f === 'string' && (f.toLowerCase().trim().includes('[faq]') || f.toLowerCase().trim().includes('faq'))
      ) ?? false;
      return hasFAQFeature;
    });

    if (faqAgentIndex >= 0 && faqAgentIndex < agents.length - 1) {
      // FAQ agent is not at the end - move it to the end
      console.warn(`[Blueprint Validation] FAQ agent found at position ${faqAgentIndex + 1}, moving to end.`);
      const faqAgent = agents[faqAgentIndex];
      agents.splice(faqAgentIndex, 1); // Remove from current position
      agents.push(faqAgent); // Add to end
      
      // Update step numbers to be sequential
      agents.forEach((agent, index) => {
        agent.step = index + 1;
      });
    }

    // CRITICAL: Enforce 50 character limit for Death Star module (optimized content)
    let finalTitle = parsed.title || context.flowTitle || "Untitled Article";
    const originalTitleLength = finalTitle.length;
    finalTitle = truncateTitleForSEO(finalTitle, 50);
    if (originalTitleLength > 50) {
      console.log('[Blog Template Builder] Truncated blueprint title to 50 characters (Death Star module requirement):', {
        original: parsed.title || context.flowTitle || "Untitled Article",
        truncated: finalTitle,
        originalLength: originalTitleLength,
        truncatedLength: finalTitle.length
      });
    }

    return {
      title: finalTitle,
      purpose: parsed.purpose || context.flowPurpose || "Not specified",
      agents,
    };
  } catch (error) {
    console.error("Error generating blueprint from template:", error);
    throw new Error(
      `Failed to generate blueprint: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

