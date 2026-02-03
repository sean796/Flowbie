/**
 * Location Selector Component
 * Displays automatically detected site locations with default location support
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, Star } from 'lucide-react';
import type { Location } from '@/components/integrations/types';
import { getCyberpunkButtonClasses, getCyberpunkTextClasses } from './cyberpunk-theme';

interface LocationSelectorProps {
  site: {
    id: string;
    locations?: Location[];
    napInfo?: {
      locations?: Location[];
    };
  };
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  site,
}) => {
  const locations = site.locations || site.napInfo?.locations || [];
  const defaultLocation = locations.find(loc => loc.isDefault) || locations[0];
  const otherLocations = locations.filter(loc => loc.id !== defaultLocation?.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Detected Locations</Label>
        {locations.length === 0 && (
          <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>No locations detected yet</span>
        )}
      </div>

      {/* Default Location - Always Shown */}
      {defaultLocation ? (
        <div className="p-3 bg-background/50 rounded border border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-semibold">Default Location</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-xs">
                  Primary
                </Badge>
              </div>
              <div className="text-sm space-y-1.5">
                {/* Business Name (NAP: Name) */}
                {defaultLocation.name && defaultLocation.name.trim() && defaultLocation.name !== 'Not specified' && (
                  <div>
                    <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Name:</span>{' '}
                    <span className="font-medium">{defaultLocation.name}</span>
                  </div>
                )}
                {/* Full Address (NAP: Address) */}
                {(() => {
                  const addressParts = [
                    defaultLocation.address,
                    defaultLocation.city,
                    defaultLocation.state,
                    defaultLocation.zip,
                  ].filter(part => part && part.trim() && part !== 'Not specified');
                  
                  return addressParts.length > 0 ? (
                    <div>
                      <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Address:</span>{' '}
                      <span className={getCyberpunkTextClasses('muted')}>{addressParts.join(', ')}</span>
                    </div>
                  ) : null;
                })()}
                {/* Phone Number (NAP: Phone) */}
                {defaultLocation.phone && defaultLocation.phone.trim() && defaultLocation.phone !== 'Not specified' && (
                  <div>
                    <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Phone:</span>{' '}
                    <span className={getCyberpunkTextClasses('muted')}>{defaultLocation.phone}</span>
                  </div>
                )}
                {/* Email Address */}
                {defaultLocation.email && defaultLocation.email.trim() && defaultLocation.email !== 'Not specified' && (
                  <div>
                    <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Email:</span>{' '}
                    <span className={getCyberpunkTextClasses('muted')}>{defaultLocation.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`p-3 bg-background/30 rounded border border-dashed border-border text-center text-sm ${getCyberpunkTextClasses('muted')}`}>
          <MapPin className="h-4 w-4 mx-auto mb-1 opacity-50" />
          No locations configured. Add a location to get started.
        </div>
      )}

      {/* Other Locations - Dropdown if Multiple */}
      {otherLocations.length > 0 && (
        <div className="space-y-2">
          <Label className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Additional Locations ({otherLocations.length})</Label>
          <Select>
            <SelectTrigger className={`h-8 text-xs ${getCyberpunkButtonClasses()}`}>
              <SelectValue placeholder={`View ${otherLocations.length} additional location${otherLocations.length > 1 ? 's' : ''}`} />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
              {otherLocations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  <div className="space-y-1.5 py-1">
                    {/* Business Name (NAP: Name) */}
                    {location.name && location.name.trim() && location.name !== 'Not specified' && (
                      <div>
                        <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Name:</span>{' '}
                        <span className="font-medium text-sm">{location.name}</span>
                      </div>
                    )}
                    {/* Full Address (NAP: Address) */}
                    {(() => {
                      const addressParts = [
                        location.address,
                        location.city,
                        location.state,
                        location.zip,
                      ].filter(part => part && part.trim() && part !== 'Not specified');
                      
                      return addressParts.length > 0 ? (
                        <div>
                          <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Address:</span>{' '}
                          <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>{addressParts.join(', ')}</span>
                        </div>
                      ) : null;
                    })()}
                    {/* Phone Number (NAP: Phone) */}
                    {location.phone && location.phone.trim() && location.phone !== 'Not specified' && (
                      <div>
                        <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Phone:</span>{' '}
                        <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>{location.phone}</span>
                      </div>
                    )}
                    {/* Email Address */}
                    {location.email && location.email.trim() && location.email !== 'Not specified' && (
                      <div>
                        <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>Email:</span>{' '}
                        <span className={`text-xs ${getCyberpunkTextClasses('muted')}`}>{location.email}</span>
                      </div>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

