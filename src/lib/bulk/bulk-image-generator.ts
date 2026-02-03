import { buildImageChecklistSystemPrompt, buildImageChecklistUserPrompt, type ImageChecklistItem } from '../image-checklist-builder';
import { buildImagePrompt } from '../image-prompt-builder';
import { generateImage } from '../image-api';
import { streamChatCompletion } from '../api';
import { getResearchModel } from '../optimization-settings-storage';

/**
 * Parse image checklist from AI response
 */
export function parseImageChecklist(aiResponse: string): ImageChecklistItem[] {
  const lines = aiResponse.split('\n').map(line => line.trim());
  const parsedItems: ImageChecklistItem[] = [];
  let currentTitle: string | null = null;
  let currentDescription: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines - they separate title from description or items from each other
    if (!line) {
      // If we have both title and description, save the item
      if (currentTitle && currentDescription.length > 0) {
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = null;
        currentDescription = [];
      }
      i++;
      continue;
    }

    // Check if this line is a title (not starting with "I'm"/"I am", typically shorter, capitalized)
    const isTitleCandidate = line.length < 120 && 
                             line.length > 3 &&
                             !line.startsWith("I'm") && 
                             !line.startsWith("I am") &&
                             !line.startsWith("I'm currently") &&
                             !line.startsWith("I'm now") &&
                             !line.match(/^[a-z]/); // Starts with capital

    // Check if this line is a description (starts with "I'm" or "I am")
    const isDescription = line.startsWith("I'm") || 
                          line.startsWith("I am") ||
                          line.startsWith("I'm currently") ||
                          line.startsWith("I'm now");

    if (isTitleCandidate && !currentTitle) {
      // Look ahead to see if next non-empty line is a description
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      
      if (j < lines.length && 
          (lines[j].startsWith("I'm") || lines[j].startsWith("I am"))) {
        // This is a title, next line is description
        currentTitle = line;
        i = j; // Move to description line
        continue;
      } else if (j < lines.length && lines[j].length > 50) {
        // Next line is long, might be description without "I'm"
        currentTitle = line;
        i = j;
        continue;
      }
    }

    // If we have a title and this is a description, add it
    if (currentTitle && (isDescription || (currentDescription.length > 0 && line.length > 20))) {
      if (isDescription || currentDescription.length > 0) {
        currentDescription.push(line);
      }
    } else if (currentTitle && currentDescription.length > 0) {
      // We have a complete item, but this line doesn't continue the description
      // Check if it's a new title
      if (isTitleCandidate) {
        // Save current item and start new one
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = line;
        currentDescription = [];
      } else {
        // Might be continuation of description
        currentDescription.push(line);
      }
    } else if (!currentTitle && isTitleCandidate) {
      // Start new item
      currentTitle = line;
    }

    i++;
  }

  // Save last item if exists
  if (currentTitle) {
    parsedItems.push({
      title: currentTitle,
      description: currentDescription.length > 0 
        ? currentDescription.join(' ') 
        : "Processing image requirements based on content and specifications."
    });
  }

  // Fallback parsing if structured format not found
  if (parsedItems.length === 0) {
    // Try pattern: Title (non-empty, not starting with I'm) followed by description (starts with I'm)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      // Look for title pattern
      if (line.length < 100 && line.length > 5 && 
          line[0] === line[0].toUpperCase() && 
          !line.startsWith("I'm") && !line.startsWith("I am")) {
        // Find next non-empty line as description
        let j = i + 1;
        while (j < lines.length && !lines[j]) j++;
        
        if (j < lines.length) {
          const descLine = lines[j];
          if (descLine.startsWith("I'm") || descLine.startsWith("I am") || descLine.length > 30) {
            parsedItems.push({
              title: line,
              description: descLine
            });
            i = j; // Skip description
          }
        }
      }
    }
  }

  return parsedItems.length > 0 ? parsedItems : [{
    title: "Image Generation Requirements",
    description: "Generate a professional featured image based on the blog content without any text, suitable for WordPress."
  }];
}

/**
 * Generate image checklist from blog content
 */
export async function generateImageChecklist(
  flowTitle: string,
  flowPurpose: string,
  markdownContent: string,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }
): Promise<ImageChecklistItem[]> {
  const systemPrompt = buildImageChecklistSystemPrompt(
    flowTitle,
    flowPurpose,
    markdownContent
  );

  const userPrompt = buildImageChecklistUserPrompt({
    flowTitle,
    flowPurpose,
    finalOutput: markdownContent,
    includeText: false, // No text in images
    includePeople: false,
    includeAnimals: false,
    includeCars: false,
    isInfographic: false,
    aspectRatio: '16:9',
    style: 'professional',
    colorScheme: 'vibrant',
  });

  let checklistContent = '';
  await streamChatCompletion({
    apiKey: options.apiKey,
    model: options.model || getResearchModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options.temperature || 1.0,
    maxTokens: options.maxTokens || 4000,
    topP: options.topP || 0.9,
    onContentChunk: (chunk) => {
      checklistContent += chunk;
    },
  });

  return parseImageChecklist(checklistContent);
}

/**
 * Generate featured image for blog content
 */
export async function generateFeaturedImage(
  flowTitle: string,
  flowPurpose: string,
  markdownContent: string,
  imageChecklist: ImageChecklistItem[],
  options: {
    apiKey: string;
    model?: string;
  }
): Promise<{ imageBase64: string }> {
  // Build image prompt
  const basePrompt = buildImagePrompt(
    {
      flowTitle,
      flowPurpose,
      finalOutput: markdownContent,
    },
    {
      includeText: false, // No text - WordPress style
      includePeople: false,
      includeAnimals: false,
      includeCars: false,
      isInfographic: false,
      aspectRatio: '16:9', // WordPress featured image aspect ratio
      style: 'professional',
      colorScheme: 'vibrant',
    }
  );

  // Add checklist to prompt
  const checklistText = imageChecklist.length > 0 
    ? `\n\nImage Generation Checklist:\n${imageChecklist.map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n')}`
    : '';

  const prompt = basePrompt + checklistText + '\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included. This is a WordPress featured image - no text, words, or labels should be included.';

  // Generate image with 16:9 aspect ratio (WordPress standard)
  const result = await generateImage({
    apiKey: options.apiKey,
    prompt,
    aspectRatio: '16:9',
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.imageBase64 && !result.imageUrl) {
    throw new Error('No image data returned from image generation API');
  }

  // If we got a URL, fetch it and convert to base64
  if (result.imageUrl && !result.imageBase64) {
    try {
      const response = await fetch(result.imageUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve({ imageBase64: base64 });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(`Failed to fetch image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Ensure base64 has data URL prefix
  const imageBase64 = result.imageBase64?.startsWith('data:') 
    ? result.imageBase64 
    : `data:image/png;base64,${result.imageBase64}`;

  return { imageBase64: imageBase64! };
}

