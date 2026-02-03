/**
 * Keyword Card Component
 * Displays a keyword as an interactive tile card with SEO metrics and connections
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, TrendingUp, MousePointerClick, Eye } from 'lucide-react';
import type { GraphNode } from './types';

interface KeywordCardProps {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
  connectionCount?: number;
  relatedKeywords?: string[];
  avgConnectionStrength?: number;
}

export const KeywordCard: React.FC<KeywordCardProps> = ({
  node,
  isSelected,
  onClick,
  connectionCount = 0,
  relatedKeywords = [],
  avgConnectionStrength = 0
}) => {
  const postCount = node.wordpress_posts?.length || 0;
  const gsc = node.gsc_data;
  
  // Calculate SEO opportunity score (higher is better)
  const opportunityScore = gsc ? (() => {
    let score = 0;
    // High impressions but low clicks = opportunity
    if (gsc.impressions > 100 && gsc.clicks < 10) score += 30;
    // High position (>10) with good impressions = easy win
    if (gsc.position > 10 && gsc.position < 50 && gsc.impressions > 50) score += 25;
    // Low CTR with high impressions = optimization opportunity
    if (gsc.ctr < 0.02 && gsc.impressions > 100) score += 20;
    // Already ranking (position < 20) = maintain opportunity
    if (gsc.position > 0 && gsc.position < 20) score += 15;
    // High clicks = valuable keyword
    if (gsc.clicks > 50) score += 10;
    return Math.min(100, score);
  })() : 0;

  return (
    <Card
      className={`
        p-4 cursor-pointer transition-all
        hover:border-primary hover:shadow-md
        ${isSelected ? 'border-primary border-2 shadow-lg bg-primary/5' : 'border-border'}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-lg font-semibold text-foreground line-clamp-2 flex-1">
          {node.label}
        </h4>
        <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
          {gsc && gsc.clicks > 0 && (
            <Badge variant="secondary" className="text-xs">
              <MousePointerClick className="w-3 h-3 mr-1" />
              {gsc.clicks}
            </Badge>
          )}
          {connectionCount > 0 && (
            <Badge variant="outline" className="text-xs">
              <Link2 className="w-3 h-3 mr-1" />
              {connectionCount}
            </Badge>
          )}
        </div>
      </div>
      
      {/* SEO Metrics */}
      {gsc && (
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Eye className="w-3 h-3" />
              <span>{gsc.impressions.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              <span>Pos {gsc.position > 0 ? gsc.position.toFixed(1) : 'N/A'}</span>
            </div>
          </div>
          {gsc.ctr > 0 && (
            <div className="text-xs text-muted-foreground">
              CTR: {(gsc.ctr * 100).toFixed(2)}%
            </div>
          )}
          {opportunityScore > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${opportunityScore}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">Opp: {opportunityScore}%</span>
            </div>
          )}
        </div>
      )}
      
      {/* Connection Info */}
      {connectionCount > 0 && (
        <div className="mb-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 mb-1">
            <Link2 className="w-3 h-3" />
            <span>{connectionCount} {connectionCount === 1 ? 'connection' : 'connections'}</span>
            {avgConnectionStrength > 0 && (
              <span className="ml-1">(strength: {(avgConnectionStrength * 100).toFixed(0)}%)</span>
            )}
          </div>
          {relatedKeywords.length > 0 && (
            <div className="text-xs text-muted-foreground/80 line-clamp-1">
              Related: {relatedKeywords.slice(0, 3).join(', ')}
              {relatedKeywords.length > 3 && ` +${relatedKeywords.length - 3} more`}
            </div>
          )}
        </div>
      )}
      
      {/* Content Info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
        <span>{postCount} {postCount === 1 ? 'post' : 'posts'}</span>
      </div>
    </Card>
  );
};

