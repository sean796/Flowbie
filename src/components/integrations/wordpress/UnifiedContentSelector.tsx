import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublishedPosts, getPublishedPages, resolveWordPressUrls, getWordPressPostContent, parseSitemap } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { toast } from "sonner";
import { format } from "date-fns";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface UnifiedContentSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  postType: 'post' | 'service-area' | 'page' | 'both';
  onPostTypeChange: (type: 'post' | 'service-area' | 'page' | 'both') => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void;
}

export const UnifiedContentSelector: React.FC<UnifiedContentSelectorProps> = ({
  site,
  value,
  onValueChange,
  postType,
  onPostTypeChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
}) => {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [serviceAreas, setServiceAreas] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [pages, setPages] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasNoPosts, setHasNoPosts] = useState(false);
  const [hasNoEntities, setHasNoEntities] = useState(false);
  const [hasNoPages, setHasNoPages] = useState(false);

  const selectedUrls = Array.isArray(value) ? value : (value ? [value] : []);
  const selectedUrl = Array.isArray(value) ? '' : value;

  const currentItems = postType === 'post' ? posts : postType === 'service-area' ? serviceAreas : postType === 'page' ? pages : [...posts, ...serviceAreas]; // 'both' only includes posts and entities, not pages
  const selectedItem = currentItems.find(item => item.link === selectedUrl);
  const selectedItems = currentItems.filter(item => selectedUrls.includes(item.link));

  const fetchPosts = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      toast.error("WordPress credentials missing. Please update site settings.");
      return;
    }
setIsLoading(true);
    setHasNoPosts(false); // Reset flag when attempting to fetch
    const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
if (result.error) {
      // Handle "no posts" case gracefully - don't show error toast
      if (result.error.includes('No published posts found')) {
        console.log('[UnifiedContentSelector] No published posts found - this is normal if the site has no posts yet');
        setPosts([]);
        setHasNoPosts(true); // Mark that we've determined there are no posts
} else {
        toast.error(`Failed to fetch posts: ${result.error}`);
        setPosts([]);
        setHasNoPosts(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      setPosts(result.posts || []);
      setHasNoPosts(result.posts?.length === 0); // Set flag if no posts returned
}
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  const fetchEntities = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      toast.error("WordPress credentials missing. Please update site settings.");
      return;
    }
    
    if (!site.entitySitemapUrl) {
      toast.error("No entity sitemap configured. Please set an entity sitemap first.");
      setServiceAreas([]);
      return;
    }

    setIsLoading(true);
    try {
      // Parse entity sitemap to get entity URLs
      const parseResult = await parseSitemap(
        site.siteUrl,
        site.entitySitemapUrl,
        site.username,
        site.appPassword
      );
      
      if (parseResult.urls && parseResult.urls.length > 0) {
        // Convert URLs to entity format
        const entitiesFromSitemap = parseResult.urls.map((url: string, index: number) => {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
            const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
            
            // Extract title from slug (convert kebab-case to Title Case)
            const title = slug
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ') || url;
            
            return {
              id: index + 1, // Temporary ID
              slug: slug,
              title: title,
              link: url,
              date_gmt: new Date().toISOString(),
            };
          } catch {
            return {
              id: index + 1,
              slug: '',
              title: url,
              link: url,
              date_gmt: new Date().toISOString(),
            };
          }
        });
        
        setServiceAreas(entitiesFromSitemap);
        setHasNoEntities(false); // Reset flag when entities are found
      } else {
        setServiceAreas([]);
        setHasNoEntities(true); // Mark that we've determined there are no entities
        toast.error("No entities found in entity sitemap.");
      }
    } catch (error) {
      console.error('[UnifiedContentSelector] Error fetching entities:', error);
      toast.error(`Failed to fetch entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setServiceAreas([]);
      setHasNoEntities(true); // CRITICAL: Set flag to prevent infinite retries in useEffect
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword, site.entitySitemapUrl]);

  const fetchPages = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      toast.error("WordPress credentials missing. Please update site settings.");
      return;
    }
    setIsLoading(true);
    setHasNoPages(false); // Reset flag when attempting to fetch
    const result = await getPublishedPages(site.siteUrl, site.username, site.appPassword, 100, 0);
    if (result.error) {
      // Handle "no pages" case gracefully - don't show error toast
      if (result.error.includes('No published') || result.error.includes('not found')) {
        console.log('[UnifiedContentSelector] No published pages found - this is normal if the site has no pages yet');
        setPages([]);
        setHasNoPages(true); // Mark that we've determined there are no pages
      } else {
        toast.error(`Failed to fetch pages: ${result.error}`);
        setPages([]);
        setHasNoPages(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      // Exclude thank-you pages (noindex) from selector - Death Star module
      const allPages = result.posts || [];
      const isThankYouPage = (p: { slug?: string; link?: string; title?: string }) => {
        const slug = (p.slug || '').toLowerCase();
        const link = (p.link || '').toLowerCase();
        let path = '';
        try {
          if (p.link) path = new URL(p.link).pathname.toLowerCase();
        } catch {
          path = link;
        }
        const title = (p.title || '').toLowerCase();
        return slug.includes('thank-you') || path.includes('thank-you') || link.includes('thank-you') || title.includes('thank you');
      };
      const pagesFiltered = allPages.filter((p) => !isThankYouPage(p));
      setPages(pagesFiltered);
      setHasNoPages(pagesFiltered.length === 0);
    }
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  // Reset flags when site URL changes
  useEffect(() => {
    setHasNoPosts(false);
    setHasNoEntities(false);
    setHasNoPages(false);
    setPosts([]);
    setServiceAreas([]);
    setPages([]);
  }, [site.siteUrl]);

  useEffect(() => {
    // Don't fetch if we've already determined there are no posts/entities/pages
    if (open && postType === 'post' && posts.length === 0 && !isLoading && !hasNoPosts) {
      fetchPosts();
    } else if (open && postType === 'service-area' && serviceAreas.length === 0 && !isLoading && !hasNoEntities) {
      fetchEntities();
    } else if (open && postType === 'page' && pages.length === 0 && !isLoading && !hasNoPages) {
      fetchPages();
    } else if (open && postType === 'both') {
      // Fetch posts and entities if not already loaded (both does not include pages)
      if (posts.length === 0 && !isLoading && !hasNoPosts) {
        fetchPosts();
      }
      if (serviceAreas.length === 0 && !isLoading && !hasNoEntities && site.entitySitemapUrl) {
        fetchEntities();
      }
    }
  }, [open, postType, posts.length, serviceAreas.length, pages.length, isLoading, hasNoPosts, hasNoEntities, hasNoPages, fetchPosts, fetchEntities, fetchPages, site.entitySitemapUrl]);

  const filteredItems = currentItems.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedUrls.includes(item.link));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onValueChange([...new Set([...selectedUrls, ...filteredItems.map(p => p.link)])]);
    } else {
      onValueChange(selectedUrls.filter(url => !filteredItems.map(p => p.link).includes(url)));
    }
  };


  const handleToggleItem = (itemUrl: string) => {
    if (selectedUrls.includes(itemUrl)) {
      onValueChange(selectedUrls.filter(url => url !== itemUrl));
    } else {
      onValueChange([...selectedUrls, itemUrl]);
    }
  };

  const getDisplayText = () => {
    if (multiSelect) {
      if (selectedItems.length > 0) {
        const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'service areas' : postType === 'page' ? 'pages' : 'URLs';
        return selectedItems.length === 1 ? selectedItems[0].link : `${selectedItems.length} ${typeLabel} selected`;
      }
      const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'URLs';
      return `Select ${typeLabel}...`;
    }
    if (selectedItem) {
      return selectedItem.link;
    }
    if (selectedUrl) {
      return selectedUrl;
    }
    const typeLabel = postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'URL';
    return `Select or enter ${typeLabel}...`;
  };
return (
    <div className="space-y-2">
      <style>{`
        /* Target CommandItem with multiple selector strategies */
        [cmdk-item][data-selected="true"],
        [cmdk-item][data-selected="true"] *,
        [cmdk-item][data-selected='true'],
        [cmdk-item][data-selected='true'] * {
          background-color: black !important;
          color: white !important;
        }
        [cmdk-item]:hover,
        [cmdk-item]:hover * {
          background-color: black !important;
          color: white !important;
        }
        [cmdk-item][data-selected="true"] .endpoint-badge,
        [cmdk-item][data-selected='true'] .endpoint-badge,
        [cmdk-item]:hover .endpoint-badge {
          color: white !important;
          border-color: rgba(255, 255, 255, 0.5) !important;
        }
        /* Override Tailwind data-[selected] classes */
        [cmdk-item][data-selected="true"][class*="data-\\[selected"],
        [cmdk-item][data-selected='true'][class*="data-\\[selected"] {
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
            <span className="truncate flex items-center gap-2">
              <FileText className="h-3 w-3 shrink-0" />
              {getDisplayText()}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-[#0f0f0f] border border-green-500/30" align="start">
          <Command className="bg-[#0f0f0f]">
            {/* Post Type Switcher */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-green-500/20">
              <span className={`text-xs font-semibold ${getCyberpunkTextClasses('muted')} uppercase tracking-wider`}>Type:</span>
              <div className="flex gap-1 flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'post') {
                      onPostTypeChange('post');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoPosts(false); // Reset flag when switching types
                    }
                  }}
                  className={cn(
                    "h-7 px-3 text-xs font-medium transition-all",
                    postType === 'post'
                      ? "bg-black text-white border border-white/50"
                      : `${getCyberpunkButtonClasses()} hover:bg-black hover:text-white`
                  )}
                >
                  Posts
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'service-area') {
                      onPostTypeChange('service-area');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoEntities(false); // Reset flag when switching types
                    }
                  }}
                  className={cn(
                    "h-7 px-3 text-xs font-medium transition-all",
                    postType === 'service-area'
                      ? "bg-black text-white border border-white/50"
                      : `${getCyberpunkButtonClasses()} hover:bg-black hover:text-white`
                  )}
                  disabled={!site.entitySitemapUrl}
                  title={!site.entitySitemapUrl ? "No entity sitemap configured" : ""}
                >
                  Entities
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'both') {
                      onPostTypeChange('both');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                    }
                  }}
                  className={cn(
                    "h-7 px-3 text-xs font-medium transition-all",
                    postType === 'both'
                      ? "bg-black text-white border border-white/50"
                      : `${getCyberpunkButtonClasses()} hover:bg-black hover:text-white`
                  )}
                >
                  Both
                </Button>
                <div className="flex-1" /> {/* Spacer */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'page') {
                      onPostTypeChange('page');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoPages(false); // Reset flag when switching types
                    }
                  }}
                  className={cn(
                    "h-7 px-3 text-xs font-medium transition-all",
                    postType === 'page'
                      ? "bg-black text-white border border-white/50"
                      : `${getCyberpunkButtonClasses()} hover:bg-black hover:text-white`
                  )}
                >
                  Pages
                </Button>
              </div>
            </div>
            <CommandInput
              placeholder={`Search ${postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'posts and entities'}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-[#0f0f0f] border-b border-green-500/20 text-green-300 placeholder:text-slate-500 font-medium"
            />
            <div className={`flex items-center justify-between px-3 py-2 border-b border-green-500/15 text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
              <span>{filteredItems.length} {postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'item'}{filteredItems.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (postType === 'post') {
                    fetchPosts();
                  } else if (postType === 'service-area') {
                    fetchEntities();
                  } else if (postType === 'page') {
                    fetchPages();
                  } else if (postType === 'both') {
                    fetchPosts();
                    fetchEntities();
                    // 'both' does not include pages
                  }
                }}
                disabled={isLoading || (postType === 'post' && hasNoPosts) || (postType === 'service-area' && hasNoEntities) || (postType === 'page' && hasNoPages)}
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
                    Loading {postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'posts and entities'}...
                  </div>
                ) : (
                  <span className="text-slate-400 font-medium">No {postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'items'} found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {multiSelect && filteredItems.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 border-b border-green-500/15 cursor-pointer group hover:bg-black hover:text-white transition-colors"
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
                    )}>Select All {postType === 'post' ? 'Posts' : postType === 'service-area' ? 'Entities' : postType === 'page' ? 'Pages' : 'Items'} ({filteredItems.length})</span>
                  </div>
                )}
                {filteredItems.map((item) => {
                  const isSelected = multiSelect ? selectedUrls.includes(item.link) : selectedUrl === item.link;
                  // Determine endpoint: use item's endpoint if available, otherwise infer
                  let endpoint = item.endpoint;
                  if (!endpoint) {
                    if (postType === 'post') {
                      endpoint = 'posts';
                    } else if (postType === 'service-area') {
                      endpoint = site.sitemaps?.endpoints && site.entitySitemapUrl
                        ? site.sitemaps.endpoints[site.entitySitemapUrl] || 'service-areas'
                        : 'service-areas';
                    } else if (postType === 'page') {
                      endpoint = 'pages';
                    } else {
                      // postType === 'both' - infer from item (only posts and entities, not pages)
                      // Check if item is in posts or serviceAreas
                      const isPost = posts.some(p => p.link === item.link);
                      if (isPost) {
                        endpoint = 'posts';
                      } else {
                        endpoint = site.sitemaps?.endpoints && site.entitySitemapUrl
                          ? site.sitemaps.endpoints[site.entitySitemapUrl] || 'service-areas'
                          : 'service-areas';
                      }
                    }
                  }
                  
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.link}
                      onMouseEnter={(e) => {
}}
                      onSelect={() => {
                        if (multiSelect) {
                          handleToggleItem(item.link);
                        } else {
                          onValueChange(item.link);
                          if (onPostDataChange) {
                            const subtype = postType === 'post' ? 'post' : postType === 'service-area' ? 'service-area' : postType === 'page' ? 'page' : 
                              (posts.some(p => p.link === item.link) ? 'post' : 'service-area'); // 'both' only has posts and entities
                            onPostDataChange({
                              id: item.id,
                              subtype: subtype,
                              link: item.link,
                              slug: item.slug,
                              endpoint: endpoint,
                            });
                          }
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex flex-col items-start gap-1.5 py-2.5 px-3 rounded transition-colors group",
                        isSelected ? "bg-black border border-white/50 text-white" : "border border-transparent"
                      )}
                      data-selected={isSelected ? "true" : undefined}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleItem(item.link)}
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
                          )}>{item.title}</span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check className="h-4 w-4 text-white shrink-0" />
                        )}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 text-xs font-medium pl-6",
                        isSelected ? "text-slate-200" : getCyberpunkTextClasses('muted') + " group-hover:text-white"
                      )}>
                        <span className="truncate font-mono">{item.link}</span>
                        {item.date_gmt && (
                          <span className={cn(
                            "shrink-0",
                            isSelected ? "text-slate-200" : "text-slate-400 group-hover:text-white"
                          )}>
                            • {format(new Date(item.date_gmt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 text-xs font-medium pl-6",
                        isSelected ? "text-slate-200" : getCyberpunkTextClasses('muted') + " group-hover:text-white"
                      )}>
                        <span className="font-mono truncate">
                          Path: {(() => {
                            try {
                              const url = new URL(item.link);
                              return url.pathname || '/';
                            } catch {
                              const match = item.link.match(/https?:\/\/[^\/]+(\/.*)/);
                              return match ? match[1] : item.slug || 'N/A';
                            }
                          })()}
                        </span>
                        {item.slug && (
                          <span className={cn(
                            "shrink-0 font-mono",
                            isSelected ? "text-slate-200" : "text-slate-400 group-hover:text-white"
                          )}>
                            • Slug: {item.slug}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs pl-6 mt-0.5">
                        <span className={cn(
                          "font-semibold",
                          isSelected ? "text-white" : getCyberpunkTextClasses('muted') + " group-hover:text-white"
                        )}>Endpoint:</span>
                        <span className={cn(
                          "px-2.5 py-1 rounded font-semibold text-xs uppercase tracking-wide font-mono endpoint-badge",
                          isSelected ? "bg-green-500/30 text-white border border-green-500/60" : "bg-green-500/15 text-green-300 border border-green-500/40 group-hover:text-white group-hover:border-white/50"
                        )}>
                          {endpoint}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!multiSelect && (
        <div className="relative">
          <Input
            placeholder="Or enter URL manually"
            value={selectedUrl || ''}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
            className={`h-9 text-sm bg-[#1a1a1a] border border-green-500/50 text-green-300 placeholder:text-slate-500 font-mono ${getCyberpunkTextClasses('secondary')} transition-all`}
          />
          {selectedItem && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(selectedItem.link, '_blank')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-green-300 hover:text-white"
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedItems.length > 0 && (
        <div className={`flex items-center justify-between text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
          <span>
            {selectedItems.length} {postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'URL'}{selectedItems.length !== 1 ? 's' : ''} selected
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
                toast.info('Fetching data...');
                
                // Helper to find endpoint from sitemap by matching URL to sitemap URLs
                const findEndpointFromSitemap = (url: string, site: WordPressSite): string | undefined => {
                  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
                    return undefined;
                  }

                  const urlPath = new URL(url).pathname.toLowerCase();

                  // Check each sitemap's endpoint
                  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
                    const sitemapFilename = sitemapUrl.split('/').pop() || '';
                    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '').toLowerCase();
                    
                    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
                      return endpoint;
                    }
                  }

                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^\/]+$/)) {
                    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
                      return 'pages';
                    }
                  }

                  return undefined;
                };

                // Determine endpoint using same priority as handleOptimizeContent
                let knownEndpoint = site.manualEndpoint;
                if (!knownEndpoint && selectedUrls.length > 0) {
                  knownEndpoint = findEndpointFromSitemap(selectedUrls[0], site);
                }

                const entitySitemapUrl = site.entitySitemapUrl || undefined;
                
                // Use entity logic - pass entitySitemapUrl and knownEndpoint
                const resolveResult = await resolveWordPressUrls(
                  site.siteUrl, 
                  site.username, 
                  site.appPassword, 
                  selectedUrls,
                  entitySitemapUrl,  // Pass entity sitemap URL
                  knownEndpoint      // Pass known endpoint
                );
                if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
                  toast.error(resolveResult.unresolvable?.[0]?.reason || 'Could not resolve URLs');
                  return;
                }
                const contentResult = await getWordPressPostContent(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  undefined,
                  undefined,
                  resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }))
                );
                if (contentResult.error || !contentResult.posts || contentResult.posts.length === 0) {
                  toast.error(contentResult.error || 'Failed to fetch data');
                  return;
                }
                const jsonData = {
                  siteUrl: site.siteUrl,
                  siteName: site.name,
                  fetchedAt: new Date().toISOString(),
                  posts: contentResult.posts.map(post => ({
                    ...post.fullData || post,
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
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'sitemaps';
                a.download = `wordpress-${typeLabel}-${site.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success(`Downloaded ${contentResult.posts.length} item(s) as JSON`);
              } catch (error) {
                console.error('[UnifiedContentSelector] Error scraping:', error);
                toast.error(error instanceof Error ? error.message : 'Failed to scrape');
              }
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            className={`h-8 text-sm font-medium ${getCyberpunkButtonClasses()} transition-all`}
            title={`Download ${postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'sitemap'} data as JSON`}
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

