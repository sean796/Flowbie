# Child Sitemap Scraping - Handoff Sheet

## Overview
This document describes the child sitemap scraping functionality in the IntegrationsTab component, which scrapes WordPress child sitemaps, extracts post slugs, fetches post content via the WordPress REST API, and adds posts to the knowledge base.

## Flow Diagram

```
User clicks "Scrape" on child sitemap
    ↓
handleScrapeChildSitemap() called
    ↓
1. Parse child sitemap XML → Extract URLs
    ↓
2. Extract slugs from URLs (extractSlugFromUrl function)
    ↓
3. Fetch post content in batches (getWordPressPostContent API)
    ↓
4. Convert posts to markdown files
    ↓
5. Add to knowledge base (localStorage)
```

## Code Location

**File:** `src/components/IntegrationsTab.tsx`
**Function:** `handleScrapeChildSitemap` (lines 1000-1277)

## Detailed Flow

### Step 1: Parse Child Sitemap
- **Function:** `parseSitemap()` from `@/lib/wordpress-api`
- **Backend:** `POST /api/wordpress/parse-sitemap` in `server/wordpress-routes.js`
- **What it does:** Fetches the child sitemap XML and parses it to extract URLs
- **Expected result:** Array of URLs from the sitemap

### Step 2: Extract Slugs from URLs
- **Function:** `extractSlugFromUrl()` (lines 1038-1052)
- **Logic:**
  ```typescript
  1. Parse URL to get pathname
  2. Split pathname by '/' and filter empty segments
  3. Get last segment (assumed to be the post slug)
  4. Remove .html/.xml suffixes
  ```
- **Potential Issues:**
  - WordPress permalink structure might not match (e.g., `/category/post-slug/` vs `/post-slug/`)
  - Some URLs might be pages, not posts
  - Custom post types might have different URL structures
  - Trailing slashes or query parameters might interfere

### Step 3: Fetch Post Content by Slug
- **Function:** `getWordPressPostContent()` from `@/lib/wordpress-api`
- **Backend:** `POST /api/wordpress/get-post-content` in `server/wordpress-routes.js` (lines 780-911)
- **API Call:** `GET /wp-json/wp/v2/posts?slug={slug}` for each slug
- **Batch Size:** 10 slugs per batch
- **Critical Point:** If `allPosts.length === 0` after all batches, error is shown (line 1110)

### Step 4: Convert to Markdown
- **Function:** `convertWordPressPostsToMarkdownFiles()` from `@/lib/wordpress-converter`
- **Optional:** AI summarization if OpenRouter API key is available
- **Output:** Markdown files stored in localStorage

## Common Issues & Debugging

### Issue: "No posts could be fetched. Please check your credentials and try again."

**Location:** Line 1110 in `IntegrationsTab.tsx`

**Root Causes:**

1. **Slug Extraction Failure**
   - **Symptom:** URLs parsed but slugs don't match WordPress post slugs
   - **Debug:** Check console logs:
     - `[WordPress] Extracted X slugs from Y URLs`
     - `[WordPress] Sample slugs: [...]`
   - **Fix:** Verify slug extraction logic matches your WordPress permalink structure

2. **WordPress REST API Not Finding Posts**
   - **Symptom:** Slugs extracted but API returns empty array
   - **Debug:** Check backend logs:
     - `[WordPress] Fetching post content for 0 IDs and X slugs`
     - `[WordPress] Retrieved X posts, Y errors`
   - **Common causes:**
     - Posts are custom post types (not standard "post" type)
     - Permalink structure doesn't match slug extraction
     - Posts are private/draft and user lacks permissions
     - Slug encoding issues (special characters)

3. **Authentication Issues**
   - **Symptom:** 401 errors in backend
   - **Debug:** Check backend logs for authentication errors
   - **Fix:** Verify Application Password is correct and not revoked

4. **Wrong Post Type**
   - **Symptom:** URLs are pages, not posts
   - **Debug:** Check if URLs are `/page-slug/` vs `/post-slug/`
   - **Fix:** May need to query `/wp-json/wp/v2/pages?slug=...` instead

### Debugging Steps

1. **Check Console Logs:**
   ```
   [WordPress] Parsed X URLs from sitemap
   [WordPress] Extracted X slugs from Y URLs
   [WordPress] Sample slugs: [...]
   [WordPress] Fetching batch 1/X...
   [WordPress] Batch 1 returned X posts
   [WordPress] Total posts fetched: X out of Y slugs
   ```

2. **Check Backend Logs:**
   ```
   [WordPress] Fetching post content for 0 IDs and X slugs
   [WordPress] Retrieved X posts, Y errors
   ```

3. **Verify Slug Extraction:**
   - Open browser console
   - Check the "Sample slugs" log
   - Manually test: `GET /wp-json/wp/v2/posts?slug={one-of-the-slugs}`

4. **Test WordPress REST API Directly:**
   ```bash
   curl -u "username:app-password" \
     "https://yoursite.com/wp-json/wp/v2/posts?slug=test-slug"
   ```

5. **Check for Errors Array:**
   - The API returns `errors` array if some slugs fail
   - Check `contentResult.errors` in the response

## Potential Fixes

### Fix 1: Improve Slug Extraction
**Location:** Lines 1038-1052

**Current Logic:**
- Takes last path segment as slug
- Assumes `/post-slug/` structure

**Better Approach:**
- Handle multiple permalink structures
- Check for category prefixes
- Handle custom post types
- Validate slug format before using

### Fix 2: Add Better Error Reporting
**Location:** Lines 1100-1103

**Current:** Only logs warning, continues silently

**Better:** 
- Log which slugs failed
- Show which batch failed
- Display specific error messages from API

### Fix 3: Support Custom Post Types
**Location:** Backend `get-post-content` route (line 847)

**Current:** Only queries `/wp-json/wp/v2/posts`

**Better:**
- Try multiple endpoints: `/posts`, `/pages`, custom post types
- Or detect post type from URL structure

### Fix 4: Add Retry Logic
**Location:** Lines 1084-1103

**Current:** Fails silently on batch errors

**Better:**
- Retry failed batches
- Exponential backoff
- Log retry attempts

## Key Files

1. **Frontend:**
   - `src/components/IntegrationsTab.tsx` - Main scraping logic
   - `src/lib/wordpress-api.ts` - API wrapper functions

2. **Backend:**
   - `server/wordpress-routes.js` - REST API endpoints
     - `/parse-sitemap` (line 235)
     - `/get-post-content` (line 780)

3. **Utilities:**
   - `src/lib/wordpress-converter.ts` - Markdown conversion

## Testing Checklist

- [ ] Sitemap parsing returns URLs
- [ ] Slug extraction produces valid slugs
- [ ] WordPress REST API finds posts by slug
- [ ] Batch processing handles errors gracefully
- [ ] Posts are converted to markdown correctly
- [ ] Files are saved to knowledge base
- [ ] Error messages are clear and actionable

## Quick Fix Recommendations

1. **Add detailed logging** for slug extraction and API calls
2. **Show which slugs failed** in the error message
3. **Add fallback** to try different post types if posts fail
4. **Validate slugs** before sending to API
5. **Handle empty responses** more gracefully (maybe some URLs aren't posts)

## Next Steps for Developer

1. Add console logging to see exactly which slugs are being extracted
2. Test a few slugs manually against the WordPress REST API
3. Check if the permalink structure matches the extraction logic
4. Verify the WordPress site uses standard "post" post type
5. Check backend logs for specific API errors
6. Consider adding support for custom post types or pages

