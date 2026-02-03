import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a hex color string to HSL components (h s l), omitting the 'hsl' function wrapper.
 * @param hex A hex string, e.g., '#3b82f6'
 * @returns An HSL component string, e.g., '217 78% 59%'
 */
export function hexToHslComponents(hex: string): string {
  // Remove the hash if present
  let r = 0,
    g = 0,
    b = 0;
  if (hex.length == 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length == 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    // Return a default color if input is invalid or not found, e.g., Tailwind's default primary blue.
    return "217 78% 59%"; // Default #3b82f6
  }

  // Convert R, G, B to a 0-1 range
  r /= 255;
  g /= 255;
  b /= 255;

  // Find max and min values
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0, s = 0, l = (max + min) / 2;

  if (delta === 0) {
    h = 0; // achromatic
    s = 0;
  } else {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
      case g: h = (b - r) / delta + 2; break;
      case b: h = (r - g) / delta + 4; break;
    }
    h /= 6;
  }

  // Convert to degrees and percentages
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}

// Note: StoredFile is implicitly defined from a sibling component's interface
interface StoredFile {
    name: string;
    content: string;
}

/**
 * Groups chunked files back together based on the naming convention (name.chunk.index)
 * and concatenates their content in order. This handles the case where files were
 * chunked manually during upload.
 * @param files Array of all stored files/chunks.
 * @returns A string containing the content of all reassembled files, separated by a boundary.
 */
export function reassembleChunkedFiles(files: StoredFile[]): string {
    if (!files || files.length === 0) {
        return '';
    }

    // 1. Group files by their original filename (before '.chunk.index')
    // Map: { originalFileName: [chunk1, chunk2, ...] }
    const fileGroups = files.reduce((acc, file) => {
        // Tries to extract the file ID before the '.chunk.' part.
        const parts = file.name.split('.chunk.');
        const fileId = parts[0]; 
        
        if (!acc[fileId]) {
            acc[fileId] = [];
        }
        acc[fileId].push({ 
            // Store the chunk index for sorting, or -1 if non-chunked
            index: parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : -1,
            content: file.content
        });
        return acc;
    }, {} as Record<string, { index: number, content: string }[]>);

    const allFileContents: string[] = [];

    // 2. Reassemble the content for each original file
    for (const fileId in fileGroups) {
        const chunks = fileGroups[fileId];

        // Sort chunks numerically by index
        chunks.sort((a, b) => a.index - b.index);

        // Concatenate content
        const reassembledContent = chunks
            .map(chunk => chunk.content)
            .filter(Boolean) 
            .join('');
        
        // CRITICAL: Wrap the reassembled content in code fences to prevent it from interfering with the agent's prompt syntax.
        // This is a common pattern to pass raw data to LLMs.
        const finalContentBlock = `\n--- START FILE: ${fileId} (CSV DATA, UTF-8 Encoded ROWS) ---\n\n\`\`\`\n${reassembledContent}\n\`\`\`\n\n--- END FILE: ${fileId} ---\n`;
        allFileContents.push(finalContentBlock);
    }
    
    // 3. Join all reassembled file contents. The outer wrapping in Index.tsx will handle the final separator.
    return allFileContents.join('');
}
