import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  TestTube, 
  Map, 
  Network,
  Loader2,
  Database,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { type WordPressSite } from "../types";
import { getCyberpunkButtonClasses, getCyberpunkTextClasses } from "./cyberpunk-theme";
import { toast } from "sonner";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";

interface ACFTestResult {
  success: boolean;
  hasAcfSupport?: boolean;
  acfFields?: Record<string, unknown>;
  error?: string;
  requiredConfig?: { php: string[] };
}

interface WordPressCardActionsProps {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isExtractingNAPAndGraph: boolean;
  onTest: () => void;
  onDetect: () => void;
  onExtractNAPAndGraph?: () => void;
}

export const WordPressCardActions: React.FC<WordPressCardActionsProps> = ({
  site,
  isTesting,
  isDetecting,
  isExtractingNAPAndGraph,
  onTest,
  onDetect,
  onExtractNAPAndGraph,
}) => {
  const isDisabled = site.enabled === false;
  const [isTestingACF, setIsTestingACF] = useState(false);
  const [acfTestResult, setAcfTestResult] = useState<ACFTestResult & { dateModifierSet?: boolean; postId?: number; postUrl?: string } | null>(null);

  const handleTestACFRest = async () => {
    setIsTestingACF(true);
    setAcfTestResult(null);
    
    // #region agent log
    fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:handleTestACFRest:entry',message:'ACF Test started',data:{entitySitemapUrl:site.entitySitemapUrl,siteUrl:site.siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    
    try {
      // Use entity sitemap URL to determine the correct endpoint
      let testPostType = 'post';
      let testEndpoint = 'posts';
      
      // Priority: Use entitySitemapUrl if available (this is the entity/CPT endpoint)
      if (site.entitySitemapUrl) {
        testEndpoint = extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl);
        testPostType = testEndpoint; // For CPTs, type and endpoint are usually the same
        // #region agent log
        fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:extractEndpoint',message:'Extracted endpoint from entitySitemapUrl',data:{entitySitemapUrl:site.entitySitemapUrl,extractedEndpoint:testEndpoint,testPostType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.log('[ACF Test] Using entity endpoint from entitySitemapUrl:', testEndpoint);
      }
      
      // CREATE A NEW POST with date_modifier set to today - skip validation, just do it
      let dateModifierSet = false;
      let newPostId: number | undefined;
      let postUrl: string | undefined;
      let createError: string | undefined;
      const today = new Date().toISOString().split('T')[0]; // "2026-01-19"
      
      console.log('[ACF Test] Creating new entity post with endpoint:', testEndpoint);
      
      try {
        const requestBody = {
          siteUrl: site.siteUrl,
          username: site.username,
          appPassword: site.appPassword,
          title: `ACF Test - ${today}`,
          content: `<p>Test post created to verify ACF REST API. Date modifier: ${today}</p>`,
          status: 'draft',
          postType: testPostType,
          postTypeEndpoint: testEndpoint
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:beforeCreatePost',message:'About to call create-post API',data:{siteUrl:site.siteUrl,postType:testPostType,postTypeEndpoint:testEndpoint,title:requestBody.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
        // #endregion
        
        // Create a new post in the entity CPT
        const createResponse = await fetch('/api/wordpress/create-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const createData = await createResponse.json();
        
        // #region agent log
        fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:afterCreatePost',message:'create-post API response',data:{status:createResponse.status,success:createData.success,error:createData.error,id:createData.id,fullResponse:createData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
        // #endregion
        
        console.log('[ACF Test] Create response:', createData);
        console.log('[ACF Test] Request was:', {
          siteUrl: site.siteUrl,
          postType: testPostType,
          postTypeEndpoint: testEndpoint,
          entitySitemapUrl: site.entitySitemapUrl
        });
        
        if (createData.success && (createData.postId || createData.id)) {
          newPostId = createData.postId || createData.id;
          postUrl = createData.link || createData.url;
          // #region agent log
          fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:postCreatedSuccess',message:'Post created successfully',data:{postId:newPostId,postUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Now set the date_modifier ACF field on the new post
          // #region agent log
          fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:beforeACFUpdate',message:'About to call update-acf-fields',data:{postId:newPostId,postType:testPostType,postTypeEndpoint:testEndpoint,dateModifier:today},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'ACF-A'})}).catch(()=>{});
          // #endregion
          
          const acfUpdateResponse = await fetch('/api/wordpress/update-acf-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteUrl: site.siteUrl,
              username: site.username,
              appPassword: site.appPassword,
              postId: newPostId,
              postType: testPostType,
              postTypeEndpoint: testEndpoint,
              fields: {
                date_modifier: today
              },
              options: {
                verifyAfterUpdate: true
              }
            })
          });
          
          const acfUpdateData = await acfUpdateResponse.json();
          
          // #region agent log
          fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:afterACFUpdate',message:'ACF update response received',data:{success:acfUpdateData.success,error:acfUpdateData.error,updated:acfUpdateData.updated,failed:acfUpdateData.failed,fullResponse:acfUpdateData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'ACF-B'})}).catch(()=>{});
          // #endregion
          
          console.log('[ACF Test] ACF update response:', acfUpdateData);
          dateModifierSet = acfUpdateData.success;
          
          if (dateModifierSet) {
            console.log(`[ACF Test] Created new post ${newPostId} with date_modifier = ${today}`);
          } else {
            console.warn('[ACF Test] Post created but failed to set date_modifier:', acfUpdateData.error || acfUpdateData.failed);
          }
        } else {
          createError = createData.error || 'Failed to create post';
          // #region agent log
          fetch('http://127.0.0.1:7253/ingest/49ff171c-cf9a-4d4f-97a9-e94da0b5df56',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WordPressCardActions.tsx:postCreateFailed',message:'Post creation failed',data:{error:createError,fullResponse:createData,httpStatus:createResponse.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D,E'})}).catch(()=>{});
          // #endregion
          console.error('[ACF Test] Failed to create test post:', createError);
        }
      } catch (err) {
        createError = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ACF Test] Error creating test post:', err);
      }
      
      const success = !!newPostId;
      
      setAcfTestResult({
        success,
        hasAcfSupport: success,
        dateModifierSet,
        postId: newPostId,
        postUrl,
        error: createError
      });
      
      if (success) {
        if (dateModifierSet && newPostId) {
          toast.success('New entity post created with date_modifier!', { 
            description: `Post ID: ${newPostId} in ${testEndpoint}, date_modifier: ${today}` 
          });
        } else if (newPostId) {
          toast.warning('Post created but date_modifier not set', {
            description: `Post ID: ${newPostId} - check if date_modifier field exists on this CPT`
          });
        }
      } else {
        toast.error('Failed to create entity post', {
          description: createError || 'Check console for details'
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setAcfTestResult({
        success: false,
        error: errorMsg
      });
      toast.error('ACF REST Test Failed', { description: errorMsg });
    } finally {
      setIsTestingACF(false);
    }
  };

  return (
    <div className="space-y-2 mt-3">
      <div className="flex gap-2">
        {onExtractNAPAndGraph && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExtractNAPAndGraph}
            disabled={isExtractingNAPAndGraph || isDisabled}
            className={`flex-1 font-medium ${getCyberpunkButtonClasses()} transition-all`}
          >
            {isExtractingNAPAndGraph ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Network className="h-4 w-4 mr-2" />
                Extract NAP & Graph
              </>
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={isTesting || isDisabled}
          className={`flex-1 ${getCyberpunkButtonClasses()} transition-all`}
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TestTube className="h-4 w-4 mr-2" />
              Test Connection
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDetect}
          disabled={isDetecting || isDisabled}
          className={`flex-1 ${getCyberpunkButtonClasses()} transition-all`}
        >
          {isDetecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Map className="h-4 w-4 mr-2" />
              Detect Sitemaps
            </>
          )}
        </Button>
      </div>
      
      {/* ACF REST API Test Button - also sets date_modifier on first sitemap post */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestACFRest}
          disabled={isTestingACF || isDisabled}
          className={`flex-1 ${getCyberpunkButtonClasses()} transition-all ${
            acfTestResult?.success 
              ? 'border-green-500/50 bg-green-500/10' 
              : acfTestResult?.success === false 
                ? 'border-red-500/50 bg-red-500/10' 
                : ''
          }`}
          title="Test ACF REST API and set date_modifier to today on the first sitemap post"
        >
          {isTestingACF ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing ACF...
            </>
          ) : acfTestResult?.success ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              ACF REST OK
            </>
          ) : acfTestResult?.success === false ? (
            <>
              <XCircle className="h-4 w-4 mr-2 text-red-500" />
              ACF REST Failed
            </>
          ) : (
            <>
              <Database className="h-4 w-4 mr-2" />
              Test ACF REST
            </>
          )}
        </Button>
      </div>

      {/* ACF Test Results */}
      {acfTestResult && (
        <div className={`p-3 rounded border text-xs ${
          acfTestResult.success 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          {acfTestResult.success ? (
            <div className="space-y-1">
              <div className={`font-medium ${getCyberpunkTextClasses('primary')}`}>
                <CheckCircle2 className="h-3 w-3 inline mr-1" />
                ACF REST API configured correctly
              </div>
              {acfTestResult.dateModifierSet && acfTestResult.postId && (
                <div className="text-green-400">
                  <CheckCircle2 className="h-3 w-3 inline mr-1" />
                  Set date_modifier to {new Date().toISOString().split('T')[0]} on post {acfTestResult.postId}
                </div>
              )}
              {acfTestResult.postUrl && (
                <div className={getCyberpunkTextClasses('muted')}>
                  <a 
                    href={acfTestResult.postUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    View/Edit Post →
                  </a>
                </div>
              )}
              {acfTestResult.acfFields && Object.keys(acfTestResult.acfFields).length > 0 && (
                <div className={getCyberpunkTextClasses('muted')}>
                  <span className="font-medium">Fields found:</span>{' '}
                  {Object.keys(acfTestResult.acfFields).join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-medium text-red-400">
                <XCircle className="h-3 w-3 inline mr-1" />
                ACF REST API not configured
              </div>
              {acfTestResult.error && (
                <div className="text-red-300/80">{acfTestResult.error}</div>
              )}
              {acfTestResult.requiredConfig?.php && (
                <div className="mt-2">
                  <div className={`font-medium ${getCyberpunkTextClasses('secondary')} mb-1`}>
                    Add to functions.php:
                  </div>
                  <pre className="bg-black/30 p-2 rounded text-[10px] overflow-x-auto">
                    {acfTestResult.requiredConfig.php.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

