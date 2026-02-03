import React, { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCyberpunkTextClasses } from './cyberpunk-theme';
import { OPTIMIZATION_STEPS, getCurrentStep, type ProgressData } from './optimization-constants';

interface OptimizationProgressDisplayProps {
  progress?: ProgressData;
  isOptimizing: boolean;
}

export const OptimizationProgressDisplay: React.FC<OptimizationProgressDisplayProps> = ({
  progress,
  isOptimizing,
}) => {
  const [progressExpanded, setProgressExpanded] = useState(false);

  if (!isOptimizing || !progress || typeof progress !== 'object') {
    return null;
  }

  const currentStepIndex = getCurrentStep(progress);
  const progressValue = progress?.progress || 0;

  return (
    <div className="space-y-2 pt-3 border-t border-green-500/20">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className={`flex items-center justify-between text-sm ${getCyberpunkTextClasses('secondary')}`}>
          <span className={`${getCyberpunkTextClasses('primary')} font-semibold font-mono`}>
            {progress.step || 'Processing...'}
          </span>
          <span className={getCyberpunkTextClasses('muted')}>{Math.round(progressValue)}%</span>
        </div>
        <Progress value={progressValue} className="h-2 bg-green-500/10" />
      </div>

      {/* Step-by-step breakdown */}
      <Collapsible open={progressExpanded} onOpenChange={setProgressExpanded}>
        <CollapsibleTrigger
          className={`w-full flex items-center justify-between text-sm font-medium ${getCyberpunkTextClasses('muted')} hover:${getCyberpunkTextClasses('primary')} transition-colors py-1`}
        >
          <span>View Steps</span>
          {progressExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-2">
          {OPTIMIZATION_STEPS.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isPending = index > currentStepIndex;

            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium py-1',
                  isCompleted && getCyberpunkTextClasses('muted'),
                  isCurrent && `${getCyberpunkTextClasses('primary')} font-medium`,
                  isPending && getCyberpunkTextClasses('muted')
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3 w-3 text-green-300 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin text-green-300 shrink-0" />
                ) : (
                  <Circle className={`h-3 w-3 shrink-0 ${getCyberpunkTextClasses('muted')}`} />
                )}
                <span className={`flex-1 ${getCyberpunkTextClasses('secondary')}`}>{step.label}</span>
                {isCurrent && progress?.message && (
                  <span className={`${getCyberpunkTextClasses('muted')} text-[10px] truncate max-w-[150px]`}>
                    {progress.message}
                  </span>
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {progress?.message && !progressExpanded && (
        <div className={`text-sm font-medium ${getCyberpunkTextClasses('muted')} pt-1`}>
          {progress.message}
        </div>
      )}
    </div>
  );
};

