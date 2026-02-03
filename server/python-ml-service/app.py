"""
FastAPI application for Knowledge Model ML processing
Handles Word2Vec processing, graph building, and AI suggestions
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Knowledge Model ML Service", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ProcessGraphRequest(BaseModel):
    site_id: str
    content: List[Dict[str, Any]]
    gsc_data: Optional[List[Dict[str, Any]]] = None
    options: Optional[Dict[str, Any]] = None


class AISuggestionsRequest(BaseModel):
    node_id: str
    keyword: str
    context: Optional[Dict[str, Any]] = None
    api_key: Optional[str] = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "knowledge-model-ml",
        "version": "1.0.0"
    }


@app.post("/process-graph")
async def process_graph(request: ProcessGraphRequest):
    """Process WordPress content and GSC data to generate knowledge graph"""
    try:
        from word2vec_processor import Word2VecProcessor
        from graph_builder import GraphBuilder
        
        builder = GraphBuilder()
        graph = await builder.build_graph(
            embeddings={},  # Not needed - using anchor text extraction instead
            content=request.content,
            gsc_data=[],  # Not using GSC data - focusing on anchor text keywords
            options=request.options or {}
        )
        
        return {
            "success": True, 
            "graph": graph
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai-suggestions")
async def get_ai_suggestions(request: AISuggestionsRequest):
    """Get AI-powered node suggestions for a keyword"""
    try:
        from ai_suggestions import AISuggestionEngine
        
        # Use API key from request (frontend settings) or fall back to env
        api_key = request.api_key or os.getenv("OPENROUTER_API_KEY", "")
        
        print(f"[AI Suggestions Endpoint] Request received: keyword={request.keyword}, has_api_key={bool(api_key)}, api_key_length={len(api_key) if api_key else 0}")
        
        if not api_key:
            print("[AI Suggestions Endpoint] No API key provided")
            return {
                "success": False,
                "error": "OpenRouter API key not provided. Please set it in Settings.",
                "suggestions": []
            }
        
        engine = AISuggestionEngine(api_key=api_key)
        print(f"[AI Suggestions Endpoint] Engine created, calling generate_suggestions...")
        suggestions = await engine.generate_suggestions(
            keyword=request.keyword,
            context=request.context or {}
        )
        
        print(f"[AI Suggestions Endpoint] Got {len(suggestions)} suggestions")
        return {"success": True, "suggestions": suggestions}
    except Exception as e:
        import traceback
        print(f"[AI Suggestions Endpoint] Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_ML_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

