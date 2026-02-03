/**
 * Debug Logger Utility
 * Centralized debug logging that can be enabled/disabled
 * Prevents console errors when debug server is not available
 * 
 * NOTE: Debug logging is currently disabled. Set VITE_ENABLE_DEBUG_LOG=true in .env to enable.
 */

// Always disabled unless explicitly enabled via environment variable
const DEBUG_LOG_ENABLED = false; // import.meta.env.VITE_ENABLE_DEBUG_LOG === 'true';
const DEBUG_LOG_ENDPOINT = "http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51";

/**
 * Send debug log entry to telemetry server
 * Only sends if debug logging is enabled
 */
export function debugLog(payload: {
  location: string;
  message: string;
  data?: any;
  timestamp?: number;
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
}): void {
  // Only send if debug logging is explicitly enabled
  if (!DEBUG_LOG_ENABLED) {
    return;
  }

  try {
    const body = JSON.stringify({
      ...payload,
      timestamp: payload.timestamp ?? Date.now(),
      sessionId: payload.sessionId ?? 'debug-session',
      runId: payload.runId ?? 'run1',
      hypothesisId: payload.hypothesisId ?? 'A',
    });

    // Prefer sendBeacon to avoid CORS preflight and reduce console noise
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(DEBUG_LOG_ENDPOINT, new Blob([body], { type: "text/plain" }));
    } else {
      // Use no-cors mode to prevent CORS errors from showing in console
      fetch(DEBUG_LOG_ENDPOINT, {
        method: "POST",
        body,
        mode: "no-cors",
        keepalive: true,
      }).catch(() => {
        // Silently fail - debug logging should never break the app
      });
    }
  } catch {
    // Silently fail - debug logging should never break the app
  }
}

/**
 * Check if debug logging is enabled
 */
export function isDebugLogEnabled(): boolean {
  return DEBUG_LOG_ENABLED;
}
