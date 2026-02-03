import React, { useState, useCallback } from "react";
import { WordPressFeature } from "./integrations/WordPressFeature";
import { GSCFeature, type GSCFeatureRef } from "./integrations/GSCFeature";
import { EntityGenerationFeature, type EntityGenerationFeatureRef } from "./integrations/entity-generation";
import { type WordPressSite, WORDPRESS_SITES_STORAGE_KEY } from "./integrations/types";
import { getStoredSites } from "./integrations/storage";
import type { AgentConfig } from "@/components/AgentNode";

// Re-export types and functions for backward compatibility
export type { WordPressSite } from "./integrations/types";
export { WORDPRESS_SITES_STORAGE_KEY } from "./integrations/types";
export { getStoredSites } from "./integrations/storage";

interface IntegrationsTabProps {
  onBlueprintUpdate?: (agents: AgentConfig[], title?: string, purpose?: string) => void;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ onBlueprintUpdate }) => {
  const [gscHandler, setGscHandler] = useState<{ openDialog: (site: WordPressSite) => void; isFetchingGSC: string | null } | null>(null);
  const [entityHandler, setEntityHandler] = useState<{ openDialog: (site: WordPressSite, sitemapUrl: string) => void; isGeneratingEntities: Record<string, boolean> } | null>(null);
  
  // Memoize onRef callbacks to prevent infinite loops
  const handleGSCRef = useCallback((ref: GSCFeatureRef) => {
    setGscHandler({
      openDialog: ref.openDialog,
      isFetchingGSC: ref.isFetchingGSC,
    });
  }, []);
  
  const handleEntityRef = useCallback((ref: EntityGenerationFeatureRef) => {
    setEntityHandler({
      openDialog: ref.openDialog,
      isGeneratingEntities: ref.isGeneratingEntities,
    });
  }, []);

  return (
    <div className="space-y-6">
      <GSCFeature onRef={handleGSCRef} />
      <WordPressFeature
        onGSCFetch={gscHandler ? (site) => gscHandler.openDialog(site) : undefined}
        onEntityGeneration={entityHandler ? (site, sitemapUrl) => entityHandler.openDialog(site, sitemapUrl) : undefined}
        isFetchingGSC={gscHandler?.isFetchingGSC ?? null}
        isGeneratingEntities={entityHandler?.isGeneratingEntities ?? {}}
        onBlueprintUpdate={onBlueprintUpdate}
      />
      
      <EntityGenerationFeature onRef={handleEntityRef} />
    </div>
  );
};
