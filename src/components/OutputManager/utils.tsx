import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { toast } from "sonner";

export const formatMarkdownContent = (content: string) => {
  const props = {
    components: {
      a: ({ node, ...rest }: any) => <a style={{ color: '#FFFFFF', textDecoration: 'underline' }} {...rest} />,
      strong: ({ node, ...rest }: any) => <strong style={{ color: '#FFFFFF' }} {...rest} />,
      li: ({ node, ...rest }: any) => <li style={{ color: '#FFFFFF' }} {...rest} />,
      span: ({ node, ...rest }: any) => <span style={{ color: '#FFFFFF' }} {...rest} />,
      p: ({ node, ...rest }: any) => <p style={{ color: '#FFFFFF' }} {...rest} />,
      h1: ({ node, ...rest }: any) => <h1 style={{ color: '#FFFFFF', fontSize: '2em', fontWeight: 'bold' }} {...rest} />,
      h2: ({ node, ...rest }: any) => <h2 style={{ color: '#FFFFFF', fontSize: '1.5em', fontWeight: 'bold' }} {...rest} />,
      h3: ({ node, ...rest }: any) => <h3 style={{ color: '#FFFFFF', fontSize: '1.25em', fontWeight: 'bold' }} {...rest} />,
      ol: ({ node, ...rest }: any) => <ol style={{ color: '#FFFFFF' }} {...rest} />,
      ul: ({ node, ...rest }: any) => <ul style={{ color: '#FFFFFF' }} {...rest} />,
      table: ({ node, ...rest }: any) => <table style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor' }} {...rest} />,
      thead: ({ node, ...rest }: any) => <thead style={{ color: '#FFFFFF' }} {...rest} />,
      tbody: ({ node, ...rest }: any) => <tbody style={{ color: '#FFFFFF' }} {...rest} />,
      tr: ({ node, ...rest }: any) => <tr style={{ color: '#FFFFFF' }} {...rest} />,
      th: ({ node, ...rest }: any) => <th style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor', padding: '8px' }} {...rest} />,
      td: ({ node, ...rest }: any) => <td style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor', padding: '8px' }} {...rest} />,
      code: ({ node, ...rest }: any) => <code style={{ color: '#FFFFFF', backgroundColor: 'transparent' }} {...rest} />,
      pre: ({ node, ...rest }: any) => <pre style={{ color: '#FFFFFF', backgroundColor: 'transparent' }} {...rest} />,
    }
  };

  return (
    <div style={{ color: '#FFFFFF' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        {...props}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export const handleCopy = (text: string, type: 'markdown' | 'html') => {
  let contentToCopy = text;

  if (type === 'html') {
    // Convert markdown to HTML using marked
    contentToCopy = marked.parse(text, { async: false }) as string || "";
    if (!contentToCopy) {
      toast.error(`No HTML content generated.`);
      return;
    }
  }

  if (!contentToCopy) {
    toast.error(`No ${type} content to copy.`);
    return;
  }

  navigator.clipboard.writeText(contentToCopy);
  toast.success(`${type} copied to clipboard!`);
};

export const formatElapsedTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

