"""
Similarity calculation utilities
"""

from typing import List, Tuple, Any, Dict

# Try to import numpy - make it optional
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None


def cosine_similarity(vec1: Any, vec2: Any) -> float:
    """Calculate cosine similarity between two vectors"""
    if not HAS_NUMPY:
        # Fallback: simple dot product for lists
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(dot_product / (norm1 * norm2))
    
    # Use numpy if available
    vec1_arr = np.array(vec1)
    vec2_arr = np.array(vec2)
    dot_product = np.dot(vec1_arr, vec2_arr)
    norm1 = np.linalg.norm(vec1_arr)
    norm2 = np.linalg.norm(vec2_arr)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))


def calculate_similarity_matrix(embeddings: Dict[str, Any], threshold: float = 0.3) -> List[Tuple[str, str, float]]:
    """Calculate similarity matrix for all keyword pairs"""
    similarities = []
    keywords = list(embeddings.keys())
    
    for i, kw1 in enumerate(keywords):
        for kw2 in keywords[i+1:]:
            sim = cosine_similarity(embeddings[kw1], embeddings[kw2])
            if sim >= threshold:
                similarities.append((kw1, kw2, sim))
    
    # Sort by similarity descending
    similarities.sort(key=lambda x: x[2], reverse=True)
    return similarities


def find_most_similar(keyword: str, embeddings: Dict[str, Any], top_k: int = 10) -> List[Tuple[str, float]]:
    """Find most similar keywords to a given keyword"""
    if keyword not in embeddings:
        return []
    
    similarities = []
    keyword_vec = embeddings[keyword]
    
    for other_kw, other_vec in embeddings.items():
        if other_kw != keyword:
            sim = cosine_similarity(keyword_vec, other_vec)
            similarities.append((other_kw, sim))
    
    # Sort and return top k
    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:top_k]
