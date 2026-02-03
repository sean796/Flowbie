import { StoredFile } from "@/components/KnowledgeBaseTab";
import Papa from 'papaparse';

const CHUNK_SIZE = 100 * 1024; // 100KB chunk size

export function sanitizeFileName(name: string): string {
  // 1. Extract base filename if a path is present (handle both / and \ as separators)
  const pathSeparatorRegex = /[/\\]/;
  const parts = name.split(pathSeparatorRegex);
  const baseName = parts[parts.length - 1];

  // 2. Perform sanitization on the base filename
  // Replace spaces, parentheses, and other common problematic characters (excluding path separators since baseName is used) with hyphens
  const sanitized = baseName.replace(/[\s()]+/g, '-');
  
  // 3. Remove any trailing or leading hyphens
  return sanitized.replace(/^-+|-+$/g, '');
}

/**
 * Reads a File object and returns its content as a string.
 * @param file The File object to read.
 * @returns A promise that resolves with the file content string.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsText(file);
  });
}

/**
 * Processes a CSV file, splitting it into chunks of a maximum size 
 * and prepending the header row to each subsequent chunk.
 * 
 * @param file The CSV File object.
 * @param maxChunkSize The maximum size of each chunk in bytes (default 2MB).
 * @returns A promise that resolves with an array of StoredFile objects (chunks).
 */
export async function processCSVToChunks(file: File, maxChunkSize: number = CHUNK_SIZE): Promise<StoredFile[]> {
  // Use PapaParse to handle robust CSV parsing, which correctly handles quoted newlines
  const parseResult: { data: string[][] } = await new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => resolve(results as { data: string[][] }),
      error: (error) => reject(error),
      skipEmptyLines: true,
    });
  });
  
  // PapaParse returns an array of rows (string[])
  const rows = parseResult.data;
  
  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0];
  // Re-encode header to guarantee correct CSV structure (e.g. quoting) and line termination
  const header = Papa.unparse([headerRow]) + "\n";
  const dataRows = rows.slice(1);
  
  const chunks: StoredFile[] = [];
  let currentChunkLines: string[] = []; // Stores the string version of the CSV rows
  let currentChunkSize = 0;
  let chunkIndex = 0;
  const sanitizedFileName = sanitizeFileName(file.name);

  if (dataRows.length > 0) {
    currentChunkLines.push(header);
    currentChunkSize += header.length;
  }

  for (const row of dataRows) {
    // Re-encode each row to handle quoting and get accurate size for chunking
    const rowString = Papa.unparse([row], { newline: '\n' }) + "\n";
    
    // Check if adding the next line exceeds the max size. We check against maxChunkSize - header.length 
    // to reserve space for the header if a new chunk starts. However, since the header is already 
    // accounted for in currentChunkSize if this is the first item on a chunk, we check a simpler way.
    if (currentChunkSize + rowString.length > maxChunkSize) {
      if (currentChunkLines.length > 1) { // Ensure there is content besides the header if we started a new chunk
        // Save the current chunk
        const chunkContent = currentChunkLines.join('');
        chunks.push({
          // Use the sanitized file name for the chunk names
          name: `${sanitizedFileName}.chunk.${chunkIndex}`,
          size: chunkContent.length,
          content: chunkContent,
          starred: false,
          timestamp: Date.now(),
        });
        chunkIndex++;
      }
      
      // Start a new chunk with the header and the current row
      currentChunkLines = [header, rowString];
      currentChunkSize = header.length + rowString.length;
    } else {
      // Add line to current chunk
      currentChunkLines.push(rowString);
      currentChunkSize += rowString.length;
    }
  }

  // Handle the last chunk
  if (currentChunkLines.length > 0) {
    const chunkContent = currentChunkLines.join('');
    chunks.push({
      // Use the sanitized file name for the chunk names
      name: `${sanitizedFileName}.chunk.${chunkIndex}`,
      size: chunkContent.length,
      content: chunkContent,
      starred: false,
      timestamp: Date.now(),
    });
  }

  return chunks;
}

/**
 * Handles reading other file types (Non-CSV, smaller files).
 * @param file The File object.
 * @returns A promise that resolves with an array containing one StoredFile.
 */
export async function processSingleFile(file: File): Promise<StoredFile[]> {
    const content = await readFileAsText(file);
    return [{
        name: sanitizeFileName(file.name),
        size: file.size,
        content,
        starred: false,
        timestamp: Date.now(),
    }];
}
