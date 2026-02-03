import type { KeywordData } from "@/lib/keyword-types";

/**
 * Calculate total search volume for keywords
 */
export function calculateTotalVolume(keywords: KeywordData[]): number {
  return keywords.reduce((sum, kw) => sum + (kw.searchVolume || 0), 0);
}

/**
 * Get data for selected keywords
 */
export function getSelectedKeywordsData(
  selectedKeywords: Set<string>,
  keywordsWithVolumeData: Map<string, KeywordData>,
  semanticKeywords: KeywordData[]
): KeywordData[] {
  return Array.from(selectedKeywords)
    .map(kw => {
      const lowerKw = kw.toLowerCase();
      return keywordsWithVolumeData.get(lowerKw) || 
             semanticKeywords.find(sk => sk.keyword.toLowerCase() === lowerKw);
    })
    .filter(Boolean) as KeywordData[];
}

/**
 * Calculate volume metrics for selected keywords and total blog
 */
export function calculateVolumeMetrics(
  selectedKeywords: Set<string>,
  keywordsWithVolumeData: Map<string, KeywordData>,
  currentResult: { keywordData?: KeywordData; semanticKeywords?: KeywordData[] } | null
): {
  selectedVolume: number;
  primaryVolume: number;
  allSemanticVolume: number;
  totalBlogVolume: number;
} {
  // Get volume data for all selected keywords
  const selectedKwData = getSelectedKeywordsData(
    selectedKeywords,
    keywordsWithVolumeData,
    currentResult?.semanticKeywords || []
  );
  
  // Calculate volumes
  const selectedVolume = calculateTotalVolume(selectedKwData);
  const primaryVolume = currentResult?.keywordData?.searchVolume || 0;
  
  // Include all semantic keywords in total (not just selected)
  const allSemanticVolume = calculateTotalVolume(currentResult?.semanticKeywords || []);
  
  // Total = primary + all semantic keywords
  const totalBlogVolume = primaryVolume + allSemanticVolume;
  
  return {
    selectedVolume,
    primaryVolume,
    allSemanticVolume,
    totalBlogVolume,
  };
}

