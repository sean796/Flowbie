import { useState, useCallback } from "react";

/**
 * Hook for managing optimization progress tracking
 * Extracted from use-content-optimization.ts for better organization
 */
export function useOptimizationProgress() {
  const [optimizationProgress, setOptimizationProgress] = useState<Record<string, { step: string; progress: number; message?: string }>>({});

  const updateProgress = useCallback((key: string, step: string, progress: number, message?: string) => {
    setOptimizationProgress(prev => ({
      ...prev,
      [key]: { step, progress, message }
    }));
  }, []);

  const clearProgress = useCallback((key: string) => {
    setOptimizationProgress(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  }, []);

  return {
    optimizationProgress,
    setOptimizationProgress,
    updateProgress,
    clearProgress,
  };
}