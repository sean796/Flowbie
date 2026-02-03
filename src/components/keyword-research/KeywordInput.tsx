import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchWikipediaContent, generateWikipediaCSV, type WikipediaFetchOptions } from "@/lib/wikipedia-api";
import { sanitizeFileName } from "@/lib/file-processing";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import { loadApiKey } from "@/lib/api";
import { createTempKbFile, updateKbFile } from "@/lib/kb-file-utils";

interface KeywordInputProps {
  primaryKeyword: string;
  entity: string;
  forceRefresh: boolean;
  isAnalyzing: boolean;
  hasResult: boolean;
  onKeywordChange: (value: string) => void;
  onEntityChange: (value: string) => void;
  onForceRefreshChange: (checked: boolean) => void;
  onAnalyze: () => void;
  onClear: () => void;
  onClearCache: () => void;
  onAddFile?: (file: StoredFile) => void;
}

export function KeywordInput({
  primaryKeyword,
  entity,
  forceRefresh,
  isAnalyzing,
  hasResult,
  onKeywordChange,
  onEntityChange,
  onForceRefreshChange,
  onAnalyze,
  onClear,
  onClearCache,
  onAddFile,
}: KeywordInputProps) {
  const [isLoadingWikipedia, setIsLoadingWikipedia] = useState(false);

  const handleWikipediaFetch = async () => {
    const entityName = entity?.trim();
    
    console.log('[Wikipedia Button] Fetch triggered, entity:', entityName);
    
    if (!entityName) {
      console.warn('[Wikipedia Button] Empty entity name');
      toast.error("Please enter an entity name");
      return;
    }

    if (!onAddFile) {
      console.error('[Wikipedia Button] onAddFile callback not available');
      toast.error("File upload functionality not available");
      return;
    }

    console.log('[Wikipedia Button] Starting Wikipedia fetch...');
    setIsLoadingWikipedia(true);

    let tempFileName: string | null = null;

    try {
      // Load OpenRouter API key for AI summarization
      const openRouterApiKey = loadApiKey();
      const useAISummarization = !!openRouterApiKey && openRouterApiKey.trim().length > 0;
      
      // Create temp file immediately to show progress
      if (useAISummarization) {
        toast.info("AI analyzing Wikipedia content to save tokens...");
        tempFileName = createTempKbFile(entityName, "AI summarization in progress. Analyzing content and preserving URLs...");
      }
      
      // Prepare fetch options with AI summarization
      const fetchOptions: WikipediaFetchOptions | undefined = useAISummarization ? {
        summarizeWithAI: true,
        openRouterApiKey: openRouterApiKey,
        onSummarizeProgress: (message) => {
          console.log(`[Wikipedia Button] AI Progress: ${message}`);
          // Update temp file with progress
          if (tempFileName) {
            const progressContent = `title,url,content
"${entityName}","","[AI SUMMARIZATION IN PROGRESS] ${message}\n\nAnalyzing and summarizing content while preserving all URLs. This file will be updated automatically when complete."`;
            updateKbFile(tempFileName, progressContent);
          }
        },
      } : undefined;
      
      // Fetch Wikipedia content
      console.log('[Wikipedia Button] Calling fetchWikipediaContent...');
      const chunks = await fetchWikipediaContent(entityName, fetchOptions);
      console.log('[Wikipedia Button] Received', chunks.length, 'chunks');
      
      if (chunks.length === 0) {
        console.warn('[Wikipedia Button] No chunks returned');
        // Remove temp file if it exists
        if (tempFileName) {
          try {
            const storedFilesString = localStorage.getItem('kb_files') || '[]';
            const files = JSON.parse(storedFilesString) as StoredFile[];
            const updatedFiles = files.filter(f => f.name !== tempFileName);
            localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
            window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
          } catch (e) {
            console.error('Error removing temp file:', e);
          }
        }
        toast.error("No content found for this entity");
        return;
      }

      // Generate CSV
      console.log('[Wikipedia Button] Generating CSV...');
      const csvContent = generateWikipediaCSV(chunks);
      console.log('[Wikipedia Button] CSV generated, length:', csvContent.length, 'bytes');

      // Update temp file with final content if it exists, otherwise create new file
      if (tempFileName) {
        updateKbFile(tempFileName, csvContent, csvContent.length);
        toast.success(`Wikipedia content saved to Knowledge Base (${chunks.length} chunks, AI summarized, ${Math.round(csvContent.length / 1024)}KB)`);
      } else {
        // Create new file if no temp file was created
        const sanitizedEntity = sanitizeFileName(entityName);
        const timestamp = Date.now();
        const fileName = `wikipedia-${sanitizedEntity}-${timestamp}.csv`;
        
        const file: StoredFile = {
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        };

        onAddFile(file);
        toast.success(`Wikipedia content saved to Knowledge Base (${chunks.length} chunks)`);
      }
    } catch (error) {
      // Remove temp file on error
      if (tempFileName) {
        try {
          const storedFilesString = localStorage.getItem('kb_files') || '[]';
          const files = JSON.parse(storedFilesString) as StoredFile[];
          const updatedFiles = files.filter(f => f.name !== tempFileName);
          localStorage.setItem('kb_files', JSON.stringify(updatedFiles));
          window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
        } catch (e) {
          console.error('[Wikipedia Button] Error removing temp file:', e);
        }
      }
      console.error("[Wikipedia Button] Error details:", {
        error,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        entity: entityName,
      });
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : `Failed to fetch Wikipedia content: ${String(error)}`;
      
      toast.error(errorMessage);
    } finally {
      console.log('[Wikipedia Button] Fetch complete, setting loading to false');
      setIsLoadingWikipedia(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="primary-keyword">Primary Keyword</Label>
        <div className="flex gap-2">
          <Input
            id="primary-keyword"
            value={primaryKeyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="e.g., best seo tools"
            className="flex-1"
            disabled={isAnalyzing}
          />
          <Button
            onClick={onAnalyze}
            disabled={isAnalyzing || !primaryKeyword.trim()}
          >
            {isAnalyzing ? "Analyzing..." : forceRefresh ? "Analyze (Fresh)" : "Analyze"}
          </Button>
          {hasResult && (
            <>
              <Button variant="outline" onClick={onClear}>
                Clear
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onClearCache}
                title="Clear all cached keyword data"
              >
                Clear Cache
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Force Refresh Toggle */}
      <div className="flex items-center gap-2 p-2 bg-card/50 rounded border border-border">
        <input
          type="checkbox"
          id="force-refresh"
          checked={forceRefresh}
          onChange={(e) => onForceRefreshChange(e.target.checked)}
          className="rounded cursor-pointer"
        />
        <Label htmlFor="force-refresh" className="text-sm cursor-pointer">
          Force fresh data (bypass cache) - Always search for new keywords
        </Label>
      </div>

      {/* Entity */}
      <div className="space-y-2">
        <Label>Entity (Optional)</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={entity}
            onChange={(e) => onEntityChange(e.target.value)}
            placeholder="e.g., Local Business, Product Name"
            className="flex-1"
            disabled={isLoadingWikipedia}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleWikipediaFetch}
            disabled={isLoadingWikipedia || !entity.trim() || !onAddFile}
            title="Fetch Wikipedia content and save to Knowledge Base"
            className="font-bold"
          >
            {isLoadingWikipedia ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="text-sm font-bold">W</span>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Used for content gap analysis, headlines, and checklist generation. Not used in keyword research API calls.
        </p>
      </div>
    </div>
  );
}

