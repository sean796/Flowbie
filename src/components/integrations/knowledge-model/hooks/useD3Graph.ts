/**
 * D3.js graph visualization hook
 * Handles force-directed graph rendering and interactions
 */

import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { KnowledgeGraph, GraphNode, GraphEdge } from '../types';

// Extend GraphNode for D3 simulation
interface D3Node extends GraphNode, d3.SimulationNodeDatum {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

// Extend GraphEdge for D3 simulation
interface D3Edge extends GraphEdge, d3.SimulationLinkDatum<D3Node> {
  source: D3Node | string;
  target: D3Node | string;
}

interface UseD3GraphOptions {
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
}

export function useD3Graph(
  graph: KnowledgeGraph | null,
  options: UseD3GraphOptions
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, null, undefined> | null>(null);

  const { width, height, onNodeClick, onNodeHover } = options;

  const renderGraph = useCallback(() => {
    if (!graph || !svgRef.current) return;
const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Convert nodes and edges to D3 format
    const d3Nodes: D3Node[] = graph.nodes.map(n => ({ ...n }));
    const d3Edges: D3Edge[] = graph.edges.map(e => ({ ...e }));

    // Create or reuse tooltip div
    let tooltip = tooltipRef.current;
    if (!tooltip) {
      // Remove existing tooltips
      d3.selectAll('.graph-tooltip').remove();
      tooltip = d3.select('body').append('div')
        .attr('class', 'graph-tooltip')
        .style('position', 'absolute')
        .style('padding', '8px 12px')
        .style('background', 'rgba(0, 0, 0, 0.85)')
        .style('color', 'white')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('z-index', 1000)
        .style('max-width', '250px');
      tooltipRef.current = tooltip;
    }

    // Create force simulation
    const simulation = d3.forceSimulation<D3Node>(d3Nodes)
      .force('link', d3.forceLink<D3Node, D3Edge>(d3Edges)
        .id((d) => d.id)
        .distance((d) => 100 - (d.weight || 0) * 50))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))
      .alphaDecay(0.1) // Fast decay - stabilize quickly
      .velocityDecay(0.8); // High friction - stop quickly

    simulationRef.current = simulation;
    
    // Track selected node only (don't track hover - causes instability)
    let selectedNodeId: string | null = null;
    
    // Create edges
    const link = g.append('g')
      .selectAll<SVGLineElement, D3Edge>('line')
      .data(d3Edges)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', (d) => Math.sqrt(d.weight || 0) * 2);

    // Create node groups (circle + label together)
    const nodeGroup = g.append('g')
      .selectAll<SVGGElement, D3Node>('g')
      .data(d3Nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer');

    // Calculate base radius for each node
    const getBaseRadius = (d: D3Node) => {
      const gsc = d.gsc_data;
      if (gsc && gsc.clicks > 0) {
        return 8 + Math.min(gsc.clicks / 10, 5);
      }
      return 8; // Increased default size for better clickability
    };
    
    // Create nodes
    const node = nodeGroup
      .append('circle')
      .attr('r', getBaseRadius)
      .attr('fill', (d) => {
        if (d.gsc_data && d.gsc_data.clicks > 0) {
          return '#10b981'; // Green for GSC data
        }
        return '#6b7280'; // Gray for no GSC data
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('class', 'node-circle')
      .style('pointer-events', 'all')
      .on('click', function(event, d) {
event.stopPropagation();
        event.preventDefault();
        
        // Stop simulation if still running
        if (simulation.alpha() > 0) {
          simulation.alphaTarget(0).restart();
          simulation.tick();
          simulation.stop();
        }
        
        // Fix clicked node position
        selectedNodeId = d.id;
        if (d.x !== undefined && d.y !== undefined) {
          d.fx = d.x;
          d.fy = d.y;
        }
        
        // Reset all nodes to default stroke
        node.attr('stroke', '#fff').attr('stroke-width', 2);
        // Highlight clicked node
        d3.select(this).attr('stroke', '#3b82f6').attr('stroke-width', 3);
        onNodeClick?.(d);
      })
      .on('mouseover', function(event, d) {
// SIMPLE hover - just visual, no position fixing
        const circle = d3.select(this);
        const currentStroke = circle.attr('stroke');
        // Only highlight if not already selected
        if (currentStroke !== '#3b82f6' || circle.attr('stroke-width') !== '3') {
          circle.attr('stroke', '#3b82f6').attr('stroke-width', 3);
        }
        onNodeHover?.(d);
        
        // Show tooltip
        const postCount = d.wordpress_posts?.length || 0;
        tooltip
          .html(`<strong>${d.label}</strong><br/>Posts: ${postCount}`)
          .style('opacity', 1)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        // SIMPLE mouseout - just visual reset
        const circle = d3.select(this);
        const currentStroke = circle.attr('stroke');
        // Only reset if not selected
        if (d.id !== selectedNodeId) {
          circle.attr('stroke', '#fff').attr('stroke-width', 2);
        }
        onNodeHover?.(null);
        tooltip.style('opacity', 0);
      });
    
    // Disable drag - causes too many issues with hover/click
    // Users can use zoom/pan instead

    // Add label backgrounds for better visibility (insert before text)
    const labelBgs = nodeGroup
      .insert('rect', 'circle')
      .attr('x', 11) // Offset from node center
      .attr('y', -8)
      .attr('width', (d) => Math.max(d.label.length * 6.5, 40))
      .attr('height', 16)
      .attr('fill', 'rgba(255, 255, 255, 0.95)')
      .attr('stroke', 'rgba(0, 0, 0, 0.1)')
      .attr('stroke-width', 1)
      .attr('rx', 3)
      .style('pointer-events', 'none');

    // Add labels with background for visibility
    const labels = nodeGroup
      .append('text')
      .text((d) => d.label)
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('x', 15)
      .attr('y', 4)
      .attr('fill', '#1f2937')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => {
          const source = typeof d.source === 'object' ? d.source : d3Nodes.find(n => n.id === d.source);
          return source?.x || 0;
        })
        .attr('y1', (d) => {
          const source = typeof d.source === 'object' ? d.source : d3Nodes.find(n => n.id === d.source);
          return source?.y || 0;
        })
        .attr('x2', (d) => {
          const target = typeof d.target === 'object' ? d.target : d3Nodes.find(n => n.id === d.target);
          return target?.x || 0;
        })
        .attr('y2', (d) => {
          const target = typeof d.target === 'object' ? d.target : d3Nodes.find(n => n.id === d.target);
          return target?.y || 0;
        });

      nodeGroup
        .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
    });
    
    // Stop simulation after it cools down - this prevents constant movement
    simulation.on('end', () => {
      // Simulation stopped - graph is stable
      simulation.stop();
    });
    
    // Stop simulation quickly after initial layout
    setTimeout(() => {
      if (simulation.alpha() > 0) {
        simulation.alphaTarget(0);
        setTimeout(() => {
          simulation.stop();
        }, 500);
      }
    }, 2000);

    // Zoom behavior - only on wheel, not on node interactions
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      })
      .filter((event) => {
        // Only allow zoom on wheel or middle mouse button
        // Don't zoom when clicking/dragging nodes
        const target = event.target as Element;
        if (target && (target.classList.contains('node-circle') || target.closest('.node-group'))) {
          return false;
        }
        return event.type === 'wheel' || (event.type === 'mousedown' && event.button === 1);
      });

    svg.call(zoom);
    
    // Prevent zoom on node groups
    nodeGroup.on('mousedown.zoom', null);

  }, [graph, width, height, onNodeClick, onNodeHover]);

  useEffect(() => {
    renderGraph();
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
      // Cleanup tooltip on unmount
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [renderGraph]);

  return svgRef;
}

