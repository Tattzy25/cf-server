interface Env {
  DIFY_MCP_URL?: string;
  DIFY_TOOL_NAME?: string;
}

interface FrontendBody {
  prompt?: string;
  numOutputs?: number;
  customerid?: string;
  version?: string;
  artistuploads?: string | string[];
  endpoint?: string;
  toolName?: string;
}

interface DifyWrappedResponse {
  statuscode?: number;
  body?: unknown;
  [key: string]: unknown;
}

const DEFAULT_DIFY_URL = "https://api.dify.ai/mcp/server/vIKsLS3ToLV1yeUxmcp";
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

    const upstreamUrl = body.endpoint || env.DIFY_MCP_URL || DEFAULT_DIFY_URL;
    const toolName = body.toolName || env.DIFY_TOOL_NAME || DEFAULT_TOOL_NAME;

    const difyPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
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

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(difyPayload),
    });

    const raw = await upstream.text();
    const upstreamContentType = upstream.headers.get("content-type") || "";

    let status = upstream.status;
    let responseBody = raw;
    let contentType = upstreamContentType || "text/plain; charset=utf-8";

    if (upstreamContentType.includes("application/json")) {
      try {
        const outer = JSON.parse(raw) as DifyWrappedResponse;
        status =
          typeof outer.statuscode === "number"
            ? outer.statuscode
            : upstream.status;

        if (typeof outer.body === "string") {
          try {
            responseBody = JSON.stringify(JSON.parse(outer.body));
            contentType = "application/json; charset=utf-8";
          } catch {
            responseBody = outer.body;
            contentType = "text/plain; charset=utf-8";
          }
        } else if (outer.body !== undefined) {
          responseBody = JSON.stringify(outer.body);
          contentType = "application/json; charset=utf-8";
        } else {
          responseBody = JSON.stringify(outer);
          contentType = "application/json; charset=utf-8";
        }
      } catch {
        responseBody = raw;
        contentType = "text/plain; charset=utf-8";
      }
    } else if (upstreamContentType.includes("text/event-stream")) {
      responseBody = raw;
      contentType = "text/event-stream; charset=utf-8";
    }

    return new Response(responseBody, {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
      },
    });
  },
};
