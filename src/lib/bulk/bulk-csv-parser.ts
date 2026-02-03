import Papa from 'papaparse';
import { parseTitleTemplate } from '../title-template-parser';

/**
 * CSV Row interface
 */
export interface CSVRow {
  keyword: string;
  entity?: string;
  title: string;
  modifier?: string;
  featuredImage?: string;
  // ACF fields
  date_modifier?: string;
  prompt_modifier?: string;
  keyword_focus?: string;
  service_area_fields?: string;
  origin?: string;
  faq?: string;
}

/**
 * Parse a list string (comma or newline-separated) into an array
 */
function parseListString(list: string): string[] {
  if (!list || !list.trim()) return [];
  return list
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parse AI-generated checklist into CSVRow[] format
 * @param checklistContent - The AI-generated checklist content
 * @param titleTemplate - Optional title template with variables like [Entity], [Keyword]
 * @param entityList - Optional comma/newline-separated list of entity values
 * @param keywordList - Optional comma/newline-separated list of keyword values
 * @param locationList - Optional comma/newline-separated list of location values
 * @param numberList - Optional comma/newline-separated list of number values
 */
export function parseBlogIdeasChecklist(
  checklistContent: string, 
  titleTemplate?: string,
  entityList?: string,
  keywordList?: string,
  locationList?: string,
  numberList?: string
): CSVRow[] {
  const rows: CSVRow[] = [];
  
  // Try multiple parsing strategies
  const lines = checklistContent.split('\n').filter(line => line.trim().length > 0);
  
  for (const line of lines) {
    // Skip non-checklist lines (headers, explanations, etc.)
    if (!line.match(/^\d+[\.\)]\s+/)) {
      continue;
    }
    
    // Remove numbering prefix
    const content = line.replace(/^\d+[\.\)]\s+/, '').trim();
    
    // Try to extract fields using regex patterns
    // Pattern 1: Keyword: "...", Entity: "...", Title: "...", Modifier: "...", FeaturedImage: "..."
    // Also extract ACF fields: DateModifier, PromptModifier, KeywordFocus, ServiceAreaFields, Origin, FAQ
    const keywordMatch = content.match(/Keyword:\s*"([^"]+)"/i);
    const entityMatch = content.match(/Entity:\s*"([^"]+)"/i);
    const titleMatch = content.match(/Title:\s*"([^"]+)"/i);
    const modifierMatch = content.match(/Modifier:\s*"([^"]+)"/i);
    const featuredImageMatch = content.match(/FeaturedImage:\s*"([^"]+)"|FeaturedImage:\s*([yn])/i);
    const dateModifierMatch = content.match(/DateModifier:\s*"([^"]+)"/i);
    const promptModifierMatch = content.match(/PromptModifier:\s*"([^"]+)"/i);
    const keywordFocusMatch = content.match(/KeywordFocus:\s*"([^"]+)"/i);
    const serviceAreaFieldsMatch = content.match(/ServiceAreaFields:\s*"([^"]+)"/i);
    const originMatch = content.match(/Origin:\s*"([^"]+)"/i);
    const faqMatch = content.match(/FAQ:\s*"([^"]+)"/i);
      
    if (keywordMatch && titleMatch) {
      const row: CSVRow = {
        keyword: keywordMatch[1].trim(),
        title: titleMatch[1].trim(),
      };
      
      // Entity is optional - can be blank
      if (entityMatch && entityMatch[1].trim().length > 0) {
        row.entity = entityMatch[1].trim();
      }
      
      if (modifierMatch) {
        row.modifier = modifierMatch[1].trim();
      }
      
      if (featuredImageMatch) {
        const value = (featuredImageMatch[1] || featuredImageMatch[2] || '').toLowerCase();
        if (value === 'y' || value === 'yes') {
          row.featuredImage = 'y';
        } else if (value === 'google-maps' || value === 'googlemaps' || value === 'google_maps') {
          row.featuredImage = 'google-maps';
        } else {
          row.featuredImage = 'n';
        }
      }
      
      // Extract ACF fields
      if (dateModifierMatch && dateModifierMatch[1].trim().length > 0) {
        row.date_modifier = dateModifierMatch[1].trim();
      }
      
      if (promptModifierMatch && promptModifierMatch[1].trim().length > 0) {
        row.prompt_modifier = promptModifierMatch[1].trim();
      }
      
      if (keywordFocusMatch && keywordFocusMatch[1].trim().length > 0) {
        row.keyword_focus = keywordFocusMatch[1].trim();
      }
      
      if (serviceAreaFieldsMatch && serviceAreaFieldsMatch[1].trim().length > 0) {
        row.service_area_fields = serviceAreaFieldsMatch[1].trim();
      }
      
      if (originMatch && originMatch[1].trim().length > 0) {
        row.origin = originMatch[1].trim();
      }
      
      if (faqMatch && faqMatch[1].trim().length > 0) {
        row.faq = faqMatch[1].trim();
      }
      
      rows.push(row);
    } else {
      // Fallback: Try to parse simpler formats
      // Pattern 2: Just extract quoted strings in order
      const quotedStrings = content.match(/"([^"]+)"/g);
      if (quotedStrings && quotedStrings.length >= 2) {
        const row: CSVRow = {
          keyword: quotedStrings[0].replace(/"/g, '').trim(),
          title: quotedStrings.length >= 3 ? quotedStrings[2].replace(/"/g, '').trim() : quotedStrings[1].replace(/"/g, '').trim(),
        };
        
        // Entity is optional - use second quoted string if available and not used as title
        if (quotedStrings.length >= 3 && quotedStrings[1].replace(/"/g, '').trim().length > 0) {
          row.entity = quotedStrings[1].replace(/"/g, '').trim();
        }
        
        if (quotedStrings.length >= 4) {
          row.modifier = quotedStrings[3].replace(/"/g, '').trim();
        }
        
        rows.push(row);
      }
    }
  }
  
  // Apply title template if provided
  if (titleTemplate && titleTemplate.trim()) {
    // Parse variable lists
    const entityValues = parseListString(entityList || '');
    const keywordValues = parseListString(keywordList || '');
    const locationValues = parseListString(locationList || '');
    const numberValues = parseListString(numberList || '');
    
    rows.forEach((row, index) => {
      // Get value from list (use index, or last value if list is shorter, or fallback to row value)
      const getListValue = (list: string[], fallback: string): string => {
        if (list.length > 0) {
          // Use index if available, otherwise use last value (repeats for remaining rows)
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
      
      // ALWAYS apply template - override AI-generated title
      const generatedTitle = parseTitleTemplate(titleTemplate, variables);
      if (generatedTitle && generatedTitle.trim()) {
        // Override the AI-generated title with template-generated title
        row.title = generatedTitle.trim();
        console.log(`[Title Template] Row ${index + 1}: Applied template "${titleTemplate}" with variables:`, variables, '→ Result:', row.title);
      } else {
        // If template parsing fails, log warning but keep AI title as fallback
        console.warn(`[Title Template] Failed to parse template for row ${index + 1}, keeping AI-generated title:`, row.title);
      }
    });
  }

  // Validate rows - ensure required fields are present (entity is optional)
  const validRows = rows.filter(row => {
    return row.keyword && row.keyword.trim().length > 0 &&
           row.title && row.title.trim().length > 0;
  });
  
  return validRows;
}

/**
 * Parse CSV file and extract rows
 */
export async function parseCSV(file: File): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: CSVRow[] = [];
        const errors: string[] = [];

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i] as any;
          
          // Validate required fields
          if (!row.keyword || !row.keyword.trim()) {
            errors.push(`Row ${i + 2}: Missing required field 'keyword'`);
            continue;
          }
          if (!row.title || !row.title.trim()) {
            errors.push(`Row ${i + 2}: Missing required field 'title'`);
            continue;
          }

          // Normalize featuredImage field (y/yes -> 'y', n/no -> 'n', google-maps/googlemaps -> 'google-maps', empty -> undefined)
          let featuredImage: string | undefined = undefined;
          if (row.featuredImage) {
            const normalized = row.featuredImage.trim().toLowerCase();
            if (normalized === 'y' || normalized === 'yes') {
              featuredImage = 'y';
            } else if (normalized === 'n' || normalized === 'no') {
              featuredImage = 'n';
            } else if (normalized === 'google-maps' || normalized === 'googlemaps' || normalized === 'google_maps') {
              featuredImage = 'google-maps';
            }
          }

          rows.push({
            keyword: row.keyword.trim(),
            entity: row.entity?.trim() || undefined,
            title: row.title.trim(),
            modifier: row.modifier?.trim() || undefined,
            featuredImage,
            // ACF fields
            date_modifier: row.date_modifier?.trim() || undefined,
            prompt_modifier: row.prompt_modifier?.trim() || undefined,
            keyword_focus: row.keyword_focus?.trim() || undefined,
            service_area_fields: row.service_area_fields?.trim() || undefined,
            origin: row.origin?.trim() || undefined,
            faq: row.faq?.trim() || undefined,
          });
        }

        if (errors.length > 0 && rows.length === 0) {
          reject(new Error(`CSV validation failed:\n${errors.join('\n')}`));
          return;
        }

        if (rows.length === 0) {
          reject(new Error('No valid rows found in CSV file'));
          return;
        }

        resolve(rows);
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}

