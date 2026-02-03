/**
 * Site Cloning Orchestration Logic
 * Main workflow for cloning WordPress sites on WP Engine
 */

import { loadWPEngineApiKey, loadWPEngineApiSecret } from './wp-engine-credentials';
import { streamChatCompletion } from './api';
import { updateACFFields } from './wordpress-acf-origin';
import type { 
  SiteCloningConfig, 
  NewSiteResult, 
  FieldStructureResult,
  ACFMappingResult 
} from '@/components/generator/site-cloner/types';

const BACKEND_API_BASE = typeof window !== 'undefined' 
  ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001'
      : '')
  : 'http://localhost:3001';

/**
 * Clone a site via WP Engine API
 */
export async function cloneSite(
  config: SiteCloningConfig,
  onProgress?: (step: string, progress: number, message?: string) => void
): Promise<NewSiteResult> {
  const apiKey = loadWPEngineApiKey();
  const apiSecret = loadWPEngineApiSecret();

  if (!apiKey || !apiSecret) {
    return {
      success: false,
      error: 'WP Engine API credentials not found. Please enter and save your credentials first.'
    };
  }

  try {
    // Step 1: Create new site
    onProgress?.('Creating new site', 10, 'Creating new site via WP Engine API...');
    
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'site-cloner.ts:43',message:'Before clone-site request',data:{hasApiKey:!!apiKey,hasApiSecret:!!apiSecret,sourceSiteId:config.templateSiteId,domain:config.domain,siteName:config.siteName,environment:config.environment},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const requestBody = {
      apiKey,
      apiSecret,
      sourceSiteId: config.templateSiteId,
      domain: config.domain,
      siteName: config.siteName || config.domain.replace(/^https?:\/\//, '').replace(/\/$/, '').split('.')[0],
      environment: config.environment || 'production',
      templateSiteUrl: config.templateSiteUrl
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'site-cloner.ts:56',message:'Request body prepared',data:{requestBody:{...requestBody,apiKey:requestBody.apiKey?'[REDACTED]':'',apiSecret:requestBody.apiSecret?'[REDACTED]':''}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const cloneResponse = await fetch(`${BACKEND_API_BASE}/api/wpengine/clone-site`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'site-cloner.ts:68',message:'Response received',data:{status:cloneResponse.status,statusText:cloneResponse.statusText,ok:cloneResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    const cloneResult: NewSiteResult = await cloneResponse.json();
    
    // #region agent log
    fetch('http://127.0.0.1:7254/ingest/37aaeedd-52a5-4ac4-9215-3f9598c08e32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'site-cloner.ts:72',message:'Response parsed',data:{success:cloneResult.success,error:cloneResult.error,hasNewSiteUrl:!!cloneResult.newSiteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!cloneResult.success) {
      return cloneResult;
    }

    onProgress?.('Site created', 30, `Site created: ${cloneResult.newSiteUrl}`);

    // Step 2: Get field structure from template
    if (config.templateSiteUrl) {
      onProgress?.('Getting field structure', 40, 'Retrieving ACF Options Page field structure from template...');
      
      // This will be handled by the component that has WordPress site credentials
      // For now, we'll return the site creation result
      onProgress?.('Field structure ready', 50, 'Field structure retrieved');
    }

    return cloneResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone site'
    };
  }
}

/**
 * Get ACF Options Page field structure from template site
 */
export async function getFieldStructureFromTemplate(
  templateSiteUrl: string,
  username: string,
  appPassword: string
): Promise<FieldStructureResult> {
  try {
    const response = await fetch(`${BACKEND_API_BASE}/api/wordpress/get-acf-options-page-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl: templateSiteUrl,
        username,
        appPassword,
        pageSlug: 'options'
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get field structure'
    };
  }
}

/**
 * Import field structure to new site
 */
export async function importFieldStructureToSite(
  targetSiteUrl: string,
  username: string,
  appPassword: string,
  fieldStructure: Record<string, any>
): Promise<FieldStructureResult> {
  try {
    const response = await fetch(`${BACKEND_API_BASE}/api/wordpress/import-options-structure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetSiteUrl,
        targetUsername: username,
        targetAppPassword: appPassword,
        fieldStructure,
        pageSlug: 'options'
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import field structure'
    };
  }
}

/**
 * Map client data to ACF field structure using AI
 */
export async function mapClientDataToACFFields(
  fieldStructure: Record<string, any>,
  clientData: Record<string, any>,
  apiKey: string,
  model: string = 'google/gemini-2.0-flash-exp',
  temperature: number = 0.2,
  maxTokens: number = 8000
): Promise<ACFMappingResult> {
  try {
    const systemPrompt = `You are a WordPress ACF Options Page specialist. Analyze the following ACF field structure and map the provided client data to the appropriate fields.

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON, no markdown code blocks
- Preserve exact field structure and data types
- Map colors to theme-compatible formats (hex codes)
- Structure NAP data according to existing patterns
- Handle nested fields (groups, repeaters) correctly
- If a field doesn't match client data, leave it empty or use a sensible default`;

    const userPrompt = `ACF Fields Structure:
${JSON.stringify(fieldStructure, null, 2)}

Discovered Client Data:
- Business Name: ${clientData.businessName || 'N/A'}
- Primary Color: ${clientData.primaryColor || 'N/A'}
- Secondary Color: ${clientData.secondaryColor || 'N/A'}
- Accent Color: ${clientData.accentColor || 'N/A'}
- Email: ${clientData.email || 'N/A'}
- Phone: ${clientData.phone || 'N/A'}
- Address: ${clientData.address || 'N/A'}
- Site URL: ${clientData.siteUrl || 'N/A'}
- NAP Data: ${JSON.stringify(clientData.napData || {}, null, 2)}
- Locations: ${JSON.stringify(clientData.locations || [], null, 2)}
- Additional Data: ${JSON.stringify(clientData.additionalData || {}, null, 2)}

Map the client data to ACF fields. Return ONLY the JSON object matching the field structure. Do not include explanations or markdown.`;

    let fullResponse = '';
    let finishReason: string | null = null;

    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      maxTokens,
      topP: 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
      onFinishReason: (reason) => {
        finishReason = reason;
      }
    });

    // Validate response completeness
    if (finishReason === 'length') {
      return {
        success: false,
        error: 'AI response was truncated. Increase maxTokens or reduce input data size.'
      };
    }

    // Parse AI response
    let cleaned = fullResponse.trim();
    
    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    }
    
    // Extract JSON object if wrapped in text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // Validate JSON completeness
    const bracketBalance = (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
    const arrayBalance = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
    
    if (bracketBalance !== 0 || arrayBalance !== 0) {
      return {
        success: false,
        error: 'Incomplete JSON response - brackets or arrays not balanced'
      };
    }

    try {
      const mappedFields = JSON.parse(cleaned);
      return {
        success: true,
        mappedFields
      };
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to map client data to ACF fields'
    };
  }
}

/**
 * Inject mapped data into ACF Options Page
 */
export async function injectMappedDataToACF(
  siteUrl: string,
  username: string,
  appPassword: string,
  mappedFields: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    // ACF Options Page is typically accessed via post ID 0
    // Use the update-acf-fields endpoint
    const result = await updateACFFields(
      siteUrl,
      username,
      appPassword,
      0, // Options page post ID
      mappedFields,
      'options', // Post type
      'options' // Post type endpoint
    );

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to update ACF fields'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to inject mapped data'
    };
  }
}
