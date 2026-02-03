import type { OptimizationSettings } from "@/components/integrations/wordpress/OptimizationSettingsPanel";
import { DEFAULT_SETTINGS } from "@/components/integrations/wordpress/OptimizationSettingsPanel";

const SETTINGS_STORAGE_KEY_PREFIX = "optimization_settings_";
const MODE_STORAGE_KEY_PREFIX = "optimization_mode_";

export function getOptimizationSettings(siteId: string): OptimizationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with DEFAULT_SETTINGS to ensure all fields exist (backward compatibility)
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('[OptimizationSettings] Failed to parse stored settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveOptimizationSettings(siteId: string, settings: OptimizationSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(settings));
  } catch (e) {
    console.error('[OptimizationSettings] Failed to save settings:', e);
  }
}

export function getOptimizationMode(siteId: string): 'quick' | 'standard' | 'full' {
  if (typeof window === "undefined") return 'standard';
  try {
    const stored = localStorage.getItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`);
    if (stored === 'quick' || stored === 'standard' || stored === 'full') {
      return stored;
    }
  } catch (e) {
    console.error('[OptimizationMode] Failed to parse stored mode:', e);
  }
  return 'standard';
}

export function saveOptimizationMode(siteId: string, mode: 'quick' | 'standard' | 'full'): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`, mode);
  } catch (e) {
    console.error('[OptimizationMode] Failed to save mode:', e);
  }
}

const GLOBAL_RESEARCH_MODEL_KEY = "global_research_model";
const DEFAULT_RESEARCH_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Gets the research AI model to use for research operations.
 * Priority: per-site settings > global default > hardcoded default
 * 
 * @param siteId Optional site ID to check for per-site settings
 * @returns The model string to use for research operations
 */
export function getResearchModel(siteId?: string): string {
  // First, check per-site settings if siteId provided
  if (siteId) {
    const siteSettings = getOptimizationSettings(siteId);
    // Use researchModel if available, fallback to model for backward compatibility
    if (siteSettings.researchModel) {
      return siteSettings.researchModel;
    }
    // Backward compatibility: if researchModel doesn't exist but model does, use it
    if (siteSettings.model) {
      return siteSettings.model;
    }
  }

  // Second, check global default
  if (typeof window !== "undefined") {
    try {
      const globalModel = localStorage.getItem(GLOBAL_RESEARCH_MODEL_KEY);
      if (globalModel) {
        return globalModel;
      }
    } catch (e) {
      console.error('[ResearchModel] Failed to read global model:', e);
    }
  }

  // Fallback to hardcoded default
  return DEFAULT_RESEARCH_MODEL;
}

/**
 * Sets the global default research AI model
 * 
 * @param model The model string to use as global default
 */
export function setGlobalResearchModel(model: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GLOBAL_RESEARCH_MODEL_KEY, model);
  } catch (e) {
    console.error('[ResearchModel] Failed to save global model:', e);
  }
}

