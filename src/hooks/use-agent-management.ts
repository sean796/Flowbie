import { AgentConfig } from "@/components/AgentNode";
import { v4 as uuidv4 } from "uuid";

// Define the stored agent type
export interface SavedAgent extends AgentConfig {
  id: string;
  timestamp: number;
}

const AGENTS_STORAGE_KEY = "savedAgents";

function getLocalAgents(): SavedAgent[] {
  const agentsJson = localStorage.getItem(AGENTS_STORAGE_KEY);
  if (agentsJson) {
    try {
      return JSON.parse(agentsJson) as SavedAgent[];
    } catch (e) {
      console.error("Failed to parse stored agents:", e);
      return [];
    }
  }
  return [];
}

function saveLocalAgents(agents: SavedAgent[]): void {
  localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
}

// --- Public Utility Functions ---

/**
 * Retrieves all saved agents from local storage, sorted by newest first.
 */
export function getSavedAgents(): SavedAgent[] {
  return getLocalAgents().sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Saves a new or updates an existing agent.
 */
export function saveAgent(agent: AgentConfig): SavedAgent {
  const localAgents = getLocalAgents();
  const now = Date.now();
  
  // Check if the agent already exists (we'll use the title as a unique key for update simplicity in this context)
  // For a real application, we might look for a persistent ID, but since this might be inserted from a blueprint, a new ID is usually generated anyway.
  // We'll treat this as creating a brand new saved agent from the config.
  
  const newAgent: SavedAgent = {
    ...agent,
    id: uuidv4(), // Always assign a new unique ID for a new saved instance
    timestamp: now,
  };
  
  const updatedAgents = [newAgent, ...localAgents.filter(a => a.title !== newAgent.title)]; // Basic deduplication on name on save

  saveLocalAgents(updatedAgents);
  return newAgent;
}

/**
 * Deletes an agent by its ID.
 */
export function deleteAgent(id: string): void {
  const localAgents = getLocalAgents();
  const updatedAgents = localAgents.filter(agent => agent.id !== id);
  saveLocalAgents(updatedAgents);
}

/**
 * Updates an existing agent.
 */
export function updateAgent(updatedAgent: SavedAgent): void {
    const localAgents = getLocalAgents();
    let found = false;
    const updatedAgents = localAgents.map(agent => {
        if (agent.id === updatedAgent.id) {
            found = true;
            return {
                ...updatedAgent,
                timestamp: Date.now(), // Update timestamp on modification
            };
        }
        return agent;
    });

    if (found) {
        saveLocalAgents(updatedAgents);
    } else {
        console.warn(`Agent with ID ${updatedAgent.id} not found for update.`);
    }
}
