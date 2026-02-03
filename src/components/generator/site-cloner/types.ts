/**
 * TypeScript types for site cloning workflow
 */

export interface CloningStep {
  id: string;
  name: string;
  progress: number; // 0-100
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  error?: string;
}

export interface CloningProgress {
  currentStep: number;
  totalSteps: number;
  overallProgress: number; // 0-100
  steps: CloningStep[];
}

export interface SiteCloningConfig {
  actionType: 'new' | 'modify';
  templateSiteId?: string;
  templateSiteUrl?: string;
  domain: string;
  siteName: string;
  environment?: 'production' | 'staging' | 'development';
}

export interface NewSiteResult {
  success: boolean;
  newSiteUrl?: string;
  newSiteCredentials?: {
    siteUrl: string;
    adminUrl: string;
    username: string;
    password?: string;
    ftpHost?: string;
    ftpUsername?: string;
    ftpPassword?: string;
  };
  installId?: string | number;
  error?: string;
}

export interface FieldStructureResult {
  success: boolean;
  fields?: Record<string, any>;
  count?: number;
  error?: string;
}

export interface ACFMappingResult {
  success: boolean;
  mappedFields?: Record<string, any>;
  error?: string;
}
