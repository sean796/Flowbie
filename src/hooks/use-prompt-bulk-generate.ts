import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { streamChatCompletion } from '@/lib/api';
import { buildBulkBlogIdeasSystemPrompt, buildBulkBlogIdeasUserPrompt } from '@/lib/prompt-builders';
import { parseBlogIdeasChecklist, type CSVRow } from '@/lib/bulk-auto-generate';
import { parseTitleTemplate } from '@/lib/title-template-parser';
import type { Message } from '@/lib/api';
import { reassembleChunkedFiles } from '@/lib/utils';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { getPublishedPosts, getWordPressPostContent } from '@/lib/wordpress-api';
import { selectRelevantPostsForMultipleBlogs } from '@/lib/wordpress-post-selector';
import { convertWordPressPostsToMarkdownFiles, type WordPressConversionOptions } from '@/lib/wordpress-converter';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';
import { extractKeywordsFromKnowledgeBase } from '@/lib/blog-idea-kb-keyword-extractor';
import { selectBestKeywordsFromGSC } from '@/lib/blog-idea-gsc-keyword-selector';
import { combineAndSelectKeywords, type BlogIdeaKeywords } from '@/lib/blog-idea-keyword-combiner';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import type { KeywordAIAnalysis } from '@/lib/keyword-types';

const KB_FILES_STORAGE_KEY = 'kb_files';
const KB_PROFILES_STORAGE_KEY = 'kb_profiles';

interface KnowledgeProfile {
  id: string;
  name: string;
  content: string;
}

/**
 * Load knowledge base files and text from localStorage
 */
function loadKnowledgeBaseFromStorage(): {
  knowledgeFiles: Array<{ name: string; content: string }>;
  activeKnowledgeBaseText: string;
} {
  try {
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    
    const knowledgeFiles = storedFiles.map(file => ({
      name: file.name,
      content: file.content,
    }));

    const storedProfilesString = localStorage.getItem(KB_PROFILES_STORAGE_KEY) || '[]';
    const profiles = JSON.parse(storedProfilesString) as KnowledgeProfile[];
    const manualText = profiles.map(p => p.content).filter(Boolean).join('\n\n---\n\n');

    const fileContents = reassembleChunkedFiles(storedFiles);
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

export interface UsePromptBulkGenerateProps {
  apiKey?: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  // Blog generation settings — count is required; use the amount the user picked (no default/fallback).
  numberOfBlogs: number;
  entityMode?: 'auto' | 'manual' | 'blank';
  entityValue?: string;
  keywordMode?: 'same' | 'per-blog' | 'gsc-keywords';
  keywordValue?: string;
  gscExactKeywords?: string[]; // Exact GSC keywords to use
  optionalPrompt?: string;
  titleTemplate?: string; // Title template with variables like [Entity], [Keyword]
  entityList?: string; // Comma or newline-separated list of entity values
  keywordList?: string; // Comma or newline-separated list of keyword values
  locationList?: string; // Comma or newline-separated list of location values
  numberList?: string; // Comma or newline-separated list of number values
  featuredImagePerBlog?: boolean;
  // Connected WordPress site (for target topic)
  connectedSite?: { name: string; siteUrl: string };
  // Progress callback for sub-step tracking
  onProgress?: (step: string, progress: number) => void;
  // Keyword analysis results from Death Star module
  keywordAnalysisResults?: Map<string, KeywordAIAnalysis>;
}

export interface SelectedWordPressPosts {
  blogIndex: number;
  selectedPostIds: number[];
  selectedUrls: string[];
}

export function usePromptBulkGenerate({
  apiKey,
  openRouterApiKey,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  flowPurpose,
  numberOfBlogs,
  entityMode = 'blank',
  entityValue = '',
  keywordMode = 'per-blog',
  keywordValue = '',
  optionalPrompt = '',
  titleTemplate = '',
  entityList = '',
  keywordList = '',
  locationList = '',
  numberList = '',
  featuredImagePerBlog = true,
  connectedSite,
  gscExactKeywords = [],
  onProgress,
  keywordAnalysisResults,
}: UsePromptBulkGenerateProps) {
  const [userInput, setUserInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [generatedRows, setGeneratedRows] = useState<CSVRow[]>([]);
  const [wordPressPostsMetadata, setWordPressPostsMetadata] = useState<Array<{ id: number; slug: string; title: string; link: string }>>([]);
  const [selectedWordPressPosts, setSelectedWordPressPosts] = useState<Map<number, SelectedWordPressPosts>>(new Map());
  const [wordPressMarkdownFiles, setWordPressMarkdownFiles] = useState<Array<{ name: string; content: string }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /**
   * Generate checklist from settings (no user prompt required)
   * @param keepIndices Optional array of indices to keep from existing generatedRows
   */
  const handleGenerateChecklist = useCallback(async (keepIndices?: number[]) => {
    if (!apiKey || !openRouterApiKey) {
      toast.error('Please ensure API keys are set');
      return;
    }

    setIsGeneratingChecklist(true);
    
    // Calculate how many new blogs to generate
    const keptCount = keepIndices ? keepIndices.length : 0;
    const blogsToGenerate = numberOfBlogs - keptCount;
    
    if (blogsToGenerate <= 0) {
      toast.error('All blog ideas are already selected. Please deselect some to regenerate.');
      setIsGeneratingChecklist(false);
      return;
    }
    
    // Build a prompt from the settings
    const userMessage = `Generate ${blogsToGenerate} blog post ideas${optionalPrompt ? ` with the following characteristics: ${optionalPrompt}` : ''}`;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      // Step 1: Fetch WordPress posts - SIMPLE WordPress API call
      let postsMetadata: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
      let wordPressSite: WordPressSite | null = null;
      
      if (connectedSite) {
        try {
          onProgress?.('📊 Fetching WordPress posts...', 10);
          toast.info('Fetching WordPress posts...');
          const sites = getStoredSites();
          
          // Hard block placeholder domains from ever being used
          const normalizeDomain = (url: string): string =>
            url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

          const connectedDomain = normalizeDomain(connectedSite.siteUrl);
          if (connectedDomain === 'example.com' || connectedDomain.endsWith('.example.com')) {
            toast.error('Invalid target site: example.com is not allowed. Please connect a real WordPress site in Integrations.');
            setIsGeneratingChecklist(false);
            return;
          }

          // Match site by connectedSite URL - must be exact match
          wordPressSite = sites.find(s => {
            const normalize = (url: string) => url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
            return normalize(s.siteUrl) === normalize(connectedSite.siteUrl);
          });
          
          if (!wordPressSite) {
            console.warn('[WordPress] No matching site found for:', connectedSite.siteUrl);
            toast.warning(`WordPress site not found: ${connectedSite.siteUrl}`);
          } else if (wordPressSite.username && wordPressSite.appPassword) {
            // Fetch posts ONCE from target site only
            const publishedResult = await getPublishedPosts(
              wordPressSite.siteUrl,
              wordPressSite.username,
              wordPressSite.appPassword,
              100,
              0
            );
            
            if (publishedResult.posts && publishedResult.posts.length > 0) {
              // Ensure all posts have date_gmt field
              const targetSiteDomain = normalizeDomain(connectedSite.siteUrl);
              const wordPressSiteDomain = normalizeDomain(wordPressSite.siteUrl);
              
              // Extract root domain (e.g., "example.com" from "subdomain.example.com")
              const getRootDomain = (domain: string): string => {
                const parts = domain.split('.');
                if (parts.length >= 2) {
                  return parts.slice(-2).join('.'); // Last two parts
                }
                return domain;
              };
              
              const targetRootDomain = getRootDomain(targetSiteDomain);
              const wpRootDomain = getRootDomain(wordPressSiteDomain);
              
              postsMetadata = publishedResult.posts
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
              
              setWordPressPostsMetadata(postsMetadata);
              onProgress?.(`✅ Fetched ${postsMetadata.length} WordPress posts`, 15);
              toast.success(`Fetched ${postsMetadata.length} WordPress posts from ${connectedSite.name}`);
            } else if (publishedResult.error) {
              console.error('[WordPress] Error:', publishedResult.error);
              toast.error(`WordPress error: ${publishedResult.error}`);
            }
          }
        } catch (error) {
          console.error('[WordPress] Fetch error:', error);
          toast.error(`WordPress fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 2: Generate blog ideas FROM WordPress posts (if available)
      onProgress?.('🤖 Generating blog ideas with AI...', 30);
      // Load knowledge base for RAG context
      const { activeKnowledgeBaseText, knowledgeFiles } = loadKnowledgeBaseFromStorage();
// Show notification when reading knowledge base
      if (activeKnowledgeBaseText && activeKnowledgeBaseText.trim().length > 0) {
        onProgress?.('📚 Reading knowledge base for ideas...', 25);
        toast.info('Reading knowledge base for ideas...', {
          description: `Analyzing ${activeKnowledgeBaseText.length} characters of knowledge base content`
        });
      } else {
toast.warning('Knowledge base is empty. Blog ideas will be generated without knowledge base context.');
      }

      // TOKEN OPTIMIZATION: Limit knowledge base text to prevent "Request too large" errors
      // Use only first 5000 characters of knowledge base to keep prompt manageable
      const limitedKnowledgeBaseText = activeKnowledgeBaseText.length > 5000 
        ? activeKnowledgeBaseText.substring(0, 5000) + '\n\n[Knowledge base truncated for token optimization...]'
        : activeKnowledgeBaseText;
// Step 3: AI-driven keyword selection (NEW - replaces AI keyword generation in prompts)
      let selectedKeywords: BlogIdeaKeywords[] = [];
      
      try {
        onProgress?.('🔍 Selecting keywords with AI...', 28);
        toast.info('Selecting keywords with AI...');

        // Extract keywords from knowledge base
        let kbKeywords = null;
        if (activeKnowledgeBaseText && activeKnowledgeBaseText.trim().length > 0) {
          try {
            kbKeywords = await extractKeywordsFromKnowledgeBase(
              activeKnowledgeBaseText,
              openRouterApiKey,
              {
                numberOfBlogs: blogsToGenerate,
                flowPurpose: flowPurpose || '',
                entity: entityMode === 'manual' ? entityValue : entityMode === 'auto' ? undefined : undefined,
                model: selectedModel,
                temperature,
                maxTokens: Math.min(maxTokens || 4000, 2000),
                topP,
              }
            );
            console.log('[Keyword Selection] Extracted keywords from KB:', kbKeywords);
          } catch (error) {
            console.warn('[Keyword Selection] Failed to extract KB keywords:', error);
            toast.warning('Could not extract keywords from knowledge base, continuing without KB keywords');
          }
        }

        // Select keywords from GSC data (if available)
        let gscKeywords: Array<{ primaryKeyword: string; relatedKeywords: Array<{ keyword: string; impressions: number; clicks: number; position: number }> }> = [];
        
        // Check if we have GSC exact keywords - if so, try to fetch full GSC data
        // For now, if we have gscExactKeywords, we'll use them as primary keywords
        // In the future, we could fetch full GSC query data with metrics
        if (gscExactKeywords && gscExactKeywords.length > 0 && connectedSite) {
          try {
            // Convert exact keywords to GSC query format (without metrics for now)
            // In a full implementation, we'd fetch actual GSC data with metrics
            const gscQueries = gscExactKeywords.map(kw => ({
              query: kw,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
            }));

            gscKeywords = await selectBestKeywordsFromGSC(
              gscQueries,
              openRouterApiKey,
              {
                numberOfBlogs: blogsToGenerate,
                flowPurpose: flowPurpose || '',
                entity: entityMode === 'manual' ? entityValue : undefined,
                companyName: connectedSite.name,
                siteUrl: connectedSite.siteUrl,
                model: selectedModel,
                temperature,
                maxTokens: Math.min(maxTokens || 4000, 2000),
              }
            );
            console.log('[Keyword Selection] Selected keywords from GSC:', gscKeywords);
          } catch (error) {
            console.warn('[Keyword Selection] Failed to select GSC keywords:', error);
            toast.warning('Could not select keywords from GSC data, continuing without GSC keywords');
          }
        }

        // Combine and select best keywords
        selectedKeywords = await combineAndSelectKeywords(
          kbKeywords,
          gscKeywords,
          blogsToGenerate,
          openRouterApiKey,
          {
            flowPurpose: flowPurpose || '',
            entity: entityMode === 'manual' ? entityValue : undefined,
            connectedSite: connectedSite,
            model: selectedModel,
            temperature,
            maxTokens: Math.min(maxTokens || 4000, 2000),
          }
        );

        console.log('[Keyword Selection] Final selected keywords:', selectedKeywords);
        onProgress?.('✅ Keywords selected', 30);
        toast.success(`Selected ${selectedKeywords.length} keyword sets for blog ideas`);
      } catch (error) {
        console.error('[Keyword Selection] Error in keyword selection:', error);
        toast.warning('Keyword selection failed, continuing with AI-generated keywords');
        // Continue without pre-selected keywords - prompts will generate them
      }

      // Build prompts with settings - include WordPress posts if available
      // CRITICAL: Blog ideas should be GENERATED FROM WordPress posts, not just matched to them
      // Pass selected keywords if available (replaces AI keyword generation)
      const systemPrompt = buildBulkBlogIdeasSystemPrompt(
        flowPurpose || '',
        limitedKnowledgeBaseText,
        blogsToGenerate,
        entityMode,
        entityValue,
        keywordMode,
        keywordValue,
        optionalPrompt,
        titleTemplate,
        featuredImagePerBlog,
        connectedSite,
        postsMetadata.length > 0 ? postsMetadata : undefined, // Pass WordPress posts for blog idea generation
        keywordMode === 'gsc-keywords' ? gscExactKeywords : undefined, // Pass exact GSC keywords if in GSC mode
        selectedKeywords.length > 0 ? selectedKeywords : undefined, // Pass AI-selected keywords
        keywordAnalysisResults // Pass keyword analysis results (Death Star module)
      );
      const userPrompt = buildBulkBlogIdeasUserPrompt(
        userMessage, 
        blogsToGenerate, 
        optionalPrompt, 
        postsMetadata.length > 0 ? postsMetadata : undefined,
        keywordMode === 'gsc-keywords' ? gscExactKeywords : undefined, // Pass exact GSC keywords if in GSC mode
        selectedKeywords.length > 0 ? selectedKeywords : undefined // Pass AI-selected keywords
      );

      let checklistContent = '';
      try {
        // Clamp maxTokens to prevent API errors
        const safeMaxTokens = Math.min(maxTokens || 4000, 16000);
        
        onProgress?.('🤖 Streaming AI response...', 35);
        await streamChatCompletion({
          apiKey: openRouterApiKey,
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          maxTokens: safeMaxTokens,
          topP,
          onContentChunk: (chunk) => {
            checklistContent += chunk;
            setChatMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content = checklistContent;
              } else {
                newMessages.push({ role: 'assistant', content: checklistContent });
              }
              return newMessages;
            });
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Blog ideas generation error:', error);
        
        // Provide more specific error messages
        if (errorMessage.includes('400') || errorMessage.includes('Request too large')) {
          throw new Error('Request too large. The knowledge base or prompt is too long. Try reducing the knowledge base content or simplifying your prompt.');
        }
        if (errorMessage.includes('401') || errorMessage.includes('Invalid API key')) {
          throw new Error('Invalid OpenRouter API key. Please check your API key in settings.');
        }
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        
        throw new Error(`Failed to generate blog ideas: ${errorMessage}`);
      }

      // Parse checklist into CSVRow[]
      const parsedRows = parseBlogIdeasChecklist(
        checklistContent, 
        titleTemplate,
        entityList,
        keywordList,
        locationList,
        numberList
      );

      if (parsedRows.length === 0) {
        toast.error('Could not parse blog ideas from the response. Please try again with a clearer prompt.');
        setChatMessages(prev => prev.slice(0, -1));
        return;
      }

      // Helper function to parse list strings (split by newlines or commas)
      const parseListString = (list: string): string[] => {
        if (!list || !list.trim()) return [];
        return list
          .split(/[\n,]/)
          .map(item => item.trim())
          .filter(item => item.length > 0);
      };

      // CRITICAL: If entityMode is manual, assign entities to rows
      // This should happen BEFORE title template processing so entities are available for templates
      if (entityMode === 'manual') {
        // Try entityList first, then fallback to entityValue
        const entitySource = (entityList && entityList.trim()) ? entityList : entityValue;
        
        console.log(`[Entity Assignment] Manual mode detected. EntityList: "${entityList}", EntityValue: "${entityValue}", Using: "${entitySource}"`);
        
        if (entitySource && entitySource.trim()) {
          const entityValues = parseListString(entitySource);
          console.log(`[Entity Assignment] Parsed ${entityValues.length} entities:`, entityValues);
          
          if (entityValues.length > 0) {
            parsedRows.forEach((row, index) => {
              // Assign entity from list (one per row, cycling if list is shorter)
              const entityIndex = Math.min(index, entityValues.length - 1);
              row.entity = entityValues[entityIndex] || '';
              console.log(`[Entity Assignment] Row ${index + 1}: Assigned entity "${row.entity}" (from index ${entityIndex})`);
            });
          } else {
            console.warn(`[Entity Assignment] No entities parsed from source: "${entitySource}"`);
          }
        } else {
          console.warn(`[Entity Assignment] No entity source available. EntityList: "${entityList}", EntityValue: "${entityValue}"`);
        }
      }

      // CRITICAL: If title template is provided, ensure ALL titles follow the template
      // This must happen BEFORE WordPress post selection so posts are selected based on correct titles
      if (titleTemplate && titleTemplate.trim()) {
        const entityValues = parseListString(entityList || '');
        const keywordValues = parseListString(keywordList || '');
        const locationValues = parseListString(locationList || '');
        const numberValues = parseListString(numberList || '');
        
        parsedRows.forEach((row, index) => {
          const getListValue = (list: string[], fallback: string): string => {
            if (list.length > 0) {
              return list[Math.min(index, list.length - 1)] || fallback;
            }
            return fallback;
          };
          
          const variables: Record<string, string> = {
            Keyword: getListValue(keywordValues, row.keyword || ''),
            Entity: getListValue(entityValues, row.entity || ''),
            Location: getListValue(locationValues, ''),
            Number: getListValue(numberValues, String(index + 1)),
          };
          
          // FORCE template application - override any AI-generated title
          const templateTitle = parseTitleTemplate(titleTemplate, variables);
          if (templateTitle && templateTitle.trim()) {
            row.title = templateTitle.trim();
            console.log(`[Title Template] FORCED template for row ${index + 1}: "${row.title}"`);
          }
        });
      }

      // Determine final rows (merged or new)
      let finalRows: CSVRow[];
      let startIndex = 0;
      if (keepIndices && keepIndices.length > 0) {
        const keptRows = keepIndices.map(idx => generatedRows[idx]).filter(Boolean);
        finalRows = [...keptRows, ...parsedRows];
        startIndex = keptRows.length;
        toast.success(`Regenerated ${parsedRows.length} blog idea${parsedRows.length !== 1 ? 's' : ''}, kept ${keptRows.length} selected`);
      } else {
        finalRows = parsedRows;
        toast.success(`Generated ${parsedRows.length} blog idea${parsedRows.length !== 1 ? 's' : ''}`);
      }
      
      setGeneratedRows(finalRows);

      // Step 3: AI Analysis - Select relevant WordPress posts
      onProgress?.('🔍 Analyzing WordPress posts for relevance...', 50);
      // IMPORTANT: All posts are already from target site (filtered in Step 1), fetched ONCE
      // CRITICAL: Use template-generated titles for post selection
      const selectedPostsMap = new Map<number, SelectedWordPressPosts>();
      const allSelectedPostIds = new Set<number>();
      
      if (wordPressSite && postsMetadata.length > 0 && openRouterApiKey && connectedSite) {
        try {
          toast.info('Analyzing WordPress posts for all blog ideas...');
          
          // CRITICAL: Analyze ALL blog ideas using the CORRECT titles (template-generated)
          // This ensures WordPress posts are selected based on the actual template titles
          const blogsToAnalyze = finalRows.map((row) => ({
            keyword: row.keyword,
            title: row.title, // This should now be the template-generated title
          }));
          
          if (blogsToAnalyze.length > 0) {
            // Use postsMetadata (already filtered to target site) - fetched ONCE
            const selectionResults = await selectRelevantPostsForMultipleBlogs(
              blogsToAnalyze,
              postsMetadata,
              {
                apiKey: openRouterApiKey,
                model: selectedModel,
                temperature: 0.7,
                maxTokens: 2000,
                topP: 0.9,
                maxPosts: 5,
              }
            );
            
            // Map results to ALL blog indices (0, 1, 2, etc.)
            // CRITICAL: Iterate over all blog indices to ensure every blog gets posts
            for (let blogIdx = 0; blogIdx < finalRows.length; blogIdx++) {
              const result = selectionResults.get(blogIdx);
              
              if (!result) {
                console.warn(`[WordPress] No selection result found for blog #${blogIdx + 1}, using fallback`);
                // Use fallback if result is missing
                if (postsMetadata.length > 0) {
                  const fallbackPost = postsMetadata[0];
                  selectedPostsMap.set(blogIdx, {
                    blogIndex: blogIdx,
                    selectedPostIds: [fallbackPost.id],
                    selectedUrls: [fallbackPost.link || `${connectedSite.siteUrl}/${fallbackPost.slug}`],
                  });
                  allSelectedPostIds.add(fallbackPost.id);
                }
                continue;
              }
              
              const selectedIds = result.selectedPosts.map(p => p.id);
              const selectedUrls = result.selectedPosts.map(p => p.link);
              
              // If no posts were selected, try to select at least 1 most relevant post
              if (selectedIds.length === 0 && postsMetadata.length > 0) {
                // Select the first available post as fallback
                const fallbackPost = postsMetadata[0];
                selectedIds.push(fallbackPost.id);
                selectedUrls.push(fallbackPost.link || `${connectedSite.siteUrl}/${fallbackPost.slug}`);
                console.log(`[WordPress] No posts selected for blog #${blogIdx + 1}, using fallback post: ${fallbackPost.title}`);
              }
              
              selectedPostsMap.set(blogIdx, {
                blogIndex: blogIdx,
                selectedPostIds: selectedIds,
                selectedUrls: selectedUrls,
              });
              
              selectedIds.forEach(id => allSelectedPostIds.add(id));
              console.log(`[WordPress] Assigned ${selectedIds.length} posts to blog #${blogIdx + 1}: "${finalRows[blogIdx].title}"`);
            }
            
            setSelectedWordPressPosts(selectedPostsMap);
            const totalPostsSelected = Array.from(selectedPostsMap.values()).reduce((sum, v) => sum + v.selectedPostIds.length, 0);
            onProgress?.(`✅ Selected ${totalPostsSelected} WordPress posts`, 60);
            toast.success(`Selected ${totalPostsSelected} WordPress posts for ${finalRows.length} blog idea${finalRows.length !== 1 ? 's' : ''} from ${connectedSite.name}`);
          }
        } catch (error) {
          console.error('Error selecting posts:', error);
          toast.error('Failed to select WordPress posts. Blog ideas will continue without post associations.');
          // Continue without selection
        }
      }

      // Step 4 & 5: Fetch selected posts and convert to markdown
      if (wordPressSite && allSelectedPostIds.size > 0) {
        try {
          onProgress?.(`📥 Fetching post content...`, 70);
          toast.info(`Fetching ${allSelectedPostIds.size} WordPress posts...`);
          
          const postIdsArray = Array.from(allSelectedPostIds);
          const contentResult = await getWordPressPostContent(
            wordPressSite.siteUrl,
            wordPressSite.username,
            wordPressSite.appPassword,
            postIdsArray,
            undefined
          );
          
          if (contentResult.posts && contentResult.posts.length > 0) {
            // Prepare conversion options for AI summarization
            const useAISummarization = !!openRouterApiKey && openRouterApiKey.trim().length > 0;
            const conversionOptions: WordPressConversionOptions | undefined = useAISummarization ? {
              summarizeWithAI: true,
              openRouterApiKey: openRouterApiKey,
              onSummarizeProgress: (message) => {
                console.log(`[WordPress] AI Progress: ${message}`);
              },
            } : undefined;
            
            if (useAISummarization) {
              onProgress?.(`📝 Converting to markdown with AI...`, 85);
              toast.info(`AI analyzing ${contentResult.posts.length} posts to save tokens...`);
            } else {
              onProgress?.(`📝 Converting to markdown...`, 85);
            }
            
            const markdownFiles = await convertWordPressPostsToMarkdownFiles(contentResult.posts, undefined, conversionOptions);
            setWordPressMarkdownFiles(markdownFiles);
            
            // Add to knowledge base
            const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
            const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
            
            const newFiles: StoredFile[] = markdownFiles.map(file => ({
              name: file.name,
              size: file.content.length,
              content: file.content,
              starred: false,
              timestamp: Date.now(),
            }));
            
            onProgress?.(`💾 Adding to knowledge base...`, 95);
            localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify([...storedFiles, ...newFiles]));
            onProgress?.(`✅ Added ${markdownFiles.length} posts to knowledge base`, 98);
            toast.success(`Added ${markdownFiles.length} WordPress posts to knowledge base${useAISummarization ? ' (AI summarized)' : ''}`);
          }
        } catch (error) {
          console.error('Error fetching post content:', error);
          // Don't throw - continue without posts
        }
      }
      
      onProgress?.('✅ Generation complete!', 100);
      setHasGeneratedChecklist(true);
    } catch (error) {
      console.error('Checklist generation error:', error);
      onProgress?.('❌ Generation failed', 0);
      toast.error('Failed to generate checklist. Please try again.');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGeneratingChecklist(false);
    }
  }, [apiKey, openRouterApiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, numberOfBlogs, entityMode, entityValue, keywordMode, keywordValue, optionalPrompt, featuredImagePerBlog, connectedSite, generatedRows, onProgress, keywordAnalysisResults]);

  /**
   * Reset the prompt generation state
   */
  const resetPromptGeneration = useCallback(() => {
    setUserInput('');
    setChatMessages([]);
    setHasGeneratedChecklist(false);
    setGeneratedRows([]);
    setWordPressPostsMetadata([]);
    setSelectedWordPressPosts(new Map());
    setWordPressMarkdownFiles([]);
  }, []);

  /**
   * Modify the checklist (regenerate with modifications)
   */
  const handleModifyChecklist = useCallback(() => {
    setHasGeneratedChecklist(false);
    setGeneratedRows([]);
    // Keep chat messages for context
  }, []);

  /**
   * Regenerate unselected blog ideas, keeping selected ones
   * Returns the new indices of the kept items (they will be at the beginning of the array)
   */
  const handleRegenerateUnselected = useCallback(async (selectedIndices: Set<number>): Promise<Set<number>> => {
    if (selectedIndices.size >= generatedRows.length) {
      toast.error('Please deselect at least one blog idea to regenerate');
      return new Set();
    }

    // Convert Set to sorted array for consistent ordering
    const keepIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    await handleGenerateChecklist(keepIndices);
    
    // Return the new indices - kept items are always at the beginning (0, 1, 2, ...)
    return new Set(keepIndices.map((_, idx) => idx));
  }, [handleGenerateChecklist, generatedRows.length]);

  return {
    // State
    userInput,
    setUserInput,
    chatMessages,
    isGeneratingChecklist,
    hasGeneratedChecklist,
    generatedRows,
    setGeneratedRows,
    wordPressPostsMetadata,
    selectedWordPressPosts,
    wordPressMarkdownFiles,
    chatEndRef,
    
    // Actions
    handleGenerateChecklist,
    resetPromptGeneration,
    handleModifyChecklist,
    handleRegenerateUnselected,
  };
}

