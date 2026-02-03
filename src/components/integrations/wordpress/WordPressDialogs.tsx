import React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { SiteDialog } from "./SiteDialog";
import { KeywordSelectionDialog } from "./KeywordSelectionDialog";
import { DeathStarBulkOptimizationModal } from "./DeathStarBulkOptimizationModal";
import { MasterOptimizationModal } from "./MasterOptimizationModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { WordPressSite } from "../types";

interface WordPressDialogsProps {
  // Site Dialog
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  editingSite: WordPressSite | null;
  formName: string;
  formSiteUrl: string;
  formUsername: string;
  formAppPassword: string;
  onFormNameChange: (name: string) => void;
  onFormSiteUrlChange: (url: string) => void;
  onFormUsernameChange: (username: string) => void;
  onFormAppPasswordChange: (password: string) => void;
  onSaveSite: () => void;

  // Master Optimization Modal
  masterOptimizationModalOpen: boolean;
  onMasterOptimizationModalOpenChange: (open: boolean) => void;
  masterOptimizationState: any;

  // Bulk Optimization Modals
  sites: WordPressSite[];
  bulkOptimizationModalOpen: Record<string, boolean>;
  onBulkOptimizationModalOpenChange: (siteId: string, open: boolean) => void;
  bulkOptimizationState: Record<string, any>;
  optimizationProgress: Record<string, any>;

  // Keyword Selection Dialogs
  gscQueriesForSelection: Record<string, any[]>;
  isKeywordSelectionOpen: Record<string, boolean>;
  gscClusterAnalysis: Record<string, any>;
  isAnalyzingClusters: Record<string, boolean>;
  selectedCluster: Record<string, number | null>;
  onSelectCluster: (siteId: string, clusterIdx: number) => void;
  onSelectKeyword: (siteId: string, keyword: any, clusterKeywords?: string[]) => void;
  onCancelKeywordSelection: (siteId: string) => void;

  // Master Optimization Confirmation
  showOptimizationConfirmDialog: boolean;
  onShowOptimizationConfirmDialogChange: (show: boolean) => void;
  selectedSitesForMasterOptimization: Set<string>;
  masterUpdateMode: 'update' | 'draft';
  masterInContentImageType: string;
  masterInContentImagePrompt: string;
  onConfirmMasterOptimization: () => Promise<void>;
}

export const WordPressDialogs: React.FC<WordPressDialogsProps> = ({
  isDialogOpen,
  onDialogOpenChange,
  editingSite,
  formName,
  formSiteUrl,
  formUsername,
  formAppPassword,
  onFormNameChange,
  onFormSiteUrlChange,
  onFormUsernameChange,
  onFormAppPasswordChange,
  onSaveSite,
  masterOptimizationModalOpen,
  onMasterOptimizationModalOpenChange,
  masterOptimizationState,
  sites,
  bulkOptimizationModalOpen,
  onBulkOptimizationModalOpenChange,
  bulkOptimizationState,
  optimizationProgress,
  gscQueriesForSelection,
  isKeywordSelectionOpen,
  gscClusterAnalysis,
  isAnalyzingClusters,
  selectedCluster,
  onSelectCluster,
  onSelectKeyword,
  onCancelKeywordSelection,
  showOptimizationConfirmDialog,
  onShowOptimizationConfirmDialogChange,
  selectedSitesForMasterOptimization,
  masterUpdateMode,
  masterInContentImageType,
  masterInContentImagePrompt,
  onConfirmMasterOptimization,
}) => {
  return (
    <>
      {/* Add/Edit Site Dialog */}
      <SiteDialog
        open={isDialogOpen}
        onOpenChange={onDialogOpenChange}
        editingSite={editingSite}
        formName={formName}
        formSiteUrl={formSiteUrl}
        formUsername={formUsername}
        formAppPassword={formAppPassword}
        onFormNameChange={onFormNameChange}
        onFormSiteUrlChange={onFormSiteUrlChange}
        onFormUsernameChange={onFormUsernameChange}
        onFormAppPasswordChange={onFormAppPasswordChange}
        onSave={onSaveSite}
      />

      {/* Master Optimization Modal */}
      <MasterOptimizationModal
        open={masterOptimizationModalOpen}
        onOpenChange={onMasterOptimizationModalOpenChange}
        masterState={masterOptimizationState}
      />

      {/* Bulk Optimization Modals */}
      {sites
        .filter((site) => bulkOptimizationModalOpen[site.id])
        .map((site) => {
          const batchKey = `${site.id}-batch`;
          const bulkState = bulkOptimizationState[batchKey];
          const siteProgress = optimizationProgress[site.id];
          
          return (
            <DeathStarBulkOptimizationModal
              key={`bulk-modal-${site.id}`}
              open={true}
              onOpenChange={(open) => {
                if (!open) {
                  onBulkOptimizationModalOpenChange(site.id, false);
                }
              }}
              bulkState={bulkState || null}
              siteProgress={siteProgress}
            />
          );
        })}

      {/* Keyword Selection Dialogs */}
      {sites.map((site) => {
        try {
          const queries = Array.isArray(gscQueriesForSelection[site.id]) 
            ? gscQueriesForSelection[site.id] 
            : [];
          const isOpen = Boolean(isKeywordSelectionOpen[site.id]);
        
          if (!isOpen || queries.length === 0) return null;

          return (
            <ErrorBoundary
              key={site.id}
              fallback={
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="bg-card border border-border rounded-lg p-4 max-w-md">
                    <p className="text-sm text-muted-foreground">
                      Error displaying keyword selection dialog. Please try again.
                    </p>
                    <Button
                      onClick={() => onCancelKeywordSelection(site.id)}
                      className="mt-4"
                      variant="outline"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              }
            >
              <KeywordSelectionDialog
                open={isOpen} 
                onOpenChange={(open) => {
                  if (!open) {
                    onCancelKeywordSelection(site.id);
                  }
                }}
                queries={queries}
                clusterAnalysis={gscClusterAnalysis[site.id]}
                isAnalyzingClusters={Boolean(isAnalyzingClusters[site.id])}
                selectedCluster={selectedCluster[site.id] ?? null}
                onSelectCluster={(clusterIdx) => {
                  try {
                    onSelectCluster(site.id, clusterIdx);
                  } catch (error) {
                    console.error('[WordPressDialogs] Error selecting cluster:', error);
                  }
                }}
                onSelectKeyword={(keyword, clusterKeywords) => {
                  try {
                    onSelectKeyword(site.id, keyword, clusterKeywords);
                  } catch (error) {
                    console.error('[WordPressDialogs] Error selecting keyword:', error);
                    toast.error('Failed to continue optimization. Please try again.');
                  }
                }}
                onCancel={() => {
                  try {
                    onCancelKeywordSelection(site.id);
                  } catch (error) {
                    console.error('[WordPressDialogs] Error canceling keyword selection:', error);
                  }
                }}
              />
            </ErrorBoundary>
          );
        } catch (error) {
          console.error('[WordPressDialogs] Error rendering keyword dialog for site:', site.id, error);
          return null;
        }
      })}

      {/* Confirmation Dialog for Master Optimization */}
      <AlertDialog open={showOptimizationConfirmDialog} onOpenChange={onShowOptimizationConfirmDialogChange}>
        <AlertDialogContent className="bg-card border-green-500/20">
          <AlertDialogHeader>
            <AlertDialogTitle className={getCyberpunkTextClasses('primary')}>
              Confirm Master Optimization
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              You are about to optimize {selectedSitesForMasterOptimization.size} site{selectedSitesForMasterOptimization.size !== 1 ? 's' : ''}. 
              This will process all selected sites according to your optimization settings.
              <br /><br />
              <strong>Are you sure you want to proceed?</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => onShowOptimizationConfirmDialogChange(false)}
              className={getCyberpunkButtonClasses()}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                onShowOptimizationConfirmDialogChange(false);
                await onConfirmMasterOptimization();
              }}
              className={`${getCyberpunkButtonClasses(true)} bg-green-500 hover:bg-green-600`}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Confirm & Optimize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
