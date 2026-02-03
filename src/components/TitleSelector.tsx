import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface TitleSelectorProps {
  titleOptions: string[];
  isLoading?: boolean;
  onTitleSelect: (title: string, userPrompt?: string) => void;
  onCancel?: () => void;
  onRefreshTitles?: () => void;
}

export const TitleSelector: React.FC<TitleSelectorProps> = ({
  titleOptions,
  isLoading = false,
  onTitleSelect,
  onCancel,
  onRefreshTitles,
}) => {
  const [customTitle, setCustomTitle] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");

  const handleSelectOption = (title: string, index: number) => {
    setSelectedIndex(index);
    setUseCustom(false);
    setCustomTitle("");
  };

  const handleUseCustom = () => {
    setUseCustom(true);
    setSelectedIndex(null);
  };

  const handleConfirm = () => {
    if (useCustom && customTitle.trim()) {
      onTitleSelect(customTitle.trim(), userPrompt.trim() || undefined);
    } else if (selectedIndex !== null && titleOptions[selectedIndex]) {
      onTitleSelect(titleOptions[selectedIndex], userPrompt.trim() || undefined);
    } else {
      toast.error("Please select a title option or enter a custom title");
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Select Blog Title</h3>
        </div>
        {onRefreshTitles && titleOptions.length > 0 && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshTitles}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Titles
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Generating title options...</span>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose one of the AI-generated titles or create your own:
            </p>

            {/* AI-Generated Title Options */}
            {titleOptions.length > 0 && (
              <div className="space-y-2">
                {titleOptions.map((title, index) => {
                  const isSelected = selectedIndex === index && !useCustom;
                  return (
                    <Card
                      key={index}
                      className={`p-4 cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary border-2 bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleSelectOption(title, index)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{title}</span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Optional Prompt Modifier */}
            <div className="space-y-2 pt-2">
              <Label htmlFor="template-prompt" className="text-sm">
                Optional Prompt Modifier
              </Label>
              <Textarea
                id="template-prompt"
                placeholder="Add custom instructions for the blog template (e.g., 'Focus on practical examples', 'Include comparison tables', 'Emphasize local SEO')..."
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="min-h-[80px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This will influence how the blog template checklist and blueprint are generated.
              </p>
            </div>

            {/* Custom Title Input */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  variant={useCustom ? "default" : "outline"}
                  size="sm"
                  onClick={handleUseCustom}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Custom Title
                </Button>
              </div>

              {useCustom && (
                <Input
                  placeholder="Enter your custom blog title..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="mt-2"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              onClick={handleConfirm}
              disabled={(selectedIndex === null && !useCustom) || (useCustom && !customTitle.trim())}
            >
              Confirm Title
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};
