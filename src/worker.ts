const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export default {
  async fetch(request: Request, env: any) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const body = await request.json();

    const res = await fetch(env.DEFAULT_DIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: env.DEFAULT_TOOL_NAME,
          arguments: {
            prompt: body.prompt,
            numOutputs: body.numOutputs,
            artist_uploads: body.artist_uploads,
            customer_id: body.customer_id,
            version: body.version,
            source_id: body.source_id,
          },
        },
      }),
    });

    const data = await res.json();
    const text = data.result.content.find((c: any) => c.type === "text")?.text;

    return new Response(text, {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  },
};
