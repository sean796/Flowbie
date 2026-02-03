import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Globe, FileText } from 'lucide-react';

interface WordPressMarkdownFilesDisplayProps {
  wordPressMarkdownFiles: Array<{ name: string; content: string }>;
}

export function WordPressMarkdownFilesDisplay({
  wordPressMarkdownFiles,
}: WordPressMarkdownFilesDisplayProps) {
  if (wordPressMarkdownFiles.length === 0) {
    return null;
  }

  const handleDownload = (file: { name: string; content: string }) => {
    const blob = new Blob([file.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6 border-green-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-green-600" />
            WordPress Posts (Markdown)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            These posts have been added to the knowledge base and will be used for RAG context
          </p>
        </div>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {wordPressMarkdownFiles.map((file, idx) => (
            <Card key={idx} className="p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-green-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(file.content.length / 1024)} KB
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
