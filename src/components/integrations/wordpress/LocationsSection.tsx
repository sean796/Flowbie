import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Map, MapPin, Loader2 } from "lucide-react";
import { type WordPressSite } from "../types";
import { LocationSelector } from "./LocationSelector";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface LocationsSectionProps {
  site: WordPressSite;
  isDetectingLocations: boolean;
  onDetectLocations?: () => void;
}

export const LocationsSection: React.FC<LocationsSectionProps> = ({
  site,
  isDetectingLocations,
  onDetectLocations,
}) => {
  const hasLocations = (site.locations && site.locations.length > 0) || 
                      (site.napInfo?.locations && site.napInfo.locations.length > 0);

  return (
    <div className="mt-4 pt-4 border-t border-green-500/20">
      <div className="flex items-center justify-between mb-3">
        <Label className={`text-sm font-semibold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}>
          Locations
        </Label>
        {onDetectLocations && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDetectLocations}
            disabled={isDetectingLocations || site.enabled === false}
            className={`h-7 text-xs ${getCyberpunkButtonClasses()} transition-all`}
          >
            {isDetectingLocations ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <Map className="h-3 w-3 mr-1" />
                Detect Locations
              </>
            )}
          </Button>
        )}
      </div>
      {hasLocations ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded p-3">
          <LocationSelector site={site} />
        </div>
      ) : (
        <div className="p-4 bg-green-500/5 border border-dashed border-green-500/30 rounded text-center">
          <MapPin className="h-5 w-5 mx-auto mb-2 text-green-500/50" />
          <p className={`text-sm ${getCyberpunkTextClasses('muted')}`}>
            No locations detected. Click "Detect Locations" to extract NAP information from the site.
          </p>
        </div>
      )}
    </div>
  );
};

