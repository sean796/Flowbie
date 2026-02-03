import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";

interface KeywordQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ClusterAnalysis {
  clusters?: Array<{
    name: string;
    description?: string;
    queries?: KeywordQuery[];
    characteristics: {
      intent: string;
      isLocal: boolean;
      avgPosition: number;
      totalClicks: number;
      totalImpressions: number;
      avgCtr: number;
    };
    recommendation: {
      priority: string;
      reasoning?: string;
      suggestedKeyword: string;
    };
  }>;
  overallRecommendation?: {
    recommendedKeyword: string;
    reasoning: string;
    alternativeOptions?: Array<{
      keyword: string;
      reason: string;
    }>;
  };
}

interface KeywordSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queries: KeywordQuery[];
  clusterAnalysis?: ClusterAnalysis;
  isAnalyzingClusters: boolean;
  selectedCluster: number | null;
  onSelectCluster: (clusterIdx: number) => void;
  onSelectKeyword: (keyword: KeywordQuery, clusterKeywords?: string[]) => void;
  onCancel: () => void;
}

export const KeywordSelectionDialog: React.FC<KeywordSelectionDialogProps> = ({
  open,
  onOpenChange,
  queries,
  clusterAnalysis,
  isAnalyzingClusters,
  selectedCluster,
  onSelectCluster,
  onSelectKeyword,
  onCancel,
}) => {
  // Safety check - ensure queries is always an array
  let safeQueries: KeywordQuery[] = [];
  try {
    safeQueries = Array.isArray(queries) ? queries : [];
    // Validate each query has required fields
    safeQueries = safeQueries.filter(q => 
      q && 
      typeof q === 'object' && 
      'query' in q && 
      typeof q.query === 'string' &&
      q.query.trim().length > 0
    );
  } catch (error) {
    console.error('[KeywordSelectionDialog] Error processing queries:', error);
    safeQueries = [];
  }
  
  // Safety check - ensure clusterAnalysis structure is valid
  let safeClusterAnalysis: ClusterAnalysis | null = null;
  try {
    if (clusterAnalysis && typeof clusterAnalysis === 'object') {
      safeClusterAnalysis = {
        clusters: Array.isArray(clusterAnalysis.clusters) ? clusterAnalysis.clusters : [],
        overallRecommendation: clusterAnalysis.overallRecommendation || null,
        insights: clusterAnalysis.insights || {}
      };
    }
  } catch (error) {
    console.error('[KeywordSelectionDialog] Error processing cluster analysis:', error);
    safeClusterAnalysis = null;
  }

  // Prevent rendering if we have no data
  if (!open) {
    return null;
  }

  try {
    return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[950px] bg-card border-border text-foreground max-h-[90vh] !grid !grid-rows-[auto_1fr_auto] !overflow-hidden p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-8 pt-8 pb-6 border-b border-border/50">
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            Select Keyword Cluster for Optimization
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {isAnalyzingClusters 
              ? 'Analyzing keyword clusters and generating AI recommendations...' 
              : 'Select a keyword cluster to optimize. The top keyword from the cluster will be used for research, and all cluster keywords will be included in the optimization plan.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-y-auto px-8 py-6 space-y-8 min-h-0 max-h-full">
          {/* AI Recommendation Section */}
          {safeClusterAnalysis && !isAnalyzingClusters && (
            <div className="space-y-6">
              {/* AI Recommendation Card */}
              {safeClusterAnalysis.overallRecommendation && (
                <div className="relative p-6 rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-sm overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                  <div className="relative flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/20 backdrop-blur-sm flex-shrink-0">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold text-foreground">AI Recommendation</h3>
                        <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold">BEST CHOICE</span>
                      </div>
                      <div className="space-y-3">
                        <div className="p-4 rounded-lg bg-background/60 border border-primary/20">
                          <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Recommended Keyword</div>
                          <div className="text-lg font-bold text-primary break-words">{safeClusterAnalysis.overallRecommendation.recommendedKeyword || 'N/A'}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-background/40 border border-border/50">
                          <div className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Reasoning</div>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {safeClusterAnalysis.overallRecommendation.reasoning || 'No reasoning provided'}
                          </p>
                        </div>
                        {safeClusterAnalysis.overallRecommendation.alternativeOptions && 
                         Array.isArray(safeClusterAnalysis.overallRecommendation.alternativeOptions) &&
                         safeClusterAnalysis.overallRecommendation.alternativeOptions.length > 0 && (
                          <div className="pt-4 border-t border-border/50">
                            <div className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">Alternative Options</div>
                            <div className="space-y-2">
                              {safeClusterAnalysis.overallRecommendation.alternativeOptions.map((alt, idx) => (
                                <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-background/40 hover:bg-background/60 transition-colors">
                                  <span className="text-primary font-medium mt-0.5">•</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-foreground">{alt.keyword}</span>
                                    <span className="text-xs text-muted-foreground ml-2">{alt.reason}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Use AI Recommendation Button */}
                        {safeClusterAnalysis.overallRecommendation.recommendedKeyword && 
                         typeof safeClusterAnalysis.overallRecommendation.recommendedKeyword === 'string' &&
                         safeClusterAnalysis.overallRecommendation.recommendedKeyword.trim().length > 0 && (
                          <div className="pt-4 border-t border-primary/30 mt-4">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Find the recommended keyword in the queries list
                                const recommendedKeyword = safeClusterAnalysis.overallRecommendation.recommendedKeyword;
                                const matchingQuery = safeQueries.find(q => 
                                  q && q.query && typeof q.query === 'string' &&
                                  q.query.toLowerCase().trim() === recommendedKeyword.toLowerCase().trim()
                                );
                                
                                if (matchingQuery) {
                                  // Get all keywords from the recommended cluster if available
                                  const recommendedCluster = safeClusterAnalysis.clusters?.find(cluster =>
                                    cluster && cluster.queries && Array.isArray(cluster.queries) &&
                                    cluster.queries.some(q => 
                                      q && q.query && typeof q.query === 'string' &&
                                      q.query.toLowerCase().trim() === recommendedKeyword.toLowerCase().trim()
                                    )
                                  );
                                  
                                  const clusterKeywords = recommendedCluster && Array.isArray(recommendedCluster.queries)
                                    ? recommendedCluster.queries
                                        .filter(q => q && q.query && typeof q.query === 'string')
                                        .map(q => String(q.query).trim())
                                        .filter(kw => kw && kw !== recommendedKeyword.trim())
                                    : [];
                                  
                                  onSelectKeyword(matchingQuery, clusterKeywords);
                                } else {
                                  // If exact match not found, create a query object from the recommendation
                                  const fallbackQuery = {
                                    query: recommendedKeyword.trim(),
                                    clicks: 0,
                                    impressions: 0,
                                    ctr: 0,
                                    position: 0
                                  };
                                  onSelectKeyword(fallbackQuery, []);
                                }
                              }}
                              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-lg"
                            >
                              <Sparkles className="h-5 w-5 mr-2" />
                              Use AI Recommendation
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Keyword Clusters - Selectable Cards */}
              {safeClusterAnalysis.clusters && safeClusterAnalysis.clusters.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">Keyword Clusters</h3>
                    <span className="text-xs text-muted-foreground">Select a cluster to optimize</span>
                  </div>
                  <div className="grid gap-4">
                    {safeClusterAnalysis.clusters.map((cluster, clusterIdx) => {
                      const isSelected = selectedCluster === clusterIdx;
                      // Safety check for cluster structure
                      const safeCluster = cluster && typeof cluster === 'object' ? cluster : {
                        name: 'Unknown Cluster',
                        description: '',
                        queries: [],
                        characteristics: { intent: 'mixed', isLocal: false, avgPosition: 0, totalClicks: 0, totalImpressions: 0, avgCtr: 0 },
                        recommendation: { priority: 'medium', reasoning: '', suggestedKeyword: '' }
                      };
                      
                      // Get top keyword from cluster (by clicks, then impressions)
                      const safeQueries = Array.isArray(safeCluster.queries) ? safeCluster.queries : [];
                      const topKeyword = safeQueries.length > 0
                        ? [...safeQueries].sort((a, b) => {
                            const aClicks = (a && typeof a === 'object' && 'clicks' in a) ? (a.clicks || 0) : 0;
                            const bClicks = (b && typeof b === 'object' && 'clicks' in b) ? (b.clicks || 0) : 0;
                            if (bClicks !== aClicks) return bClicks - aClicks;
                            const aImpressions = (a && typeof a === 'object' && 'impressions' in a) ? (a.impressions || 0) : 0;
                            const bImpressions = (b && typeof b === 'object' && 'impressions' in b) ? (b.impressions || 0) : 0;
                            return bImpressions - aImpressions;
                          })[0]
                        : null;
                      // Get all keywords from cluster for inclusion in plan
                      const clusterKeywords = safeQueries
                        .filter(q => 
                          q && 
                          typeof q === 'object' && 
                          'query' in q && 
                          q.query && 
                          typeof q.query === 'string' &&
                          q.query.trim().length > 0
                        )
                        .map(q => String(q.query || '').trim())
                        .filter(q => q && q !== (topKeyword?.query || ''));
                      
                      return (
                        <div
                          key={clusterIdx}
                          onClick={() => onSelectCluster(clusterIdx)}
                          className={`group relative p-6 rounded-xl border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary/20'
                              : 'border-border/60 bg-background/40 hover:border-primary/40 hover:bg-background/60 hover:shadow-lg'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2 mb-3">
                                <span className="text-base font-bold text-foreground">{safeCluster.name || 'Unknown Cluster'}</span>
                                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                  safeCluster.recommendation?.priority === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                  safeCluster.recommendation?.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                  'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                }`}>
                                  {safeCluster.recommendation?.priority || 'medium'} priority
                                </span>
                                {safeCluster.characteristics?.isLocal && (
                                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
                                    📍 Local
                                  </span>
                                )}
                                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border font-medium">
                                  {safeCluster.characteristics?.intent || 'mixed'}
                                </span>
                              </div>
                              {safeCluster.description && (
                                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{safeCluster.description}</p>
                              )}
                              {safeCluster.recommendation?.reasoning && (
                                <p className="text-xs text-muted-foreground mb-4 italic leading-relaxed">{safeCluster.recommendation.reasoning}</p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                                  <div className="text-xs text-muted-foreground mb-1">Queries</div>
                                  <div className="text-sm font-bold text-foreground">{safeQueries.length}</div>
                                </div>
                                <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                                  <div className="text-xs text-muted-foreground mb-1">Clicks</div>
                                  <div className="text-sm font-bold text-primary">{safeCluster.characteristics?.totalClicks || 0}</div>
                                </div>
                                <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                                  <div className="text-xs text-muted-foreground mb-1">Impressions</div>
                                  <div className="text-sm font-bold text-foreground">{safeCluster.characteristics?.totalImpressions || 0}</div>
                                </div>
                                <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                                  <div className="text-xs text-muted-foreground mb-1">Avg Position</div>
                                  <div className="text-sm font-bold text-foreground">{(safeCluster.characteristics?.avgPosition || 0) > 0 ? (safeCluster.characteristics.avgPosition || 0).toFixed(1) : 'N/A'}</div>
                                </div>
                              </div>
                              {topKeyword && topKeyword.query && (
                                <div className="pt-4 border-t border-border/50 mt-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">Top Keyword (for research):</span>
                                      <span className="text-base font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30">{String(topKeyword.query || '')}</span>
                                      <div className="flex items-center gap-2 text-xs">
                                        {(topKeyword.clicks || 0) > 0 && (
                                          <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold">
                                            {topKeyword.clicks || 0} clicks
                                          </span>
                                        )}
                                        <span className="px-2 py-1 rounded-md bg-background/60 text-foreground font-semibold">
                                          {topKeyword.impressions || 0} impressions
                                        </span>
                                        <span className="px-2 py-1 rounded-md bg-background/60 text-foreground font-semibold">
                                          Pos {((topKeyword.position || 0) > 0 ? (topKeyword.position || 0).toFixed(1) : 'N/A')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {clusterKeywords.length > 0 && (
                                    <div className="p-3 rounded-lg bg-background/60 border border-border/50">
                                      <div className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide">
                                        + {clusterKeywords.length} Additional Keywords (included in optimization plan):
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {clusterKeywords.slice(0, 10).map((kw, idx) => (
                                          <span key={idx} className="text-xs px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground font-medium border border-border/50">
                                            {kw}
                                          </span>
                                        ))}
                                        {clusterKeywords.length > 10 && (
                                          <span className="text-xs px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground font-medium border border-border/50">
                                            +{clusterKeywords.length - 10} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <div className="flex-shrink-0">
                                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                                  <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                                </div>
                              </div>
                            )}
                          </div>
                          {isSelected && topKeyword && topKeyword.query && typeof topKeyword.query === 'string' && topKeyword.query.trim().length > 0 && (
                            <div className="mt-4 pt-4 border-t border-primary/30">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Validate topKeyword before passing
                                  if (topKeyword && topKeyword.query && typeof topKeyword.query === 'string') {
                                    onSelectKeyword(topKeyword, clusterKeywords);
                                  } else {
                                    console.error('[KeywordSelectionDialog] Invalid topKeyword:', topKeyword);
                                    toast.error('Invalid keyword selected. Please try again.');
                                  }
                                }}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-lg"
                              >
                                <Sparkles className="h-5 w-5 mr-2" />
                                Optimize with This Cluster
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {isAnalyzingClusters && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
              <span className="text-sm text-muted-foreground">Analyzing keyword clusters...</span>
            </div>
          )}

          {/* All Keywords List - Fallback if no clusters (only show when not analyzing) */}
          {!isAnalyzingClusters && (!safeClusterAnalysis || safeClusterAnalysis.clusters?.length === 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">All Keywords</h3>
                <span className="text-xs text-muted-foreground">{safeQueries.length} total</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {safeQueries.slice(0, 50).map((queryItem, index) => {
                  const recommendedKeyword = safeClusterAnalysis?.overallRecommendation?.recommendedKeyword;
                  const isRecommended = recommendedKeyword && 
                                       typeof recommendedKeyword === 'string' && 
                                       queryItem.query && 
                                       typeof queryItem.query === 'string' &&
                                       recommendedKeyword.toLowerCase().trim() === queryItem.query.toLowerCase().trim();
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        // Validate queryItem before passing
                        if (queryItem && queryItem.query && typeof queryItem.query === 'string' && queryItem.query.trim().length > 0) {
                          onSelectKeyword(queryItem);
                        } else {
                          console.error('[KeywordSelectionDialog] Invalid queryItem:', queryItem);
                          toast.error('Invalid keyword selected. Please try again.');
                        }
                      }}
                      className={`group w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isRecommended 
                          ? 'border-primary bg-primary/10 hover:bg-primary/20 shadow-md shadow-primary/10' 
                          : 'border-border bg-background/50 hover:bg-background hover:border-primary/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground truncate flex items-center gap-2 mb-2">
                            {queryItem.query}
                            {isRecommended && (
                              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary font-semibold border border-primary/30">
                                AI Recommended
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            {queryItem.clicks > 0 && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10">
                                <span className="font-bold text-primary">{queryItem.clicks}</span>
                                <span className="text-muted-foreground">clicks</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background/60">
                              <span className="font-bold text-foreground">{queryItem.impressions}</span>
                              <span className="text-muted-foreground">impressions</span>
                            </div>
                            {queryItem.position > 0 && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background/60">
                                <span className="text-muted-foreground">Position:</span>
                                <span className="font-bold text-foreground">{queryItem.position.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Search className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {safeQueries.length > 50 && (
                  <div className="text-xs text-muted-foreground text-center py-3 px-4 rounded-lg bg-background/40">
                    Showing top 50 of {safeQueries.length} keywords
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t border-border px-6 py-4 mt-0">
          <Button 
            variant="outline" 
            onClick={onCancel}
            className="text-red-400 border-red-400/50 hover:bg-red-400/10 hover:border-red-400"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    );
  } catch (error) {
    console.error('[KeywordSelectionDialog] Rendering error:', error);
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>
              An error occurred while displaying the keyword selection dialog.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onCancel} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
};

