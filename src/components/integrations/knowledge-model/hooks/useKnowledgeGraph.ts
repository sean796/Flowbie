/**
 * Hook for managing knowledge graph state and operations
 */

import { useState, useCallback } from 'react';
import type { KnowledgeGraph, GraphGenerationOptions } from '../types';
import { toast } from 'sonner';
import { loadApiKey } from '@/lib/api';
import { exportGraphToJSON } from '../utils/graphExport';

const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

export function useKnowledgeGraph() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expose setGraph for external updates (e.g., from progress completion)
  const updateGraph = useCallback((newGraph: KnowledgeGraph) => {
    setGraph(newGraph);
  }, []);

  const generateGraph = useCallback(async (
    options: GraphGenerationOptions,
    siteUrl: string,
    username: string,
    appPassword: string,
    gscData: any[] = []
  ) => {
    setIsGenerating(true);
    setError(null);

    try {
      const endpoint = options.autoMode 
        ? '/api/knowledge-model/auto-graph'
        : '/api/knowledge-model/generate-graph';

      const response = await fetch(`${BACKEND_API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: options.siteId,
          sitemapUrls: options.sitemapUrls,
          siteUrl,
          username,
          appPassword,
          gscData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate graph');
      }

      const data = await response.json();
      if (data.success && data.graph) {
        setGraph(data.graph);
        toast.success('Knowledge graph generated successfully');
        return data.graph;
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(`Failed to generate graph: ${errorMessage}`);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const expandNode = useCallback(async (keyword: string, gscData: any[] = []) => {
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/knowledge-model/expand-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, gscData })
      });

      if (!response.ok) {
        throw new Error('Failed to expand node');
      }

      const data = await response.json();
      return data.node;
    } catch (err) {
      console.error('Error expanding node:', err);
      return null;
    }
  }, []);

  const getAISuggestions = useCallback(async (
    nodeId: string,
    keyword: string,
    graph: KnowledgeGraph,
    context: Record<string, any> = {}
  ) => {
    try {
      const apiKey = loadApiKey();
      if (!apiKey) {
        console.warn('OpenRouter API key not set in Settings');
        return [];
      }

      // Generate clean JSON structure from graph
      const graphJSON = exportGraphToJSON(graph);
      const jsonString = JSON.stringify(graphJSON, null, 2);

      // Get connected keywords for context
      const currentNode = graphJSON.keywords.find(k => k.keyword === keyword);
      const connectedKeywords = currentNode?.connections || [];

      const prompt = `Analyze this knowledge graph JSON structure and suggest 5-10 keywords that would strengthen connections around "${keyword}".

Graph Structure (JSON):
${jsonString}

Focus on keywords that:
- Bridge connections between existing keyword clusters
- Are semantically related to "${keyword}"
- Fill gaps in the graph structure

Return a JSON array with: keyword, reasoning, opportunity (high/medium/low)`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp',
          messages: [
            { role: 'system', content: 'You are an SEO expert helping build a knowledge graph for content strategy. Always return valid JSON arrays.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 1500,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', errorText);
        return [];
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.warn('No content in AI response');
        return [];
      }

      // Parse JSON response
      try {
        const jsonData = JSON.parse(content);
        let suggestions = [];
        
        if (Array.isArray(jsonData)) {
          suggestions = jsonData;
        } else if (jsonData.suggestions && Array.isArray(jsonData.suggestions)) {
          suggestions = jsonData.suggestions;
        } else {
          console.warn('AI response is not a direct array or does not contain a "suggestions" array:', jsonData);
          return [];
        }

        // Validate suggestions structure
        const validSuggestions = suggestions
          .filter((s: any) => 
            typeof s.keyword === 'string' && 
            typeof s.reasoning === 'string' && 
            ['high', 'medium', 'low'].includes(s.opportunity)
          )
          .slice(0, 10);
        return validSuggestions;

      } catch (e) {
        console.error('Error parsing AI suggestions JSON:', e, 'Raw content:', content);
        return [];
      }

    } catch (err: any) {
      console.error('Error getting AI suggestions:', err);
      return [];
    }
  }, []);

  const clearGraph = useCallback(() => {
    setGraph(null);
    setError(null);
  }, []);

  return {
    graph,
    isGenerating,
    error,
    generateGraph,
    expandNode,
    getAISuggestions,
    clearGraph,
    updateGraph
  };
}

