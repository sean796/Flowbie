import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Trash2, ChevronDown, ChevronUp, List, ListOrdered, Table2, Heading2, Image, Quote, Link, AlignCenter, Smartphone } from "lucide-react";
import { AgentConfig } from "./AgentNode";

const featureShortcuts = [
  { icon: List, label: "Bullet List", feature: "I need a bullet list" },
  { icon: ListOrdered, label: "Numbered List", feature: "I need a numbered list" },
  { icon: Table2, label: "Table", feature: "I need a table" },
  { icon: Heading2, label: "Heading", feature: "I need a subheading" },
  { icon: Image, label: "Image", feature: "I need an image" },
  { icon: Quote, label: "Quote", feature: "I need a quote or callout" },
  { icon: Link, label: "Link", feature: "I need 3-5 links" },
  { icon: AlignCenter, label: "Centered Text", feature: "I need centered or highlighted text" },
];

const MOBILE_OPTIMIZED_FEATURE = "Mobile optimized";

export const FlowAgentNode = memo(({ data }: NodeProps<AgentConfig & {
  onUpdate: (updated: AgentConfig) => void;
  onDelete: () => void;
}>) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { id, title, description, features, h2Count = 1, h3Count = 0, h3Enabled = false, onUpdate, onDelete } = data;
  
  const isMobileOptimized = features.includes(MOBILE_OPTIMIZED_FEATURE);

  const addFeatureShortcut = (featureText: string) => {
    if (!features.includes(featureText)) {
      onUpdate({ ...data, features: [...features, featureText] });
    }
  };

  const toggleFeature = (featureText: string, checked: boolean) => {
    if (checked) {
      onUpdate({ ...data, features: [...features, featureText] });
    } else {
      onUpdate({ ...data, features: features.filter(f => f !== featureText) });
    }
  };

  const addCustomFeature = () => {
    onUpdate({ ...data, features: [...features, ""] });
  };

  const updateCustomFeature = (index: number, value: string) => {
    const updated = [...features];
    updated[index] = value;
    onUpdate({ ...data, features: updated });
  };

  const removeFeature = (index: number) => {
    onUpdate({ ...data, features: features.filter((_, i) => i !== index) });
  };

  const updateH2Count = (value: string) => {
    const count = parseInt(value) || 0;
    onUpdate({ ...data, h2Count: count });
  };

  const updateH3Count = (value: string) => {
    const count = parseInt(value) || 0;
    onUpdate({ ...data, h3Count: count });
  };

  const toggleH3 = () => {
    onUpdate({ ...data, h3Enabled: !h3Enabled });
  };
  
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary border-2 border-background"
      />
      
      <Card className="w-[520px] bg-card border-2 border-primary/40 shadow-xl backdrop-blur">
        {/* Feature Shortcuts Toolbar */}
        <div className="flex items-center gap-1 p-2 border-b border-border/50 bg-background/50">
          {featureShortcuts.map((shortcut, idx) => (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              onClick={() => addFeatureShortcut(shortcut.feature)}
              className="h-8 w-8 p-0 hover:bg-primary/20 hover:text-primary"
              title={shortcut.label}
            >
              <shortcut.icon className="w-4 h-4 text-foreground" />
            </Button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {/* Title and Delete */}
          <div className="flex items-center justify-between gap-2">
            <Input
              value={title}
              onChange={(e) => onUpdate({ ...data, title: e.target.value })}
              placeholder="Section Title"
              className="flex-1 h-auto text-lg font-semibold bg-transparent border-0 focus-visible:ring-0 px-0"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* H2/H3 Elements Display */}
          <div className="bg-background/50 border border-border/50 rounded p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-primary">H2 Elements:</span>
              <span className="text-foreground">I need</span>
              <Input
                type="number"
                min="0"
                value={h2Count}
                onChange={(e) => updateH2Count(e.target.value)}
                className="w-16 h-6 text-sm bg-background border-border text-center"
              />
              <span className="text-foreground">h2</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className={h3Enabled ? "text-primary" : "text-muted-foreground"}>H3 Elements:</span>
              {h3Enabled ? (
                <>
                  <span className="text-foreground">I need</span>
                  <Input
                    type="number"
                    min="0"
                    value={h3Count}
                    onChange={(e) => updateH3Count(e.target.value)}
                    className="w-16 h-6 text-sm bg-background border-border text-center"
                  />
                  <span className="text-foreground">h3</span>
                </>
              ) : (
                <span className="text-muted-foreground/70">None</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleH3}
                className="ml-auto h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
              >
                {h3Enabled ? "Disable" : "Enable"}
              </Button>
            </div>
            
            {!h3Enabled && (
              <div className="text-muted-foreground/50 text-xs">
                H3 Section: Disabled (elements ignored in generation)
              </div>
            )}
          </div>

          {/* Mobile Optimized Checkbox */}
          <div className="bg-background/50 border border-border/50 rounded p-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mobile-optimized"
                checked={isMobileOptimized}
                onCheckedChange={(checked) => toggleFeature(MOBILE_OPTIMIZED_FEATURE, checked === true)}
              />
              <Label
                htmlFor="mobile-optimized"
                className="text-foreground font-normal cursor-pointer text-sm flex items-center gap-2"
              >
                <Smartphone className="w-4 h-4 text-primary" />
                <span className={isMobileOptimized ? "text-primary font-medium" : ""}>
                  Mobile optimized
                </span>
              </Label>
            </div>
            {!isMobileOptimized && (
              <div className="text-muted-foreground/50 text-xs mt-2 ml-6">
                Mobile optimization: Disabled (ignored in generation)
              </div>
            )}
          </div>

          {/* Description Collapsible */}
          <div className="bg-background/50 border border-border/50 rounded">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between p-3 text-sm hover:bg-background/30 transition-colors"
            >
              <span className="text-muted-foreground">
                {isExpanded ? "Description expanded" : "Description collapsed"}
              </span>
              <span className="text-primary font-medium">
                {isExpanded ? "Collapse" : "Expand"}
              </span>
            </button>
            {isExpanded && (
              <div className="px-3 pb-3">
                <Textarea
                  value={description}
                  onChange={(e) => onUpdate({ ...data, description: e.target.value })}
                  placeholder="Describe what this section should cover..."
                  className="min-h-[100px] text-xs bg-background border-border resize-none"
                />
              </div>
            )}
          </div>

          {/* Features as Checkboxes */}
          <div className="space-y-2">
            {features.map((feature, idx) => {
              
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={feature}
                    onChange={(e) => updateCustomFeature(idx, e.target.value)}
                    placeholder="Custom feature..."
                    className="flex-1 h-7 text-sm bg-background border-border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFeature(idx)}
                    className="h-7 w-7 p-1 text-muted-foreground hover:text-destructive"
                    title="Remove feature"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}

            {/* Add Feature Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={addCustomFeature}
              className="w-full justify-center text-primary hover:text-primary hover:bg-primary/10 text-sm"
            >
              + Add Feature
            </Button>
          </div>
        </div>
      </Card>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary border-2 border-background"
      />
    </>
  );
});

FlowAgentNode.displayName = "FlowAgentNode";
