import React, { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { InContentImageGenerator } from './InContentImageGenerator';
import type { ImageType } from '@/lib/image-section-analyzer';
import { type WordPressSite } from '../types';
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from './cyberpunk-theme';
import { useOptimizationOptions, type OptimizationOptions } from '@/hooks/use-optimization-options';

interface OptimizationSettingsAccordionProps {
  site: WordPressSite;
  updateMode: 'update' | 'draft';
  optimizationOptions: OptimizationOptions;
  onUpdateModeChange: (mode: 'update' | 'draft') => void;
  onOptimizationOptionsChange: (options: OptimizationOptions) => void;
  inContentImageType?: ImageType | '';
  inContentImagePrompt?: string;
  onInContentImageTypeChange?: (imageType: ImageType | '') => void;
  onInContentImagePromptChange?: (prompt: string) => void;
  isOptimizing: boolean;
  disabled?: boolean;
}

export const OptimizationSettingsAccordion: React.FC<OptimizationSettingsAccordionProps> = ({
  site,
  updateMode,
  optimizationOptions,
  onUpdateModeChange,
  onOptimizationOptionsChange,
  inContentImageType = '',
  inContentImagePrompt = '',
  onInContentImageTypeChange,
  onInContentImagePromptChange,
  isOptimizing,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const {
    optimizeTitle,
    optimizeMeta,
    optimizeExcerpt,
    optimizeContent,
    optimizeFeaturedImage,
    featuredImageType,
    autoOptimize,
    testMode,
    hasEntity,
    optimizeExtraText,
    optimizeExtraImage,
    handleOptimizeTitleChange,
    handleOptimizeMetaChange,
    handleOptimizeExcerptChange,
    handleOptimizeContentChange,
    handleOptimizeFeaturedImageChange,
    handleFeaturedImageTypeChange,
    handleAutoOptimizeChange,
    handleTestModeChange,
    handleHasEntityChange,
    handleOptimizeExtraTextChange,
    handleOptimizeExtraImageChange,
  } = useOptimizationOptions({
    optimizationOptions,
    onOptimizationOptionsChange,
  });

  const isCustom =
    !optimizeTitle ||
    !optimizeMeta ||
    !optimizeExcerpt ||
    !optimizeContent ||
    optimizeFeaturedImage ||
    testMode ||
    optimizeExtraText ||
    optimizeExtraImage ||
    inContentImageType;

  const isDisabled = disabled || isOptimizing;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-2 border border-green-500/20 rounded">
        <CollapsibleTrigger
          disabled={isDisabled}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-black hover:text-white transition-colors ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}
        >
          <span>Optimization Options</span>
          <div className="flex items-center gap-2">
            {isCustom && (
              <span className={`text-xs ${getCyberpunkTextClasses('muted')} font-normal`}>(Custom)</span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 space-y-4 border-t border-green-500/20 bg-green-500/5">
            {/* Update Mode Toggle */}
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="update-mode-toggle"
                className={`text-sm font-semibold cursor-pointer flex-1 ${getCyberpunkTextClasses('primary')} uppercase tracking-wider transition-colors ${
                  isDisabled ? 'opacity-50' : 'hover:text-green-200'
                }`}
                onClick={() => !isDisabled && onUpdateModeChange(updateMode === 'update' ? 'draft' : 'update')}
              >
                {updateMode === 'update' ? 'Update Existing' : 'Create Draft'}
              </Label>
              <Switch
                id="update-mode-toggle"
                checked={updateMode === 'update'}
                onCheckedChange={(checked) => onUpdateModeChange(checked ? 'update' : 'draft')}
                disabled={isDisabled}
                className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-green-500/20 transition-all duration-300 ease-in-out data-[state=checked]:shadow-[0_0_15px_rgba(34,197,94,0.4)]"
              />
            </div>

            {/* Optimization Options - Grid Layout */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-title"
                    checked={optimizeTitle}
                    onCheckedChange={handleOptimizeTitleChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-title" className="text-sm font-medium cursor-pointer">
                    Title
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-meta"
                    checked={optimizeMeta}
                    onCheckedChange={handleOptimizeMetaChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-meta" className="text-sm font-medium cursor-pointer">
                    Meta
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-excerpt"
                    checked={optimizeExcerpt}
                    onCheckedChange={handleOptimizeExcerptChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-excerpt" className="text-sm font-medium cursor-pointer">
                    Meta Description
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-content"
                    checked={optimizeContent}
                    onCheckedChange={handleOptimizeContentChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-content" className="text-sm font-medium cursor-pointer">
                    Content
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-featured-image"
                    checked={optimizeFeaturedImage}
                    onCheckedChange={handleOptimizeFeaturedImageChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-featured-image" className="text-sm font-medium cursor-pointer">
                    Featured Image
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="test-mode"
                    checked={testMode}
                    onCheckedChange={handleTestModeChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label
                    htmlFor="test-mode"
                    className="text-sm font-medium cursor-pointer"
                    title="Test Mode: Skip all API research and use hardcoded keyword 'digital marketing near me'"
                  >
                    Test Mode
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-extra-text"
                    checked={optimizeExtraText}
                    onCheckedChange={handleOptimizeExtraTextChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-extra-text" className="text-sm font-medium cursor-pointer">
                    Extra Text
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="optimize-extra-image"
                    checked={optimizeExtraImage}
                    onCheckedChange={handleOptimizeExtraImageChange}
                    disabled={isDisabled}
                    className="border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                  />
                  <Label htmlFor="optimize-extra-image" className="text-sm font-medium cursor-pointer">
                    Extra Image
                  </Label>
                </div>
              </div>
            </div>

            {/* Entity Toggle - 3-state: Auto (undefined), Yes (true), No (false) */}
            <div className="pt-2 border-t border-green-500/20 space-y-2">
              <Label className={`text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
                Entity Mode (Location-Based Content)
              </Label>
              <Select
                value={hasEntity === undefined ? 'auto' : hasEntity ? 'yes' : 'no'}
                onValueChange={(value: 'auto' | 'yes' | 'no') => {
                  if (value === 'auto') handleHasEntityChange(undefined);
                  else if (value === 'yes') handleHasEntityChange(true);
                  else handleHasEntityChange(false);
                }}
                disabled={isDisabled}
              >
                <SelectTrigger className={`h-9 text-sm ${getCyberpunkButtonClasses()}`}>
                  <SelectValue placeholder="Select entity mode" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="yes">Has Entity (Location-based)</SelectItem>
                  <SelectItem value="no">No Entity (Regular blog)</SelectItem>
                </SelectContent>
              </Select>
              <p className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                {hasEntity === undefined 
                  ? 'AI will automatically detect if this post is entity/location-based.'
                  : hasEntity 
                    ? 'Treat as entity page - will include location context and local SEO optimization.'
                    : 'Treat as regular blog post - no location mentions or entity targeting.'}
              </p>
            </div>

            {/* Featured Image Type Selection - shown when optimizeFeaturedImage is enabled */}
            {optimizeFeaturedImage && (
              <div className="pt-2 border-t border-green-500/20 space-y-2">
                <Label className={`text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
                  Featured Image Type
                </Label>
                <Select
                  value={featuredImageType || 'ai-generated'}
                  onValueChange={(value: 'ai-generated' | 'google-maps') => handleFeaturedImageTypeChange(value)}
                  disabled={isDisabled}
                >
                  <SelectTrigger className={`h-9 text-sm ${getCyberpunkButtonClasses()}`}>
                    <SelectValue placeholder="Select image type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
                    <SelectItem value="ai-generated">AI Generated</SelectItem>
                    <SelectItem value="google-maps">Google Maps (requires entity)</SelectItem>
                  </SelectContent>
                </Select>
                <p className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                  {featuredImageType === 'google-maps' 
                    ? 'Google Maps images are automatically generated when an entity is detected/chosen. Falls back to AI generation if no entity is available.'
                    : 'AI-generated images are created based on your content and keywords.'}
                </p>
              </div>
            )}

            {/* In-Content Image Options */}
            {onInContentImageTypeChange && onInContentImagePromptChange && (
              <div className="pt-2 border-t border-green-500/20">
                <InContentImageGenerator
                  imageType={inContentImageType}
                  userPrompt={inContentImagePrompt}
                  onImageTypeChange={onInContentImageTypeChange}
                  onUserPromptChange={onInContentImagePromptChange}
                  disabled={isDisabled}
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// Keep the old export name for backward compatibility during transition
export const OptimizationSettingsPopover = OptimizationSettingsAccordion;
