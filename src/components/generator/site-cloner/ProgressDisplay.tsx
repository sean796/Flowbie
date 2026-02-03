/**
 * Progress Display Component
 * Shows real-time progress for site cloning workflow
 */

import React from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { CloningProgress } from "./types";

interface ProgressDisplayProps {
  progress: CloningProgress;
}

export const ProgressDisplay: React.FC<ProgressDisplayProps> = ({ progress }) => {
  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">{progress.overallProgress}%</span>
            </div>
            <Progress value={progress.overallProgress} className="h-2" />
          </div>

          {/* Step Details */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Steps</div>
            <div className="space-y-2">
              {progress.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    step.status === 'completed'
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                      : step.status === 'error'
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      : step.status === 'in_progress'
                      ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : step.status === 'error' ? (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    ) : step.status === 'in_progress' ? (
                      <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{step.name}</div>
                    {step.message && (
                      <div className="text-xs text-muted-foreground mt-1">{step.message}</div>
                    )}
                    {step.error && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">{step.error}</div>
                    )}
                    {step.status === 'in_progress' && (
                      <Progress value={step.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {step.progress}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
