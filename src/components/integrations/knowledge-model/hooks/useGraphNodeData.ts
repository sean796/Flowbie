/**
 * Hook for fetching and managing graph node data
 */

import { useState, useCallback } from 'react';
import { useKnowledgeGraph } from './useKnowledgeGraph';
import type { GraphNode } from '../types';

export function useGraphNodeData() {
  const { expandNode, getAISuggestions } = useKnowledgeGraph();
  const [expandedNodes, setExpandedNodes] = useState<Map<string, GraphNode>>(new Map());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());

  const loadNodeData = useCallback(async (node: GraphNode, gscData: any[] = []) => {
    if (expandedNodes.has(node.id)) {
      return expandedNodes.get(node.id);
    }

    setLoadingNodes(prev => new Set(prev).add(node.id));

    try {
      const expanded = await expandNode(node.label, gscData);
      if (expanded) {
        const updatedNode: GraphNode = {
          ...node,
          gsc_data: expanded.gsc_data || node.gsc_data
        };
        setExpandedNodes(prev => new Map(prev).set(node.id, updatedNode));
        return updatedNode;
      }
    } catch (error) {
      console.error('Error loading node data:', error);
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
    }

    return node;
  }, [expandNode, expandedNodes]);

  const loadAISuggestionsForNode = useCallback(async (
    node: GraphNode,
    context: Record<string, any> = {}
  ) => {
    try {
      const suggestions = await getAISuggestions(node.id, node.label, context);
      return suggestions;
    } catch (error) {
      console.error('Error loading AI suggestions:', error);
      return [];
    }
  }, [getAISuggestions]);

  const isNodeLoading = useCallback((nodeId: string) => {
    return loadingNodes.has(nodeId);
  }, [loadingNodes]);

  return {
    loadNodeData,
    loadAISuggestionsForNode,
    isNodeLoading,
    expandedNodes
  };
}




