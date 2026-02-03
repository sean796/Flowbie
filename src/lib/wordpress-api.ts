/**
 * WordPress API Wrapper
 * Frontend functions to interact with WordPress through backend server
 * All calls go through backend to avoid CORS issues
 * 
 * This file re-exports all functions and types from feature modules
 * for backward compatibility. New code should import directly from
 * the feature modules.
 */

// Re-export all types
export * from './wordpress-api/types';

// Re-export connection and sitemap functions
export {
  BACKEND_API_BASE,
  testWordPressConnection,
  detectSitemaps,
  parseSitemap
} from './wordpress-api/connection';

// Re-export post retrieval functions
export {
  getScheduledPosts,
  getPublishedPosts,
  getPublishedServiceAreas,
  getPublishedPages,
  resolveWordPressUrls,
  getWordPressPostContent
} from './wordpress-api/posts';

// Re-export CRUD functions
export {
  createWordPressPost,
  updateWordPressPost,
  deleteWordPressPost
} from './wordpress-api/crud';

// Re-export media functions
export {
  uploadWordPressMedia
} from './wordpress-api/media';

// Re-export meta functions
export {
  getWordPressPostMeta,
  updateWordPressPostMeta
} from './wordpress-api/meta';

// Re-export GSC functions
export {
  fetchGSCPagePerformance,
  indexSitemapUrls
} from './wordpress-api/gsc';

// Re-export utility functions
export {
  generateEntities,
  checkFuturePosts
} from './wordpress-api/utils';

// Re-export link validation (200 only; only use links from WordPress API)
export { filterPostsToValidatedLinksOnly } from './wordpress-api/validate-internal-links';
