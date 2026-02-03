import type { KeywordData, KeywordDensityAnalysis } from "./keyword-types";

/**
 * Calculates keyword density in content
 */
export function calculateKeywordDensity(
  content: string,
  keyword: string
): { density: number; occurrences: number } {
  if (!content || !keyword) {
    return { density: 0, occurrences: 0 };
  }

  const contentLower = content.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // Count occurrences (case-insensitive, whole word matching)
  const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  const matches = content.match(regex);
  const occurrences = matches ? matches.length : 0;

  // Calculate density: (occurrences / total words) * 100
  const totalWords = contentLower.split(/\s+/).filter(word => word.length > 0).length;
  const density = totalWords > 0 ? (occurrences / totalWords) * 100 : 0;

  return { density: Math.round(density * 100) / 100, occurrences };
}

/**
 * Analyzes keyword density for multiple keywords
 */
export function analyzeKeywordDensity(
  content: string,
  keywords: KeywordData[]
): KeywordDensityAnalysis[] {
  if (!content || !keywords || keywords.length === 0) {
    return [];
  }

  return keywords.map(keyword => {
    const { density, occurrences } = calculateKeywordDensity(content, keyword.keyword);
    
    // Determine optimal range based on keyword type and difficulty
    const optimalRange = getOptimalDensityRange(keyword);
    
    // Generate recommendations
    const recommendations = generateDensityRecommendations(
      keyword.keyword,
      density,
      occurrences,
      optimalRange
    );

    return {
      keyword: keyword.keyword,
      density,
      occurrences,
      recommendations,
      optimalRange,
    };
  });
}

/**
 * Gets optimal density range for a keyword
 */
function getOptimalDensityRange(keyword: KeywordData): { min: number; max: number } {
  // Base optimal range: 1-3% is generally good for SEO
  let min = 1.0;
  let max = 3.0;

  // Adjust based on keyword difficulty
  if (keyword.difficulty > 70) {
    // High difficulty keywords may need slightly higher density
    min = 1.5;
    max = 3.5;
  } else if (keyword.difficulty < 30) {
    // Low difficulty keywords can work with lower density
    min = 0.5;
    max = 2.5;
  }

  // Adjust based on search intent
  if (keyword.intent === 'transactional' || keyword.intent === 'commercial') {
    // Commercial keywords may benefit from slightly higher density
    min = 1.2;
    max = 3.2;
  }

  return { min, max };
}

/**
 * Generates recommendations based on keyword density
 */
function generateDensityRecommendations(
  keyword: string,
  density: number,
  occurrences: number,
  optimalRange: { min: number; max: number }
): string[] {
  const recommendations: string[] = [];

  if (density < optimalRange.min) {
    const neededOccurrences = Math.ceil((optimalRange.min / 100) * 1000); // Assuming ~1000 words
    recommendations.push(
      `Increase "${keyword}" density from ${density.toFixed(2)}% to at least ${optimalRange.min}%`
    );
    recommendations.push(
      `Add "${keyword}" naturally in ${Math.max(1, neededOccurrences - occurrences)} more places`
    );
    recommendations.push(
      `Consider using "${keyword}" in headings, subheadings, or key paragraphs`
    );
  } else if (density > optimalRange.max) {
    recommendations.push(
      `Reduce "${keyword}" density from ${density.toFixed(2)}% to below ${optimalRange.max}% to avoid keyword stuffing`
    );
    recommendations.push(
      `Consider using semantic variations or related terms instead of repeating "${keyword}"`
    );
  } else {
    recommendations.push(
      `"${keyword}" density is optimal at ${density.toFixed(2)}% (target: ${optimalRange.min}-${optimalRange.max}%)`
    );
  }

  // Additional recommendations based on occurrences
  if (occurrences === 0) {
    recommendations.push(`"${keyword}" is not found in the content - add it naturally`);
  } else if (occurrences < 3) {
    recommendations.push(`Consider adding "${keyword}" in a few more strategic locations`);
  }

  return recommendations;
}

/**
 * Extracts all keywords from content for analysis
 */
export function extractKeywordsFromContent(content: string): string[] {
  if (!content) return [];

  // Simple extraction: words that appear multiple times and are 4+ characters
  const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const wordCounts = new Map<string, number>();

  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });

  // Return words that appear 3+ times, sorted by frequency
  return Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Highlights keywords in content (for display purposes)
 */
export function highlightKeywordsInContent(
  content: string,
  keywords: string[]
): string {
  if (!content || !keywords || keywords.length === 0) {
    return content;
  }

  let highlighted = content;
  
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
    highlighted = highlighted.replace(regex, '<mark>$1</mark>');
  });

  return highlighted;
}

