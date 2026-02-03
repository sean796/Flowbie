/**
 * WordPress Integration Routes
 * Main router that combines all feature-based WordPress route modules
 * 
 * This file imports and mounts all WordPress feature routers:
 * - connection: Test WordPress connection
 * - sitemap: Sitemap detection and parsing
 * - posts-list: Fetch scheduled and published posts
 * - post-content: Get full post content
 * - url-resolver: Resolve URLs to REST API objects
 * - post-crud: Create, update, and delete posts
 * - media: Upload media files
 * - meta: Get/update post meta and ACF fields
 */

const express = require('express');
const connectionRoutes = require('./wordpress/connection');
const sitemapRoutes = require('./wordpress/sitemap');
const postsListRoutes = require('./wordpress/posts-list');
const postContentRoutes = require('./wordpress/post-content');
const urlResolverRoutes = require('./wordpress/url-resolver');
const postCrudRoutes = require('./wordpress/post-crud');
const mediaRoutes = require('./wordpress/media');
const metaRoutes = require('./wordpress/meta');
const acfProtocolRoutes = require('./wordpress/acf-protocol');

const router = express.Router();

console.log('[WordPress Routes] Router initialized');

// Mount feature routers
router.use(connectionRoutes);
router.use(sitemapRoutes);
router.use(postsListRoutes);
router.use(postContentRoutes);
router.use(urlResolverRoutes);
router.use(postCrudRoutes);
router.use(mediaRoutes);
router.use(metaRoutes);
router.use(acfProtocolRoutes);

console.log('[WordPress Routes] Routes registered:');
console.log('  - POST /test-connection (mounted at /api/wordpress)');
console.log('  - POST /detect-sitemaps (mounted at /api/wordpress)');
console.log('  - POST /parse-sitemap (mounted at /api/wordpress)');
console.log('  - POST /check-future-posts (mounted at /api/wordpress)');
console.log('  - POST /get-scheduled-posts (mounted at /api/wordpress)');
console.log('  - POST /get-published-posts (mounted at /api/wordpress)');
console.log('  - POST /get-post-content (mounted at /api/wordpress)');
console.log('  - POST /resolve-urls (mounted at /api/wordpress)');
console.log('  - POST /upload-media (mounted at /api/wordpress)');
console.log('  - POST /create-post (mounted at /api/wordpress)');
console.log('  - PUT /update-post (mounted at /api/wordpress)');
console.log('  - DELETE /delete-post (mounted at /api/wordpress)');
console.log('  - POST /update-acf-field (mounted at /api/wordpress)');
console.log('  - POST /get-post-meta (mounted at /api/wordpress)');
console.log('  - POST /update-post-meta (mounted at /api/wordpress)');
console.log('  - POST /update-acf-fields (mounted at /api/wordpress)');
console.log('  - POST /get-acf-fields (mounted at /api/wordpress)');
console.log('  - POST /discover-acf-field (mounted at /api/wordpress)');
console.log('  - POST /validate-acf-setup (mounted at /api/wordpress)');

module.exports = router;
