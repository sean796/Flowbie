/**
 * Writes the report date range to a file AI agents can read.
 * Kept simple so agents see and abide by the exact dates the user picked.
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'REPORT_DATE_RANGE.md');

/**
 * Format YYYY-MM-DD to "Month Year" (e.g. "December 2024")
 */
function toMonthYear(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Write the selected date range to REPORT_DATE_RANGE.md in project root.
 * Includes explicit period names so AI always uses BOTH (e.g. "December 2024 vs November 2024").
 * @param {Object} opts
 * @param {string} opts.startDate - Current period start (YYYY-MM-DD)
 * @param {string} opts.endDate - Current period end (YYYY-MM-DD)
 * @param {string} [opts.compareStartDate] - Comparison period start (optional)
 * @param {string} [opts.compareEndDate] - Comparison period end (optional)
 */
function writeReportDateRange({ startDate, endDate, compareStartDate, compareEndDate }) {
  if (!startDate || !endDate) return;

  const currentName = toMonthYear(endDate);
  const compareName = compareEndDate ? toMonthYear(compareEndDate) : null;

  let content = `# Report Date Range (AI: use these exact dates)

Current Period: ${startDate} to ${endDate}
Current Period Name: ${currentName}
`;

  if (compareStartDate && compareEndDate) {
    content += `Comparison Period: ${compareStartDate} to ${compareEndDate}
Comparison Period Name: ${compareName}

REPORT FORMAT: ALWAYS say BOTH periods. Use "${currentName} vs ${compareName}" or "${currentName} (compared to ${compareName})". NEVER say only "${compareName}" or "this month" or "last month".
`;
  }

  content += `
REPORT DATA RULES (GSC is source of truth):
- Use total monthly/period impressions and clicks from GSC with NO filters
- Numbers must be IDENTICAL across key points, executive summary, infographic, growth highlights, and timeline
- Never invent, round differently, or use alternate calculations for impressions or clicks
`;

  try {
    fs.writeFileSync(FILE_PATH, content.trimEnd() + '\n', 'utf8');
  } catch (err) {
    console.warn('[Report Date Range] Failed to write file:', err.message);
  }
}

module.exports = { writeReportDateRange };
