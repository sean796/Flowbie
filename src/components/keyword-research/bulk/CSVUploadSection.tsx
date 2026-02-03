import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Globe, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { WordPressPostingConfig } from './WordPressPostingConfig';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';

interface SiteConfig {
  sitemapType: 'post' | 'entity';
}

interface CSVUploadSectionProps {
  csvFile: File | null;
  setCsvFile: (file: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  rows: CSVRow[];
  loadCSV: (file: File) => Promise<CSVRow[]>;
  connectedSite: { name: string; siteUrl: string } | null;
  isProcessing: boolean;
  // WordPress posting props
  postToWordPress: boolean;
  setPostToWordPress: (value: boolean) => void;
  selectedWordPressSites: Set<string>;
  setSelectedWordPressSites: (value: Set<string>) => void;
  siteConfigs: Record<string, SiteConfig>;
  setSiteConfigs: (value: Record<string, SiteConfig> | ((prev: Record<string, SiteConfig>) => Record<string, SiteConfig>)) => void;
  scheduleFrequency: ScheduleFrequency;
  setScheduleFrequency: (value: ScheduleFrequency) => void;
  customInterval: number;
  setCustomInterval: (value: number) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  startDateOption: 'immediate' | 'custom';
  setStartDateOption: (value: 'immediate' | 'custom') => void;
  customStartDate: Date;
  setCustomStartDate: (value: Date) => void;
  startTime: string;
  setStartTime: (value: string) => void;
}

export function CSVUploadSection({
  csvFile,
  setCsvFile,
  fileInputRef,
  rows,
  loadCSV,
  connectedSite,
  isProcessing,
  postToWordPress,
  setPostToWordPress,
  selectedWordPressSites,
  setSelectedWordPressSites,
  siteConfigs,
  setSiteConfigs,
  scheduleFrequency,
  setScheduleFrequency,
  customInterval,
  setCustomInterval,
  dayOfWeek,
  setDayOfWeek,
  startDateOption,
  setStartDateOption,
  customStartDate,
  setCustomStartDate,
  startTime,
  setStartTime,
}: CSVUploadSectionProps) {
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      setCsvFile(file);
      const loadedRows = await loadCSV(file);
      toast.success(`Loaded ${loadedRows.length} rows from CSV`);
    } catch (error) {
      toast.error(`Failed to load CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCsvFile(null);
    }
  };

  return (
    <>
      {/* File Upload */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">CSV File</label>
          <a
            href="/bulk-auto-generate-template.csv"
            download="bulk-auto-generate-template.csv"
            className="text-xs text-primary hover:underline"
          >
            Download Template
          </a>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={isProcessing}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            variant="outline"
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            {csvFile ? csvFile.name : 'Select CSV File'}
          </Button>
          {csvFile && (
            <Button
              onClick={() => {
                setCsvFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              variant="ghost"
              size="sm"
              disabled={isProcessing}
            >
              Clear
            </Button>
          )}
        </div>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {rows.length} row{rows.length !== 1 ? 's' : ''} loaded
          </p>
        )}
      </div>

      {/* Connected Site Indicator for CSV Mode */}
      {connectedSite && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-primary">Target Site:</span>
                  <span className="text-xs font-medium truncate">{connectedSite.name}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mb-1.5" title={connectedSite.siteUrl}>
                  {connectedSite.siteUrl}
                </div>
                <div className="flex items-start gap-1.5">
                  <Info className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Used as knowledge source for generating relevant blog topics (not used as entity)
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* WordPress Posting Options for CSV Mode */}
      <WordPressPostingConfig
        postToWordPress={postToWordPress}
        setPostToWordPress={setPostToWordPress}
        selectedWordPressSites={selectedWordPressSites}
        setSelectedWordPressSites={setSelectedWordPressSites}
        siteConfigs={siteConfigs}
        setSiteConfigs={setSiteConfigs}
        scheduleFrequency={scheduleFrequency}
        setScheduleFrequency={setScheduleFrequency}
        customInterval={customInterval}
        setCustomInterval={setCustomInterval}
        dayOfWeek={dayOfWeek}
        setDayOfWeek={setDayOfWeek}
        startDateOption={startDateOption}
        setStartDateOption={setStartDateOption}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        startTime={startTime}
        setStartTime={setStartTime}
        totalRows={rows.length}
        isDisabled={isProcessing}
        checkboxId="post-to-wordpress-csv"
        connectedSite={connectedSite}
      />
    </>
  );
}
