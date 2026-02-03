"""
Extract SEO keywords from WordPress posts, focusing on anchor text
"""

import re
from typing import List, Dict, Any
from collections import Counter, defaultdict
from html.parser import HTMLParser


class AnchorTextParser(HTMLParser):
    """Extract anchor text from HTML"""
    
    def __init__(self):
        super().__init__()
        self.anchor_texts = []
        self.in_anchor = False
        self.current_text = []
    
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.in_anchor = True
            self.current_text = []
    
    def handle_endtag(self, tag):
        if tag == 'a' and self.in_anchor:
            text = ' '.join(self.current_text).strip()
            if text and len(text) > 2:
                self.anchor_texts.append(text)
            self.in_anchor = False
            self.current_text = []
    
    def handle_data(self, data):
        if self.in_anchor:
            self.current_text.append(data.strip())


def extract_anchor_text(html_content: str) -> List[str]:
    """Extract all anchor text from HTML content"""
    parser = AnchorTextParser()
    parser.feed(html_content)
    return parser.anchor_texts


def extract_keywords_from_posts(content: List[Dict[str, Any]], min_frequency: int = 2) -> List[Dict[str, Any]]:
    """
    Extract SEO keywords from WordPress posts, prioritizing anchor text
    Returns list of keyword nodes with frequency and post associations
    """
    if not content:
        return []
    
    # Collect all keywords from anchor text
    anchor_keywords = Counter()
    keyword_to_posts = defaultdict(list)
    
    # Also extract from titles and headings
    title_keywords = Counter()
    
    for item in content:
        post_id = str(item.get('id', ''))
        html_content = item.get('content', '')
        title = item.get('title', '')
        
        # Extract anchor text (most important for SEO)
        anchor_texts = extract_anchor_text(html_content)
        for anchor in anchor_texts:
            # Clean and normalize anchor text
            cleaned = re.sub(r'[^\w\s-]', '', anchor.lower().strip())
            # Split into phrases (keep multi-word phrases)
            words = cleaned.split()
            if len(words) >= 1:
                # Add full phrase
                phrase = ' '.join(words)
                if len(phrase) > 2 and len(phrase) < 50:
                    anchor_keywords[phrase] += 1
                    if post_id not in keyword_to_posts[phrase]:
                        keyword_to_posts[phrase].append(post_id)
                
                # Add individual significant words (3+ chars)
                for word in words:
                    if len(word) >= 3:
                        anchor_keywords[word] += 1
                        if post_id not in keyword_to_posts[word]:
                            keyword_to_posts[word].append(post_id)
        
        # Extract from titles (also important)
        if title:
            title_clean = re.sub(r'[^\w\s-]', '', title.lower().strip())
            title_words = title_clean.split()
            for word in title_words:
                if len(word) >= 3:
                    title_keywords[word] += 1
    
    # Combine and prioritize (anchor text gets higher weight)
    all_keywords = Counter()
    for keyword, count in anchor_keywords.items():
        # Anchor text keywords get 3x weight
        all_keywords[keyword] += count * 3
    for keyword, count in title_keywords.items():
        all_keywords[keyword] += count
    
    # Filter by frequency and create nodes
    keyword_nodes = []
    node_id = 0
    
    # Get top keywords by frequency
    stop_words = {
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
        'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
        'old', 'see', 'two', 'who', 'way', 'use', 'your', 'when', 'what', 'will', 'with',
        'this', 'that', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much',
        'some', 'time', 'very', 'into', 'than', 'them', 'like', 'then', 'more', 'most'
    }
    
    # Sort by frequency, prioritize multi-word phrases
    sorted_keywords = sorted(
        all_keywords.items(),
        key=lambda x: (len(x[0].split()), x[1]),  # Multi-word first, then frequency
        reverse=True
    )
    
    for keyword, frequency in sorted_keywords:
        # Skip stop words and very common words
        if keyword.lower() in stop_words or frequency < min_frequency:
            continue
        
        # Skip if keyword is too long or too short
        if len(keyword) < 3 or len(keyword) > 40:
            continue
        
        # Get posts that contain this keyword
        posts = keyword_to_posts.get(keyword, [])
        
        if posts:
            keyword_nodes.append({
                'id': f'keyword_{node_id}',
                'label': keyword.title() if len(keyword.split()) == 1 else keyword,
                'type': 'keyword',
                'keywords': [keyword],
                'wordpress_posts': posts,
                'frequency': frequency,
                'post_count': len(posts)
            })
            node_id += 1
    
    # Limit to top 50-100 keywords for performance
    keyword_nodes = sorted(keyword_nodes, key=lambda x: (x['frequency'], x['post_count']), reverse=True)[:100]
    
    return keyword_nodes




