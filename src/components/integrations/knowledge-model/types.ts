/**
 * Type definitions for Knowledge Model components
 */

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    site_id: string;
    generated_at: string;
    total_keywords?: number;
    total_clusters?: number;
    total_posts: number;
    total_edges?: number;
  };
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'keyword' | 'entity' | 'concept' | 'cluster';
  gsc_data?: {
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
  };
  wordpress_posts?: string[];
  embedding?: number[];
  ai_suggestions?: SuggestedNode[];
  keywords?: string[]; // For cluster nodes
  post_count?: number; // For cluster nodes
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'semantic' | 'cooccurrence' | 'gsc' | 'ai';
}

export interface SuggestedNode {
  keyword: string;
  reasoning: string;
  opportunity: 'high' | 'medium' | 'low';
}

export interface SitemapInfo {
  url: string;
  type: 'index' | 'child';
  urlCount: number;
  siteId: string;
}

export interface GraphGenerationOptions {
  siteId: string;
  sitemapUrls: string[];
  autoMode?: boolean;
}

