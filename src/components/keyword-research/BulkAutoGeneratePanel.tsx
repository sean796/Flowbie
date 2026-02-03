import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Upload, 
  Play, 
  Square, 
  Download, 
  FileText,
  Loader2,
  MessageSquare,
  Globe,
} from 'lucide-react';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import { useBulkProcessing } from './bulk/useBulkProcessing';
import { useBulkAutoGenerate } from '@/hooks/use-bulk-auto-generate';
import { usePromptBulkGenerate } from '@/hooks/use-prompt-bulk-generate';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';
import { CSVUploadSection } from './bulk/CSVUploadSection';
import { PromptInputSection } from './bulk/PromptInputSection';
import { GeneratedBlogIdeasList } from './bulk/GeneratedBlogIdeasList';
import { GeneratedFilesDisplay } from './bulk/GeneratedFilesDisplay';
import { EditBlogIdeaDialog } from './bulk/EditBlogIdeaDialog';
import { GSCAnalysisDialog } from './bulk/GSCAnalysisDialog';
import { WordPressMarkdownFilesDisplay } from './bulk/WordPressMarkdownFilesDisplay';
import { ProgressAndStatsDisplay } from './bulk/ProgressAndStatsDisplay';
import { CSVProcessingControls } from './bulk/CSVProcessingControls';
import { useGSCKeywords } from './bulk/useGSCKeywords';

interface BulkAutoGeneratePanelProps {
  apiKey?: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
}

export const BulkAutoGeneratePanel: React.FC<BulkAutoGeneratePanelProps> = ({
  apiKey,
  openRouterApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowPurpose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<'csv' | 'prompt'>('csv');
  
  // Blog generation settings
  const [numberOfBlogs, setNumberOfBlogs] = useState<number>(3);
  const [entityMode, setEntityMode] = useState<'auto' | 'manual' | 'blank'>('blank');
  const [entityValue, setEntityValue] = useState<string>('');
  const [keywordMode, setKeywordMode] = useState<'same' | 'per-blog' | 'gsc-keywords'>('per-blog');
  const [keywordValue, setKeywordValue] = useState<string>('');
  const [optionalPrompt, setOptionalPrompt] = useState<string>('');
  const [titleTemplate, setTitleTemplate] = useState<string>('');
  const [entityList, setEntityList] = useState<string>('');
  const [keywordList, setKeywordList] = useState<string>('');
  const [locationList, setLocationList] = useState<string>('');
  const [numberList, setNumberList] = useState<string>('');
  const [featuredImagePerBlog, setFeaturedImagePerBlog] = useState<boolean>(true);
  const [featuredImageType, setFeaturedImageType] = useState<'ai-generated' | 'google-maps'>('ai-generated');
  
  // Selection state for blog ideas
  const [selectedBlogIndices, setSelectedBlogIndices] = useState<Set<number>>(new Set());
  
  // Edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<CSVRow | null>(null);

  // Connected WordPress site (for target topic)
  const [connectedSite, setConnectedSite] = useState<{ name: string; siteUrl: string } | null>(null);
  
  // WordPress posting options - Multiple sites support
  const [postToWordPress, setPostToWordPress] = useState<boolean>(false);
  const [selectedWordPressSites, setSelectedWordPressSites] = useState<Set<string>>(new Set());
  const [siteConfigs, setSiteConfigs] = useState<Record<string, {
    sitemapType: 'post' | 'entity';
  }>>({});
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('daily');
  const [customInterval, setCustomInterval] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [startDateOption, setStartDateOption] = useState<'immediate' | 'custom'>('immediate');
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string>('09:00');
  
  // Legacy single site state for backward compatibility
  const [wordPressSite, setWordPressSite] = useState<WordPressSite | null>(null);
  const [gscExactKeywords, setGscExactKeywords] = useState<string[]>([]);

  // Track the currently ENABLED site (the active/current site)
  // When a site is enabled, all others are disabled - so there's only one enabled site at a time
  useEffect(() => {
    const updateToEnabledSite = () => {
      const sites = getStoredSites();
      
      // Priority 1: Find enabled site with successful connection status
      let enabledSite = sites.find(s => s.connectionStatus === 'success' && s.enabled !== false);
      
      // Priority 2: If no enabled site with success, find ANY enabled site (newly connected sites may not be tested yet)
      if (!enabledSite) {
        enabledSite = sites.find(s => s.enabled !== false);
      }
      
      if (enabledSite) {
        const newConnectedSite = {
          name: enabledSite.name,
          siteUrl: enabledSite.siteUrl,
        };
        
        setConnectedSite(prev => {
          // Only update if the site has actually changed
          if (!prev || prev.name !== newConnectedSite.name || prev.siteUrl !== newConnectedSite.siteUrl) {
            return newConnectedSite;
          }
          return prev;
        });
        setWordPressSite(enabledSite);
      } else if (sites.length > 0) {
        // Fallback: if no enabled site, use most recent successfully connected site
        const connectedSites = sites.filter(s => s.connectionStatus === 'success');
        const fallbackSite = connectedSites.length > 0 
          ? connectedSites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0]
          : sites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0];
        
        if (fallbackSite) {
          const newConnectedSite = {
            name: fallbackSite.name,
            siteUrl: fallbackSite.siteUrl,
          };
          setConnectedSite(prev => {
            if (!prev || prev.name !== newConnectedSite.name || prev.siteUrl !== newConnectedSite.siteUrl) {
              return newConnectedSite;
            }
            return prev;
          });
          setWordPressSite(fallbackSite);
        }
      } else {
        // No sites available
        setConnectedSite(null);
        setWordPressSite(null);
      }
    };

    // Initial load
    updateToEnabledSite();

    // Listen for storage changes (when sites are enabled/disabled)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'wordpress_sites' || e.key?.includes('wordpress') || e.key?.includes('site')) {
        updateToEnabledSite();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Poll frequently to catch same-window changes (localStorage events don't fire in same window)
    const intervalId = setInterval(() => {
      updateToEnabledSite();
    }, 500); // Check every 500ms for immediate updates

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, []); // Empty deps - effect manages its own state updates

  const {
    userInput,
    setUserInput,
    isGeneratingChecklist,
    hasGeneratedChecklist,
    generatedRows,
    setGeneratedRows,
    wordPressPostsMetadata,
    selectedWordPressPosts,
    wordPressMarkdownFiles,
    handleGenerateChecklist,
    resetPromptGeneration,
    handleRegenerateUnselected,
  } = usePromptBulkGenerate({
    apiKey,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose,
    numberOfBlogs,
    entityMode,
    entityValue,
    keywordMode,
    keywordValue,
    optionalPrompt,
    titleTemplate,
    entityList,
    keywordList,
    locationList,
    numberList,
    featuredImagePerBlog,
    connectedSite: connectedSite || undefined,
    gscExactKeywords: keywordMode === 'gsc-keywords' ? gscExactKeywords : undefined,
  });

  const {
    isProcessing,
    currentRow,
    totalRows,
    status,
    rows,
    setRows,
    fileManager,
    loadCSV,
    processAllRows,
    cancelProcessing,
    downloadFile,
    downloadRowFiles,
    downloadAllFiles,
    stats,
    filesByRow,
  } = useBulkAutoGenerate({
    apiKey,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose,
    featuredImageType,
    connectedSite: connectedSite || undefined,
  });

  // Use GSC keywords hook (after setRows is available)
  const gscKeywords = useGSCKeywords({
    selectedModel,
    temperature,
    maxTokens,
    topP,
    entityMode,
    entityValue,
    optionalPrompt,
    featuredImagePerBlog,
    keywordMode,
    numberOfBlogs,
    inputMode,
    setRows,
    setGscExactKeywords,
    setKeywordMode,
    setNumberOfBlogs,
    setInputMode,
  });

  // Use bulk processing hook
  const { schedulePreview, handleStartProcessing } = useBulkProcessing({
    inputMode,
    rows,
    generatedRows,
    selectedBlogIndices,
    postToWordPress,
    selectedWordPressSites,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    apiKey,
    openRouterApiKey,
    processAllRows,
  });

  // Get the rows to display
  const displayRows = inputMode === 'csv' ? rows : generatedRows;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Bulk Auto-Generate</h3>
            <p className="text-sm text-muted-foreground">
              {inputMode === 'csv' 
                ? 'Upload a CSV file with keyword, entity, title, optional modifier, and optional featuredImage (y/n/google-maps) columns to generate multiple blog blueprints.'
                : 'Enter a prompt to generate multiple blog ideas. The AI will create a checklist of blog posts based on your request.'}
            </p>
          </div>

          {/* Input Mode Toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Input Method</Label>
            <RadioGroup value={inputMode} onValueChange={(value) => {
              setInputMode(value as 'csv' | 'prompt');
              if (value === 'csv') {
                resetPromptGeneration();
                setSelectedBlogIndices(new Set());
              } else if (value === 'prompt') {
                setCsvFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }
            }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="mode-csv" />
                <Label htmlFor="mode-csv" className="cursor-pointer flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  CSV Upload
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prompt" id="mode-prompt" />
                <Label htmlFor="mode-prompt" className="cursor-pointer flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Prompt Input
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* CSV Upload Mode */}
          {inputMode === 'csv' && (
            <CSVUploadSection
              csvFile={csvFile}
              setCsvFile={setCsvFile}
              fileInputRef={fileInputRef}
              rows={rows}
              loadCSV={loadCSV}
              connectedSite={connectedSite}
              isProcessing={isProcessing}
              postToWordPress={postToWordPress}
              setPostToWordPress={setPostToWordPress}
              selectedWordPressSites={selectedWordPressSites}
              setSelectedWordPressSites={setSelectedWordPressSites}
              siteConfigs={siteConfigs}
              setSiteConfigs={setSiteConfigs}
              scheduleFrequency={scheduleFrequency}
              setScheduleFrequency={setScheduleFrequency}
              customInterval={customInterval}
              setCustomInterval={setCustomInterval}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              startDateOption={startDateOption}
              setStartDateOption={setStartDateOption}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              startTime={startTime}
              setStartTime={setStartTime}
            />
          )}

          {/* Prompt Input Mode */}
          {inputMode === 'prompt' && (
            <>
              <PromptInputSection
                numberOfBlogs={numberOfBlogs}
                setNumberOfBlogs={setNumberOfBlogs}
                entityMode={entityMode}
                setEntityMode={setEntityMode}
                entityValue={entityValue}
                setEntityValue={setEntityValue}
                keywordMode={keywordMode}
                setKeywordMode={setKeywordMode}
                keywordValue={keywordValue}
                setKeywordValue={setKeywordValue}
                optionalPrompt={optionalPrompt}
                setOptionalPrompt={setOptionalPrompt}
                titleTemplate={titleTemplate}
                setTitleTemplate={setTitleTemplate}
                entityList={entityList}
                setEntityList={setEntityList}
                keywordList={keywordList}
                setKeywordList={setKeywordList}
                locationList={locationList}
                setLocationList={setLocationList}
                numberList={numberList}
                setNumberList={setNumberList}
                featuredImagePerBlog={featuredImagePerBlog}
                setFeaturedImagePerBlog={setFeaturedImagePerBlog}
                featuredImageType={featuredImageType}
                setFeaturedImageType={setFeaturedImageType}
                connectedSite={connectedSite}
                gscFiles={gscKeywords.gscFiles}
                selectedGscFile={gscKeywords.selectedGscFile}
                setSelectedGscFile={gscKeywords.setSelectedGscFile}
                rows={rows}
                handleOpenGSCAnalysisDialog={gscKeywords.handleOpenGSCAnalysisDialog}
                isFetchingGSC={gscKeywords.isFetchingGSC}
                gscAnalysisSite={gscKeywords.gscAnalysisSite}
                postToWordPress={postToWordPress}
                setPostToWordPress={setPostToWordPress}
                selectedWordPressSites={selectedWordPressSites}
                setSelectedWordPressSites={setSelectedWordPressSites}
                siteConfigs={siteConfigs}
                setSiteConfigs={setSiteConfigs}
                scheduleFrequency={scheduleFrequency}
                setScheduleFrequency={setScheduleFrequency}
                customInterval={customInterval}
                setCustomInterval={setCustomInterval}
                dayOfWeek={dayOfWeek}
                setDayOfWeek={setDayOfWeek}
                startDateOption={startDateOption}
                setStartDateOption={setStartDateOption}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                startTime={startTime}
                setStartTime={setStartTime}
                schedulePreview={schedulePreview}
                generatedRows={generatedRows}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                apiKey={apiKey}
                openRouterApiKey={openRouterApiKey}
                handleGenerateChecklist={handleGenerateChecklist}
                setSelectedBlogIndices={setSelectedBlogIndices}
              />

              <GeneratedBlogIdeasList
                hasGeneratedChecklist={hasGeneratedChecklist}
                generatedRows={generatedRows}
                selectedBlogIndices={selectedBlogIndices}
                setSelectedBlogIndices={setSelectedBlogIndices}
                editingIndex={editingIndex}
                setEditingIndex={setEditingIndex}
                setEditFormData={setEditFormData}
                wordPressPostsMetadata={wordPressPostsMetadata}
                selectedWordPressPosts={selectedWordPressPosts}
                wordPressMarkdownFiles={wordPressMarkdownFiles}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                apiKey={apiKey}
                openRouterApiKey={openRouterApiKey}
                handleStartProcessing={handleStartProcessing}
                handleRegenerateUnselected={handleRegenerateUnselected}
                resetPromptGeneration={resetPromptGeneration}
                setUserInput={setUserInput}
              />
            </>
          )}

          {/* Progress and Stats Display */}
          <ProgressAndStatsDisplay
            isProcessing={isProcessing}
            currentRow={currentRow}
            totalRows={totalRows}
            status={status}
            stats={stats}
            fileManager={fileManager}
            postToWordPress={postToWordPress}
            selectedWordPressSites={selectedWordPressSites}
          />

          {/* Controls - Only show for CSV mode */}
          <CSVProcessingControls
            inputMode={inputMode}
            rows={rows}
            displayRows={displayRows}
            isProcessing={isProcessing}
            apiKey={apiKey}
            openRouterApiKey={openRouterApiKey}
            handleStartProcessing={handleStartProcessing}
            cancelProcessing={cancelProcessing}
          />
        </div>
      </Card>

      {/* WordPress Markdown Files */}
      <WordPressMarkdownFilesDisplay
        wordPressMarkdownFiles={wordPressMarkdownFiles}
      />

      {/* Generated Files */}
      <GeneratedFilesDisplay
        filesByRow={filesByRow}
        displayRows={displayRows}
        stats={stats}
        downloadFile={downloadFile}
        downloadRowFiles={downloadRowFiles}
        downloadAllFiles={downloadAllFiles}
        postToWordPress={postToWordPress}
        selectedWordPressSites={selectedWordPressSites}
      />

      {/* Edit Blog Idea Dialog */}
      <EditBlogIdeaDialog
        editingIndex={editingIndex}
        setEditingIndex={setEditingIndex}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        setGeneratedRows={setGeneratedRows}
      />

      {/* GSC Analysis Dialog */}
      <GSCAnalysisDialog
        open={gscKeywords.gscAnalysisDialogOpen}
        onOpenChange={gscKeywords.setGscAnalysisDialogOpen}
        gscAnalysisSite={gscKeywords.gscAnalysisSite}
        selectedAnalysisMethods={gscKeywords.selectedAnalysisMethods}
        setSelectedAnalysisMethods={gscKeywords.setSelectedAnalysisMethods}
        isFetchingGSC={gscKeywords.isFetchingGSC}
        onAnalyze={gscKeywords.handleFetchGSCQueriesForPrompt}
      />
    </div>
  );
};
