/**
 * Post and Page Pack Generator Component
 * Dialog for generating blog posts and service area pages
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { WordPressSite } from '@/components/integrations/types';
import { analyzeWordPressPages, type WPPageAnalysis } from '@/lib/wp-page-analyzer';
import { scrapeChildSitemap } from '@/lib/wordpress-sitemap-scraper';
import { analyzeGSCPerformance } from '@/lib/gsc-self-learning';
import { parseSitemap } from '@/lib/wordpress-api';
import { generateEntities } from '@/lib/entity';
import { usePromptBulkGenerate } from '@/hooks/use-prompt-bulk-generate';
import { loadApiKey, loadDataForSEOApiKey } from '@/lib/api';
import Papa from 'papaparse';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { performKeywordResearch, performAIAnalysis } from '@/lib/content-optimization-helpers';
import type { KeywordAIAnalysis, KeywordData } from '@/lib/keyword-types';
import { getResearchModel } from '@/lib/optimization-settings-storage';

interface PostPagePackGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: WordPressSite;
  sitemapUrl: string;
  postType: 'post' | 'service-area';
}

export const PostPagePackGenerator: React.FC<PostPagePackGeneratorProps> = ({
  open,
  onOpenChange,
  site,
  sitemapUrl,
  postType
}) => {
  const [blogPostCount, setBlogPostCount] = useState<number>(3);
  const [serviceAreaCount] = useState<number>(0); // Service area generation disabled
  const [serviceAreaKeyword] = useState<string>(''); // Service area generation disabled
  const [promptModifier, setPromptModifier] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedTemplates, setGeneratedTemplates] = useState<CSVRow[]>([]);
  const [gscKeywords, setGscKeywords] = useState<string[]>([]);
  const [keywordAnalysisResults, setKeywordAnalysisResults] = useState<Map<string, KeywordAIAnalysis>>(new Map());
  
  // Progress tracking
  const [progress, setProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  
  // Content type toggles
  const [versusPost, setVersusPost] = useState<boolean>(false);
  const [guidePost, setGuidePost] = useState<boolean>(false);
  const [featuredImage, setFeaturedImage] = useState<boolean>(true);
  
  const apiKey = loadApiKey();
  
  // Build prompt modifier from toggles and custom text
  const buildPromptModifier = () => {
    const modifiers: string[] = [];
    if (versusPost) modifiers.push('versus posts');
    if (guidePost) modifiers.push('comprehensive guides');
    if (promptModifier.trim()) modifiers.push(promptModifier.trim());
    return modifiers.join(', ');
  };

  const finalPromptModifier = buildPromptModifier();

  // Progress callback to map hook progress (0-100) to Step 3 range (50-95%)
  const handleHookProgress = useCallback((step: string, hookProgress: number) => {
    // Map hook progress (0-100) to Step 3 range (50-95%)
    // This gives us 45% of the total progress bar for AI generation sub-steps
    const mappedProgress = 50 + (hookProgress / 100) * 45;
    setProgress(Math.min(mappedProgress, 95));
    setCurrentStep(step);
  }, []);

  // Use the existing blog generation hook
  const {
    generatedRows: blogGeneratedRows,
    handleGenerateChecklist: handleGenerateBlogChecklist,
    isGeneratingChecklist: isGeneratingBlogChecklist,
  } = usePromptBulkGenerate({
    apiKey,
    openRouterApiKey: apiKey,
    numberOfBlogs: blogPostCount,
    entityMode: 'blank', // NO entities for blog posts
    keywordMode: gscKeywords.length > 0 ? 'gsc-keywords' : 'per-blog', // Use GSC keywords if available
    gscExactKeywords: gscKeywords.length > 0 ? gscKeywords : undefined,
    optionalPrompt: finalPromptModifier,
    featuredImagePerBlog: featuredImage,
    connectedSite: { name: site.name, siteUrl: site.siteUrl },
    onProgress: handleHookProgress,
    keywordAnalysisResults: keywordAnalysisResults.size > 0 ? keywordAnalysisResults : undefined,
  });
  
  // Sync blog generated rows to templates when they update
  useEffect(() => {
    if (postType === 'post' && blogGeneratedRows.length > 0 && !isGeneratingBlogChecklist) {
      const blogRows: CSVRow[] = blogGeneratedRows.map(post => ({
        keyword: post.keyword || '',
        entity: '', // NO entities for blog posts
        title: post.title || '',
        modifier: post.modifier || finalPromptModifier || undefined,
        featuredImage: featuredImage ? (post.featuredImage || 'y') : 'n'
      }));

      setGeneratedTemplates(prev => {
        // Only update if we have blog rows and they're different
        const existingBlogCount = prev.filter(t => !t.entity).length;
        if (blogRows.length > 0 && existingBlogCount !== blogRows.length) {
          // Replace blog rows, keep service area rows
          const serviceRows = prev.filter(t => t.entity);
          return [...blogRows, ...serviceRows];
        }
        return prev;
      });
    }
  }, [blogGeneratedRows, isGeneratingBlogChecklist, postType, promptModifier]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedTemplates([]);
    setProgress(0);
    setCurrentStep('Initializing...');

    try {
      if (!apiKey) {
        toast.error('OpenRouter API key is required. Please set it in Settings.');
        setIsGenerating(false);
        setProgress(0);
        setCurrentStep('');
        return;
      }
      
      // Validate service area keyword if service areas are requested
      if (serviceAreaCount > 0 && !serviceAreaKeyword.trim()) {
        toast.error('Service Area Keyword is required when generating service areas.');
        setIsGenerating(false);
        setProgress(0);
        setCurrentStep('');
        return;
      }

      // Calculate total steps dynamically
      const hasBlogPosts = postType === 'post' && blogPostCount > 0;
      const hasServiceAreas = serviceAreaCount > 0;
      const totalSteps = (hasBlogPosts ? 3 : 0) + (hasServiceAreas ? 1 : 0);
// Find service area sitemap URL upfront (if needed)
      let serviceAreaSitemapUrl = sitemapUrl;
      if (hasServiceAreas && postType === 'post' && site.sitemaps?.childSitemaps) {
        const serviceAreaSitemap = site.sitemaps.childSitemaps.find(url => 
          url.toLowerCase().includes('service-area') || 
          url.toLowerCase().includes('service_area') ||
          url.toLowerCase().includes('servicearea')
        );
        if (serviceAreaSitemap) {
          serviceAreaSitemapUrl = serviceAreaSitemap;
        }
      }

      const allTemplates: CSVRow[] = [];
      
      // Step 1: Analyze WP pages for patterns
      // When both are requested, analyze BOTH sitemaps separately
      let blogPostAnalysis: WPPageAnalysis | null = null;
      let serviceAreaAnalysis: WPPageAnalysis | null = null;

      if (hasBlogPosts) {
        setProgress(5);
        setCurrentStep('Analyzing WordPress blog posts...');
        toast.info(`Step 1/${totalSteps}: Analyzing WordPress blog posts from ${sitemapUrl}...`);
        
        blogPostAnalysis = await analyzeWordPressPages(
          site,
          sitemapUrl,
          'post',
          20, // sample size
          (message, progress) => {
            if (progress !== undefined) {
              // If both types: blogs use 0-9%, if only blogs: use 0-19%
              const maxProgress = hasServiceAreas ? 9 : 19;
              setProgress(Math.min(progress / 100 * maxProgress, maxProgress));
            }
            setCurrentStep(message);
          }
        );
        
        const progressAfterBlog = hasServiceAreas ? 10 : 20;
        setProgress(progressAfterBlog);
        toast.success(`Step 1/${totalSteps} Complete: Analyzed ${blogPostAnalysis.examples.length} blog post pages${blogPostAnalysis.titlePattern ? `. Title pattern: "${blogPostAnalysis.titlePattern}"` : ' (no title pattern found)'}${blogPostAnalysis.metaDescriptionPattern ? `. Meta pattern: "${blogPostAnalysis.metaDescriptionPattern}"` : ''}`);
      }

      if (hasServiceAreas) {
// Step 1a: Scrape service area sitemap first (like the scrape button does)
        // This is required for child sitemaps to get the actual content
        setProgress(hasBlogPosts ? 10 : 5);
        setCurrentStep('🔍 Scraping service area sitemap...');
        toast.info(`Step ${hasBlogPosts ? '1a' : '1'}/${totalSteps}: Scraping service area sitemap from ${serviceAreaSitemapUrl}...`);
        
        try {
          await scrapeChildSitemap(
            site,
            serviceAreaSitemapUrl,
            (message) => {
              setCurrentStep(message);
              // Progress: 10-14% if both, 5-9% if only service areas
              const minProgress = hasBlogPosts ? 10 : 5;
              const maxProgress = hasBlogPosts ? 14 : 9;
              // Simple progress update based on message
              if (message.includes('Fetching content')) {
                setProgress(minProgress + 2);
              } else if (message.includes('Adding')) {
                setProgress(minProgress + 3);
              }
            }
          );
          setProgress(hasBlogPosts ? 15 : 10);
          toast.success(`Step ${hasBlogPosts ? '1a' : '1'}/${totalSteps} Complete: Scraped service area sitemap`);
        } catch (error) {
          console.warn('[PostPagePackGenerator] Service area sitemap scraping failed, continuing with analysis:', error);
          toast.warning(`Service area sitemap scraping had issues, continuing with analysis...`);
        }
        
        // Step 1b: Analyze service area pages (now that they're in knowledge base)
        setProgress(hasBlogPosts ? 15 : 10);
        setCurrentStep('Analyzing WordPress service area pages...');
        toast.info(`Step ${hasBlogPosts ? '1b' : '1'}/${totalSteps}: Analyzing WordPress service area pages from ${serviceAreaSitemapUrl}...`);
        
        serviceAreaAnalysis = await analyzeWordPressPages(
          site,
          serviceAreaSitemapUrl,
          'service-area',
          20, // sample size
          (message, progress) => {
            if (progress !== undefined) {
              // If both types: service areas use 15-19%, if only service areas: use 10-19%
              const minProgress = hasBlogPosts ? 15 : 10;
              const maxProgress = hasBlogPosts ? 19 : 19;
              setProgress(minProgress + Math.min(progress / 100 * (maxProgress - minProgress), maxProgress - minProgress));
            }
            setCurrentStep(message);
          }
        );
        
        setProgress(hasBlogPosts ? 20 : 20);
        toast.success(`Step ${hasBlogPosts ? '1b' : '1'}/${totalSteps} Complete: Analyzed ${serviceAreaAnalysis.examples.length} service area pages${serviceAreaAnalysis.titlePattern ? `. Title pattern: "${serviceAreaAnalysis.titlePattern}"` : ' (no title pattern found)'}${serviceAreaAnalysis.metaDescriptionPattern ? `. Meta pattern: "${serviceAreaAnalysis.metaDescriptionPattern}"` : ''}`);
      }

      // Use the appropriate analysis (for backward compatibility when only one type is requested)
      const wpAnalysis = blogPostAnalysis || serviceAreaAnalysis || null;
      if (!wpAnalysis) {
        throw new Error('No analysis available');
      }

      // Step 2: Generate service areas FIRST (if requested) - before blog posts
      if (serviceAreaCount > 0) {
const apiKeyForService = loadApiKey();
        if (!apiKeyForService) {
throw new Error('API key required for service area generation');
        }
        
        // MUST use serviceAreaAnalysis for service areas - never use wpAnalysis
        if (!serviceAreaAnalysis) {
throw new Error('Service area analysis not available - service area sitemap must be analyzed first');
        }
        
        // Use agentic entity flow (read previous → DFS query → SERP → wiki-validate); count = user input
        const serviceAreaStepNum = hasBlogPosts ? 2 : 2;
        setProgress(hasBlogPosts ? 25 : 25);
        setCurrentStep(`🤖 Generating ${serviceAreaCount} service area entities (agentic wiki research)...`);
        toast.info(`Step ${serviceAreaStepNum}/${totalSteps}: Generating ${serviceAreaCount} service area page${serviceAreaCount !== 1 ? 's' : ''}...`);
        
        try {
          // Extract keyword from scraped service area examples - MUST use serviceAreaAnalysis, not wpAnalysis
          let extractedKeyword = serviceAreaKeyword; // Default to user input
          
          if (serviceAreaAnalysis && serviceAreaAnalysis.examples && serviceAreaAnalysis.examples.length > 0) {
            for (const example of serviceAreaAnalysis.examples) {
              const title = example.title;
              const nearMatch = title.match(/^(.+?)\s+(?:Near|near|in|In)\s+/i);
              if (nearMatch && nearMatch[1]) {
                extractedKeyword = nearMatch[1].trim();
                break;
              }
              const colonMatch = title.match(/^([^:]+?):/);
              if (colonMatch && colonMatch[1]) {
                const beforeColon = colonMatch[1].trim();
                const nearInColon = beforeColon.match(/^(.+?)\s+(?:Near|near|in|In)\s+/i);
                if (nearInColon && nearInColon[1]) {
                  extractedKeyword = nearInColon[1].trim();
                  break;
                } else if (beforeColon.length > 0 && beforeColon.length < 100) {
                  extractedKeyword = beforeColon;
                  break;
                }
              }
            }
            if (extractedKeyword === serviceAreaKeyword && serviceAreaAnalysis.examples[0]?.url) {
              try {
                const urlObj = new URL(serviceAreaAnalysis.examples[0].url);
                const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
                const serviceAreaIndex = pathSegments.findIndex(seg =>
                  seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
                );
                if (serviceAreaIndex >= 0 && serviceAreaIndex > 0) {
                  const potentialKeyword = pathSegments[serviceAreaIndex - 1]
                    .split('-')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                  if (potentialKeyword && potentialKeyword.length < 50) {
                    extractedKeyword = potentialKeyword;
                  }
                }
              } catch {
                // keep default
              }
            }
          }
          
          let entitiesResult;
          try {
            entitiesResult = await generateEntities(
              {
                site,
                sitemapUrl: serviceAreaSitemapUrl,
                count: serviceAreaCount,
              },
              (msg) => toast.info(msg)
            );
          } catch (genError) {
            console.error('[PostPagePackGenerator] generateEntities failed:', genError);
            throw new Error(`Failed to generate entities: ${genError instanceof Error ? genError.message : 'Unknown error'}`);
          }
          
          if (!entitiesResult?.entities?.length) {
            throw new Error('No entities generated. Please check your sitemap and settings.');
          }
          
          const serviceRows: CSVRow[] = entitiesResult.entities.map((e) => ({
            keyword: extractedKeyword,
            entity: e.entity,
            title: `${extractedKeyword} Near ${e.entity}`,
            modifier: finalPromptModifier || undefined,
            featuredImage: 'n'
          }));
allTemplates.push(...serviceRows);
setProgress(hasBlogPosts ? 45 : 95);
          setCurrentStep(`✅ Completed: ${serviceRows.length} service area template${serviceRows.length !== 1 ? 's' : ''} generated`);
          toast.success(`Step ${serviceAreaStepNum}/${totalSteps} Complete: Generated ${serviceRows.length} service area template${serviceRows.length !== 1 ? 's' : ''}`);
        } catch (error) {
console.error('[PostPagePackGenerator] Service area generation failed:', error);
          toast.error(`Service area generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Don't throw - allow blog posts to succeed even if service areas fail
        }
      }

      // Step 3: Generate blog posts (if post sitemap) using the hook - AFTER service areas
      if (postType === 'post' && blogPostCount > 0) {
        // Step 3a: Analyze GSC performance for keywords
        setProgress(hasServiceAreas ? 50 : 25);
        setCurrentStep('Fetching GSC query data...');
        toast.info(`Step ${hasServiceAreas ? 3 : 2}/${totalSteps || 3}: Fetching GSC query data for ${site.name}...`);
        let gscKeywordsArray: string[] = [];
        let gscRecommendations: any = null;
        
        try {
          setProgress(26);
          setCurrentStep('📊 Fetching GSC query data...');
          gscRecommendations = await analyzeGSCPerformance(site, 'post');
          if (gscRecommendations && gscRecommendations.recommendedKeywords.length > 0) {
            setProgress(32);
            setCurrentStep(`🔍 Processing ${gscRecommendations.recommendedKeywords.length} GSC keywords...`);
            toast.info(`Step 2/3: Processing ${gscRecommendations.recommendedKeywords.length} GSC keywords, filtering for quick wins...`);
            
            // Prioritize quick wins (positions 11-20), sorted by impressions
            setProgress(35);
            setCurrentStep(`🎯 Filtering for quick wins (positions 11-20)...`);
            const quickWins = gscRecommendations.recommendedKeywords
              .filter(k => k.position >= 11 && k.position <= 20)
              .sort((a, b) => b.impressions - a.impressions);
            
            setProgress(38);
            setCurrentStep(`📈 Sorting remaining keywords by impressions...`);
            const others = gscRecommendations.recommendedKeywords
              .filter(k => k.position < 11 || k.position > 20)
              .sort((a, b) => b.impressions - a.impressions);
            
            // Combine: quick wins first, then others
            setProgress(40);
            setCurrentStep(`🔗 Combining ${quickWins.length} quick wins + ${others.length} others...`);
            const sortedKeywords = [...quickWins, ...others]
              .slice(0, blogPostCount * 3) // Get more keywords than needed for variety
              .map(k => k.keyword);
            
            gscKeywordsArray = sortedKeywords;
            const quickWinsCount = quickWins.length;
            const totalSelected = sortedKeywords.length;
            setProgress(45);
            setCurrentStep(`✅ Selected ${totalSelected} keywords (${quickWinsCount} quick wins, ${others.length} others)`);
            toast.success(`Step 2/${totalSteps || 3} Complete: Selected ${totalSelected} keywords from ${gscRecommendations.recommendedKeywords.length} total (${quickWinsCount} quick wins in positions 11-20, ${others.length} others)`);
          } else {
            setProgress(40);
            setCurrentStep('📝 Using WordPress post titles as keywords...');
            toast.info(`Step 2/${totalSteps || 3}: No GSC keywords found. Will use WordPress post titles as keyword sources instead.`);
          }
        } catch (error) {
          console.warn('[PostPagePackGenerator] GSC analysis failed, continuing without it:', error);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          toast.warning(`Step 2/${totalSteps || 3} Warning: GSC analysis failed (${errorMsg}). Continuing with WordPress data instead.`);
        }

        // Step 2b: Perform keyword AI analysis for selected keywords (Death Star module logic)
        const analysisResults = new Map<string, KeywordAIAnalysis>();
        const dataForSEOApiKey = loadDataForSEOApiKey();
        const openRouterApiKey = loadApiKey();
        
        // Select top keywords for analysis (up to blogPostCount * 2 to get enough variety)
        const keywordsToAnalyze = gscKeywordsArray.slice(0, Math.min(blogPostCount * 2, gscKeywordsArray.length));
        
        if (keywordsToAnalyze.length > 0 && dataForSEOApiKey && openRouterApiKey) {
          try {
            setProgress(46);
            setCurrentStep(`📊 Analyzing ${keywordsToAnalyze.length} keywords with AI (Death Star module)...`);
            toast.info(`Step 2b/${totalSteps || 3}: Analyzing ${keywordsToAnalyze.length} keywords with AI for comprehensive insights...`);
            
            // Create a map of keyword to GSC data for creating KeywordSelection objects
            const keywordToGSCData = new Map<string, { query: string; clicks: number; impressions: number; ctr: number; position: number }>();
            if (gscRecommendations.recommendedKeywords) {
              for (const kw of gscRecommendations.recommendedKeywords) {
                keywordToGSCData.set(kw.keyword.toLowerCase(), {
                  query: kw.keyword,
                  clicks: kw.clicks || 0,
                  impressions: kw.impressions || 0,
                  ctr: kw.ctr || 0,
                  position: kw.position || 0,
                });
              }
            }
            
            // Analyze each keyword with full Death Star module logic
            for (let i = 0; i < keywordsToAnalyze.length; i++) {
              const keyword = keywordsToAnalyze[i];
              const keywordLower = keyword.toLowerCase();
              
              setProgress(46 + (i / keywordsToAnalyze.length) * 4); // 46-50% for analysis
              setCurrentStep(`🔍 Analyzing keyword ${i + 1}/${keywordsToAnalyze.length}: "${keyword}"...`);
              
              try {
                // Get GSC data for this keyword if available
                const gscData = keywordToGSCData.get(keywordLower) || {
                  query: keyword,
                  clicks: 0,
                  impressions: 0,
                  ctr: 0,
                  position: 0,
                };
                
                // Step 1: Perform keyword research (fetches keyword metrics and SERP data)
                const researchResult = await performKeywordResearch(
                  keyword,
                  gscData,
                  (progress) => {
                    setCurrentStep(`📊 ${progress.message || progress.step || `Researching "${keyword}"...`}`);
                  },
                  gscKeywordsArray.filter(k => k.toLowerCase() !== keywordLower).slice(0, 10) // Related GSC keywords
                );
                
                // Step 2: Perform AI analysis (Death Star module)
                const aiAnalysis = await performAIAnalysis(
                  researchResult.keywordData,
                  site,
                  researchResult.paaRawResponse,
                  (progress) => {
                    setCurrentStep(`🤖 ${progress.message || progress.step || `Analyzing "${keyword}" with AI...`}`);
                  },
                  gscKeywordsArray.filter(k => k.toLowerCase() !== keywordLower).slice(0, 10), // Related GSC keywords
                  getResearchModel(site.id)
                );
                
                // Store analysis result
                analysisResults.set(keyword, aiAnalysis);
                
                console.log(`[PostPagePackGenerator] Keyword analysis complete for "${keyword}":`, {
                  variations: aiAnalysis.keywordSuggestions?.variations?.length || 0,
                  h2s: aiAnalysis.h2Suggestions?.length || 0,
                  contentGaps: aiAnalysis.contentGaps?.length || 0,
                  paa: aiAnalysis.peopleAlsoAsk?.length || 0,
                  researchLinks: aiAnalysis.researchLinks?.length || 0,
                });
              } catch (error) {
                console.error(`[PostPagePackGenerator] Error analyzing keyword "${keyword}":`, error);
                // Continue with other keywords even if one fails
                toast.warning(`Keyword analysis failed for "${keyword}", continuing...`);
              }
            }
            
            setKeywordAnalysisResults(analysisResults);
            setProgress(50);
            setCurrentStep(`✅ Keyword analysis complete: ${analysisResults.size} keywords analyzed`);
            toast.success(`Step 2b/${totalSteps || 3} Complete: Analyzed ${analysisResults.size} keywords with AI (Death Star module)`);
          } catch (error) {
            console.error('[PostPagePackGenerator] Error in keyword analysis step:', error);
            toast.warning('Keyword analysis had issues, continuing with basic keyword selection...');
          }
        }

        // Step 2c: Update GSC keywords state and trigger generation
        setGscKeywords(gscKeywordsArray);
        const currentModifier = buildPromptModifier();
        setProgress(50);
        setCurrentStep(`🤖 Initializing AI generation for ${blogPostCount} blog post${blogPostCount !== 1 ? 's' : ''}...`);
        toast.info(`Step 3/${totalSteps || 3}: Generating ${blogPostCount} blog post${blogPostCount !== 1 ? 's' : ''} using AI${gscKeywordsArray.length > 0 ? ` with ${gscKeywordsArray.length} GSC keywords` : ''}${analysisResults.size > 0 ? ` and ${analysisResults.size} analyzed keywords` : ''}${currentModifier ? ` (modifier: "${currentModifier}")` : ''}...`);
        
        // Wait for state update, then trigger generation
        // The hook will re-render with new gscKeywords, then we call handleGenerateChecklist
        // Progress updates will now come from the hook's onProgress callback
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await handleGenerateBlogChecklist();
        
        // Wait for generation to complete - progress is now handled by hook callbacks
        let waitCount = 0;
        const maxWait = 200; // Increase max wait time
        let lastGeneratedCount = blogGeneratedRows.length;
        
        while (isGeneratingBlogChecklist && waitCount < maxWait) {
          const currentGeneratedCount = blogGeneratedRows.length;
          
          // Only update if we see new posts generated (hook handles progress updates)
          if (currentGeneratedCount > lastGeneratedCount) {
            const latestPost = blogGeneratedRows[currentGeneratedCount - 1];
            setCurrentStep(`✨ Post ${currentGeneratedCount}/${blogPostCount}: "${latestPost?.title?.substring(0, 45) || 'Generating...'}..."`);
            lastGeneratedCount = currentGeneratedCount;
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
          waitCount++;
        }
        
        // Get results from hook state (synced via useEffect) with detailed processing
        if (blogGeneratedRows.length > 0) {
          setProgress(90);
          setCurrentStep(`📦 Processing ${blogGeneratedRows.length} generated blog post${blogGeneratedRows.length !== 1 ? 's' : ''}...`);
          toast.info(`Processing ${blogGeneratedRows.length} generated blog post${blogGeneratedRows.length !== 1 ? 's' : ''}...`);
          
          // Show detailed post-by-post processing
          const blogRows: CSVRow[] = [];
          for (let i = 0; i < blogGeneratedRows.length; i++) {
            const post = blogGeneratedRows[i];
            setProgress(90 + (i / blogGeneratedRows.length) * 5);
            setCurrentStep(`📝 Processing post ${i + 1}/${blogGeneratedRows.length}: "${post.title?.substring(0, 45) || 'Untitled'}..."`);
            
            blogRows.push({
              keyword: post.keyword || '',
              entity: '',
              title: post.title || '',
              modifier: post.modifier || finalPromptModifier || undefined,
              featuredImage: featuredImage ? (post.featuredImage || 'y') : 'n'
            });
            
            // Small delay to show progress
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          allTemplates.push(...blogRows);
          setProgress(95);
          setCurrentStep(`✅ Completed: ${blogRows.length} blog post template${blogRows.length !== 1 ? 's' : ''} generated successfully!`);
          toast.success(`Step ${hasServiceAreas ? 3 : 2}/${totalSteps} Complete: Generated ${blogRows.length} blog post template${blogRows.length !== 1 ? 's' : ''}`);
        } else {
          setProgress(0);
          setCurrentStep('❌ Generation failed');
          toast.warning('Step 3/3: No blog posts were generated. Please try again.');
        }
      }
if (allTemplates.length === 0) {
setProgress(0);
        setCurrentStep('');
        throw new Error('No templates were generated. Please check your settings.');
      }

      setProgress(100);
      setCurrentStep(`Success! ${allTemplates.length} template${allTemplates.length !== 1 ? 's' : ''} generated`);
setGeneratedTemplates(allTemplates);
      
      // Detailed success message
      const blogCount = allTemplates.filter(t => !t.entity).length;
      const serviceCount = allTemplates.filter(t => t.entity).length;
      let successMsg = `✅ All steps complete! Generated ${allTemplates.length} template${allTemplates.length !== 1 ? 's' : ''}`;
      if (blogCount > 0 && serviceCount > 0) {
        successMsg += `: ${blogCount} blog post${blogCount !== 1 ? 's' : ''} and ${serviceCount} service area${serviceCount !== 1 ? 's' : ''}`;
      } else if (blogCount > 0) {
        successMsg += ` (${blogCount} blog post${blogCount !== 1 ? 's' : ''})`;
      } else if (serviceCount > 0) {
        successMsg += ` (${serviceCount} service area${serviceCount !== 1 ? 's' : ''})`;
      }
      toast.success(successMsg);
      
      setIsGenerating(false);

    } catch (error) {
      console.error('[PostPagePackGenerator] Error generating pack:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate pack');
      setProgress(0);
      setCurrentStep('Generation failed');
      setIsGenerating(false);
    } finally {
      if (progress < 100) {
        setTimeout(() => {
          setProgress(0);
          setCurrentStep('');
        }, 2000);
      }
    }
  };

  const handleDownloadCSV = () => {
    if (generatedTemplates.length === 0) {
      toast.error('No templates to download');
      return;
    }

    // Convert to CSV format
    const csv = Papa.unparse(generatedTemplates, {
      columns: ['keyword', 'entity', 'title', 'modifier', 'featuredImage'],
      header: true
    });

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `post-page-pack-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV file downloaded!');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Post &amp; Page Pack</DialogTitle>
          <DialogDescription>
            Generate blog posts using GSC recommendations and WP analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress Bar */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{currentStep || 'Processing...'}</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {postType === 'post' && (
            <div className="space-y-2">
              <Label htmlFor="blogPostCount">Number of Blog Posts</Label>
              <Input
                id="blogPostCount"
                type="number"
                min="1"
                max="50"
                value={blogPostCount}
                onChange={(e) => setBlogPostCount(parseInt(e.target.value) || 3)}
                disabled={isGenerating}
              />
            </div>
          )}

          {/* Content Type Toggles */}
          {postType === 'post' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Content Type Options</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="versus-post" className="text-sm font-normal">
                        Versus/Comparison Posts
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Generate comparison-style content (e.g., &quot;X vs Y&quot;)
                      </p>
                    </div>
                    <Switch
                      id="versus-post"
                      checked={versusPost}
                      onCheckedChange={setVersusPost}
                      disabled={isGenerating || isGeneratingBlogChecklist}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="guide-post" className="text-sm font-normal">
                        Comprehensive Guides
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Generate detailed, step-by-step guide content
                      </p>
                    </div>
                    <Switch
                      id="guide-post"
                      checked={guidePost}
                      onCheckedChange={setGuidePost}
                      disabled={isGenerating || isGeneratingBlogChecklist}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="featured-image" className="text-sm font-normal">
                        Include Featured Images
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Generate featured images for each blog post
                      </p>
                    </div>
                    <Switch
                      id="featured-image"
                      checked={featuredImage}
                      onCheckedChange={setFeaturedImage}
                      disabled={isGenerating || isGeneratingBlogChecklist}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="promptModifier">Additional Prompt Modifier (Optional)</Label>
            <Textarea
              id="promptModifier"
              placeholder="e.g., 'versus posts', 'comprehensive guides', etc."
              value={promptModifier}
              onChange={(e) => setPromptModifier(e.target.value)}
              disabled={isGenerating}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Additional custom instructions for content generation. Will be combined with selected content type options above.
            </p>
          </div>

          {/* Generated Templates */}
          {generatedTemplates.length > 0 && (
            <div className="space-y-2">
              <Label>Generated Templates ({generatedTemplates.length})</Label>
              <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
                {generatedTemplates.map((template, index) => (
                  <div key={index} className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">{template.title || `Template ${index + 1}`}</div>
                    {template.keyword && (
                      <div className="text-muted-foreground text-xs mt-1">
                        Keyword: {template.keyword}
                      </div>
                    )}
                    {template.entity && (
                      <div className="text-muted-foreground text-xs">
                        Entity: {template.entity}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating || isGeneratingBlogChecklist}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadCSV}
            disabled={generatedTemplates.length === 0 || isGenerating || isGeneratingBlogChecklist}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || isGeneratingBlogChecklist || !apiKey}
          >
            {isGenerating || isGeneratingBlogChecklist ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Pack'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
