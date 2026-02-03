/**
 * WP Engine Credentials Component
 * Input and cache WP Engine API credentials
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, TestTube, Plug, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { 
  loadWPEngineApiKey, 
  saveWPEngineApiKey, 
  loadWPEngineApiSecret, 
  saveWPEngineApiSecret 
} from "@/lib/wp-engine-credentials";

const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

interface WPEngineTestResult {
  success: boolean;
  message: string;
  status?: number;
  data?: any;
  error?: string;
}

export const WPEngineCredentials: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<WPEngineTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load cached credentials on mount
  useEffect(() => {
    const cachedKey = loadWPEngineApiKey();
    const cachedSecret = loadWPEngineApiSecret();
    if (cachedKey) setApiKey(cachedKey);
    if (cachedSecret) setApiSecret(cachedSecret);
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    try {
      saveWPEngineApiKey(apiKey);
      saveWPEngineApiSecret(apiSecret);
      toast.success('WP Engine credentials saved', {
        description: 'Your credentials have been cached locally'
      });
    } catch (error) {
      toast.error('Failed to save credentials', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey || !apiSecret) {
      toast.error('Please enter API credentials first');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/wpengine/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiUsername: apiKey,
          apiPassword: apiSecret
        })
      });

      const data: WPEngineTestResult = await response.json();
      setTestResult(data);

      if (data.success) {
        toast.success('WP Engine API connection successful!', {
          description: `Status: ${data.status || 200}`
        });
        // Auto-save on successful test
        saveWPEngineApiKey(apiKey);
        saveWPEngineApiSecret(apiSecret);
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
          <CardTitle>WP Engine API Credentials</CardTitle>
        </div>
        <CardDescription>
          Enter your WP Engine API credentials to enable site cloning
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="wp-engine-api-key">API Key (Username)</Label>
            <Input
              id="wp-engine-api-key"
              type="text"
              placeholder="Enter WP Engine API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-sm"
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://my.wpengine.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                WP Engine User Portal
                <ExternalLink className="w-3 h-3" />
              </a>
              {" "}→ Account → API Keys
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wp-engine-api-secret">API Secret (Password)</Label>
            <Input
              id="wp-engine-api-secret"
              type="password"
              placeholder="Enter WP Engine API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="font-mono text-sm"
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">
              Your API secret is password-masked for security
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isSaving || !apiKey || !apiSecret}
              variant="outline"
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Credentials'
              )}
            </Button>
            <Button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKey || !apiSecret}
              variant="default"
              className="flex-1"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
          </div>
        </form>

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
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p className="font-medium mb-1">Documentation:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <a
                href="https://wpengine.com/support/api-keys/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                How to Generate API Keys
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>
              <a
                href="https://wpengine.com/support/generate-api-credentials/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                API Credentials Guide
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
