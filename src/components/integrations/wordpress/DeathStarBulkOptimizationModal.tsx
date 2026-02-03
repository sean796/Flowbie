import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, AlertCircle, Circle, Copy, Download, FileText, MinusCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BulkOptimizationState } from "@/hooks/use-content-optimization";

interface DeathStarBulkOptimizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkState: BulkOptimizationState | null;
  /** Direct access to individual site optimization progress for more reliable updates */
  siteProgress?: { step: string; progress: number; message?: string };
}

// Star Wars themed step labels
const OPTIMIZATION_STEPS = [
  { key: 'fetch', label: 'Acquiring Target', shortLabel: 'Acquire', progress: 10 },
  { key: 'gsc', label: 'Scanning Intel', shortLabel: 'Scan', progress: 25 },
  { key: 'keyword-research', label: 'Analyzing Weakness', shortLabel: 'Analyze', progress: 40 },
  { key: 'ai-analysis', label: 'Computing Solution', shortLabel: 'Compute', progress: 55 },
  { key: 'blueprint', label: 'Locking Target', shortLabel: 'Lock', progress: 70 },
  { key: 'content', label: 'Charging Weapon', shortLabel: 'Charge', progress: 82 },
  { key: 'faq', label: 'Encoding FAQ Schema', shortLabel: 'FAQ', progress: 90 },
  { key: 'upload', label: 'Firing', shortLabel: 'Fire', progress: 95 },
  { key: 'complete', label: 'Target Destroyed', shortLabel: 'Hit', progress: 100 },
];

// Step terminology mapping (Star Wars themed)
const getStepTerminology = (step: string): string => {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('fetch') || stepLower.includes('resolving')) {
    return 'Acquiring Target';
  }
  if (stepLower.includes('gsc') || stepLower.includes('performance')) {
    return 'Scanning Intel';
  }
  if (stepLower.includes('keyword') || stepLower.includes('analyzing')) {
    return 'Analyzing Weakness';
  }
  if (stepLower.includes('ai') || stepLower.includes('analysis')) {
    return 'Computing Solution';
  }
  if (stepLower.includes('blueprint') || stepLower.includes('checklist')) {
    return 'Locking Target';
  }
  if (stepLower.includes('content') || stepLower.includes('generating')) {
    return 'Charging Weapon';
  }
  // FAQ Schema generation step - before firing/upload
  if (stepLower.includes('faq') || stepLower.includes('schema')) {
    return 'Encoding FAQ Schema';
  }
  if (stepLower.includes('upload') || stepLower.includes('updating') || stepLower.includes('acf')) {
    return 'Firing';
  }
  if (stepLower.includes('complete')) {
    return 'Target Destroyed';
  }
  return step;
};

// Map step name to progress percentage
const getStepProgress = (step: string): number => {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('fetch') || stepLower.includes('resolving')) return 10;
  if (stepLower.includes('gsc') || stepLower.includes('performance') || stepLower.includes('analyzing')) return 25;
  if (stepLower.includes('keyword') || stepLower.includes('research')) return 40;
  if (stepLower.includes('ai') || stepLower.includes('analysis')) return 55;
  if (stepLower.includes('blueprint') || stepLower.includes('checklist')) return 70;
  if (stepLower.includes('content') || stepLower.includes('generating')) return 82;
  if (stepLower.includes('faq') || stepLower.includes('schema')) return 90;
  if (stepLower.includes('upload') || stepLower.includes('updating') || stepLower.includes('acf')) return 95;
  if (stepLower.includes('complete')) return 100;
  return 0;
};

// Get current step index for breakdown visualization
const getCurrentStepIndex = (step: string): number => {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('fetch') || stepLower.includes('resolving')) return 0;
  if (stepLower.includes('gsc') || stepLower.includes('performance')) return 1;
  if (stepLower.includes('keyword') || stepLower.includes('research')) return 2;
  if (stepLower.includes('ai') || stepLower.includes('analysis')) return 3;
  if (stepLower.includes('blueprint') || stepLower.includes('checklist')) return 4;
  if (stepLower.includes('content') || stepLower.includes('generating')) return 5;
  if (stepLower.includes('faq') || stepLower.includes('schema')) return 6;
  if (stepLower.includes('upload') || stepLower.includes('updating') || stepLower.includes('acf')) return 7;
  if (stepLower.includes('complete')) return 8;
  return -1;
};

// Compact horizontal step indicator component
const TargetingSequence: React.FC<{ currentStepIndex: number }> = ({ currentStepIndex }) => {
  return (
    <div className="flex gap-1 items-center flex-wrap">
      {OPTIMIZATION_STEPS.map((step, index) => {
        const isCompleted = currentStepIndex > index;
        const isCurrent = currentStepIndex === index;
        const isPending = currentStepIndex < index;

        return (
          <span
            key={step.key}
            className={cn(
              "px-1.5 py-0.5 text-[10px] rounded font-mono transition-all",
              isCompleted && "bg-green-500/30 text-green-300",
              isCurrent && "bg-green-500/50 text-green-200 animate-pulse font-semibold",
              isPending && "bg-gray-500/20 text-gray-500"
            )}
          >
            {isCompleted && "✓ "}
            {isCurrent && "● "}
            {step.shortLabel}
          </span>
        );
      })}
    </div>
  );
};

export const DeathStarBulkOptimizationModal: React.FC<DeathStarBulkOptimizationModalProps> = ({
  open,
  onOpenChange,
  bulkState,
  siteProgress,
}) => {
  // Extract data safely - handle null gracefully
  const urls = bulkState?.urls || [];
  const currentIndex = bulkState?.currentIndex ?? 0;
  const urlStatuses = bulkState?.urlStatuses || {};
  const currentStep = siteProgress?.step || bulkState?.currentStep || '';
  const currentUrl = bulkState?.currentUrl;
  const currentProgress = siteProgress?.progress ?? bulkState?.currentProgress;
  const currentStepProgress = siteProgress 
    ? { step: siteProgress.step, progress: siteProgress.progress, message: siteProgress.message }
    : bulkState?.currentStepProgress;
  const urlKeywords = bulkState?.urlKeywords || {};
  const urlEntities = bulkState?.urlEntities || {};
  const urlTitles = bulkState?.urlTitles || {};
  const urlExcerpts = bulkState?.urlExcerpts || {};
  
  const completedCount = Object.values(urlStatuses).filter(status => status === 'completed').length;
  const skippedCount = Object.values(urlStatuses).filter(status => status === 'skipped').length;
  const errorCount = Object.values(urlStatuses).filter(status => status === 'error').length;
  const totalCount = urls.length;
  const processedCount = completedCount + skippedCount + errorCount;
  const allComplete = processedCount === totalCount && totalCount > 0;
  const activeUrl = currentUrl || urls[currentIndex];

  // Calculate overall batch progress
  const overallProgress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  
  // Calculate current post progress
  const postProgress = currentProgress ?? (currentStep ? getStepProgress(currentStep) : 0);
  
  // Get current step index for targeting sequence
  const currentStepIndex = getCurrentStepIndex(currentStep);

  // Get optimized URLs (only completed)
  const optimizedUrls = urls.filter(url => urlStatuses[url] === 'completed');
  const escapedUrls = urls.filter(url => urlStatuses[url] === 'skipped');
  const deflectedUrls = urls.filter(url => urlStatuses[url] === 'error');

  // Generate text report
  const generateReport = (): string => {
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════',
      '              DEATH STAR OPERATION REPORT                  ',
      '═══════════════════════════════════════════════════════════',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '───────────────────────────────────────────────────────────',
      '                        SUMMARY                            ',
      '───────────────────────────────────────────────────────────',
      `Total Targets:  ${urls.length}`,
      `Destroyed:      ${completedCount}`,
      `Escaped:        ${skippedCount}`,
      `Deflected:      ${errorCount}`,
      '',
    ];

    if (optimizedUrls.length > 0) {
      lines.push('───────────────────────────────────────────────────────────');
      lines.push('                   DESTROYED TARGETS                       ');
      lines.push('───────────────────────────────────────────────────────────');
      optimizedUrls.forEach((url, i) => {
        lines.push(`${i + 1}. ${url}`);
        lines.push(`   Keyword: ${urlKeywords[url] || 'N/A'}`);
        lines.push(`   Entity:  ${urlEntities[url] || 'N/A'}`);
        if (urlTitles[url]) lines.push(`   Title:   ${urlTitles[url]}`);
        lines.push('');
      });
    }

    if (escapedUrls.length > 0) {
      lines.push('───────────────────────────────────────────────────────────');
      lines.push('              ESCAPED TARGETS (No GSC Data)                ');
      lines.push('───────────────────────────────────────────────────────────');
      escapedUrls.forEach((url, i) => {
        lines.push(`${i + 1}. ${url}`);
        lines.push('   Reason: No keyword data available');
        lines.push('');
      });
    }

    if (deflectedUrls.length > 0) {
      lines.push('───────────────────────────────────────────────────────────');
      lines.push('                 DEFLECTED TARGETS (Errors)                ');
      lines.push('───────────────────────────────────────────────────────────');
      deflectedUrls.forEach((url, i) => {
        lines.push(`${i + 1}. ${url}`);
        lines.push('   Error: Processing failed');
        lines.push('');
      });
    }

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('                    END OF REPORT                          ');
    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  };

  // Generate CSV
  const generateCSV = (): string => {
    const headers = ['URL', 'Status', 'Keyword', 'Entity', 'Title'];
    const rows = urls.map(url => {
      const status = urlStatuses[url] || 'pending';
      const statusLabel = status === 'completed' ? 'Destroyed' : 
                          status === 'skipped' ? 'Escaped' : 
                          status === 'error' ? 'Deflected' : 'Standing By';
      return [
        url,
        statusLabel,
        urlKeywords[url] || '',
        urlEntities[url] || '',
        urlTitles[url] || ''
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReport());
    toast.success("Report copied to clipboard!");
  };

  const handleDownloadCSV = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `death-star-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-[#0a0a0a] border-2 border-green-500/50 animate-[breatheNeon_3s_ease-in-out_infinite] overflow-hidden flex flex-col [&[data-state=open]]:animate-none [&[data-state=closed]]:animate-none">
        <style>{`
          @keyframes breatheNeon {
            0%, 100% { 
              box-shadow: 0 0 10px rgba(34, 197, 94, 0.5),
                          0 0 20px rgba(34, 197, 94, 0.3),
                          0 0 30px rgba(34, 197, 94, 0.2),
                          inset 0 0 10px rgba(34, 197, 94, 0.1);
            }
            50% { 
              box-shadow: 0 0 20px rgba(34, 197, 94, 0.8),
                          0 0 40px rgba(34, 197, 94, 0.6),
                          0 0 60px rgba(34, 197, 94, 0.4),
                          inset 0 0 20px rgba(34, 197, 94, 0.2);
            }
          }
        `}</style>
        
        {/* Header */}
        <DialogHeader className="border-b border-green-500/20 pb-3 shrink-0">
          <DialogTitle className="text-2xl font-bold text-green-400 font-mono tracking-wider">
            DEATH STAR COMMAND
          </DialogTitle>
          <DialogDescription className="text-green-500/80 font-mono text-sm">
            {totalCount > 0 ? (
              <>Targets: {totalCount} | Destroyed: {completedCount}{skippedCount > 0 && ` | Escaped: ${skippedCount}`}{errorCount > 0 && ` | Deflected: ${errorCount}`} | Firing: {currentIndex < totalCount && !allComplete ? 1 : 0}</>
            ) : (
              <>No active operations</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Fleet Status (Overall Progress) */}
        {totalCount > 0 && (
          <div className="space-y-2 pt-2 border-b border-green-500/20 pb-4 shrink-0">
            <div className="flex items-center justify-between text-sm font-mono">
              <span className="text-green-400/80 uppercase tracking-wider">Fleet Status</span>
              <span className="text-green-300">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2 bg-green-500/10" />
            <div className="flex items-center justify-between text-xs text-green-500/70 font-mono">
              <span>{processedCount} of {totalCount} targets processed</span>
              <span>{completedCount} destroyed | {skippedCount} escaped</span>
            </div>
          </div>
        )}

        {/* Target Table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {urls.length > 0 && (
            <div className="space-y-0">
              {/* Table Header */}
              <div className="grid grid-cols-[40px_1fr_minmax(200px,auto)_80px] gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/30 text-[10px] font-mono uppercase tracking-wider text-green-400/80 sticky top-0 z-10">
                <div>Status</div>
                <div>Target</div>
                <div>Keyword</div>
                <div className="text-right">Progress</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-green-500/10">
                {urls.map((url, index) => {
                  const status = urlStatuses[url] || (index < currentIndex ? 'completed' : index === currentIndex ? 'optimizing' : 'pending');
                  const isActive = index === currentIndex && status === 'optimizing' && !allComplete;
                  const isCompleted = status === 'completed';
                  const isSkipped = status === 'skipped';
                  const isError = status === 'error';
                  const isPending = status === 'pending';

                  // Get status label
                  const getStatusLabel = () => {
                    if (isActive) return `${postProgress}%`;
                    if (isCompleted) return 'HIT';
                    if (isSkipped) return 'ESCAPED';
                    if (isError) return 'DEFLECTED';
                    return 'STANDBY';
                  };

                  return (
                    <div key={url}>
                      {/* Main Row */}
                      <div
                        className={cn(
                          "grid grid-cols-[40px_1fr_minmax(200px,auto)_80px] gap-2 px-3 py-2 items-center font-mono text-xs transition-all",
                          isActive && "bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
                          isCompleted && "bg-green-500/5",
                          isSkipped && "bg-yellow-500/5",
                          isError && "bg-red-500/5",
                          isPending && "bg-transparent"
                        )}
                      >
                        {/* Status Icon */}
                        <div className="flex justify-center">
                          {isActive && <Loader2 className="h-4 w-4 text-green-400 animate-spin" />}
                          {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                          {isSkipped && <MinusCircle className="h-4 w-4 text-yellow-400" />}
                          {isError && <AlertCircle className="h-4 w-4 text-red-400" />}
                          {isPending && <Circle className="h-4 w-4 text-gray-500" />}
                        </div>

                        {/* URL */}
                        <div className="flex items-center gap-1 min-w-0">
                          <span className={cn(
                            "truncate flex-1",
                            isActive && "text-green-300",
                            isCompleted && "text-green-400/80",
                            isSkipped && "text-yellow-400/80",
                            isError && "text-red-400/80",
                            isPending && "text-gray-400"
                          )}>
                            {(() => {
                              try {
                                const urlObj = new URL(url);
                                return urlObj.pathname;
                              } catch {
                                return url;
                              }
                            })()}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/20 shrink-0 opacity-70 hover:opacity-100"
                            onClick={() => {
                              navigator.clipboard.writeText(url);
                              toast.success("URL copied!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Keyword + Entity */}
                        <div className="flex flex-col gap-0.5">
                          <div className={cn(
                            "text-[10px] whitespace-normal break-words",
                            isActive && "text-green-300",
                            isCompleted && urlKeywords[url] ? "text-green-400/70" : isCompleted ? "text-yellow-400/70" : "",
                            isSkipped && "text-yellow-400",
                            isError && "text-red-400",
                            isPending && "text-gray-500"
                          )}>
                            {isCompleted && urlKeywords[url] 
                              ? urlKeywords[url] 
                              : isCompleted && !urlKeywords[url]
                              ? 'SKIPPED'
                              : isSkipped 
                              ? 'SKIPPED' 
                              : isActive 
                              ? (urlKeywords[url] || 'SCANNING...') 
                              : 'PENDING'}
                          </div>
                          {/* Entity - shown below keyword */}
                          {(isCompleted || isActive) && urlEntities[url] && urlEntities[url] !== 'N/A' && (
                            <div className={cn(
                              "text-[9px] whitespace-normal break-words italic",
                              isActive && "text-cyan-400/80",
                              isCompleted && "text-cyan-500/60"
                            )}>
                              <span className="opacity-70">Entity: </span>
                              {urlEntities[url]}
                            </div>
                          )}
                        </div>

                        {/* Progress/Status */}
                        <div className={cn(
                          "text-right text-[10px] uppercase font-semibold",
                          isActive && "text-green-300",
                          isCompleted && "text-green-400",
                          isSkipped && "text-yellow-400",
                          isError && "text-red-400",
                          isPending && "text-gray-500"
                        )}>
                          {getStatusLabel()}
                        </div>
                      </div>

                      {/* Expanded Panel for Active Target */}
                      {isActive && (
                        <div className="px-3 py-3 bg-green-500/10 border-t border-green-500/20 space-y-3">
                          {/* Current Step */}
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-mono text-green-400">
                              <span className="text-green-500/70">Sequence: </span>
                              <span className="font-semibold">{getStepTerminology(currentStep)}</span>
                            </div>
                            <div className="text-xs font-mono text-green-300">{postProgress}%</div>
                          </div>

                          {/* Progress Bar */}
                          <Progress value={postProgress} className="h-1.5 bg-green-500/10" />

                          {/* Step Message */}
                          {currentStepProgress?.message && (
                            <div className="text-[10px] text-green-500/60 font-mono truncate">
                              {currentStepProgress.message}
                            </div>
                          )}

                          {/* Targeting Sequence (Horizontal Steps) */}
                          <TargetingSequence currentStepIndex={currentStepIndex} />
                        </div>
                      )}

                      {/* Expanded Panel for Completed Target - only show if we have keyword data */}
                      {isCompleted && urlKeywords[url] && (
                        <div className="px-3 py-2 bg-green-500/5 border-t border-green-500/10">
                          <div className="text-[10px] font-mono text-green-500/60 uppercase mb-1">
                            Optimized With:
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
                            <div>
                              <span className="text-green-500/60">Keyword: </span>
                              <span className="text-green-300 font-semibold">
                                "{urlKeywords[url]}"
                              </span>
                            </div>
                            <div>
                              <span className="text-green-500/60">Entity: </span>
                              <span className={urlEntities[url] && urlEntities[url] !== 'N/A' ? "text-green-300 font-semibold" : "text-gray-400"}>
                                {urlEntities[url] && urlEntities[url] !== 'N/A' ? urlEntities[url] : 'None - Regular Post'}
                              </span>
                            </div>
                            {urlTitles[url] && (
                              <div className="col-span-2">
                                <span className="text-green-500/60">Title: </span>
                                <span className="text-green-300/70">{urlTitles[url]}</span>
                              </div>
                            )}
                            {urlExcerpts[url] && (
                              <div className="col-span-2">
                                <span className="text-green-500/60">Meta Description: </span>
                                <span className="text-green-300/70 italic">{urlExcerpts[url]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expanded Panel for Skipped Target */}
                      {isSkipped && (
                        <div className="px-3 py-2 bg-yellow-500/5 border-t border-yellow-500/10">
                          <div className="text-[10px] font-mono text-yellow-400 uppercase font-semibold mb-1">
                            Target Escaped
                          </div>
                          <div className="text-[10px] font-mono text-yellow-400/70">
                            No GSC keyword data available — Cannot optimize without search performance data
                          </div>
                        </div>
                      )}

                      {/* Expanded Panel for Error Target */}
                      {isError && (
                        <div className="px-3 py-2 bg-red-500/5 border-t border-red-500/10">
                          <div className="text-[10px] font-mono text-red-400/70">
                            Target deflected — Processing failed
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 pt-4 border-t border-green-500/20 space-y-3">
          {/* Completion Message */}
          {allComplete && (
            <div className="flex items-center justify-center gap-2 text-green-400 font-mono text-sm font-bold py-2">
              <CheckCircle2 className="h-5 w-5" />
              <span>OPERATION COMPLETE — All targets have been neutralized.</span>
            </div>
          )}

          {/* Footer actions: Close always visible; Copy/Export when there are completed targets */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-mono bg-transparent border-green-500/50 text-green-400 hover:bg-green-500/20 hover:text-green-300"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Close
            </Button>
            {completedCount > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-mono bg-transparent border-green-500/50 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                  onClick={handleCopyReport}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Copy Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-mono bg-transparent border-green-500/50 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                  onClick={handleDownloadCSV}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
