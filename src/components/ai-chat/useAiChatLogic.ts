import { useState, useRef, useCallback, useEffect } from 'react';
import { Message, StreamChatRequest, streamChatCompletion } from "@/lib/api";
import { AgentConfig } from "@/components/AgentNode";
import { extractAgentsFromResponse } from "@/lib/agent-parser";
import { toast } from "sonner";

interface UseAiChatLogicProps {
    apiKey: string;
    flowTitle: string;
    flowPurpose: string;
    agents: AgentConfig[];
    selectedModel: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    knowledgeBaseText: string;
    buildMode: boolean;
    onInsertAgent?: (agent: AgentConfig) => void;
    getSystemMessageContent: (flowTitle: string, flowPurpose: string, agents: AgentConfig[], knowledgeBaseText: string) => string;
    getBuildModeSystemMessageContent: (flowTitle: string, flowPurpose: string, agents: AgentConfig[], knowledgeBaseText: string) => string;
    getInitialMessages: (flowTitle: string, flowPurpose: string, agents: AgentConfig[], knowledgeBaseText: string, buildMode: boolean) => Message[];
}

export const useAiChatLogic = ({
    apiKey,
    flowTitle,
    flowPurpose,
    agents,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    knowledgeBaseText,
    buildMode,
    onInsertAgent,
    getSystemMessageContent,
    getBuildModeSystemMessageContent,
    getInitialMessages,
}: UseAiChatLogicProps) => {
    const [messages, setMessages] = useState<Message[]>(() => 
        getInitialMessages(flowTitle, flowPurpose, agents, knowledgeBaseText, buildMode)
    );
    const [inputText, setInputText] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [suggestedAgents, setSuggestedAgents] = useState<AgentConfig[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, 0);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Update messages when buildMode or context changes
    useEffect(() => {
        const newInitialMessages = getInitialMessages(flowTitle, flowPurpose, agents, knowledgeBaseText, buildMode);
        setMessages(newInitialMessages);
        setSuggestedAgents([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildMode, flowTitle, flowPurpose, agents, knowledgeBaseText]);

    // Parse agent suggestions from assistant messages in Build Mode
    useEffect(() => {
        if (!buildMode || !onInsertAgent) return;
        
        const publicMessages = messages.filter(m => m.role !== 'system');
        const lastAssistantMessage = publicMessages
            .filter(m => m.role === 'assistant')
            .slice(-1)[0];
        
        if (lastAssistantMessage && lastAssistantMessage.content) {
            try {
                const extracted = extractAgentsFromResponse(
                    lastAssistantMessage.content,
                    agents.length
                );
                if (extracted.length > 0) {
                    setSuggestedAgents(extracted);
                }
            } catch (error) {
                console.error("Error parsing agent suggestions:", error);
            }
        }
    }, [messages, buildMode, agents.length, onInsertAgent]);

    const handleSendMessage = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (inputText.trim() === "" || isStreaming) return;

        const userMessageContent = inputText.trim();
        setInputText("");
        setIsStreaming(true);

        const newUserMessage: Message = { role: "user", content: userMessageContent };
        
        const assistantPlaceholder: Message = { role: "assistant", content: "" };
        
        const priorUserMessages = messages.filter(m => m.role !== 'system');
        
        const currentSystemMessage: Message = { 
            role: 'system', 
            content: buildMode
                ? getBuildModeSystemMessageContent(flowTitle, flowPurpose, agents, knowledgeBaseText)
                : getSystemMessageContent(flowTitle, flowPurpose, agents, knowledgeBaseText)
        };

        const messagesWithNewSystem = [currentSystemMessage, ...priorUserMessages];
        const updatedMessages = [...messagesWithNewSystem, newUserMessage];
        
        setMessages([...updatedMessages, assistantPlaceholder]);

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;
        
        try {
            const finalMessages = updatedMessages;

            const request: StreamChatRequest = {
                apiKey,
                model: selectedModel,
                messages: finalMessages,
                temperature: temperature,
                maxTokens: maxTokens,
                topP: topP,
                signal,
            };

            await streamChatCompletion({
                ...request,
                onContentChunk: (chunk) => {
                    setMessages(current => {
                        const lastMessage = current[current.length - 1];
                        if (lastMessage && lastMessage.role === 'assistant') {
                            const newContent = lastMessage.content + chunk;
                            const newMessages = [...current.slice(0, current.length - 1), { ...lastMessage, content: newContent }];
                            
                            if (buildMode && onInsertAgent) {
                                try {
                                    const extracted = extractAgentsFromResponse(
                                        newContent,
                                        agents.length
                                    );
                                    if (extracted.length > 0) {
                                        setSuggestedAgents(extracted);
                                    }
                                } catch (error) {
                                    // Silently fail parsing during streaming
                                }
                            }
                            
                            scrollToBottom();
                            return newMessages;
                        }
                        return current;
                    });
                }
            });

        } catch (error) {
            if (!signal.aborted) {
                console.error("Chat streaming error:", error);
                toast.error(`AI Chat Error: ${(error as Error).message}`);
                
                setMessages(current => {
                    const messagesWithoutSystem = current.filter(m => m.role !== 'system');
                    const lastIndex = current.length - 1;
                    if (lastIndex >= 0 && current[lastIndex].role === 'assistant') {
                         const updatedAssistantMessage = { ...current[lastIndex], content: current[lastIndex].content + `\n\n**Error:** An error occurred during streaming. ${(error as Error).message}` };
                         return [...current.slice(0, lastIndex), updatedAssistantMessage];
                    }
                    return current;
                });
            }
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
        }

    }, [apiKey, flowTitle, flowPurpose, agents, messages, selectedModel, temperature, maxTokens, topP, isStreaming, inputText, knowledgeBaseText, buildMode, onInsertAgent, getSystemMessageContent, getBuildModeSystemMessageContent, scrollToBottom, agents.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e as unknown as React.FormEvent);
        }
    }, [handleSendMessage]);

    const handleClearChat = useCallback(() => {
        const initialMessages = getInitialMessages(flowTitle, flowPurpose, agents, knowledgeBaseText, buildMode);
        setMessages(initialMessages);
        setSuggestedAgents([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flowTitle, flowPurpose, agents, knowledgeBaseText, buildMode]);

    const handleApproveAgent = useCallback((agent: AgentConfig) => {
        if (onInsertAgent) {
            onInsertAgent(agent);
            setSuggestedAgents(prev => prev.filter(a => a.id !== agent.id));
            toast.success(`Agent "${agent.title}" added to blueprint!`);
        }
    }, [onInsertAgent]);

    const handleRejectAgent = useCallback((agent: AgentConfig) => {
        setSuggestedAgents(prev => prev.filter(a => a.id !== agent.id));
    }, []);

    const publicMessages = messages.filter(m => m.role !== 'system');

    return {
        messages: publicMessages,
        inputText,
        setInputText,
        isStreaming,
        suggestedAgents,
        scrollRef,
        handleSendMessage,
        handleKeyDown,
        handleClearChat,
        handleApproveAgent,
        handleRejectAgent,
    };
};

