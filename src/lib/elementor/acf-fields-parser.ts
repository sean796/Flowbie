/**
 * Utility functions for parsing and generating ACF fields template files
 */

import type { WordPressCustomizationField } from "@/components/generator/elementor/types";

/**
 * Generate a template file content from ACF fields
 * Simple format: grouped by category with human-readable field names
 */
export function generateACFFieldsTemplate(fields: WordPressCustomizationField[]): string {
  let content = `NEO DIGITAL CLIENT ONBOARDING

INSTRUCTIONS:
Please fill out the fields below as accurately as possible. This data is essential for setting up your WordPress site.

`;

  // Group fields by category
  const categories: Record<string, WordPressCustomizationField[]> = {
    'COMPANY OVERVIEW': [],
    'LOCATION DETAILS': [],
    'SOCIAL MEDIA': [],
    'BUSINESS HOURS': [],
    'BRAND ASSETS': [],
    'OTHER': [],
  };

  for (const field of fields) {
    const fieldName = field.field.toLowerCase();
    const acfFieldName = (field.location.acfFieldName || '').toLowerCase();
    
    if (fieldName.includes('company') || fieldName.includes('name') || 
        fieldName.includes('email') || fieldName.includes('phone') ||
        acfFieldName.includes('company') || acfFieldName.includes('email') || acfFieldName.includes('phone')) {
      categories['COMPANY OVERVIEW'].push(field);
    } else if (fieldName.includes('address') || fieldName.includes('location') || 
               fieldName.includes('maps') || fieldName.includes('google') ||
               acfFieldName.includes('address') || acfFieldName.includes('maps')) {
      categories['LOCATION DETAILS'].push(field);
    } else if (fieldName.includes('facebook') || fieldName.includes('instagram') || 
               fieldName.includes('linkedin') || fieldName.includes('social') ||
               acfFieldName.includes('facebook') || acfFieldName.includes('instagram') || acfFieldName.includes('linkedin')) {
      categories['SOCIAL MEDIA'].push(field);
    } else if (fieldName.includes('hour') || fieldName.includes('time') || 
               fieldName.includes('monday') || fieldName.includes('friday') || 
               fieldName.includes('saturday') || fieldName.includes('sunday') ||
               acfFieldName.includes('hour') || acfFieldName.includes('monday') || acfFieldName.includes('friday')) {
      categories['BUSINESS HOURS'].push(field);
    } else if (fieldName.includes('logo') || fieldName.includes('image') || 
               fieldName.includes('brand') || acfFieldName.includes('logo')) {
      categories['BRAND ASSETS'].push(field);
    } else {
      categories['OTHER'].push(field);
    }
  }

  // Generate content for each category
  for (const [categoryName, categoryFields] of Object.entries(categories)) {
    if (categoryFields.length === 0) continue;
    
    content += `${categoryName}:\n`;
    for (const field of categoryFields) {
      // Use human-readable field name, not ACF field name
      content += `${field.field}:\n`;
    }
    content += `\n`;
  }

  return content.trim();
}

/**
 * Parse ACF fields template file and return updated fields
 * Simple format: Field Name: value (one per line, grouped by category)
 */
export function parseACFFieldsTemplate(
  content: string,
  existingFields: WordPressCustomizationField[]
): WordPressCustomizationField[] {
  const updates = new Map<string, string>(); // Map field display name to new value
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines, instructions, and category headers
    if (!trimmed || trimmed === 'NEO DIGITAL CLIENT ONBOARDING' || 
        trimmed.startsWith('INSTRUCTIONS:') || trimmed.endsWith(':') && 
        (trimmed.includes('OVERVIEW') || trimmed.includes('DETAILS') || 
         trimmed.includes('MEDIA') || trimmed.includes('HOURS') || trimmed.includes('ASSETS'))) {
      continue;
    }

    // Parse key-value pairs: Field Name: value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const fieldName = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    // Only update if value is not empty
    if (fieldName && value) {
      updates.set(fieldName, value);
    }
  }

  // Apply updates to existing fields by matching field display name
  return existingFields.map(field => {
    if (updates.has(field.field)) {
      return {
        ...field,
        suggestedValue: updates.get(field.field) || field.suggestedValue,
      };
    }
    return field;
  });
}

/**
 * Download ACF fields as a template file
 */
export function downloadACFFieldsTemplate(fields: WordPressCustomizationField[]): void {
  const content = generateACFFieldsTemplate(fields);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'acf-fields-template.txt';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
