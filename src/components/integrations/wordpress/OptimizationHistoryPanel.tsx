import React from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ExternalLink, Download, Trash2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { type WordPressSite } from "../types";
import { cn } from "@/lib/utils";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

export interface OptimizationHistoryEntry {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
  status: 'success' | 'failed' | 'in-progress';
  fileCount?: number;
  files?: Array<{ name: string; content: string; type: string }>;
  error?: string;
}

interface OptimizationHistoryPanelProps {
  site: WordPressSite;
  history: OptimizationHistoryEntry[];
  onViewDetails?: (entry: OptimizationHistoryEntry) => void;
  onDownloadFiles?: (entry: OptimizationHistoryEntry) => void;
  onClearHistory?: () => void;
  disabled?: boolean;
}

export const OptimizationHistoryPanel: React.FC<OptimizationHistoryPanelProps> = ({
  site,
  history,
  onViewDetails,
  onDownloadFiles,
  onClearHistory,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const getStatusIcon = (status: OptimizationHistoryEntry['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      case 'in-progress':
        return <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />;
      default:
        return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: OptimizationHistoryEntry['status']) => {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'Unknown';
    }
  };

  // Always render the panel, even if history is empty

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-2 border border-green-500/20 rounded">
        <CollapsibleTrigger
          disabled={disabled}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-black hover:text-white transition-colors ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}
        >
          <div className="flex items-center gap-2">
            <span>Optimization History</span>
            <span className={`${getCyberpunkTextClasses('muted')} font-normal`}>({history.length})</span>
          </div>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 space-y-2 border-t border-green-500/20 bg-green-500/5 max-h-[400px] overflow-y-auto">
            {history.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "p-2 rounded border border-border bg-background text-xs space-y-1.5",
                  entry.status === 'success' && "border-green-500/20 bg-green-500/5",
                  entry.status === 'failed' && "border-red-500/20 bg-red-500/5",
                  entry.status === 'in-progress' && "border-yellow-500/20 bg-yellow-500/5"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(entry.status)}
                      <span className={cn(
                        "font-medium truncate",
                        entry.status === 'success' && "text-green-400",
                        entry.status === 'failed' && "text-red-400",
                        entry.status === 'in-progress' && "text-yellow-400"
                      )}>
                        {entry.title || entry.url}
                      </span>
                    </div>
                    <div className={`${getCyberpunkTextClasses('muted')} truncate text-[10px] mb-1 font-mono`}>
                      {entry.url}
                    </div>
                    <div className={`flex items-center gap-3 text-[10px] ${getCyberpunkTextClasses('muted')}`}>
                      <span>{format(new Date(entry.timestamp), "MMM d, yyyy 'at' h:mm a")}</span>
                      <span className={cn(
                        entry.status === 'success' && "text-green-400",
                        entry.status === 'failed' && "text-red-400",
                        entry.status === 'in-progress' && "text-yellow-400"
                      )}>
                        {getStatusLabel(entry.status)}
                      </span>
                      {entry.fileCount !== undefined && entry.fileCount > 0 && (
                        <span>{entry.fileCount} file{entry.fileCount !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {entry.error && (
                      <div className="text-red-400 text-[10px] mt-1 truncate">
                        {entry.error}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-green-500/20">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(entry.url, '_blank')}
                    className={`h-6 px-2 text-[10px] ${getCyberpunkButtonClasses()} transition-all`}
                    title="Open URL"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                  {entry.status === 'success' && entry.fileCount && entry.fileCount > 0 && onDownloadFiles && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDownloadFiles(entry)}
                      className={`h-6 px-2 text-[10px] ${getCyberpunkButtonClasses()} transition-all`}
                      title="Download files"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  )}
                  {onViewDetails && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(entry)}
                      className={`h-6 px-2 text-[10px] ${getCyberpunkButtonClasses()} transition-all`}
                      title="View details"
                    >
                      Details
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {onClearHistory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearHistory}
                disabled={disabled}
                className={`w-full h-7 text-xs mt-2 ${getCyberpunkButtonClasses()} transition-all`}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear History
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

