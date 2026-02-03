/**
 * Validate internal links via backend (HTTP 200 only).
 * Only links that return 200 are considered valid; used to filter WordPress posts list
 * so we never use fake or broken links.
 */

import { BACKEND_API_BASE } from './connection';

export type PostWithLink = { id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string };

function toFullUrl(siteBaseUrl: string, link: string): string {
  if (!link) return '';
  let base = (siteBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base.startsWith('http://') && !base.startsWith('https://')) base = `https://${base}`;
  if (link.startsWith('http://') || link.startsWith('https://')) return link;
  const path = link.startsWith('/') ? link : `/${link}`;
  return `${base}${path}`;
}

/**
 * Call backend to validate URLs return HTTP 200. Returns only posts whose link returned ok.
 * No fallback: if backend is unreachable or returns error, returns [] so we never allow unvalidated links.
 */
export async function filterPostsToValidatedLinksOnly(
  siteBaseUrl: string,
  posts: PostWithLink[],
  onProgress?: (message: string) => void
): Promise<PostWithLink[]> {
  if (!posts.length) return posts;

  const fullUrls = posts.map((p) => toFullUrl(siteBaseUrl, p.link)).filter(Boolean);
  if (fullUrls.length === 0) return posts;

  onProgress?.(`Validating ${fullUrls.length} link(s) for 200...`);
  try {
    const response = await fetch(`${BACKEND_API_BASE}/api/death-star/validate-internal-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: fullUrls }),
    });
    if (!response.ok) {
      console.warn('[validate-internal-links] Backend returned', response.status, '- no links allowed until validated');
      return [];
    }
    const data = (await response.json()) as { results?: Array<{ url: string; ok: boolean }> };
    const results = data.results ?? [];
    const okUrls = new Set(
      results.filter((r) => r.ok).map((r) => r.url.toLowerCase().replace(/\/+$/, ''))
    );
    const normalized = (url: string) => toFullUrl(siteBaseUrl, url).toLowerCase().replace(/\/+$/, '');
    const filtered = posts.filter((p) => {
      const full = normalized(p.link);
      return full && okUrls.has(full);
    });
    if (filtered.length < posts.length) {
      onProgress?.(`Using ${filtered.length} post(s) with valid links (${posts.length - filtered.length} removed: non-200)`);
    }
    return filtered;
  } catch (err) {
    console.warn('[validate-internal-links] Failed to validate links (backend down?):', err);
    return [];
  }
}
