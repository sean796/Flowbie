/**
 * Entity Endpoint Extractor (Server-side)
 * Extracts WordPress REST API endpoint from entity sitemap URL
 */

/**
 * Extracts endpoint from entity sitemap URL
 * Example: "service-areas-sitemap.xml" → "service-areas"
 * 
 * @param {string} entitySitemapUrl - The entity sitemap URL
 * @returns {string} The endpoint string
 */
function extractEndpointFromEntitySitemapUrl(entitySitemapUrl) {
  if (!entitySitemapUrl) {
    return null;
  }

  // Extract exactly: url.split('/').pop().replace('-sitemap.xml', '')
  const sitemapFilename = entitySitemapUrl.split('/').pop() || '';
  const endpoint = sitemapFilename.replace('-sitemap.xml', '');
  
  // Return exact string as extracted - no transforms beyond removing sitemap suffix
  return endpoint || null;
}

module.exports = { extractEndpointFromEntitySitemapUrl };

