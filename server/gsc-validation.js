/**
 * Google Search Console Validation Utilities
 * Handles input validation for GSC API requests
 */

const fs = require('fs');
const path = require('path');

// Debug log path (relative to project root)
const DEBUG_LOG_PATH = path.join(__dirname, '..', '..', '.cursor', 'debug.log');

/**
 * Ensure debug log directory exists
 */
function ensureDebugLogDir() {
  try {
    const logDir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    // Silently fail if directory creation fails
  }
}

/**
 * Safe append to debug log
 */
function appendToDebugLog(entry) {
  try {
    ensureDebugLogDir();
    fs.appendFileSync(DEBUG_LOG_PATH, entry, 'utf8');
  } catch (e) {
    // Silently fail if logging fails
  }
}

/**
 * Validate date format and range
 * Returns { valid: boolean, error?: string, startDateStr?: string, endDateStr?: string }
 */
function validateDates(startDate, endDate) {
  // #region agent log
  const logEntry = JSON.stringify({
    location: 'gsc-validation.js:10',
    message: 'validateDates entry',
    data: { startDate, endDate, receivedAt: new Date().toISOString() },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId: 'D'
  }) + '\n';
  appendToDebugLog(logEntry);
  // #endregion
  
  // Check if dates are provided
  if (!startDate || !endDate) {
    return { valid: false, error: 'Both startDate and endDate are required (YYYY-MM-DD format)' };
  }
  
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: 'Dates must be in YYYY-MM-DD format' };
  }
  
  // Parse dates
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  // Use UTC for "today" to match date parsing (which uses UTC)
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // #region agent log
  const logEntry2 = JSON.stringify({
    location: 'gsc-validation.js:28',
    message: 'After parsing dates',
    data: {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      todayISO: today.toISOString(),
      todayLocal: today.toString(),
      endGreaterThanToday: end > today
    },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId: 'E'
  }) + '\n';
  appendToDebugLog(logEntry2);
  // #endregion
  
  // Validate dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  // Validate endDate is not in the future (allow today)
  if (end > today) {
    return { valid: false, error: 'endDate cannot be in the future' };
  }
  
  // Validate startDate is before endDate
  if (start >= end) {
    return { valid: false, error: 'startDate must be before endDate' };
  }
  
  return {
    valid: true,
    startDateStr: startDate,
    endDateStr: endDate
  };
}

module.exports = {
  validateDates
};


