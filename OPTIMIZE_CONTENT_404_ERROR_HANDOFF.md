# Optimize Content — 404 Error Handoff Sheet

## Problem Statement
When creating a new draft during the "Optimize Content" workflow, the system encounters a **404 Not Found** error from the WordPress REST API at the final step (post creation).

**User Report**: "Everything worked until the end, WordPress API error: 404 Not Found"

---

## Error Location
- **Backend**: `server/wordpress-routes.js` — `POST /create-post` endpoint (lines 1493-1654)
- **Frontend**: `src/components/integrations/WordPressFeature.tsx` — `continueOptimizationWithKeyword` function (lines 1665-1705)

---

## Root Causes

### 1. Custom Post Type Endpoint Not Found (Most Likely)
**Symptom**: 404 when `postType === 'service-area'` or other custom post types

**Explanation**:
- WordPress REST API endpoints for custom post types follow the pattern: `/wp-json/wp/v2/{post-type}`
- Custom post types must be **explicitly registered** with `'show_in_rest' => true`
- If the custom post type doesn't exist or isn't REST-enabled, WordPress returns 404

**Current Code**:
```javascript
const postTypeSlug = postType === 'service-area' ? 'service-area' : 'post';
const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postTypeSlug}`;
```

**Validation**:
- Check WordPress admin → **REST API** plugins or custom code
- Verify `register_post_type()` includes `'show_in_rest' => true`
- Test endpoint manually: `GET /wp-json/wp/v2/{post-type}` should return JSON

---

### 2. Invalid Slug Format
**Symptom**: 404 when custom slug is provided but contains invalid characters

**Explanation**:
- WordPress slugs must follow strict formatting rules
- Only lowercase letters, numbers, and hyphens are allowed
- Special characters, spaces, or uppercase letters can cause rejection

**Current Code**:
```javascript
draftSlug = `${cleanSlug}-2`;
```

**Potential Issues**:
- Original slug may contain invalid characters
- Slug sanitization may not be sufficient
- WordPress REST API may reject the slug format

**WordPress Slug Rules**:
- Must be lowercase
- Only alphanumeric characters and hyphens
- Cannot start or end with hyphen
- Maximum length: ~200 characters

---

### 3. Slug Conflict with Existing Post
**Symptom**: 404 if slug `{original-slug}-2` already exists

**Explanation**:
- While WordPress usually auto-increments conflicts (`-2`, `-3`), the REST API may reject explicitly provided slugs if they conflict
- If the exact slug exists, WordPress may return 404 instead of auto-incrementing

**Current Code**:
```javascript
draftSlug = `${cleanSlug}-2`;
```

**Potential Issues**:
- Post with slug `{original-slug}-2` already exists
- WordPress doesn't auto-increment when slug is explicitly provided
- Need to check existing posts first or let WordPress auto-increment

---

### 4. WordPress REST API Base Path Issue
**Symptom**: 404 if WordPress is installed in a subdirectory or uses custom REST API path

**Explanation**:
- Some WordPress installations use custom REST API paths
- WordPress may be installed in a subdirectory (`/wp/` or `/wordpress/`)
- REST API base may be customized via filters

**Current Code**:
```javascript
const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postTypeSlug}`;
```

**Validation**:
- Test: `GET /wp-json/` should return WordPress REST API info
- Check `rest_url_prefix` in WordPress settings or via `get_rest_url()`

---

## Error Handling Improvements Made

### 1. Enhanced Logging
**Added**:
- Endpoint URL logging before request
- Slug logging when custom slug is provided
- Detailed error data logging for 404, 400, and other errors
- Custom post type detection in error messages

**Code Changes**:
```javascript
console.log(`[WordPress] API endpoint: ${apiUrl}`);
if (slug) {
  console.log(`[WordPress] Using custom slug: ${slug}`);
}
```

### 2. Specific 404 Error Handling
**Added**:
- Detection of custom post type issues
- Clear error messages indicating endpoint problems
- Full error data logging for debugging

**Code Changes**:
```javascript
else if (error.response.status === 404) {
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
}
```

### 3. Enhanced 400 Error Messages
**Added**:
- Slug information in validation error messages
- Full error data logging

---

## Diagnostic Steps

### Step 1: Check Backend Logs
**Action**: Look for console logs showing:
```
[WordPress] API endpoint: {url}
[WordPress] Using custom slug: {slug}
[WordPress] 404 error creating post: {details}
```

**What to Look For**:
- Exact endpoint URL being called
- Custom slug being used
- Full error response from WordPress

### Step 2: Test WordPress REST API Manually
**Action**: Test the endpoint directly:

```bash
# Test standard posts endpoint
curl -u username:app_password https://site.com/wp-json/wp/v2/posts

# Test custom post type endpoint (if applicable)
curl -u username:app_password https://site.com/wp-json/wp/v2/service-area
```

**Expected**:
- `200 OK` with JSON array (even if empty)
- `404 Not Found` if endpoint doesn't exist

### Step 3: Verify Custom Post Type Registration
**Action**: Check WordPress code for:
```php
register_post_type('service-area', array(
    'show_in_rest' => true,  // MUST be true for REST API
    'rest_base' => 'service-area',  // Optional: custom REST base
    // ... other args
));
```

**If Missing**:
- Custom post type won't be accessible via REST API
- System should fall back to standard `post` type or show clear error

### Step 4: Validate Slug Format
**Action**: Check the extracted slug format:

**Example URL**: `https://intheshadeflorida.com/blog/best-blinds-shades-coastal-florida`

**Extracted Slug**: `best-blinds-shades-coastal-florida`
**Draft Slug**: `best-blinds-shades-coastal-florida-2`

**Validation**:
- ✅ All lowercase
- ✅ Only hyphens and alphanumeric
- ✅ No special characters
- ✅ Reasonable length

**If Invalid**:
- Sanitize slug using WordPress slug rules
- Remove invalid characters
- Convert to lowercase

---

## Recommended Fixes

### Fix 1: Fallback to Standard Post Type
**Priority**: High

**Action**: If custom post type returns 404, fall back to standard `post` type:

```javascript
// Try custom post type first, fallback to 'post' if 404
let postTypeSlug = postType === 'service-area' ? 'service-area' : 'post';
let apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postTypeSlug}`;

try {
  // Attempt creation
} catch (error) {
  if (error.response?.status === 404 && postTypeSlug !== 'post') {
    console.log(`[WordPress] Custom post type not found, falling back to 'post'`);
    postTypeSlug = 'post';
    apiUrl = `${normalizedUrl}/wp-json/wp/v2/post`;
    // Retry creation
  }
}
```

### Fix 2: Slug Sanitization
**Priority**: Medium

**Action**: Sanitize slug according to WordPress rules:

```javascript
function sanitizeWordPressSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphen
    .replace(/-+/g, '-')           // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
}
```

### Fix 3: Check Slug Availability
**Priority**: Low

**Action**: Before creating, check if slug exists and auto-increment:

```javascript
// Check if slug exists
const existingPosts = await axios.get(`${apiUrl}?slug=${draftSlug}`, { auth });
if (existingPosts.data.length > 0) {
  // Increment slug
  let counter = 3;
  while (true) {
    const testSlug = `${cleanSlug}-${counter}`;
    const check = await axios.get(`${apiUrl}?slug=${testSlug}`, { auth });
    if (check.data.length === 0) {
      draftSlug = testSlug;
      break;
    }
    counter++;
  }
}
```

**Note**: This adds an extra API call, so only implement if slug conflicts are common.

### Fix 4: Remove Explicit Slug (Let WordPress Auto-Increment)
**Priority**: Medium

**Action**: Don't provide slug explicitly, let WordPress auto-increment:

```javascript
// Don't set slug, let WordPress handle it
// WordPress will automatically create {original-slug}-2, -3, etc.
if (slug) {
  // Optionally: only set slug if user explicitly wants it
  // Otherwise, remove this line
  postData.slug = slug;
}
```

**Trade-off**:
- ✅ Reliable (WordPress handles conflicts)
- ❌ Less control over final URL structure

---

## Testing Checklist

- [ ] Test with standard `post` type (should work)
- [ ] Test with `service-area` custom post type (check if exists)
- [ ] Test with URL containing special characters in slug
- [ ] Test with URL where `-2` slug already exists
- [ ] Test with WordPress in subdirectory
- [ ] Verify backend logs show detailed error information
- [ ] Verify frontend shows clear error message to user

---

## Expected Behavior After Fixes

1. **Custom Post Type Not Found**: Clear error message indicating the endpoint doesn't exist, with suggestion to use standard `post` type
2. **Invalid Slug**: Slug is sanitized automatically, or clear error if sanitization fails
3. **Slug Conflict**: WordPress auto-increments, or system checks and increments manually
4. **General 404**: Detailed error message with endpoint URL and suggested troubleshooting steps

---

## Next Steps

1. **Review backend logs** to identify exact 404 cause
2. **Test WordPress REST API endpoints** manually to verify availability
3. **Implement recommended fixes** based on diagnostic findings
4. **Add fallback logic** for custom post types
5. **Enhance slug sanitization** if needed
6. **Test with real WordPress site** to verify fixes

---

## Files Modified

1. `server/wordpress-routes.js`:
   - Added detailed logging for endpoint and slug
   - Enhanced 404 error handling with custom post type detection
   - Improved error messages for all error types

2. `src/components/integrations/WordPressFeature.tsx`:
   - Slug extraction and `-2` appending logic (already implemented)
   - Error display to user (handled by backend error messages)

---

## Notes

- The error occurs **at the end** of the workflow, meaning all previous steps (URL resolution, GSC fetch, keyword selection, content generation) are working correctly
- The issue is **specifically with the final WordPress API call** to create the draft
- Enhanced logging will help identify the exact cause when it occurs again
- Consider implementing one or more of the recommended fixes based on diagnostic results

