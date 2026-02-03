/**
 * CSV Template Dialog Component
 * Dialog for configuring and generating CSV templates (Death Star module style)
 */

import React, { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Download, Bot } from "lucide-react";
import { generateAITitleSuggestion } from "../csv/titleSuggestion";
import { generateCSVTemplate, replaceTemplateVariables } from "../csv/csvGenerator";
import { CYBERPUNK_CLASSES } from "../../wordpress/cyberpunk-theme";
import type { WordPressSite } from "../../types";

interface CSVTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  entities: string[];
  initialTitleFormat?: string;
}

function featuredImageLabel(value: string): string {
  if (value === "y") return "Yes (Y)";
  if (value === "n") return "No (N)";
  if (value === "google-maps") return "Google Image";
  return value;
}

export const CSVTemplateDialog: React.FC<CSVTemplateDialogProps> = ({
  open,
  onOpenChange,
  pendingEntitySite,
  pendingEntitySitemap,
  entities,
  initialTitleFormat = ""
}) => {
  const [csvTitleFormat, setCsvTitleFormat] = useState<string>(initialTitleFormat);

  React.useEffect(() => {
    if (initialTitleFormat) {
      setCsvTitleFormat(initialTitleFormat);
    }
  }, [initialTitleFormat]);
  const [csvKeyword, setCsvKeyword] = useState<string>("");
  const [csvFeaturedImage, setCsvFeaturedImage] = useState<string>("y");
  const [csvOptionalModifier, setCsvOptionalModifier] = useState<string>("");
  const [isGeneratingTitleSuggestion, setIsGeneratingTitleSuggestion] = useState<boolean>(false);

  const totalEntities = entities?.length ?? 0;
  const featuredImageDisplay = featuredImageLabel(csvFeaturedImage);
  const summaryLine =
    totalEntities > 0
      ? `Total: ${totalEntities} entities · Featured image: ${featuredImageDisplay} · Keyword: ${csvKeyword.trim() ? "Set" : "Not set"}`
      : "Configure the CSV template with title format and optional fields for bulk generation.";

  const handleGenerateAITitleSuggestion = async () => {
    if (!pendingEntitySite || !entities || entities.length === 0) return;

    setIsGeneratingTitleSuggestion(true);
    try {
      const suggestion = await generateAITitleSuggestion(entities, pendingEntitySite);
      if (suggestion) {
        setCsvTitleFormat(suggestion);
      }
    } finally {
      setIsGeneratingTitleSuggestion(false);
    }
  };

  const handleGenerateCSV = () => {
    if (!pendingEntitySite || !entities || entities.length === 0) {
      toast.error("No entities to generate CSV from");
      return;
    }

    generateCSVTemplate(entities, pendingEntitySite, {
      titleFormat: csvTitleFormat,
      keyword: csvKeyword,
      optionalModifier: csvOptionalModifier,
      featuredImage: csvFeaturedImage
    });

    onOpenChange(false);
  };

  const previewCount = Math.min(10, totalEntities);
  const previewRowsLabel =
    totalEntities <= 10
      ? `Showing rows 1–${totalEntities} of ${totalEntities}`
      : `Showing rows 1–${previewCount} of ${totalEntities}`;
  const previewSectionLabel =
    totalEntities <= 10
      ? `Preview: first ${totalEntities} of ${totalEntities} entities`
      : `Preview: first ${previewCount} of ${totalEntities} entities`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-2xl max-h-[80vh] overflow-hidden flex flex-col ${CYBERPUNK_CLASSES.card} border-green-500/50`}
      >
        <DialogHeader className="border-b border-green-500/20 pb-3 shrink-0">
          <DialogTitle className="text-xl font-bold text-green-400 font-mono tracking-wider">
            Generate CSV Template
          </DialogTitle>
          <DialogDescription className="text-green-500/80 font-mono text-sm">
            {summaryLine}
          </DialogDescription>
        </DialogHeader>

        {pendingEntitySite && pendingEntitySitemap && entities && entities.length > 0 && (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4">
            {/* SUMMARY */}
            <div className={`rounded-md border ${CYBERPUNK_CLASSES.borderDivider} ${CYBERPUNK_CLASSES.bgNeon} p-3`}>
              <div className="text-xs font-mono uppercase tracking-wider text-green-400/80 mb-2">
                Summary
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-mono text-slate-300">
                <span className="text-green-400/90">Total entities:</span>
                <span>{totalEntities}</span>
                <span className="text-green-400/90">CSV rows:</span>
                <span>{totalEntities}</span>
                <span className="text-green-400/90">Featured image:</span>
                <span>{featuredImageDisplay}</span>
                <span className="text-green-400/90">Keyword:</span>
                <span>{csvKeyword.trim() ? "Set" : "Not set"}</span>
                <span className="text-green-400/90">Modifier:</span>
                <span>{csvOptionalModifier.trim() ? "Set" : "Not set"}</span>
              </div>
            </div>

            {/* CONFIGURATION */}
            <div className="border-t border-green-500/20 pt-4">
              <div className="text-xs font-mono uppercase tracking-wider text-green-400/80 mb-3">
                Configuration
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="csvTitleFormat" className="font-mono text-slate-300">
                      Title Format
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateAITitleSuggestion}
                      disabled={isGeneratingTitleSuggestion}
                      className="h-7 px-2 text-xs border border-green-500/30 text-green-400 hover:bg-green-500/20"
                      title="AI Suggest Title Template"
                    >
                      {isGeneratingTitleSuggestion ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3 mr-1" />
                          AI Suggest
                        </>
                      )}
                    </Button>
                  </div>
                  <Input
                    id="csvTitleFormat"
                    value={csvTitleFormat}
                    onChange={(e) => setCsvTitleFormat(e.target.value)}
                    placeholder="e.g., {keyword} Near {entity}"
                    className="bg-[#0d0d0d] border-green-500/30 text-slate-200 font-mono flex-1"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-mono">Use variables:</span>
                    {[
                      { entity: "{entity}" },
                      { keyword: "{keyword}" }
                    ].map((vars, idx) => {
                      const [key, value] = Object.entries(vars)[0];
                      return (
                        <React.Fragment key={key}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(value)
                                .then(() => toast.success(`Copied ${value} to clipboard!`))
                                .catch(() => toast.error("Failed to copy to clipboard"));
                            }}
                            className="text-xs bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 px-1.5 py-0.5 rounded font-mono text-green-300 cursor-pointer transition-colors"
                            title={`Click to copy ${value}`}
                          >
                            {value}
                          </button>
                          {idx < 1 && <span className="text-xs text-slate-500">,</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {csvTitleFormat && (
                    <div className="mt-2 p-2 bg-green-500/10 rounded border border-green-500/20">
                      <p className="text-xs text-slate-400 font-mono mb-1">Preview (first entity):</p>
                      <p className="text-sm font-mono text-green-300">
                        {replaceTemplateVariables(
                          csvTitleFormat,
                          entities[0],
                          csvKeyword || "keyword"
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="csvKeyword" className="font-mono text-slate-300">
                    Keyword (Optional)
                  </Label>
                  <Input
                    id="csvKeyword"
                    value={csvKeyword}
                    onChange={(e) => setCsvKeyword(e.target.value)}
                    placeholder="Leave empty to fill manually later"
                    className="bg-[#0d0d0d] border-green-500/30 text-slate-200 font-mono"
                  />
                  <p className="text-xs text-slate-400 font-mono">
                    Optional: Leave empty to fill manually later. If provided, will be used for all
                    entities.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="csvFeaturedImage" className="font-mono text-slate-300">
                    Featured Image
                  </Label>
                  <Select value={csvFeaturedImage} onValueChange={setCsvFeaturedImage}>
                    <SelectTrigger className="bg-[#0d0d0d] border-green-500/30 text-slate-200 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="y">Yes (Y)</SelectItem>
                      <SelectItem value="n">No (N)</SelectItem>
                      <SelectItem value="google-maps">Google Image</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400 font-mono">
                    Whether to generate a featured image for each post. Google Image requires an
                    entity.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="csvOptionalModifier" className="font-mono text-slate-300">
                    Optional Modifier (Optional)
                  </Label>
                  <Input
                    id="csvOptionalModifier"
                    value={csvOptionalModifier}
                    onChange={(e) => setCsvOptionalModifier(e.target.value)}
                    placeholder="e.g., Focus on high-income neighborhoods"
                    className="bg-[#0d0d0d] border-green-500/30 text-slate-200 font-mono"
                  />
                  <p className="text-xs text-slate-400 font-mono">
                    Optional prompt modifier to guide content generation
                  </p>
                </div>
              </div>
            </div>

            {/* PREVIEW */}
            <div className="border-t border-green-500/20 pt-4">
              <div className="text-xs font-mono uppercase tracking-wider text-green-400/80 mb-2">
                {previewSectionLabel}
              </div>
              <div className="text-xs text-slate-400 font-mono mb-2">{previewRowsLabel}</div>
              <div className="max-h-64 overflow-y-auto border border-green-500/30 rounded-md bg-[#0d0d0d]">
                <div className="grid grid-cols-[1fr_2fr_100px] gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/30 text-[10px] font-mono uppercase tracking-wider text-green-400/80 sticky top-0 z-10">
                  <div>Entity</div>
                  <div>Title</div>
                  <div>Featured</div>
                </div>
                <div className="divide-y divide-green-500/10">
                  {entities.slice(0, 10).map((entity, index) => {
                    const previewTitle = csvTitleFormat
                      ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword || "")
                      : entity;
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_2fr_100px] gap-2 px-3 py-2 text-xs font-mono text-slate-300"
                      >
                        <div className="truncate text-green-300/90">{entity}</div>
                        <div className="truncate">{previewTitle}</div>
                        <div className="text-slate-400">
                          {csvFeaturedImage === "y"
                            ? "Yes"
                            : csvFeaturedImage === "google-maps"
                              ? "Google"
                              : "No"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {entities.length > 10 && (
                  <div className="text-xs text-slate-500 font-mono mt-2 pt-2 px-3 pb-2 border-t border-green-500/20">
                    … and {entities.length - 10} more entities (Total: {totalEntities} entities)
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-green-500/20 pt-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-green-500/50 text-green-300 hover:bg-green-500/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerateCSV}
            className="bg-green-600 hover:bg-green-500 text-black font-mono"
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
