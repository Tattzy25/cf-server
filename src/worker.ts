// worker.ts — minimal proxy, no validators

type Env = {
  DIFY_MCP_URL?: string;
  UPLOADS_BASE_URL?: string;
};

type JsonRecord = Record<string, unknown>;

type DifyContentItem = {
  type?: string;
  text?: string;
};

type DifyResponse = {
  error?: unknown;
  result?: {
    content?: DifyContentItem[];
  };
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function toAbsoluteUrl(input: string, base: string): string {
  if (!input) return input;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("//")) return `https:${input}`;
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input}`;
}

function normalizeUrls(payload: JsonRecord, base: string): JsonRecord {
  const urlsSource = Array.isArray(payload?.urls)
    ? payload.urls
    : Array.isArray(payload?.output)
      ? payload.output
      : Array.isArray(payload?.images)
        ? payload.images
        : [];

  const urls = (urlsSource as unknown[])
    .filter((u) => typeof u === "string" && u.length > 0)
    .map((u) => toAbsoluteUrl(u as string, base));

  return { ...payload, urls };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const upstreamUrl = String(env.DIFY_MCP_URL || "");
    const uploadsBase = String(env.UPLOADS_BASE_URL || "");

    const difyPayload = {
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
          source_id: body.source_id,
        },
      },
    };

    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(difyPayload),
    }).catch(() => new Response("{}", { status: 200 }));

    const dify = (await upstreamRes.json().catch(() => ({}))) as DifyResponse;
    const textContent = dify?.result?.content?.find(
      (c) => c?.type === "text",
    )?.text;
    const outer = JSON.parse((textContent as string) || "{}") as JsonRecord;

    return json(normalizeUrls(outer, uploadsBase), 200);
  },
};
