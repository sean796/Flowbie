import { fetchWikipediaContent, generateWikipediaCSV } from './wikipedia-api';
import { generateChecklistFromSelections, generateBlueprintFromTemplate, type BlogTemplateContext } from './blog-template-builder';
import { getResearchModel } from './optimization-settings-storage';
import { buildImagePrompt } from './image-prompt-builder';
import { generateSEOImageFilename } from './image-filename-generator';
import type { KeywordData, KeywordAIAnalysis } from './keyword-types';
import { BulkFileManager, type BulkGeneratedFile } from './bulk-file-manager';
import type { WordPressSite } from '@/components/integrations/types';
import { createWordPressPost, uploadWordPressMedia, parseSitemap } from './wordpress-api';
import { BACKEND_API_BASE } from './wordpress-api/connection';
import { markdownToHtml, generateExcerpt } from './markdown-to-html';
import { calculateScheduledDate, formatWordPressDate } from './wordpress-scheduler';
import { extractEndpointFromEntitySitemapUrl } from './entity-endpoint-extractor';
import { updateACFFields } from './wordpress-acf-origin';
import { getACFFieldsForPost } from '@/lib/wordpress-api/acf-discovery';
import { discoverACFFieldMapping } from '@/lib/content-generation/acf-field-mapper';
import { generateFAQSchema, generateQuestionsFromContent } from './content-generation/wordpress-uploader';
import { truncateTitleForSEO, stripTitleSeparatorSuffix } from './content-generation/content-sanitizer';
import { generateSEOSlug } from './seo-slug-generator';
import { loadApiKey } from './api';

// Import from new feature-based modules
import type { CSVRow } from './bulk/bulk-csv-parser';
import { parseCSV, parseBlogIdeasChecklist } from './bulk/bulk-csv-parser';
import { 
  autoSelectKeywords, 
  autoSelectH2Sections, 
  autoSelectPeopleAlsoAsk, 
  autoSelectResearchLinks 
} from './bulk/bulk-blueprint-generator';
import { 
  generateMarkdownContent, 
  addEntityLinksToContent 
} from './bulk/bulk-content-generator';
import { 
  generateImageChecklist, 
  generateFeaturedImage 
} from './bulk/bulk-image-generator';
import { generateEntityTitleFromSitemap } from './bulk/bulk-entity-handler';
import { validateEntityNotInSitemap } from '@/components/integrations/entity-generation/validation/entityValidator';
import type { RunHistoryEntry } from '@/hooks/content-optimization/use-optimization-state';

// Re-export types and functions for backward compatibility
export type { CSVRow } from './bulk/bulk-csv-parser';
export { parseCSV, parseBlogIdeasChecklist } from './bulk/bulk-csv-parser';
export { generateEntityTitleFromSitemap } from './bulk/bulk-entity-handler';

export interface WordPressPostingOptions {
  enabled: boolean;
  site: WordPressSite; // Deprecated: use sites array instead
  sitemapType: 'post' | 'entity'; // Which sitemap to post to
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  customInterval?: number;
  dayOfWeek?: number;
  startDate: Date;
  startTime: string;
  totalRows: number;
  // New: Support for multiple sites
  sites?: Array<{
    site: WordPressSite;
    sitemapType: 'post' | 'entity';
  }>;
}

export interface BulkProcessingOptions {
  apiKey: string; // DataForSEO API key
  openRouterApiKey: string; // OpenRouter API key
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  wordPressPosting?: WordPressPostingOptions;
  wordPressPostsByKeyword?: Map<string, Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>>;
  onProgress?: (rowIndex: number, totalRows: number, status: string) => void;
  onRowComplete?: (rowIndex: number, files: BulkGeneratedFile[]) => void;
  onError?: (rowIndex: number, error: Error) => void;
  onAppendHistory?: (entry: RunHistoryEntry) => void;
  /** AI summary of site (posts sitemap scraped + summarized) for aligning service-area content */
  siteSummary?: string;
}

export interface BulkProcessingResult {
  success: boolean;
  totalRows: number;
  completedRows: number;
  failedRows: number;
  files: BulkGeneratedFile[];
  errors: Array<{ rowIndex: number; error: string }>;
}

/**
 * Process a single row and generate all outputs
 */
export async function generateRowOutputs(
  rowIndex: number,
  row: CSVRow,
  options: BulkProcessingOptions,
  fileManager: BulkFileManager,
  analyzeKeywordFn: (keyword: string, location: { location: string; language: string }) => Promise<void>
): Promise<BulkGeneratedFile[]> {
  const timestamp = Date.now();
  const generatedFiles: BulkGeneratedFile[] = [];

  try {
    // Step 1: Fetch Wikipedia content (only if entity is provided)
    if (row.entity && row.entity.trim()) {
      options.onProgress?.(rowIndex, 0, `Fetching Wikipedia content for "${row.entity}"...`);

      try {
        // First verify the entity exists on Wikipedia
        const { checkWikipediaPageExists } = await import('./wikipedia-api');
        const entityCheck = await checkWikipediaPageExists(row.entity.trim());
        
        if (!entityCheck.exists) {
          console.warn(`[Bulk Generator] Entity "${row.entity}" does not exist on Wikipedia. Skipping Wikipedia content fetch.`);
          options.onProgress?.(rowIndex, 0, `Entity "${row.entity}" not found on Wikipedia, skipping...`);
        } else {
          // Fetch Wikipedia content with retry logic
          let wikipediaChunks: any[] = [];
          let retries = 3;
          let lastError: Error | null = null;
          
          while (retries > 0) {
            try {
              const { fetchWikipediaContent } = await import('./wikipedia-api');
              wikipediaChunks = await fetchWikipediaContent(row.entity.trim());
              break; // Success
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              retries--;
              
              if (retries === 0) {
                console.error(`[Bulk Generator] Failed to fetch Wikipedia content for "${row.entity}" after retries:`, lastError);
                // Don't throw - continue without Wikipedia content
                options.onProgress?.(rowIndex, 0, `Failed to fetch Wikipedia content for "${row.entity}", continuing without it...`);
              } else {
                // Wait before retry (exponential backoff)
                const delay = 1000 * (4 - retries);
                options.onProgress?.(rowIndex, 0, `Retrying Wikipedia fetch for "${row.entity}" (${4 - retries}/3)...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (wikipediaChunks.length > 0) {
            const { generateWikipediaCSV } = await import('./wikipedia-api');
            const wikipediaCSV = generateWikipediaCSV(wikipediaChunks);
            const wikipediaFileName = BulkFileManager.generateFileName(row, 'wikipedia', timestamp);
            const wikipediaFileId = BulkFileManager.createFileId(rowIndex, 'wikipedia', timestamp);
            
            const wikipediaFile: BulkGeneratedFile = {
              id: wikipediaFileId,
              rowIndex,
              fileName: wikipediaFileName,
              content: wikipediaCSV,
              mimeType: 'text/csv',
              status: 'completed',
              timestamp,
              rowData: row,
            };
            
            fileManager.addFile(wikipediaFile);
            generatedFiles.push(wikipediaFile);
            options.onProgress?.(rowIndex, 0, `Wikipedia content fetched for "${row.entity}" (${wikipediaChunks.length} chunks)`);
          } else if (entityCheck.exists) {
            console.warn(`[Bulk Generator] Wikipedia page exists for "${row.entity}" but no content chunks were extracted.`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Bulk Generator] Error fetching Wikipedia content for "${row.entity}":`, errorMessage);
        // Continue without Wikipedia content - don't fail the entire generation
        options.onProgress?.(rowIndex, 0, `Error fetching Wikipedia content for "${row.entity}", continuing without it...`);
      }
    }

    options.onProgress?.(rowIndex, 0, 'Running keyword research...');

    // Step 2: Run keyword research
    await analyzeKeywordFn(row.keyword, {
      location: 'United States',
      language: 'en',
    });

    // Wait for keyword research to complete (this is handled by the hook)
    // Note: This is a simplified version. In practice, we'll need to integrate
    // with the keyword research hook to get the actual results.
    // This will be handled in the useBulkAutoGenerate hook.

    return generatedFiles;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    options.onError?.(rowIndex, error instanceof Error ? error : new Error(errorMessage));
    throw error;
  }
}

/**
 * Generate blueprint and content for a row
 * This function is called after keyword research is complete
 */
/**
 * Populate ACF fields from DFS data for new posts (skipping GSC)
 */
function populateACFFieldsFromDFS(
  row: CSVRow,
  keywordData: KeywordData,
  aiAnalysis: KeywordAIAnalysis,
  keywordsWithVolumeData: any[]
): Partial<CSVRow> {
  const acfFields: Partial<CSVRow> = {};
  
  // Set date_modifier to today's date if not already set
  if (!row.date_modifier) {
    acfFields.date_modifier = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  }
  
  // Set keyword_focus from primary keyword if not already set
  if (!row.keyword_focus && keywordData?.keyword) {
    acfFields.keyword_focus = keywordData.keyword;
  }
  
  // Set prompt_modifier from row.modifier if not already set
  if (!row.prompt_modifier && row.modifier) {
    acfFields.prompt_modifier = row.modifier;
  }
  
  // Set origin from entity if not already set
  if (!row.origin && row.entity && row.entity.trim() && row.entity.trim() !== 'N/A') {
    acfFields.origin = row.entity.trim();
  }
  
  // Set service_area_fields from entity or keyword data if available
  // This could be expanded to include more service area data from DFS
  if (!row.service_area_fields) {
    const serviceAreaParts: string[] = [];
    if (row.entity && row.entity.trim() && row.entity.trim() !== 'N/A') {
      serviceAreaParts.push(row.entity.trim());
    }
    if (keywordData?.keyword) {
      serviceAreaParts.push(keywordData.keyword);
    }
    if (serviceAreaParts.length > 0) {
      acfFields.service_area_fields = serviceAreaParts.join(', ');
    }
  }
  
  return acfFields;
}

export async function generateBlueprintAndContent(
  rowIndex: number,
  row: CSVRow,
  keywordData: KeywordData,
  aiAnalysis: KeywordAIAnalysis,
  keywordsWithVolumeData: any[],
  paaRawResponse: any,
  options: BulkProcessingOptions,
  fileManager: BulkFileManager,
  knowledgeFiles: Array<{ name: string; content: string }> = [],
  activeKnowledgeBaseText: string = '',
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>
): Promise<BulkGeneratedFile[]> {
  const timestamp = Date.now();
  const generatedFiles: BulkGeneratedFile[] = [];
  
  // Populate ACF fields from DFS data (for new posts, skipping GSC)
  const acfFieldsFromDFS = populateACFFieldsFromDFS(row, keywordData, aiAnalysis, keywordsWithVolumeData);
  // Merge ACF fields: existing row values take precedence, then DFS data
  const enrichedRow: CSVRow = {
    ...row,
    ...acfFieldsFromDFS,
    // Preserve existing ACF fields if they exist
    date_modifier: row.date_modifier || acfFieldsFromDFS.date_modifier,
    prompt_modifier: row.prompt_modifier || acfFieldsFromDFS.prompt_modifier,
    keyword_focus: row.keyword_focus || acfFieldsFromDFS.keyword_focus,
    service_area_fields: row.service_area_fields || acfFieldsFromDFS.service_area_fields,
    origin: row.origin || acfFieldsFromDFS.origin,
  };
  
try {
    // CRITICAL FIX: Merge PAA questions from paaRawResponse into aiAnalysis
    // The AI analyzer returns empty peopleAlsoAsk because PAA is extracted separately
    // We need to populate it here so autoSelectPeopleAlsoAsk works correctly
    if (paaRawResponse?.tasks?.[0]?.result?.[0]?.items) {
      const paaItems = paaRawResponse.tasks[0].result[0].items;
      if (Array.isArray(paaItems) && paaItems.length > 0) {
        aiAnalysis.peopleAlsoAsk = paaItems
          .filter((item: any) => item.type === 'people_also_ask' && item.items)
          .flatMap((item: any) => item.items || [])
          .slice(0, 10)
          .map((item: any) => ({
            question: item.title || '',
            snippet: item.snippet || ''
          }))
          .filter((paa: any) => paa.question);
        console.log('[Bulk Auto-Generate] Merged PAA questions into aiAnalysis:', {
          paaItemsCount: paaItems.length,
          aiAnalysisPAACount: aiAnalysis.peopleAlsoAsk.length
        });
      }
    }
    
    // Auto-select items using blueprint generator module
    const selectedKeywords = autoSelectKeywords(aiAnalysis, keywordsWithVolumeData);
    const selectedH2Sections = autoSelectH2Sections(aiAnalysis);
    const selectedPeopleAlsoAsk = autoSelectPeopleAlsoAsk(aiAnalysis);
    const selectedResearchLinks = autoSelectResearchLinks(aiAnalysis);

    // Generate checklist
    options.onProgress?.(rowIndex, 0, 'Generating checklist...');
    const checklist = await generateChecklistFromSelections(
      selectedKeywords,
      selectedH2Sections,
      enrichedRow.title,
      keywordData,
      {
        apiKey: options.openRouterApiKey,
        model: options.selectedModel || getResearchModel(),
        temperature: options.temperature || 1.0,
        maxTokens: options.maxTokens || 4000,
        topP: options.topP || 0.9,
        userPrompt: enrichedRow.prompt_modifier || enrichedRow.modifier, // Use prompt_modifier if available, fallback to modifier
        entity: enrichedRow.entity,
        serpData: paaRawResponse,
        selectedPeopleAlsoAsk,
        selectedResearchLinks,
        connectedSite,
        wordPressPosts,
      }
    );

    if (checklist.length === 0) {
      throw new Error('Failed to generate checklist');
    }

    // Generate blueprint
    options.onProgress?.(rowIndex, 0, 'Generating blueprint...');
    const context: BlogTemplateContext = {
      flowTitle: enrichedRow.title,
      flowPurpose: options.flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
      keywordData,
      userPrompt: enrichedRow.prompt_modifier || enrichedRow.modifier, // Use prompt_modifier if available, fallback to modifier
    };

    const blueprintResult = await generateBlueprintFromTemplate(checklist, context, {
      apiKey: options.openRouterApiKey,
      model: options.selectedModel || getResearchModel(),
      temperature: options.temperature || 1.0,
      maxTokens: options.maxTokens || 8000,
      topP: options.topP || 0.9,
      connectedSite,
    });

    if (blueprintResult.agents.length === 0) {
      throw new Error('No agents generated from template');
    }

    // Final validation: Ensure all agents have [LINK] feature with 3-5 links specification
    const agentsWithoutLinks = blueprintResult.agents.filter(agent => {
      const features = Array.isArray(agent.features) ? agent.features : [];
      const hasLinkFeature = features.some((f: string) => 
        typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
      );
      return !hasLinkFeature;
    });
    
    if (agentsWithoutLinks.length > 0) {
      console.error(`[Bulk Generate] ⚠️ ${agentsWithoutLinks.length} agent(s) missing [LINK] feature after generation. This should not happen - validation should have caught this.`);
      // The validation in generateBlueprintFromTemplate should have caught this, but log it anyway
    } else {
      console.log(`[Bulk Generate] ✅ All ${blueprintResult.agents.length} agents have [LINK] features`);
    }

    // Create blueprint JSON file
    const blueprintFileName = BulkFileManager.generateFileName(row, 'blueprint', timestamp);
    const blueprintFileId = BulkFileManager.createFileId(rowIndex, 'blueprint', timestamp);
    
    const blueprintFile: BulkGeneratedFile = {
      id: blueprintFileId,
      rowIndex,
      fileName: blueprintFileName,
      content: JSON.stringify({
        title: blueprintResult.title || enrichedRow.title,
        purpose: blueprintResult.purpose,
        agents: blueprintResult.agents,
        keyword: keywordData.keyword,
        entity: enrichedRow.entity,
        acfFields: {
          date_modifier: enrichedRow.date_modifier,
          prompt_modifier: enrichedRow.prompt_modifier,
          keyword_focus: enrichedRow.keyword_focus,
          service_area_fields: enrichedRow.service_area_fields,
          origin: enrichedRow.origin,
          faq: enrichedRow.faq,
        },
      }, null, 2),
      mimeType: 'application/json',
      status: 'completed',
      timestamp,
      rowData: enrichedRow, // Use enriched row with ACF fields
    };
    
    fileManager.addFile(blueprintFile);
    generatedFiles.push(blueprintFile);

    // Generate full markdown content using content generator module
    options.onProgress?.(rowIndex, 0, 'Generating blog content...');
    let markdownContent: string;
    try {
      markdownContent = await generateMarkdownContent(
        blueprintResult,
        enrichedRow, // Use enriched row with ACF fields
        keywordData,
        knowledgeFiles,
        activeKnowledgeBaseText,
        options,
        connectedSite,
        wordPressPosts,
        options.siteSummary
      );

      if (!markdownContent || markdownContent.trim().length === 0) {
        throw new Error('Markdown content generation returned empty result');
      }

      // Add entity Wikipedia links and "We Care About" sections using content generator module
      markdownContent = await addEntityLinksToContent(
        markdownContent,
        enrichedRow, // Use enriched row with ACF fields
        rowIndex,
        knowledgeFiles,
        options,
        options.onProgress
      );

      // Create markdown content file
      const contentFileName = BulkFileManager.generateFileName(row, 'content', timestamp);
      const contentFileId = BulkFileManager.createFileId(rowIndex, 'content', timestamp);
      
      const contentFile: BulkGeneratedFile = {
        id: contentFileId,
        rowIndex,
        fileName: contentFileName,
        content: markdownContent,
        mimeType: 'text/markdown',
        status: 'completed',
        timestamp,
        rowData: enrichedRow, // Use enriched row with ACF fields
      };
      
      fileManager.addFile(contentFile);
      generatedFiles.push(contentFile);
      options.onProgress?.(rowIndex, 0, 'Markdown content generated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error generating markdown content:', error);
      options.onError?.(rowIndex, new Error(`Markdown generation failed: ${errorMessage}`));
      throw new Error(`Failed to generate markdown content: ${errorMessage}`);
    }

    // Generate featured image using image generator module (only if featuredImage is 'y' or not specified)
    // This happens after markdown is generated so we can use the final content
    if (row.featuredImage !== 'n' && markdownContent) {
      try {
        // Check if Google Maps image is requested
        // Priority: CSV row value > global option > default to AI
        const featuredImageTypeFromRow = row.featuredImage === 'google-maps' ? 'google-maps' : 'ai-generated';
        const featuredImageType = featuredImageTypeFromRow === 'google-maps' ? featuredImageTypeFromRow : (options.featuredImageType || 'ai-generated');
        // Use enrichedRow.entity (which includes entity from row) for Google Maps check
        // enrichedRow is created from row, so it should have the entity if row has it
        const entityForImage = (enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== 'N/A') 
          ? enrichedRow.entity.trim() 
          : (row.entity && row.entity.trim() && row.entity.trim() !== 'N/A' ? row.entity.trim() : undefined);
        const useGoogleMaps = featuredImageType === 'google-maps' && entityForImage;
        
        if (featuredImageType === 'google-maps' && !entityForImage) {
          console.warn(`[Bulk Generate] Google Maps image requested but no entity found. Row entity: "${row.entity}", EnrichedRow entity: "${enrichedRow.entity}". Falling back to AI generation.`);
        }
let imageBase64: string;
        let mimeType = 'image/png';
        let imageChecklist: any[] = [];
        
        if (useGoogleMaps && entityForImage) {
          // Generate Google Maps screenshot
          options.onProgress?.(rowIndex, 0, `Generating Google Maps screenshot for ${entityForImage}...`);
          
          const response = await fetch(`${BACKEND_API_BASE}/api/google-maps-image/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ entity: entityForImage }),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to generate Google Maps image' }));
            throw new Error(errorData.error || `HTTP ${response.status}: Failed to generate Google Maps image`);
          }
          
          const result = await response.json();
          
          if (!result.success || !result.imageBase64) {
            throw new Error(result.error || 'No image data returned from Google Maps API');
          }
          
          imageBase64 = result.imageBase64;
          mimeType = result.mimeType || 'image/jpeg';
          
          // Remove data URL prefix if present
          if (imageBase64.includes(',')) {
            imageBase64 = imageBase64.split(',')[1];
          }
        } else {
          // Generate AI image using image generator module
          options.onProgress?.(rowIndex, 0, 'Generating image checklist...');
          imageChecklist = await generateImageChecklist(
            blueprintResult.title || enrichedRow.title,
            blueprintResult.purpose || options.flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
            markdownContent,
            {
              apiKey: options.openRouterApiKey,
              model: options.selectedModel || getResearchModel(),
              temperature: options.temperature || 1.0,
              maxTokens: options.maxTokens || 4000,
              topP: options.topP || 0.9,
            }
          );

          options.onProgress?.(rowIndex, 0, 'Generating featured image...');
          const imageResult = await generateFeaturedImage(
            blueprintResult.title || enrichedRow.title,
            blueprintResult.purpose || options.flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
            markdownContent,
            imageChecklist,
            {
              apiKey: options.openRouterApiKey,
              model: options.selectedModel || getResearchModel(),
            }
          );
          
          // Extract base64 from AI image result (always returns data URL)
          imageBase64 = imageResult.imageBase64;
          // Remove data URL prefix if present
          if (imageBase64.includes(',')) {
            imageBase64 = imageBase64.split(',')[1];
          }
        }

        // Generate SEO-friendly filename
        const imageFileName = await generateSEOImageFilename(
          useGoogleMaps && entityForImage ? `${entityForImage} Google Maps` : (blueprintResult.title || enrichedRow.title),
          options.openRouterApiKey,
          options.selectedModel || getResearchModel(),
          'featured'
        );

        // Ensure filename has correct extension based on mime type
        const fileNameWithoutExt = imageFileName.replace(/\.(png|jpg|jpeg)$/i, '');
        const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const finalImageFileName = `${fileNameWithoutExt}.${extension}`;
        
        // Create image file
        const imageFileId = BulkFileManager.createFileId(rowIndex, 'image', timestamp);
        const imageFile: BulkGeneratedFile = {
          id: imageFileId,
          rowIndex,
          fileName: finalImageFileName,
          content: `data:${mimeType};base64,${imageBase64}`,
          mimeType,
          status: 'completed',
          timestamp,
          rowData: row,
        };

        fileManager.addFile(imageFile);
        generatedFiles.push(imageFile);

        // Create featured image checklist JSON file (only for AI-generated images)
        if (!useGoogleMaps) {
          const featuredImageChecklistFileName = BulkFileManager.generateFileName(enrichedRow, 'featured-image-checklist', timestamp);
          const featuredImageChecklistFileId = BulkFileManager.createFileId(rowIndex, 'featured-image-checklist', timestamp);
          
          const featuredImageChecklistFile: BulkGeneratedFile = {
            id: featuredImageChecklistFileId,
            rowIndex,
            fileName: featuredImageChecklistFileName,
            content: JSON.stringify({
              title: blueprintResult.title || enrichedRow.title,
              purpose: blueprintResult.purpose || options.flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
              keyword: keywordData.keyword,
              entity: enrichedRow.entity,
              imageChecklist: imageChecklist.map((item: any) => ({
                title: item.title,
                description: item.description
              })),
              imagePrompt: buildImagePrompt(
                {
                  flowTitle: blueprintResult.title || enrichedRow.title,
                  flowPurpose: blueprintResult.purpose || options.flowPurpose || `Comprehensive guide about ${keywordData.keyword}`,
                  finalOutput: markdownContent,
                },
                {
                  includeText: false,
                  includePeople: false,
                  includeAnimals: false,
                  includeCars: false,
                  isInfographic: false,
                  aspectRatio: '16:9',
                  style: 'professional',
                  colorScheme: 'vibrant',
                }
              ) + '\n\nImage Generation Checklist:\n' + imageChecklist.map((item: any, idx: number) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n'),
              metadata: {
                aspectRatio: '16:9',
                style: 'professional',
                colorScheme: 'vibrant',
                generatedAt: new Date().toISOString(),
              }
            }, null, 2),
            mimeType: 'application/json',
            status: 'completed',
            timestamp,
            rowData: enrichedRow,
          };

          fileManager.addFile(featuredImageChecklistFile);
          generatedFiles.push(featuredImageChecklistFile);
          options.onProgress?.(rowIndex, 0, 'Featured image checklist JSON generated');
        } else {
          options.onProgress?.(rowIndex, 0, 'Featured image generated (Google Maps - no checklist needed)');
        }
      } catch (error) {
        // Log error but don't fail the entire generation
        console.error('Error generating featured image:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        options.onError?.(rowIndex, new Error(`Image generation failed: ${errorMessage}`));
        // Continue without image
      }
    }

    // WordPress upload (if enabled)
    if (options.wordPressPosting?.enabled && markdownContent) {
      // Determine which sites to post to
      const sitesToPost: Array<{ site: WordPressSite; sitemapType: 'post' | 'entity' }> = [];
      
      if (options.wordPressPosting.sites && options.wordPressPosting.sites.length > 0) {
        // Use multiple sites if provided
        sitesToPost.push(...options.wordPressPosting.sites);
      } else if (options.wordPressPosting.site) {
        // Fall back to single site for backward compatibility
        sitesToPost.push({
          site: options.wordPressPosting.site,
          sitemapType: options.wordPressPosting.sitemapType,
        });
      }

      if (sitesToPost.length === 0) {
        console.warn('[WordPress] No sites configured for posting');
        return generatedFiles;
      }

      // Cache entity sitemap URLs per site to avoid duplicate uploads (confirm entity doesn't already exist on WordPress)
      const entitySitemapCache = new Map<string, string[]>();
      async function getEntitySitemapUrls(site: WordPressSite): Promise<string[]> {
        const key = `${site.siteUrl}|${site.entitySitemapUrl || ''}`;
        if (entitySitemapCache.has(key)) return entitySitemapCache.get(key)!;
        const result = await parseSitemap(site.siteUrl, site.entitySitemapUrl!, site.username, site.appPassword);
        const urls = result?.urls ?? [];
        entitySitemapCache.set(key, urls);
        return urls;
      }

      // Calculate scheduled date for this row (shared across all sites)
      const scheduledDate = calculateScheduledDate(rowIndex, {
        frequency: options.wordPressPosting.frequency,
        customInterval: options.wordPressPosting.customInterval,
        dayOfWeek: options.wordPressPosting.dayOfWeek,
        startDate: options.wordPressPosting.startDate,
        startTime: options.wordPressPosting.startTime,
        totalRows: options.wordPressPosting.totalRows,
      });

      // Convert markdown to HTML (shared across all sites)
      const htmlContent = await markdownToHtml(markdownContent);
      const excerpt = generateExcerpt(markdownContent);

      // Upload featured image once (will be reused for all sites)
      let featuredImageId: number | undefined;
      const imageFile = generatedFiles.find(f => f.fileName.endsWith('.png') || f.fileName.endsWith('.jpg') || f.fileName.endsWith('.jpeg'));
      if (imageFile && imageFile.content) {
        try {
          options.onProgress?.(rowIndex, 0, 'Uploading featured image to WordPress...');
          let imageBase64 = imageFile.content;
          if (imageBase64.startsWith('data:')) {
            imageBase64 = imageBase64.split(',')[1];
          }
          // Upload to first site (images are typically shared)
          const mediaResult = await uploadWordPressMedia(
            sitesToPost[0].site.siteUrl,
            sitesToPost[0].site.username,
            sitesToPost[0].site.appPassword,
            imageBase64,
            imageFile.fileName,
            blueprintResult.title || enrichedRow.title
          );
          if (mediaResult.success && mediaResult.mediaId) {
            featuredImageId = mediaResult.mediaId;
            options.onProgress?.(rowIndex, 0, `Featured image uploaded: Media ID ${featuredImageId}`);
          }
        } catch (error) {
          console.error('Failed to upload featured image:', error);
        }
      }

      // Post to all selected sites
      for (let siteIndex = 0; siteIndex < sitesToPost.length; siteIndex++) {
        const { site, sitemapType } = sitesToPost[siteIndex];
        
        try {
          options.onProgress?.(rowIndex, 0, `Uploading to WordPress (${site.name})...`);

          // Confirm entity doesn't already exist on WordPress (validate against live sitemap to avoid uploading duplicates)
          if (sitemapType === 'entity' && site.entitySitemapUrl) {
            const entity = enrichedRow.entity?.trim();
            if (entity && entity !== 'N/A') {
              try {
                const urls = await getEntitySitemapUrls(site);
                if (urls.length > 0 && !validateEntityNotInSitemap(entity, urls)) {
                  console.log(`[Bulk Upload] Skipping WordPress upload: entity "${entity}" already exists on ${site.name} (found in sitemap).`);
                  options.onProgress?.(rowIndex, 0, `Skipped: "${entity}" already exists on WordPress (${site.name})`);
                  options.onAppendHistory?.({
                    ts: Date.now(),
                    entityOrTitle: entity,
                    site: site.name,
                    step: 'upload',
                    message: `Skipped: "${entity}" already exists on WordPress (${site.name})`,
                    outcome: 'skip',
                    mode: 'entity',
                  });
                  continue;
                }
              } catch (e) {
                console.warn('[Bulk Upload] Could not validate entity against sitemap, proceeding with upload:', e);
              }
            }
          }

          // Determine entity endpoint based on sitemapType
          let entityEndpoint: string;
          if (sitemapType === 'entity' && site.entitySitemapUrl) {
            entityEndpoint = extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl);
          } else {
            entityEndpoint = 'posts';
          }

          // Upload featured image to this site if not already uploaded (or re-upload for each site)
          let siteFeaturedImageId = featuredImageId;
          if (imageFile && imageFile.content && siteIndex > 0) {
            // Upload image to each additional site
            try {
              let imageBase64 = imageFile.content;
              if (imageBase64.startsWith('data:')) {
                imageBase64 = imageBase64.split(',')[1];
              }
              const mediaResult = await uploadWordPressMedia(
                site.siteUrl,
                site.username,
                site.appPassword,
                imageBase64,
                imageFile.fileName,
                blueprintResult.title || enrichedRow.title
              );
              if (mediaResult.success && mediaResult.mediaId) {
                siteFeaturedImageId = mediaResult.mediaId;
              }
            } catch (error) {
              console.error(`Failed to upload featured image to ${site.name}:`, error);
            }
          }

          // Short SEO title: strip any pipe/separator suffix, then truncate to 60 chars
          const rawPostTitle = blueprintResult.title || enrichedRow.title;
          const titleNoSeparator = stripTitleSeparatorSuffix(rawPostTitle);
          const postTitle = truncateTitleForSEO(titleNoSeparator, 60);

          // Short SEO slug for NEW posts only (bulk/prompt-gen always create new posts)
          let slug: string | undefined;
          try {
            const keyword = (enrichedRow.keyword_focus || blueprintResult.title || enrichedRow.title || '').trim();
            const entitySlug =
              enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== 'N/A'
                ? enrichedRow.entity.trim()
                : undefined;
            slug = await generateSEOSlug(postTitle, keyword || postTitle, entitySlug, loadApiKey());
            if (!slug || slug.length < 2) slug = undefined;
          } catch {
            slug = undefined;
          }

          // Create WordPress post
          const postResult = await createWordPressPost(
            site.siteUrl,
            site.username,
            site.appPassword,
            postTitle,
            htmlContent,
            excerpt,
            'future',
            formatWordPressDate(scheduledDate),
            siteFeaturedImageId,
            undefined, // categories
            undefined, // tags
            undefined, // postType
            entityEndpoint,
            slug,
            undefined // author
          );

          if (postResult.success && postResult.postId) {
            // Update ACF fields after successful post creation (discover field names like wordpress-uploader)
            const entity = enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== 'N/A'
              ? enrichedRow.entity.trim()
              : undefined;
            let acfUpdatedList: string[] | undefined;
            const postTypeForAcf = sitemapType === 'entity' ? entityEndpoint : 'post';
            try {
              options.onProgress?.(rowIndex, 0, `Discovering ACF fields for post ${postResult.postId}...`);
              const acfResult = await getACFFieldsForPost(
                site,
                postResult.postId,
                postTypeForAcf,
                entityEndpoint
              );
              const existingAcfFields = acfResult.success && acfResult.fields ? acfResult.fields : {};
              const openRouterApiKey = options.openRouterApiKey || loadApiKey();
              const fieldMapping = await discoverACFFieldMapping(
                existingAcfFields,
                postTypeForAcf,
                openRouterApiKey || '',
                site.siteUrl
              );
              const fieldNames = {
                dateModifier: fieldMapping.dateModifier || 'date_modifier',
                faq: fieldMapping.faq || 'faq',
                promptModifier: fieldMapping.promptModifier || 'prompt_modifier',
                origin: fieldMapping.origin || 'origin',
                keywordFocus: fieldMapping.keywordFocus || 'keyword_focus',
              };

              options.onProgress?.(rowIndex, 0, `Updating ACF fields for post ${postResult.postId}...`);
              const acfFields: Record<string, string> = {};

              if (enrichedRow.date_modifier && enrichedRow.date_modifier.trim()) {
                acfFields[fieldNames.dateModifier] = enrichedRow.date_modifier.trim();
              } else {
                acfFields[fieldNames.dateModifier] = new Date().toISOString().split('T')[0];
              }
              if (enrichedRow.prompt_modifier && enrichedRow.prompt_modifier.trim()) {
                acfFields[fieldNames.promptModifier] = enrichedRow.prompt_modifier.trim();
              }
              if (enrichedRow.keyword_focus && enrichedRow.keyword_focus.trim()) {
                acfFields[fieldNames.keywordFocus] = enrichedRow.keyword_focus.trim();
              }
              if (enrichedRow.service_area_fields && enrichedRow.service_area_fields.trim()) {
                acfFields['service_area_fields'] = enrichedRow.service_area_fields.trim();
              }
              if (enrichedRow.origin && enrichedRow.origin.trim() && enrichedRow.origin.trim() !== 'N/A') {
                acfFields[fieldNames.origin] = enrichedRow.origin.trim();
              } else if (entity) {
                acfFields[fieldNames.origin] = entity;
              }

              try {
                let questionsToUse: string[] = [];
                if (enrichedRow.faq && enrichedRow.faq.trim() && enrichedRow.faq.includes('FAQPage')) {
                  acfFields[fieldNames.faq] = enrichedRow.faq.trim();
                  console.log(`[Bulk Upload] Using FAQ from CSV row for post ${postResult.postId}`);
                } else {
                  if (aiAnalysis?.peopleAlsoAsk && aiAnalysis.peopleAlsoAsk.length > 0) {
                    questionsToUse = aiAnalysis.peopleAlsoAsk
                      .slice(0, 4)
                      .map(paa => paa.question || '')
                      .filter(q => q.trim().length > 0);
                  }
                  if (questionsToUse.length === 0) {
                    const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
                    questionsToUse = await generateQuestionsFromContent(htmlContent, keywordData.keyword, openRouterApiKey || '', napLocations).catch(() => []);
                  }
                  if (questionsToUse.length === 0) {
                    questionsToUse = [
                      `What is ${keywordData.keyword}?`,
                      `How does ${keywordData.keyword} work?`,
                      `Why is ${keywordData.keyword} important?`,
                      `Where can I find ${keywordData.keyword}?`
                    ];
                  }
                  const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
                  acfFields[fieldNames.faq] = generateFAQSchema(questionsToUse, keywordData.keyword, entity, site.siteUrl, napLocations);
                }
              } catch (faqError) {
                const napLocations = site.napInfo?.locations?.map(loc => ({ city: loc.city, state: loc.state })) || site.locations?.map(loc => ({ city: loc.city, state: loc.state }));
                acfFields[fieldNames.faq] = generateFAQSchema(
                  [`What is ${keywordData.keyword}?`, `How does ${keywordData.keyword} work?`, `Why is ${keywordData.keyword} important?`, `Where can I find ${keywordData.keyword}?`],
                  keywordData.keyword,
                  entity,
                  site.siteUrl,
                  napLocations
                );
              }

              const fieldsToUpdate = Object.keys(acfFields);
              if (fieldsToUpdate.length > 0) {
                options.onProgress?.(rowIndex, 0, `Updating ACF fields (${fieldsToUpdate.join(', ')}) for post ${postResult.postId}...`);
                const acfUpdateResult = await updateACFFields(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  postResult.postId,
                  acfFields,
                  postTypeForAcf,
                  entityEndpoint
                );
                if (acfUpdateResult.success) {
                  acfUpdatedList = acfUpdateResult.updated;
                  const updatedFields = acfUpdateResult.updated.join(', ');
                  console.log(`[Bulk Upload] Successfully updated ACF fields [${updatedFields}] for post ${postResult.postId} on ${site.name}`);
                  options.onProgress?.(rowIndex, 0, `ACF fields updated: ${updatedFields}`);
                } else {
                  const errMsg = acfUpdateResult.error || (acfUpdateResult.failed?.length ? acfUpdateResult.failed.map(f => `${f.field}: ${f.error}`).join('; ') : 'Unknown error');
                  console.warn(`[Bulk Upload] Failed to update ACF fields for post ${postResult.postId}:`, acfUpdateResult.error || acfUpdateResult.failed);
                  options.onProgress?.(rowIndex, 0, `ACF update failed: ${errMsg}`);
                }
              }
            } catch (acfError) {
              const errMsg = acfError instanceof Error ? acfError.message : String(acfError);
              console.warn(`[Bulk Upload] Error updating ACF fields for post ${postResult.postId}:`, acfError);
              options.onProgress?.(rowIndex, 0, `ACF update failed: ${errMsg}`);
            }
            
            // Create wordpress-post JSON file for this site
            const siteNameSlug = site.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
            const wordPressPostFileName = `wordpress-post-${siteNameSlug}-${enrichedRow.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${timestamp}.json`;
            const wordPressPostFileId = BulkFileManager.createFileId(rowIndex, `wordpress-post-${siteIndex}`, timestamp);

            const wordPressPostFile: BulkGeneratedFile = {
              id: wordPressPostFileId,
              rowIndex,
              fileName: wordPressPostFileName,
              content: JSON.stringify({
                postId: postResult.postId,
                title: postTitle,
                link: postResult.link,
                status: postResult.status,
                scheduledDate: scheduledDate.toISOString(),
                endpoint: entityEndpoint,
                sitemapType: sitemapType,
                siteName: site.name,
                siteUrl: site.siteUrl,
              }, null, 2),
              mimeType: 'application/json',
              status: 'completed',
              timestamp,
              rowData: row,
            };

            fileManager.addFile(wordPressPostFile);
            generatedFiles.push(wordPressPostFile);

            options.onProgress?.(rowIndex, 0, `WordPress post created on ${site.name}: ${postResult.postId} (scheduled for ${formatWordPressDate(scheduledDate)})`);
            options.onAppendHistory?.({
              ts: Date.now(),
              entityOrTitle: enrichedRow.entity?.trim() || enrichedRow.title || undefined,
              site: site.name,
              step: 'upload',
              message: `Post created on ${site.name}: ID ${postResult.postId}${acfUpdatedList?.length ? `, ACF updated: ${acfUpdatedList.join(', ')}` : ''}`,
              outcome: 'ok',
              postId: postResult.postId,
              permalink: postResult.link,
              acfUpdated: acfUpdatedList,
              mode: sitemapType,
            });
          } else {
            throw new Error(postResult.error || `WordPress post creation failed on ${site.name}`);
          }
        } catch (error) {
          console.error(`WordPress upload error for ${site.name}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          options.onError?.(rowIndex, new Error(`WordPress upload failed on ${site.name}: ${errorMessage}`));
          options.onAppendHistory?.({
            ts: Date.now(),
            entityOrTitle: enrichedRow.entity?.trim() || enrichedRow.title || undefined,
            site: site.name,
            step: 'upload',
            message: `Upload failed on ${site.name}: ${errorMessage}`,
            outcome: 'fail',
            error: errorMessage,
            mode: sitemapType,
          });
          // Continue with other sites even if one fails
        }
      }
    }
return generatedFiles;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate blueprint: ${errorMessage}`);
  }
}
