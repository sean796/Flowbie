import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, AlertCircle, Circle, MinusCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { MasterOptimizationState } from "@/hooks/use-content-optimization";

interface MasterOptimizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterState: MasterOptimizationState;
}

export const MasterOptimizationModal: React.FC<MasterOptimizationModalProps> = ({
  open,
  onOpenChange,
  masterState,
}) => {
  const sites = Object.values(masterState.sites);
  const totalSites = sites.length;
  const completedSites = sites.filter(s => s.status === 'completed').length;
  const errorSites = sites.filter(s => s.status === 'error').length;
  const optimizingSites = sites.filter(s => s.status === 'optimizing').length;
  
  const totalPosts = sites.reduce((sum, s) => sum + s.totalPosts, 0);
  const completedPosts = sites.reduce((sum, s) => sum + s.completedPosts, 0);
  const skippedPosts = sites.reduce((sum, s) => sum + s.skippedPosts, 0);
  const errorPosts = sites.reduce((sum, s) => sum + s.errorPosts, 0);
  
  const overallProgress = totalSites > 0 
    ? Math.round((completedSites / totalSites) * 100)
    : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'optimizing':
        return <Loader2 className="h-4 w-4 text-green-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'skipped':
        return <MinusCircle className="h-4 w-4 text-yellow-400" />;
      default:
        return <Circle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'NEUTRALIZED';
      case 'optimizing':
        return 'FIRING';
      case 'error':
        return 'DEFLECTED';
      case 'skipped':
        return 'ESCAPED';
      default:
        return 'STANDBY';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'optimizing':
        return 'text-green-300';
      case 'error':
        return 'text-red-400';
      case 'skipped':
        return 'text-yellow-400';
      default:
        return 'text-gray-500';
    }
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
        <DialogHeader className="border-b border-green-500/20 pb-3 shrink-0">
          <DialogTitle className="text-2xl font-bold text-green-400 font-mono tracking-wider">
            DEATH STAR FLEET COMMAND
          </DialogTitle>
          <DialogDescription className="text-green-500/80 font-mono text-sm">
            {totalSites > 0 ? (
              <>Sectors: {totalSites} | Neutralized: {completedSites}{errorSites > 0 && ` | Deflected: ${errorSites}`}{skippedPosts > 0 && ` | Escaped: ${sites.filter(s => s.status === 'skipped').length}`} | Firing: {optimizingSites}</>
            ) : (
              <>No active operations</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Fleet Status (Overall Progress) */}
        {totalSites > 0 && (
          <div className="space-y-2 pt-2 border-b border-green-500/20 pb-4 shrink-0">
            <div className="flex items-center justify-between text-sm font-mono">
              <span className="text-green-400/80 uppercase tracking-wider">Fleet Status</span>
              <span className="text-green-300">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2 bg-green-500/10" />
            <div className="flex items-center justify-between text-xs text-green-500/70 font-mono">
              <span>{completedSites} of {totalSites} sectors neutralized</span>
              <span>{completedPosts} destroyed | {skippedPosts} escaped | {errorPosts} deflected</span>
            </div>
            <div className="flex gap-4 text-xs text-green-500/70 font-mono pt-1">
              <span>Total Targets: {totalPosts}</span>
              <span className="text-green-400">Destroyed: {completedPosts}</span>
              <span className="text-yellow-400">Escaped: {skippedPosts}</span>
              <span className="text-red-400">Deflected: {errorPosts}</span>
            </div>
          </div>
        )}

        {/* Sector List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-green-400/80 font-mono uppercase tracking-wider">Sector Status</h3>
            {sites.map((site) => {
              const isActive = site.status === 'optimizing';
              const isCompleted = site.status === 'completed';
              const isError = site.status === 'error';
              const isSkipped = site.status === 'skipped';
              const isPending = site.status === 'pending';

              return (
                <div
                  key={site.siteId}
                  className={cn(
                    "border rounded-lg p-4 space-y-3 font-mono transition-all",
                    isCompleted && "border-green-500/50 bg-green-500/5",
                    isActive && "border-green-500/70 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
                    isError && "border-red-500/50 bg-red-500/5",
                    isSkipped && "border-yellow-500/50 bg-yellow-500/5",
                    isPending && "border-gray-500/50 bg-gray-500/5"
                  )}
                >
                  {/* Sector Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(site.status)}
                      <span className={cn("font-semibold", getStatusColor(site.status))}>
                        {site.siteName}
                      </span>
                      <span className={cn("text-xs uppercase tracking-wider", getStatusColor(site.status))}>
                        [{getStatusLabel(site.status)}]
                      </span>
                    </div>
                    <div className={cn("text-sm font-mono", getStatusColor(site.status))}>
                      {site.currentPost}/{site.totalPosts} targets
                    </div>
                  </div>

                  {/* Sector Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className={cn(
                        getStatusColor(site.status),
                        "opacity-80"
                      )}>
                        {site.status === 'optimizing' && site.currentUrl
                          ? `Firing at: ${site.currentUrl.substring(0, 50)}${site.currentUrl.length > 50 ? '...' : ''}`
                          : site.status === 'completed'
                          ? 'All targets neutralized'
                          : site.status === 'error'
                          ? 'Target deflected — Processing failed'
                          : site.status === 'skipped'
                          ? 'Target escaped — No data available'
                          : 'Standing by...'}
                      </span>
                      <span className={cn("font-semibold", getStatusColor(site.status))}>
                        {site.progress}%
                      </span>
                    </div>
                    <Progress 
                      value={site.progress} 
                      className={cn(
                        "h-1.5",
                        isCompleted && "bg-green-500/10",
                        isActive && "bg-green-500/10",
                        isError && "bg-red-500/10",
                        isSkipped && "bg-yellow-500/10",
                        isPending && "bg-gray-500/10"
                      )} 
                    />
                  </div>

                  {/* Sector Statistics */}
                  <div className="flex gap-4 text-xs font-mono pt-1 border-t border-green-500/20">
                    <span className="text-green-400">✓ {site.completedPosts} destroyed</span>
                    <span className="text-yellow-400">⊘ {site.skippedPosts} escaped</span>
                    <span className="text-red-400">✗ {site.errorPosts} deflected</span>
                    <span className={cn("ml-auto", getStatusColor(site.status))}>
                      Total: {site.totalPosts}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary Footer */}
        {!masterState.isRunning && (
          <div className="shrink-0 pt-4 border-t border-green-500/20">
            {completedSites === totalSites ? (
              <div className="flex items-center justify-center gap-2 text-green-400 font-mono text-sm font-bold py-2">
                <CheckCircle2 className="h-5 w-5" />
                <span>OPERATION COMPLETE — All sectors have been neutralized.</span>
              </div>
            ) : (
              <div className="text-sm text-center text-green-500/70 font-mono">
                Fleet operation {completedSites === totalSites ? 'complete' : 'finished'}.
                {errorSites > 0 && ` ${errorSites} sector(s) deflected.`}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
