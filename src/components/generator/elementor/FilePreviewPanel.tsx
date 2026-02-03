import React, { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCyberpunkCardClasses, getCyberpunkTextClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import type { TemplateFile, CustomizationField } from "./types";

interface FilePreviewPanelProps {
  files: TemplateFile[];
  selectedFile?: string;
  fields?: CustomizationField[];
  onFieldClick?: (field: CustomizationField) => void;
  onFileSelect?: (filePath: string) => void;
}

export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = ({
  files,
  selectedFile,
  fields = [],
  onFieldClick,
  onFileSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightedLineRef = useRef<number | null>(null);

  const currentFile = useMemo(() => {
    if (!selectedFile) return files[0];
    return files.find(f => f.path === selectedFile) || files[0];
  }, [files, selectedFile]);

  // Filter fields for current file
  const fileFields = useMemo(() => {
    if (!currentFile) return [];
    return fields.filter(f => f.filePath === currentFile.path);
  }, [currentFile, fields]);

  // Get fields by line for highlighting
  const fieldsByLine = useMemo(() => {
    const map = new Map<number, CustomizationField[]>();
    for (const field of fileFields) {
      if (field.lineNumber) {
        if (!map.has(field.lineNumber)) {
          map.set(field.lineNumber, []);
        }
        map.get(field.lineNumber)!.push(field);
      }
    }
    return map;
  }, [fileFields]);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery || !currentFile) return [];
    
    const lines = currentFile.content.split('\n');
    const results: number[] = [];
    const query = searchQuery.toLowerCase();
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(query)) {
        results.push(i + 1);
      }
    }
    
    return results;
  }, [searchQuery, currentFile]);

  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const scrollToLine = (lineNumber: number) => {
    if (scrollRef.current) {
      const lineElement = scrollRef.current.querySelector(`[data-line="${lineNumber}"]`);
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightedLineRef.current = lineNumber;
        setTimeout(() => {
          highlightedLineRef.current = null;
        }, 2000);
      }
    }
  };

  const handleSearchNext = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentSearchIndex + 1) % searchResults.length;
      setCurrentSearchIndex(nextIndex);
      scrollToLine(searchResults[nextIndex]);
    }
  };

  const handleSearchPrev = () => {
    if (searchResults.length > 0) {
      const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
      setCurrentSearchIndex(prevIndex);
      scrollToLine(searchResults[prevIndex]);
    }
  };

  // Auto-scroll to field when clicked
  useEffect(() => {
    if (onFieldClick && fileFields.length > 0 && fileFields[0].lineNumber) {
      // This will be triggered when a field is selected externally
    }
  }, [fileFields, onFieldClick]);

  if (!currentFile) {
    return (
      <div className={cn(getCyberpunkCardClasses(false, false), "p-6")}>
        <p className={cn(getCyberpunkTextClasses('muted'), "text-center")}>
          No file selected
        </p>
      </div>
    );
  }

  const lines = currentFile.content.split('\n');
  const fileType = currentFile.type;

  return (
    <div className={cn(getCyberpunkCardClasses(false, false), "flex flex-col h-full")}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-green-500/20">
        <div className="flex items-center gap-4 flex-1">
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold")}>
            {currentFile.name}
          </h3>
          <span className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            {currentFile.size.toLocaleString()} bytes • {lines.length} lines
          </span>
          {fileFields.length > 0 && (
            <span className={cn(getCyberpunkTextClasses('secondary'), "text-xs px-2 py-1 bg-green-500/20 rounded")}>
              {fileFields.length} field{fileFields.length !== 1 ? 's' : ''} to customize
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showSearch ? (
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentSearchIndex(0);
                }}
                placeholder="Search..."
                className="w-48 h-8 bg-[#1a1a1a] border-green-500/50 text-green-300 text-sm"
                autoFocus
              />
              {searchResults.length > 0 && (
                <span className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
                  {currentSearchIndex + 1}/{searchResults.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSearchPrev}
                disabled={searchResults.length === 0}
                className="h-8 w-8 p-0"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSearchNext}
                disabled={searchResults.length === 0}
                className="h-8 w-8 p-0"
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="h-8"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4">
          <div className="font-mono text-sm leading-relaxed">
            {lines.map((line, i) => {
              const lineNumber = i + 1;
              const isHighlighted = highlightedLineRef.current === lineNumber;
              const isSearchMatch = searchResults.includes(lineNumber);
              const lineFields = fieldsByLine.get(lineNumber) || [];
              const hasField = lineFields.length > 0;

              // Highlight field values in the line
              let highlightedLine: React.ReactNode = line;
              if (lineFields.length > 0) {
                let lastIndex = 0;
                const parts: React.ReactNode[] = [];
                
                // Sort fields by position
                const sortedFields = lineFields
                  .map(field => ({
                    field,
                    index: line.indexOf(field.currentValue),
                  }))
                  .filter(f => f.index >= 0)
                  .sort((a, b) => a.index - b.index);

                for (const { field, index } of sortedFields) {
                  // Add text before field
                  if (index > lastIndex) {
                    parts.push(line.substring(lastIndex, index));
                  }

                  // Add highlighted field
                  parts.push(
                    <span
                      key={`field-${field.id}`}
                      className="bg-green-500/40 text-green-200 px-1 rounded cursor-pointer border border-green-500/70 hover:bg-green-500/60 transition-colors font-semibold"
                      onClick={() => onFieldClick?.(field)}
                      title={`${field.field}: ${field.currentValue} → ${field.suggestedValue}`}
                    >
                      {field.currentValue}
                    </span>
                  );

                  lastIndex = index + field.currentValue.length;
                }

                // Add remaining text
                if (lastIndex < line.length) {
                  parts.push(line.substring(lastIndex));
                }

                highlightedLine = <>{parts}</>;
              }

              return (
                <div
                  key={i}
                  data-line={lineNumber}
                  className={cn(
                    "flex hover:bg-green-500/5 transition-colors",
                    isHighlighted && "bg-green-500/30",
                    isSearchMatch && searchQuery && "bg-yellow-500/20",
                    hasField && !isHighlighted && "bg-green-500/10"
                  )}
                >
                  <span className={cn(
                    getCyberpunkTextClasses('muted'),
                    "w-12 text-right pr-4 select-none flex-shrink-0"
                  )}>
                    {lineNumber}
                  </span>
                  <span className={cn(
                    getCyberpunkTextClasses('secondary'),
                    "flex-1 break-all"
                  )}>
                    {highlightedLine || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {/* File Info Footer */}
      <div className="p-3 border-t border-green-500/20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            Type: {fileType.toUpperCase()}
          </span>
          <span className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            Encoding: {currentFile.encoding}
          </span>
        </div>
        {fileFields.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (fileFields[0]?.lineNumber) {
                scrollToLine(fileFields[0].lineNumber);
              }
            }}
            className="h-7 text-xs"
          >
            Jump to first field
          </Button>
        )}
      </div>
    </div>
  );
};
