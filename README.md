# ⬡ SciGate: Autonomous Academic Monetization

SciGate is a decentralized platform that enables autonomous economic agents to access, monetize, and query academic research using the **x402 payment protocol** on **World Chain** and **Solana**.

## 🏗️ Project Structure

This is a monorepo containing the following components:

### 1. 📱 App de World (Frontend)
- **Path:** `/app`, `/components`
- **Tech:** Next.js, Tailwind CSS, MiniKit v2.
- **Purpose:** User interface for researchers to publish papers and for users to query them. Integrates World ID for humanity verification.

### 2. ⚡ Server para x402 (Backend)
- **Path:** `/packages/server`
- **Tech:** Hono, Node.js, x402 SDK.
- **Purpose:** Acts as the gatekeeper. Issues x402 challenges and verifies payments before unlocking access to the RAG engine.

### 3. 🛰️ Agente de IA (NanoClaw / RAG)
- **Path:** `/packages/rag`
- **Tech:** Python, FastAPI, ChromaDB, x402 Python SDK (v2.8.0).
- **Purpose:** The autonomous agent that lives on a Raspberry Pi. It can decide to buy context autonomously and perform RAG (Retrieval Augmented Generation) on academic papers.

---

## 🚀 How to Run

### Setup Environment
Each component requires its own `.env` file based on the provided examples.

### Start the Agent (RPi)
```bash
cd packages/rag
source venv/bin/activate
python main.py
```

### Start the Gateway Server
```bash
cd packages/server
npm install
npm run dev
```

### Start the Web App
```bash
npm install
npm run dev
```

---
*Built for the World Chain / SciGate Hackathon.*
