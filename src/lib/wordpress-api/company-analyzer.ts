/**
 * WordPress Company Content Analyzer
 * AI-powered analysis of WordPress posts to identify company-specific content
 * Similar to hybrid-grep-analyzer but works with WordPress post objects
 */

import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CustomizationConfig, FieldType } from "@/components/generator/elementor/types";
import type { WordPressCustomizationField } from "@/components/generator/elementor/types";
import type { ScannedPost } from "./content-scanner";
import { extractCompanyDataFromPosts } from "./content-scanner";

export interface WordPressPatternMatch {
  type: 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text';
  value: string;
  postId: number;
  postType: string;
  postTitle: string;
  postLink: string;
  fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy';
  acfFieldName?: string;
  taxonomyName?: string;
  metaKey?: string;
  normalizedValue?: string;
  context?: string;
}

export interface WordPressGroupedMatch {
  type: 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text';
  value: string;
  normalizedValue: string;
  occurrences: WordPressPatternMatch[];
  suggestedFieldName?: string;
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
  
  for (const domain of genericDomains) {
    if (normalized.includes(domain)) {
      return true;
    }
  }
  
  if (/^(data|mailto|tel|javascript|#):/i.test(url)) {
    return true;
  }
  
  return false;
}

/**
 * Extract patterns from ACF field values directly (from ACF scanner)
 */
export function extractPatternsFromACFFieldValues(
  acfFields: Array<{
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    value: any;
    postId: number;
    postType: string;
    postTitle: string;
    postLink: string;
  }>
): WordPressPatternMatch[] {
  const matches: WordPressPatternMatch[] = [];
  const fieldValueMap = new Map<string, {
    value: string;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    posts: Array<{ postId: number; postType: string; postTitle: string; postLink: string }>;
  }>();

  // Group by field name and value
  for (const acfField of acfFields) {
    const valueStr = String(acfField.value).trim();
    if (!valueStr) continue;

    const key = `${acfField.fieldName}:${valueStr}`;
    
    if (!fieldValueMap.has(key)) {
      fieldValueMap.set(key, {
        value: valueStr,
        fieldName: acfField.fieldName,
        fieldLabel: acfField.fieldLabel,
        fieldType: acfField.fieldType,
        posts: [],
      });
    }
    
    const fieldInfo = fieldValueMap.get(key)!;
    
    // Handle Options Page fields (no postId) vs regular post fields
    if (acfField.optionsPageSlug) {
      // Options Page field - use options page info
      const postExists = fieldInfo.posts.some(p => 
        p.postType === 'options-page' && (p as any).optionsPageSlug === acfField.optionsPageSlug
      );
      if (!postExists) {
        fieldInfo.posts.push({
          postId: 0, // Options Page doesn't have a post ID
          postType: 'options-page',
          postTitle: `Options Page: ${acfField.optionsPageSlug}`,
          postLink: '',
          ...(acfField.optionsPageSlug && { optionsPageSlug: acfField.optionsPageSlug }),
        } as any);
      }
    } else if (acfField.postId) {
      // Regular post field
      const postExists = fieldInfo.posts.some(p => p.postId === acfField.postId);
      if (!postExists) {
        fieldInfo.posts.push({
          postId: acfField.postId!,
          postType: acfField.postType!,
          postTitle: acfField.postTitle || 'Untitled',
          postLink: acfField.postLink || '',
        });
      }
    }
  }

  // Convert to matches
  for (const [key, data] of fieldValueMap.entries()) {
    const firstPost = data.posts[0];
    
    matches.push({
      type: inferPatternType(data.value, data.fieldName),
      value: data.value,
      postId: firstPost.postId,
      postType: firstPost.postType,
      postTitle: firstPost.postTitle,
      postLink: firstPost.postLink,
      fieldSource: 'acf',
      acfFieldName: data.fieldName,
      normalizedValue: normalizeValue(data.value, inferPatternType(data.value, data.fieldName)),
      context: firstPost.postType === 'options-page' 
        ? `ACF Options Page field: ${data.fieldName} (${data.fieldLabel})`
        : `ACF field: ${data.fieldName} (${data.fieldLabel})`,
    });
  }

  return matches;
}

/**
 * Extract patterns from ACF fields only (not from content) - legacy
 */
export function extractPatternsFromACFFields(
  posts: ScannedPost[]
): WordPressPatternMatch[] {
  const matches: WordPressPatternMatch[] = [];
  const fieldValueMap = new Map<string, { value: string; posts: ScannedPost[]; fieldName: string }>();

  // Scan ACF fields from all posts
  for (const post of posts) {
    for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        continue;
      }
      
      const valueStr = String(fieldValue).trim();
      if (!valueStr) continue;

      // Create a key for grouping similar values
      const key = `${fieldName}:${valueStr}`;
      
      if (!fieldValueMap.has(key)) {
        fieldValueMap.set(key, {
          value: valueStr,
          posts: [],
          fieldName,
        });
      }
      
      fieldValueMap.get(key)!.posts.push(post);
    }
  }

  // Convert to matches
  for (const [key, data] of fieldValueMap.entries()) {
    // Use the first post as representative
    const firstPost = data.posts[0];
    
    matches.push({
      type: inferPatternType(data.value, data.fieldName),
      value: data.value,
      postId: firstPost.id,
      postType: firstPost.postType,
      postTitle: firstPost.title,
      postLink: firstPost.link,
      fieldSource: 'acf',
      acfFieldName: data.fieldName,
      normalizedValue: normalizeValue(data.value, inferPatternType(data.value, data.fieldName)),
      context: `${data.fieldName} in ${firstPost.title}`,
    });
  }

  return matches;
}

/**
 * Infer pattern type from field value and name
 */
function inferPatternType(value: string, fieldName: string): 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text' {
  const valueLower = value.toLowerCase();
  const nameLower = fieldName.toLowerCase();
  
  // Check field name first
  if (nameLower.includes('email') || nameLower.includes('_email')) return 'email';
  if (nameLower.includes('phone') || nameLower.includes('_phone')) return 'phone';
  if (nameLower.includes('url') || nameLower.includes('link') || nameLower.includes('_link')) return 'url';
  if (nameLower.includes('color') || nameLower.includes('colour')) return 'color';
  if (nameLower.includes('address') || nameLower.includes('_address')) return 'address';
  if (nameLower.includes('company') || nameLower.includes('business') || nameLower.includes('name')) return 'business_name';
  
  // Check value patterns
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  if (/^https?:\/\//.test(value)) return 'url';
  if (/^#?([0-9a-fA-F]{3}){1,2}$/i.test(value)) return 'color';
  if (/^[\d\s\(\)\-\+\.]+$/.test(value) && value.replace(/\D/g, '').length >= 10) return 'phone';
  
  return 'text';
}

/**
 * Normalize value based on type
 */
function normalizeValue(value: string, type: 'url' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'text'): string {
  switch (type) {
    case 'url':
      return normalizeUrl(value);
    case 'email':
      return normalizeEmail(value);
    case 'phone':
      return normalizePhone(value);
    case 'color':
      return normalizeColor(value);
    case 'business_name':
      return normalizeBusinessName(value);
    default:
      return value.toLowerCase().trim();
  }
}

/**
 * Extract patterns from WordPress posts (legacy - scans everything)
 */
export function extractPatternsFromPosts(
  posts: ScannedPost[],
  companyData: ReturnType<typeof extractCompanyDataFromPosts>
): WordPressPatternMatch[] {
  const matches: WordPressPatternMatch[] = [];

  // Process URLs
  for (const [url, count] of companyData.urls.entries()) {
    if (!isGenericUrl(url)) {
      // Find posts containing this URL
      const postsWithUrl = posts.filter(post => {
        const allText = [
          post.title,
          post.content,
          post.excerpt,
          JSON.stringify(post.acfFields),
        ].join(' ');
        return allText.includes(url);
      });

      for (const post of postsWithUrl) {
        // Determine field source - check ACF FIRST since it's more specific
        let fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy' = 'content';
        let acfFieldName: string | undefined;

        // Check ACF fields FIRST (more specific than content)
        for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
          const fieldValueStr = String(fieldValue);
          if (fieldValueStr.includes(url) || fieldValueStr === url) {
            fieldSource = 'acf';
            acfFieldName = fieldName;
            break;
          }
        }
        
        // Only check title/excerpt if not found in ACF
        if (fieldSource !== 'acf') {
          if (post.title.includes(url)) {
            fieldSource = 'title';
          } else if (post.excerpt.includes(url)) {
            fieldSource = 'excerpt';
          }
        }

        matches.push({
          type: 'url',
          value: url,
          postId: post.id,
          postType: post.postType,
          postTitle: post.title,
          postLink: post.link,
          fieldSource,
          acfFieldName,
          normalizedValue: normalizeUrl(url),
          context: post.title.substring(0, 100),
        });
      }
    }
  }

  // Process emails
  for (const [email, count] of companyData.emails.entries()) {
    const emailLower = email.toLowerCase();
    if (!emailLower.includes('noreply@') && 
        !emailLower.includes('no-reply@') && 
        !emailLower.includes('wordpress@') &&
        !emailLower.includes('admin@wordpress')) {
      
      const postsWithEmail = posts.filter(post => {
        const allText = [
          post.title,
          post.content,
          post.excerpt,
          JSON.stringify(post.acfFields),
        ].join(' ');
        return allText.includes(email);
      });

      for (const post of postsWithEmail) {
        let fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy' = 'content';
        let acfFieldName: string | undefined;

        // Check ACF fields FIRST (more specific than content)
        for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
          const fieldValueStr = String(fieldValue);
          if (fieldValueStr.includes(email) || fieldValueStr === email) {
            fieldSource = 'acf';
            acfFieldName = fieldName;
            break;
          }
        }
        
        // Only check title/excerpt if not found in ACF
        if (fieldSource !== 'acf') {
          if (post.title.includes(email)) {
            fieldSource = 'title';
          } else if (post.excerpt.includes(email)) {
            fieldSource = 'excerpt';
          }
        }

        matches.push({
          type: 'email',
          value: email,
          postId: post.id,
          postType: post.postType,
          postTitle: post.title,
          postLink: post.link,
          fieldSource,
          acfFieldName,
          normalizedValue: normalizeEmail(email),
          context: post.title.substring(0, 100),
        });
      }
    }
  }

  // Process phones
  for (const [phone, count] of companyData.phones.entries()) {
    const postsWithPhone = posts.filter(post => {
      const allText = [
        post.title,
        post.content,
        post.excerpt,
        JSON.stringify(post.acfFields),
      ].join(' ');
      return allText.includes(phone);
    });

    for (const post of postsWithPhone) {
      let fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy' = 'content';
      let acfFieldName: string | undefined;

      // Check ACF fields FIRST (more specific than content)
      for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
        const fieldValueStr = String(fieldValue);
        if (fieldValueStr.includes(phone) || fieldValueStr === phone) {
          fieldSource = 'acf';
          acfFieldName = fieldName;
          break;
        }
      }
      
      // Only check title/excerpt if not found in ACF
      if (fieldSource !== 'acf') {
        if (post.title.includes(phone)) {
          fieldSource = 'title';
        } else if (post.excerpt.includes(phone)) {
          fieldSource = 'excerpt';
        }
      }

      matches.push({
        type: 'phone',
        value: phone,
        postId: post.id,
        postType: post.postType,
        postTitle: post.title,
        postLink: post.link,
        fieldSource,
        acfFieldName,
        normalizedValue: normalizePhone(phone),
        context: post.title.substring(0, 100),
      });
    }
  }

  // Process business names
  for (const [name, count] of companyData.businessNames.entries()) {
    const normalized = normalizeBusinessName(name);
    if (!normalized.includes('wordpress') && 
        !normalized.includes('elementor') && 
        !normalized.includes('theme') &&
        !normalized.includes('plugin')) {
      
      const postsWithName = posts.filter(post => {
        const allText = [
          post.title,
          post.content,
          post.excerpt,
          JSON.stringify(post.acfFields),
        ].join(' ');
        return allText.includes(name);
      });

      for (const post of postsWithName) {
        let fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy' = 'content';
        let acfFieldName: string | undefined;

        // Check ACF fields FIRST (more specific than content)
        for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
          const fieldValueStr = String(fieldValue);
          if (fieldValueStr.includes(name) || fieldValueStr === name) {
            fieldSource = 'acf';
            acfFieldName = fieldName;
            break;
          }
        }
        
        // Only check title/excerpt if not found in ACF
        if (fieldSource !== 'acf') {
          if (post.title.includes(name)) {
            fieldSource = 'title';
          } else if (post.excerpt.includes(name)) {
            fieldSource = 'excerpt';
          }
        }

        matches.push({
          type: 'business_name',
          value: name,
          postId: post.id,
          postType: post.postType,
          postTitle: post.title,
          postLink: post.link,
          fieldSource,
          acfFieldName,
          normalizedValue: normalized,
          context: post.title.substring(0, 100),
        });
      }
    }
  }

  // Process colors
  for (const [color, count] of companyData.colors.entries()) {
    const postsWithColor = posts.filter(post => {
      const allText = [
        post.title,
        post.content,
        post.excerpt,
        JSON.stringify(post.acfFields),
      ].join(' ');
      return allText.includes(color);
    });

    for (const post of postsWithColor) {
      let fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy' = 'content';
      let acfFieldName: string | undefined;

      // Colors are most likely in ACF fields - check ACF FIRST
      for (const [fieldName, fieldValue] of Object.entries(post.acfFields)) {
        const fieldValueStr = String(fieldValue);
        if (fieldValueStr.includes(color) || fieldValueStr === color) {
          fieldSource = 'acf';
          acfFieldName = fieldName;
          break;
        }
      }

      matches.push({
        type: 'color',
        value: color,
        postId: post.id,
        postType: post.postType,
        postTitle: post.title,
        postLink: post.link,
        fieldSource,
        acfFieldName,
        normalizedValue: normalizeColor(color),
        context: post.title.substring(0, 100),
      });
    }
  }

  return matches;
}

/**
 * Group similar matches together
 */
export function groupWordPressMatches(matches: WordPressPatternMatch[]): WordPressGroupedMatch[] {
  const grouped = new Map<string, WordPressGroupedMatch>();

  for (const match of matches) {
    // For URLs, group by domain (not full URL path)
    let key: string;
    if (match.type === 'url') {
      const normalized = match.normalizedValue || normalizeUrl(match.value);
      const domain = normalized.split('/')[0];
      key = `${match.type}:${domain}`;
    } else {
      key = `${match.type}:${match.normalizedValue || match.value}`;
    }
    
    if (!grouped.has(key)) {
      grouped.set(key, {
        type: match.type,
        value: match.value,
        normalizedValue: match.normalizedValue || match.value,
        occurrences: [],
      });
    }

    grouped.get(key)!.occurrences.push(match);
  }

  // Sort by occurrence count (most common first)
  return Array.from(grouped.values()).sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/**
 * Build AI analysis prompt for ACF fields only
 */
function buildACFAnalysisPrompt(
  groupedMatches: WordPressGroupedMatch[],
  config: CustomizationConfig
): string {
  const addressParts = [
    config.address,
    config.city,
    config.stateProvince,
    config.postalCode,
    config.country,
  ].filter(Boolean).join(', ');

  const matchSummary = groupedMatches
    .map(group => {
      const sample = group.occurrences[0];
      const postTypes = [...new Set(group.occurrences.map(o => o.postType))];
      
      return `- ACF FIELD: "${sample.acfFieldName || 'unknown'}" = "${group.value}" (${group.occurrences.length} occurrences)
  Post Types: ${postTypes.join(', ')}
  Sample Post: "${sample.postTitle}" (${sample.postLink})`;
    })
    .join('\n');

  return `You are an Elementor developer converting a WordPress site from one company to another. Analyze these ACF field values and identify which fields need updating for the new company.

ORIGINAL COMPANY CONTEXT:
The WordPress site was built for a previous company. You need to identify ACF fields that contain company-specific data that must be replaced.

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

ACF FIELD VALUES FOUND:
${matchSummary}

CRITICAL RULES (Act like an Elementor developer):
1. Map ACF field names to configuration values:
   - Fields with "company", "business", "name" → map to businessName
   - Fields with "email" → map to email
   - Fields with "phone" → map to phone
   - Fields with "address" → map to address
   - Fields with "url", "link" → map to siteUrl (if domain matches old company)
   - Fields with "color", "colour" → map to appropriate color from config
2. Group similar ACF fields together (same field name across multiple posts = one field group)
3. Be selective - only include fields that are company-specific
4. Focus on what an Elementor dev would actually change when rebranding

Return a JSON array with this structure for EACH ACF field group:
{
  "field": "Descriptive field name (e.g., 'Company Name ACF Field', 'Contact Email ACF Field')",
  "currentValue": "The original value found in ACF field",
  "suggestedValue": "The new value from configuration",
  "fieldType": "url|email|phone|color|business_name|address|text|other",
  "context": "Brief description (e.g., 'ACF field: ci_company_name')",
  "description": "Additional context (e.g., 'Found 15 occurrences across 8 posts')",
  "occurrenceCount": number,
  "fieldSource": "acf",
  "acfFieldName": "ci_company_name",
  "affectedPosts": [{"postId": 123, "postType": "post", "postTitle": "Title", "postLink": "url"}]
}

Return ONLY valid JSON array, no additional text. Focus on ACF fields only.`;
}

/**
 * Build AI analysis prompt for WordPress content (legacy - scans everything)
 */
function buildWordPressAnalysisPrompt(
  groupedMatches: WordPressGroupedMatch[],
  config: CustomizationConfig
): string {
  const addressParts = [
    config.address,
    config.city,
    config.stateProvince,
    config.postalCode,
    config.country,
  ].filter(Boolean).join(', ');

  const matchSummary = groupedMatches
    .map(group => {
      const sample = group.occurrences[0];
      const postTypes = [...new Set(group.occurrences.map(o => o.postType))];
      const fieldSources = [...new Set(group.occurrences.map(o => o.fieldSource))];
      
      return `- ${group.type.toUpperCase()}: "${group.value}" (${group.occurrences.length} occurrences)
  Post Types: ${postTypes.join(', ')}
  Field Sources: ${fieldSources.join(', ')}
  Sample Post: "${sample.postTitle}" (${sample.postLink})
  ${sample.acfFieldName ? `ACF Field: ${sample.acfFieldName}` : ''}`;
    })
    .join('\n');

  return `You are an Elementor developer converting a WordPress site from one company to another. Analyze these pattern matches and identify ONLY the fields that actually need updating for the new company.

ORIGINAL COMPANY CONTEXT:
The WordPress site was built for a previous company. You need to identify company-specific content that must be replaced.

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

PATTERN MATCHES FOUND:
${matchSummary}

CRITICAL RULES (Act like an Elementor developer):
1. ONLY include fields that are company-specific (domain names, business names, contact info, brand colors)
2. EXCLUDE template structure, WordPress core references, Elementor system files
3. Group related matches intelligently:
   - Same domain URL appearing multiple times = ONE field group
   - Same business name in different contexts = ONE field group  
   - Same email/phone = ONE field group
4. Prioritize ACF fields over content fields (ACF fields are easier to update)
5. Be selective - don't create fields for every single occurrence, group them intelligently
6. Focus on what an Elementor dev would actually change when rebranding

Return a JSON array with this structure for EACH field group (not individual occurrences):
{
  "field": "Descriptive field name (e.g., 'Site Base URL', 'Primary Business Name', 'Contact Email')",
  "currentValue": "The original value found (representative value if multiple)",
  "suggestedValue": "The new value from configuration",
  "fieldType": "url|email|phone|color|business_name|address|text|other",
  "context": "Brief description of where this appears (e.g., 'Header navigation', 'Footer contact section')",
  "description": "Additional context (e.g., 'Found 15 occurrences across 8 posts')",
  "occurrenceCount": number,
  "fieldSource": "acf|title|content|excerpt|meta|taxonomy",
  "acfFieldName": "field_name_if_acf",
  "affectedPosts": [{"postId": 123, "postType": "post", "postTitle": "Title", "postLink": "url"}]
}

Return ONLY valid JSON array, no additional text. Be intelligent and selective - group similar values together.`;
}

/**
 * Analyze WordPress content with AI
 */
/**
 * Analyze ACF fields directly from ACF scanner results
 */
export async function analyzeACFFieldsDirectly(
  acfFields: Array<{
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    value: any;
    postId?: number;
    postType?: string;
    postTitle?: string;
    postLink?: string;
    optionsPageSlug?: string;
  }>,
  config: CustomizationConfig,
  options: {
    apiKey: string;
    model?: string;
    onProgress?: (message: string) => void;
  }
): Promise<WordPressCustomizationField[]> {
  const { apiKey, model, onProgress } = options;

  onProgress?.('Extracting patterns from ACF field values...');
  const allMatches = extractPatternsFromACFFieldValues(acfFields);
  onProgress?.(`Found ${allMatches.length} ACF field value matches`);

  onProgress?.('Grouping similar ACF field values...');
  const groupedMatches = groupWordPressMatches(allMatches);
  onProgress?.(`Grouped into ${groupedMatches.length} unique ACF field patterns`);

  onProgress?.('Analyzing ACF fields with AI...');
  const userPrompt = buildACFAnalysisPrompt(groupedMatches, config);
  
  const systemPrompt = `You are an experienced Elementor developer converting a WordPress site from one company to another. Your task is to analyze ACF (Advanced Custom Fields) field values from the Options Page and identify which fields contain company-specific data that needs updating (business names, contact info, brand colors, URLs). 

Based on the field names and current values, suggest appropriate new values. If configuration is provided, use those values. Otherwise, suggest placeholder values that indicate what should be filled in (e.g., "[New Company Name]", "[New Email Address]"). Group similar ACF fields together.`;

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

    const fields: WordPressCustomizationField[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      
      // Get first occurrence for location info
      const firstOccurrence = groupedMatches.find(g => 
        g.value === item.currentValue || 
        g.normalizedValue === item.currentValue?.toLowerCase() ||
        item.currentValue?.includes(g.value) ||
        (item.acfFieldName && g.occurrences[0]?.acfFieldName === item.acfFieldName)
      )?.occurrences[0];

      if (!firstOccurrence) continue;
      
      // Ensure ACF field name is preserved
      const acfFieldName = item.acfFieldName || firstOccurrence.acfFieldName;
      
      // Handle Options Page fields (postType === 'options-page')
      const isOptionsPage = firstOccurrence.postType === 'options-page';

      fields.push({
        id: `wp-field-${i}-${Date.now()}`,
        field: item.field || 'Unknown Field',
        currentValue: item.currentValue || '',
        suggestedValue: item.suggestedValue || item.currentValue || '',
        fieldType: (item.fieldType || 'other') as FieldType,
        location: {
          postId: isOptionsPage ? 0 : firstOccurrence.postId,
          postType: firstOccurrence.postType,
          postTitle: firstOccurrence.postTitle,
          postLink: firstOccurrence.postLink,
          fieldSource: 'acf', // Always ACF when acfOnly is true
          acfFieldName: acfFieldName,
          taxonomyName: firstOccurrence.taxonomyName,
          metaKey: firstOccurrence.metaKey,
        },
        occurrenceCount: item.occurrenceCount || item.affectedPosts?.length || 1,
        context: item.context || firstOccurrence.context,
        description: item.description || `Found ${item.occurrenceCount || 1} occurrence(s)`,
        approved: false,
      });
    }

    return fields;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Fallback: create fields from grouped matches
    return createFieldsFromGroupedMatches(groupedMatches, config);
  }
}

export async function analyzeWordPressContent(
  posts: ScannedPost[],
  companyData: ReturnType<typeof extractCompanyDataFromPosts>,
  config: CustomizationConfig,
  options: {
    apiKey: string;
    model?: string;
    onProgress?: (message: string) => void;
    acfOnly?: boolean; // New option to only analyze ACF fields
  }
): Promise<WordPressCustomizationField[]> {
  const { apiKey, model, onProgress, acfOnly = true } = options;

  onProgress?.('Extracting patterns from ACF fields...');
  // Use ACF-only extraction instead of full content scan
  const allMatches = acfOnly 
    ? extractPatternsFromACFFields(posts)
    : extractPatternsFromPosts(posts, companyData);
  onProgress?.(`Found ${allMatches.length} ACF field matches`);

  onProgress?.('Grouping similar ACF field values...');
  const groupedMatches = groupWordPressMatches(allMatches);
  onProgress?.(`Grouped into ${groupedMatches.length} unique ACF field patterns`);

  onProgress?.('Analyzing ACF fields with AI...');
  const userPrompt = acfOnly 
    ? buildACFAnalysisPrompt(groupedMatches, config)
    : buildWordPressAnalysisPrompt(groupedMatches, config);
  
  const systemPrompt = acfOnly
    ? `You are an experienced Elementor developer converting a WordPress site from one company to another. Your task is to analyze ACF (Advanced Custom Fields) field values and identify which fields contain company-specific data that needs updating (business names, contact info, brand colors, URLs). Map ACF field names to the new company configuration values. Group similar ACF fields together.`
    : `You are an experienced Elementor developer converting a WordPress site from one company to another. Your task is to intelligently identify company-specific fields that need updating (domain names, business names, contact info, brand colors). Exclude template structure and WordPress core references. Group related matches together - don't create separate fields for every occurrence of the same value.`;

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

    const fields: WordPressCustomizationField[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      
      // Get first occurrence for location info
      const firstOccurrence = groupedMatches.find(g => 
        g.value === item.currentValue || 
        g.normalizedValue === item.currentValue?.toLowerCase() ||
        item.currentValue?.includes(g.value) ||
        (item.acfFieldName && g.occurrences[0]?.acfFieldName === item.acfFieldName)
      )?.occurrences[0];

      if (!firstOccurrence) continue;
      
      // Ensure ACF field name is preserved
      const acfFieldName = item.acfFieldName || firstOccurrence.acfFieldName;

      fields.push({
        id: `wp-field-${i}-${Date.now()}`,
        field: item.field || 'Unknown Field',
        currentValue: item.currentValue || '',
        suggestedValue: item.suggestedValue || item.currentValue || '',
        fieldType: (item.fieldType || 'other') as FieldType,
        location: {
          postId: firstOccurrence.postId,
          postType: firstOccurrence.postType,
          postTitle: firstOccurrence.postTitle,
          postLink: firstOccurrence.postLink,
          fieldSource: 'acf', // Always ACF when acfOnly is true
          acfFieldName: acfFieldName,
          taxonomyName: firstOccurrence.taxonomyName,
          metaKey: firstOccurrence.metaKey,
        },
        occurrenceCount: item.occurrenceCount || item.affectedPosts?.length || 1,
        context: item.context || firstOccurrence.context,
        description: item.description || `Found ${item.occurrenceCount || 1} occurrence(s)`,
        approved: false,
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
  groupedMatches: WordPressGroupedMatch[],
  config: CustomizationConfig
): WordPressCustomizationField[] {
  const fields: WordPressCustomizationField[] = [];
  let fieldId = 0;

  for (const group of groupedMatches) {
    const firstOcc = group.occurrences[0];

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
      id: `wp-field-${fieldId++}`,
      field: fieldName,
      currentValue: group.value,
      suggestedValue,
      fieldType: group.type === 'color' ? 'color' : group.type === 'url' ? 'url' : group.type === 'email' ? 'email' : group.type === 'phone' ? 'phone' : 'text',
      location: {
        postId: firstOcc.postId,
        postType: firstOcc.postType,
        postTitle: firstOcc.postTitle,
        postLink: firstOcc.postLink,
        fieldSource: firstOcc.fieldSource,
        acfFieldName: firstOcc.acfFieldName,
        taxonomyName: firstOcc.taxonomyName,
        metaKey: firstOcc.metaKey,
      },
      occurrenceCount: group.occurrences.length,
      context: firstOcc.context,
      description: `Found ${group.occurrences.length} occurrence(s)`,
      approved: false,
    });
  }

  return fields;
}
