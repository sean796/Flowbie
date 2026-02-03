import React, { useState, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { HexColorPicker } from "react-colorful";
import { usePersistedColor } from "../hooks/use-persisted-color";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LLMSettingsTabContentProps {
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  topP: number;
  onTopPChange: (value: number) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const LLMParameterControls: React.FC<{
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  topP: number;
  onTopPChange: (value: number) => void;
}> = (props) => {
  
  const handleSliderChange = (setter: (v: number) => void) => (values: number[]) => {
    setter(values[0]);
  };
  
  const handleInputChange = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only parse and set the value if it's a valid number
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };

  const handleMaxTokensInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only parse and set the value if it's a valid integer
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      props.onMaxTokensChange(value);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        {/* Temperature Control */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground block uppercase tracking-wide">
            Temperature: {props.temperature.toFixed(2)}
          </Label>
          <Slider
            min={0.0}
            max={2.0}
            step={0.01}
            value={[props.temperature]}
            onValueChange={handleSliderChange(props.onTemperatureChange)}
            className="w-full"
          />
          <Input 
            type="number"
            step="0.01"
            min="0.0"
            max="2.0"
            value={props.temperature}
            onChange={handleInputChange(props.onTemperatureChange)}
            className="bg-input border-border h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground pt-1">
            Controls randomness. Lower values are more deterministic and repetitive; higher values are more creative. (Range: 0.0 - 2.0)
          </p>
        </div>

        {/* Top P Control */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground block uppercase tracking-wide">
            Top P: {props.topP.toFixed(2)}
          </Label>
          <Slider
            min={0.0}
            max={1.0}
            step={0.01}
            value={[props.topP]}
            onValueChange={handleSliderChange(props.onTopPChange)}
            className="w-full"
          />
          <Input 
            type="number"
            step="0.01"
            min="0.0"
            max="1.0"
            value={props.topP}
            onChange={handleInputChange(props.onTopPChange)}
            className="bg-input border-border h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground pt-1">
            Controls diversity via nucleus sampling. Lower values focus on a smaller set of highest-probability tokens. (Range: 0.0 - 1.0)
          </p>
        </div>

        {/* Max Tokens Control */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground block uppercase tracking-wide">
            Max Tokens: {props.maxTokens}
          </Label>
          <Input 
            type="number"
            step="1"
            min="1"
            value={props.maxTokens}
            onChange={handleMaxTokensInputChange}
            className="bg-input border-border h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground pt-1">
            The maximum number of tokens to generate in the completion. This controls the length of the response.
          </p>
        </div>
      </Card>
    </div>
  );
};

const CustomColorPicker: React.FC = () => {
    const [color, setColor] = usePersistedColor("#85a506"); // Default primary color
    const [inputValue, setInputValue] = useState(color);

    // Regex to validate hex color code
    const isHexColor = (hex: string) => /^\s*#?([0-9a-fA-F]{3}([0-9a-fA-F]{3})?)\s*$/.test(hex.trim());

    const handleColorChange = useCallback((newColor: string) => {
        setColor(newColor);
        setInputValue(newColor);
    }, [setColor]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    }, []);

    const handleInputBlur = useCallback(() => {
        let newColor = inputValue.trim();

        if (newColor.length > 0 && !newColor.startsWith("#")) {
            newColor = "#" + newColor;
        }

        if (isHexColor(newColor) && (newColor.length === 4 || newColor.length === 7)) {
            const normalizedColor = newColor.toLowerCase();
            setColor(normalizedColor);
            setInputValue(normalizedColor);
        } else {
            setInputValue(color);
        }
    }, [inputValue, color, setColor]);


    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                >
                    <div className="flex items-center space-x-2">
                         <div
                            className={cn("h-4 w-4 rounded-full border")}
                            style={{ backgroundColor: color }}
                        />
                        <span className="truncate">{color}</span>
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <div className="p-4 flex flex-col space-y-4">
                    <HexColorPicker color={color} onChange={handleColorChange} />
                    <Input
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        placeholder="#RRGGBB or #RGB"
                        className="text-center font-mono text-sm h-8"
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
};


// Main Component for the Settings Tab
export const LLMSettingsTabContent: React.FC<LLMSettingsTabContentProps> = ({
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  topP,
  onTopPChange,
  selectedModel,
  onModelChange,
}) => {
  return (
    <div className="space-y-6">
        {/* Model Selection */}
        <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                Model
            </label>
            <Select value={selectedModel} onValueChange={onModelChange}>
                <SelectTrigger className="bg-input border-border h-9 text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                    <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                </SelectContent>
            </Select>
        </div>

        {/* Color Picker */}
        <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                Primary Color Scheme
            </label>
            <CustomColorPicker />
        </div>

        {/* LLM Parameters (Temperature, Top P, Max Tokens) */}
        <LLMParameterControls
            temperature={temperature}
            onTemperatureChange={onTemperatureChange}
            maxTokens={maxTokens}
            onMaxTokensChange={onMaxTokensChange}
            topP={topP}
            onTopPChange={onTopPChange}
        />
    </div>
  );
};
