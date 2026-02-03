/**
 * WordPress Post Content Route
 * POST /get-post-content - Get full post content
 */

const express = require('express');
const axios = require('axios');
const { normalizeUrl, getAuthConfig, extractSlug } = require('./utils');

const router = express.Router();

/**
 * Get full post content from WordPress REST API by IDs or slugs
 * POST /get-post-content
 */
router.post('/get-post-content', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, postIds = [], postSlugs = [], resolvedObjects = [] } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    if ((!postIds || postIds.length === 0) && (!postSlugs || postSlugs.length === 0) && (!resolvedObjects || resolvedObjects.length === 0)) {
      return res.status(400).json({
        error: 'Must provide either postIds, postSlugs, or resolvedObjects array'
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);
    
    console.log(`[WordPress] Fetching post content for ${postIds.length} IDs, ${postSlugs.length} slugs, and ${resolvedObjects.length} resolved objects`);
    
    const posts = [];
    const errors = [];
    const authConfig = getAuthConfig(username, appPassword, { timeout: 10000 });
    
    // STEP 1: Query WordPress REST API to discover all available post types
    let availablePostTypes = ['posts', 'pages']; // Default fallback
    try {
      const typesApiUrl = `${normalizedUrl}/wp-json/wp/v2/types`;
      console.log(`[WordPress] Querying WordPress REST API for available post types: ${typesApiUrl}`);
      const typesResponse = await axios.get(typesApiUrl, {
        ...authConfig,
        validateStatus: (status) => status < 500
      });
      
      if (typesResponse.status === 200 && typesResponse.data) {
        const types = typesResponse.data || {};
        const systemPostTypes = [
          'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 
          'oembed_cache', 'user_request', 'wp_block', 'templates', 'template-parts', 
          'global-styles', 'navigation', 'font-families', 'e-floating-buttons',
          'elementor_library', 'elementor_snippet', 'qi-addons-template', 'rank_math_schema'
        ];
        
        const filteredTypes = Object.keys(types).filter(type => {
          // Filter out system post types - only keep actual content post types
          const typeInfo = types[type];
          const restBase = typeInfo?.rest_base || type;
          
          // Exclude system types
          if (systemPostTypes.includes(type) || systemPostTypes.includes(restBase)) {
            return false;
          }
          
          // Exclude if rest_base contains regex patterns (like font-families/(?P<font_family_id>[\d]+)/font-faces)
          if (restBase.includes('(') || restBase.includes('?P<') || restBase.includes('[')) {
            return false;
          }
          
          return true;
        });
        
        // Convert post type names to REST API endpoint names
        availablePostTypes = filteredTypes.map(type => {
          const typeInfo = types[type];
          return typeInfo?.rest_base || type;
        }).filter(endpoint => {
          // Final filter: exclude endpoints with regex patterns
          return !endpoint.includes('(') && !endpoint.includes('?P<') && !endpoint.includes('[');
        });
        
        console.log(`[WordPress] Discovered ${availablePostTypes.length} content post types: ${availablePostTypes.join(', ')}`);
      }
    } catch (typesError) {
      console.warn(`[WordPress] Could not query post types, using defaults: ${typesError.message}`);
    }
    
    try {
      // Fetch by resolved objects (id + subtype) - NEW METHOD
      for (const obj of resolvedObjects) {
        try {
          const { id, subtype } = obj;
          
          if (!id) {
            errors.push({ resolvedObject: obj, error: 'Missing id in resolved object' });
            console.error(`[WordPress] Invalid resolved object: missing id`, obj);
            continue;
          }
          
          // STEP 2: Query WordPress REST API systematically to find the correct post type
          let postFound = false;
          let discoveredEndpoint = null;
          let discoveredSubtype = null;
          let postData = null;
          
          // Try each available post type until we find the one that works
          for (const postTypeEndpoint of availablePostTypes) {
            if (postFound) break;
            
            try {
              const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postTypeEndpoint}/${id}`;
              // #region agent log
              try { require('fs').appendFileSync('b:\\USE THIS\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\.cursor\\debug.log', JSON.stringify({location:'server/wordpress/post-content.js:75',message:'Querying WordPress API for post type',data:{id,postTypeEndpoint,apiUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
              // #endregion
              
              const response = await axios.get(apiUrl, {
                ...authConfig,
                validateStatus: (status) => status < 500
              });
              
              // #region agent log
              try { require('fs').appendFileSync('b:\\USE THIS\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\.cursor\\debug.log', JSON.stringify({location:'server/wordpress/post-content.js:82',message:'WordPress API response',data:{id,postTypeEndpoint,status:response.status,hasData:!!response.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
              // #endregion
              
              if (response.status === 200) {
                discoveredEndpoint = postTypeEndpoint;
                discoveredSubtype = postTypeEndpoint === 'posts' ? 'post' : postTypeEndpoint === 'pages' ? 'page' : postTypeEndpoint;
                postData = {
                  id: response.data.id,
                  slug: response.data.slug,
                  title: response.data.title?.rendered || response.data.title || '',
                  content: response.data.content?.rendered || response.data.content || '',
                  excerpt: response.data.excerpt?.rendered || response.data.excerpt || '',
                  date_gmt: response.data.date_gmt || response.data.date || '',
                  status: response.data.status || 'publish',
                  link: response.data.link || `${normalizedUrl}/${response.data.slug}`,
                  categories: response.data.categories || [],
                  tags: response.data.tags || [],
                  postTypeEndpoint: discoveredEndpoint,
                  postTypeSubtype: discoveredSubtype,
                  fullData: response.data
                };
                postFound = true;
                console.log(`[WordPress] Successfully discovered post type: ${discoveredEndpoint}/${id}: "${postData.title.substring(0, 50)}..."`);
                // #region agent log
                try { require('fs').appendFileSync('b:\\USE THIS\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\.cursor\\debug.log', JSON.stringify({location:'server/wordpress/post-content.js:100',message:'Post type discovered successfully',data:{id,discoveredEndpoint,discoveredSubtype,title:postData.title?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
                // #endregion
                break;
              } else if (response.status === 401) {
                const errorMsg = 'Authentication failed. Please verify your username and application password.';
                console.error(`[WordPress] Authentication failed for ${postTypeEndpoint}/${id}`);
                errors.push({ resolvedObject: obj, error: errorMsg });
                postFound = true; // Stop trying other types on auth failure
                break;
              } else if (response.status === 403) {
                const errorMsg = 'Permission denied. The post may be private or you may not have access to this post type.';
                console.error(`[WordPress] Permission denied for ${postTypeEndpoint}/${id}`);
                errors.push({ resolvedObject: obj, error: errorMsg });
                postFound = true; // Stop trying other types on permission failure
                break;
              }
              // If 404, continue to next post type
            } catch (tryError) {
              // Continue to next post type on error (unless it's auth/permission)
              if (tryError.response) {
                const status = tryError.response.status;
                if (status === 401 || status === 403) {
                  const errorMsg = status === 401 
                    ? 'Authentication failed. Please verify your username and application password.'
                    : 'Permission denied. The post may be private or you may not have access.';
                  errors.push({ resolvedObject: obj, error: errorMsg });
                  postFound = true;
                  break;
                }
              }
            }
          }
          
          if (postFound && postData) {
            posts.push(postData);
          } else {
            // Post not found in any post type
            const errorMsg = `Post with ID ${id} not found in any available post type. Tried: ${availablePostTypes.join(', ')}`;
            console.error(`[WordPress] Post not found after querying all post types: ${id}`);
            errors.push({ resolvedObject: obj, error: errorMsg });
          }
        } catch (error) {
          let errorMsg = error.message;
          
          if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;
            const errorData = error.response.data;
            
            if (status === 401) {
              errorMsg = 'Authentication failed. Please verify your username and application password.';
            } else if (status === 403) {
              errorMsg = 'Permission denied. You may not have access to this post type.';
            } else if (status === 404) {
              errorMsg = `Post not found at endpoint /wp/v2/${obj.subtype === 'post' ? 'posts' : obj.subtype}/${obj.id}. The post may have been deleted or the ID is incorrect.`;
            } else {
              errorMsg = `HTTP ${status} ${statusText}: ${errorData?.message || errorData?.error || 'Unknown error'}`;
            }
            
            console.error(`[WordPress] HTTP error fetching ${obj.subtype}/${obj.id}:`, {
              status,
              statusText,
              error: errorData,
              endpoint: `${normalizedUrl}/wp-json/wp/v2/${obj.subtype === 'post' ? 'posts' : obj.subtype}/${obj.id}`
            });
          } else if (error.code === 'ECONNABORTED') {
            errorMsg = 'Request timeout. The WordPress server took too long to respond.';
          } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            errorMsg = `Cannot connect to WordPress site at ${normalizedUrl}. Please verify the site URL.`;
          }
          
          console.error(`[WordPress] Error fetching content for ${obj.subtype}/${obj.id}:`, errorMsg, error);
          errors.push({ resolvedObject: obj, error: errorMsg });
        }
      }
      
      // Fetch by IDs (legacy support)
      for (const postId of postIds) {
        try {
          const apiUrl = `${normalizedUrl}/wp-json/wp/v2/posts/${postId}`;
          const response = await axios.get(apiUrl, authConfig);
          
          if (response.status === 200) {
            posts.push({
              id: response.data.id,
              slug: response.data.slug,
              title: response.data.title?.rendered || response.data.title || '',
              content: response.data.content?.rendered || response.data.content || '',
              excerpt: response.data.excerpt?.rendered || response.data.excerpt || '',
              date_gmt: response.data.date_gmt || '',
              link: response.data.link || `${normalizedUrl}/${response.data.slug}`,
              categories: response.data.categories || [],
              tags: response.data.tags || [],
              postTypeEndpoint: 'posts',
              fullData: response.data
            });
          }
        } catch (error) {
          errors.push({ id: postId, error: error.message });
        }
      }
      
      // Fetch by slugs (legacy support)
      for (const slug of postSlugs) {
        try {
          const apiUrl = `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
          const response = await axios.get(apiUrl, authConfig);
          
          if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            const post = response.data[0];
            posts.push({
              id: post.id,
              slug: post.slug,
              title: post.title?.rendered || post.title || '',
              content: post.content?.rendered || post.content || '',
              excerpt: post.excerpt?.rendered || post.excerpt || '',
              date_gmt: post.date_gmt || '',
              link: post.link || `${normalizedUrl}/${post.slug}`,
              categories: post.categories || [],
              tags: post.tags || [],
              postTypeEndpoint: 'posts',
              fullData: post
            });
          }
        } catch (error) {
          errors.push({ slug: slug, error: error.message });
        }
      }
      
      console.log(`[WordPress] Retrieved ${posts.length} posts, ${errors.length} errors`);
      
      res.json({
        count: posts.length,
        posts: posts,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            count: 0,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else {
          return res.json({
            count: 0,
            error: `WordPress API error: ${error.response.status} ${error.response.statusText}`
          });
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[WordPress] Get post content error:', error);
    res.status(500).json({
      count: 0,
      error: error.message || 'Internal server error while fetching post content'
    });
  }
});

module.exports = router;

