import { Progress } from '@/components/ui/progress';
import { getStoredSites } from '@/components/IntegrationsTab';

interface ProgressAndStatsDisplayProps {
  isProcessing: boolean;
  currentRow: number;
  totalRows: number;
  status: string;
  stats: {
    total: number;
    completed: number;
    error: number;
  };
  fileManager: {
    getAllFiles: () => Array<{ fileName: string; status: string }>;
  };
  postToWordPress: boolean;
  selectedWordPressSites: Set<string>;
}

export function ProgressAndStatsDisplay({
  isProcessing,
  currentRow,
  totalRows,
  status,
  stats,
  fileManager,
  postToWordPress,
  selectedWordPressSites,
}: ProgressAndStatsDisplayProps) {
  const progressPercentage = totalRows > 0 ? (currentRow / totalRows) * 100 : 0;

  return (
    <>
      {/* Progress Display */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Processing row {currentRow + 1} of {totalRows}</span>
            <span className="text-muted-foreground">{status}</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      )}

      {/* Stats */}
      {stats.total > 0 && (
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Files: </span>
            <span className="font-medium">{stats.total}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed: </span>
            <span className="font-medium text-green-500">{stats.completed}</span>
          </div>
          {postToWordPress && selectedWordPressSites.size > 0 && (() => {
            const allFiles = fileManager.getAllFiles();
            const wordPressFiles = allFiles.filter(f => f.fileName.startsWith('wordpress-post-') && f.status === 'completed');
            const uploadedCount = wordPressFiles.length;
            const sites = getStoredSites();
            const selectedSites = sites.filter(s => selectedWordPressSites.has(s.id));
            const siteNames = selectedSites.map(s => s.name).join(', ');
            return uploadedCount > 0 ? (
              <div>
                <span className="text-muted-foreground">WordPress: </span>
                <span className="font-medium text-blue-500">✓ {uploadedCount} POST UPLOADED TO {selectedSites.length > 1 ? `${selectedSites.length} SITES` : siteNames.toUpperCase()}!</span>
              </div>
            ) : null;
          })()}
          {stats.error > 0 && (
            <div>
              <span className="text-muted-foreground">Errors: </span>
              <span className="font-medium text-red-500">{stats.error}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
