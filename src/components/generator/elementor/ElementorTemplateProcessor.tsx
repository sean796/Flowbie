import React, { useState, useCallback, useMemo, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getCyberpunkButtonClasses, BREATHE_NEON_ANIMATION } from "@/components/integrations/wordpress/cyberpunk-theme";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getStepProgress, ELEMENTOR_STEPS } from "@/lib/elementor/template-constants";
import type { CustomizationConfig, WordPressCustomizationField } from "./types";
import type { WordPressSite } from "@/components/integrations/types";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { scanACFOptionsPageOnly } from "@/lib/wordpress-api/acf-scanner";
import { analyzeACFFieldsDirectly } from "@/lib/wordpress-api/company-analyzer";
import { generateUpdateStrategy, prefillSuggestions, intelligentlyMatchFieldsWithAI } from "@/lib/wordpress-api/strategy-generator";
import { CustomizationChecklist } from "./CustomizationChecklist";
import { downloadACFFieldsTemplate, parseACFFieldsTemplate } from "@/lib/elementor/acf-fields-parser";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import { Download, Upload } from "lucide-react";

interface ElementorTemplateProcessorProps {
  fetchedCompanyData?: Partial<CustomizationConfig> | null;
  triggerGenerate?: boolean;
  onGenerateTriggered?: () => void;
}

const DEFAULT_CONFIG: CustomizationConfig = {
  siteUrl: '',
  businessName: '',
  email: '',
  phone: '',
  primaryColor: '#3B82F6',
  secondaryColor: '#10B981',
  accentColor: '#F59E0B',
};

export const ElementorTemplateProcessor: React.FC<ElementorTemplateProcessorProps> = ({ 
  fetchedCompanyData,
  triggerGenerate = false,
  onGenerateTriggered
}) => {
  const [config, setConfig] = useState<CustomizationConfig>(DEFAULT_CONFIG);
  const [selectedSite, setSelectedSite] = useState<WordPressSite | null>(null);
  const [wordPressFields, setWordPressFields] = useState<WordPressCustomizationField[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [analysisError, setAnalysisError] = useState<string>();
  const [strategy, setStrategy] = useState<any>(null);
  const [lastFetchedData, setLastFetchedData] = useState<Partial<CustomizationConfig> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const hasTriggeredGenerateRef = React.useRef(false);
  const checklistRef = React.useRef<HTMLDivElement>(null);

  const apiKey = loadApiKey();
  const { sites } = useWordPressSites();

  // Config is no longer required - users can edit values directly in checklist
  const isConfigValid = true; // Always allow analysis

  const handleConfigChange = useCallback((newConfig: CustomizationConfig) => {
    setConfig(newConfig);
    // Save to localStorage
    localStorage.setItem('elementor-config', JSON.stringify(newConfig));
  }, []);

  // Load config from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('elementor-config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Merge fetched company data into config when it changes
  React.useEffect(() => {
    if (fetchedCompanyData) {
      // Compare by JSON string to detect actual changes
      const currentDataStr = JSON.stringify(fetchedCompanyData);
      const lastDataStr = JSON.stringify(lastFetchedData);
      
      if (currentDataStr !== lastDataStr) {
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:82',message:'Merging fetchedCompanyData into config',data:{fetchedCompanyData,hasBusinessName:!!fetchedCompanyData.businessName,hasEmail:!!fetchedCompanyData.email,hasPhone:!!fetchedCompanyData.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        setLastFetchedData(fetchedCompanyData);
        setConfig(prevConfig => {
          const updatedConfig = { ...prevConfig, ...fetchedCompanyData };
          // #region agent log
          fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:91',message:'Config updated with company data',data:{updatedConfig,hasBusinessName:!!updatedConfig.businessName,hasEmail:!!updatedConfig.email,hasPhone:!!updatedConfig.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          // Save to localStorage
          localStorage.setItem('elementor-config', JSON.stringify(updatedConfig));
          return updatedConfig;
        });
      }
    }
  }, [fetchedCompanyData, lastFetchedData]);

  // Auto-trigger Generate when triggerGenerate is true – pass fetchedCompanyData directly (don't rely on config)
  React.useEffect(() => {
    if (triggerGenerate && apiKey && sites.length > 0 && !isAnalyzing && fetchedCompanyData && !hasTriggeredGenerateRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:105',message:'Auto-triggering Generate with company data override',data:{triggerGenerate,hasFetchedData:!!fetchedCompanyData,fetchedHasBusinessName:!!fetchedCompanyData.businessName,fetchedHasEmail:!!fetchedCompanyData.email,fetchedHasPhone:!!fetchedCompanyData.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      hasTriggeredGenerateRef.current = true;
      handleAnalyzeAndGenerate(fetchedCompanyData);
      onGenerateTriggered?.();
    } else if (!triggerGenerate) {
      hasTriggeredGenerateRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerGenerate, apiKey, sites.length, isAnalyzing, fetchedCompanyData]);

  // Auto-select first connected/enabled site on mount
  React.useEffect(() => {
    if (!selectedSite && sites.length > 0) {
      const connectedSites = sites.filter(s => 
        s.enabled !== false && s.connectionStatus !== 'failed'
      );
      if (connectedSites.length > 0) {
        setSelectedSite(connectedSites[0]);
      }
    }
  }, [sites, selectedSite]);

  const handleAnalyzeAndGenerate = useCallback(async (companyDataOverride?: Partial<CustomizationConfig>) => {
    if (!apiKey) {
      toast.error('Please set your OpenRouter API key in Settings');
      return;
    }

    // Use company data override when auto-triggered from company validation (avoids stale config)
    const configToUse = companyDataOverride && (companyDataOverride.businessName || companyDataOverride.email || companyDataOverride.phone || companyDataOverride.siteUrl || companyDataOverride.address)
      ? { ...config, ...companyDataOverride }
      : config;

    // Auto-select first connected site if none selected
    let siteToUse = selectedSite;
    if (!siteToUse) {
      const connectedSites = sites.filter(s => 
        s.enabled !== false && s.connectionStatus !== 'failed'
      );
      if (connectedSites.length === 0) {
        toast.error('No WordPress sites connected. Please connect a site in the Integrations tab first.');
        return;
      }
      siteToUse = connectedSites[0];
      setSelectedSite(siteToUse);
    }

    setIsAnalyzing(true);
    setAnalysisError(undefined);
    setAnalysisProgress(0);
    setAnalysisMessage('Connecting to WordPress site...');

    try {
      // Step 1: Scan ACF fields from Options Page ONLY via REST API
      setAnalysisProgress(5);
      setAnalysisMessage('Getting ACF field groups from REST API...');
      const acfScanResult = await scanACFOptionsPageOnly(
        siteToUse,
        'options', // Options page slug (ACF v3 endpoint uses "options")
        {
          onProgress: (message, progress) => {
            setAnalysisMessage(message);
            setAnalysisProgress(5 + (progress * 0.4)); // 5-45%
          },
        }
      );

      if (!acfScanResult.success) {
        throw new Error(acfScanResult.error || 'Failed to scan ACF fields');
      }

      if (acfScanResult.fields.length === 0) {
        throw new Error('No ACF fields found. Ensure ACF REST API is properly configured.');
      }

      toast.info(`Found ${acfScanResult.fields.length} ACF field values from ${acfScanResult.fieldGroups.length} field groups`);

      // Step 2: Analyze ACF fields with AI (no config needed - AI will suggest based on field names)
      setAnalysisProgress(50);
      setAnalysisMessage('Analyzing ACF fields with AI...');
      const fields = await analyzeACFFieldsDirectly(
        acfScanResult.fields,
        configToUse,
        {
          apiKey,
          model: getResearchModel(),
          onProgress: (message) => {
            setAnalysisMessage(message);
            if (message.includes('Extracting')) setAnalysisProgress(50);
            else if (message.includes('Grouping')) setAnalysisProgress(60);
            else if (message.includes('Analyzing')) setAnalysisProgress(70);
            else if (message.includes('Parsing')) setAnalysisProgress(90);
            else setAnalysisProgress(80);
          },
        }
      );

      // Step 3: Pre-fill suggestions (use company data when available)
      setAnalysisProgress(88);
      setAnalysisMessage('Preparing fields for review...');
      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:200',message:'Before prefillSuggestions',data:{fieldsCount:fields.length,configToUse,hasBusinessName:!!configToUse.businessName,hasEmail:!!configToUse.email,hasPhone:!!configToUse.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      let fieldsWithSuggestions = prefillSuggestions(fields, configToUse);
      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:203',message:'After prefillSuggestions',data:{fieldsCount:fieldsWithSuggestions.length,sampleSuggestions:fieldsWithSuggestions.slice(0,3).map(f=>({field:f.field,suggestedValue:f.suggestedValue}))},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      // Step 4: Use AI to intelligently match fields to company data (after fields generated)
      const hasCompanyData = configToUse.businessName || configToUse.email || configToUse.phone || configToUse.siteUrl || configToUse.address;
      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:207',message:'Checking if AI matching should run',data:{hasCompanyData,hasApiKey:!!apiKey,configToUse,hasBusinessName:!!configToUse.businessName,hasEmail:!!configToUse.email,hasPhone:!!configToUse.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      if (hasCompanyData && apiKey) {
        setAnalysisProgress(92);
        setAnalysisMessage('Auto-filling fields with company data...');
        setAnalysisProgress(94);
        setAnalysisMessage('Using AI to match fields to company data for validation...');
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:210',message:'Calling intelligentlyMatchFieldsWithAI',data:{fieldsCount:fieldsWithSuggestions.length,configToUse,hasBusinessName:!!configToUse.businessName,hasEmail:!!configToUse.email},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        fieldsWithSuggestions = await intelligentlyMatchFieldsWithAI(
          fieldsWithSuggestions,
          configToUse,
          apiKey,
          getResearchModel(),
          (message) => {
            setAnalysisMessage(message);
          }
        );
        setAnalysisProgress(96);
        setAnalysisMessage('Fields filled – ready for validation');
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:220',message:'After intelligentlyMatchFieldsWithAI',data:{fieldsCount:fieldsWithSuggestions.length,sampleSuggestions:fieldsWithSuggestions.slice(0,5).map(f=>({field:f.field,suggestedValue:f.suggestedValue,hasPlaceholder:f.suggestedValue?.includes('[')||f.suggestedValue?.includes('New')}))},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:225',message:'AI matching SKIPPED',data:{hasCompanyData,hasApiKey:!!apiKey,reason:!hasCompanyData?'No company data':!apiKey?'No API key':'Unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
      }

      // Step 5: Generate strategy
      setAnalysisProgress(98);
      setAnalysisMessage('Generating update strategy...');
      const updateStrategy = generateUpdateStrategy(fieldsWithSuggestions, siteToUse, configToUse);

      // #region agent log
      fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ElementorTemplateProcessor.tsx:227',message:'Setting wordPressFields',data:{fieldsCount:fieldsWithSuggestions.length,sampleFields:fieldsWithSuggestions.slice(0,5).map(f=>({field:f.field,suggestedValue:f.suggestedValue,hasPlaceholder:f.suggestedValue?.includes('[')||f.suggestedValue?.includes('New')}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      setWordPressFields(fieldsWithSuggestions);
      setStrategy(updateStrategy);
      setAnalysisProgress(100);
      setAnalysisMessage('Analysis complete');
      
      toast.success(`Identified ${fieldsWithSuggestions.length} customizable fields across ${updateStrategy.totalPosts} posts`);
      
      if (updateStrategy.warnings.length > 0) {
        updateStrategy.warnings.forEach(warning => toast.warning(warning));
      }

      // Auto-scroll to checklist after a short delay
      setTimeout(() => {
        checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setAnalysisError(errorMessage);
      toast.error(`Analysis failed: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisMessage('');
    }
  }, [selectedSite, sites, config, apiKey, isConfigValid]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = useCallback(() => {
    if (wordPressFields.length === 0) {
      toast.error('No fields available to download. Please analyze first.');
      return;
    }
    try {
      downloadACFFieldsTemplate(wordPressFields);
      toast.success('ACF fields template downloaded');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    }
  }, [wordPressFields]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (wordPressFields.length === 0) {
      toast.error('No fields available. Please analyze first.');
      return;
    }

    try {
      const content = await file.text();
      const updatedFields = parseACFFieldsTemplate(content, wordPressFields);
      
      setWordPressFields(updatedFields);
      toast.success(`Updated ${updatedFields.length} fields from template`);
    } catch (error) {
      console.error('Error parsing template file:', error);
      toast.error('Failed to parse template file. Please check the format.');
    }
  }, [wordPressFields]);

  const handleFieldsChange = useCallback((updatedFields: WordPressCustomizationField[]) => {
    setWordPressFields(updatedFields);
    // Regenerate strategy with updated fields
    if (selectedSite) {
      const newStrategy = generateUpdateStrategy(updatedFields, selectedSite, config);
      setStrategy(newStrategy);
    }
  }, [selectedSite, config]);

  const handleFieldClick = useCallback((field: WordPressCustomizationField) => {
    // Field click handler - show post info
    toast.info(`Field in ${field.location.postType}: ${field.location.postTitle}`, {
      description: field.location.postLink,
    });
  }, []);

  const handleApplyChanges = useCallback(async () => {
    if (wordPressFields.length === 0) {
      toast.error('No fields to update');
      return;
    }

    const approvedFields = wordPressFields.filter(f => f.approved);
    if (approvedFields.length === 0) {
      toast.error('Please approve at least one field');
      return;
    }

    if (!selectedSite) {
      toast.error('No WordPress site selected');
      return;
    }

    // Group approved fields by postId and postType
    const fieldsByPost = new Map<string, { postId: number; postType: string; postTypeEndpoint?: string; fields: Record<string, any> }>();
    
    for (const field of approvedFields) {
      // Only process ACF fields
      if (field.location.fieldSource !== 'acf' || !field.location.acfFieldName) {
        continue;
      }

      const key = `${field.location.postId}-${field.location.postType}`;
      if (!fieldsByPost.has(key)) {
        fieldsByPost.set(key, {
          postId: field.location.postId,
          postType: field.location.postType,
          fields: {}
        });
      }
      
      const postData = fieldsByPost.get(key)!;
      postData.fields[field.location.acfFieldName] = field.suggestedValue;
    }

    if (fieldsByPost.size === 0) {
      toast.error('No ACF fields to update. Please approve ACF fields only.');
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Upload fields for each post
      for (const [key, postData] of fieldsByPost.entries()) {
        try {
          const result = await updateACFFields(
            selectedSite.siteUrl,
            selectedSite.username,
            selectedSite.appPassword,
            postData.postId,
            postData.fields,
            postData.postType,
            undefined, // postTypeEndpoint - let it auto-detect
            {
              verifyAfterUpdate: true
            }
          );

          if (result.success) {
            successCount++;
            toast.success(`Updated ${result.updated.length} field(s) in ${postData.postType}/${postData.postId}`, {
              duration: 2000,
            });
          } else {
            errorCount++;
            const errorMsg = result.error || 'Update failed';
            errors.push(`${postData.postType}/${postData.postId}: ${errorMsg}`);
            toast.error(`Failed to update ${postData.postType}/${postData.postId}: ${errorMsg}`, {
              duration: 4000,
            });
          }
        } catch (error) {
          errorCount++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${postData.postType}/${postData.postId}: ${errorMsg}`);
          toast.error(`Error updating ${postData.postType}/${postData.postId}: ${errorMsg}`, {
            duration: 4000,
          });
        }
      }

      // Summary toast
      if (errorCount === 0) {
        toast.success(`Successfully uploaded ${successCount} post(s) to WordPress!`, {
          duration: 5000,
        });
      } else {
        toast.warning(`Uploaded ${successCount} post(s), ${errorCount} failed.`, {
          description: errors.slice(0, 3).join('; '),
          duration: 8000,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      toast.error(`Upload error: ${errorMsg}`, {
        duration: 5000,
      });
    } finally {
      setIsUploading(false);
    }
  }, [wordPressFields, selectedSite]);

  const currentStep = useMemo(() => {
    if (isAnalyzing) return 'identify';
    if (wordPressFields.length > 0) return 'lock';
    if (selectedSite) return 'scan';
    if (isConfigValid) return 'acquire';
    return 'configure';
  }, [isConfigValid, selectedSite, isAnalyzing, wordPressFields.length]);

  const currentProgress = useMemo(() => {
    if (isAnalyzing) return analysisProgress;
    return getStepProgress(currentStep);
  }, [currentStep, isAnalyzing, analysisProgress]);

  return (
    <div className={cn(
      "w-full bg-[#0a0a0a] border-2 border-green-500/50 rounded-lg",
      "overflow-hidden flex flex-col h-full"
    )}>
      <style>{BREATHE_NEON_ANIMATION}</style>
      
      {/* Professional Header Toolbar - Figma Style */}
      <div className="border-b border-green-500/20 shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <h2 className={cn(getCyberpunkTextClasses('primary'), "text-lg font-semibold font-mono tracking-wide uppercase")}>
              Elementor Template Customizer
            </h2>
            {wordPressFields.length > 0 && (
              <span className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono px-2 py-0.5 rounded bg-green-500/10 border border-green-500/30")}>
                {wordPressFields.length} fields
              </span>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            {wordPressFields.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className={cn(getCyberpunkButtonClasses(), "gap-1.5 font-mono text-xs h-8")}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(getCyberpunkButtonClasses(), "gap-1.5 font-mono text-xs h-8")}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </>
            )}
            <Button
              onClick={() => handleAnalyzeAndGenerate()}
              disabled={!apiKey || sites.length === 0 || isAnalyzing || isUploading}
              className={cn(
                getCyberpunkButtonClasses(true),
                "gap-2 font-mono h-8 px-4",
                (!apiKey || sites.length === 0 || isAnalyzing || isUploading) && "opacity-50 cursor-not-allowed"
              )}
              size="sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs">Generate</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress Indicator - Only show when processing */}
        {(isAnalyzing || isUploading) && (
          <div className="px-6 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn(getCyberpunkTextClasses('secondary'), "text-xs font-mono")}>
                {isUploading ? 'Uploading to WordPress...' : (ELEMENTOR_STEPS.find(s => s.key === currentStep)?.label || 'Processing...')}
              </span>
              <span className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono")}>
                {isUploading ? '...' : `${Math.round(currentProgress)}%`}
              </span>
            </div>
            <Progress value={isUploading ? undefined : currentProgress} className="h-1 bg-green-500/10" />
            {(analysisMessage || isUploading) && (
              <p className={cn(getCyberpunkTextClasses('muted'), "text-xs mt-1.5 font-mono")}>
                {isUploading ? 'Uploading approved fields to WordPress...' : analysisMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error Messages */}
      {analysisError && (
        <div className="shrink-0 px-6 py-3 border-b border-red-500/20 bg-red-500/5">
          <div className={cn("p-2.5 border border-red-500/50 bg-red-500/10 rounded")}>
            <p className={cn("text-xs text-red-300 font-mono")}>
              Error: {analysisError}
            </p>
          </div>
        </div>
      )}

      {!apiKey && !isAnalyzing && (
        <div className="shrink-0 px-6 py-3 border-b border-yellow-500/20 bg-yellow-500/5">
          <p className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono")}>
            Please set your OpenRouter API key in Settings
          </p>
        </div>
      )}

      {apiKey && sites.length === 0 && !isAnalyzing && (
        <div className="shrink-0 px-6 py-3 border-b border-yellow-500/20 bg-yellow-500/5">
          <p className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono")}>
            No WordPress sites connected. Please connect a site in the Integrations tab first.
          </p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6" ref={checklistRef}>
          <CustomizationChecklist
            fields={wordPressFields}
            onFieldsChange={handleFieldsChange}
            onFieldClick={handleFieldClick}
            onApplyChanges={handleApplyChanges}
          />
        </div>
      </div>
    </div>
  );
};
