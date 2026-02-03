import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ANALYSIS_METHODS, type AnalysisMethod } from '@/lib/gsc-keyword-analyzer';
import type { WordPressSite } from '@/components/IntegrationsTab';

interface GSCAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gscAnalysisSite: WordPressSite | null;
  selectedAnalysisMethods: AnalysisMethod[];
  setSelectedAnalysisMethods: (methods: AnalysisMethod[]) => void;
  isFetchingGSC: boolean;
  onAnalyze: (site: WordPressSite, methods: AnalysisMethod[]) => void;
}

export function GSCAnalysisDialog({
  open,
  onOpenChange,
  gscAnalysisSite,
  selectedAnalysisMethods,
  setSelectedAnalysisMethods,
  isFetchingGSC,
  onAnalyze,
}: GSCAnalysisDialogProps) {
  const handleAnalyze = () => {
    if (gscAnalysisSite) {
      onAnalyze(gscAnalysisSite, selectedAnalysisMethods);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Analysis Methods</DialogTitle>
          <DialogDescription>
            Choose one or more analysis methods to analyze GSC queries for {gscAnalysisSite?.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {(Object.keys(ANALYSIS_METHODS) as AnalysisMethod[]).map((method) => {
            const methodInfo = ANALYSIS_METHODS[method];
            const isSelected = selectedAnalysisMethods.includes(method);
            
            return (
              <div
                key={method}
                className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  id={method}
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedAnalysisMethods([...selectedAnalysisMethods, method]);
                    } else {
                      setSelectedAnalysisMethods(selectedAnalysisMethods.filter(m => m !== method));
                    }
                  }}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label
                    htmlFor={method}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {methodInfo.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {methodInfo.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={selectedAnalysisMethods.length === 0 || !gscAnalysisSite || isFetchingGSC}
            className="bg-primary hover:bg-primary/90 text-black font-bold"
          >
            Analyze & Use Keywords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
