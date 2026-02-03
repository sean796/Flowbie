import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ModificationChat } from "../OutputManager/ModificationChat";
import { ChatHeader } from "../ai-chat/ChatHeader";
import { useBlueprintModification } from "./useBlueprintModification";

interface BuildModePanelProps {
    apiKey: string;
    flowTitle: string;
    flowPurpose: string;
    knowledgeBaseText: string;
    selectedModel: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    generateCurrentBlueprintData?: () => { title: string; purpose: string; agents: any[]; [key: string]: any };
    onBlueprintUpdate?: (updatedAgents: any[]) => void;
    onFlowTitleChange?: (title: string) => void;
    onFlowPurposeChange?: (purpose: string) => void;
    onBuildModeChange: (checked: boolean) => void;
}

export const BuildModePanel: React.FC<BuildModePanelProps> = ({
    apiKey,
    flowTitle,
    flowPurpose,
    knowledgeBaseText,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    generateCurrentBlueprintData,
    onBlueprintUpdate,
    onFlowTitleChange,
    onFlowPurposeChange,
    onBuildModeChange,
}) => {
    const {
        blueprintModificationChecklist,
        isGeneratingChecklist,
        isUpdatingBlueprint,
        blueprintChatMessages,
        blueprintUserInput,
        setBlueprintUserInput,
        hasGeneratedChecklist,
        blueprintUpdated,
        elapsedTime,
        blueprintChatEndRef,
        handleGenerateBlueprintChecklist,
        handleUpdateBlueprint,
        handleShortcutClick,
        resetState,
    } = useBlueprintModification({
        apiKey,
        flowTitle,
        flowPurpose,
        knowledgeBaseText,
        selectedModel,
        temperature,
        maxTokens,
        topP,
        generateCurrentBlueprintData,
        onBlueprintUpdate,
        onFlowTitleChange,
        onFlowPurposeChange,
    });

    return (
        <div className="flex flex-col h-full relative overflow-hidden">
            <Card className="flex flex-col flex-1 border-none shadow-none h-full overflow-hidden">
                <CardHeader className="p-4 border-b border-border flex-shrink-0">
                    <ChatHeader
                        buildMode={true}
                        onBuildModeChange={onBuildModeChange}
                        showBuildMode={true}
                    />
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-hidden min-h-0 flex flex-col">
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <ModificationChat
                            isActive={true}
                            title="Flow Assist - Blueprint Modification"
                            chatMessages={blueprintChatMessages}
                            userInput={blueprintUserInput}
                            onUserInputChange={setBlueprintUserInput}
                            checklist={blueprintModificationChecklist}
                            isGeneratingChecklist={isGeneratingChecklist}
                            isUpdating={isUpdatingBlueprint}
                            elapsedTime={elapsedTime}
                            hasGeneratedChecklist={hasGeneratedChecklist}
                            updated={blueprintUpdated}
                            placeholder="Describe how you'd like to modify the blueprint..."
                            emptyStateMessage="Provide instructions on how you'd like to modify the blueprint."
                            emptyStateExample='Example: "Add more focus on SEO optimization" or "Include more technical details in section 2"'
                            updateButtonLabel="Update Blueprint"
                            processingTitle="Processing Blueprint Update"
                            updatedMessage="Blueprint has been updated. Review the updated blueprint structure."
                            proceedButtonLabel="Done"
                            onGenerateChecklist={handleGenerateBlueprintChecklist}
                            onUpdate={handleUpdateBlueprint}
                            onCancel={() => {
                                resetState();
                                onBuildModeChange(false);
                            }}
                            onProceed={() => {
                                resetState();
                                onBuildModeChange(false);
                            }}
                            onModifyAgain={() => {
                                resetState();
                            }}
                            onModifyChecklist={() => {
                                resetState();
                            }}
                            chatEndRef={blueprintChatEndRef}
                            onShortcutClick={handleShortcutClick}
                            showShortcuts={true}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

