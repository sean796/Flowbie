import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses, getCyberpunkCardClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { testWordPressConnection } from "@/lib/wordpress-api";
import type { WordPressSite } from "@/components/integrations/types";

export interface WordPressSiteSelectorHandle {
  getSelectedSite: () => WordPressSite | null;
}

interface WordPressSiteSelectorProps {
  onSiteSelected: (site: WordPressSite | null) => void;
  selectedSite: WordPressSite | null;
}

export const WordPressSiteSelector: React.FC<WordPressSiteSelectorProps> = ({
  onSiteSelected,
  selectedSite,
}) => {
  const { sites } = useWordPressSites();
  const [testingSiteId, setTestingSiteId] = useState<string | null>(null);

  // Filter to only show connected/enabled sites
  const connectedSites = sites.filter(site => 
    site.enabled !== false && site.connectionStatus !== 'failed'
  );

  const handleSelectSite = async (site: WordPressSite) => {
    if (selectedSite?.id === site.id) {
      // Deselect if clicking the same site
      onSiteSelected(null);
      return;
    }

    // Test connection before selecting
    setTestingSiteId(site.id);
    try {
      const result = await testWordPressConnection(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      if (result.success) {
        onSiteSelected(site);
        toast.success(`Connected to ${site.name}`);
      } else {
        toast.error(`Connection failed: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestingSiteId(null);
    }
  };

  if (connectedSites.length === 0) {
    return (
      <Card className={cn(getCyberpunkCardClasses(), "p-6")}>
        <div className="text-center space-y-4">
          <Globe className="h-12 w-12 mx-auto text-green-400/70" />
          <div>
            <h3 className={cn(getCyberpunkTextClasses('primary'), "text-lg font-semibold mb-2")}>
              No WordPress Sites Connected
            </h3>
            <p className={cn(getCyberpunkTextClasses('muted'), "text-sm")}>
              Please connect a WordPress site in the Integrations tab first.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-4 items-center">
        <div className="col-span-6">
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold font-mono uppercase tracking-wider")}>
            Select WordPress Site
          </h3>
        </div>
        {selectedSite && (
          <div className="col-span-6 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSiteSelected(null)}
              className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono")}
            >
              Clear Selection
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {connectedSites.map((site) => {
          const isSelected = selectedSite?.id === site.id;
          const isTesting = testingSiteId === site.id;

          return (
            <Card
              key={site.id}
              className={cn(
                getCyberpunkCardClasses(),
                "p-3 cursor-pointer transition-all",
                isSelected && "border-green-500/70 bg-green-500/10",
                !isSelected && "hover:border-green-500/30"
              )}
              onClick={() => !isTesting && handleSelectSite(site)}
            >
              <div className="grid grid-cols-12 gap-3 items-center">
                {/* Status Icon - Col 1 */}
                <div className="col-span-1 flex justify-center">
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 text-green-400 animate-spin" />
                  ) : isSelected ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-green-500/30" />
                  )}
                </div>
                
                {/* Site Info - Col 10 */}
                <div className="col-span-10 min-w-0">
                  <div className={cn(
                    getCyberpunkTextClasses('primary'),
                    "font-medium font-mono text-sm truncate"
                  )}>
                    {site.name}
                  </div>
                  <div className={cn(
                    getCyberpunkTextClasses('muted'),
                    "text-xs font-mono truncate"
                  )}>
                    {site.siteUrl}
                  </div>
                </div>

                {/* Error Icon - Col 1 */}
                <div className="col-span-1 flex justify-center">
                  {site.connectionStatus === 'failed' && !isSelected && (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
