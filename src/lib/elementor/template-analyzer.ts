/**
 * AI-powered analysis of template files
 */

import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CustomizationConfig, CustomizationField, TemplateFile, AnalysisResult, FieldType } from "@/components/generator/elementor/types";
import { grepUrls, grepEmails, grepPhones, grepColors } from "./template-grep";
import { findColorsInFiles } from "./template-color-replacer";
import { extractWordPressStructure } from "./template-xml-parser";
import { hybridAnalyzeTemplate } from "./hybrid-grep-analyzer";

/**
 * Build system prompt for template analysis
 */
export function buildTemplateAnalysisSystemPrompt(config: CustomizationConfig, manifest?: any, siteSettings?: any): string {
  const addressParts = [
    config.address,
    config.city,
    config.stateProvince,
    config.postalCode,
    config.country,
  ].filter(Boolean).join(', ');

  return `You are analyzing an Elementor WordPress template for customization. 
Identify all fields that need to be updated for a new client.

CONFIGURATION PROVIDED:
- New Site URL: ${config.siteUrl}
- New Business Name: ${config.businessName}
- New Email: ${config.email}
- New Phone: ${config.phone}
${config.address ? `- New Address: ${config.address}` : ''}
${config.city ? `- City: ${config.city}` : ''}
${config.stateProvince ? `- State/Province: ${config.stateProvince}` : ''}
${config.postalCode ? `- Postal Code: ${config.postalCode}` : ''}
${config.country ? `- Country: ${config.country}` : ''}
${addressParts ? `- Full Address: ${addressParts}` : ''}
- Primary Color: ${config.primaryColor}
- Secondary Color: ${config.secondaryColor}
- Accent Color: ${config.accentColor}
${config.backgroundColor ? `- Background Color: ${config.backgroundColor}` : ''}
${config.textColor ? `- Text Color: ${config.textColor}` : ''}
${manifest ? `\nTEMPLATE MANIFEST DATA:\n${JSON.stringify(manifest, null, 2)}` : ''}
${siteSettings ? `\nTEMPLATE SITE SETTINGS:\n${JSON.stringify(siteSettings, null, 2)}` : ''}

Your task is to:
1. Identify all fields that need to be updated:
   - Site URLs (base URLs, image URLs, etc.) → replace with ${config.siteUrl}
   - Business/company names → replace with ${config.businessName}
   - Contact information (emails, phones) → replace with provided values
   - Location names → replace with ${config.address || 'provided address'}
   - Brand colors → replace with provided colors
   - Any other client-specific content

2. Return a structured JSON array with the following format for each field:
{
  "field": "Field name (e.g., 'Site Base URL', 'Business Name')",
  "currentValue": "The current value found in the template",
  "suggestedValue": "The new value from configuration",
  "fieldType": "url|text|email|phone|color|other",
  "context": "Brief description of where this field appears",
  "description": "Additional context about this field"
}

3. Be thorough - identify ALL instances that need updating, not just the first one.

4. For colors, identify all color formats (hex, RGB, RGBA, HSL, CSS names) that should be replaced.

5. Return ONLY valid JSON array, no additional text or markdown formatting.`;
}

/**
 * Build user prompt with template content
 */
export function buildTemplateAnalysisUserPrompt(
  files: TemplateFile[],
  config: CustomizationConfig,
  manifest?: any,
  siteSettings?: any
): string {
  // Extract key information from files
  const fileSummaries = files.map(file => ({
    path: file.path,
    type: file.type,
    size: file.size,
    preview: file.content.substring(0, 500) + (file.content.length > 500 ? '...' : ''),
  }));

  // Get WordPress structure if XML
  const xmlFiles = files.filter(f => f.type === 'xml');
  let wpStructure = '';
  if (xmlFiles.length > 0) {
    try {
      const structure = extractWordPressStructure(xmlFiles[0].content);
      wpStructure = `\nWordPress Structure Detected:
- Title: ${structure.title || 'N/A'}
- Link: ${structure.link || 'N/A'}
- Authors: ${structure.authors.length}
- Items: ${structure.items.length}`;
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // Get pattern matches
  const urlMatches = grepUrls(files);
  const emailMatches = grepEmails(files);
  const phoneMatches = grepPhones(files);
  const colorMatches = findColorsInFiles(files);

  return `Analyze this Elementor template and identify customizable fields:

CONFIGURATION:
- Site URL: ${config.siteUrl}
- Business Name: ${config.businessName}
- Email: ${config.email}
- Phone: ${config.phone}
${config.address ? `- Address: ${config.address}` : ''}
${config.city ? `- City: ${config.city}` : ''}
${config.stateProvince ? `- State/Province: ${config.stateProvince}` : ''}
${config.postalCode ? `- Postal Code: ${config.postalCode}` : ''}
${config.country ? `- Country: ${config.country}` : ''}
- Colors: Primary=${config.primaryColor}, Secondary=${config.secondaryColor}, Accent=${config.accentColor}
${config.backgroundColor ? `, Background=${config.backgroundColor}` : ''}
${config.textColor ? `, Text=${config.textColor}` : ''}

${config.promptModifier ? `ADDITIONAL INSTRUCTIONS:\n${config.promptModifier}\n` : ''}

TEMPLATE FILES SUMMARY:
${fileSummaries.map(f => `- ${f.path} (${f.type}, ${f.size} bytes)`).join('\n')}
${wpStructure}

PATTERN MATCHES FOUND:
- URLs: ${urlMatches.length} instances
- Emails: ${emailMatches.length} instances
- Phones: ${phoneMatches.length} instances
- Colors: ${colorMatches.length} instances

Focus on:
1. Site URLs that need updating → use ${config.siteUrl}
2. Business names → use ${config.businessName}
3. Contact information → use provided email/phone
4. Color values → replace with provided brand colors
5. Any other customizations mentioned in additional instructions
6. Any hardcoded client-specific content

Return a JSON array of customizable fields in the exact format specified in the system prompt.`;
}

/**
 * Parse AI response into CustomizationField array
 */
function parseAnalysisResponse(
  response: string,
  files: TemplateFile[]
): CustomizationField[] {
  try {
    // Try to extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to find JSON array
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    const fields: CustomizationField[] = [];
    
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      
      // Find which file contains this value
      let filePath = files[0]?.path || '';
      let lineNumber: number | undefined;
      
      // Try to find the file containing this value
      for (const file of files) {
        const lines = file.content.split('\n');
        for (let j = 0; j < lines.length; j++) {
          if (lines[j].includes(item.currentValue)) {
            filePath = file.path;
            lineNumber = j + 1;
            break;
          }
        }
        if (lineNumber) break;
      }
      
      // Mark wp-content files as read-only
      const isReadOnly = filePath.includes('wp-content/');

      fields.push({
        id: `field-${i}-${Date.now()}`,
        field: item.field || 'Unknown Field',
        currentValue: item.currentValue || '',
        suggestedValue: item.suggestedValue || item.currentValue || '',
        filePath,
        lineNumber,
        fieldType: (item.fieldType || 'other') as FieldType,
        context: item.context,
        description: item.description,
        approved: false,
        readOnly: isReadOnly,
      });
    }
    
    return fields;
  } catch (error) {
    console.error('Error parsing analysis response:', error);
    // Fallback: create fields from pattern matches
    return createFieldsFromPatterns(files);
  }
}

/**
 * Create fields from pattern matches (fallback)
 */
function createFieldsFromPatterns(files: TemplateFile[]): CustomizationField[] {
  const fields: CustomizationField[] = [];
  let fieldId = 0;

  // Add URL fields
  const urlMatches = grepUrls(files);
  const uniqueUrls = new Set<string>();
  for (const match of urlMatches) {
    const url = match.matches[0]?.[0];
    if (url && !uniqueUrls.has(url)) {
      uniqueUrls.add(url);
      fields.push({
        id: `field-${fieldId++}`,
        field: 'Site URL',
        currentValue: url,
        suggestedValue: '', // Will be filled from config
        filePath: match.filePath,
        lineNumber: match.lineNumber,
        fieldType: 'url',
        context: match.line,
        approved: false,
      });
    }
  }

  // Add email fields
  const emailMatches = grepEmails(files);
  const uniqueEmails = new Set<string>();
  for (const match of emailMatches) {
    const email = match.matches[0]?.[0];
    if (email && !uniqueEmails.has(email)) {
      uniqueEmails.add(email);
      fields.push({
        id: `field-${fieldId++}`,
        field: 'Email Address',
        currentValue: email,
        suggestedValue: '', // Will be filled from config
        filePath: match.filePath,
        lineNumber: match.lineNumber,
        fieldType: 'email',
        context: match.line,
        approved: false,
      });
    }
  }

  // Add phone fields
  const phoneMatches = grepPhones(files);
  const uniquePhones = new Set<string>();
  for (const match of phoneMatches) {
    const phone = match.matches[0]?.[0];
    if (phone && !uniquePhones.has(phone)) {
      uniquePhones.add(phone);
      fields.push({
        id: `field-${fieldId++}`,
        field: 'Phone Number',
        currentValue: phone,
        suggestedValue: '', // Will be filled from config
        filePath: match.filePath,
        lineNumber: match.lineNumber,
        fieldType: 'phone',
        context: match.line,
        approved: false,
      });
    }
  }

  return fields;
}

/**
 * Pre-fill suggested values from configuration
 */
function prefillSuggestions(
  fields: CustomizationField[],
  config: CustomizationConfig
): CustomizationField[] {
  return fields.map(field => {
    let suggestedValue = field.suggestedValue;
    
    // Pre-fill based on field type
    switch (field.fieldType) {
      case 'url':
        if (!suggestedValue || suggestedValue === field.currentValue) {
          suggestedValue = config.siteUrl;
        }
        break;
      case 'email':
        if (!suggestedValue || suggestedValue === field.currentValue) {
          suggestedValue = config.email;
        }
        break;
      case 'phone':
        if (!suggestedValue || suggestedValue === field.currentValue) {
          suggestedValue = config.phone;
        }
        break;
      case 'color':
        // Try to match color to brand colors (simplified - would need color matching logic)
        if (!suggestedValue || suggestedValue === field.currentValue) {
          suggestedValue = config.primaryColor;
        }
        break;
      case 'text':
        // Check if it might be a business name
        if (field.field.toLowerCase().includes('business') || 
            field.field.toLowerCase().includes('company') ||
            field.field.toLowerCase().includes('name')) {
          if (!suggestedValue || suggestedValue === field.currentValue) {
            suggestedValue = config.businessName;
          }
        }
        break;
    }
    
    return {
      ...field,
      suggestedValue,
    };
  });
}

/**
 * Analyze template files using AI
 */
export async function analyzeTemplate(
  files: TemplateFile[],
  config: CustomizationConfig,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    onProgress?: (message: string) => void;
    manifest?: any;
    siteSettings?: any;
  }
): Promise<AnalysisResult> {
  const {
    apiKey,
    model,
    temperature = 0.7,
    maxTokens = 4000,
    topP = 0.9,
    onProgress,
    manifest,
    siteSettings,
  } = options;

  onProgress?.('Using hybrid grep approach (regex + AI)...');
  
  // Use hybrid analyzer: Phase 1 (regex) + Phase 2 (AI on matches only)
  let fields = await hybridAnalyzeTemplate(files, config, {
    apiKey,
    model: model || getResearchModel(),
    manifest,
    siteSettings,
    onProgress,
  });
  
  // Pre-fill suggestions from configuration (ensure all have proper values)
  fields = prefillSuggestions(fields, config);

  // Calculate summary
  const fieldTypes: Record<FieldType, number> = {
    url: 0,
    text: 0,
    email: 0,
    phone: 0,
    color: 0,
    other: 0,
  };

  for (const field of fields) {
    fieldTypes[field.fieldType] = (fieldTypes[field.fieldType] || 0) + 1;
  }

  return {
    fields,
    files,
    summary: {
      totalFields: fields.length,
      totalFiles: files.length,
      fieldTypes,
    },
  };
}
