"""
Word2Vec model training and processing
Generates embeddings for keywords from WordPress content
"""

from typing import List, Dict, Any, Optional
import tempfile
import os
from preprocessor import TextPreprocessor

# Try to import ML libraries - make them optional
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

try:
    from gensim.models import Word2Vec
    from gensim.models.word2vec import LineSentence
    HAS_GENSIM = True
except ImportError:
    HAS_GENSIM = False
    Word2Vec = None
    LineSentence = None


class Word2VecProcessor:
    """Processes content and generates Word2Vec embeddings"""
    
    def __init__(self, vector_size: int = 100, window: int = 5, min_count: int = 2):
        self.vector_size = vector_size
        self.window = window
        self.min_count = min_count
        self.model: Optional[Word2Vec] = None
        self.preprocessor = TextPreprocessor()
    
    async def process_content(self, content_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process WordPress content and generate keyword embeddings"""
        if not HAS_GENSIM or not HAS_NUMPY:
            # Fallback: return simple keyword frequency-based "embeddings"
            from collections import Counter
            corpus = self.preprocessor.prepare_corpus(content_list)
            if not corpus:
                return {}
            
            # Create simple frequency-based vectors
            all_words = []
            for sentence in corpus:
                all_words.extend(sentence)
            
            word_counts = Counter(all_words)
            total_words = len(all_words)
            
            # Create simple embeddings based on frequency
            embeddings = {}
            for word, count in word_counts.items():
                if count >= self.min_count:
                    # Simple frequency-based vector (not real Word2Vec)
                    freq = count / total_words
                    embeddings[word] = [freq] * self.vector_size  # Simple vector
            
            return embeddings
        
        # Prepare corpus
        corpus = self.preprocessor.prepare_corpus(content_list)
        
        if not corpus:
            return {}
        
        # Train Word2Vec model
        self.model = Word2Vec(
            sentences=corpus,
            vector_size=self.vector_size,
            window=self.window,
            min_count=self.min_count,
            workers=4,
            sg=1  # Skip-gram
        )
        
        # Extract embeddings for all keywords
        embeddings = {}
        for keyword in self.model.wv.key_to_index:
            embeddings[keyword] = self.model.wv[keyword].tolist()  # Convert numpy array to list
        
        return embeddings
    
    def get_embedding(self, keyword: str) -> Optional[Any]:
        """Get embedding for a specific keyword"""
        if not HAS_GENSIM or not self.model:
            return None
        if keyword not in self.model.wv.key_to_index:
            return None
        return self.model.wv[keyword].tolist()  # Convert numpy array to list
    
    def find_similar(self, keyword: str, top_n: int = 10) -> List[tuple]:
        """Find similar keywords using Word2Vec"""
        if not HAS_GENSIM or not self.model:
            return []
        if keyword not in self.model.wv.key_to_index:
            return []
        
        try:
            similar = self.model.wv.most_similar(keyword, topn=top_n)
            return similar
        except KeyError:
            return []
    
    def calculate_similarity(self, keyword1: str, keyword2: str) -> float:
        """Calculate similarity between two keywords"""
        if not HAS_GENSIM or not self.model:
            return 0.0
        
        try:
            return float(self.model.wv.similarity(keyword1, keyword2))
        except (KeyError, ValueError):
            return 0.0

