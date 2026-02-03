export const mapFeatureToInstruction = (feature: string): string => {
  const normalizedFeature = feature.toLowerCase().trim();

  // 1. Check for table-like instructions (e.g., user supplies column headers)
  // Check if the feature contains a pipe character, which highly suggests a table instruction.
  if (feature.includes('|')) {
    // The goal is to instruct the AI with high specificity to format as a Markdown table.
    return `[CRITICAL: Generate a data table in standard Markdown format. The table headers MUST be defined based on the instruction: "${feature}". Ensure the table includes relevant, specific data for MULTIPLE rows, not just headers. Plan out the rows, columns, and data for the table. **ABSOLUTELY FORBIDDEN: NEVER create empty tables - tables MUST have at least one data row with actual content after the header and separator. Tables with only headers and separator rows will be removed entirely.** **ABSOLUTELY FORBIDDEN: NEVER create a link column - links must be integrated into existing content columns (features, descriptions, product names, etc.) for better SEO. NEVER use column headers like 'Relevant Internal Links', 'Links', 'Link', 'Direct Link', or similar.**]`;
  }
  
  // 2. Check for FAQ feature - CRITICAL TABLE FORMAT REQUIRED
  if (normalizedFeature.includes('[faq]') || normalizedFeature.includes('faq')) {
    return `[CRITICAL: Generate a FAQ section with MANDATORY HEADER and TWO-COLUMN markdown table. DO NOT write paragraphs. DO NOT write lists. ONLY use header + table format.

REQUIRED FORMAT:
## Frequently Asked Questions About [Topic]

| Question | Helpful Answer |
|----------|----------------|
| Question 1 text here | Answer 1 text here (customer-service tone, clear, practical). |
| Question 2 text here | Answer 2 text here (customer-service tone, clear, practical). |
| Question 3 text here | Answer 3 text here (customer-service tone, clear, practical). |
| Question 4 text here | Answer 4 text here (customer-service tone, clear, practical). |

MANDATORY REQUIREMENTS:
1. **MANDATORY HEADER**: You MUST include "## Frequently Asked Questions About [Topic]" BEFORE the table
2. **MINIMUM 4 FAQs REQUIRED**: The table MUST contain AT LEAST 4 question-answer pairs
3. **ONLY AT BOTTOM**: This FAQ section must ONLY appear at the bottom of the page, never in the middle

ABSOLUTELY FORBIDDEN:
- NO paragraphs outside the table (except the header)
- NO bullet point lists
- NO numbered lists
- NO text after the table
- **ABSOLUTELY FORBIDDEN: NEVER use colons (\`:\`) anywhere in the content - they break code and must be replaced with periods**
- **ABSOLUTELY FORBIDDEN: NEVER use em dashes (Unicode U+2014 or U+2013) anywhere in the content - they must be replaced with comma and space (\`, \`)**
- **CRITICAL: Table headers must start with \`|\` not \`: |\`. NEVER use colons before table headers.**
- **ABSOLUTELY FORBIDDEN: NEVER start table rows with a period (\`.\`), colon (\`:\`), dash (\`-\`), or any other punctuation before the first pipe. Table rows MUST start with \`|\` not \`. |\`, \`: |\`, \`- |\`, etc.**
- **CRITICAL TABLE FORMAT**: Markdown tables MUST start with \`|\` (pipe character) - NEVER use \`. |\`, \`: |\`, \`- |\`, or any other character before the first pipe.
- **ABSOLUTELY FORBIDDEN: NEVER create empty tables - the FAQ table MUST have at least 4 data rows with actual question-answer content. Tables with only headers and separator rows (like "| Question | Answer |\n|---|---|") will be removed entirely.**
- ONLY the header + table format shown above

Generate the FAQ content using ONLY this format: Header first, then table with at least 4 FAQs. Every question and answer must be in table cells.]`;
  }
  
  // 3. Original switch for predefined features
  switch(normalizedFeature) {
    case 'i need an image':
      // The AI should treat this as a placeholder for an image/figure
      return '[Insert: Image, specify format e.g. PNG, JPEG, or embed a Markdown link to a figurative image/chart/gif/etc in the generated text]';
    case 'i need 3-5 links':
      // Detailed instruction for proper SEO linking as per user request. User specified 3-5 links.
      return '[Insert: Page Links (e.g., internal/external links related to the topic). CRITICAL: Ensure at least 3, but no more than 5, high-quality, relevant links are included. Ensure links are naturally woven into the prose, never ending a sentence with an anchor, and are surrounded by optimize SEO text.]';
    case 'i need a video':
       // New feature case for video
       return '[Insert: Video, specify an embed or a link to a relevant video in the generated text]';
    // Add more cases for other media types as needed (e.g., tables, lists)
    default:
      return feature;
  }
};
