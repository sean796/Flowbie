import React from 'react';
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Flower, Trash2 } from "lucide-react";

interface ChatHeaderProps {
    buildMode: boolean;
    onBuildModeChange: (checked: boolean) => void;
    onClearChat?: () => void;
    showBuildMode?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    buildMode,
    onBuildModeChange,
    onClearChat,
    showBuildMode = true,
}) => {
    return (
        <CardTitle className="flex items-center text-lg font-semibold justify-between">
            <div className="flex items-center gap-3">
                <Flower className="w-5 h-5 text-primary" />
                <span>Flowbie Assist</span>
                {buildMode && (
                    <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                        Build Mode
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {showBuildMode && (
                    <div className="flex items-center gap-2">
                        <Label htmlFor="build-mode" className="text-xs text-muted-foreground cursor-pointer">
                            Build
                        </Label>
                        <Switch
                            id="build-mode"
                            checked={buildMode}
                            onCheckedChange={onBuildModeChange}
                        />
                    </div>
                )}
                {onClearChat && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={onClearChat}
                        className="w-8 h-8 text-muted-foreground hover:text-foreground"
                        title="Clear Chat"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </CardTitle>
    );
};

