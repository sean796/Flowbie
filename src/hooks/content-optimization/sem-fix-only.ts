/**
 * Minimal SEM "Fix it" flow: orchestrator only. Fetches post (done by caller), calls SEO_techspec, then sets/clears pending and progress.
 */

import { toast } from "sonner";
import { runSEO_techspec } from "@/lib/seo-techspec";
import { setOptimizingState, updateOptimizationProgress } from "./optimization-helpers";
import type { WordPressSite } from "@/components/integrations/types";
import type { PendingOptimization } from "./use-optimization-state";

export interface SEMTaskContext {
  suggestedAction: string;
  checklist: string[];
  promptModifier?: string;
  focusCategories?: string[];
}

export interface RunSEMFixOnlyParams {
  site: WordPressSite;
  url: string;
  existingPost: any;
  resolved: { id: number; subtype?: string; endpoint?: string; slug?: string; link?: string; url?: string };
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  semTaskContext: SEMTaskContext;
  acfFields: Record<string, any>;
  setOptimizationProgress: (prev: any) => void;
  setPendingOptimization: (prev: (prev: Record<string, PendingOptimization>) => Record<string, PendingOptimization>) => void;
  setIsOptimizingContent: (prev: any) => void;
}

export type SEMFixOnlyResult = { optimizationChanges: Record<string, unknown> } | void;

export async function runSEMFixOnly(params: RunSEMFixOnlyParams): Promise<SEMFixOnlyResult> {
  const {
    site,
    url,
    existingPost,
    resolved,
    existingTitle,
    existingContent,
    existingExcerpt,
    semTaskContext,
    acfFields,
    setOptimizationProgress,
    setPendingOptimization,
    setIsOptimizingContent,
  } = params;

  const checklist = semTaskContext.checklist ?? [];
  const suggestedAction = semTaskContext.suggestedAction ?? "";

  try {
    updateOptimizationProgress(setOptimizationProgress, site.id, "Applying SEM checklist...", 30, "Sending to AI...");

    const result = await runSEO_techspec({
      site,
      resolved,
      existingPost,
      existingTitle,
      existingContent,
      existingExcerpt,
      checklist,
      suggestedAction,
      acfFields,
    });

    if (!result.success) {
      toast.error(result.error);
      setOptimizingState(setIsOptimizingContent, site.id, false);
      setPendingOptimization((prev) => {
        const next = { ...prev };
        delete next[site.id];
        return next;
      });
      return undefined;
    }

    const optimizationChanges = {
      postUpdated: true,
      promptSent: result.promptSent,
      ...result.changes,
    };

    setPendingOptimization((prev) => {
      const existing = prev[site.id];
      return {
        ...prev,
        [site.id]: {
          ...(existing || ({} as PendingOptimization)),
          site,
          url,
          updateMode: "update" as const,
          gscResult: null,
          existingPost,
          resolved,
          existingTitle,
          existingContent,
          existingExcerpt,
          optimizationChanges,
        },
      };
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    updateOptimizationProgress(setOptimizationProgress, site.id, "Complete", 100, "SEM fix applied.");
    setOptimizingState(setIsOptimizingContent, site.id, false);
    return { optimizationChanges };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SEM fix failed.";
    console.error("[SEM Fix Only]", err);
    toast.error(message);
    setOptimizingState(setIsOptimizingContent, site.id, false);
    setPendingOptimization((prev) => {
      const next = { ...prev };
      delete next[site.id];
      return next;
    });
    return undefined;
  }
}
