/**
 * Progress tracking for Knowledge Model operations
 * Stores progress state in memory (can be moved to Redis for production)
 */

const progressStore = new Map();

/**
 * Initialize progress tracking
 */
function initProgress(jobId) {
  progressStore.set(jobId, {
    status: 'initializing',
    currentStep: 'Starting...',
    totalPosts: 0,
    processedPosts: 0,
    currentPost: null,
    posts: [],
    errors: [],
    startTime: Date.now()
  });
}

/**
 * Update progress
 */
function updateProgress(jobId, update) {
  const progress = progressStore.get(jobId);
  if (progress) {
    Object.assign(progress, update);
    progress.lastUpdate = Date.now();
  }
}

/**
 * Add post progress
 */
function addPostProgress(jobId, postInfo) {
  const progress = progressStore.get(jobId);
  if (progress) {
    // Check if post already exists (update existing)
    const existingIndex = progress.posts.findIndex(p => p.url === postInfo.url);
    
    if (existingIndex >= 0) {
      // Update existing post
      progress.posts[existingIndex] = {
        url: postInfo.url,
        title: postInfo.title || progress.posts[existingIndex].title || 'Unknown',
        status: postInfo.status || 'processing',
        postId: postInfo.id || progress.posts[existingIndex].postId,
        error: postInfo.error
      };
    } else {
      // Add new post
      progress.posts.push({
        url: postInfo.url,
        title: postInfo.title || 'Unknown',
        status: postInfo.status || 'processing',
        postId: postInfo.id,
        error: postInfo.error
      });
    }
    
    progress.processedPosts = progress.posts.length;
    progress.currentPost = postInfo;
    progress.lastUpdate = Date.now();
  }
}

/**
 * Get progress
 */
function getProgress(jobId) {
  return progressStore.get(jobId) || null;
}

/**
 * Set total posts
 */
function setTotalPosts(jobId, total) {
  const progress = progressStore.get(jobId);
  if (progress) {
    progress.totalPosts = total;
  }
}

/**
 * Complete progress
 */
function completeProgress(jobId, result = null) {
  const progress = progressStore.get(jobId);
  if (progress) {
    progress.status = 'completed';
    progress.currentStep = 'Completed';
    progress.result = result;
    progress.endTime = Date.now();
    progress.duration = progress.endTime - progress.startTime;
  }
}

/**
 * Fail progress
 */
function failProgress(jobId, error) {
  const progress = progressStore.get(jobId);
  if (progress) {
    progress.status = 'failed';
    progress.currentStep = 'Failed';
    progress.error = error.message || error;
    progress.endTime = Date.now();
    progress.duration = progress.endTime - progress.startTime;
  }
}

/**
 * Clean up old progress (older than 1 hour)
 */
function cleanupOldProgress() {
  const oneHourAgo = Date.now() - 3600000;
  for (const [jobId, progress] of progressStore.entries()) {
    if (progress.lastUpdate && progress.lastUpdate < oneHourAgo) {
      progressStore.delete(jobId);
    }
  }
}

// Cleanup every 30 minutes
setInterval(cleanupOldProgress, 1800000);

module.exports = {
  initProgress,
  updateProgress,
  addPostProgress,
  getProgress,
  setTotalPosts,
  completeProgress,
  failProgress
};

