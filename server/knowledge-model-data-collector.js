/**
 * Data collection utilities for Knowledge Model
 * Fetches WordPress sitemaps, downloads content, and collects GSC data
 */

const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Fetch posts sitemaps only for a WordPress site
 */
async function fetchSitemaps(siteUrl, username, appPassword) {
  const sitemapUrls = [];
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  
  // Try common sitemap locations
  const commonSitemaps = [
    '/sitemap_index.xml',
    '/sitemap.xml',
    '/wp-sitemap.xml'
  ];
  
  for (const sitemapPath of commonSitemaps) {
    try {
      const sitemapUrl = normalizedUrl + sitemapPath;
      const response = await axios.get(sitemapUrl, {
        auth: { username, password: appPassword },
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        // Check if it's a sitemap index
        if (result.sitemapindex && result.sitemapindex.sitemap) {
          const childSitemaps = result.sitemapindex.sitemap.map(s => {
            const loc = Array.isArray(s.loc) ? s.loc[0] : s.loc;
            return Array.isArray(loc) ? loc[0] : loc;
          });
          
          // Filter to only posts sitemaps
          const postSitemaps = childSitemaps.filter(url => {
            const urlLower = url.toLowerCase();
            return urlLower.includes('post-sitemap') || 
                   urlLower.includes('post_sitemap') ||
                   urlLower.includes('posts-sitemap') ||
                   urlLower.includes('posts_sitemap');
          });
          
          sitemapUrls.push(...postSitemaps);
        } else if (result.urlset && result.urlset.url) {
          // It's a regular sitemap - only include if it's a posts sitemap
          const sitemapUrlLower = sitemapUrl.toLowerCase();
          if (sitemapUrlLower.includes('post-sitemap') || 
              sitemapUrlLower.includes('post_sitemap') ||
              sitemapUrlLower.includes('posts-sitemap') ||
              sitemapUrlLower.includes('posts_sitemap')) {
            sitemapUrls.push(sitemapUrl);
          }
        }
      }
    } catch (error) {
      // Continue to next sitemap
      continue;
    }
  }
  
  // #region agent log
  console.log(`[Knowledge Model] Filtered to ${sitemapUrls.length} posts sitemaps`);
  // #endregion
  
  return [...new Set(sitemapUrls)]; // Remove duplicates
}

/**
 * Parse sitemap and extract URLs
 */
async function parseSitemap(sitemapUrl, username, appPassword) {
  try {
    const response = await axios.get(sitemapUrl, {
      auth: { username, password: appPassword },
      timeout: 10000
    });
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    if (result.urlset && result.urlset.url) {
      return result.urlset.url.map(item => {
        const loc = Array.isArray(item.loc) ? item.loc[0] : item.loc;
        return Array.isArray(loc) ? loc[0] : loc;
      });
    }
    
    return [];
  } catch (error) {
    console.error(`Error parsing sitemap ${sitemapUrl}:`, error.message);
    return [];
  }
}

/**
 * Resolve WordPress URLs to POST IDs ONLY (posts endpoint only, no pages or custom post types)
 */
async function resolveWordPressUrls(siteUrl, username, appPassword, urls) {
  const resolved = [];
  const unresolvable = [];
  
  // Normalize site URL
  let normalizedUrl = siteUrl.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  normalizedUrl = normalizedUrl.replace(/\/$/, '');
  
  // Extract slug from URL
  const extractSlug = (urlStr) => {
    try {
      const urlObj = new URL(urlStr);
      const pathname = urlObj.pathname.replace(/\/$/, '');
      const slug = pathname.split('/').pop() || '';
      return slug.replace(/\.(html?|php)$/i, '');
    } catch (error) {
      const parts = urlStr.replace(/\/$/, '').split('/');
      return parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '') || '';
    }
  };
  
  // Auth config
  const authConfig = {
    auth: { username, password: appPassword },
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'WordPress-Integration/1.0'
    },
    timeout: 10000,
    validateStatus: (status) => status < 500
  };
  
  // #region agent log
  console.log(`[Knowledge Model] Resolving ${urls.length} URLs to POSTS ONLY (posts endpoint only)`);
  // #endregion
  
  // Process URLs in batches
  const batchSize = 10;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    
    for (const url of batch) {
      try {
        // Normalize URL
        let normalizedInputUrl = url.trim();
        if (!normalizedInputUrl.startsWith('http://') && !normalizedInputUrl.startsWith('https://')) {
          normalizedInputUrl = normalizedUrl + (normalizedInputUrl.startsWith('/') ? normalizedInputUrl : '/' + normalizedInputUrl);
        }
        
        // Extract slug
        const slug = extractSlug(normalizedInputUrl);
        if (!slug) {
          unresolvable.push({ url, reason: 'Could not extract slug from URL' });
          continue;
        }
        
        // ONLY try posts endpoint
        const apiUrl = `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit`;
        const response = await axios.get(apiUrl, authConfig);
        
        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
          // Find canonical post (not revision, not trash)
          const canonical = response.data.find(p => {
            const isPost = p.type === 'post' && p.type !== 'revision';
            const hasNoParent = p.parent === null || p.parent === undefined || p.parent === 0;
            const isNotTrash = p.status !== 'trash' && p.status !== 'trashed';
            return isPost && hasNoParent && isNotTrash;
          });
          
          if (canonical) {
            resolved.push({
              url: url,
              id: canonical.id,
              subtype: 'post',
              link: canonical.link || url,
              slug: canonical.slug || slug
            });
          } else {
            unresolvable.push({ url, reason: `Slug "${slug}" found but no canonical post (may be revision or trash)` });
          }
        } else {
          unresolvable.push({ url, reason: `Slug "${slug}" not found in posts endpoint` });
        }
      } catch (error) {
        unresolvable.push({ url, reason: `Error resolving: ${error.message}` });
      }
    }
  }
  
  // #region agent log
  console.log(`[Knowledge Model] Resolved ${resolved.length} posts, ${unresolvable.length} unresolvable (POSTS ONLY)`);
  // #endregion
  
  return { resolved, unresolvable };
}

/**
 * Get WordPress post content using resolved objects
 */
async function getWordPressPostContent(siteUrl, username, appPassword, resolvedObjects) {
  try {
    const BACKEND_API_BASE = process.env.BACKEND_API_BASE || 'http://localhost:3001';
    const apiUrl = `${BACKEND_API_BASE}/api/wordpress/get-post-content`;
    // #region agent log
    console.log(`[Knowledge Model] Calling get-post-content API: ${apiUrl} with ${resolvedObjects.length} resolved objects`);
    // #endregion
    const response = await axios.post(apiUrl, {
      siteUrl,
      username,
      appPassword,
      postIds: [],
      postSlugs: [],
      resolvedObjects
    }, {
      timeout: 60000
    });
    
    // #region agent log
    console.log(`[Knowledge Model] get-post-content response: status=${response.status}, posts=${response.data?.posts?.length || 0}`);
    // #endregion
    
    if (response.status === 200 && response.data && response.data.posts) {
      return response.data.posts.map(post => ({
        id: post.id,
        title: post.title || '',
        content: post.content || '',
        excerpt: post.excerpt || '',
        slug: post.slug || '',
        link: post.link || '',
        date: post.date_gmt || post.date || ''
      }));
    }
    
    return [];
  } catch (error) {
    // #region agent log
    console.error(`[Knowledge Model] Error getting post content: ${error.message}`, error.stack?.substring(0, 500));
    // #endregion
    return [];
  }
}

/**
 * Collect all content from sitemaps with detailed progress
 * Uses resolve-urls and get-post-content (same as existing sitemap scraper)
 */
async function collectContentFromSitemaps(sitemapUrls, siteUrl, username, appPassword, onProgress, jobId = null) {
  const allContent = [];
  const allUrls = [];
  
  // First, collect all URLs from sitemaps
  for (const sitemapUrl of sitemapUrls) {
    onProgress?.(`Parsing sitemap: ${sitemapUrl}`, { step: 'parsing_sitemap', sitemapUrl });
    const urls = await parseSitemap(sitemapUrl, username, appPassword);
    allUrls.push(...urls);
  }
  
  // Remove duplicates
  const uniqueUrls = [...new Set(allUrls)];
  onProgress?.(`Found ${uniqueUrls.length} unique URLs. Resolving URLs...`, { 
    step: 'urls_collected', 
    totalUrls: uniqueUrls.length 
  });
  
  // Resolve all URLs to POST IDs ONLY (posts endpoint only)
  // #region agent log
  console.log(`[Knowledge Model] Resolving ${uniqueUrls.length} URLs to POSTS ONLY`);
  // #endregion
  const resolveResult = await resolveWordPressUrls(siteUrl, username, appPassword, uniqueUrls);
  const resolvedObjects = resolveResult.resolved || [];
  const unresolvableUrls = resolveResult.unresolvable || [];
  
  // #region agent log
  console.log(`[Knowledge Model] Resolved ${resolvedObjects.length} posts, ${unresolvableUrls.length} unresolvable (POSTS ONLY)`);
  // #endregion
  
  onProgress?.(`Resolved ${resolvedObjects.length} posts, ${unresolvableUrls.length} unresolvable`, {
    step: 'urls_resolved',
    resolved: resolvedObjects.length,
    unresolvable: unresolvableUrls.length
  });
  
  // Report unresolvable URLs (only if they might be posts)
  for (const unresolvable of unresolvableUrls) {
    onProgress?.(`✗ Cannot resolve: ${unresolvable.url}`, {
      step: 'post_failed',
      url: unresolvable.url,
      title: unresolvable.url,
      status: 'failed',
      error: unresolvable.reason || 'URL cannot be resolved'
    });
  }
  
  // Fetch post content in batches using resolved objects
  const batchSize = 20; // Larger batches since we're using the proper API
  const totalBatches = Math.ceil(resolvedObjects.length / batchSize);
  
  // Send initial loading notification
  if (resolvedObjects.length > 0) {
    onProgress?.(`Fetching ${resolvedObjects.length} posts in ${totalBatches} batch${totalBatches > 1 ? 'es' : ''}...`, {
      step: 'downloading_batch',
      batchNumber: 0,
      totalBatches,
      totalPosts: resolvedObjects.length,
      processedPosts: 0
    });
  }
  
  for (let i = 0; i < resolvedObjects.length; i += batchSize) {
    const batch = resolvedObjects.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    // Only update progress with batch info, don't create new notifications
    // The frontend will handle displaying a single loading toast
    onProgress?.(`Fetching batch ${batchNumber}/${totalBatches} (${batch.length} posts) (${i + batch.length}/${resolvedObjects.length} posts)`, {
      step: 'downloading_batch',
      batchNumber,
      totalBatches,
      batchStart: i + 1,
      batchEnd: Math.min(i + batchSize, resolvedObjects.length),
      totalPosts: resolvedObjects.length,
      processedPosts: i + batch.length
    });
    
    // Report each post in batch as downloading
    batch.forEach((resolved, idx) => {
      const postIndex = i + idx + 1;
      onProgress?.(`Downloading post ${postIndex}/${resolvedObjects.length}`, {
        step: 'downloading_post',
        postIndex,
        totalPosts: resolvedObjects.length,
        url: resolved.url || resolved.link || '',
        title: 'Downloading...',
        status: 'downloading'
      });
    });
    
    try {
      // Fetch content for this batch using resolved objects
      const posts = await getWordPressPostContent(siteUrl, username, appPassword, batch);
      
      // Report success/failure for each post
      posts.forEach((post, idx) => {
        const postIndex = i + idx + 1;
        const resolved = batch[idx];
        allContent.push(post);
        onProgress?.(`✓ Downloaded: ${post.title || resolved.url}`, {
          step: 'post_downloaded',
          postIndex,
          totalPosts: resolvedObjects.length,
          postId: post.id,
          title: post.title || resolved.url,
          url: resolved.url || post.link,
          status: 'success'
        });
      });
      
      // Report any missing posts (resolved but not returned)
      if (posts.length < batch.length) {
        const returnedIds = new Set(posts.map(p => p.id));
        batch.forEach((resolved, idx) => {
          if (!returnedIds.has(resolved.id)) {
            const postIndex = i + idx + 1;
            onProgress?.(`✗ Failed to fetch: ${resolved.url || resolved.link}`, {
              step: 'post_failed',
              postIndex,
              totalPosts: resolvedObjects.length,
              url: resolved.url || resolved.link,
              title: resolved.url || resolved.link,
              status: 'failed',
              error: 'Post content not returned'
            });
          }
        });
      }
      
      // Update batch progress after batch completes
      const processedCount = allContent.length;
      onProgress?.(`Fetched batch ${batchNumber}/${totalBatches} (${processedCount}/${resolvedObjects.length} posts)`, {
        step: 'downloading_batch',
        batchNumber,
        totalBatches,
        totalPosts: resolvedObjects.length,
        processedPosts: processedCount
      });
    } catch (error) {
      // Report batch error
      batch.forEach((resolved, idx) => {
        const postIndex = i + idx + 1;
        onProgress?.(`✗ Error fetching ${resolved.url || resolved.link}: ${error.message}`, {
          step: 'post_error',
          postIndex,
          totalPosts: resolvedObjects.length,
          url: resolved.url || resolved.link,
          title: resolved.url || resolved.link,
          status: 'error',
          error: error.message
        });
      });
    }
  }
  
  onProgress?.(`Completed: ${allContent.length} posts downloaded`, {
    step: 'completed',
    totalDownloaded: allContent.length,
    totalUrls: uniqueUrls.length,
    resolved: resolvedObjects.length,
    unresolvable: unresolvableUrls.length
  });
  
  return allContent;
}

/**
 * Extract keywords from content for GSC lookup
 */
function extractKeywordsForGSC(content) {
  const keywords = new Set();
  
  // Simple keyword extraction (in production, use NLP)
  const text = (content.title + ' ' + content.content)
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ') // Remove HTML
    .replace(/[^\w\s]/g, ' '); // Remove punctuation
  
  const words = text.split(/\s+/).filter(w => w.length > 4);
  words.forEach(w => keywords.add(w));
  
  return Array.from(keywords).slice(0, 100); // Limit to 100 keywords
}

module.exports = {
  fetchSitemaps,
  parseSitemap,
  resolveWordPressUrls,
  getWordPressPostContent,
  collectContentFromSitemaps,
  extractKeywordsForGSC
};

