interface FrontendBody {
  prompt?: string;
  numOutputs?: number;
  customerid?: string;
  version?: string;
  artistuploads?: string;
}

interface DifyResponse {
  statuscode: number;
  body: string;
}

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const body = (await request.json()) as FrontendBody;

    const difyPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "trash",
        arguments: {
          prompt: body.prompt,
          numOutputs: body.numOutputs,
          uploadedImage: body.artistuploads,
          customerId: body.customerid,
          version: body.version,
          timestamp: new Date().toISOString(),
        },
      },
    };

    const res = await fetch(
      "https://api.dify.ai/mcp/server/vIKsLS3ToLV1yeUxmcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(difyPayload),
      },
    );

    const data = (await res.json()) as DifyResponse;
    const parsedBody = JSON.parse(data.body);

    return new Response(JSON.stringify(parsedBody), {
      status: data.statuscode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
