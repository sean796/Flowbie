/**
 * WordPress API Media Module
 * Functions for uploading media to WordPress
 */

import { BACKEND_API_BASE } from './connection';
import type { WordPressMediaUploadResult } from './types';

/**
 * Upload media to WordPress Media Library
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param imageBase64 - Base64 encoded image data (with or without data URL prefix)
 * @param filename - Optional filename for the image
 * @param title - Optional title for the media
 * @param alt - Optional alt text for the image (Rank Math: use Focus Keyword in alt)
 *
 * @returns Promise resolving to WordPressMediaUploadResult with media ID and URL
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function uploadWordPressMedia(
  siteUrl: string,
  username: string,
  appPassword: string,
  imageBase64: string,
  filename?: string,
  title?: string,
  alt?: string
): Promise<WordPressMediaUploadResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/upload-media`;
  
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
        imageBase64,
        filename,
        title,
        ...(alt != null && alt !== '' ? { alt } : {}),
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

