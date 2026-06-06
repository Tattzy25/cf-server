export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const body = (await request.json()) as Record<string, any>;
    const args: Record<string, any> = {};

    if (body.prompt) args.prompt = body.prompt;
    if (body.numOutputs) args.numOutputs = body.numOutputs;
    if (body.customer_id) args.customerId = body.customer_id;
    if (body.version) args.version = body.version;
    if (body.artist_uploads?.length) args.uploadedImage = body.artist_uploads;
    args.timestamp = new Date().toISOString();

    const res = await fetch(
      "https://api.dify.ai/mcp/server/vIKsLS3ToLV1yeUx/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "trash", arguments: args },
        }),
      },
    );

    const data = (await res.json()) as { status_code: number; body: string };
    const parsed = JSON.parse(data.body);

    return new Response(JSON.stringify(parsed), {
      status: data.status_code,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
