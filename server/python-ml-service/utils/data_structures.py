"""
Data structures for knowledge graph
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict


@dataclass
class GraphNode:
    """Represents a node in the knowledge graph"""
    id: str
    label: str
    type: str  # 'keyword', 'entity', 'concept'
    gsc_data: Optional[Dict[str, Any]] = None
    wordpress_posts: Optional[List[str]] = None
    embedding: Optional[List[float]] = None
    ai_suggestions: Optional[List[Dict[str, Any]]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class GraphEdge:
    """Represents an edge in the knowledge graph"""
    source: str
    target: str
    weight: float
    type: str  # 'semantic', 'cooccurrence', 'gsc', 'ai'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class KnowledgeGraph:
    """Complete knowledge graph structure"""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "nodes": [node.to_dict() for node in self.nodes],
            "edges": [edge.to_dict() for edge in self.edges],
            "metadata": self.metadata
        }




