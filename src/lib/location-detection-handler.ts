import { toast } from "sonner";
import { loadApiKey } from "./api";
import { extractNAPFromSite } from "./nap-extractor";
import { createNAPTemplate } from "./nap-kb-template";
import { getStoredSites, saveSites } from "@/components/integrations/storage";
import { KB_FILES_STORAGE_KEY } from "@/components/integrations/types";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import type { WordPressSite } from "@/components/integrations/types";

export async function handleLocationDetection(
  site: WordPressSite,
  setSites: (sites: WordPressSite[]) => void
): Promise<void> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    toast.error('OpenRouter API key is required for location detection. Please set it in Settings.');
    return;
  }
  let progressToastId = toast.loading('Starting location detection...', { description: 'Parsing sitemaps and scraping pages...' });
  const napResult = await extractNAPFromSite(site, apiKey, (progress) => {
    if (progressToastId !== undefined) {
      toast.loading(progress.message || 'Processing...', { id: progressToastId, description: `Progress: ${progress.progress}%` });
    }
  });
  if (progressToastId !== undefined) toast.dismiss(progressToastId);
  if (napResult.success && napResult.napInfo) {
    const sites = getStoredSites();
    const updated = sites.map(s => s.id === site.id ? { ...s, napInfo: napResult.napInfo, locations: napResult.napInfo.locations || [] } : s);
    saveSites(updated);
    setSites(updated);
    const napTemplate = createNAPTemplate(napResult.napInfo, napResult.napInfo.locations);
    const sanitizeForFilename = (text: string): string => text.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase().substring(0, 50);
    const siteNamePart = site.name ? sanitizeForFilename(site.name) : sanitizeForFilename(site.siteUrl.replace(/^https?:\/\//, '').split('/')[0]);
    const napFile: StoredFile = { name: `nap-info-${siteNamePart}-${Date.now()}.md`, size: napTemplate.length, content: napTemplate, starred: false, timestamp: Date.now() };
    const files = JSON.parse(localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]') as StoredFile[];
    const updatedFiles = files.concat([napFile]);
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(updatedFiles));
    window.dispatchEvent(new CustomEvent('kb-files-updated', { detail: { files: updatedFiles } }));
    const locationCount = napResult.napInfo.locations?.length || 0;
    toast.success(`✅ Detected ${locationCount} location${locationCount !== 1 ? 's' : ''} and added to Knowledge Base`);
  } else {
    toast.error(`Location detection failed: ${napResult.error || 'Unknown error'}`);
  }
}
