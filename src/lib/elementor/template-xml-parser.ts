/**
 * XML parsing and structure extraction for template files
 */

import type { XMLElement, XMLStructure, TemplateFile, HighlightedField } from "@/components/generator/elementor/types";

/**
 * Parse XML string into structure
 */
export function parseXML(xmlContent: string): XMLStructure | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.error('XML parsing error:', parserError.textContent);
      return null;
    }

    const root = xmlDoc.documentElement;
    const elements: XMLElement[] = [];

    // Extract metadata from RSS/WordPress export format
    const metadata: XMLStructure['metadata'] = {};
    const channel = root.querySelector('channel');
    
    if (channel) {
      const title = channel.querySelector('title')?.textContent;
      const link = channel.querySelector('link')?.textContent;
      const description = channel.querySelector('description')?.textContent;
      const language = channel.querySelector('language')?.textContent;
      
      if (title) metadata.title = title;
      if (link) metadata.link = link;
      if (description) metadata.description = description;
      if (language) metadata.language = language;
    }

    // Parse elements recursively
    function parseElement(node: Element, parentLineNumber: number = 0): XMLElement[] {
      const elements: XMLElement[] = [];
      const children = Array.from(node.children);
      
      // Get line number (approximate based on content position)
      const lineNumber = parentLineNumber + 1;
      
      const element: XMLElement = {
        tag: node.tagName,
        attributes: {},
        content: node.textContent?.trim() || undefined,
        children: [],
        lineNumber,
      };

      // Extract attributes
      Array.from(node.attributes).forEach(attr => {
        element.attributes[attr.name] = attr.value;
      });

      // Parse children
      for (const child of children) {
        const childElements = parseElement(child, lineNumber);
        if (element.children) {
          element.children.push(...childElements);
        }
      }

      elements.push(element);
      return elements;
    }

    const rootElements = parseElement(root);
    elements.push(...rootElements);

    return {
      root: root.tagName,
      elements,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch (error) {
    console.error('Error parsing XML:', error);
    return null;
  }
}

/**
 * Extract line numbers for XML elements
 */
export function getXMLLineNumbers(xmlContent: string, searchValue: string): number[] {
  const lines = xmlContent.split('\n');
  const lineNumbers: number[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchValue)) {
      lineNumbers.push(i + 1); // 1-indexed
    }
  }
  
  return lineNumbers;
}

/**
 * Find all instances of a value in XML with line numbers
 */
export function findValueInXML(
  xmlContent: string,
  searchValue: string,
  caseSensitive: boolean = false
): HighlightedField[] {
  const lines = xmlContent.split('\n');
  const fields: HighlightedField[] = [];
  const searchRegex = new RegExp(escapeRegex(searchValue), caseSensitive ? 'g' : 'gi');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = Array.from(line.matchAll(searchRegex));
    
    for (const match of matches) {
      if (match.index !== undefined) {
        fields.push({
          fieldId: `field-${i}-${match.index}`,
          lineNumber: i + 1,
          startColumn: match.index + 1,
          endColumn: match.index + match[0].length + 1,
          value: match[0],
        });
      }
    }
  }
  
  return fields;
}

/**
 * Extract WordPress export structure
 */
export function extractWordPressStructure(xmlContent: string): {
  title?: string;
  link?: string;
  description?: string;
  authors: Array<{ id: string; login: string; email: string; displayName: string }>;
  items: Array<{ title: string; link: string; type: string }>;
} {
  const structure = parseXML(xmlContent);
  if (!structure) {
    return { authors: [], items: [] };
  }

  const authors: Array<{ id: string; login: string; email: string; displayName: string }> = [];
  const items: Array<{ title: string; link: string; type: string }> = [];

  // Extract authors
  const authorElements = structure.elements.flatMap(el => 
    findElementsByTag(el, 'wp:author')
  );

  for (const authorEl of authorElements) {
    const id = authorEl.attributes['wp:author_id'] || '';
    const login = findChildText(authorEl, 'wp:author_login') || '';
    const email = findChildText(authorEl, 'wp:author_email') || '';
    const displayName = findChildText(authorEl, 'wp:author_display_name') || '';
    
    if (id) {
      authors.push({ id, login, email, displayName });
    }
  }

  // Extract items (posts/pages)
  const itemElements = structure.elements.flatMap(el => 
    findElementsByTag(el, 'item')
  );

  for (const itemEl of itemElements) {
    const title = findChildText(itemEl, 'title') || '';
    const link = findChildText(itemEl, 'link') || '';
    const type = findChildText(itemEl, 'wp:post_type') || 'post';
    
    if (title || link) {
      items.push({ title, link, type });
    }
  }

  return {
    title: structure.metadata?.title,
    link: structure.metadata?.link,
    description: structure.metadata?.description,
    authors,
    items,
  };
}

/**
 * Find elements by tag name recursively
 */
function findElementsByTag(element: XMLElement, tagName: string): XMLElement[] {
  const results: XMLElement[] = [];
  
  if (element.tag === tagName) {
    results.push(element);
  }
  
  if (element.children) {
    for (const child of element.children) {
      results.push(...findElementsByTag(child, tagName));
    }
  }
  
  return results;
}

/**
 * Find child element text content
 */
function findChildText(element: XMLElement, tagName: string): string | null {
  if (element.children) {
    for (const child of element.children) {
      if (child.tag === tagName) {
        return child.content || null;
      }
      // Recursively search
      const found = findChildText(child, tagName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get XML structure summary for preview
 */
export function getXMLSummary(xmlContent: string): {
  totalLines: number;
  totalSize: number;
  hasWordPressStructure: boolean;
  elementCount: number;
} {
  const lines = xmlContent.split('\n');
  const structure = parseXML(xmlContent);
  
  return {
    totalLines: lines.length,
    totalSize: xmlContent.length,
    hasWordPressStructure: structure?.metadata !== undefined,
    elementCount: structure?.elements.length || 0,
  };
}
