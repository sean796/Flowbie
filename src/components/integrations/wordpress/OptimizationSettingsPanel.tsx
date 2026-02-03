import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, RotateCcw } from "lucide-react";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

export interface OptimizationSettings {
  model: string; // Production model for content generation
  researchModel: string; // Research model for research operations
  temperature: number;
  maxTokens: number;
  topP: number;
}

export const DEFAULT_SETTINGS: OptimizationSettings = {
  model: "google/gemini-2.5-flash",
  researchModel: "google/gemini-2.5-flash-lite",
  temperature: 1.0,
  maxTokens: 4000,
  topP: 0.9,
};

interface OptimizationSettingsPanelProps {
  site: WordPressSite;
  settings: OptimizationSettings;
  onSettingsChange: (settings: OptimizationSettings) => void;
  disabled?: boolean;
}

export const OptimizationSettingsPanel: React.FC<OptimizationSettingsPanelProps> = ({
  site,
  settings,
  onSettingsChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSliderChange = (setter: (v: number) => void) => (values: number[]) => {
    setter(values[0]);
  };

  const handleInputChange = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };

  const handleMaxTokensInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      onSettingsChange({ ...settings, maxTokens: value });
    }
  };

  const handleReset = () => {
    onSettingsChange(DEFAULT_SETTINGS);
  };

  const isDefault = 
    settings.model === DEFAULT_SETTINGS.model &&
    settings.researchModel === DEFAULT_SETTINGS.researchModel &&
    settings.temperature === DEFAULT_SETTINGS.temperature &&
    settings.maxTokens === DEFAULT_SETTINGS.maxTokens &&
    settings.topP === DEFAULT_SETTINGS.topP;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-2 border border-green-500/20 rounded">
        <CollapsibleTrigger
          disabled={disabled}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-black hover:text-white transition-colors ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}
        >
          <span>Optimization Settings</span>
          <div className="flex items-center gap-2">
            {!isDefault && (
              <span className={`text-xs ${getCyberpunkTextClasses('muted')} font-normal`}>(Custom)</span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 space-y-4 border-t border-green-500/20 bg-green-500/5">
            {/* Production Model Selection */}
            <div className="space-y-2">
              <Label className={`text-xs font-medium ${getCyberpunkTextClasses('muted')} block`}>
                Production Model
              </Label>
              <Select
                value={settings.model}
                onValueChange={(value) => onSettingsChange({ ...settings, model: value })}
                disabled={disabled}
              >
                <SelectTrigger className={`h-8 text-xs ${getCyberpunkButtonClasses()}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
                  <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                  <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Research Model Selection */}
            <div className="space-y-2">
              <Label className={`text-xs font-medium ${getCyberpunkTextClasses('muted')} block`}>
                Research Model
              </Label>
              <Select
                value={settings.researchModel}
                onValueChange={(value) => onSettingsChange({ ...settings, researchModel: value })}
                disabled={disabled}
              >
                <SelectTrigger className={`h-8 text-xs ${getCyberpunkButtonClasses()}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
                  <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                  <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Temperature Control */}
            <div className="space-y-2">
              <Label className={`text-xs font-medium ${getCyberpunkTextClasses('muted')} block`}>
                Temperature: {settings.temperature.toFixed(2)}
              </Label>
              <Slider
                min={0.0}
                max={2.0}
                step={0.01}
                value={[settings.temperature]}
                onValueChange={handleSliderChange((value) => 
                  onSettingsChange({ ...settings, temperature: value })
                )}
                disabled={disabled}
                className="w-full"
              />
              <Input
                type="number"
                step="0.01"
                min="0.0"
                max="2.0"
                value={settings.temperature}
                onChange={handleInputChange((value) => 
                  onSettingsChange({ ...settings, temperature: value })
                )}
                disabled={disabled}
                className={`h-8 text-xs bg-[#1a1a1a] border border-green-500/50 text-green-300 font-mono ${getCyberpunkTextClasses('secondary')}`}
              />
              <p className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                Controls randomness. Lower = more deterministic, Higher = more creative. (0.0 - 2.0)
              </p>
            </div>

            {/* Top P Control */}
            <div className="space-y-2">
              <Label className={`text-xs font-medium ${getCyberpunkTextClasses('muted')} block`}>
                Top P: {settings.topP.toFixed(2)}
              </Label>
              <Slider
                min={0.0}
                max={1.0}
                step={0.01}
                value={[settings.topP]}
                onValueChange={handleSliderChange((value) => 
                  onSettingsChange({ ...settings, topP: value })
                )}
                disabled={disabled}
                className="w-full"
              />
              <Input
                type="number"
                step="0.01"
                min="0.0"
                max="1.0"
                value={settings.topP}
                onChange={handleInputChange((value) => 
                  onSettingsChange({ ...settings, topP: value })
                )}
                disabled={disabled}
                className={`h-8 text-xs bg-[#1a1a1a] border border-green-500/50 text-green-300 font-mono ${getCyberpunkTextClasses('secondary')}`}
              />
              <p className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                Controls diversity via nucleus sampling. Lower = more focused. (0.0 - 1.0)
              </p>
            </div>

            {/* Max Tokens Control */}
            <div className="space-y-2">
              <Label className={`text-xs font-medium ${getCyberpunkTextClasses('muted')} block`}>
                Max Tokens: {settings.maxTokens}
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={settings.maxTokens}
                onChange={handleMaxTokensInputChange}
                disabled={disabled}
                className={`h-8 text-xs bg-[#1a1a1a] border border-green-500/50 text-green-300 font-mono ${getCyberpunkTextClasses('secondary')}`}
              />
              <p className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                Maximum number of tokens to generate. Controls response length.
              </p>
            </div>

            {/* Reset Button */}
            {!isDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={disabled}
                className={`w-full h-7 text-xs ${getCyberpunkButtonClasses()} transition-all`}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset to Defaults
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

