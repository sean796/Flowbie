/**
 * WordPress Sitemap Routes
 * POST /detect-sitemaps - Detect WordPress sitemaps
 * POST /parse-sitemap - Parse sitemap XML
 * POST /check-future-posts - Check for future status posts in a sitemap
 */

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const { normalizeUrl, getAuthConfig, extractSlug } = require('./utils');

const router = express.Router();

/**
 * Detect WordPress sitemaps
 * POST /detect-sitemaps
 */
router.post('/detect-sitemaps', async (req, res) => {
  try {
    const { siteUrl, username, appPassword } = req.body;
    
    if (!siteUrl) {
      return res.status(400).json({
        found: false,
        message: 'Missing required field: siteUrl'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    
    // Sitemap paths to try in order
    const sitemapPaths = [
      '/sitemap_index.xml',   // Yoast, RankMath, SEO plugins
      '/sitemap.xml'          // Generic fallback
    ];
    
    console.log(`[WordPress] Detecting sitemaps for: ${normalizedUrl}`);
    
    // Try each sitemap path
    for (const path of sitemapPaths) {
      const sitemapUrl = normalizedUrl + path;
      
      try {
        const config = {
          timeout: 10000,
          validateStatus: (status) => status < 500
        };
        
        // Add auth if provided (sitemaps may be public, but some sites require auth)
        if (username && appPassword) {
          config.auth = {
            username: username,
            password: appPassword
          };
        }
        
        const response = await axios.get(sitemapUrl, config);
        
        if (response.status === 200 && response.headers['content-type']?.includes('xml')) {
          // Check if it's valid XML
          const xmlContent = response.data;
          if (typeof xmlContent === 'string' && (xmlContent.includes('<sitemapindex') || xmlContent.includes('<urlset'))) {
            const isIndex = xmlContent.includes('<sitemapindex');
            
            console.log(`[WordPress] Found sitemap: ${sitemapUrl} (type: ${isIndex ? 'index' : 'urlset'})`);
            
            return res.json({
              found: true,
              sitemapUrl: sitemapUrl,
              type: isIndex ? 'index' : 'urlset',
              content: xmlContent
            });
          }
        }
      } catch (error) {
        // Continue to next path if this one fails
        continue;
      }
    }
    
    // No sitemap found
    res.json({
      found: false,
      message: 'No sitemap detected at common locations'
    });
  } catch (error) {
    console.error('[WordPress] Detect sitemaps error:', error);
    res.status(500).json({
      found: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * Parse sitemap XML
 * POST /parse-sitemap
 */
router.post('/parse-sitemap', async (req, res) => {
  // #region agent log
  const fs = require('fs');
  const logPath = 'b:\\USE THIS\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\.cursor\\debug.log';
  try {
    const entryLog = JSON.stringify({
      location: 'sitemap.js:101',
      message: 'parse-sitemap route handler entry',
      data: { 
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        siteUrl: req.body?.siteUrl,
        sitemapUrl: req.body?.sitemapUrl,
        hasUsername: !!req.body?.username,
        hasAppPassword: !!req.body?.appPassword
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'A,B,C'
    }) + '\n';
    fs.appendFileSync(logPath, entryLog);
  } catch (logErr) {}
  // #endregion
  
  try {
    const { siteUrl, sitemapUrl, username, appPassword } = req.body;
    
    if (!sitemapUrl) {
      // #region agent log
      try {
        const missingFieldLog = JSON.stringify({
          location: 'sitemap.js:105',
          message: 'Missing sitemapUrl field',
          data: { body: req.body },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'C'
        }) + '\n';
        fs.appendFileSync(logPath, missingFieldLog);
      } catch (logErr) {}
      // #endregion
      return res.status(400).json({
        error: 'Missing required field: sitemapUrl'
      });
    }
    
    console.log(`[WordPress] Parsing sitemap: ${sitemapUrl}`);
    
    // #region agent log
    try {
      const beforeAxiosLog = JSON.stringify({
        location: 'sitemap.js:113',
        message: 'Before axios.get call',
        data: { 
          sitemapUrl, 
          siteUrl,
          hasAuth: !!(username && appPassword),
          timeout: 10000
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'B,C'
      }) + '\n';
      fs.appendFileSync(logPath, beforeAxiosLog);
    } catch (logErr) {}
    // #endregion
    
    try {
      const config = {
        timeout: 10000,
        validateStatus: (status) => status < 500
      };
      
      // Add auth if provided
      if (username && appPassword) {
        config.auth = {
          username: username,
          password: appPassword
        };
      }
      
      const response = await axios.get(sitemapUrl, config);
      
      // #region agent log
      try {
        const axiosSuccessLog = JSON.stringify({
          location: 'sitemap.js:127',
          message: 'axios.get successful',
          data: { 
            sitemapUrl, 
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers['content-type'],
            contentLength: response.data?.length || 0
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'A'
        }) + '\n';
        fs.appendFileSync(logPath, axiosSuccessLog);
      } catch (logErr) {}
      // #endregion
      
      if (response.status !== 200) {
        return res.status(response.status).json({
          error: `Failed to fetch sitemap: ${response.status} ${response.statusText}`
        });
      }
      
      const xmlContent = response.data;
      
      if (typeof xmlContent !== 'string') {
        return res.status(400).json({
          error: 'Invalid XML content received'
        });
      }
      
      // #region agent log
      const fs = require('fs');
      const logPath = 'b:\\USE THIS\\agent-blueprint-builder-main\\agent-blueprint-builder-main\\.cursor\\debug.log';
      try {
        const logEntry = JSON.stringify({
          location: 'sitemap.js:143',
          message: 'Before XML parsing',
          data: { 
            sitemapUrl, 
            siteUrl, 
            xmlContentLength: xmlContent.length,
            xmlPreview: xmlContent.substring(0, 500),
            contentType: response.headers['content-type']
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'A'
        }) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (logErr) {}
      // #endregion
      
      // CRITICAL: Check if content starts with invalid characters (like "/" which indicates redirect/error)
      const trimmedContent = xmlContent.trim();
      if (!trimmedContent || trimmedContent.length === 0) {
        return res.status(400).json({
          error: 'Empty sitemap content received',
          sitemapUrl
        });
      }
      
      // Check for invalid starting characters that indicate non-XML content
      const firstChar = trimmedContent.charAt(0);
      const startsWithXml = trimmedContent.toLowerCase().startsWith('<?xml');
      const startsWithTag = trimmedContent.startsWith('<');
      if (firstChar === '/' || firstChar === '\\' || (!startsWithTag && !startsWithXml)) {
        // #region agent log
        try {
          const invalidContentLog = JSON.stringify({
            location: 'sitemap.js:invalid-content',
            message: 'Invalid content detected - not XML',
            data: { 
              sitemapUrl, 
              siteUrl,
              firstChar,
              contentType: response.headers['content-type'],
              contentPreview: trimmedContent.substring(0, 200),
              contentLength: xmlContent.length
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'B'
          }) + '\n';
          fs.appendFileSync(logPath, invalidContentLog);
        } catch (logErr) {}
        // #endregion
        
        return res.status(400).json({
          error: `Sitemap URL returned invalid content (starts with "${firstChar}"). Expected XML but received: ${trimmedContent.substring(0, 100)}`,
          sitemapUrl,
          contentType: response.headers['content-type'],
          suggestion: 'The sitemap URL may be incorrect or returning a redirect/error page. Please verify the URL is correct.'
        });
      }
      
      // Only check for HTML if content clearly starts with HTML (for specific cases like blindswest.ca)
      // Don't block valid XML sitemaps
      const contentType = response.headers['content-type'] || '';
      const isHtml = trimmedContent.toLowerCase().startsWith('<!doctype html') || 
                     trimmedContent.toLowerCase().startsWith('<html');
      
      if (isHtml) {
        // #region agent log
        try {
          const htmlErrorLog = JSON.stringify({
            location: 'sitemap.js:165',
            message: 'HTML content detected instead of XML',
            data: { 
              sitemapUrl, 
              siteUrl,
              contentType: response.headers['content-type'],
              contentPreview: xmlContent.substring(0, 500),
              contentLength: xmlContent.length
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'A'
          }) + '\n';
          fs.appendFileSync(logPath, htmlErrorLog);
        } catch (logErr) {}
        // #endregion
        
        return res.status(400).json({
          error: 'Sitemap URL returned HTML instead of XML',
          details: {
            sitemapUrl: sitemapUrl,
            contentType: response.headers['content-type'],
            contentPreview: xmlContent.substring(0, 200)
          },
          suggestion: 'Please verify the sitemap URL is correct and accessible.'
        });
      }
      
      // Parse XML - use original working configuration
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true
      });
      
      let result;
      try {
        result = await parser.parseStringPromise(xmlContent);
      } catch (parseError) {
        // #region agent log
        try {
          const parseErrorLog = JSON.stringify({
            location: 'sitemap.js:parse-error',
            message: 'XML parsing failed',
            data: { 
              sitemapUrl, 
              siteUrl,
              errorMessage: parseError.message,
              errorStack: parseError.stack?.substring(0, 500),
              contentPreview: xmlContent.substring(0, 200),
              contentType: response.headers['content-type']
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'C'
          }) + '\n';
          fs.appendFileSync(logPath, parseErrorLog);
        } catch (logErr) {}
        // #endregion
        
        return res.status(400).json({
          error: `Failed to parse XML sitemap: ${parseError.message}`,
          sitemapUrl,
          contentType: response.headers['content-type'],
          contentPreview: xmlContent.substring(0, 200),
          suggestion: 'The sitemap may be malformed or not valid XML. Please verify the sitemap URL.'
        });
      }
      
      // #region agent log
      try {
        const successLogEntry = JSON.stringify({
          location: 'sitemap.js:149',
          message: 'XML parsing successful',
          data: { 
            sitemapUrl, 
            siteUrl,
            hasSitemapIndex: !!result.sitemapindex,
            hasUrlset: !!result.urlset
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'A'
        }) + '\n';
        fs.appendFileSync(logPath, successLogEntry);
      } catch (logErr) {}
      // #endregion
      
      // Extract URLs based on sitemap type
      if (result.sitemapindex) {
        // Sitemap index - extract child sitemap URLs
        const sitemaps = result.sitemapindex.sitemap;
        const childSitemaps = Array.isArray(sitemaps) 
          ? sitemaps.map(s => s.loc).filter(Boolean)
          : sitemaps?.loc ? [sitemaps.loc] : [];
        
        res.json({
          type: 'index',
          childSitemaps: childSitemaps,
          urls: []
        });
      } else if (result.urlset) {
        // URL set - extract page URLs
        const urls = result.urlset.url;
        const pageUrls = Array.isArray(urls)
          ? urls.map(u => u.loc).filter(Boolean)
          : urls?.loc ? [urls.loc] : [];
        
        res.json({
          type: 'urlset',
          urls: pageUrls,
          childSitemaps: []
        });
      } else {
        res.status(400).json({
          error: 'Invalid sitemap format. Expected sitemapindex or urlset.'
        });
      }
    } catch (error) {
      // #region agent log
      try {
        const axiosErrorLog = JSON.stringify({
          location: 'sitemap.js:263',
          message: 'axios.get error caught',
          data: { 
            sitemapUrl,
            errorName: error.name,
            errorMessage: error.message,
            hasResponse: !!error.response,
            responseStatus: error.response?.status,
            responseStatusText: error.response?.statusText,
            isSyntaxError: error.name === 'SyntaxError',
            isXMLError: error.message?.includes('XML'),
            errorCode: error.code,
            errorStack: error.stack?.substring(0, 500)
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'B,C'
        }) + '\n';
        fs.appendFileSync(logPath, axiosErrorLog);
      } catch (logErr) {}
      // #endregion
      
      if (error.response) {
        // #region agent log
        try {
          const responseErrorLog = JSON.stringify({
            location: 'sitemap.js:266',
            message: 'Returning error response status',
            data: { 
              status: error.response.status,
              statusText: error.response.statusText
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'B'
          }) + '\n';
          fs.appendFileSync(logPath, responseErrorLog);
        } catch (logErr) {}
        // #endregion
        res.status(error.response.status).json({
          error: `Failed to fetch sitemap: ${error.response.status} ${error.response.statusText}`
        });
      } else if (error.name === 'SyntaxError' || error.message?.includes('XML')) {
        res.status(400).json({
          error: 'Failed to parse XML: ' + error.message
        });
      } else {
        res.status(500).json({
          error: error.message || 'Internal server error'
        });
      }
    }
  } catch (error) {
    // #region agent log
    try {
      const outerErrorLog = JSON.stringify({
        location: 'sitemap.js:278',
        message: 'Outer catch block - route handler error',
        data: { 
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 500)
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'C'
      }) + '\n';
      fs.appendFileSync(logPath, outerErrorLog);
    } catch (logErr) {}
    // #endregion
    console.error('[WordPress] Parse sitemap error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Check for future status posts in a sitemap
 * POST /check-future-posts
 */
router.post('/check-future-posts', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, sitemapUrl } = req.body;
    
    if (!siteUrl || !username || !appPassword || !sitemapUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, sitemapUrl'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    
    console.log(`[WordPress] Checking future posts for sitemap: ${sitemapUrl}`);
    
    // Parse sitemap to get URLs
    let sitemapUrls = [];
    try {
      // Normalize sitemap URL
      let normalizedSitemapUrl = sitemapUrl.trim();
      if (!normalizedSitemapUrl.startsWith('http://') && !normalizedSitemapUrl.startsWith('https://')) {
        normalizedSitemapUrl = normalizedUrl + (normalizedSitemapUrl.startsWith('/') ? normalizedSitemapUrl : '/' + normalizedSitemapUrl);
      }
      
      const sitemapAuthConfig = getAuthConfig(username, appPassword, {
        contentType: 'application/xml',
        accept: 'application/xml, text/xml'
      });
      
      const sitemapResponse = await axios.get(normalizedSitemapUrl, sitemapAuthConfig);
      
      if (sitemapResponse.status === 200) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(sitemapResponse.data);
        
        // Extract URLs from sitemap
        if (result.urlset && result.urlset.url) {
          sitemapUrls = result.urlset.url.map((item) => {
            if (item.loc && Array.isArray(item.loc) && item.loc.length > 0) {
              return Array.isArray(item.loc[0]) ? item.loc[0][0] : item.loc[0];
            }
            return null;
          }).filter(url => url !== null);
        } else if (result.sitemapindex && result.sitemapindex.sitemap) {
          // This is a sitemap index, not a child sitemap
          return res.status(400).json({
            success: false,
            error: 'Sitemap index provided. Please use a child sitemap URL instead.'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: `Failed to fetch sitemap: HTTP ${sitemapResponse.status}`
        });
      }
    } catch (error) {
      console.error('[WordPress] Error parsing sitemap:', error);
      return res.status(400).json({
        success: false,
        error: `Failed to parse sitemap: ${error.message}`
      });
    }
    
    if (sitemapUrls.length === 0) {
      return res.json({
        success: true,
        futureCount: 0,
        posts: []
      });
    }
    
    console.log(`[WordPress] Found ${sitemapUrls.length} URLs in sitemap`);
    
    const authConfig = getAuthConfig(username, appPassword);
    const futurePosts = [];
    const now = new Date();
    
    // Process URLs in batches
    const batchSize = 10;
    for (let i = 0; i < sitemapUrls.length; i += batchSize) {
      const batch = sitemapUrls.slice(i, i + batchSize);
      
      for (const url of batch) {
        try {
          const slug = extractSlug(url);
          if (!slug) continue;
          
          // Try to resolve to post ID
          const postTypes = ['posts', 'pages', 'service-area'];
          let postData = null;
          
          for (const postType of postTypes) {
            try {
              const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(slug)}&context=edit`;
              const response = await axios.get(apiUrl, authConfig);
              
              if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
                const post = response.data.find(p => 
                  (p.type === (postType === 'posts' ? 'post' : postType)) &&
                  (!p.parent || p.parent === 0) &&
                  p.status !== 'trash'
                );
                
                if (post) {
                  postData = {
                    id: post.id,
                    slug: post.slug || slug,
                    title: post.title?.rendered || post.title || 'Untitled',
                    date_gmt: post.date_gmt || '',
                    status: post.status || 'publish',
                    link: post.link || url
                  };
                  break;
                }
              }
            } catch (error) {
              // Continue to next post type
              continue;
            }
          }
          
          // Check if post is future (status='future' or date_gmt in future)
          if (postData) {
            const isFuture = postData.status === 'future' || 
              (postData.date_gmt && new Date(postData.date_gmt) > now);
            
            if (isFuture) {
              futurePosts.push(postData);
            }
          }
        } catch (error) {
          console.warn(`[WordPress] Error checking post for ${url}:`, error.message);
          // Continue with next URL
        }
      }
    }
    
    console.log(`[WordPress] Found ${futurePosts.length} future posts out of ${sitemapUrls.length} URLs`);
    
    res.json({
      success: true,
      futureCount: futurePosts.length,
      posts: futurePosts
    });
  } catch (error) {
    console.error('[WordPress] Check future posts error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while checking future posts'
    });
  }
});

module.exports = router;



