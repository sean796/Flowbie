/**
 * Parse raw API data to extract keyword information
 * Handles both old format (direct) and new format (nested)
 */
export function parseRawApiData(rawApiData: any): Array<{ keyword: string; info: any }> {
  if (!rawApiData || (!rawApiData.tasks && !rawApiData.keywordOverview)) {
    return [];
  }

  // Handle both old format (direct) and new format (nested)
  const apiData = rawApiData.keywordOverview || rawApiData;
  
  console.log('[KeywordApiParser] Displaying data - apiData structure:', {
    hasTasks: !!apiData?.tasks,
    tasksLength: apiData?.tasks?.length,
    tasksType: Array.isArray(apiData?.tasks),
    apiDataKeys: apiData ? Object.keys(apiData) : []
  });
  
  const task = apiData?.tasks?.[0];
  const results: Array<{ keyword: string; info: any }> = [];
  
  // Extract keyword data from result - check if task exists and has result
  if (task && Array.isArray(task.result)) {
    console.log('[KeywordApiParser] Processing task.result, length:', task.result.length);
    task.result.forEach((resultItem: any) => {
      // Check if we have items array with keyword data
      if (resultItem.items && Array.isArray(resultItem.items) && resultItem.items.length > 0) {
        resultItem.items.forEach((item: any) => {
          if (item.keyword_info) {
            results.push({
              keyword: item.keyword || item.keyword_info.keyword || '',
              info: item.keyword_info
            });
          }
        });
      }
      // Also check direct keyword_info structure
      else if (resultItem.keyword_info) {
        results.push({
          keyword: resultItem.keyword || resultItem.keyword_info.keyword || '',
          info: resultItem.keyword_info
        });
      }
    });
  } else {
    console.warn('[KeywordApiParser] No task or task.result array found:', {
      hasTask: !!task,
      taskResultType: task?.result ? typeof task.result : 'undefined',
      taskResultIsArray: Array.isArray(task?.result)
    });
  }
  
  console.log('[KeywordApiParser] Extracted results count:', results.length);
  
  return results;
}

/**
 * Validate API data structure
 */
export function validateApiDataStructure(apiData: any): boolean {
  if (!apiData) return false;
  
  // Check for either tasks array or keywordOverview
  if (apiData.tasks && Array.isArray(apiData.tasks) && apiData.tasks.length > 0) {
    const task = apiData.tasks[0];
    return task && Array.isArray(task.result);
  }
  
  if (apiData.keywordOverview) {
    return validateApiDataStructure(apiData.keywordOverview);
  }
  
  return false;
}

