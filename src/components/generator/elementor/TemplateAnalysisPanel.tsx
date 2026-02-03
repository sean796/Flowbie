import React from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCyberpunkCardClasses, getCyberpunkTextClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { ELEMENTOR_MESSAGES } from "@/lib/elementor/template-constants";
import type { AnalysisResult, CustomizationField } from "./types";

interface TemplateAnalysisPanelProps {
  analysisResult?: AnalysisResult;
  isAnalyzing: boolean;
  progress?: number;
  progressMessage?: string;
  error?: string;
  onFieldClick?: (field: CustomizationField) => void;
}

export const TemplateAnalysisPanel: React.FC<TemplateAnalysisPanelProps> = ({
  analysisResult,
  isAnalyzing,
  progress = 0,
  progressMessage,
  error,
  onFieldClick,
}) => {
  if (isAnalyzing) {
    return (
      <div className={cn(getCyberpunkCardClasses(false, false), "p-6 space-y-4")}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-green-400 animate-spin" />
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-lg")}>
            Scanning Structure
          </h3>
        </div>
        
        {progressMessage && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className={cn(getCyberpunkTextClasses('secondary'))}>
                {progressMessage}
              </span>
              <span className={cn(getCyberpunkTextClasses('muted'))}>
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <p className={cn(getCyberpunkTextClasses('muted'), "text-sm")}>
          {ELEMENTOR_MESSAGES.scanning}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(getCyberpunkCardClasses(false, false), "p-6 space-y-4")}>
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-lg")}>
            Analysis Error
          </h3>
        </div>
        <p className={cn(getCyberpunkTextClasses('muted'), "text-sm text-red-300")}>
          {error}
        </p>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div className={cn(getCyberpunkCardClasses(false, false), "p-6")}>
        <p className={cn(getCyberpunkTextClasses('muted'), "text-center")}>
          Click "Analyze Template" to begin
        </p>
      </div>
    );
  }

  const { fields, summary } = analysisResult;

  return (
    <div className={cn(getCyberpunkCardClasses(false, false), "p-6 space-y-4")}>
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-400" />
        <h3 className={cn(getCyberpunkTextClasses('primary'), "text-lg")}>
          Identifying Targets
        </h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3 bg-[#1a1a1a] border-green-500/30">
          <div className={cn(getCyberpunkTextClasses('muted'), "text-xs mb-1")}>
            Total Fields
          </div>
          <div className={cn(getCyberpunkTextClasses('primary'), "text-2xl font-bold")}>
            {summary.totalFields}
          </div>
        </Card>
        <Card className="p-3 bg-[#1a1a1a] border-green-500/30">
          <div className={cn(getCyberpunkTextClasses('muted'), "text-xs mb-1")}>
            Files
          </div>
          <div className={cn(getCyberpunkTextClasses('primary'), "text-2xl font-bold")}>
            {summary.totalFiles}
          </div>
        </Card>
        <Card className="p-3 bg-[#1a1a1a] border-green-500/30">
          <div className={cn(getCyberpunkTextClasses('muted'), "text-xs mb-1")}>
            URLs
          </div>
          <div className={cn(getCyberpunkTextClasses('primary'), "text-2xl font-bold")}>
            {summary.fieldTypes.url}
          </div>
        </Card>
        <Card className="p-3 bg-[#1a1a1a] border-green-500/30">
          <div className={cn(getCyberpunkTextClasses('muted'), "text-xs mb-1")}>
            Colors
          </div>
          <div className={cn(getCyberpunkTextClasses('primary'), "text-2xl font-bold")}>
            {summary.fieldTypes.color}
          </div>
        </Card>
      </div>

      {/* Field List */}
      {fields.length > 0 && (
        <div className="space-y-2">
          <h4 className={cn(getCyberpunkTextClasses('secondary'), "text-sm font-semibold")}>
            Identified Fields ({fields.length})
          </h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {fields.map((field) => (
              <Card
                key={field.id}
                className={cn(
                  "p-3 bg-[#1a1a1a] border-green-500/30 cursor-pointer",
                  "hover:border-green-500/50 hover:bg-green-500/10 transition-colors"
                )}
                onClick={() => onFieldClick?.(field)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold")}>
                        {field.field}
                      </span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        field.fieldType === 'url' && "bg-blue-500/20 text-blue-300",
                        field.fieldType === 'email' && "bg-purple-500/20 text-purple-300",
                        field.fieldType === 'phone' && "bg-orange-500/20 text-orange-300",
                        field.fieldType === 'color' && "bg-pink-500/20 text-pink-300",
                        field.fieldType === 'text' && "bg-gray-500/20 text-gray-300",
                        "bg-green-500/20 text-green-300"
                      )}>
                        {field.fieldType}
                      </span>
                    </div>
                    <div className={cn(getCyberpunkTextClasses('muted'), "text-xs space-y-1")}>
                      <div>
                        <span className="opacity-70">Current: </span>
                        <span className="font-mono">{field.currentValue}</span>
                      </div>
                      <div>
                        <span className="opacity-70">Suggested: </span>
                        <span className="font-mono text-green-300">{field.suggestedValue}</span>
                      </div>
                      {field.filePath && (
                        <div className="opacity-60">
                          {field.filePath}
                          {field.lineNumber && `:${field.lineNumber}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {fields.length === 0 && (
        <p className={cn(getCyberpunkTextClasses('muted'), "text-center text-sm")}>
          No customizable fields found
        </p>
      )}
    </div>
  );
};
