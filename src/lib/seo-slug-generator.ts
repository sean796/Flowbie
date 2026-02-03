/**
 * SEO Slug Generator
 * Generates short, keyword-focused URL slugs for new WordPress posts (never for updates).
 * AI-driven when API key available; deterministic fallback otherwise.
 */

import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

const SLUG_MAX_LENGTH = 80;

/**
 * Sanitize a slug to WordPress-safe format: lowercase, [a-z0-9-]+
 */
function sanitizeSlug(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const sanitized = lower
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.length > SLUG_MAX_LENGTH
    ? sanitized.substring(0, SLUG_MAX_LENGTH).replace(/-$/, "")
    : sanitized;
}

/**
 * Deterministic fallback: slug from primaryKeyword + optional short entity token.
 */
function fallbackSlug(primaryKeyword: string, entity?: string | null): string {
  const kw = (primaryKeyword || "").trim();
  const parts: string[] = [];
  if (kw) {
    parts.push(kw.replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }
  if (entity && entity.trim() && entity !== "N/A") {
    const token = entity
      .trim()
      .split(/[,\s]+/)[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (token && token.length <= 20) parts.push(token);
  }
  const combined = parts.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitizeSlug(combined) || "post";
}

/**
 * Generate a short, SEO-optimal URL slug for a NEW post only.
 * Do not use when updating an existing post (preserve original slug).
 *
 * @param title - Post title (for AI context)
 * @param primaryKeyword - Primary keyword (drives slug)
 * @param entity - Optional location/entity (e.g. "Edmonton, Alberta")
 * @param apiKey - Optional OpenRouter API key (uses loadApiKey() when omitted)
 * @returns Slug string: lowercase, hyphens, 2–5 words max
 */
export async function generateSEOSlug(
  title: string,
  primaryKeyword: string,
  entity?: string | null,
  apiKey?: string | null
): Promise<string> {
  const keyword = (primaryKeyword || "").trim();
  const fallback = fallbackSlug(keyword, entity);
  if (!keyword) return fallback;

  const key = (apiKey ?? loadApiKey())?.trim();
  if (!key) return fallback;

  const model = getResearchModel();

  try {
    const entityLine =
      entity && entity.trim() && entity !== "N/A"
        ? `For local/entity page, add a short location token (e.g. city name). Entity: ${entity}.`
        : "This is a general blog post. Do NOT add location or entity to the slug.";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          typeof window !== "undefined" ? window.location.origin : "https://agent-blueprint-builder.com",
        "X-Title": "Agent Blueprint Builder",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `Generate a SHORT URL slug for SEO and LLMs.

Title: "${(title || "").trim().substring(0, 200)}"
Primary keyword: "${keyword}"
${entityLine}

RULES:
- Include ONLY the core keyword phrase (and optional short location for entity pages).
- No full title, no extra words, no year/numbers unless part of the keyword.
- Output a single slug: lowercase, hyphens, 2–5 words max.
- Maximum ${SLUG_MAX_LENGTH} characters.

Return ONLY the slug, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 60,
      }),
    });

    if (!response.ok) return fallback;

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "").trim();
    if (!raw) return fallback;

    const slug = sanitizeSlug(raw);
    return slug.length >= 2 ? slug : fallback;
  } catch {
    return fallback;
  }
}
