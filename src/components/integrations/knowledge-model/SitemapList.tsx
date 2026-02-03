/**
 * Sitemap List Component
 * Displays all sitemaps from connected WordPress sites
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { SitemapInfo } from './types';

interface SitemapListProps {
  sitemaps: SitemapInfo[];
  selectedSitemaps: Set<string>;
  onSelectionChange: (url: string, selected: boolean) => void;
}

export const SitemapList: React.FC<SitemapListProps> = ({
  sitemaps,
  selectedSitemaps,
  onSelectionChange
}) => {
  if (sitemaps.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          No sitemaps detected. Please detect sitemaps for your WordPress sites first.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sitemaps.map((sitemap) => (
        <SitemapListItem
          key={sitemap.url}
          sitemap={sitemap}
          selected={selectedSitemaps.has(sitemap.url)}
          onToggle={(selected) => onSelectionChange(sitemap.url, selected)}
        />
      ))}
    </div>
  );
};

interface SitemapListItemProps {
  sitemap: SitemapInfo;
  selected: boolean;
  onToggle: (selected: boolean) => void;
}

const SitemapListItem: React.FC<SitemapListItemProps> = ({
  sitemap,
  selected,
  onToggle
}) => {
  return (
    <Card className="p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors">
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{sitemap.url}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs">
            {sitemap.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {sitemap.urlCount} URLs
          </span>
        </div>
      </div>
    </Card>
  );
};




