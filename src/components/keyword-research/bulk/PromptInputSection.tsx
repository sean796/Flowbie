import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, Loader2, MessageSquare, Search } from 'lucide-react';
import { WordPressPostingConfig } from './WordPressPostingConfig';
import { BlogGenerationSettings } from './BlogGenerationSettings';
import { TitleTemplateSection } from './TitleTemplateSection';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import type { CSVRow } from '@/lib/bulk-auto-generate';

interface SiteConfig {
  sitemapType: 'post' | 'entity';
}

interface PromptInputSectionProps {
  // Blog generation settings
  numberOfBlogs: number;
  setNumberOfBlogs: (value: number) => void;
  entityMode: 'auto' | 'manual' | 'blank';
  setEntityMode: (value: 'auto' | 'manual' | 'blank') => void;
  entityValue: string;
  setEntityValue: (value: string) => void;
  keywordMode: 'same' | 'per-blog' | 'gsc-keywords';
  setKeywordMode: (value: 'same' | 'per-blog' | 'gsc-keywords') => void;
  keywordValue: string;
  setKeywordValue: (value: string) => void;
  optionalPrompt: string;
  setOptionalPrompt: (value: string) => void;
  titleTemplate: string;
  setTitleTemplate: (value: string) => void;
  entityList: string;
  setEntityList: (value: string) => void;
  keywordList: string;
  setKeywordList: (value: string) => void;
  locationList: string;
  setLocationList: (value: string) => void;
  numberList: string;
  setNumberList: (value: string) => void;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: (value: boolean) => void;
  featuredImageType: 'ai-generated' | 'google-maps';
  setFeaturedImageType: (value: 'ai-generated' | 'google-maps') => void;
  connectedSite: { name: string; siteUrl: string } | null;
  // GSC
  gscFiles: Array<{ name: string; content: string }>;
  selectedGscFile: string;
  setSelectedGscFile: (value: string) => void;
  rows: CSVRow[];
  handleOpenGSCAnalysisDialog: () => void;
  isFetchingGSC: boolean;
  gscAnalysisSite: any;
  // WordPress posting
  postToWordPress: boolean;
  setPostToWordPress: (value: boolean) => void;
  selectedWordPressSites: Set<string>;
  setSelectedWordPressSites: (value: Set<string>) => void;
  siteConfigs: Record<string, SiteConfig>;
  setSiteConfigs: (value: Record<string, SiteConfig> | ((prev: Record<string, SiteConfig>) => Record<string, SiteConfig>)) => void;
  scheduleFrequency: ScheduleFrequency;
  setScheduleFrequency: (value: ScheduleFrequency) => void;
  customInterval: number;
  setCustomInterval: (value: number) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  startDateOption: 'immediate' | 'custom';
  setStartDateOption: (value: 'immediate' | 'custom') => void;
  customStartDate: Date;
  setCustomStartDate: (value: Date) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  schedulePreview: string;
  generatedRows: CSVRow[];
  // Actions
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  handleGenerateChecklist: () => Promise<void>;
  setSelectedBlogIndices: (indices: Set<number>) => void;
}

export function PromptInputSection({
  numberOfBlogs,
  setNumberOfBlogs,
  entityMode,
  setEntityMode,
  entityValue,
  setEntityValue,
  keywordMode,
  setKeywordMode,
  keywordValue,
  setKeywordValue,
  optionalPrompt,
  setOptionalPrompt,
  titleTemplate,
  setTitleTemplate,
  entityList,
  setEntityList,
  keywordList,
  setKeywordList,
  locationList,
  setLocationList,
  numberList,
  setNumberList,
  featuredImagePerBlog,
  setFeaturedImagePerBlog,
  featuredImageType,
  setFeaturedImageType,
  connectedSite,
  gscFiles,
  selectedGscFile,
  setSelectedGscFile,
  rows,
  handleOpenGSCAnalysisDialog,
  isFetchingGSC,
  gscAnalysisSite,
  postToWordPress,
  setPostToWordPress,
  selectedWordPressSites,
  setSelectedWordPressSites,
  siteConfigs,
  setSiteConfigs,
  scheduleFrequency,
  setScheduleFrequency,
  customInterval,
  setCustomInterval,
  dayOfWeek,
  setDayOfWeek,
  startDateOption,
  setStartDateOption,
  customStartDate,
  setCustomStartDate,
  startTime,
  setStartTime,
  schedulePreview,
  generatedRows,
  isGeneratingChecklist,
  isProcessing,
  apiKey,
  openRouterApiKey,
  handleGenerateChecklist,
  setSelectedBlogIndices,
}: PromptInputSectionProps) {
  return (
    <div className="space-y-4">
      {/* Blog Generation Settings */}
      <BlogGenerationSettings
        numberOfBlogs={numberOfBlogs}
        setNumberOfBlogs={setNumberOfBlogs}
        entityMode={entityMode}
        setEntityMode={setEntityMode}
        entityValue={entityValue}
        setEntityValue={setEntityValue}
        entityList={entityList}
        setEntityList={setEntityList}
        keywordMode={keywordMode}
        setKeywordMode={setKeywordMode}
        keywordValue={keywordValue}
        setKeywordValue={setKeywordValue}
        optionalPrompt={optionalPrompt}
        setOptionalPrompt={setOptionalPrompt}
        featuredImagePerBlog={featuredImagePerBlog}
        setFeaturedImagePerBlog={setFeaturedImagePerBlog}
        featuredImageType={featuredImageType}
        setFeaturedImageType={setFeaturedImageType}
        connectedSite={connectedSite}
        gscFiles={gscFiles}
        selectedGscFile={selectedGscFile}
        setSelectedGscFile={setSelectedGscFile}
        rows={rows}
        isGeneratingChecklist={isGeneratingChecklist}
        isProcessing={isProcessing}
      />

      {/* Title Template Section */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1.5">
          <Label htmlFor="title-template" className="text-xs font-medium">
            Title Template (Optional)
          </Label>
          <Input
            id="title-template"
            placeholder="e.g., Blinds Near [Entity] or [Keyword] in [Entity]"
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
            disabled={isGeneratingChecklist || isProcessing}
            className="h-9"
          />
          <div className="flex items-start gap-1.5">
            <Info className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Available variables: <code className="text-xs bg-muted px-1 py-0.5 rounded">[Entity]</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">[Keyword]</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">[Location]</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">[Number]</code>. Leave empty to use AI-generated titles.
            </p>
          </div>
        </div>
        {titleTemplate && (
          <TitleTemplateSection
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
            numberOfBlogs={numberOfBlogs}
            entityMode={entityMode}
            entityValue={entityValue}
            keywordMode={keywordMode}
            keywordValue={keywordValue}
            isGeneratingChecklist={isGeneratingChecklist}
            isProcessing={isProcessing}
          />
        )}
      </div>

      {/* GSC Keyword Analysis Section */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <div className="mb-3">
          <h4 className="text-sm font-semibold mb-1">GSC Keyword Analysis</h4>
          <p className="text-xs text-muted-foreground">
            Fetch and analyze keywords from Google Search Console to use for blog generation
          </p>
        </div>

        <Button
          onClick={handleOpenGSCAnalysisDialog}
          disabled={isFetchingGSC || isGeneratingChecklist || isProcessing}
          variant="outline"
          className="w-full"
        >
          {isFetchingGSC ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing GSC Keywords...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Fetch & Analyze GSC Keywords
            </>
          )}
        </Button>
        {gscAnalysisSite && (
          <p className="text-xs text-muted-foreground mt-2">
            Will analyze keywords from: {gscAnalysisSite.name}
          </p>
        )}
      </div>

      {/* WordPress Posting Options */}
      <WordPressPostingConfig
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
        totalRows={generatedRows.length}
        isDisabled={isGeneratingChecklist || isProcessing}
        checkboxId="post-to-wordpress"
        connectedSite={connectedSite}
      />

      {/* Generate Button */}
      <div className="space-y-2">
        <Button
          onClick={async () => {
            setSelectedBlogIndices(new Set());
            await handleGenerateChecklist();
          }}
          disabled={isGeneratingChecklist || isProcessing || !apiKey || !openRouterApiKey}
          className="w-full bg-primary hover:bg-primary/90 text-black text-lg h-12"
          size="lg"
        >
          {isGeneratingChecklist ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating Blog Ideas...
            </>
          ) : (
            <>
              <MessageSquare className="h-5 w-5 mr-2" />
              Generate Blog Ideas
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Click to generate {numberOfBlogs} blog idea{numberOfBlogs !== 1 ? 's' : ''} based on your settings
        </p>
      </div>
    </div>
  );
}
