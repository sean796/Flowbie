/**
 * ACF Field Discovery Utilities
 * Discover ACF field groups and scan fields across WordPress site
 */

import { BACKEND_API_BASE } from './connection';
import type { WordPressSite } from '@/components/integrations/types';

export interface ACFFieldDefinition {
  name: string;
  label: string;
  type: string;
  groupId?: number;
  groupTitle?: string;
  location?: any[];
  sampleValue?: any;
  occurrenceCount?: number;
}

export interface ACFFieldGroup {
  id: number;
  title: string;
  fields: ACFFieldDefinition[];
  location: any[];
}

export interface ACFDiscoveryResult {
  success: boolean;
  fieldGroups: ACFFieldGroup[];
  fields: ACFFieldDefinition[];
  method: 'acf_rest_api' | 'sample_scan' | null;
  error?: string;
}

/**
 * Discover ACF field groups from WordPress site
 */
export async function discoverACFFieldGroups(
  site: WordPressSite,
  postType?: string,
  postTypeEndpoint?: string,
  sampleSize: number = 10
): Promise<ACFDiscoveryResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/discover-acf-field-groups`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        postType,
        postTypeEndpoint,
        sampleSize,
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
 * Get ACF fields for a specific post.
 * Uses backend POST /api/wordpress/get-acf-fields to avoid CORS (no direct browser fetch to WordPress).
 */
export async function getACFFieldsForPost(
  site: WordPressSite,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; fields: Record<string, any>; error?: string }> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-acf-fields`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        postId,
        postType,
        postTypeEndpoint,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string } = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      return {
        success: false,
        fields: {},
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: data.success === true,
      fields: data.fields && typeof data.fields === 'object' ? data.fields : {},
      error: data.error || undefined,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        fields: {},
        error: `Cannot connect to backend at ${url}. Ensure the backend server is running (e.g. http://localhost:3001).`,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      fields: {},
      error: message,
    };
  }
}

/**
 * Scan ACF fields across multiple posts to find which fields are in use
 */
export async function scanACFFieldsAcrossSite(
  site: WordPressSite,
  postTypes: string[] = ['post', 'page'],
  maxPostsPerType: number = 50
): Promise<{
  success: boolean;
  fields: Record<string, {
    name: string;
    type: string;
    occurrenceCount: number;
    sampleValues: any[];
    postTypes: string[];
  }>;
  error?: string;
}> {
  // This will be implemented by scanning posts via the content scanner
  // For now, return empty result
  return {
    success: true,
    fields: {},
  };
}
