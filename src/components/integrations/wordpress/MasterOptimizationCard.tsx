import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getCyberpunkButtonClasses, BREATHE_NEON_ANIMATION } from "./cyberpunk-theme";
import { OptimizationSettingsAccordion } from "./OptimizationSettingsPopover";
import type { ImageType } from "@/lib/image-section-analyzer";
import type { WordPressSite } from "../types";

interface MasterOptimizationCardProps {
  sites: WordPressSite[];
  selectedSites: Set<string>;
  onSelectedSitesChange: (sites: Set<string>) => void;
  isActivated: boolean;
  onActivate: () => void;
  masterOptimizationState: any;
  isOptimizingContent: Record<string, boolean>;
  masterOptimizationOptions: {
    optimizeTitle: boolean;
    optimizeMeta: boolean;
    optimizeExcerpt: boolean;
    optimizeContent: boolean;
    optimizeFeaturedImage: boolean;
    featuredImageType?: 'ai-generated' | 'google-maps';
    autoOptimize?: boolean;
    testMode?: boolean;
    hasEntity?: boolean;
  };
  onMasterOptimizationOptionsChange: (options: any) => void;
  masterUpdateMode: 'update' | 'draft';
  onMasterUpdateModeChange: (mode: 'update' | 'draft') => void;
  masterInContentImageType: ImageType | '';
  onMasterInContentImageTypeChange: (type: ImageType | '') => void;
  masterInContentImagePrompt: string;
  onMasterInContentImagePromptChange: (prompt: string) => void;
  onOptimize: () => void;
}

export const MasterOptimizationCard: React.FC<MasterOptimizationCardProps> = ({
  sites,
  selectedSites,
  onSelectedSitesChange,
  isActivated,
  onActivate,
  masterOptimizationState,
  isOptimizingContent,
  masterOptimizationOptions,
  onMasterOptimizationOptionsChange,
  masterUpdateMode,
  onMasterUpdateModeChange,
  masterInContentImageType,
  onMasterInContentImageTypeChange,
  masterInContentImagePrompt,
  onMasterInContentImagePromptChange,
  onOptimize,
}) => {
  if (sites.length === 0) return null;

  return (
    <div className="mb-2">
      <style>{BREATHE_NEON_ANIMATION}</style>
      <Card className={`p-3 ${getCyberpunkCardClasses(false, true)} transition-all duration-300`}>
        <Collapsible open={isActivated} onOpenChange={(open) => {
          if (open && !isActivated) {
            onActivate();
          }
        }}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity">
              <Sparkles className="h-4 w-4 text-green-500" />
              <h3 className={`text-base font-bold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}>
                Master Optimization
              </h3>
              {isActivated && selectedSites.size > 0 && (
                <span className={`ml-2 text-xs ${getCyberpunkTextClasses('secondary')}`}>
                  ({selectedSites.size} site{selectedSites.size !== 1 ? 's' : ''} selected)
                </span>
              )}
            </div>
          </CollapsibleTrigger>

          {!isActivated && (
            <div className="mb-2">
              <Button
                size="default"
                onClick={onActivate}
                className={`w-full ${getCyberpunkButtonClasses(true)}`}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                <span className={getCyberpunkTextClasses('primary')}>
                  Activate Master Optimization
                </span>
              </Button>
            </div>
          )}

          <CollapsibleContent>
            <div className="mb-2">
              <Label className={`text-xs font-semibold mb-1 block ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}>
                Select Sites to Optimize
              </Label>
              <div className="space-y-1 max-h-32 overflow-y-auto border border-green-500/20 rounded p-1.5">
                {sites.map((site) => {
                  const isSelected = selectedSites.has(site.id);
                  
                  return (
                    <div
                      key={site.id}
                      className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer transition-all border border-green-500/20 ${isSelected ? 'bg-green-500/10 border-green-500/50' : 'hover:bg-green-500/5 hover:border-green-500/30'}`}
                      onClick={() => {
                        const newSet = new Set(selectedSites);
                        if (newSet.has(site.id)) {
                          newSet.delete(site.id);
                        } else {
                          newSet.add(site.id);
                        }
                        onSelectedSitesChange(newSet);
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedSites);
                          if (checked) {
                            newSet.add(site.id);
                          } else {
                            newSet.delete(site.id);
                          }
                          onSelectedSitesChange(newSet);
                        }}
                        className="border-green-500/50 data-[state=checked]:bg-green-500/20 data-[state=checked]:border-green-500"
                      />
                      <label className={`${getCyberpunkTextClasses('primary')} text-xs cursor-pointer flex-1`}>
                        {site.name}
                      </label>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedSites.size === sites.length) {
                      onSelectedSitesChange(new Set());
                    } else {
                      onSelectedSitesChange(new Set(sites.map(s => s.id)));
                    }
                  }}
                  className={`text-xs ${getCyberpunkButtonClasses()}`}
                >
                  {selectedSites.size === sites.length
                    ? 'Deselect All'
                    : 'Select All'}
                </Button>
              </div>
            </div>

            <div className="mb-2 pt-2 border-t border-green-500/20">
              <OptimizationSettingsAccordion
                site={sites[0]}
                updateMode={masterUpdateMode}
                optimizationOptions={masterOptimizationOptions}
                onUpdateModeChange={onMasterUpdateModeChange}
                onOptimizationOptionsChange={onMasterOptimizationOptionsChange}
                inContentImageType={masterInContentImageType}
                inContentImagePrompt={masterInContentImagePrompt}
                onInContentImageTypeChange={onMasterInContentImageTypeChange}
                onInContentImagePromptChange={onMasterInContentImagePromptChange}
                isOptimizing={masterOptimizationState.isRunning || Object.values(isOptimizingContent).some(v => v)}
                disabled={masterOptimizationState.isRunning || Object.values(isOptimizingContent).some(v => v)}
              />
            </div>

            <div className="pt-2 border-t border-green-500/20">
              <Button
                size="default"
                onClick={() => {
                  if (selectedSites.size === 0) {
                    toast.error('Please select at least one site.');
                    return;
                  }
                  onOptimize();
                }}
                disabled={selectedSites.size === 0 || masterOptimizationState.isRunning || Object.values(isOptimizingContent).some(v => v)}
                className={`w-full ${getCyberpunkButtonClasses(selectedSites.size > 0)}`}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                <span className={getCyberpunkTextClasses('primary')}>
                  Optimize Selected Sites
                </span>
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};
