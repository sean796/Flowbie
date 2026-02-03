"""
Text preprocessing utilities for WordPress content
Extracts keywords, cleans text, and prepares corpus for Word2Vec
"""

import re
from typing import List, Dict, Any
from collections import Counter

# Try to import spacy - make it optional
try:
    import spacy
    HAS_SPACY = True
except ImportError:
    HAS_SPACY = False
    spacy = None


class TextPreprocessor:
    """Preprocesses text content for ML processing"""
    
    def __init__(self):
        self.nlp = None
        if HAS_SPACY:
            try:
                self.nlp = spacy.load("en_core_web_sm")
            except OSError:
                # Fallback if spaCy model not installed
                self.nlp = None
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
        
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Remove URLs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def extract_keywords(self, text: str, max_keywords: int = 50) -> List[str]:
        """Extract keywords from text using NLP"""
        if not self.nlp:
            # Fallback to simple word extraction
            return self._simple_keyword_extraction(text, max_keywords)
        
        doc = self.nlp(text.lower())
        
        # Extract nouns and important adjectives
        keywords = []
        for token in doc:
            if (token.pos_ in ['NOUN', 'PROPN'] and 
                not token.is_stop and 
                not token.is_punct and
                len(token.text) > 2):
                keywords.append(token.lemma_)
        
        # Count frequency and return top keywords
        keyword_counts = Counter(keywords)
        return [kw for kw, _ in keyword_counts.most_common(max_keywords)]
    
    def _simple_keyword_extraction(self, text: str, max_keywords: int) -> List[str]:
        """Simple keyword extraction fallback"""
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        filtered = [w for w in words if w not in stop_words]
        
        keyword_counts = Counter(filtered)
        return [kw for kw, _ in keyword_counts.most_common(max_keywords)]
    
    def prepare_corpus(self, content_list: List[Dict[str, Any]]) -> List[List[str]]:
        """Prepare corpus from WordPress content for Word2Vec training"""
        corpus = []
        
        for item in content_list:
            text = item.get('content', '') + ' ' + item.get('title', '')
            cleaned = self.clean_text(text)
            keywords = self.extract_keywords(cleaned)
            
            if keywords:
                corpus.append(keywords)
        
        return corpus
    
    def extract_entities(self, text: str) -> List[str]:
        """Extract named entities from text"""
        if not self.nlp:
            return []
        
        doc = self.nlp(text)
        entities = []
        
        for ent in doc.ents:
            if ent.label_ in ['PERSON', 'ORG', 'GPE', 'LOC']:
                entities.append(ent.text)
        
        return list(set(entities))

