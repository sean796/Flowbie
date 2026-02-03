/**
 * WordPress Post CRUD Routes
 * POST /create-post - Create WordPress post
 * PUT /update-post - Update WordPress post
 * DELETE /delete-post - Delete WordPress post
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { normalizeUrl, getRestEndpoint, getAuthConfig, extractSlug } = require('./utils');

const router = express.Router();
// Debug log path (relative to project root)
const DEBUG_LOG_PATH = path.join(__dirname, '..', '..', '.cursor', 'debug.log');

/**
 * Ensure debug log directory exists
 */
function ensureDebugLogDir() {
  try {
    const logDir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    // Silently fail if directory creation fails
  }
}

// #region agent log helper
function logDebug(data) {
  try {
    ensureDebugLogDir();
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify(data) + '\n', 'utf8');
  } catch(e) {
    // Silently fail if logging fails
  }
}
// #endregion

/**
 * Create WordPress post
 * POST /create-post
 */
router.post('/create-post', async (req, res) => {
  // #region agent log
  logDebug({location:'wordpress/post-crud.js:26',message:'create-post route handler entry',data:{hasSiteUrl:!!req.body.siteUrl,hasUsername:!!req.body.username,hasAppPassword:!!req.body.appPassword,hasTitle:!!req.body.title,hasContent:!!req.body.content,contentLength:req.body.content?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'});
  // #endregion
  try {
    const { 
      siteUrl, 
      username, 
      appPassword, 
      title, 
      content, 
      excerpt, 
      status = 'draft',
      date_gmt,
      featuredImageId,
      categories = [],
      tags = [],
      postType = 'post',
      postTypeEndpoint, // NEW: Accept the actual endpoint name from scraped post
      slug,
      author
    } = req.body;
    
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:49',message:'Before validation check',data:{siteUrl,username:username?.substring(0,5)+'***',hasAppPassword:!!appPassword,title:title?.substring(0,30),contentLength:content?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'});
    // #endregion
    
    if (!siteUrl || !username || !appPassword || !title || !content) {
      // #region agent log
      logDebug({location:'wordpress/post-crud.js:54',message:'Validation failed - missing required fields',data:{siteUrl:!!siteUrl,username:!!username,appPassword:!!appPassword,title:!!title,content:!!content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'});
      // #endregion
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, title, content'
      });
    }
    
    // Normalize URL
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:66',message:'Before normalizeUrl',data:{siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'});
    // #endregion
    const normalizedUrl = normalizeUrl(siteUrl);
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:70',message:'After normalizeUrl',data:{siteUrl,normalizedUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'});
    // #endregion
    
    // Determine the correct WordPress REST API endpoint
    // CRITICAL: Use the EXACT endpoint from the scraped post JSON if provided
    // NO NORMALIZATION, NO FALLBACKS - use exactly what worked for retrieval!
    let postTypeSlug;
    if (postTypeEndpoint) {
      // Use the exact endpoint from the scraped post - don't change it!
      postTypeSlug = postTypeEndpoint;
      console.log(`[WordPress] Using exact endpoint from scraped post: ${postTypeSlug}`);
    } else {
      // Only fallback if no endpoint provided at all
      // Use 'posts' as default - entity endpoint should be extracted from sitemap
      postTypeSlug = 'posts';
      console.log(`[WordPress] No endpoint provided, using default: ${postTypeSlug}`);
    }
    
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postTypeSlug}`;
    
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:90',message:'API URL constructed',data:{apiUrl,postTypeSlug,normalizedUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'});
    // #endregion
    
    console.log(`[WordPress] Creating ${postTypeSlug}: ${title}`);
    console.log(`[WordPress] API endpoint: ${apiUrl}`);
    if (date_gmt) {
      console.log(`[WordPress] Scheduled for: ${date_gmt}`);
    }
    
    // Build post data
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:101',message:'Before building postData',data:{title:title?.substring(0,50),contentLength:content?.length,status,hasDateGmt:!!date_gmt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'});
    // #endregion
    const postData = {
      title: title,
      content: content,
      status: status, // 'draft', 'publish', or 'future' (for scheduled)
    };
    
    // Use provided slug if available and valid
    // CRITICAL: Extract proper slug from URL if slug is a full URL
    // WordPress auto-generates slugs from title, which can create bad URLs like:
    // https://intheshadeflorida.com/blog/https-intheshadeflorida-com-blog-what-happens...
    // We should provide the correct slug from the URL path to prevent this
    if (slug) {
      // If slug looks like a full URL, extract just the path segment
      if (slug.includes('http://') || slug.includes('https://')) {
        try {
          const urlObj = new URL(slug);
          const pathname = urlObj.pathname.replace(/\/$/, '');
          const pathSegments = pathname.split('/').filter(s => s.length > 0);
          if (pathSegments.length > 0) {
            slug = pathSegments[pathSegments.length - 1].replace(/\.(html?|php)$/i, '');
            console.log(`[WordPress] Extracted slug from URL-like slug: "${slug}"`);
          }
        } catch (e) {
          // If URL parsing fails, try manual extraction
          const parts = slug.replace(/\/$/, '').split('/');
          const lastPart = parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '');
          if (lastPart && !lastPart.includes('http')) {
            slug = lastPart;
            console.log(`[WordPress] Manually extracted slug from URL-like slug: "${slug}"`);
          } else {
            // Invalid slug format, don't send it
            console.warn(`[WordPress] Invalid slug format (contains full URL), not sending slug: "${slug}"`);
            slug = undefined;
          }
        }
      }
      
      // Validate slug format (should only contain lowercase letters, numbers, and hyphens)
      if (slug && /^[a-z0-9-]+$/.test(slug)) {
        postData.slug = slug;
        console.log(`[WordPress] Using provided slug: "${slug}"`);
      } else if (slug) {
        // Sanitize slug if it contains invalid characters
        const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (sanitizedSlug.length > 0) {
          postData.slug = sanitizedSlug;
          console.log(`[WordPress] Sanitized slug: "${slug}" → "${sanitizedSlug}"`);
        } else {
          console.warn(`[WordPress] Slug sanitization resulted in empty string, not sending slug: "${slug}"`);
        }
      }
    }
    
    // Add excerpt if provided
    if (excerpt) {
      postData.excerpt = excerpt;
    }
    
    // Add scheduled date if provided (must be in future for 'future' status)
    if (date_gmt) {
      postData.date_gmt = date_gmt;
      // If date is in the future, WordPress will automatically set status to 'future'
      const scheduledDate = new Date(date_gmt);
      const now = new Date();
      if (scheduledDate > now) {
        postData.status = 'future';
      }
    }
    
    // Add featured image if provided
    if (featuredImageId) {
      postData.featured_media = featuredImageId;
    }
    
    // Add categories if provided
    if (categories && categories.length > 0) {
      postData.categories = categories;
    }
    
    // Add tags if provided
    if (tags && tags.length > 0) {
      postData.tags = tags;
    }
    
    // Add author if provided (preserve original author when updating existing posts)
    if (author !== undefined && author !== null) {
      // WordPress REST API expects author as a user ID (number)
      const authorId = typeof author === 'object' && author.id ? author.id : author;
      if (typeof authorId === 'number' && authorId > 0) {
        postData.author = authorId;
        console.log(`[WordPress] Setting author to: ${authorId}`);
      } else if (typeof authorId === 'string' && !isNaN(parseInt(authorId))) {
        postData.author = parseInt(authorId);
        console.log(`[WordPress] Setting author to: ${postData.author} (converted from string)`);
      }
    }
    
    // Attempt to create post using the endpoint that already works
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:202',message:'Before axios.post',data:{apiUrl,postDataKeys:Object.keys(postData),postDataSize:JSON.stringify(postData).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
    // #endregion
    try {
      const authConfig = getAuthConfig(username, appPassword, {
        timeout: 30000,
      });
      // #region agent log
      logDebug({location:'wordpress/post-crud.js:209',message:'Before axios.post call',data:{apiUrl,hasAuthConfig:!!authConfig,timeout:authConfig.timeout},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
      // #endregion
      const response = await axios.post(apiUrl, postData, authConfig);
      // #region agent log
      logDebug({location:'wordpress/post-crud.js:213',message:'After axios.post - success',data:{status:response.status,hasData:!!response.data,postId:response.data?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'});
      // #endregion
      
      // Check response status - WordPress REST API should return 201 for creation, 200 for update
      if (response.status === 201 || response.status === 200) {
        const post = response.data;
        console.log(`[WordPress] Post created successfully: ID ${post.id}, Status: ${post.status}`);
        
        res.json({
          success: true,
          postId: post.id,
          link: post.link,
          status: post.status,
          date: post.date_gmt || post.date,
          title: post.title?.rendered || post.title || title,
        });
      } else if (response.status === 404) {
        // WordPress endpoint doesn't exist - handle as 404 error
        // #region agent log
        logDebug({location:'wordpress/post-crud.js:227',message:'WordPress endpoint returned 404',data:{apiUrl,postTypeSlug,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'});
        // #endregion
        return res.json({
          success: false,
          error: `WordPress API endpoint not found (404): ${apiUrl}. The custom post type "${postTypeSlug}" may not be registered with the WordPress REST API, or the endpoint URL is incorrect.`
        });
      } else {
        // Other unexpected status codes
        // #region agent log
        logDebug({location:'wordpress/post-crud.js:235',message:'WordPress returned unexpected status',data:{apiUrl,status:response.status,responseData:response.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'});
        // #endregion
        return res.json({
          success: false,
          error: `WordPress API returned unexpected status ${response.status}: ${apiUrl}. Response: ${JSON.stringify(response.data || 'No response data')}`
        });
      }
    } catch (error) {
      // #region agent log
      logDebug({location:'wordpress/post-crud.js:234',message:'axios.post catch block - create-post',data:{hasResponse:!!error.response,status:error.response?.status,code:error.code,message:error.message?.substring(0,200),stack:error.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'});
      // #endregion
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            success: false,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (error.response.status === 403) {
          return res.json({
            success: false,
            error: 'Permission denied. The user may not have permission to create posts.'
          });
        } else if (error.response.status === 404) {
          // 404 can mean: endpoint doesn't exist, post type not registered, or invalid slug
          const errorData = error.response.data;
          const errorMessage = errorData?.message || errorData?.code || 'Endpoint not found';
          console.error(`[WordPress] 404 error creating post:`, {
            endpoint: apiUrl,
            postType: postTypeSlug,
            slug: slug || 'none',
            errorMessage: errorMessage,
            errorData: errorData
          });
          
          // Check if it's likely a custom post type issue
          if (postTypeSlug !== 'post' && postTypeSlug !== 'page') {
            return res.json({
              success: false,
              error: `Custom post type "${postTypeSlug}" not found. The endpoint ${apiUrl} returned 404. Please verify that this custom post type exists and is registered with the WordPress REST API.`
            });
          }
          
          return res.json({
            success: false,
            error: `WordPress API endpoint not found (404): ${apiUrl}. ${errorMessage}`
          });
        } else if (error.response.status === 400) {
          const errorData = error.response.data;
          const errorMessage = errorData?.message || errorData?.code || 'Invalid request data';
          console.error(`[WordPress] 400 validation error:`, errorData);
          return res.json({
            success: false,
            error: `WordPress API validation error: ${errorMessage}${slug ? ` (slug: ${slug})` : ''}`
          });
        } else {
          const errorData = error.response.data;
          console.error(`[WordPress] API error ${error.response.status}:`, errorData);
          return res.json({
            success: false,
            error: `WordPress API error: ${error.response.status} ${error.response.statusText}${errorData?.message ? ` - ${errorData.message}` : ''}`
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
  } catch (error) {
    // #region agent log
    logDebug({location:'wordpress/post-crud.js:303',message:'Outer catch block - 500 error',data:{errorMessage:error.message,errorStack:error.stack?.substring(0,500),errorType:error.constructor.name,hasResponse:!!error.response,status:error.response?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
    // #endregion
    console.error('[WordPress] Create post error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while creating post'
    });
  }
});

/**
 * Update WordPress post
 * PUT /update-post
 */
router.put('/update-post', async (req, res) => {
  console.log('[WordPress Routes] PUT /update-post - Request received');
  
  // #region agent log
  try {
    logDebug({location:'post-crud.js:update-post-entry',message:'PUT /update-post endpoint called',data:{hasBody:!!req.body,bodyKeys:req.body?Object.keys(req.body):[],postId:req.body?.postId,postType:req.body?.postType,postTypeEndpoint:req.body?.postTypeEndpoint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-500-A'});
  } catch(e) {
    // Logging must never throw
  }
  // #endregion
  
  try {
    const { siteUrl, username, appPassword, postId, title, content, excerpt, status, postType = 'post', featuredImageId, categories, tags, slug, postTypeEndpoint } = req.body;
    
    if (!siteUrl || !username || !appPassword || !postId || !title || !content) {
      try { logDebug({location:'post-crud.js:validation-failed',message:'Validation failed - missing required fields',data:{hasSiteUrl:!!siteUrl,hasUsername:!!username,hasAppPassword:!!appPassword,hasPostId:!!postId,hasTitle:!!title,hasContent:!!content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-500-A'}); } catch(e) {}
      
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId, title, content'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    
    // CRITICAL: Handle pages, posts, and entity endpoints correctly
    // WordPress REST API requires plural endpoints: 'post' -> 'posts', 'page' -> 'pages'
    let finalEndpointName;
    if (postTypeEndpoint) {
      // Use provided endpoint, but ensure it's plural for standard types
      if (postTypeEndpoint === 'page') {
        finalEndpointName = 'pages';
      } else if (postTypeEndpoint === 'post') {
        finalEndpointName = 'posts';
      } else {
        // For custom post types (entities), use as-is
        finalEndpointName = postTypeEndpoint;
      }
    } else {
      // Fallback to getRestEndpoint which handles pluralization
      finalEndpointName = getRestEndpoint(postType);
    }
    
    try { logDebug({location:'post-crud.js:endpoint-determination',message:'Endpoint determination for update',data:{postTypeEndpoint,postType,finalEndpointName,normalizedUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-403-D'}); } catch(e) {}

    // CRITICAL: Validate post ID before update
    // Never update unless we have a valid canonical post ID
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.json({
        success: false,
        error: `Invalid post ID for update: ${postId}. Post ID must be a positive integer.`
      });
    }
    
    // CRITICAL: Assert we have canonical post data before update
    // Never update a revision - revisions ALWAYS have parent > 0
    // If existingPost data is available, verify it's canonical
    if (req.body.existingPost) {
      const existingPost = req.body.existingPost;
      if (existingPost.parent && existingPost.parent > 0) {
        console.error(`[WordPress] CRITICAL: Refusing to update post ID ${postId} - has parent ${existingPost.parent} (this is a revision)`);
        return res.json({
          success: false,
          error: `Cannot update revision ID ${postId}. Revisions cannot be updated via PUT. Please use the canonical post ID.`
        });
      }
      if (existingPost.type === 'revision' || existingPost.post_type === 'revision') {
        console.error(`[WordPress] CRITICAL: Refusing to update post ID ${postId} - type is 'revision'`);
        return res.json({
          success: false,
          error: `Cannot update revision ID ${postId}. Revisions cannot be updated via PUT. Please use the canonical post ID.`
        });
      }
    }
    
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}`;

    try { logDebug({location:'post-crud.js:api-url-constructed',message:'API URL constructed for update',data:{apiUrl,postId,finalEndpointName,postType,postTypeEndpoint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-403-E'}); } catch(e) {}

    console.log('[FINAL UPDATE]', {
      postId,
      postType,
      postTypeEndpoint,
      finalEndpointName,
      apiUrl
    });
    
    // CRITICAL: Verify post exists and is accessible before attempting update
    // This helps diagnose 403 errors by checking if we can read the post
    try {
      const checkUrl = `${apiUrl}?context=edit`;
      const checkResponse = await axios.get(checkUrl, getAuthConfig(username, appPassword, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      }));
      
      try { logDebug({location:'post-crud.js:pre-update-check',message:'Pre-update GET check result',data:{status:checkResponse.status,hasData:!!checkResponse.data,postId:checkResponse.data?.id,postType:checkResponse.data?.type,postStatus:checkResponse.data?.status,postAuthor:checkResponse.data?.author,canEdit:checkResponse.data?.capabilities?.edit_post,canEditPages:checkResponse.data?.capabilities?.edit_page},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-PRE-CHECK'}); } catch(e) {}
      
      if (checkResponse.status === 403) {
        try { const wpError = checkResponse.data; logDebug({location:'post-crud.js:pre-update-403',message:'403 on pre-update GET check',data:{status:403,wpErrorCode:wpError?.code,wpErrorMessage:wpError?.message,wpErrorData:JSON.stringify(wpError).substring(0,500),apiUrl:checkUrl,postId,finalEndpointName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-PRE-CHECK-FAIL'}); } catch(e) {}
        
        return res.json({
          success: false,
          error: `Permission denied (403) - Cannot read post. Endpoint: ${finalEndpointName}, Post ID: ${postId}. WordPress error: ${checkResponse.data?.message || 'Unknown'}`,
          details: checkResponse.data
        });
      }
      
      if (checkResponse.status === 404) {
        return res.json({
          success: false,
          error: `Post not found (404). Endpoint: ${finalEndpointName}, Post ID: ${postId}. The post may have been deleted.`
        });
      }
    } catch (preCheckError) {
      try { logDebug({location:'post-crud.js:pre-update-check-error',message:'Pre-update check failed but continuing',data:{errorMessage:preCheckError.message,hasResponse:!!preCheckError.response,responseStatus:preCheckError.response?.status,postId,finalEndpointName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-PRE-CHECK-ERROR'}); } catch(e) {}
      console.warn('[WordPress] Pre-update check failed, but continuing with update attempt:', preCheckError.message);
    }
    
    try {
      // Prepare post data
      const postData = {
        title: title,
        content: content,
      };
      
      // Add excerpt if provided
      if (excerpt) {
        postData.excerpt = excerpt;
      }
      
      // Add status if provided
      if (status) {
        postData.status = status;
      }
      
      // Add featured image if provided
      if (featuredImageId !== undefined) {
        postData.featured_media = featuredImageId;
      }
      
      // Add categories if provided
      if (categories !== undefined) {
        postData.categories = categories;
      }
      
      // Add tags if provided
      if (tags !== undefined) {
        postData.tags = tags;
      }
      
      // Add slug if provided (to preserve original slug)
      if (slug !== undefined) {
        postData.slug = slug;
      }
      
      try {
        logDebug({location:'post-crud.js:before-put',message:'Before WordPress PUT request',data:{apiUrl,postId,finalEndpointName,postType,postTypeEndpoint,postDataKeys:Object.keys(postData),hasContent:!!postData.content,hasTitle:!!postData.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-403-A'});
        logDebug({location:'post-crud.js:before-put-request',message:'About to make WordPress PUT request',data:{apiUrl,postId,finalEndpointName,postType,postTypeEndpoint,postDataKeys:Object.keys(postData),hasTitle:!!postData.title,hasContent:!!postData.content,contentLength:postData.content?.length||0,hasExcerpt:!!postData.excerpt,status:postData.status,hasSlug:!!postData.slug,username:username?.substring(0,3)+'***',hasAppPassword:!!appPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-REQUEST'});
      } catch (e) { /* logging must never throw - WordPress PUT must run */ }

      const response = await axios.put(apiUrl, postData, getAuthConfig(username, appPassword, {
        timeout: 30000,
      }));
      
      try {
        const responseDataStr = response.data ? JSON.stringify(response.data).substring(0, 1000) : 'null';
        logDebug({location:'post-crud.js:after-put',message:'After WordPress PUT request',data:{status:response.status,statusText:response.statusText,hasData:!!response.data,responseData:responseDataStr,responseKeys:response.data?Object.keys(response.data):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-PUT-RESPONSE'});
      } catch(e) {}
      
      // Handle non-200 status codes properly (axios may not throw due to validateStatus)
      if (response.status === 200) {
        const post = response.data;
        console.log(`[WordPress] Post updated successfully: ID ${post.id}, Status: ${post.status}`);
        
        res.json({
          success: true,
          postId: post.id,
          link: post.link,
          status: post.status,
          date: post.date_gmt || post.date,
          title: post.title?.rendered || post.title || title,
        });
      } else if (response.status === 403) {
        try {
          const wpErrorData = response.data;
          const errorCode = wpErrorData?.code || 'unknown';
          const errorMessage = wpErrorData?.message || 'Permission denied';
          const errorDataStr = JSON.stringify(wpErrorData).substring(0, 1000);
          logDebug({location:'post-crud.js:403-handled',message:'403 Forbidden handled directly from response',data:{status:403,wpErrorCode:errorCode,wpErrorMessage:errorMessage,wpErrorData:errorDataStr,apiUrl,postId,finalEndpointName,postType,postTypeEndpoint,hasUsername:!!username,hasAppPassword:!!appPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'403-DETAIL'});
        } catch(e) {}
        
        const wpMsg = response.data?.message ? ` WordPress: "${response.data.message}".` : '';
        const hint = ' Ensure the app password has edit_pages capability, the page is not locked, and no security plugin is blocking REST updates.';
        return res.json({
          success: false,
          error: `Permission denied (403). Endpoint: ${finalEndpointName}, Post ID: ${postId}, URL: ${apiUrl}.${wpMsg}${hint}`,
          details: response.data
        });
      } else if (response.status === 401) {
        return res.json({
          success: false,
          error: 'Authentication failed. Please verify your username and application password.'
        });
      } else if (response.status === 404) {
        return res.json({
          success: false,
          error: `Post not found (ID: ${postId}, Type: ${postType}, Endpoint: ${finalEndpointName}). Please verify the post ID and type. API URL: ${apiUrl}`
        });
      } else if (response.status === 400) {
        const errorData = response.data;
        const errorMessage = errorData?.message || errorData?.code || 'Invalid request data';
        return res.json({
          success: false,
          error: `WordPress API validation error: ${errorMessage}`
        });
      } else {
        // For any other non-200 status, throw error to be caught by catch block
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      try { logDebug({location:'post-crud.js:catch-error',message:'Error caught in update-post',data:{hasResponse:!!error.response,status:error.response?.status,statusText:error.response?.statusText,errorMessage:error.message,apiUrl,postId,finalEndpointName,postType,postTypeEndpoint,responseData:error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-403-F'}); } catch(e) {}

      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            success: false,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (error.response.status === 403) {
          try { logDebug({location:'post-crud.js:403-error',message:'403 Forbidden error details',data:{status:403,responseData:error.response.data,responseHeaders:Object.keys(error.response.headers||{}),apiUrl,postId,finalEndpointName,postType,postTypeEndpoint,hasAuth:!!username&&!!appPassword,authUser:username?username.substring(0,3)+'***':null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-403-C'}); } catch(e) {}

          return res.json({
            success: false,
            error: `Permission denied (403). Endpoint: ${finalEndpointName}, Post ID: ${postId}, URL: ${apiUrl}`,
            details: error.response.data
          });
        } else if (error.response.status === 404) {
          return res.json({
            success: false,
            error: `Post not found (ID: ${postId}, Type: ${postType}, Endpoint: ${finalEndpointName}). Please verify the post ID and type. API URL: ${apiUrl}`
          });
        } else if (error.response.status === 400) {
          const errorData = error.response.data;
          const errorMessage = errorData?.message || errorData?.code || 'Invalid request data';
          return res.json({
            success: false,
            error: `WordPress API validation error: ${errorMessage}`
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
  } catch (error) {
    try { logDebug({location:'post-crud.js:top-level-error',message:'Top-level error in update-post',data:{errorMessage:error.message,errorStack:error.stack?.substring(0,1000),errorName:error.name,hasResponse:!!error.response,responseStatus:error.response?.status,responseData:error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-500-B'}); } catch(e) {}

    console.error('[WordPress] Update post error:', error);

    try { logDebug({location:'post-crud.js:top-level-error-response',message:'Sending 500 error response',data:{errorMessage:error.message,hasResponse:!!error.response,responseStatus:error.response?.status,apiUrl:typeof apiUrl!=='undefined'?apiUrl:'unknown',endpoint:typeof finalEndpointName!=='undefined'?finalEndpointName:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'UPDATE-500-C'}); } catch(e) {}

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while updating post',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Delete WordPress post
 * DELETE /delete-post
 */
router.delete('/delete-post', async (req, res) => {
  console.log('[WordPress Routes] DELETE /delete-post - Request received');
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
    // NO NORMALIZATION - use exactly what worked for retrieval!
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    
    // CRITICAL: Validate post ID before delete
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.json({
        success: false,
        error: `Invalid post ID for delete: ${postId}. Post ID must be a positive integer.`
      });
    }
    
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?force=true`;
    
    console.log('[WordPress] Deleting post:', {
      postId,
      postType,
      finalEndpointName,
      apiUrl
    });
    
    try {
      const response = await axios.delete(apiUrl, getAuthConfig(username, appPassword, {
        timeout: 30000,
      }));
      
      if (response.status === 200 || response.status === 204) {
        const deletedPost = response.data || {};
        console.log(`[WordPress] Post deleted successfully: ID ${postId}, Type: ${finalEndpointName}`);
        
        res.json({
          success: true,
          postId: postId,
          deleted: true,
          previous: {
            link: deletedPost.link,
            status: deletedPost.status,
            title: deletedPost.title?.rendered || deletedPost.title,
          }
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
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
            error: 'Permission denied. The user may not have permission to delete posts.'
          });
        } else if (error.response.status === 404) {
          return res.json({
            success: false,
            error: `Post not found (ID: ${postId}, Type: ${postType}, Endpoint: ${finalEndpointName}). The post may have already been deleted. API URL: ${apiUrl}`
          });
        } else if (error.response.status === 400) {
          const errorData = error.response.data;
          const errorMessage = errorData?.message || errorData?.code || 'Invalid request data';
          return res.json({
            success: false,
            error: `WordPress API validation error: ${errorMessage}`
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
  } catch (error) {
    console.error('[WordPress] Delete post error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while deleting post'
    });
  }
});

module.exports = router;




