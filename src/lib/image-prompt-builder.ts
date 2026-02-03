import { AgentConfig } from "@/components/AgentNode";
import { isReportInfographicSection } from "./image-checklist-builder";

export interface ImagePromptOptions {
  userPrompt?: string;
  includeText: boolean;
  includePeople: boolean;
  includeAnimals: boolean;
  includeCars: boolean;
  isInfographic: boolean;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19';
  style: 'professional' | 'minimalist' | 'abstract' | 'modern' | 'classic';
  colorScheme: 'vibrant' | 'muted' | 'monochrome' | 'warm' | 'cool' | 'natural';
  colorForeground?: string;
  colorBackground?: string;
}

export interface BlueprintContext {
  flowTitle: string;
  flowPurpose: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedSection?: {
    header: string;
    content: string;
    fullText: string;
  };
}

/**
 * Builds an image generation prompt from blueprint context and user options
 */
export const buildImagePrompt = (
  blueprintContext: BlueprintContext,
  options: ImagePromptOptions
): string => {
  const parts: string[] = [];
  
  // Add blueprint context
  if (blueprintContext.flowTitle) {
    parts.push(`Title: ${blueprintContext.flowTitle}`);
  }
  
  if (blueprintContext.flowPurpose) {
    parts.push(`Purpose: ${blueprintContext.flowPurpose}`);
  }
  
  // If a specific section is selected, use that section's content
  if (blueprintContext.selectedSection) {
    const sectionContent = blueprintContext.selectedSection.content
      .replace(/#{1,6}\s+/g, '') // Remove markdown headers
      .trim();
    if (sectionContent) {
      // Use more content from the section since it's focused
      const sectionSummary = sectionContent.length > 1000 
        ? sectionContent.substring(0, 1000) + '...'
        : sectionContent;
      parts.push(`Section-based inspiration: This image is specifically based on the "${blueprintContext.selectedSection.header}" section from the report. Section content: ${sectionSummary}`);
    }
  } else if (blueprintContext.finalOutput) {
    // For featured images, include more content to ensure the AI understands the full blueprint
    const cleanedOutput = blueprintContext.finalOutput
      .replace(/#{1,6}\s+/g, '') // Remove markdown headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines
      .trim();
    
    // Use more content for featured image (up to 1500 chars) to provide better context
    const summary = cleanedOutput.length > 1500 
      ? cleanedOutput.substring(0, 1500) + '...'
      : cleanedOutput;
    
    if (summary) {
      parts.push(`Featured image context (website/blog style): This is a featured image representing the entire blueprint content. Blueprint content summary: ${summary}`);
      parts.push(`Analyze the full blueprint content above to understand the main theme, key topics, and overall message. Create a featured image that visually captures the core essence of this content, suitable for use as a website/blog featured image.`);
    }
  }
  
  // Add user prompt if provided
  if (options.userPrompt && options.userPrompt.trim()) {
    parts.push(`User request: ${options.userPrompt.trim()}`);
  }
  
  // Add content preferences
  const contentPreferences: string[] = [];
  if (options.includeText) {
    contentPreferences.push('words, labels, titles');
  }
  if (options.includePeople) {
    contentPreferences.push('people');
  }
  if (options.includeAnimals) {
    contentPreferences.push('animals');
  }
  if (options.includeCars) {
    contentPreferences.push('vehicles (cars, trucks, motorcycles, etc.)');
  }
  
  if (contentPreferences.length > 0) {
    parts.push(`Include: ${contentPreferences.join(', ')}`);
  }
  
  // Add image type
  if (options.isInfographic) {
    const isReportInfographic = !!blueprintContext.selectedSection && isReportInfographicSection(blueprintContext.selectedSection, blueprintContext.flowTitle);
    parts.push('Image type: infographic with charts, graphs, icons, and data visualizations');
    if (isReportInfographic) {
      parts.push('CRITICAL: Report infographic. EXACT HEX CODES: Background #02050A, Accent #84BD00 (lime green), Text #fff. TALL mobile 9:16 (portrait). Layout: SIMPLE, CLEAN like neodigital website—NOT busy, easy to read, generous negative space. NEVER add logos. REAL DATA ONLY—no placeholders (+X%, TBD), no fake/garbled words. Neon-Noir Tech: shapes only (circles, grids)—NO faces. SAP label + geographic outline. NO AI, NO hashtags, NO Next Steps. Big numbers, short labels.');
    } else {
      parts.push('CRITICAL: This infographic MUST include extensive explanatory text, labels, annotations, and descriptive content throughout. It must be self-explanatory and suitable for social media sharing - understandable without needing the original article context. Include text labels for all visual elements, section titles, subtitles, and detailed explanations of what each chart, graph, icon, and data visualization represents.');
    }
  }
  
  // NOTE: Style, color scheme, and specific colors are NOT included in the prompt
  // These are technical parameters used only for API generation, NOT visual elements to include in the image.
  // The AI should create the image based purely on content, not technical settings.
  
  // Combine all parts into a coherent prompt
  let prompt = parts.join('. ');
  
  // Add instruction for featured image style
  prompt += '. Create a professional featured image that represents this content visually. Do NOT include or mention any image generation settings (aspect ratio, style, color scheme, or specific color values) in the image itself.';
  
  return prompt;
};

