import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Globe, Info } from 'lucide-react';
import type { CSVRow } from '@/lib/bulk-auto-generate';

interface BlogGenerationSettingsProps {
  numberOfBlogs: number;
  setNumberOfBlogs: (value: number) => void;
  entityMode: 'auto' | 'manual' | 'blank';
  setEntityMode: (value: 'auto' | 'manual' | 'blank') => void;
  entityValue: string;
  setEntityValue: (value: string) => void;
  entityList?: string;
  setEntityList?: (value: string) => void;
  keywordMode: 'same' | 'per-blog' | 'gsc-keywords';
  setKeywordMode: (value: 'same' | 'per-blog' | 'gsc-keywords') => void;
  keywordValue: string;
  setKeywordValue: (value: string) => void;
  optionalPrompt: string;
  setOptionalPrompt: (value: string) => void;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: (value: boolean) => void;
  featuredImageType: 'ai-generated' | 'google-maps';
  setFeaturedImageType: (value: 'ai-generated' | 'google-maps') => void;
  connectedSite: { name: string; siteUrl: string } | null;
  gscFiles: Array<{ name: string; content: string }>;
  selectedGscFile: string;
  setSelectedGscFile: (value: string) => void;
  rows: CSVRow[];
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
}

export function BlogGenerationSettings({
  numberOfBlogs,
  setNumberOfBlogs,
  entityMode,
  setEntityMode,
  entityValue,
  setEntityValue,
  entityList = '',
  setEntityList,
  keywordMode,
  setKeywordMode,
  keywordValue,
  setKeywordValue,
  optionalPrompt,
  setOptionalPrompt,
  featuredImagePerBlog,
  setFeaturedImagePerBlog,
  featuredImageType,
  setFeaturedImageType,
  connectedSite,
  gscFiles,
  selectedGscFile,
  setSelectedGscFile,
  rows,
  isGeneratingChecklist,
  isProcessing,
}: BlogGenerationSettingsProps) {
  return (
    <div className="p-4 bg-muted/30 rounded-lg border">
      <div className="mb-3">
        <h4 className="text-sm font-semibold mb-1">Blog Generation Settings</h4>
        <p className="text-xs text-muted-foreground">
          Configure how blogs should be generated. These settings will be applied to all generated blog ideas.
        </p>
      </div>

      {/* Connected Site Indicator */}
      {connectedSite && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-primary">Target Site:</span>
                <span className="text-xs font-medium truncate">{connectedSite.name}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate mb-1.5" title={connectedSite.siteUrl}>
                {connectedSite.siteUrl}
              </div>
              <div className="flex items-start gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Used as knowledge source for generating relevant blog topics (not used as entity)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Number of Blogs */}
        <div className="space-y-1.5">
          <Label htmlFor="number-of-blogs" className="text-xs font-medium">
            How Many Blogs
          </Label>
          <Input
            id="number-of-blogs"
            type="number"
            min="1"
            max="50"
            value={numberOfBlogs}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 1;
              setNumberOfBlogs(Math.max(1, Math.min(50, value)));
            }}
            disabled={isGeneratingChecklist || isProcessing}
            className="h-9"
          />
        </div>

        {/* Entity Mode */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Entity</Label>
          <Select
            value={entityMode}
            onValueChange={(value: 'auto' | 'manual' | 'blank') => setEntityMode(value)}
            disabled={isGeneratingChecklist || isProcessing}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (extract from knowledge base)</SelectItem>
              <SelectItem value="manual">Manual (specify below)</SelectItem>
              <SelectItem value="blank">Blank (no entity)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Keyword Mode */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Keyword</Label>
          <Select
            value={keywordMode}
            onValueChange={(value: 'same' | 'per-blog' | 'gsc-keywords') => setKeywordMode(value)}
            disabled={isGeneratingChecklist || isProcessing}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per-blog">Per Blog (different keyword for each)</SelectItem>
              <SelectItem value="same">Same for All (use keyword below)</SelectItem>
              <SelectItem value="gsc-keywords">GSC Keywords (analyze from Google Search Console)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Conditional Inputs for Entity/Keyword */}
      {(entityMode === 'manual' || keywordMode === 'same') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {entityMode === 'manual' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Entity Names (one per line)</Label>
              <Textarea
                placeholder="Enter entity names, one per line (e.g., business name, brand, location)"
                value={entityList || entityValue || ''}
                onChange={(e) => {
                  if (setEntityList) {
                    setEntityList(e.target.value);
                  } else {
                    setEntityValue(e.target.value);
                  }
                }}
                disabled={isGeneratingChecklist || isProcessing}
                className="min-h-[100px] resize-none text-sm"
              />
            </div>
          )}
          {keywordMode === 'same' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keyword</Label>
              <Input
                placeholder="Enter keyword to use for all blogs"
                value={keywordValue}
                onChange={(e) => setKeywordValue(e.target.value)}
                disabled={isGeneratingChecklist || isProcessing}
                className="h-9"
              />
            </div>
          )}
        </div>
      )}

      {/* GSC Keywords Mode */}
      {keywordMode === 'gsc-keywords' && (
        <div className="mt-3 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select GSC File</Label>
              <Select
                value={selectedGscFile}
                onValueChange={setSelectedGscFile}
                disabled={isProcessing || gscFiles.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={gscFiles.length === 0 ? "No GSC files found" : "Select a GSC file"} />
                </SelectTrigger>
                <SelectContent>
                  {gscFiles.map((file) => (
                    <SelectItem key={file.name} value={file.name}>
                      {file.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gscFiles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No GSC CSV files found in knowledge base. Generate GSC queries in the Integrations tab first.
                </p>
              )}
            </div>

            {rows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {rows.length} keyword{rows.length !== 1 ? 's' : ''} loaded from GSC file
              </p>
            )}
          </div>
        </div>
      )}

      {/* Optional Prompt Modifier */}
      <div className="space-y-1.5 mt-3">
        <Label htmlFor="optional-prompt" className="text-xs font-medium">
          Optional Prompt Modifier
        </Label>
        <Textarea
          id="optional-prompt"
          placeholder="Describe how you'd like the blogs to be generated (e.g., 'beginner-friendly', 'comprehensive guides', 'step-by-step tutorials')..."
          value={optionalPrompt}
          onChange={(e) => setOptionalPrompt(e.target.value)}
          disabled={isGeneratingChecklist || isProcessing}
          className="min-h-[60px] resize-none text-sm"
        />
      </div>

      {/* Per Blog Settings */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="featured-image"
            checked={featuredImagePerBlog}
            onCheckedChange={(checked) => setFeaturedImagePerBlog(checked === true)}
            disabled={isGeneratingChecklist || isProcessing}
          />
          <Label
            htmlFor="featured-image"
            className="text-xs font-normal cursor-pointer"
          >
            Generate Featured Image for each blog
          </Label>
        </div>
        {featuredImagePerBlog && (
          <div className="ml-6 space-y-2">
            <Label htmlFor="featured-image-type" className="text-xs font-normal">
              Image Type:
            </Label>
            <Select
              value={featuredImageType}
              onValueChange={(value: 'ai-generated' | 'google-maps') => setFeaturedImageType(value)}
              disabled={isGeneratingChecklist || isProcessing}
            >
              <SelectTrigger id="featured-image-type" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ai-generated">AI Generated</SelectItem>
                <SelectItem value="google-maps">Google Maps (requires entity)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {featuredImageType === 'google-maps' 
                ? 'Google Maps images are automatically generated when an entity is available. Falls back to AI generation if no entity.'
                : 'AI-generated images are created based on your content and keywords.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
