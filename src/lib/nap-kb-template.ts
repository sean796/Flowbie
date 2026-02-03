/**
 * NAP Knowledge Base Template Generator
 * Creates formatted knowledge base entries from NAP information
 */

import type { NAPInfo, Location } from '@/components/integrations/types';

/**
 * Formats a location for display in knowledge base
 */
function formatLocation(location: Location): string {
  const parts: string[] = [];
  
  if (location.address) parts.push(location.address);
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.zip) parts.push(location.zip);
  
  const fullAddress = parts.join(', ');
  
  let formatted = '';
  if (location.name) {
    formatted += `**${location.name}**\n`;
  }
  if (fullAddress) {
    formatted += `Address: ${fullAddress}\n`;
  }
  if (location.phone) {
    formatted += `Phone: ${location.phone}\n`;
  }
  if (location.email) {
    formatted += `Email: ${location.email}\n`;
  }
  
  return formatted.trim();
}

/**
 * Creates a knowledge base template from NAP information
 */
export function createNAPTemplate(napInfo: NAPInfo, locations?: Location[]): string {
  const template: string[] = [];
  
  template.push('# Business Contact Information (NAP)');
  template.push('');
  
  // Primary business information
  if (napInfo.name) {
    template.push(`## Business Name`);
    template.push(napInfo.name);
    template.push('');
  }
  
  // Primary address and phone (if no locations array)
  if (!locations || locations.length === 0) {
    if (napInfo.address) {
      template.push(`## Primary Address`);
      template.push(napInfo.address);
      template.push('');
    }
    
    if (napInfo.phone) {
      template.push(`## Primary Phone`);
      template.push(napInfo.phone);
      template.push('');
    }
    
    if (napInfo.email) {
      template.push(`## Primary Email`);
      template.push(napInfo.email);
      template.push('');
    }
  }
  
  // Locations section
  const locationsToUse = locations || napInfo.locations || [];
  
  if (locationsToUse.length > 0) {
    template.push('## Locations');
    template.push('');
    
    // Find default location
    const defaultLocation = locationsToUse.find(loc => loc.isDefault) || locationsToUse[0];
    const otherLocations = locationsToUse.filter(loc => loc.id !== defaultLocation.id);
    
    // Always show default location first
    template.push('### Primary Location (Default)');
    template.push(formatLocation(defaultLocation));
    template.push('');
    
    // Show other locations if they exist
    if (otherLocations.length > 0) {
      template.push('### Additional Locations');
      template.push('');
      
      otherLocations.forEach((location, index) => {
        template.push(`#### Location ${index + 1}`);
        template.push(formatLocation(location));
        template.push('');
      });
    }
    
    // Location summary for AI consumption
    template.push('### Location Summary');
    template.push('');
    template.push('For content generation and entity creation, use the following location context:');
    template.push('');
    
    const defaultLocationString = [
      defaultLocation.city,
      defaultLocation.state,
    ].filter(Boolean).join(', ');
    
    if (defaultLocationString) {
      template.push(`**Default Location:** ${defaultLocationString}`);
      template.push('');
      template.push(`When generating entities or content, assume they are located in: ${defaultLocationString}`);
      template.push('');
    }
    
    if (otherLocations.length > 0) {
      template.push('**Additional Service Areas:**');
      otherLocations.forEach(location => {
        const locationString = [location.city, location.state].filter(Boolean).join(', ');
        if (locationString) {
          template.push(`- ${locationString}`);
        }
      });
      template.push('');
    }
  }
  
  // Structured data format for AI
  template.push('---');
  template.push('');
  template.push('## Structured NAP Data (For AI Processing)');
  template.push('');
  template.push('```json');
  template.push(JSON.stringify({
    businessName: napInfo.name,
    primaryAddress: napInfo.address,
    primaryPhone: napInfo.phone,
    primaryEmail: napInfo.email,
    locations: locationsToUse.map(loc => ({
      name: loc.name,
      address: loc.address,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      phone: loc.phone,
      email: loc.email,
      isDefault: loc.isDefault,
    })),
    defaultLocation: locationsToUse.find(loc => loc.isDefault) || locationsToUse[0],
  }, null, 2));
  template.push('```');
  template.push('');
  
  // Usage instructions
  template.push('---');
  template.push('');
  template.push('## Usage Instructions');
  template.push('');
  template.push('This NAP (Name, Address, Phone) information should be used when:');
  template.push('');
  template.push('1. **Generating content**: Include accurate business location information');
  template.push('2. **Creating entities**: Tag generated entities with the default location');
  template.push('3. **Service area pages**: Use location data for service area content');
  template.push('4. **Local SEO**: Ensure all generated content references correct locations');
  template.push('');
  
  if (locationsToUse.length > 0) {
    const defaultLoc = locationsToUse.find(loc => loc.isDefault) || locationsToUse[0];
    const defaultLocationContext = [defaultLoc.city, defaultLoc.state].filter(Boolean).join(', ');
    
    if (defaultLocationContext) {
      template.push(`**IMPORTANT**: When generating entities or service area content, assume the default location is: **${defaultLocationContext}**`);
      template.push('');
    }
  }
  
  return template.join('\n');
}

/**
 * Creates a concise NAP summary for quick reference
 */
export function createNAPSummary(napInfo: NAPInfo, locations?: Location[]): string {
  const summary: string[] = [];
  
  if (napInfo.name) {
    summary.push(`Business: ${napInfo.name}`);
  }
  
  const locationsToUse = locations || napInfo.locations || [];
  if (locationsToUse.length > 0) {
    const defaultLocation = locationsToUse.find(loc => loc.isDefault) || locationsToUse[0];
    const locationParts = [
      defaultLocation.city,
      defaultLocation.state,
    ].filter(Boolean);
    
    if (locationParts.length > 0) {
      summary.push(`Location: ${locationParts.join(', ')}`);
    }
    
    if (defaultLocation.phone) {
      summary.push(`Phone: ${defaultLocation.phone}`);
    }
    if (defaultLocation.email) {
      summary.push(`Email: ${defaultLocation.email}`);
    }
  } else {
    if (napInfo.address) {
      summary.push(`Address: ${napInfo.address}`);
    }
    if (napInfo.phone) {
      summary.push(`Phone: ${napInfo.phone}`);
    }
    if (napInfo.email) {
      summary.push(`Email: ${napInfo.email}`);
    }
  }
  
  return summary.join(' | ');
}

