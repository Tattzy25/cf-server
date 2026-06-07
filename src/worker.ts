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
    content?: Array<{
      type?: string;
      text?: string;
    }>;
    isError?: boolean;
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

const DEFAULT_DIFY_URL = "https://api.dify.ai/mcp/server/vIKsLS3ToLV1yeUx/mcp";
const DEFAULT_TOOL_NAME = "trash";

function jsonResponse(
  data: unknown,
  status = 200,
  corsHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

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

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    let body: FrontendBody;
    try {
      body = (await request.json()) as FrontendBody;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    const upstreamUrl = env.DIFY_MCP_URL || DEFAULT_DIFY_URL;
    const toolName =
      (env.DIFY_TOOL_NAME || DEFAULT_TOOL_NAME).trim() || "trash";

    const difyPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          prompt: body.prompt ?? "",
          numOutputs: body.numOutputs ?? "1",
          artist_uploads: body.artist_uploads ?? "",
          customer_id: body.customer_id ?? "",
          version: body.version ?? "",
          source_id: body.source_id ?? "",
        },
      },
    };

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(difyPayload),
      });
    } catch (err: any) {
      return jsonResponse(
        { error: err?.message || "Failed to reach upstream" },
        502,
        corsHeaders,
      );
    }

    let difyResponse: DifyResponse;
    try {
      difyResponse = (await upstream.json()) as DifyResponse;
    } catch {
      return jsonResponse(
        { error: "Upstream returned non-JSON response" },
        502,
        corsHeaders,
      );
    }

    // Respect upstream errors
    if (!upstream.ok || difyResponse?.error) {
      const msg =
        difyResponse?.error?.message || `Upstream error (${upstream.status})`;
      return jsonResponse({ error: msg }, upstream.status || 502, corsHeaders);
    }

    // Parse nested structure:
    // difyResponse.result.content[0].text -> JSON string
    // parsedOuter.body -> JSON string
    // parsedInner -> final payload for frontend (expected to include urls)
    try {
      const text = difyResponse?.result?.content?.[0]?.text;
      if (!text) {
        return jsonResponse(
          { error: "Missing result content from upstream" },
          502,
          corsHeaders,
        );
      }

      const parsedOuter = JSON.parse(text) as { body?: string };
      if (!parsedOuter?.body) {
        return jsonResponse(
          { error: "Missing nested body from upstream content" },
          502,
          corsHeaders,
        );
      }

      const parsedInner = JSON.parse(parsedOuter.body);

      // Return final parsed payload directly to frontend
      return jsonResponse(parsedInner, 200, corsHeaders);
    } catch (err: any) {
      return jsonResponse(
        {
          error: "Failed to parse upstream payload",
          details: err?.message || "Unknown parse error",
        },
        502,
        corsHeaders,
      );
    }
  },
};
