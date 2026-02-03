/**
 * Template Selector Component
 * Dropdown for selecting template WordPress site
 */

import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import type { WordPressSite } from "@/components/integrations/types";

interface TemplateSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  value,
  onValueChange,
  disabled = false
}) => {
  const { sites } = useWordPressSites();

  // Filter enabled and connected sites
  const availableSites = sites.filter(
    site => site.enabled !== false && site.connectionStatus !== 'failed'
  );

  // Default to "Hunter Douglas" if available
  React.useEffect(() => {
    if (!value && availableSites.length > 0) {
      const hunterDouglas = availableSites.find(
        site => site.name.toLowerCase().includes('hunter') || 
                site.name.toLowerCase().includes('douglas')
      );
      if (hunterDouglas) {
        onValueChange(hunterDouglas.id);
      } else {
        onValueChange(availableSites[0].id);
      }
    }
  }, [value, availableSites, onValueChange]);

  if (availableSites.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Template Site</Label>
        <div className="text-sm text-muted-foreground p-3 border rounded-lg">
          No connected WordPress sites available. Please add a site in the Integrations tab first.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="template-selector">Template Site</Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger id="template-selector">
          <SelectValue placeholder="Select a template site" />
        </SelectTrigger>
        <SelectContent>
          {availableSites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name} ({site.siteUrl})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Select the WordPress site to use as a template for the new site
      </p>
    </div>
  );
};
