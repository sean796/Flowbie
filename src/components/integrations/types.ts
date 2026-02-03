export const WORDPRESS_SITES_STORAGE_KEY = 'wordpress_sites';
export const KB_FILES_STORAGE_KEY = 'kb_files';

export interface WordPressSite {
  id: string;
  name: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  connectedAt: number;
  lastTested?: number;
  connectionStatus?: 'testing' | 'success' | 'failed';
  enabled?: boolean;
  sitemaps?: {
    mainSitemapUrl: string;
    detectedAt: number;
    type: 'index' | 'urlset';
    childSitemaps?: string[];
    urls?: string[];
    endpoints?: Record<string, string>; // Map of sitemap URL -> endpoint (e.g., "service-areas-sitemap.xml" -> "service-areas")
    postMetadata?: Record<string, {
      posts: Array<{
        id: number;
        slug: string;
        title: string;
        date_gmt: string;
        status: string;
        link: string;
      }>;
      futureCount: number;
      lastChecked: number;
    }>;
  };
  scheduledPosts?: {
    count: number;
    month: number;
    year: number;
    fetchedAt: number;
  };
  entitySitemapUrl?: string;
  manualEndpoint?: string; // Manually declared endpoint (authoritative, no mutation)
  locations?: Location[];
  napInfo?: NAPInfo;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email?: string;
  isDefault: boolean;
}

export interface NAPInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  locations?: Location[];
}

export interface StoredFile {
  name: string;
  size: number;
  content: string;
  starred: boolean;
  timestamp: number;
}

// GSC Performance Report Types
export interface GSCPerformanceStats {
  currentPeriod: PeriodStats;
  comparisonPeriod: PeriodStats;
  comparisons: ComparisonMetrics;
  topKeywords: KeywordPerformance[];
}

export interface PeriodStats {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  pagesCount: number;
  searchTermsCount: number;
}

export interface ComparisonMetrics {
  clicksChange: number;
  clicksChangePercent: number;
  impressionsChange: number;
  impressionsChangePercent: number;
  ctrChange: number;
  ctrChangePercent: number;
  avgPositionChange: number;
  avgPositionChangePercent: number;
  pagesChange: number;
  pagesChangePercent: number;
  searchTermsChange: number;
  searchTermsChangePercent: number;
}

export interface KeywordPerformance {
  query: string;
  currentRanking: number;
  previousRanking: number;
  rankingChange: number;
  currentClicks: number;
  previousClicks: number;
  clicksChange: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsChange: number;
  url?: string;
}

// WordPress Post Update Types
export interface WordPressPostUpdateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
}

// GSC Page Performance Types
export interface GSCPageQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPagePerformanceResult {
  success: boolean;
  pageUrl: string;
  matchedUrl?: string | null;
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

// Content Optimization Types
export interface ContentOptimizationProgress {
  step: string;
  progress: number;
  message?: string;
}

export interface ContentOptimizationResult {
  success: boolean;
  postId?: number;
  link?: string;
  title?: string;
  status?: string;
  primaryKeyword?: string;
  optimizedTitle?: string;
  error?: string;
}

// GSC Report AI Analysis Types (simplified - AI handles everything)
export interface AIReportAnalysis {
  executiveSummary: {
    bullets: string[];
    aiInsight: string;
  };
  newTermsTable: string;
  newTermsInsight: string;
  topPerformersTable: string;
  topPerformersInsight: string;
  localSEOTable: string;
  localSEOInsight: string;
  trafficTable: string;
  trafficInsight: string;
  growthOpportunities: string[];
  lookingAheadInsight: string;
}

// Legacy types kept for compatibility but simplified
export interface NewTermsAnalysis {
  newTerms: NewTermWithAnalysis[];
  categories: Record<string, string[]>;
  localTerms: string[];
  aiInsights: string;
  totalNewTerms: number;
  topOpportunities: NewTermWithAnalysis[];
}

export interface NewTermWithAnalysis {
  term: string;
  category: string;
  categoryEmoji: string;
  intent: 'informational' | 'transactional' | 'navigational' | 'local';
  intentEmoji: string;
  opportunityScore: number;
  opportunityEmoji: string;
  impressions?: number;
  clicks?: number;
  position?: number;
}

export interface LocalSEOInsights {
  locationTerms: LocationTerm[];
  serviceAreaExpansion: string[];
  localIntentBreakdown: {
    commercial: number;
    informational: number;
    navigational: number;
  };
  napSignals: string[];
  aiLocalInsights: string;
}

export interface LocationTerm {
  term: string;
  locationType: 'city' | 'region' | 'neighborhood' | 'state' | 'general';
  emoji: string;
  impressions?: number;
  position?: number;
}

export interface EnhancedMetrics {
  metric: string;
  currentValue: string;
  previousValue: string;
  change: string;
  changePercent: string;
  emoji: string;
  isPositive: boolean;
  aiInsight?: string;
}

export interface GSCReportSection {
  title: string;
  emoji: string;
  bullets: string[];
  table?: string;
  aiAnalysis?: string;
}