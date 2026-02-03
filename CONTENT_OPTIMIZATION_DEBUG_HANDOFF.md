# Content Optimization Feature - Debugging Handoff Sheet

## Overview
This document provides a comprehensive guide for debugging the WordPress Content Optimization feature. The feature allows users to optimize existing blog posts by analyzing GSC data, conducting keyword research, and regenerating content.

## Feature Flow

```
1. User enters URL → 
2. Resolve URL to WordPress post → 
3. Fetch existing post content → 
4. Fetch GSC page performance data → 
5. Identify top keyword from GSC → 
6. Conduct keyword research → 
7. Generate optimized blueprint → 
8. Generate optimized content → 
9. Update existing post OR create draft
```

## Current Error: "Could not resolve URL to a WordPress post. Search API returned status 400"

### Error Location
- **File**: `src/components/integrations/WordPressFeature.tsx`
- **Function**: `handleOptimizeContent`
- **Step**: Step 1 - URL Resolution
- **API Endpoint**: `/api/wordpress/resolve-urls` (backend: `server/wordpress-routes.js`)

### Error Context
The WordPress Search API is returning a 400 Bad Request error when trying to resolve the URL to a post object.

---

## Debugging Steps

### Step 1: Verify URL Format

**What to check:**
- Is the URL a valid WordPress post/page URL?
- Does it include the protocol (http:// or https://)?
- Is the URL publicly accessible or does it require authentication?

**Common issues:**
- URLs without protocol
- URLs pointing to non-existent posts
- URLs for draft/private posts (may need authentication)

**Test command:**
```bash
# Test URL resolution manually via curl
curl -X POST http://localhost:3001/api/wordpress/resolve-urls \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://youjunkit.ca",
    "username": "your-username",
    "appPassword": "your-app-password",
    "urls": ["https://youjunkit.ca/garbage-bin-rental-vs-diy-dump-runs-which-option-saves-you-more-time/"]
  }'
```

### Step 2: Check WordPress Search API

**Backend file**: `server/wordpress-routes.js`
**Function**: `POST /resolve-urls`
**Line range**: ~963-1100

**What the function does:**
1. Normalizes the URL
2. Calls WordPress REST API `/wp/v2/search?search={url}&type=post,page`
3. Tries multiple URL variations
4. Returns resolved post IDs and types

**Debug points:**
1. Check if WordPress Search API is enabled (requires WordPress 5.0+)
2. Verify the search endpoint accepts the URL format
3. Check if authentication credentials are valid
4. Verify the post exists and is published (not draft/private)

**Add logging:**
```javascript
// In server/wordpress-routes.js, around line 1000
console.log('[WordPress Resolve] Searching for URL:', normalizedUrl);
console.log('[WordPress Resolve] Search API URL:', searchApiUrl);
console.log('[WordPress Resolve] Response status:', response.status);
console.log('[WordPress Resolve] Response data:', JSON.stringify(response.data, null, 2));
```

### Step 3: Alternative Resolution Method

If Search API fails, try direct slug resolution:

**Workaround:**
1. Extract slug from URL
2. Try `/wp/v2/posts?slug={slug}`
3. Try `/wp/v2/pages?slug={slug}`
4. Try custom post types if needed

**Implementation location**: `server/wordpress-routes.js` - add fallback in `resolve-urls` endpoint

---

## API Endpoints Reference

### 1. Resolve WordPress URLs
- **Endpoint**: `POST /api/wordpress/resolve-urls`
- **File**: `server/wordpress-routes.js` (line ~963)
- **Purpose**: Converts WordPress URLs to REST API objects
- **Input**: `{ siteUrl, username, appPassword, urls: string[] }`
- **Output**: `{ resolved: [{url, id, subtype, link}], unresolvable: [{url, reason}] }`

### 2. Get Post Content
- **Endpoint**: `POST /api/wordpress/get-post-content`
- **File**: `server/wordpress-routes.js` (line ~780)
- **Purpose**: Fetches full post content by ID/subtype
- **Input**: `{ siteUrl, username, appPassword, resolvedObjects: [{id, subtype}] }`
- **Output**: `{ count, posts: [{id, slug, title, content, excerpt, ...}] }`

### 3. Update WordPress Post
- **Endpoint**: `PUT /api/wordpress/update-post`
- **File**: `server/wordpress-routes.js` (line ~1408)
- **Purpose**: Updates existing WordPress post
- **Input**: `{ siteUrl, username, appPassword, postId, title, content, excerpt, status, postType, ... }`
- **Output**: `{ success, postId, link, status, date, title }`

### 4. Fetch GSC Page Performance
- **Endpoint**: `POST /api/gsc/fetch-page-performance`
- **File**: `server/gsc-routes.js` (line ~821)
- **Purpose**: Fetches GSC performance data for a specific page URL
- **Input**: `{ siteUrl, pageUrl, startDate?, endDate? }`
- **Output**: `{ success, pageUrl, matchedUrl, queries: [], topKeyword: {...}, ... }`

---

## Frontend Function Reference

### Main Handler
- **File**: `src/components/integrations/WordPressFeature.tsx`
- **Function**: `handleOptimizeContent` (line ~974)
- **Steps**:
  1. Validate URL input
  2. Resolve URL → `resolveWordPressUrls()`
  3. Get post content → `getWordPressPostContent()`
  4. Fetch GSC data → `fetchGSCPagePerformance()`
  5. Get keyword data → `getKeywordOverview()`
  6. Fetch PAA → `fetchPeopleAlsoAsk()`
  7. AI analysis → `analyzeKeywordWithAI()`
  8. Generate checklist → `generateChecklistFromSelections()`
  9. Generate blueprint → `generateBlueprintFromTemplate()`
  10. Generate content → `streamGeneration()`
  11. Convert to HTML → `markdownToHtml()`
  12. Update/Create post → `updateWordPressPost()` / `createWordPressPost()`

### Frontend API Functions
- **File**: `src/lib/wordpress-api.ts`
- **Functions**:
  - `resolveWordPressUrls()` - line ~450
  - `getWordPressPostContent()` - line ~512
  - `updateWordPressPost()` - line ~674
  - `createWordPressPost()` - line ~688
  - `fetchGSCPagePerformance()` - line ~750

---

## Common Issues & Solutions

### Issue 1: Search API Returns 400
**Symptom**: "Search API returned status 400"

**Possible causes:**
1. WordPress version < 5.0 (Search API not available)
2. Search API disabled via plugin/filter
3. Invalid URL format
4. Authentication failure (wrong credentials)
5. URL doesn't match any published post

**Solutions:**
1. Check WordPress version (must be 5.0+)
2. Test Search API manually: `GET /wp/v2/search?search=test&type=post`
3. Add fallback to slug-based resolution
4. Verify credentials work with other endpoints
5. Check if post exists and is published

**Code location to modify**: `server/wordpress-routes.js` - `POST /resolve-urls` endpoint

### Issue 2: GSC Data Not Found
**Symptom**: "No GSC performance data found for this URL"

**Possible causes:**
1. URL normalization mismatch (www vs non-www, trailing slash, http vs https)
2. Page has no search traffic yet
3. GSC property not set up correctly
4. Date range too short

**Solutions:**
1. Check URL normalization logic (line ~890 in gsc-routes.js)
2. Verify page has traffic in GSC manually
3. Check GSC service account permissions
4. Expand date range (default is last 3 months)

### Issue 3: Keyword Research Fails
**Symptom**: "No keyword data found"

**Possible causes:**
1. OpenRouter API key missing/invalid
2. DataForSEO API key missing/invalid
3. Keyword too specific/niche

**Solutions:**
1. Verify OpenRouter API key in settings
2. Check DataForSEO API key configuration
3. Try with more general keyword first

---

## Testing Each Component

### Test 1: URL Resolution
```javascript
// Test in browser console or create test script
const testResolve = async () => {
  const response = await fetch('http://localhost:3001/api/wordpress/resolve-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteUrl: 'https://youjunkit.ca',
      username: 'your-username',
      appPassword: 'your-app-password',
      urls: ['https://youjunkit.ca/garbage-bin-rental-vs-diy-dump-runs-which-option-saves-you-more-time/']
    })
  });
  const data = await response.json();
  console.log('Resolve result:', data);
};
```

### Test 2: GSC Page Performance
```javascript
const testGSC = async () => {
  const response = await fetch('http://localhost:3001/api/gsc/fetch-page-performance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteUrl: 'https://youjunkit.ca',
      pageUrl: 'https://youjunkit.ca/garbage-bin-rental-vs-diy-dump-runs-which-option-saves-you-more-time/',
      startDate: '2024-09-01',
      endDate: '2024-12-01'
    })
  });
  const data = await response.json();
  console.log('GSC result:', data);
};
```

### Test 3: Post Content Fetch
```javascript
// After successful URL resolution
const testGetContent = async () => {
  const response = await fetch('http://localhost:3001/api/wordpress/get-post-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteUrl: 'https://youjunkit.ca',
      username: 'your-username',
      appPassword: 'your-app-password',
      resolvedObjects: [{ id: 123, subtype: 'post' }]
    })
  });
  const data = await response.json();
  console.log('Post content:', data);
};
```

---

## Debugging Logs

### Backend Logs to Check
- `[WordPress Routes]` - WordPress API calls
- `[WordPress Resolve]` - URL resolution process
- `[GSC Routes]` - GSC API calls
- `[GSC Page Performance]` - Page-specific GSC queries

### Frontend Logs to Check
- `[Optimize Content]` - Optimization workflow steps
- Console errors in browser DevTools

### Enable Verbose Logging

**Backend** (`server/wordpress-routes.js`):
```javascript
console.log('[WordPress Resolve] Full request:', JSON.stringify(req.body, null, 2));
console.log('[WordPress Resolve] Search URL:', searchApiUrl);
console.log('[WordPress Resolve] Response:', response.status, response.data);
```

**Frontend** (`src/components/integrations/WordPressFeature.tsx`):
```javascript
console.log('[Optimize Content] Step X:', { url, siteId: site.id, data });
```

---

## URL Resolution Fallback Strategy

### Current Implementation
1. Uses WordPress Search API (`/wp/v2/search`)
2. Tries multiple URL variations
3. Returns first match found

### Recommended Fallback
If Search API fails, implement slug-based resolution:

```javascript
// Extract slug from URL
const slug = url.split('/').filter(Boolean).pop()?.replace(/\.html?$/, '') || '';

// Try each post type
const postTypes = ['posts', 'pages', 'service-area']; // Add custom post types
for (const postType of postTypes) {
  const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postType}?slug=${slug}`;
  // Try fetch...
}
```

---

## WordPress Search API Limitations

### Known Issues
1. Search API may not work with custom permalink structures
2. Some custom post types not searchable
3. Search results limited to published content
4. May require authentication for draft/private posts

### Workarounds
1. Use direct slug lookup as fallback
2. Support custom post type parameter
3. Check post status before attempting resolution
4. Add authentication header if post is draft/private

---

## Environment Setup for Debugging

### Required Services
1. **Backend server**: `node server/mcp-api-server.js` (port 3001)
2. **Frontend dev server**: `npm run dev` (usually port 8080)
3. **WordPress site**: Must be accessible and REST API enabled
4. **GSC access**: Service account must have permissions

### Required Credentials
1. WordPress username + Application Password
2. OpenRouter API key (for AI content generation)
3. DataForSEO API key (for keyword research) - may be hardcoded

### Test Data
- Valid WordPress post URL
- GSC property verified
- Page with search traffic data

---

## Step-by-Step Debugging Checklist

### ✅ Step 1: Verify URL Format
- [ ] URL includes protocol (https://)
- [ ] URL is publicly accessible
- [ ] Post exists and is published
- [ ] URL matches actual post permalink structure

### ✅ Step 2: Test WordPress Connection
- [ ] Test connection button works
- [ ] Credentials are correct
- [ ] WordPress REST API is enabled
- [ ] Search API endpoint accessible

### ✅ Step 3: Test URL Resolution
- [ ] Run resolve-urls API manually
- [ ] Check backend logs for errors
- [ ] Verify Search API response
- [ ] Test with different URL formats

### ✅ Step 4: Test GSC Integration
- [ ] GSC service account has permissions
- [ ] Page has traffic data in GSC
- [ ] URL normalization works correctly
- [ ] Date range is valid

### ✅ Step 5: Test Content Generation
- [ ] OpenRouter API key is set
- [ ] Keyword research completes
- [ ] Blueprint generation works
- [ ] Content generation completes

---

## Files Modified for This Feature

### Backend
1. `server/wordpress-routes.js` - Added `PUT /update-post` endpoint
2. `server/gsc-routes.js` - Added `POST /fetch-page-performance` endpoint

### Frontend
1. `src/lib/wordpress-api.ts` - Added `updateWordPressPost()` and `fetchGSCPagePerformance()` functions
2. `src/components/integrations/WordPressFeature.tsx` - Added optimization UI and handler
3. `src/components/integrations/types.ts` - Added type definitions

---

## Quick Fixes

### Fix 1: Add Slug-Based Fallback
If Search API fails, add to `server/wordpress-routes.js` in `resolve-urls` endpoint:

```javascript
// After Search API fails, try slug-based lookup
const urlParts = url.split('/').filter(Boolean);
const slug = urlParts[urlParts.length - 1]?.replace(/\.html?$/, '') || '';

// Try posts endpoint
try {
  const postsUrl = `${normalizedUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
  const postsResponse = await axios.get(postsUrl, { /* auth */ });
  if (postsResponse.data && postsResponse.data.length > 0) {
    const post = postsResponse.data[0];
    resolved.push({
      url: url,
      id: post.id,
      subtype: 'post',
      link: post.link
    });
    continue; // Success, move to next URL
  }
} catch (error) {
  // Try pages or custom post types...
}
```

### Fix 2: Better Error Messages
In `handleOptimizeContent`, add more specific error handling:

```javascript
if (resolveResult.resolved.length === 0) {
  const reason = resolveResult.unresolvable[0]?.reason || 'Unknown error';
  
  if (reason.includes('400')) {
    throw new Error(`WordPress Search API error (400). The URL may not be a valid post/page, or WordPress Search API may be disabled. Try: 1) Verify the post exists, 2) Check WordPress version (5.0+), 3) Enable Search API in WordPress.`);
  } else if (reason.includes('401')) {
    throw new Error(`Authentication failed. Please verify your WordPress username and application password.`);
  } else if (reason.includes('404')) {
    throw new Error(`Post not found. The URL "${url}" does not match any published post on this site.`);
  }
  
  throw new Error(`Could not resolve URL: ${reason}`);
}
```

### Fix 3: Add Manual URL Input Validation
Before calling resolve-urls, validate the URL:

```javascript
// In handleOptimizeContent, before resolveWordPressUrls
if (!url || !url.trim()) {
  toast.error('Please enter a URL to optimize');
  return;
}

// Validate URL format
try {
  new URL(url);
} catch {
  toast.error('Invalid URL format. Please enter a complete URL (e.g., https://example.com/post-slug/)');
  return;
}

// Extract domain and verify it matches site URL
const urlDomain = new URL(url).hostname;
const siteDomain = new URL(site.siteUrl).hostname;
if (urlDomain !== siteDomain && urlDomain !== `www.${siteDomain}` && `www.${urlDomain}` !== siteDomain) {
  toast.warning(`URL domain (${urlDomain}) doesn't match site domain (${siteDomain}). Proceeding anyway...`);
}
```

---

## Next Steps for Debugging

1. **Check browser console** for JavaScript errors
2. **Check backend logs** for API errors
3. **Test URL resolution manually** using curl/Postman
4. **Verify WordPress REST API** endpoints are accessible
5. **Check GSC service account** permissions
6. **Test each step individually** using the test functions above

---

## Contact Points

- **Backend routes**: `server/wordpress-routes.js` and `server/gsc-routes.js`
- **Frontend handler**: `src/components/integrations/WordPressFeature.tsx` - `handleOptimizeContent`
- **API functions**: `src/lib/wordpress-api.ts`
- **Types**: `src/components/integrations/types.ts`

---

## Additional Resources

- WordPress REST API Handbook: https://developer.wordpress.org/rest-api/
- WordPress Search API: https://developer.wordpress.org/rest-api/reference/search-results/
- GSC Search Console API: https://developers.google.com/webmaster-tools/search-console-api-original/v3


