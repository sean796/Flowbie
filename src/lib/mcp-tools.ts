/**
 * MCP Tools Wrapper
 * This file provides access to MCP tools for DataForSEO
 * MCP tools are called through a backend API endpoint that interfaces with the MCP server
 */

// Backend API endpoint for MCP calls
// In development, this should point to your backend server (e.g., http://localhost:3001/api/mcp)
// In production, use your deployed backend URL
// Default to localhost:3001 in development if VITE_MCP_API_BASE is not set
const MCP_API_BASE = import.meta.env.VITE_MCP_API_BASE || 
  (import.meta.env.DEV ? 'http://localhost:3001/api/mcp' : '/api/mcp');

async function callMCPTool(toolName: string, params: any): Promise<any> {
  const url = `${MCP_API_BASE}/${toolName}`;
  
  // Log the request for debugging
  console.log(`[MCP] Calling: ${url}`, params);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let errorText = '';
      let errorData = null;
      
      try {
        errorText = await response.text();
        // Try to parse as JSON for better error messages
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use as text
        }
      } catch {
        errorText = `HTTP ${response.status} ${response.statusText}`;
      }
      
      // Provide more detailed error message
      const errorMessage = errorData?.error || errorData?.message || errorText;
      const errorDetails = errorData?.details ? `\nDetails: ${JSON.stringify(errorData.details, null, 2)}` : '';
      
      throw new Error(`MCP API error (${response.status}): ${errorMessage}${errorDetails}`);
    }

    const responseData = await response.json();
    console.log('[MCP] Response received:', {
      status: response.status,
      has_tasks: !!responseData.tasks,
      tasks_count: responseData.tasks?.length,
      first_task_status: responseData.tasks?.[0]?.status_code,
      first_task_result_count: responseData.tasks?.[0]?.result_count,
      full_response: responseData
    });
    
    return responseData;
  } catch (error) {
    // Check for network/connection errors
    const isNetworkError = error instanceof TypeError && 
      (error.message.includes('fetch') || 
       error.message.includes('Failed to fetch') ||
       error.message.includes('NetworkError') ||
       error.message.includes('Network request failed'));
    
    if (isNetworkError) {
      const currentUrl = url;
      throw new Error(
        `Cannot connect to MCP API server at ${currentUrl}\n\n` +
        `Please start the backend server:\n\n` +
        `1. Open a terminal in the project root directory\n` +
        `2. Run: node server/server.js (from project root)\n\n` +
        `The server should start on http://localhost:3001\n\n` +
        `Or from the server folder:\n` +
        `1. cd server\n` +
        `2. npm install (if not already done)\n` +
        `3. node server.js\n\n` +
        `Alternative: Set VITE_MCP_API_BASE in your .env file to point to your backend URL.`
      );
    }
    
    // If it's a 404 or 501 error, provide setup instructions
    if (error.message && (error.message.includes('404') || error.message.includes('501'))) {
      throw new Error(
        `MCP API endpoint not configured. Please:\n\n` +
        `1. Start the backend server (see server/ or START_BACKEND_SERVER.md)\n` +
        `2. Set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD in the backend environment\n` +
        `3. Ensure the backend is running on the correct port`
      );
    }
    
    throw error;
  }
}

// Wrapper functions for MCP tools
export const mcp_DataForSEO_dataforseo_labs_google_keyword_overview = async (params: {
  keywords: string[];
  location_name: string;
  language_code: string;
}) => {
  return callMCPTool('DataForSEO_dataforseo_labs_google_keyword_overview', params);
};

export const mcp_DataForSEO_dataforseo_labs_google_keyword_ideas = async (params: {
  keywords: string[];
  location_name: string;
  language_code: string;
  limit?: number;
}) => {
  return callMCPTool('DataForSEO_dataforseo_labs_google_keyword_ideas', params);
};

export const mcp_DataForSEO_dataforseo_labs_google_related_keywords = async (params: {
  keyword: string;
  location_name: string;
  language_code: string;
  limit?: number;
}) => {
  return callMCPTool('DataForSEO_dataforseo_labs_google_related_keywords', params);
};

// Search intent MCP tool removed - using heuristics instead
// SERP/Competitor analysis removed - keeping it simple, just keyword data
