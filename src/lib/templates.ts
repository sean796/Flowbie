import { BlueprintData } from "@/hooks/use-blueprint-management";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  blueprint: BlueprintData;
}

export const templates: Template[] = [
  {
    id: "seo-blog-post",
    name: "SEO Blog Post",
    description: "A comprehensive blog post structure optimized for SEO with introduction, main content, FAQ, and conclusion sections.",
    category: "Content Creation",
    blueprint: {
      title: "Ultimate Guide to [Topic]",
      purpose: "Create a comprehensive, SEO-optimized blog post that provides valuable information and answers common questions about the topic.",
      timestamp: new Date().toISOString(),
      knowledgeFiles: [],
      agents: [
        {
          id: "intro-agent",
          step: 1,
          title: "Understanding [Topic]",
          description: "Hook readers with an engaging overview that outlines what they'll learn and why it matters.",
          features: [
            "[LIST]: Key points the article will cover",
            "[HEADING]: Main headline"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "main-content-agent",
          step: 2,
          title: "Main Content",
          description: "Provide detailed, valuable information broken down into digestible sections with examples and practical tips.",
          features: [
            "[LIST]: Important points with bold labels",
            "[TABLE]: Comparative data or key information",
            "[IMAGE]: Visual aid or illustration"
          ],
          h2Count: 3,
          h3Count: 2,
          h3Enabled: true,
          headingLevel: 2
        },
        {
          id: "conclusion-agent",
          step: 3,
          title: "Conclusion",
          description: "Summarize key takeaways and provide a clear call-to-action or next steps for readers.",
          features: [
            "[LIST]: Key takeaways",
            "[LINK]: 3-5 relevant resources or related articles"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "faq-agent",
          step: 4,
          title: "FAQ Section",
          description: "Answer the most common questions readers have about the topic.",
          features: [
            "[FAQ]: 2-column Q&A table with common questions and answers"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        }
      ]
    }
  },
  {
    id: "product-review",
    name: "Product Review",
    description: "A structured review format covering overview, features, pros/cons, and final verdict.",
    category: "Reviews",
    blueprint: {
      title: "[Product Name] Review: Is It Worth It?",
      purpose: "Provide an honest, comprehensive review of the product that helps readers make an informed purchasing decision.",
      timestamp: new Date().toISOString(),
      knowledgeFiles: [],
      agents: [
        {
          id: "overview-agent",
          step: 1,
          title: "Product Overview",
          description: "Introduce the product, its intended use, and what makes it noteworthy.",
          features: [
            "[LIST]: Key specifications",
            "[IMAGE]: Product image or visual"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "features-agent",
          step: 2,
          title: "Key Features",
          description: "Break down the main features and functionality of the product.",
          features: [
            "[LIST]: Features with detailed descriptions",
            "[TABLE]: Feature comparison if applicable"
          ],
          h2Count: 1,
          h3Count: 3,
          h3Enabled: true,
          headingLevel: 2
        },
        {
          id: "pros-cons-agent",
          step: 3,
          title: "Pros and Cons",
          description: "Provide a balanced view of the product's strengths and weaknesses.",
          features: [
            "[LIST]: Pros with brief explanations",
            "[LIST]: Cons with brief explanations"
          ],
          h2Count: 2,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "verdict-agent",
          step: 4,
          title: "Final Verdict",
          description: "Summarize who should buy this product and provide a clear recommendation.",
          features: [
            "[QUOTE]: Highlighted recommendation",
            "[LINK]: Where to buy or learn more"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        }
      ]
    }
  },
  {
    id: "how-to-guide",
    name: "How-To Guide",
    description: "A step-by-step instructional guide with introduction, detailed steps, tips, and summary.",
    category: "Tutorials",
    blueprint: {
      title: "How to [Task]: A Step-by-Step Guide",
      purpose: "Create a clear, actionable guide that walks readers through a process from start to finish.",
      timestamp: new Date().toISOString(),
      knowledgeFiles: [],
      agents: [
        {
          id: "intro-agent",
          step: 1,
          title: "Getting Started with [Topic]",
          description: "Explain what readers will learn and what they need to get started.",
          features: [
            "[LIST]: Prerequisites or required materials",
            "[HEADING]: Clear goal statement"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "steps-agent",
          step: 2,
          title: "Step-by-Step Instructions",
          description: "Provide detailed, numbered steps with clear explanations for each action.",
          features: [
            "[NUMBERED LIST]: Detailed step-by-step instructions",
            "[IMAGE]: Visual aid for complex steps"
          ],
          h2Count: 1,
          h3Count: 5,
          h3Enabled: true,
          headingLevel: 2
        },
        {
          id: "tips-agent",
          step: 3,
          title: "Tips and Best Practices",
          description: "Share expert tips, common mistakes to avoid, and best practices.",
          features: [
            "[LIST]: Helpful tips with explanations",
            "[QUOTE]: Important warning or highlight"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "summary-agent",
          step: 4,
          title: "Summary",
          description: "Recap the key points and provide next steps or related resources.",
          features: [
            "[LIST]: Key takeaways",
            "[LINK]: Related guides or resources"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        }
      ]
    }
  },
  {
    id: "comparison-article",
    name: "Comparison Article",
    description: "Compare multiple options with introduction, comparison table, detailed analysis, and conclusion.",
    category: "Comparison",
    blueprint: {
      title: "[Option A] vs [Option B]: Which is Better?",
      purpose: "Compare two or more options to help readers make an informed decision based on their specific needs.",
      timestamp: new Date().toISOString(),
      knowledgeFiles: [],
      agents: [
        {
          id: "intro-agent",
          step: 1,
          title: "Understanding the Comparison",
          description: "Set the context for the comparison and explain what will be compared.",
          features: [
            "[LIST]: Comparison criteria",
            "[HEADING]: Main comparison question"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "comparison-table-agent",
          step: 2,
          title: "Comparison Table",
          description: "Provide a side-by-side comparison of key features and attributes.",
          features: [
            "[TABLE]: Feature comparison with rows for each criterion"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        },
        {
          id: "analysis-agent",
          step: 3,
          title: "Detailed Analysis",
          description: "Dive deep into each option's strengths, weaknesses, and use cases.",
          features: [
            "[LIST]: Detailed points for each option",
            "[QUOTE]: Key differentiators highlighted"
          ],
          h2Count: 2,
          h3Count: 4,
          h3Enabled: true,
          headingLevel: 2
        },
        {
          id: "conclusion-agent",
          step: 4,
          title: "Conclusion",
          description: "Summarize which option is best for different scenarios and provide a clear recommendation.",
          features: [
            "[LIST]: Recommendations by use case",
            "[LINK]: Where to find each option"
          ],
          h2Count: 1,
          h3Count: 0,
          h3Enabled: false,
          headingLevel: 2
        }
      ]
    }
  }
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): Template[] {
  return templates.filter(t => t.category === category);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(templates.map(t => t.category)));
}
