/**
 * WordPress API Google Search Console Module
 * Functions for Google Search Console operations
 */

import { BACKEND_API_BASE } from './connection';
import type {
  GSCPagePerformanceResult,
  SitemapIndexingResult,
  IndexingProgress
} from './types';

/**
 * Fetch GSC Page Performance for a specific URL
 * 
 * @param siteUrl - Site URL to query GSC for
 * @param pageUrl - Specific page URL to get performance data for
 * @param startDate - Start date in YYYY-MM-DD format (optional, defaults to 3 months ago)
 * @param endDate - End date in YYYY-MM-DD format (optional, defaults to 3 days ago)
 * 
 * @returns Promise resolving to GSCPagePerformanceResult with queries and top keyword
 * 
 * @throws Error if backend server is not running or API call fails
 */
export async function fetchGSCPagePerformance(
  siteUrl: string,
  pageUrl: string,
  startDate?: string,
  endDate?: string
): Promise<GSCPagePerformanceResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/fetch-page-performance`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        pageUrl,
        startDate,
        endDate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string; hint?: string; serviceAccountEmail?: string };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      let message = errorData.error || errorData.message || `HTTP ${response.status}`;
      if (errorData.serviceAccountEmail || errorData.hint) {
        if (errorData.serviceAccountEmail) {
          message += `\n\nService account: ${errorData.serviceAccountEmail}`;
        }
        if (errorData.hint) {
          message += `\n\n${errorData.hint}`;
        }
      }
      throw new Error(message);
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
 * Index all URLs from a sitemap in Google Search Console
 * Checks each URL's indexing status and requests indexing for non-indexed URLs
 * 
 * @param siteUrl - Site URL registered in Google Search Console
 * @param sitemapUrl - Sitemap URL to parse and process
 * @param username - Optional WordPress username if sitemap requires auth
 * @param appPassword - Optional WordPress app password if sitemap requires auth
 * @param onProgress - Optional callback for progress updates
 * 
 * @returns Promise resolving to SitemapIndexingResult with processing statistics
 * 
 * @throws Error if backend server is not running or API call fails
 */
export async function indexSitemapUrls(
  siteUrl: string,
  sitemapUrl: string,
  username?: string,
  appPassword?: string,
  onProgress?: (progress: IndexingProgress) => void
): Promise<SitemapIndexingResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/index-sitemap-urls`;
  
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
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Call progress callback with final results if provided
    if (onProgress && data.success) {
      onProgress({
        processed: data.processed,
        total: data.total,
        indexed: data.indexed,
        requested: data.requested,
        errors: data.errors,
      });
    }
    
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

