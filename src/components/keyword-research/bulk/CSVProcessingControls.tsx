import { Button } from '@/components/ui/button';
import { Play, Square, Loader2 } from 'lucide-react';

interface CSVProcessingControlsProps {
  inputMode: 'csv' | 'prompt';
  rows: Array<unknown>;
  displayRows: Array<unknown>;
  isProcessing: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  handleStartProcessing: () => Promise<void>;
  cancelProcessing: () => void;
}

export function CSVProcessingControls({
  inputMode,
  rows,
  displayRows,
  isProcessing,
  apiKey,
  openRouterApiKey,
  handleStartProcessing,
  cancelProcessing,
}: CSVProcessingControlsProps) {
  if (inputMode !== 'csv' || rows.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleStartProcessing}
        disabled={isProcessing || displayRows.length === 0 || !apiKey || !openRouterApiKey}
        className="flex-1 bg-primary hover:bg-primary/90 text-black"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Start Processing
          </>
        )}
      </Button>
      {isProcessing && (
        <Button
          onClick={cancelProcessing}
          variant="destructive"
        >
          <Square className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      )}
    </div>
  );
}
