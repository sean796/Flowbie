import { toast } from "sonner";
import { WORDPRESS_SITES_STORAGE_KEY, type WordPressSite } from "./types";

export function getStoredSites(): WordPressSite[] {
  try {
    const stored = localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY);
    if (stored) {
      const sites = JSON.parse(stored) as WordPressSite[];
      // Migrate wp-sitemap.xml URLs to sitemap_index.xml
      const migrated = sites.map(site => {
        const migratedSite = {
          ...site,
          enabled: site.enabled !== undefined ? site.enabled : true
        };
        
        // Convert wp-sitemap.xml to sitemap_index.xml if it exists
        if (migratedSite.sitemaps?.mainSitemapUrl?.includes('/wp-sitemap.xml')) {
          console.log(`[Migration] Converting wp-sitemap.xml to sitemap_index.xml for site: ${site.name}`);
          migratedSite.sitemaps.mainSitemapUrl = migratedSite.sitemaps.mainSitemapUrl.replace('/wp-sitemap.xml', '/sitemap_index.xml');
        }
        
        return migratedSite;
      });
      
      // Save migrated sites back to localStorage if any changes were made
      if (JSON.stringify(migrated) !== JSON.stringify(sites)) {
        localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, JSON.stringify(migrated));
      }
      
      return migrated;
    }
  } catch (e) {
    console.error("Failed to parse stored WordPress sites:", e);
  }
  return [];
}

export function saveSites(sites: WordPressSite[]): void {
  try {
    localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, JSON.stringify(sites));
  } catch (e) {
    console.error("Failed to save WordPress sites:", e);
    toast.error("Could not save sites to local storage");
  }
}

