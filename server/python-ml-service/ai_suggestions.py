"""
AI-powered node suggestions using OpenRouter API
"""

from typing import List, Dict, Any, Optional
import os
import asyncio
import aiohttp
from dotenv import load_dotenv

load_dotenv()


class AISuggestionEngine:
    """Generates AI suggestions for potential graph nodes"""
    
    def __init__(self, api_key: Optional[str] = None):
        # Use provided API key (from frontend settings) or fall back to env
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY", "")
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp")
    
    async def generate_suggestions(
        self,
        keyword: str,
        context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate AI suggestions for related keywords/nodes"""
        print(f"[AI Suggestions] generate_suggestions called: keyword={keyword}, has_api_key={bool(self.api_key)}")
        
        if not self.api_key:
            print("[AI Suggestions] No API key found - returning empty suggestions")
            return []
        
        try:
            prompt = self._build_prompt(keyword, context)
            print(f"[AI Suggestions] Prompt built, calling OpenRouter API...")
            response = await self._call_openrouter(prompt)
            print(f"[AI Suggestions] OpenRouter response received")
            suggestions = self._parse_response(response)
            print(f"[AI Suggestions] Parsed {len(suggestions)} suggestions")
            return suggestions
        except Exception as e:
            print(f"[AI Suggestions] Error generating AI suggestions: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _build_prompt(self, keyword: str, context: Dict[str, Any]) -> str:
        """Build prompt for AI suggestion"""
        gsc_info = context.get("gsc_data", {})
        related_keywords = context.get("related_keywords", [])
        
        prompt = f"""Analyze the keyword "{keyword}" and suggest 5-10 related keywords or concepts that would be valuable to add to a knowledge graph for SEO content strategy.

Context:
- Current keyword: {keyword}
- GSC Performance: {gsc_info.get('clicks', 0)} clicks, {gsc_info.get('impressions', 0)} impressions
- Related keywords: {', '.join(related_keywords[:5]) if related_keywords else 'None'}

Suggest keywords that:
1. Are semantically related
2. Have SEO potential
3. Could expand content opportunities
4. Connect to existing keyword clusters

Return a JSON array of suggestions, each with:
- keyword: string
- reasoning: string (why this keyword is valuable)
- opportunity: "high" | "medium" | "low"
"""
        return prompt
    
    async def _call_openrouter(self, prompt: str) -> Dict[str, Any]:
        """Call OpenRouter API using async HTTP"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an SEO expert helping build a knowledge graph for content strategy."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 1000
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                response.raise_for_status()
                return await response.json()
    
    def _parse_response(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse AI response into structured suggestions"""
        try:
            print(f"[AI Suggestions] Parsing response, keys: {list(response.keys())}")
            if "choices" not in response or not response["choices"]:
                print(f"[AI Suggestions] No choices in response: {response}")
                return []
            
            content = response["choices"][0]["message"]["content"]
            print(f"[AI Suggestions] Response content length: {len(content)}, first 200 chars: {content[:200]}")
            
            # Try to extract JSON from response
            import json
            import re
            
            # Look for JSON array in response
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                try:
                    suggestions = json.loads(json_match.group())
                    print(f"[AI Suggestions] Parsed JSON array with {len(suggestions)} items")
                    return suggestions
                except json.JSONDecodeError as e:
                    print(f"[AI Suggestions] JSON decode error: {e}, trying text parsing")
            
            # Fallback: parse as text
            lines = content.split('\n')
            suggestions = []
            for line in lines:
                if line.strip() and not line.startswith('#'):
                    # Simple parsing
                    if ':' in line:
                        parts = line.split(':', 1)
                        suggestions.append({
                            "keyword": parts[0].strip('- '),
                            "reasoning": parts[1].strip() if len(parts) > 1 else "AI suggested",
                            "opportunity": "medium"
                        })
            
            print(f"[AI Suggestions] Text parsing resulted in {len(suggestions)} suggestions")
            return suggestions[:10]  # Limit to 10
        except Exception as e:
            print(f"[AI Suggestions] Error parsing AI response: {e}")
            import traceback
            traceback.print_exc()
            return []

