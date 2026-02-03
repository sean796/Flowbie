import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Download,
  ChevronDown,
  Tag,
  CheckCircle2,
  Sparkles,
  Search,
  FileSpreadsheet,
  Calendar as CalendarIcon,
} from "lucide-react";
import { type WordPressSite } from "../types";
import { PostCalendar } from "./PostCalendar";
import { PostPagePackGenerator } from "./PostPagePackGenerator";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";

interface SitemapSectionProps {
  site: WordPressSite;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isIndexingSitemap?: Record<string, boolean>;
  isLoadingCalendar?: Record<string, boolean>;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
}

export const SitemapSection: React.FC<SitemapSectionProps> = ({
  site,
  isScrapingSitemap,
  isGeneratingEntities = {},
  isIndexingSitemap = {},
  isLoadingCalendar = {},
  getScrapingKey,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onIndexSitemap,
  onLoadCalendarPosts,
}) => {
  const [openCalendars, setOpenCalendars] = useState<Record<string, boolean>>({});
  const [openPackGenerator, setOpenPackGenerator] = useState<Record<string, boolean>>({});

  const handleCalendarOpenChange = useCallback((sitemapUrl: string, open: boolean) => {
    setOpenCalendars(prev => ({ ...prev, [sitemapUrl]: open }));
    if (open && onLoadCalendarPosts) {
      const postMetadata = site.sitemaps?.postMetadata?.[sitemapUrl];
      if (!postMetadata || !postMetadata.posts || postMetadata.posts.length === 0) {
        onLoadCalendarPosts(sitemapUrl);
      }
    }
  }, [site.sitemaps, onLoadCalendarPosts]);

  if (!site.sitemaps) return null;

  const mainSitemapUrl = site.sitemaps.mainSitemapUrl?.replace('/wp-sitemap.xml', '/sitemap_index.xml');

  return (
    <div className="mt-4 pt-4 border-t border-green-500/20">
      <div className={`text-xs ${getCyberpunkTextClasses('muted')} mb-3`}>
        Sitemap: <span className={getCyberpunkTextClasses('secondary')}>{mainSitemapUrl}</span>
      </div>
      
      {site.sitemaps.type === 'index' && site.sitemaps.childSitemaps && (
        <div className="space-y-2">
          <div className={`text-xs font-semibold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider mb-2`}>
            Child Sitemaps
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 bg-green-500/5 border border-green-500/20 rounded p-3">
            {site.sitemaps.childSitemaps.map((url, idx) => {
              const scrapingKey = getScrapingKey(site.id, url);
              const isScraping = isScrapingSitemap[scrapingKey] || false;
              const generatingKey = `${site.id}-${url}`;
              const isGenerating = isGeneratingEntities[generatingKey] || false;
              const indexingKey = `${site.id}-${url}`;
              const isIndexing = isIndexingSitemap[indexingKey] || false;
              const sitemapName = url.split('/').pop()?.replace('-sitemap.xml', '').replace('_sitemap.xml', '').replace('-', ' ').replace('_', ' ') || 'Pack';
              const packName = sitemapName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' Pack';
              const loadingKey = `${site.id}-${url}`;
              const isLoading = isLoadingCalendar[loadingKey] || false;
              const postMetadata = site.sitemaps?.postMetadata?.[url];
              const posts = postMetadata?.posts || [];
              const futureCount = posts.filter(post => {
                if (!post.date_gmt) return false;
                try {
                  const postDate = new Date(post.date_gmt);
                  return postDate > new Date() || post.status === 'future';
                } catch {
                  return false;
                }
              }).length;
              
              return (
                <div key={idx} className="p-2 bg-green-500/5 border border-green-500/20 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs ${getCyberpunkTextClasses('secondary')} truncate flex-1 font-mono ${site.entitySitemapUrl === url ? 'font-bold' : ''}`}>
                      {url}
                    </span>
                    {/* REMOVED: Endpoint badge - only show Entity badge */}
                    {site.entitySitemapUrl === url && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-green-500/20 text-green-300 border border-green-500/30 shrink-0">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        Entity
                      </Badge>
                    )}
                    {futureCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                        {futureCount} Future
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isScraping || site.enabled === false}
                          className={`h-6 px-2 text-xs shrink-0 gap-1 ${getCyberpunkButtonClasses()} transition-all`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          {isScraping ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Scraping...</span>
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3" />
                              <span>Scrape</span>
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border border-green-500/50 text-green-300">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onScrapeChildSitemap(url);
                          }}
                          disabled={isScraping || site.enabled === false}
                          className="text-green-300 hover:bg-black hover:text-white"
                        >
                          {isScraping ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                              Scraping...
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-2" />
                              Scrape Sitemap
                            </>
                          )}
                        </DropdownMenuItem>
                        {onIndexSitemap && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onIndexSitemap(url);
                            }}
                            disabled={isIndexing || isScraping || site.enabled === false}
                            className="text-green-300 hover:bg-black hover:text-white"
                          >
                            {isIndexing ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                Indexing...
                              </>
                            ) : (
                              <>
                                <Search className="h-3 w-3 mr-2" />
                                Check & Request Indexing
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenPackGenerator(prev => ({ ...prev, [url]: true }));
                          }}
                          disabled={site.enabled === false}
                          className="text-green-300 hover:bg-black hover:text-white"
                        >
                          <FileSpreadsheet className="h-3 w-3 mr-2" />
                          Generate {packName}
                        </DropdownMenuItem>
                        {onSetEntitySitemap && (
                          <>
                            <DropdownMenuSeparator className="bg-green-500/20" />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSetEntitySitemap(url);
                              }}
                              disabled={site.enabled === false}
                              className="text-green-300 hover:bg-black hover:text-white"
                            >
                              {site.entitySitemapUrl === url ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-2 text-green-300" />
                                  Entity Sitemap (Selected)
                                </>
                              ) : (
                                <>
                                  <Tag className="h-3 w-3 mr-2" />
                                  Set as Entity Sitemap
                                </>
                              )}
                            </DropdownMenuItem>
                            {site.entitySitemapUrl === url && onEntityGeneration && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // Use site.entitySitemapUrl instead of the clicked URL
                                  // This ensures we use the entity sitemap the user has set
                                  const entitySitemapUrl = site.entitySitemapUrl || url;
                                  onEntityGeneration(entitySitemapUrl);
                                }}
                                disabled={isGenerating || site.enabled === false}
                                className="text-green-300 hover:bg-black hover:text-white"
                              >
                                {isGenerating ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    Generating Entities...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3 mr-2" />
                                    Generate Origins
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {(onLoadCalendarPosts || openCalendars[url]) && (
                          <>
                            <DropdownMenuSeparator className="bg-green-500/20" />
                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onLoadCalendarPosts) {
                                  const postMetadata = site.sitemaps?.postMetadata?.[url];
                                  if (!postMetadata || !postMetadata.posts || postMetadata.posts.length === 0) {
                                    setOpenCalendars(prev => ({ ...prev, [url]: true }));
                                    onLoadCalendarPosts(url);
                                  } else {
                                    setOpenCalendars(prev => ({ ...prev, [url]: !prev[url] }));
                                  }
                                } else {
                                  setOpenCalendars(prev => ({ ...prev, [url]: !prev[url] }));
                                }
                              }}
                              disabled={isLoading || site.enabled === false}
                              className="text-green-300 hover:bg-black hover:text-white"
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                  Loading Calendar...
                                </>
                              ) : (
                                <>
                                  <CalendarIcon className="h-3 w-3 mr-2" />
                                  View Post Schedule Calendar
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <PostPagePackGenerator
                      key={`pack-${url}`}
                      open={openPackGenerator[url] || false}
                      onOpenChange={(open) => {
                        setOpenPackGenerator(prev => ({ ...prev, [url]: open }));
                      }}
                      site={site}
                      sitemapUrl={url}
                      postType="post"
                    />
                    <Dialog
                      open={openCalendars[url] || false}
                      onOpenChange={(open) => {
                        handleCalendarOpenChange(url, open);
                      }}
                    >
                      <DialogContent 
                        className="max-w-4xl w-full bg-[#1a1a1a] border border-green-500/50 text-green-300 p-0" 
                        onClick={(e) => e.stopPropagation()}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {isLoading ? (
                          <div className="p-6 flex items-center gap-2 text-sm text-green-300 font-mono">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading posts from WordPress API...
                          </div>
                        ) : posts.length > 0 ? (
                          <div className="p-4" key={`calendar-${url}-${posts.length}`}>
                            <PostCalendar 
                              posts={posts} 
                              sitemapUrl={url}
                              onRefresh={() => onLoadCalendarPosts?.(url)}
                              isRefreshing={isLoading}
                            />
                          </div>
                        ) : (
                          <div className={`p-6 text-sm ${getCyberpunkTextClasses('muted')} font-mono text-center`}>
                            No post metadata available. Loading...
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {site.sitemaps.type === 'urlset' && site.sitemaps.urls && (
        <div className="space-y-2">
          <div className={`text-xs font-semibold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider mb-2`}>
            URLs
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 bg-green-500/5 border border-green-500/20 rounded p-3">
            {site.sitemaps.urls.slice(0, 10).map((url, idx) => (
              <div key={idx} className={`text-xs ${getCyberpunkTextClasses('secondary')} truncate font-mono`}>
                {url}
              </div>
            ))}
            {site.sitemaps.urls.length > 10 && (
              <div className={`text-xs ${getCyberpunkTextClasses('muted')}`}>
                +{site.sitemaps.urls.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

