import { toast } from "sonner";
import { streamGeneration, GenerationResult } from "./api";
import {
  buildSystemPrompt,
  buildDraftPrompt,
  buildReviewerPrompt,
  generateSectionsPrompt,
  buildPlannerPrompt,
} from "./prompt-builders";
import { StoredFile } from "@/components/KnowledgeBaseTab";
import { AgentConfig } from "@/components/AgentNode";
import { getReportFooterMarkdown } from "./report-footer";

export interface GenerationContext {
  knowledgeBaseContext: string;
  sectionsPrompt: string;
  planPrompt: string;
}

export type KeywordData = {
  targetKeyword?: string;
  primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
  searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  semanticKeywords?: string[];
  keywordDifficulty?: number;
};

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export function getKeywordDataFromBlueprint(blueprint: {
  targetKeyword?: string;
  primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume?: number }>;
  searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  semanticKeywords?: string[];
  keywordDifficulty?: number;
}): {
  targetKeyword: string;
  primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
  searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  semanticKeywords?: string[];
  keywordDifficulty?: number;
} | undefined {
  if (!blueprint.targetKeyword) return undefined;
  
  const primaryKeywords = blueprint.primaryKeywords?.map(kw => ({
    keyword: kw.keyword,
    difficulty: kw.difficulty,
    searchVolume: kw.searchVolume ?? 0,
  }));
  
  return {
    targetKeyword: blueprint.targetKeyword,
    primaryKeywords,
    searchIntent: blueprint.searchIntent,
    semanticKeywords: blueprint.semanticKeywords,
    keywordDifficulty: blueprint.keywordDifficulty,
  };
}

export function buildKnowledgeBaseContext(files: StoredFile[], activeText: string): string {
  let context = "";
  if (files.length > 0) {
    context = files.map(file => `--- ${file.name} ---\n${file.content}\n`).join("\n");
  }
  if (activeText.trim().length > 0) {
    context += `--- Knowledge Base Profile Content ---\n${activeText}\n`;
  }
  return context;
}

export function validateGenerationInput(apiKey: string, agents: AgentConfig[]): boolean {
  if (!apiKey) {
    toast.error("Please set your OpenRouter API key inside the Manager Panel.");
    return false;
  }
  if (agents.length === 0) {
    toast.error("Please add at least one agent node");
    return false;
  }
  return true;
}

export function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Aborted");
  }
}

export function createInitialGenerationState(): GenerationResult {
  return {
    plan: "",
    draft: "",
    final: "",
    currentStage: "planning",
    isGenerating: true,
  };
}

export function handleGenerationError(
  error: unknown,
  setGenerationResult: SetState<GenerationResult>,
  errorMessage: string
): void {
  if ((error as Error).name !== 'Aborted') {
    console.error("Generation error:", error);
    setGenerationResult((prev) => ({
      ...prev,
      final: errorMessage,
      currentStage: "error",
    }));
  }
}

export interface StreamGenerationStageConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  signal: AbortSignal;
  stateKey: 'plan' | 'draft' | 'final';
  setGenerationResult: SetState<GenerationResult>;
  abortToast: string;
}

export async function streamGenerationStage(
  config: StreamGenerationStageConfig
): Promise<string | null> {
  const { apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, topP, signal, stateKey, setGenerationResult, abortToast } = config;
  
  let streamedContent = "";
  
  try {
    await streamGeneration({
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      topP,
      signal,
      onContentChunk: (chunk) => {
        streamedContent += chunk;
        setGenerationResult((prev) => ({
          ...prev,
          [stateKey]: streamedContent,
        }));
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      toast.warning(abortToast);
      return null;
    } else {
      setGenerationResult((prev) => ({ ...prev, currentStage: "error" }));
      throw error;
    }
  }
  
  return streamedContent;
}

export interface RebuildGenerationContextParams {
  agents: AgentConfig[];
  activeText: string;
  flowTitle: string;
  flowPurpose: string;
  knowledgeFiles: StoredFile[];
  generateBlueprint: () => any;
}

export function rebuildGenerationContext(params: RebuildGenerationContextParams): GenerationContext {
  const { agents, activeText, flowTitle, flowPurpose, knowledgeFiles, generateBlueprint } = params;
  
  const knowledgeBaseContext = activeText || "";
  const sectionsPrompt = generateSectionsPrompt(agents);
  
  const blueprint = generateBlueprint();
  const keywordData = getKeywordDataFromBlueprint(blueprint);
  
  const planPrompt = buildPlannerPrompt(
    flowTitle,
    flowPurpose,
    sectionsPrompt,
    keywordData,
    knowledgeFiles
  );
  
  return {
    knowledgeBaseContext,
    sectionsPrompt,
    planPrompt,
  };
}

export interface RunDraftAndReviewConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  plan: string;
  sectionsPrompt: string;
  knowledgeBaseContext: string;
  flowTitle: string;
  flowPurpose: string;
  keywordData: {
    targetKeyword?: string;
    primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
    searchIntent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
    semanticKeywords?: string[];
    keywordDifficulty?: number;
  } | undefined;
  setGenerationResult: SetState<GenerationResult>;
  signal: AbortSignal;
}

export async function runDraftAndReview(
  config: RunDraftAndReviewConfig
): Promise<{ draft: string; final: string }> {
  const {
    apiKey,
    model,
    temperature,
    maxTokens,
    topP,
    plan,
    sectionsPrompt,
    knowledgeBaseContext,
    flowTitle,
    flowPurpose,
    keywordData,
    setGenerationResult,
    signal,
  } = config;

  checkAborted(signal);

  toast.info("2/3: Starting Draft Report Generation");
  setGenerationResult((prev) => ({ ...prev, currentStage: "drafting" }));

  const draftPrompt = buildDraftPrompt(flowTitle, flowPurpose, sectionsPrompt, plan, keywordData);
  
  const draft = await streamGenerationStage({
    apiKey,
    model,
    systemPrompt: buildSystemPrompt(knowledgeBaseContext, apiKey),
    userPrompt: draftPrompt,
    temperature,
    maxTokens,
    topP,
    signal,
    stateKey: 'draft',
    setGenerationResult,
    abortToast: "Drafting stage aborted.",
  });

  if (signal.aborted || !draft) {
    throw new Error(signal.aborted ? "Aborted" : "Draft generation failed.");
  }

  checkAborted(signal);

  toast.info("3/3: Starting Final Review and Polishing");
  setGenerationResult((prev) => ({ ...prev, currentStage: "reviewing" }));

  const finalPrompt = buildReviewerPrompt(draft, sectionsPrompt);
  
  const final = await streamGenerationStage({
    apiKey,
    model,
    systemPrompt: buildSystemPrompt(knowledgeBaseContext, apiKey),
    userPrompt: finalPrompt,
    temperature: 0.1,
    maxTokens,
    topP,
    signal,
    stateKey: 'final',
    setGenerationResult,
    abortToast: "Final review stage aborted.",
  });

  if (signal.aborted || !final) {
    throw new Error(signal.aborted ? "Aborted" : "Final review failed.");
  }

  // Append standard report footer for SEO Performance reports
  const isReport = flowTitle?.includes("SEO Performance Report") ?? false;
  const finalWithFooter = isReport ? final + getReportFooterMarkdown() : final;

  return { draft, final: finalWithFooter };
}
