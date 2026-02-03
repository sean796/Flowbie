/**
 * Post Resolver
 * Resolves post/page URLs using WordPress REST API slug/ID lookup
 * Separate from entity resolution to avoid confusion
 */

const axios = require('axios');
const { normalizeUrl, getAuthConfig, extractSlug, logToDebug } = require('./utils');

/**
 * Resolve post/page URL using WordPress REST API
 * 
 * @param {string} siteUrl - WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - WordPress application password
 * @param {string} url - URL to resolve
 * @returns {Promise<{id: number, subtype: string, link: string, slug: string} | null>}
 */
async function resolvePostUrl(siteUrl, username, appPassword, url) {
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

  const slug = extractSlug(normalizedInputUrl);
  if (!slug) {
    console.log('[Post Resolver] Could not extract slug from URL');
    return null;
  }

  console.log(`[Post Resolver] Resolving post URL: ${url}`);
  console.log(`[Post Resolver] Extracted slug: ${slug}`);

  // Try posts endpoint first
  const endpointsToTry = ['posts', 'pages'];

  for (const endpoint of endpointsToTry) {
    try {
      const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&context=edit`;
      console.log(`[Post Resolver] Trying ${endpoint} endpoint...`);

      const response = await axios.get(apiUrl, authConfig);

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        // Prefer top-level (no parent), then accept any non-trash match so child pages (e.g. /operating-systems/softtouch-motorization/) resolve
        const candidates = response.data.filter(p => {
          const isPost = p.type === endpoint.slice(0, -1) || p.type === endpoint; // 'post' or 'posts', 'page' or 'pages'
          const isNotTrash = p.status !== 'trash' && p.status !== 'trashed';
          return isPost && isNotTrash;
        });
        const canonical = candidates.find(p => p.parent === null || p.parent === undefined || p.parent === 0) || candidates[0];

        if (canonical) {
          console.log(`[Post Resolver] ✓ Resolved via ${endpoint}: ID ${canonical.id}`);
          return {
            id: canonical.id,
            subtype: endpoint.slice(0, -1), // 'posts' -> 'post', 'pages' -> 'page'
            link: canonical.link || url,
            slug: canonical.slug || slug
          };
        }
      }
    } catch (error) {
      // Endpoint doesn't exist or error - try next endpoint
      if (error.response && error.response.status === 404) {
        console.log(`[Post Resolver] Endpoint ${endpoint} returned 404, trying next...`);
      } else {
        console.warn(`[Post Resolver] Error fetching from ${endpoint}:`, error.message);
      }
      continue;
    }
  }

  console.log('[Post Resolver] ✗ Could not resolve post URL');
  return null;
}

module.exports = { resolvePostUrl };

