/**
 * Knowledge Model API Routes
 * Handles graph generation, node expansion, and AI suggestions
 */

const express = require('express');
const router = express.Router();
const {
  generateGraph,
  autoGraph,
  expandNode
} = require('./knowledge-model-controller');
const { getProgress } = require('./knowledge-model-progress');

/**
 * POST /generate-graph
 * Generate knowledge graph from selected sitemaps
 */
router.post('/generate-graph', async (req, res) => {
  try {
    const { siteId, sitemapUrls, siteUrl, username, appPassword, gscData } = req.body;
    
    if (!siteId || !sitemapUrls || !Array.isArray(sitemapUrls) || sitemapUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteId, sitemapUrls (array)'
      });
    }
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing WordPress credentials: siteUrl, username, appPassword'
      });
    }
    
    const graph = await generateGraph(
      siteId,
      sitemapUrls,
      siteUrl,
      username,
      appPassword,
      gscData || []
    );
    
    res.json({
      success: true,
      graph: graph
    });
  } catch (error) {
    console.error('[Knowledge Model Routes] Error in generate-graph:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate graph'
    });
  }
});

/**
 * POST /auto-graph
 * Automatically process all sitemaps and generate graph
 */
router.post('/auto-graph', async (req, res) => {
  try {
    const { siteId, siteUrl, username, appPassword, gscData, jobId: providedJobId } = req.body;
    
    if (!siteId || !siteUrl || !username || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteId, siteUrl, username, appPassword'
      });
    }
    
    // Generate jobId if not provided (autoGraph will also generate one, but we need it here for response)
    const { v4: uuidv4 } = require('uuid');
    const jobId = providedJobId || uuidv4();
    
    // Start async processing
    autoGraph(
      siteId,
      siteUrl,
      username,
      appPassword,
      gscData || [],
      jobId
    ).catch(error => {
      console.error('[Knowledge Model Routes] Error in auto-graph:', error);
    });
    
    // Return job ID immediately for progress tracking
    res.json({
      success: true,
      jobId: jobId,
      message: 'Auto-graph started. Use /progress endpoint to track progress.'
    });
  } catch (error) {
    console.error('[Knowledge Model Routes] Error starting auto-graph:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start auto-graph'
    });
  }
});

/**
 * GET /progress/:jobId
 * Get progress for a graph generation job
 */
router.get('/progress/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = getProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      progress: progress
    });
  } catch (error) {
    console.error('[Knowledge Model Routes] Error getting progress:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get progress'
    });
  }
});

/**
 * GET /graph/:graphId
 * Get saved graph data (placeholder for future implementation)
 */
router.get('/graph/:graphId', async (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Graph storage not yet implemented'
  });
});

/**
 * POST /expand-node
 * Expand node with GSC data
 */
router.post('/expand-node', async (req, res) => {
  try {
    const { keyword, gscData } = req.body;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: keyword'
      });
    }
    
    const expanded = await expandNode(keyword, gscData || []);
    
    res.json({
      success: true,
      node: expanded
    });
  } catch (error) {
    console.error('[Knowledge Model Routes] Error in expand-node:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to expand node'
    });
  }
});

module.exports = router;

