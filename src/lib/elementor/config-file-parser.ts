/**
 * Utility functions for parsing and generating configuration text files
 */

import type { CustomizationConfig } from "@/components/generator/elementor/types";

/**
 * Generate a template configuration file content
 */
export function generateConfigTemplate(): string {
  return `# Elementor Template Customization Configuration
# Fill in the values below and upload this file to auto-fill the form

# Required Information
Site URL: https://example.com
Business Name: Your Business Name
Email: contact@example.com
Phone: (555) 123-4567

# Optional Address Information
Address: 123 Main St, City, ST 12345
City: City
State/Province: State
Postal Code: 12345
Country: Country

# Brand Colors (hex format with or without #)
Primary Color: #3B82F6
Secondary Color: #10B981
Accent Color: #F59E0B
Background Color: #000000
Text Color: #ffffff

# Prompt Modifier (optional - for additional AI instructions)
Prompt Modifier: 
Enter any additional customization requirements or specific instructions here...
`.trim();
}

/**
 * Parse a configuration text file into CustomizationConfig
 */
export function parseConfigFile(content: string): Partial<CustomizationConfig> {
  const config: Partial<CustomizationConfig> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Handle multi-line values (like Prompt Modifier)
    if (key === 'Prompt Modifier' && value === '') {
      // Look ahead for multi-line content
      const valueLines: string[] = [];
      let i = lines.indexOf(line) + 1;
      while (i < lines.length && !lines[i].trim().includes(':')) {
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          valueLines.push(nextLine);
        }
        i++;
      }
      value = valueLines.join('\n');
    }

    // Map file keys to config properties
    switch (key) {
      case 'Site URL':
        config.siteUrl = value;
        break;
      case 'Business Name':
        config.businessName = value;
        break;
      case 'Email':
        config.email = value;
        break;
      case 'Phone':
        config.phone = value;
        break;
      case 'Address':
        config.address = value;
        break;
      case 'City':
        config.city = value;
        break;
      case 'State/Province':
        config.stateProvince = value;
        break;
      case 'Postal Code':
        config.postalCode = value;
        break;
      case 'Country':
        config.country = value;
        break;
      case 'Primary Color':
        // Normalize color format
        config.primaryColor = normalizeColor(value);
        break;
      case 'Secondary Color':
        config.secondaryColor = normalizeColor(value);
        break;
      case 'Accent Color':
        config.accentColor = normalizeColor(value);
        break;
      case 'Background Color':
        config.backgroundColor = normalizeColor(value);
        break;
      case 'Text Color':
        config.textColor = normalizeColor(value);
        break;
      case 'Prompt Modifier':
        config.promptModifier = value;
        break;
    }
  }

  return config;
}

/**
 * Normalize color value (add # if missing)
 */
function normalizeColor(color: string): string {
  const trimmed = color.trim();
  if (!trimmed) return '#000000';
  if (!trimmed.startsWith('#')) {
    return '#' + trimmed;
  }
  return trimmed;
}

/**
 * Download the configuration template file
 */
export function downloadConfigTemplate(): void {
  const content = generateConfigTemplate();
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'elementor-config-template.txt';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
