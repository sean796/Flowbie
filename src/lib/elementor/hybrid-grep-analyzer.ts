/**
 * Hybrid AI Grep Analyzer
 * Phase 1: Regex pattern matching (token-free)
 * Phase 2: AI analysis of matches (minimal tokens)
 */

import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CustomizationConfig, CustomizationField, TemplateFile, FieldType } from "@/components/generator/elementor/types";
import { grepUrls, grepEmails, grepPhones, grepColors, type GrepResult } from "./template-grep";
import { findColorsInFiles } from "./template-color-replacer";

export interface PatternMatch {
  type: 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text';
  value: string;
  filePath: string;
  lineNumber: number;
  line: string;
  contextBefore?: string;
  contextAfter?: string;
  normalizedValue?: string; // For grouping similar values
}

export interface GroupedMatch {
  type: 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text';
  value: string;
  normalizedValue: string;
  occurrences: PatternMatch[];
  suggestedFieldName?: string;
}

/**
 * Extract context lines around a match
 */
function extractContext(
  file: TemplateFile,
  lineNumber: number,
  contextLines: number = 2
): { before: string; after: string } {
  const lines = file.content.split('\n');
  const idx = lineNumber - 1; // Convert to 0-indexed

  const before = lines
    .slice(Math.max(0, idx - contextLines), idx)
    .join('\n');

  const after = lines
    .slice(idx + 1, Math.min(lines.length, idx + 1 + contextLines))
    .join('\n');

  return { before, after };
}

/**
 * Normalize URL for grouping (remove protocol, www, trailing slashes)
 */
function normalizeUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Normalize email for grouping
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalize phone for grouping (remove formatting)
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\(\)\-\+\.]/g, '');
}

/**
 * Normalize color for grouping
 */
function normalizeColor(color: string): string {
  const trimmed = color.trim().toLowerCase();
  // Remove # prefix and normalize hex
  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Normalize business name for grouping
 */
function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if URL is a generic/template URL that shouldn't be customized
 */
function isGenericUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  const genericDomains = [
    'wordpress.org',
    'wordpress.com',
    'elementor.com',
    'w.org',
    'schema.org',
    'w3.org',
    'googleapis.com',
    'gstatic.com',
    'fonts.googleapis.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'linkedin.com',
    'pinterest.com',
    'tumblr.com',
    'reddit.com',
    'github.com',
    'stackoverflow.com',
    'wikipedia.org',
  ];
  
  // Check if URL contains any generic domain
  for (const domain of genericDomains) {
    if (normalized.includes(domain)) {
      return true;
    }
  }
  
  // Exclude data URIs, mailto, tel, javascript:, etc.
  if (/^(data|mailto|tel|javascript|#):/i.test(url)) {
    return true;
  }
  
  // Exclude relative URLs that are just paths (not domain-specific)
  if (!/^https?:\/\//i.test(url) && !url.includes('.')) {
    return false; // Keep relative paths, they might be company-specific
  }
  
  return false;
}

/**
 * Check if file should be excluded from customization (template structure files)
 */
function isTemplateStructureFile(filePath: string): boolean {
  const excludedPatterns = [
    /wp-content\/themes\/[^\/]+\/style\.css/i,
    /wp-content\/themes\/[^\/]+\/functions\.php/i,
    /wp-content\/plugins\/[^\/]+\/.*\.php/i,
    /\.min\.(js|css)$/i,
    /vendor\//i,
    /node_modules\//i,
    /\.git\//i,
  ];
  
  return excludedPatterns.some(pattern => pattern.test(filePath));
}

/**
 * Phase 1: Find all patterns using regex (intelligent filtering)
 */
export function findAllPatterns(files: TemplateFile[]): PatternMatch[] {
  const matches: PatternMatch[] = [];

  // Find URLs (filter out generic ones)
  const urlMatches = grepUrls(files);
  for (const match of urlMatches) {
    // Skip template structure files
    if (isTemplateStructureFile(match.filePath)) {
      continue;
    }
    
    const file = files.find(f => f.path === match.filePath);
    if (file) {
      const context = extractContext(file, match.lineNumber);
      for (const urlMatch of match.matches) {
        if (urlMatch[0] && !isGenericUrl(urlMatch[0])) {
          matches.push({
            type: 'url',
            value: urlMatch[0],
            filePath: match.filePath,
            lineNumber: match.lineNumber,
            line: match.line,
            contextBefore: context.before,
            contextAfter: context.after,
            normalizedValue: normalizeUrl(urlMatch[0]),
          });
        }
      }
    }
  }

  // Find emails (filter out generic/noreply emails)
  const emailMatches = grepEmails(files);
  for (const match of emailMatches) {
    // Skip template structure files
    if (isTemplateStructureFile(match.filePath)) {
      continue;
    }
    
    const file = files.find(f => f.path === match.filePath);
    if (file) {
      const context = extractContext(file, match.lineNumber);
      for (const emailMatch of match.matches) {
        if (emailMatch[0]) {
          const email = emailMatch[0].toLowerCase();
          // Skip generic emails
          if (!email.includes('noreply@') && 
              !email.includes('no-reply@') && 
              !email.includes('wordpress@') &&
              !email.includes('admin@wordpress')) {
            matches.push({
              type: 'email',
              value: emailMatch[0],
              filePath: match.filePath,
              lineNumber: match.lineNumber,
              line: match.line,
              contextBefore: context.before,
              contextAfter: context.after,
              normalizedValue: normalizeEmail(emailMatch[0]),
            });
          }
        }
      }
    }
  }

  // Find phones
  const phoneMatches = grepPhones(files);
  for (const match of phoneMatches) {
    // Skip template structure files
    if (isTemplateStructureFile(match.filePath)) {
      continue;
    }
    
    const file = files.find(f => f.path === match.filePath);
    if (file) {
      const context = extractContext(file, match.lineNumber);
      for (const phoneMatch of match.matches) {
        if (phoneMatch[0] && phoneMatch[0].replace(/\D/g, '').length >= 10) {
          matches.push({
            type: 'phone',
            value: phoneMatch[0],
            filePath: match.filePath,
            lineNumber: match.lineNumber,
            line: match.line,
            contextBefore: context.before,
            contextAfter: context.after,
            normalizedValue: normalizePhone(phoneMatch[0]),
          });
        }
      }
    }
  }

  // Find colors
  const colorMatches = findColorsInFiles(files);
  for (const match of colorMatches) {
    const file = files.find(f => f.path === match.filePath);
    if (file) {
      const context = extractContext(file, match.lineNumber || 1);
      matches.push({
        type: 'color',
        value: match.originalColor,
        filePath: match.filePath,
        lineNumber: match.lineNumber || 1,
        line: match.context || '',
        contextBefore: context.before,
        contextAfter: context.after,
        normalizedValue: normalizeColor(match.originalColor),
      });
    }
  }

  // Find business names (capitalized words, company suffixes) - only in customizable files
  const businessNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co|Group|Solutions|Services|Digital|Tech|Technologies|Systems|Software|Design|Marketing|Media|Agency|Consulting))?)\b/g;
  for (const file of files) {
    // Skip template structure files and wp-content (read-only)
    if (isTemplateStructureFile(file.path) || file.path.includes('wp-content/')) {
      continue;
    }
    
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nameMatches = Array.from(line.matchAll(businessNamePattern));
      for (const nameMatch of nameMatches) {
        if (nameMatch[0] && nameMatch[0].length > 3 && nameMatch[0].length < 50) {
          // Skip common generic terms
          const normalized = normalizeBusinessName(nameMatch[0]);
          if (normalized.includes('wordpress') || 
              normalized.includes('elementor') || 
              normalized.includes('theme') ||
              normalized.includes('plugin')) {
            continue;
          }
          
          const context = extractContext(file, i + 1);
          matches.push({
            type: 'business_name',
            value: nameMatch[0],
            filePath: file.path,
            lineNumber: i + 1,
            line: line,
            contextBefore: context.before,
            contextAfter: context.after,
            normalizedValue: normalized,
          });
        }
      }
    }
  }

  // Find addresses (street patterns, postal codes)
  const addressPattern = /\b\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Ct|Court|Place|Pl)\b[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/gi;
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const addressMatches = Array.from(line.matchAll(addressPattern));
      for (const addressMatch of addressMatches) {
        if (addressMatch[0]) {
          const context = extractContext(file, i + 1);
          matches.push({
            type: 'address',
            value: addressMatch[0],
            filePath: file.path,
            lineNumber: i + 1,
            line: line,
            contextBefore: context.before,
            contextAfter: context.after,
            normalizedValue: addressMatch[0].toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Group similar matches together (intelligent grouping)
 */
export function groupSimilarMatches(matches: PatternMatch[]): GroupedMatch[] {
  const grouped = new Map<string, GroupedMatch>();

  for (const match of matches) {
    // For URLs, group by domain (not full URL path)
    let key: string;
    if (match.type === 'url') {
      const normalized = match.normalizedValue || normalizeUrl(match.value);
      // Extract domain (first part before first slash)
      const domain = normalized.split('/')[0];
      key = `${match.type}:${domain}`;
    } else {
      key = `${match.type}:${match.normalizedValue || match.value}`;
    }
    
    if (!grouped.has(key)) {
      // Use the first occurrence's value as the representative value
      grouped.set(key, {
        type: match.type,
        value: match.value,
        normalizedValue: match.normalizedValue || match.value,
        occurrences: [],
      });
    }

    grouped.get(key)!.occurrences.push(match);
  }

  // Sort by occurrence count (most common first) for better AI analysis
  return Array.from(grouped.values()).sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/**
 * Build compact prompt with grouped matches only (intelligent Elementor dev approach)
 */
function buildHybridAnalysisPrompt(
  groupedMatches: GroupedMatch[],
  config: CustomizationConfig,
  manifest?: any,
  siteSettings?: any
): string {
  const addressParts = [
    config.address,
    config.city,
    config.stateProvince,
    config.postalCode,
    config.country,
  ].filter(Boolean).join(', ');

  // Build match summary (compact, prioritized by importance)
  const matchSummary = groupedMatches
    .map(group => {
      const sample = group.occurrences[0];
      const filePaths = [...new Set(group.occurrences.map(o => o.filePath))];
      const editableFiles = filePaths.filter(p => !p.includes('wp-content/'));
      const readOnlyFiles = filePaths.filter(p => p.includes('wp-content/'));
      
      return `- ${group.type.toUpperCase()}: "${group.value}" (${group.occurrences.length} occurrences)
  Editable Files: ${editableFiles.slice(0, 3).join(', ')}${editableFiles.length > 3 ? '...' : ''}
  ${readOnlyFiles.length > 0 ? `Read-Only Files (wp-content): ${readOnlyFiles.length} files` : ''}
  Context: "${sample.line.substring(0, 100)}"`;
    })
    .join('\n');

  return `You are an Elementor developer converting a template from one company to another. Analyze these pattern matches and identify ONLY the fields that actually need updating for the new company.

ORIGINAL COMPANY CONTEXT:
The template was built for a previous company. You need to identify company-specific content that must be replaced.

NEW COMPANY CONFIGURATION:
- New Site URL: ${config.siteUrl}
- New Business Name: ${config.businessName}
- New Email: ${config.email}
- New Phone: ${config.phone}
${addressParts ? `- New Address: ${addressParts}` : ''}
- Primary Color: ${config.primaryColor}
- Secondary Color: ${config.secondaryColor}
- Accent Color: ${config.accentColor}
${config.backgroundColor ? `- Background Color: ${config.backgroundColor}` : ''}
${config.textColor ? `- Text Color: ${config.textColor}` : ''}
${config.promptModifier ? `\nADDITIONAL INSTRUCTIONS:\n${config.promptModifier}\n` : ''}

${manifest ? `TEMPLATE MANIFEST:\n${JSON.stringify(manifest, null, 2)}\n` : ''}
${siteSettings ? `TEMPLATE SITE SETTINGS:\n${JSON.stringify(siteSettings, null, 2)}\n` : ''}

PATTERN MATCHES FOUND:
${matchSummary}

CRITICAL RULES (Act like an Elementor developer):
1. ONLY include fields that are company-specific (domain names, business names, contact info, brand colors)
2. EXCLUDE template structure, WordPress core references, Elementor system files
3. Group related matches intelligently:
   - Same domain URL appearing multiple times = ONE field group
   - Same business name in different contexts = ONE field group  
   - Same email/phone = ONE field group
4. For wp-content files: Mark as read-only (analysis only, not editable)
5. Prioritize editable files over read-only files
6. Be selective - don't create fields for every single occurrence, group them intelligently
7. Focus on what an Elementor dev would actually change when rebranding

Return a JSON array with this structure for EACH field group (not individual occurrences):
{
  "field": "Descriptive field name (e.g., 'Site Base URL', 'Primary Business Name', 'Contact Email')",
  "currentValue": "The original value found (representative value if multiple)",
  "suggestedValue": "The new value from configuration",
  "fieldType": "url|email|phone|color|business_name|address|text|other",
  "context": "Brief description of where this appears (e.g., 'Header navigation', 'Footer contact section')",
  "description": "Additional context (e.g., 'Found 15 occurrences across 8 files')",
  "occurrenceCount": number
}

Return ONLY valid JSON array, no additional text. Be intelligent and selective - group similar values together.`;
}

/**
 * Phase 2: Analyze matches with AI
 */
export async function analyzeMatchesWithAI(
  groupedMatches: GroupedMatch[],
  config: CustomizationConfig,
  options: {
    apiKey: string;
    model?: string;
    manifest?: any;
    siteSettings?: any;
    onProgress?: (message: string) => void;
  }
): Promise<CustomizationField[]> {
  const { apiKey, model, manifest, siteSettings, onProgress } = options;

  onProgress?.('Analyzing pattern matches with AI...');

  const userPrompt = buildHybridAnalysisPrompt(groupedMatches, config, manifest, siteSettings);
  
  const systemPrompt = `You are an experienced Elementor developer converting a template from one company to another. Your task is to intelligently identify company-specific fields that need updating (domain names, business names, contact info, brand colors). Exclude template structure and WordPress core references. Group related matches together - don't create separate fields for every occurrence of the same value.`;

  let responseContent = '';
  await streamChatCompletion({
    apiKey,
    model: model || getResearchModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.9,
    onContentChunk: (chunk) => {
      responseContent += chunk;
      onProgress?.(`Analyzing... (${responseContent.length} chars)`);
    },
  });

  onProgress?.('Parsing AI analysis results...');

  // Parse response
  try {
    let jsonStr = responseContent.trim();
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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
      
      // Find the first occurrence to get file path
      const matchGroup = groupedMatches.find(g => 
        g.value === item.currentValue || 
        g.normalizedValue === item.currentValue?.toLowerCase() ||
        item.currentValue?.includes(g.value)
      );
      
      const firstOccurrence = matchGroup?.occurrences[0];
      const filePath = firstOccurrence?.filePath || '';
      const lineNumber = firstOccurrence?.lineNumber;
      const isReadOnly = filePath.includes('wp-content/');

      fields.push({
        id: `field-${i}-${Date.now()}`,
        field: item.field || 'Unknown Field',
        currentValue: item.currentValue || '',
        suggestedValue: item.suggestedValue || item.currentValue || '',
        filePath,
        lineNumber,
        fieldType: (item.fieldType || 'other') as FieldType,
        context: item.context || firstOccurrence?.line?.substring(0, 100),
        description: item.description,
        approved: false,
        readOnly: isReadOnly,
      });
    }

    return fields;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Fallback: create fields from grouped matches
    return createFieldsFromGroupedMatches(groupedMatches, config);
  }
}

/**
 * Fallback: Create fields from grouped matches if AI parsing fails
 */
function createFieldsFromGroupedMatches(
  groupedMatches: GroupedMatch[],
  config: CustomizationConfig
): CustomizationField[] {
  const fields: CustomizationField[] = [];
  let fieldId = 0;

  for (const group of groupedMatches) {
    const firstOcc = group.occurrences[0];
    const isReadOnly = firstOcc.filePath.includes('wp-content/');

    let suggestedValue = '';
    let fieldName = '';
    
    switch (group.type) {
      case 'url':
        fieldName = 'Site URL';
        suggestedValue = config.siteUrl;
        break;
      case 'email':
        fieldName = 'Email Address';
        suggestedValue = config.email;
        break;
      case 'phone':
        fieldName = 'Phone Number';
        suggestedValue = config.phone;
        break;
      case 'color':
        fieldName = 'Color';
        suggestedValue = config.primaryColor;
        break;
      case 'business_name':
        fieldName = 'Business Name';
        suggestedValue = config.businessName;
        break;
      case 'address':
        fieldName = 'Address';
        suggestedValue = config.address || '';
        break;
      default:
        fieldName = 'Text Field';
        suggestedValue = '';
    }

    fields.push({
      id: `field-${fieldId++}`,
      field: fieldName,
      currentValue: group.value,
      suggestedValue,
      filePath: firstOcc.filePath,
      lineNumber: firstOcc.lineNumber,
      fieldType: group.type === 'color' ? 'color' : group.type === 'url' ? 'url' : group.type === 'email' ? 'email' : group.type === 'phone' ? 'phone' : 'text',
      context: firstOcc.line.substring(0, 100),
      description: `Found ${group.occurrences.length} occurrence(s)`,
      approved: false,
      readOnly: isReadOnly,
    });
  }

  return fields;
}

/**
 * Main hybrid analysis function
 */
export async function hybridAnalyzeTemplate(
  files: TemplateFile[],
  config: CustomizationConfig,
  options: {
    apiKey: string;
    model?: string;
    manifest?: any;
    siteSettings?: any;
    onProgress?: (message: string) => void;
  }
): Promise<CustomizationField[]> {
  const { onProgress } = options;

  onProgress?.('Phase 1: Finding patterns with regex...');
  const allMatches = findAllPatterns(files);
  onProgress?.(`Found ${allMatches.length} pattern matches`);

  onProgress?.('Grouping similar matches...');
  const groupedMatches = groupSimilarMatches(allMatches);
  onProgress?.(`Grouped into ${groupedMatches.length} unique patterns`);

  onProgress?.('Phase 2: Analyzing with AI...');
  const fields = await analyzeMatchesWithAI(groupedMatches, config, options);

  return fields;
}
