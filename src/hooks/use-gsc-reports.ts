import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { loadApiKey } from "@/lib/api";
import { generateGSCReportBlueprint } from "@/lib/gsc-report-generator";
import { fetchReportDiscoveryData } from "@/lib/report-discovery";
import { planReport } from "@/lib/report-planner";
import { 
  calculateMonthToMonth, 
  calculateYearOverYear, 
  calculatePreviousMonthSamePeriod,
  calculateSimilarTimeframe,
  formatDateForAPI,
  validateComparisonRanges,
  type DateRangePreset
} from "@/lib/gsc-date-helpers";
import { getStoredSites } from "@/components/integrations/storage";
import { type WordPressSite, type GSCPerformanceStats } from "@/components/integrations/types";
import type { AgentConfig } from "@/components/AgentNode";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export function useGSCReports(
  onBlueprintUpdate?: (agents: AgentConfig[], title?: string, purpose?: string) => void
) {
  const [isGeneratingReport, setIsGeneratingReport] = useState<string | null>(null);
  const [dateRangePreset, setDateRangePreset] = useState<Record<string, DateRangePreset>>({});
  const [customDateRanges, setCustomDateRanges] = useState<Record<string, {
    currentStart: Date | undefined;
    currentEnd: Date | undefined;
    comparisonStart: Date | undefined;
    comparisonEnd: Date | undefined;
  }>>({});

  useEffect(() => {
    // Initialize default date ranges (month-to-month) for all sites on first load
    const sitesList = getStoredSites();
    const ranges = calculateMonthToMonth();
    const initialDateRanges: Record<string, {
      currentStart: Date;
      currentEnd: Date;
      comparisonStart: Date;
      comparisonEnd: Date;
    }> = {};
    const initialPresets: Record<string, DateRangePreset> = {};
    
    sitesList.forEach(site => {
      initialDateRanges[site.id] = {
        currentStart: ranges.current.startDate,
        currentEnd: ranges.current.endDate,
        comparisonStart: ranges.comparison.startDate,
        comparisonEnd: ranges.comparison.endDate,
      };
      initialPresets[site.id] = 'month-to-month';
    });
    
    if (Object.keys(initialDateRanges).length > 0) {
      setCustomDateRanges(prev => ({ ...prev, ...initialDateRanges }));
      setDateRangePreset(prev => ({ ...prev, ...initialPresets }));
    }
  }, []);

  // Sync selected dates to REPORT_DATE_RANGE.md so AI agents can read and abide by them
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') ||
      (import.meta.env.DEV ? 'http://localhost:3001' : '');
    if (!API_BASE) return;

    syncRef.current && clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => {
      const sites = getStoredSites();
      const siteId = sites[0]?.id;
      if (!siteId) return;
      const ranges = customDateRanges[siteId];
      if (!ranges?.currentStart || !ranges?.currentEnd) return;

      const startDate = formatDateForAPI(ranges.currentStart);
      const endDate = formatDateForAPI(ranges.currentEnd);
      const compareStartDate = ranges.comparisonStart ? formatDateForAPI(ranges.comparisonStart) : undefined;
      const compareEndDate = ranges.comparisonEnd ? formatDateForAPI(ranges.comparisonEnd) : undefined;

      fetch(`${API_BASE}/api/gsc/report-date-range`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, compareStartDate, compareEndDate }),
      }).catch(() => {});
    }, 300);

    return () => { syncRef.current && clearTimeout(syncRef.current); };
  }, [customDateRanges, dateRangePreset]);

  const handleDateRangePresetChange = useCallback((siteId: string, preset: DateRangePreset) => {
    setDateRangePreset(prev => ({ ...prev, [siteId]: preset }));
    
    if (preset === 'month-to-month') {
      const ranges = calculateMonthToMonth();
      setCustomDateRanges(prev => ({
        ...prev,
        [siteId]: {
          currentStart: ranges.current.startDate,
          currentEnd: ranges.current.endDate,
          comparisonStart: ranges.comparison.startDate,
          comparisonEnd: ranges.comparison.endDate,
        }
      }));
    } else if (preset === 'year-over-year') {
      // For YoY, we need current dates first - use month-to-month as base
      const ranges = calculateMonthToMonth();
      const yoyRanges = calculateYearOverYear(ranges.current.startDate, ranges.current.endDate);
      setCustomDateRanges(prev => ({
        ...prev,
        [siteId]: {
          currentStart: yoyRanges.current.startDate,
          currentEnd: yoyRanges.current.endDate,
          comparisonStart: yoyRanges.comparison.startDate,
          comparisonEnd: yoyRanges.comparison.endDate,
        }
      }));
    } else if (preset === 'same-period-last-month') {
      // Default: first 14 days of last month vs same period in month before
      const ranges = calculateMonthToMonth();
      const curStart = ranges.current.startDate;
      const curEnd = new Date(curStart.getFullYear(), curStart.getMonth(), Math.min(14, new Date(curStart.getFullYear(), curStart.getMonth() + 1, 0).getDate()));
      const prevRanges = calculatePreviousMonthSamePeriod(curStart, curEnd);
      setCustomDateRanges(prev => ({
        ...prev,
        [siteId]: {
          currentStart: prevRanges.current.startDate,
          currentEnd: prevRanges.current.endDate,
          comparisonStart: prevRanges.comparison.startDate,
          comparisonEnd: prevRanges.comparison.endDate,
        }
      }));
    } else if (preset === 'similar-timeframe') {
      const ranges = calculateMonthToMonth();
      const similarRanges = calculateSimilarTimeframe(ranges.current.startDate, ranges.current.endDate);
      setCustomDateRanges(prev => ({
        ...prev,
        [siteId]: {
          currentStart: similarRanges.current.startDate,
          currentEnd: similarRanges.current.endDate,
          comparisonStart: similarRanges.comparison.startDate,
          comparisonEnd: similarRanges.comparison.endDate,
        }
      }));
    }
  }, []);

  const getDateRangesForSite = useCallback((siteId: string) => {
    const preset = dateRangePreset[siteId] || 'month-to-month';
    let custom = customDateRanges[siteId];
    
    if (!custom || !custom.currentStart || !custom.currentEnd) {
      // Initialize with month-to-month if not set
      const ranges = calculateMonthToMonth();
      custom = {
        currentStart: ranges.current.startDate,
        currentEnd: ranges.current.endDate,
        comparisonStart: ranges.comparison.startDate,
        comparisonEnd: ranges.comparison.endDate,
      };
      setCustomDateRanges(prev => ({ ...prev, [siteId]: custom! }));
      if (!dateRangePreset[siteId]) {
        setDateRangePreset(prev => ({ ...prev, [siteId]: 'month-to-month' }));
      }
    } else if ((preset === 'custom' || preset === 'same-period-last-month') && (!custom.comparisonStart || !custom.comparisonEnd)) {
      // For custom or same-period-last-month, calculate comparison when current period is set
      if (custom.currentStart && custom.currentEnd) {
        const ranges = preset === 'same-period-last-month'
          ? calculatePreviousMonthSamePeriod(custom.currentStart, custom.currentEnd)
          : (() => {
              const daysDiff = Math.ceil((custom.currentEnd!.getTime() - custom.currentStart!.getTime()) / (1000 * 60 * 60 * 24));
              const comparisonEnd = new Date(custom.currentStart!);
              comparisonEnd.setDate(comparisonEnd.getDate() - 1);
              const comparisonStart = new Date(comparisonEnd);
              comparisonStart.setDate(comparisonStart.getDate() - daysDiff);
              return { current: { startDate: custom.currentStart!, endDate: custom.currentEnd! }, comparison: { startDate: comparisonStart, endDate: comparisonEnd } };
            })();
        custom = {
          ...custom,
          comparisonStart: ranges.comparison.startDate,
          comparisonEnd: ranges.comparison.endDate,
        };
        setCustomDateRanges(prev => ({ ...prev, [siteId]: custom! }));
      }
    }

    return {
      current: {
        startDate: custom.currentStart!,
        endDate: custom.currentEnd!,
      },
      comparison: {
        startDate: custom.comparisonStart!,
        endDate: custom.comparisonEnd!,
      },
    };
  }, [dateRangePreset, customDateRanges]);

  const handleGenerateGSCReport = useCallback(async (site: WordPressSite) => {
    if (!onBlueprintUpdate) {
      toast.error("Blueprint update handler not available");
      return;
    }

    setIsGeneratingReport(site.id);

    try {
      // Get date ranges
      const ranges = getDateRangesForSite(site.id);
      
      // Validate ranges
      const validation = validateComparisonRanges({
        current: ranges.current,
        comparison: ranges.comparison,
      });

      if (!validation.valid) {
        toast.error(validation.error || "Invalid date range selection");
        setIsGeneratingReport(null);
        return;
      }

      const API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
        (import.meta.env.DEV ? 'http://localhost:3001' : '');

      if (!API_BASE) {
        throw new Error('Backend API URL not configured. Please set VITE_MCP_API_BASE environment variable.');
      }

      const startDate = formatDateForAPI(ranges.current.startDate);
      const endDate = formatDateForAPI(ranges.current.endDate);
      const compareStartDate = formatDateForAPI(ranges.comparison.startDate);
      const compareEndDate = formatDateForAPI(ranges.comparison.endDate);

      toast.info("Discovering site data and fetching GSC stats...");

      const discoveryData = await fetchReportDiscoveryData(
        site,
        { startDate, endDate, compareStartDate, compareEndDate },
        API_BASE,
        (msg) => toast.info(msg)
      );

      toast.info("Planning report sections...");

      const openRouterApiKey = loadApiKey();
      if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
        throw new Error('OpenRouter API key not found. Please set it in settings.');
      }

      const reportPlan = await planReport(
        discoveryData,
        openRouterApiKey,
        getResearchModel()
      );

      toast.info("Generating report blueprint...");

      const blueprintResult = await generateGSCReportBlueprint(
        discoveryData.stats as GSCPerformanceStats,
        site.name,
        site.siteUrl,
        {
          apiKey: openRouterApiKey,
          model: getResearchModel(),
          temperature: 1.0,
          maxTokens: 8000,
          topP: 0.9,
          entityPagesData: discoveryData.entityPagesData,
          historicalData: discoveryData.historicalData,
          discoveryData,
          reportPlan,
        }
      );

      // Update blueprint
      onBlueprintUpdate(blueprintResult.agents, blueprintResult.title, blueprintResult.purpose);

      toast.success(`GSC Performance Report generated: "${blueprintResult.title}"`);

    } catch (error) {
      console.error('Error generating GSC report:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate GSC report');
    } finally {
      setIsGeneratingReport(null);
    }
  }, [onBlueprintUpdate, getDateRangesForSite]);

  return {
    isGeneratingReport,
    dateRangePreset,
    customDateRanges,
    setCustomDateRanges,
    handleDateRangePresetChange,
    getDateRangesForSite,
    handleGenerateGSCReport,
  };
}

