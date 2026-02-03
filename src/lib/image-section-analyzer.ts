import { streamChatCompletion } from "@/lib/api";
import { parseMarkdownSections, type MarkdownSection } from "@/lib/section-parser";

export type ImageType = 'infographic' | 'blog-image' | 'diagram' | 'illustration' | 'chart' | 'photo' | 'custom';

export interface ImageTypeRequirements {
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19';
  description: string;
  mobileOptimized?: boolean;
}

export const IMAGE_TYPE_REQUIREMENTS: Record<ImageType, ImageTypeRequirements> = {
  'infographic': {
    aspectRatio: '9:16',
    description: 'Mobile optimized displays tall (9:16 or 9:19 aspect ratio), data visualization friendly',
    mobileOptimized: true,
  },
  'blog-image': {
    aspectRatio: '16:9',
    description: 'Standard blog post image (16:9 aspect ratio)',
    mobileOptimized: false,
  },
  'diagram': {
    aspectRatio: '16:9',
    description: 'Technical diagram format, clear labels',
    mobileOptimized: false,
  },
  'illustration': {
    aspectRatio: '16:9',
    description: 'Visual illustration style',
    mobileOptimized: false,
  },
  'chart': {
    aspectRatio: '16:9',
    description: 'Data chart format',
    mobileOptimized: false,
  },
  'photo': {
    aspectRatio: '16:9',
    description: 'Photographic style',
    mobileOptimized: false,
  },
  'custom': {
    aspectRatio: '16:9',
    description: 'Custom image based on user prompt',
    mobileOptimized: false,
  },
};

/**
 * Analyzes blog content to find the best H2 section for the specified image type
 */
export async function analyzeBestSectionForImage(
  markdownContent: string,
  imageType: ImageType,
  flowTitle: string,
  flowPurpose: string,
  userPrompt?: string,
  apiKey?: string,
  model: string = getResearchModel()
): Promise<string> {
  if (!apiKey) {
    throw new Error('API key is required for section analysis');
  }

  const sections = parseMarkdownSections(markdownContent);
  let h2Sections = sections.filter(s => s.headerLevel === 2);

  if (h2Sections.length === 0) {
    throw new Error('No H2 sections found in the content');
  }

  // CRITICAL: For infographics, NEVER use the first section (intro section)
  // Exclude the first H2 section from consideration
  if (imageType === 'infographic' && h2Sections.length > 1) {
    h2Sections = h2Sections.slice(1); // Remove first section
  }

  if (h2Sections.length === 0) {
    throw new Error('No suitable H2 sections found (excluding intro section for infographics)');
  }

  const imageTypeInfo = IMAGE_TYPE_REQUIREMENTS[imageType];
  
  // Build sections summary for AI analysis, marking which sections have tables/lists
  const sectionsSummary = h2Sections.map((section, index) => {
    const contentPreview = section.content.substring(0, 500).replace(/\n/g, ' ').trim();
    const hasTable = section.content.includes('|') || section.content.toLowerCase().includes('table');
    const hasList = section.content.match(/^\s*[-*+]\s/m) || section.content.match(/^\s*\d+\.\s/m);
    const indicators = [];
    if (hasTable) indicators.push('HAS TABLE');
    if (hasList) indicators.push('HAS LIST');
    const indicatorText = indicators.length > 0 ? ` [${indicators.join(', ')}]` : '';
    return `${index + 1}. "${section.header}"${indicatorText}\n   Content preview: ${contentPreview}${contentPreview.length >= 500 ? '...' : ''}`;
  }).join('\n\n');

  const systemPrompt = `You are an expert content analyst. Your task is to analyze blog content and identify the best H2 section for generating a specific type of in-content image.

Image Type: ${imageType}
Image Requirements: ${imageTypeInfo.description}
${imageTypeInfo.mobileOptimized ? 'CRITICAL: This image must be optimized for mobile displays (tall format).' : ''}
${userPrompt ? `User's additional requirements: ${userPrompt}` : ''}

Blog Context:
- Title: ${flowTitle}
- Purpose: ${flowPurpose}

Available H2 Sections:
${sectionsSummary}

Analyze each section and determine which one would be most suitable for generating a ${imageType} image. Consider:
1. Content relevance - does the section contain information that would benefit from this image type?
2. Data richness - for infographics/charts, does the section contain data, statistics, or comparisons?
3. Visual potential - would this section benefit from visual representation?
4. User requirements - if provided, does the section match the user's specific needs?
${imageType === 'infographic' ? '5. CRITICAL PRIORITY: For infographics, you MUST prioritize sections that contain tables, lists, comparisons, or structured data. Look for sections marked with [HAS TABLE] or [HAS LIST] in the list above. These sections are ideal for infographics because they contain structured information that can be visualized with text labels and annotations.' : ''}

${imageType === 'infographic' ? `CRITICAL FOR INFOGRAPHICS: 
- You MUST select a section that contains tables, lists, comparisons, or structured data (prefer sections marked [HAS TABLE] or [HAS LIST])
- NEVER select the first/intro section (it has been excluded from this list)
- The section should have enough content to create a detailed, text-rich infographic that explains the section clearly without needing the original article context
- The infographic must include explanatory text, labels, and annotations to be understandable when shared on social media
- The infographic will be tall and mobile-optimized (9:16 aspect ratio), designed for vertical scrolling on mobile devices` : ''}

Return ONLY the exact header text of the best matching section, nothing else.`;

  let analysisResult = '';
  await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Which H2 section is best for a ${imageType} image? Return only the exact header text.` }
    ],
    temperature: 0.7,
    maxTokens: 200,
    topP: 0.9,
    onContentChunk: (chunk) => {
      analysisResult += chunk;
    }
  });

  // Extract section header from response
  const cleanedResult = analysisResult.trim();
  
  // Try to find exact match first
  const exactMatch = h2Sections.find(s => 
    s.header.toLowerCase() === cleanedResult.toLowerCase()
  );
  
  if (exactMatch) {
    return exactMatch.header;
  }

  // Try fuzzy matching - check if any section header is contained in the result or vice versa
  const fuzzyMatch = h2Sections.find(s => {
    const sectionLower = s.header.toLowerCase();
    const resultLower = cleanedResult.toLowerCase();
    return sectionLower.includes(resultLower) || resultLower.includes(sectionLower);
  });

  if (fuzzyMatch) {
    return fuzzyMatch.header;
  }

  // Fallback: return the first H2 section that seems data-rich (for infographics) or just the first one
  if (imageType === 'infographic' || imageType === 'chart') {
    // CRITICAL: Prioritize sections with tables or lists for infographics
    const tableOrListSection = h2Sections.find(s => {
      const content = s.content.toLowerCase();
      return content.includes('|') || // Markdown table indicator
             content.includes('table') || 
             content.includes('list') ||
             content.match(/^\s*[-*+]\s/m) || // Markdown list indicator
             content.match(/^\s*\d+\.\s/m); // Numbered list indicator
    });
    
    if (tableOrListSection) {
      return tableOrListSection.header;
    }
    
    // Then look for other data-rich sections (but still not the first one)
    const dataRichSection = h2Sections.find(s => {
      const content = s.content.toLowerCase();
      return content.includes('data') || 
             content.includes('statistics') ||
             content.match(/\d+[%$€£¥]/) ||
             content.includes('comparison') ||
             content.includes('versus');
    });
    
    if (dataRichSection) {
      return dataRichSection.header;
    }
  }

  // Final fallback: return first available H2 section (which is already not the intro for infographics)
  return h2Sections[0].header;
}

