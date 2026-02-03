/**
 * Entity Dialog Hook
 * Manages dialog state and opening/closing logic
 */

import { useState, useCallback } from "react";
import type { WordPressSite } from "../../types";

export interface UseEntityDialogReturn {
  entityGenerationDialogOpen: boolean;
  csvTemplateDialogOpen: boolean;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  selectedEntity: string | null;
  openEntityGenerationDialog: (site: WordPressSite, sitemapUrl: string) => void;
  closeEntityGenerationDialog: () => void;
  setSelectedEntity: (entity: string | null) => void;
  openCsvTemplateDialog: () => void;
  closeCsvTemplateDialog: () => void;
  setPendingSiteAndSitemap: (site: WordPressSite, sitemapUrl: string) => void;
  clearCache: (storageKey: string) => void;
}

export function useEntityDialog(
  clearGeneratedEntities: (storageKey: string) => void,
  clearWikipediaLinks: (storageKey: string) => void,
  clearCriteriaInfo: (storageKey: string) => void,
  clearGeneralCriteriaInfo: (storageKey: string) => void
): UseEntityDialogReturn {
  const [entityGenerationDialogOpen, setEntityGenerationDialogOpen] = useState(false);
  const [csvTemplateDialogOpen, setCsvTemplateDialogOpen] = useState(false);
  const [pendingEntitySite, setPendingEntitySite] = useState<WordPressSite | null>(null);
  const [pendingEntitySitemap, setPendingEntitySitemap] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const openEntityGenerationDialog = useCallback((site: WordPressSite, sitemapUrl: string) => {
    const storageKey = `${site.id}-${sitemapUrl}`;
    // ALWAYS clear cached entities when opening dialog - force fresh generation
    clearGeneratedEntities(storageKey);
    clearWikipediaLinks(storageKey);
    clearCriteriaInfo(storageKey);
    clearGeneralCriteriaInfo(storageKey);
    setSelectedEntity(null);
    setPendingEntitySite(site);
    setPendingEntitySitemap(sitemapUrl);
    setEntityGenerationDialogOpen(true);
  }, [clearGeneratedEntities, clearWikipediaLinks, clearCriteriaInfo, clearGeneralCriteriaInfo]);

  const closeEntityGenerationDialog = useCallback(() => {
    setEntityGenerationDialogOpen(false);
    setPendingEntitySite(null);
    setPendingEntitySitemap(null);
    setSelectedEntity(null);
  }, []);

  const openCsvTemplateDialog = useCallback(() => {
    setCsvTemplateDialogOpen(true);
  }, []);

  const closeCsvTemplateDialog = useCallback(() => {
    setCsvTemplateDialogOpen(false);
  }, []);

  const setPendingSiteAndSitemap = useCallback((site: WordPressSite, sitemapUrl: string) => {
    // Set site/sitemap WITHOUT clearing entities (for auto-opening CSV dialog after generation)
    setPendingEntitySite(site);
    setPendingEntitySitemap(sitemapUrl);
  }, []);

  const clearCache = useCallback((storageKey: string) => {
    clearGeneratedEntities(storageKey);
    clearWikipediaLinks(storageKey);
    clearCriteriaInfo(storageKey);
    clearGeneralCriteriaInfo(storageKey);
  }, [clearGeneratedEntities, clearWikipediaLinks, clearCriteriaInfo, clearGeneralCriteriaInfo]);

  return {
    entityGenerationDialogOpen,
    csvTemplateDialogOpen,
    pendingEntitySite,
    pendingEntitySitemap,
    selectedEntity,
    openEntityGenerationDialog,
    closeEntityGenerationDialog,
    setSelectedEntity,
    openCsvTemplateDialog,
    closeCsvTemplateDialog,
    setPendingSiteAndSitemap,
    clearCache
  };
}
