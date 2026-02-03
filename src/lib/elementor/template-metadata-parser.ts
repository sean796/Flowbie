/**
 * Parse manifest.json and site-settings.json from template root
 */

export interface TemplateMetadata {
  manifest?: any;
  siteSettings?: any;
}

/**
 * Parse manifest.json content
 */
export function parseManifest(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn('[TemplateMetadata] Failed to parse manifest.json:', error);
    return null;
  }
}

/**
 * Parse site-settings.json content
 */
export function parseSiteSettings(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn('[TemplateMetadata] Failed to parse site-settings.json:', error);
    return null;
  }
}

/**
 * Extract manifest and site-settings from template files
 */
export function extractMetadata(files: Array<{ path: string; content: string }>): TemplateMetadata {
  let manifest: any = null;
  let siteSettings: any = null;

  for (const file of files) {
    const fileName = file.path.split('/').pop()?.toLowerCase() || '';
    const fileNameNoExt = fileName.split('.')[0]; // Get name without extension
    
    // Check for manifest (with or without extension, case-insensitive)
    if (fileName === 'manifest.json' || 
        fileName === 'manifest' || 
        fileNameNoExt === 'manifest') {
      manifest = parseManifest(file.content);
    } 
    // Check for site-settings (various naming formats)
    else if (fileName === 'site-settings.json' || 
             fileName === 'site-settings' || 
             fileName === 'site_settings.json' ||
             fileNameNoExt === 'site-settings' ||
             fileNameNoExt === 'site_settings') {
      siteSettings = parseSiteSettings(file.content);
    }
  }

  return { manifest, siteSettings };
}
