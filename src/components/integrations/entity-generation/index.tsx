/**
 * Entity Generation Feature
 * Main orchestrator component that composes all modules
 */

import React, { useEffect, useState, useRef } from "react";
import { useEntityGeneration } from "./hooks/useEntityGeneration";
import { useEntityDialog } from "./hooks/useEntityDialog";
import { EntityGenerationDialog } from "./ui/EntityGenerationDialog";
import { CSVTemplateDialog } from "./ui/CSVTemplateDialog";
import type { EntityGenerationFeatureRef, EntityGenerationFeatureProps } from "./types";
import type { EntityWithCriteria } from "./types";
import type { WordPressSite } from "../../types";

export const EntityGenerationFeature: React.FC<EntityGenerationFeatureProps> = ({ onRef }) => {
  const [csvTitleFormat, setCsvTitleFormat] = useState<string>('');
  const [firstEntity, setFirstEntity] = useState<string | null>(null);
  // Store site/sitemap info during generation so we can reopen dialog after completion
  const generationContextRef = useRef<{ site: WordPressSite | null; sitemap: string | null }>({ site: null, sitemap: null });
  // Track which storageKeys we've already auto-opened the CSV dialog for (to prevent reopening after manual close)
  const autoOpenedStorageKeysRef = useRef<Set<string>>(new Set());

  // Initialize generation hook first to get clear functions
  const {
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
  } = useEntityGeneration(
    (storageKey, entities, suggestedTitleFormat) => {
      // Store suggested title format
      setCsvTitleFormat(suggestedTitleFormat);
      // Auto-select first entity
      if (entities.length > 0) {
        setFirstEntity(entities[0].entity);
      }
    }
  );

  // Now initialize dialog hook with clear functions
  const {
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
  } = useEntityDialog(
    clearGeneratedEntities,
    clearWikipediaLinks,
    clearCriteriaInfo,
    clearGeneralCriteriaInfo
  );
  
  // Auto-open CSV template dialog after entity generation completes
  useEffect(() => {
    // Try to get storageKey from pendingEntitySite/pendingEntitySitemap first, 
    // or fall back to generationContextRef if dialog was closed during generation
    const site = pendingEntitySite || generationContextRef.current.site;
    const sitemap = pendingEntitySitemap || generationContextRef.current.sitemap;
    const storageKey = site && sitemap 
      ? `${site.id}-${sitemap}` 
      : null;
    const hasEntities = storageKey && generatedEntities[storageKey] && generatedEntities[storageKey].length > 0;
    const isGenerating = storageKey && (isGeneratingEntities[storageKey] || false);
    const alreadyAutoOpened = storageKey && autoOpenedStorageKeysRef.current.has(storageKey);
    
    // If we have entities and we're not generating, and we haven't already auto-opened for this storageKey, auto-open CSV template dialog
    if (hasEntities && !isGenerating && !csvTemplateDialogOpen && !alreadyAutoOpened && site && sitemap) {
      // Mark this storageKey as auto-opened
      if (storageKey) {
        autoOpenedStorageKeysRef.current.add(storageKey);
      }
      // Set site/sitemap without clearing entities, then open CSV dialog
      if (!pendingEntitySite || !pendingEntitySitemap) {
        setPendingSiteAndSitemap(site, sitemap);
      }
      // Close Generate Entities dialog so only CSV template is shown
      closeEntityGenerationDialog();
      // Use setTimeout to ensure state is set before opening dialog
      setTimeout(() => {
        openCsvTemplateDialog();
      }, 100);
    }
  }, [generatedEntities, isGeneratingEntities, pendingEntitySite, pendingEntitySitemap, csvTemplateDialogOpen, setPendingSiteAndSitemap, openCsvTemplateDialog, closeEntityGenerationDialog]);

  // Expose ref to parent
  useEffect(() => {
    if (onRef) {
      onRef({
        openDialog: openEntityGenerationDialog,
        isGeneratingEntities,
      });
    }
  }, [onRef, openEntityGenerationDialog, isGeneratingEntities]);

  // Calculate storageKey using pendingEntitySite/pendingEntitySitemap or fallback to generationContextRef
  const siteForStorage = pendingEntitySite || generationContextRef.current.site;
  const sitemapForStorage = pendingEntitySitemap || generationContextRef.current.sitemap;
  const storageKey = siteForStorage && sitemapForStorage 
    ? `${siteForStorage.id}-${sitemapForStorage}` 
    : null;

  const entities = storageKey ? (generatedEntities[storageKey] || []) : [];
  const wikiLinks = storageKey ? (wikipediaLinks[storageKey] || {}) : {};
  const criteria = storageKey ? (criteriaInfo[storageKey] || {}) : {};
  const generalCriteria = storageKey ? (generalCriteriaInfo[storageKey]) : undefined;
  const isGenerating = storageKey ? (isGeneratingEntities[storageKey] || false) : false;
  const progress = storageKey ? (entityGenerationProgress[storageKey]) : undefined;

  // Set selected entity when first entity is generated
  useEffect(() => {
    if (firstEntity && !selectedEntity) {
      setSelectedEntity(firstEntity);
      setFirstEntity(null);
    }
  }, [firstEntity, selectedEntity, setSelectedEntity]);

  // Load title format from localStorage if available
  useEffect(() => {
    if (storageKey && !csvTitleFormat) {
      const savedFormat = localStorage.getItem(`entity-title-format-${storageKey}`);
      if (savedFormat) {
        setCsvTitleFormat(savedFormat);
      }
    }
  }, [storageKey, csvTitleFormat]);

  return (
    <>
      <EntityGenerationDialog
        open={entityGenerationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Clear generation context when dialog is manually closed (not during generation)
            const isGenerating = storageKey && (isGeneratingEntities[storageKey] || false);
            if (!isGenerating) {
              generationContextRef.current = { site: null, sitemap: null };
            }
            closeEntityGenerationDialog();
          }
        }}
        pendingEntitySite={pendingEntitySite}
        pendingEntitySitemap={pendingEntitySitemap}
        generatedEntities={entities}
        wikipediaLinks={wikiLinks}
        criteriaInfo={criteria}
        generalCriteriaInfo={generalCriteria}
        selectedEntity={selectedEntity}
        onSelectEntity={setSelectedEntity}
        entityCount={entityCount}
        entityPromptModifier={entityPromptModifier}
        onEntityCountChange={setEntityCount}
        onEntityPromptModifierChange={setEntityPromptModifier}
        onGenerate={() => {
          if (pendingEntitySite && pendingEntitySitemap) {
            generationContextRef.current = { site: pendingEntitySite, sitemap: pendingEntitySitemap };
            const sk = `${pendingEntitySite.id}-${pendingEntitySitemap}`;
            autoOpenedStorageKeysRef.current.delete(sk);
            // Keep dialog open so Death Star progress panel is visible
            handleGenerateEntities(
              pendingEntitySite,
              pendingEntitySitemap,
              entityCount,
              entityPromptModifier.trim() || undefined
            );
          }
        }}
        onOpenCsvDialog={() => {
          if (csvTitleFormat === '') {
            // Initialize with default if not set
            const savedFormat = storageKey 
              ? localStorage.getItem(`entity-title-format-${storageKey}`)
              : null;
            if (savedFormat) {
              setCsvTitleFormat(savedFormat);
            }
          }
          openCsvTemplateDialog();
        }}
        isGenerating={isGenerating}
        entityGenerationProgress={progress}
      />

      <CSVTemplateDialog
        open={csvTemplateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeCsvTemplateDialog();
          }
        }}
        pendingEntitySite={pendingEntitySite || generationContextRef.current.site}
        pendingEntitySitemap={pendingEntitySitemap || generationContextRef.current.sitemap}
        entities={entities}
        initialTitleFormat={csvTitleFormat}
      />
    </>
  );
};

// Export types for external use
export type { EntityGenerationFeatureRef, EntityGenerationFeatureProps } from "./types";
