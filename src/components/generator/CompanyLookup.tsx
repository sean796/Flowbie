/**
 * Company Lookup Component
 * Intelligent single-field lookup: auto-detects URL vs company name
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getCyberpunkButtonClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CustomizationConfig } from "./elementor/types";

interface CompanyLookupProps {
  onCompanyDataFetched?: (data: Partial<CustomizationConfig>) => void;
  onCompanyValidated?: () => void;
}


interface Candidate {
  name: string;
  source?: 'knowledge_graph' | 'organic';
  url?: string;
  snippet?: string;
}

const LOCATIONS = ['United States', 'United Kingdom', 'Canada', 'Australia'];

/**
 * Detect if input is a URL - strict detection
 * Only returns true for clear URL patterns
 * ANY space immediately disqualifies as URL
 */
function isUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  
  // CRITICAL: If input contains ANY space, it's NOT a URL
  if (trimmed.includes(' ')) {
    return false;
  }
  
  // Must start with http:// or https://
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  
  // Or must look like a domain (contains dot, no spaces, valid TLD pattern)
  if (trimmed.includes('.') && trimmed.length > 4) {
    // Check if it looks like a domain (has a TLD-like pattern)
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (domainPattern.test(trimmed)) {
      try {
        new URL(`https://${trimmed}`);
        return true;
      } catch {
        return false;
      }
    }
  }
  
  return false;
}

export const CompanyLookup: React.FC<CompanyLookupProps> = ({ onCompanyDataFetched, onCompanyValidated }) => {
  const [input, setInput] = useState('');
  const [locationName, setLocationName] = useState<string>('United States');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [step, setStep] = useState<'search' | 'pick'>('search');

  const apiKey = loadApiKey();
  const API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
    (import.meta.env.DEV ? 'http://localhost:3001' : '');

  const handleLookup = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error('Please enter a URL or company name');
      return;
    }

    const isUrlInput = isUrl(trimmed);
    
    if (!apiKey) {
      toast.error('OpenRouter API key required. Please set it in Settings.');
      return;
    }

    setLoading(true);
    setError(null);
    setCandidates([]);
    setStep('search');

    try {
      if (isUrlInput) {
        // URL lookup - unchanged flow
        const model = getResearchModel();
        const response = await fetch(`${API_BASE}/api/company/from-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
            openRouterApiKey: apiKey,
            model: model,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch company from URL');
        }

        const companyBlob = data.company || {};
        
        // Ensure Google Maps link is set (should be SERP page URL)
        if (!companyBlob.googleMapsLink && companyBlob.businessName) {
          const serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(companyBlob.businessName)}`;
          companyBlob.googleMapsLink = serpPageUrl;
        }
        
        onCompanyDataFetched?.(companyBlob as Partial<CustomizationConfig> & Record<string, unknown>);
        onCompanyValidated?.();
        toast.success('Company validated. Generating ACF fields...');
      } else {
        // Company name search - AI-extracted candidates from FULL SERP
        const model = getResearchModel();
        const serpResponse = await fetch(`${API_BASE}/api/company/from-google-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: trimmed,
            location_name: locationName,
            openRouterApiKey: apiKey,
            model: model,
          }),
        });

        const data = await serpResponse.json();
        if (!serpResponse.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch Google SERP');
        }

        // Use AI-extracted candidates (from backend) only
        const candidatesList: Candidate[] = data.candidates || [];
        
        setCandidates(candidatesList);
        setStep('pick');
        if (candidatesList.length > 0) {
          toast.success(`Found ${candidatesList.length} business candidate(s)`);
        } else {
          toast.warning('No business candidates found. Try a different search query.');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Lookup failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCandidate = async (candidate: Candidate) => {
    setCandidates([]);
    setLoading(true);
    setError(null);
    setStep('search');

    if (!apiKey) {
      toast.error('OpenRouter API key required. Please set it in Settings.');
      setLoading(false);
      return;
    }

    try {
      const model = getResearchModel();
      const resolveRes = await fetch(`${API_BASE}/api/company/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: {
            name: candidate.name,
            url: candidate.url,
            snippet: candidate.snippet,
          },
          search_query: input?.trim() || undefined,
          location_name: locationName,
          openRouterApiKey: apiKey,
          model,
        }),
      });

      const resolveData = await resolveRes.json();
      if (!resolveRes.ok || !resolveData.success) {
        throw new Error(resolveData.error || 'Failed to resolve company');
      }

      const companyBlob = resolveData.company || {};
      
      // Ensure social links and Google Maps link are properly set
      // The backend should have already merged these, but ensure they're present
      if (!companyBlob.googleMapsLink && candidate.name) {
        // Generate SERP page URL as fallback
        const serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(candidate.name)}`;
        companyBlob.googleMapsLink = serpPageUrl;
      }
      
      onCompanyDataFetched?.(companyBlob as Partial<CustomizationConfig> & Record<string, unknown>);
      onCompanyValidated?.();
      toast.success('Company validated. Generating ACF fields...');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch details';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  // Only check for URL when input is substantial (to avoid flickering during typing)
  // Default to showing location dropdown unless clearly a URL
  const looksLikeUrl = input.trim().length > 0 && isUrl(input);
  const placeholder = looksLikeUrl ? 'https://example.com' : 'Company name or URL';

  return (
    <div className={cn(getCyberpunkCardClasses(), "p-6 space-y-4")}>
      <h2 className={cn(getCyberpunkTextClasses('primary'), "text-lg font-semibold font-mono tracking-wide uppercase")}>
        Company Lookup
      </h2>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "flex-1 bg-[#1a1a1a] border-green-500/50 text-green-300 font-mono",
              looksLikeUrl && !apiKey && "opacity-50"
            )}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading && input.trim()) {
                handleLookup();
              }
            }}
          />
          <Button
            onClick={handleLookup}
            disabled={loading || !input.trim() || (looksLikeUrl && !apiKey)}
            className={cn(getCyberpunkButtonClasses(), "font-mono")}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {looksLikeUrl ? 'Fetching...' : 'Searching...'}
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                {looksLikeUrl ? 'Fetch' : 'Search'}
              </>
            )}
          </Button>
        </div>

        {!looksLikeUrl && (
          <Select value={locationName} onValueChange={setLocationName} disabled={loading}>
            <SelectTrigger className="bg-[#1a1a1a] border-green-500/50 text-green-300 font-mono text-sm">
              <SelectValue placeholder="Location (optional)" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-green-500/50">
              {LOCATIONS.map((loc) => (
                <SelectItem key={loc} value={loc} className="text-green-300 font-mono hover:bg-green-500/20">
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {looksLikeUrl && !apiKey && (
          <p className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            Set OpenRouter API key in Settings to fetch from URL.
          </p>
        )}
      </div>

      {step === 'pick' && candidates.length > 0 && (
        <div className={cn("p-4 rounded border border-green-500/30 bg-green-500/5 space-y-3")}>
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold font-mono")}>
            Select your business
          </h3>
          <div className="space-y-2">
            {candidates.map((candidate, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectCandidate(candidate)}
                disabled={loading}
                className={cn(
                  "w-full text-left p-3 rounded border border-green-500/30 bg-[#1a1a1a] hover:bg-green-500/10 hover:border-green-500/50 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <div className={cn(getCyberpunkTextClasses('primary'), "font-mono font-semibold text-sm mb-1")}>
                  {candidate.name}
                </div>
                {candidate.snippet && (
                  <div className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono line-clamp-2")}>
                    {candidate.snippet}
                  </div>
                )}
                {candidate.url && (
                  <div className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono mt-1 opacity-70")}>
                    {candidate.url}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className={cn("p-3 rounded border border-red-500/50 bg-red-500/10")}>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-300" />
            <p className={cn(getCyberpunkTextClasses('muted'), "text-sm text-red-300")}>
              {error}
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
