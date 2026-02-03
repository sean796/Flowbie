/**
 * Content Sanitizer
 * Cleans content before WordPress upload to remove placeholder artifacts
 * and enforce image-per-section limits
 */

// Placeholder patterns to strip - these break live pages if they slip through
const PLACEHOLDER_PATTERNS = [
  /\[table\]/gi,
  /\[\/table\]/gi,
  /\[list\]/gi,
  /\[\/list\]/gi,
  /\[image\]/gi,
  /\[\/image\]/gi,
  /\[img\]/gi,
  /\[\/img\]/gi,
  /\[caption\]/gi,
  /\[\/caption\]/gi,
  /\[code\]/gi,
  /\[\/code\]/gi,
  /\[quote\]/gi,
  /\[\/quote\]/gi,
  /\[video\]/gi,
  /\[\/video\]/gi,
  /\[embed\]/gi,
  /\[\/embed\]/gi,
  /\[gallery\]/gi,
  /\[\/gallery\]/gi,
  /\[button\]/gi,
  /\[\/button\]/gi,
  /\[link\]/gi,
  /\[\/link\]/gi,
  /\[divider\]/gi,
  /\[\/divider\]/gi,
  /\[spacer\]/gi,
  /\[\/spacer\]/gi,
  /\[section\]/gi,
  /\[\/section\]/gi,
  /\[column\]/gi,
  /\[\/column\]/gi,
  /\[row\]/gi,
  /\[\/row\]/gi,
  /\[widget\]/gi,
  /\[\/widget\]/gi,
  /\[shortcode\]/gi,
  /\[\/shortcode\]/gi,
  // Dynamic placeholder patterns
  /\[placeholder[^\]]*\]/gi,
  /\[insert[^\]]*\]/gi,
  /\[add[^\]]*\]/gi,
  /\[TODO[^\]]*\]/gi,
  /\[FIXME[^\]]*\]/gi,
  /\[NOTE[^\]]*\]/gi,
  /\[EDIT[^\]]*\]/gi,
  /\[REMOVE[^\]]*\]/gi,
  /\[DELETE[^\]]*\]/gi,
  /\[REPLACE[^\]]*\]/gi,
  /\[UPDATE[^\]]*\]/gi,
  /\[CHANGE[^\]]*\]/gi,
  /\[FIX[^\]]*\]/gi,
  // Common AI artifacts
  /\[insert image here\]/gi,
  /\[insert link here\]/gi,
  /\[insert table here\]/gi,
  /\[add content here\]/gi,
  /\[your content here\]/gi,
  /\[content placeholder\]/gi,
  /\[image placeholder\]/gi,
  /\[table placeholder\]/gi,
];

/**
 * Sanitize placeholder artifacts from content
 * MUST be called before any WordPress upload to prevent broken pages
 */
export function sanitizePlaceholders(content: string): string {
  if (!content) return content;
  
  let sanitized = content;
  let removedCount = 0;
  
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      removedCount += matches.length;
    }
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Clean up empty paragraphs left behind
  sanitized = sanitized.replace(/<p>\s*<\/p>/gi, '');
  sanitized = sanitized.replace(/<p>&nbsp;<\/p>/gi, '');
  
  // Clean up multiple consecutive empty lines (more than 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Clean up empty divs
  sanitized = sanitized.replace(/<div>\s*<\/div>/gi, '');
  
  // Clean up empty spans
  sanitized = sanitized.replace(/<span>\s*<\/span>/gi, '');
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} placeholder artifact(s) from content`);
  }
  
  return sanitized.trim();
}

/**
 * Remove all colons from content and replace with periods
 * Colons break markdown table syntax and should never appear in generated content
 * CRITICAL: Preserves colons in URLs (http://, https://, and markdown image/link syntax)
 */
export function removeColons(content: string): string {
  if (!content) return content;
  
  // Count colons before removal for logging (excluding URLs)
  // Pattern matches: markdown images/links, HTML img/href attributes, and standalone URLs
  const urlPattern = /(https?:\/\/[^\s\)"<>]+|!\[[^\]]*\]\([^\)]+\)|\[[^\]]*\]\([^\)]+\)|<img[^>]*src=["']https?:\/\/[^"']+["'][^>]*>|<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>)/gi;
  const urlMatches = content.match(urlPattern) || [];
  const contentWithoutUrls = urlMatches.reduce((acc, url) => acc.replace(url, ''), content);
  const colonCount = (contentWithoutUrls.match(/:/g) || []).length;
  
  // Replace colons, but preserve URLs by temporarily replacing them with placeholders
  const urlPlaceholders: string[] = [];
  let placeholderIndex = 0;
  
  // Replace URLs with placeholders
  const contentWithPlaceholders = content.replace(urlPattern, (match) => {
    const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
    urlPlaceholders.push(match);
    placeholderIndex++;
    return placeholder;
  });
  
  // Replace colons in content (excluding URLs)
  let sanitized = contentWithPlaceholders.replace(/:/g, '.');
  
  // Restore URLs
  urlPlaceholders.forEach((url, index) => {
    sanitized = sanitized.replace(`__URL_PLACEHOLDER_${index}__`, url);
  });

  if (colonCount > 0) {
    console.log(`[Content Sanitizer] Removed ${colonCount} colon(s) from content (replaced with periods, preserved URLs)`);
  }
  
  return sanitized;
}

/**
 * Remove all em dashes from content and replace with comma and space
 * Em dashes can cause formatting issues and should be replaced
 * CRITICAL: Preserves em dashes in URLs (though unlikely, but safe)
 */
export function removeEmDashes(content: string): string {
  if (!content) return content;
  
  // Count em dashes before removal (both — and — Unicode characters)
  const emDashPattern = /—|—/g;
  
  // Preserve URLs by temporarily replacing them with placeholders
  // Pattern matches: markdown images/links, HTML img/href attributes, and standalone URLs
  const urlPattern = /(https?:\/\/[^\s\)"<>]+|!\[[^\]]*\]\([^\)]+\)|\[[^\]]*\]\([^\)]+\)|<img[^>]*src=["']https?:\/\/[^"']+["'][^>]*>|<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>)/gi;
  const urlPlaceholders: string[] = [];
  let placeholderIndex = 0;
  
  // Replace URLs with placeholders
  const contentWithPlaceholders = content.replace(urlPattern, (match) => {
    const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
    urlPlaceholders.push(match);
    placeholderIndex++;
    return placeholder;
  });
  
  // Count em dashes in content (excluding URLs)
  const urlMatches = content.match(urlPattern) || [];
  const contentWithoutUrls = urlMatches.reduce((acc, url) => acc.replace(url, ''), content);
  const emDashCount = (contentWithoutUrls.match(emDashPattern) || []).length;
  
  // Replace em dashes in content (excluding URLs)
  let sanitized = contentWithPlaceholders.replace(emDashPattern, ', ');
  
  // Restore URLs
  urlPlaceholders.forEach((url, index) => {
    sanitized = sanitized.replace(`__URL_PLACEHOLDER_${index}__`, url);
  });
  
  if (emDashCount > 0) {
    console.log(`[Content Sanitizer] Removed ${emDashCount} em dash(es) from content (replaced with comma and space, preserved URLs)`);
  }
  
  return sanitized;
}

/**
 * Enforce maximum 1 image per H2 section
 * Prevents image bloat during re-optimization
 */
export function enforceOneImagePerSection(html: string): string {
  if (!html) return html;
  
  // Split by H2 tags while preserving them
  const h2Regex = /(<h2[^>]*>)/gi;
  const parts = html.split(h2Regex);
  
  let totalRemoved = 0;
  
  const processedParts = parts.map((part, index) => {
    // H2 tags themselves (odd indices after split) should be preserved as-is
    if (index > 0 && h2Regex.test(parts[index - 1])) {
      // Reset regex lastIndex
      h2Regex.lastIndex = 0;
    }
    
    // For content sections (not H2 tags themselves)
    // Check if this part starts with an H2 tag or is content after an H2
    if (!part.match(/^<h2[^>]*>/i)) {
      // This is content, not an H2 tag
      // Count images in this section
      const imgRegex = /<img[^>]*>/gi;
      const images = part.match(imgRegex);
      
      if (images && images.length > 1) {
        // Keep only the first image
        let imageCount = 0;
        const cleaned = part.replace(imgRegex, (match) => {
          imageCount++;
          if (imageCount === 1) {
            return match; // Keep first image
          }
          totalRemoved++;
          return ''; // Remove subsequent images
        });
        return cleaned;
      }
    }
    
    return part;
  });
  
  if (totalRemoved > 0) {
    console.log(`[Content Sanitizer] Removed ${totalRemoved} extra image(s) to enforce 1 image per section rule`);
  }
  
  return processedParts.join('');
}

/**
 * Remove forbidden section headings
 * Detects and removes entire sections with forbidden headings like "External Resources"
 * CRITICAL: Prevents sections that should never appear in published content
 */
export function removeForbiddenSections(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Patterns to match forbidden section headings (case-insensitive)
  const forbiddenPatterns = [
    /external\s+resource/i,           // "External Resources", "external resources", etc.
    /external\s+link/i,               // "External Links", "external links", etc.
    /external\s+reference/i,         // "External References", etc.
    /external\s+site/i,               // "External Sites", etc.
    /external\s+website/i,            // "External Websites", etc.
    /additional\s+resource/i,        // "Additional Resources" (often used for external links)
    /helpful\s+resource/i,           // "Helpful Resources" (often external)
    /useful\s+resource/i,            // "Useful Resources" (often external)
    /related\s+resource/i,          // "Related Resources" (often external)
  ];
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let skipSection = false;
  let skipSectionLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      
      // Check if this heading matches any forbidden pattern
      const isForbidden = forbiddenPatterns.some(pattern => pattern.test(text));
      
      if (isForbidden) {
        // Start skipping this section
        skipSection = true;
        skipSectionLevel = level;
        removedCount++;
        console.log(`[Content Sanitizer] Removing forbidden section: "${line.trim()}"`);
        continue; // Skip this heading line
      } else if (skipSection) {
        // We're in a forbidden section - check if we've reached a heading of same or higher level
        if (level <= skipSectionLevel) {
          // We've reached the next section at same or higher level - stop skipping
          skipSection = false;
          skipSectionLevel = 0;
          // Re-check this heading in case it's also forbidden (shouldn't happen, but be safe)
          if (!isForbidden) {
            fixedLines.push(line);
          }
        } else {
          // Still in the forbidden section (sub-heading) - continue skipping
          continue;
        }
      } else {
        // Normal heading, not forbidden - include it
        fixedLines.push(line);
      }
    } else {
      // Not a heading
      if (skipSection) {
        // Still in forbidden section - skip this line
        continue;
      } else {
        // Normal content - include it
        fixedLines.push(line);
      }
    }
  }
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} forbidden section(s) (e.g., "External Resources")`);
  }
  
  return fixedLines.join('\n');
}

/**
 * Remove duplicate consecutive headings
 * Detects and removes headings that appear consecutively with identical text
 * Example: "## Heading\n## Heading" -> "## Heading"
 * CRITICAL: Prevents duplicate headings from appearing in published content
 */
export function removeDuplicateHeadings(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern to match markdown headings (##, ###, ####, etc.)
  // Matches: heading level (#), optional space, heading text, optional trailing spaces
  const headingPattern = /^(#{1,6})\s+(.+?)\s*$/gm;
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let previousHeading: { level: string; text: string } | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    
    if (headingMatch) {
      const level = headingMatch[1];
      const text = headingMatch[2].trim();
      
      // Check if this heading is a duplicate of the previous one
      if (previousHeading && 
          previousHeading.level === level && 
          previousHeading.text.toLowerCase() === text.toLowerCase()) {
        // This is a duplicate - skip it
        removedCount++;
        console.log(`[Content Sanitizer] Removed duplicate heading: "${line.trim()}"`);
        continue; // Skip this line
      }
      
      // Not a duplicate - keep it and update previous heading
      previousHeading = { level, text };
      fixedLines.push(line);
    } else {
      // Not a heading - reset previous heading tracking and keep the line
      // Only reset if this line has actual content (not just whitespace)
      if (line.trim().length > 0) {
        previousHeading = null;
      }
      fixedLines.push(line);
    }
  }
  
  fixed = fixedLines.join('\n');
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} duplicate heading(s)`);
  }
  
  return fixed;
}

/**
 * Remove empty markdown tables
 * Detects and removes tables that have headers but no data rows
 * Also removes tables with only empty data rows (whitespace-only cells)
 * 
 * SCENARIOS HANDLED:
 * 1. Table with only header and separator (no data rows):
 *    | Service/Product Name | Description |
 *    |----------------------|-------------|
 *    -> REMOVED (empty table)
 * 
 * 2. Table with header, separator, and empty data rows:
 *    | Header | Header |
 *    |--------|--------|
 *    |       |        |
 *    -> REMOVED (empty data rows)
 * 
 * 3. Table with header, separator, and valid data:
 *    | Header | Header |
 *    |--------|--------|
 *    | Data 1 | Data 2 |
 *    -> KEPT (valid table)
 * 
 * CRITICAL: Prevents empty tables from appearing in published content
 */
export function removeEmptyTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern to match markdown tables
  // A table consists of:
  // 1. Header row: | Header | Header |
  // 2. Separator row: |---|---| or |:---|---:|
  // 3. Data rows: | Data | Data | (optional, but required for valid table)
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let inTable = false;
  let tableStartIndex = -1;
  let tableLines: string[] = [];
  let dataRows: string[] = [];
  let hasSeparator = false;
  
  // Helper function to check if a table row is empty (only whitespace in cells)
  const isEmptyDataRow = (row: string): boolean => {
    // Remove leading/trailing pipes and split by pipe
    const cells = row.trim().split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
    // Check if all cells are empty or whitespace-only
    return cells.length === 0 || cells.every(cell => cell.trim().length === 0);
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparatorRow = /^\s*\|[\s\-:]+\|\s*$/.test(line.trim());
    
    if (isTableRow && !isSeparatorRow) {
      // This is a table row (header or data)
      if (!inTable) {
        // Starting a new table
        inTable = true;
        tableStartIndex = i;
        tableLines = [line];
        dataRows = [];
        hasSeparator = false;
      } else {
        // Continuing existing table
        tableLines.push(line);
        // Check if this is a data row (we've seen separator, so this is data, not header)
        if (hasSeparator) {
          // We've seen header + separator, so this is a data row
          // Check if it's not empty
          if (!isEmptyDataRow(line)) {
            dataRows.push(line);
          }
        }
      }
    } else if (isSeparatorRow && inTable) {
      // This is the separator row (|---|---|)
      tableLines.push(line);
      hasSeparator = true;
    } else {
      // Not a table row - end current table if we're in one
      if (inTable) {
        // Check if table has valid data rows
        // A valid table should have: header + separator + at least one non-empty data row
        const hasValidDataRows = dataRows.length > 0;
        
        if (!hasValidDataRows && tableLines.length >= 2) {
          // Empty table (no data rows or only empty data rows) - remove it
          removedCount++;
          const tablePreview = tableLines[0]?.substring(0, 60) || 'unknown';
          console.log(`[Content Sanitizer] Removed empty table starting at line ${tableStartIndex + 1}: "${tablePreview}..." (had ${tableLines.length} lines, ${dataRows.length} data rows)`);
          // Don't add these lines to fixedLines
        } else {
          // Valid table with data - keep it
          fixedLines.push(...tableLines);
        }
        // Reset table state
        inTable = false;
        tableStartIndex = -1;
        tableLines = [];
        dataRows = [];
        hasSeparator = false;
      }
      // Add the current non-table line
      fixedLines.push(line);
    }
  }
  
  // Handle table at end of content
  if (inTable) {
    const hasValidDataRows = dataRows.length > 0;
    if (!hasValidDataRows && tableLines.length >= 2) {
      // Empty table at end - remove it
      removedCount++;
      const tablePreview = tableLines[0]?.substring(0, 60) || 'unknown';
      console.log(`[Content Sanitizer] Removed empty table at end of content: "${tablePreview}..." (had ${tableLines.length} lines, ${dataRows.length} data rows)`);
    } else {
      // Valid table - keep it
      fixedLines.push(...tableLines);
    }
  }
  
  fixed = fixedLines.join('\n');
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} empty table(s) (tables with headers but no valid data rows)`);
  }
  
  return fixed;
}

/**
 * Remove "Article Title" labels and similar metadata text from content
 * Removes lines like "Article Title: ..." or "**Article Title.** ..." that shouldn't appear in published content
 * CRITICAL: Prevents metadata labels from appearing in the main content body
 */
export function removeArticleTitleLabels(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Patterns to match "Article Title" labels in various formats
  const articleTitlePatterns = [
    /^\s*\*\*Article Title[\.:]\*\*\s*.+$/i,  // **Article Title.** or **Article Title:**
    /^\s*\*\*Article Title\*\*\s*[\.:]\s*.+$/i,  // **Article Title** : or **Article Title** .
    /^\s*Article Title[\.:]\s*.+$/i,  // Article Title: or Article Title.
    /^\s*\*\*Article Title\*\*\s*$/i,  // **Article Title** (standalone)
    /^\s*Article Title\s*$/i,  // Article Title (standalone)
  ];
  
  const lines = fixed.split('\n');
  const fixedLines = lines.filter((line, index) => {
    for (const pattern of articleTitlePatterns) {
      if (pattern.test(line.trim())) {
        removedCount++;
        console.log(`[Content Sanitizer] Removed "Article Title" label at line ${index + 1}: "${line.trim().substring(0, 50)}"`);
        return false; // Remove this line
      }
    }
    return true; // Keep this line
  });
  
  fixed = fixedLines.join('\n');
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} "Article Title" label(s)`);
  }
  
  return fixed;
}

/**
 * Fix malformed link formats
 * Detects and removes links that use incorrect formats like [URL: ...] 
 * These formats indicate links are appended rather than contextually integrated
 * CRITICAL: Links must be in proper markdown format [anchor text](url) and integrated contextually for better SEO
 */
export function fixMalformedLinks(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern 1: [URL: https://...] or [URL:http://...] format - REMOVE these entirely
  // They're not properly integrated and should be removed rather than converted
  // The AI should integrate links contextually, not append them
  const urlPattern1 = /\[URL:\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(urlPattern1, (match) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed malformed link format [URL: ...]: "${match.substring(0, 60)}..." (links must be integrated contextually, not appended)`);
    return ''; // Remove entirely - links should be integrated by AI, not appended
  });
  
  // Pattern 2: [url: ...] (lowercase) - REMOVE these entirely
  const urlPattern2 = /\[url:\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(urlPattern2, (match) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed malformed link format [url: ...]: "${match.substring(0, 60)}..." (links must be integrated contextually, not appended)`);
    return ''; // Remove entirely
  });
  
  // Pattern 3: Links appended at end of sentences/descriptions
  // Pattern: text ending with period/full stop, then space, then [URL: ...] or [url: ...]
  // This indicates a link was appended rather than integrated
  const appendedLinkPattern = /\.\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkPattern, (match) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link at end of sentence: "${match.substring(0, 60)}..." (links must be integrated contextually)`);
    return '.'; // Keep the period, remove the appended link
  });
  
  // Pattern 4: Links in table cells that are just appended (not integrated)
  // Look for table cells ending with [URL: ...] or [url: ...]
  // Match: | content [URL: https://...] |
  const tableCellAppendedPattern = /\|\s*([^|]*?)\s*\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]\s*\|/gi;
  fixed = fixed.replace(tableCellAppendedPattern, (match, cellContent) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link from table cell: "[URL: ...]" (links must be integrated into cell content, not appended)`);
    // Remove the [URL: ...] part, keep the cell content
    return `| ${cellContent.trim()} |`;
  });
  
  // Pattern 5: Links appended without period before them
  // Match: text [URL: https://...] (no period before)
  const appendedLinkNoPeriodPattern = /([^\s])\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkNoPeriodPattern, (match, beforeChar) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link: "[URL: ...]" (links must be integrated contextually, not appended)`);
    return beforeChar; // Keep the character before, remove the appended link
  });
  
  // Clean up any double spaces or trailing spaces left after removal
  fixed = fixed.replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
  fixed = fixed.replace(/\s+\./g, '.'); // Remove spaces before periods
  fixed = fixed.replace(/\|\s+\|/g, '| |'); // Fix empty table cells with extra spaces
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} malformed/appended link(s) - links must be integrated contextually into content, not appended as [URL: ...]`);
  }
  
  return fixed;
}

/**
 * Remove link columns from tables
 * Detects tables with dedicated link columns (like "Relevant Internal Links", "Links", etc.)
 * and removes those columns entirely
 * CRITICAL: Links must be contextually integrated into content columns for better SEO, not in separate columns
 */
export function removeLinkColumnsFromTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let fixedCount = 0;
  
  // Patterns to match link column headers (case-insensitive)
  const linkColumnKeywords = [
    'relevant internal links',
    'relevant links',
    'internal links',
    'links',
    'link',
    'direct link',
    'view product',
    'related links',
    'product links',
    'service links',
  ];
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let inTable = false;
  let tableStartIndex = -1;
  let linkColumnIndex = -1;
  let headerCells: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparatorRow = /^\s*\|[\s\-:]+\|\s*$/.test(line.trim());
    
    if (isTableRow && !isSeparatorRow) {
      if (!inTable) {
        // Starting a new table - check header for link column
        inTable = true;
        tableStartIndex = i;
        linkColumnIndex = -1;
        
        // Parse header cells
        headerCells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        
        // Check each cell to see if it's a link column
        for (let j = 0; j < headerCells.length; j++) {
          const cellLower = headerCells[j].toLowerCase();
          if (linkColumnKeywords.some(keyword => cellLower.includes(keyword))) {
            linkColumnIndex = j;
            fixedCount++;
            console.log(`[Content Sanitizer] Detected link column "${headerCells[j]}" at index ${j} in table starting at line ${tableStartIndex + 1}`);
            break;
          }
        }
        
        // If we found a link column, remove it from header
        if (linkColumnIndex >= 0) {
          const newHeaderCells = [...headerCells];
          newHeaderCells.splice(linkColumnIndex, 1);
          fixedLines.push('| ' + newHeaderCells.join(' | ') + ' |');
        } else {
          fixedLines.push(line);
        }
      } else {
        // Data row - remove link column if detected
        if (linkColumnIndex >= 0) {
          const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
          if (cells.length > linkColumnIndex) {
            const newCells = [...cells];
            newCells.splice(linkColumnIndex, 1);
            fixedLines.push('| ' + newCells.join(' | ') + ' |');
          } else {
            fixedLines.push(line);
          }
        } else {
          fixedLines.push(line);
        }
      }
    } else if (isSeparatorRow && inTable) {
      // Separator row - adjust for removed column
      if (linkColumnIndex >= 0) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length > linkColumnIndex) {
          const newCells = [...cells];
          newCells.splice(linkColumnIndex, 1);
          const separator = '| ' + newCells.map(() => '---').join(' | ') + ' |';
          fixedLines.push(separator);
        } else {
          fixedLines.push(line);
        }
      } else {
        fixedLines.push(line);
      }
    } else {
      // Not a table row - end current table
      if (inTable) {
        inTable = false;
        linkColumnIndex = -1;
        headerCells = [];
      }
      fixedLines.push(line);
    }
  }
  
  // Handle table at end
  if (inTable) {
    inTable = false;
  }
  
  fixed = fixedLines.join('\n');
  
  if (fixedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${fixedCount} link column(s) from table(s) - links should be integrated into content columns for better SEO`);
  }
  
  return fixed;
}

/**
 * Fix malformed FAQ tables that use Q./A. format instead of proper table rows
 * Converts Q./A. format to proper two-column markdown table format
 * Example: "Q. Question?\nA. Answer." -> "| Question? | Answer. |"
 * CRITICAL: FAQ tables MUST use proper markdown table format, not Q./A. paragraphs
 */
export function fixMalformedFAQTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let fixedCount = 0;
  
  // Pattern to detect FAQ sections with Q./A. format
  // Look for sections that have:
  // 1. FAQ header (## Frequently Asked Questions...)
  // 2. Followed by Q./A. format instead of table format
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let inFAQSection = false;
  let faqHeaderIndex = -1;
  let qaPairs: Array<{ question: string; answer: string }> = [];
  let collectingQA = false;
  let currentQuestion = '';
  let currentAnswer = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is an FAQ header
    const isFAQHeader = /^##\s+Frequently Asked Questions/i.test(line.trim());
    
    // Check if this line starts with "Q." or "Q:"
    const isQuestionLine = /^\s*(Q\.|Q:)\s+(.+)$/i.test(line.trim());
    
    // Check if this line starts with "A." or "A:"
    const isAnswerLine = /^\s*(A\.|A:)\s+(.+)$/i.test(line.trim());
    
    // Check if this looks like a malformed table header (e.g., "| Q&A |")
    const isMalformedTableHeader = /^\s*\|[\s]*Q[&\s]*A[\s]*\|/i.test(line.trim());
    
    // Check if this is a table separator that might be part of malformed table
    const isTableSeparator = /^\s*\|[\s\-:]+\|\s*$/.test(line.trim());
    
    if (isFAQHeader) {
      // Starting an FAQ section
      inFAQSection = true;
      faqHeaderIndex = i;
      qaPairs = [];
      collectingQA = false;
      fixedLines.push(line);
    } else if (inFAQSection) {
      // We're in an FAQ section
      
      if (isMalformedTableHeader || (isTableSeparator && qaPairs.length === 0)) {
        // This is a malformed table header/separator - skip it
        fixedCount++;
        console.log(`[Content Sanitizer] Detected malformed FAQ table header/separator, will convert Q./A. format to proper table`);
        collectingQA = true;
        continue; // Skip this line
      } else if (isQuestionLine) {
        // Save previous Q/A pair if exists
        if (currentQuestion && currentAnswer) {
          qaPairs.push({ question: currentQuestion.trim(), answer: currentAnswer.trim() });
        }
        // Start new question
        const match = line.match(/^\s*(Q\.|Q:)\s+(.+)$/i);
        currentQuestion = match ? match[2] : '';
        currentAnswer = '';
        collectingQA = true;
        // Don't add this line - we'll convert it to table format
      } else if (isAnswerLine && collectingQA) {
        // This is an answer line
        const match = line.match(/^\s*(A\.|A:)\s+(.+)$/i);
        if (match) {
          currentAnswer = match[2];
          // Remove trailing pipe if present (common in malformed tables)
          currentAnswer = currentAnswer.replace(/\s*\|\s*$/, '').trim();
        }
        // Don't add this line - we'll convert it to table format
      } else if (collectingQA && currentQuestion && line.trim().length > 0 && !isQuestionLine) {
        // Continuation of answer (multi-line answer)
        if (currentAnswer) {
          currentAnswer += ' ' + line.trim().replace(/\s*\|\s*$/, '');
        } else {
          currentAnswer = line.trim().replace(/\s*\|\s*$/, '');
        }
        // Don't add this line
      } else if (line.trim().startsWith('|') && line.trim().endsWith('|') && !isTableSeparator) {
        // This might be a proper table row - check if we have Q/A pairs to convert first
        if (qaPairs.length > 0 || (currentQuestion && currentAnswer)) {
          // We have Q/A pairs to convert - do that first
          if (currentQuestion && currentAnswer) {
            qaPairs.push({ question: currentQuestion.trim(), answer: currentAnswer.trim() });
            currentQuestion = '';
            currentAnswer = '';
          }
          
          // Convert Q/A pairs to proper table format
          if (qaPairs.length > 0) {
            const pairCount = qaPairs.length;
            fixedLines.push('| Question | Helpful Answer |');
            fixedLines.push('|----------|----------------|');
            qaPairs.forEach(pair => {
              // Escape pipes in content
              const question = pair.question.replace(/\|/g, '\\|');
              const answer = pair.answer.replace(/\|/g, '\\|');
              fixedLines.push(`| ${question} | ${answer} |`);
            });
            qaPairs = [];
            fixedCount++;
            console.log(`[Content Sanitizer] Converted ${pairCount} Q./A. pairs to proper FAQ table format`);
          }
        }
        // Add the proper table row
        fixedLines.push(line);
        collectingQA = false;
      } else if (line.trim().length === 0 && collectingQA && currentQuestion && currentAnswer) {
        // Empty line - might be separator between Q/A pairs
        // Save current Q/A pair
        qaPairs.push({ question: currentQuestion.trim(), answer: currentAnswer.trim() });
        currentQuestion = '';
        currentAnswer = '';
        // Don't add empty line yet
      } else if (!collectingQA || line.trim().length === 0) {
        // Not part of Q/A collection, or empty line when not collecting
        if (qaPairs.length > 0 || (currentQuestion && currentAnswer)) {
          // We have Q/A pairs to convert
          if (currentQuestion && currentAnswer) {
            qaPairs.push({ question: currentQuestion.trim(), answer: currentAnswer.trim() });
            currentQuestion = '';
            currentAnswer = '';
          }
          
          // Convert Q/A pairs to proper table format
          if (qaPairs.length > 0) {
            fixedLines.push('| Question | Helpful Answer |');
            fixedLines.push('|----------|----------------|');
            qaPairs.forEach(pair => {
              const question = pair.question.replace(/\|/g, '\\|');
              const answer = pair.answer.replace(/\|/g, '\\|');
              fixedLines.push(`| ${question} | ${answer} |`);
            });
            qaPairs = [];
            fixedCount++;
            console.log(`[Content Sanitizer] Converted Q./A. format to proper FAQ table format`);
          }
        }
        fixedLines.push(line);
        collectingQA = false;
      }
      // If we reach here and we're still collecting but hit non-Q/A content, end FAQ section
      if (!isQuestionLine && !isAnswerLine && !collectingQA && line.trim().length > 0 && !line.trim().startsWith('|')) {
        inFAQSection = false;
        fixedLines.push(line);
      }
    } else {
      // Not in FAQ section - keep line as-is
      fixedLines.push(line);
    }
  }
  
  // Handle Q/A pairs at end of content (if we were still collecting)
  if (inFAQSection && (currentQuestion && currentAnswer || qaPairs.length > 0)) {
    if (currentQuestion && currentAnswer) {
      qaPairs.push({ question: currentQuestion.trim(), answer: currentAnswer.trim() });
    }
    if (qaPairs.length > 0) {
      const pairCount = qaPairs.length;
      // Insert table after the FAQ header
      // Find the FAQ header in fixedLines
      let insertIndex = -1;
      for (let i = 0; i < fixedLines.length; i++) {
        if (/^##\s+Frequently Asked Questions/i.test(fixedLines[i].trim())) {
          insertIndex = i;
          break;
        }
      }
      if (insertIndex >= 0) {
        // Check if there's already a table after the header
        let hasTableAfter = false;
        for (let i = insertIndex + 1; i < fixedLines.length && i < insertIndex + 5; i++) {
          if (fixedLines[i].trim().startsWith('| Question |')) {
            hasTableAfter = true;
            break;
          }
        }
        if (!hasTableAfter) {
          fixedLines.splice(insertIndex + 1, 0, 
            '| Question | Helpful Answer |',
            '|----------|----------------|',
            ...qaPairs.map(pair => {
              const question = pair.question.replace(/\|/g, '\\|');
              const answer = pair.answer.replace(/\|/g, '\\|');
              return `| ${question} | ${answer} |`;
            })
          );
          fixedCount++;
          console.log(`[Content Sanitizer] Converted ${pairCount} Q./A. pairs to proper FAQ table format at end of content`);
        }
      }
    }
  }
  
  fixed = fixedLines.join('\n');
  
  if (fixedCount > 0) {
    console.log(`[Content Sanitizer] Fixed ${fixedCount} malformed FAQ table(s) (converted Q./A. format to proper table format)`);
  }
  
  return fixed;
}

/**
 * Fix malformed markdown table headers and rows
 * Removes leading periods, colons, or other characters before the first pipe in table rows
 * Example: ". | Header | Header |" -> "| Header | Header |"
 * Example: ": | Header | Header |" -> "| Header | Header |"
 * CRITICAL: Markdown tables MUST start with | not . | or : |
 */
export function fixMalformedMarkdownTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let fixedCount = 0;
  
  // Split content into lines to process each line individually
  const lines = fixed.split('\n');
  const fixedLines = lines.map((line, index) => {
    // Check if this line looks like a table row (contains at least one pipe)
    // Table rows typically have: | content | content |
    if (line.includes('|')) {
      // Check for malformed table row patterns
      // Pattern 1: Leading period before pipe: ". |" or ".|"
      if (/^\s*\.\s*\|/.test(line)) {
        fixedCount++;
        return line.replace(/^\s*\.\s*\|/, '|');
      }
      
      // Pattern 2: Leading colon before pipe: ": |" or ":|"
      if (/^\s*:\s*\|/.test(line)) {
        fixedCount++;
        return line.replace(/^\s*:\s*\|/, '|');
      }
      
      // Pattern 3: Leading dash before pipe: "- |" or "-|"
      if (/^\s*-\s*\|/.test(line)) {
        fixedCount++;
        return line.replace(/^\s*-\s*\|/, '|');
      }
      
      // Pattern 4: Leading plus before pipe: "+ |" or "+|"
      if (/^\s*\+\s*\|/.test(line)) {
        fixedCount++;
        return line.replace(/^\s*\+\s*\|/, '|');
      }
      
      // Pattern 5: Any other single punctuation character before pipe
      // Match: single char (period, colon, dash, etc.) followed by optional space and pipe
      if (/^\s*[\.\:\-\+\*]\s*\|/.test(line)) {
        fixedCount++;
        return line.replace(/^\s*[\.\:\-\+\*]\s*\|/, '|');
      }
    }
    
    return line;
  });
  
  fixed = fixedLines.join('\n');
  
  if (fixedCount > 0) {
    console.log(`[Content Sanitizer] Fixed ${fixedCount} malformed markdown table row(s) (removed leading punctuation before pipes)`);
  }
  
  return fixed;
}

/**
 * Remove all internal links that are NOT in the WordPress posts list
 * CRITICAL: Only allows links that exist in the provided WordPress posts
 */
export function removeInvalidInternalLinks(content: string, wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>, connectedSiteUrl?: string): string {
  if (!content) return content;
  
  if (!wordPressPosts || wordPressPosts.length === 0) {
    console.warn('[Link Sanitizer] No WordPress posts provided - cannot validate internal links');
    return content;
  }
  
  // Extract connected site domain if provided
  let connectedSiteDomain = '';
  if (connectedSiteUrl) {
    try {
      const urlObj = new URL(connectedSiteUrl.startsWith('http') ? connectedSiteUrl : `https://${connectedSiteUrl}`);
      connectedSiteDomain = urlObj.hostname.replace('www.', '').toLowerCase();
    } catch {
      // Invalid URL, ignore
    }
  }
  
  // Only allow the exact link from WordPress API — no normalizing, no pathname, no variants.
  const validInternalLinks = new Set<string>();
  wordPressPosts.forEach(post => {
    if (post.link && post.link.trim()) {
      validInternalLinks.add(post.link.trim());
      // Allow with/without trailing slash only (same URL)
      const trimmed = post.link.trim();
      if (trimmed.endsWith('/')) validInternalLinks.add(trimmed.slice(0, -1));
      else validInternalLinks.add(trimmed + '/');
    }
  });

  console.log(`[Link Sanitizer] Valid internal links: exact URLs from WordPress API only (${validInternalLinks.size} from ${wordPressPosts.length} posts)`);
  
  // Pattern to match markdown links and HTML links
  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>)/gi;
  
  let sanitized = content;
  let removedCount = 0;
  
  sanitized = sanitized.replace(linkPattern, (match, fullMatch, markdownText, markdownUrl, htmlUrl, htmlText) => {
    const url = markdownUrl || htmlUrl;
    if (!url) return match; // Keep if no URL found
    
    try {
      const urlObj = new URL(url);
      const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();

      // Check if it's an external link (not connected site)
      const isExternal = connectedSiteDomain && linkDomain !== connectedSiteDomain;
      
      // If external, allow only Wikipedia (handled by removeNonWikipediaExternalLinks)
      if (isExternal) {
        const isWikipedia = linkDomain === 'wikipedia.org' || 
                           linkDomain === 'en.wikipedia.org' || 
                           linkDomain.includes('wikipedia.org');
        if (isWikipedia) {
          return match; // Keep Wikipedia links
        }
        // External non-Wikipedia links will be removed by removeNonWikipediaExternalLinks
        return match;
      }
      
      // For internal links, allow only if URL exactly matches one from WordPress API (no normalizing).
      const urlTrimmed = url.trim();
      const isValidInternalLink = validInternalLinks.has(urlTrimmed) || validInternalLinks.has(urlTrimmed.replace(/\/+$/, '')) || validInternalLinks.has(urlTrimmed.replace(/\/+$/, '') + '/');
      
      if (!isValidInternalLink) {
        removedCount++;
        console.warn(`[Link Sanitizer] REMOVED invalid internal link (not in WordPress posts): ${url}`);
        // Remove the link but keep the text
        return markdownText || htmlText || '';
      }

      return match; // Keep valid internal links
    } catch {
      // Invalid URL, keep as-is
      return match;
    }
  });
  
  if (removedCount > 0) {
    console.warn(`[Link Sanitizer] Removed ${removedCount} invalid internal link(s) (only links from WordPress posts are allowed)`);
  }
  
  return sanitized;
}

/**
 * Remove all non-Wikipedia external links from content
 * CRITICAL: Only allows Wikipedia and connected site links
 */
export function removeNonWikipediaExternalLinks(content: string, connectedSiteUrl?: string): string {
  if (!content) return content;
  
  // Extract connected site domain if provided
  let connectedSiteDomain = '';
  if (connectedSiteUrl) {
    try {
      const urlObj = new URL(connectedSiteUrl.startsWith('http') ? connectedSiteUrl : `https://${connectedSiteUrl}`);
      connectedSiteDomain = urlObj.hostname.replace('www.', '').toLowerCase();
    } catch {
      // Invalid URL, ignore
    }
  }
  
  // Pattern to match markdown links and HTML links
  // Match: [text](url) or <a href="url">text</a>
  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>)/gi;
  
  let sanitized = content;
  let removedCount = 0;
  
  sanitized = sanitized.replace(linkPattern, (match, fullMatch, markdownText, markdownUrl, htmlUrl, htmlText) => {
    const url = markdownUrl || htmlUrl;
    if (!url) return match; // Keep if no URL found
    
    try {
      const urlObj = new URL(url);
      const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();
      
      // Allow Wikipedia links
      const isWikipedia = linkDomain === 'wikipedia.org' || 
                         linkDomain === 'en.wikipedia.org' || 
                         linkDomain.includes('wikipedia.org');
      
      // Allow connected site links (internal)
      const isConnectedSite = connectedSiteDomain && linkDomain === connectedSiteDomain;
      
      // REJECT everything else
      if (!isWikipedia && !isConnectedSite) {
        removedCount++;
        console.warn(`[Link Sanitizer] REMOVED forbidden external link: ${url}`);
        // Remove the link but keep the text
        return markdownText || htmlText || '';
      }
      
      return match; // Keep Wikipedia and connected site links
    } catch {
      // Invalid URL, keep as-is
      return match;
    }
  });
  
  if (removedCount > 0) {
    console.warn(`[Link Sanitizer] Removed ${removedCount} forbidden external link(s) (only Wikipedia and connected site links are allowed)`);
  }
  
  return sanitized;
}

/**
 * Full content sanitization pipeline
 * Applies all sanitization rules before WordPress upload
 */
export function sanitizeContentForUpload(content: string, connectedSiteUrl?: string, wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>): string {
  if (!content) return content;
  
  let sanitized = content;
  
  // Step 1: Remove placeholder artifacts
  sanitized = sanitizePlaceholders(sanitized);
  
  // Step 1.1: Remove "Article Title" labels (must be first to catch metadata)
  sanitized = removeArticleTitleLabels(sanitized);
  
  // Step 1.15: Remove forbidden sections (like "External Resources") - must be before duplicate heading removal
  sanitized = removeForbiddenSections(sanitized);
  
  // Step 1.2: Remove duplicate consecutive headings (must be early in pipeline)
  sanitized = removeDuplicateHeadings(sanitized);
  
  // Step 1.3: Remove empty tables (must be before fixing malformed tables)
  sanitized = removeEmptyTables(sanitized);
  
  // Step 1.4: Fix malformed FAQ tables (Q./A. format to proper table format)
  sanitized = fixMalformedFAQTables(sanitized);
  
  // Step 1.45: Remove link columns from tables (links must be integrated into content columns)
  sanitized = removeLinkColumnsFromTables(sanitized);
  
  // Step 1.46: Fix malformed link formats (like [URL: ...] to proper markdown)
  sanitized = fixMalformedLinks(sanitized);
  
  // Step 1.5: Fix malformed markdown tables (must be before colon removal to catch ": |" patterns)
  sanitized = fixMalformedMarkdownTables(sanitized);
  
  // Step 2: Remove all colons (replace with periods)
  sanitized = removeColons(sanitized);
  
  // Step 3: Remove all em dashes (replace with comma and space)
  sanitized = removeEmDashes(sanitized);
  
  // Step 4: Remove invalid internal links (CRITICAL - only allow links from WordPress posts)
  sanitized = removeInvalidInternalLinks(sanitized, wordPressPosts, connectedSiteUrl);
  
  // Step 5: Remove non-Wikipedia external links (CRITICAL - only allow Wikipedia and connected site)
  sanitized = removeNonWikipediaExternalLinks(sanitized, connectedSiteUrl);
  
  // Step 6: Enforce one image per section
  sanitized = enforceOneImagePerSection(sanitized);
  
  // Step 7: Final cleanup
  // Remove any trailing/leading whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Strip pipe or dash separator and any suffix (e.g. " | Florida Living", " – Site Name")
 * so the title is a single short phrase with no separator.
 */
export function stripTitleSeparatorSuffix(title: string): string {
  if (!title || !title.trim()) return title;
  const t = title.trim();
  const pipeIdx = t.indexOf(" | ");
  const dashIdx = t.indexOf(" – ");
  const hyphenIdx = t.indexOf(" - ");
  let cut = t.length;
  if (pipeIdx > 0) cut = Math.min(cut, pipeIdx);
  if (dashIdx > 0) cut = Math.min(cut, dashIdx);
  if (hyphenIdx > 0) cut = Math.min(cut, hyphenIdx);
  return (cut < t.length ? t.substring(0, cut) : t).trim();
}

/**
 * Truncate title to maximum 50 characters for optimal SEO (Death Star module requirement)
 * Preserves word boundaries when possible to avoid cutting words in half
 */
export function truncateTitleForSEO(title: string, maxLength: number = 50): string {
  if (!title) return title;
  
  const trimmed = title.trim();
  
  // If title is already within limit, return as-is
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  
  // Try to truncate at word boundary (space or punctuation)
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastPunctuation = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf(','),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf(':'),
    truncated.lastIndexOf(';')
  );
  
  // Use the later of space or punctuation for a clean cut
  const cutPoint = Math.max(lastSpace, lastPunctuation);
  
  if (cutPoint > maxLength * 0.7) {
    // Only use word boundary if it's not too early (at least 70% of max length)
    return truncated.substring(0, cutPoint).trim();
  }
  
  // If no good word boundary, truncate at max length and add ellipsis if needed
  return truncated.trim();
}

/**
 * Validate content before upload
 * Returns warnings if content has issues (but doesn't block upload)
 */
export function validateContentForUpload(content: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!content || content.trim().length === 0) {
    return { valid: false, warnings: ['Content is empty'] };
  }
  
  // Check for remaining placeholder patterns (shouldn't happen after sanitization)
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`Found placeholder pattern: ${pattern.source}`);
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  
  // Check for suspiciously short content
  const textContent = content.replace(/<[^>]*>/g, '').trim();
  if (textContent.length < 100) {
    warnings.push('Content is very short (less than 100 characters of text)');
  }
  
  // Check for missing closing tags (basic check)
  const openTags = (content.match(/<[a-z][a-z0-9]*[^>]*(?<!\/)\s*>/gi) || []).length;
  const closeTags = (content.match(/<\/[a-z][a-z0-9]*>/gi) || []).length;
  if (Math.abs(openTags - closeTags) > 5) {
    warnings.push('Possible HTML tag mismatch detected');
  }
  
  return { valid: true, warnings };
}
