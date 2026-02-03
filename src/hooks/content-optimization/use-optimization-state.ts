import { useState } from "react";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";

export interface PendingOptimization {
  site: WordPressSite;
  url: string;
  updateMode: 'update' | 'draft';
  gscResult: any;
  existingPost: any;
  resolved: any;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean; optimizeFeaturedImage?: boolean; hasEntity?: boolean };
  inContentImageRequest?: { imageType: string; userPrompt?: string };
  cleanedTitle?: string; // Cleaned title (without placeholders/locations when entity is N/A)
  extractedEntity?: string | 'N/A'; // Extracted entity or 'N/A' if no entity
  acfFields?: Record<string, any>; // ACF fields from WordPress post (including seo_prompt_modifier, keyword_focus, etc.)
  focusCategories?: string[]; // Focus categories for selective optimization (SEM task list)
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }; // Full SEM task context
  optimizationChanges?: {
    titleChanged?: boolean;
    metaChanged?: boolean;
    contentChanged?: boolean;
    title?: string;
    meta?: string;
    postUpdated?: boolean;
    promptSent?: { system: string; user: string };
  }; // Track what was actually changed (postUpdated + promptSent from SEO_techspec)
}

export interface BulkOptimizationState {
  urls: string[];
  currentIndex: number;
  urlStatuses: Record<string, 'pending' | 'optimizing' | 'completed' | 'skipped' | 'error'>;
  currentStep: string;
  currentUrl?: string;
  currentProgress?: number; // Current post's progress percentage (0-100)
  currentStepProgress?: { step: string; progress: number; message?: string }; // Detailed step tracking
  urlKeywords?: Record<string, string>; // Map URL to primary keyword used for optimization
  urlEntities?: Record<string, string | 'N/A'>; // Map URL to entity (or 'N/A' if no entity)
  urlTitles?: Record<string, string>; // Map URL to post title
  urlExcerpts?: Record<string, string>; // Map URL to generated excerpt/meta description
}

export interface MasterOptimizationSiteState {
  siteId: string;
  siteName: string;
  totalPosts: number;
  currentPost: number;
  currentUrl: string;
  status: 'pending' | 'optimizing' | 'completed' | 'error';
  progress: number;
  completedPosts: number;
  skippedPosts: number;
  errorPosts: number;
}

export interface MasterOptimizationState {
  isRunning: boolean;
  sites: Record<string, MasterOptimizationSiteState>;
}

export interface RunHistoryEntry {
  ts: number;
  batchIndex?: number;
  batchLabel?: string;
  entityOrTitle?: string;
  site?: string;
  step: string;
  message: string;
  outcome?: 'ok' | 'skip' | 'fail';
  postId?: number;
  permalink?: string;
  acfUpdated?: string[];
  error?: string;
  mode?: 'entity' | 'post';
}

export interface MasterGenerateContentState {
  isRunning: boolean;
  currentBatch: number;
  totalBatches: number;
  currentMessage: string;
  completedBatches: number;
  failedBatches: number;
  /** Entities in current batch (service area only). 0 when not in an entity batch. */
  totalEntitiesInBatch: number;
  /** Entities completed so far in current batch. */
  completedEntitiesInBatch: number;
  /** ACF origin values we exclude (shown in UI as soon as loaded; kept for the run). Future = blue tags. */
  exclusionListEntities: Array<{ entity: string; isFuture?: boolean }>;
  runHistory: RunHistoryEntry[];
}

/**
 * Hook for managing optimization state
 * Extracted from use-content-optimization.ts for better organization
 */
export function useOptimizationState() {
  const [isOptimizingContent, setIsOptimizingContent] = useState<Record<string, boolean>>({});
  const [optimizationProgress, setOptimizationProgress] = useState<Record<string, { step: string; progress: number; message?: string }>>({});
  const [optimizationFileManagers, setOptimizationFileManagers] = useState<Record<string, OptimizationFileManager>>({});
  const [pendingOptimization, setPendingOptimization] = useState<Record<string, PendingOptimization>>({});
  const [bulkOptimizationState, setBulkOptimizationState] = useState<Record<string, BulkOptimizationState>>({});
  const [masterOptimizationState, setMasterOptimizationState] = useState<MasterOptimizationState>({
    isRunning: false,
    sites: {}
  });
  const [masterGenerateContentState, setMasterGenerateContentState] = useState<MasterGenerateContentState>({
    isRunning: false,
    currentBatch: 0,
    totalBatches: 0,
    currentMessage: '',
    completedBatches: 0,
    failedBatches: 0,
    totalEntitiesInBatch: 0,
    completedEntitiesInBatch: 0,
    exclusionListEntities: [],
    runHistory: [],
  });

  return {
    isOptimizingContent,
    setIsOptimizingContent,
    optimizationProgress,
    setOptimizationProgress,
    optimizationFileManagers,
    setOptimizationFileManagers,
    pendingOptimization,
    setPendingOptimization,
    bulkOptimizationState,
    setBulkOptimizationState,
    masterOptimizationState,
    setMasterOptimizationState,
    masterGenerateContentState,
    setMasterGenerateContentState,
  };
}