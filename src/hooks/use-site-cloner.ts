/**
 * React hook for site cloning workflow state management
 */

import { useState, useCallback } from 'react';
import { cloneSite, getFieldStructureFromTemplate, importFieldStructureToSite, mapClientDataToACFFields, injectMappedDataToACF } from '@/lib/site-cloner';
import { loadApiKey } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import type { 
  SiteCloningConfig, 
  CloningProgress, 
  CloningStep,
  NewSiteResult 
} from '@/components/generator/site-cloner/types';
import type { WordPressSite } from '@/components/integrations/types';

export function useSiteCloner() {
  const [isCloning, setIsCloning] = useState(false);
  const [progress, setProgress] = useState<CloningProgress>({
    currentStep: 0,
    totalSteps: 5,
    overallProgress: 0,
    steps: [
      { id: 'create-site', name: 'Creating new site', progress: 0, status: 'pending' },
      { id: 'set-domain', name: 'Setting domain', progress: 0, status: 'pending' },
      { id: 'get-structure', name: 'Getting field structure', progress: 0, status: 'pending' },
      { id: 'import-structure', name: 'Importing field structure', progress: 0, status: 'pending' },
      { id: 'finalizing', name: 'Finalizing', progress: 0, status: 'pending' }
    ]
  });
  const [result, setResult] = useState<NewSiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateStep = useCallback((stepId: string, updates: Partial<CloningStep>) => {
    setProgress(prev => {
      const newSteps = prev.steps.map(step =>
        step.id === stepId ? { ...step, ...updates } : step
      );
      
      // Calculate overall progress
      const totalProgress = newSteps.reduce((sum, step) => sum + step.progress, 0);
      const overallProgress = Math.round(totalProgress / newSteps.length);
      
      // Find current step index
      const currentStepIndex = newSteps.findIndex(step => step.status === 'in_progress');
      const currentStep = currentStepIndex >= 0 ? currentStepIndex : newSteps.length - 1;
      
      return {
        ...prev,
        steps: newSteps,
        overallProgress,
        currentStep
      };
    });
  }, []);

  const startCloning = useCallback(async (
    config: SiteCloningConfig,
    templateSite?: WordPressSite
  ) => {
    setIsCloning(true);
    setError(null);
    setResult(null);
    
    // Reset progress
    setProgress({
      currentStep: 0,
      totalSteps: 5,
      overallProgress: 0,
      steps: [
        { id: 'create-site', name: 'Creating new site', progress: 0, status: 'pending' },
        { id: 'set-domain', name: 'Setting domain', progress: 0, status: 'pending' },
        { id: 'get-structure', name: 'Getting field structure', progress: 0, status: 'pending' },
        { id: 'import-structure', name: 'Importing field structure', progress: 0, status: 'pending' },
        { id: 'finalizing', name: 'Finalizing', progress: 0, status: 'pending' }
      ]
    });

    try {
      // Step 1: Create site
      updateStep('create-site', { status: 'in_progress', progress: 0, message: 'Creating new site via WP Engine API...' });
      
      const cloneResult = await cloneSite(config, (step, progressValue, message) => {
        if (step === 'Creating new site' || step === 'Site created') {
          updateStep('create-site', { progress: progressValue, message });
        }
      });

      if (!cloneResult.success) {
        updateStep('create-site', { status: 'error', error: cloneResult.error });
        setError(cloneResult.error || 'Failed to create site');
        setIsCloning(false);
        return;
      }

      updateStep('create-site', { status: 'completed', progress: 100 });
      updateStep('set-domain', { status: 'completed', progress: 100 }); // Domain is set during clone

      // Step 2: Get field structure from template
      if (templateSite && config.templateSiteUrl) {
        updateStep('get-structure', { status: 'in_progress', progress: 0, message: 'Retrieving ACF Options Page field structure...' });
        
        const structureResult = await getFieldStructureFromTemplate(
          config.templateSiteUrl,
          templateSite.username,
          templateSite.appPassword
        );

        if (!structureResult.success) {
          updateStep('get-structure', { status: 'error', error: structureResult.error });
          setError(structureResult.error || 'Failed to get field structure');
          setIsCloning(false);
          return;
        }

        updateStep('get-structure', { status: 'completed', progress: 100 });

        // Step 3: Import field structure to new site
        if (cloneResult.newSiteUrl && structureResult.fields) {
          updateStep('import-structure', { status: 'in_progress', progress: 0, message: 'Importing field structure to new site...' });
          
          // Note: We'll need credentials for the new site - for now, use template site credentials
          // In production, you'd get these from WP Engine API
          const importResult = await importFieldStructureToSite(
            cloneResult.newSiteUrl,
            templateSite.username, // Temporary - should use new site credentials
            templateSite.appPassword, // Temporary - should use new site credentials
            structureResult.fields
          );

          if (!importResult.success) {
            updateStep('import-structure', { status: 'error', error: importResult.error });
            setError(importResult.error || 'Failed to import field structure');
            setIsCloning(false);
            return;
          }

          updateStep('import-structure', { status: 'completed', progress: 100 });
        }
      }

      updateStep('finalizing', { status: 'completed', progress: 100 });
      setResult(cloneResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      updateStep('finalizing', { status: 'error', error: errorMessage });
    } finally {
      setIsCloning(false);
    }
  }, [updateStep]);

  const injectClientData = useCallback(async (
    siteUrl: string,
    username: string,
    appPassword: string,
    fieldStructure: Record<string, any>,
    clientData: Record<string, any>
  ) => {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key not found. Please set it in Settings.');
    }

    const model = getResearchModel();

    // Map client data to ACF fields using AI
    const mappingResult = await mapClientDataToACFFields(
      fieldStructure,
      clientData,
      apiKey,
      model,
      0.2,
      8000
    );

    if (!mappingResult.success || !mappingResult.mappedFields) {
      throw new Error(mappingResult.error || 'Failed to map client data to ACF fields');
    }

    // Inject mapped data into ACF Options Page
    const injectResult = await injectMappedDataToACF(
      siteUrl,
      username,
      appPassword,
      mappingResult.mappedFields
    );

    if (!injectResult.success) {
      throw new Error(injectResult.error || 'Failed to inject client data');
    }

    return injectResult;
  }, []);

  return {
    isCloning,
    progress,
    result,
    error,
    startCloning,
    injectClientData
  };
}
