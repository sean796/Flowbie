import React, { useCallback, useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { BlueprintData } from "../hooks/use-blueprint-management";
import { Button } from "@/components/ui/button";

interface BlueprintInspectorContentProps {
  generateCurrentBlueprintData: () => BlueprintData;
}

export const BlueprintInspectorContent: React.FC<BlueprintInspectorContentProps> = ({ 
  generateCurrentBlueprintData 
}) => {
  const blueprintData = useMemo(() => generateCurrentBlueprintData(), [generateCurrentBlueprintData]);
  const rawJson = useMemo(() => JSON.stringify(blueprintData, null, 2), [blueprintData]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawJson);
    toast.success("Blueprint JSON copied to clipboard!");
  }, [rawJson]);
  
  return (
    <div className="flex flex-col h-[70vh] bg-card rounded-lg border border-border p-6 space-y-4">
      {/* Header with Copy Button */}
      <div className="flex justify-between items-center pb-2 border-b border-border/50">
        <h2 className="text-xl font-semibold">Current Blueprint Overview</h2>
        <Button onClick={handleCopy} variant="secondary" size="sm">
          <Copy className="h-4 w-4 mr-2" />
          Copy JSON
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Left Panel: Blueprint JSON */}
        <div className="flex flex-col w-2/3 min-h-0">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Blueprint JSON (for export)</h3>
          <pre className="text-xs font-mono text-foreground bg-input border border-border rounded-md p-4 overflow-auto h-full whitespace-pre-wrap flex-1">
            <code>{rawJson}</code>
          </pre>
        </div>

        {/* Right Panel: Attached Files */}
        <div className="flex flex-col w-1/3 min-h-0">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Attached Files (for RAG) - References Only</h3>
          <div className="text-xs font-mono text-foreground bg-input border border-border rounded-md p-4 overflow-auto h-full whitespace-pre-wrap flex-1 space-y-2">
            {blueprintData.knowledgeFiles.length === 0 ? (
              <p className="text-muted-foreground">No files attached to this blueprint (only metadata references).</p>
            ) : (
              blueprintData.knowledgeFiles.map(file => (
                <div key={file.name} className="p-2 border-b border-border">
                  <p className="font-semibold">{file.name}</p>
                  <p className="text-muted-foreground">Size: {file.size} bytes</p>
                  <p className="text-muted-foreground">Attached: {file.starred ? 'Starred' : 'No Star'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
