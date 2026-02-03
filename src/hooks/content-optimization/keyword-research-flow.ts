import { toast } from "sonner";
import type { KeywordAIAnalysis, KeywordData } from "@/lib/keyword-types";
import { type WordPressSite } from "@/components/integrations/types";
import {
  performKeywordResearch,
  findRelatedGSCKeywords,
  performAIAnalysis,
  getAutoSelectHelpers,
} from "@/lib/content-optimization-helpers";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";

export async function performKeywordResearchFlow(
  primaryKeyword: string,
  selectedKeyword: any,
  gscResult: any,
  clusterKeywords: string[] | undefined,
  site: WordPressSite,
  siteId: string,
  testMode: boolean,
  setOptimizationProgress: (prev: any) => any
): Promise<{
  keywordData: KeywordData;
  aiAnalysis: KeywordAIAnalysis;
  paaResult: any;
  paaRawResponse: any;
  relatedKeywords: string[];
}> {
  if (testMode) {
    toast.info('TEST MODE: Using mock keyword data and AI analysis...');
    const { createMockKeywordData, createMockAIAnalysis } = await import('@/lib/content-optimization-helpers');
    return {
      keywordData: createMockKeywordData(primaryKeyword),
      aiAnalysis: createMockAIAnalysis(primaryKeyword),
      paaResult: { items: [] },
      paaRawResponse: null,
      relatedKeywords: []
    };
  }

  const gscQueries = gscResult?.queries || [];
  const relatedGSCKeywords = findRelatedGSCKeywords(
    primaryKeyword,
    Array.isArray(gscQueries) ? gscQueries : [],
    clusterKeywords
  );

  toast.info(`Researching keyword: ${primaryKeyword}... Fetching search volume and competition data.`);

  const researchResult = await performKeywordResearch(
    primaryKeyword,
    selectedKeyword,
    (progress) => setOptimizationProgress((prev: any) => ({ ...prev, [siteId]: progress })),
    relatedGSCKeywords
  );

  const researchModel = getResearchModel(site.id);
  const aiAnalysis = await performAIAnalysis(
    researchResult.keywordData,
    site,
    researchResult.paaRawResponse,
    (progress) => setOptimizationProgress((prev: any) => ({ ...prev, [siteId]: progress })),
    researchResult.relatedGSCKeywords || relatedGSCKeywords,
    researchModel
  );

  if (researchResult.paaResult?.items && Array.isArray(researchResult.paaResult.items) && researchResult.paaResult.items.length > 0) {
    aiAnalysis.peopleAlsoAsk = researchResult.paaResult.items.map((item: any) => ({
      question: typeof item === 'string' ? item : (item.question || item.title || ''),
      snippet: typeof item === 'string' ? '' : (item.snippet || item.description || '')
    })).filter((paa: any) => paa.question);
  }

  return {
    keywordData: researchResult.keywordData,
    aiAnalysis,
    paaResult: researchResult.paaResult,
    paaRawResponse: researchResult.paaRawResponse,
    relatedKeywords: researchResult.relatedGSCKeywords || relatedGSCKeywords || []
  };
}

export async function autoSelectOptimizationItems(
  aiAnalysis: KeywordAIAnalysis,
  keywordData: KeywordData,
  primaryKeyword: string,
  clusterKeywords: string[] | undefined,
  testMode: boolean
): Promise<{
  selectedKeywords: string[];
  selectedH2Sections: string[];
  selectedPeopleAlsoAsk: any[];
  selectedResearchLinks: any[];
  updatedPrimaryKeyword?: string;
}> {
  const { autoSelectKeywords, autoSelectH2Sections, autoSelectPeopleAlsoAsk, autoSelectResearchLinks } = getAutoSelectHelpers();

  const aiSelectedKeywords = autoSelectKeywords(aiAnalysis, [keywordData]);
  
  // If we have less than 5 keywords, use the best one (first in sorted array) as primary
  let updatedPrimaryKeyword: string | undefined;
  if (aiSelectedKeywords.length < 5 && aiSelectedKeywords.length > 0) {
    // The first keyword is already the best one (sorted by quality)
    updatedPrimaryKeyword = aiSelectedKeywords[0];
    // Update aiAnalysis to reflect the new primary keyword
    if (aiAnalysis.keywordSuggestions) {
      aiAnalysis.keywordSuggestions.primary = updatedPrimaryKeyword;
    }
  }
  
  const selectedKeywords = clusterKeywords && clusterKeywords.length > 0
    ? [...new Set([updatedPrimaryKeyword || primaryKeyword, ...clusterKeywords, ...aiSelectedKeywords])]
    : aiSelectedKeywords;

  const selectedH2Sections = autoSelectH2Sections(aiAnalysis);
  const selectedPeopleAlsoAsk = autoSelectPeopleAlsoAsk(aiAnalysis);
  const selectedResearchLinks = autoSelectResearchLinks(aiAnalysis);

  if (!testMode) {
    toast.success(`AI analysis complete. Selected ${selectedKeywords.length} keywords, ${selectedH2Sections.length} H2 sections.`, { duration: 4000 });
  }

  return { 
    selectedKeywords, 
    selectedH2Sections, 
    selectedPeopleAlsoAsk, 
    selectedResearchLinks,
    updatedPrimaryKeyword 
  };
}

export function updateKeywordResearchFile(
  fileManager: OptimizationFileManager,
  siteId: string,
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: any[],
  selectedResearchLinks: any[],
  setOptimizationFileManagers: (prev: any) => any
): void {
  const keywordResearchFiles = fileManager.getFiles().filter(f => f.name.includes('keyword-research'));
  if (keywordResearchFiles.length > 0) {
    const keywordResearchFile = keywordResearchFiles[0];
    const keywordResearchData = JSON.parse(keywordResearchFile.content);
    keywordResearchData.selectedKeywords = selectedKeywords;
    keywordResearchData.selectedH2Sections = selectedH2Sections;
    keywordResearchData.selectedPeopleAlsoAsk = selectedPeopleAlsoAsk;
    keywordResearchData.selectedResearchLinks = selectedResearchLinks;
    fileManager.removeFile(keywordResearchFile.name);
    fileManager.addFile(
      keywordResearchFile.name,
      JSON.stringify(keywordResearchData, null, 2),
      'application/json'
    );
    setOptimizationFileManagers((prev: any) => ({ ...prev, [siteId]: fileManager }));
  }
}
