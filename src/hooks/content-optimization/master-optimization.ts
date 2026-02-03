import { toast } from "sonner";
import { type WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { handleOptimizeMultipleContent } from "./bulk-optimization";
import { fetchAllPostsForSite, fetchAllServiceAreasForSite } from "./wordpress-fetchers";
import { getPublishedPosts } from "@/lib/wordpress-api";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { MasterOptimizationState } from "./use-optimization-state";
import React from "react";

interface HandleMasterOptimizationParams {
  updateMode: 'update' | 'draft';
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    hasEntity?: boolean;
  };
  inContentImageRequest?: { imageType: string; userPrompt?: string };
  selectedSites?: WordPressSite[];
  setMasterOptimizationState: (prev: any) => any;
  setBulkOptimizationState: (prev: any) => any;
  setIsOptimizingContent: (prev: any) => any;
  setOptimizationProgress: (prev: any) => any;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  continueOptimizationRef: React.MutableRefObject<((siteId: string, selectedKeyword: any, clusterKeywords?: string[], setIsKeywordSelectionOpen?: (prev: any) => any, testMode?: boolean) => Promise<void>) | null>;
}

export async function handleMasterOptimization(params: HandleMasterOptimizationParams): Promise<void> {
  const {
    updateMode,
    setGscQueriesForSelection,
    setIsKeywordSelectionOpen,
    setGscClusterAnalysis,
    setIsAnalyzingClusters,
    optimizationOptions,
    inContentImageRequest,
    selectedSites,
    setMasterOptimizationState,
    setBulkOptimizationState,
    setIsOptimizingContent,
    setOptimizationProgress,
    optimizationFileManagers,
    continueOptimizationRef,
  } = params;

  const allSites = getStoredSites();
  const enabledSites = selectedSites && selectedSites.length > 0
    ? selectedSites
    : allSites.filter(site => site.enabled !== false);

  if (enabledSites.length === 0) {
    toast.error('No sites found to optimize.');
    return;
  }

  setMasterOptimizationState({
    isRunning: true,
    sites: {}
  });

  toast.info(`Starting master optimization for ${enabledSites.length} site(s)...`);

  const siteUrlsMap: Record<string, string[]> = {};
  const wordPressPostsBySite: Map<string, Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>> = new Map();

  // Helper function to normalize domain
  const normalizeDomain = (url: string): string =>
    url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

  // Helper function to extract root domain
  const getRootDomain = (domain: string): string => {
    const parts = domain.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.'); // Last two parts
    }
    return domain;
  };

  for (const site of enabledSites) {
    const posts = await fetchAllPostsForSite(site);
    const serviceAreas = await fetchAllServiceAreasForSite(site);
    const allUrls = [...posts, ...serviceAreas];

    siteUrlsMap[site.id] = allUrls;

    // Fetch WordPress posts for RAG context (same logic as bulk prompt generator)
    if (site.username && site.appPassword) {
      try {
        toast.info(`Fetching WordPress posts for ${site.name}...`);
        const publishedResult = await getPublishedPosts(
          site.siteUrl,
          site.username,
          site.appPassword,
          100,
          0
        );

        if (publishedResult.posts && publishedResult.posts.length > 0) {
          const siteDomain = normalizeDomain(site.siteUrl);
          const siteRootDomain = getRootDomain(siteDomain);

          const postsMetadata = publishedResult.posts
            .map((p: any) => ({
              id: p.id,
              slug: p.slug || '',
              title: (typeof p.title === 'object' && p.title?.rendered) ? p.title.rendered : (p.title || ''),
              excerpt: ((typeof p.excerpt === 'object' && p.excerpt?.rendered) ? p.excerpt.rendered : (p.excerpt || '')).replace(/<[^>]+>/g, '').substring(0, 200),
              link: p.link || p.slug || '',
              date_gmt: p.date_gmt || (p as any).date || ''
            }))
            .filter((p: any) => {
              // ROBUST SAFEGUARD: Trust posts fetched from WordPress API
              // Only filter if there's a clear security concern (completely different root domain)

              if (!p.link) {
                console.warn('[WordPress] Post missing link field, keeping for safety:', p.id);
                return true; // Keep posts without links rather than reject
              }

              const postDomain = normalizeDomain(p.link);
              const postRootDomain = getRootDomain(postDomain);

              // Only reject if root domain is completely different (security safeguard)
              // Otherwise, trust the API response
              const isCompletelyDifferent = postRootDomain !== siteRootDomain &&
                                           !postDomain.includes(siteRootDomain);

              if (isCompletelyDifferent) {
                console.warn(`[WordPress] Filtering post ${p.id} - domain mismatch: ${postDomain} vs ${siteRootDomain}`);
                return false;
              }

              // Trust all other posts from the API
              return true;
            })
            .filter((p: any) => p.id && p.title && (p.link || p.slug));

          wordPressPostsBySite.set(site.id, postsMetadata);
          toast.success(`Fetched ${postsMetadata.length} WordPress posts from ${site.name}`);
        } else if (publishedResult.error) {
          console.error('[WordPress] Error:', publishedResult.error);
          toast.warning(`WordPress error for ${site.name}: ${publishedResult.error}`);
        }
      } catch (error) {
        console.error('[WordPress] Fetch error:', error);
        toast.warning(`WordPress fetch failed for ${site.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setMasterOptimizationState((prev: MasterOptimizationState) => ({
      ...prev,
      sites: {
        ...prev.sites,
        [site.id]: {
          siteId: site.id,
          siteName: site.name,
          totalPosts: allUrls.length,
          currentPost: 0,
          currentUrl: '',
          status: 'pending',
          progress: 0,
          completedPosts: 0,
          skippedPosts: 0,
          errorPosts: 0
        }
      }
    }));
  }

  const sitePromises = enabledSites.map(async (site) => {
    const urls = siteUrlsMap[site.id] || [];

    if (urls.length === 0) {
      setMasterOptimizationState((prev: MasterOptimizationState) => ({
        ...prev,
        sites: {
          ...prev.sites,
          [site.id]: {
            ...prev.sites[site.id],
            status: 'completed',
            progress: 100
          }
        }
      }));
      return;
    }

    setMasterOptimizationState((prev: MasterOptimizationState) => ({
      ...prev,
      sites: {
        ...prev.sites,
        [site.id]: {
          ...prev.sites[site.id],
          status: 'optimizing'
        }
      }
    }));

    const batchKey = `${site.id}-batch`;

    const progressInterval = setInterval(() => {
      setBulkOptimizationState((current: any) => {
        const bulkState = current[batchKey];
        if (bulkState) {
          const currentIndex = bulkState.currentIndex || 0;
          const totalUrls = bulkState.urls.length;
          const completedCount = Object.values(bulkState.urlStatuses || {}).filter(s => s === 'completed').length;
          const skippedCount = Object.values(bulkState.urlStatuses || {}).filter(s => s === 'skipped').length;
          const errorCount = Object.values(bulkState.urlStatuses || {}).filter(s => s === 'error').length;

          setMasterOptimizationState((prev: MasterOptimizationState) => ({
            ...prev,
            sites: {
              ...prev.sites,
              [site.id]: {
                ...prev.sites[site.id],
                currentPost: currentIndex + 1,
                currentUrl: bulkState.currentUrl || '',
                progress: totalUrls > 0 ? Math.round((completedCount / totalUrls) * 100) : 0,
                completedPosts: completedCount,
                skippedPosts: skippedCount,
                errorPosts: errorCount
              }
            }
          }));
        }
        return current;
      });
    }, 500);

    const wordPressPosts = wordPressPostsBySite.get(site.id) || [];

    await handleOptimizeMultipleContent({
      site,
      urls,
      wordPressPosts,
      updateMode,
      setGscQueriesForSelection,
      setIsKeywordSelectionOpen,
      setGscClusterAnalysis,
      setIsAnalyzingClusters,
      optimizationOptions,
      inContentImageRequest,
      setIsOptimizingContent,
      setOptimizationProgress,
      setBulkOptimizationState,
      optimizationFileManagers,
      continueOptimizationRef,
    });

    setMasterOptimizationState((prev: MasterOptimizationState) => ({
      ...prev,
      sites: {
        ...prev.sites,
        [site.id]: {
          ...prev.sites[site.id],
          status: 'completed',
          progress: 100,
          currentPost: urls.length
        }
      }
    }));

    clearInterval(progressInterval);
  });

  await Promise.all(sitePromises);

  setMasterOptimizationState((prev: MasterOptimizationState) => {
    const completedSites = Object.values(prev.sites).filter(s => s.status === 'completed').length;
    const totalSites = enabledSites.length;
    toast.success(`Master optimization complete! ${completedSites}/${totalSites} sites completed.`);
    return {
      ...prev,
      isRunning: false
    };
  });
}
