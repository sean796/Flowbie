import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

export interface AgentConfig {
  id: string;
  step: number; // NEW: Step/order of the agent in the final code output
  title: string;
  description: string;
  features: string[];
  h2Count?: number;
  h3Count?: number;
  h3Enabled?: boolean;
  headingLevel?: number; // New field to control Markdown heading level
  maxTokens?: number; // New field for per-agent token limit
}

interface AgentNodeProps {
  agent: AgentConfig;
  onUpdate: (agent: AgentConfig) => void;
  onDelete: () => void;
}

export const AgentNode = ({ agent, onUpdate, onDelete }: AgentNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const addFeature = () => {
    onUpdate({
      ...agent,
      features: [...agent.features, ""],
    });
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...agent.features];
    newFeatures[index] = value;
    onUpdate({ ...agent, features: newFeatures });
  };

  const removeFeature = (index: number) => {
    onUpdate({
      ...agent,
      features: agent.features.filter((_, i) => i !== index),
    });
  };

  return (
    <Card className="p-6 bg-card border-border hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <Input
            value={agent.title}
            onChange={(e) => onUpdate({ ...agent, title: e.target.value })}
            placeholder="Section title"
            className="border-0 bg-transparent text-foreground font-semibold text-base focus-visible:ring-0 px-0 h-auto"
          />
        </div>
        <div className="flex gap-1 ml-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          <Textarea
            value={agent.description}
            onChange={(e) => onUpdate({ ...agent, description: e.target.value })}
            placeholder="What should this section cover?"
            className="bg-input border-border min-h-[80px] text-sm resize-none"
          />

          <div className="space-y-2">
            {/* Step Counter Control - Added here for better visibility */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
                Generation Step
              </label>
              <Input
                type="number"
                value={agent.step}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  const newStep = Math.max(1, isNaN(value) ? agent.step || 1 : value);
                  onUpdate({ ...agent, step: newStep });
                }}
                placeholder="1"
                min={1}
                className="bg-input border-border text-sm h-8 w-16"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Key Points</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={addFeature}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
            {agent.features.map((feature, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={feature}
                  onChange={(e) => updateFeature(index, e.target.value)}
                  placeholder="Key point..."
                  className="bg-input border-border text-sm h-8"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFeature(index)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}

            {/* New Heading Level Control */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
                Heading Level (H1-H6)
              </label>
              <Input
                type="number"
                value={agent.headingLevel !== undefined ? agent.headingLevel : 2}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  // Enforce bounds: min 1 (H1) maximum 6 (H6)
                  const newLevel = Math.max(1, Math.min(6, isNaN(value) ? 2 : value));
                  onUpdate({ ...agent, headingLevel: newLevel });
                }}
                placeholder="2"
                min={1}
                max={6}
                className="bg-input border-border text-sm h-8 w-16"
              />
            </div>

            {/* New Max Tokens Control */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">
                Max Tokens (Optional)
              </label>
              <Input
                type="number"
                value={agent.maxTokens !== undefined ? agent.maxTokens : ""}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  const newTokens = isNaN(value) || value <= 0 ? undefined : value;
                  onUpdate({ ...agent, maxTokens: newTokens });
                }}
                placeholder="2048"
                min={1}
                className="bg-input border-border text-sm h-8 w-24"
              />
            </div>

          </div>
        </div>
      )}
    </Card>
  );
};
