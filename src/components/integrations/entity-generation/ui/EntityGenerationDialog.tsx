/**
 * Entity Generation Dialog Component
 * Main dialog for entity generation
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Download, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import type { WordPressSite } from "../../types";
import type { CriteriaData } from "../types";
import type { EntityGenerationProgress } from "../hooks/useEntityGeneration";

interface EntityGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  generatedEntities: string[];
  wikipediaLinks: Record<string, string>;
  criteriaInfo: Record<string, CriteriaData>;
  generalCriteriaInfo: string | undefined;
  selectedEntity: string | null;
  onSelectEntity: (entity: string | null) => void;
  entityCount: number;
  entityPromptModifier: string;
  onEntityCountChange: (count: number) => void;
  onEntityPromptModifierChange: (modifier: string) => void;
  onGenerate: () => void;
  onOpenCsvDialog: () => void;
  isGenerating: boolean;
  entityGenerationProgress: EntityGenerationProgress | undefined;
}

export const EntityGenerationDialog: React.FC<EntityGenerationDialogProps> = ({
  open,
  onOpenChange,
  pendingEntitySite,
  pendingEntitySitemap,
  generatedEntities,
  wikipediaLinks,
  criteriaInfo,
  generalCriteriaInfo,
  selectedEntity,
  onSelectEntity,
  entityCount,
  entityPromptModifier,
  onEntityCountChange,
  onEntityPromptModifierChange,
  onGenerate,
  onOpenCsvDialog,
  isGenerating,
  entityGenerationProgress
}) => {
  const storageKey = pendingEntitySite && pendingEntitySitemap 
    ? `${pendingEntitySite.id}-${pendingEntitySitemap}` 
    : null;
  
  const hasGeneratedEntities = storageKey && generatedEntities.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Generate Origins</DialogTitle>
          <DialogDescription>
            {pendingEntitySite && pendingEntitySitemap && (
              <>
                Generate location origins for {pendingEntitySite.name} based on service-area sitemap analysis.
                <br />
                <span className="text-xs text-muted-foreground">Sitemap: {pendingEntitySitemap}</span>
                {hasGeneratedEntities && !isGenerating && (
                  <span className="block mt-2 text-green-600">
                    {generatedEntities.length} origins generated!
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-y-auto flex-1">
          {isGenerating && (
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 mb-4">
              <div className="flex items-center gap-2 font-semibold text-primary mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Agentic entity generation
              </div>
              {entityGenerationProgress?.currentMessage && (
                <p className="text-sm text-foreground mb-2">{entityGenerationProgress.currentMessage}</p>
              )}
              {entityGenerationProgress?.stepLog && entityGenerationProgress.stepLog.length > 0 && (
                <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto font-mono space-y-0.5 border border-border rounded p-2 bg-background">
                  {entityGenerationProgress.stepLog.map((step, i) => (
                    <div key={i}>{step}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {pendingEntitySite && pendingEntitySitemap && !hasGeneratedEntities && !isGenerating && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="entityCount">Number of origins to generate</Label>
                <Input
                  id="entityCount"
                  type="number"
                  min="1"
                  max="50"
                  value={entityCount}
                  onChange={(e) => onEntityCountChange(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="bg-input border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the number of location origins you want to generate (1-50)
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entityPromptModifier">Optional Prompt Modifier</Label>
                <Input
                  id="entityPromptModifier"
                  type="text"
                  value={entityPromptModifier}
                  onChange={(e) => onEntityPromptModifierChange(e.target.value)}
                  placeholder="e.g., high income neighborhoods in edmonton, streets in calgary"
                  className="bg-input border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Add specific criteria to guide origin generation (e.g., "high income neighborhoods in edmonton", "streets in calgary")
                </p>
              </div>
            </div>
          )}

          {hasGeneratedEntities && !isGenerating && (
            <div className="flex-1 grid grid-cols-2 gap-4 py-4 overflow-hidden">
              {/* Left Column: Entity List */}
              <div className="flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold block">Generated Origins (with Wikipedia pages):</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const entitiesText = generatedEntities.join('\n');
                      navigator.clipboard.writeText(entitiesText).then(() => {
                        toast.success('Origins copied to clipboard!');
                      }).catch(() => {
                        toast.error('Failed to copy to clipboard');
                      });
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy All
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  <ul className="space-y-1">
                    {generatedEntities.map((entity, index) => {
                      const wikiUrl = wikipediaLinks[entity];
                      const isSelected = selectedEntity === entity;
                      return (
                        <li 
                          key={index} 
                          className={`text-sm text-foreground py-2 px-2 rounded flex items-center justify-between group cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/20 border border-primary' : 'hover:bg-accent'
                          }`}
                          onClick={() => onSelectEntity(entity)}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className={isSelected ? 'font-semibold' : ''}>{entity}</span>
                            {wikiUrl && (
                              <a
                                href={wikiUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline"
                                title="View Wikipedia page"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(entity).then(() => {
                                toast.success('Origin copied!');
                              }).catch(() => {
                                toast.error('Failed to copy');
                              });
                            }}
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Right Column: Criteria Information */}
              <div className="flex flex-col overflow-hidden">
                <Label className="text-sm font-semibold block mb-2">Criteria Information:</Label>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  {selectedEntity ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Selected Origin</div>
                        <div className="font-semibold text-sm">{selectedEntity}</div>
                      </div>
                      {(() => {
                        const wikiUrl = wikipediaLinks[selectedEntity];
                        const criteriaData = criteriaInfo[selectedEntity];
                        
                        return (
                          <>
                            {wikiUrl && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Wikipedia</div>
                                <a
                                  href={wikiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-sm flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View Wikipedia page
                                </a>
                              </div>
                            )}
                            {generalCriteriaInfo && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">General Criteria</div>
                                <div className="text-sm">{generalCriteriaInfo}</div>
                              </div>
                            )}
                            {criteriaData && (
                              <>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Validation Status</div>
                                  <div className="text-sm">
                                    <span className={criteriaData.matches ? 'text-green-600 font-semibold' : 'text-red-600'}>
                                      {criteriaData.matches ? '✓ Matches Criteria' : '✗ Does Not Match'}
                                    </span>
                                  </div>
                                </div>
                                {criteriaData.confidence > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                                    <div className="text-sm">{criteriaData.confidence}%</div>
                                  </div>
                                )}
                                {criteriaData.rankingValue !== undefined && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Ranking Value</div>
                                    <div className="text-sm">{criteriaData.rankingValue}</div>
                                  </div>
                                )}
                                {criteriaData.extractedData && Object.keys(criteriaData.extractedData).length > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Extracted Data</div>
                                    <div className="text-sm space-y-1">
                                      {Object.entries(criteriaData.extractedData).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                          <span className="font-medium">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            {!criteriaData && generalCriteriaInfo && (
                              <div className="text-xs text-muted-foreground italic">
                                No specific validation data available for this origin.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      Select an origin from the list to view its criteria information.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {hasGeneratedEntities ? 'Close' : 'Cancel'}
          </Button>
          {hasGeneratedEntities && (
            <Button
              variant="default"
              onClick={onOpenCsvDialog}
            >
              <Download className="h-4 w-4 mr-2" />
              Generate CSV Template
            </Button>
          )}
          {!hasGeneratedEntities && (
            <Button
              onClick={onGenerate}
              disabled={!entityCount || entityCount < 1 || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Origins
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
