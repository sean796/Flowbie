/**
 * WordPress Update Strategy Generator
 * Creates a strategy plan for updates without executing them
 */

import type { WordPressCustomizationField, WordPressFieldGroup, WordPressUpdateStrategy } from "@/components/generator/elementor/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { CustomizationConfig } from "@/components/generator/elementor/types";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

/**
 * Generate update strategy from fields
 */
export function generateUpdateStrategy(
  fields: WordPressCustomizationField[],
  site: WordPressSite,
  config: CustomizationConfig
): WordPressUpdateStrategy {
  // Group fields by current value to create field groups
  const fieldGroupsMap = new Map<string, WordPressFieldGroup>();

  for (const field of fields) {
    const key = `${field.fieldType}:${field.currentValue}`;
    
    if (!fieldGroupsMap.has(key)) {
      fieldGroupsMap.set(key, {
        field: field.field,
        currentValue: field.currentValue,
        suggestedValue: field.suggestedValue,
        affectedPosts: [],
        occurrenceCount: 0,
      });
    }

    const group = fieldGroupsMap.get(key)!;
    
    // Add this post to affected posts if not already present
    const postExists = group.affectedPosts.some(p => p.postId === field.location.postId);
    if (!postExists) {
      group.affectedPosts.push({
        postId: field.location.postId,
        postType: field.location.postType,
        postTitle: field.location.postTitle,
        postLink: field.location.postLink,
      });
    }
    
    group.occurrenceCount = Math.max(group.occurrenceCount, field.occurrenceCount);
  }

  const fieldGroups = Array.from(fieldGroupsMap.values());

  // Calculate estimated changes
  const estimatedChanges = fieldGroups.reduce((sum, group) => sum + group.occurrenceCount, 0);

  // Collect unique post IDs
  const uniquePostIds = new Set<number>();
  for (const group of fieldGroups) {
    for (const post of group.affectedPosts) {
      uniquePostIds.add(post.postId);
    }
  }

  // Generate warnings
  const warnings: string[] = [];
  
  if (estimatedChanges > 1000) {
    warnings.push(`Large number of changes detected (${estimatedChanges}). Consider reviewing in batches.`);
  }

  const acfFields = fields.filter(f => f.location.fieldSource === 'acf');
  // Only warn if we have fields but none are ACF - if we have no fields at all, that's a different issue
  if (fields.length > 0 && acfFields.length === 0) {
    warnings.push('No ACF fields detected in the identified fields. Fields were found in post content/excerpt instead. If you expected ACF fields, ensure ACF REST API is properly configured.');
  }

  const contentFields = fields.filter(f => f.location.fieldSource === 'content' || f.location.fieldSource === 'title');
  if (contentFields.length > 0) {
    warnings.push(`${contentFields.length} fields found in post content. These may require manual review as they could affect formatting.`);
  }

  return {
    site: {
      id: site.id,
      name: site.name,
      siteUrl: site.siteUrl,
    },
    totalFields: fields.length,
    totalPosts: uniquePostIds.size,
    fieldGroups,
    estimatedChanges,
    warnings,
    ready: fields.length > 0 && warnings.length === 0,
  };
}

/**
 * Validate strategy before execution
 */
export function validateStrategy(strategy: WordPressUpdateStrategy): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (strategy.totalFields === 0) {
    errors.push('No fields to update');
  }

  if (strategy.totalPosts === 0) {
    errors.push('No posts affected');
  }

  if (strategy.fieldGroups.length === 0) {
    errors.push('No field groups generated');
  }

  // Check for empty suggested values
  for (const group of strategy.fieldGroups) {
    if (!group.suggestedValue || group.suggestedValue.trim() === '') {
      errors.push(`Field "${group.field}" has no suggested value`);
    }
  }

  // Check for duplicate field groups
  const fieldNames = strategy.fieldGroups.map(g => g.field);
  const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate field names detected: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Add strategy warnings
  warnings.push(...strategy.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function isSocialField(field: WordPressCustomizationField): 'facebook' | 'instagram' | 'linkedin' | null {
  const n = (field.field || '').toLowerCase();
  const a = (field.location?.acfFieldName || '').toLowerCase();
  if (n.includes('facebook') || a.includes('facebook')) return 'facebook';
  if (n.includes('instagram') || a.includes('instagram')) return 'instagram';
  if (n.includes('linkedin') || a.includes('linkedin')) return 'linkedin';
  return null;
}

/**
 * Pre-fill suggested values - minimal pass-through
 * All substantive matching is done by intelligentlyMatchFieldsWithAI
 */
export function prefillSuggestions(
  fields: WordPressCustomizationField[],
  config: CustomizationConfig
): WordPressCustomizationField[] {
  return fields.map(field => ({
    ...field,
    suggestedValue: field.suggestedValue || field.currentValue,
  }));
}

/**
 * Format phone number for tel: link (remove all non-digits)
 */
function formatPhoneForTelLink(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  return `tel:${digitsOnly}`;
}

/**
 * Format address for Google Maps URL
 */
function formatAddressForGoogleMaps(address: string, city?: string, state?: string, postalCode?: string, country?: string): string {
  const parts = [address];
  if (city && city !== 'N/A') parts.push(city);
  if (state && state !== 'N/A') parts.push(state);
  if (postalCode && postalCode !== 'N/A') parts.push(postalCode);
  if (country && country !== 'N/A') parts.push(country);
  const fullAddress = parts.filter(p => p && p.trim()).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
}

/**
 * Use AI to intelligently match ACF fields to company data
 * Analyzes field names, descriptions, and context to determine the best match
 */
export async function intelligentlyMatchFieldsWithAI(
  fields: WordPressCustomizationField[],
  config: CustomizationConfig,
  apiKey?: string,
  model?: string,
  onProgress?: (message: string) => void
): Promise<WordPressCustomizationField[]> {
  // #region agent log
  fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:225',message:'intelligentlyMatchFieldsWithAI entry',data:{fieldsCount:fields.length,config,configHasBusinessName:!!config.businessName,configHasEmail:!!config.email,configHasPhone:!!config.phone,hasApiKey:!!apiKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  const openRouterApiKey = apiKey || loadApiKey();
  if (!openRouterApiKey) {
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:230',message:'AI matching SKIPPED - no API key',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    console.warn('[AI Field Matching] No API key - skipping intelligent matching');
    return fields;
  }

  const hasCompanyData = config.businessName || config.email || config.phone || config.siteUrl || config.address;
  if (!hasCompanyData) {
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:237',message:'AI matching SKIPPED - no company data',data:{config},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    console.log('[AI Field Matching] No company data available - skipping intelligent matching');
    return fields;
  }

  onProgress?.('Using AI to intelligently match fields to company data...');
  // #region agent log
  fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:243',message:'AI matching proceeding',data:{fieldsCount:fields.length,sampleFields:fields.slice(0,3).map(f=>({field:f.field,currentSuggestion:f.suggestedValue}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  try {
    // Build field descriptions for AI
    const fieldsList = fields.map((field, idx) => {
      const fieldInfo = [
        `${idx + 1}. Field: "${field.field}"`,
        `   Type: ${field.fieldType}`,
        `   ACF Field Name: ${field.location.acfFieldName || 'N/A'}`,
        `   Current Value: "${field.currentValue}"`,
        `   Current Suggestion: "${field.suggestedValue || 'N/A'}"`,
      ];
      if (field.description) {
        fieldInfo.push(`   Description: ${field.description}`);
      }
      if (field.context) {
        fieldInfo.push(`   Context: ${field.context.substring(0, 100)}`);
      }
      return fieldInfo.join('\n');
    }).join('\n\n');

    // Extract company-related data from config (exclude UI/branding keys)
    const { primaryColor, secondaryColor, accentColor, backgroundColor, textColor, promptModifier, ...companyData } = config;

    const prompt = `You have company data (JSON) and a list of form/ACF fields. For each field, choose the best matching value from the company data, or use KEEP_CURRENT / NO_MATCH. Return a JSON array of { fieldNumber, matchedValue }.

Rules:
- Never use placeholder text like [New X], [New Facebook Profile URL], [New Instagram Profile URL], [New LinkedIn Profile URL], [New Dark Logo URL], [New Map Link], YOUR_NEW_GOOGLE_MAPS_LINK, or any [bracketed] placeholder. Use KEEP_CURRENT when no matching value exists.
- For social (Facebook, Instagram, LinkedIn) fields: If company data has the corresponding social link (facebook, instagram, linkedin), use it. Only use real URLs that start with http:// or https://. Never use placeholders. If no real URL exists, use KEEP_CURRENT.
- For Google Maps link fields: If company data has "googleMapsLink", use it (this should be the SERP page URL or a valid Google Maps URL). Never use placeholders like "YOUR_NEW_GOOGLE_MAPS_LINK" or "[New Map Link]". If no valid URL exists, use KEEP_CURRENT.

COMPANY DATA:
${JSON.stringify(companyData, null, 2)}

FIELDS TO MATCH:
${fieldsList}

Return ONLY valid JSON array, no markdown, no explanations.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model: model || getResearchModel(),
        messages: [
          {
            role: "system",
            content: "You are an expert at matching WordPress ACF fields to company data. Return ONLY valid JSON arrays, no markdown, no explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Field Matching] API error:', errorText);
      return fields;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    // Parse JSON response
    let matches: Array<{ fieldNumber: number; matchedValue: string }> = [];
    try {
      // Remove markdown code blocks if present
      let jsonContent = content;
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      }
      matches = JSON.parse(jsonContent);
      // #region agent log
      const placeholderRegex1 = /\[New[^\]]*\]/i;
      const placeholderRegex2 = /\[.*Logo.*URL\]/i;
      const placeholderRegex3 = /YOUR_NEW_/i;
      const allMatches = matches.map((m: any) => ({
        field: m.fieldNumber,
        value: m.matchedValue,
        isPlaceholder: placeholderRegex1.test(m.matchedValue) || placeholderRegex2.test(m.matchedValue) || placeholderRegex3.test(m.matchedValue)
      }));
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:388',message:'AI response parsed successfully',data:{matchesCount:matches.length,sampleMatches:matches.slice(0,5),allMatches},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    } catch (parseError) {
      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:392',message:'AI response parse FAILED',data:{error:String(parseError),contentPreview:content.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      console.error('[AI Field Matching] Failed to parse AI response:', parseError);
      console.error('[AI Field Matching] Response content:', content.substring(0, 500));
      return fields;
    }

    const isPlaceholderLike = (v: string) =>
      /\[New[^\]]*\]/i.test(v) || /\[.*Profile URL\]/i.test(v) || /\[.*Logo.*URL\]/i.test(v) || /\[.*Map.*Link\]/i.test(v) || /YOUR_NEW_[A-Z_]+/i.test(v);

    // Apply matches to fields with intelligent formatting
    const updatedFields = fields.map((field, idx) => {
      const match = matches.find(m => m.fieldNumber === idx + 1);
      const raw = match?.matchedValue ?? '';
      const originalIsPlaceholder = isPlaceholderLike(field.suggestedValue || '');
      // #region agent log
      if (idx >= 10 || field.field.toLowerCase().includes('facebook') || field.field.toLowerCase().includes('instagram') || field.field.toLowerCase().includes('linkedin') || field.field.toLowerCase().includes('google') && field.field.toLowerCase().includes('map')) {
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:332',message:'Processing field',data:{fieldNumber:idx+1,fieldName:field.field,hasMatch:!!match,rawValue:raw,originalValue:field.suggestedValue,originalIsPlaceholder},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      }
      // #endregion
      
      // If AI returned a placeholder (but NOT if original had placeholder and AI has valid value), use KEEP_CURRENT
      if (match && isPlaceholderLike(raw) && raw !== 'KEEP_CURRENT' && raw !== 'NO_MATCH') {
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:327',message:'AI returned placeholder - using KEEP_CURRENT',data:{fieldNumber:idx+1,fieldName:field.field,aiValue:raw,originalValue:field.suggestedValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return {
          ...field,
          suggestedValue: 'KEEP_CURRENT',
        };
      }
      
      // If AI returned KEEP_CURRENT or NO_MATCH, respect it
      if (match && (raw === 'KEEP_CURRENT' || raw === 'NO_MATCH')) {
        return {
          ...field,
          suggestedValue: raw,
        };
      }
      
      // If AI returned a valid value (not placeholder, not KEEP_CURRENT/NO_MATCH), use it
      if (match && raw !== 'KEEP_CURRENT' && raw !== 'NO_MATCH' && !isPlaceholderLike(raw)) {
        let finalValue = match.matchedValue;
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:340',message:'Applying AI match to field',data:{fieldNumber:idx+1,fieldName:field.field,matchedValue:match.matchedValue,oldSuggestion:field.suggestedValue,fieldNameLower:field.field.toLowerCase(),isValidUrl:typeof match.matchedValue === 'string' && match.matchedValue.startsWith('http')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion

        // Apply intelligent formatting based on field type and name
        const fieldNameLower = field.field.toLowerCase();
        const acfNameLower = (field.location.acfFieldName || '').toLowerCase();
        
        // If AI returned a valid URL, prioritize it (especially for social links and maps)
        const isAiValidUrl = typeof match.matchedValue === 'string' && match.matchedValue.startsWith('http') && !isPlaceholderLike(match.matchedValue);

        // Social link formatting - if AI returned a valid URL, use it (prioritize AI over config for social links)
        if ((fieldNameLower.includes('facebook') || acfNameLower.includes('facebook')) && isAiValidUrl && match.matchedValue.includes('facebook.com')) {
          finalValue = match.matchedValue;
        } else if (fieldNameLower.includes('facebook') || acfNameLower.includes('facebook')) {
          if (config.facebook && typeof config.facebook === 'string' && config.facebook.startsWith('http')) {
            finalValue = config.facebook;
          }
        }
        
        if ((fieldNameLower.includes('instagram') || acfNameLower.includes('instagram')) && isAiValidUrl && match.matchedValue.includes('instagram.com')) {
          finalValue = match.matchedValue;
        } else if (fieldNameLower.includes('instagram') || acfNameLower.includes('instagram')) {
          if (config.instagram && typeof config.instagram === 'string' && config.instagram.startsWith('http')) {
            finalValue = config.instagram;
          }
        }
        
        if ((fieldNameLower.includes('linkedin') || acfNameLower.includes('linkedin')) && isAiValidUrl && match.matchedValue.includes('linkedin.com')) {
          finalValue = match.matchedValue;
        } else if (fieldNameLower.includes('linkedin') || acfNameLower.includes('linkedin')) {
          if (config.linkedin && typeof config.linkedin === 'string' && config.linkedin.startsWith('http')) {
            finalValue = config.linkedin;
          }
        }

        // Phone link formatting
        if ((fieldNameLower.includes('phone') && (fieldNameLower.includes('link') || fieldNameLower.includes('url'))) ||
            acfNameLower.includes('phone_link') || acfNameLower.includes('phone_url')) {
          if (config.phone && match.matchedValue === config.phone) {
            finalValue = formatPhoneForTelLink(config.phone);
          } else if (match.matchedValue.startsWith('tel:')) {
            // Already formatted
            finalValue = match.matchedValue;
          } else if (match.matchedValue === config.phone) {
            finalValue = formatPhoneForTelLink(config.phone);
          }
        }

        // Google Maps URL formatting - if AI returned a valid Google Maps/SERP URL, use it first
        if ((fieldNameLower.includes('google') && fieldNameLower.includes('map')) ||
            acfNameLower.includes('google_map') || acfNameLower.includes('maps') ||
            acfNameLower.includes('googlemapslink')) {
          // Prioritize AI's value if it's a valid Google Maps/SERP URL
          if (isAiValidUrl && (match.matchedValue.includes('google.com/search') || match.matchedValue.includes('google.com/maps'))) {
            finalValue = match.matchedValue;
          } else if ((config as any).googleMapsLink && typeof (config as any).googleMapsLink === 'string' && 
              (config as any).googleMapsLink.trim() && 
              !(config as any).googleMapsLink.includes('YOUR_NEW_GOOGLE_MAPS_LINK') &&
              !(config as any).googleMapsLink.includes('[New') &&
              !(config as any).googleMapsLink.includes('maps.app.goo.gl') && // Avoid broken Firebase links
              ((config as any).googleMapsLink.includes('google.com/search') || 
               (config as any).googleMapsLink.includes('google.com/maps'))) {
            finalValue = (config as any).googleMapsLink.trim();
          } else if (config.businessName) {
            // Generate SERP page URL (user-accessible search results page)
            const serpQuery = [config.businessName];
            if (config.city) serpQuery.push(config.city);
            if (config.stateProvince) serpQuery.push(config.stateProvince);
            const query = serpQuery.filter(p => p && p.trim() && p !== 'N/A').join(' ');
            if (query) {
              finalValue = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }
          } else if (config.address) {
            // Fallback to generating a search URL from address
            finalValue = formatAddressForGoogleMaps(
              config.address || '',
              config.city,
              config.stateProvince,
              config.postalCode,
              config.country
            );
          }
        }

        // Logo URL handling - if no logo URL in config, use KEEP_CURRENT instead of placeholder
        if ((fieldNameLower.includes('logo') && (fieldNameLower.includes('url') || fieldNameLower.includes('link'))) ||
            acfNameLower.includes('logo') || acfNameLower.includes('dark_logo')) {
          if (!(config as any).logoUrl && !(config as any).darkLogoUrl && !(config as any).logo && isPlaceholderLike(finalValue)) {
            finalValue = 'KEEP_CURRENT';
          } else if ((config as any).logoUrl && typeof (config as any).logoUrl === 'string' && (config as any).logoUrl.startsWith('http')) {
            finalValue = (config as any).logoUrl;
          } else if ((config as any).darkLogoUrl && typeof (config as any).darkLogoUrl === 'string' && (config as any).darkLogoUrl.startsWith('http')) {
            finalValue = (config as any).darkLogoUrl;
          } else if ((config as any).logo && typeof (config as any).logo === 'string' && (config as any).logo.startsWith('http')) {
            finalValue = (config as any).logo;
          } else if (isPlaceholderLike(finalValue)) {
            finalValue = 'KEEP_CURRENT';
          }
        }

        // Final check: if finalValue is still a placeholder, use KEEP_CURRENT
        if (isPlaceholderLike(finalValue)) {
          finalValue = 'KEEP_CURRENT';
        }

        // #region agent log
        if (idx < 3) fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:380',message:'Field updated with final value',data:{fieldNumber:idx+1,fieldName:field.field,finalValue,hasPlaceholder:finalValue?.includes('[')||finalValue?.includes('New')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return {
          ...field,
          suggestedValue: finalValue,
        };
      }
      
      // If no match from AI, keep original value (even if it's a placeholder - user can fix manually)
      return field;
    });

    onProgress?.('AI matching complete');
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'strategy-generator.ts:390',message:'AI matching complete - returning updated fields',data:{updatedFieldsCount:updatedFields.length,sampleUpdated:updatedFields.slice(0,5).map(f=>({field:f.field,suggestedValue:f.suggestedValue,hasPlaceholder:f.suggestedValue?.includes('[')||f.suggestedValue?.includes('New')}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    return updatedFields;
  } catch (error) {
    console.error('[AI Field Matching] Error:', error);
    return fields;
  }
}
