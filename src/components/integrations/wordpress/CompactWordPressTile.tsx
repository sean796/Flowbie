import React from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Power, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { type WordPressSite } from "../types";
import { getCyberpunkCardClasses, getCyberpunkTextClasses } from "./cyberpunk-theme";

interface CompactWordPressTileProps {
  site: WordPressSite;
  isTesting: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onTest?: () => void;
  onToggleEnabled?: () => void;
}

export const CompactWordPressTile: React.FC<CompactWordPressTileProps> = ({
  site,
  isTesting,
  isExpanded,
  onToggle,
  onTest,
  onToggleEnabled,
}) => {
  const getStatusIcon = () => {
    if (isTesting) {
      return <Loader2 className="h-3 w-3 animate-spin text-green-300" />;
    }
    if (site.connectionStatus === 'success') {
      return <CheckCircle2 className="h-3 w-3 text-green-300" />;
    }
    if (site.connectionStatus === 'failed') {
      return <XCircle className="h-3 w-3 text-red-400" />;
    }
    return null;
  };

  const getStatusText = () => {
    if (isTesting) return 'Testing...';
    if (site.connectionStatus === 'success') {
      return isEnabled ? 'Connected' : 'Connected (Off)';
    }
    if (site.connectionStatus === 'failed') return 'Failed';
    return 'Not tested';
  };

  const isEnabled = site.enabled !== false;
  const isConnected = site.connectionStatus === 'success';

  const handleConnectionButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTesting) return; // Don't do anything while testing
    
    if (isConnected && onToggleEnabled) {
      // If connected, toggle enabled/disabled
      onToggleEnabled();
    } else if (onTest) {
      // If not connected, test the connection
      onTest();
    }
  };

  // Truncate URL for display
  const truncateUrl = (url: string, maxLength: number = 40) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  };

  return (
    <Card 
      className={`p-2 ${getCyberpunkCardClasses(false, true)} transition-all duration-300 cursor-pointer hover:border-green-500/50 ${!isEnabled ? 'opacity-60' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Left side: Site info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className={`text-sm font-bold ${getCyberpunkTextClasses('primary')} truncate`}>
              {site.name}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={site.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`text-xs ${getCyberpunkTextClasses('muted')} hover:text-white hover:underline flex items-center gap-1 transition-colors truncate`}
            >
              {truncateUrl(site.siteUrl)}
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
          </div>
        </div>

        {/* Right side: Combined connection/power button and expand icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleConnectionButtonClick}
            disabled={isTesting}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-all ${
              isConnected && isEnabled
                ? 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-300'
                : isConnected && !isEnabled
                ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/15 text-green-400/70 hover:text-green-300'
                : site.connectionStatus === 'failed'
                ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400'
                : 'border-green-500/30 bg-green-500/5 hover:bg-green-500/15 text-green-400'
            } ${isTesting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={
              isTesting
                ? 'Testing connection...'
                : isConnected
                ? isEnabled
                  ? 'Click to turn off'
                  : 'Click to turn on'
                : 'Click to test connection'
            }
          >
            {getStatusIcon()}
            <span className="text-xs font-medium">
              {getStatusText()}
            </span>
          </button>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-green-300" />
          ) : (
            <ChevronDown className="h-4 w-4 text-green-300" />
          )}
        </div>
      </div>
    </Card>
  );
};
