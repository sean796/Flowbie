/**
 * Entity Generation Hook
 * Main state management for entity generation
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { generateEntities } from "../generation/entityGenerator";
import type { WordPressSite } from "../../types";
import type { EntityWithCriteria, CriteriaData } from "../types";

export interface EntityGenerationProgress {
  currentMessage: string;
  stepLog: string[];
}

export interface UseEntityGenerationReturn {
  isGeneratingEntities: Record<string, boolean>;
  entityGenerationProgress: Record<string, EntityGenerationProgress>;
  generatedEntities: Record<string, string[]>;
  wikipediaLinks: Record<string, Record<string, string>>;
  criteriaInfo: Record<string, Record<string, CriteriaData>>;
  generalCriteriaInfo: Record<string, string>;
  entityCount: number;
  entityPromptModifier: string;
  setEntityCount: (count: number) => void;
  setEntityPromptModifier: (modifier: string) => void;
  handleGenerateEntities: (site: WordPressSite, sitemapUrl: string, count: number, promptModifier?: string) => Promise<void>;
  clearGeneratedEntities: (storageKey: string) => void;
  clearWikipediaLinks: (storageKey: string) => void;
  clearCriteriaInfo: (storageKey: string) => void;
  clearGeneralCriteriaInfo: (storageKey: string) => void;
}

export function useEntityGeneration(
  onEntityGenerated?: (storageKey: string, entities: EntityWithCriteria[], suggestedTitleFormat: string) => void
): UseEntityGenerationReturn {
  const [isGeneratingEntities, setIsGeneratingEntities] = useState<Record<string, boolean>>({});
  const [entityGenerationProgress, setEntityGenerationProgress] = useState<Record<string, EntityGenerationProgress>>({});
  const [generatedEntities, setGeneratedEntities] = useState<Record<string, string[]>>({});
  const [wikipediaLinks, setWikipediaLinks] = useState<Record<string, Record<string, string>>>({});
  const [criteriaInfo, setCriteriaInfo] = useState<Record<string, Record<string, CriteriaData>>>({});
  const [generalCriteriaInfo, setGeneralCriteriaInfo] = useState<Record<string, string>>({});
  const [entityCount, setEntityCount] = useState<number>(5);
  const [entityPromptModifier, setEntityPromptModifier] = useState<string>('');

  const clearGeneratedEntities = useCallback((storageKey: string) => {
    setGeneratedEntities(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const clearWikipediaLinks = useCallback((storageKey: string) => {
    setWikipediaLinks(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const clearCriteriaInfo = useCallback((storageKey: string) => {
    setCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const clearGeneralCriteriaInfo = useCallback((storageKey: string) => {
    setGeneralCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const handleGenerateEntities = useCallback(async (
    site: WordPressSite,
    sitemapUrl: string,
    count: number,
    promptModifier?: string
  ) => {
    const entitySitemapUrl = site.entitySitemapUrl || sitemapUrl;
    const generatingKey = `${site.id}-${entitySitemapUrl}`;
    const storageKey = `${site.id}-${entitySitemapUrl}`;

    // Clear cached entities
    clearGeneratedEntities(storageKey);
    setIsGeneratingEntities(prev => ({ ...prev, [generatingKey]: true }));
    setEntityGenerationProgress(prev => ({ ...prev, [generatingKey]: { currentMessage: '', stepLog: [] } }));

    try {
      const result = await generateEntities(
        {
          site,
          sitemapUrl: entitySitemapUrl,
          count,
          promptModifier
        },
        (message) => {
          setEntityGenerationProgress(prev => {
            const current = prev[generatingKey] ?? { currentMessage: '', stepLog: [] };
            return {
              ...prev,
              [generatingKey]: {
                currentMessage: message,
                stepLog: [...current.stepLog, message],
              },
            };
          });
          toast.info(message);
        },
        (entity, criteriaData) => {
          setCriteriaInfo(prev => ({
            ...prev,
            [storageKey]: {
              ...(prev[storageKey] || {}),
              [entity]: criteriaData
            }
          }));
        }
      );

      // Store results
      setGeneratedEntities(prev => ({
        ...prev,
        [storageKey]: result.entities.map(e => e.entity)
      }));

      setWikipediaLinks(prev => ({
        ...prev,
        [storageKey]: result.entities.reduce((acc, e) => {
          if (e.wikipediaUrl) {
            acc[e.entity] = e.wikipediaUrl;
          }
          return acc;
        }, {} as Record<string, string>)
      }));

      if (promptModifier) {
        setGeneralCriteriaInfo(prev => ({
          ...prev,
          [storageKey]: promptModifier
        }));
      }

      // Store suggested title format
      localStorage.setItem(`entity-title-format-${storageKey}`, result.suggestedTitleFormat);

      toast.success(`Generated ${result.entities.length} entities!`);
      onEntityGenerated?.(storageKey, result.entities, result.suggestedTitleFormat);
    } catch (error) {
      console.error('[Entity Generation] Error generating entities:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(errorMessage);
    } finally {
      setIsGeneratingEntities(prev => {
        const updated = { ...prev };
        delete updated[generatingKey];
        return updated;
      });
      setEntityGenerationProgress(prev => {
        const updated = { ...prev };
        delete updated[generatingKey];
        return updated;
      });
    }
  }, [clearGeneratedEntities, onEntityGenerated]);

  return {
    isGeneratingEntities,
    entityGenerationProgress,
    generatedEntities,
    wikipediaLinks,
    criteriaInfo,
    generalCriteriaInfo,
    entityCount,
    entityPromptModifier,
    setEntityCount,
    setEntityPromptModifier,
    handleGenerateEntities,
    clearGeneratedEntities,
    clearWikipediaLinks,
    clearCriteriaInfo,
    clearGeneralCriteriaInfo
  };
}
