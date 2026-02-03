# Suppressing Debug Log Console Errors

## Problem
The application makes debug telemetry calls to `http://127.0.0.1:7252/ingest/...` which is not running, causing many console errors.

## Solution Options

### Option 1: Disable Debug Logging (Recommended)
Debug logging is disabled by default. To enable it, set this environment variable:

```bash
# In your .env file or environment
VITE_ENABLE_DEBUG_LOG=true
```

**By default, debug logging is OFF**, so no requests will be made and no console errors will appear.

### Option 2: Filter Console Errors (Quick Fix)
In your browser's developer console, you can filter out these specific errors:

1. Open DevTools (F12)
2. Go to Console settings (gear icon)
3. Add a filter to hide messages containing: `127.0.0.1:7252`

Or use the console filter box and type: `-7252` to hide all messages containing "7252"

### Option 3: Replace Inline Fetch Calls
The codebase has many inline `fetch()` calls for debug logging. These can be replaced with the centralized `debugLog()` utility from `src/lib/debug-logger.ts`.

**Before:**
```typescript
fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({location:'...',message:'...',...})
}).catch(()=>{});
```

**After:**
```typescript
import { debugLog } from '@/lib/debug-logger';

debugLog({
  location: '...',
  message: '...',
  data: {...}
});
```

## Current Status
- ✅ Created `src/lib/debug-logger.ts` utility
- ✅ Updated `src/lib/keyword-ai-analyzer.ts` to use the utility
- ⚠️ Other files still have inline fetch calls (they will be silent if debug logging is disabled, but may still show in console)

## Note
The debug logging calls are wrapped in `.catch(()=>{})` to prevent breaking the application, but browsers may still show failed network requests in the console. The cleanest solution is to use the centralized `debugLog()` utility which checks if logging is enabled before making any requests.
