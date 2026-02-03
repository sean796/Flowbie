/**
 * Graph Node Details Panel
 * Shows detailed information about a selected node
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, TrendingUp, Eye, MousePointerClick } from 'lucide-react';
import type { GraphNode, KnowledgeGraph, SuggestedNode } from './types';
import { getConnectedNodes } from './utils/graphHelpers';
import { useKnowledgeGraph } from './hooks/useKnowledgeGraph';

interface GraphNodeDetailsProps {
  node: GraphNode;
  graph: KnowledgeGraph;
  onClose: () => void;
}

export const GraphNodeDetails: React.FC<GraphNodeDetailsProps> = ({
  node,
  graph,
  onClose
}) => {
  const [aiSuggestions, setAiSuggestions] = useState<SuggestedNode[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const { getAISuggestions } = useKnowledgeGraph();

  const connectedNodes = getConnectedNodes(node.id, graph.edges, graph.nodes);

  useEffect(() => {
    if (node.ai_suggestions) {
      setAiSuggestions(node.ai_suggestions);
    } else {
      loadAISuggestions();
    }
  }, [node.id]);

  const loadAISuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const suggestions = await getAISuggestions(node.id, node.label, graph, {});
      setAiSuggestions(suggestions || []);
    } catch (error: any) {
      console.error('Error loading AI suggestions:', error);
      setAiSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  return (
    <Card className="p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold">Node Details</h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <h5 className="text-sm font-medium mb-2">{node.label}</h5>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{node.type}</Badge>
            {node.post_count && (
              <Badge variant="secondary">{node.post_count} posts</Badge>
            )}
          </div>
        </div>

        {node.keywords && node.keywords.length > 0 && (
          <div>
            <h6 className="text-xs font-medium mb-2 text-muted-foreground">
              Cluster Keywords ({node.keywords.length})
            </h6>
            <div className="flex flex-wrap gap-1">
              {node.keywords.map((keyword, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {node.gsc_data && (
          <GSCMetricsSection gscData={node.gsc_data} />
        )}

        {connectedNodes.length > 0 && (
          <RelatedKeywordsSection nodes={connectedNodes} />
        )}

        <AISuggestionsSection
          suggestions={aiSuggestions}
          loading={loadingSuggestions}
          onRefresh={loadAISuggestions}
        />

        {node.wordpress_posts && node.wordpress_posts.length > 0 && (
          <WordPressPostsSection postIds={node.wordpress_posts} />
        )}
      </div>
    </Card>
  );
};

interface GSCMetricsSectionProps {
  gscData: GraphNode['gsc_data'];
}

const GSCMetricsSection: React.FC<GSCMetricsSectionProps> = ({ gscData }) => {
  if (!gscData) return null;

  return (
    <div>
      <h6 className="text-xs font-medium mb-2 text-muted-foreground">GSC Performance</h6>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-muted-foreground" />
          <span>{gscData.clicks} clicks</span>
        </div>
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span>{gscData.impressions} impressions</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span>Position: {gscData.position.toFixed(1)}</span>
        </div>
        <div>
          <span>CTR: {(gscData.ctr * 100).toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
};

interface RelatedKeywordsSectionProps {
  nodes: GraphNode[];
}

const RelatedKeywordsSection: React.FC<RelatedKeywordsSectionProps> = ({ nodes }) => {
  return (
    <div>
      <h6 className="text-xs font-medium mb-2 text-muted-foreground">
        Related Keywords ({nodes.length})
      </h6>
      <div className="flex flex-wrap gap-1">
        {nodes.slice(0, 10).map(n => (
          <Badge key={n.id} variant="secondary" className="text-xs">
            {n.label}
          </Badge>
        ))}
      </div>
    </div>
  );
};

interface AISuggestionsSectionProps {
  suggestions: SuggestedNode[];
  loading: boolean;
  onRefresh: () => void;
}

const AISuggestionsSection: React.FC<AISuggestionsSectionProps> = ({
  suggestions,
  loading,
  onRefresh
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h6 className="text-xs font-medium text-muted-foreground">AI Suggestions</h6>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading suggestions...</p>
      ) : suggestions.length > 0 ? (
        <div className="space-y-2">
          {suggestions.map((suggestion, idx) => (
            <div key={idx} className="text-xs p-2 bg-accent rounded">
              <div className="font-medium">{suggestion.keyword}</div>
              <div className="text-muted-foreground mt-1">{suggestion.reasoning}</div>
              <Badge variant="outline" className="mt-1 text-xs">
                {suggestion.opportunity}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>No suggestions available</p>
          <p className="text-muted-foreground/70 text-[10px]">
            Click Refresh to generate AI suggestions
          </p>
        </div>
      )}
    </div>
  );
};

interface WordPressPostsSectionProps {
  postIds: string[];
}

const WordPressPostsSection: React.FC<WordPressPostsSectionProps> = ({ postIds }) => {
  return (
    <div>
      <h6 className="text-xs font-medium mb-2 text-muted-foreground">
        WordPress Posts ({postIds.length})
      </h6>
      <div className="text-xs text-muted-foreground">
        {postIds.slice(0, 5).map(id => (
          <div key={id}>Post ID: {id}</div>
        ))}
        {postIds.length > 5 && <div>...and {postIds.length - 5} more</div>}
      </div>
    </div>
  );
};

