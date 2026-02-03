import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Copy, Download, Trash2, ArrowRight, Search, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  getSavedAgents, 
  deleteAgent, 
  SavedAgent,
  saveAgent, // ADDED: Import saveAgent utility
} from "@/hooks/use-agent-management"; // Import our CRUD functions
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label"; // ADDED: Import Label
import { AgentConfig } from "./AgentNode";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"; // NEW: Select components

// --- Helper Components ---

interface AgentTileProps {
  agent: SavedAgent;
  onLoad: (agent: AgentConfig) => void;
  onRefresh: () => void;
}

const AgentTile: React.FC<AgentTileProps> = ({ agent, onLoad, onRefresh }) => {
  const handleDelete = useCallback(() => {
    if (window.confirm(`Are you sure you want to delete agent: "${agent.title}"?`)) {
        deleteAgent(agent.id);
        toast.info(null, { description: `Agent "${agent.title}" deleted.` });
        onRefresh(); // Refresh the list of agents
    }
  }, [agent.id, agent.title, onRefresh]);

  // Download functionality (Similar to blueprint, just export the core AgentConfig)
  const handleDownload = useCallback(() => {
    try {
      const { id, timestamp, ...dataToExport } = agent; 
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-${agent.title.replace(/\s/g, "-").toLowerCase() || 'export'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(null, { description: "Agent config downloaded successfully." });
    } catch (error) {
      console.error(error);
      toast.error("Failed to download agent config.");
    }
  }, [agent]);

  const lastUpdated = useMemo(() => {
    return new Date(agent.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [agent.timestamp]);
  
  return (
    <Card 
      className="p-4 bg-card border-2 border-border hover:border-primary transition-all duration-200 cursor-pointer flex flex-col justify-between"
      onClick={() => onLoad(agent)} // Loads on click anywhere on the card
    >
      <div>
        <h3 className="text-lg font-bold text-gray-50 mb-1 truncate">{agent.title}</h3>
        <p className="text-xs text-gray-400">Last Updated: {lastUpdated}</p>
      </div>

      {/* Quick Action Icons */}
      <div className="mt-3 flex space-x-3 justify-between items-center text-sm">
        {/* Placeholder for Node info, maybe show features count? */}
        <p className="text-gray-400">Features: {agent.features.length}</p> 

        <div className="flex space-x-3">
          {/* Load/Insert Button */}
          <div className="p-1 rounded-full text-gray-500 hover:text-primary transition-colors duration-200" title="Insert Agent into Blueprint">
            <ArrowRight className="h-5 w-5" />
          </div>
        
          {/* Export/Download Button */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleDownload(); }} 
            className="p-1 rounded-full text-gray-500 hover:text-primary transition-colors duration-200" 
            title="Export as JSON"
          >
            <Download className="h-5 w-5" />
          </button>

          {/* Delete Button */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleDelete(); }} 
            className="p-1 rounded-full text-gray-500 hover:text-red-500 transition-colors duration-200" 
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{agent.description}</p>
    </Card>
  );
};


// --- Main Component ---

interface AgentManagerContentProps {
  onInsertAgent: (agent: AgentConfig) => void;
  // Prop for the all active agents in the current blueprint
  allAgentsInBlueprint: AgentConfig[]; 
}

export const AgentManagerContent: React.FC<AgentManagerContentProps> = ({
  onInsertAgent,
  allAgentsInBlueprint, 
}) => {
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null); // Track selected agent ID for saving
  const selectedAgentPayload = useMemo(() => {
    return allAgentsInBlueprint.find(agent => agent.id === selectedAgentId) || null;
  }, [allAgentsInBlueprint, selectedAgentId]);

  const refreshAgents = useCallback(() => {
    setSavedAgents(getSavedAgents());
  }, []);

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

  const handleOpenModal = useCallback(() => {
    if (!selectedAgentPayload) {
      toast.error("Please select an agent node to save from the dropdown menu.");
      return;
    }
    setNewTitle(selectedAgentPayload.title);
    setIsModalOpen(true);
  }, [selectedAgentPayload]);


  const handleConfirmSave = useCallback(() => {
    if (!newTitle.trim() || !selectedAgentPayload) {
      toast.error("Invalid agent data or title.");
      return;
    }

    // Save the agent with the new title
    const agentToSave: AgentConfig = {
      ...selectedAgentPayload,
      title: newTitle.trim(),
      // Remove UUID from payload before saving as saveAgent generates a new one.
      id: "temp", 
    };
    
    saveAgent(agentToSave);

    // Refresh the list and close the modal
    refreshAgents();
    setIsModalOpen(false);
    toast.success(`Agent "${newTitle}" saved successfully.`);
    setNewTitle("");
    setSelectedAgentId(null);
  }, [newTitle, selectedAgentPayload, refreshAgents]);


  const filteredAgents = savedAgents.filter(
    (agent) =>
      agent.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.features.some(f => f.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first

  return (
    <div className="space-y-6">
      {/* Controls Header - Simplified header since Agent saving is more of an explicit action 
          that likely happens within the workflow builder itself, or via a modal/dialog. 
          For now, just a search bar and a button to open a save dialog placeholder.
      */}
      <div className="bg-card p-4 rounded-lg shadow-lg sticky top-0 z-10 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 items-center border border-border">
          
          {/* Action Buttons - Functional Save Agent from Current Selection */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <div className="flex space-x-2 w-full">
              <Select 
                value={selectedAgentId || ""} 
                onValueChange={setSelectedAgentId}
                disabled={allAgentsInBlueprint.length === 0}
              >
                <SelectTrigger 
                  className="flex-shrink-0 w-full sm:w-[250px] bg-input border-dashed border-border"
                  title="Select agent to save"
                >
                  <SelectValue placeholder={allAgentsInBlueprint.length > 0 ? "Select Agent from Flow..." : "No Agents in Flow"} />
                </SelectTrigger>
                <SelectContent>
                  {allAgentsInBlueprint.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleOpenModal}
                variant="outline" 
                disabled={!selectedAgentId}
                className="flex-shrink-0 w-full sm:w-auto text-primary border-primary hover:bg-primary/20"
              >
                <Save className="h-4 w-4 mr-2" /> Save Agent
              </Button>
            </div>

            <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle className="text-foreground">Save Current Agent</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Enter a title for the saved agent configuration.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right text-foreground">
                    Title
                  </Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="col-span-3 bg-input border-border text-foreground placeholder-muted-foreground focus:border-primary"
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsModalOpen(false)} className="text-red-400 border-red-400 hover:bg-red-400/10">
                  Cancel
                </Button>
                <Button onClick={handleConfirmSave} disabled={!newTitle.trim()} className="bg-primary hover:bg-primary/90 text-black font-bold">
                  Save Agent
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Search Bar */}
          <div className="relative flex-grow w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search agents by title, description, or feature..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-input border-border text-white placeholder-gray-400 focus:border-primary/50"
            />
          </div>
      </div>
      
      {/* Agent List (Grid of Tiles) */}
      <div className="min-h-[40vh]">
          {filteredAgents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {filteredAgents.map((agent) => (
              <AgentTile
                  key={agent.id}
                  agent={agent}
                  onLoad={onInsertAgent}
                  onRefresh={refreshAgents}
              />
              ))}
          </div>
          ) : (
          <div className="text-center p-12 text-muted-foreground border-2 border-dashed border-border rounded-lg bg-card/50">
              <p className="text-lg">No saved agents found.</p>
              <p className="mt-2 text-sm">Save your agents from the workflow builder to reuse them here later.</p>
          </div>
          )}
      </div>
    </div>
  );
};
