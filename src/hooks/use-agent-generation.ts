import { useRef, useCallback } from "react";
import { toast } from "sonner";
import { AgentConfig } from "@/components/AgentNode";
import { StoredFile } from "@/components/KnowledgeBaseTab";
import { GenerationResult } from "../lib/api";
import { buildSystemPrompt, generateSectionsPrompt, buildPlannerPrompt } from "../lib/prompt-builders";
import {
  getKeywordDataFromBlueprint,
  buildKnowledgeBaseContext,
  validateGenerationInput,
  checkAborted,
  createInitialGenerationState,
  handleGenerationError,
  streamGenerationStage,
  rebuildGenerationContext,
  runDraftAndReview,
  type GenerationContext,
} from "../lib/agent-generation-helpers";

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type GenerateBlueprintFn = () => any;

interface AgentGenerationProps {
  apiKey: string;
  agents: AgentConfig[];
  flowTitle: string;
  flowPurpose: string;
  knowledgeFiles: StoredFile[];
  activeKnowledgeBaseText: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  isGenerating: boolean;
  generationResult: GenerationResult;
  currentAbortController: React.MutableRefObject<AbortController | null>;
  generateBlueprint: GenerateBlueprintFn;
  setIsGenerating: SetState<boolean>;
  setGenerationResult: SetState<GenerationResult>;
}

export function useAgentGeneration({
  apiKey,
  agents,
  flowTitle,
  flowPurpose,
  knowledgeFiles,
  activeKnowledgeBaseText,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  isGenerating,
  generationResult,
  currentAbortController,
    generateBlueprint,
    setIsGenerating,
    setGenerationResult,
}: AgentGenerationProps) {
  // Store generation context for retry functionality
  const generationContextRef = useRef<GenerationContext | null>(null);
  // Store latest generation result to access modified plan
  const generationResultRef = useRef<GenerationResult>(generationResult);
  
  // Keep ref in sync with state
  generationResultRef.current = generationResult;

  const handleAbort = useCallback(() => {
    if (currentAbortController.current) {
        currentAbortController.current.abort();
        currentAbortController.current = null;
        setIsGenerating(false);
        setGenerationResult((prev) => {
          if (prev.currentStage !== 'complete' && prev.currentStage !== 'error') {
                // Append an error message to the current output
                const abortedMessage = `\n\n--- Generation Aborted by User ---`;
                let newContent = prev.final || prev.draft || prev.plan;
                newContent += abortedMessage;
                return {
                  ...prev,
                  final: newContent, // Put the aborted message into the final slot.
                  currentStage: "error",
                };
          }
          return prev;
        });
        toast.warning("Generation aborted.");
    }
  }, [currentAbortController, setIsGenerating, setGenerationResult]);

  const handleGenerate = useCallback(async () => {
    if (!validateGenerationInput(apiKey, agents)) return;
    
    generateBlueprint();

    const controller = new AbortController();
    currentAbortController.current = controller;

    setIsGenerating(true);
    setGenerationResult(createInitialGenerationState());

    try {
      const knowledgeBaseContext = buildKnowledgeBaseContext(knowledgeFiles, activeKnowledgeBaseText);
      const sectionsPrompt = generateSectionsPrompt(agents);

      toast.info("1/3: Starting Planning (Chain of Thought)");
      setGenerationResult((prev) => ({ ...prev, currentStage: "planning" }));

      checkAborted(controller.signal);

      const keywordData = getKeywordDataFromBlueprint(generateBlueprint());
      const planPrompt = buildPlannerPrompt(flowTitle, flowPurpose, sectionsPrompt, keywordData, knowledgeFiles);

      const streamedPlanContent = await streamGenerationStage({
        apiKey,
        model: selectedModel,
        systemPrompt: buildSystemPrompt(knowledgeBaseContext, apiKey),
        userPrompt: planPrompt,
        temperature,
        maxTokens,
        topP,
        signal: controller.signal,
        stateKey: 'plan',
        setGenerationResult,
        abortToast: "Planning stage aborted.",
      });

      if (controller.signal.aborted || !streamedPlanContent) {
        if (!controller.signal.aborted) {
          throw new Error("Plan generation failed.");
        }
        return;
      }

      generationContextRef.current = {
        knowledgeBaseContext,
        sectionsPrompt,
        planPrompt,
      };

      toast.success("Plan generated. Please review and approve to continue.");
      setGenerationResult((prev) => ({
        ...prev,
        currentStage: "plan_approval_pending",
        isGenerating: false,
      }));
      setIsGenerating(false);
    } catch (error) {
      if ((error as Error).name !== 'Aborted') {
        handleGenerationError(error, setGenerationResult, `Generation failed. Check console for details. Error: ${(error as Error).message}`);
      }
    } finally {
      currentAbortController.current = null;
      setIsGenerating(false);
    }
  }, [
    apiKey,
    agents,
    knowledgeFiles,
    activeKnowledgeBaseText,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    currentAbortController,
    setGenerationResult,
    setIsGenerating,
    generateBlueprint,
    flowTitle,
    flowPurpose,
  ]);

  const handleApprovePlan = useCallback(async () => {
    const currentPlan = generationResultRef.current.plan;
    
    if (!currentPlan) {
      toast.error("No plan available to approve.");
      return;
    }

    if (!generationContextRef.current) {
      generationContextRef.current = rebuildGenerationContext({
        agents,
        activeText: activeKnowledgeBaseText,
        flowTitle,
        flowPurpose,
        knowledgeFiles,
        generateBlueprint,
      });
    }

    const { knowledgeBaseContext, sectionsPrompt } = generationContextRef.current;
    const keywordData = getKeywordDataFromBlueprint(generateBlueprint());

    const controller = new AbortController();
    currentAbortController.current = controller;

    setIsGenerating(true);
    setGenerationResult((prev) => ({
      ...prev,
      currentStage: "drafting",
      isGenerating: true,
    }));

    try {
      const { draft, final } = await runDraftAndReview({
        apiKey,
        model: selectedModel,
        temperature,
        maxTokens,
        topP,
        plan: currentPlan,
        sectionsPrompt,
        knowledgeBaseContext,
        flowTitle,
        flowPurpose,
        keywordData,
        setGenerationResult,
        signal: controller.signal,
      });

      toast.success("Agent generation complete!");
      setGenerationResult((prev) => ({
        ...prev,
        currentStage: "complete",
      }));
    } catch (error) {
      handleGenerationError(error, setGenerationResult, `Generation failed. Check console for details. Error: ${(error as Error).message}`);
    } finally {
      currentAbortController.current = null;
      setIsGenerating(false);
    }
  }, [
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowTitle,
    flowPurpose,
    currentAbortController,
    setIsGenerating,
    setGenerationResult,
    agents,
    activeKnowledgeBaseText,
    knowledgeFiles,
    generateBlueprint,
  ]);

  const handleRetryPlan = useCallback(async () => {
    if (!generationContextRef.current) {
      toast.error("No generation context available. Please start a new generation.");
      return;
    }

    const { knowledgeBaseContext, planPrompt } = generationContextRef.current;
    const controller = new AbortController();
    currentAbortController.current = controller;

    setIsGenerating(true);
    setGenerationResult((prev) => ({
      ...prev,
      plan: "",
      currentStage: "planning",
      isGenerating: true,
    }));

    try {
      toast.info("Regenerating plan...");
      checkAborted(controller.signal);

      const streamedPlanContent = await streamGenerationStage({
        apiKey,
        model: selectedModel,
        systemPrompt: buildSystemPrompt(knowledgeBaseContext, apiKey),
        userPrompt: planPrompt,
        temperature,
        maxTokens,
        topP,
        signal: controller.signal,
        stateKey: 'plan',
        setGenerationResult,
        abortToast: "Planning stage aborted.",
      });

      if (controller.signal.aborted || !streamedPlanContent) {
        if (!controller.signal.aborted) {
          throw new Error("Plan generation failed.");
        }
        return;
      }

      toast.success("Plan generated. Please review and approve to continue.");
      setGenerationResult((prev) => ({
        ...prev,
        currentStage: "plan_approval_pending",
        isGenerating: false,
      }));
      setIsGenerating(false);
    } catch (error) {
      handleGenerationError(error, setGenerationResult, `Plan regeneration failed. Check console for details. Error: ${(error as Error).message}`);
    } finally {
      currentAbortController.current = null;
      setIsGenerating(false);
    }
  }, [
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    currentAbortController,
    setIsGenerating,
    setGenerationResult,
  ]);

  return {
    handleGenerate,
    handleAbort,
    handleApprovePlan,
    handleRetryPlan,
  };
}
