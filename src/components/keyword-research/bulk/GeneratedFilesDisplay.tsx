import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download } from 'lucide-react';
import { ImageThumbnail } from '@/components/OutputManager/ImageThumbnail';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { getFileIcon, getStatusIcon, isImageWithPreview } from './bulk-utils';

interface GeneratedFilesDisplayProps {
  filesByRow: Map<number, BulkGeneratedFile[]>;
  displayRows: CSVRow[];
  stats: {
    total: number;
    completed: number;
    error: number;
  };
  downloadFile: (file: BulkGeneratedFile) => void;
  downloadRowFiles: (rowIndex: number) => void;
  downloadAllFiles: () => void;
  postToWordPress?: boolean;
  selectedWordPressSites?: Set<string>;
}

export function GeneratedFilesDisplay({
  filesByRow,
  displayRows,
  stats,
  downloadFile,
  downloadRowFiles,
  downloadAllFiles,
  postToWordPress,
  selectedWordPressSites,
}: GeneratedFilesDisplayProps) {
  if (filesByRow.size === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Generated Files</h3>
        {stats.completed > 0 && (
          <Button
            onClick={downloadAllFiles}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Download All ({stats.completed})
          </Button>
        )}
      </div>

      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {Array.from(filesByRow.entries())
            .sort(([a], [b]) => a - b)
            .map(([rowIndex, files]) => {
              const row = displayRows[rowIndex];
              if (!row) return null;
              return (
                <Card key={rowIndex} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Row {rowIndex + 1}</Badge>
                        <span className="text-sm font-medium">{row.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Keyword: {row.keyword}</div>
                        {row.entity && <div>Entity: {row.entity}</div>}
                        {row.modifier && <div>Modifier: {row.modifier}</div>}
                      </div>
                    </div>
                    <Button
                      onClick={() => downloadRowFiles(rowIndex)}
                      variant="outline"
                      size="sm"
                      disabled={files.filter(f => f.status === 'completed').length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download All
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {files.map((file) => {
                      const showImagePreview = isImageWithPreview(file);
                      
                      return (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getStatusIcon(file)}
                            {showImagePreview ? (
                              <ImageThumbnail
                                src={file.content}
                                alt={file.fileName}
                                size={60}
                                onClick={() => {
                                  // Open full-size preview on click
                                  console.log('Image clicked:', file.fileName, 'Content length:', file.content.length);
                                }}
                              />
                            ) : (
                              getFileIcon(file.fileName)
                            )}
                            <span className="text-sm truncate">{file.fileName}</span>
                            {file.status === 'error' && file.error && (
                              <span className="text-xs text-red-500 truncate" title={file.error}>
                                {file.error}
                              </span>
                            )}
                          </div>
                          {file.status === 'completed' && (
                            <Button
                              onClick={() => downloadFile(file)}
                              variant="ghost"
                              size="sm"
                              className="ml-2"
                              title={showImagePreview ? "Download image" : "Download file"}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })
            .filter(Boolean)}
        </div>
      </ScrollArea>
    </Card>
  );
}
