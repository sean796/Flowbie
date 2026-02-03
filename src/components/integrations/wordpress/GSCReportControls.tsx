import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Loader2, Search, FileText, Calendar as CalendarIcon } from "lucide-react";
import { formatDateRange, type DateRangePreset } from "@/lib/gsc-date-helpers";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface GSCReportControlsProps {
  site: WordPressSite;
  dateRangePreset: DateRangePreset;
  customDateRanges: {
    currentStart: Date | undefined;
    currentEnd: Date | undefined;
    comparisonStart: Date | undefined;
    comparisonEnd: Date | undefined;
  };
  isFetchingGSC?: string | null;
  isGeneratingReport?: string | null;
  onDateRangePresetChange: (preset: DateRangePreset) => void;
  onCustomDateRangeChange: (dates: {
    currentStart?: Date;
    currentEnd?: Date;
    comparisonStart?: Date;
    comparisonEnd?: Date;
  }) => void;
  onFetch: () => void;
  onGenerate?: () => void;
}

export const GSCReportControls: React.FC<GSCReportControlsProps> = ({
  site,
  dateRangePreset,
  customDateRanges,
  isFetchingGSC,
  isGeneratingReport,
  onDateRangePresetChange,
  onCustomDateRangeChange,
  onFetch,
  onGenerate,
}) => {
  return (
    <div className="space-y-3">
      {/* Date Range Selection */}
      <div className="space-y-2">
        <Label className={`text-xs ${getCyberpunkTextClasses('primary')} uppercase tracking-wider font-semibold`}>Report Date Range</Label>
        <div className="flex gap-2">
          <Select
            value={dateRangePreset}
            onValueChange={(value) => onDateRangePresetChange(value as DateRangePreset)}
            disabled={isGeneratingReport === site.id || site.enabled === false}
          >
            <SelectTrigger className={`flex-1 h-9 text-xs ${getCyberpunkButtonClasses()}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
              <SelectItem value="month-to-month">Month to Month</SelectItem>
              <SelectItem value="same-period-last-month">Same Period vs Last Month</SelectItem>
              <SelectItem value="year-over-year">Year Over Year</SelectItem>
              <SelectItem value="similar-timeframe">Similar Timeframe</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date pickers for Same Period vs Last Month and Custom */}
        {(dateRangePreset === 'custom' || dateRangePreset === 'same-period-last-month') && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">{dateRangePreset === 'same-period-last-month' ? 'Period Start (e.g. Jan 1)' : 'Current Start'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={`h-8 w-full text-xs justify-start font-normal ${getCyberpunkButtonClasses()}`} disabled={isGeneratingReport === site.id || site.enabled === false}>
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {customDateRanges.currentStart ? format(customDateRanges.currentStart, 'MM/dd/yyyy') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border border-green-500/50 text-green-300" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateRanges.currentStart}
                    onSelect={(date) => {
                      if (date) {
                        const existing = customDateRanges;
                        const newCurrentStart = date;
                        const newCurrentEnd = existing.currentEnd && existing.currentEnd >= date ? existing.currentEnd : date;
                        
                        // Calculate comparison period (previous period of same length)
                        const daysDiff = newCurrentEnd && newCurrentStart 
                          ? Math.ceil((newCurrentEnd.getTime() - newCurrentStart.getTime()) / (1000 * 60 * 60 * 24))
                          : 0;
                        const comparisonEnd = new Date(newCurrentStart);
                        comparisonEnd.setDate(comparisonEnd.getDate() - 1);
                        const comparisonStart = new Date(comparisonEnd);
                        comparisonStart.setDate(comparisonStart.getDate() - daysDiff);
                        
                        onCustomDateRangeChange({
                          currentStart: newCurrentStart,
                          currentEnd: newCurrentEnd,
                          comparisonStart: daysDiff > 0 ? comparisonStart : existing.comparisonStart,
                          comparisonEnd: daysDiff > 0 ? comparisonEnd : existing.comparisonEnd,
                        });
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{dateRangePreset === 'same-period-last-month' ? 'Period End (e.g. Jan 14)' : 'Current End'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={`h-8 w-full text-xs justify-start font-normal ${getCyberpunkButtonClasses()}`} disabled={isGeneratingReport === site.id || site.enabled === false}>
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {customDateRanges.currentEnd ? format(customDateRanges.currentEnd, 'MM/dd/yyyy') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#1a1a1a] border border-green-500/50 text-green-300" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateRanges.currentEnd}
                    onSelect={(date) => {
                      if (date) {
                        const existing = customDateRanges;
                        const newCurrentStart = existing.currentStart && existing.currentStart <= date ? existing.currentStart : date;
                        const newCurrentEnd = date;
                        const daysDiff = newCurrentEnd && newCurrentStart 
                          ? Math.ceil((newCurrentEnd.getTime() - newCurrentStart.getTime()) / (1000 * 60 * 60 * 24))
                          : 0;
                        let comparisonStart: Date, comparisonEnd: Date;
                        if (dateRangePreset === 'same-period-last-month' && daysDiff > 0) {
                          const cmpStart = new Date(newCurrentStart);
                          cmpStart.setMonth(cmpStart.getMonth() - 1);
                          const cmpEnd = new Date(newCurrentEnd);
                          cmpEnd.setMonth(cmpEnd.getMonth() - 1);
                          comparisonStart = cmpStart;
                          comparisonEnd = cmpEnd;
                        } else if (daysDiff > 0) {
                          comparisonEnd = new Date(newCurrentStart);
                          comparisonEnd.setDate(comparisonEnd.getDate() - 1);
                          comparisonStart = new Date(comparisonEnd);
                          comparisonStart.setDate(comparisonStart.getDate() - daysDiff);
                        } else {
                          comparisonStart = existing.comparisonStart!;
                          comparisonEnd = existing.comparisonEnd!;
                        }
                        onCustomDateRangeChange({
                          currentStart: newCurrentStart,
                          currentEnd: newCurrentEnd,
                          comparisonStart: daysDiff > 0 ? comparisonStart : existing.comparisonStart,
                          comparisonEnd: daysDiff > 0 ? comparisonEnd : existing.comparisonEnd,
                        });
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {/* Display selected date ranges */}
        {dateRangePreset && dateRangePreset !== 'custom' && customDateRanges.currentStart && customDateRanges.currentEnd && (
          <div className={`text-xs ${getCyberpunkTextClasses('muted')} space-y-0.5 p-3 bg-green-500/5 rounded border border-green-500/20 font-mono`}>
            {dateRangePreset === 'same-period-last-month' ? (
              <>
                <div className={`${getCyberpunkTextClasses('primary')} font-medium`}>Your period:</div>
                <div>{formatDateRange({ startDate: customDateRanges.currentStart, endDate: customDateRanges.currentEnd })}</div>
                {customDateRanges.comparisonStart && customDateRanges.comparisonEnd && (
                  <>
                    <div className={`${getCyberpunkTextClasses('primary')} font-medium mt-1`}>Comparison (same period, previous month):</div>
                    <div>{formatDateRange({ startDate: customDateRanges.comparisonStart, endDate: customDateRanges.comparisonEnd })}</div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className={`${getCyberpunkTextClasses('primary')} font-medium`}>Current Period:</div>
                <div>{formatDateRange({ startDate: customDateRanges.currentStart, endDate: customDateRanges.currentEnd })}</div>
                {customDateRanges.comparisonStart && customDateRanges.comparisonEnd && (
                  <>
                    <div className={`${getCyberpunkTextClasses('primary')} font-medium mt-1`}>Comparison Period:</div>
                    <div>{formatDateRange({ startDate: customDateRanges.comparisonStart, endDate: customDateRanges.comparisonEnd })}</div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onFetch}
          disabled={isFetchingGSC === site.id || isGeneratingReport === site.id || site.enabled === false}
          className={`flex-1 ${getCyberpunkButtonClasses()} transition-all`}
        >
          {isFetchingGSC === site.id ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Fetch GSC Queries
            </>
          )}
        </Button>
        {onGenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerate}
            disabled={isFetchingGSC === site.id || isGeneratingReport === site.id || site.enabled === false}
            className={`flex-1 ${getCyberpunkButtonClasses()} transition-all`}
          >
            {isGeneratingReport === site.id ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

