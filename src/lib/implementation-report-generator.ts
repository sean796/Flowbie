import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { htmlToMarkdown } from "@/lib/wordpress-converter";

export interface ContentComparison {
  originalTitle: string;
  newTitle: string;
  originalExcerpt: string;
  newExcerpt: string;
  originalContent: string; // markdown
  newContent: string; // markdown
  primaryKeyword: string;
  clusterKeywords?: string[];
  selectedKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  blueprintResult?: any;
  updateMode: 'update' | 'draft';
  url: string;
}

/**
 * Generate an Implementation Report comparing original vs optimized content
 */
export async function generateImplementationReport(
  comparison: ContentComparison,
  fileManager: OptimizationFileManager
): Promise<string> {
  const {
    originalTitle,
    newTitle,
    originalExcerpt,
    newExcerpt,
    originalContent,
    newContent,
    primaryKeyword,
    clusterKeywords = [],
    selectedKeyword,
    blueprintResult,
    updateMode,
    url
  } = comparison;

  // Convert HTML to markdown if needed (originalContent might be HTML)
  let originalMarkdown = originalContent;
  try {
    // Check if it's HTML by looking for HTML tags
    if (originalContent.includes('<') && originalContent.includes('>')) {
      originalMarkdown = htmlToMarkdown(originalContent);
    }
  } catch (error) {
    console.warn('[Implementation Report] Could not convert original content to markdown:', error);
  }

  const report: string[] = [];

  // Header
  report.push('# Implementation Report');
  report.push('');
  report.push(`**Generated:** ${new Date().toLocaleString()}`);
  report.push(`**URL:** ${url}`);
  report.push(`**Mode:** ${updateMode === 'update' ? 'Update Existing Post' : 'Create New Draft'}`);
  report.push('');

  // Executive Summary
  report.push('## Executive Summary');
  report.push('');
  report.push(`This report documents the changes made to optimize content for the keyword **"${primaryKeyword}"**.`);
  report.push('');
  
  if (updateMode === 'update') {
    report.push('The existing post has been updated with optimized content to improve SEO performance and user engagement.');
  } else {
    report.push('A new draft has been created with optimized content based on the original post.');
  }
  report.push('');

  // Keyword Strategy
  report.push('## Keyword Strategy');
  report.push('');
  report.push('### Primary Keyword');
  report.push(`- **Keyword:** ${primaryKeyword}`);
  report.push(`- **GSC Clicks:** ${selectedKeyword.clicks || 0}`);
  report.push(`- **GSC Impressions:** ${selectedKeyword.impressions || 0}`);
  report.push(`- **Average Position:** ${selectedKeyword.position > 0 ? selectedKeyword.position.toFixed(1) : 'N/A'}`);
  report.push(`- **CTR:** ${selectedKeyword.ctr > 0 ? (selectedKeyword.ctr * 100).toFixed(2) + '%' : 'N/A'}`);
  report.push('');

  if (clusterKeywords && clusterKeywords.length > 0) {
    report.push('### Cluster Keywords');
    report.push(`The following ${clusterKeywords.length} related keywords were included in the optimization:`);
    report.push('');
    clusterKeywords.forEach((kw, idx) => {
      report.push(`${idx + 1}. ${kw}`);
    });
    report.push('');
  }

  // Title Comparison
  report.push('## Title Changes');
  report.push('');
  if (originalTitle !== newTitle) {
    report.push('### Before');
    report.push(`\`${originalTitle}\``);
    report.push('');
    report.push('### After');
    report.push(`\`${newTitle}\``);
    report.push('');
    report.push('### Why Changed');
    report.push(`The title was updated to better incorporate the primary keyword "${primaryKeyword}" and improve SEO visibility while maintaining readability.`);
  } else {
    report.push('**No changes** - Title remained the same.');
  }
  report.push('');

  // Meta Description Comparison
  report.push('## Meta Description Changes');
  report.push('');
  if (originalExcerpt !== newExcerpt) {
    report.push('### Before');
    report.push(`> ${originalExcerpt || '(No meta description)'}`);
    report.push('');
    report.push('### After');
    report.push(`> ${newExcerpt || '(No meta description)'}`);
    report.push('');
    report.push('### Why Changed');
    report.push('The meta description was regenerated to provide a more compelling summary that includes the primary keyword and encourages click-through.');
  } else {
    report.push('**No changes** - Meta description remained the same.');
  }
  report.push('');

  // Content Statistics
  report.push('## Content Statistics');
  report.push('');
  
  const originalWordCount = originalMarkdown.split(/\s+/).filter(w => w.length > 0).length;
  const newWordCount = newContent.split(/\s+/).filter(w => w.length > 0).length;
  const wordCountDiff = newWordCount - originalWordCount;
  const wordCountPercent = originalWordCount > 0 ? ((wordCountDiff / originalWordCount) * 100).toFixed(1) : '0';

  const originalCharCount = originalMarkdown.length;
  const newCharCount = newContent.length;
  const charCountDiff = newCharCount - originalCharCount;

  const originalH2Count = (originalMarkdown.match(/^##\s+/gm) || []).length;
  const newH2Count = (newContent.match(/^##\s+/gm) || []).length;
  const h2Diff = newH2Count - originalH2Count;

  report.push('| Metric | Original | Optimized | Change |');
  report.push('|--------|----------|-----------|--------|');
  report.push(`| Word Count | ${originalWordCount.toLocaleString()} | ${newWordCount.toLocaleString()} | ${wordCountDiff >= 0 ? '+' : ''}${wordCountDiff.toLocaleString()} (${wordCountPercent}%) |`);
  report.push(`| Character Count | ${originalCharCount.toLocaleString()} | ${newCharCount.toLocaleString()} | ${charCountDiff >= 0 ? '+' : ''}${charCountDiff.toLocaleString()} |`);
  report.push(`| H2 Headings | ${originalH2Count} | ${newH2Count} | ${h2Diff >= 0 ? '+' : ''}${h2Diff} |`);
  report.push('');

  // Content Structure Analysis
  report.push('## Content Structure Analysis');
  report.push('');

  // Extract H2 headings from both versions
  const originalH2s = (originalMarkdown.match(/^##\s+(.+)$/gm) || []).map(h => h.replace(/^##\s+/, '').trim());
  const newH2s = (newContent.match(/^##\s+(.+)$/gm) || []).map(h => h.replace(/^##\s+/, '').trim());

  if (newH2s.length > 0) {
    report.push('### New H2 Structure');
    report.push('');
    newH2s.forEach((h2, idx) => {
      const wasInOriginal = originalH2s.some(oh => oh.toLowerCase() === h2.toLowerCase());
      const marker = wasInOriginal ? '✓' : '🆕';
      report.push(`${idx + 1}. ${marker} ${h2}`);
    });
    report.push('');
  }

  // Keyword Density Analysis
  report.push('## Keyword Optimization');
  report.push('');
  
  const primaryKeywordLower = primaryKeyword.toLowerCase();
  const originalKeywordCount = (originalMarkdown.toLowerCase().match(new RegExp(primaryKeywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const newKeywordCount = (newContent.toLowerCase().match(new RegExp(primaryKeywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  
  const originalDensity = originalWordCount > 0 ? ((originalKeywordCount / originalWordCount) * 100).toFixed(2) : '0.00';
  const newDensity = newWordCount > 0 ? ((newKeywordCount / newWordCount) * 100).toFixed(2) : '0.00';

  report.push('### Primary Keyword Usage');
  report.push('');
  report.push(`- **Original:** ${originalKeywordCount} occurrences (${originalDensity}% density)`);
  report.push(`- **Optimized:** ${newKeywordCount} occurrences (${newDensity}% density)`);
  report.push(`- **Change:** ${newKeywordCount - originalKeywordCount >= 0 ? '+' : ''}${newKeywordCount - originalKeywordCount} occurrences`);
  report.push('');
  report.push('> **Note:** Optimal keyword density is typically 1-2%. Higher density may indicate keyword stuffing.');
  report.push('');

  // SEO Improvements
  report.push('## SEO Improvements Made');
  report.push('');
  
  const improvements: string[] = [];

  if (newWordCount > originalWordCount) {
    improvements.push(`**Content Expansion:** Added ${wordCountDiff.toLocaleString()} words to provide more comprehensive coverage of the topic.`);
  }

  if (newH2Count > originalH2Count) {
    improvements.push(`**Structure Enhancement:** Added ${h2Diff} new H2 sections to improve content organization and scannability.`);
  }

  if (newKeywordCount > originalKeywordCount) {
    improvements.push(`**Keyword Optimization:** Increased primary keyword usage from ${originalKeywordCount} to ${newKeywordCount} occurrences for better SEO targeting.`);
  }

  if (clusterKeywords && clusterKeywords.length > 0) {
    improvements.push(`**Semantic Keywords:** Integrated ${clusterKeywords.length} related cluster keywords to improve topical relevance and entity salience.`);
  }

  if (blueprintResult?.agents && Array.isArray(blueprintResult.agents)) {
    improvements.push(`**Content Depth:** Generated ${blueprintResult.agents.length} detailed sections based on AI analysis and keyword research.`);
  }

  if (improvements.length > 0) {
    improvements.forEach((imp, idx) => {
      report.push(`${idx + 1}. ${imp}`);
    });
  } else {
    report.push('Content was optimized while maintaining similar structure and length.');
  }
  report.push('');

  // Key Changes Summary
  report.push('## Key Changes Summary');
  report.push('');
  report.push('### What Changed');
  report.push('');
  
  const changes: string[] = [];
  
  if (originalTitle !== newTitle) {
    changes.push(`- **Title:** Updated from "${originalTitle}" to "${newTitle}"`);
  }
  
  if (originalExcerpt !== newExcerpt) {
    changes.push(`- **Meta Description:** Regenerated to better reflect optimized content`);
  }
  
  if (wordCountDiff !== 0) {
    changes.push(`- **Length:** ${wordCountDiff > 0 ? 'Expanded' : 'Reduced'} by ${Math.abs(wordCountDiff).toLocaleString()} words`);
  }
  
  if (h2Diff !== 0) {
    changes.push(`- **Structure:** ${h2Diff > 0 ? 'Added' : 'Removed'} ${Math.abs(h2Diff)} H2 section${Math.abs(h2Diff) !== 1 ? 's' : ''}`);
  }
  
  if (newKeywordCount !== originalKeywordCount) {
    changes.push(`- **Keyword Usage:** ${newKeywordCount > originalKeywordCount ? 'Increased' : 'Decreased'} primary keyword occurrences by ${Math.abs(newKeywordCount - originalKeywordCount)}`);
  }

  if (changes.length > 0) {
    changes.forEach(change => report.push(change));
  } else {
    report.push('- Content was refined and optimized while maintaining core structure');
  }
  report.push('');

  // Why These Changes
  report.push('### Why These Changes Were Made');
  report.push('');
  report.push('The optimization process analyzed:');
  report.push('');
  report.push('1. **GSC Performance Data:** Used actual search performance metrics (clicks, impressions, position) to identify optimization opportunities');
  report.push('2. **Keyword Research:** Conducted comprehensive keyword research to identify related terms and semantic variations');
  report.push('3. **AI Analysis:** Leveraged AI to analyze keyword intent, competition, and content gaps');
  report.push('4. **Blueprint Generation:** Created a structured optimization plan based on best practices and SEO guidelines');
  report.push('5. **Content Generation:** Generated optimized content that incorporates target keywords naturally while maintaining readability');
  report.push('');

  if (selectedKeyword.position > 0 && selectedKeyword.position < 20) {
    report.push(`**Current Performance:** The keyword "${primaryKeyword}" is currently ranking at position ${selectedKeyword.position.toFixed(1)}, indicating there is potential to improve visibility with optimized content.`);
  } else if (selectedKeyword.impressions > 0 && selectedKeyword.clicks === 0) {
    report.push(`**Opportunity:** The keyword "${primaryKeyword}" is receiving ${selectedKeyword.impressions} impressions but 0 clicks, suggesting the content needs optimization to improve click-through rates.`);
  }
  report.push('');

  // Footer
  report.push('---');
  report.push('');
  report.push(`*Report generated automatically by Agent Blueprint Builder*`);
  report.push(`*Optimization completed: ${new Date().toLocaleString()}*`);

  const reportContent = report.join('\n');
  
  // Save to file manager
  const reportFileName = OptimizationFileManager.generateFilename('implementation-report', primaryKeyword, 'md');
  fileManager.addFile(
    reportFileName,
    reportContent,
    'text/markdown'
  );

  return reportContent;
}

