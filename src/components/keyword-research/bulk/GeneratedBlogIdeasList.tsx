import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { XCircle, Pencil, Loader2, MessageSquare, CheckCircle2, Globe, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { CSVRow } from '@/lib/bulk-auto-generate';

interface WordPressPostMetadata {
  selectedUrls: string[];
}

interface GeneratedBlogIdeasListProps {
  hasGeneratedChecklist: boolean;
  generatedRows: CSVRow[];
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  setEditFormData: (data: CSVRow | null) => void;
  wordPressPostsMetadata: any[];
  selectedWordPressPosts: Map<number, WordPressPostMetadata>;
  wordPressMarkdownFiles: Array<{ name: string; content: string }>;
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  handleStartProcessing: () => Promise<void>;
  handleRegenerateUnselected: (selectedIndices: Set<number>) => Promise<Set<number>>;
  resetPromptGeneration: () => void;
  setUserInput: (input: string) => void;
}

export function GeneratedBlogIdeasList({
  hasGeneratedChecklist,
  generatedRows,
  selectedBlogIndices,
  setSelectedBlogIndices,
  editingIndex,
  setEditingIndex,
  setEditFormData,
  wordPressPostsMetadata,
  selectedWordPressPosts,
  wordPressMarkdownFiles,
  isGeneratingChecklist,
  isProcessing,
  apiKey,
  openRouterApiKey,
  handleStartProcessing,
  handleRegenerateUnselected,
  resetPromptGeneration,
  setUserInput,
}: GeneratedBlogIdeasListProps) {
  if (!hasGeneratedChecklist || generatedRows.length === 0) {
    return null;
  }

  return (
    <>
      {/* WordPress Posts Metadata Info */}
      {wordPressPostsMetadata.length > 0 && (
        <Card className="p-3 border-primary/30 bg-primary/10">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-primary" />
            <span className="text-primary">
              Analyzing {wordPressPostsMetadata.length} WordPress post{wordPressPostsMetadata.length !== 1 ? 's' : ''} for relevance
            </span>
          </div>
        </Card>
      )}

      {/* Generated Checklist for Approval */}
      <Card className="p-4 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-base">Generated Blog Ideas</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Review the list below and approve to proceed with generation
              {wordPressMarkdownFiles.length > 0 && (
                <span className="text-green-600 ml-2">
                  • {wordPressMarkdownFiles.length} WordPress post{wordPressMarkdownFiles.length !== 1 ? 's' : ''} added to knowledge base
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetPromptGeneration();
              setSelectedBlogIndices(new Set());
            }}
            disabled={isProcessing}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {generatedRows.map((row, idx) => {
              const isSelected = selectedBlogIndices.has(idx);
              return (
                <Card 
                  key={idx} 
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected 
                      ? 'border-primary border-2 bg-primary/5' 
                      : 'border-border'
                  }`}
                  onClick={() => {
                    setSelectedBlogIndices(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(idx)) {
                        newSet.delete(idx);
                      } else {
                        newSet.add(idx);
                      }
                      return newSet;
                    });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedBlogIndices(prev => {
                            const newSet = new Set(prev);
                            if (checked) {
                              newSet.add(idx);
                            } else {
                              newSet.delete(idx);
                            }
                            return newSet;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary">#{idx + 1}</Badge>
                          <h5 className="font-semibold text-sm">{row.title}</h5>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div><span className="font-medium">Keyword:</span> {row.keyword}</div>
                          {row.entity && <div><span className="font-medium">Entity:</span> {row.entity}</div>}
                          {row.modifier && <div><span className="font-medium">Modifier:</span> {row.modifier}</div>}
                          {row.featuredImage && (
                            <div>
                              <span className="font-medium">Featured Image:</span> {row.featuredImage === 'y' ? 'Yes' : 'No'}
                            </div>
                          )}
                          {selectedWordPressPosts.has(idx) && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <div className="font-medium text-foreground mb-1.5">Selected WordPress Posts:</div>
                              <div className="space-y-1.5">
                                {selectedWordPressPosts.get(idx)?.selectedUrls.map((url, urlIdx) => (
                                  <div key={urlIdx} className="flex items-center gap-1.5 text-xs">
                                    <Globe className="h-3 w-3 text-primary flex-shrink-0" />
                                    <a 
                                      href={url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline truncate flex-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {url}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIndex(idx);
                        setEditFormData({ ...row });
                      }}
                      disabled={isProcessing}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button
            onClick={async () => {
              if (selectedBlogIndices.size >= generatedRows.length) {
                toast.error('Please deselect at least one blog idea to regenerate');
                return;
              }
              // Regenerate and get the new indices for kept items
              const newSelectedIndices = await handleRegenerateUnselected(selectedBlogIndices);
              // Update selection to the new indices (kept items are at the beginning)
              setSelectedBlogIndices(newSelectedIndices);
            }}
            disabled={
              isGeneratingChecklist || 
              isProcessing || 
              selectedBlogIndices.size >= generatedRows.length ||
              generatedRows.length === 0 ||
              !apiKey || 
              !openRouterApiKey
            }
            variant="outline"
            className="flex-1"
          >
            {isGeneratingChecklist ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4 mr-2" />
                Regenerate Unselected ({generatedRows.length - selectedBlogIndices.size} will be regenerated)
              </>
            )}
          </Button>
          <Button
            onClick={handleStartProcessing}
            disabled={isProcessing || !apiKey || !openRouterApiKey}
            className="flex-1 bg-primary hover:bg-primary/90 text-black"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approve & Start Processing
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resetPromptGeneration();
              setUserInput('');
              setSelectedBlogIndices(new Set());
            }}
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </>
  );
}
