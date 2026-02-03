/**
 * Site Cloner Feature Component
 * Main UI component for site cloning workflow
 * Phase 1: Site cloning (new functionality)
 * Phase 2: Client data injection (uses existing GeneratorTab architecture)
 */

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { useSiteCloner } from "@/hooks/use-site-cloner";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { TemplateSelector } from "./TemplateSelector";
import { DomainInput } from "./DomainInput";
import { ProgressDisplay } from "./ProgressDisplay";
import { getFieldStructureFromTemplate, mapClientDataToACFFields, injectMappedDataToACF } from "@/lib/site-cloner";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CustomizationConfig } from "../elementor/types";
import type { SiteCloningConfig } from "./types";

interface SiteClonerFeatureProps {
  fetchedCompanyData?: Partial<CustomizationConfig> | null;
  triggerGenerate?: boolean;
  onGenerateTriggered?: () => void;
}

export const SiteClonerFeature: React.FC<SiteClonerFeatureProps> = ({
  fetchedCompanyData,
  triggerGenerate = false,
  onGenerateTriggered
}) => {
  const [actionType, setActionType] = useState<'new' | 'modify'>('new');
  const [templateSiteId, setTemplateSiteId] = useState<string>('');
  const [domain, setDomain] = useState('');
  const { sites } = useWordPressSites();
  const { isCloning, progress, result, error, startCloning, injectClientData } = useSiteCloner();
  const hasTriggeredInjectRef = useRef(false);

  // Get selected template site
  const templateSite = sites.find(s => s.id === templateSiteId);

  // Phase 2: Auto-trigger client data injection when triggerGenerate is true
  useEffect(() => {
    if (triggerGenerate && 
        fetchedCompanyData && 
        result?.success && 
        result.newSiteUrl && 
        templateSite &&
        !hasTriggeredInjectRef.current) {
      
      hasTriggeredInjectRef.current = true;
      handleInjectClientData();
      onGenerateTriggered?.();
    } else if (!triggerGenerate) {
      hasTriggeredInjectRef.current = false;
    }
  }, [triggerGenerate, fetchedCompanyData, result, templateSite, onGenerateTriggered]);

  const handleInjectClientData = async () => {
    if (!result?.success || !result.newSiteUrl || !templateSite || !fetchedCompanyData) {
      return;
    }

    try {
      toast.info('Injecting client data into ACF Options Page...');

      // Get field structure from template
      const structureResult = await getFieldStructureFromTemplate(
        templateSite.siteUrl,
        templateSite.username,
        templateSite.appPassword
      );

      if (!structureResult.success || !structureResult.fields) {
        throw new Error(structureResult.error || 'Failed to get field structure');
      }

      // Map client data to ACF fields using AI
      const apiKey = loadApiKey();
      if (!apiKey) {
        throw new Error('OpenRouter API key not found. Please set it in Settings.');
      }

      const model = getResearchModel();
      const mappingResult = await mapClientDataToACFFields(
        structureResult.fields,
        fetchedCompanyData,
        apiKey,
        model,
        0.2,
        8000
      );

      if (!mappingResult.success || !mappingResult.mappedFields) {
        throw new Error(mappingResult.error || 'Failed to map client data to ACF fields');
      }

      // Inject mapped data (using template site credentials temporarily)
      // In production, you'd use the new site's credentials from WP Engine
      const injectResult = await injectMappedDataToACF(
        result.newSiteUrl,
        templateSite.username, // Temporary - should use new site credentials
        templateSite.appPassword, // Temporary - should use new site credentials
        mappingResult.mappedFields
      );

      if (!injectResult.success) {
        throw new Error(injectResult.error || 'Failed to inject client data');
      }

      toast.success('Client data injected successfully!', {
        description: 'ACF Options Page has been updated with client information'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to inject client data';
      toast.error('Failed to inject client data', {
        description: errorMessage
      });
    }
  };

  const handleStartCloning = async () => {
    if (!templateSiteId) {
      toast.error('Please select a template site');
      return;
    }

    if (!domain) {
      toast.error('Please enter a domain name');
      return;
    }

    const config: SiteCloningConfig = {
      actionType,
      templateSiteId: actionType === 'new' ? templateSiteId : undefined,
      templateSiteUrl: templateSite?.siteUrl,
      domain,
      siteName: domain.replace(/^https?:\/\//, '').replace(/\/$/, '').split('.')[0],
      environment: 'production'
    };

    await startCloning(config, templateSite);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5" />
          <CardTitle>Site Cloner</CardTitle>
        </div>
        <CardDescription>
          Clone WordPress sites on WP Engine and customize them with client data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Action Type Selection */}
        <div className="space-y-2">
          <Label>Action Type</Label>
          <RadioGroup value={actionType} onValueChange={(value) => setActionType(value as 'new' | 'modify')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new" id="new-site" />
              <Label htmlFor="new-site" className="cursor-pointer">New Client Site</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="modify" id="modify-site" />
              <Label htmlFor="modify-site" className="cursor-pointer">Modify Existing Site</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Template Selection (New Site Only) */}
        {actionType === 'new' && (
          <TemplateSelector
            value={templateSiteId}
            onValueChange={setTemplateSiteId}
            disabled={isCloning}
          />
        )}

        {/* Domain Input (New Site Only) */}
        {actionType === 'new' && (
          <DomainInput
            value={domain}
            onChange={setDomain}
            disabled={isCloning}
          />
        )}

        {/* Progress Display */}
        {(isCloning || progress.overallProgress > 0) && (
          <ProgressDisplay progress={progress} />
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Success Result */}
        {result?.success && (
          <div className="p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
            <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
              Site cloned successfully!
            </p>
            <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
              <p><strong>Site URL:</strong> {result.newSiteUrl}</p>
              {result.newSiteCredentials && (
                <>
                  <p><strong>Admin URL:</strong> {result.newSiteCredentials.adminUrl}</p>
                  <p><strong>Username:</strong> {result.newSiteCredentials.username}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Start Cloning Button */}
        <Button
          onClick={handleStartCloning}
          disabled={isCloning || !templateSiteId || !domain}
          className="w-full"
          size="lg"
        >
          {isCloning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Cloning Site...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {actionType === 'new' ? 'Clone Site' : 'Modify Site'}
            </>
          )}
        </Button>

        {/* Phase 2 Info */}
        {result?.success && fetchedCompanyData && (
          <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Next Step:</strong> Use Company Lookup above to fetch client data, then validate to automatically inject it into the ACF Options Page.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
