import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { 
  testWordPressConnection,
  detectSitemaps,
  parseSitemap,
  getScheduledPosts,
  indexSitemapUrls,
  checkFuturePosts,
  resolveWordPressUrls,
  getWordPressPostContent,
  type IndexingProgress,
} from "@/lib/wordpress-api";
import { getStoredSites, saveSites } from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import { scrapeChildSitemap } from "@/lib/wordpress-sitemap-scraper";
import { triggerKnowledgeGraphWorkflow } from "@/lib/knowledge-graph-auto-trigger";
import { detectEntitySitemap } from "@/lib/entity-sitemap-detector";

export function useWordPressSites() {
  const [sites, setSites] = useState<WordPressSite[]>([]);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState<string | null>(null);
  const [isFetchingScheduled, setIsFetchingScheduled] = useState<string | null>(null);
  const [isScrapingSitemap, setIsScrapingSitemap] = useState<Record<string, boolean>>({});
  const [isIndexingSitemap, setIsIndexingSitemap] = useState<Record<string, boolean>>({});
  const [isCheckingFuture, setIsCheckingFuture] = useState<Record<string, boolean>>({});
  const [isLoadingCalendar, setIsLoadingCalendar] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const sitesList = getStoredSites();
    setSites(sitesList);
  }, []);

  const handleAddSite = useCallback(() => {
    return {
      name: "",
      siteUrl: "",
      username: "",
      appPassword: "",
    };
  }, []);

  const handleEditSite = useCallback((site: WordPressSite) => {
    return {
      name: site.name,
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
    };
  }, []);

  const handleDeleteSite = useCallback((id: string) => {
    if (window.confirm("Are you sure you want to delete this WordPress site connection?")) {
      const updated = sites.filter(s => s.id !== id);
      setSites(updated);
      saveSites(updated);
      toast.success("Site connection deleted");
    }
  }, [sites]);

  const handleToggleEnabled = useCallback((site: WordPressSite) => {
    const isCurrentlyEnabled = site.enabled !== false;
    const newEnabledState = !isCurrentlyEnabled;
    
    // If enabling this site, disable all others
    // If disabling this site, just disable this one
    const updated = sites.map(s => {
      if (s.id === site.id) {
        return { ...s, enabled: newEnabledState };
      } else if (newEnabledState) {
        // If we're enabling the current site, disable all others
        return { ...s, enabled: false };
      }
      return s;
    });
    
    setSites(updated);
    saveSites(updated);
    
    toast.success(
      newEnabledState
        ? "Connection enabled (other sites disabled)"
        : "Connection disabled"
    );
  }, [sites]);

  const handleSaveSite = useCallback((
    formName: string,
    formSiteUrl: string,
    formUsername: string,
    formAppPassword: string,
    editingSite: WordPressSite | null
  ) => {
    if (!formName.trim() || !formSiteUrl.trim() || !formUsername.trim() || !formAppPassword.trim()) {
      toast.error("Please fill in all fields");
      return false;
    }

    const siteData: WordPressSite = {
      id: editingSite?.id || `wp-${Date.now()}`,
      name: formName.trim(),
      siteUrl: formSiteUrl.trim(),
      username: formUsername.trim(),
      appPassword: formAppPassword.trim(),
      connectedAt: editingSite?.connectedAt || Date.now(),
      lastTested: editingSite?.lastTested,
      connectionStatus: editingSite?.connectionStatus,
      enabled: editingSite?.enabled !== undefined ? editingSite.enabled : true,
      sitemaps: editingSite?.sitemaps,
    };

    const updated = editingSite
      ? sites.map(s => s.id === editingSite.id ? siteData : s)
      : [...sites, siteData];

    setSites(updated);
    saveSites(updated);
    toast.success(editingSite ? "Site updated" : "Site added");
    return true;
  }, [sites]);

  const handleTestConnection = useCallback(async (site: WordPressSite) => {
    setIsTesting(site.id);
    
    // Update site status
    const updated = sites.map(s => 
      s.id === site.id ? { ...s, connectionStatus: 'testing' as const } : s
    );
    setSites(updated);
    saveSites(updated);

    try {
      const result = await testWordPressConnection(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      const finalUpdated = sites.map(s => {
        if (s.id === site.id) {
          return {
            ...s,
            connectionStatus: result.success ? 'success' as const : 'failed' as const,
            lastTested: Date.now(),
          };
        }
        return s;
      });
      
      setSites(finalUpdated);
      saveSites(finalUpdated);

      if (result.success) {
        toast.success(`Connection successful: ${result.siteInfo?.name || site.name}`);
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (error) {
      const finalUpdated = sites.map(s => {
        if (s.id === site.id) {
          return { ...s, connectionStatus: 'failed' as const, lastTested: Date.now() };
        }
        return s;
      });
      setSites(finalUpdated);
      saveSites(finalUpdated);
      
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      setIsTesting(null);
    }
  }, [sites]);

  const handleDetectSitemaps = useCallback(async (site: WordPressSite) => {
    setIsDetecting(site.id);

    try {
      const result = await detectSitemaps(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      if (result.found && result.sitemapUrl) {
        // Parse the sitemap
        try {
          const parseResult = await parseSitemap(
            site.siteUrl,
            result.sitemapUrl,
            site.username,
            site.appPassword
          );

          // NEVER save wp-sitemap.xml - convert to sitemap_index.xml if detected
          let sitemapUrl = result.sitemapUrl!;
          if (sitemapUrl.includes('/wp-sitemap.xml')) {
            console.warn('[WordPress] Rejecting wp-sitemap.xml, converting to sitemap_index.xml');
            sitemapUrl = sitemapUrl.replace('/wp-sitemap.xml', '/sitemap_index.xml');
          }

          // Extract endpoints from child sitemap URLs
          const sitemapEndpoints: Record<string, string> = {};
          if (parseResult.childSitemaps && parseResult.childSitemaps.length > 0) {
            for (const childSitemapUrl of parseResult.childSitemaps) {
              try {
                // Extract endpoint from sitemap URL (e.g., "service-areas-sitemap.xml" -> "service-areas")
                const sitemapFilename = childSitemapUrl.split('/').pop() || '';
                const endpoint = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '');
                if (endpoint && endpoint.length > 0) {
                  sitemapEndpoints[childSitemapUrl] = endpoint;
                  console.log(`[WordPress] Detected endpoint for ${childSitemapUrl}: ${endpoint}`);
                }
              } catch (error) {
                console.warn(`[WordPress] Failed to extract endpoint from ${childSitemapUrl}:`, error);
              }
            }
          }

          const updated = sites.map(s => {
            if (s.id === site.id) {
              return {
                ...s,
                sitemaps: {
                  mainSitemapUrl: sitemapUrl,
                  detectedAt: Date.now(),
                  type: result.type || parseResult.type,
                  childSitemaps: parseResult.childSitemaps,
                  urls: parseResult.urls,
                  endpoints: sitemapEndpoints, // Store detected endpoints
                },
              };
            }
            return s;
          });

          setSites(updated);
          saveSites(updated);
          toast.success(`Sitemap detected: ${result.sitemapUrl}`);
          
          // Show endpoint detection summary
          const endpointCount = Object.keys(sitemapEndpoints).length;
          if (endpointCount > 0) {
            const endpointsList = Object.values(sitemapEndpoints).join(', ');
            console.log(`[WordPress] Detected ${endpointCount} endpoints: ${endpointsList}`);
            toast.info(`Detected ${endpointCount} endpoint(s): ${endpointsList}`);
          }
          
          // Auto-detect entity sitemap after sitemap detection
          const updatedSite = updated.find(s => s.id === site.id);
          if (updatedSite) {
            try {
              console.log('[WordPress] Auto-detecting entity sitemap...');
              const detectedEntitySitemap = await detectEntitySitemap(updatedSite);
              if (detectedEntitySitemap) {
                const sitesWithEntity = updated.map(s => {
                  if (s.id === site.id) {
                    return {
                      ...s,
                      entitySitemapUrl: detectedEntitySitemap
                    };
                  }
                  return s;
                });
                setSites(sitesWithEntity);
                saveSites(sitesWithEntity);
                console.log(`[WordPress] Auto-detected entity sitemap: ${detectedEntitySitemap}`);
                toast.success(`Entity sitemap auto-detected: ${detectedEntitySitemap.split('/').pop()}`);
              }
            } catch (error) {
              console.warn('[WordPress] Error auto-detecting entity sitemap:', error);
              // Don't fail the whole process if entity detection fails
            }
          }
          
          // Auto-fetch scheduled posts after sitemap detection
          setIsFetchingScheduled(site.id);
          try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const scheduledResult = await getScheduledPosts(
              site.siteUrl,
              site.username,
              site.appPassword,
              currentMonth,
              currentYear
            );

            console.log('[WordPress] Scheduled posts result:', scheduledResult);

            if (!scheduledResult.error) {
              // Use functional update to ensure we have the latest state
              setSites(prevSites => {
                const updatedWithScheduled = prevSites.map(s => {
                  if (s.id === site.id) {
                    return {
                      ...s,
                      scheduledPosts: {
                        count: scheduledResult.count || 0,
                        month: currentMonth,
                        year: currentYear,
                        fetchedAt: Date.now(),
                      },
                    };
                  }
                  return s;
                });
                saveSites(updatedWithScheduled);
                return updatedWithScheduled;
              });
              
              if (scheduledResult.debug) {
                console.log('[WordPress] Debug info:', scheduledResult.debug);
                if (scheduledResult.debug.totalScheduledPosts > 0 && scheduledResult.count === 0) {
                  console.warn(`[WordPress] Found ${scheduledResult.debug.totalScheduledPosts} scheduled posts total, but 0 for current month ${currentMonth + 1}/${currentYear}`);
                }
              }
            } else {
              // Still update with 0 count if there's an error, so user knows we tried
              setSites(prevSites => {
                const updatedWithScheduled = prevSites.map(s => {
                  if (s.id === site.id) {
                    return {
                      ...s,
                      scheduledPosts: {
                        count: 0,
                        month: currentMonth,
                        year: currentYear,
                        fetchedAt: Date.now(),
                      },
                    };
                  }
                  return s;
                });
                saveSites(updatedWithScheduled);
                return updatedWithScheduled;
              });
            }
          } catch (scheduledError) {
            // Update with 0 count on error so UI shows we attempted to fetch
            console.error('[WordPress] Error fetching scheduled posts:', scheduledError);
            setSites(prevSites => {
              const now = new Date();
              const updatedWithScheduled = prevSites.map(s => {
                if (s.id === site.id) {
                  return {
                    ...s,
                    scheduledPosts: {
                      count: 0,
                      month: now.getMonth(),
                      year: now.getFullYear(),
                      fetchedAt: Date.now(),
                    },
                  };
                }
                return s;
              });
              saveSites(updatedWithScheduled);
              return updatedWithScheduled;
            });
          } finally {
            setIsFetchingScheduled(null);
          }
        } catch (parseError) {
          toast.error(parseError instanceof Error ? parseError.message : "Failed to parse sitemap");
        }
      } else {
        toast.error(result.message || "No sitemap found");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to detect sitemaps");
    } finally {
      setIsDetecting(null);
    }
  }, [sites]);

  const handleFetchScheduledPosts = useCallback(async (site: WordPressSite) => {
    setIsFetchingScheduled(site.id);

    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const result = await getScheduledPosts(
        site.siteUrl,
        site.username,
        site.appPassword,
        currentMonth,
        currentYear
      );

      if (result.error) {
        toast.error(`Failed to fetch scheduled posts: ${result.error}`);
        return;
      }

      const updated = sites.map(s => {
        if (s.id === site.id) {
          return {
            ...s,
            scheduledPosts: {
              count: result.count,
              month: currentMonth,
              year: currentYear,
              fetchedAt: Date.now(),
            },
          };
        }
        return s;
      });

      setSites(updated);
      saveSites(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch scheduled posts");
    } finally {
      setIsFetchingScheduled(null);
    }
  }, [sites]);

  const getScrapingKey = (siteId: string, sitemapUrl: string): string => {
    return `${siteId}:${sitemapUrl}`;
  };

  const handleScrapeChildSitemap = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      toast.error("Please detect sitemaps first before scraping");
      return;
    }

    const scrapingKey = getScrapingKey(site.id, childSitemapUrl);
    setIsScrapingSitemap(prev => ({
      ...prev,
      [scrapingKey]: true
    }));

    try {
      await scrapeChildSitemap(site, childSitemapUrl, (message) => {
        toast.info(message);
      });
    } catch (error) {
      console.error('Error scraping child sitemap:', error);
      toast.error(error instanceof Error ? error.message : `Failed to scrape sitemap: ${childSitemapUrl}`);
    } finally {
      setIsScrapingSitemap(prev => {
        const updated = { ...prev };
        delete updated[scrapingKey];
        return updated;
      });
    }
  }, []);

  const handleIndexSitemap = useCallback(async (site: WordPressSite, sitemapUrl: string) => {
    const indexingKey = `${site.id}-${sitemapUrl}`;
    
    setIsIndexingSitemap(prev => ({
      ...prev,
      [indexingKey]: true
    }));

    // Show initial progress toast
    const progressToastId = toast.loading(`Starting indexing for sitemap...`, {
      description: 'Parsing sitemap and checking URLs...'
    });

    try {
      const result = await indexSitemapUrls(
        site.siteUrl,
        sitemapUrl,
        site.username,
        site.appPassword,
        (progress: IndexingProgress) => {
          // Update progress toast
          toast.loading(
            `Indexing in progress: ${progress.processed}/${progress.total} URLs processed`,
            {
              id: progressToastId,
              description: `Indexed: ${progress.indexed} | Requested: ${progress.requested} | Errors: ${progress.errors}${progress.currentUrl ? ` | Current: ${progress.currentUrl.substring(0, 50)}...` : ''}`
            }
          );
        }
      );

      if (result.success) {
        // Dismiss progress toast and show success
        toast.dismiss(progressToastId);
        toast.success(
          `Indexing completed: ${result.processed} URLs processed`,
          {
            description: `Indexed: ${result.indexed} | Requested: ${result.requested} | Errors: ${result.errors}`,
            duration: 8000
          }
        );
      } else {
        toast.dismiss(progressToastId);
        toast.error(
          `Indexing failed: ${result.error || 'Unknown error'}`,
          { duration: 6000 }
        );
      }
    } catch (error) {
      console.error('Error indexing sitemap:', error);
      toast.dismiss(progressToastId);
      
      const errorMessage = error instanceof Error ? error.message : `Failed to index sitemap: ${sitemapUrl}`;
      
      // Check for specific error types
      if (errorMessage.includes('sitemap index')) {
        toast.error(
          'This sitemap is an index (contains other sitemaps). Please process individual child sitemaps instead.',
          { duration: 6000 }
        );
      } else if (errorMessage.includes('No URLs found')) {
        toast.error(
          'No URLs found in this sitemap. Please check the sitemap URL.',
          { duration: 6000 }
        );
      } else {
        toast.error(errorMessage, { duration: 6000 });
      }
    } finally {
      setIsIndexingSitemap(prev => {
        const updated = { ...prev };
        delete updated[indexingKey];
        return updated;
      });
    }
  }, []);

  const handleLoadCalendarPosts = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      toast.error("Please detect sitemaps first");
      return;
    }

    const loadingKey = `${site.id}-${childSitemapUrl}`;
    setIsLoadingCalendar(prev => ({
      ...prev,
      [loadingKey]: true
    }));

    try {
      // Parse sitemap to get URLs
      const parseResult = await parseSitemap(
        site.siteUrl,
        childSitemapUrl,
        site.username,
        site.appPassword
      );

      if (!parseResult.urls || parseResult.urls.length === 0) {
        toast.error("No URLs found in sitemap");
        return;
      }

      toast.info(`Loading ${parseResult.urls.length} posts from sitemap...`);

      // Resolve URLs to WordPress posts
      const resolveResult = await resolveWordPressUrls(
        site.siteUrl,
        site.username,
        site.appPassword,
        parseResult.urls
      );

      if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
        toast.error("Could not resolve any URLs to WordPress posts");
        return;
      }

      // Fetch post content with dates
      const resolvedObjects = resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }));
      const postContentResult = await getWordPressPostContent(
        site.siteUrl,
        site.username,
        site.appPassword,
        undefined,
        undefined,
        resolvedObjects
      );

      if (postContentResult.posts && postContentResult.posts.length > 0) {
        const now = new Date();
        const postsMetadata = postContentResult.posts.map(post => {
          // Use status from API if available, otherwise determine from date
          let status = post.status || 'publish';
          if (!post.status && post.date_gmt) {
            try {
              const postDate = new Date(post.date_gmt);
              if (postDate > now) {
                status = 'future';
              }
            } catch (e) {
              // Keep default status if date parsing fails
            }
          }
          
          return {
            id: post.id,
            slug: post.slug,
            title: post.title,
            date_gmt: post.date_gmt || '',
            status: status,
            link: post.link,
          };
        });

        // Count future posts
        const futureCount = postsMetadata.filter(post => {
          if (post.status === 'future') return true;
          if (!post.date_gmt) return false;
          try {
            const postDate = new Date(post.date_gmt);
            return postDate > now;
          } catch {
            return false;
          }
        }).length;

        // Update site data with post metadata using functional update to ensure latest state
        setSites(prevSites => {
          const updated = prevSites.map(s => {
            if (s.id === site.id && s.sitemaps) {
              return {
                ...s,
                sitemaps: {
                  ...s.sitemaps,
                  postMetadata: {
                    ...(s.sitemaps.postMetadata || {}),
                    [childSitemapUrl]: {
                      posts: postsMetadata,
                      futureCount,
                      lastChecked: Date.now(),
                    },
                  },
                },
              };
            }
            return s;
          });
          saveSites(updated);
          return updated;
        });
        
        toast.success(`Loaded ${postsMetadata.length} posts with dates (${futureCount} future)`);
      } else {
        toast.error("No posts found");
      }
    } catch (error) {
      console.error('Error loading calendar posts:', error);
      toast.error(error instanceof Error ? error.message : `Failed to load posts: ${childSitemapUrl}`);
    } finally {
      setIsLoadingCalendar(prev => {
        const updated = { ...prev };
        delete updated[loadingKey];
        return updated;
      });
    }
  }, [sites]);

  const handleCheckFuturePosts = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      toast.error("Please detect sitemaps first");
      return;
    }

    const checkingKey = `${site.id}-${childSitemapUrl}`;
    setIsCheckingFuture(prev => ({
      ...prev,
      [checkingKey]: true
    }));

    try {
      const result = await checkFuturePosts(
        site.siteUrl,
        site.username,
        site.appPassword,
        childSitemapUrl
      );

      if (result.success) {
        // Update site data with future posts metadata
        const updated = sites.map(s => {
          if (s.id === site.id && s.sitemaps) {
            const existingMetadata = s.sitemaps.postMetadata?.[childSitemapUrl];
            const updatedMetadata = {
              ...(existingMetadata || { posts: [], futureCount: 0, lastChecked: 0 }),
              futureCount: result.futureCount,
              lastChecked: Date.now(),
              // Update posts with future status if we have them
              posts: result.posts ? result.posts.map(p => ({
                ...p,
                status: p.status || (new Date(p.date_gmt) > new Date() ? 'future' : 'publish')
              })) : (existingMetadata?.posts || []),
            };

            return {
              ...s,
              sitemaps: {
                ...s.sitemaps,
                postMetadata: {
                  ...(s.sitemaps.postMetadata || {}),
                  [childSitemapUrl]: updatedMetadata,
                },
              },
            };
          }
          return s;
        });

        setSites(updated);
        saveSites(updated);
        toast.success(`Found ${result.futureCount} future post${result.futureCount !== 1 ? 's' : ''} in sitemap`);
      } else {
        toast.error(result.error || "Failed to check future posts");
      }
    } catch (error) {
      console.error('Error checking future posts:', error);
      toast.error(error instanceof Error ? error.message : `Failed to check future posts: ${childSitemapUrl}`);
    } finally {
      setIsCheckingFuture(prev => {
        const updated = { ...prev };
        delete updated[checkingKey];
        return updated;
      });
    }
  }, [sites]);

  const handleSetEntitySitemap = useCallback((site: WordPressSite, sitemapUrl: string) => {
    const updated = sites.map(s => {
      if (s.id === site.id) {
        return { ...s, entitySitemapUrl: sitemapUrl };
      }
      return s;
    });
    setSites(updated);
    saveSites(updated);
    toast.success(`Entity sitemap set to: ${sitemapUrl.split('/').pop()}`);
  }, [sites]);

  return {
    sites,
    setSites,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isIndexingSitemap,
    isCheckingFuture,
    isLoadingCalendar,
    handleAddSite,
    handleEditSite,
    handleDeleteSite,
    handleToggleEnabled,
    handleSaveSite,
    handleTestConnection,
    handleDetectSitemaps,
    handleFetchScheduledPosts,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleCheckFuturePosts,
    handleLoadCalendarPosts,
    handleSetEntitySitemap,
    getScrapingKey,
  };
}

