import React from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { Message } from "@/lib/api";
import { ChatMessage } from "./ChatMessage";

interface ChatMessagesListProps {
    messages: Message[];
    isStreaming: boolean;
    scrollRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessagesList: React.FC<ChatMessagesListProps> = ({
    messages,
    isStreaming,
    scrollRef,
}) => {
    return (
        <ScrollArea ref={scrollRef} className="h-full pr-4 mx-auto max-w-xl pb-32">
            {messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
            ))}
            {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                <div className="flex justify-start">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
            )}
        </ScrollArea>
    );
};

