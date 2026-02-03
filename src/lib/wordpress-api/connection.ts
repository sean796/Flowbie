/**
 * WordPress API Connection Module
 * Functions for testing connections and managing sitemaps
 */

import type {
  WordPressConnectionResult,
  SitemapDetectionResult,
  SitemapParseResult
} from './types';

// Use relative URLs in production (goes through Vite proxy) or absolute in dev
export const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

/**
 * Test WordPress connection
 */
export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<WordPressConnectionResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/test-connection`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to backend server at ${url}\n\n` +
        `Please ensure the backend server is running:\n` +
        `1. Open a terminal in the project root\n` +
        `2. Run: node server/mcp-api-server.js\n` +
        `The server should start on http://localhost:3001`
      );
    }
    
    throw error;
  }
}

/**
 * Detect WordPress sitemaps
 */
export async function detectSitemaps(
  siteUrl: string,
  username?: string,
  appPassword?: string
): Promise<SitemapDetectionResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/detect-sitemaps`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to backend server at ${url}\n\n` +
        `Please ensure the backend server is running on http://localhost:3001`
      );
    }
    
    throw error;
  }
}

/**
 * Parse sitemap XML content
 */
export async function parseSitemap(
  siteUrl: string,
  sitemapUrl: string,
  username?: string,
  appPassword?: string
): Promise<SitemapParseResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/parse-sitemap`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        sitemapUrl,
        username,
        appPassword,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      // Enhanced error message with details if available
      const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
      const enhancedError = new Error(errorMessage);
      
      // Attach additional error details if available
      if (errorData.details) {
        (enhancedError as any).details = errorData.details;
      }
      if (errorData.suggestion) {
        (enhancedError as any).suggestion = errorData.suggestion;
      }
      
      throw enhancedError;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to backend server at ${url}\n\n` +
        `Please ensure the backend server is running on http://localhost:3001`
      );
    }
    
    throw error;
  }
}

