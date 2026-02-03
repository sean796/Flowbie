import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle } from "lucide-react";
import { DraftData } from "@/hooks/use-autosave";
import { formatDistanceToNow } from "date-fns";

interface DraftRecoveryDialogProps {
  open: boolean;
  draft: DraftData | null;
  onRecover: () => void;
  onDiscard: () => void;
}

export const DraftRecoveryDialog: React.FC<DraftRecoveryDialogProps> = ({
  open,
  draft,
  onRecover,
  onDiscard,
}) => {
  const timeAgo = draft
    ? formatDistanceToNow(new Date(draft.timestamp), { addSuffix: true })
    : "";

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onDiscard()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" />
            Unsaved Draft Found
          </DialogTitle>
          <DialogDescription className="pt-2">
            We found an unsaved draft from your previous session.
          </DialogDescription>
        </DialogHeader>
        
        {draft && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {draft.blueprint.title || "Untitled Blueprint"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Last saved {timeAgo}
                </p>
                {draft.blueprint.purpose && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {draft.blueprint.purpose}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {draft.blueprint.agents.length} agent(s) configured
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onDiscard}
            className="w-full sm:w-auto"
          >
            Discard Draft
          </Button>
          <Button
            onClick={onRecover}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90"
          >
            Recover Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
