import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublishedPosts, type PublishedPostsResult, resolveWordPressUrls, getWordPressPostContent } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { toast } from "sonner";
import { format } from "date-fns";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface PostSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void; // Callback to pass post data when selected
}

export const PostSelector: React.FC<PostSelectorProps> = ({
  site,
  value,
  onValueChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
}) => {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<PublishedPostsResult['posts']>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPosts = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
      if (result.error) {
        // Handle "no posts" case gracefully - don't show error toast
        if (result.error.includes('No published posts found')) {
          console.log('[PostSelector] No published posts found - this is normal if the site has no posts yet');
          setPosts([]);
          return;
        }
        throw new Error(result.error);
      }
      setPosts(result.posts || []);
    } catch (error) {
      // Only log error, don't show toast - this is not critical
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('No published posts found')) {
        console.warn('[PostSelector] Error fetching posts:', errorMessage);
      }
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword]);

  // Only fetch posts when popover opens (lazy loading)
  useEffect(() => {
    if (open && site.username && site.appPassword && posts.length === 0 && !isLoading) {
      fetchPosts();
    }
  }, [open, site.username, site.appPassword, fetchPosts, posts.length, isLoading]);

  const selectedUrls = multiSelect ? (Array.isArray(value) ? value : []) : [];
  const selectedUrl = multiSelect ? undefined : (typeof value === 'string' ? value : '');
  const selectedPost = posts.find((post) => post.link === selectedUrl);
  const selectedPosts = multiSelect ? posts.filter((post) => selectedUrls.includes(post.link)) : [];

  const filteredPosts = posts.filter((post) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      post.title.toLowerCase().includes(query) ||
      post.link.toLowerCase().includes(query) ||
      post.slug.toLowerCase().includes(query)
    );
  });

  const filteredSelectedUrls = filteredPosts.map((post) => post.link);
  const allFilteredSelected = filteredSelectedUrls.length > 0 && filteredSelectedUrls.every((url) => selectedUrls.includes(url));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newUrls = Array.from(new Set([...selectedUrls, ...filteredSelectedUrls]));
      onValueChange(newUrls);
    } else {
      const newUrls = selectedUrls.filter((url) => !filteredSelectedUrls.includes(url));
      onValueChange(newUrls);
    }
  };

  const handleTogglePost = (postUrl: string) => {
    if (selectedUrls.includes(postUrl)) {
      onValueChange(selectedUrls.filter((url) => url !== postUrl));
    } else {
      onValueChange([...selectedUrls, postUrl]);
    }
  };

  return (
    <div className="space-y-2">
      <style>{`
        [data-radix-popover-content] [cmdk-item][data-selected="true"],
        [data-radix-popover-content] [cmdk-item][data-selected="true"] * {
          background-color: black !important;
          color: white !important;
        }
        [data-radix-popover-content] [cmdk-item]:hover,
        [data-radix-popover-content] [cmdk-item]:hover * {
          background-color: black !important;
          color: white !important;
        }
      `}</style>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`w-full justify-between h-9 text-sm font-medium bg-[#1a1a1a] border border-green-500/50 text-green-300 hover:bg-black hover:border-white/50 hover:text-white ${getCyberpunkTextClasses('secondary')} transition-all`}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
          >
            <span className="truncate">
              {multiSelect ? (
                selectedPosts.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    {selectedPosts.length === 1 ? (
                      selectedPosts[0].link
                    ) : (
                      `${selectedPosts.length} posts selected`
                    )}
                  </span>
                ) : (
                  "Select posts..."
                )
              ) : selectedPost ? (
                <span className="flex items-center gap-2">
                  <FileText className="h-3 w-3 shrink-0" />
                  {selectedPost.link}
                </span>
              ) : selectedUrl ? (
                selectedUrl
              ) : (
                "Select or enter post URL..."
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-[#0f0f0f] border border-green-500/30" align="start">
          <Command className="bg-[#0f0f0f]">
            <CommandInput
              placeholder="Search posts..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-[#0f0f0f] border-b border-green-500/20 text-green-300 placeholder:text-slate-500 font-medium"
            />
            <div className={`flex items-center justify-between px-3 py-2 border-b border-green-500/15 text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
              <span>{filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fetchPosts();
                }}
                disabled={isLoading}
                className={`h-6 text-xs ${getCyberpunkButtonClasses()} transition-all`}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            </div>
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-green-300 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading posts...
                  </div>
                ) : (
                  <span className="text-slate-400 font-medium">No posts found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {multiSelect && filteredPosts.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 border-b border-green-500/15 cursor-pointer hover:bg-black hover:text-white transition-colors group"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectAll(!allFilteredSelected);
                    }}
                  >
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={handleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                    />
                    <span className={cn(
                      "text-sm font-semibold",
                      allFilteredSelected ? "text-white" : "text-green-300 group-hover:text-white"
                    )}>Select All ({filteredPosts.length})</span>
                  </div>
                )}
                {filteredPosts.map((post) => {
                  const isSelected = multiSelect ? selectedUrls.includes(post.link) : selectedUrl === post.link;
                  return (
                    <CommandItem
                      key={post.id}
                      value={post.link}
                      onSelect={() => {
                        if (multiSelect) {
                          handleTogglePost(post.link);
                        } else {
                          onValueChange(post.link);
                          // Pass post data to parent when selected from dropdown
                          // Posts from API always have real IDs
                          if (onPostDataChange) {
                            onPostDataChange({
                              id: post.id,
                              subtype: 'post',
                              link: post.link,
                              slug: post.slug,
                              endpoint: 'posts', // REQUIRED - PostSelector only fetches posts
                            });
                          }
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex flex-col items-start gap-1.5 py-2.5 px-3 rounded transition-colors group",
                        isSelected ? "bg-slate-800/60 border border-green-500/50" : "hover:bg-black hover:text-white border border-transparent",
                        "[&[data-selected='true']]:!bg-black [&[data-selected='true']]:!text-white"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleTogglePost(post.link)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 border-green-500/50 data-[state=checked]:bg-green-500/30 data-[state=checked]:border-green-500"
                            />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected ? "opacity-100 text-white" : "opacity-0 text-green-300"
                              )}
                            />
                          )}
                          <span className={cn(
                            "font-semibold text-sm truncate",
                            isSelected ? "text-white" : "text-green-300 group-hover:text-white"
                          )}>{post.title}</span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check className="h-4 w-4 text-white shrink-0" />
                        )}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 text-xs font-medium pl-6",
                        isSelected ? "text-slate-200" : `${getCyberpunkTextClasses('muted')} group-hover:text-white`
                      )}>
                        <span className="truncate font-mono">{post.link}</span>
                        {post.date_gmt && (
                          <span className="shrink-0">
                            • {format(new Date(post.date_gmt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 text-xs font-medium pl-6",
                        isSelected ? "text-slate-200" : `${getCyberpunkTextClasses('muted')} group-hover:text-white`
                      )}>
                        <span className="font-mono truncate">
                          Path: {(() => {
                            try {
                              const url = new URL(post.link);
                              return url.pathname || '/';
                            } catch {
                              // If URL parsing fails, try to extract path manually
                              const match = post.link.match(/https?:\/\/[^\/]+(\/.*)/);
                              return match ? match[1] : post.slug || 'N/A';
                            }
                          })()}
                        </span>
                        {post.slug && (
                          <span className="shrink-0 font-mono">
                            • Slug: {post.slug}
                          </span>
                        )}
                      </div>
                      {/* Show endpoint prominently on its own line - KEEP THIS IN DROPDOWN */}
                      <div className="flex items-center gap-2 text-xs pl-6 mt-0.5">
                        <span className={cn(
                          "font-semibold",
                          isSelected ? "text-slate-300" : `${getCyberpunkTextClasses('muted')} group-hover:text-white`
                        )}>Endpoint:</span>
                        {(() => {
                          // Determine endpoint based on post type or sitemap detection
                          let endpoint: string | undefined;
                          
                          // Check sitemaps.endpoints for matching sitemap
                          if (site.sitemaps?.endpoints && site.sitemaps?.childSitemaps) {
                            const postPath = post.link.toLowerCase();
                            for (const [sitemapUrl, sitemapEndpoint] of Object.entries(site.sitemaps.endpoints)) {
                              const endpointPattern = sitemapEndpoint.toLowerCase().replace(/s$/, '');
                              if (postPath.includes(endpointPattern) || postPath.includes(sitemapEndpoint.toLowerCase())) {
                                endpoint = sitemapEndpoint;
                                break;
                              }
                            }
                          }
                          
                          // Default based on URL patterns
                          if (!endpoint) {
                            if (post.link.toLowerCase().includes('/post/') || post.link.match(/\/\d{4}\/\d{2}\//)) {
                              endpoint = 'posts';
                            } else if (post.link.toLowerCase().includes('/page/')) {
                              endpoint = 'pages';
                            }
                          }
                          
                          return endpoint ? (
                            <span className={cn(
                              "px-2.5 py-1 border rounded font-semibold text-xs uppercase tracking-wide font-mono",
                              isSelected 
                                ? "bg-green-500/30 text-white border-green-500/60" 
                                : "bg-green-500/15 text-green-300 border-green-500/40"
                            )}>
                              {endpoint}
                            </span>
                          ) : (
                            <span className={cn(
                              "px-2.5 py-1 border rounded text-xs font-medium italic",
                              isSelected
                                ? "bg-yellow-500/25 text-yellow-200 border-yellow-500/50"
                                : "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                            )}>
                              Not detected
                            </span>
                          );
                        })()}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Manual URL input as fallback - only show for single select */}
      {!multiSelect && (
        <div className="relative">
          <Input
            placeholder="Or enter URL manually"
            value={selectedUrl || ''}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
            className={`h-8 text-xs bg-[#1a1a1a] border border-green-500/50 text-green-300 placeholder:text-slate-500 font-mono ${getCyberpunkTextClasses('secondary')} transition-all`}
          />
          {selectedPost && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(selectedPost.link, '_blank')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedPosts.length > 0 && (
        <div className={`flex items-center justify-between text-xs ${getCyberpunkTextClasses('muted')}`}>
          <span>
            {selectedPosts.length} post{selectedPosts.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
if (!site.username || !site.appPassword) {
                toast.error('Site credentials not available');
                return;
              }

              try {
                toast.info('Fetching post data...');
                
                // Helper function to convert subtype to endpoint (same as in use-content-optimization.ts)
                const subtypeToEndpoint = (subtype?: string): string | undefined => {
                  const map: Record<string, string> = {
                    post: 'posts',
                    page: 'pages', // Hard rule: pages always use 'pages'
                    'service-area': 'service-areas',
                  };
                  return subtype ? map[subtype] : undefined;
                };

                // Helper to find endpoint from sitemap by matching URL to sitemap URLs
                const findEndpointFromSitemap = (url: string, site: WordPressSite): string | undefined => {
                  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
                    return undefined;
                  }

                  const urlPath = new URL(url).pathname.toLowerCase();

                  // Check each sitemap's endpoint
                  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
                    // Extract sitemap type from filename (e.g., "post-sitemap.xml" -> "post")
                    const sitemapFilename = sitemapUrl.split('/').pop() || '';
                    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '').toLowerCase();
                    
                    // Match URL path to sitemap type
                    // e.g., /page/about -> page-sitemap.xml -> 'pages'
                    // e.g., /service-area/denver -> service-area-sitemap.xml -> 'service-areas'
                    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
                      console.log(`[PostSelector Scrape] Matched URL to sitemap: ${url} -> ${sitemapUrl} -> endpoint: ${endpoint}`);
                      return endpoint;
                    }
                  }

                  // Hard rule: if URL contains /page/ or looks like a page, use 'pages'
                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^\/]+$/)) {
                    // Check if it's NOT a post (posts usually have dates in path)
                    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
                      console.log(`[PostSelector Scrape] Hard rule: URL looks like a page, using 'pages' endpoint`);
                      return 'pages';
                    }
                  }

                  return undefined;
                };

                // Determine endpoint using same priority as handleOptimizeContent:
                // 1. Manual endpoint (authoritative)
                // 2. Subtype to endpoint mapping (with hard rules)
                // 3. Sitemap detection (match URL to sitemap)
                let knownEndpoint = site.manualEndpoint;
                
                // If no endpoint yet, try to find it from sitemap detection (check first URL)
                if (!knownEndpoint && selectedUrls.length > 0) {
                  knownEndpoint = findEndpointFromSitemap(selectedUrls[0], site);
                }

                const entitySitemapUrl = site.entitySitemapUrl || undefined;
// Resolve URLs to get post IDs and types - NOW USING ENTITY LOGIC
                const resolveResult = await resolveWordPressUrls(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  selectedUrls,
                  entitySitemapUrl,  // Pass entity sitemap URL
                  knownEndpoint      // Pass known endpoint from manual, subtype, or sitemap detection
                );
if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
const errorMsg = resolveResult.unresolvable?.[0]?.reason || 'Could not resolve post URLs';
                  toast.error(errorMsg);
                  return;
                }
// Fetch full post content with all fields
                const contentResult = await getWordPressPostContent(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  undefined,
                  undefined,
                  resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }))
                );
if (contentResult.error || !contentResult.posts || contentResult.posts.length === 0) {
toast.error(contentResult.error || 'Failed to fetch post data');
                  return;
                }

                // Create JSON file with all post data
                const jsonData = {
                  siteUrl: site.siteUrl,
                  siteName: site.name,
                  fetchedAt: new Date().toISOString(),
                  posts: contentResult.posts.map(post => ({
                    ...post.fullData || post, // Include fullData if available, otherwise use post
                    // Also include parsed fields for convenience
                    parsed: {
                      id: post.id,
                      slug: post.slug,
                      title: post.title,
                      link: post.link,
                      status: post.status,
                      date_gmt: post.date_gmt,
                      postTypeEndpoint: post.postTypeEndpoint,
                      postTypeSubtype: post.postTypeSubtype,
                    }
                  }))
                };

                // Download JSON file
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wordpress-posts-${site.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast.success(`Downloaded ${contentResult.posts.length} post(s) as JSON`);
              } catch (error) {
console.error('[PostSelector] Error scraping posts:', error);
                toast.error(error instanceof Error ? error.message : 'Failed to scrape posts');
              }
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            className={`h-6 text-xs ${getCyberpunkButtonClasses()} transition-all`}
            title="Download post data as JSON"
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

