/**
 * Death Star Link QC — manual quality control for internal links.
 *
 * Pings each internal link via the Death Star API (or inline) and ensures every link returns HTTP 200.
 * If any link does not return 200, the script rejects (exit 1) and prints failed URLs.
 *
 * Usage (run from project root):
 *   node server/scripts/death-star-link-qc.js --urls "https://example.com/a,https://example.com/b"
 *   node server/scripts/death-star-link-qc.js --content-file path/to/content.html --site-url https://example.com
 *   echo "https://example.com/a" | node server/scripts/death-star-link-qc.js --stdin
 *
 * Optional: --api-base http://localhost:3001  (use API). Omit to run inline ping without server.
 *
 * Exit: 0 = all links 200; 1 = at least one non-200 (reject).
 */

const fs = require('fs');
const path = require('path');

const PING_TIMEOUT_MS = 10000;

/** Pathname regex: ends with one or more "-N" segments and optional trailing slash (e.g. -2, -2/, -2-2/). */
const DUPLICATE_URL_PATH_REGEX = /(-\d+)+\/?$/;

function isPossibleDuplicateUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return DUPLICATE_URL_PATH_REGEX.test(pathname);
  } catch {
    return false;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { urls: [], contentFile: null, siteUrl: null, stdin: false, apiBase: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--urls' && args[i + 1]) {
      out.urls = args[++i].split(',').map((u) => u.trim()).filter(Boolean);
    } else if (args[i] === '--content-file' && args[i + 1]) {
      out.contentFile = args[++i];
    } else if (args[i] === '--site-url' && args[i + 1]) {
      out.siteUrl = args[++i].trim();
    } else if (args[i] === '--stdin') {
      out.stdin = true;
    } else if (args[i] === '--api-base' && args[i + 1]) {
      out.apiBase = args[++i].trim().replace(/\/$/, '');
    }
  }
  return out;
}

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
      // skip invalid URL
    }
  }
  return urls;
}

async function pingUrl(url) {
  const axios = require('axios');
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

async function validateInline(urls) {
  const results = [];
  for (const url of urls) {
    if (isPossibleDuplicateUrl(url)) {
      results.push({ url, status: 200, ok: false, rejected: 'duplicate-url-pattern' });
      continue;
    }
    const { status, ok } = await pingUrl(url);
    results.push({ url, status, ok });
  }
  return results;
}

async function validateViaApi(apiBase, urls) {
  const axios = require('axios');
  const res = await axios.post(`${apiBase}/api/death-star/validate-internal-links`, { urls }, { timeout: 60000 });
  return res.data.results || [];
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('').split('\n').map((l) => l.trim()).filter(Boolean)));
  });
}

async function main() {
  const opts = parseArgs();
  let urls = [...opts.urls];

  if (opts.stdin) {
    const lines = await readStdin();
    urls = urls.concat(lines);
  }

  if (opts.contentFile && opts.siteUrl) {
    const fullPath = path.isAbsolute(opts.contentFile) ? opts.contentFile : path.join(process.cwd(), opts.contentFile);
    const content = fs.readFileSync(fullPath, 'utf8');
    const extracted = extractInternalLinks(content, opts.siteUrl);
    urls = urls.concat(extracted);
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

  if (toCheck.length === 0) {
    console.log('Death Star Link QC: No URLs to check. OK.');
    process.exit(0);
  }

  let results;
  try {
    if (opts.apiBase) {
      results = await validateViaApi(opts.apiBase, toCheck);
    } else {
      results = await validateInline(toCheck);
    }
  } catch (err) {
    console.error('Death Star Link QC: Error:', err.message || err);
    process.exit(1);
  }

  const failed = (results || []).filter((r) => !r.ok);
  if (failed.length > 0) {
    failed.forEach((r) => console.error(`REJECT: ${r.url} ${r.status}${r.rejected ? ` (${r.rejected})` : ''}`));
    process.exit(1);
  }

  console.log(`Death Star Link QC: All ${toCheck.length} link(s) returned 200. OK.`);
  process.exit(0);
}

main();
