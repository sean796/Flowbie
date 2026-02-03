"""
Content clustering for knowledge graph
Groups WordPress posts into meaningful topic clusters
"""

from typing import List, Dict, Any, Tuple
from collections import Counter, defaultdict
from urllib.parse import urlparse

# Try to import numpy and sklearn - make them optional
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

try:
    from sklearn.cluster import KMeans
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    KMeans = None


class ContentClusterer:
    """Clusters WordPress content into meaningful topic groups"""
    
    def __init__(self, n_clusters: int = None, min_cluster_size: int = 2):
        self.n_clusters = n_clusters
        self.min_cluster_size = min_cluster_size
    
    def cluster_content(
        self,
        content: List[Dict[str, Any]],
        embeddings: Dict[str, Any],
        gsc_data: List[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Cluster content into meaningful groups using WordPress site structure
        Uses categories, tags, URL paths, and semantic similarity
        """
        if not content:
            return []
        
        # First, cluster by WordPress structure (categories, URL paths)
        structure_clusters = self._cluster_by_structure(content, embeddings)
        
        # Then refine with semantic clustering within each structure cluster
        final_clusters = self._refine_with_semantic_clustering(
            structure_clusters, content, embeddings
        )
        
        # Calculate optimal number if needed for semantic clustering
        if self.n_clusters is None:
            n_posts = len(content)
            if n_posts < 20:
                self.n_clusters = max(5, n_posts // 2)
            elif n_posts < 100:
                self.n_clusters = min(25, n_posts // 3)
            else:
                self.n_clusters = min(40, n_posts // 8)
        
        # Build cluster nodes
        cluster_nodes = []
        gsc_map = {item.get('query', '').lower(): item for item in (gsc_data or [])}
        
        for cluster_id, cluster_data in final_clusters.items():
            posts = cluster_data['posts']
            if len(posts) < self.min_cluster_size:
                continue
            
            # Get top keywords for this cluster
            cluster_keywords = self._extract_cluster_keywords(cluster_data['content'], embeddings)
            
            # Create cluster label (prefer structure-based label if available)
            if cluster_data.get('label'):
                label = cluster_data['label']
            else:
                label = self._create_cluster_label(cluster_keywords)
            
            # Aggregate GSC data for cluster keywords
            gsc_aggregated = self._aggregate_gsc_data(cluster_keywords, gsc_map)
            
            # Calculate average embedding
            cluster_embedding = self._average_embeddings(cluster_keywords, embeddings)
            
            cluster_nodes.append({
                'id': f'cluster_{cluster_id}',
                'label': label,
                'type': 'cluster',
                'posts': [str(p.get('id', '')) for p in posts],
                'keywords': cluster_keywords[:15],  # Top 15 keywords
                'gsc_data': gsc_aggregated,
                'embedding': cluster_embedding,
                'post_count': len(posts)
            })
        
        return cluster_nodes
    
    def _create_post_embeddings(
        self,
        content: List[Dict[str, Any]],
        embeddings: Dict[str, Any]
    ) -> List[Tuple[int, Any]]:
        """Create embedding vector for each post by averaging keyword embeddings"""
        post_embeddings = []
        
        for item in content:
            post_id = item.get('id')
            text = (item.get('content', '') + ' ' + item.get('title', '')).lower()
            
            # Find keywords in this post that have embeddings
            post_keywords = []
            for keyword, embedding in embeddings.items():
                if keyword.lower() in text:
                    post_keywords.append(embedding)
            
            if post_keywords:
                # Average the embeddings
                if HAS_NUMPY:
                    avg_embedding = np.mean([np.array(e) for e in post_keywords if isinstance(e, (list, np.ndarray))], axis=0)
                    post_embeddings.append((post_id, avg_embedding.tolist()))
                else:
                    # Simple average for lists
                    if post_keywords and isinstance(post_keywords[0], list):
                        vector_size = len(post_keywords[0])
                        avg_embedding = [
                            sum(kw[i] for kw in post_keywords if len(kw) > i) / len(post_keywords)
                            for i in range(vector_size)
                        ]
                        post_embeddings.append((post_id, avg_embedding))
        
        return post_embeddings
    
    def _kmeans_cluster(
        self,
        post_embeddings: List[Tuple[int, Any]],
        content: List[Dict[str, Any]]
    ) -> Dict[int, Dict[str, Any]]:
        """Perform K-means clustering on post embeddings"""
        if not HAS_SKLEARN or not HAS_NUMPY:
            return {}
        
        # Extract embeddings and post IDs
        post_ids = [pid for pid, _ in post_embeddings]
        embedding_vectors = np.array([emb for _, emb in post_embeddings])
        
        # Perform K-means
        kmeans = KMeans(n_clusters=self.n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embedding_vectors)
        
        # Group posts by cluster
        clusters = defaultdict(lambda: {'posts': [], 'content': []})
        content_map = {item.get('id'): item for item in content}
        
        for post_id, cluster_label in zip(post_ids, labels):
            if post_id in content_map:
                clusters[int(cluster_label)]['posts'].append(content_map[post_id])
                clusters[int(cluster_label)]['content'].append(content_map[post_id])
        
        return dict(clusters)
    
    def _cluster_by_structure(
        self,
        content: List[Dict[str, Any]],
        embeddings: Dict[str, Any]
    ) -> Dict[int, Dict[str, Any]]:
        """Cluster posts by WordPress structure: categories, URL paths, post types"""
        clusters = {}
        cluster_id = 0
        post_to_cluster = {}  # Track which cluster each post belongs to
        
        # Group 1: By categories
        category_groups = defaultdict(list)
        for item in content:
            categories = item.get('categories', [])
            if categories:
                # Use first category as primary grouping
                primary_cat = str(categories[0])
                category_groups[primary_cat].append(item)
            else:
                category_groups['uncategorized'].append(item)
        
        # Group 2: By URL path structure (blog/, category/, service-area/, etc.)
        path_groups = defaultdict(list)
        for item in content:
            link = item.get('link', '') or item.get('slug', '')
            if link:
                # Extract path segments
                try:
                    parsed = urlparse(link)
                    path_parts = [p for p in parsed.path.split('/') if p]
                    if path_parts:
                        # Use first 2 path segments as grouping key
                        if len(path_parts) >= 2:
                            path_key = '/'.join(path_parts[:2])
                        else:
                            path_key = path_parts[0]
                        path_groups[path_key].append(item)
                except:
                    # Fallback: use slug prefix
                    slug = item.get('slug', '')
                    if slug:
                        parts = slug.split('-')[:2]
                        path_key = '-'.join(parts) if len(parts) > 1 else parts[0]
                        path_groups[path_key].append(item)
        
        # Group 3: By post type endpoint
        post_type_groups = defaultdict(list)
        for item in content:
            post_type = item.get('postTypeEndpoint', 'posts')
            post_type_groups[post_type].append(item)
        
        # Combine structure-based groupings (prioritize categories, then paths, then types)
        used_posts = set()
        
        # First pass: category-based clusters
        for cat_id, posts in category_groups.items():
            if len(posts) >= self.min_cluster_size:
                cluster_label = f"Category: {cat_id}" if cat_id != 'uncategorized' else "Uncategorized"
                clusters[cluster_id] = {
                    'posts': posts,
                    'content': posts,
                    'label': cluster_label
                }
                for post in posts:
                    post_to_cluster[post.get('id')] = cluster_id
                    used_posts.add(post.get('id'))
                cluster_id += 1
        
        # Second pass: path-based clusters for remaining posts
        remaining_by_path = defaultdict(list)
        for item in content:
            if item.get('id') not in used_posts:
                link = item.get('link', '') or item.get('slug', '')
                if link:
                    try:
                        parsed = urlparse(link)
                        path_parts = [p for p in parsed.path.split('/') if p]
                        if path_parts:
                            path_key = '/'.join(path_parts[:2]) if len(path_parts) >= 2 else path_parts[0]
                            remaining_by_path[path_key].append(item)
                    except:
                        slug = item.get('slug', '')
                        if slug:
                            parts = slug.split('-')[:2]
                            path_key = '-'.join(parts) if len(parts) > 1 else parts[0]
                            remaining_by_path[path_key].append(item)
        
        for path_key, posts in remaining_by_path.items():
            if len(posts) >= self.min_cluster_size:
                # Create readable label from path
                label_parts = path_key.replace('-', ' ').replace('_', ' ').title().split()
                cluster_label = ' / '.join(label_parts[:3])
                clusters[cluster_id] = {
                    'posts': posts,
                    'content': posts,
                    'label': cluster_label
                }
                for post in posts:
                    post_to_cluster[post.get('id')] = cluster_id
                    used_posts.add(post.get('id'))
                cluster_id += 1
        
        # Third pass: post type clusters for remaining
        remaining_by_type = defaultdict(list)
        for item in content:
            if item.get('id') not in used_posts:
                post_type = item.get('postTypeEndpoint', 'posts')
                remaining_by_type[post_type].append(item)
        
        for post_type, posts in remaining_by_type.items():
            if len(posts) >= self.min_cluster_size:
                cluster_label = f"{post_type.title()} Posts"
                clusters[cluster_id] = {
                    'posts': posts,
                    'content': posts,
                    'label': cluster_label
                }
                for post in posts:
                    post_to_cluster[post.get('id')] = cluster_id
                    used_posts.add(post.get('id'))
                cluster_id += 1
        
        # Fourth pass: split large clusters by URL path if still too many posts
        if not clusters or (len(clusters) == 1 and len(list(clusters.values())[0]['posts']) > 10):
            # Force split by URL path segments
            all_path_groups = defaultdict(list)
            for item in content:
                link = item.get('link', '') or item.get('slug', '')
                if link:
                    try:
                        parsed = urlparse(link)
                        path_parts = [p for p in parsed.path.split('/') if p]
                        if path_parts:
                            # Use first path segment
                            path_key = path_parts[0] if path_parts else 'root'
                            all_path_groups[path_key].append(item)
                    except:
                        slug = item.get('slug', '')
                        if slug:
                            first_part = slug.split('-')[0]
                            all_path_groups[first_part].append(item)
            
            # Create clusters from path groups
            clusters = {}
            cluster_id = 0
            for path_key, posts in all_path_groups.items():
                if len(posts) >= self.min_cluster_size:
                    label_parts = path_key.replace('-', ' ').replace('_', ' ').title()
                    clusters[cluster_id] = {
                        'posts': posts,
                        'content': posts,
                        'label': label_parts[:30]  # Limit label length
                    }
                    cluster_id += 1
        
        # Add remaining posts to nearest cluster or create new ones
        remaining_posts = [item for item in content if item.get('id') not in used_posts]
        if remaining_posts:
            if clusters:
                # Distribute to smallest clusters to balance
                sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]['posts']))
                # Add to smallest clusters first
                per_cluster = len(remaining_posts) // len(sorted_clusters) + 1
                idx = 0
                for cid, cluster_data in sorted_clusters:
                    if idx < len(remaining_posts):
                        batch = remaining_posts[idx:idx + per_cluster]
                        cluster_data['posts'].extend(batch)
                        cluster_data['content'].extend(batch)
                        idx += len(batch)
            else:
                # Create catch-all cluster if no clusters exist
                clusters[cluster_id] = {
                    'posts': remaining_posts,
                    'content': remaining_posts,
                    'label': 'All Content'
                }
        
        return clusters
    
    def _refine_with_semantic_clustering(
        self,
        structure_clusters: Dict[int, Dict[str, Any]],
        content: List[Dict[str, Any]],
        embeddings: Dict[str, Any]
    ) -> Dict[int, Dict[str, Any]]:
        """Refine structure-based clusters with semantic clustering"""
        refined_clusters = {}
        new_cluster_id = 0
        content_map = {item.get('id'): item for item in content}
        
        for orig_cluster_id, cluster_data in structure_clusters.items():
            posts = cluster_data['posts']
            
            # If cluster is small, keep as-is
            if len(posts) < 6:
                refined_clusters[new_cluster_id] = cluster_data
                new_cluster_id += 1
                continue
            
            # Create embeddings for posts in this cluster
            post_embeddings = []
            for post in posts:
                post_id = post.get('id')
                text = (post.get('content', '') + ' ' + post.get('title', '')).lower()
                
                # Find keywords in this post
                post_keywords = []
                for keyword, embedding in embeddings.items():
                    if keyword.lower() in text:
                        post_keywords.append(embedding)
                
                if post_keywords:
                    if HAS_NUMPY:
                        avg_embedding = np.mean([np.array(e) for e in post_keywords if isinstance(e, (list, np.ndarray))], axis=0)
                        post_embeddings.append((post_id, avg_embedding.tolist()))
                    else:
                        if isinstance(post_keywords[0], list):
                            vector_size = len(post_keywords[0])
                            avg_embedding = [
                                sum(kw[i] for kw in post_keywords if len(kw) > i) / len(post_keywords)
                                for i in range(vector_size)
                            ]
                            post_embeddings.append((post_id, avg_embedding))
            
            # If we have embeddings and sklearn, perform sub-clustering
            if HAS_SKLEARN and HAS_NUMPY and len(post_embeddings) > 3:
                # Determine number of sub-clusters (aim for 3-8 posts per sub-cluster)
                n_subclusters = max(2, min(5, len(posts) // 4))
                
                try:
                    post_ids = [pid for pid, _ in post_embeddings]
                    embedding_vectors = np.array([emb for _, emb in post_embeddings])
                    
                    kmeans = KMeans(n_clusters=n_subclusters, random_state=42, n_init=10)
                    labels = kmeans.fit_predict(embedding_vectors)
                    
                    # Create sub-clusters
                    subclusters = defaultdict(list)
                    for post_id, label in zip(post_ids, labels):
                        if post_id in content_map:
                            subclusters[int(label)].append(content_map[post_id])
                    
                    # Add sub-clusters
                    for sub_label, sub_posts in subclusters.items():
                        if len(sub_posts) >= self.min_cluster_size:
                            # Inherit base label and add sub-cluster identifier
                            base_label = cluster_data.get('label', 'Cluster')
                            refined_clusters[new_cluster_id] = {
                                'posts': sub_posts,
                                'content': sub_posts,
                                'label': f"{base_label} - Group {sub_label + 1}"
                            }
                            new_cluster_id += 1
                    continue
                except Exception:
                    # Fallback: keep original cluster
                    pass
            
            # Keep original cluster if sub-clustering failed or not applicable
            refined_clusters[new_cluster_id] = cluster_data
            new_cluster_id += 1
        
        return refined_clusters
    
    def _cluster_by_keywords(
        self,
        content: List[Dict[str, Any]],
        embeddings: Dict[str, Any],
        gsc_data: List[Dict[str, Any]] = None
    ) -> Dict[int, Dict[str, Any]]:
        """Fallback: cluster posts by shared keywords"""
        # Group posts by their top keywords
        keyword_to_posts = defaultdict(list)
        
        for item in content:
            text = (item.get('content', '') + ' ' + item.get('title', '')).lower()
            # Find which keywords appear in this post
            for keyword in embeddings.keys():
                if keyword.lower() in text:
                    keyword_to_posts[keyword].append(item)
        
        # Create clusters from keyword groups
        clusters = {}
        cluster_id = 0
        used_posts = set()
        
        # Sort keywords by post count (most common first)
        sorted_keywords = sorted(keyword_to_posts.items(), key=lambda x: len(x[1]), reverse=True)
        
        for keyword, posts in sorted_keywords:
            # Only use posts not already in a cluster
            new_posts = [p for p in posts if p.get('id') not in used_posts]
            if len(new_posts) >= self.min_cluster_size:
                clusters[cluster_id] = {
                    'posts': new_posts,
                    'content': new_posts
                }
                used_posts.update(p.get('id') for p in new_posts)
                cluster_id += 1
        
        # Add remaining posts to nearest cluster
        remaining_posts = [item for item in content if item.get('id') not in used_posts]
        if remaining_posts and clusters:
            # Add to largest cluster
            largest_cluster = max(clusters.items(), key=lambda x: len(x[1]['posts']))
            clusters[largest_cluster[0]]['posts'].extend(remaining_posts)
            clusters[largest_cluster[0]]['content'].extend(remaining_posts)
        elif remaining_posts:
            # Create new cluster for remaining
            clusters[cluster_id] = {
                'posts': remaining_posts,
                'content': remaining_posts
            }
        
        return clusters
    
    def _extract_cluster_keywords(
        self,
        cluster_content: List[Dict[str, Any]],
        embeddings: Dict[str, Any]
    ) -> List[str]:
        """Extract top keywords for a cluster"""
        keyword_counts = Counter()
        
        for item in cluster_content:
            text = (item.get('content', '') + ' ' + item.get('title', '')).lower()
            for keyword in embeddings.keys():
                if keyword.lower() in text:
                    keyword_counts[keyword] += 1
        
        # Return top keywords
        return [kw for kw, _ in keyword_counts.most_common(15)]
    
    def _create_cluster_label(self, keywords: List[str]) -> str:
        """Create a readable label from top keywords"""
        if not keywords:
            return "Uncategorized"
        
        # Take top 3-5 keywords and create a label
        top_keywords = keywords[:5]
        # Capitalize and join
        label = " / ".join(kw.title() for kw in top_keywords[:3])
        
        # Limit length
        if len(label) > 60:
            label = label[:57] + "..."
        
        return label
    
    def _aggregate_gsc_data(
        self,
        keywords: List[str],
        gsc_map: Dict[str, Any]
    ) -> Dict[str, Any] | None:
        """Aggregate GSC data for cluster keywords"""
        total_clicks = 0
        total_impressions = 0
        positions = []
        total_ctr = 0
        count = 0
        
        for keyword in keywords:
            gsc_info = gsc_map.get(keyword.lower())
            if gsc_info:
                total_clicks += gsc_info.get('clicks', 0)
                total_impressions += gsc_info.get('impressions', 0)
                pos = gsc_info.get('position', 0)
                if pos > 0:
                    positions.append(pos)
                total_ctr += gsc_info.get('ctr', 0)
                count += 1
        
        if count == 0:
            return None
        
        avg_position = sum(positions) / len(positions) if positions else 0
        avg_ctr = total_ctr / count if count > 0 else 0
        
        return {
            'clicks': total_clicks,
            'impressions': total_impressions,
            'position': avg_position,
            'ctr': avg_ctr
        }
    
    def _average_embeddings(
        self,
        keywords: List[str],
        embeddings: Dict[str, Any]
    ) -> List[float] | None:
        """Calculate average embedding for cluster keywords"""
        keyword_embeddings = [embeddings.get(kw) for kw in keywords if kw in embeddings]
        
        if not keyword_embeddings:
            return None
        
        # Filter out None values
        valid_embeddings = [e for e in keyword_embeddings if e is not None]
        if not valid_embeddings:
            return None
        
        # Average the embeddings
        if HAS_NUMPY:
            avg = np.mean([np.array(e) for e in valid_embeddings], axis=0)
            return avg.tolist()
        else:
            # Simple average for lists
            if isinstance(valid_embeddings[0], list):
                vector_size = len(valid_embeddings[0])
                return [
                    sum(emb[i] for emb in valid_embeddings if len(emb) > i) / len(valid_embeddings)
                    for i in range(vector_size)
                ]
        
        return None

