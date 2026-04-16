from dotenv import load_dotenv
load_dotenv()

import os
import hashlib
import asyncio
import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.pdf_parser import extract_text_and_metadata
from services.chunker import split_text
from services.embedder import create_embeddings, query_embeddings, get_sections
from services.qa import answer_question
from services.x402_server import x402_gate

app = FastAPI(
    title="SciGate RAG Engine",
    description="PDF ingestion and query engine for academic papers (x402 Enabled)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    exposed_headers=["Payment-Required"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    paper_id: str
    question: str

class AgentRequest(BaseModel):
    topic: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "scigate-rag"}


@app.post("/upload")
async def upload_paper(file: UploadFile = File(...)):
    """
    Ingest a PDF paper:
    1. Parse text with PyMuPDF
    2. Compute SHA256 content hash (used as paper_id)
    3. Split into semantic chunks
    4. Generate embeddings and store in ChromaDB
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    print(f"--- RAG UPLOAD START: {file.filename} ---")
    contents = await file.read()
    print(f"File size: {len(contents)} bytes")
    if len(contents) == 0:
        print("Error: Empty file")
        raise HTTPException(status_code=400, detail="Empty file")

    # Compute content hash (this matches what the smart contract uses)
    content_hash = "0x" + hashlib.sha256(contents).hexdigest()
    paper_id = content_hash

    try:
        # Parse PDF
        print("Parsing PDF...")
        parsed = extract_text_and_metadata(contents)
        print(f"Parsed successful. Pages: {parsed['page_count']}")

        # Split into chunks
        print("Splitting into chunks...")
        chunks = split_text(parsed["full_text"], paper_id=paper_id, pages=parsed["pages"])
        print(f"Created {len(chunks)} chunks")

        # Store in ChromaDB
        print("Creating embeddings and storing in ChromaDB...")
        await asyncio.to_thread(create_embeddings, chunks, paper_id)
        print("ChromaDB storage complete")

        return {
            "paper_id": paper_id,
            "content_hash": content_hash,
            "chunks_count": len(chunks),
            "title": parsed.get("title", file.filename),
            "pages": parsed["page_count"],
        }
    except Exception as e:
        print(f"--- RAG UPLOAD ERROR: {str(e)} ---")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_paper(req: QueryRequest, paid: bool = Depends(x402_gate)):
    """
    Answer a natural language question about a paper using RAG.
    GATED BY x402: Requires a valid USDC payment proof on World Chain.
    """
    if len(req.question.strip()) < 5:
        raise HTTPException(status_code=400, detail="Question must be at least 5 characters")

    # Retrieve relevant chunks from ChromaDB
    relevant_chunks = await asyncio.to_thread(query_embeddings, req.paper_id, req.question, n=4)

    if not relevant_chunks:
        raise HTTPException(status_code=404, detail=f"Paper '{req.paper_id}' not found or has no content")

    # Generate answer via LLM
    answer = await answer_question(req.question, relevant_chunks)

    return {
        "paper_id": req.paper_id,
        "answer": answer,
        "chunks": relevant_chunks,
    }


@app.get("/papers/{paper_id}/sections")
async def paper_sections(paper_id: str):
    """
    Return detected sections of a paper (abstract, introduction, etc.)
    """
    sections = await asyncio.to_thread(get_sections, paper_id)
    if not sections:
        raise HTTPException(status_code=404, detail=f"Paper '{paper_id}' not found")

    return {"paper_id": paper_id, "sections": sections}


@app.get("/search")
async def search_papers(q: str):
    """
    Semantic search across all papers in the catalog.
    Returns metadata snippets from matching chunks.
    """
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short")

    from services.embedder import search_all
    results = await asyncio.to_thread(search_all, q, n=10)
    return {"query": q, "results": results}


@app.post("/ask-agent")
async def ask_agent(req: AgentRequest):
    """
    Autonomous research loop for Agent NanoClaw.
    Streams progress logs to the frontend via SSE.
    """
    async def event_generator():
        try:
            yield f"data: {json.dumps({'status': 'searching', 'message': f'NanoClaw: Initiating search for \"{req.topic}\"...'})}\n\n"
            await asyncio.sleep(1)
            
            # The answer_question function will trigger the search_and_buy_context if info is missing
            # We pass empty chunks to start a global search
            from services.qa import answer_question
            
            yield f"data: {json.dumps({'status': 'analyzing', 'message': 'Processing knowledge and negotiating x402 access...'})}\n\n"
            
            final_answer = await answer_question(req.topic, [], allow_agent_buy=True)
            
            yield f"data: {json.dumps({'status': 'done', 'message': 'Research complete. Synthesis successful.', 'data': {'answer': final_answer, 'paper_id': 'GLOBAL_CATALOG'}})}\n\n"
        except Exception as e:
            print(f"Agent Loop Error: {str(e)}")
            yield f"data: {json.dumps({'status': 'error', 'message': f'Agent failure: {str(e)}'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
