/**
 * Master Generate Content Card
 * All-or-none service area and blog generation for selected sites. No per-batch rows.
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Loader2, CheckCircle2, MinusCircle, AlertCircle, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCyberpunkCardClasses,
  getCyberpunkTextClasses,
  getCyberpunkButtonClasses,
  BREATHE_NEON_ANIMATION,
} from "./cyberpunk-theme";
import type { WordPressSite } from "../types";
import type { MasterGenerateContentState, RunHistoryEntry } from "@/hooks/content-optimization/use-optimization-state";
import type { ServiceAreaBatchSpec, BlogBatchSpec } from "@/hooks/content-optimization/master-generate-content-runner";

/** "all" | "none" | siteId for single site */
export type BatchScope = "all" | "none" | string;

function getEntitySitemapOptions(site: WordPressSite): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  if (site.entitySitemapUrl) {
    const label = site.entitySitemapUrl.split("/").pop() || "Entity Sitemap";
    options.push({ value: site.entitySitemapUrl, label });
  }
  if (site.sitemaps?.childSitemaps) {
    for (const url of site.sitemaps.childSitemaps) {
      const lower = url.toLowerCase();
      if (
        lower.includes("service-area") ||
        lower.includes("service_area") ||
        lower.includes("entity")
      ) {
        const label = url.split("/").pop()?.replace(/-sitemap\.xml/i, "") || url;
        if (!options.some((o) => o.value === url)) {
          options.push({ value: url, label });
        }
      }
    }
  }
  if (options.length === 0 && site.entitySitemapUrl) {
    options.push({
      value: site.entitySitemapUrl,
      label: site.entitySitemapUrl.split("/").pop() || "Entity",
    });
  }
  return options;
}

function getFirstEntitySitemapUrl(site: WordPressSite): string {
  const opts = getEntitySitemapOptions(site);
  return opts[0]?.value ?? site.entitySitemapUrl ?? "";
}

interface GscQuery {
  query: string;
  clicks?: number;
  impressions?: number;
}

interface MasterGenerateContentCardProps {
  sites: WordPressSite[];
  selectedSites: Set<string>;
  masterGenerateContentState: MasterGenerateContentState;
  gscQueriesForSelection?: Record<string, GscQuery[]>;
  onRunAll: (params: {
    serviceAreaBatches: ServiceAreaBatchSpec[];
    blogBatches: BlogBatchSpec[];
    defaultKeyword: string;
    getDefaultKeywordForSite?: (site: WordPressSite) => string;
    titleFormat: string;
    blogEntityMode?: "auto" | "blank";
    featuredImage: string;
    featuredImagePerBlog?: boolean;
    featuredImageType?: "ai-generated" | "google-maps";
    postToWordPress: boolean;
  }) => Promise<void>;
}

function deriveDefaultKeywordFromData(
  selectedSitesList: WordPressSite[],
  gscQueriesForSelection?: Record<string, GscQuery[]>
): string {
  if (!selectedSitesList.length) return "";
  for (const site of selectedSitesList) {
    const queries = gscQueriesForSelection?.[site.id];
    if (queries && queries.length > 0) {
      const sorted = [...queries].sort(
        (a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)
      );
      const top = sorted[0]?.query?.trim();
      if (top) return top;
    }
  }
  const first = selectedSitesList[0];
  if (!first?.name) return "";
  return first.name.trim().toLowerCase().replace(/\s+/g, " ");
}

export const MasterGenerateContentCard: React.FC<MasterGenerateContentCardProps> = ({
  sites,
  selectedSites,
  masterGenerateContentState,
  gscQueriesForSelection,
  onRunAll,
}) => {
  const [isActivated, setIsActivated] = useState(true);
  const [postToWordPress, setPostToWordPress] = useState(true);
  const [serviceAreaSelectedIds, setServiceAreaSelectedIds] = useState<Set<string>>(new Set());
  const [serviceAreaEntityCount, setServiceAreaEntityCount] = useState(5);
  const [serviceAreaModifier, setServiceAreaModifier] = useState("");
  const [blogSelectedIds, setBlogSelectedIds] = useState<Set<string>>(new Set());
  const [blogCount, setBlogCount] = useState(3);
  const [blogOptionalPrompt, setBlogOptionalPrompt] = useState("");
  const [blogEntityMode, setBlogEntityMode] = useState<"auto" | "blank">("blank");
  const [includeFeaturedImage, setIncludeFeaturedImage] = useState(true);
  const [featuredImageType, setFeaturedImageType] = useState<"ai-generated" | "google-maps">("ai-generated");

  const safeSelectedSites = selectedSites ?? new Set<string>();
  const selectedSitesList = sites.filter((s) => safeSelectedSites.has(s.id));
  const selectedSiteIdsKey = useMemo(
    () => selectedSitesList.map((s) => s.id).sort().join(","),
    [selectedSitesList]
  );

  const serviceAreaSites = selectedSitesList.filter((s) => serviceAreaSelectedIds.has(s.id));
  const blogSites = selectedSitesList.filter((s) => blogSelectedIds.has(s.id));

  useEffect(() => {
    const ids = new Set(selectedSitesList.map((s) => s.id));
    setServiceAreaSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of next) if (!ids.has(id)) next.delete(id);
      if (next.size === 0 && ids.size > 0) return ids;
      return next;
    });
    setBlogSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of next) if (!ids.has(id)) next.delete(id);
      return next;
    });
  }, [selectedSiteIdsKey]);

  const handleRunAll = useCallback(async () => {
    const serviceAreaBatches: ServiceAreaBatchSpec[] = serviceAreaSites
      .map((site) => {
        const sitemapUrl = getFirstEntitySitemapUrl(site);
        if (!sitemapUrl) return null;
        return {
          site,
          sitemapUrl,
          entityCount: serviceAreaEntityCount,
          promptModifier: serviceAreaModifier.trim() || undefined,
        };
      })
      .filter((b): b is ServiceAreaBatchSpec => b !== null);

    const blogBatches: BlogBatchSpec[] = blogSites.map((site) => ({
      site,
      blogCount,
      optionalPrompt: blogOptionalPrompt.trim() || undefined,
    }));

    if (serviceAreaBatches.length === 0 && blogBatches.length === 0) {
      toast.error("Choose a site (or All selected sites) for service area and/or blog.");
      return;
    }
    const defaultKeyword =
      serviceAreaBatches.length > 0
        ? deriveDefaultKeywordFromData(selectedSitesList, gscQueriesForSelection) ||
          serviceAreaSites[0]?.name?.toLowerCase().replace(/\s+/g, " ") ||
          "services"
        : "";
    const sitesWithoutSitemap = serviceAreaSites.filter((s) => !getFirstEntitySitemapUrl(s));
    if (sitesWithoutSitemap.length > 0) {
      toast.error(
        `Selected site(s) have no entity sitemap: ${sitesWithoutSitemap.map((s) => s.name).join(", ")}. Detect sitemaps or set entity sitemap URL.`
      );
      return;
    }

    await onRunAll({
      serviceAreaBatches,
      blogBatches,
      defaultKeyword: defaultKeyword.trim() || "services",
      getDefaultKeywordForSite: (site) =>
        deriveDefaultKeywordFromData([site], gscQueriesForSelection) ||
        site.name?.toLowerCase().replace(/\s+/g, " ") ||
        "services",
      titleFormat: "{entity} | {keyword}",
      blogEntityMode,
      featuredImage: includeFeaturedImage ? "y" : "n",
      featuredImagePerBlog: includeFeaturedImage,
      featuredImageType: includeFeaturedImage ? featuredImageType : undefined,
      postToWordPress,
    });
  }, [
    serviceAreaSites,
    blogSites,
    selectedSitesList,
    gscQueriesForSelection,
    serviceAreaEntityCount,
    serviceAreaModifier,
    blogCount,
    blogOptionalPrompt,
    blogEntityMode,
    includeFeaturedImage,
    featuredImageType,
    postToWordPress,
    onRunAll,
  ]);

  const totalBatches = serviceAreaSites.length + blogSites.length;
  const isRunning = masterGenerateContentState.isRunning;
  const canRun = totalBatches > 0 && !isRunning;

  // Item-level run results (one row per post/entity): completed, skipped, failed, in chronological order
  const resultRows = useMemo(() => {
    const history = masterGenerateContentState.runHistory ?? [];
    return history.filter(
      (e): e is RunHistoryEntry & { outcome: "ok" | "skip" | "fail" } =>
        e.outcome === "ok" || e.outcome === "skip" || e.outcome === "fail"
    );
  }, [masterGenerateContentState.runHistory]);

  const completedCount = resultRows.filter((e) => e.outcome === "ok").length;
  const skippedCount = resultRows.filter((e) => e.outcome === "skip").length;
  const failedCount = resultRows.filter((e) => e.outcome === "fail").length;

  const generateReport = useCallback((): string => {
    const lines: string[] = [
      "═══════════════════════════════════════════════════════════",
      "         MASTER GENERATE CONTENT — RUN REPORT               ",
      "═══════════════════════════════════════════════════════════",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "───────────────────────────────────────────────────────────",
      "                        SUMMARY                            ",
      "───────────────────────────────────────────────────────────",
      `Total:       ${resultRows.length}`,
      `Destroyed:   ${completedCount}`,
      `Escaped:     ${skippedCount}`,
      `Deflected:   ${failedCount}`,
      "",
    ];
    const completed = resultRows.filter((e) => e.outcome === "ok");
    const escaped = resultRows.filter((e) => e.outcome === "skip");
    const deflected = resultRows.filter((e) => e.outcome === "fail");
    if (completed.length > 0) {
      lines.push("───────────────────────────────────────────────────────────");
      lines.push("                   DESTROYED TARGETS                       ");
      lines.push("───────────────────────────────────────────────────────────");
      completed.forEach((e, i) => {
        lines.push(`${i + 1}. ${e.entityOrTitle ?? "—"}`);
        lines.push(`   Site:       ${e.site ?? "—"}`);
        if (e.postId != null) lines.push(`   Post ID:    ${e.postId}`);
        if (e.permalink) lines.push(`   Permalink:  ${e.permalink}`);
        if (e.acfUpdated?.length) lines.push(`   ACF:        ${e.acfUpdated.join(", ")}`);
        lines.push(`   Mode:       ${e.mode ?? "—"}`);
        lines.push("");
      });
    }
    if (escaped.length > 0) {
      lines.push("───────────────────────────────────────────────────────────");
      lines.push("              ESCAPED TARGETS (Skipped)                     ");
      lines.push("───────────────────────────────────────────────────────────");
      escaped.forEach((e, i) => {
        lines.push(`${i + 1}. ${e.entityOrTitle ?? "—"} (${e.site ?? "—"})`);
        lines.push(`   Reason: ${e.message || "Already exists"}`);
        lines.push("");
      });
    }
    if (deflected.length > 0) {
      lines.push("───────────────────────────────────────────────────────────");
      lines.push("                 DEFLECTED TARGETS (Errors)                ");
      lines.push("───────────────────────────────────────────────────────────");
      deflected.forEach((e, i) => {
        lines.push(`${i + 1}. ${e.entityOrTitle ?? "—"} (${e.site ?? "—"})`);
        lines.push(`   Error: ${e.error ?? e.message ?? "Processing failed"}`);
        lines.push("");
      });
    }
    lines.push("═══════════════════════════════════════════════════════════");
    lines.push("                    END OF REPORT                            ");
    lines.push("═══════════════════════════════════════════════════════════");
    return lines.join("\n");
  }, [resultRows, completedCount, skippedCount, failedCount]);

  const generateCSV = useCallback((): string => {
    const headers = ["Site", "Title/Entity", "Status", "Post ID", "Permalink", "ACF Updated", "Mode", "Error"];
    const rows = resultRows.map((e) => {
      const status = e.outcome === "ok" ? "HIT" : e.outcome === "skip" ? "ESCAPED" : "DEFLECTED";
      const cell = (v: string | number | undefined) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [
        e.site ?? "",
        e.entityOrTitle ?? "",
        status,
        e.postId ?? "",
        e.permalink ?? "",
        e.acfUpdated?.join("; ") ?? "",
        e.mode ?? "",
        e.error ?? "",
      ].map(cell).join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }, [resultRows]);

  const handleCopyReport = useCallback(() => {
    navigator.clipboard.writeText(generateReport());
    toast.success("Report copied to clipboard!");
  }, [generateReport]);

  const handleDownloadCSV = useCallback(() => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master-generate-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded!");
  }, [generateCSV]);

  if (sites.length === 0) return null;

  return (
    <div className="mb-2">
      <style>{BREATHE_NEON_ANIMATION}</style>
      <Card
        className={`p-3 ${getCyberpunkCardClasses(false, true)} transition-all duration-300`}
      >
        <Collapsible
          open={isActivated}
          onOpenChange={(open) => {
            if (open && !isActivated) setIsActivated(true);
          }}
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity">
              <FileText className="h-4 w-4 text-green-500" />
              <h3
                className={`text-base font-bold ${getCyberpunkTextClasses("primary")} uppercase tracking-wider`}
              >
                Master Generate Content
              </h3>
              {isActivated && totalBatches > 0 && (
                <span
                  className={`ml-2 text-xs ${getCyberpunkTextClasses("secondary")}`}
                >
                  ({totalBatches} batch{totalBatches !== 1 ? "es" : ""})
                </span>
              )}
            </div>
          </CollapsibleTrigger>

          {!isActivated && (
            <div className="mb-2">
              <Button
                size="default"
                onClick={() => setIsActivated(true)}
                className={`w-full ${getCyberpunkButtonClasses(true)}`}
              >
                <FileText className="h-4 w-4 mr-2" />
                <span className={getCyberpunkTextClasses("primary")}>
                  Activate Master Generate Content
                </span>
              </Button>
            </div>
          )}

          <CollapsibleContent>
            <p className={`text-xs mb-2 ${getCyberpunkTextClasses("muted")}`}>
              Uses the same sites as Master Optimization above.
              {selectedSitesList.length > 0 && (
                <span className={`ml-1.5 ${getCyberpunkTextClasses("secondary")}`}>
                  ({selectedSitesList.length} site{selectedSitesList.length !== 1 ? "s" : ""})
                </span>
              )}
            </p>

            {/* Service area: multi-select with checkboxes */}
            <div className="mb-2 pt-2 border-t border-green-500/20">
              <Label
                className={`text-xs font-semibold ${getCyberpunkTextClasses("primary")} uppercase tracking-wider block mb-1.5`}
              >
                Service area batches
              </Label>
              <p className={`text-xs mb-2 ${getCyberpunkTextClasses("muted")}`}>
                Select sites to include
              </p>
              {selectedSitesList.length > 0 ? (
                <div className="space-y-1.5 p-2 rounded border border-green-500/20 bg-green-500/5 mb-2 max-h-40 overflow-y-auto">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={
                        selectedSitesList.length > 0 &&
                        selectedSitesList.every((s) => serviceAreaSelectedIds.has(s.id))
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setServiceAreaSelectedIds(new Set(selectedSitesList.map((s) => s.id)));
                        } else {
                          setServiceAreaSelectedIds(new Set());
                        }
                      }}
                      disabled={isRunning}
                      className="border-green-400/60 data-[state=checked]:bg-green-500/30"
                    />
                    <span className={`text-xs ${getCyberpunkTextClasses("secondary")}`}>
                      Select all ({selectedSitesList.length})
                    </span>
                  </label>
                  {selectedSitesList.map((site) => (
                    <label key={site.id} className="flex items-center gap-2 cursor-pointer pl-4">
                      <Checkbox
                        checked={serviceAreaSelectedIds.has(site.id)}
                        onCheckedChange={(checked) => {
                          setServiceAreaSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(site.id);
                            else next.delete(site.id);
                            return next;
                          });
                        }}
                        disabled={isRunning}
                        className="border-green-400/60 data-[state=checked]:bg-green-500/30"
                      />
                      <span className={`text-xs ${getCyberpunkTextClasses("secondary")} truncate`}>
                        {site.name}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className={`text-xs mb-2 ${getCyberpunkTextClasses("muted")}`}>
                  Select sites in Master Optimization above first.
                </p>
              )}
              {serviceAreaSites.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-2 rounded border border-green-500/20 bg-green-500/5">
                  <div>
                    <Label className="text-xs text-green-300/80 sr-only">Count</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={serviceAreaEntityCount}
                      onChange={(e) =>
                        setServiceAreaEntityCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-14 h-8 text-xs bg-black/50 border-green-500/30"
                    />
                  </div>
                  <Input
                    value={serviceAreaModifier}
                    onChange={(e) => setServiceAreaModifier(e.target.value)}
                    placeholder="Modifier"
                    className="flex-1 min-w-[80px] h-8 text-xs bg-black/50 border-green-500/30"
                  />
                </div>
              )}
            </div>

            {/* Blog: multi-select with checkboxes */}
            <div className="mb-2 pt-2 border-t border-green-500/20">
              <Label
                className={`text-xs font-semibold ${getCyberpunkTextClasses("primary")} uppercase tracking-wider block mb-1.5`}
              >
                Blog batches
              </Label>
              <p className={`text-xs mb-2 ${getCyberpunkTextClasses("muted")}`}>
                Select sites to include
              </p>
              {selectedSitesList.length > 0 ? (
                <div className="space-y-1.5 p-2 rounded border border-green-500/20 bg-green-500/5 mb-2 max-h-40 overflow-y-auto">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={
                        selectedSitesList.length > 0 &&
                        selectedSitesList.every((s) => blogSelectedIds.has(s.id))
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setBlogSelectedIds(new Set(selectedSitesList.map((s) => s.id)));
                        } else {
                          setBlogSelectedIds(new Set());
                        }
                      }}
                      disabled={isRunning}
                      className="border-green-400/60 data-[state=checked]:bg-green-500/30"
                    />
                    <span className={`text-xs ${getCyberpunkTextClasses("secondary")}`}>
                      Select all ({selectedSitesList.length})
                    </span>
                  </label>
                  {selectedSitesList.map((site) => (
                    <label key={site.id} className="flex items-center gap-2 cursor-pointer pl-4">
                      <Checkbox
                        checked={blogSelectedIds.has(site.id)}
                        onCheckedChange={(checked) => {
                          setBlogSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(site.id);
                            else next.delete(site.id);
                            return next;
                          });
                        }}
                        disabled={isRunning}
                        className="border-green-400/60 data-[state=checked]:bg-green-500/30"
                      />
                      <span className={`text-xs ${getCyberpunkTextClasses("secondary")} truncate`}>
                        {site.name}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className={`text-xs mb-2 ${getCyberpunkTextClasses("muted")}`}>
                  Select sites in Master Optimization above first.
                </p>
              )}
              {blogSites.length > 0 && (
                <div className="space-y-2 p-2 rounded border border-green-500/20 bg-green-500/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <Label className="text-xs text-green-300/80 sr-only">Count</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={blogCount}
                        onChange={(e) =>
                          setBlogCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-14 h-8 text-xs bg-black/50 border-green-500/30"
                      />
                    </div>
                    <Input
                      value={blogOptionalPrompt}
                      onChange={(e) => setBlogOptionalPrompt(e.target.value)}
                      placeholder="Optional prompt"
                      className="flex-1 min-w-[100px] h-8 text-xs bg-black/50 border-green-500/30"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-green-300/80">Entity for blog ideas</Label>
                    <Select
                      value={blogEntityMode}
                      onValueChange={(v) => setBlogEntityMode(v as "auto" | "blank")}
                      disabled={isRunning}
                    >
                      <SelectTrigger className="mt-0.5 h-8 bg-black/50 border-green-500/30 text-green-300 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blank">None</SelectItem>
                        <SelectItem value="auto">Auto (extract from context)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Include featured image */}
            <div className="mb-2 pt-2 border-t border-green-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="master-gen-featured-image"
                  checked={includeFeaturedImage}
                  onCheckedChange={setIncludeFeaturedImage}
                  disabled={isRunning}
                />
                <Label
                  htmlFor="master-gen-featured-image"
                  className={`text-xs ${getCyberpunkTextClasses("primary")}`}
                >
                  Include featured image
                </Label>
              </div>
              {includeFeaturedImage && (
                <div className="flex items-center gap-2 pl-1">
                  <Label className={`text-xs ${getCyberpunkTextClasses("secondary")}`}>Source:</Label>
                  <Select
                    value={featuredImageType}
                    onValueChange={(v) => setFeaturedImageType(v as "ai-generated" | "google-maps")}
                    disabled={isRunning}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs border-green-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai-generated">AI-generated</SelectItem>
                      <SelectItem value="google-maps">Google image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Post to WordPress */}
            <div className="mb-2 pt-2 border-t border-green-500/20 flex items-center gap-2">
              <Switch
                id="master-gen-post-wp"
                checked={postToWordPress}
                onCheckedChange={setPostToWordPress}
                disabled={isRunning}
              />
              <Label
                htmlFor="master-gen-post-wp"
                className={`text-xs ${getCyberpunkTextClasses("primary")}`}
              >
                Post to WordPress when done
              </Label>
            </div>

            {/* Which posts → which sitemaps (when Post to WP on) */}
            {postToWordPress && totalBatches > 0 && (
              <div
                className={`mb-2 p-2 rounded border border-green-500/20 bg-black/30 text-xs ${getCyberpunkTextClasses("secondary")}`}
              >
                <div className="font-semibold mb-1.5 uppercase tracking-wider text-green-400/90">
                  Posts → Sitemaps
                </div>
                <ul className="space-y-1 list-none">
                  {serviceAreaSites.map((site) => {
                    const sitemapUrl = getFirstEntitySitemapUrl(site);
                    const label = getEntitySitemapOptions(site)[0]?.label ?? "entity sitemap";
                    return (
                      <li key={`sa-${site.id}`}>
                        <span className="text-green-300/90">{site.name}</span>
                        {" → "}
                        <span className="text-green-400/80">{label}</span>
                        <span className="opacity-80"> ({serviceAreaEntityCount} entities)</span>
                      </li>
                    );
                  })}
                  {blogSites.map((site) => (
                    <li key={`blog-${site.id}`}>
                      <span className="text-green-300/90">{site.name}</span>
                      {" → "}
                      <span className="opacity-80">{blogCount} blog post{blogCount !== 1 ? "s" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Progress */}
            {masterGenerateContentState.currentMessage && (
              <div
                className={`mb-2 p-2 rounded border border-green-500/30 bg-green-500/10 text-xs ${getCyberpunkTextClasses("secondary")}`}
              >
                {masterGenerateContentState.isRunning && (
                  <Loader2 className="h-3 w-3 inline animate-spin mr-2" />
                )}
                {masterGenerateContentState.currentMessage}
                {masterGenerateContentState.totalBatches > 0 && (
                  <span className="ml-2 opacity-80">
                    (Batch {masterGenerateContentState.currentBatch}/
                    {masterGenerateContentState.totalBatches} —{" "}
                    {masterGenerateContentState.completedBatches} batch
                    {masterGenerateContentState.completedBatches !== 1 ? "es" : ""} done
                    {masterGenerateContentState.totalEntitiesInBatch > 0
                      ? `, ${masterGenerateContentState.completedEntitiesInBatch}/${masterGenerateContentState.totalEntitiesInBatch} entities`
                      : ""}
                    {masterGenerateContentState.failedBatches > 0
                      ? `, ${masterGenerateContentState.failedBatches} failed`
                      : ""}
                    )
                  </span>
                )}
              </div>
            )}

            {/* Exclusion list (ACF origin) — shown as soon as loaded, kept for the run */}
            {masterGenerateContentState.exclusionListEntities.length > 0 && (()=>{
              const arr=masterGenerateContentState.exclusionListEntities;
              const publishedCount=arr.filter((x)=>typeof x==='object'&&x&&!(x as {entity:string;isFuture?:boolean}).isFuture).length;
              const futureCount=arr.filter((x)=>typeof x==='object'&&x&&(x as {entity:string;isFuture?:boolean}).isFuture).length;
              const labelSuffix = futureCount > 0 && publishedCount > 0
                ? ` (${publishedCount} published, ${futureCount} scheduled)`
                : futureCount > 0
                  ? ` (${futureCount} scheduled)`
                  : '';
              // #region agent log
              const first=arr[0]; const itemHasIsFuture=typeof first==='object'&&first!==null&&'isFuture' in (first as object);
              fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MasterGenerateContentCard.tsx:exclusionList render',message:'UI exclusion entities',data:{count:arr.length,itemHasIsFuture,futureCount},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H4'})}).catch(()=>{});
              // #endregion
              return(
              <div className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 p-2">
                <Label className={`text-xs font-semibold ${getCyberpunkTextClasses("primary")} uppercase tracking-wider block mb-1`}>
                  Excluding ({arr.length} existing ACF origin{arr.length !== 1 ? "s" : ""}){labelSuffix}
                </Label>
                <div className="flex flex-wrap gap-1.5 text-xs font-mono max-h-32 overflow-y-auto">
                  {arr.map((item, i) => {
                    const entityStr=typeof item==='string'?item:(item as {entity:string}).entity;
                    const isFuture=typeof item==='object'&&item!==null&&(item as {entity:string;isFuture?:boolean}).isFuture;
                    return (
                    <span
                      key={`excl-${i}-${entityStr}`}
                      className={`inline-block px-2 py-0.5 rounded ${
                        isFuture
                          ? "bg-blue-500/20 border border-blue-500/30 text-blue-200/90"
                          : "bg-amber-500/20 border border-amber-500/30 text-amber-200/90"
                      }`}
                    >
                      {entityStr}
                    </span>
                    );
                  })}
                </div>
              </div>
            );})()}

            {/* Run results — Death-Star-style table of done blog posts / entities and meta */}
            {resultRows.length > 0 && (
              <div className="mb-2">
                <Label className={`text-xs font-semibold ${getCyberpunkTextClasses("primary")} uppercase tracking-wider block mb-1`}>
                  Run results
                </Label>
                <div className="mt-1 rounded border border-green-500/20 bg-black/40 max-h-48 overflow-y-auto">
                  {/* Table Header */}
                  <div className="grid grid-cols-[40px_1fr_minmax(200px,auto)_80px] gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/30 text-[10px] font-mono uppercase tracking-wider text-green-400/80 sticky top-0 z-10">
                    <div>Status</div>
                    <div>Target</div>
                    <div>Site</div>
                    <div className="text-right">Progress</div>
                  </div>
                  {/* Table Body */}
                  <div className="divide-y divide-green-500/10">
                    {resultRows.map((e, idx) => {
                      const isCompleted = e.outcome === "ok";
                      const isSkipped = e.outcome === "skip";
                      const isError = e.outcome === "fail";
                      const statusLabel = isCompleted ? "HIT" : isSkipped ? "ESCAPED" : "DEFLECTED";
                      const rowKey = `run-result-${idx}-${e.ts}-${e.entityOrTitle ?? ""}-${e.site ?? ""}-${e.postId ?? ""}`;
                      return (
                        <div key={rowKey}>
                          <div
                            className={cn(
                              "grid grid-cols-[40px_1fr_minmax(200px,auto)_80px] gap-2 px-3 py-2 items-center font-mono text-xs transition-all",
                              isCompleted && "bg-green-500/5",
                              isSkipped && "bg-yellow-500/5",
                              isError && "bg-red-500/5"
                            )}
                          >
                            <div className="flex justify-center">
                              {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                              {isSkipped && <MinusCircle className="h-4 w-4 text-yellow-400" />}
                              {isError && <AlertCircle className="h-4 w-4 text-red-400" />}
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className={cn(
                                  "truncate flex-1",
                                  isCompleted && "text-green-400/80",
                                  isSkipped && "text-yellow-400/80",
                                  isError && "text-red-400/80"
                                )}
                                title={e.entityOrTitle ?? undefined}
                              >
                                {e.entityOrTitle ?? "—"}
                              </span>
                              {e.permalink && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/20 shrink-0 opacity-70 hover:opacity-100"
                                  onClick={() => {
                                    navigator.clipboard.writeText(e.permalink!);
                                    toast.success("Permalink copied!");
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            <div
                              className={cn(
                                "text-[10px] truncate",
                                isCompleted && "text-green-400/70",
                                isSkipped && "text-yellow-400/70",
                                isError && "text-red-400/70"
                              )}
                            >
                              {e.site ?? "—"}
                            </div>
                            <div
                              className={cn(
                                "text-right text-[10px] uppercase font-semibold",
                                isCompleted && "text-green-400",
                                isSkipped && "text-yellow-400",
                                isError && "text-red-400"
                              )}
                            >
                              {statusLabel}
                            </div>
                          </div>
                          {/* Expandable meta panel — completed */}
                          {isCompleted && (
                            <div className="px-3 py-2 bg-green-500/5 border-t border-green-500/10">
                              <div className="text-[10px] font-mono text-green-500/60 uppercase mb-1">
                                Created with:
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
                                <div>
                                  <span className="text-green-500/60">Title/Entity: </span>
                                  <span className="text-green-300 font-semibold">{e.entityOrTitle ?? "—"}</span>
                                </div>
                                <div>
                                  <span className="text-green-500/60">Site: </span>
                                  <span className="text-green-300 font-semibold">{e.site ?? "—"}</span>
                                </div>
                                {e.postId != null && (
                                  <div>
                                    <span className="text-green-500/60">Post ID: </span>
                                    <span className="text-green-300 font-semibold">{e.postId}</span>
                                  </div>
                                )}
                                {e.permalink && (
                                  <div>
                                    <span className="text-green-500/60">Permalink: </span>
                                    <span className="text-green-300/70 truncate block" title={e.permalink}>
                                      {e.permalink}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-green-500/60">ACF updated: </span>
                                  <span className="text-green-300/70">
                                    {e.acfUpdated?.length ? e.acfUpdated.join(", ") : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-green-500/60">Mode: </span>
                                  <span className="text-green-300/70">{e.mode ?? "—"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Expandable panel — skipped */}
                          {isSkipped && (
                            <div className="px-3 py-2 bg-yellow-500/5 border-t border-yellow-500/10">
                              <div className="text-[10px] font-mono text-yellow-400 uppercase font-semibold mb-1">
                                Target escaped
                              </div>
                              <div className="text-[10px] font-mono text-yellow-400/70">
                                {e.message || "Entity already on site"}
                              </div>
                            </div>
                          )}
                          {/* Expandable panel — failed */}
                          {isError && (
                            <div className="px-3 py-2 bg-red-500/5 border-t border-red-500/10">
                              <div className="text-[10px] font-mono text-red-400 uppercase font-semibold mb-1">
                                Target deflected
                              </div>
                              <div className="text-[10px] font-mono text-red-400/70">
                                {e.error ?? e.message ?? "Processing failed"}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`text-xs ${getCyberpunkTextClasses("secondary")} h-7 border border-green-500/50 bg-transparent hover:bg-green-500/20`}
                    onClick={handleCopyReport}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Copy Report
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`text-xs ${getCyberpunkTextClasses("secondary")} h-7 border border-green-500/50 bg-transparent hover:bg-green-500/20`}
                    onClick={handleDownloadCSV}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Export CSV
                  </Button>
                </div>
              </div>
            )}

            {/* Run all */}
            <div className="pt-2 border-t border-green-500/20">
              <Button
                size="default"
                onClick={handleRunAll}
                disabled={!canRun}
                className={`w-full ${getCyberpunkButtonClasses(canRun)}`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span className={getCyberpunkTextClasses("primary")}>
                      Running…
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    <span className={getCyberpunkTextClasses("primary")}>
                      Run all ({totalBatches} batch
                      {totalBatches !== 1 ? "es" : ""})
                    </span>
                  </>
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};
