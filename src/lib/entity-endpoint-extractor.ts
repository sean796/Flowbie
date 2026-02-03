/**
 * Entity Endpoint Extractor
 * Extracts WordPress REST API endpoint directly from entity sitemap URL
 * NO normalization, NO sanitization - uses exactly as extracted
 */

/**
 * Extracts endpoint from entity sitemap URL
 * Example: "service-areas-sitemap.xml" → "service-areas"
 * Example: "posts-sitemap.xml" → "posts"
 * 
 * @param entitySitemapUrl - The entity sitemap URL (e.g., "https://site.com/service-areas-sitemap.xml")
 * @returns The endpoint string exactly as extracted, or "posts" as default fallback
 */
export function extractEndpointFromEntitySitemapUrl(entitySitemapUrl: string): string {
  if (!entitySitemapUrl || !entitySitemapUrl.trim()) {
    return 'posts'; // Default fallback only
  }

  // Extract filename from URL
  const sitemapFilename = entitySitemapUrl.split('/').pop() || '';
  
  // Remove sitemap suffix (e.g., "-sitemap.xml" or "_sitemap.xml")
  const endpoint = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '');
  
  // Return exactly as extracted - NO normalization
  return endpoint || 'posts'; // Fallback only if extraction fails
}

