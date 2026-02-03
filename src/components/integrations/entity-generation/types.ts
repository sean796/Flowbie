import { type WordPressSite } from "../types";

export interface EntityGenerationFeatureRef {
  openDialog: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities: Record<string, boolean>;
}

export interface EntityGenerationFeatureProps {
  onRef?: (ref: EntityGenerationFeatureRef) => void;
}

export interface EntityWithCriteria {
  entity: string;
  wikipediaUrl: string;
  wikipediaTitle?: string;
  criteriaData?: CriteriaData;
}

export interface CriteriaData {
  matches: boolean;
  confidence: number;
  extractedData: Record<string, any>;
  rankingValue?: number;
}

export interface EntityGenerationState {
  isGeneratingEntities: Record<string, boolean>;
  generatedEntities: Record<string, string[]>;
  wikipediaLinks: Record<string, Record<string, string>>;
  criteriaInfo: Record<string, Record<string, CriteriaData>>;
  generalCriteriaInfo: Record<string, string>;
  selectedEntity: string | null;
  entityGenerationDialogOpen: boolean;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  entityCount: number;
  entityPromptModifier: string;
  csvTemplateDialogOpen: boolean;
  csvTitleFormat: string;
  csvKeyword: string;
  csvFeaturedImage: string;
  csvOptionalModifier: string;
  isGeneratingTitleSuggestion: boolean;
}

export interface GenerationOptions {
  site: WordPressSite;
  sitemapUrl: string;
  count: number;
  promptModifier?: string;
}

export interface ValidationResult {
  matches: boolean;
  confidence: number;
  extractedData?: Record<string, any>;
  rankingValue?: number;
}

export interface LocationExtractionResult {
  primaryCity: string | null;
  existingEntities: string[];
  cityNames: Set<string>;
  areaKeywords: Set<string>;
  suggestedTitleFormat: string;
}
