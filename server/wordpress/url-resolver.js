/**
 * WordPress URL Resolver Route
 * POST /resolve-urls - Resolve URLs to REST API objects
 */

const express = require('express');
const axios = require('axios');
const { normalizeUrl, getAuthConfig, extractSlug, logToDebug } = require('./utils');
const { resolveEntityUrl } = require('./entity-resolver');
const { resolvePostUrl } = require('./post-resolver');

const router = express.Router();

/**
 * Resolve WordPress URLs to REST API objects
 * POST /resolve-urls
 */
router.post('/resolve-urls', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, urls, entitySitemapUrl, knownEndpoint } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: 'Missing or empty urls array'
      });
    }
    
    const normalizedUrl = normalizeUrl(siteUrl);

    console.log(`[WordPress] Resolving ${urls.length} URLs to REST objects`);
    
    const resolved = [];
    const unresolvable = [];
    const authConfig = getAuthConfig(username, appPassword, {
      timeout: 10000,
      validateStatus: (status) => status < 500
    });
    
    // Process URLs in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(urls.length / batchSize);
      
      console.log(`[WordPress] Processing batch ${batchNum}/${totalBatches} (${batch.length} URLs)`);
      
      for (const url of batch) {
        try {
          // Normalize the URL to ensure it's complete
          let normalizedInputUrl = url.trim();
          if (!normalizedInputUrl.startsWith('http://') && !normalizedInputUrl.startsWith('https://')) {
            normalizedInputUrl = normalizedUrl + (normalizedInputUrl.startsWith('/') ? normalizedInputUrl : '/' + normalizedInputUrl);
          }
          
          // Extract slug and path from URL for logging
          const urlObj = new URL(normalizedInputUrl);
          const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
          const slug = extractSlug(normalizedInputUrl);

          console.log(`[WordPress] Resolving URL: ${url}`);
          console.log(`[WordPress] Normalized: ${normalizedInputUrl}`);
          console.log(`[WordPress] Extracted slug: "${slug}"`);
          
          let resolvedItem = null;
          const attemptedTypes = [];
          
          // Blog/post URLs: ping REST by slug only. No entity sitemap – GET JSON, fix what’s needed, PUT back.
          const pathname = urlObj.pathname || '';
          const isBlogOrPost = /\/blog\//i.test(pathname) || /\/\d{4}\/\d{2}\//.test(pathname) || pathname === '/' || pathname.startsWith('/page/');
          
          console.log('[URL RESOLVER] Routing:', { pathname: pathname.slice(0, 60), isBlogOrPost, knownEndpoint, entitySitemapUrl: !!entitySitemapUrl });
          
          if (isBlogOrPost) {
            // Direct post resolver: GET by slug, update only what’s needed
            attemptedTypes.push('post-resolver');
            resolvedItem = await resolvePostUrl(siteUrl, username, appPassword, url);
            if (resolvedItem) {
              resolvedItem.url = url;
              resolvedItem.endpoint = resolvedItem.subtype === 'page' ? 'pages' : 'posts';
              console.log(`[WordPress] ✓ Post resolved: ${url} -> ID ${resolvedItem.id} (${resolvedItem.endpoint})`);
            }
          }
          
          if (!resolvedItem && (knownEndpoint || entitySitemapUrl)) {
            console.log('[URL RESOLVER] Using entity resolver');
            attemptedTypes.push('entity-resolver');
            resolvedItem = await resolveEntityUrl(siteUrl, username, appPassword, url, entitySitemapUrl, knownEndpoint);
            if (resolvedItem) {
              resolvedItem.url = url;
              console.log(`[WordPress] ✓ Entity resolved: ${url} -> ID ${resolvedItem.id}`);
            }
          }
          
          if (!resolvedItem) {
            console.log('[WordPress] Using post resolver');
            attemptedTypes.push('post-resolver');
            resolvedItem = await resolvePostUrl(siteUrl, username, appPassword, url);
            if (resolvedItem) {
              resolvedItem.url = url;
              resolvedItem.endpoint = resolvedItem.subtype === 'page' ? 'pages' : 'posts';
              console.log(`[WordPress] ✓ Post resolved: ${url} -> ID ${resolvedItem.id}`);
            }
          }
          
          
          if (resolvedItem) {
            resolved.push(resolvedItem);
          } else {
            const attemptedTypesStr = attemptedTypes.join(', ');
            // #region agent log
            try { typeof fetch === 'function' && fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/wordpress/url-resolver.js:resolve-urls:unresolvable',message:'URL could not be resolved',data:{originalUrl:String(url||''),normalizedInputUrl:String(normalizedInputUrl||''),extractedSlug:String(slug||''),attemptedTypes:String(attemptedTypesStr||''),entitySitemapUrl:String(entitySitemapUrl||'')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}); } catch(e) {}
            // #endregion
            logToDebug({
              message: 'URL resolution failed',
              data: { originalUrl: url, normalizedInputUrl, extractedSlug: slug, attemptedTypes: attemptedTypesStr, entitySitemapUrl }
            }, 'wordpress/url-resolver.js:resolve-urls');
            
            unresolvable.push({ 
              url: url, 
              reason: `Could not resolve URL via ${attemptedTypesStr}. ${entitySitemapUrl ? 'Entity resolver and ' : ''}Post resolver both failed.` 
            });
            console.log(`[WordPress] Unresolvable: ${url} - Tried: ${attemptedTypesStr}`);
          }
        } catch (error) {
          unresolvable.push({ 
            url: url, 
            reason: error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message 
          });
          console.warn(`[WordPress] Error resolving ${url}:`, error.message);
        }
      }
    }
    
    // Count resolved by type
    const typeCounts = {};
    resolved.forEach(item => {
      typeCounts[item.subtype] = (typeCounts[item.subtype] || 0) + 1;
    });
    
    console.log(`[WordPress] Resolution complete: ${resolved.length} resolved, ${unresolvable.length} unresolvable`);
    console.log(`[WordPress] Resolved types:`, typeCounts);
    
    res.json({
      resolved: resolved,
      unresolvable: unresolvable,
      summary: {
        total: urls.length,
        resolved: resolved.length,
        unresolvable: unresolvable.length,
        typeCounts: typeCounts
      }
    });
  } catch (error) {
    console.error('[WordPress] Resolve URLs error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error while resolving URLs'
    });
  }
});

module.exports = router;

