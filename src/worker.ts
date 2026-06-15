const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept"
};

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const body = await request.json() as any;

    const res = await fetch(body.mcp_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "trash",
          arguments: {
            prompt: body.prompt,
            numOutputs: body.numOutputs,
            artist_uploads: body.artist_uploads,
            customer_id: body.customer_id,
            version: body.version,
            source_id: body.source_id
          }
        }
      })
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
};