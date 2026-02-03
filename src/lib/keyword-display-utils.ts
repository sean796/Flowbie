/**
 * Get color class for keyword difficulty
 */
export function getDifficultyColor(difficulty: number): string {
  if (difficulty < 30) return "text-green-500";
  if (difficulty < 70) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Get label for keyword difficulty
 */
export function getDifficultyLabel(difficulty: number): string {
  if (difficulty < 30) return "Easy";
  if (difficulty < 70) return "Medium";
  return "Hard";
}

/**
 * Format keyword metrics for display
 */
export function formatKeywordMetrics(keywordData: {
  difficulty: number;
  searchVolume: number;
  cpc: number;
  competition: string;
}) {
  return {
    difficulty: {
      value: keywordData.difficulty,
      label: getDifficultyLabel(keywordData.difficulty),
      color: getDifficultyColor(keywordData.difficulty),
    },
    searchVolume: {
      value: keywordData.searchVolume,
      formatted: keywordData.searchVolume.toLocaleString(),
    },
    cpc: {
      value: keywordData.cpc,
      formatted: `$${keywordData.cpc.toFixed(2)}`,
    },
    competition: keywordData.competition,
  };
}

