/**
 * Graph utility functions
 */

import type { GraphNode, GraphEdge, KnowledgeGraph } from '../types';

/**
 * Filter graph nodes by type
 */
export function filterNodesByType(nodes: GraphNode[], type: GraphNode['type']): GraphNode[] {
  return nodes.filter(node => node.type === type);
}

/**
 * Filter graph nodes by GSC performance
 */
export function filterNodesByGSC(nodes: GraphNode[], minClicks: number = 0): GraphNode[] {
  return nodes.filter(node => {
    if (!node.gsc_data) return false;
    return node.gsc_data.clicks >= minClicks;
  });
}

/**
 * Get node by ID
 */
export function getNodeById(nodes: GraphNode[], nodeId: string): GraphNode | undefined {
  return nodes.find(node => node.id === nodeId);
}

/**
 * Get connected nodes for a given node
 */
export function getConnectedNodes(
  nodeId: string,
  edges: GraphEdge[],
  nodes: GraphNode[]
): GraphNode[] {
  const connectedIds = new Set<string>();
  
  edges.forEach(edge => {
    if (edge.source === nodeId) {
      connectedIds.add(edge.target);
    } else if (edge.target === nodeId) {
      connectedIds.add(edge.source);
    }
  });
  
  return nodes.filter(node => connectedIds.has(node.id));
}

/**
 * Calculate node degree (number of connections)
 */
export function getNodeDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges.filter(
    edge => edge.source === nodeId || edge.target === nodeId
  ).length;
}

/**
 * Sort nodes by GSC performance
 */
export function sortNodesByGSC(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => {
    const aClicks = a.gsc_data?.clicks || 0;
    const bClicks = b.gsc_data?.clicks || 0;
    return bClicks - aClicks;
  });
}

/**
 * Validate graph structure
 */
export function validateGraph(graph: KnowledgeGraph): boolean {
  if (!graph.nodes || !graph.edges) {
    return false;
  }
  
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  
  // Check all edges reference valid nodes
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return false;
    }
  }
  
  return true;
}




