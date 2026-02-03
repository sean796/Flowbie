import { useCallback } from "react";
import { toast } from "sonner";
import { clearAllKeywordData, clearKeywordResearchCache } from "@/lib/keyword-db";
import { clearKeywordCache } from "@/lib/keyword-api";
import { ensureServerRunning, stopServer } from "@/lib/server-manager";
import type { KeywordAnalysisOptions } from "@/lib/keyword-types";

interface UseKeywordResearchHandlersProps {
  primaryKeyword: string;
  location: string;
  language: string;
  forceRefresh: boolean;
  setBlueprintAnalysisResult: (result: any) => void;
  setIsAnalyzingKeyword: (isAnalyzing: boolean) => void;
  analyzeKeyword: (keyword: string, options: KeywordAnalysisOptions) => Promise<void>;
  clearResults: () => void;
}

export function useKeywordResearchHandlers({
  primaryKeyword,
  location,
  language,
  forceRefresh,
  setBlueprintAnalysisResult,
  setIsAnalyzingKeyword,
  analyzeKeyword,
  clearResults,
}: UseKeywordResearchHandlersProps) {
  const handleAnalyze = useCallback(async () => {
    if (!primaryKeyword.trim()) {
      toast.error("Please enter a primary keyword");
      return;
    }

    try {
      // Clear blueprint analysis results when user searches for a keyword manually
      // This prevents blueprint analysis from interfering with keyword search
      setBlueprintAnalysisResult(null);
      
      // Clear any old/cached data for this keyword to ensure fresh results
      clearResults();
      
      await analyzeKeyword(primaryKeyword, {
        location,
        language,
        depth: 10,
        forceRefresh: forceRefresh, // Force fresh data from API
      });
    } catch (err) {
      console.error("Analysis error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to analyze keyword";
      toast.error(errorMessage);
      // Don't show stale data if analysis fails
      clearResults();
    }
  }, [primaryKeyword, location, language, forceRefresh, analyzeKeyword, clearResults, setBlueprintAnalysisResult]);

  const handleClear = useCallback(() => {
    clearResults();
    // Also clear cache and database for this keyword to remove any placeholder data
    if (primaryKeyword) {
      clearKeywordCache();
      clearKeywordResearchCache();
    }
    toast.info("Keyword research cleared");
  }, [clearResults, primaryKeyword]);

  const handleClearAllCache = useCallback(() => {
    clearAllKeywordData();
    clearKeywordCache();
    clearResults();
    toast.success("All cached keyword data cleared");
  }, [clearResults]);

  const handleAnalyzeKeyword = useCallback(async () => {
    // Validate that a keyword is entered
    if (!primaryKeyword.trim()) {
      toast.error("Please enter a keyword to analyze");
      return;
    }

    setIsAnalyzingKeyword(true);
    setBlueprintAnalysisResult(null);

    try {
      // Ensure keyword server is running before proceeding
      toast.info("Checking keyword server status...");
      let serverResult;
      try {
        serverResult = await ensureServerRunning((message) => {
          toast.info(message, { duration: 2000 });
        });
      } catch (serverCheckError) {
        console.error('[Keyword Research] Error checking server status:', serverCheckError);
        toast.error(`Failed to check server status: ${serverCheckError instanceof Error ? serverCheckError.message : 'Unknown error'}`);
        setIsAnalyzingKeyword(false);
        return;
      }

      if (!serverResult || !serverResult.success) {
        toast.error(`Server error: ${serverResult?.message || 'Unknown server error'}`);
        setIsAnalyzingKeyword(false);
        return;
      }

      if (!serverResult.wasAlreadyRunning) {
        toast.success("Keyword server started successfully");
      }

      toast.info(`Analyzing keyword: ${primaryKeyword}...`);
      
      // Clear any old/cached data for this keyword to ensure fresh results
      try {
        clearResults();
      } catch (clearError) {
        console.warn('[Keyword Research] Error clearing results:', clearError);
        // Continue anyway
      }
      
      // Analyze the keyword directly using the analyzeKeyword function
      try {
        await analyzeKeyword(primaryKeyword.trim(), {
          location,
          language,
          depth: 10,
          forceRefresh: forceRefresh, // Force fresh data from API
        });

        toast.success(`Keyword "${primaryKeyword.trim()}" analyzed successfully!`);
      } catch (analysisError) {
        console.error("Keyword analysis error:", analysisError);
        const errorMessage = analysisError instanceof Error ? analysisError.message : 'Unknown error';
        toast.error(`Analysis failed: ${errorMessage}`);
        // Don't show stale data if analysis fails
        try {
          clearResults();
        } catch (clearError) {
          console.warn('[Keyword Research] Error clearing results after analysis failure:', clearError);
        }
        // Re-throw to be caught by outer catch
        throw analysisError;
      }
    } catch (error) {
      // Catch any unexpected errors
      console.error("Unexpected error in keyword analysis:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Unexpected error: ${errorMessage}`);
      
      // Ensure results are cleared on any error
      try {
        clearResults();
      } catch (clearError) {
        console.warn('[Keyword Research] Error clearing results in error handler:', clearError);
      }
    } finally {
      // Always reset analyzing state
      try {
        setIsAnalyzingKeyword(false);
      } catch (stateError) {
        console.error('[Keyword Research] Error resetting analyzing state:', stateError);
      }
      
      // Stop server after analysis completes (success or failure)
      try {
        const stopResult = await stopServer();
        if (stopResult && stopResult.success) {
          console.log('[Keyword Research] Server stopped after analysis:', stopResult.message);
        }
      } catch (stopError) {
        console.error('[Keyword Research] Error stopping server after analysis:', stopError);
        // Don't throw - server stop failure shouldn't crash the app
      }
    }
  }, [primaryKeyword, location, language, forceRefresh, analyzeKeyword, clearResults, setIsAnalyzingKeyword, setBlueprintAnalysisResult]);

  return {
    handleAnalyze,
    handleClear,
    handleClearAllCache,
    handleAnalyzeKeyword,
  };
}

