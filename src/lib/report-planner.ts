/**
 * Agentic Report Planner
 * AI-driven report section planning based on available data
 */

import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";
import type { ReportDiscoveryData } from "./report-discovery";

export const AGENCY_NAME = "Neo Digital Inc";

export type ReportFocus =
  | "local-seo"
  | "content-growth"
  | "brand-visibility"
  | "mixed";

export interface ReportPlanSection {
  id: string;
  title: string;
  priority: number;
  rationale: string;
  dataSource: "gsc" | "entity" | "wordpress" | "combined";
  includeEntitySitemapSection: boolean;
}

export interface ReportPlan {
  focus: ReportFocus;
  sections: ReportPlanSection[];
  insightsToHighlight: string[];
  keywordFocus: string[];
}

/**
 * Use AI to plan report sections based on discovery data.
 * Decides what a business owner would want to see.
 */
export async function planReport(
  discoveryData: ReportDiscoveryData,
  apiKey: string,
  model: string = getResearchModel()
): Promise<ReportPlan> {
  const wp = discoveryData.wordPressContext;
  const stats = discoveryData.stats;
  const hasEntityData =
    discoveryData.entityPagesData &&
    discoveryData.entityPagesData.pages?.length > 0;
  const hasEntitySitemap = !!wp.entitySitemapUrl && wp.entitySitemapCount > 0;
  const hasHistorical = !!discoveryData.historicalData?.dateRange?.monthsOfData;
  const hasNAP = !!wp.napInfo?.name || wp.locationsCount > 0;

  const systemPrompt = `You are a senior strategist at ${AGENCY_NAME} preparing an SEO performance report for a business owner. Your job is to decide what sections to include in the report based on the available data.

AUDIENCE: Non-technical business executives who want to see RESULTS, GROWTH, and ACTIONABLE INSIGHTS.

AVAILABLE DATA:
- Site: ${wp.siteName} (${wp.siteUrl})
- WordPress: ${wp.postsCount} posts, ${wp.pagesCount} pages
- Entity sitemap: ${hasEntitySitemap ? `Yes, ${wp.entitySitemapCount} URLs` : "No"}
- Entity pages in GSC: ${hasEntityData ? discoveryData.entityPagesData!.pages.length : 0}
- NAP/Locations: ${hasNAP ? `Yes (${wp.locationsCount} locations)` : "No"}
- Historical data: ${hasHistorical ? `${discoveryData.historicalData!.dateRange.monthsOfData} months` : "No"}
- GSC stats: ${stats.currentPeriod.impressions.toLocaleString()} impressions, ${stats.currentPeriod.pagesCount} pages ranking, ${stats.currentPeriod.searchTermsCount} search terms
${discoveryData.entityCoverage ? `- Service Area Pages (SAP) indexation: ${discoveryData.entityCoverage.indexedPercent}% of SAP in GSC (${discoveryData.entityCoverage.totalInGSC}/${discoveryData.entityCoverage.totalInSitemap})` : ""}

CRITICAL RULES:
1. ALWAYS include "Key Points for the Team" (key-points-for-team) - quick-scan bullets for ops/tech, placed early in the report.
2. NEVER include a "Next Steps" section. Use "Looking Ahead" (outlook) for forward-looking content only.
3. When entity sitemap exists (${hasEntitySitemap}), ALWAYS include a dedicated "Service Area Pages (SAP) & Local SEO" section - this is non-negotiable for local SEO focus.
4. Prioritize sections based on data richness - don't emphasize sections with sparse data.
5. Focus on what a business owner cares about: growth, new opportunities, local visibility, content performance.
6. When NAP/locations/entity sitemap exist, emphasize LOCAL SEO throughout.
7. Include 6-12 sections total, ordered by priority (1 = highest).
8. insightsToHighlight: 3-5 key insights the AI should emphasize in the report (business-impact focused).
9. keywordFocus: 2-4 keyword buckets to emphasize (e.g., "local service terms", "brand terms", "product category").

Return ONLY valid JSON:
{
  "focus": "local-seo" | "content-growth" | "brand-visibility" | "mixed",
  "sections": [
    {
      "id": "executive-summary",
      "title": "Executive Summary",
      "priority": 1,
      "rationale": "Brief explanation",
      "dataSource": "gsc",
      "includeEntitySitemapSection": false
    },
    {
      "id": "entity-sitemap-local-seo",
      "title": "Service Area Pages (SAP) & Local SEO",
      "priority": 2,
      "rationale": "Dedicated local SEO section for Service Area Pages (SAP)",
      "dataSource": "entity",
      "includeEntitySitemapSection": true
    }
  ],
  "insightsToHighlight": ["insight 1", "insight 2", "insight 3"],
  "keywordFocus": ["local service terms", "brand visibility"]
}

Section IDs to use: executive-summary, key-points-for-team, growth-highlights, new-search-terms, top-performers, local-presence, entity-sitemap-local-seo, content-reach, historical-context, seasonal-factors, outlook, infographic.
Only include sections that make sense given the data. The entity-sitemap-local-seo section MUST be included when entity sitemap exists.`;

  const userPrompt = `Plan the report for ${wp.siteName}. Available:
- Entity sitemap: ${hasEntitySitemap ? `${wp.entitySitemapCount} URLs` : "none"}
- Entity GSC data: ${hasEntityData ? "yes" : "no"}
- Local/NAP data: ${hasNAP ? "yes" : "no"}
- Historical: ${hasHistorical ? "yes" : "no"}
- Top keywords sample: ${stats.topKeywords.slice(0, 5).map((k) => k.query).join(", ")}
${discoveryData.entityCoverage && discoveryData.entityCoverage.notInGSC.length > 0 ? `- Indexation gap: ${discoveryData.entityCoverage.notInGSC.length} Service Area Pages (SAP) not yet in GSC` : ""}

Generate the ReportPlan JSON.`;

  try {
    let fullResponse = "";
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 3000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    let cleaned = fullResponse.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleaned) as ReportPlan;

    // Ensure entity sitemap section is included when entity sitemap exists
    if (hasEntitySitemap) {
      const hasEntitySection = parsed.sections.some(
        (s) => s.id === "entity-sitemap-local-seo" || s.includeEntitySitemapSection
      );
      if (!hasEntitySection) {
        parsed.sections.push({
      id: "entity-sitemap-local-seo",
      title: "Service Area Pages (SAP) & Local SEO",
          priority: 2,
          rationale: "Dedicated section for Service Area Pages (SAP) performance - critical for local SEO",
          dataSource: "entity",
          includeEntitySitemapSection: true,
        });
        parsed.sections.sort((a, b) => a.priority - b.priority);
      }
    }

    return parsed;
  } catch (error) {
    console.error("[Report Planner] AI planning failed, using fallback:", error);
    return getFallbackPlan(discoveryData);
  }
}

function getFallbackPlan(discoveryData: ReportDiscoveryData): ReportPlan {
  const hasEntitySitemap =
    !!discoveryData.wordPressContext.entitySitemapUrl &&
    discoveryData.wordPressContext.entitySitemapCount > 0;

  const sections: ReportPlanSection[] = [
    { id: "executive-summary", title: "Executive Summary", priority: 1, rationale: "Lead with headline and key wins", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "key-points-for-team", title: "Key Points for the Team", priority: 2, rationale: "Quick-scan bullets for ops/tech, not stat-heavy", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "growth-highlights", title: "Growth at a Glance", priority: 3, rationale: "Core metrics", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "new-search-terms", title: "New Customer Discovery", priority: 4, rationale: "New search terms", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "top-performers", title: "Top Performing Terms", priority: 5, rationale: "Best keywords", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "local-presence", title: "Local Market Visibility", priority: 6, rationale: "Local search", dataSource: "gsc", includeEntitySitemapSection: false },
  ];

  if (hasEntitySitemap) {
    sections.push({
          id: "entity-sitemap-local-seo",
          title: "Service Area Pages (SAP) & Local SEO",
          priority: 7,
      rationale: "Entity/location page performance",
      dataSource: "entity",
      includeEntitySitemapSection: true,
    });
  }

  sections.push(
    { id: "content-reach", title: "Content Performance", priority: 8, rationale: "Pages ranking", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "historical-context", title: "Growth Journey", priority: 9, rationale: "Long-term trends", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "outlook", title: "Looking Ahead", priority: 10, rationale: "Forward-looking", dataSource: "gsc", includeEntitySitemapSection: false },
    { id: "infographic", title: "Performance Infographic", priority: 11, rationale: "Visual summary", dataSource: "gsc", includeEntitySitemapSection: false }
  );

  return {
    focus: hasEntitySitemap ? "local-seo" : "mixed",
    sections: sections.sort((a, b) => a.priority - b.priority),
    insightsToHighlight: [
      "Search visibility growth",
      "New keyword discovery",
      "Content expansion",
    ],
    keywordFocus: ["service terms", "local visibility", "brand terms"],
  };
}
