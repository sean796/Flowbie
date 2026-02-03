import { useMemo } from 'react';
import { toast } from 'sonner';
import { formatSchedulePreview, getNextAvailableStartDate } from '@/lib/wordpress-scheduler';
import type { WordPressPostingOptions } from '@/lib/bulk-auto-generate';
import { getStoredSites } from '@/components/IntegrationsTab';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';

interface SiteConfig {
  sitemapType: 'post' | 'entity';
}

interface UseBulkProcessingProps {
  inputMode: 'csv' | 'prompt';
  rows: CSVRow[];
  generatedRows: CSVRow[];
  selectedBlogIndices: Set<number>;
  postToWordPress: boolean;
  selectedWordPressSites: Set<string>;
  siteConfigs: Record<string, SiteConfig>;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: 'immediate' | 'custom';
  customStartDate: Date;
  startTime: string;
  apiKey?: string;
  openRouterApiKey?: string;
  processAllRows: (rows: CSVRow[], wordPressPosting?: WordPressPostingOptions) => Promise<void>;
}

export function useBulkProcessing({
  inputMode,
  rows,
  generatedRows,
  selectedBlogIndices,
  postToWordPress,
  selectedWordPressSites,
  siteConfigs,
  scheduleFrequency,
  customInterval,
  dayOfWeek,
  startDateOption,
  customStartDate,
  startTime,
  apiKey,
  openRouterApiKey,
  processAllRows,
}: UseBulkProcessingProps) {
  // Calculate schedule preview
  const schedulePreview = useMemo(() => {
    if (!postToWordPress || selectedWordPressSites.size === 0) return '';
    
    try {
      const totalRows = inputMode === 'csv' ? (rows?.length || 0) : (generatedRows?.length || 0);
      if (totalRows === 0) return '';
      
      const startDate = startDateOption === 'immediate' 
        ? getNextAvailableStartDate(startTime)
        : customStartDate;
      
      return formatSchedulePreview({
        frequency: scheduleFrequency,
        customInterval: scheduleFrequency === 'custom' ? customInterval : undefined,
        dayOfWeek: scheduleFrequency === 'weekly' ? dayOfWeek : undefined,
        startDate,
        startTime,
        totalRows,
      });
    } catch (error) {
      console.error('Error calculating schedule preview:', error);
      return '';
    }
  }, [postToWordPress, selectedWordPressSites.size, inputMode, rows?.length, generatedRows?.length, startDateOption, startTime, customStartDate, scheduleFrequency, customInterval, dayOfWeek]);

  const handleStartProcessing = async () => {
    let rowsToProcess: CSVRow[] = [];

    if (inputMode === 'csv') {
      if (rows.length === 0) {
        toast.error('Please load a CSV file first');
        return;
      }
      rowsToProcess = rows;
    } else {
      if (generatedRows.length === 0) {
        toast.error('Please generate blog ideas from your prompt first');
        return;
      }
      if (selectedBlogIndices.size > 0) {
        rowsToProcess = Array.from(selectedBlogIndices)
          .sort((a, b) => a - b)
          .map(idx => generatedRows[idx])
          .filter((row): row is CSVRow => row !== undefined);
        
        if (rowsToProcess.length === 0) {
          toast.error('No valid rows selected');
          return;
        }
        toast.info(`Processing ${rowsToProcess.length} selected blog idea${rowsToProcess.length !== 1 ? 's' : ''}`);
      } else {
        rowsToProcess = generatedRows;
        toast.info('No selection made, processing all blog ideas');
      }
    }

    if (!apiKey || !openRouterApiKey) {
      toast.error('API keys are required');
      return;
    }

    // Build WordPress posting options for ALL selected sites
    let wordPressPosting: WordPressPostingOptions | undefined;
    if (postToWordPress && selectedWordPressSites.size > 0) {
      const sites = getStoredSites();
      const selectedSites = sites.filter(s => selectedWordPressSites.has(s.id));
      
      if (selectedSites.length === 0) {
        toast.error('No valid WordPress sites found for selected site IDs');
        return;
      }
      
      const startDate = startDateOption === 'immediate' 
        ? getNextAvailableStartDate(startTime)
        : customStartDate || new Date();
      
      // Build sites array with their individual configs
      const sitesArray = selectedSites.map(site => {
        const siteConfig = siteConfigs[site.id] || {
          sitemapType: 'post' as const,
        };
        
        return {
          site,
          sitemapType: siteConfig.sitemapType,
        };
      });
      
      // Use first site for backward compatibility (deprecated field)
      const firstSite = selectedSites[0];
      const firstSiteConfig = siteConfigs[firstSite.id] || {
        sitemapType: 'post' as const,
      };
      
      wordPressPosting = {
        enabled: true,
        site: firstSite, // Deprecated: kept for backward compatibility
        sitemapType: firstSiteConfig.sitemapType, // Deprecated: kept for backward compatibility
        frequency: scheduleFrequency,
        customInterval: scheduleFrequency === 'custom' ? customInterval : undefined,
        dayOfWeek: scheduleFrequency === 'weekly' ? dayOfWeek : undefined,
        startDate,
        startTime,
        totalRows: rowsToProcess.length,
        sites: sitesArray, // New: array of all selected sites with their configs
      };
      
      toast.info(`Posting to ${sitesArray.length} WordPress site(s): ${selectedSites.map(s => s.name).join(', ')}`);
    }

    await processAllRows(rowsToProcess, wordPressPosting);
  };

  return {
    schedulePreview,
    handleStartProcessing,
  };
}
