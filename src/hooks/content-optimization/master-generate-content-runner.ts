/**
 * Master Generate Content Runner
 * Runs entity orchestrator → build rows → full content pipeline + post to WordPress per batch.
 * Used by Master Generate Content card to run multiple service area and blog batches.
 */

import { toast } from "sonner";
import { generateEntities } from "@/lib/entity";
import type { WordPressSite } from "@/components/integrations/types";
import type { GenerationOptions } from "@/components/integrations/entity-generation/types";
import { replaceTemplateVariables } from "@/components/integrations/entity-generation/csv/csvGenerator";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  generateBlueprintAndContent,
  type BulkProcessingOptions,
  type WordPressPostingOptions,
} from "@/lib/bulk-auto-generate";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import { getKeywordOverview } from "@/lib/keyword-api";
import { fetchPeopleAlsoAsk } from "@/lib/keyword-api";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  calculateScheduledDate,
  getNextAvailableStartDate,
} from "@/lib/wordpress-scheduler";
import type { KeywordData } from "@/lib/keyword-types";
import type { KeywordAIAnalysis } from "@/lib/keyword-types";
import type { MasterGenerateContentState, RunHistoryEntry } from "./use-optimization-state";

export interface ServiceAreaBatchSpec {
  site: WordPressSite;
  sitemapUrl: string;
  entityCount: number;
  promptModifier?: string;
}

export interface BlogBatchSpec {
  site: WordPressSite;
  blogCount: number;
  optionalPrompt?: string;
}

export interface MasterGenerateContentRunnerOptions {
  serviceAreaBatches: ServiceAreaBatchSpec[];
  blogBatches: BlogBatchSpec[];
  defaultKeyword: string;
  /** When set, each service-area batch uses this site's keyword instead of the global default (avoids wrong-site keyword e.g. "shades" for EJH). */
  getDefaultKeywordForSite?: (site: WordPressSite) => string;
  titleFormat: string;
  blogEntityMode?: "auto" | "blank";
  featuredImage?: string;
  featuredImagePerBlog?: boolean;
  featuredImageType?: "ai-generated" | "google-maps";
  postToWordPress: boolean;
  setProgress: (state: Partial<MasterGenerateContentState> & { appendRunHistory?: RunHistoryEntry }) => void;
}

/**
 * Run a single service area batch: orchestrator → build rows → content + post per row.
 */
export async function runServiceAreaBatch(
  spec: ServiceAreaBatchSpec,
  options: {
    defaultKeyword: string;
    titleFormat: string;
    featuredImage: string;
    featuredImageType?: "ai-generated" | "google-maps";
    postToWordPress: boolean;
    setProgress: (state: Partial<MasterGenerateContentState> & { appendRunHistory?: RunHistoryEntry }) => void;
  }
): Promise<{ completed: number; failed: number }> {
  const { site, sitemapUrl, entityCount, promptModifier } = spec;
  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required. Please set it in Settings.");
  }

  // FIRST: Scrape entire posts sitemap and store for RAG for this connected site (before entity generation)
  type PostMeta = { id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string };
  let wordPressPosts: PostMeta[] = [];
  let siteSummary: string | undefined;
  let sitePostsRagText = ""; // RAG store: full posts sitemap content for content generation
  if (site.username && site.appPassword) {
    const { getPublishedPosts, parseSitemap, detectSitemaps } = await import("@/lib/wordpress-api");
    const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
    options.setProgress({ currentMessage: `Scraping ${site.name} entire posts sitemap (WordPress API) for RAG...` });
    let sitemapUrls: string[] = [];
    const postSitemapUrl = site.sitemaps?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u)) ?? null;
    if (postSitemapUrl) {
      const parsed = await parseSitemap(site.siteUrl, postSitemapUrl, site.username, site.appPassword).catch(() => null);
      if (parsed?.urls?.length) {
        sitemapUrls = parsed.urls;
        options.setProgress({ currentMessage: `Posts sitemap: ${sitemapUrls.length} URL(s). Fetching all via API...` });
      }
    }
    if (!sitemapUrls.length && site.sitemaps?.mainSitemapUrl) {
      const indexParsed = await parseSitemap(site.siteUrl, site.sitemaps.mainSitemapUrl, site.username, site.appPassword).catch(() => null);
      const child = indexParsed?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u));
      if (child) {
        const parsed = await parseSitemap(site.siteUrl, child, site.username, site.appPassword).catch(() => null);
        if (parsed?.urls?.length) sitemapUrls = parsed.urls;
      }
    }
    if (!sitemapUrls.length) {
      const detected = await detectSitemaps(site.siteUrl, site.username, site.appPassword).catch(() => null);
      const mainUrl = (detected as { sitemapUrl?: string })?.sitemapUrl;
      if (mainUrl) {
        const indexParsed = await parseSitemap(site.siteUrl, mainUrl, site.username, site.appPassword).catch(() => null);
        const child = indexParsed?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u));
        if (child) {
          const parsed = await parseSitemap(site.siteUrl, child, site.username, site.appPassword).catch(() => null);
          if (parsed?.urls?.length) sitemapUrls = parsed.urls;
        }
      }
    }
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const res = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, pageSize, offset).catch(() => ({ posts: [] }));
      if (!res.posts?.length) break;
      wordPressPosts = wordPressPosts.concat(res.posts as PostMeta[]);
      options.setProgress({ currentMessage: `Fetching ${site.name} posts sitemap... ${wordPressPosts.length} from API` });
      hasMore = res.posts.length >= pageSize;
      offset += pageSize;
    }
    // Only use posts that came from the WordPress API. Never invent links from sitemap URLs that aren't in the API.
    if (sitemapUrls.length > 0) {
      const linkToPost = new Map(wordPressPosts.map((p) => [norm(p.link), p]));
      const matched = sitemapUrls.map((url) => linkToPost.get(norm(url))).filter((p): p is PostMeta => p != null);
      wordPressPosts = matched.length > 0 ? matched : wordPressPosts;
    }
    // Keep post.link exactly as returned by WordPress API — do not normalize or convert to pathname.
    // Scrape full post content via API and store for RAG (not just entity/excerpt field)
    if (wordPressPosts.length > 0) {
      const { getWordPressPostContent } = await import("@/lib/wordpress-api");
      const postIds = wordPressPosts.map((p) => p.id).filter((id) => id > 0);
      const postSlugs = wordPressPosts.filter((p) => p.id <= 0).map((p) => p.slug).filter(Boolean);
      const CHUNK = 50;
      const fullPosts: Array<{ id: number; slug: string; title: string; content: string; excerpt: string; link: string }> = [];
      for (let i = 0; i < postIds.length; i += CHUNK) {
        const chunkIds = postIds.slice(i, i + CHUNK);
        options.setProgress({ currentMessage: `Scraping full post content... ${Math.min(i + CHUNK, postIds.length)}/${postIds.length}` });
        const contentResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          chunkIds,
          undefined
        ).catch(() => ({ posts: [] }));
        if (contentResult?.posts?.length) {
          fullPosts.push(...contentResult.posts.map((p: { id: number; slug: string; title: string; content: string; excerpt: string; link: string }) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            content: p.content ?? "",
            excerpt: p.excerpt ?? "",
            link: p.link ?? "",
          })));
        }
      }
      if (postSlugs.length > 0) {
        options.setProgress({ currentMessage: `Scraping full post content by slug... ${postSlugs.length} posts` });
        const slugResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          undefined,
          postSlugs
        ).catch(() => ({ posts: [] }));
        if (slugResult?.posts?.length) {
          fullPosts.push(...slugResult.posts.map((p: { id: number; slug: string; title: string; content: string; excerpt: string; link: string }) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            content: p.content ?? "",
            excerpt: p.excerpt ?? "",
            link: p.link ?? "",
          })));
        }
      }
      const stripHtml = (html: string) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const MAX_CONTENT_PER_POST = 3500; // chars per post for RAG to avoid token overflow
      sitePostsRagText = [
        `=== SITE POSTS RAG (${site.name}) - Full scraped post content. Use as source of truth for topics, tone, and internal links ===`,
        ...fullPosts.map((p, i) => {
          const raw = stripHtml(p.content);
          const content = raw.slice(0, MAX_CONTENT_PER_POST) + (raw.length > MAX_CONTENT_PER_POST ? "…" : "");
          return `[${i + 1}] Title: ${p.title} | Link: ${p.link}\nContent: ${content}`;
        }),
        "=== END SITE POSTS RAG ===",
      ].join("\n\n");
      options.setProgress({ currentMessage: `Summarizing ${site.name} (${wordPressPosts.length} posts) with AI...` });
      const { streamChatCompletion } = await import("@/lib/api");
      const titlesAndExcerpts = wordPressPosts.slice(0, 80).map((p) => `Title: ${p.title}${p.excerpt ? ` | Excerpt: ${String(p.excerpt).replace(/<[^>]+>/g, "").slice(0, 120)}` : ""}`).join("\n");
      try {
        const readRes = await streamChatCompletion({
          apiKey,
          model: getResearchModel(),
          messages: [
            { role: "system", content: "Reply with JSON only: {\"summary\": \"2-4 sentence summary of what this site covers (topics, audience, tone). Use for aligning service-area content.\"}. No other text." },
            { role: "user", content: `Site: ${site.name}. Existing posts (titles and excerpts):\n${titlesAndExcerpts}\n\nSummarize what this site is about so service-area pages can match its style and topics.` },
          ],
          temperature: 0.3,
          maxTokens: 500,
          topP: 0.9,
          onContentChunk: () => {},
        });
        const raw = (readRes?.content ?? "").trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { summary?: string };
          if (parsed.summary && typeof parsed.summary === "string") siteSummary = parsed.summary.trim();
        }
      } catch {
        // leave siteSummary undefined
      }
    }
  }

  // AI-derived "near me" keyword from actual post content (not site name) for DataForSEO (SERP/PAA)
  let effectiveKeyword = options.defaultKeyword;
  try {
    const { deriveEntitySearchKeywordFromSiteContent } = await import("@/lib/entity");
    options.setProgress({ currentMessage: `Deriving search keyword from post content (AI)...` });
    const contentContext = [
      siteSummary ? `Site summary: ${siteSummary}` : "",
      sitePostsRagText || "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const derived = await deriveEntitySearchKeywordFromSiteContent(
      site.name,
      contentContext,
      apiKey
    );
    if (derived?.trim()) effectiveKeyword = derived.trim();
  } catch {
    // keep options.defaultKeyword on failure
  }

  // Pass only the user's modifier to the orchestrator. No modifier = Wikipedia category pages only (no Google search).
  const entityPromptModifier = promptModifier?.trim() || undefined;

  // Load exclusion list (ACF origin only) and show in UI immediately so user can verify we're excluding the right entities.
  if (sitemapUrl?.trim()) {
    try {
      options.setProgress({ currentMessage: `Loading exclusion list (ACF origin) for ${site.name}...` });
      const { fetchFullAcfContextForServiceAreas, getOriginListWithStatusFromAcfContext } = await import("@/lib/entity/read-existing-origins-api");
      const acfContext = await fetchFullAcfContextForServiceAreas(site, sitemapUrl, (msg) =>
        options.setProgress({ currentMessage: msg })
      );
      const exclusionList = acfContext.length > 0 ? getOriginListWithStatusFromAcfContext(acfContext) : [];
      // #region agent log
      const first = exclusionList[0]; const hasIsFuture = exclusionList.length>0&&typeof first==='object'&&first!==null&&'isFuture' in (first as object);
      fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'master-generate-content-runner.ts',message:'exclusionList structure',data:{length:exclusionList.length,isStringArray:Array.isArray(exclusionList)&&(exclusionList.length===0||typeof exclusionList[0]==='string'),sample:exclusionList.slice(0,2),hasIsFuture,futureCount:exclusionList.filter((x: { entity: string; isFuture?: boolean }) => x.isFuture).length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2,H3'})}).catch(()=>{});
      // #endregion
      options.setProgress({
        exclusionListEntities: exclusionList,
        currentMessage: exclusionList.length > 0
          ? `Excluding ${exclusionList.length} existing origin(s). Running entity orchestrator...`
          : `No ACF origins found. Running entity orchestrator for ${site.name}...`,
      });
    } catch (err) {
      console.warn("[Master Generate Content] Could not load exclusion list (ACF), continuing with empty list:", err);
      options.setProgress({ exclusionListEntities: [], currentMessage: `Running entity orchestrator for ${site.name}...` });
    }
  }

  options.setProgress({ currentMessage: `Running entity orchestrator for ${site.name}...` });
  let result;
  try {
    result = await generateEntities(
      {
        site,
        sitemapUrl,
        count: entityCount,
        promptModifier: entityPromptModifier,
      } as GenerationOptions,
      (msg) => options.setProgress({ currentMessage: msg })
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Master Generate Content] Entity generation failed for ${site.name}:`, err);
    toast.error(`Entity generation failed for ${site.name}: ${errorMsg}`);
    throw new Error(`Entity generation failed: ${errorMsg}`);
  }

  const entities = result.entities || [];
  let titleFormatForRows = result.suggestedTitleFormat || options.titleFormat;

  options.setProgress({
    appendRunHistory: {
      ts: Date.now(),
      batchIndex: 0,
      batchLabel: "Service area",
      site: site.name,
      step: "batch",
      message: `Entity generation returned ${entities.length} entities${entities.length ? `: ${entities.slice(0, 5).map((e) => (typeof e === "string" ? e : (e as { entity: string }).entity)).join(", ")}${entities.length > 5 ? "…" : ""}` : ""}`,
      mode: "entity",
    },
  });

  // Entity titles only (from entity URL / entity sitemap post type) — not blog posts. Name new entities from this pattern only.
  const { getEntityPostTitles, deriveTitleFormatFromExistingTitles } = await import("@/lib/entity");
  let entityTitles: string[] = [];
  try {
    entityTitles = await getEntityPostTitles(site, sitemapUrl, (msg) =>
      options.setProgress({ currentMessage: msg })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const step = "getEntityPostTitles";
    console.error(`[Master Generate Content] ${step} failed for ${site.name}:`, err);
    throw new Error(`${step} failed for ${site.name}: ${msg}`);
  }
  if (entityTitles.length > 0) {
    options.setProgress({ currentMessage: `Deriving title format from entity titles (AI)...` });
    try {
      const derived = await deriveTitleFormatFromExistingTitles(entityTitles, apiKey);
      if (derived?.trim() && derived.includes("{entity}")) {
        titleFormatForRows = derived.trim();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const step = "deriveTitleFormatFromExistingTitles";
      console.error(`[Master Generate Content] ${step} failed for ${site.name}:`, err);
      throw new Error(`${step} failed for ${site.name}: ${msg}`);
    }
  }
  if (entities.length === 0) {
    const errorMsg = `No entities generated for ${site.name} (${sitemapUrl}). This could be because:
- No Wikipedia sources were found matching your existing entities
- All potential entities already exist in the sitemap
- The prompt modifier filtered out all candidates
- Wikipedia API returned no results`;
    console.error(`[Master Generate Content] ${errorMsg}`);
    toast.error(`No entities generated for ${site.name}. Check console for details.`);
    throw new Error(`No entities generated for ${site.name}. ${errorMsg}`);
  }

  const rows: CSVRow[] = entities.map((e) => {
    const entityName = typeof e === "string" ? e : (e as { entity: string }).entity;
    const title = replaceTemplateVariables(
      titleFormatForRows,
      entityName,
      effectiveKeyword
    );
    const useGoogleImage = options.featuredImageType === "google-maps";
    return {
      keyword: effectiveKeyword,
      entity: entityName,
      title,
      modifier: promptModifier?.trim() || undefined,
      featuredImage: options.featuredImage === "y" ? (useGoogleImage ? "google-maps" : "y") : "n",
    };
  });

  const startDate = getNextAvailableStartDate("09:00");
  const wordPressPosting: WordPressPostingOptions | undefined = options.postToWordPress
    ? {
        enabled: true,
        site,
        sitemapType: "entity",
        frequency: "daily",
        startDate,
        startTime: "09:00",
        totalRows: rows.length,
        sites: [{ site, sitemapType: "entity" }],
      }
    : undefined;

  const bulkOptions: BulkProcessingOptions = {
    apiKey: "",
    openRouterApiKey: apiKey,
    selectedModel: getResearchModel(),
    flowPurpose: "Master Generate Content",
    featuredImageType: options.featuredImageType ?? "ai-generated",
    wordPressPosting,
    siteSummary,
    onProgress: (_rowIndex, _totalRows, status) =>
      options.setProgress({ currentMessage: status }),
    onAppendHistory: (entry) => options.setProgress({ appendRunHistory: entry }),
  };

  const fileManager = new BulkFileManager();
  let completed = 0;
  let failed = 0;

  options.setProgress({
    totalEntitiesInBatch: rows.length,
    completedEntitiesInBatch: 0,
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    options.setProgress({
      currentMessage: `Processing entity ${rowIndex + 1}/${rows.length}: ${row.entity}...`,
      completedEntitiesInBatch: completed + failed,
    });

    try {
      const keyword = row.keyword?.trim() || effectiveKeyword;
      console.log(`[Master Generate Content] Entity "${row.entity}": getKeywordOverview...`);
      const keywordDataList = await getKeywordOverview(
        [keyword],
        "United States",
        "en",
        true
      );
      const keywordData: KeywordData =
        keywordDataList?.[0] || ({
          keyword,
          searchVolume: 0,
          difficulty: 0,
          cpc: 0,
          competition: "LOW",
          intent: "informational",
          relatedKeywords: [],
          serpFeatures: [],
        } as KeywordData);

      console.log(`[Master Generate Content] Entity "${row.entity}": fetchPeopleAlsoAsk...`);
      const paaResult = await fetchPeopleAlsoAsk(keyword, "United States", "en", 10);
      const paaRawResponse = paaResult?.rawResponse ?? null;

      console.log(`[Master Generate Content] Entity "${row.entity}": analyzeKeywordWithAI...`);
      const aiAnalysis: KeywordAIAnalysis = await analyzeKeywordWithAI(
        keywordData,
        undefined,
        {
          apiKey,
          model: getResearchModel(),
          entity: row.entity,
          connectedSite: { name: site.name, siteUrl: site.siteUrl },
          siteUrl: site.siteUrl,
          companyName: site.name,
        }
      );

      const keywordsWithVolumeData = keywordDataList && keywordDataList.length > 0
        ? keywordDataList
        : [keywordData];

      console.log(`[Master Generate Content] Entity "${row.entity}": generateBlueprintAndContent...`);
      await generateBlueprintAndContent(
        rowIndex,
        row,
        keywordData,
        aiAnalysis,
        keywordsWithVolumeData,
        paaRawResponse,
        bulkOptions,
        fileManager,
        [], // knowledgeFiles
        sitePostsRagText, // activeKnowledgeBaseText: RAG from entire posts sitemap for this site
        { name: site.name, siteUrl: site.siteUrl },
        wordPressPosts.length > 0 ? wordPressPosts : undefined
      );
      completed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[Master Generate Content] Entity row failed: ${row.entity}`, err);
      toast.error(`Entity "${row.entity}" failed: ${msg}`);
      try {
        options.setProgress({
          appendRunHistory: {
            ts: Date.now(),
            batchIndex: 0,
            batchLabel: "Service area",
            site: site.name,
            step: "error",
            message: `Entity "${row.entity}" failed: ${msg}${stack ? ` | Stack: ${stack.slice(0, 300)}…` : ""}`,
            mode: "entity",
          },
        });
      } catch (progressErr) {
        console.error(`[Master Generate Content] setProgress(appendRunHistory) threw:`, progressErr);
      }
    }
  }

  options.setProgress({ totalEntitiesInBatch: 0, completedEntitiesInBatch: 0 });
  return { completed, failed };
}

/**
 * Run all service area batches, then all blog batches. Updates progress via setProgress.
 */
export async function runMasterGenerateContent(
  options: MasterGenerateContentRunnerOptions
): Promise<void> {
  const {
    serviceAreaBatches,
    blogBatches,
    defaultKeyword,
    titleFormat,
    featuredImage = "y",
    postToWordPress,
    setProgress,
  } = options;

  const totalBatches = serviceAreaBatches.length + blogBatches.length;
  if (totalBatches === 0) {
    toast.error("No batches to run. Add service area or blog batches.");
    return;
  }

  setProgress({
    isRunning: true,
    totalBatches,
    currentBatch: 0,
    currentMessage: "Starting batch processing...",
    completedBatches: 0,
    failedBatches: 0,
    totalEntitiesInBatch: 0,
    completedEntitiesInBatch: 0,
    exclusionListEntities: [],
    runHistory: [],
  });
  
  console.log(`[Master Generate Content] Starting ${totalBatches} batch(es):`, {
    serviceAreaBatches: serviceAreaBatches.length,
    blogBatches: blogBatches.length,
  });

  let completedBatches = 0;
  let failedBatches = 0;

  for (let i = 0; i < serviceAreaBatches.length; i++) {
    const saSpec = serviceAreaBatches[i];
    setProgress({
      currentBatch: i + 1,
      currentMessage: `Service area batch ${i + 1}/${serviceAreaBatches.length}...`,
      appendRunHistory: {
        ts: Date.now(),
        batchIndex: i + 1,
        batchLabel: "Service area",
        site: saSpec.site.name,
        step: "batch",
        message: `Service area batch ${i + 1}/${serviceAreaBatches.length}: ${saSpec.site.name}, ${saSpec.entityCount} entities`,
        mode: "entity",
      },
    });
    try {
      const result = await runServiceAreaBatch(serviceAreaBatches[i], {
        defaultKeyword: options.getDefaultKeywordForSite?.(saSpec.site) ?? defaultKeyword,
        titleFormat,
        featuredImage,
        featuredImageType: options.featuredImageType,
        postToWordPress,
        setProgress,
      });
      completedBatches++;
      if (result.failed > 0) {
        toast.warning(`Batch ${i + 1}: ${result.completed} created, ${result.failed} failed.`);
      } else if (result.completed === 0 && result.failed === 0) {
        toast.warning(`Batch ${i + 1}: No entities were processed. Check entity generation.`);
      }
    } catch (err) {
      failedBatches++;
      const msg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(`[Master Generate Content] Service area batch ${i + 1} failed:`, {
        error: err,
        message: msg,
        stack: errorStack,
        site: saSpec.site.name,
        sitemapUrl: saSpec.sitemapUrl,
        entityCount: saSpec.entityCount,
      });
      toast.error(`Service area batch ${i + 1} failed: ${msg}`);
      const stackSnippet = errorStack ? ` | Stack: ${errorStack.slice(0, 400)}…` : "";
      setProgress({
        currentMessage: `Batch ${i + 1} failed: ${msg}`,
        appendRunHistory: {
          ts: Date.now(),
          batchIndex: i + 1,
          batchLabel: "Service area",
          site: saSpec.site.name,
          step: "error",
          message: `Batch failed: ${msg}${stackSnippet}`,
          mode: "entity",
        },
      });
    }
    setProgress({ completedBatches, failedBatches });
  }

  for (let i = 0; i < blogBatches.length; i++) {
    const blogSpec = blogBatches[i];
    setProgress({
      currentBatch: serviceAreaBatches.length + i + 1,
      currentMessage: `Blog batch ${i + 1}/${blogBatches.length}...`,
      appendRunHistory: {
        ts: Date.now(),
        batchIndex: serviceAreaBatches.length + i + 1,
        batchLabel: "Blog",
        site: blogSpec.site.name,
        step: "batch",
        message: `Blog batch ${i + 1}/${blogBatches.length}: ${blogSpec.site.name}, ${blogSpec.blogCount} posts`,
        mode: "post",
      },
    });
    try {
      await runBlogBatch(blogBatches[i], {
        postToWordPress,
        blogEntityMode: options.blogEntityMode,
        featuredImagePerBlog: options.featuredImagePerBlog,
        featuredImageType: options.featuredImageType,
        setProgress,
      });
      completedBatches++;
    } catch (err) {
      failedBatches++;
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Blog batch ${i + 1} failed: ${msg}`);
    }
    setProgress({ completedBatches, failedBatches });
  }

  setProgress({
    isRunning: false,
    currentMessage: `Done. ${completedBatches} batch(es) completed, ${failedBatches} failed.`,
  });
  if (failedBatches === 0) {
    toast.success(`Master Generate Content complete! ${completedBatches} batch(es) finished.`);
  } else {
    toast.warning(`Master Generate Content finished with ${failedBatches} failed batch(es).`);
  }
}

/**
 * Run a single blog batch: generate checklist → content → post (when postToWordPress).
 * Extracted logic from PostPagePackGenerator / usePromptBulkGenerate.
 */
export async function runBlogBatch(
  spec: BlogBatchSpec,
  options: {
    postToWordPress: boolean;
    blogEntityMode?: "auto" | "blank";
    featuredImagePerBlog?: boolean;
    featuredImageType?: "ai-generated" | "google-maps";
    setProgress: (state: Partial<MasterGenerateContentState> & { appendRunHistory?: RunHistoryEntry }) => void;
  }
): Promise<void> {
  const { site, blogCount, optionalPrompt } = spec;

  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required. Please set it in Settings.");
  }

  const { getPublishedPosts, parseSitemap, detectSitemaps } = await import("@/lib/wordpress-api");
  type PostMeta = { id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string };
  let wordPressPosts: PostMeta[] = [];
  let blogPostsRagText = "";
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();

  if (site.username && site.appPassword) {
    options.setProgress({ currentMessage: `Researching ${site.name} post sitemap...` });
    let sitemapUrls: string[] = [];
    const postSitemapUrl = site.sitemaps?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u)) ?? null;
    if (postSitemapUrl) {
      const parsed = await parseSitemap(site.siteUrl, postSitemapUrl, site.username, site.appPassword).catch(() => null);
      if (parsed?.urls?.length) {
        sitemapUrls = parsed.urls;
        options.setProgress({ currentMessage: `Researching post sitemap... ${sitemapUrls.length} URL(s). Fetching titles...` });
      }
    }
    if (!sitemapUrls.length && site.sitemaps?.mainSitemapUrl) {
      const indexParsed = await parseSitemap(site.siteUrl, site.sitemaps.mainSitemapUrl, site.username, site.appPassword).catch(() => null);
      const child = indexParsed?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u));
      if (child) {
        const parsed = await parseSitemap(site.siteUrl, child, site.username, site.appPassword).catch(() => null);
        if (parsed?.urls?.length) sitemapUrls = parsed.urls;
      }
    }
    if (!sitemapUrls.length) {
      const detected = await detectSitemaps(site.siteUrl, site.username, site.appPassword).catch(() => null);
      const mainUrl = (detected as { sitemapUrl?: string })?.sitemapUrl;
      if (mainUrl) {
        const indexParsed = await parseSitemap(site.siteUrl, mainUrl, site.username, site.appPassword).catch(() => null);
        const child = indexParsed?.childSitemaps?.find((u) => /post.*sitemap|sitemap.*post/i.test(u));
        if (child) {
          const parsed = await parseSitemap(site.siteUrl, child, site.username, site.appPassword).catch(() => null);
          if (parsed?.urls?.length) sitemapUrls = parsed.urls;
        }
      }
    }
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const res = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, pageSize, offset).catch(() => ({ posts: [] }));
      if (!res.posts?.length) break;
      wordPressPosts = wordPressPosts.concat(res.posts as PostMeta[]);
      options.setProgress({ currentMessage: `Researching ${site.name}... ${wordPressPosts.length} title(s) from API` });
      hasMore = res.posts.length >= pageSize;
      offset += pageSize;
    }
    // Only use posts that came from the WordPress API. Never invent links from sitemap URLs that aren't in the API.
    if (sitemapUrls.length > 0) {
      const linkToPost = new Map(wordPressPosts.map((p) => [norm(p.link), p]));
      const matched = sitemapUrls.map((url) => linkToPost.get(norm(url))).filter((p): p is PostMeta => p != null);
      wordPressPosts = matched.length > 0 ? matched : wordPressPosts;
    }
    // Keep post.link exactly as returned by WordPress API — do not normalize or convert.

    // Scrape full post content via API and store for RAG (not just titles/excerpt)
    if (wordPressPosts.length > 0) {
      const { getWordPressPostContent } = await import("@/lib/wordpress-api");
      const postIds = wordPressPosts.map((p) => p.id).filter((id) => id > 0);
      const postSlugs = wordPressPosts.filter((p) => p.id <= 0).map((p) => p.slug).filter(Boolean);
      const CHUNK = 50;
      const fullPosts: Array<{ id: number; slug: string; title: string; content: string; excerpt: string; link: string }> = [];
      for (let i = 0; i < postIds.length; i += CHUNK) {
        const chunkIds = postIds.slice(i, i + CHUNK);
        options.setProgress({ currentMessage: `Scraping full post content (${site.name})... ${Math.min(i + CHUNK, postIds.length)}/${postIds.length}` });
        const contentResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          chunkIds,
          undefined
        ).catch(() => ({ posts: [] }));
        if (contentResult?.posts?.length) {
          fullPosts.push(
            ...contentResult.posts.map((p: { id: number; slug: string; title: string; content: string; excerpt: string; link: string }) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              content: p.content ?? "",
              excerpt: p.excerpt ?? "",
              link: p.link ?? "",
            }))
          );
        }
      }
      if (postSlugs.length > 0) {
        options.setProgress({ currentMessage: `Scraping full post content by slug (${site.name})... ${postSlugs.length} posts` });
        const slugResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          undefined,
          postSlugs
        ).catch(() => ({ posts: [] }));
        if (slugResult?.posts?.length) {
          fullPosts.push(
            ...slugResult.posts.map((p: { id: number; slug: string; title: string; content: string; excerpt: string; link: string }) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              content: p.content ?? "",
              excerpt: p.excerpt ?? "",
              link: p.link ?? "",
            }))
          );
        }
      }
      const stripHtml = (html: string) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const MAX_CONTENT_PER_POST = 3500;
      blogPostsRagText = [
        `=== SITE POSTS RAG (${site.name}) - Full scraped post content. Use as source of truth for topics, tone, and cannibalization ===`,
        ...fullPosts.map((p, i) => {
          const raw = stripHtml(p.content);
          const content = raw.slice(0, MAX_CONTENT_PER_POST) + (raw.length > MAX_CONTENT_PER_POST ? "…" : "");
          return `[${i + 1}] Title: ${p.title} | Link: ${p.link}\nContent: ${content}`;
        }),
        "=== END SITE POSTS RAG ===",
      ].join("\n\n");
    }
  }

  let aiThemesToAvoid: string[] = [];
  if (wordPressPosts.length > 0) {
    options.setProgress({ currentMessage: `AI reading post content (${site.name}) for themes to avoid...` });
    const { streamChatCompletion } = await import("@/lib/api");
    // Use full scraped content for themes-to-avoid when available, not just titles
    const themesInput =
      blogPostsRagText.length > 0
        ? `Existing posts - full content (truncated per post). Identify themes/topics already covered:\n\n${blogPostsRagText.slice(0, 80000)}`
        : `Existing post titles (${wordPressPosts.length}):\n${wordPressPosts.map((p, i) => `${i + 1}. ${p.title}`).join("\n")}`;
    const readRes = await streamChatCompletion({
      apiKey,
      model: getResearchModel(),
      messages: [
        {
          role: "system",
          content:
            "Reply with JSON only: {\"themesToAvoid\": [\"theme1\", \"theme2\", ...], \"summary\": \"one sentence\"}. Do not suggest new ideas. Identify themes/topics already covered by this content so new blog ideas must avoid them.",
        },
        { role: "user", content: themesInput },
      ],
      temperature: 0.3,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: () => {},
    });
    const raw = (readRes?.content ?? "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { themesToAvoid?: string[] };
        aiThemesToAvoid = Array.isArray(parsed.themesToAvoid) ? parsed.themesToAvoid : [];
      } catch {
        // ignore
      }
    }
  }

  const { buildBulkBlogIdeasUserPrompt, buildBulkBlogIdeasSystemPrompt } = await import("@/lib/prompt-builders");
  const { streamChatCompletion } = await import("@/lib/api");
  const { parseBlogIdeasChecklist } = await import("@/lib/bulk-auto-generate");
  const optionalPromptTrimmed = optionalPrompt?.trim() || "";
  const userRequestText = optionalPromptTrimmed || "Generate blog ideas relevant to the target site.";
  const featuredImagePerBlog = options.featuredImagePerBlog ?? true;
  const entityMode = options.blogEntityMode ?? "blank";

  const systemPrompt = buildBulkBlogIdeasSystemPrompt(
    "Master Generate Content (blogs)",
    blogPostsRagText || "",
    blogCount,
    entityMode,
    "",
    "per-blog",
    "",
    optionalPromptTrimmed,
    "",
    featuredImagePerBlog,
    { name: site.name, siteUrl: site.siteUrl },
    wordPressPosts.length > 0 ? wordPressPosts : undefined,
    undefined,
    undefined,
    undefined,
    aiThemesToAvoid.length > 0 ? aiThemesToAvoid : undefined
  );
  const userPrompt = buildBulkBlogIdeasUserPrompt(
    userRequestText,
    blogCount,
    optionalPromptTrimmed,
    wordPressPosts.length > 0 ? wordPressPosts : undefined
  );

  options.setProgress({ currentMessage: "Generating blog ideas with AI..." });
  const result = await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.9,
    onContentChunk: () => {},
  });
  const checklistContent = result?.content || "";
  const rows = parseBlogIdeasChecklist(checklistContent);

  if (!rows || rows.length === 0) {
    toast.warning(`No blog ideas generated for ${site.name}. Skipping batch.`);
    return;
  }

  const { generateBlueprintAndContent: genContent } = await import("@/lib/bulk-auto-generate");
  const { getKeywordOverview, fetchPeopleAlsoAsk } = await import("@/lib/keyword-api");
  const { analyzeKeywordWithAI } = await import("@/lib/keyword-ai-analyzer");
  const startDate = getNextAvailableStartDate("09:00");
  const wordPressPosting: WordPressPostingOptions | undefined = options.postToWordPress
    ? {
        enabled: true,
        site,
        sitemapType: "post",
        frequency: "daily",
        startDate,
        startTime: "09:00",
        totalRows: rows.length,
        sites: [{ site, sitemapType: "post" }],
      }
    : undefined;

  const bulkOptions: BulkProcessingOptions = {
    apiKey: "",
    openRouterApiKey: apiKey,
    selectedModel: getResearchModel(),
    flowPurpose: "Master Generate Content (blogs)",
    ...(options.featuredImagePerBlog !== false && {
      featuredImageType: options.featuredImageType ?? "ai-generated",
    }),
    wordPressPosting,
    onProgress: (_, __, status) => options.setProgress({ currentMessage: status }),
    onAppendHistory: (entry) => options.setProgress({ appendRunHistory: entry }),
  };
  const fileManager = new BulkFileManager();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let row = rows[rowIndex];
    if (options.featuredImagePerBlog === false && row) {
      row = { ...row, featuredImage: "n" as const };
    }
    options.setProgress({
      currentMessage: `Blog ${rowIndex + 1}/${rows.length}: ${row.title || row.keyword}...`,
    });
    const keyword = row.keyword?.trim() || row.title || "blog topic";
    let keywordDataList: KeywordData[] = [];
    try {
      keywordDataList = await getKeywordOverview([keyword], "United States", "en", true);
    } catch {
      // use minimal
    }
    const keywordData: KeywordData =
      keywordDataList?.[0] ||
      ({
        keyword,
        searchVolume: 0,
        difficulty: 0,
        cpc: 0,
        competition: "LOW",
        intent: "informational",
        relatedKeywords: [],
        serpFeatures: [],
      } as KeywordData);
    const paaResult = await fetchPeopleAlsoAsk(keyword, "United States", "en", 10);
    const aiAnalysis = await analyzeKeywordWithAI(keywordData, undefined, {
      apiKey,
      model: getResearchModel(),
      connectedSite: { name: site.name, siteUrl: site.siteUrl },
      siteUrl: site.siteUrl,
      companyName: site.name,
    });
    const keywordsWithVolumeData = keywordDataList?.length ? keywordDataList : [keywordData];

    try {
      await genContent(
        rowIndex,
        row,
        keywordData,
        aiAnalysis,
        keywordsWithVolumeData,
        paaResult?.rawResponse ?? null,
        bulkOptions,
        fileManager,
        [],
        "",
        { name: site.name, siteUrl: site.siteUrl },
        wordPressPosts.length ? wordPressPosts : undefined
      );
    } catch (err) {
      console.error(`[Master Generate Content] Blog row failed:`, row, err);
      toast.error(`Blog "${row.title || row.keyword}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
