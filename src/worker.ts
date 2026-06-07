interface Env {
  DIFY_MCP_URL?: string;
  DIFY_TOOL_NAME?: string;
  UPLOADS_BASE_URL?: string;
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
const DEFAULT_UPLOADS_BASE_URL = "https://tattty-uploads.tattty.com";

function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toAbsoluteImageUrl(input: string, base: string): string {
  if (!input) return input;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("//")) return `https:${input}`;
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input}`;
}

function normalizeUrls(payload: any, base: string) {
  const source = Array.isArray(payload?.urls)
    ? payload.urls
    : Array.isArray(payload?.output)
      ? payload.output
      : Array.isArray(payload?.images)
        ? payload.images
        : [];

  const urls = source
    .filter((u: unknown) => typeof u === "string" && u.length > 0)
    .map((u: string) => toAbsoluteImageUrl(u, base));

  return { ...payload, urls };
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
      return new Response(null, { status: 204, headers: corsHeaders });
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
    const uploadsBase = (
      env.UPLOADS_BASE_URL || DEFAULT_UPLOADS_BASE_URL
    ).replace(/\/+$/, "");

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

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(difyPayload),
      });
    } catch (e: any) {
      return jsonResponse(
        { error: e?.message || "Upstream fetch failed" },
        502,
        corsHeaders,
      );
    }

    let dify: DifyResponse;
    try {
      dify = (await upstreamRes.json()) as DifyResponse;
    } catch {
      return jsonResponse(
        { error: "Upstream returned non-JSON" },
        502,
        corsHeaders,
      );
    }

    if (!upstreamRes.ok || dify?.error) {
      return jsonResponse(
        {
          error:
            dify?.error?.message || `Upstream error (${upstreamRes.status})`,
        },
        upstreamRes.status || 502,
        corsHeaders,
      );
    }

    try {
      const text = dify?.result?.content?.[0]?.text;
      if (!text) {
        return jsonResponse(
          { error: "Missing result.content[0].text" },
          502,
          corsHeaders,
        );
      }

      const outer = JSON.parse(text) as { body?: string };
      if (!outer?.body || typeof outer.body !== "string") {
        return jsonResponse(
          { error: "Missing nested body JSON string" },
          502,
          corsHeaders,
        );
      }

      let inner: any;
      try {
        inner = JSON.parse(outer.body);
      } catch {
        const sanitizedBody = outer.body
          .replace(/\r/g, "\\r")
          .replace(/\n/g, "\\n")
          .replace(/\t/g, "\\t");
        inner = JSON.parse(sanitizedBody);
      }

      const normalized = normalizeUrls(inner, uploadsBase);

      return jsonResponse(normalized, 200, corsHeaders);
    } catch (e: any) {
      return jsonResponse(
        {
          error: "Failed to parse nested upstream payload",
          details: e?.message || "parse error",
        },
        502,
        corsHeaders,
      );
    }
  },
};
