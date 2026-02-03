/**
 * Detailed progress bar component for auto-graph
 * Shows progress per post with status indicators
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import type { AutoGraphProgress, PostProgress } from './hooks/useAutoGraphProgress';

interface AutoGraphProgressBarProps {
  progress: AutoGraphProgress;
}

export const AutoGraphProgressBar: React.FC<AutoGraphProgressBarProps> = ({ progress }) => {
  const progressPercent = progress.totalPosts > 0
    ? (progress.processedPosts / progress.totalPosts) * 100
    : 0;

  const getStatusIcon = (status: PostProgress['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'downloading':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: PostProgress['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/20 border-green-500/50';
      case 'failed':
      case 'error':
        return 'bg-red-500/20 border-red-500/50';
      case 'downloading':
        return 'bg-blue-500/20 border-blue-500/50';
      default:
        return 'bg-gray-500/20 border-gray-500/50';
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">{progress.currentStep}</h4>
          <span className="text-xs text-muted-foreground">
            {progress.processedPosts} / {progress.totalPosts} posts
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
          <span>{Math.round(progressPercent)}% complete</span>
          {progress.status === 'completed' && (
            <span className="text-green-500">✓ Completed</span>
          )}
          {progress.status === 'failed' && (
            <span className="text-red-500">✗ Failed</span>
          )}
        </div>
      </div>

      {progress.posts.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          <h5 className="text-xs font-medium text-muted-foreground">Post Progress:</h5>
          <div className="space-y-1">
            {progress.posts.map((post, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 p-2 rounded border text-xs ${getStatusColor(post.status)}`}
              >
                {getStatusIcon(post.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {post.title || post.url}
                  </div>
                  {post.error && (
                    <div className="text-red-400 text-xs mt-0.5 truncate">
                      {post.error}
                    </div>
                  )}
                </div>
                {post.postId && (
                  <span className="text-xs text-muted-foreground">
                    ID: {post.postId}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {progress.currentPost && progress.currentPost.status === 'downloading' && (
        <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="font-medium">Currently processing:</span>
          </div>
          <div className="mt-1 text-muted-foreground truncate">
            {progress.currentPost.title || progress.currentPost.url}
          </div>
        </div>
      )}
    </Card>
  );
};




