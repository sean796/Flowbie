export interface OptimizationStep {
  key: string;
  label: string;
  progress: number;
}

export const OPTIMIZATION_STEPS: OptimizationStep[] = [
  { key: 'fetch', label: 'Fetching Content', progress: 10 },
  { key: 'gsc', label: 'GSC Data Analysis', progress: 25 },
  { key: 'keyword-research', label: 'Keyword Research', progress: 40 },
  { key: 'ai-analysis', label: 'AI Analysis', progress: 55 },
  { key: 'blueprint', label: 'Blueprint Generation', progress: 70 },
  { key: 'content', label: 'Content Generation', progress: 85 },
  { key: 'upload', label: 'Upload to WordPress', progress: 95 },
  { key: 'complete', label: 'Complete', progress: 100 },
];

export interface ProgressData {
  step: string;
  progress: number;
  message?: string;
}

/**
 * Determine current step index based on progress step string
 * @param progress - Progress data containing step information
 * @returns Step index (0-7) or -1 if not found
 */
export function getCurrentStep(progress?: ProgressData): number {
  if (!progress?.step) return -1;
  const step = progress.step.toLowerCase();
  if (step.includes('fetch') || step.includes('resolving')) return 0;
  if (step.includes('gsc') || step.includes('performance')) return 1;
  if (step.includes('keyword') || step.includes('research')) return 2;
  if (step.includes('ai analysis') || step.includes('analyzing')) return 3;
  if (step.includes('blueprint') || step.includes('checklist')) return 4;
  if (step.includes('content') || step.includes('generating')) return 5;
  if (step.includes('upload') || step.includes('updating')) return 6;
  if (step.includes('complete')) return 7;
  return -1;
}

