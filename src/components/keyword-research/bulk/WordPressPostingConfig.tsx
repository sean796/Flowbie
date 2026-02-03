import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Globe, Info, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { formatSchedulePreview, getNextAvailableStartDate, type ScheduleFrequency } from '@/lib/wordpress-scheduler';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';

interface SiteConfig {
  sitemapType: 'post' | 'entity';
}

interface WordPressPostingConfigProps {
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
  totalRows: number;
  isDisabled?: boolean;
  checkboxId?: string;
  connectedSite?: { name: string; siteUrl: string } | null;
}

export function WordPressPostingConfig({
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
  totalRows,
  isDisabled = false,
  checkboxId = 'post-to-wordpress',
  connectedSite,
}: WordPressPostingConfigProps) {
  const sites = getStoredSites();
  const selectedSites = sites.filter(s => selectedWordPressSites.has(s.id));

  // Find the site that matches the connected site URL
  const getTargetSite = () => {
    if (connectedSite && sites.length > 0) {
      const normalize = (url: string) => url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
      const matchedSite = sites.find(s => normalize(s.siteUrl) === normalize(connectedSite.siteUrl));
      if (matchedSite) {
        return matchedSite;
      }
    }
    // Fallback to first site if no match
    return sites.length > 0 ? sites[0] : null;
  };

  const targetSite = getTargetSite();

  const handlePostToWordPressChange = (checked: boolean) => {
    setPostToWordPress(checked);
    if (checked) {
      // Initialize with target site (connected site if available, otherwise first site)
      if (targetSite) {
        setSelectedWordPressSites(new Set([targetSite.id]));
        // Initialize default config for target site only
        setSiteConfigs({
          [targetSite.id]: {
            sitemapType: 'post',
          },
        });
      }
    } else {
      setSelectedWordPressSites(new Set());
      setSiteConfigs({});
    }
  };


  const schedulePreview = totalRows > 0 ? (() => {
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
  })() : '';

  return (
    <div className="p-4 bg-muted/30 rounded-lg border mt-4">
      <div className="mb-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={checkboxId}
            checked={postToWordPress}
            onCheckedChange={handlePostToWordPressChange}
            disabled={isDisabled}
          />
          <Label
            htmlFor={checkboxId}
            className="text-sm font-semibold cursor-pointer"
          >
            Post to WordPress
          </Label>
        </div>
      </div>

      {postToWordPress && (
        <div className="space-y-4 mt-3">
          {/* Single Site Configuration */}
          {targetSite && (() => {
            const site = targetSite;
            const config = siteConfigs[site.id] || {
              sitemapType: 'post' as const,
            };
            
            return (
              <div className="p-3 border rounded-lg bg-muted/20 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{site.name}</span>
                </div>

                {/* Sitemap Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Choose Sitemap to Post To</Label>
                  <Select
                    value={config.sitemapType}
                    onValueChange={(value: 'post' | 'entity') => {
                      setSiteConfigs(prev => ({
                        ...prev,
                        [site.id]: {
                          ...prev[site.id],
                          sitemapType: value,
                        },
                      }));
                    }}
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post">Post (post-sitemap.xml)</SelectItem>
                      <SelectItem value="entity" disabled={!site.entitySitemapUrl}>
                        Entity ({site.entitySitemapUrl ? site.entitySitemapUrl.split('/').pop() : 'Not configured'})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {config.sitemapType === 'post' 
                      ? 'Content will be posted to post-sitemap.xml (standard posts)'
                      : site.entitySitemapUrl
                        ? `Content will be posted to ${site.entitySitemapUrl.split('/').pop()} (entity/custom post type)`
                        : 'Entity sitemap not configured. Please set entitySitemapUrl in WordPress site settings.'}
                  </p>
                </div>
              </div>
            );
          })()}

            {/* Shared Scheduling Options */}
            <div className="pt-3 border-t space-y-3">
              <Label className="text-xs font-semibold">Scheduling Options</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Frequency */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Schedule Frequency</Label>
                <Select
                  value={scheduleFrequency}
                  onValueChange={(value: ScheduleFrequency) => setScheduleFrequency(value)}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom Interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Day of Week (for weekly) */}
              {scheduleFrequency === 'weekly' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Day of Week</Label>
                  <Select
                    value={dayOfWeek.toString()}
                    onValueChange={(value) => setDayOfWeek(parseInt(value))}
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Custom Interval */}
              {scheduleFrequency === 'custom' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Every N Days</Label>
                  <Input
                    type="number"
                    min="1"
                    value={customInterval}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setCustomInterval(Math.max(1, value));
                    }}
                    disabled={isDisabled}
                    className="h-9"
                  />
                </div>
              )}

              {/* Start Date Option */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Start Date</Label>
                <RadioGroup
                  value={startDateOption}
                  onValueChange={(value: 'immediate' | 'custom') => setStartDateOption(value)}
                  disabled={isDisabled}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="immediate" id={`start-immediate-${checkboxId}`} />
                    <Label htmlFor={`start-immediate-${checkboxId}`} className="text-xs font-normal cursor-pointer">
                      Start Immediately
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id={`start-custom-${checkboxId}`} />
                    <Label htmlFor={`start-custom-${checkboxId}`} className="text-xs font-normal cursor-pointer">
                      Custom Date
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Custom Date Picker */}
              {startDateOption === 'custom' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Select Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-9 justify-start text-left font-normal"
                        disabled={isDisabled}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customStartDate ? format(customStartDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={(date) => date && setCustomStartDate(date)}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Time Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posting Time
                </Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isDisabled}
                  className="h-9"
                />
              </div>
            </div>

            {/* Schedule Preview */}
            {schedulePreview && (
              <div className="p-2 bg-primary/10 border border-primary/20 rounded text-xs">
                <div className="flex items-start gap-2">
                  <Info className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-primary">{schedulePreview}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
