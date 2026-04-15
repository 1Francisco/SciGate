import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json();
    const RAG_URL = process.env.RAG_SERVICE_URL || 'http://100.95.133.124:10000';

    console.log(`[AgentProxy] Initiating autonomous loop for: ${topic} -> ${RAG_URL}/ask-agent`);

    // Connect to the Raspberry Pi SSE endpoint
    const response = await fetch(`${RAG_URL}/ask-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    if (!response.ok) {
      throw new Error(`RAG Service Error: ${response.status}`);
    }

    // Set up a readable stream to forward the SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          console.error('[AgentProxy] Stream Break:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[AgentProxy] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
