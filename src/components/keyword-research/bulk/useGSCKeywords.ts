import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';
import {
  runAnalyses,
  type GSCQuery,
  type AnalysisMethod,
} from '@/lib/gsc-keyword-analyzer';
import { loadApiKey } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { convertQueriesToCSV } from './bulk-utils';
import type { CSVRow } from '@/lib/bulk-auto-generate';

interface UseGSCKeywordsProps {
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entityMode: 'auto' | 'manual' | 'blank';
  entityValue: string;
  optionalPrompt: string;
  featuredImagePerBlog: boolean;
  keywordMode: 'same' | 'per-blog' | 'gsc-keywords';
  numberOfBlogs: number;
  inputMode: 'csv' | 'prompt';
  setRows?: (rows: CSVRow[]) => void;
  setGscExactKeywords: (keywords: string[]) => void;
  setKeywordMode: (mode: 'same' | 'per-blog' | 'gsc-keywords') => void;
  setNumberOfBlogs: (count: number) => void;
  setInputMode: (mode: 'csv' | 'prompt') => void;
}

export function useGSCKeywords({
  selectedModel,
  temperature,
  maxTokens,
  topP,
  entityMode,
  entityValue,
  optionalPrompt,
  featuredImagePerBlog,
  keywordMode,
  numberOfBlogs,
  inputMode,
  setRows,
  setGscExactKeywords,
  setKeywordMode,
  setNumberOfBlogs,
  setInputMode,
}: UseGSCKeywordsProps) {
  const [gscFiles, setGscFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [selectedGscFile, setSelectedGscFile] = useState<string>('');
  const [gscAnalysisDialogOpen, setGscAnalysisDialogOpen] = useState(false);
  const [selectedAnalysisMethods, setSelectedAnalysisMethods] = useState<AnalysisMethod[]>([]);
  const [isFetchingGSC, setIsFetchingGSC] = useState(false);
  const [gscAnalysisSite, setGscAnalysisSite] = useState<WordPressSite | null>(null);
  const [gscExactKeywordsInternal, setGscExactKeywordsInternal] = useState<string[]>([]);

  // Load GSC files from knowledge base
  useEffect(() => {
    const loadGscFiles = () => {
      try {
        const KB_FILES_STORAGE_KEY = 'kb_files';
        const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
        const storedFiles = JSON.parse(storedFilesString) as Array<{ name: string; content: string; size?: number; starred?: boolean; timestamp?: number }>;
        
        // Filter for GSC CSV files (files starting with "gsc-")
        const gscFiles = storedFiles
          .filter(file => file.name.startsWith('gsc-') && file.name.endsWith('.csv'))
          .map(file => ({
            name: file.name,
            content: file.content,
          }))
          .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (newest first)
        
        setGscFiles(gscFiles);
        
        // Auto-select first file if available
        if (gscFiles.length > 0 && !selectedGscFile) {
          setSelectedGscFile(gscFiles[0].name);
        }
      } catch (error) {
        console.error('[BulkAutoGenerate] Error loading GSC files:', error);
      }
    };

    loadGscFiles();
    
    // Listen for knowledge base updates
    const handleKbUpdate = () => loadGscFiles();
    window.addEventListener('kb-files-updated', handleKbUpdate);
    
    return () => {
      window.removeEventListener('kb-files-updated', handleKbUpdate);
    };
  }, [selectedGscFile]);

  const handleLoadGscKeywords = () => {
    if (!selectedGscFile) {
      toast.error('Please select a GSC file');
      return;
    }

    const selectedFile = gscFiles.find(f => f.name === selectedGscFile);
    if (!selectedFile) {
      toast.error('Selected GSC file not found');
      return;
    }

    try {
      // Parse GSC CSV content
      const parseResult = Papa.parse(selectedFile.content, {
        header: true,
        skipEmptyLines: true,
      });

      if (!parseResult.data || parseResult.data.length === 0) {
        toast.error('No keywords found in GSC file');
        return;
      }

      // Extract keywords from GSC CSV (query column)
      const keywords: string[] = [];
      for (const row of parseResult.data as any[]) {
        // GSC CSV has 'query' column, skip comment lines starting with #
        if (row.query && typeof row.query === 'string' && !row.query.trim().startsWith('#')) {
          keywords.push(row.query.trim());
        }
      }

      if (keywords.length === 0) {
        toast.error('No valid keywords found in GSC file');
        return;
      }

      // Use ALL keywords from the GSC file
      const selectedKeywords = keywords;

      // Convert to CSVRow format (keyword is required, title will be generated)
      if (setRows) {
        const csvRows: CSVRow[] = selectedKeywords.map(keyword => ({
          keyword: keyword,
          title: '', // Will be generated during processing
          entity: entityMode === 'auto' ? undefined : entityMode === 'manual' ? entityValue : undefined,
          modifier: optionalPrompt || undefined,
          featuredImage: featuredImagePerBlog ? 'y' : 'n',
        }));

        // Set rows directly (bypassing loadCSV since we're creating rows manually)
        setRows(csvRows);
        toast.success(`Loaded ${csvRows.length} keywords from GSC file "${selectedGscFile}"`);
      }
    } catch (error) {
      console.error('[BulkAutoGenerate] Error parsing GSC CSV:', error);
      toast.error(`Failed to parse GSC file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Auto-load keywords when GSC file is selected
  useEffect(() => {
    if (selectedGscFile && gscFiles.length > 0 && keywordMode === 'gsc-keywords' && setRows) {
      handleLoadGscKeywords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGscFile, keywordMode, gscFiles.length]);

  const handleFetchGSCQueriesForPrompt = async (site: WordPressSite, selectedMethods: AnalysisMethod[]) => {
    setIsFetchingGSC(true);
    setGscAnalysisDialogOpen(false);
    
    try {
      if (selectedMethods.length === 0) {
        toast.error('Please select at least one analysis method');
        setIsFetchingGSC(false);
        return;
      }

      toast.info(`Fetching GSC queries for ${site.name}...`);
      
      // Calculate date range
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
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || data.message || 'Failed to fetch GSC queries');
      }
      
      if (!data.queries || data.queries.length === 0) {
        toast.info(`No GSC queries found for ${site.name} in the specified date range`);
        setIsFetchingGSC(false);
        return;
      }

      const queries: GSCQuery[] = data.queries;
      toast.info(`Analyzing ${queries.length} queries with ${selectedMethods.length} method(s)...`);
      
      // Load OpenRouter API key for AI analysis
      const openRouterApiKeyForAnalysis = loadApiKey();
      
      // Run analyses
      const analysisResults = await runAnalyses(
        queries,
        selectedMethods,
        {
          apiKey: openRouterApiKeyForAnalysis || '',
          model: selectedModel || getResearchModel(),
          temperature: temperature || 1.0,
          maxTokens: maxTokens || 4000,
          topP: topP || 0.9,
          siteName: site.name,
          siteUrl: site.siteUrl,
        }
      );

      if (analysisResults.length === 0) {
        toast.error('No analysis results generated. Please try again.');
        setIsFetchingGSC(false);
        return;
      }

      // Save analysis results to knowledge base
      const KB_FILES_STORAGE_KEY = 'kb_files';
      const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
      const existingFiles = JSON.parse(storedFilesString) as Array<{
        name: string;
        size: number;
        content: string;
        starred: boolean;
        timestamp: number;
      }>;
      
      // Generate CSV files for each analysis result
      const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      const timestamp = Date.now();
      const newFiles: Array<{
        name: string;
        size: number;
        content: string;
        starred: boolean;
        timestamp: number;
      }> = [];

      for (const result of analysisResults) {
        if (result.keywords.length === 0) {
          console.warn(`[GSC] No keywords found for analysis method: ${result.method}`);
          continue;
        }

        // Convert to CSV
        const csvContent = convertQueriesToCSV(result.keywords, result);
        
        // Create file name using analysis method label
        const methodLabelSlug = result.methodLabel
          .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace special chars with hyphens
          .replace(/-+/g, '-') // Replace multiple hyphens with single
          .toLowerCase()
          .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
        const fileName = `gsc-${methodLabelSlug}-${sanitizedSiteName}-${timestamp}.csv`;
        
        // Create StoredFile
        const newFile = {
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        };

        newFiles.push(newFile);
      }

      // Add all new files to knowledge base
      if (newFiles.length > 0) {
        const allFiles = [...existingFiles, ...newFiles];
        localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(allFiles));
        
        // Dispatch event to notify UI
        window.dispatchEvent(new CustomEvent('kb-files-updated', { 
          detail: { files: allFiles } 
        }));
      }

      // Extract EXACT keywords from all analysis results (no variations, exact matches only)
      const exactKeywords: string[] = [];
      for (const result of analysisResults) {
        for (const query of result.keywords) {
          // Use the EXACT query string from GSC - no modifications
          if (query.query && typeof query.query === 'string' && query.query.trim()) {
            const exactKeyword = query.query.trim();
            // Only add if not already in list (case-sensitive exact match)
            if (!exactKeywords.includes(exactKeyword)) {
              exactKeywords.push(exactKeyword);
            }
          }
        }
      }

      if (exactKeywords.length === 0) {
        toast.error('No keywords found in analysis results.');
        setIsFetchingGSC(false);
        return;
      }

      // Store exact keywords for use in prompt generation
      setGscExactKeywords(exactKeywords);
      setGscExactKeywordsInternal(exactKeywords);
      
      // Limit to numberOfBlogs if we have more keywords than needed
      const keywordsToUse = exactKeywords.slice(0, Math.min(numberOfBlogs, exactKeywords.length));
      
      // Update numberOfBlogs to match available keywords if we have fewer
      if (keywordsToUse.length < numberOfBlogs) {
        setNumberOfBlogs(keywordsToUse.length);
      }

      // Set keyword mode to GSC keywords so the system uses exact keywords
      setKeywordMode('gsc-keywords');
      
      // Ensure we're in Prompt Input mode (not CSV mode)
      // The keywords will be used when generating blog ideas
      if (inputMode !== 'prompt') {
        setInputMode('prompt');
      }
      
      // Update success message to include knowledge base save info
      const filesMessage = newFiles.length > 0 ? ` Saved ${newFiles.length} analysis file(s) to knowledge base.` : '';
      toast.success(`Loaded ${keywordsToUse.length} exact GSC keywords. Ready to generate blog ideas!${filesMessage}`);
      
    } catch (error) {
      console.error('[GSC] Error fetching queries:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch GSC queries');
    } finally {
      setIsFetchingGSC(false);
    }
  };

  const handleOpenGSCAnalysisDialog = () => {
    const sites = getStoredSites();
    const enabledSites = sites.filter(s => s.enabled !== false);
    
    if (enabledSites.length === 0) {
      toast.error('No enabled WordPress sites found. Please enable a site in the Integrations tab.');
      return;
    }
    
    // Use first enabled site
    const siteToUse = enabledSites[0];
    setGscAnalysisSite(siteToUse);
    setSelectedAnalysisMethods([]);
    setGscAnalysisDialogOpen(true);
  };

  // Update parent when gscExactKeywords changes
  useEffect(() => {
    setGscExactKeywords(gscExactKeywordsInternal);
  }, [gscExactKeywordsInternal, setGscExactKeywords]);

  return {
    gscFiles,
    setGscFiles,
    selectedGscFile,
    setSelectedGscFile,
    gscAnalysisDialogOpen,
    setGscAnalysisDialogOpen,
    selectedAnalysisMethods,
    setSelectedAnalysisMethods,
    isFetchingGSC,
    gscAnalysisSite,
    setGscAnalysisSite,
    gscExactKeywords: gscExactKeywordsInternal,
    handleLoadGscKeywords,
    handleFetchGSCQueriesForPrompt,
    handleOpenGSCAnalysisDialog,
  };
}
