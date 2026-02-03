import type { AgentConfig } from '@/components/AgentNode';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import { streamChatCompletion } from '../api';

/**
 * Generate full markdown blog content from blueprint
 */
export async function generateMarkdownContent(
  blueprint: { title?: string; purpose?: string; agents: AgentConfig[] },
  row: CSVRow,
  keywordData: KeywordData,
  knowledgeFiles: Array<{ name: string; content: string }>,
  activeKnowledgeBaseText: string,
  options: BulkProcessingOptions,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  siteSummary?: string
): Promise<string> {
  // Import the generation utilities
  const { buildSystemPrompt, buildUserPrompt, generateSectionsPrompt } = await import('../prompt-builders');
  const { streamGeneration } = await import('../api');

  // CRITICAL: Do NOT send knowledge base content - only send the blueprint structure
  // The blueprint already contains all necessary information in agent descriptions and features
  // This prevents "Request too large" errors from OpenRouter
  const knowledgeBaseContext = "";

  // Generate sections prompt from agents (this is the blueprint structure)
  const sectionsPrompt = generateSectionsPrompt(blueprint.agents);

  // Extract entity from row (if present)
  // If entity is "N/A" or empty, this is a regular blog post
  const entity = row.entity && row.entity.trim() && row.entity.trim() !== "N/A" 
    ? row.entity.trim() 
    : undefined;

  // Build prompts WITHOUT knowledge base context - only blueprint structure
  // Pass entity to differentiate between entity-based and regular blog posts
  // Extract ACF fields from row for prompt generation
  const acfFields = {
    prompt_modifier: row.prompt_modifier,
    keyword_focus: row.keyword_focus,
    service_area_fields: row.service_area_fields,
  };
  
  const systemPrompt = buildSystemPrompt(knowledgeBaseContext, options.openRouterApiKey, connectedSite, wordPressPosts, undefined, entity, undefined, undefined, undefined, siteSummary);
  const userPrompt = buildUserPrompt(
    blueprint.title || row.title,
    blueprint.purpose || `Comprehensive guide about ${keywordData.keyword}`,
    sectionsPrompt,
    connectedSite,
    entity, // Pass entity (or undefined for regular blog posts)
    acfFields // Pass ACF fields for prompt enhancement
  );

  // Stream generation
  let fullContent = '';
  try {
    // Clamp maxTokens to reasonable value (OpenRouter has limits)
    // 5000000 is way too high - use 16000 max which is the API limit
    const safeMaxTokens = Math.min(options.maxTokens || 16000, 16000);
    
    await streamGeneration({
      apiKey: options.openRouterApiKey,
      model: options.selectedModel || getResearchModel(),
      systemPrompt,
      userPrompt,
      temperature: options.temperature || 1.0,
      maxTokens: safeMaxTokens,
      topP: options.topP || 0.9,
      onContentChunk: (chunk) => {
        fullContent += chunk;
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for common OpenRouter errors
    if (errorMessage.includes('400')) {
      if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Invalid API key')) {
        throw new Error(`OpenRouter API key is invalid or expired. Please check your API key in settings.`);
      }
      if (errorMessage.includes('model') || errorMessage.includes('not found')) {
        throw new Error(`Model "${options.selectedModel || getResearchModel()}" is not available. Please try a different model.`);
      }
      if (errorMessage.includes('rate_limit') || errorMessage.includes('quota')) {
        throw new Error(`OpenRouter rate limit or quota exceeded. Please check your account credits.`);
      }
      if (errorMessage.includes('too large') || errorMessage.includes('token')) {
        throw new Error(`Request too large. The prompt or context is exceeding OpenRouter limits. Try reducing the knowledge base content.`);
      }
    }
    
    throw new Error(`Markdown generation stream failed: ${errorMessage}`);
  }

  // Validate that we got actual content
  if (!fullContent || fullContent.trim().length === 0) {
    throw new Error('Markdown generation returned empty content - stream completed but no content was generated');
  }

  // Ensure minimum content length (at least a few sentences)
  if (fullContent.trim().length < 100) {
    throw new Error(`Markdown generation returned insufficient content (only ${fullContent.trim().length} characters). Expected at least 100 characters.`);
  }

  return fullContent;
}

/**
 * Add entity Wikipedia links and "We Care About" sections to markdown content
 */
export async function addEntityLinksToContent(
  markdownContent: string,
  row: { entity?: string },
  rowIndex: number,
  knowledgeFiles: Array<{ name: string; content: string }>,
  options: BulkProcessingOptions,
  onProgress?: (rowIndex: number, totalRows: number, status: string) => void
): Promise<string> {
  // Add entity Wikipedia link and local links if entity exists
  if (row.entity && row.entity.trim()) {
    try {
      // Find Wikipedia URL from knowledge files
      const wikipediaFile = knowledgeFiles.find(file => 
        file.name.toLowerCase().includes('wikipedia') && 
        file.name.toLowerCase().includes(row.entity!.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'))
      );
      
      let wikipediaUrl: string | undefined;
      let localLinks: Array<{ text: string; url: string }> = [];
      
      // Extract Wikipedia URL from knowledge files or fetch it
      if (wikipediaFile) {
        // Try to extract URL from CSV content
        const urlMatch = wikipediaFile.content.match(/https?:\/\/en\.wikipedia\.org\/wiki\/[^\s,]+/);
        if (urlMatch) {
          wikipediaUrl = urlMatch[0];
        }
      }
      
      // If no URL found, try to get it from checkWikipediaPageExists
      if (!wikipediaUrl) {
        const { checkWikipediaPageExists } = await import('../wikipedia-api');
        const wikiCheck = await checkWikipediaPageExists(row.entity.trim());
        if (wikiCheck.exists && wikiCheck.url) {
          wikipediaUrl = wikiCheck.url;
        }
      }
      
      // Extract local links from Wikipedia content using Wikipedia API
      if (wikipediaUrl && row.entity) {
        try {
          const { getLinksFromWikipediaPage, checkWikipediaPageExists } = await import('../wikipedia-api');
          
          // First verify the entity page exists
          const entityCheck = await checkWikipediaPageExists(row.entity.trim());
          if (!entityCheck.exists) {
            console.warn(`[Bulk Generator] Entity "${row.entity}" does not exist on Wikipedia, skipping link extraction`);
          } else {
            // Get links from the Wikipedia page for the entity (with retry)
            let linkedEntities: string[] = [];
            let retries = 3;
            while (retries > 0) {
              try {
                linkedEntities = await getLinksFromWikipediaPage(row.entity.trim(), { 
                  limit: 100,
                  filterNamespaces: true 
                });
                break; // Success
              } catch (error) {
                retries--;
                if (retries === 0) {
                  console.warn(`[Bulk Generator] Failed to get links from Wikipedia after retries:`, error);
                  throw error;
                }
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
              }
            }
            
            // Filter and validate entities to get local/related links
            // Prioritize geographic entities (cities, neighborhoods, districts, etc.)
            const geographicKeywords = ['city', 'town', 'neighborhood', 'district', 'county', 'area', 'region', 'beach', 'island', 'park'];
            const relevantEntities = linkedEntities
              .filter(entity => {
                const lower = entity.toLowerCase();
                // Exclude the main entity itself
                if (lower === row.entity!.toLowerCase()) return false;
                // Filter out very short or very long names
                if (entity.length < 3 || entity.length > 50) return false;
                // Prioritize entities that might be geographic (optional - don't filter too strictly)
                return true;
              })
              .slice(0, 10); // Limit to 10 potential links
            
            // Verify and create links for relevant entities (batch check for efficiency)
            const { validateEntitiesExist } = await import('../wikipedia-api');
            const validationResults = await validateEntitiesExist(relevantEntities);
            
            for (const result of validationResults) {
              if (result.exists && result.url) {
                localLinks.push({
                  text: result.entity,
                  url: result.url,
                });
                // Limit to 5 links max
                if (localLinks.length >= 5) break;
              }
            }
          }
        } catch (error) {
          console.warn('[Bulk Generator] Error extracting local links from Wikipedia:', error);
          // Continue without local links - don't fail the entire generation
        }
      }
      
      // Add entity link to markdown content (in introduction or first paragraph only, NOT in headers)
      if (wikipediaUrl) {
        const entityLink = `[${row.entity}](${wikipediaUrl})`;
        const entityEscaped = row.entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Find the first paragraph (content before first ## heading, excluding # title)
        // Match everything from start until first ## heading or end of first paragraph block
        const firstParagraphMatch = markdownContent.match(/^(?:#+\s+[^\n]+\n+)?([^#]+?)(?=\n##|\n#\s|$)/s);
        
        if (firstParagraphMatch) {
          let firstParagraph = firstParagraphMatch[1];
          
          // Check if entity exists in first paragraph (not in headers)
          const entityRegex = new RegExp(`\\b${entityEscaped}\\b`, 'i');
          const entityInParagraph = entityRegex.test(firstParagraph);
          
          if (entityInParagraph) {
            // Replace first occurrence of entity in first paragraph with linked version
            firstParagraph = firstParagraph.replace(entityRegex, entityLink);
          } else {
            // Entity not found in first paragraph, add it as a notable location
            firstParagraph = firstParagraph.trim() + ` ${entityLink} is a notable location.`;
          }
          
          // Replace the first paragraph in the markdown content
          markdownContent = markdownContent.replace(
            /^(?:#+\s+[^\n]+\n+)?([^#]+?)(?=\n##|\n#\s|$)/s,
            (match, p1) => {
              const titleMatch = match.match(/^(#+\s+[^\n]+\n+)/);
              return (titleMatch ? titleMatch[1] : '') + firstParagraph;
            }
          );
        } else {
          // Fallback: If no paragraph structure found, add entity link at the beginning
          markdownContent = `${entityLink} is a notable location.\n\n${markdownContent}`;
        }
        
        // Note: "We Care About [Entity]" section is already generated by the blueprint
        // (via blog-template-builder.ts), so we don't need to add it here
        onProgress?.(rowIndex, 0, `Added Wikipedia links for ${row.entity}${localLinks.length > 0 ? ` with ${localLinks.length} knowledge graph entity links` : ''}`);
      }
    } catch (error) {
      console.error('Error adding Wikipedia links:', error);
      // Continue without links - don't fail the entire generation
    }
  }

  return markdownContent;
}

