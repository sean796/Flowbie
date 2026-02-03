import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { TestTube, Loader2, Copy, Check } from "lucide-react";
import { loadApiKey } from "@/lib/api";
import { getKeywordOverview } from "@/lib/keyword-api";
import {
  runAnalyses,
  type GSCQuery,
  type AnalysisMethod,
  ANALYSIS_METHODS,
} from "@/lib/gsc-keyword-analyzer";
import { type WordPressSite, KB_FILES_STORAGE_KEY, type StoredFile } from "./types";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export interface GSCFeatureRef {
  openDialog: (site: WordPressSite) => void;
  isFetchingGSC: string | null;
}

interface GSCFeatureProps {
  onRef?: (ref: GSCFeatureRef) => void;
}

export const GSCFeature: React.FC<GSCFeatureProps> = ({ onRef }) => {
  // GSC Service Account Email
  const GSC_SERVICE_ACCOUNT_EMAIL = "flowbie@flowbie-483717.iam.gserviceaccount.com";
  
  const [isTestingGSC, setIsTestingGSC] = useState(false);
  const [gscEmailCopied, setGscEmailCopied] = useState(false);
  const [gscAnalysisDialogOpen, setGscAnalysisDialogOpen] = useState(false);
  const [selectedAnalysisMethods, setSelectedAnalysisMethods] = useState<AnalysisMethod[]>([]);
  const [pendingGSCSite, setPendingGSCSite] = useState<WordPressSite | null>(null);
  const [isFetchingGSC, setIsFetchingGSC] = useState<string | null>(null);
  
  // Store onRef in a ref to avoid infinite loop - refs don't trigger re-renders
  const onRefRef = React.useRef(onRef);
  React.useEffect(() => {
    onRefRef.current = onRef;
  }, [onRef]);

  // Expose method to open dialog from WordPressFeature
  const handleOpenGSCAnalysisDialog = useCallback((site: WordPressSite) => {
    setPendingGSCSite(site);
    setSelectedAnalysisMethods([]);
    setGscAnalysisDialogOpen(true);
  }, []);

  // Expose ref to parent - update whenever isFetchingGSC changes
  // Use onRefRef.current instead of onRef in dependencies to break infinite loop
  React.useEffect(() => {
    if (onRefRef.current) {
      onRefRef.current({
        openDialog: handleOpenGSCAnalysisDialog,
        isFetchingGSC,
      });
    }
  }, [handleOpenGSCAnalysisDialog, isFetchingGSC]);

  /**
   * Convert query data to CSV format with keyword analysis data
   */
  const convertQueriesToCSV = useCallback((queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    date: string;
    searchVolume?: number;
    difficulty?: number;
    cpc?: number;
    competition?: string;
  }>): string => {
    // CSV header with keyword analysis fields
    const header = 'query,clicks,impressions,ctr,position,date,search_volume,keyword_difficulty,cpc,competition\n';
    
    // Convert each query to CSV row
    const rows = queries.map(q => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const escapedQuery = q.query.includes(',') || q.query.includes('"') || q.query.includes('\n')
        ? `"${q.query.replace(/"/g, '""')}"`
        : q.query;
      
      // Add keyword analysis fields (or empty if not available)
      const searchVolume = q.searchVolume ?? '';
      const difficulty = q.difficulty ?? '';
      const cpc = q.cpc ?? '';
      const competition = q.competition ?? '';
      
      return `${escapedQuery},${q.clicks},${q.impressions},${q.ctr.toFixed(4)},${q.position.toFixed(2)},${q.date},${searchVolume},${difficulty},${cpc},${competition}`;
    });
    
    return header + rows.join('\n');
  }, []);

  /**
   * Copy GSC email to clipboard
   */
  const handleCopyGSCEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(GSC_SERVICE_ACCOUNT_EMAIL);
      setGscEmailCopied(true);
      toast.success('GSC email copied to clipboard!');
      setTimeout(() => setGscEmailCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy email to clipboard');
    }
  }, []);

  /**
   * Test GSC connection by listing available sites
   */
  const handleTestGSCConnection = useCallback(async () => {
    setIsTestingGSC(true);
    
    try {
      toast.info('Testing GSC connection...');
      
      // Call backend API
      const API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
        (import.meta.env.DEV ? 'http://localhost:3001' : '');
      
      if (!API_BASE) {
        throw new Error('Backend API URL not configured. Please set VITE_MCP_API_BASE environment variable.');
      }
      
      console.log('[GSC Test] Calling API:', `${API_BASE}/api/gsc/test-connection`);
      
      const response = await fetch(`${API_BASE}/api/gsc/test-connection`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        console.error('[GSC Test] API Error Response:', errorData);
        
        let errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        
        if (errorData.troubleshooting) {
          errorMessage += `\n\nTroubleshooting:\n`;
          Object.values(errorData.troubleshooting).forEach((step, i) => {
            errorMessage += `${i + 1}. ${step}\n`;
          });
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        let errorMessage = data.error || data.message || 'GSC connection test failed';
        
        if (data.details) {
          errorMessage += `\n\nDetails: ${data.details}`;
        }
        
        console.error('[GSC Test] API returned error:', data);
        throw new Error(errorMessage);
      }
      
      // Success - show results
      if (data.sites && data.sites.length > 0) {
        const siteList = data.sites.map((s: any) => `  • ${s.siteUrl} (${s.permissionLevel})`).join('\n');
        toast.success(
          `✅ GSC Connection Successful!\n\nFound ${data.siteCount} site(s):\n${siteList}`,
          { duration: 10000 }
        );
      } else {
        toast.warning(
          `⚠️ Connected but no sites found.\n\nPlease verify the service account has access to properties in Google Search Console.`,
          { duration: 10000 }
        );
      }
      
      console.log('[GSC Test] Connection test successful:', data);
      
    } catch (error) {
      console.error('[GSC Test] Error testing connection:', error);
      
      let errorMessage = 'Failed to test GSC connection';
      let errorDetails = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // If the error message contains newlines, format it nicely
        if (error.message.includes('\n')) {
          const lines = error.message.split('\n');
          errorMessage = lines[0];
          errorDetails = lines.slice(1).join('\n');
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast.error(errorMessage, {
        description: errorDetails || undefined,
        duration: 10000,
      });
      
      console.error('[GSC Test] Full error details:', {
        message: errorMessage,
        details: errorDetails,
        error: error
      });
    } finally {
      setIsTestingGSC(false);
    }
  }, []);

  /**
   * Fetch GSC queries for a site and add to knowledge base with analysis
   */
  const handleFetchGSCQueries = useCallback(async (site: WordPressSite, selectedMethods: AnalysisMethod[] = []) => {
    setIsFetchingGSC(site.id);
    setGscAnalysisDialogOpen(false);
    
    try {
      toast.info(`Fetching GSC queries for ${site.name}...`);
      
      // Calculate date range
      // endDate must be today - 3 days (GSC data delay)
      // startDate is 90 days before endDate
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() - 3); // Today - 3 days
      
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 90); // 90 days before endDate
      
      // Format dates as YYYY-MM-DD
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Call backend API
      const API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
        (import.meta.env.DEV ? 'http://localhost:3001' : '');
      
      if (!API_BASE) {
        throw new Error('Backend API URL not configured. Please set VITE_MCP_API_BASE environment variable.');
      }
      
      console.log('[GSC] Calling API:', `${API_BASE}/api/gsc/fetch-queries`);
      console.log('[GSC] Request:', {
        siteUrl: site.siteUrl,
        startDate: startDateStr,
        endDate: endDateStr
      });
      
      const response = await fetch(`${API_BASE}/api/gsc/fetch-queries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: site.siteUrl,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
      });
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        console.error('[GSC] API Error Response:', errorData);
        
        // Build detailed error message
        let errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        
        // Add tried formats if available
        if (errorData.triedFormats && Array.isArray(errorData.triedFormats)) {
          errorMessage += `\n\nTried property formats: ${errorData.triedFormats.join(', ')}`;
        }
        
        // Add details if available
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        
        // Add service account info for debugging
        if (errorData.serviceAccountEmail) {
          errorMessage += `\n\nService Account: ${errorData.serviceAccountEmail}`;
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        let errorMessage = data.error || data.message || 'Failed to fetch GSC queries';
        
        // Add tried formats if available
        if (data.triedFormats && Array.isArray(data.triedFormats)) {
          errorMessage += `\n\nTried property formats: ${data.triedFormats.join(', ')}`;
        }
        
        // Add details if available
        if (data.details) {
          errorMessage += `\n\nDetails: ${data.details}`;
        }
        
        console.error('[GSC] API returned error:', data);
        throw new Error(errorMessage);
      }
      
      if (!data.queries || data.queries.length === 0) {
        toast.info(`No GSC queries found for ${site.name} in the specified date range`);
        return;
      }
      
      // Extract unique queries for keyword analysis (preserve original case from first occurrence)
      const uniqueQueryMap: Record<string, string> = {};
      data.queries.forEach((q: { query: string }) => {
        const lowerKey = q.query.toLowerCase();
        if (!uniqueQueryMap[lowerKey]) {
          uniqueQueryMap[lowerKey] = q.query;
        }
      });
      const uniqueQueries = Object.values(uniqueQueryMap);
      
      toast.info(`Fetched ${data.queries.length} GSC queries. Analyzing ${uniqueQueries.length} unique keywords...`);
      
      // Fetch keyword metrics for all unique queries
      let keywordMetrics: Record<string, { searchVolume: number; difficulty: number; cpc: number; competition: string }> = {};
      
      try {
        const batchSize = 100; // Process in batches to avoid overwhelming the API
        for (let i = 0; i < uniqueQueries.length; i += batchSize) {
          const batch = uniqueQueries.slice(i, i + batchSize);
          const metrics = await getKeywordOverview(batch, "United States", "en", true);
          
          // Build a lookup map by keyword (case-insensitive)
          metrics.forEach(metric => {
            keywordMetrics[metric.keyword.toLowerCase()] = {
              searchVolume: metric.searchVolume,
              difficulty: metric.difficulty,
              cpc: metric.cpc,
              competition: metric.competition || 'LOW'
            };
          });
        }
        
        toast.success(`Keyword analysis complete! Found metrics for ${Object.keys(keywordMetrics).length} keywords.`);
      } catch (error) {
        console.warn('[GSC] Error fetching keyword metrics:', error);
        toast.warning('GSC queries fetched, but keyword analysis failed. CSV will include queries without keyword metrics.');
      }
      
      // Enrich queries with keyword metrics
      const enrichedQueries = data.queries.map((q: { query: string; clicks: number; impressions: number; ctr: number; position: number; date: string }) => {
        const metrics = keywordMetrics[q.query.toLowerCase()];
        return {
          ...q,
          searchVolume: metrics?.searchVolume,
          difficulty: metrics?.difficulty,
          cpc: metrics?.cpc,
          competition: metrics?.competition
        };
      });
      
      // Get existing files
      const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
      const existingFiles = JSON.parse(storedFilesString) as StoredFile[];
      const newFiles: StoredFile[] = [];
      const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      const timestamp = Date.now();
      
      // If analysis methods selected, run analyses and create separate CSV files
      if (selectedMethods.length > 0) {
        toast.info(`Running ${selectedMethods.length} analysis method(s)...`);
        
        // Load OpenRouter API key for AI analysis
        const openRouterApiKey = loadApiKey();
        
        // Convert enriched queries to GSCQuery format for analysis
        // Ensure position is a number for proper filtering
        const gscQueries: GSCQuery[] = enrichedQueries.map(q => ({
          query: q.query,
          clicks: typeof q.clicks === 'number' ? q.clicks : parseInt(String(q.clicks), 10) || 0,
          impressions: typeof q.impressions === 'number' ? q.impressions : parseInt(String(q.impressions), 10) || 0,
          ctr: typeof q.ctr === 'number' ? q.ctr : parseFloat(String(q.ctr)) || 0,
          position: typeof q.position === 'number' ? q.position : parseFloat(String(q.position)) || 0,
          date: q.date
        }));
        
        // Log sample of positions for debugging
        const samplePositions = gscQueries.slice(0, 10).map(q => q.position);
        console.log(`[GSC] Sample positions from queries:`, samplePositions);
        
        console.log(`[GSC] Running ${selectedMethods.length} analysis method(s) on ${gscQueries.length} total queries`);
        
        // Run analyses
        const analysisResults = await runAnalyses(
          gscQueries,
          selectedMethods,
          {
            apiKey: openRouterApiKey || '',
            model: getResearchModel(),
            temperature: 1.0,
            maxTokens: 4000,
            topP: 0.9,
            siteName: site.name,
            siteUrl: site.siteUrl,
          }
        );
        
        console.log(`[GSC] Analysis complete. Got ${analysisResults.length} result(s)`);
        
        if (analysisResults.length === 0) {
          toast.warning('No analysis results generated. Please check your selections and try again.');
          setIsFetchingGSC(null);
          return;
        }
        
        // Create CSV files for each analysis result
        let totalAnalysisQueries = 0;
        for (const result of analysisResults) {
          console.log(`[GSC] Processing ${result.methodLabel}: ${result.keywords.length} filtered queries (from ${gscQueries.length} total)`);
          
          // Analysis results should already be filtered by the analysis method
          if (result.keywords.length === 0) {
            console.warn(`[GSC] Warning: ${result.methodLabel} returned 0 queries after filtering`);
            continue; // Skip creating file for empty results
          }
          
          const analysisEnrichedQueries = result.keywords.map((q: GSCQuery) => {
            const metrics = keywordMetrics[q.query.toLowerCase()];
            return {
              ...q,
              searchVolume: metrics?.searchVolume,
              difficulty: metrics?.difficulty,
              cpc: metrics?.cpc,
              competition: metrics?.competition
            };
          });
          
          totalAnalysisQueries += analysisEnrichedQueries.length;
          console.log(`[GSC Analysis] ${result.methodLabel}: ${analysisEnrichedQueries.length} queries after filtering`);
          
          const csvContent = convertQueriesToCSV(analysisEnrichedQueries);
          const fileName = `gsc-${result.method}-${sanitizedSiteName}-${timestamp}.csv`;
          
          newFiles.push({
            name: fileName,
            size: csvContent.length,
            content: csvContent,
            starred: false,
            timestamp: timestamp,
          });
        }
        
        // Update success message variables
        const metricsCount = Object.keys(keywordMetrics).length;
        const metricsMessage = metricsCount > 0 
          ? ` with keyword metrics for ${metricsCount} keywords` 
          : ' (keyword analysis unavailable)';
        const analysisMessage = analysisResults.length > 0
          ? ` Generated ${analysisResults.length} analysis file(s) with ${totalAnalysisQueries} filtered queries`
          : '';
        toast.success(`Successfully analyzed GSC queries from ${site.name}${metricsMessage}!${analysisMessage}`);
      } else {
        // No analysis methods selected, just create main CSV with all queries
        const csvContent = convertQueriesToCSV(enrichedQueries);
        const fileName = `gsc-queries-${sanitizedSiteName}-${timestamp}.csv`;
        
        newFiles.push({
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        });
      }
      
      // Add all new files
      const allFiles = [...existingFiles, ...newFiles];
      localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(allFiles));
      
      // Dispatch event to notify UI
      window.dispatchEvent(new CustomEvent('kb-files-updated', { 
        detail: { files: allFiles } 
      }));
      
      // Success message for non-analysis case (all queries)
      if (selectedMethods.length === 0) {
        const metricsCount = Object.keys(keywordMetrics).length;
        const metricsMessage = metricsCount > 0 
          ? ` with keyword metrics for ${metricsCount} keywords` 
          : ' (keyword analysis unavailable)';
        toast.success(`Successfully added ${data.queries.length} GSC queries from ${site.name} to knowledge base${metricsMessage}!`);
      }
      // Analysis case success message is already shown above
      
    } catch (error) {
      console.error('[GSC] Error fetching queries:', error);
      
      let errorMessage = 'Failed to fetch GSC queries';
      let errorDetails = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // If the error message contains newlines, format it nicely
        if (error.message.includes('\n')) {
          // Split by newlines and format
          const lines = error.message.split('\n');
          errorMessage = lines[0]; // First line as main message
          errorDetails = lines.slice(1).join('\n'); // Rest as details
        }
        
        // Log full error details for debugging
        if (error.stack) {
          console.error('[GSC] Error stack:', error.stack);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Show main error in toast
      toast.error(errorMessage, {
        description: errorDetails || undefined,
        duration: 10000, // Show for 10 seconds
      });
      
      // Also log to console with full details
      console.error('[GSC] Full error details:', {
        message: errorMessage,
        details: errorDetails,
        error: error
      });
    } finally {
      setIsFetchingGSC(null);
    }
  }, [convertQueriesToCSV]);


  return (
    <>
      <div className="bg-card p-6 rounded-lg border border-border">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Google Search Console</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Fetch search queries from Google Search Console with keyword analysis and AI-powered filtering.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md border border-border">
              <span className="text-xs text-muted-foreground">GSC Email:</span>
              <code className="text-xs font-mono text-foreground select-all">{GSC_SERVICE_ACCOUNT_EMAIL}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyGSCEmail}
                className="h-6 w-6 p-0 hover:bg-muted-foreground/20"
                title="Copy GSC email"
              >
                {gscEmailCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <Button 
              onClick={handleTestGSCConnection} 
              variant="outline"
              disabled={isTestingGSC}
              className="border-primary text-primary hover:bg-primary/10"
            >
              {isTestingGSC ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test GSC Connection
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* GSC Analysis Dialog */}
      <Dialog open={gscAnalysisDialogOpen} onOpenChange={setGscAnalysisDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Analysis Methods</DialogTitle>
            <DialogDescription>
              Choose one or more analysis methods to analyze GSC queries for {pendingGSCSite?.name}
              <br />
              <span className="text-xs text-muted-foreground mt-1 block">
                All queries will include keyword metrics (search volume, difficulty, CPC, competition). 
                Selected analysis methods will create separate CSV files with filtered results.
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {(Object.keys(ANALYSIS_METHODS) as AnalysisMethod[]).map((method) => {
              const methodInfo = ANALYSIS_METHODS[method];
              const isSelected = selectedAnalysisMethods.includes(method);
              
              return (
                <div
                  key={method}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={method}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAnalysisMethods([...selectedAnalysisMethods, method]);
                      } else {
                        setSelectedAnalysisMethods(selectedAnalysisMethods.filter(m => m !== method));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={method}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {methodInfo.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {methodInfo.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGscAnalysisDialogOpen(false);
                setSelectedAnalysisMethods([]);
                setPendingGSCSite(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingGSCSite) return;
                if (selectedAnalysisMethods.length === 0) {
                  // No methods selected, just fetch with keyword metrics
                  handleFetchGSCQueries(pendingGSCSite, []);
                } else {
                  // Methods selected, fetch and run analyses
                  handleFetchGSCQueries(pendingGSCSite, selectedAnalysisMethods);
                }
              }}
              disabled={!pendingGSCSite}
            >
              {selectedAnalysisMethods.length === 0 ? 'Fetch Queries Only' : `Fetch & Analyze (${selectedAnalysisMethods.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};


