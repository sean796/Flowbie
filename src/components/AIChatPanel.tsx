import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AgentConfig } from "./AgentNode";
import { BlueprintData } from "@/hooks/use-blueprint-management";
import { BuildModePanel } from "./build-mode/BuildModePanel";
import { ChatHeader } from "./ai-chat/ChatHeader";
import { ChatMessagesList } from "./ai-chat/ChatMessagesList";
import { ChatInput } from "./ai-chat/ChatInput";
import { useAiChatLogic } from "./ai-chat/useAiChatLogic";
import { getSystemMessageContent, getBuildModeSystemMessageContent, getInitialMessages } from "./ai-chat/system-message-builders";

export interface AIChatPanelProps {
    apiKey: string;
    flowTitle: string;
    flowPurpose: string;
    agents: AgentConfig[];
    selectedModel: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    knowledgeBaseText: string;
    onInsertAgent?: (agent: AgentConfig) => void;
    onBlueprintUpdate?: (updatedAgents: AgentConfig[]) => void;
    generateCurrentBlueprintData?: () => BlueprintData;
    onFlowTitleChange?: (title: string) => void;
    onFlowPurposeChange?: (purpose: string) => void;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ 
    apiKey, 
    flowTitle, 
    flowPurpose, 
    agents, 
    selectedModel, 
    temperature, 
    maxTokens, 
    topP, 
    knowledgeBaseText, 
    onInsertAgent, 
    onBlueprintUpdate, 
    generateCurrentBlueprintData, 
    onFlowTitleChange, 
    onFlowPurposeChange 
}) => {
    const [buildMode, setBuildMode] = useState(false);

    const chatLogic = useAiChatLogic({
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
    });

    // When buildMode is true, show BuildModePanel instead of regular chat
    if (buildMode) {
        return (
            <BuildModePanel
                apiKey={apiKey}
                flowTitle={flowTitle}
                flowPurpose={flowPurpose}
                knowledgeBaseText={knowledgeBaseText}
                selectedModel={selectedModel}
                temperature={temperature}
                maxTokens={maxTokens}
                topP={topP}
                generateCurrentBlueprintData={generateCurrentBlueprintData}
                onBlueprintUpdate={onBlueprintUpdate}
                onFlowTitleChange={onFlowTitleChange}
                onFlowPurposeChange={onFlowPurposeChange}
                onBuildModeChange={setBuildMode}
            />
        );
    }

    return (
        <div className="flex flex-col h-full relative">
            <Card className="flex flex-col flex-1 border-none shadow-none h-full">
                <CardHeader className="p-4 border-b border-border flex-shrink-0">
                    <ChatHeader
                        buildMode={buildMode}
                        onBuildModeChange={setBuildMode}
                        onClearChat={chatLogic.handleClearChat}
                        showBuildMode={true}
                    />
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-hidden min-h-0">
                    <ChatMessagesList
                        messages={chatLogic.messages}
                        isStreaming={chatLogic.isStreaming}
                        scrollRef={chatLogic.scrollRef}
                    />
                </CardContent>
            </Card>
            
            <ChatInput
                value={chatLogic.inputText}
                onChange={chatLogic.setInputText}
                onSubmit={chatLogic.handleSendMessage}
                onKeyDown={chatLogic.handleKeyDown}
                isStreaming={chatLogic.isStreaming}
                apiKeyPresent={apiKey !== ''}
            />
        </div>
    );
};
