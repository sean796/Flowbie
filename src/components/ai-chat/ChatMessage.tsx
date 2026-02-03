import React from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "@/lib/api";
import { Flower, User } from "lucide-react";

interface ChatMessageProps {
    message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message: { role, content } }) => {
    return (
        <div className={`flex items-start mb-4 ${role === 'user' ? 'flex-row-reverse' : 'justify-start'}`}>
            <div className="flex-shrink-0">
                {role === 'assistant' ? (
                    <Flower className="w-6 h-6 text-primary" />
                ) : (
                    <User className="w-6 h-6 text-secondary" />
                )}
            </div>
            <div className={`max-w-[80%] mx-2 p-3 rounded-xl shadow-md space-y-3 prose-sm ${
                role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border'
            }`}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        a: ({ node, ...rest }: any) => <a {...rest} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline" />,
                        p: ({ children }) => <p className="text-base leading-relaxed last:mb-0">{children}</p>,
                        code: ({ children }) => <code className="bg-background/50 rounded inline-block px-1 text-sm font-mono">{children}</code>,
                        pre: ({ children }) => <pre className="p-3 border rounded-md overflow-x-auto text-sm bg-background/50 font-mono">{children}</pre>,
                        ul: ({ children }) => <ul className="list-disc ml-4 space-y-1 my-2 text-base">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 space-y-1 my-2 text-base">{children}</ol>,
                        li: ({ children }) => <li className="pl-0 my-1 text-base">{children}</li>,
                        h1: ({ children }) => <h1 className="text-xl font-bold mb-2 pt-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-lg font-bold mb-1 pt-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-base font-bold mb-1 pt-1">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-base font-semibold mb-1 pt-1">{children}</h4>,
                        h5: ({ children }) => <h5 className="text-sm font-semibold mb-1 pt-1">{children}</h5>,
                        h6: ({ children }) => <h6 className="text-sm font-normal mb-1 pt-1">{children}</h6>,
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        </div>
    );
};

