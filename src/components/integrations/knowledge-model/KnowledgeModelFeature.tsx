/**
 * Knowledge Model Feature Component
 * Main component for Knowledge Model integration
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Network, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getStoredSites } from '../storage';
import type { WordPressSite } from '../types';
import { SitemapList } from './SitemapList';
import { useKnowledgeGraph } from './hooks/useKnowledgeGraph';
import { useAutoGraphProgress } from './hooks/useAutoGraphProgress';
import { AutoGraphProgressBar } from './AutoGraphProgressBar';
import type { SitemapInfo, GraphGenerationOptions } from './types';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { exportGraphToJSON } from './utils/graphExport';
import { saveGraphToKnowledgeBase } from '@/lib/knowledge-graph-auto-trigger';

export const KnowledgeModelFeature: React.FC = () => {
  const [showSitemaps, setShowSitemaps] = useState(false);
  const [selectedSitemaps, setSelectedSitemaps] = useState<Set<string>>(new Set());
  const [selectedSite, setSelectedSite] = useState<WordPressSite | null>(null);
  
  const { graph, isGenerating, generateGraph, clearGraph, updateGraph } = useKnowledgeGraph();
  const { progress: autoGraphProgress, startAutoGraph, reset: resetProgress } = useAutoGraphProgress();
const sitemaps = useMemo(() => {
    if (!showSitemaps) return [];
    
    const sites = getStoredSites();
    const allSitemaps: SitemapInfo[] = [];
    
    sites.forEach(site => {
      if (site.sitemaps?.mainSitemapUrl) {
        allSitemaps.push({
          url: site.sitemaps.mainSitemapUrl,
          type: site.sitemaps.type === 'sitemap_index' ? 'index' : 'child',
          urlCount: site.sitemaps.urls?.length || 0,
          siteId: site.id
        });
      }
      
      if (site.sitemaps?.childSitemaps) {
        site.sitemaps.childSitemaps.forEach(childUrl => {
          allSitemaps.push({
            url: childUrl,
            type: 'child',
            urlCount: 0, // Will be fetched
            siteId: site.id
          });
        });
      }
    });
    
    return allSitemaps;
  }, [showSitemaps]);

  const handleGenerateClick = useCallback(() => {
    const sites = getStoredSites();
    if (sites.length === 0) {
      toast.error('No WordPress sites connected. Please add a site first.');
      return;
    }
    setShowSitemaps(true);
    if (sites.length === 1) {
      setSelectedSite(sites[0]);
    }
  }, []);

  const handleSitemapSelection = useCallback((url: string, selected: boolean) => {
    setSelectedSitemaps(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(url);
      } else {
        next.delete(url);
      }
      return next;
    });
  }, []);

  const handleCreateGraph = useCallback(async () => {
    if (selectedSitemaps.size === 0) {
      toast.error('Please select at least one sitemap');
      return;
    }

    if (!selectedSite) {
      const sites = getStoredSites();
      const siteWithSitemap = sites.find(s => 
        selectedSitemaps.has(s.sitemaps?.mainSitemapUrl || '')
      );
      if (!siteWithSitemap) {
        toast.error('Could not determine site for selected sitemaps');
        return;
      }
      setSelectedSite(siteWithSitemap);
    }

    if (!selectedSite) return;

    try {
      const options: GraphGenerationOptions = {
        siteId: selectedSite.id,
        sitemapUrls: Array.from(selectedSitemaps),
        autoMode: false
      };

      await generateGraph(
        options,
        selectedSite.siteUrl,
        selectedSite.username,
        selectedSite.appPassword,
        [] // GSC data can be added later
      );
    } catch (error) {
      // Error already handled in hook
    }
  }, [selectedSitemaps, selectedSite, generateGraph]);

  const handleAutoGraph = useCallback(async () => {
const sites = getStoredSites();
if (sites.length === 0) {
toast.error('No WordPress sites connected');
      return;
    }

    const site = sites[0]; // Use first site for auto-graph
if (!site.sitemaps?.mainSitemapUrl) {
toast.error('No sitemaps detected for this site');
      return;
    }

    try {
resetProgress();
      const options: GraphGenerationOptions = {
        siteId: site.id,
        sitemapUrls: [],
        autoMode: true
      };
await startAutoGraph(
        options,
        site.siteUrl,
        site.username,
        site.appPassword,
        []
      );
} catch (error) {
toast.error(`Failed to start auto-graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [startAutoGraph, resetProgress]);

  // Check if auto-graph completed and load the graph
  React.useEffect(() => {
    if (autoGraphProgress?.status === 'completed' && autoGraphProgress.result) {
      // Graph is ready - update the graph state directly
      if (autoGraphProgress.result && typeof autoGraphProgress.result === 'object') {
        updateGraph(autoGraphProgress.result);
        // Automatically save to knowledge base
        saveGraphToKnowledgeBase(autoGraphProgress.result);
        resetProgress();
        toast.success('Knowledge graph generated successfully!');
      }
    } else if (autoGraphProgress?.status === 'failed') {
      toast.error(`Auto-graph failed: ${autoGraphProgress.error || 'Unknown error'}`);
      resetProgress();
    }
  }, [autoGraphProgress, updateGraph, resetProgress, saveGraphToKnowledgeBase]);

  const handleGenerateJSON = useCallback(async () => {
    if (!graph) {
      toast.error('No graph to generate JSON from');
      return;
    }

    await saveGraphToKnowledgeBase(graph);
  }, [graph]);

  if (graph) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Knowledge Graph</h3>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleGenerateJSON}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Generate JSON File
            </Button>
            <Button variant="outline" onClick={clearGraph}>
              Back to Setup
            </Button>
          </div>
        </div>
        <KnowledgeGraphView graph={graph} />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Knowledge Model</h3>
          <p className="text-sm text-muted-foreground">
            Generate an interactive knowledge graph showing keyword relationships
            across your WordPress site and GSC data.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleGenerateClick}
            disabled={isGenerating || !!autoGraphProgress}
            className="flex items-center gap-2"
          >
            <Network className="w-4 h-4" />
            Generate
          </Button>
          <Button
            onClick={(e) => {
handleAutoGraph();
            }}
            disabled={isGenerating || !!autoGraphProgress}
            variant="outline"
            className="flex items-center gap-2"
          >
            {autoGraphProgress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Auto-Graph
          </Button>
        </div>

        {autoGraphProgress && (
          <AutoGraphProgressBar progress={autoGraphProgress} />
        )}

        {showSitemaps && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Select Sitemaps</h4>
              <SitemapList
                sitemaps={sitemaps}
                selectedSitemaps={selectedSitemaps}
                onSelectionChange={handleSitemapSelection}
              />
            </div>
            <Button
              onClick={handleCreateGraph}
              disabled={isGenerating || selectedSitemaps.size === 0}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Graph...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create Knowledge Graph
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

