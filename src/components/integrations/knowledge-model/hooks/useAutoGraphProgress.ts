/**
 * Hook for tracking auto-graph progress with detailed post-by-post updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GraphGenerationOptions } from '../types';

const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

export interface PostProgress {
  url: string;
  title: string;
  status: 'pending' | 'downloading' | 'success' | 'failed' | 'error';
  postId?: string | number;
  error?: string;
}

export interface AutoGraphProgress {
  status: string;
  currentStep: string;
  totalPosts: number;
  processedPosts: number;
  currentPost: PostProgress | null;
  posts: PostProgress[];
  errors: string[];
  startTime?: number;
  lastUpdate?: number;
  result?: any;
  error?: string;
}

export function useAutoGraphProgress() {
  const [progress, setProgress] = useState<AutoGraphProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoGraph = useCallback(async (
    options: GraphGenerationOptions,
    siteUrl: string,
    username: string,
    appPassword: string,
    gscData: any[] = []
  ) => {
try {
      const apiUrl = `${BACKEND_API_BASE}/api/knowledge-model/auto-graph`;
const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: options.siteId,
          siteUrl,
          username,
          appPassword,
          gscData,
          jobId: jobId || undefined
        })
      });
if (!response.ok) {
        const errorData = await response.json();
throw new Error(errorData.error || 'Failed to start auto-graph');
      }

      const data = await response.json();
const newJobId = data.jobId;
      setJobId(newJobId);

      // Start polling for progress
      startPolling(newJobId);
return newJobId;
    } catch (error) {
console.error('Error starting auto-graph:', error);
      throw error;
    }
  }, [jobId]);

  const startPolling = useCallback((id: string) => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll immediately
    fetchProgress(id);

    // Then poll every 500ms for real-time updates
    pollingIntervalRef.current = setInterval(() => {
      fetchProgress(id);
    }, 500);
  }, []);

  const fetchProgress = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/knowledge-model/progress/${id}`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.success && data.progress) {
        setProgress(data.progress);

        // Stop polling if completed or failed
        if (data.progress.status === 'completed' || data.progress.status === 'failed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setProgress(null);
    setJobId(null);
  }, [stopPolling]);

  return {
    progress,
    jobId,
    startAutoGraph,
    reset,
    isPolling: pollingIntervalRef.current !== null
  };
}

