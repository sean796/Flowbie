import { Button } from "@/components/ui/button";
import { X, Copy, Code, Check, XCircle, RotateCcw, Edit } from "lucide-react";
import { handleCopy } from "../utils";

interface OutputToolbarProps {
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  planApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  plan?: string;
  finalOutput?: string;
  isGenerating: boolean;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  onRetryPlan?: () => void;
  onModifyPlan?: () => void;
  onModifyFinal?: () => void;
  onAbort: () => void;
}

export function OutputToolbar({
  currentStage,
  planApprovalStatus,
  plan,
  finalOutput,
  isGenerating,
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  onModifyPlan,
  onModifyFinal,
  onAbort,
}: OutputToolbarProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4 border-b border-border/50 bg-background/50 flex-shrink-0">
      <div className="flex gap-2 flex-wrap justify-center">
        {/* Approval/Reject/Retry buttons */}
        {currentStage === 'plan_approval_pending' && planApprovalStatus === 'pending' && onApprovePlan && onRejectPlan && (
          <>
            <Button
              variant="default"
              onClick={onApprovePlan}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-4 w-4 mr-2" />
              Approve Plan
            </Button>
            <Button
              variant="secondary"
              onClick={onRejectPlan}
              className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject Plan
            </Button>
          </>
        )}
        {planApprovalStatus === 'rejected' && onRetryPlan && (
          <>
            <Button
              variant="default"
              onClick={onRetryPlan}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry Plan
            </Button>
            {onModifyPlan && (
              <Button
                variant="secondary"
                onClick={onModifyPlan}
                className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify Plan
              </Button>
            )}
          </>
        )}
        {/* Modify Plan and Modify Final buttons after completion */}
        {(currentStage === 'complete' || currentStage === 'error') && (
          <>
            {plan && onModifyPlan && (
              <Button
                variant="secondary"
                onClick={onModifyPlan}
                className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify Plan
              </Button>
            )}
            {finalOutput && onModifyFinal && (
              <Button
                variant="secondary"
                onClick={onModifyFinal}
                className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify Final Report
              </Button>
            )}
          </>
        )}

        <Button
          variant="secondary"
          onClick={() => handleCopy(finalOutput || '', 'markdown')}
          disabled={isGenerating || !finalOutput}
          className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
        >
          <Copy className="h-4 w-4 mr-2" />
          Copy Final Markdown
        </Button>
        
        <Button
          variant="secondary"
          onClick={() => handleCopy(finalOutput || '', 'html')}
          disabled={isGenerating || !finalOutput}
          className="text-xs bg-background border-border hover:bg-background/80 text-foreground"
        >
          <Code className="h-4 w-4 mr-2" />
          Copy Final HTML
        </Button>

        {isGenerating && (
          <Button
            variant="default"
            onClick={onAbort}
            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!isGenerating}
          >
            <X className="h-4 w-4 mr-2" />
            Abort Generation
          </Button>
        )}
      </div>
    </div>
  );
}

