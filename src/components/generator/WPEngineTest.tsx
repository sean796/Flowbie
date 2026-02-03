/**
 * WP Engine API Test Component
 * Tests connection to WP Engine API
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Plug } from "lucide-react";
import { toast } from "sonner";

const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

interface WPEngineTestResult {
  success: boolean;
  message: string;
  status?: number;
  data?: any;
  error?: string;
}

export const WPEngineTest: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<WPEngineTestResult | null>(null);
  
  // Pre-filled credentials from user
  const apiUsername = 'bc64a240-e2e9-4700-9d99-d5a736dd2ba7';
  const apiPassword = '1RKiNvekkdPSkAskvVNg0f3LcRfOaIVp';

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/wpengine/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiUsername,
          apiPassword
        })
      });

      const data: WPEngineTestResult = await response.json();
      setTestResult(data);

      if (data.success) {
        toast.success('WP Engine API connection successful!', {
          description: `Status: ${data.status || 200}`
        });
      } else {
        toast.error('WP Engine API connection failed', {
          description: data.message
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({
        success: false,
        message: `Failed to connect to backend server: ${errorMessage}`,
        error: errorMessage
      });
      toast.error('Connection error', {
        description: errorMessage
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="w-5 h-5" />
          <CardTitle>WP Engine API Test</CardTitle>
        </div>
        <CardDescription>
          Test connection to WP Engine API using your credentials
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            <strong>API Username:</strong> {apiUsername.substring(0, 20)}...
          </div>
          <div className="text-sm text-muted-foreground">
            <strong>API Password:</strong> ••••••••••••••••
          </div>
        </div>

        <Button
          onClick={handleTestConnection}
          disabled={isTesting}
          className="w-full"
          variant="default"
        >
          {isTesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing Connection...
            </>
          ) : (
            <>
              <Plug className="w-4 h-4 mr-2" />
              Test WP Engine API Connection
            </>
          )}
        </Button>

        {testResult && (
          <div className={`p-4 rounded-lg border ${
            testResult.success 
              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className={`font-medium ${
                  testResult.success 
                    ? 'text-green-900 dark:text-green-100' 
                    : 'text-red-900 dark:text-red-100'
                }`}>
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </div>
                <div className={`text-sm ${
                  testResult.success 
                    ? 'text-green-700 dark:text-green-300' 
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {testResult.message}
                </div>
                {testResult.status && (
                  <div className={`text-xs ${
                    testResult.success 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    HTTP Status: {testResult.status}
                  </div>
                )}
                {testResult.data && testResult.success && (
                  <div className="text-xs text-muted-foreground mt-2">
                    <details>
                      <summary className="cursor-pointer">View Response Data</summary>
                      <pre className="mt-2 p-2 bg-background rounded text-xs overflow-auto">
                        {JSON.stringify(testResult.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
