/**
 * Color detection and replacement logic for template files
 */

import type { ColorMatch, TemplateFile } from "@/components/generator/elementor/types";

/**
 * Detect color format from a color string
 */
export function detectColorFormat(color: string): 'hex' | 'rgb' | 'rgba' | 'hsl' | 'name' | 'unknown' {
  const trimmed = color.trim();
  
  if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return 'hex';
  }
  if (/^rgba?\(/.test(trimmed)) {
    return trimmed.startsWith('rgba') ? 'rgba' : 'rgb';
  }
  if (/^hsla?\(/.test(trimmed)) {
    return 'hsl';
  }
  if (/^(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|cyan|magenta|brown|navy|teal|olive|maroon|lime|aqua|fuchsia|silver|gold|indigo|violet|tan|salmon|coral|khaki|lavender|plum|turquoise|azure|beige|bisque|chocolate|crimson|darkblue|darkgreen|darkred|darkslategray|darkviolet|deeppink|dimgray|dodgerblue|firebrick|forestgreen|gainsboro|goldenrod|hotpink|indianred|lightblue|lightgray|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightsteelblue|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|powderblue|rosybrown|royalblue|saddlebrown|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|snow|springgreen|steelblue|thistle|tomato|wheat|whitesmoke|yellowgreen)$/i.test(trimmed)) {
    return 'name';
  }
  
  return 'unknown';
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  
  // Handle 3-digit hex
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16),
    };
  }
  
  return null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

/**
 * Normalize hex color (ensure # prefix and lowercase)
 */
export function normalizeHexColor(color: string): string {
  let normalized = color.trim();
  if (!normalized.startsWith('#')) {
    normalized = '#' + normalized;
  }
  return normalized.toLowerCase();
}

/**
 * Find all color values in template files
 */
export function findColorsInFiles(files: TemplateFile[]): ColorMatch[] {
  const colorMatches: ColorMatch[] = [];
  
  // Patterns for different color formats
  const patterns = [
    { regex: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g, format: 'hex' as const },
    { regex: /rgba?\([^)]+\)/gi, format: 'rgba' as const },
    { regex: /hsla?\([^)]+\)/gi, format: 'hsl' as const },
    { regex: /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|cyan|magenta|brown|navy|teal|olive|maroon|lime|aqua|fuchsia|silver|gold|indigo|violet|tan|salmon|coral|khaki|lavender|plum|turquoise|azure|beige|bisque|chocolate|crimson|darkblue|darkgreen|darkred|darkslategray|darkviolet|deeppink|dimgray|dodgerblue|firebrick|forestgreen|gainsboro|goldenrod|hotpink|indianred|lightblue|lightgray|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightsteelblue|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|powderblue|rosybrown|royalblue|saddlebrown|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|snow|springgreen|steelblue|thistle|tomato|wheat|whitesmoke|yellowgreen)\b/gi, format: 'name' as const },
  ];

  for (const file of files) {
    const lines = file.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of patterns) {
        const matches = Array.from(line.matchAll(pattern.regex));
        
        for (const match of matches) {
          if (match[0]) {
            const colorValue = match[0];
            const format = detectColorFormat(colorValue);
            
            if (format !== 'unknown') {
              colorMatches.push({
                originalColor: colorValue,
                originalFormat: format,
                newColor: '', // Will be set during replacement
                filePath: file.path,
                lineNumber: i + 1,
                context: line.trim().substring(0, 100),
              });
            }
          }
        }
      }
    }
  }

  return colorMatches;
}

/**
 * Replace color in a string, preserving format when possible
 */
export function replaceColorInString(
  content: string,
  oldColor: string,
  newColor: string,
  preserveFormat: boolean = true
): string {
  const oldFormat = detectColorFormat(oldColor);
  const newFormat = detectColorFormat(newColor);
  
  // If preserving format and formats match, use new color as-is
  if (preserveFormat && oldFormat === newFormat && oldFormat !== 'unknown') {
    // Replace exact match
    const regex = new RegExp(escapeRegex(oldColor), 'gi');
    return content.replace(regex, newColor);
  }
  
  // Otherwise, convert new color to match old format
  let replacementColor = newColor;
  
  if (oldFormat === 'hex') {
    replacementColor = normalizeHexColor(newColor);
  } else if (oldFormat === 'rgb' || oldFormat === 'rgba') {
    // Try to convert hex to RGB
    const rgb = hexToRgb(newColor);
    if (rgb) {
      if (oldFormat === 'rgba') {
        // Try to preserve alpha if present in old color
        const alphaMatch = oldColor.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
        const alpha = alphaMatch ? alphaMatch[1] : '1';
        replacementColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      } else {
        replacementColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      }
    }
  }
  
  // Replace all occurrences
  const regex = new RegExp(escapeRegex(oldColor), 'gi');
  return content.replace(regex, replacementColor);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate color similarity (0-1, where 1 is identical)
 */
export function colorSimilarity(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return 0;
  
  // Euclidean distance in RGB space, normalized
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
  
  // Max distance in RGB space is sqrt(255^2 * 3) ≈ 441.67
  const maxDistance = Math.sqrt(255 * 255 * 3);
  const similarity = 1 - (distance / maxDistance);
  
  return Math.max(0, Math.min(1, similarity));
}
