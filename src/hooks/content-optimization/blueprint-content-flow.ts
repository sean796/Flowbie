import { toast } from "sonner";
import type { KeywordData } from "@/lib/keyword-types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { generateOptimizedBlueprint, generateAndUploadContent } from "@/lib/content-optimization-helpers";
import { updateOptimizationProgress } from "./optimization-helpers";

export async function generateBlueprintFlow(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: string[],
  selectedResearchLinks: string[],
  titleForBlueprint: string,
  primaryKeyword: string,
  keywordData: KeywordData,
  paaRawResponse: any,
  site: WordPressSite,
  fileManager: OptimizationFileManager,
  siteId: string,
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  url: string,
  existingPost: any,
  hasEntityOverride: boolean | undefined,
  testMode: boolean,
  setOptimizationProgress: (prev: any) => any
): Promise<{ blueprintResult: any; checklist: string[] }> {
  if (testMode) {
    toast.info('TEST MODE: Using mock blueprint...');
    const { createMockBlueprint } = await import('@/lib/content-optimization-helpers');
    const blueprintResult = createMockBlueprint(primaryKeyword, titleForBlueprint);
    const checklist = [
      `Introduction to ${primaryKeyword}`,
      `Benefits of ${primaryKeyword}`,
      `How to Choose the Right ${primaryKeyword} Provider`
    ];

    const blueprintFileName = OptimizationFileManager.generateFilename('blueprint', primaryKeyword, 'json');
    fileManager.addFile(blueprintFileName, JSON.stringify(blueprintResult, null, 2), 'application/json');

    const checklistFileName = OptimizationFileManager.generateFilename('checklist', primaryKeyword, 'txt');
    fileManager.addFile(checklistFileName, checklist.map((item, index) => `${index + 1}. ${item}`).join('\n'), 'text/plain');

    updateOptimizationProgress(setOptimizationProgress, siteId, 'TEST MODE: Using mock blueprint...', 75, 'Skipping blueprint generation');
    return { blueprintResult, checklist };
  }

  const blueprintResultData = await generateOptimizedBlueprint(
    selectedKeywords,
    selectedH2Sections,
    selectedPeopleAlsoAsk,
    selectedResearchLinks,
    titleForBlueprint,
    primaryKeyword,
    keywordData,
    paaRawResponse,
    site,
    fileManager,
    (progress) => setOptimizationProgress((prev: any) => ({ ...prev, [siteId]: progress })),
    wordPressPosts,
    url,
    existingPost,
    hasEntityOverride
  );

  return {
    blueprintResult: blueprintResultData.blueprintResult,
    checklist: blueprintResultData.checklist
  };
}

export async function generateAndUploadFlow(
  blueprintResult: any,
  existingTitle: string,
  primaryKeyword: string,
  site: WordPressSite,
  url: string,
  updateMode: 'update' | 'draft',
  existingPost: any,
  resolved: any,
  existingContent: string,
  existingExcerpt: string,
  selectedKeyword: any,
  clusterKeywords: string[] | undefined,
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  wordPressRAGContext: string,
  selectedPeopleAlsoAsk: any[],
  optimizationOptions: any,
  inContentImageRequest: any,
  acfFields: Record<string, any> | undefined,
  fileManager: OptimizationFileManager,
  siteId: string,
  setOptimizationProgress: (prev: any) => any,
  setBulkOptimizationState: (prev: any) => any
): Promise<{ excerpt: string | undefined; changes?: { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string } }> {
  const defaultOptimizationOptions = {
    optimizeTitle: true,
    optimizeMeta: true,
    optimizeExcerpt: true,
    optimizeContent: true,
    optimizeFeaturedImage: false,
    optimizeExtraText: false,
    optimizeExtraImage: false
  };
  const mergedOptimizationOptions = optimizationOptions
    ? { ...defaultOptimizationOptions, ...optimizationOptions }
    : defaultOptimizationOptions;

  const optimizationContext = {
    site,
    url,
    updateMode,
    existingPost,
    resolved,
    existingTitle,
    existingContent,
    existingExcerpt,
    primaryKeyword,
    selectedKeyword,
    clusterKeywords,
    wordPressPosts,
    wordPressRAGContext,
    optimizationOptions: mergedOptimizationOptions,
    inContentImageRequest: inContentImageRequest ? { imageType: inContentImageRequest.imageType as any, userPrompt: inContentImageRequest.userPrompt } : undefined,
    selectedPeopleAlsoAsk,
  };

  const { result, markdownContent, excerpt, changes } = await generateAndUploadContent(
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    optimizationContext,
    fileManager,
    (progress) => setOptimizationProgress((prev: any) => ({ ...prev, [siteId]: progress })),
    undefined,
    mergedOptimizationOptions,
    acfFields // Pass ACF fields to content generation
  );

  const batchKey = `${site.id}-batch`;
  if (excerpt) {
    setBulkOptimizationState((prev: any) => {
      const current = prev[batchKey];
      if (current && current.urls.includes(url)) {
        return {
          ...prev,
          [batchKey]: {
            ...current,
            urlExcerpts: {
              ...(current.urlExcerpts || {}),
              [url]: excerpt
            }
          }
        };
      }
      return prev;
    });
  }

  return { excerpt, changes };
}
