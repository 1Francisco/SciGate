import os
import httpx
from typing import List, Dict, Any
from .x402_handler import x402_handler

SCIGATE_API_URL = os.getenv("SCIGATE_API_URL", "http://localhost:3000")

async def search_and_buy_context(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Autonomously searches for relevant papers and "buys" queries for them using x402.
    """
    print(f"🕵️ Agent Buyer: Searching global catalog for '{query}'...")
    
    # 1. Search across all papers
    async with httpx.AsyncClient() as client:
        search_resp = await client.get(f"{SCIGATE_API_URL}/search", params={"q": query})
        if search_resp.status_code != 200:
            return []
        
        search_data = search_resp.json()
        results = search_data.get("results", [])
    
    # 2. Identify top unique papers (besides the current one)
    paper_ids = list(set([r["paper_id"] for r in results]))[:limit]
    
    purchased_context = []
    
    # 3. Autonomous Purchase Loop
    for paper_id in paper_ids:
        print(f"💰 Agent Buyer: Attempting to buy query for paper {paper_id}...")
        try:
            # We use the x402_handler which handles the 402 challenge automatically
            resp = await x402_handler.post(
                f"{SCIGATE_API_URL}/papers/{paper_id}/query",
                json={"question": query}
            )
            
            if resp.status_code == 200:
                data = resp.json()
                purchased_context.append({
                    "paper_id": paper_id,
                    "answer": data.get("answer"),
                    "chunks": data.get("chunks", [])
                })
                print(f"✅ Agent Buyer: Successfully purchased info from {paper_id}")
            else:
                print(f"❌ Agent Buyer: Failed to buy from {paper_id} (Status: {resp.status_code})")
        except Exception as e:
            print(f"⚠️ Agent Buyer error querying {paper_id}: {str(e)}")
            
    return purchased_context
