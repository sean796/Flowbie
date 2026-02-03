/**
 * Google Search Console Integration Routes
 * Main router that combines all feature-based GSC route modules
 */

const express = require('express');
const gscQueries = require('./gsc-queries');
const gscPerformance = require('./gsc-performance');
const gscIndexing = require('./gsc-indexing');
const gscConnection = require('./gsc-connection');
const { writeReportDateRange } = require('./report-date-range-writer');

const router = express.Router();

console.log('[GSC Routes] Router initialized');

// POST /api/gsc/report-date-range - Write selected dates so AI agents can read them
router.post('/report-date-range', (req, res) => {
  try {
    const { startDate, endDate, compareStartDate, compareEndDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate required' });
    }
    writeReportDateRange({ startDate, endDate, compareStartDate, compareEndDate });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mount feature routers
router.use(gscQueries);
router.use(gscPerformance);
router.use(gscIndexing);
router.use(gscConnection);

module.exports = router;
