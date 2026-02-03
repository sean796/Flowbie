import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface SiteSearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SiteSearchFilter: React.FC<SiteSearchFilterProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3.5 w-3.5 text-green-500/50" />
        <Input
          type="text"
          placeholder="Search sites by name..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`h-8 pl-8 pr-8 bg-card border-green-500/20 ${getCyberpunkTextClasses('primary')} placeholder:text-green-500/40 focus-visible:ring-green-500/50 focus-visible:border-green-500/50 text-sm`}
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSearchChange('')}
            className={`absolute right-1 h-6 w-6 p-0 ${getCyberpunkButtonClasses()} hover:bg-green-500/20`}
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};
