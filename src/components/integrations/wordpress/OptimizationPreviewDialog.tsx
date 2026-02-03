import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Download, CheckCircle2, FileText, List, Code, X } from "lucide-react";
import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import type { AgentConfig } from "@/components/AgentNode";

export interface OptimizationPreviewData {
  primaryKeyword: string;
  keywordData?: KeywordData;
  aiAnalysis?: KeywordAIAnalysis;
  selectedKeywords?: string[];
  selectedH2Sections?: string[];
  selectedPeopleAlsoAsk?: string[];
  selectedResearchLinks?: string[];
  blueprint?: {
    title?: string;
    purpose?: string;
    agents: AgentConfig[];
  };
  checklist?: string[];
  content?: string;
  fileCount?: number;
}

interface OptimizationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: OptimizationPreviewData | null;
  onApprove?: () => void;
  onCancel?: () => void;
  onDownloadFiles?: () => void;
  disabled?: boolean;
}

export const OptimizationPreviewDialog: React.FC<OptimizationPreviewDialogProps> = ({
  open,
  onOpenChange,
  data,
  onApprove,
  onCancel,
  onDownloadFiles,
  disabled = false,
}) => {
  if (!data) {
    return null;
  }

  const handleApprove = () => {
    if (onApprove) {
      onApprove();
    }
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Optimization Preview
          </DialogTitle>
          <DialogDescription>
            Review the optimization results before uploading to WordPress
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="keywords" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="blueprint">Blueprint</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Keywords Tab */}
            <TabsContent value="keywords" className="space-y-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Primary Keyword</h3>
                    <Badge variant="default" className="text-sm">
                      {data.primaryKeyword}
                    </Badge>
                  </div>

                  {data.keywordData && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Keyword Metrics</h3>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Search Volume:</span>
                          <span className="ml-2 font-medium">
                            {data.keywordData.searchVolume?.toLocaleString() || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Competition:</span>
                          <span className="ml-2 font-medium">
                            {data.keywordData.competition || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">CPC:</span>
                          <span className="ml-2 font-medium">
                            ${data.keywordData.cpc || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">KD:</span>
                          <span className="ml-2 font-medium">
                            {data.keywordData.keywordDifficulty || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {data.selectedKeywords && data.selectedKeywords.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Selected Keywords ({data.selectedKeywords.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {data.selectedKeywords.map((keyword, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.selectedH2Sections && data.selectedH2Sections.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Selected H2 Sections ({data.selectedH2Sections.length})
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        {data.selectedH2Sections.map((section, idx) => (
                          <li key={idx}>{section}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.selectedPeopleAlsoAsk && data.selectedPeopleAlsoAsk.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        People Also Ask ({data.selectedPeopleAlsoAsk.length})
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        {data.selectedPeopleAlsoAsk.slice(0, 10).map((question, idx) => (
                          <li key={idx}>{question}</li>
                        ))}
                        {data.selectedPeopleAlsoAsk.length > 10 && (
                          <li className="text-muted-foreground/70">
                            ...and {data.selectedPeopleAlsoAsk.length - 10} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {data.aiAnalysis && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">AI Analysis</h3>
                      <div className="text-xs text-muted-foreground space-y-1">
                        {data.aiAnalysis.searchIntent && (
                          <div>
                            <span className="font-medium">Search Intent:</span> {data.aiAnalysis.searchIntent}
                          </div>
                        )}
                        {data.aiAnalysis.contentGaps && data.aiAnalysis.contentGaps.length > 0 && (
                          <div>
                            <span className="font-medium">Content Gaps:</span> {data.aiAnalysis.contentGaps.length} identified
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Blueprint Tab */}
            <TabsContent value="blueprint" className="space-y-4">
              <Card className="p-4">
                {data.blueprint ? (
                  <div className="space-y-4">
                    {data.blueprint.title && (
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Title</h3>
                        <p className="text-sm text-foreground">{data.blueprint.title}</p>
                      </div>
                    )}
                    {data.blueprint.purpose && (
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Purpose</h3>
                        <p className="text-sm text-muted-foreground">{data.blueprint.purpose}</p>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Sections ({data.blueprint.agents.length})
                      </h3>
                      <div className="space-y-2">
                        {data.blueprint.agents.map((agent, idx) => (
                          <div
                            key={idx}
                            className="p-2 border border-border rounded text-xs bg-background/50"
                          >
                            <div className="font-medium text-foreground">{agent.title}</div>
                            {agent.description && (
                              <div className="text-muted-foreground mt-1">{agent.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border">
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View JSON Structure
                        </summary>
                        <pre className="mt-2 p-2 bg-muted rounded overflow-auto text-[10px] max-h-[200px]">
                          {JSON.stringify(data.blueprint, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No blueprint data available
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Checklist Tab */}
            <TabsContent value="checklist" className="space-y-4">
              <Card className="p-4">
                {data.checklist && data.checklist.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold mb-2">
                      Checklist ({data.checklist.length} items)
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-xs">
                      {data.checklist.map((item, idx) => (
                        <li key={idx} className="text-foreground pl-2">
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No checklist available
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-4">
              <Card className="p-4">
                {data.content ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Generated Content</h3>
                      <Badge variant="secondary" className="text-xs">
                        {data.content.split('\n').length} lines
                      </Badge>
                    </div>
                    <ScrollArea className="h-[400px] border border-border rounded p-3 bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                        {data.content}
                      </pre>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No content preview available
                  </div>
                )}
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data.fileCount !== undefined && data.fileCount > 0 && (
              <>
                <FileText className="h-4 w-4" />
                <span>{data.fileCount} files generated</span>
                {onDownloadFiles && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDownloadFiles}
                    className="h-7 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={disabled}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={disabled}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve & Upload
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

