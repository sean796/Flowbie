/**
 * WordPress API Meta Module
 * Functions for getting and updating WordPress post meta fields
 */

import { BACKEND_API_BASE } from './connection';
import type {
  WordPressPostMetaResult,
  WordPressPostMetaUpdateResult
} from './types';

/**
 * Get WordPress post with all meta fields
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to fetch
 * @param postType - Post type (default: 'post') - internal type for function signature
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name (e.g., 'posts', 'service-areas') - use exact endpoint from scraped post
 * 
 * @returns Promise resolving to WordPressPostMetaResult with all meta fields
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function getWordPressPostMeta(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string // Actual WordPress REST API endpoint name from scraped post
): Promise<WordPressPostMetaResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-post-meta`;
  
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
        postId,
        postType,
        postTypeEndpoint, // Pass the exact endpoint from scraped post
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
 * Update WordPress post meta fields
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to update
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name from scraped post
 * @param meta - Object containing meta fields to update
 * 
 * @returns Promise resolving to WordPressPostMetaUpdateResult with update status
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function updateWordPressPostMeta(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string, // Actual WordPress REST API endpoint name from scraped post
  meta: Record<string, any>
): Promise<WordPressPostMetaUpdateResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/update-post-meta`;
  
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
        postId,
        postType,
        postTypeEndpoint, // Pass the exact endpoint from scraped post
        meta,
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

