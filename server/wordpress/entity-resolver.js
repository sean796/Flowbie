/**
 * Entity Resolver
 * Resolves entity URLs using known endpoint (from entity selection or sitemap)
 * No guessing - uses exact endpoint provided
 */

const axios = require('axios');
const { normalizeUrl, getAuthConfig, extractSlug } = require('./utils');
const { extractEndpointFromEntitySitemapUrl } = require('./utils/entity-endpoint-extractor');

/**
 * Resolve entity URL using known endpoint
 * 
 * @param {string} siteUrl - WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - WordPress application password
 * @param {string} url - URL to resolve
 * @param {string} entitySitemapUrl - Entity sitemap URL (optional, for endpoint extraction)
 * @param {string} knownEndpoint - Known endpoint (optional, highest priority)
 * @returns {Promise<{id: number, subtype: string, link: string, slug: string} | null>}
 */
async function resolveEntityUrl(siteUrl, username, appPassword, url, entitySitemapUrl = null, knownEndpoint = null) {
  const normalizedUrl = normalizeUrl(siteUrl);
  const authConfig = getAuthConfig(username, appPassword, {
    timeout: 10000,
    validateStatus: (status) => status < 500
  });

  // Normalize input URL
  let normalizedInputUrl = url.trim();
  if (!normalizedInputUrl.startsWith('http://') && !normalizedInputUrl.startsWith('https://')) {
    normalizedInputUrl = normalizedUrl + (normalizedInputUrl.startsWith('/') ? normalizedInputUrl : '/' + normalizedInputUrl);
  }

  const urlObj = new URL(normalizedInputUrl);
  const targetPath = urlObj.pathname.replace(/\/$/, '').toLowerCase();

  // Determine endpoint: use knownEndpoint if provided, otherwise extract from entitySitemapUrl
  const endpoint = knownEndpoint || extractEndpointFromEntitySitemapUrl(entitySitemapUrl);

  if (!endpoint) {
    throw new Error('Entity resolver called without endpoint');
  }

  console.log('[ENTITY RESOLVER]', {
    endpoint,
    url,
    knownEndpoint,
    entitySitemapUrl,
  });

  // Normalize URLs for comparison
  const normalizeUrlForMatch = (urlStr) => {
    try {
      const u = new URL(urlStr);
      return u.pathname.replace(/\/$/, '').toLowerCase();
    } catch {
      return urlStr.replace(/\/$/, '').toLowerCase();
    }
  };

  // Fetch all published entities and match by URL
  // Check multiple pages if needed (limit to 10 pages)
  for (let page = 1; page <= 10; page++) {
    try {
      const fetchUrl = `${normalizedUrl}/wp-json/wp/v2/${endpoint}?per_page=100&page=${page}&status=publish&_fields=id,slug,link,type,post_type,status,parent`;
      console.log(`[Entity Resolver] Fetching from endpoint: ${endpoint}, page: ${page}`);

      const fetchResponse = await axios.get(fetchUrl, authConfig);

      if (fetchResponse.status === 200 && Array.isArray(fetchResponse.data)) {
        // Find matching entity by link
        for (const entity of fetchResponse.data) {
          const linkPath = normalizeUrlForMatch(entity.link || '');
          if (linkPath === targetPath) {
            // Verify it's canonical
            const isCanonical = (entity.parent === null || entity.parent === undefined || entity.parent === 0) &&
                               entity.status !== 'trash' &&
                               entity.status !== 'trashed' &&
                               entity.type !== 'revision' &&
                               entity.post_type !== 'revision';
            
            if (isCanonical) {
              console.log(`[Entity Resolver] ✓ Resolved via ${endpoint}: ID ${entity.id}, endpointUsed: ${endpoint}`);
              return {
                id: entity.id,
                subtype: endpoint,
                link: entity.link || url,
                slug: entity.slug || extractSlug(url)
              };
            }
          }
        }

        // Check if there are more pages
        const totalPages = parseInt(fetchResponse.headers['x-wp-totalpages'] || '1', 10);
        if (page >= totalPages) {
          break; // No more pages
        }
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`[Entity Resolver] Endpoint ${endpoint} not found`);
        break; // Endpoint doesn't exist, stop trying
      } else {
        console.warn(`[Entity Resolver] Error fetching from ${endpoint}:`, error.message);
        break; // Error occurred, stop trying
      }
    }
  }

  console.log('[Entity Resolver] ✗ Could not resolve entity URL');
  return null;
}

module.exports = { resolveEntityUrl };
