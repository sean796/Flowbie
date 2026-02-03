/**
 * File search/grep functionality for template files
 */

import type { TemplateFile } from "@/components/generator/elementor/types";

export interface GrepResult {
  filePath: string;
  lineNumber: number;
  line: string;
  matches: RegExpMatchArray[];
}

export interface GrepOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
}

/**
 * Search for patterns across template files
 */
export function grepTemplateFiles(
  files: TemplateFile[],
  pattern: string | RegExp,
  options: GrepOptions = {}
): GrepResult[] {
  const {
    caseSensitive = false,
    wholeWord = false,
    maxResults = 1000,
  } = options;

  const results: GrepResult[] = [];
  let resultCount = 0;

  // Convert string pattern to RegExp
  let regex: RegExp;
  if (pattern instanceof RegExp) {
    regex = pattern;
  } else {
    let patternStr = pattern;
    if (wholeWord) {
      patternStr = `\\b${patternStr}\\b`;
    }
    regex = new RegExp(patternStr, caseSensitive ? 'g' : 'gi');
  }

  for (const file of files) {
    if (resultCount >= maxResults) break;

    const lines = file.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (resultCount >= maxResults) break;

      const line = lines[i];
      const matches = Array.from(line.matchAll(regex));
      
      if (matches.length > 0) {
        results.push({
          filePath: file.path,
          lineNumber: i + 1, // 1-indexed
          line: line.trim(),
          matches: matches,
        });
        resultCount += matches.length;
      }
    }
  }

  return results;
}

/**
 * Search for URLs in template files
 */
export function grepUrls(files: TemplateFile[]): GrepResult[] {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  return grepTemplateFiles(files, urlPattern, { caseSensitive: false });
}

/**
 * Search for email addresses in template files
 */
export function grepEmails(files: TemplateFile[]): GrepResult[] {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return grepTemplateFiles(files, emailPattern, { caseSensitive: false });
}

/**
 * Search for phone numbers in template files
 */
export function grepPhones(files: TemplateFile[]): GrepResult[] {
  const phonePattern = /[\d\s\(\)\-\+\.]{10,}/g;
  return grepTemplateFiles(files, phonePattern, { caseSensitive: false });
}

/**
 * Search for color values in template files
 */
export function grepColors(files: TemplateFile[]): GrepResult[] {
  // Match hex colors, RGB, RGBA, HSL, and CSS color names
  const colorPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/gi;
  return grepTemplateFiles(files, colorPattern, { caseSensitive: false });
}

/**
 * Search for specific text patterns
 */
export function grepText(
  files: TemplateFile[],
  searchText: string,
  options: GrepOptions = {}
): GrepResult[] {
  return grepTemplateFiles(files, searchText, options);
}

/**
 * Search for business names in template files
 * Looks for capitalized words with company suffixes
 */
export function grepBusinessNames(files: TemplateFile[]): GrepResult[] {
  const businessNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co|Group|Solutions|Services|Digital|Tech|Technologies|Systems|Software|Design|Marketing|Media|Agency|Consulting))?)\b/g;
  return grepTemplateFiles(files, businessNamePattern, { caseSensitive: false, maxResults: 500 });
}

/**
 * Search for addresses in template files
 * Looks for street addresses with postal codes
 */
export function grepAddresses(files: TemplateFile[]): GrepResult[] {
  const addressPattern = /\b\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Ct|Court|Place|Pl)\b[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/gi;
  return grepTemplateFiles(files, addressPattern, { caseSensitive: false, maxResults: 200 });
}

/**
 * Group matches by their normalized value
 */
export function groupMatchesByValue(matches: GrepResult[]): Map<string, GrepResult[]> {
  const grouped = new Map<string, GrepResult[]>();

  for (const match of matches) {
    // Extract the matched value
    const value = match.matches[0]?.[0] || '';
    const normalized = value.toLowerCase().trim();

    if (!grouped.has(normalized)) {
      grouped.set(normalized, []);
    }

    grouped.get(normalized)!.push(match);
  }

  return grouped;
}
