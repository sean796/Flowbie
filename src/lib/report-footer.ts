/**
 * Standard report footer for GSC/SEO reports.
 * Always appended to the bottom of every generated report.
 */

import { AGENCY_NAME } from "./report-planner";

/**
 * Generate the report footer markdown.
 * Matches the branded footer: platform icons, agency name, slogan, data date.
 */
export function getReportFooterMarkdown(): string {
  const now = new Date();
  const dataDate = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `

---
**Google** · **Google Maps** · **Google Business** · **SEO**  |  **${AGENCY_NAME}** — Driving Your Digital Future.  
*Data as of ${dataDate}.*
`;
}
