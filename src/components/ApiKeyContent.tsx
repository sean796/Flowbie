import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";
import { toast } from "sonner";
import { saveApiKey } from "../lib/api"; // Need to import utility functions

interface ApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  // This save function updates the key in local storage and is passed from Index.tsx
  saveApiKey: (key: string) => void;
}

export const ApiKeyContent: React.FC<ApiKeyContentProps> = ({ 
  apiKey, 
  setApiKey, 
  saveApiKey: saveKeyInLocalStorage 
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  
  // Update local state when prop changes (e.g., on initial load or reset)
  // We use local state to allow editing without constantly updating the main state
  
  const handleSave = useCallback(() => {
    if (localApiKey.trim()) {
      saveKeyInLocalStorage(localApiKey.trim());
      setApiKey(localApiKey.trim()); // Update parent state
      toast.success("API Key saved and updated for current session.");
    } else {
      // Allow clearing the key and warning the user
      saveKeyInLocalStorage("");
      setApiKey("");
      toast.warning("API Key cleared. AI generation is disabled.");
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-4 p-6 rounded-lg bg-card/50 border border-border">
      <div className="flex items-center gap-2">
        <Key className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-white">OpenRouter API Key Configuration</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter your OpenRouter API key. This key is stored locally to enable AI generation.
      </p>

      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-foreground">API Key</Label>
          <Input
            id="apiKey"
            type="password"
            placeholder="sk-or-..."
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            className="bg-input border-border focus:border-primary focus:ring-primary/20"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button 
          onClick={handleSave}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Save Key
        </Button>
      </div>
    </div>
  );
};
