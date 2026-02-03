# ACF Protocol - Handoff Document

## Overview

**Purpose**: The ACF (Advanced Custom Fields) Protocol provides reliable field management for WordPress sites using ACF Pro 5.11+. It uses the **correct** REST API approach.

**Core Capabilities**:
- Update multiple ACF fields in a single request
- Validate ACF REST API configuration
- Check if specific ACF fields exist
- Proper value serialization for different field types

## Correct Approach (CRITICAL)

**ALWAYS use the `acf` object on the standard WordPress REST endpoint:**

```
POST /wp-json/wp/v2/{post_type}/{id}
{
  "acf": {
    "origin": "Edmonton, Alberta",
    "date_modifier": "2026-01-19",
    "cta_enabled": true
  }
}
```

**DO NOT use:**
- `/wp-json/acf/v3/` endpoint (legacy, requires separate addon)
- `meta: {}` for ACF fields (breaks ACF internals, causes silent failures)

## Required WordPress Configuration

Add these filters to your theme's `functions.php`:

```php
/**
 * Enable full ACF REST API read + write
 */
add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');
add_filter('acf/rest_api/field_settings/editable', '__return_true');
```

## Architecture

### File Structure

```
Backend:
├── server/wordpress/acf-protocol.js      # Main router with API endpoints
├── server/wordpress/acf-utils.js         # Validation and serialization utilities
└── server/wordpress/meta.js              # Single field update endpoint

Frontend:
└── src/lib/wordpress-acf-origin.ts       # Frontend wrapper functions
```

### API Endpoints

All endpoints are mounted at `/api/wordpress/`:

| Endpoint | Purpose |
|----------|---------|
| `POST /update-acf-fields` | Update multiple ACF fields in one request |
| `POST /update-acf-field` | Update a single ACF field |
| `POST /get-acf-fields` | Retrieve all ACF fields for a post |
| `POST /discover-acf-field` | Check if a specific field exists |
| `POST /validate-acf-setup` | Validate ACF REST API configuration |

## Field Value Requirements

| ACF Field | Value Source | Format |
|-----------|--------------|--------|
| `origin` | Geographic location extracted from post title via AI | String (e.g., "Edmonton, Alberta") |
| `date_modifier` | Current date when post is updated | `YYYY-MM-DD` (e.g., "2026-01-19") |

## Update Request Example

```javascript
POST /api/wordpress/update-acf-fields
{
  "siteUrl": "https://example.com",
  "username": "admin",
  "appPassword": "xxxx xxxx xxxx xxxx",
  "postId": 1234,
  "fields": {
    "origin": "Edmonton, Alberta",
    "date_modifier": "2026-01-19"
  },
  "postType": "service-area",
  "postTypeEndpoint": "service-areas",
  "options": {
    "validateOnly": false,
    "verifyAfterUpdate": true
  }
}
```

## Update Response Example

```javascript
{
  "success": true,
  "updated": ["origin", "date_modifier"],
  "failed": [],
  "method": "acf-rest-api",
  "diagnostics": {
    "validation": {
      "hasAcfSupport": true,
      "acfFields": { "origin": "", "date_modifier": "" },
      "hasPermission": true
    }
  }
}
```

## Validation

Before updating, the system validates:

1. **ACF Support**: Checks if `acf` object exists in REST response
2. **Permissions**: Verifies user can edit the post
3. **Field Existence**: Confirms fields are available

If validation fails, the response includes the required PHP configuration:

```json
{
  "success": false,
  "error": "ACF REST API not available...",
  "requiredConfig": {
    "php": [
      "add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');",
      "add_filter('acf/rest_api/field_settings/editable', '__return_true');"
    ]
  }
}
```

## Common Failure Causes

| Symptom | Cause | Solution |
|---------|-------|----------|
| `acf` object not in response | Missing PHP filters | Add filters to functions.php |
| API returns 200 but no change | Using `meta` instead of `acf` | Use `acf: {}` payload |
| Field missing from response | Field Group not REST-enabled | Enable "Show in REST API" in ACF UI |
| Writes ignored | Post type not REST-enabled | Set `show_in_rest = true` for post type |
| Permission denied | Auth or role issues | Check Application Password and user role |

## Testing Commands

### Validate ACF Setup

```bash
curl -X POST http://localhost:3001/api/wordpress/validate-acf-setup \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://example.com",
    "username": "admin",
    "appPassword": "xxxx xxxx xxxx xxxx",
    "postType": "service-area",
    "postTypeEndpoint": "service-areas",
    "postId": 1234
  }'
```

### Update ACF Fields

```bash
curl -X POST http://localhost:3001/api/wordpress/update-acf-fields \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://example.com",
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

### Get ACF Fields

```bash
curl -X POST http://localhost:3001/api/wordpress/get-acf-fields \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://example.com",
    "username": "admin",
    "appPassword": "xxxx xxxx xxxx xxxx",
    "postId": 1234,
    "postType": "service-area",
    "postTypeEndpoint": "service-areas"
  }'
```

## Frontend Usage

```typescript
import { updateACFFields } from '@/lib/wordpress-acf-origin';

// Update multiple fields
const result = await updateACFFields(
  siteUrl,
  username,
  appPassword,
  postId,
  {
    origin: 'Edmonton, Alberta',
    date_modifier: new Date().toISOString().split('T')[0]  // YYYY-MM-DD
  },
  'service-area',    // postType
  'service-areas'    // postTypeEndpoint
);

if (result.success) {
  console.log('Updated fields:', result.updated);
} else {
  console.error('Failed:', result.failed);
}
```

## Key Takeaways

1. **Use `acf: {}` payload** on standard WP REST endpoint
2. **Never use `meta: {}`** for ACF fields
3. **Never use `/acf/v3/`** endpoint (legacy)
4. **PHP filters required** in functions.php for read/write access
5. **Field names** must match ACF field names (not labels)
6. **Post type endpoints** are usually plural (service-areas, not service-area)
