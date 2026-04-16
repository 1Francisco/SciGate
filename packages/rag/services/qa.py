import os
from typing import Any
import google.generativeai as genai
from .agent_buyer import search_and_buy_context

genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

SYSTEM_PROMPT = """You are SciGate, an AI assistant that helps users understand academic papers.
You answer questions based on the provided paper excerpts. 

DYNAMICS:
1. If the answer is in the excerpts, provide it with page citations.
2. If the answer is NOT in the excerpts, but you think it might be in related papers in the catalog, 
   respond with the exact phrase: "NEED_GLOBAL_SEARCH: [Search Query]" where [Search Query] is a keyword search to find relevant info.
3. Be concise and accurate."""

async def answer_question(
    question: str,
    chunks: list[dict[str, Any]],
    model_name: str = "gemini-1.5-flash",
    allow_agent_buy: bool = True
) -> str:
    """
    Generate an answer using RAG. If info is missing, the agent can autonomously 
    buy knowledge from other papers via x402.
    """
    # 1. Prepare initial context
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(f"[Excerpt {i+1}, Page {chunk['page']}]\n{chunk['text']}")
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"{SYSTEM_PROMPT}\n\nBased on these excerpts from the current paper, answer: {question}\n\n" \
             f"Paper excerpts:\n{context}"

    model = genai.GenerativeModel(model_name)
    response = await model.generate_content_async(prompt)
    answer = response.text or "Unable to generate answer."

    # 2. Agentic "Buy" Flow (Option C)
    if "NEED_GLOBAL_SEARCH:" in answer and allow_agent_buy:
        search_query = answer.split("NEED_GLOBAL_SEARCH:")[1].strip()
        print(f"🚀 Agentic Flow Triggered! Buying context for: {search_query}...")
        
        # This calls our x402-enabled buyer
        purchased_data = await search_and_buy_context(search_query)
        
        if purchased_data:
            # Re-synthesize with NEW context
            extra_info = "\n\n--- BOUGHT CONTEXT FROM OTHER PAPERS ---\n"
            for p in purchased_data:
                extra_info += f"\n[Paper {p['paper_id']}]: {p['answer']}\n"
            
            final_prompt = f"I have purchased extra information to help you. Combine it with the original paper excerpts to answer the user.\n\n" \
                           f"Question: {question}\n" \
                           f"Original Context:\n{context}\n" \
                           f"Purchased Context:\n{extra_info}\n\n" \
                           f"Final Answer:"
            
            final_resp = await model.generate_content_async(final_prompt)
            return final_resp.text

    return answer
