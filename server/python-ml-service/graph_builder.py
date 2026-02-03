"""
Knowledge graph construction from keyword-based nodes
"""

from typing import List, Dict, Any, Optional
from utils.data_structures import GraphNode, GraphEdge, KnowledgeGraph
from keyword_extractor import extract_keywords_from_posts
from collections import Counter, defaultdict
from datetime import datetime

# Try to import numpy - make it optional
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None


class GraphBuilder:
    """Builds knowledge graph from processed data"""
    
    def __init__(self, similarity_threshold: float = 0.3, max_edges_per_node: int = 20):
        self.similarity_threshold = similarity_threshold
        self.max_edges_per_node = max_edges_per_node
    
    async def build_graph(
        self,
        embeddings: Dict[str, Any],
        content: List[Dict[str, Any]],
        gsc_data: List[Dict[str, Any]],
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build knowledge graph from keyword nodes extracted from anchor text"""
        # Extract keywords from posts (focus on anchor text)
        keyword_nodes_data = extract_keywords_from_posts(content, min_frequency=2)
        
        if not keyword_nodes_data:
            # Fallback: create nodes from most common words
            return self._create_fallback_graph(content, options)
        
        # Convert to GraphNode objects
        nodes = self._create_keyword_nodes(keyword_nodes_data)
        
        # Create edges based on co-occurrence (keywords in same posts)
        edges = self._create_keyword_edges(keyword_nodes_data, content)
        
        # Limit edges per node
        edges = self._limit_edges(edges, nodes)
        
        # Create metadata
        metadata = {
            "site_id": options.get("site_id", "unknown"),
            "generated_at": datetime.utcnow().isoformat(),
            "total_keywords": len(nodes),
            "total_posts": len(content),
            "total_edges": len(edges)
        }
        
        graph = KnowledgeGraph(nodes=nodes, edges=edges, metadata=metadata)
        return graph.to_dict()
    
    def _create_fallback_graph(self, content: List[Dict[str, Any]], options: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback graph creation if keyword extraction fails"""
        return {
            "nodes": [],
            "edges": [],
            "metadata": {
                "site_id": options.get("site_id", "unknown"),
                "generated_at": datetime.utcnow().isoformat(),
                "total_keywords": 0,
                "total_posts": len(content),
                "total_edges": 0
            }
        }
    
    def _create_keyword_nodes(self, keyword_data: List[Dict[str, Any]]) -> List[GraphNode]:
        """Create graph nodes from keyword data"""
        nodes = []
        
        for kw_data in keyword_data:
            node = GraphNode(
                id=kw_data['id'],
                label=kw_data['label'],
                type="keyword",
                wordpress_posts=kw_data.get('wordpress_posts', [])
            )
            nodes.append(node)
        
        return nodes
    
    def _create_keyword_edges(
        self,
        keyword_nodes_data: List[Dict[str, Any]],
        content: List[Dict[str, Any]]
    ) -> List[GraphEdge]:
        """Create edges between keywords based on co-occurrence in posts"""
        edges = []
        
        # Map keyword IDs to their post lists
        keyword_to_posts = {kw['id']: set(kw.get('wordpress_posts', [])) for kw in keyword_nodes_data}
        keyword_ids = list(keyword_to_posts.keys())
        
        # Calculate co-occurrence (keywords appearing in same posts)
        for i, kw1_id in enumerate(keyword_ids):
            posts1 = keyword_to_posts[kw1_id]
            for kw2_id in keyword_ids[i+1:]:
                posts2 = keyword_to_posts[kw2_id]
                # Count shared posts
                shared_posts = len(posts1.intersection(posts2))
                if shared_posts > 0:
                    # Weight based on shared posts (normalize by total unique posts)
                    total_posts = len(posts1.union(posts2))
                    weight = shared_posts / total_posts if total_posts > 0 else 0
                    
                    if weight >= 0.1:  # Minimum threshold
                        edge = GraphEdge(
                            source=kw1_id,
                            target=kw2_id,
                            weight=float(weight),
                            type="cooccurrence"
                        )
                        edges.append(edge)
        
        return edges
    
    def _create_edges(
        self,
        embeddings: Dict[str, Any],
        nodes: List[GraphNode]
    ) -> List[GraphEdge]:
        """Create edges from semantic similarities"""
        similarities = calculate_similarity_matrix(embeddings, self.similarity_threshold)
        edges = []
        node_map = {node.label: node.id for node in nodes}
        
        for kw1, kw2, sim in similarities:
            if kw1 in node_map and kw2 in node_map:
                edge = GraphEdge(
                    source=node_map[kw1],
                    target=node_map[kw2],
                    weight=float(sim),
                    type="semantic"
                )
                edges.append(edge)
        
        return edges
    
    def _create_cooccurrence_edges(
        self,
        content: List[Dict[str, Any]],
        nodes: List[GraphNode]
    ) -> List[GraphEdge]:
        """Create edges based on keyword co-occurrence in content"""
        cooccurrences = Counter()
        node_map = {node.label: node.id for node in nodes}
        node_set = set(node.label for node in nodes)
        
        for item in content:
            text = (item.get('content', '') + ' ' + item.get('title', '')).lower()
            keywords_in_text = [kw for kw in node_set if kw in text]
            
            # Count co-occurrences
            for i, kw1 in enumerate(keywords_in_text):
                for kw2 in keywords_in_text[i+1:]:
                    pair = tuple(sorted([kw1, kw2]))
                    cooccurrences[pair] += 1
        
        # Create edges from top co-occurrences
        edges = []
        max_cooccurrence = max(cooccurrences.values()) if cooccurrences else 1
        
        for (kw1, kw2), count in cooccurrences.most_common(100):
            if kw1 in node_map and kw2 in node_map:
                weight = count / max_cooccurrence
                edge = GraphEdge(
                    source=node_map[kw1],
                    target=node_map[kw2],
                    weight=float(weight),
                    type="cooccurrence"
                )
                edges.append(edge)
        
        return edges
    
    def _limit_edges(self, edges: List[GraphEdge], nodes: List[GraphNode]) -> List[GraphEdge]:
        """Limit number of edges per node"""
        node_edge_count = {node.id: 0 for node in nodes}
        limited_edges = []
        
        # Sort edges by weight
        sorted_edges = sorted(edges, key=lambda e: e.weight, reverse=True)
        
        for edge in sorted_edges:
            if (node_edge_count[edge.source] < self.max_edges_per_node and
                node_edge_count[edge.target] < self.max_edges_per_node):
                limited_edges.append(edge)
                node_edge_count[edge.source] += 1
                node_edge_count[edge.target] += 1
        
        return limited_edges
    
    def _map_keywords_to_posts(self, content: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        """Map keywords to WordPress post IDs"""
        mapping = {}
        
        for item in content:
            post_id = str(item.get('id', ''))
            text = (item.get('content', '') + ' ' + item.get('title', '')).lower()
            
            # Simple keyword matching (in production, use proper NLP)
            words = set(text.split())
            for word in words:
                if len(word) > 3:
                    if word not in mapping:
                        mapping[word] = []
                    mapping[word].append(post_id)
        
        return mapping
    
    def _generate_node_id(self, keyword: str) -> str:
        """Generate unique node ID from keyword"""
        return keyword.lower().replace(' ', '_').replace('-', '_')

