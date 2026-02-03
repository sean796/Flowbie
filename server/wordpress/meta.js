/**
 * WordPress Meta Routes
 * POST /get-post-meta - Get WordPress post with all meta fields
 * POST /update-post-meta - Update WordPress post meta fields
 * POST /update-acf-field - Update ACF (Advanced Custom Fields) field for WordPress post
 */

const express = require('express');
const axios = require('axios');
const { normalizeUrl, getRestEndpoint, getAuthConfig, logToDebug } = require('./utils');
const { serializeACFFieldValue, validateACFSetup } = require('./acf-utils');

const router = express.Router();

/**
 * Get WordPress post with all meta fields
 * POST /get-post-meta
 */
router.post('/get-post-meta', async (req, res) => {
  console.log('[WordPress Routes] POST /get-post-meta - Request received');
  try {
    const { siteUrl, username, appPassword, postId, postType = 'post', postTypeEndpoint } = req.body;
    
    if (!siteUrl || !username || !appPassword || !postId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    // CRITICAL: Use the EXACT endpoint from scraped post if provided, otherwise use getRestEndpoint
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    
    // Validate post ID
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.json({
        success: false,
        error: `Invalid post ID: ${postId}. Post ID must be a positive integer.`
      });
    }
    
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
    console.log(`[WordPress Meta] Fetching post meta for post ID ${postId} (${finalEndpointName})`);
    
    try {
      const response = await axios.get(apiUrl, getAuthConfig(username, appPassword, {
        timeout: 30000,
      }));
      
      if (response.status === 200) {
        const postData = response.data;
        const meta = postData.meta || {};
        const acf = postData.acf || {};
        
        console.log(`[WordPress Meta] Successfully fetched ${Object.keys(meta).length} meta fields and ${Object.keys(acf).length} ACF fields for post ID ${postId}`);
        
        res.json({
          success: true,
          postId: postId,
          meta: meta,
          acf: acf
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 401) {
          return res.status(401).json({
            success: false,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (status === 404) {
          return res.status(404).json({
            success: false,
            error: `Post ID ${postId} not found in ${finalEndpointName} endpoint.`
          });
        } else if (status === 403) {
          return res.status(403).json({
            success: false,
            error: `Permission denied. You may not have access to post ID ${postId} or meta fields.`
          });
        } else {
          return res.status(status).json({
            success: false,
            error: errorData?.message || errorData?.error || `WordPress API error: ${status}`
          });
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('[WordPress] Get post meta error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while fetching post meta'
    });
  }
});

/**
 * Update WordPress post meta fields (non-ACF meta)
 * POST /update-post-meta
 */
router.post('/update-post-meta', async (req, res) => {
  console.log('[WordPress Routes] POST /update-post-meta - Request received');
  try {
    const { siteUrl, username, appPassword, postId, postType = 'post', postTypeEndpoint, meta } = req.body;
    
    if (!siteUrl || !username || !appPassword || !postId || !meta || typeof meta !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId, meta'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    // CRITICAL: Use the EXACT endpoint from scraped post if provided, otherwise use getRestEndpoint
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    
    // Validate post ID
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.json({
        success: false,
        error: `Invalid post ID: ${postId}. Post ID must be a positive integer.`
      });
    }
    
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}`;
    console.log(`[WordPress Meta] Updating ${Object.keys(meta).length} meta fields for post ID ${postId} (${finalEndpointName})`);
    
    // Log before update
    logToDebug({
      message: 'Before WordPress meta update request',
      data: {
        postId,
        postType: finalEndpointName,
        metaKeysCount: Object.keys(meta).length,
        hasFocusKeyword: !!meta.rank_math_focus_keyword,
        focusKeywordValue: meta.rank_math_focus_keyword,
        allRankMathKeys: Object.keys(meta).filter(k => k.startsWith('rank_math')),
        updateDataKeys: Object.keys(meta)
      },
      hypothesisId: 'E'
    }, 'wordpress/meta.js:update-post-meta');
    
    try {
      // CRITICAL: Update the post itself (not just meta) to trigger Rank Math's internal hooks
      // Rank Math needs WordPress hooks to fire to recognize the focus keyword in the UI
      // First, get the current post to preserve its content
      let currentPost = null;
      try {
        const getPostResponse = await axios.get(`${apiUrl}?context=edit`, getAuthConfig(username, appPassword, {
          timeout: 30000,
        }));
        if (getPostResponse.status === 200) {
          currentPost = getPostResponse.data;
        }
      } catch (getError) {
        console.warn('[WordPress Meta] Could not fetch current post, will update meta only:', getError.message);
      }
      
      // Build update data - include meta AND trigger a post update to fire WordPress hooks
      // This ensures Rank Math's internal processes recognize the focus keyword
      const updateData = {
        meta: meta
      };
      
      // If we have the current post, include minimal post data to trigger hooks
      // This causes WordPress to fire 'save_post' and other hooks that Rank Math listens to
      if (currentPost) {
        // Include title to ensure post update is recognized (but don't change it)
        updateData.title = currentPost.title?.rendered || currentPost.title;
      }
      
      // Log update data
      logToDebug({
        message: 'Sending updateData to WordPress (with post update to trigger hooks)',
        data: {
          updateDataMetaKeys: Object.keys(updateData.meta),
          updateDataHasFocusKeyword: !!updateData.meta.rank_math_focus_keyword,
          updateDataFocusKeywordValue: updateData.meta.rank_math_focus_keyword,
          includesPostData: !!updateData.title,
          strategy: 'update-post-with-meta-to-trigger-rankmath-hooks'
        },
        hypothesisId: 'F'
      }, 'wordpress/meta.js:update-post-meta');
      
      const response = await axios.put(apiUrl, updateData, getAuthConfig(username, appPassword, {
        timeout: 30000,
      }));
      
      if (response.status === 200) {
        console.log(`[WordPress Meta] Successfully updated meta fields for post ID ${postId}`);
        
        // Verify focus keyword was saved by fetching the post again
        let verifiedFocusKeyword = null;
        try {
          const verifyResponse = await axios.get(`${apiUrl}?context=edit`, getAuthConfig(username, appPassword, {
            timeout: 30000,
          }));
          if (verifyResponse.status === 200 && verifyResponse.data.meta) {
            verifiedFocusKeyword = verifyResponse.data.meta.rank_math_focus_keyword;
          }
        } catch (verifyError) {
          console.warn('[WordPress Meta] Could not verify focus keyword after update:', verifyError.message);
        }
        
        // Log response
        logToDebug({
          message: 'WordPress API response received and verified',
          data: {
            status: response.status,
            responseHasMeta: !!response.data.meta,
            responseMetaKeys: response.data.meta ? Object.keys(response.data.meta).filter(k => k.startsWith('rank_math')) : [],
            responseHasFocusKeyword: response.data.meta ? !!response.data.meta.rank_math_focus_keyword : false,
            responseFocusKeywordValue: response.data.meta ? response.data.meta.rank_math_focus_keyword : null,
            verifiedFocusKeyword: verifiedFocusKeyword,
            focusKeywordMatches: verifiedFocusKeyword === meta.rank_math_focus_keyword,
            updateStrategy: 'post-update-with-meta-to-trigger-hooks'
          },
          hypothesisId: 'G'
        }, 'wordpress/meta.js:update-post-meta');
        
        res.json({
          success: true,
          postId: postId,
          updated: true,
          verifiedFocusKeyword: verifiedFocusKeyword
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 401) {
          return res.status(401).json({
            success: false,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (status === 404) {
          return res.status(404).json({
            success: false,
            error: `Post ID ${postId} not found in ${finalEndpointName} endpoint.`
          });
        } else if (status === 403) {
          return res.status(403).json({
            success: false,
            error: `Permission denied. You may not have permission to update meta fields for post ID ${postId}.`
          });
        } else {
          return res.status(status).json({
            success: false,
            error: errorData?.message || errorData?.error || `WordPress API error: ${status}`
          });
        }
      }
      
      throw error;
    }
  } catch (error) {
    console.error('[WordPress] Update post meta error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while updating post meta'
    });
  }
});

/**
 * Update ACF (Advanced Custom Fields) field for WordPress post
 * Uses the CORRECT approach: POST to /wp-json/wp/v2/{post_type}/{id} with acf: {} payload
 * 
 * POST /update-acf-field
 */
router.post('/update-acf-field', async (req, res) => {
  console.log('[WordPress Routes] POST /update-acf-field - Request received');
  try {
    const { siteUrl, username, appPassword, postId, fieldName, fieldValue, postType = 'post', postTypeEndpoint } = req.body;
    
    if (!siteUrl || !username || !appPassword || !postId || !fieldName || fieldValue === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId, fieldName, fieldValue'
      });
    }
    
    // Validate post ID
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.json({
        success: false,
        error: `Invalid post ID: ${postId}. Post ID must be a positive integer.`
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });
    
    console.log(`[WordPress ACF] Updating field "${fieldName}" = "${fieldValue}" for post ID ${postId} (${finalEndpointName})`);
    
    // Validate ACF setup first
    const validation = await validateACFSetup(siteUrl, username, appPassword, postType, postTypeEndpoint, postId);
    
    if (!validation.hasAcfSupport) {
      return res.json({
        success: false,
        error: 'ACF REST API not available. Ensure ACF Pro 5.11+ is installed and REST API filters are configured.',
        validation: validation,
        requiredConfig: {
          php: [
            "add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');",
            "add_filter('acf/rest_api/field_settings/editable', '__return_true');"
          ]
        }
      });
    }
    
    // Serialize the field value
    const serializedValue = serializeACFFieldValue(fieldValue);
    
    // CORRECT APPROACH: POST to standard WP REST endpoint with acf: {} payload
    const updateUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}`;
    
    console.log(`[WordPress ACF] POST ${updateUrl} with acf: { ${fieldName}: ${JSON.stringify(serializedValue)} }`);
    
    try {
      const updateResponse = await axios.post(updateUrl, {
        acf: {
          [fieldName]: serializedValue
        }
      }, authConfig);
      
      if (updateResponse.status === 200 || updateResponse.status === 201) {
        // Verify the update
        let verified = false;
        let actualValue = null;
        
        try {
          const verifyUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
          const verifyResponse = await axios.get(verifyUrl, authConfig);
          
          if (verifyResponse.status === 200 && verifyResponse.data.acf) {
            actualValue = verifyResponse.data.acf[fieldName];
            
            // Compare values
            verified = actualValue === serializedValue || 
                      String(actualValue) === String(serializedValue) ||
                      JSON.stringify(actualValue) === JSON.stringify(serializedValue);
            
            if (!verified) {
              console.warn(`[WordPress ACF] Verification: expected "${serializedValue}", got "${actualValue}"`);
            }
          }
        } catch (verifyError) {
          console.warn('[WordPress ACF] Could not verify update:', verifyError.message);
        }
        
        console.log(`[WordPress ACF] Successfully updated field "${fieldName}" for post ID ${postId}`);
        
        return res.json({
          success: true,
          method: 'acf-rest-api',
          fieldName,
          fieldValue: serializedValue,
          verified,
          actualValue
        });
      } else {
        throw new Error(`Unexpected response status: ${updateResponse.status}`);
      }
    } catch (updateError) {
      const errorMsg = updateError.response?.data?.message || updateError.message;
      console.error(`[WordPress ACF] Update failed for "${fieldName}":`, errorMsg);
      
      return res.json({
        success: false,
        error: `ACF field update failed: ${errorMsg}`,
        validation: validation
      });
    }
    
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        return res.json({
          success: false,
          error: 'Authentication failed. Please verify your username and application password.'
        });
      } else if (error.response.status === 403) {
        return res.json({
          success: false,
          error: 'Permission denied. The user may not have permission to update ACF fields.'
        });
      } else if (error.response.status === 404) {
        return res.json({
          success: false,
          error: `Post not found (ID: ${req.body.postId}, Type: ${req.body.postType}). Please verify the post ID and type.`
        });
      } else {
        return res.json({
          success: false,
          error: `WordPress API error: ${error.response.status} ${error.response.statusText}`
        });
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.json({
        success: false,
        error: 'Cannot reach WordPress site. Please check the URL.'
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.json({
        success: false,
        error: 'Connection timeout. The WordPress site may be slow or unreachable.'
      });
    } else {
      throw error;
    }
  }
});

module.exports = router;
