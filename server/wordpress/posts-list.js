/**
 * WordPress Post List Routes
 * POST /get-scheduled-posts - Get scheduled posts
 * POST /get-published-posts - Get published posts
 */

const express = require('express');
const axios = require('axios');
const { normalizeUrl, getAuthConfig } = require('./utils');

const router = express.Router();

/**
 * Get scheduled posts from WordPress REST API
 * POST /get-scheduled-posts
 */
router.post('/get-scheduled-posts', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, month, year, allScheduled } = req.body;
    
    // Validate required fields
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        count: 0,
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    // Normalize and validate URL format
    const normalizedUrl = normalizeUrl(siteUrl);
    
    // Validate WordPress REST API URL format
    const wpApiPattern = /^https?:\/\/.+/;
    if (!wpApiPattern.test(normalizedUrl)) {
      return res.status(400).json({
        count: 0,
        error: 'Invalid site URL format. Please provide a valid WordPress site URL.'
      });
    }
    
    // Determine target month/year (default to current month if not requesting all scheduled posts)
    const now = new Date();
    const shouldFilterByDate = !allScheduled && (month !== undefined || year !== undefined);
    const targetMonth = shouldFilterByDate && month !== undefined ? parseInt(month, 10) : now.getMonth();
    const targetYear = shouldFilterByDate && year !== undefined ? parseInt(year, 10) : now.getFullYear();
    
    // Construct WordPress REST API endpoint URL
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/posts`;
    
    console.log(`[WordPress] Fetching scheduled posts from: ${apiUrl}`);
    if (allScheduled) {
      console.log(`[WordPress] Retrieving ALL scheduled posts (no date filter)`);
    } else {
      console.log(`[WordPress] Filtering scheduled posts for ${targetYear}-${targetMonth + 1}`);
    }
    
    const allScheduledPosts = [];
    const allPosts = [];
    let page = 1;
    let hasMore = true;
    
    try {
      // Paginate through all scheduled posts
      while (hasMore) {
        // CRITICAL: Must set status='future' to retrieve scheduled posts
        const authConfig = getAuthConfig(username, appPassword, {
          timeout: 10000,
          validateStatus: (status) => status < 500
        });
        
        const config = {
          params: {
            status: 'future',
            per_page: 100,
            page: page
          },
          ...authConfig
        };
        
        const response = await axios.get(apiUrl, config);
        
        if (response.status === 200) {
          const posts = Array.isArray(response.data) ? response.data : [];
          
          console.log(`[WordPress] Page ${page}: Found ${posts.length} scheduled posts`);
          
          if (posts.length === 0) {
            hasMore = false;
            break;
          }
          
          allPosts.push(...posts);
          
          let filteredPosts;
          if (allScheduled) {
            filteredPosts = posts;
          } else {
            filteredPosts = posts.filter(post => {
              if (!post.date_gmt) {
                console.log(`[WordPress] Post ${post.id} missing date_gmt, skipping`);
                return false;
              }
              
              const postDate = new Date(post.date_gmt);
              const postMonth = postDate.getUTCMonth();
              const postYear = postDate.getUTCFullYear();
              
              const matches = postMonth === targetMonth && postYear === targetYear;
              if (!matches) {
                console.log(`[WordPress] Post ${post.id} date ${post.date_gmt} (${postYear}-${postMonth + 1}) doesn't match target ${targetYear}-${targetMonth + 1}`);
              }
              
              return matches;
            });
          }
          
          console.log(`[WordPress] Page ${page}: ${filteredPosts.length} posts ${allScheduled ? 'retrieved' : 'match target month'}`);
          allScheduledPosts.push(...filteredPosts);
          
          const totalPages = parseInt(response.headers['x-wp-totalpages'] || response.headers['X-WP-TotalPages'] || '1', 10);
          const totalPosts = parseInt(response.headers['x-wp-total'] || response.headers['X-WP-Total'] || '0', 10);
          
          console.log(`[WordPress] Page ${page}: Total pages: ${totalPages}, Total posts: ${totalPosts}`);
          
          if (page >= totalPages || posts.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        } else if (response.status === 401) {
          console.log(`[WordPress] Authentication failed: ${response.status}`);
          return res.json({
            count: 0,
            error: 'Authentication failed. Please verify:\n' +
                   '1. Your username is correct\n' +
                   '2. You are using an Application Password (not your regular password)\n' +
                   '3. Generate a new Application Password in WordPress: Users → Profile → Application Passwords'
          });
        } else {
          console.log(`[WordPress] Unexpected status: ${response.status}`);
          hasMore = false;
        }
      }
      
      const resultMessage = allScheduled 
        ? `Total scheduled posts found: ${allScheduledPosts.length}`
        : `Total scheduled posts found: ${allPosts.length}, matching ${targetYear}-${targetMonth + 1}: ${allScheduledPosts.length}`;
      console.log(`[WordPress] ${resultMessage}`);
      
      const result = {
        count: allScheduledPosts.length,
        posts: allScheduledPosts.map(post => ({
          id: post.id,
          slug: post.slug,
          date_gmt: post.date_gmt,
          title: post.title?.rendered || post.title || ''
        })),
        month: allScheduled ? undefined : targetMonth,
        year: allScheduled ? undefined : targetYear,
        allScheduled: allScheduled || false,
        debug: {
          totalScheduledPosts: allPosts.length,
          targetMonth: allScheduled ? undefined : targetMonth + 1,
          targetYear: allScheduled ? undefined : targetYear
        }
      };
      
      console.log(`[WordPress] Returning result:`, JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            count: 0,
            error: 'Authentication failed. Please verify:\n' +
                   '1. Your username is correct\n' +
                   '2. You are using an Application Password (not your regular password)\n' +
                   '3. Generate a new Application Password in WordPress: Users → Profile → Application Passwords\n' +
                   '4. Ensure the Application Password has not been revoked'
          });
        } else if (error.response.status === 404) {
          return res.json({
            count: 0,
            error: 'WordPress REST API not found at the specified URL.\n' +
                   'Please verify:\n' +
                   '1. The site URL is correct\n' +
                   '2. This is a WordPress site\n' +
                   '3. The WordPress REST API is enabled (standard in WordPress 4.7+)'
          });
        } else if (error.response.status === 403) {
          return res.json({
            count: 0,
            error: 'Access forbidden. The user account may not have permission to view scheduled posts.\n' +
                   'Please ensure the user has editor or administrator role.'
          });
        } else {
          return res.json({
            count: 0,
            error: `WordPress API error: ${error.response.status} ${error.response.statusText}\n` +
                   'The WordPress REST API returned an unexpected status code.'
          });
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.json({
          count: 0,
          error: 'Cannot reach WordPress site. Please check:\n' +
                 '1. The site URL is correct\n' +
                 '2. The site is accessible\n' +
                 '3. There are no network connectivity issues'
        });
      } else if (error.code === 'ETIMEDOUT') {
        return res.json({
          count: 0,
          error: 'Connection timeout. The WordPress site may be:\n' +
                 '1. Slow or experiencing high load\n' +
                 '2. Temporarily unreachable\n' +
                 '3. Behind a firewall blocking requests'
        });
      } else {
        throw error;
      }
    }
    } catch (error) {
      console.error('[WordPress] Get scheduled posts error:', error);
      res.status(500).json({
        count: 0,
        error: error.message || 'Internal server error while fetching scheduled posts'
      });
    }
});

/**
 * Get published posts from WordPress REST API
 * POST /get-published-posts
 */
router.post('/get-published-posts', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, limit = 100, offset = 0 } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        count: 0,
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/posts`;
    console.log(`[WordPress] Fetching published posts from: ${apiUrl}`);
    
    const allPosts = [];
    let page = Math.floor(offset / 100) + 1;
    let hasMore = true;
    const maxPosts = limit;
    
    try {
      while (hasMore && allPosts.length < maxPosts) {
        const authConfig = getAuthConfig(username, appPassword, {
          timeout: 30000,
          validateStatus: (status) => status < 500
        });
        
        const config = {
          params: {
            status: 'publish',
            per_page: Math.min(100, maxPosts - allPosts.length),
            page: page,
            _fields: 'id,slug,title,date_gmt,excerpt,link'
          },
          ...authConfig
        };
        
        console.log(`[WordPress] Fetching page ${page} from ${apiUrl}`);
        
        const response = await axios.get(apiUrl, config);
        
        if (response.status === 200) {
          const posts = Array.isArray(response.data) ? response.data : [];
          
          console.log(`[WordPress] Page ${page}: Received ${posts.length} posts`);
          
          if (posts.length === 0) {
            hasMore = false;
            break;
          }
          
          const metadata = posts.map(post => ({
            id: post.id,
            slug: post.slug || `post-${post.id}`,
            title: post.title?.rendered || post.title || 'Untitled',
            date_gmt: post.date_gmt || '',
            excerpt: post.excerpt?.rendered || post.excerpt || '',
            link: post.link || `${normalizedUrl}/${post.slug || `post-${post.id}`}`
          }));
          
          allPosts.push(...metadata);
          
          const totalPages = parseInt(response.headers['x-wp-totalpages'] || response.headers['X-WP-TotalPages'] || '1', 10);
          
          console.log(`[WordPress] Page ${page}: Total pages ${totalPages}, collected ${allPosts.length} posts so far`);
          
          if (page >= totalPages || posts.length < 100 || allPosts.length >= maxPosts) {
            hasMore = false;
          } else {
            page++;
          }
        } else if (response.status === 401) {
          console.error(`[WordPress] Authentication failed: ${response.status}`);
          return res.json({
            count: 0,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else {
          console.error(`[WordPress] Unexpected status: ${response.status}`);
          hasMore = false;
        }
      }
      
      const offsetPosts = allPosts.slice(offset % 100);
      
      console.log(`[WordPress] Retrieved ${offsetPosts.length} published posts (total available: ${allPosts.length})`);
      
      if (offsetPosts.length === 0 && allPosts.length === 0) {
        return res.json({
          count: 0,
          error: 'No published posts found. Make sure the WordPress site has published posts.'
        });
      }
      
      res.json({
        count: offsetPosts.length,
        posts: offsetPosts,
        total: allPosts.length
      });
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            count: 0,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (error.response.status === 404) {
          return res.json({
            count: 0,
            error: 'WordPress REST API not found at the specified URL.'
          });
        } else {
          return res.json({
            count: 0,
            error: `WordPress API error: ${error.response.status} ${error.response.statusText}`
          });
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.json({
          count: 0,
          error: 'Cannot reach WordPress site. Please check the URL.'
        });
      } else if (error.code === 'ETIMEDOUT') {
        return res.json({
          count: 0,
          error: 'Connection timeout. The WordPress site may be slow or unreachable.'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[WordPress] Get published posts error:', error);
    res.status(500).json({
      count: 0,
      error: error.message || 'Internal server error while fetching published posts'
    });
  }
});

/**
 * Get posts list for any post type (generic endpoint)
 * POST /get-posts-list
 */
router.post('/get-posts-list', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, postType = 'post', postTypeEndpoint, perPage = 100, page = 1, status } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        posts: [],
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);
    const finalEndpointName = postTypeEndpoint || (postType === 'post' ? 'posts' : postType === 'page' ? 'pages' : postType);
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}`;
    
    console.log(`[WordPress] Fetching ${finalEndpointName} from: ${apiUrl}`);
    
    try {
      const authConfig = getAuthConfig(username, appPassword, {
        timeout: 30000,
        validateStatus: (status) => status < 500
      });
      
      const config = {
        params: {
          per_page: Math.min(perPage, 100),
          page: page,
          _fields: 'id,slug,title,date_gmt,excerpt,link,status,type,post_type',
          ...(status && { status })
        },
        ...authConfig
      };
      
      const response = await axios.get(apiUrl, config);
      
      if (response.status === 200) {
        const posts = Array.isArray(response.data) ? response.data : [];
        
        const formattedPosts = posts.map(post => ({
          id: post.id,
          slug: post.slug || `post-${post.id}`,
          title: post.title?.rendered || post.title || 'Untitled',
          date_gmt: post.date_gmt || '',
          excerpt: post.excerpt?.rendered || post.excerpt || '',
          link: post.link || `${normalizedUrl}/${post.slug || `post-${post.id}`}`,
          status: post.status || 'publish',
          type: post.type || post.post_type || postType,
          post_type: post.post_type || postType
        }));
        
        res.json({
          posts: formattedPosts,
          total: parseInt(response.headers['x-wp-total'] || response.headers['X-WP-Total'] || '0', 10),
          totalPages: parseInt(response.headers['x-wp-totalpages'] || response.headers['X-WP-TotalPages'] || '1', 10),
          currentPage: page
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            posts: [],
            error: 'Authentication failed. Please check your username and application password.'
          });
        } else if (error.response.status === 404) {
          return res.json({
            posts: [],
            error: `Post type endpoint not found: ${finalEndpointName}. The custom post type may not be registered with the WordPress REST API.`
          });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[WordPress] Get posts list error:', error);
    res.status(500).json({
      posts: [],
      error: error.message || 'Internal server error while fetching posts list'
    });
  }
});

/**
 * Get all registered post types
 * POST /get-post-types
 */
router.post('/get-post-types', async (req, res) => {
  try {
    const { siteUrl, username, appPassword } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        postTypes: [],
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/types`;
    
    try {
      const authConfig = getAuthConfig(username, appPassword, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      const response = await axios.get(apiUrl, authConfig);
      
      if (response.status === 200) {
        const types = response.data || {};
        const postTypes = Object.keys(types).filter(type => {
          // Filter out built-in types that aren't useful
          return !['attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request', 'wp_block'].includes(type);
        });
        
        res.json({
          postTypes,
          types: Object.keys(types).map(key => ({
            name: key,
            restBase: types[key].rest_base || key,
            label: types[key].name || key
          }))
        });
      } else {
        // Fallback to default post types
        res.json({
          postTypes: ['post', 'page'],
          types: [
            { name: 'post', restBase: 'posts', label: 'Posts' },
            { name: 'page', restBase: 'pages', label: 'Pages' }
          ]
        });
      }
    } catch (error) {
      // Fallback to default post types
      console.warn('[WordPress] Could not fetch post types, using defaults:', error.message);
      res.json({
        postTypes: ['post', 'page'],
        types: [
          { name: 'post', restBase: 'posts', label: 'Posts' },
          { name: 'page', restBase: 'pages', label: 'Pages' }
        ]
      });
    }
  } catch (error) {
    console.error('[WordPress] Get post types error:', error);
    res.status(500).json({
      postTypes: ['post', 'page'],
      error: error.message || 'Internal server error while fetching post types'
    });
  }
});

module.exports = router;

