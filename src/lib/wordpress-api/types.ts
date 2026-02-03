/**
 * WordPress API TypeScript Interfaces and Types
 * All type definitions for WordPress API operations
 */

export interface WordPressConnectionResult {
  success: boolean;
  message: string;
  siteInfo?: {
    name: string;
    description: string;
    url: string;
  };
}

export interface SitemapDetectionResult {
  found: boolean;
  sitemapUrl?: string;
  type?: 'index' | 'urlset';
  content?: string;
  message?: string;
}

export interface SitemapParseResult {
  type: 'index' | 'urlset';
  urls: string[];
  childSitemaps?: string[];
  error?: string;
}

export interface ScheduledPostsResult {
  count: number;
  posts?: Array<{
    id: number;
    slug: string;
    date_gmt: string;
    title: string;
  }>;
  month?: number;
  year?: number;
  allScheduled?: boolean;
  error?: string;
  debug?: {
    totalScheduledPosts: number;
    targetMonth?: number;
    targetYear?: number;
  };
}

export interface PublishedPostsResult {
  count: number;
  posts?: Array<{
    id: number;
    slug: string;
    date_gmt: string;
    title: string;
    excerpt: string;
    link: string;
  }>;
  total?: number;
  error?: string;
}

export interface WordPressPostContent {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date_gmt: string;
  status: string;
  link: string;
  categories: number[];
  tags: number[];
  // Store the actual WordPress REST API endpoint used when fetching this post
  // This is reliable, unlike sitemap subtypes which can be inconsistent
  postTypeEndpoint?: string; // e.g., 'posts', 'pages', 'service-area'
  postTypeSubtype?: string; // Original subtype from resolution (for reference)
  // Complete WordPress API response with all fields (featured_media, ACF, meta, author, etc.)
  fullData?: any;
}

export interface PostContentResult {
  count: number;
  posts?: WordPressPostContent[];
  errors?: Array<{ id?: number; slug?: string; error: string }>;
  error?: string;
}

export interface ResolvedUrl {
  url: string;
  id: number;
  subtype: string;
  link: string;
}

export interface UnresolvableUrl {
  url: string;
  reason: string;
}

export interface ResolveUrlsResult {
  resolved: ResolvedUrl[];
  unresolvable: UnresolvableUrl[];
  summary: {
    total: number;
    resolved: number;
    unresolvable: number;
    typeCounts: Record<string, number>;
  };
  error?: string;
}

export interface WordPressPostCreateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
}

export interface WordPressPostUpdateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
}

export interface WordPressPostDeleteResult {
  success: boolean;
  postId?: number;
  deleted?: boolean;
  previous?: {
    link?: string;
    status?: string;
    title?: string;
  };
  error?: string;
}

export interface WordPressMediaUploadResult {
  success: boolean;
  mediaId?: number;
  url?: string;
  link?: string;
  title?: string;
  error?: string;
}

export interface GenerateEntitiesResult {
  entities: string[];
  error?: string;
}

export interface CheckFuturePostsResult {
  success: boolean;
  futureCount: number;
  posts?: Array<{
    id: number;
    slug: string;
    title: string;
    date_gmt: string;
    status: string;
    link: string;
  }>;
  error?: string;
}

export interface WordPressPostMetaResult {
  success: boolean;
  postId?: number;
  meta?: Record<string, any>;
  error?: string;
}

export interface WordPressPostMetaUpdateResult {
  success: boolean;
  postId?: number;
  updated?: boolean;
  error?: string;
}

export interface GSCPageQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SitemapIndexingResult {
  success: boolean;
  processed: number;
  indexed: number;
  requested: number;
  errors: number;
  total: number;
  results: Array<{
    url: string;
    status: 'indexed' | 'requested' | 'error';
    indexingStatus?: string;
    error?: string;
  }>;
  property?: string;
  error?: string;
}

export interface IndexingProgress {
  processed: number;
  total: number;
  indexed: number;
  requested: number;
  errors: number;
  currentUrl?: string;
}

export interface GSCPagePerformanceResult {
  success: boolean;
  pageUrl: string;
  matchedUrl?: string | null;
  pageExists?: boolean;
  pageStats?: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  queries: GSCPageQuery[];
  topKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  } | null;
  totalQueries: number;
  property?: string;
  error?: string;
}

