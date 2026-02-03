import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { parseCSV, generateRowOutputs, generateBlueprintAndContent, type CSVRow, type BulkProcessingOptions } from '@/lib/bulk-auto-generate';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { useKeywordResearch } from './use-keyword-research';
import type { KeywordData, KeywordAIAnalysis } from '@/lib/keyword-types';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { reassembleChunkedFiles } from '@/lib/utils';
import { fetchWikipediaContent, generateWikipediaCSV, type WikipediaFetchOptions } from '@/lib/wikipedia-api';
import { getPublishedPosts } from '@/lib/wordpress-api';
import { getStoredSites } from '@/components/integrations/storage';
import type { WordPressSite } from '@/components/integrations/types';
import { getResearchModel } from '@/lib/optimization-settings-storage';

const KB_FILES_STORAGE_KEY = 'kb_files';
const KB_PROFILES_STORAGE_KEY = 'kb_profiles';

interface KnowledgeProfile {
  id: string;
  name: string;
  content: string;
}

/**
 * Load knowledge base files and text from localStorage
 * Returns knowledgeFiles array and activeKnowledgeBaseText string
 */
function loadKnowledgeBaseFromStorage(): {
  knowledgeFiles: Array<{ name: string; content: string }>;
  activeKnowledgeBaseText: string;
} {
  try {
    // Load knowledge files
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    
    // Convert StoredFile[] to Array<{ name: string; content: string }>
    const knowledgeFiles = storedFiles.map(file => ({
      name: file.name,
      content: file.content,
    }));

    // Load knowledge profiles and combine their content
    const storedProfilesString = localStorage.getItem(KB_PROFILES_STORAGE_KEY) || '[]';
    const profiles = JSON.parse(storedProfilesString) as KnowledgeProfile[];
    const manualText = profiles.map(p => p.content).filter(Boolean).join('\n\n---\n\n');

    // Reassemble chunked files (handles CSV chunks, etc.)
    const fileContents = reassembleChunkedFiles(storedFiles);

    // Combine manual text and file contents (same pattern as Index.tsx)
    const activeKnowledgeBaseText = [manualText, fileContents].filter(Boolean).join('\n\n---\n\n');

    return {
      knowledgeFiles,
      activeKnowledgeBaseText,
    };
  } catch (error) {
    console.error('Error loading knowledge base from storage:', error);
    return {
      knowledgeFiles: [],
      activeKnowledgeBaseText: '',
    };
  }
}

import type { WordPressPostingOptions } from '@/lib/bulk-auto-generate';

export interface UseBulkAutoGenerateProps {
  apiKey?: string; // DataForSEO API key
  openRouterApiKey?: string; // OpenRouter API key
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  connectedSite?: { name: string; siteUrl: string };
  wordPressPosting?: WordPressPostingOptions;
}

export function useBulkAutoGenerate({
  apiKey,
  openRouterApiKey,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  flowPurpose,
  featuredImageType = 'ai-generated',
  connectedSite,
  wordPressPosting,
}: UseBulkAutoGenerateProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRow, setCurrentRow] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [fileManager] = useState(() => new BulkFileManager());
  const [rows, setRows] = useState<CSVRow[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use keyword research hook for each row
  const {
    analyzeKeyword,
    isAnalyzing,
    isAnalyzingWithAI,
    currentResult,
    aiAnalysis,
    keywordsVolumeData,
    paaRawResponse,
    clearResults,
  } = useKeywordResearch({
    apiKey,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    connectedSite,
  });

  // Use refs to track current state values for polling loop
  const isAnalyzingRef = useRef(isAnalyzing);
  const isAnalyzingWithAIRef = useRef(isAnalyzingWithAI);
  const currentResultRef = useRef(currentResult);
  const aiAnalysisRef = useRef(aiAnalysis);

  // Update refs when state changes
isAnalyzingRef.current = isAnalyzing;
  isAnalyzingWithAIRef.current = isAnalyzingWithAI;
  currentResultRef.current = currentResult;
  aiAnalysisRef.current = aiAnalysis;

  /**
   * Load CSV file and parse rows
   */
  const loadCSV = useCallback(async (file: File): Promise<CSVRow[]> => {
    try {
      const parsedRows = await parseCSV(file);
      setRows(parsedRows);
      setTotalRows(parsedRows.length);
      return parsedRows;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse CSV';
      toast.error(errorMessage);
      throw error;
    }
  }, []);

  /**
   * Process a single row completely
   */
  const processRow = useCallback(async (
    rowIndex: number,
    row: CSVRow,
    options: BulkProcessingOptions
  ): Promise<BulkGeneratedFile[]> => {
    const allFiles: BulkGeneratedFile[] = [];

    try {
      // Clear state before processing this row to ensure clean state
      clearResults();

      // Step 1: Fetch Wikipedia and run keyword research
      const initialFiles = await generateRowOutputs(
        rowIndex,
        row,
        options,
        fileManager,
        analyzeKeyword
      );
      allFiles.push(...initialFiles);

      // Step 2: Wait for keyword research to complete
      // Poll for completion with timeout using refs to get current state values
let attempts = 0;
      const maxAttempts = 180; // 180 seconds max wait (3 minutes) - increased timeout
      
      while (attempts < maxAttempts) {
        // Use refs to get current state values instead of closure values
        const currentIsAnalyzing = isAnalyzingRef.current;
        const currentIsAnalyzingWithAI = isAnalyzingWithAIRef.current;
        const currentResultValue = currentResultRef.current;
        const currentAiAnalysis = aiAnalysisRef.current;
// Check if analysis is complete
        if (!currentIsAnalyzing && !currentIsAnalyzingWithAI && currentResultValue && currentAiAnalysis) {
// Verify the result matches our keyword
          if (currentResultValue.primaryKeyword?.toLowerCase().trim() !== row.keyword.toLowerCase().trim()) {
            throw new Error(`Keyword research result mismatch. Expected: ${row.keyword}, Got: ${currentResultValue?.primaryKeyword}`);
          }

          if (!currentResultValue.keywordData) {
            throw new Error('Keyword data is missing from research results');
          }

          if (!currentAiAnalysis) {
            throw new Error('AI analysis is missing from research results');
          }

          // Analysis complete, break out of loop
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }

      if (attempts >= maxAttempts) {
throw new Error('Keyword research timeout - analysis took too long');
      }

      // Get final values from refs (they should be set now)
      const finalResult = currentResultRef.current;
      const finalAiAnalysis = aiAnalysisRef.current;

      if (!finalResult || !finalAiAnalysis) {
        throw new Error('Keyword research incomplete - missing results');
      }

      // Step 3: Load knowledge base from localStorage
      let { knowledgeFiles, activeKnowledgeBaseText } = loadKnowledgeBaseFromStorage();

      // Step 3.5: Fetch Wikipedia content for entity if provided and add to knowledge base
      if (row.entity && row.entity.trim()) {
        try {
          options.onProgress?.(rowIndex, 0, `Fetching Wikipedia content for entity: ${row.entity}...`);
          
          // Load OpenRouter API key for AI summarization
          const openRouterApiKeyForSummary = options.openRouterApiKey;
          const useAISummarization = !!openRouterApiKeyForSummary && openRouterApiKeyForSummary.trim().length > 0;
          
          // Prepare fetch options with AI summarization
          const fetchOptions: WikipediaFetchOptions | undefined = useAISummarization ? {
            summarizeWithAI: true,
            openRouterApiKey: openRouterApiKeyForSummary,
            onSummarizeProgress: (message) => {
              options.onProgress?.(rowIndex, 0, `Wikipedia AI: ${message}`);
            },
          } : undefined;
          
          const wikipediaChunks = await fetchWikipediaContent(row.entity.trim(), fetchOptions);
          
          if (wikipediaChunks.length > 0) {
            // Convert Wikipedia chunks to CSV format
            const wikipediaCSV = generateWikipediaCSV(wikipediaChunks);
            
            // Add Wikipedia content as a knowledge file
            const wikipediaFileName = `Wikipedia_${row.entity.trim().replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
            knowledgeFiles.push({
              name: wikipediaFileName,
              content: wikipediaCSV,
            });
            
            // Also add to activeKnowledgeBaseText for RAG context
            const wikipediaText = wikipediaChunks
              .map(chunk => {
                const section = chunk.section !== 'Introduction' && chunk.section !== 'Overview'
                  ? `${chunk.section} - ${chunk.text}`
                  : chunk.text;
                return section;
              })
              .join('\n\n---\n\n');
            
            if (activeKnowledgeBaseText) {
              activeKnowledgeBaseText += `\n\n--- Wikipedia Content for ${row.entity} ---\n${wikipediaText}`;
            } else {
              activeKnowledgeBaseText = `--- Wikipedia Content for ${row.entity} ---\n${wikipediaText}`;
            }
            
            options.onProgress?.(rowIndex, 0, `Wikipedia content added to knowledge base for ${row.entity}`);
          }
        } catch (error) {
          console.error(`[Bulk Generate] Error fetching Wikipedia for entity "${row.entity}":`, error);
          // Continue without Wikipedia content - don't fail the entire process
          options.onProgress?.(rowIndex, 0, `Warning: Could not fetch Wikipedia for ${row.entity}, continuing...`);
        }
      }

      // Step 4: Retrieve WordPress posts for this keyword (if available)
      const keywordLower = row.keyword.toLowerCase().trim();
      const wordPressPosts = options.wordPressPostsByKeyword?.get(keywordLower);

      // Step 5: Generate blueprint and content with knowledge base (including Wikipedia and WordPress posts)
      const blueprintFiles = await generateBlueprintAndContent(
        rowIndex,
        row,
        finalResult.keywordData!,
        finalAiAnalysis,
        Array.from(keywordsVolumeData.values()),
        paaRawResponse,
        options,
        fileManager,
        knowledgeFiles,
        activeKnowledgeBaseText,
        connectedSite,
        wordPressPosts
      );
      allFiles.push(...blueprintFiles);

      return allFiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      options.onError?.(rowIndex, error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }, [fileManager, analyzeKeyword, keywordsVolumeData, paaRawResponse, clearResults]);

  /**
   * Process all rows sequentially
   */
  const processAllRows = useCallback(async (csvRows: CSVRow[], wordPressPostingOverride?: WordPressPostingOptions): Promise<void> => {
    if (!apiKey || !apiKey.trim()) {
      toast.error('DataForSEO API key is required');
      return;
    }
    if (!openRouterApiKey || !openRouterApiKey.trim()) {
      toast.error('OpenRouter API key is required');
      return;
    }

    setIsProcessing(true);
    setCurrentRow(0);
    setTotalRows(csvRows.length);
    fileManager.clear();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Step 1: Fetch WordPress posts for unique keywords (if connectedSite is provided)
    const wordPressPostsByKeyword = new Map<string, Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>>();
    
    if (connectedSite) {
      console.log('[Bulk Generate] Connected site provided:', connectedSite);
      try {
        toast.info('Fetching WordPress posts...');
        const sites = getStoredSites();
        console.log('[Bulk Generate] Found', sites.length, 'stored WordPress sites');
        
        // Hard block placeholder domains from ever being used
        const normalizeDomain = (url: string): string =>
          url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

        const connectedDomain = normalizeDomain(connectedSite.siteUrl);
        if (connectedDomain === 'example.com' || connectedDomain.endsWith('.example.com')) {
          toast.error('Invalid target site: example.com is not allowed. Please connect a real WordPress site in Integrations.');
          setIsProcessing(false);
          return;
        }

        // Match site by connectedSite URL - must be exact match
        const wordPressSite = sites.find(s => {
          const normalize = (url: string) => url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
          return normalize(s.siteUrl) === normalize(connectedSite.siteUrl);
        });
        
        console.log('[Bulk Generate] WordPress site match:', wordPressSite ? 'Found' : 'Not found', connectedSite.siteUrl);
        
        if (!wordPressSite) {
          console.warn('[WordPress] No matching site found for:', connectedSite.siteUrl);
          toast.warning(`WordPress site not found: ${connectedSite.siteUrl}`);
        } else if (wordPressSite.username && wordPressSite.appPassword) {
          // Get unique keywords from CSV rows
          const uniqueKeywords = new Set(csvRows.map(r => r.keyword.toLowerCase().trim()));
          console.log('[Bulk Generate] WordPress site credentials found, fetching posts for', uniqueKeywords.size, 'unique keywords');
          
          // Extract root domain helper
          const getRootDomain = (domain: string): string => {
            const parts = domain.split('.');
            if (parts.length >= 2) {
              return parts.slice(-2).join('.'); // Last two parts
            }
            return domain;
          };
          
          const targetSiteDomain = normalizeDomain(connectedSite.siteUrl);
          const wordPressSiteDomain = normalizeDomain(wordPressSite.siteUrl);
          const targetRootDomain = getRootDomain(targetSiteDomain);
          const wpRootDomain = getRootDomain(wordPressSiteDomain);
          
          // Fetch posts once per unique keyword
          for (const keyword of uniqueKeywords) {
            try {
              console.log('[Bulk Generate] Fetching WordPress posts for keyword:', keyword);
              const publishedResult = await getPublishedPosts(
                wordPressSite.siteUrl,
                wordPressSite.username,
                wordPressSite.appPassword,
                100,
                0
              );
              
              if (publishedResult.posts && publishedResult.posts.length > 0) {
                // Filter posts (same logic as prompt input)
                const postsMetadata = publishedResult.posts
                  .map(p => ({
                    ...p,
                    date_gmt: p.date_gmt || ''
                  }))
                  .filter(p => {
                    // ROBUST SAFEGUARD: Trust posts fetched from WordPress API
                    // Only filter if there's a clear security concern (completely different root domain)
                    
                    if (!p.link) {
                      console.warn('[WordPress] Post missing link field, keeping for safety:', p.id);
                      return true; // Keep posts without links rather than reject
                    }
                    
                    const postDomain = normalizeDomain(p.link);
                    const postRootDomain = getRootDomain(postDomain);
                    
                    // Only reject if root domain is completely different (security safeguard)
                    // Otherwise, trust the API response
                    const isCompletelyDifferent = postRootDomain !== targetRootDomain && 
                                                 postRootDomain !== wpRootDomain &&
                                                 !postDomain.includes(targetRootDomain) &&
                                                 !postDomain.includes(wpRootDomain);
                    
                    if (isCompletelyDifferent) {
                      console.warn(`[WordPress] Filtering post ${p.id} - domain mismatch: ${postDomain} vs ${targetRootDomain}/${wpRootDomain}`);
                      return false;
                    }
                    
                    // Trust all other posts from the API
                    return true;
                  });
                
                wordPressPostsByKeyword.set(keyword, postsMetadata);
                toast.success(`Fetched ${postsMetadata.length} WordPress posts for keyword: ${keyword}`);
              } else if (publishedResult.error) {
                console.error(`[WordPress] Error for keyword ${keyword}:`, publishedResult.error);
                toast.warning(`WordPress error for keyword ${keyword}: ${publishedResult.error}`);
              }
            } catch (error) {
              console.error(`[WordPress] Fetch error for keyword ${keyword}:`, error);
              toast.warning(`WordPress fetch failed for keyword ${keyword}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              // Continue with other keywords even if one fails
            }
          }
          
          if (wordPressPostsByKeyword.size > 0) {
            const totalPosts = Array.from(wordPressPostsByKeyword.values()).reduce((sum, posts) => sum + posts.length, 0);
            toast.success(`Fetched WordPress posts for ${wordPressPostsByKeyword.size} unique keyword(s) - ${totalPosts} total posts`);
          }
        }
      } catch (error) {
        console.error('[WordPress] Fetch error:', error);
        toast.warning(`WordPress fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue processing even if WordPress fetch fails
      }
    }

    const options: BulkProcessingOptions = {
      apiKey,
      openRouterApiKey,
      selectedModel,
      temperature,
      maxTokens,
      topP,
      flowPurpose,
      featuredImageType,
      wordPressPosting: wordPressPostingOverride || wordPressPosting,
      wordPressPostsByKeyword: wordPressPostsByKeyword.size > 0 ? wordPressPostsByKeyword : undefined,
      onProgress: (rowIndex, total, statusText) => {
        setCurrentRow(rowIndex);
        setStatus(statusText);
      },
      onRowComplete: (rowIndex, files) => {
        toast.success(`Row ${rowIndex + 1}/${csvRows.length} completed - ${files.length} files generated`);
      },
      onError: (rowIndex, error) => {
        toast.error(`Row ${rowIndex + 1} failed: ${error.message}`);
      },
    };

    try {
      for (let i = 0; i < csvRows.length; i++) {
        if (controller.signal.aborted) {
          throw new Error('Processing cancelled');
        }

        setCurrentRow(i);
        setStatus(`Processing row ${i + 1}/${csvRows.length}...`);

        try {
          // processRow now clears state internally before processing
          const files = await processRow(i, csvRows[i], options);
          // Only mark as complete if we got files back (all generation succeeded)
          if (files && files.length > 0) {
            options.onRowComplete?.(i, files);
          }
        } catch (error) {
          // Error occurred - remove any partial files for this row
          fileManager.removeFilesByRowIndex(i);
          // Continue with next row on error
          console.error(`Error processing row ${i + 1}:`, error);
          // Error already handled by onError callback
        }

        // Small delay between rows to avoid rate limiting
        if (i < csvRows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between rows
        }
      }

      setStatus('All rows processed');
      toast.success(`Bulk processing complete! ${fileManager.getStats().completed} files generated.`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Processing cancelled') {
        toast.warning('Processing cancelled by user');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Bulk processing failed: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
      setCurrentRow(0);
      setStatus('');
      abortControllerRef.current = null;
    }
  }, [apiKey, openRouterApiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, fileManager, processRow, connectedSite, wordPressPosting]);

  /**
   * Cancel processing
   */
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setStatus('Cancelled');
    }
  }, []);

  /**
   * Download a file
   */
  const downloadFile = useCallback((file: BulkGeneratedFile) => {
    fileManager.downloadFile(file);
  }, [fileManager]);

  /**
   * Download all files for a row
   */
  const downloadRowFiles = useCallback((rowIndex: number) => {
    fileManager.downloadRowFiles(rowIndex);
  }, [fileManager]);

  /**
   * Download all files
   */
  const downloadAllFiles = useCallback(() => {
    fileManager.downloadAllFiles();
  }, [fileManager]);

  return {
    // State
    isProcessing,
    currentRow,
    totalRows,
    status,
    rows,
    setRows,
    fileManager,
    
    // Actions
    loadCSV,
    processAllRows,
    cancelProcessing,
    downloadFile,
    downloadRowFiles,
    downloadAllFiles,
    
    // Stats
    stats: fileManager.getStats(),
    filesByRow: fileManager.getFilesByRow(),
  };
}

