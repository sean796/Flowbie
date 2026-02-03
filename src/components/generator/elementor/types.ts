/**
 * TypeScript interfaces for Elementor Template Customization Module
 */

export type FieldType = 'url' | 'text' | 'email' | 'phone' | 'color' | 'business_name' | 'address' | 'other';

export interface CustomizationConfig {
  // Required Information
  siteUrl: string;
  businessName: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  /** Business hours from GMB or page (e.g. "Mon: 9am–5pm; Tue: 9am–5pm; ...") */
  workHours?: string;
  /** Social profile URLs – never use siteUrl for these */
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  /** Google Maps Places link (maps.app.goo.gl or Google Maps search URL) */
  googleMapsLink?: string;
  
  // Brand Colors
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor?: string;
  textColor?: string;
  
  // Prompt Modifier
  promptModifier?: string;
  
  // Allow arbitrary keys from AI extraction
  [key: string]: unknown;
}

export interface CustomizationField {
  id: string;
  field: string;
  currentValue: string;
  suggestedValue: string;
  filePath: string;
  lineNumber?: number;
  fieldType: FieldType;
  context?: string;
  description?: string;
  approved: boolean;
  readOnly?: boolean; // True for wp-content files
}

export interface TemplateFile {
  path: string;
  name: string;
  content: string;
  size: number;
  type: 'xml' | 'json' | 'php' | 'html' | 'css' | 'js' | 'other';
  encoding: string;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
  size?: number;
  modified?: Date;
}

export interface HighlightedField {
  fieldId: string;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  value: string;
}

export interface AnalysisResult {
  fields: CustomizationField[];
  files: TemplateFile[];
  summary: {
    totalFields: number;
    totalFiles: number;
    fieldTypes: Record<FieldType, number>;
  };
}

export interface ReplacementOperation {
  fieldId: string;
  filePath: string;
  oldValue: string;
  newValue: string;
  lineNumber?: number;
  success: boolean;
  error?: string;
}

export interface ReplacementResult {
  operations: ReplacementOperation[];
  backupPath?: string;
  successCount: number;
  errorCount: number;
  totalFilesModified: number;
}

export interface XMLStructure {
  root: string;
  elements: XMLElement[];
  metadata?: {
    title?: string;
    link?: string;
    description?: string;
    language?: string;
  };
}

export interface XMLElement {
  tag: string;
  attributes: Record<string, string>;
  content?: string;
  children?: XMLElement[];
  lineNumber: number;
}

export interface ColorMatch {
  originalColor: string;
  originalFormat: 'hex' | 'rgb' | 'rgba' | 'hsl' | 'name';
  newColor: string;
  newFormat?: 'hex' | 'rgb' | 'rgba' | 'hsl';
  filePath: string;
  lineNumber?: number;
  context?: string;
}

// WordPress API-based customization types
export interface WordPressCustomizationField {
  id: string;
  field: string;
  currentValue: string;
  suggestedValue: string;
  fieldType: FieldType;
  location: {
    postId: number;
    postType: string;
    postTitle: string;
    postLink: string;
    fieldSource: 'acf' | 'title' | 'content' | 'excerpt' | 'meta' | 'taxonomy';
    acfFieldName?: string; // If fieldSource is 'acf'
    taxonomyName?: string; // If fieldSource is 'taxonomy'
    metaKey?: string; // If fieldSource is 'meta'
  };
  occurrenceCount: number; // How many posts/pages have this value
  context?: string;
  description?: string;
  approved: boolean;
}

export interface WordPressFieldGroup {
  field: string;
  currentValue: string;
  suggestedValue: string;
  affectedPosts: Array<{
    postId: number;
    postType: string;
    postTitle: string;
    postLink: string;
  }>;
  occurrenceCount: number;
}

export interface WordPressUpdateStrategy {
  site: {
    id: string;
    name: string;
    siteUrl: string;
  };
  totalFields: number;
  totalPosts: number;
  fieldGroups: WordPressFieldGroup[];
  estimatedChanges: number;
  warnings: string[];
  ready: boolean;
}
