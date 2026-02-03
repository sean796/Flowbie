/**
 * SEM Task List focus categories (traditional tech SEO labels).
 * User must select at least one; AI interprets and fixes according to selection.
 */
export const SEM_FOCUS_CATEGORIES = [
  "Broken links",
  "Schema (FAQ, Article, etc.)",
  "Title & meta description",
  "Internal linking",
  "Content / keyword optimization",
  "Other",
] as const;

export type SemFocusCategory = (typeof SEM_FOCUS_CATEGORIES)[number];

/**
 * Analyze a file name (e.g. from SEM export) and suggest focus categories.
 * Returns an array of SEM_FOCUS_CATEGORIES to pre-select; user can add more.
 */
export function deriveSuggestedFocusFromFileName(fileName: string): SemFocusCategory[] {
  const name = fileName.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").toLowerCase();
  const suggested: SemFocusCategory[] = [];

  if (/title|meta|element|description|too_long|length|character/.test(name)) {
    suggested.push("Title & meta description");
  }
  if (/schema|faq|article|structured/.test(name)) {
    suggested.push("Schema (FAQ, Article, etc.)");
  }
  if (/link|broken|404|redirect|href/.test(name)) {
    suggested.push("Broken links");
  }
  if (/internal|linking|anchor/.test(name)) {
    suggested.push("Internal linking");
  }
  if (/content|keyword|optimization|h1|h2|heading/.test(name)) {
    suggested.push("Content / keyword optimization");
  }
  if (suggested.length === 0) {
    suggested.push("Other");
  }

  return [...new Set(suggested)];
}

/**
 * Derive focus categories from a task's suggestedAction and checklist.
 * Use this when the user hasn't selected focus areas so we don't require a double list.
 */
export function deriveFocusFromTask(suggestedAction: string, checklist: string[] = []): string[] {
  const text = `${(suggestedAction || "").toLowerCase()} ${(checklist || []).join(" ").toLowerCase()}`;
  const suggested: string[] = [];

  if (/title|meta|description|tag|length|character/.test(text)) {
    suggested.push("Title & meta description");
  }
  if (/schema|faq|article|structured/.test(text)) {
    suggested.push("Schema (FAQ, Article, etc.)");
  }
  if (/link|broken|404|redirect|href/.test(text)) {
    suggested.push("Broken links");
  }
  if (/internal|linking|anchor/.test(text)) {
    suggested.push("Internal linking");
  }
  if (/content|keyword|optimization|h1|h2|heading/.test(text)) {
    suggested.push("Content / keyword optimization");
  }
  if (suggested.length === 0) {
    suggested.push("Title & meta description"); // safe default for "Fix title and meta" etc.
  }

  return [...new Set(suggested)];
}
