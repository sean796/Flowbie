import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";
import { toast } from "sonner";
import { saveDataForSEOApiKey, loadDataForSEOApiKey } from "../lib/api";

interface DataForSEOApiKeyContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
}

export const DataForSEOApiKeyContent: React.FC<DataForSEOApiKeyContentProps> = ({ 
  apiKey, 
  setApiKey, 
  saveApiKey: saveKeyInLocalStorage 
}) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey || loadDataForSEOApiKey());
  
  // Update local state when prop changes
  const handleSave = useCallback(() => {
    if (localApiKey.trim()) {
      saveKeyInLocalStorage(localApiKey.trim());
      saveDataForSEOApiKey(localApiKey.trim());
      setApiKey(localApiKey.trim());
      toast.success("DataForSEO API Key saved successfully.");
    } else {
      saveKeyInLocalStorage("");
      saveDataForSEOApiKey("");
      setApiKey("");
      toast.warning("DataForSEO API Key cleared.");
    }
  }, [localApiKey, setApiKey, saveKeyInLocalStorage]);

  return (
    <div className="space-y-4 p-6 rounded-lg bg-card/50 border border-border">
      <div className="flex items-center gap-2">
        <Key className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-white">DataForSEO API Key Configuration</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter your DataForSEO API key for keyword research features. Get your key from{" "}
        <a 
          href="https://dataforseo.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          dataforseo.com
        </a>
      </p>

      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label htmlFor="dataforseo-apiKey" className="text-foreground">API Key</Label>
          <Input
            id="dataforseo-apiKey"
            type="password"
            placeholder="Enter DataForSEO API key"
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

