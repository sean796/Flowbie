/**
 * CSV Generation Module
 * Generates CSV templates from entities
 */

import { toast } from "sonner";
import type { WordPressSite } from "../../types";

/**
 * Replaces template variables in a string
 */
export function replaceTemplateVariables(
  template: string,
  entity: string,
  keyword: string = ''
): string {
  let result = template;
  result = result.replace(/{entity}/g, entity);
  result = result.replace(/{keyword}/g, keyword);
  return result;
}

export interface CSVRow {
  keyword: string;
  entity: string;
  title: string;
  optionalModifier: string;
  featuredImage: string;
}

export interface CSVGenerationOptions {
  titleFormat: string;
  keyword: string;
  optionalModifier: string;
  featuredImage: string;
}

/**
 * Generates CSV template from entities
 */
export function generateCSVTemplate(
  entities: string[],
  site: WordPressSite,
  options: CSVGenerationOptions
): void {
  if (entities.length === 0) {
    toast.error('No entities to generate CSV from');
    return;
  }

  // Generate CSV rows
  const csvRows: CSVRow[] = entities.map((entity) => {
    const title = options.titleFormat 
      ? replaceTemplateVariables(options.titleFormat, entity, options.keyword)
      : entity;
    
    return {
      keyword: options.keyword || '',
      entity: entity,
      title: title,
      optionalModifier: options.optionalModifier || '',
      featuredImage: options.featuredImage
    };
  });

  // Convert to CSV
  const headers = ['keyword', 'entity', 'title', 'optionalModifier', 'featuredImage'];
  const csvContent = [
    headers.join(','),
    ...csvRows.map(row => [
      row.keyword ? `"${row.keyword.replace(/"/g, '""')}"` : '',
      `"${row.entity.replace(/"/g, '""')}"`,
      `"${row.title.replace(/"/g, '""')}"`,
      row.optionalModifier ? `"${row.optionalModifier.replace(/"/g, '""')}"` : '',
      row.featuredImage
    ].join(','))
  ].join('\n');

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `entities-template-${site.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(`CSV template with ${entities.length} entities downloaded!`);
}
