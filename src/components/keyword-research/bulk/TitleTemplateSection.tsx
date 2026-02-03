import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Info } from 'lucide-react';
import { parseTitleTemplate } from '@/lib/title-template-parser';

interface TitleTemplateSectionProps {
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
  numberOfBlogs: number;
  entityMode: 'auto' | 'manual' | 'blank';
  entityValue: string;
  keywordMode: 'same' | 'per-blog' | 'gsc-keywords';
  keywordValue: string;
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
}

export function TitleTemplateSection({
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
  numberOfBlogs,
  entityMode,
  entityValue,
  keywordMode,
  keywordValue,
  isGeneratingChecklist,
  isProcessing,
}: TitleTemplateSectionProps) {
  const parseList = (list: string): string[] => {
    if (!list.trim()) return [];
    return list
      .split(/[,\n]/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  };

  return (
    <div className="space-y-3 mt-3">
      {/* Variable Lists */}
      <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
        <p className="text-xs font-medium text-muted-foreground">
          Variable Lists (one per line or comma-separated)
        </p>
        
        {titleTemplate.includes('[Entity]') && (
          <div className="space-y-1.5">
            <Label htmlFor="entity-list" className="text-xs font-medium">
              [Entity] Values
            </Label>
            <Textarea
              id="entity-list"
              placeholder="Los Angeles&#10;New York&#10;Chicago"
              value={entityList}
              onChange={(e) => setEntityList(e.target.value)}
              disabled={isGeneratingChecklist || isProcessing}
              className="min-h-[60px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              One value per line or comma-separated. Will be used in order for each blog post.
            </p>
          </div>
        )}

        {titleTemplate.includes('[Keyword]') && (
          <div className="space-y-1.5">
            <Label htmlFor="keyword-list" className="text-xs font-medium">
              [Keyword] Values
            </Label>
            <Textarea
              id="keyword-list"
              placeholder="window blinds&#10;custom blinds&#10;blinds installation"
              value={keywordList}
              onChange={(e) => setKeywordList(e.target.value)}
              disabled={isGeneratingChecklist || isProcessing}
              className="min-h-[60px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              One value per line or comma-separated. Will be used in order for each blog post.
            </p>
          </div>
        )}

        {titleTemplate.includes('[Location]') && (
          <div className="space-y-1.5">
            <Label htmlFor="location-list" className="text-xs font-medium">
              [Location] Values
            </Label>
            <Textarea
              id="location-list"
              placeholder="California&#10;Texas&#10;Florida"
              value={locationList}
              onChange={(e) => setLocationList(e.target.value)}
              disabled={isGeneratingChecklist || isProcessing}
              className="min-h-[60px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              One value per line or comma-separated. Will be used in order for each blog post.
            </p>
          </div>
        )}

        {titleTemplate.includes('[Number]') && (
          <div className="space-y-1.5">
            <Label htmlFor="number-list" className="text-xs font-medium">
              [Number] Values
            </Label>
            <Textarea
              id="number-list"
              placeholder="1&#10;2&#10;3"
              value={numberList}
              onChange={(e) => setNumberList(e.target.value)}
              disabled={isGeneratingChecklist || isProcessing}
              className="min-h-[60px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              One value per line or comma-separated. Will be used in order for each blog post. If empty, sequential numbers (1, 2, 3...) will be used.
            </p>
          </div>
        )}

        {/* Preview */}
        <div className="mt-2 p-2 bg-muted/50 rounded border border-dashed">
          <p className="text-xs text-muted-foreground mb-1">Preview (first 3 examples):</p>
          <div className="space-y-1">
            {Array.from({ length: Math.min(3, numberOfBlogs) }, (_, i) => {
              const entities = parseList(entityList);
              const keywords = parseList(keywordList);
              const locations = parseList(locationList);
              const numbers = parseList(numberList);
              
              const vars: Record<string, string> = {
                Entity: entities[i] || entities[entities.length - 1] || (entityMode === 'manual' && entityValue ? entityValue : 'Los Angeles'),
                Keyword: keywords[i] || keywords[keywords.length - 1] || (keywordMode === 'same' && keywordValue ? keywordValue : 'window blinds'),
                Location: locations[i] || locations[locations.length - 1] || 'California',
                Number: numbers[i] || numbers[numbers.length - 1] || String(i + 1),
              };
              return (
                <p key={i} className="text-xs font-medium">
                  {i + 1}. {parseTitleTemplate(titleTemplate, vars)}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
