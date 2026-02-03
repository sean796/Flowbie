/**
 * Death Star module: internal link quality control API.
 * POST /validate-internal-links — ping each internal link; require HTTP 200 for all; reject if any non-200.
 */

const express = require('express');
const axios = require('axios');

const router = express.Router();
const PING_TIMEOUT_MS = 10000;

/** Pathname regex: ends with one or more "-N" segments and optional trailing slash (e.g. -2, -2/, -2-2/). */
const DUPLICATE_URL_PATH_REGEX = /(-\d+)+\/?$/;

/**
 * True if URL path looks like a possible duplicate (e.g. /page-2/, /slug-2-2/). Reject even when 200.
 * @param {string} url
 * @returns {boolean}
 */
function isPossibleDuplicateUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return DUPLICATE_URL_PATH_REGEX.test(pathname);
  } catch {
    return false;
  }
}

/**
 * Ping a URL (HEAD, fallback GET). Returns { status, ok }.
 * ok === true only when status === 200.
 * @param {string} url
 * @returns {Promise<{ status: number, ok: boolean }>}
 */
async function pingUrl(url) {
  try {
    const config = {
      maxRedirects: 5,
      timeout: PING_TIMEOUT_MS,
      validateStatus: () => true,
    };
    let res = await axios.head(url, config);
    if (res.status === 405 || res.status === 501) {
      res = await axios.get(url, { ...config, maxContentLength: 0 });
    }
    return { status: res.status, ok: res.status === 200 };
  } catch (err) {
    const status = err.response?.status ?? 0;
    return { status: status || (err.code === 'ECONNABORTED' ? 408 : 0), ok: false };
  }
}

/**
 * Extract internal link URLs from content (markdown + HTML).
 * Same semantics as content-sanitizer: [text](url) and <a href="url">.
 * Filter to same host as siteBaseUrl; dedupe by normalized URL.
 * @param {string} content
 * @param {string} siteBaseUrl
 * @returns {string[]}
 */
function extractInternalLinks(content, siteBaseUrl) {
  if (!content || typeof content !== 'string') return [];
  let siteHost = '';
  try {
    const base = siteBaseUrl.startsWith('http') ? siteBaseUrl : `https://${siteBaseUrl}`;
    siteHost = new URL(base).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return [];
  }
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  const seen = new Set();
  const urls = [];
  let m;
  while ((m = linkPattern.exec(content)) !== null) {
    const url = m[2] || m[3];
    if (!url) continue;
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host !== siteHost) continue;
      const normalized = u.href.replace(/\/$/, '').toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(u.href);
    } catch {
      // invalid URL, skip
    }
  }
  return urls;
}

/**
 * POST /validate-internal-links
 * Body: { urls: string[] } OR { content: string, siteBaseUrl: string }
 * Response: { results: Array<{ url, status, ok }>, allOk: boolean }
 */
router.post('/validate-internal-links', async (req, res) => {
  try {
    const { urls: bodyUrls, content, siteBaseUrl } = req.body || {};
    let urls = Array.isArray(bodyUrls) ? bodyUrls : [];

    if (urls.length === 0 && content != null && siteBaseUrl) {
      urls = extractInternalLinks(content, siteBaseUrl);
    }

    if (urls.length === 0) {
      return res.json({ results: [], allOk: true });
    }

    const seen = new Set();
    const toCheck = [];
    for (const u of urls) {
      if (!u || typeof u !== 'string') continue;
      const normalized = u.trim().toLowerCase().replace(/\/$/, '');
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      toCheck.push(u.trim());
    }

    const results = [];
    for (const url of toCheck) {
      if (isPossibleDuplicateUrl(url)) {
        results.push({ url, status: 200, ok: false, rejected: 'duplicate-url-pattern' });
        continue;
      }
      const { status, ok } = await pingUrl(url);
      results.push({ url, status, ok });
    }

    const allOk = results.every((r) => r.ok);
    res.json({ results, allOk });
  } catch (err) {
    console.error('[Death Star] validate-internal-links error:', err);
    res.status(500).json({ error: err.message || 'Internal server error', results: [], allOk: false });
  }
});

module.exports = router;
