# Rank Math 100 Score Optimization Plan

**Goal:** When an optimization includes **extra content** (Extra Text and/or Extra Image), apply Rank Math–aligned rules so the client scores high (ideally 100) on Rank Math. Title optimization stays **separate** (“title, separate to title opt”); the rest is tech SEO.

**Trigger:** “Rank Math priority” is **on** whenever `optimizeExtraText` or `optimizeExtraImage` is true. No new UI flag required.

---

## Implementation order

| # | Area | Status |
|---|------|--------|
| 1 | Title (Rank Math readability) | **Done** |
| 2 | Meta / tech SEO | **Done** |
| 3 | Extra text (subheadings + density) | **Done** |
| 4 | Keyword at start of content | **Done** |
| 5 | Extra image alt text | **Done** |
| 6 | Slug (optional) | Deferred |

---

## 1. Title optimization (separate, Rank Math–aligned)

**File:** `src/lib/title-optimizer.ts` — `generateOptimizedTitle`

**Change:** Extend the AI prompt so the optimized title satisfies Rank Math “Title Readability”:

- **Focus Keyword at beginning** of the SEO title (or in the first few words).
- **At least one sentiment word** (e.g. “best,” “essential,” “avoid”).
- **At least one power word** (e.g. “ultimate,” “proven,” “simple”).
- **Include a number** where it fits (e.g. “5 Tips…,” “2024…”).

Keep the existing 50-character limit and keyword-in-title requirement. Add the above as explicit instructions (and optionally a short “Rank Math title readability” note in the prompt). No new code paths—prompt-only.

**Done when:** AI-generated titles consistently start with or near the focus keyword and include sentiment/power word and number where appropriate.

---

## 2. Meta / tech SEO

**File:** `src/lib/meta-field-optimizer.ts`

**Change:**

- **rank_math_description:** Require in the prompt that the meta description **must** include the Focus Keyword. If easy, add a quick check after generation: if keyword is missing, retry or append a short phrase containing it.
- **rank_math_title:** If the meta optimizer generates or overrides the SEO title, apply the same “keyword near start” rule as in section 1. If the title comes only from the title-optimizer, no change needed here.

No new services; prompt/validation only in the existing meta optimizer.

**Done when:** Every optimized meta has Focus Keyword in the description and, when meta title is set here, keyword near the start.

---

## 3. Extra text: Focus Keyword in subheadings + density

**File:** `src/lib/content-generation/page-extra-content-generator.ts` — `generateExtraTextForPage`

**Change:** When **optimizeExtraText** is used (and thus we have a primary keyword):

- In the **system or user prompt**, require: **At least one subheading (H2, H3, or H4) must include the Focus Keyword (primary keyword) naturally** (e.g. “Why [Primary Keyword] Matters”, “[Primary Keyword] Tips”).
- Add a short instruction for **natural keyword density**: use the focus keyword a few times in the extra block without stuffing, so Rank Math’s “Keyword Density” check is more likely to pass.

Keep existing H2/H3 and internal-link rules; only add these Rank Math–oriented constraints when generating extra text.

**Done when:** Generated extra text always has the primary keyword in at least one subheading and uses it naturally in the body.

---

## 4. Keyword at beginning of content (main body)

**Where:** Main content is built from the blueprint (prompt-builders, content-optimization-helpers, blog-template-builder). Rank Math’s “Focus Keyword doesn’t appear at the beginning of your content” refers to the first paragraph(s) of the post body.

**Files to touch:**  
`src/lib/prompt-builders.ts` and/or first-section logic in `src/lib/content-optimization-helpers.ts` or `src/lib/blog-template-builder.ts`.

**Change:** In the **first section / first paragraph** instructions, add:

- **The first paragraph (or first 1–2 sentences) of the main content must include the Focus Keyword** (or a natural variation) near the start.

Apply when generating or optimizing main body content (e.g. when `optimizeContent` is true or when generating from blueprint). One clear prompt addition is enough; no new modules.

**Done when:** First paragraph of main content consistently includes the focus keyword near the beginning.

---

## 5. Extra image: alt text with Focus Keyword

**Rank Math:** “Add an image with your Focus Keyword as alt text.”

**Files:**

- **Backend:** `server/wordpress/media.js` — POST `/upload-media`  
- **Frontend API:** `src/lib/wordpress-api/media.ts` — `uploadWordPressMedia`  
- **Caller:** `src/lib/content-generation/wordpress-uploader.ts` — where extra image is uploaded (normal and draft paths)

**Change:**

1. **Backend (`server/wordpress/media.js`):**
   - Accept an optional `alt` (or `altText`) in the request body.
   - After a successful upload (201/200), if `alt` is provided, send a **PATCH** to `wp/v2/media/{id}` with `{ alt_text: alt }` to set the attachment alt text. (WordPress REST API supports `alt_text` on media.)
   - If PATCH fails, log and still return success for the upload; document that alt may need to be set manually.

2. **Frontend API (`src/lib/wordpress-api/media.ts`):**
   - Add an optional parameter `alt?: string` to `uploadWordPressMedia`.
   - Pass it in the JSON body to the backend.

3. **Uploader (`src/lib/content-generation/wordpress-uploader.ts`):**
   - When uploading the **extra image** (`extraImageBase64` set), build an alt string that includes the **primary keyword** (e.g. “Image for [primaryKeyword]” or a short phrase containing the keyword).
   - Call `uploadWordPressMedia(..., filename, title, alt)` with this alt when `primaryKeyword` is available.

**Done when:** Extra images are uploaded with keyword-rich alt text stored on the attachment. Document in this file whether alt is set in the same request or via follow-up PATCH.

---

## 6. Optional: slug/URL with keyword

**Where:** Slug is handled in the upload flow (e.g. `src/lib/content-generation/wordpress-uploader.ts`, `src/lib/wordpress-api/crud.ts`).

**Change (optional, low priority):** When “extra content” is opted in and it’s safe to change the slug:

- **Suggest** a slug that contains the primary keyword (e.g. sanitize keyword to `primary-keyword` or combine with existing slug).
- If the app already supports “update slug” in the post payload, pass the suggested slug when the user has not explicitly kept the old one; otherwise document “slug not updated automatically” and leave a note for a future “optimize URL” option.

Can be a follow-up task.

---

## Files summary

| Area | File(s) |
|------|--------|
| Title | `src/lib/title-optimizer.ts` |
| Meta | `src/lib/meta-field-optimizer.ts` |
| Extra text | `src/lib/content-generation/page-extra-content-generator.ts` |
| Keyword at start of content | `src/lib/prompt-builders.ts`, and/or `src/lib/content-optimization-helpers.ts`, `src/lib/blog-template-builder.ts` |
| Extra image alt | `server/wordpress/media.js`, `src/lib/wordpress-api/media.ts`, `src/lib/content-generation/wordpress-uploader.ts` |
| Optional slug | `src/lib/content-generation/wordpress-uploader.ts`, `src/lib/wordpress-api/crud.ts` |

---

## When Rank Math priority applies

Use the above rules whenever **optimizeExtraText** or **optimizeExtraImage** is true in the flow that uses:

- `content-generation-upload.ts` (and any other entry point that runs “optimize + extra content”).

That means:

- Rank Math–aligned **title** (section 1) when title optimization runs in that flow.
- Stricter **meta** (section 2).
- **Focus Keyword in subheadings + density** in extra text (section 3).
- **Keyword at start of first paragraph** in main content (section 4).
- **Keyword-rich alt** for the extra image (section 5).

No new UI flag is required; the presence of extra content options is the trigger.
