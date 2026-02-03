import React from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    isStreaming: boolean;
    apiKeyPresent: boolean;
    placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    value,
    onChange,
    onSubmit,
    onKeyDown,
    isStreaming,
    apiKeyPresent,
    placeholder = "Ask about your blueprint...",
}) => {
    return (
        <div className="absolute bottom-0 inset-x-0 z-30 bg-background border-t border-border shadow-lg">
            <div className="p-4 flex-shrink-0 mx-auto max-w-xl">
                <form onSubmit={onSubmit} className="flex w-full space-x-2">
                    <Textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        className="flex-1 min-h-[40px] max-h-[120px] resize-none pr-10"
                        disabled={isStreaming}
                    />
                    
                    <Button type="submit" size="icon" disabled={value.trim() === "" || isStreaming || !apiKeyPresent}>
                        {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </div>
        </div>
    );
};

