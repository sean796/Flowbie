/**
 * Controller functions for Knowledge Model routes
 * Handles business logic for graph generation
 */

const { fetchSitemaps, collectContentFromSitemaps, extractKeywordsForGSC } = require('./knowledge-model-data-collector');
const { initProgress, updateProgress, addPostProgress, setTotalPosts, completeProgress, failProgress } = require('./knowledge-model-progress');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const PYTHON_ML_SERVICE_URL = process.env.PYTHON_ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Check if Python ML service is available
 */
async function checkPythonMLService() {
  try {
    // #region agent log
    console.log(`[Knowledge Model] Checking Python ML service at ${PYTHON_ML_SERVICE_URL}/health`);
    // #endregion
    const response = await axios.get(`${PYTHON_ML_SERVICE_URL}/health`, {
      timeout: 5000,
      validateStatus: (status) => status < 500
    });
    // #region agent log
    console.log(`[Knowledge Model] Health check response: status=${response.status}, data=`, response.data);
    // #endregion
    return response.status === 200;
  } catch (error) {
    // #region agent log
    console.error(`[Knowledge Model] Health check failed:`, error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error(`[Knowledge Model] Connection refused - service is not running on ${PYTHON_ML_SERVICE_URL}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.error(`[Knowledge Model] Connection timeout - service may be starting or not responding`);
    }
    // #endregion
    return false;
  }
}

/**
 * Generate knowledge graph from selected sitemaps
 */
async function generateGraph(siteId, sitemapUrls, siteUrl, username, appPassword, gscData = []) {
  try {
    // Collect content from sitemaps
    const content = await collectContentFromSitemaps(
      sitemapUrls,
      siteUrl,
      username,
      appPassword,
      (message) => console.log(`[Knowledge Model] ${message}`)
    );
    
    if (content.length === 0) {
      throw new Error('No content found in selected sitemaps');
    }
    
    // Extract keywords for GSC mapping
    const allKeywords = new Set();
    content.forEach(item => {
      const keywords = extractKeywordsForGSC(item);
      keywords.forEach(kw => allKeywords.add(kw));
    });
    
    // Map GSC data to keywords
    const gscMap = {};
    gscData.forEach(item => {
      const query = item.query?.toLowerCase();
      if (query) {
        gscMap[query] = item;
      }
    });
    
    // Prepare data for Python service
    const processedContent = content.map(item => ({
      id: item.id,
      title: item.title,
      content: item.content,
      excerpt: item.excerpt
    }));
    
    const processedGSC = Array.from(allKeywords).map(keyword => {
      return gscMap[keyword] || {
        query: keyword,
        clicks: 0,
        impressions: 0,
        position: 0,
        ctr: 0
      };
    });
    
    // Check if Python ML service is available
    const serviceAvailable = await checkPythonMLService();
    if (!serviceAvailable) {
      throw new Error(
        'Python ML service is not running. Please start it with:\n' +
        '  cd server/python-ml-service\n' +
        '  pip install -r requirements.txt\n' +
        '  python app.py\n' +
        `\nThe service should be running on ${PYTHON_ML_SERVICE_URL}`
      );
    }
    
    // Call Python ML service
    const response = await axios.post(`${PYTHON_ML_SERVICE_URL}/process-graph`, {
      site_id: siteId,
      content: processedContent,
      gsc_data: processedGSC,
      options: {
        site_id: siteId,
        total_posts: content.length
      }
    }, {
      timeout: 300000 // 5 minutes timeout
    });
    
    return response.data.graph;
  } catch (error) {
    console.error('[Knowledge Model] Error generating graph:', error);
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      throw new Error(
        'Python ML service is not running. Please start it with:\n' +
        '  cd server/python-ml-service\n' +
        '  pip install -r requirements.txt\n' +
        '  python app.py\n' +
        `\nThe service should be running on ${PYTHON_ML_SERVICE_URL}`
      );
    }
    throw error;
  }
}

/**
 * Auto-graph: automatically process all sitemaps with progress tracking
 */
async function autoGraph(siteId, siteUrl, username, appPassword, gscData = [], jobId = null) {
  if (!jobId) {
    jobId = uuidv4();
  }
  
  try {
    initProgress(jobId);
    updateProgress(jobId, { status: 'fetching_sitemaps', currentStep: 'Fetching sitemaps...' });
    
    // Fetch all sitemaps
    const sitemapUrls = await fetchSitemaps(siteUrl, username, appPassword);
    
    if (sitemapUrls.length === 0) {
      failProgress(jobId, new Error('No sitemaps found for this site'));
      throw new Error('No sitemaps found for this site');
    }
    
    updateProgress(jobId, { 
      status: 'collecting_content', 
      currentStep: `Found ${sitemapUrls.length} sitemaps. Collecting content...`,
      sitemapCount: sitemapUrls.length
    });
    
    // Collect content with detailed progress
    const progressCallback = (message, details = {}) => {
      if (details.step === 'downloading_batch') {
        // Update progress with batch information
        updateProgress(jobId, { 
          currentStep: message,
          totalPosts: details.totalPosts || details.totalUrls || 0,
          processedPosts: details.processedPosts || 0
        });
        if (details.totalPosts) {
          setTotalPosts(jobId, details.totalPosts);
        }
      } else if (details.step === 'downloading_post') {
        addPostProgress(jobId, {
          url: details.url,
          status: details.status,
          id: null,
          title: 'Downloading...'
        });
      } else if (details.step === 'post_downloaded') {
        addPostProgress(jobId, {
          url: details.url,
          status: 'success',
          id: details.postId,
          title: details.title
        });
      } else if (details.step === 'post_failed' || details.step === 'post_error') {
        addPostProgress(jobId, {
          url: details.url,
          status: 'failed',
          error: details.error
        });
      } else if (details.totalUrls) {
        setTotalPosts(jobId, details.totalUrls);
        updateProgress(jobId, { 
          currentStep: message,
          totalPosts: details.totalUrls
        });
      } else {
        updateProgress(jobId, { currentStep: message });
      }
    };
    
    const content = await collectContentFromSitemaps(
      sitemapUrls,
      siteUrl,
      username,
      appPassword,
      progressCallback,
      jobId
    );
    
    if (content.length === 0) {
      failProgress(jobId, new Error('No content found in sitemaps'));
      throw new Error('No content found in selected sitemaps');
    }
    
    updateProgress(jobId, { 
      status: 'processing', 
      currentStep: `Processing ${content.length} posts with Word2Vec...` 
    });
    
    // Extract keywords for GSC mapping
    const allKeywords = new Set();
    content.forEach(item => {
      const keywords = extractKeywordsForGSC(item);
      keywords.forEach(kw => allKeywords.add(kw));
    });
    
    // Map GSC data to keywords
    const gscMap = {};
    gscData.forEach(item => {
      const query = item.query?.toLowerCase();
      if (query) {
        gscMap[query] = item;
      }
    });
    
    // Prepare data for Python service
    const processedContent = content.map(item => ({
      id: item.id,
      title: item.title,
      content: item.content,
      excerpt: item.excerpt
    }));
    
    const processedGSC = Array.from(allKeywords).map(keyword => {
      return gscMap[keyword] || {
        query: keyword,
        clicks: 0,
        impressions: 0,
        position: 0,
        ctr: 0
      };
    });
    
    updateProgress(jobId, { 
      status: 'building_graph', 
      currentStep: 'Building knowledge graph...' 
    });
    
    // Check if Python ML service is available
    const serviceAvailable = await checkPythonMLService();
    if (!serviceAvailable) {
      const errorMsg = 'Python ML service is not running. Please start it with:\n' +
        '  cd server/python-ml-service\n' +
        '  pip install -r requirements.txt\n' +
        '  python app.py\n' +
        `\nThe service should be running on ${PYTHON_ML_SERVICE_URL}`;
      failProgress(jobId, new Error(errorMsg));
      throw new Error(errorMsg);
    }
    
    // Call Python ML service
    const response = await axios.post(`${PYTHON_ML_SERVICE_URL}/process-graph`, {
      site_id: siteId,
      content: processedContent,
      gsc_data: processedGSC,
      options: {
        site_id: siteId,
        total_posts: content.length
      }
    }, {
      timeout: 300000 // 5 minutes timeout
    });
    
    const graphData = response.data.graph;
    completeProgress(jobId, graphData);
    return { graph: graphData, jobId };
  } catch (error) {
    console.error('[Knowledge Model] Error in auto-graph:', error);
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      const errorMsg = 'Python ML service is not running. Please start it with:\n' +
        '  cd server/python-ml-service\n' +
        '  pip install -r requirements.txt\n' +
        '  python app.py\n' +
        `\nThe service should be running on ${PYTHON_ML_SERVICE_URL}`;
      failProgress(jobId, new Error(errorMsg));
      throw new Error(errorMsg);
    }
    failProgress(jobId, error);
    throw error;
  }
}

/**
 * Expand node with GSC data
 */
async function expandNode(keyword, gscData) {
  const keywordLower = keyword.toLowerCase();
  const gscItem = gscData.find(item => item.query?.toLowerCase() === keywordLower);
  
  if (gscItem) {
    return {
      keyword: keyword,
      gsc_data: {
        clicks: gscItem.clicks || 0,
        impressions: gscItem.impressions || 0,
        position: gscItem.position || 0,
        ctr: gscItem.ctr || 0
      }
    };
  }
  
  return {
    keyword: keyword,
    gsc_data: null
  };
}

module.exports = {
  generateGraph,
  autoGraph,
  expandNode
};

