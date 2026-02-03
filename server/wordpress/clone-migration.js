/**
 * WordPress Content Migration
 * Export and import content between WordPress sites
 */

const axios = require('axios');
const { normalizeUrl, getAuthConfig } = require('./utils');

/**
 * Export content from source site
 * @param {string} siteUrl - Source site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {object} options - Export options
 * @returns {Promise<object>} Exported content
 */
async function exportContent(siteUrl, username, appPassword, options = {}) {
  const {
    includePosts = true,
    includePages = true,
    includeMedia = false,
    includeACF = true,
    limit = 100
  } = options;

  const normalizedUrl = normalizeUrl(siteUrl);
  const authConfig = getAuthConfig(username, appPassword, { timeout: 60000 });
  const exported = {
    posts: [],
    pages: [],
    media: [],
    acfFields: {}
  };

  try {
    // Export posts
    if (includePosts) {
      try {
        const postsUrl = `${normalizedUrl}/wp-json/wp/v2/posts?per_page=${limit}&context=edit`;
        const postsResponse = await axios.get(postsUrl, authConfig);
        if (postsResponse.status === 200 && Array.isArray(postsResponse.data)) {
          exported.posts = postsResponse.data.map(post => ({
            id: post.id,
            title: post.title?.rendered || post.title,
            content: post.content?.rendered || post.content,
            excerpt: post.excerpt?.rendered || post.excerpt,
            slug: post.slug,
            status: post.status,
            date: post.date,
            categories: post.categories || [],
            tags: post.tags || [],
            acf: post.acf || {}
          }));
        }
      } catch (error) {
        console.error('[Clone Migration] Error exporting posts:', error.message);
      }
    }

    // Export pages
    if (includePages) {
      try {
        const pagesUrl = `${normalizedUrl}/wp-json/wp/v2/pages?per_page=${limit}&context=edit`;
        const pagesResponse = await axios.get(pagesUrl, authConfig);
        if (pagesResponse.status === 200 && Array.isArray(pagesResponse.data)) {
          exported.pages = pagesResponse.data.map(page => ({
            id: page.id,
            title: page.title?.rendered || page.title,
            content: page.content?.rendered || page.content,
            excerpt: page.excerpt?.rendered || page.excerpt,
            slug: page.slug,
            status: page.status,
            date: page.date,
            acf: page.acf || {}
          }));
        }
      } catch (error) {
        console.error('[Clone Migration] Error exporting pages:', error.message);
      }
    }

    // Export media (if needed)
    if (includeMedia) {
      try {
        const mediaUrl = `${normalizedUrl}/wp-json/wp/v2/media?per_page=${limit}`;
        const mediaResponse = await axios.get(mediaUrl, authConfig);
        if (mediaResponse.status === 200 && Array.isArray(mediaResponse.data)) {
          exported.media = mediaResponse.data.map(media => ({
            id: media.id,
            source_url: media.source_url,
            title: media.title?.rendered || media.title,
            alt_text: media.alt_text,
            mime_type: media.mime_type
          }));
        }
      } catch (error) {
        console.error('[Clone Migration] Error exporting media:', error.message);
      }
    }

    return {
      success: true,
      exported,
      count: {
        posts: exported.posts.length,
        pages: exported.pages.length,
        media: exported.media.length
      }
    };
  } catch (error) {
    console.error('[Clone Migration] Export error:', error);
    return {
      success: false,
      error: error.message || 'Failed to export content',
      exported
    };
  }
}

/**
 * Import content to target site
 * @param {string} siteUrl - Target site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {object} content - Content to import
 * @returns {Promise<object>} Import result
 */
async function importContent(siteUrl, username, appPassword, content) {
  const normalizedUrl = normalizeUrl(siteUrl);
  const authConfig = getAuthConfig(username, appPassword, { timeout: 60000 });
  const imported = {
    posts: [],
    pages: [],
    media: [],
    errors: []
  };

  try {
    // Import posts
    if (content.posts && content.posts.length > 0) {
      for (const post of content.posts) {
        try {
          const postData = {
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            slug: post.slug,
            status: post.status || 'publish',
            date: post.date,
            categories: post.categories || [],
            tags: post.tags || []
          };

          // Include ACF fields if present
          if (post.acf && Object.keys(post.acf).length > 0) {
            postData.acf = post.acf;
          }

          const createUrl = `${normalizedUrl}/wp-json/wp/v2/posts`;
          const response = await axios.post(createUrl, postData, authConfig);
          
          if (response.status === 201 || response.status === 200) {
            imported.posts.push({
              originalId: post.id,
              newId: response.data.id,
              title: post.title
            });
          }
        } catch (error) {
          imported.errors.push({
            type: 'post',
            id: post.id,
            error: error.response?.data?.message || error.message
          });
        }
      }
    }

    // Import pages
    if (content.pages && content.pages.length > 0) {
      for (const page of content.pages) {
        try {
          const pageData = {
            title: page.title,
            content: page.content,
            excerpt: page.excerpt,
            slug: page.slug,
            status: page.status || 'publish',
            date: page.date
          };

          // Include ACF fields if present
          if (page.acf && Object.keys(page.acf).length > 0) {
            pageData.acf = page.acf;
          }

          const createUrl = `${normalizedUrl}/wp-json/wp/v2/pages`;
          const response = await axios.post(createUrl, pageData, authConfig);
          
          if (response.status === 201 || response.status === 200) {
            imported.pages.push({
              originalId: page.id,
              newId: response.data.id,
              title: page.title
            });
          }
        } catch (error) {
          imported.errors.push({
            type: 'page',
            id: page.id,
            error: error.response?.data?.message || error.message
          });
        }
      }
    }

    return {
      success: true,
      imported,
      summary: {
        postsImported: imported.posts.length,
        pagesImported: imported.pages.length,
        errors: imported.errors.length
      }
    };
  } catch (error) {
    console.error('[Clone Migration] Import error:', error);
    return {
      success: false,
      error: error.message || 'Failed to import content',
      imported
    };
  }
}

/**
 * Copy theme settings (simplified - would need theme-specific implementation)
 * @param {string} sourceUrl - Source site URL
 * @param {string} sourceUsername - Source username
 * @param {string} sourceAppPassword - Source app password
 * @param {string} targetUrl - Target site URL
 * @param {string} targetUsername - Target username
 * @param {string} targetAppPassword - Target app password
 * @returns {Promise<object>} Copy result
 */
async function copyThemeSettings(sourceUrl, sourceUsername, sourceAppPassword, targetUrl, targetUsername, targetAppPassword) {
  // Theme settings are typically stored in options table
  // This would require direct database access or theme-specific REST endpoints
  // For now, return a placeholder
  return {
    success: true,
    message: 'Theme settings copy not implemented - requires theme-specific endpoints'
  };
}

/**
 * Copy plugin configurations (simplified - would need plugin-specific implementation)
 * @param {string} sourceUrl - Source site URL
 * @param {string} sourceUsername - Source username
 * @param {string} sourceAppPassword - Source app password
 * @param {string} targetUrl - Target site URL
 * @param {string} targetUsername - Target username
 * @param {string} targetAppPassword - Target app password
 * @returns {Promise<object>} Copy result
 */
async function copyPluginConfigs(sourceUrl, sourceUsername, sourceAppPassword, targetUrl, targetUsername, targetAppPassword) {
  // Plugin configurations are typically stored in options table
  // This would require direct database access or plugin-specific REST endpoints
  // For now, return a placeholder
  return {
    success: true,
    message: 'Plugin config copy not implemented - requires plugin-specific endpoints'
  };
}

module.exports = {
  exportContent,
  importContent,
  copyThemeSettings,
  copyPluginConfigs
};
