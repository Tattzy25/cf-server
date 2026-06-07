interface Env {
  DIFY_MCP_URL?: string;
  DIFY_TOOL_NAME?: string;
}

interface FrontendBody {
  prompt?: string;
  numOutputs?: string;
  customer_id?: string;
  version?: string;
  artist_uploads?: string;
  source_id?: string;
}

interface DifyResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
    isError: boolean;
  };
}

const DEFAULT_DIFY_URL = "https://api.dify.ai/mcp/server/vIKsLS3ToLV1yeUx/mcp";
const DEFAULT_TOOL_NAME = "trash";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const body = (await request.json()) as FrontendBody;

    const upstreamUrl = env.DIFY_MCP_URL || DEFAULT_DIFY_URL;
    const toolName = env.DIFY_TOOL_NAME || DEFAULT_TOOL_NAME;

    const difyPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          prompt: body.prompt,
          numOutputs: body.numOutputs,
          artist_uploads: body.artist_uploads,
          customer_id: body.customer_id,
          version: body.version,
          source_id: body.source_id,
        },
      },
    };

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(difyPayload),
    });

    const difyResponse = (await upstream.json()) as DifyResponse;

    // PARSE the nested JSON - your backend always returns this structure
    const outerJson = JSON.parse(difyResponse.result!.content[0].text);
    const innerJson = JSON.parse(outerJson.body);

    // Return the parsed result
    return new Response(JSON.stringify(innerJson), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  },
};
