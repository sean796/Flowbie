import { toast } from "sonner";
import { getWordPressPostContent, getPublishedPosts, getPublishedPages } from "@/lib/wordpress-api";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { type WordPressSite } from "@/components/integrations/types";
import { updateOptimizationProgress } from "./optimization-helpers";
import { selectRelevantPostsForBlog } from "@/lib/wordpress-post-selector";

export async function fetchWordPressContentForRAG(
  site: WordPressSite,
  siteId: string,
  resolved: any,
  primaryKeyword: string,
  secondaryKeywords: string[],
  openRouterApiKey: string,
  researchModel: string,
  setOptimizationProgress: (prev: any) => any
): Promise<{
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  wordPressRAGContext: string;
}> {
  updateOptimizationProgress(setOptimizationProgress, siteId, 'Fetching WordPress content via API...', 55, 'Fetching posts from WordPress API...');

  let wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];

  try {
    // Detect if this is a page
    const isPage = resolved?.subtype === 'page' || 
                   resolved?.endpoint === 'pages';
    
    // ALWAYS fetch via API - NO CACHE
    updateOptimizationProgress(setOptimizationProgress, siteId, 'Fetching WordPress content via API...', 55, isPage ? 'Loading posts and pages from WordPress REST API...' : 'Loading posts from WordPress REST API...');
    toast.info(isPage ? 'Fetching WordPress posts and pages via API...' : 'Fetching WordPress posts via API...', { duration: 2000 });

    // Fetch all published posts from WordPress API
    const publishedResult = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 200, 0);
    
    // If this is a page, also fetch pages
    let pagesMetadata: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
    if (isPage) {
      try {
        const pagesResult = await getPublishedPages(site.siteUrl, site.username, site.appPassword, 200, 0);
        if (pagesResult.posts && pagesResult.posts.length > 0) {
          pagesMetadata = pagesResult.posts.map((p: any) => ({
            id: p.id,
            slug: p.slug || '',
            title: (typeof p.title === 'object' && p.title?.rendered) ? p.title.rendered : (p.title || ''),
            excerpt: ((typeof p.excerpt === 'object' && p.excerpt?.rendered) ? p.excerpt.rendered : (p.excerpt || '')).replace(/<[^>]+>/g, '').substring(0, 200),
            link: p.link || p.slug || '',
            date_gmt: p.date_gmt || (p as any).date || ''
          })).filter(p => p.id && p.title && (p.link || p.slug));
          console.log(`[Optimize Content] Fetched ${pagesMetadata.length} pages for RAG context`);
        }
      } catch (pagesError) {
        console.warn('[Optimize Content] Could not fetch pages for RAG context:', pagesError);
      }
    }
    
    if ((!publishedResult.posts || publishedResult.posts.length === 0) && pagesMetadata.length === 0) {
      console.warn('[Optimize Content] No WordPress posts or pages found via API');
      return { wordPressPosts: [], wordPressRAGContext: '' };
    }

    // Convert to metadata format
    const allPostsMetadata = publishedResult.posts.map((p: any) => ({
      id: p.id,
      slug: p.slug || '',
      title: (typeof p.title === 'object' && p.title?.rendered) ? p.title.rendered : (p.title || ''),
      excerpt: ((typeof p.excerpt === 'object' && p.excerpt?.rendered) ? p.excerpt.rendered : (p.excerpt || '')).replace(/<[^>]+>/g, '').substring(0, 200),
      link: p.link || p.slug || '',
      date_gmt: p.date_gmt || (p as any).date || ''
    })).filter(p => p.id && p.title && (p.link || p.slug));
    
    // Combine posts and pages metadata
    const allContentMetadata = [...allPostsMetadata, ...pagesMetadata];

    // Use AI to filter posts/pages by primary + secondary keywords
    updateOptimizationProgress(setOptimizationProgress, siteId, 'Filtering content by keywords with AI...', 56, `Filtering ${allContentMetadata.length} items (${allPostsMetadata.length} posts${isPage ? `, ${pagesMetadata.length} pages` : ''}) by keywords: ${primaryKeyword}${secondaryKeywords.length > 0 ? ` + ${secondaryKeywords.length} secondary` : ''}...`);
    
    const combinedKeywords = [primaryKeyword, ...secondaryKeywords].filter(kw => kw && kw.trim().length > 0).join(', ');
    const blogTitle = `Content about ${primaryKeyword}`;

    const selectionResult = await selectRelevantPostsForBlog(
      combinedKeywords,
      blogTitle,
      allContentMetadata,
      {
        apiKey: openRouterApiKey,
        model: researchModel,
        maxPosts: 20, // Get up to 20 relevant items
        temperature: 0.7
        // DO NOT pass siteId - we want to use postsMetadata directly, not cache
      }
    );

    // Convert selected posts to wordPressPosts format
    wordPressPosts = selectionResult.selectedPosts.map(sp => {
      const originalPost = allPostsMetadata.find(p => p.id === sp.id);
      return {
        id: sp.id,
        slug: sp.slug,
        title: sp.title,
        excerpt: originalPost?.excerpt || '',
        link: sp.link,
        date_gmt: originalPost?.date_gmt || ''
      };
    });

    console.log(`[Optimize Content] AI selected ${wordPressPosts.length} relevant items from ${allContentMetadata.length} total items (${allPostsMetadata.length} posts${isPage ? `, ${pagesMetadata.length} pages` : ''})`);
    toast.success(`AI selected ${wordPressPosts.length} relevant items for keywords`, { duration: 2000 });

  } catch (error) {
    console.error('[Optimize Content] Error fetching WordPress posts via API:', error);
    toast.warning('Could not fetch WordPress content. Continuing without internal links...', { duration: 4000 });
  }

  // Fetch full content for selected posts
  let wordPressRAGContext = '';
  if (wordPressPosts.length > 0) {
    try {
      updateOptimizationProgress(setOptimizationProgress, siteId, 'Fetching full content...', 58, `Loading content from ${wordPressPosts.length} selected items...`);
      toast.info(`Fetching full content from ${wordPressPosts.length} selected items...`, { duration: 2000 });

      const ragContent: string[] = [];

      for (let i = 0; i < wordPressPosts.length; i++) {
        const post = wordPressPosts[i];
        try {
          updateOptimizationProgress(setOptimizationProgress, siteId, 'Fetching post content...', 58 + Math.floor((i / wordPressPosts.length) * 2), `Fetching ${i + 1}/${wordPressPosts.length}: ${post.title.substring(0, 40)}...`);

          // Query WordPress API to discover post type - NO GUESSING
          // The API will try all post types systematically
          // Check if this is a page by looking it up in pagesMetadata
          const isPageItem = pagesMetadata.some(p => p.id === post.id);
          const contentResult = await getWordPressPostContent(
            site.siteUrl, 
            site.username, 
            site.appPassword, 
            undefined, 
            undefined, 
            [{ id: post.id, subtype: isPageItem ? 'page' : 'post' }] // Use page subtype if it's a page
          );

          if (contentResult && contentResult.posts && contentResult.posts.length > 0) {
            const wpPost = contentResult.posts[0];
            if (wpPost.content) {
              const markdownContent = htmlToMarkdown(wpPost.content);
              const excerpt = wpPost.excerpt ? htmlToMarkdown(wpPost.excerpt) : '';
              ragContent.push(`--- ${post.title} (${post.link}) ---\n${excerpt ? `**Excerpt:** ${excerpt}\n\n` : ''}**Content:**\n${markdownContent.substring(0, 2000)}${markdownContent.length > 2000 ? '...' : ''}\n`);
            }
          }
        } catch (postError) {
          console.warn(`[Optimize Content] Could not fetch content for post ${post.id}:`, postError);
        }
      }

      if (ragContent.length > 0) {
        wordPressRAGContext = ragContent.join('\n\n');
        toast.success(`Loaded content from ${ragContent.length} WordPress items for AI context`, { duration: 3000 });
      }
    } catch (ragError) {
      console.warn('[Optimize Content] Error building WordPress RAG context:', ragError);
    }
  }

  return { wordPressPosts, wordPressRAGContext };
}
