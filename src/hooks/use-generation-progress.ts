import { useState, useEffect, useRef } from "react";

export type GenerationStage = 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';

interface UseGenerationProgressOptions {
  currentStage: GenerationStage;
  isGenerating: boolean;
}

export interface ProgressMetrics {
  percentage: number;
  stage: GenerationStage;
  stageLabel: string;
  stageDescription: string;
  timeElapsed: number;
  estimatedTimeRemaining: number | null;
}

const STAGE_WEIGHTS: Record<GenerationStage, number> = {
  idle: 0,
  planning: 20,
  plan_approval_pending: 30,
  drafting: 60,
  reviewing: 90,
  complete: 100,
  error: 0,
};

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: "Idle",
  planning: "Planning",
  plan_approval_pending: "Plan Approval",
  drafting: "Drafting",
  reviewing: "Reviewing",
  complete: "Complete",
  error: "Error",
};

const STAGE_DESCRIPTIONS: Record<GenerationStage, string> = {
  idle: "Ready to generate",
  planning: "Generating content plan and structure",
  plan_approval_pending: "Waiting for plan approval",
  drafting: "Creating draft content",
  reviewing: "Reviewing and finalizing content",
  complete: "Generation complete",
  error: "An error occurred during generation",
};

export function useGenerationProgress({
  currentStage,
  isGenerating,
}: UseGenerationProgressOptions): ProgressMetrics {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const stageStartTimeRef = useRef<number | null>(null);
  const previousStageRef = useRef<GenerationStage>(currentStage);

  // Reset timer when generation starts
  useEffect(() => {
    if (isGenerating && currentStage !== 'idle' && currentStage !== 'error' && currentStage !== 'complete') {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        stageStartTimeRef.current = Date.now();
      }
      
      // Update timer every second
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setTimeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      // Clear interval when not generating
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (!isGenerating) {
        startTimeRef.current = null;
        setTimeElapsed(0);
      }
    }

    // Track stage changes
    if (previousStageRef.current !== currentStage && isGenerating) {
      stageStartTimeRef.current = Date.now();
      previousStageRef.current = currentStage;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isGenerating, currentStage]);

  // Calculate estimated time remaining based on stage progress
  const calculateEstimatedTimeRemaining = (): number | null => {
    if (!isGenerating || !startTimeRef.current || currentStage === 'idle' || currentStage === 'complete' || currentStage === 'error') {
      return null;
    }

    const percentage = STAGE_WEIGHTS[currentStage];
    if (percentage === 0) return null;

    const elapsed = timeElapsed;
    if (elapsed === 0) return null;

    // Estimate: if we're at X% and have taken Y seconds, total should be Y / (X/100)
    const estimatedTotal = Math.floor(elapsed / (percentage / 100));
    const remaining = estimatedTotal - elapsed;

    return Math.max(0, remaining);
  };

  const percentage = STAGE_WEIGHTS[currentStage] || 0;
  const estimatedTimeRemaining = calculateEstimatedTimeRemaining();

  return {
    percentage,
    stage: currentStage,
    stageLabel: STAGE_LABELS[currentStage],
    stageDescription: STAGE_DESCRIPTIONS[currentStage],
    timeElapsed,
    estimatedTimeRemaining,
  };
}

export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
