/**
 * Knowledge Graph Visualization Component
 * Tile/card-based layout with connection information
 */

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { KeywordCard } from './KeywordCard';
import { GraphNodeDetails } from './GraphNodeDetails';
import { getNodeDegree, getConnectedNodes } from './utils/graphHelpers';
import type { KnowledgeGraph, GraphNode } from './types';

interface KnowledgeGraphViewProps {
  graph: KnowledgeGraph;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ graph }) => {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Pre-compute connection data for each node
  const nodeConnectionData = useMemo(() => {
    const data = new Map<string, {
      connectionCount: number;
      relatedKeywords: string[];
      avgConnectionStrength: number;
      connectedNodeIds: Set<string>;
    }>();

    graph.nodes.forEach(node => {
      const connectedNodes = getConnectedNodes(node.id, graph.edges, graph.nodes);
      const connectionCount = getNodeDegree(node.id, graph.edges);
      
      // Calculate average connection strength
      const nodeEdges = graph.edges.filter(
        e => e.source === node.id || e.target === node.id
      );
      const avgStrength = nodeEdges.length > 0
        ? nodeEdges.reduce((sum, e) => sum + e.weight, 0) / nodeEdges.length
        : 0;

      data.set(node.id, {
        connectionCount,
        relatedKeywords: connectedNodes.map(n => n.label).slice(0, 5),
        avgConnectionStrength: avgStrength,
        connectedNodeIds: new Set(connectedNodes.map(n => n.id))
      });
    });

    return data;
  }, [graph.nodes, graph.edges]);
  
  // Get connected node IDs for hovered/selected node
  const highlightedNodeIds = useMemo(() => {
    if (hoveredNode) {
      return nodeConnectionData.get(hoveredNode.id)?.connectedNodeIds || new Set();
    }
    if (selectedNode) {
      return nodeConnectionData.get(selectedNode.id)?.connectedNodeIds || new Set();
    }
    return new Set<string>();
  }, [hoveredNode, selectedNode, nodeConnectionData]);

  const handleCardClick = (node: GraphNode) => {
setSelectedNode(node);
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Knowledge Graph</h4>
            <p className="text-xs text-muted-foreground">
              {graph.nodes.length} keywords, {graph.edges.length} connections
              {selectedNode && ` | Selected: ${selectedNode.label}`}
            </p>
          </div>
          {selectedNode && (
            <button
              onClick={() => setSelectedNode(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear selection
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {graph.nodes.map((node) => {
            const connectionData = nodeConnectionData.get(node.id) || {
              connectionCount: 0,
              relatedKeywords: [],
              avgConnectionStrength: 0,
              connectedNodeIds: new Set<string>()
            };
            
            const isConnected = highlightedNodeIds.has(node.id);
            const isSelected = selectedNode?.id === node.id;

            return (
              <div
                key={node.id}
                className={`transition-all ${
                  isConnected && !isSelected ? 'ring-2 ring-primary/30 ring-offset-2' : ''
                }`}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <KeywordCard
                  node={node}
                  isSelected={isSelected}
                  onClick={() => handleCardClick(node)}
                  connectionCount={connectionData.connectionCount}
                  relatedKeywords={connectionData.relatedKeywords}
                  avgConnectionStrength={connectionData.avgConnectionStrength}
                />
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="w-80">
        {selectedNode ? (
          <GraphNodeDetails
            node={selectedNode}
            graph={graph}
            onClose={() => setSelectedNode(null)}
          />
        ) : (
          <Card className="p-4 h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium mb-2">No keyword selected</p>
              <p className="text-xs">Click on any keyword card to view details</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

