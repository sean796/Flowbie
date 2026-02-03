/**
 * Search and replace operations for template files
 */

import type { TemplateFile, ReplacementOperation, ReplacementResult } from "@/components/generator/elementor/types";
import { replaceColorInString } from "./template-color-replacer";

export interface ReplaceOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  preserveFormat?: boolean; // For color replacements
}

/**
 * Perform search and replace in a single file
 */
export function replaceInFile(
  file: TemplateFile,
  oldValue: string,
  newValue: string,
  options: ReplaceOptions = {}
): { success: boolean; modifiedContent: string; error?: string } {
  try {
    const {
      caseSensitive = false,
      wholeWord = false,
      preserveFormat = true,
    } = options;

    let content = file.content;
    
    // Build regex pattern
    let pattern: string | RegExp;
    if (wholeWord) {
      pattern = new RegExp(`\\b${escapeRegex(oldValue)}\\b`, caseSensitive ? 'g' : 'gi');
    } else {
      pattern = new RegExp(escapeRegex(oldValue), caseSensitive ? 'g' : 'gi');
    }

    // Check if it's a color replacement
    const isColorReplacement = /^#?[0-9a-fA-F]{3,6}$/i.test(oldValue) || 
                               /^rgba?\(/.test(oldValue) || 
                               /^hsla?\(/.test(oldValue);

    if (isColorReplacement && preserveFormat) {
      content = replaceColorInString(content, oldValue, newValue, preserveFormat);
    } else {
      content = content.replace(pattern, newValue);
    }

    return {
      success: true,
      modifiedContent: content,
    };
  } catch (error) {
    return {
      success: false,
      modifiedContent: file.content,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Perform multiple replacements across files
 */
export function replaceInFiles(
  files: TemplateFile[],
  replacements: Array<{
    filePath: string;
    oldValue: string;
    newValue: string;
    options?: ReplaceOptions;
  }>
): ReplacementResult {
  const operations: ReplacementOperation[] = [];
  const fileMap = new Map<string, TemplateFile>();
  
  // Create file map for quick lookup
  for (const file of files) {
    fileMap.set(file.path, file);
  }

  const modifiedFiles = new Set<string>();
  let successCount = 0;
  let errorCount = 0;

  for (const replacement of replacements) {
    const file = fileMap.get(replacement.filePath);
    
    if (!file) {
      operations.push({
        fieldId: '',
        filePath: replacement.filePath,
        oldValue: replacement.oldValue,
        newValue: replacement.newValue,
        success: false,
        error: 'File not found',
      });
      errorCount++;
      continue;
    }

    const result = replaceInFile(
      file,
      replacement.oldValue,
      replacement.newValue,
      replacement.options || {}
    );

    if (result.success) {
      // Update file content
      file.content = result.modifiedContent;
      modifiedFiles.add(replacement.filePath);
      successCount++;
    } else {
      errorCount++;
    }

    operations.push({
      fieldId: '',
      filePath: replacement.filePath,
      oldValue: replacement.oldValue,
      newValue: replacement.newValue,
      success: result.success,
      error: result.error,
    });
  }

  return {
    operations,
    successCount,
    errorCount,
    totalFilesModified: modifiedFiles.size,
  };
}

/**
 * Create backup of files before modification
 */
export async function createBackup(
  files: TemplateFile[],
  basePath: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${basePath}/backup-${timestamp}`;
  
  // In a browser environment, we can't directly create directories
  // This would need to be handled by the File System Access API
  // For now, return the backup path that should be used
  
  return backupPath;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate replacement before applying
 */
export function validateReplacement(
  oldValue: string,
  newValue: string,
  fileContent: string
): { valid: boolean; error?: string } {
  if (!oldValue.trim()) {
    return { valid: false, error: 'Old value cannot be empty' };
  }

  if (oldValue === newValue) {
    return { valid: false, error: 'Old and new values are identical' };
  }

  // Check if old value exists in file
  const caseInsensitive = fileContent.toLowerCase().includes(oldValue.toLowerCase());
  const caseSensitive = fileContent.includes(oldValue);
  
  if (!caseInsensitive && !caseSensitive) {
    return { valid: false, error: 'Old value not found in file' };
  }

  return { valid: true };
}
