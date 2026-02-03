# ACF Field Editing Fix - Handoff Sheet

## Problem Summary

ACF (Advanced Custom Fields) field updates were **silently failing** - the API returned success but values weren't actually saved in WordPress.

---

## Root Cause

The previous implementation used **two incorrect methods**:

### Wrong Method 1: Legacy ACF REST API Endpoint
```
POST /wp-json/acf/v3/{post_type}/{id}
```
- This endpoint requires a **separate ACF REST API addon** (not included in ACF Pro 5.11+)
- Returns 404 or silently fails on most modern ACF installations

### Wrong Method 2: WordPress Meta Object
```javascript
// WRONG - causes silent failures
{
  "meta": {
    "origin": "Edmonton, Alberta"
  }
}
```
- Writing ACF fields via `meta` **breaks ACF's internal data structure**
- ACF stores field references separately (`_fieldname` → `field_xxx`)
- Direct meta writes bypass this, causing data corruption or silent failures

---

## The Fix

Changed to the **correct approach** - using the `acf` object on the standard WordPress REST endpoint:

```javascript
// CORRECT - reliable ACF updates
POST /wp-json/wp/v2/{post_type}/{id}
{
  "acf": {
    "origin": "Edmonton, Alberta",
    "date_modifier": "2026-01-19"
  }
}
```

This works because:
- ACF Pro 5.11+ natively integrates with WordPress REST API
- The `acf` object is properly handled by ACF's internal hooks
- Field references and values are correctly maintained

---

## Files Modified

| File | Changes |
|------|---------|
| `server/wordpress/acf-protocol.js` | Removed `/acf/v3/` calls, now uses `acf: {}` on standard endpoint |
| `server/wordpress/acf-utils.js` | Removed meta-based discovery, simplified to check for `acf` object |
| `server/wordpress/meta.js` | Updated `/update-acf-field` to use `acf: {}` approach |
| `HANDOFF_ACF_PROTOCOL.md` | Updated documentation |

---

## WordPress Requirements

For this to work, the WordPress site **must have these PHP filters** in `functions.php`:

```php
/**
 * Enable full ACF REST API read + write
 */
add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');
add_filter('acf/rest_api/field_settings/editable', '__return_true');
```

Without these filters:
- `acf` object won't appear in REST responses
- Write operations will be silently ignored

---

## Field Values Being Updated

| ACF Field | Source | Format | Example |
|-----------|--------|--------|---------|
| `origin` | Geographic location extracted from post title via AI | String | `"Edmonton, Alberta"` |
| `date_modifier` | Current date when post is updated | `YYYY-MM-DD` | `"2026-01-19"` |

### Origin Field Logic
1. Post title is analyzed by AI (e.g., "Window Blinds Edmonton Alberta")
2. Geographic entity is extracted (e.g., "Edmonton, Alberta")
3. Value is written to `origin` ACF field

### Date Modifier Logic
1. Current date is generated: `new Date().toISOString().split('T')[0]`
2. Value is written to `date_modifier` ACF field

---

## Before vs After

### Before (Broken)
```javascript
// Tried legacy endpoint first
POST /wp-json/acf/v3/service-areas/1234
{ "fields": { "origin": "Edmonton" } }
// ❌ 404 or silent failure

// Fell back to meta
PUT /wp-json/wp/v2/service-areas/1234
{ "meta": { "origin": "Edmonton" } }
// ❌ Silent failure - ACF internals broken
```

### After (Fixed)
```javascript
// Single correct approach
POST /wp-json/wp/v2/service-areas/1234
{ "acf": { "origin": "Edmonton, Alberta" } }
// ✅ Works reliably
```

---

## How to Verify the Fix Works

### 1. Check ACF Support
```bash
curl -X POST http://localhost:3001/api/wordpress/validate-acf-setup \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://your-site.com",
    "username": "admin",
    "appPassword": "xxxx xxxx xxxx xxxx",
    "postType": "service-area",
    "postTypeEndpoint": "service-areas",
    "postId": 1234
  }'
```

Expected response:
```json
{
  "success": true,
  "validation": {
    "hasAcfSupport": true,
    "acfFields": { "origin": "", "date_modifier": "" },
    "hasPermission": true
  }
}
```

### 2. Update ACF Fields
```bash
curl -X POST http://localhost:3001/api/wordpress/update-acf-fields \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://your-site.com",
    "username": "admin",
    "appPassword": "xxxx xxxx xxxx xxxx",
    "postId": 1234,
    "fields": {
      "origin": "Edmonton, Alberta",
      "date_modifier": "2026-01-19"
    },
    "postType": "service-area",
    "postTypeEndpoint": "service-areas"
  }'
```

Expected response:
```json
{
  "success": true,
  "updated": ["origin", "date_modifier"],
  "failed": [],
  "method": "acf-rest-api"
}
```

### 3. Verify in WordPress Admin
1. Go to WordPress Admin → Posts → [Your Post]
2. Scroll to ACF fields section
3. Confirm `origin` and `date_modifier` have the correct values

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| `hasAcfSupport: false` | Missing PHP filters | Add filters to `functions.php` |
| `acf` object missing from response | Field Group not REST-enabled | In ACF UI, enable "Show in REST API" for the field group |
| 401/403 errors | Auth issues | Verify Application Password is correct and user has edit permissions |
| 404 errors | Wrong endpoint | Check `postTypeEndpoint` matches WordPress REST API (usually plural) |
| Updates succeed but values don't change | Old code still running | Restart the backend server |

---

## Code Flow

```
Frontend (React/TypeScript)
    ↓
src/lib/wordpress-acf-origin.ts
    → updateACFFields()
    ↓
Backend (Node.js/Express)
    ↓
server/wordpress/acf-protocol.js
    → POST /update-acf-fields
    ↓
server/wordpress/acf-utils.js
    → validateACFSetup()
    → serializeACFFieldValue()
    ↓
WordPress REST API
    ↓
POST /wp-json/wp/v2/{post_type}/{id}
    { "acf": { "field": "value" } }
    ↓
ACF Pro handles the update internally
```

---

## Key Takeaways

1. **Always use `acf: {}` payload** on standard WP REST endpoint
2. **Never use `meta: {}`** for ACF fields
3. **Never use `/acf/v3/`** endpoint (legacy)
4. **PHP filters are required** in `functions.php`
5. **Field names must match exactly** (case-sensitive, use field name not label)
6. **Post type endpoints are usually plural** (e.g., `service-areas` not `service-area`)
7. **Restart backend server** after code changes

---

## Related Files

- `server/wordpress/acf-protocol.js` - Main ACF update endpoints
- `server/wordpress/acf-utils.js` - Validation and serialization
- `server/wordpress/meta.js` - Single field update endpoint
- `src/lib/wordpress-acf-origin.ts` - Frontend wrapper functions
- `HANDOFF_ACF_PROTOCOL.md` - Full protocol documentation
