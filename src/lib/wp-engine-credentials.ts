/**
 * WP Engine API Credentials Storage
 * Follows the pattern from src/lib/api.ts
 */

const WP_ENGINE_API_KEY_STORAGE_KEY = "wp-engine-api-key";
const WP_ENGINE_API_SECRET_STORAGE_KEY = "wp-engine-api-secret";

/**
 * Load WP Engine API key from localStorage
 */
export const loadWPEngineApiKey = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(WP_ENGINE_API_KEY_STORAGE_KEY) || "";
};

/**
 * Save WP Engine API key to localStorage
 */
export const saveWPEngineApiKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  if (key) {
    localStorage.setItem(WP_ENGINE_API_KEY_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(WP_ENGINE_API_KEY_STORAGE_KEY);
  }
};

/**
 * Load WP Engine API secret from localStorage
 */
export const loadWPEngineApiSecret = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(WP_ENGINE_API_SECRET_STORAGE_KEY) || "";
};

/**
 * Save WP Engine API secret to localStorage
 */
export const saveWPEngineApiSecret = (secret: string): void => {
  if (typeof window === 'undefined') return;
  if (secret) {
    localStorage.setItem(WP_ENGINE_API_SECRET_STORAGE_KEY, secret);
  } else {
    localStorage.removeItem(WP_ENGINE_API_SECRET_STORAGE_KEY);
  }
};

/**
 * Clear all WP Engine credentials
 */
export const clearWPEngineCredentials = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WP_ENGINE_API_KEY_STORAGE_KEY);
  localStorage.removeItem(WP_ENGINE_API_SECRET_STORAGE_KEY);
};
