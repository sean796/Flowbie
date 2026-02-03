/**
 * NAP (Name, Address, Phone) Extractor
 * Finds contact pages and location sitemaps via WordPress API, then uses AI to extract locations
 */

import type { WordPressSite, NAPInfo, Location } from '@/components/integrations/types';
import { parseSitemap } from './wordpress-api';
import { streamChatCompletion } from './api';
import { htmlToMarkdown } from './wordpress-converter';

export interface NAPExtractionResult {
  success: boolean;
  napInfo?: NAPInfo;
  error?: string;
}

export interface NAPExtractionProgress {
  step: string;
  progress: number;
  message?: string;
}

/**
 * Checks if a page exists by slug using WordPress API
 */
async function checkPageExists(
  site: WordPressSite,
  slug: string
): Promise<{ id: number; slug: string; title: string; link: string } | null> {
  try {
    const normalizedUrl = site.siteUrl.replace(/\/$/, '');
    const authHeader = site.username && site.appPassword 
      ? `Basic ${btoa(`${site.username}:${site.appPassword}`)}`
      : null;

    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&status=publish&per_page=1`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const page = data[0];
        return {
          id: page.id,
          slug: page.slug,
          title: page.title?.rendered || page.title || '',
          link: page.link || `${normalizedUrl}/${page.slug}`,
        };
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Finds location sitemap if it exists
 */
async function findLocationSitemap(
  site: WordPressSite,
  onProgress?: (message: string) => void
): Promise<string[]> {
  if (!site.sitemaps?.mainSitemapUrl) {
    return [];
  }

  try {
    onProgress?.('🔍 Checking for location sitemap...');
    
    // Parse main sitemap to find location-related child sitemaps
    const parseResult = await parseSitemap(
      site.siteUrl,
      site.sitemaps.mainSitemapUrl,
      site.username,
      site.appPassword
    );

    if (parseResult.childSitemaps) {
      const locationSitemaps = parseResult.childSitemaps.filter(url => {
        const urlLower = url.toLowerCase();
        return urlLower.includes('location') || urlLower.includes('locations');
      });

      if (locationSitemaps.length > 0) {
        // Get URLs from location sitemap(s)
        const allUrls: string[] = [];
        for (const sitemapUrl of locationSitemaps) {
          try {
            const locationParseResult = await parseSitemap(
              site.siteUrl,
              sitemapUrl,
              site.username,
              site.appPassword
            );
            if (locationParseResult.urls) {
              allUrls.push(...locationParseResult.urls);
            }
          } catch (error) {
            console.warn(`[NAP Extractor] Error parsing location sitemap ${sitemapUrl}:`, error);
          }
        }
        return allUrls.slice(0, 20); // Limit to 20 URLs for token optimization
      }
    }
  } catch (error) {
    console.warn('[NAP Extractor] Error checking for location sitemap:', error);
  }

  return [];
}

/**
 * Finds contact page using WordPress API (checks if it exists first)
 */
async function findContactPage(
  site: WordPressSite,
  onProgress?: (message: string) => void
): Promise<Array<{ id: number; slug: string; title: string; link: string }>> {
  const foundPages: Array<{ id: number; slug: string; title: string; link: string }> = [];

  onProgress?.('🔍 Checking for contact page...');

  // Check for contact page (most common)
  const contactPage = await checkPageExists(site, 'contact');
  if (contactPage) {
    foundPages.push(contactPage);
  }

  // Also check for homepage (often has contact info)
  const homepage = await checkPageExists(site, '');
  if (homepage && !foundPages.find(p => p.id === homepage.id)) {
    foundPages.unshift(homepage); // Add homepage first
  }

  return foundPages;
}

/**
 * Fetches page content from WordPress REST API by page ID
 */
async function fetchPageContentById(
  site: WordPressSite,
  pageId: number
): Promise<{ title: string; content: string; url: string } | null> {
  try {
    const normalizedUrl = site.siteUrl.replace(/\/$/, '');
    const authHeader = site.username && site.appPassword 
      ? `Basic ${btoa(`${site.username}:${site.appPassword}`)}`
      : null;

    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/pages/${pageId}`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    });

    if (response.ok) {
      const data = await response.json();
      const title = data.title?.rendered || data.title || '';
      const contentHtml = data.content?.rendered || data.content || '';
      const excerptHtml = data.excerpt?.rendered || data.excerpt || '';
      const contentText = htmlToMarkdown(contentHtml).trim();
      const excerptText = htmlToMarkdown(excerptHtml).trim();
      const fullContent = excerptText ? excerptText + '\n\n' + contentText : contentText;
      
      return {
        title,
        content: fullContent,
        url: data.link || `${normalizedUrl}/${data.slug || ''}`,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[NAP Extractor] Error fetching page ${pageId}:`, error);
    return null;
  }
}

/**
 * Fetches page content from URL (for location sitemap URLs)
 */
async function fetchPageContentFromUrl(
  site: WordPressSite,
  url: string
): Promise<{ title: string; content: string; url: string } | null> {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
    const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;
    
    if (!slug) {
      return null;
    }

    const normalizedUrl = site.siteUrl.replace(/\/$/, '');
    const authHeader = site.username && site.appPassword 
      ? `Basic ${btoa(`${site.username}:${site.appPassword}`)}`
      : null;

    // Try pages first, then posts
    const postTypes = ['pages', 'posts'];
    
    // Detect custom post type from URL path
    if (pathSegments.length > 1) {
      const pathSegment = pathSegments[0];
      postTypes.push(pathSegment.replace(/-/g, '_'));
    }

    for (const postType of postTypes) {
      try {
        const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(slug)}`;
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(authHeader ? { 'Authorization': authHeader } : {}),
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const contentData = data[0];
            const title = contentData.title?.rendered || contentData.title || '';
            const contentHtml = contentData.content?.rendered || contentData.content || '';
            const excerptHtml = contentData.excerpt?.rendered || contentData.excerpt || '';
            const contentText = htmlToMarkdown(contentHtml).trim();
            const excerptText = htmlToMarkdown(excerptHtml).trim();
            const fullContent = excerptText ? excerptText + '\n\n' + contentText : contentText;
            
            return {
              title,
              content: fullContent,
              url,
            };
          }
        }
      } catch (error) {
        // Continue to next post type
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[NAP Extractor] Error fetching page ${url}:`, error);
    return null;
  }
}

/**
 * Uses AI to intelligently extract locations from scraped content (token optimized)
 */
async function extractLocationsWithAI(
  scrapedPages: Array<{ title: string; content: string; url: string }>,
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<NAPInfo | null> {
  onProgress?.('🤖 AI analyzing pages to find all locations...');
  
  // Token optimization: Limit content per page and total content
  const maxContentPerPage = 2000; // Reduced from 3000
  const maxTotalContent = 15000; // Reduced from 30000
  
  // Combine all page content with limits
  let totalLength = 0;
  const combinedContent = scrapedPages.map((page, index) => {
    const pageContent = page.content.substring(0, maxContentPerPage);
    const pageText = `=== Page ${index + 1}: ${page.title} (${page.url}) ===\n${pageContent}`;
    
    if (totalLength + pageText.length > maxTotalContent) {
      return null; // Skip if we'd exceed limit
    }
    
    totalLength += pageText.length;
    return pageText;
  }).filter(Boolean).join('\n\n---\n\n');

  const systemPrompt = `You are a LOCAL CONTENT SPECIALIST and expert at extracting complete business location information (NAPE: Name, Address, Phone, Email) from website content. Your job is to find FULL, COMPLETE contact details for each location.

CRITICAL REQUIREMENTS - ACT LIKE A LOCAL CONTENT SPECIALIST:
1. Extract ALL locations found across pages - be thorough and comprehensive
2. For EACH location, extract COMPLETE details:
   - Full business name (location-specific if different, e.g., "Business Name - City Location")
   - Complete street address (street number, street name, suite/unit if present)
   - City name (full city name, not abbreviated)
   - State (2-letter abbreviation: FL, CA, TX, etc.)
   - ZIP code (5-digit or 9-digit format)
   - Phone number (location-specific if available, otherwise general)
   - Email address (location-specific if available, otherwise use general business email)
3. EMAIL FALLBACK RULE: If a location doesn't have a specific email, use the general business email from the contact page or footer
4. Be thorough - look in:
   - Contact pages
   - Location pages
   - Footer sections
   - Header/contact bars
   - Service area pages
   - About pages
   - Any structured data (JSON-LD, microdata)
5. Mark primary/main location as isDefault: true
6. Deduplicate - same address = one location
7. DO NOT use "Not specified" or placeholder text - use empty strings "" or omit fields if data is truly not available
8. Return ONLY valid JSON

Format:
{
  "name": "Business name",
  "address": "Primary address",
  "phone": "Primary phone",
  "email": "Primary email",
  "locations": [
    {
      "name": "Location name",
      "address": "Street address",
      "city": "City",
      "state": "ST",
      "zip": "12345",
      "phone": "Phone",
      "email": "Email address",
      "isDefault": true/false
    }
  ]
}`;

  const userPrompt = `As a LOCAL CONTENT SPECIALIST, analyze this website content and extract ALL business locations with COMPLETE NAPE (Name, Address, Phone, Email) information.

Be thorough and extract:
- Full business names for each location (include location identifier if present)
- Complete street addresses (not just city/state)
- Full city names
- State abbreviations
- ZIP codes
- Phone numbers (location-specific preferred)
- Email addresses (location-specific if available, otherwise use general business email)

Content to analyze:
${combinedContent}

Extract every location mentioned. For locations without specific emails, use the general business email found in contact sections or footer. Return complete JSON with all location details.`;

  try {
    let aiResponse = '';
    await streamChatCompletion({
      apiKey,
        model: getResearchModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 3000, // Reduced from 4000
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });

    if (!aiResponse || aiResponse.trim().length === 0) {
      return null;
    }

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonMatch = [jsonMatch[0], jsonMatch[1]];
      }
    }

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText);
      
      // Clean up "Not specified" values
      const cleanValue = (val: any) => {
        if (!val || val === 'Not specified' || val === 'not specified' || (typeof val === 'string' && val.trim() === '')) {
          return undefined;
        }
        return typeof val === 'string' ? val.trim() : val;
      };
      
      const napInfo: NAPInfo = {
        name: cleanValue(parsed.name),
        address: cleanValue(parsed.address),
        phone: cleanValue(parsed.phone),
        email: cleanValue(parsed.email),
      };

      // Process locations
      if (parsed.locations && Array.isArray(parsed.locations) && parsed.locations.length > 0) {
        const locations: Location[] = parsed.locations.map((loc: any, index: number) => {
          // Clean up "Not specified" values
          const cleanValue = (val: any) => {
            if (!val || val === 'Not specified' || val === 'not specified' || (typeof val === 'string' && val.trim() === '')) {
              return '';
            }
            return typeof val === 'string' ? val.trim() : String(val).trim();
          };
          
          // Email fallback: use location-specific email, then general business email
          const locationEmail = cleanValue(loc.email || loc.emailAddress);
          const generalEmail = cleanValue(napInfo.email);
          const finalEmail = locationEmail || generalEmail || undefined;
          
          // Phone fallback: use location-specific phone, then general business phone
          const locationPhone = cleanValue(loc.phone || loc.telephone);
          const generalPhone = cleanValue(napInfo.phone);
          const finalPhone = locationPhone || generalPhone || '';
          
          // Name: prefer location-specific name, fallback to business name with location identifier
          let locationName = cleanValue(loc.name);
          if (!locationName && napInfo.name) {
            // Try to create location-specific name from city
            const city = cleanValue(loc.city || loc.addressLocality);
            if (city) {
              locationName = `${napInfo.name} - ${city}`;
            } else {
              locationName = napInfo.name;
            }
          }
          if (!locationName) {
            locationName = `Location ${index + 1}`;
          }
          
          return {
            id: `loc-${Date.now()}-${index}`,
            name: locationName,
            address: cleanValue(loc.address || loc.streetAddress),
            city: cleanValue(loc.city || loc.addressLocality),
            state: cleanValue(loc.state || loc.addressRegion),
            zip: cleanValue(loc.zip || loc.postalCode || loc.zipCode),
            phone: finalPhone,
            email: finalEmail,
            isDefault: loc.isDefault !== undefined ? loc.isDefault : index === 0,
          };
        });
        
        napInfo.locations = locations;
      } else if (napInfo.name || napInfo.address || napInfo.phone) {
        // Create single location from top-level fields
        // Parse address more carefully
        const fullAddress = napInfo.address || '';
        const addressParts = fullAddress.split(',').map(s => s.trim());
        
        // Try to extract street address (everything before city/state/zip)
        let streetAddress = '';
        let city = '';
        let state = '';
        let zip = '';
        
        if (addressParts.length >= 2) {
          // Last part is usually state/zip
          const lastPart = addressParts[addressParts.length - 1];
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
          if (stateZipMatch) {
            state = stateZipMatch[1];
            zip = stateZipMatch[2];
            // Second to last is usually city
            if (addressParts.length >= 3) {
              city = addressParts[addressParts.length - 2];
              streetAddress = addressParts.slice(0, -2).join(', ');
            } else {
              city = '';
              streetAddress = addressParts[0];
            }
          } else {
            // No state/zip pattern, assume last is city
            city = addressParts[addressParts.length - 1];
            streetAddress = addressParts.slice(0, -1).join(', ');
          }
        } else if (addressParts.length === 1) {
          streetAddress = addressParts[0];
        }
        
        napInfo.locations = [{
          id: `loc-${Date.now()}`,
          name: napInfo.name || 'Location',
          address: streetAddress || fullAddress,
          city: city || '',
          state: state || '',
          zip: zip || '',
          phone: napInfo.phone || '',
          email: napInfo.email || undefined,
          isDefault: true,
        }];
      }

      // Ensure at least one location is marked as default
      if (napInfo.locations && napInfo.locations.length > 0) {
        const hasDefault = napInfo.locations.some(loc => loc.isDefault);
        if (!hasDefault) {
          napInfo.locations[0].isDefault = true;
        }
      }

      return napInfo;
    }

    return null;
  } catch (error) {
    console.error('[NAP Extractor] AI extraction error:', error);
    return null;
  }
}

/**
 * Main function to extract NAP information
 */
export async function extractNAPFromSite(
  site: WordPressSite,
  apiKey: string,
  onProgress?: (progress: NAPExtractionProgress) => void
): Promise<NAPExtractionResult> {
  console.log('[NAP Extractor] Starting NAP extraction for:', site.name || site.siteUrl);

  try {
    onProgress?.({ step: 'finding_sources', progress: 0, message: 'Finding contact page and location sitemap...' });

    // Step 1: Find contact page (check if exists first)
    const contactPages = await findContactPage(site, (message) => {
      onProgress?.({ step: 'finding_sources', progress: 10, message });
    });

    // Step 2: Find location sitemap if it exists
    const locationUrls = await findLocationSitemap(site, (message) => {
      onProgress?.({ step: 'finding_sources', progress: 20, message });
    });

    if (contactPages.length === 0 && locationUrls.length === 0) {
      return {
        success: false,
        error: 'No contact page or location sitemap found. Please ensure your site has a contact page or location sitemap.',
      };
    }

    onProgress?.({ step: 'scraping_pages', progress: 30, message: `Found ${contactPages.length} contact page(s) and ${locationUrls.length} location URL(s). Fetching content...` });

    // Step 3: Fetch content from contact pages
    const scrapedPages: Array<{ title: string; content: string; url: string }> = [];
    
    for (let i = 0; i < contactPages.length; i++) {
      const page = contactPages[i];
      const progress = 30 + Math.floor((i / (contactPages.length + locationUrls.length)) * 50);
      
      onProgress?.({ 
        step: 'scraping_pages', 
        progress, 
        message: `Fetching contact page ${i + 1}/${contactPages.length}: ${page.title}...` 
      });
      
      const pageContent = await fetchPageContentById(site, page.id);
      if (pageContent && pageContent.content) {
        scrapedPages.push(pageContent);
      }
    }

    // Step 4: Fetch content from location sitemap URLs
    for (let i = 0; i < locationUrls.length; i++) {
      const url = locationUrls[i];
      const progress = 30 + Math.floor(((contactPages.length + i) / (contactPages.length + locationUrls.length)) * 50);
      
      onProgress?.({ 
        step: 'scraping_pages', 
        progress, 
        message: `Fetching location page ${i + 1}/${locationUrls.length}...` 
      });
      
      const pageContent = await fetchPageContentFromUrl(site, url);
      if (pageContent && pageContent.content) {
        scrapedPages.push(pageContent);
      }
    }

    if (scrapedPages.length === 0) {
      return {
        success: false,
        error: 'Could not fetch content from any pages. Please check site connection.',
      };
    }

    onProgress?.({ step: 'ai_analysis', progress: 80, message: `Analyzing ${scrapedPages.length} page(s) with AI to extract locations...` });

    // Step 5: Use AI to extract locations (token optimized)
    const napInfo = await extractLocationsWithAI(scrapedPages, apiKey, (message) => {
      onProgress?.({ step: 'ai_analysis', progress: 85, message });
    });

    if (!napInfo || !napInfo.locations || napInfo.locations.length === 0) {
      return {
        success: false,
        error: 'AI could not extract location information from pages.',
      };
    }

    onProgress?.({ step: 'complete', progress: 100, message: `Successfully extracted ${napInfo.locations.length} location(s)` });

    console.log('[NAP Extractor] Extraction completed:', napInfo);

    return {
      success: true,
      napInfo,
    };
  } catch (error) {
    console.error('[NAP Extractor] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during NAP extraction',
    };
  }
}
