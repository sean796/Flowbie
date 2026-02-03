/**
 * WordPress Post to Markdown Converter
 * Converts WordPress HTML content to markdown format for knowledge base
 */

import type { WordPressPostContent } from './wordpress-api';
import { sanitizeFileName } from './file-processing';
import { summarizeContentWithAI, type SummarizationOptions } from './content-summarizer';

export interface WordPressConversionOptions {
  summarizeWithAI?: boolean;
  openRouterApiKey?: string;
  onSummarizeProgress?: (message: string) => void;
}

/**
 * Simple HTML to Markdown converter
 * Handles common WordPress HTML elements
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let markdown = html;
  
  // Remove script and style tags
  markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Headers
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
  
  // Bold and italic
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // Links
  markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // Images - CRITICAL: Only convert images with valid alt tags
  // First, convert images with alt tags (preserve alt text)
  markdown = markdown.replace(/<img[^>]*alt=["']([^"']+)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, '![$1]($2)');
  // Remove images without alt tags (don't convert them - they won't be placed)
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi, '');
  
  // Lists
  markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  
  // Paragraphs
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  
  // Line breaks
  markdown = markdown.replace(/<br[^>]*\/?>/gi, '\n');
  markdown = markdown.replace(/<hr[^>]*\/?>/gi, '\n---\n');
  
  // Blockquotes
  markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
  
  // Code blocks
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  
  // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  markdown = markdown
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Clean up extra whitespace
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  markdown = markdown.trim();
  
  return markdown;
}

/**
 * Convert WordPress post content to markdown format
 * 
 * @param post - WordPress post content
 * @param timestamp - Optional timestamp for filename
 * @param options - Optional conversion options including AI summarization
 * @returns Markdown content string
 */
export async function convertWordPressPostToMarkdown(
  post: WordPressPostContent,
  timestamp?: number,
  options?: WordPressConversionOptions
): Promise<string> {
  const ts = timestamp || Date.now();
  const date = post.date_gmt ? new Date(post.date_gmt).toISOString().split('T')[0] : '';
  
  // Convert HTML content to markdown
  let contentMarkdown = htmlToMarkdown(post.content);
  let excerptMarkdown = htmlToMarkdown(post.excerpt);
  
  // Apply AI summarization if requested
  if (options?.summarizeWithAI && options?.openRouterApiKey) {
    try {
      const summarizationOptions: SummarizationOptions = {
        apiKey: options.openRouterApiKey,
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
        onProgress: options.onSummarizeProgress,
      };
      
      // Summarize content if it's substantial
      if (contentMarkdown.trim().length > 200) {
        options.onSummarizeProgress?.(`AI analyzing content for post: ${post.title?.substring(0, 50)}...`);
        const contentResult = await summarizeContentWithAI(contentMarkdown, summarizationOptions);
        contentMarkdown = contentResult.summarizedContent;
      }
      
      // Summarize excerpt if it's substantial
      if (excerptMarkdown.trim().length > 200) {
        const excerptResult = await summarizeContentWithAI(excerptMarkdown, summarizationOptions);
        excerptMarkdown = excerptResult.summarizedContent;
      }
    } catch (error) {
      console.error("[WordPress Converter] Error during AI summarization:", error);
      // Fallback to original content on error
      options.onSummarizeProgress?.("AI summarization failed, using original content");
    }
  }
  
  // Build markdown document
  let markdown = `# ${post.title}\n\n`;
  
  if (date) {
    markdown += `**Date:** ${date}\n\n`;
  }
  
  if (post.link) {
    markdown += `**URL:** ${post.link}\n\n`;
  }
  
  if (excerptMarkdown) {
    markdown += `## Excerpt\n\n${excerptMarkdown}\n\n`;
  }
  
  if (contentMarkdown) {
    markdown += `## Content\n\n${contentMarkdown}\n\n`;
  }
  
  return markdown;
}

/**
 * Generate filename for WordPress markdown file
 * 
 * @param post - WordPress post content
 * @param timestamp - Optional timestamp for filename
 * @returns Filename string
 */
export function generateWordPressMarkdownFileName(
  post: WordPressPostContent,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  
  // Extract and sanitize title for filename
  const title = post.title || 'untitled';
  // Sanitize and limit length to avoid filesystem issues (max 80 chars for title part)
  const sanitizedTitle = sanitizeFileName(title).substring(0, 80);
  
  // Use post ID if available for better uniqueness, fallback to slug
  const identifier = post.id ? post.id : (post.slug || 'unknown');
  
  // Format: wordpress-<title>-<id>-<timestamp>.md
  return `wordpress-${sanitizedTitle}-${identifier}-${ts}.md`;
}

/**
 * Convert multiple WordPress posts to markdown files
 * 
 * @param posts - Array of WordPress post content
 * @param timestamp - Optional timestamp for filenames
 * @param options - Optional conversion options including AI summarization
 * @returns Promise resolving to array of markdown file objects
 */
export async function convertWordPressPostsToMarkdownFiles(
  posts: WordPressPostContent[],
  timestamp?: number,
  options?: WordPressConversionOptions
): Promise<Array<{ name: string; content: string }>> {
  const ts = timestamp || Date.now();
  
  const results = [];
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const content = await convertWordPressPostToMarkdown(post, ts, options);
    results.push({
      name: generateWordPressMarkdownFileName(post, ts),
      content,
    });
  }
  
  return results;
}

