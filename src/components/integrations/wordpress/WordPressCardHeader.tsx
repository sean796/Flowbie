import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Edit2, Trash2 } from "lucide-react";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses } from "./cyberpunk-theme";

interface WordPressCardHeaderProps {
  site: WordPressSite;
  onEdit: () => void;
  onDelete: () => void;
}

export const WordPressCardHeader: React.FC<WordPressCardHeaderProps> = ({
  site,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="flex justify-between items-start mb-4 pb-3 border-b border-green-500/20">
      <div className="flex-1 min-w-0">
        <h3 className={`text-lg font-bold ${getCyberpunkTextClasses('primary')} tracking-wider mb-1 truncate`}>
          {site.name}
        </h3>
        <a
          href={site.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm ${getCyberpunkTextClasses('secondary')} hover:text-white hover:underline flex items-center gap-1 mt-1 transition-colors`}
        >
          {site.siteUrl}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>
      <div className="flex gap-2 ml-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="text-green-300 hover:text-white hover:bg-black border border-green-500/30 hover:border-white/50 transition-all"
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

