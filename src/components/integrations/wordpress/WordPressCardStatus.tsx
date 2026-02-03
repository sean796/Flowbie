import React from "react";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, XCircle, Loader2, Power } from "lucide-react";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses, CYBERPUNK_CLASSES } from "./cyberpunk-theme";

interface WordPressCardStatusProps {
  site: WordPressSite;
  isTesting: boolean;
  onToggle: () => void;
}

export const WordPressCardStatus: React.FC<WordPressCardStatusProps> = ({
  site,
  isTesting,
  onToggle,
}) => {
  const getStatusIcon = () => {
    if (isTesting) {
      return <Loader2 className="h-4 w-4 animate-spin text-green-300" />;
    }
    if (site.connectionStatus === 'success') {
      return <CheckCircle2 className="h-4 w-4 text-green-300" />;
    }
    if (site.connectionStatus === 'failed') {
      return <XCircle className="h-4 w-4 text-red-400" />;
    }
    return null;
  };

  const getStatusText = () => {
    if (isTesting) return 'Testing...';
    if (site.connectionStatus === 'success') return 'Connected';
    if (site.connectionStatus === 'failed') return 'Failed';
    return 'Not tested';
  };

  const isEnabled = site.enabled !== false;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-green-500/5 border border-green-500/20 rounded">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>Status:</span>
        {getStatusIcon()}
        <span className={`text-sm font-semibold ${getCyberpunkTextClasses('secondary')}`}>
          {getStatusText()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Power className={`h-4 w-4 ${isEnabled ? 'text-green-300' : 'text-slate-400'}`} />
        <Switch
          checked={isEnabled}
          onCheckedChange={onToggle}
          className="data-[state=checked]:bg-green-500"
        />
        <span className={`text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    </div>
  );
};

