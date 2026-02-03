import type { AgentConfig } from "@/components/AgentNode";
import type { GSCPerformanceStats } from "@/components/integrations/types";
import { formatMonthYearFromAPI, formatShortMonthYearFromAPI } from "./gsc-date-helpers";
import { generateBlueprintFromTemplate } from "./blog-template-builder";
import { getResearchModel } from "./optimization-settings-storage";
import type { BlogTemplateContext } from "./blog-template-builder";
import { streamChatCompletion } from "./api";
import { AGENCY_NAME } from "./report-planner";
import type { ReportPlan } from "./report-planner";
import type { ReportDiscoveryData } from "./report-discovery";

// ============================================================================
// EXECUTIVE-FRIENDLY GSC REPORT GENERATOR
// Clean, simple tables with AI analysis - designed for non-technical readers
// Agentic: adaptive sections when reportPlan + discoveryData provided
// ============================================================================

/**
 * Generate an executive-friendly report with simple tables and full AI analysis
 */
async function generateAIReportAnalysis(
  stats: GSCPerformanceStats,
  siteName: string,
  apiKey: string,
  model: string,
  historicalData?: HistoricalData | null
): Promise<{
  executiveSummary: { headline: string; keyWins: string[]; overview: string };
  keyPointsForTeam: string[];
  growthHighlights: { table: string; analysis: string };
  newSearchTerms: { table: string; analysis: string };
  topPerformers: { table: string; analysis: string };
  localPresence: { table: string; analysis: string };
  contentReach: { table: string; analysis: string };
  historicalContext: { summary: string; analysis: string };
  seasonalFactors: { detected: boolean; holidays: string[]; analysis: string };
  recommendations: string[];
  outlook: string;
}> {
  
  // Prepare keyword data for AI
  const keywordsData = stats.topKeywords.map(kw => ({
    term: kw.query,
    impressions: kw.currentImpressions,
    prevImpressions: kw.previousImpressions,
    clicks: kw.currentClicks,
    position: Math.round(kw.currentRanking * 10) / 10,
    prevPosition: Math.round(kw.previousRanking * 10) / 10,
    positionImproved: kw.rankingChange > 0,
    isNew: kw.previousImpressions === 0 && kw.currentImpressions > 0,
  }));

  const systemPrompt = `You are creating an EXECUTIVE SUMMARY report for a business owner who is NOT technical.
This report is prepared by ${AGENCY_NAME}, a digital marketing agency.

AUDIENCE: Business executives who want to see RESULTS and GROWTH, not technical jargon.

CRITICAL FORMATTING RULES:
1. NO EMOJIS - this is a professional business report
2. NO TECHNICAL JARGON - explain everything in plain business language
3. ONLY POSITIVE METRICS - hide negatives, reframe as "stable" or "maintaining position"
4. POSITION COLUMN IS REQUIRED in all tables - show Google ranking (lower = better)
5. Every table MUST have a detailed AI Analysis paragraph explaining what it means for the business
6. Focus on GROWTH, NEW OPPORTUNITIES, and WINS
7. Use business language: "visibility", "market reach", "customer discovery", "brand exposure"
8. KEY WINS MUST INCLUDE ACTUAL NUMBERS - e.g. "+500 more times shown" not just "increase"
9. Reference "${AGENCY_NAME}" when discussing strategy success or recommendations
10. DO NOT include click data or visitor counts - focus only on impressions (times shown) and positions
11. **STRICT REPORTING PERIOD - NON-NEGOTIABLE**: The user selected EXACT date ranges. You MUST use the exact period names (e.g. "December 2025" and "November 2025") throughout. NEVER say only "this month" or "last month" or just one period name. ALWAYS state BOTH: "December 2025 compared to November 2025" or "December 2025 (vs November 2025)". Table headers should say the actual period name (e.g. "December 2025" not "This Month", "November 2025" not "Last Month"). Growth comparisons must explicitly reference both periods.
12. **NUMBER CONSISTENCY - GSC IS SOURCE OF TRUTH**: All impressions and clicks must be the EXACT numbers provided in userData.metrics. Use them verbatim everywhere (key wins, growth highlights, infographic). GSC provides total monthly/period impressions and clicks with no filters. Never invent, round differently, or use alternate calculations. Numbers must be identical across key points, executive summary, infographic, and growth highlights.

TABLE FORMAT RULES:
- Keep tables simple: 2-3 columns max
- Always include: Search Term, Position (Google Rank), Times Shown (Impressions)
- DO NOT include clicks, visitors, or CTR - only impressions and position
- For new terms, add "NEW" badge in a Status column
- Format numbers with commas (1,234 not 1234)

Return this EXACT JSON structure:
{
  "executiveSummary": {
    "headline": "One powerful sentence with ACTUAL NUMBERS about the month's biggest win",
    "keyWins": ["Win with actual number: +500 more times shown in Google", "Win 2 with stats", "Win 3 with stats", "Win 4 with stats"],
    "overview": "2-3 sentence executive overview mentioning ${AGENCY_NAME}'s work and actual results achieved"
  },
  "growthHighlights": {
    "table": "| Metric | This Month | Growth |\\n| --- | --- | --- |\\n| Times Shown in Google | 5,000 | +500 (+11%) |\\n| Website Visitors from Search | 150 | +25 (+20%) |\\n| Pages Ranking in Google | 45 | +8 new pages |\\n| Search Terms Found For | 120 | +15 new terms |",
    "analysis": "A full paragraph (4-6 sentences) explaining what these numbers mean for the business. Reference ${AGENCY_NAME}'s strategy. Translate metrics into business impact."
  },
  "newSearchTerms": {
    "table": "| Search Term | Position | Times Shown | Status |\\n| --- | --- | --- | --- |\\n| custom blinds palm beach | 8.5 | 450 | NEW |",
    "analysis": "A full paragraph (4-6 sentences) analyzing what these new search terms mean. Credit ${AGENCY_NAME}'s content strategy for these new discoveries."
  },
  "topPerformers": {
    "table": "| Search Term | Position | Times Shown |\\n| --- | --- | --- |\\n| best term | 3.2 | 1,200 |",
    "analysis": "A full paragraph (4-6 sentences) about your strongest performing search terms with actual numbers. Explain the business impact."
  },
  "localPresence": {
    "table": "| Local Search Term | Position | Times Shown |\\n| --- | --- | --- |\\n| blinds near me | 5.1 | 320 |",
    "analysis": "A full paragraph (4-6 sentences) about local search visibility with specific numbers. Mention ${AGENCY_NAME}'s local SEO efforts."
  },
  "contentReach": {
    "table": "| Content Metric | Current | vs Last Month |\\n| --- | --- | --- |\\n| Pages Appearing in Google | 45 | +8 pages |\\n| Average Position | 15.2 | Improved by 2.1 |",
    "analysis": "A full paragraph (4-6 sentences) about content performance. Credit ${AGENCY_NAME}'s content strategy for the growth."
  },
  "historicalContext": {
    "summary": "2-3 sentences about the site's overall growth trajectory since ${AGENCY_NAME} started working on it",
    "analysis": "A full paragraph about long-term trends, total growth achieved, and how this month compares to the site's history"
  },
  "seasonalFactors": {
    "detected": true or false,
    "holidays": ["Holiday 1", "Holiday 2"] or empty array,
    "analysis": "If holidays detected, explain how they may have impacted search behavior. If no holidays, mention that this was a normal period."
  },
  "keyPointsForTeam": [
    "Short scannable bullet for ops/tech - e.g. 'Visibility up; new terms discovered'",
    "Another awareness point - no heavy stats",
    "3-5 more bullets total"
  ],
  "recommendations": [
    "Clear action item 1 - ${AGENCY_NAME} recommends...",
    "Clear action item 2",
    "Clear action item 3"
  ],
  "outlook": "2-3 sentence optimistic statement about continued growth with ${AGENCY_NAME}'s ongoing strategy."
}`;

  const userData = {
    siteName,
    period: {
      current: `${stats.currentPeriod.startDate} to ${stats.currentPeriod.endDate}`,
      previous: `${stats.comparisonPeriod.startDate} to ${stats.comparisonPeriod.endDate}`,
    },
    metrics: {
      impressions: { current: stats.currentPeriod.impressions, change: stats.comparisons.impressionsChange, pct: Math.round(stats.comparisons.impressionsChangePercent) },
      visitors: { current: stats.currentPeriod.clicks, change: stats.comparisons.clicksChange, pct: Math.round(stats.comparisons.clicksChangePercent) },
      avgPosition: { current: Math.round(stats.currentPeriod.avgPosition * 10) / 10, change: Math.round(stats.comparisons.avgPositionChange * 10) / 10 },
      searchTerms: { current: stats.currentPeriod.searchTermsCount, change: stats.comparisons.searchTermsChange },
      pages: { current: stats.currentPeriod.pagesCount, change: stats.comparisons.pagesChange },
    },
    keywords: keywordsData,
  };

  // Detect holidays in the reporting period
  const currentStart = new Date(stats.currentPeriod.startDate);
  const currentEnd = new Date(stats.currentPeriod.endDate);
  const holidays: string[] = [];
  
  // Check for major US holidays that impact search behavior
  const checkHoliday = (month: number, dayStart: number, dayEnd: number, name: string) => {
    const start = currentStart.getMonth();
    const end = currentEnd.getMonth();
    if (start <= month && end >= month) {
      holidays.push(name);
    }
  };
  
  // Major holidays
  if (currentStart.getMonth() === 11 || currentEnd.getMonth() === 11) {
    if (currentStart.getDate() <= 25 || currentEnd.getDate() >= 20) holidays.push('Christmas');
  }
  if (currentStart.getMonth() === 10 || currentEnd.getMonth() === 10) {
    holidays.push('Thanksgiving');
  }
  if (currentStart.getMonth() === 0 || currentEnd.getMonth() === 0) {
    if (currentStart.getDate() <= 2 || currentEnd.getDate() >= 28) holidays.push("New Year's");
  }
  if (currentStart.getMonth() === 6 || currentEnd.getMonth() === 6) {
    holidays.push('Independence Day / Summer');
  }
  if (currentStart.getMonth() === 4 || currentEnd.getMonth() === 4) {
    holidays.push('Memorial Day');
  }
  if (currentStart.getMonth() === 8 || currentEnd.getMonth() === 8) {
    holidays.push('Labor Day');
  }

  // Build historical context string
  let historicalContextStr = 'No historical data available';
  if (historicalData && historicalData.dateRange) {
    const monthsOfData = historicalData.dateRange.monthsOfData;
    const allTimeImpressions = historicalData.totals.allTimeImpressions;
    const growthPercent = historicalData.totals.growthPercent;
    const firstMonth = historicalData.monthlyStats[0];
    const lastMonth = historicalData.monthlyStats[historicalData.monthlyStats.length - 1];
    
    historicalContextStr = `
- Site has ${monthsOfData} months of GSC data (since ${historicalData.dateRange.earliest})
- All-time total impressions: ${allTimeImpressions.toLocaleString()}
- First month on record: ${firstMonth?.month} with ${firstMonth?.impressions.toLocaleString()} impressions
- Latest month: ${lastMonth?.month} with ${lastMonth?.impressions.toLocaleString()} impressions
- Overall growth since first month: ${growthPercent > 0 ? '+' : ''}${growthPercent}%`;
  }

  const formatPeriodLabel = (dateStr: string) => formatMonthYearFromAPI(dateStr);
  const currentPeriodName = formatPeriodLabel(stats.currentPeriod.startDate);
  const comparisonPeriodName = formatPeriodLabel(stats.comparisonPeriod.startDate);

  const userPrompt = `Create an executive-friendly report for ${siteName} prepared by ${AGENCY_NAME}:

**REPORTING PERIOD (USER-SELECTED - USE EXACTLY):**
- CURRENT PERIOD (primary): ${currentPeriodName} (${stats.currentPeriod.startDate} to ${stats.currentPeriod.endDate})
- COMPARISON PERIOD: ${comparisonPeriodName} (${stats.comparisonPeriod.startDate} to ${stats.comparisonPeriod.endDate})
- You MUST reference BOTH periods by name (e.g. "${currentPeriodName} compared to ${comparisonPeriodName}") throughout the report. Never say only "${comparisonPeriodName}" or "this month" without the full context.

CURRENT PERIOD DATA:
${JSON.stringify(userData, null, 2)}

HISTORICAL CONTEXT (ALL-TIME DATA):
${historicalContextStr}
- This report covers: ${stats.currentPeriod.startDate} to ${stats.currentPeriod.endDate}
- Comparison period: ${stats.comparisonPeriod.startDate} to ${stats.comparisonPeriod.endDate}

SEASONAL/HOLIDAY DETECTION:
- Holidays detected in this period: ${holidays.length > 0 ? holidays.join(', ') : 'None detected'}
- If holidays are present, analyze how they might impact search behavior (e.g., lower business searches during Christmas week, home improvement searches spike in spring)

CRITICAL RULES:
1. USE ACTUAL NUMBERS in keyWins:
   - "${userData.metrics.impressions.current.toLocaleString()} times shown in Google${userData.metrics.impressions.change > 0 ? ` (+${userData.metrics.impressions.change.toLocaleString()})` : ''}"
   - "${userData.metrics.visitors.current.toLocaleString()} website visitors from search${userData.metrics.visitors.change > 0 ? ` (+${userData.metrics.visitors.change.toLocaleString()})` : ''}"
   - "${userData.metrics.pages.current} pages ranking${userData.metrics.pages.change > 0 ? ` (+${userData.metrics.pages.change} new)` : ''}"
   - "${userData.metrics.searchTerms.current} search terms${userData.metrics.searchTerms.change > 0 ? ` (+${userData.metrics.searchTerms.change} new)` : ''}"

2. Include visitor data ONLY in the Growth Highlights table - not in keyword tables

3. For historicalContext: 
   - Use the HISTORICAL CONTEXT data above to discuss the site's growth journey
   - Mention how many months ${AGENCY_NAME} has been building visibility
   - Reference the all-time impression total and growth percentage
   - Compare this month to where the site started

4. For seasonalFactors: 
   - Set detected: ${holidays.length > 0 ? 'true' : 'false'}
   - holidays: ${JSON.stringify(holidays)}
   - Analyze how ${holidays.length > 0 ? 'these holidays may have impacted' : 'the lack of major holidays means a clean baseline for'} search behavior

5. This report is FROM ${AGENCY_NAME} TO the client - credit ${AGENCY_NAME} for wins

6. **PERIOD ADHERENCE**: Every analysis, headline, and table must reflect that this is ${currentPeriodName} compared to ${comparisonPeriodName}. Use these exact period names. Table column headers: use "${currentPeriodName}" and "vs ${comparisonPeriodName}" or "Growth vs ${comparisonPeriodName}".

7. **KEY POINTS FOR TEAM (keyPointsForTeam)**: 4-6 scannable bullets for non-exec, ops/tech people. NOT stat-heavy—focus on awareness: what to know, what's working, what to watch. Examples: "Search visibility trending up", "New customer discovery terms appearing", "Local pages gaining traction", "Content expansion paying off". Keep each bullet under 15 words. Use plain language; avoid jargon. These appear at the top for quick scanning.

Generate the complete JSON report now.`;

  try {
    let fullResponse = '';
    
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 6000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Parse JSON response
    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResponse);
    if (!Array.isArray(parsed.keyPointsForTeam)) {
      parsed.keyPointsForTeam = [];
    }
    return parsed;
    
  } catch (error) {
    console.error('[GSC Report] AI analysis failed:', error);
    
    // Executive-friendly fallback with actual stats and ${AGENCY_NAME} branding
    const impChange = stats.comparisons.impressionsChange;
    const clickChange = stats.comparisons.clicksChange;
    const pagesChange = stats.comparisons.pagesChange;
    const termsChange = stats.comparisons.searchTermsChange;
    
    const pagesGrowth = pagesChange > 0 ? `+${pagesChange} new pages` : 'Stable';
    const termsGrowth = termsChange > 0 ? `+${termsChange} new terms` : 'Stable';
    const impGrowth = impChange >= 0 ? `+${impChange.toLocaleString()} (+${Math.round(stats.comparisons.impressionsChangePercent)}%)` : 'Stable';
    const visitorsGrowth = clickChange >= 0 ? `+${clickChange.toLocaleString()} (+${Math.round(stats.comparisons.clicksChangePercent)}%)` : 'Stable';
    
    const fallbackCurrentStart = new Date(stats.currentPeriod.startDate);
    const fallbackCurrentEnd = new Date(stats.currentPeriod.endDate);
    const detectedHolidays: string[] = [];
    if (fallbackCurrentStart.getMonth() === 11 || fallbackCurrentEnd.getMonth() === 11) detectedHolidays.push('Christmas');
    if (fallbackCurrentStart.getMonth() === 10 || fallbackCurrentEnd.getMonth() === 10) detectedHolidays.push('Thanksgiving');
    if (fallbackCurrentStart.getMonth() === 0 || fallbackCurrentEnd.getMonth() === 0) detectedHolidays.push("New Year's");
    
    const curName = formatPeriodLabel(stats.currentPeriod.startDate);
    const compName = formatPeriodLabel(stats.comparisonPeriod.startDate);
    return {
      executiveSummary: {
        headline: `${siteName} was shown ${stats.currentPeriod.impressions.toLocaleString()} times in Google Search in ${curName}${impChange > 0 ? ` - up ${impChange.toLocaleString()} from ${compName}` : ''}.`,
        keyWins: [
          `${stats.currentPeriod.impressions.toLocaleString()} times shown in Google Search${impChange > 0 ? ` (+${impChange.toLocaleString()} increase)` : ''}`,
          `${stats.currentPeriod.clicks.toLocaleString()} website visitors from organic search${clickChange > 0 ? ` (+${clickChange.toLocaleString()} more)` : ''}`,
          `${stats.currentPeriod.pagesCount} pages now ranking in Google${pagesChange > 0 ? ` (+${pagesChange} new pages indexed)` : ''}`,
          `Found for ${stats.currentPeriod.searchTermsCount} search terms${termsChange > 0 ? ` (+${termsChange} new terms discovered)` : ''}`,
        ],
        overview: `${AGENCY_NAME}'s ongoing SEO strategy continues to deliver results for ${siteName}. ${curName} (compared to ${compName}) saw strong search visibility growth with your brand appearing ${stats.currentPeriod.impressions.toLocaleString()} times to potential customers, driving ${stats.currentPeriod.clicks.toLocaleString()} visitors to your website.`,
      },
      keyPointsForTeam: [
        impChange > 0 ? 'Search visibility trending up this period' : 'Search visibility holding steady',
        termsChange > 0 ? 'New customer discovery terms appearing in results' : 'Keyword set stable',
        pagesChange > 0 ? 'More pages gaining traction in Google' : 'Page indexation stable',
        'Content strategy aligned with search demand',
      ],
      growthHighlights: {
        table: `| Metric | ${curName} | Growth vs ${compName} |\n| --- | --- | --- |\n| Times Shown in Google | ${stats.currentPeriod.impressions.toLocaleString()} | ${impGrowth} |\n| Website Visitors from Search | ${stats.currentPeriod.clicks.toLocaleString()} | ${visitorsGrowth} |\n| Pages Ranking | ${stats.currentPeriod.pagesCount} | ${pagesGrowth} |\n| Search Terms | ${stats.currentPeriod.searchTermsCount} | ${termsGrowth} |`,
        analysis: `${AGENCY_NAME}'s content and optimization strategy is driving consistent growth. Your business appeared in Google Search ${stats.currentPeriod.impressions.toLocaleString()} times in ${curName}, representing ${impChange > 0 ? `a ${impChange.toLocaleString()} increase in brand exposure vs ${compName}` : `stable visibility vs ${compName}`}. This visibility drove ${stats.currentPeriod.clicks.toLocaleString()} visitors to your website from organic search. With ${stats.currentPeriod.pagesCount} pages now ranking, your digital footprint continues to expand.`,
      },
      newSearchTerms: {
        table: '',
        analysis: `New search terms represent fresh customer discovery opportunities identified through ${AGENCY_NAME}'s ongoing optimization work.`,
      },
      topPerformers: {
        table: '',
        analysis: `Your top performing keywords continue to drive consistent visibility, validating the keyword strategy ${AGENCY_NAME} has implemented.`,
      },
      localPresence: {
        table: '',
        analysis: `${AGENCY_NAME}'s local SEO efforts are helping customers in your service area find your business when searching for relevant services.`,
      },
      contentReach: {
        table: `| Content Metric | ${curName} | vs ${compName} |\n| --- | --- | --- |\n| Pages in Google | ${stats.currentPeriod.pagesCount} | ${pagesGrowth} |\n| Avg Position | ${Math.round(stats.currentPeriod.avgPosition * 10) / 10} | ${stats.comparisons.avgPositionChange <= 0 ? 'Improved' : 'Stable'} |`,
        analysis: `${AGENCY_NAME}'s content strategy is paying off with ${stats.currentPeriod.pagesCount} pages now appearing in Google search results${pagesChange > 0 ? `, including ${pagesChange} newly indexed pages in ${curName}` : ''}. This expanding digital footprint means more entry points for potential customers to discover your business.`,
      },
      historicalContext: {
        summary: `${siteName} has been building search visibility through ${AGENCY_NAME}'s ongoing SEO efforts, with ${stats.currentPeriod.pagesCount} pages now ranking and ${stats.currentPeriod.searchTermsCount} search terms discovered.`,
        analysis: `The growth achieved in ${curName} (compared to ${compName}) builds on the foundation ${AGENCY_NAME} has established. Each month of optimization compounds the results, creating a stronger and more visible online presence. The trajectory shows consistent improvement in both the breadth of keywords and the number of pages appearing in search results.`,
      },
      seasonalFactors: {
        detected: detectedHolidays.length > 0,
        holidays: detectedHolidays,
        analysis: detectedHolidays.length > 0 
          ? `This reporting period included ${detectedHolidays.join(' and ')}, which typically impacts search behavior as consumers shift focus to holiday-related activities. Despite seasonal fluctuations, ${siteName} maintained strong visibility.`
          : `This reporting period did not include any major holidays, providing a clean baseline for measuring organic search performance without seasonal interference.`,
      },
      recommendations: [
        `${AGENCY_NAME} recommends continuing to build content around your highest-performing topics`,
        'Expand local service area targeting to capture more nearby customers',
        'Build on this momentum with additional keyword targeting in related service areas',
      ],
      outlook: `With ${stats.currentPeriod.searchTermsCount} search terms driving visibility and ${stats.currentPeriod.pagesCount} pages ranking in Google, ${AGENCY_NAME} is confident that ${siteName} will continue its growth trajectory in the coming months.`,
    };
  }
}

/**
 * Generate executive-friendly checklist from AI analysis
 * Every section has a table with positions + detailed AI analysis
 */
async function generateGSCChecklist(
  stats: GSCPerformanceStats,
  siteName: string,
  siteUrl: string,
  apiKey: string,
  model: string = getResearchModel(),
  entityPagesData?: EntityPagesData | null,
  historicalData?: HistoricalData | null,
  discoveryData?: ReportDiscoveryData | null
): Promise<string[]> {
  
  const formatDate = (dateStr: string) => formatMonthYearFromAPI(dateStr);
  const currentPeriodLabel = formatDate(stats.currentPeriod.startDate);
  const comparisonPeriodLabel = formatDate(stats.comparisonPeriod.startDate);
  const periodContext = `${currentPeriodLabel} compared to ${comparisonPeriodLabel}`;

  // Get full AI analysis with historical context
  const report = await generateAIReportAnalysis(stats, siteName, apiKey, model, historicalData);

  const checklist: string[] = [];

  // Executive Summary - Lead with the headline
  checklist.push(
    `Executive Summary: ${siteName} Search Performance - ${periodContext}. [STRUCTURE]: Open with the headline, then a brief overview paragraph, followed by a bullet list of key wins. CRITICAL: State that this report covers ${currentPeriodLabel} compared to ${comparisonPeriodLabel}—never refer to only one period.

**Headline:** ${report.executiveSummary.headline}

${report.executiveSummary.overview}

[LIST]: Key Wins for ${currentPeriodLabel} (vs ${comparisonPeriodLabel}):
${report.executiveSummary.keyWins.map(w => `- ${w}`).join('\n')}

[LINK]: 2-3 internal links.`
  );

  // Key Points for Team - Quick-scan bullets for ops/tech (not stat-heavy)
  const keyPoints = report.keyPointsForTeam || [];
  if (keyPoints.length > 0) {
    checklist.push(
      `Key Points for the Team: ${siteName} - Quick Scan. [STRUCTURE]: Brief intro ("What to know:"), then a bullet list. Use professional symbols (✓ → ▲) sparingly. Keep bullets scannable—no heavy stats. Audience: ops/tech, non-exec.

[LIST]: Bullet list (4-6 items, each under 15 words):
${keyPoints.map(p => `- ${p}`).join('\n')}

Format each bullet for quick scanning. Optional: prefix with ✓ for wins, → for trends, ▲ for watch items.`
    );
  }

  // Growth Highlights - The big picture numbers
  if (report.growthHighlights.table && report.growthHighlights.table.includes('|')) {
    checklist.push(
      `Growth at a Glance: Your Numbers for ${currentPeriodLabel} (compared to ${comparisonPeriodLabel}). [STRUCTURE]: Brief intro stating this covers ${periodContext}, then the metrics table, followed by detailed analysis.

[CUSTOM]: ${report.growthHighlights.table}

**What This Means For Your Business:**

${report.growthHighlights.analysis}

[LINK]: 2-3 internal links.`
    );
  }

  // New Search Terms - Customer Discovery
  if (report.newSearchTerms.table && report.newSearchTerms.table.includes('|')) {
    checklist.push(
      `New Customer Discovery: Search Terms You're Now Found For. [STRUCTURE]: Explain that these are NEW ways customers are finding the business, then show the table with positions, followed by full analysis of business opportunity.

[CUSTOM]: ${report.newSearchTerms.table}

**AI Analysis - What These New Terms Mean:**

${report.newSearchTerms.analysis}

[LINK]: 3-5 relevant page links.`
    );
  }

  // Top Performers - Best keywords
  if (report.topPerformers.table && report.topPerformers.table.includes('|')) {
    checklist.push(
      `Your Strongest Search Terms: Driving Real Results. [STRUCTURE]: Introduce the top performing terms, show the table with positions and traffic, then provide full analysis of why these matter.

[CUSTOM]: ${report.topPerformers.table}

**AI Analysis - Why These Terms Matter:**

${report.topPerformers.analysis}

[LINK]: 3-5 relevant page links.`
    );
  }

  // Local Presence - Geographic reach
  if (report.localPresence.table && report.localPresence.table.includes('|')) {
    checklist.push(
      `Local Market Visibility: Reaching Customers In Your Area. [STRUCTURE]: Explain local search importance, show table with local terms and positions, provide analysis of geographic reach.

[CUSTOM]: ${report.localPresence.table}

**AI Analysis - Your Local Search Presence:**

${report.localPresence.analysis}

[LINK]: 3-5 location/service area page links.`
    );
  }

  // Entity Pages / Service Area Pages - Dedicated section
  if (entityPagesData && entityPagesData.pages && entityPagesData.pages.length > 0) {
    const entitySection = generateEntityPagesSection(entityPagesData);
    if (entitySection.table) {
      const totalPages = entityPagesData.currentPeriod.totalPages;
      const newPages = entityPagesData.comparison?.newPagesCount || 0;
      const totalImpressions = entityPagesData.currentPeriod.totalImpressions;
      const impressionsChange = entityPagesData.comparison?.impressionsChange || 0;
      
      checklist.push(
        `Service Area Pages: Your Location-Targeted Content. [STRUCTURE]: Introduce the service area page strategy, highlight growth metrics, show the performance table, then detailed AI analysis.

**Overview:** ${AGENCY_NAME} has built ${totalPages} targeted service area pages for ${siteName}${newPages > 0 ? `, with ${newPages} new pages now appearing in Google this month` : ''}. These pages generated ${totalImpressions.toLocaleString()} total impressions${impressionsChange > 0 ? ` (+${impressionsChange.toLocaleString()} vs last month)` : ''}.

[CUSTOM]: ${entitySection.table}

**AI Analysis - Service Area Performance:**

${entitySection.analysis}

[LINK]: 3-5 top performing service area page links.`
      );
    }
  }

  // Content Reach - Pages indexed/ranking
  if (report.contentReach.table && report.contentReach.table.includes('|')) {
    checklist.push(
      `Content Performance: Your Growing Digital Footprint. [STRUCTURE]: Explain that more pages ranking means more ways for customers to find you, show the metrics table, provide full analysis.

[CUSTOM]: ${report.contentReach.table}

**AI Analysis - Your Content is Working:**

${report.contentReach.analysis}

[LINK]: 2-3 internal links.`
    );
  }

  // Historical Context - Long-term perspective
  if (report.historicalContext && report.historicalContext.summary) {
    checklist.push(
      `Your Growth Journey: Building Long-Term Success. [STRUCTURE]: Start with a summary of the overall trajectory, then provide detailed analysis of how this month fits into the bigger picture.

**Summary:** ${report.historicalContext.summary}

**AI Analysis - Long-Term Perspective:**

${report.historicalContext.analysis}

[LINK]: 2-3 internal links.`
    );
  }

  // Seasonal/Holiday Factors
  if (report.seasonalFactors) {
    const holidayTitle = report.seasonalFactors.detected 
      ? `Seasonal Context: ${report.seasonalFactors.holidays.join(', ')} Impact`
      : 'Seasonal Context: Clean Baseline Period';
    
    checklist.push(
      `${holidayTitle}. [STRUCTURE]: Explain how seasonal factors or lack thereof affected this period's performance.

**AI Analysis - Seasonal Factors:**

${report.seasonalFactors.analysis}

[LINK]: 1-2 internal links.`
    );
  }

  // Outlook - Forward looking (removed Next Steps per user request)
  checklist.push(
    `Looking Ahead: Your Growth Trajectory. [STRUCTURE]: 1-2 paragraphs with optimistic, forward-looking conclusion.

${report.outlook}

[LINK]: 2-3 internal links.`
  );

  // Infographic - Visual summary with timeline and key wins
  const infographicData = generateInfographicData(stats, siteName, report, historicalData, discoveryData);
  checklist.push(infographicData);

  return checklist;
}

/**
 * Extract SAP (Service Area Pages) location names for infographic geographic display.
 * Uses entity page paths, sitemap URLs, or site name as fallback.
 */
function extractSAPLocations(
  siteName: string,
  discoveryData?: ReportDiscoveryData | null
): { primary: string; all: string[] } {
  const locations: string[] = [];
  const businessSuffixes = ['Inc', 'LLC', 'Corp', 'Ltd', 'Dental', 'Clinic', 'Group', 'Solutions', 'Services', 'Magic', 'Blind'];

  // From entity pages: parse pagePath (e.g. /service-area/edmonton/), sort by impressions desc
  const pages = discoveryData?.entityPagesData?.pages ?? [];
  if (pages.length > 0) {
    const withLoc = pages
      .map((p) => {
        const slug = p.pagePath.split('/').filter(Boolean).pop();
        if (!slug || slug.length < 2) return null;
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return { name, impressions: p.impressions };
      })
      .filter((x): x is { name: string; impressions: number } => !!x && !businessSuffixes.some((s) => s.toLowerCase() === x.name.toLowerCase()));
    const seen = new Set<string>();
    for (const { name } of withLoc.sort((a, b) => b.impressions - a.impressions)) {
      if (!seen.has(name)) {
        seen.add(name);
        locations.push(name);
      }
    }
  }

  // From entity sitemap URLs if no pages
  if (locations.length === 0 && discoveryData?.wordPressContext?.entitySitemapUrls?.length) {
    const urls = discoveryData.wordPressContext.entitySitemapUrls;
    const seen = new Set<string>();
    for (const url of urls) {
      try {
        const path = new URL(url).pathname;
        const slug = path.split('/').filter(Boolean).pop();
        if (!slug || slug.length < 2) continue;
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (!seen.has(name) && !businessSuffixes.some((s) => s.toLowerCase() === name.toLowerCase())) {
          seen.add(name);
          locations.push(name);
        }
      } catch {
        // skip invalid URLs
      }
    }
  }

  // Fallback: extract from site name (e.g. "Heritage Dental Edmonton" -> "Edmonton")
  if (locations.length === 0) {
    const words = siteName.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord && !businessSuffixes.includes(lastWord) && lastWord.length > 3) {
      locations.push(lastWord);
    }
  }

  const primary = locations[0] ?? 'Service Area';
  return { primary, all: locations };
}

/**
 * Generate infographic agent content with timeline chart and key wins.
 * Stats (impressions, clicks) come from GSC totals—no filters. Timeline and performance
 * stats must match; GSC is the source of truth. Use stats.currentPeriod verbatim.
 */
function generateInfographicData(
  stats: GSCPerformanceStats,
  siteName: string,
  report: {
    executiveSummary: { headline: string; keyWins: string[]; overview: string };
    growthHighlights: { table: string; analysis: string };
    [key: string]: unknown;
  },
  historicalData?: HistoricalData | null,
  discoveryData?: ReportDiscoveryData | null
): string {
  const impChange = stats.comparisons.impressionsChange;
  const pagesChange = stats.comparisons.pagesChange;
  const termsChange = stats.comparisons.searchTermsChange;

  let theme = 'Steady Growth';
  if (impChange > 1000 || stats.comparisons.impressionsChangePercent > 50) {
    theme = 'Explosive Growth';
  } else if (impChange > 500 || stats.comparisons.impressionsChangePercent > 25) {
    theme = 'Strong Momentum';
  } else if (termsChange > 100 || pagesChange > 20) {
    theme = 'Expanding Reach';
  } else if (stats.comparisons.avgPositionChange < -2) {
    theme = 'Rising Rankings';
  }

  // Build timeline data from historical stats
  let timelineData = '';
  if (historicalData && historicalData.monthlyStats && historicalData.monthlyStats.length > 0) {
    const months = historicalData.monthlyStats.slice(-6);
    timelineData = months.map(m => {
      const monthName = formatShortMonthYearFromAPI(m.month + '-01');
      return `${monthName}: ${m.impressions.toLocaleString()} impressions`;
    }).join(' → ');
  } else {
    const compareLabel = formatShortMonthYearFromAPI(stats.comparisonPeriod.endDate);
    const currentLabel = formatShortMonthYearFromAPI(stats.currentPeriod.endDate);
    timelineData = `${compareLabel}: ${stats.comparisonPeriod.impressions.toLocaleString()} → ${currentLabel}: ${stats.currentPeriod.impressions.toLocaleString()}`;
  }

  const keyWins = report.executiveSummary.keyWins.slice(0, 4);
  const currentPeriodNatural = formatMonthYearFromAPI(stats.currentPeriod.endDate);
  const comparePeriodNatural = formatMonthYearFromAPI(stats.comparisonPeriod.endDate);
  const reportPeriodNatural = `${currentPeriodNatural} vs ${comparePeriodNatural}`;

  const { primary: sapPrimary, all: sapAll } = extractSAPLocations(siteName, discoveryData);
  const sapLabel = sapAll.length > 1 ? sapAll.slice(0, 3).join(', ') : sapPrimary;

  return `Infographic: ${siteName} Performance Summary. [INFOGRAPHIC]

[STRUCTURE]: Your output MUST include a "Design Specification" block with these EXACT hex codes—they feed into image generation: Background #02050A, Accent #84BD00 (lime green), Text #fff. Do NOT omit or paraphrase.

**EXPLICIT DESIGN SPEC (NON-NEGOTIABLE)**
- Format: TALL mobile optimized (9:16 aspect ratio)—vertical, portrait layout
- Background: #02050A (full background)
- Accent: #84BD00 (lime green—NOT blue, NOT cyan; use for charts, highlights, numbers, icons, outlines)
- Text: #fff (all headings and labels)
- Layout: SIMPLE, CLEAN, EASY TO READ—like the neodigital website. Generous negative space. NOT busy. Professional. Fewer elements, bigger impact.
- NEVER add logos (no Neo Digital logo, no brand logos anywhere)
- REAL DATA ONLY: Never use placeholders (no +X%, no TBD, no "X"). Never use fake or garbled words. Use actual numbers from the report.

**THEME: Neon-Noir Tech (Neo Digital Inc.)**
- Bold, geometric sans-serif; high-contrast
- Shapes only: circles, hexagons, grids, circuit patterns—NO faces or people
- Use Google / Google Maps / SEO icons to show what was optimized
- Light on text; multiple stats; easy to scan; meaningful as a report

**CRITICAL PROHIBITIONS**
- Do NOT use or mention "AI" anywhere (no "AI-powered", "AI-driven", "AI analysis", etc.)
- No hashtags in footer or anywhere
- Do NOT include "Next Steps", "Executive Summary & Next Steps", or any "next steps" section
- Use neutral titles: "Local SEO Performance" or "${siteName} Performance Summary"

**SAP / GEOGRAPHIC AREA (REQUIRED)**
- State SAP location(s): e.g. "Edmonton" or "Edmonton, Calgary" — for this client: ${sapLabel}
- Include an outline of the primary geographic area (e.g. ${sapPrimary} region) on the infographic
- Label: "SAP Pages: ${sapPrimary}" prominently

**REQUIRED ELEMENTS:**

1. **HEADER**
   - Site name: ${siteName}
   - Report period: ${reportPeriodNatural} (both periods)
   - Theme badge: "${theme}" in accent green (#84BD00)

2. **PERFORMANCE STATS (BIG NUMBERS)**
   - Total Impressions: ${stats.currentPeriod.impressions.toLocaleString()} (large, #84BD00)
   - Growth: ${impChange > 0 ? '+' : ''}${impChange.toLocaleString()} (${Math.round(stats.comparisons.impressionsChangePercent)}%)
   - Pages Ranking: ${stats.currentPeriod.pagesCount}
   - Search Terms: ${stats.currentPeriod.searchTermsCount}

3. **TIMELINE CHART**
   - Data: ${timelineData}
   - Use #84BD00 for line/bars, #fff for labels

4. **KEY WINS (4 STAT CALLOUTS)**
${keyWins.map((win, i) => `   ${i + 1}. ${win}`).join('\n')}

5. **GEOGRAPHIC SECTION (REQUIRED)**
   - Label: "SAP Pages: ${sapPrimary}"
   - Include an outline/shape of the ${sapPrimary} area (stylized map outline)
   - Accent green (#84BD00) outline

6. **FOOTER**
   - "Prepared by ${AGENCY_NAME}" in #fff — NO logos, NO hashtags

7. **GOOGLE / SEO VISUAL CUES**
   - Google, Google Maps, SEO icons to show what was optimized

**SCANNABILITY**
- NO dense paragraphs. Big numbers, short labels (5 words max), icons, arrows.
- Icons and charts tell the story; text is minimal.

**OUTPUT REQUIREMENT (CRITICAL):** Your section output MUST include ALL of the following verbatim—this text feeds directly into image generation. Do NOT paraphrase or omit:
- Exact hex codes: Background #02050A, Accent #84BD00 (lime green), Text #fff
- Format: Tall 9:16 mobile optimized; simple, clean layout (neodigital style)
- NO logos; NO placeholders; NO fake words—real data only
- Theme: Neon-Noir Tech; shapes only; NO faces; NO AI; NO hashtags; NO Next Steps
- SAP Pages: ${sapPrimary} plus outline of ${sapPrimary} area
- Google/SEO icons; key labels required

Create a detailed infographic layout description that embeds the full design spec above. Include placement, sizing, and styling for each element.`;
}

// Historical data type from GSC API
export interface HistoricalData {
  success: boolean;
  siteUrl: string;
  dateRange: {
    earliest: string;
    latest: string;
    monthsOfData: number;
  };
  totals: {
    allTimeImpressions: number;
    currentMonthImpressions: number;
    firstMonthImpressions: number;
    growthPercent: number;
  };
  monthlyStats: Array<{
    month: string;
    impressions: number;
    avgPosition: number;
  }>;
}

// Entity pages data type from GSC API
export interface EntityPagesData {
  success: boolean;
  entityPathPattern: string;
  currentPeriod: {
    startDate: string;
    endDate: string;
    totalPages: number;
    totalImpressions: number;
    totalClicks: number;
  };
  comparisonPeriod?: {
    startDate: string;
    endDate: string;
    totalPages: number;
    totalImpressions: number;
    totalClicks: number;
  } | null;
  comparison?: {
    newPagesCount: number;
    impressionsChange: number;
    clicksChange: number;
    pagesChange: number;
  } | null;
  pages: Array<{
    url: string;
    pagePath: string;
    clicks: number;
    impressions: number;
    position: number;
    previousImpressions: number;
    previousClicks: number;
    previousPosition: number;
    impressionsChange: number;
    clicksChange: number;
    isNew: boolean;
  }>;
  newPages: string[];
}

/**
 * Generate entity pages section with AI analysis (no click data)
 */
function generateEntityPagesSection(entityData: EntityPagesData): { table: string; analysis: string } {
  if (!entityData || !entityData.pages || entityData.pages.length === 0) {
    return { table: '', analysis: '' };
  }

  // Build table - top 15 entity pages (no click data)
  const topPages = entityData.pages.slice(0, 15);
  let table = '| Service Area Page | Position | Times Shown | Status |\n| --- | --- | --- | --- |';
  
  for (const page of topPages) {
    // Extract readable page name from path
    const pathParts = page.pagePath.split('/').filter(Boolean);
    const pageName = pathParts[pathParts.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || page.pagePath;
    
    const status = page.isNew ? 'NEW' : (page.impressionsChange > 0 ? `+${page.impressionsChange.toLocaleString()}` : 'Stable');
    table += `\n| ${pageName} | ${page.position} | ${page.impressions.toLocaleString()} | ${status} |`;
  }

  // Build analysis (no click data)
  const totalPages = entityData.currentPeriod.totalPages;
  const totalImpressions = entityData.currentPeriod.totalImpressions;
  const newPagesCount = entityData.comparison?.newPagesCount || 0;
  const impressionsChange = entityData.comparison?.impressionsChange || 0;
  
  let analysis = `${AGENCY_NAME}'s service area content strategy is delivering strong results. Your ${totalPages} location-specific pages were shown ${totalImpressions.toLocaleString()} times in Google Search this month.`;
  
  if (newPagesCount > 0) {
    analysis += ` ${newPagesCount} new service area pages started appearing in Google search results, expanding your geographic reach.`;
  }
  
  if (impressionsChange > 0) {
    analysis += ` Overall visibility for your service area pages increased by ${impressionsChange.toLocaleString()} impressions compared to last month.`;
  }
  
  analysis += ` These targeted location pages help customers in specific areas discover your business when searching for local services.`;

  return { table, analysis };
}

/**
 * Generate enhanced Service Area Pages (SAP) section with coverage analysis (Local SEO focus)
 */
function generateEntitySitemapSectionWithCoverage(
  entityData: EntityPagesData | null,
  discoveryData: ReportDiscoveryData,
  siteName: string
): { table: string; analysis: string } | null {
  const wp = discoveryData.wordPressContext;
  const coverage = discoveryData.entityCoverage;

  // Need either entity data or entity sitemap for this section
  const hasEntityPages = entityData?.pages?.length;
  const hasEntitySitemap = wp.entitySitemapCount > 0;

  if (!hasEntityPages && !hasEntitySitemap) {
    return null;
  }

  let table = '';
  let analysis = '';

  if (hasEntityPages && entityData) {
    const entitySection = generateEntityPagesSection(entityData);
    table = entitySection.table;
    analysis = entitySection.analysis;
  } else {
    table = '| Service Area Pages (SAP) | Status |\n| --- | --- |\n| Total SAP | ' + wp.entitySitemapCount + ' |';
    analysis = `${AGENCY_NAME}'s local SEO strategy includes ${wp.entitySitemapCount} Service Area Pages (SAP) in your sitemap. These pages target customers searching for services in specific areas.`;
  }

  // Add coverage/indexation insights when available
  if (coverage) {
    analysis += ` Your sitemap has ${coverage.totalInSitemap} Service Area Pages (SAP), with ${coverage.totalInGSC} (${coverage.indexedPercent}%) currently appearing in Google Search.`;
    if (coverage.notInGSC.length > 0) {
      analysis += ` ${coverage.notInGSC.length} Service Area Pages (SAP) are not yet in GSC—${AGENCY_NAME} recommends reviewing indexation for these location pages.`;
    }
  }

  return { table, analysis };
}

/**
 * Generate adaptive checklist driven by ReportPlan (agentic path)
 */
async function generateAdaptiveChecklist(
  reportPlan: ReportPlan,
  discoveryData: ReportDiscoveryData,
  apiKey: string,
  model: string
): Promise<string[]> {
  const { stats, entityPagesData, historicalData, wordPressContext } = discoveryData;
  const { siteName } = wordPressContext;
  const formatDate = (dateStr: string) => formatMonthYearFromAPI(dateStr);
  const currentPeriodLabel = formatDate(stats.currentPeriod.startDate);
  const comparisonPeriodLabel = formatDate(stats.comparisonPeriod.startDate);
  const periodContext = `${currentPeriodLabel} compared to ${comparisonPeriodLabel}`;

  const report = await generateAIReportAnalysis(
    stats,
    siteName,
    apiKey,
    model,
    historicalData
  );

  const checklist: string[] = [];
  const sectionMap: Record<string, (() => string) | null> = {
    'executive-summary': () =>
      `Executive Summary: ${siteName} Search Performance - ${periodContext}. [STRUCTURE]: Open with the headline stating this covers ${periodContext}, then a brief overview paragraph, followed by a bullet list of key wins.

**Headline:** ${report.executiveSummary.headline}

${report.executiveSummary.overview}

[LIST]: Key Wins for ${currentPeriodLabel} (vs ${comparisonPeriodLabel}):
${report.executiveSummary.keyWins.map((w) => `- ${w}`).join('\n')}

[LINK]: 2-3 internal links.`,
    'key-points-for-team': () => {
      const keyPoints = report.keyPointsForTeam || [];
      if (keyPoints.length === 0) return null;
      return `Key Points for the Team: ${siteName} - Quick Scan. [STRUCTURE]: Brief intro ("What to know:"), then a bullet list. Use professional symbols (✓ → ▲) sparingly. Keep bullets scannable—no heavy stats. Audience: ops/tech, non-exec.

[LIST]: Bullet list (4-6 items, each under 15 words):
${keyPoints.map((p) => `- ${p}`).join('\n')}

Format each bullet for quick scanning. Optional: prefix with ✓ for wins, → for trends, ▲ for watch items.`;
    },
    'growth-highlights': () =>
      report.growthHighlights?.table?.includes('|')
        ? `Growth at a Glance: Your Numbers for ${currentPeriodLabel} (compared to ${comparisonPeriodLabel}). [STRUCTURE]: Brief intro stating this covers ${periodContext}, then the metrics table, followed by detailed analysis.

[CUSTOM]: ${report.growthHighlights.table}

**What This Means For Your Business:**

${report.growthHighlights.analysis}

[LINK]: 2-3 internal links.`
        : null,
    'new-search-terms': () =>
      report.newSearchTerms?.table?.includes('|')
        ? `New Customer Discovery: Search Terms You're Now Found For. [STRUCTURE]: Explain NEW ways customers find the business, show table, then analysis.

[CUSTOM]: ${report.newSearchTerms.table}

**AI Analysis - What These New Terms Mean:**

${report.newSearchTerms.analysis}

[LINK]: 3-5 relevant page links.`
        : null,
    'top-performers': () =>
      report.topPerformers?.table?.includes('|')
        ? `Your Strongest Search Terms: Driving Real Results. [STRUCTURE]: Introduce top terms, show table, provide analysis.

[CUSTOM]: ${report.topPerformers.table}

**AI Analysis - Why These Terms Matter:**

${report.topPerformers.analysis}

[LINK]: 3-5 relevant page links.`
        : null,
    'local-presence': () =>
      report.localPresence?.table?.includes('|')
        ? `Local Market Visibility: Reaching Customers In Your Area. [STRUCTURE]: Explain local search importance, show table, provide analysis.

[CUSTOM]: ${report.localPresence.table}

**AI Analysis - Your Local Search Presence:**

${report.localPresence.analysis}

[LINK]: 3-5 location/service area page links.`
        : null,
    'entity-sitemap-local-seo': () => {
      const entitySection = generateEntitySitemapSectionWithCoverage(
        entityPagesData ?? null,
        discoveryData,
        siteName
      );
      if (!entitySection) return null;
      const totalPages = entityPagesData?.currentPeriod?.totalPages ?? wordPressContext.entitySitemapCount;
      const newPages = entityPagesData?.comparison?.newPagesCount ?? 0;
      const totalImpressions = entityPagesData?.currentPeriod?.totalImpressions ?? 0;
      const impressionsChange = entityPagesData?.comparison?.impressionsChange ?? 0;
      const overview = entityPagesData
        ? `${AGENCY_NAME} has built ${totalPages} targeted Service Area Pages (SAP) for ${siteName}${newPages > 0 ? `, with ${newPages} new pages appearing in Google this month` : ''}. These pages generated ${totalImpressions.toLocaleString()} total impressions${impressionsChange > 0 ? ` (+${impressionsChange.toLocaleString()} vs last month)` : ''}.`
        : `${AGENCY_NAME}'s local SEO strategy includes ${wordPressContext.entitySitemapCount} Service Area Pages (SAP) in your sitemap. These pages target customers searching for services in specific areas.`;
      return `Service Area Pages (SAP) & Local SEO: Your Location-Targeted Content. [STRUCTURE]: Introduce the Service Area Pages strategy, highlight coverage metrics, show performance table, detailed AI analysis. DEDICATED LOCAL SEO SECTION.

**Overview:** ${overview}

[CUSTOM]: ${entitySection.table}

**AI Analysis - Service Area Pages (SAP) & Local SEO Performance:**

${entitySection.analysis}

[LINK]: 3-5 top performing Service Area Page (SAP) links.`;
    },
    'content-reach': () =>
      report.contentReach?.table?.includes('|')
        ? `Content Performance: Your Growing Digital Footprint. [STRUCTURE]: Explain more pages = more discovery, show table, provide analysis.

[CUSTOM]: ${report.contentReach.table}

**AI Analysis - Your Content is Working:**

${report.contentReach.analysis}

[LINK]: 2-3 internal links.`
        : null,
    'historical-context': () =>
      report.historicalContext?.summary
        ? `Your Growth Journey: Building Long-Term Success. [STRUCTURE]: Summary of trajectory, then detailed analysis.

**Summary:** ${report.historicalContext.summary}

**AI Analysis - Long-Term Perspective:**

${report.historicalContext.analysis}

[LINK]: 2-3 internal links.`
        : null,
    'seasonal-factors': () =>
      report.seasonalFactors
        ? `${report.seasonalFactors.detected ? `Seasonal Context: ${report.seasonalFactors.holidays.join(', ')} Impact` : 'Seasonal Context: Clean Baseline Period'}. [STRUCTURE]: Explain seasonal impact.

**AI Analysis - Seasonal Factors:**

${report.seasonalFactors.analysis}

[LINK]: 1-2 internal links.`
        : null,
    'outlook': () =>
      `Looking Ahead: Your Growth Trajectory. [STRUCTURE]: 1-2 paragraphs with optimistic, forward-looking conclusion.

${report.outlook}

[LINK]: 2-3 internal links.`,
    'infographic': () => generateInfographicData(stats, siteName, report, historicalData, discoveryData),
  };

  for (const section of reportPlan.sections.sort((a, b) => a.priority - b.priority)) {
    const generator = sectionMap[section.id];
    if (generator) {
      const item = generator();
      if (item) checklist.push(item);
    }
  }

  // Ensure infographic is always last if not already included
  if (!checklist.some((c) => c.includes('[INFOGRAPHIC]'))) {
    checklist.push(generateInfographicData(stats, siteName, report, historicalData, discoveryData));
  }

  return checklist;
}

/**
 * Generate a GSC performance report blueprint from stats
 * AI-first approach - minimal manual processing
 * When discoveryData + reportPlan provided, uses adaptive agentic path
 */
export async function generateGSCReportBlueprint(
  stats: GSCPerformanceStats,
  siteName: string,
  siteUrl: string,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    entityPagesData?: EntityPagesData | null;
    historicalData?: HistoricalData | null;
    discoveryData?: ReportDiscoveryData | null;
    reportPlan?: ReportPlan | null;
  }
): Promise<{ title: string; purpose: string; agents: AgentConfig[] }> {
  
  const formatDate = (dateStr: string) => formatMonthYearFromAPI(dateStr);
  const currentPeriodLabel = formatDate(stats.currentPeriod.startDate);
  const comparisonPeriodLabel = formatDate(stats.comparisonPeriod.startDate);
  const reportTitleSuffix = `${currentPeriodLabel} vs ${comparisonPeriodLabel}`;

  const model = options.model || getResearchModel();

  let checklist: string[];

  if (options.discoveryData && options.reportPlan) {
    checklist = await generateAdaptiveChecklist(
      options.reportPlan,
      options.discoveryData,
      options.apiKey,
      model
    );
  } else {
    checklist = await generateGSCChecklist(
      stats,
      siteName,
      siteUrl,
      options.apiKey,
      model,
      options.entityPagesData,
      options.historicalData,
      options.discoveryData ?? undefined
    );
  }

  const context: BlogTemplateContext = {
    flowTitle: `${siteName} SEO Performance Report - ${reportTitleSuffix}`,
    flowPurpose: `Local SEO performance analysis for ${siteName} (${reportTitleSuffix}) by ${AGENCY_NAME}`,
    keywordData: undefined,
  };

  const blueprintResult = await generateBlueprintFromTemplate(
    checklist,
    context,
    {
      apiKey: options.apiKey,
      model,
      temperature: options.temperature || 1.0,
      maxTokens: options.maxTokens || 8000,
      topP: options.topP || 0.9,
      connectedSite: { name: siteName, siteUrl },
    }
  );

  return {
    title: blueprintResult.title || context.flowTitle || `${siteName} SEO Performance Report - ${reportTitleSuffix}`,
    purpose: blueprintResult.purpose || context.flowPurpose || `Local SEO performance analysis for ${siteName} by ${AGENCY_NAME}`,
    agents: blueprintResult.agents || [],
  };
}
