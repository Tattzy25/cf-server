import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const DIFY_MCP_URL = "https://api.dify.ai/mcp/server/GTzA5abY7oZKPAsG/mcp";
const DIFY_EDIT_OPENAI_URL = "https://api.dify.ai/mcp/server/SifzPA3a0tjpL0aR/mcp";
const TOOL_NAME = "TaTTTy-MCP";
const EDIT_TOOL_NAME = "TaTTTy Editor Suite";
const ERROR_LOG_URL = "https://error.tattty.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ERR_LOGIN = "Please Log In";
const ERR_SERVER = "Server Error Please Try again Later";

// ─── Shared core logic ────────────────────────────────────────────

async function doGenerate({ customer_id, prompt, source_id, negative_prompt, outputs, upload_1, upload_2 }) {
  const argumentsObj = { customer_id, prompt, source_id };
  if (negative_prompt) argumentsObj.negative_prompt = negative_prompt;
  if (outputs !== undefined) argumentsObj.outputs = outputs;
  if (upload_1) argumentsObj.upload_1 = upload_1;
  if (upload_2) argumentsObj.upload_2 = upload_2;

  const response = await fetch(DIFY_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: TOOL_NAME, arguments: argumentsObj },
    }),
  });

  const result = await response.json();

  if (result.error) {
    return { error: result.error };
  }

  const textPart = result.result.content.find((c) => c.type === "text");
  const payload = JSON.parse(textPart.text);
  const imageUrl = payload.structured_output.image_url;

  return { image_url: imageUrl };
}

async function doEdit({ customer_id, prompt, source_id, output, upload_1, upload_2 }) {
  const argumentsObj = { customer_id, prompt, source_id };
  if (output !== undefined) argumentsObj.output = output;
  if (upload_1) argumentsObj.upload_1 = upload_1;
  if (upload_2) argumentsObj.upload_2 = upload_2;

  const response = await fetch(DIFY_EDIT_OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: EDIT_TOOL_NAME, arguments: argumentsObj },
    }),
  });

  const result = await response.json();

  if (result.error) {
    return { error: result.error };
  }

  const textPart = result.result.content.find((c) => c.type === "text");
  const payload = JSON.parse(textPart.text);
  const images = payload.structured_output.images;

  return { images };
}

// ─── Validation ───────────────────────────────────────────────────

function validateInputs({ customer_id, source_id }) {
  if (!customer_id) {
    return { ok: false, msg: ERR_LOGIN, actual: "Missing customer_id" };
  }
  if (!source_id) {
    return { ok: false, msg: ERR_SERVER, actual: "Missing source_id" };
  }
  return { ok: true };
}

// ─── MCP Server ───────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "tattty",
    version: "1.0.0",
  });

  // Tool 1: generate
  server.registerTool(
    "generate",
    {
      description: "Generate an image from a text prompt. Returns a single image URL.",
      inputSchema: {
        customer_id: z.string().describe("The customer ID"),
        prompt: z.string().describe("The text prompt for image generation"),
        source_id: z.string().describe("The source identifier for this request"),
        negative_prompt: z.string().optional().describe("Negative prompt to exclude elements"),
        outputs: z.string().optional().describe("Number of outputs requested"),
        upload_1: z.string().optional().describe("Image URL for image-to-image"),
        upload_2: z.string().optional().describe("Second image URL for image-to-image"),
      },
    },
    async (params) => {
      try {
        const v = validateInputs(params);
        if (!v.ok) {
          await logError(params.source_id, params.customer_id || "UNKNOWN", v.msg, v.actual, "INPUT_VALIDATION");
          return { content: [{ type: "text", text: v.msg }] };
        }

        const result = await doGenerate(params);

        if (result.error) {
          return { content: [{ type: "text", text: JSON.stringify(result.error) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({ image_url: result.image_url }) }] };
      } catch (e) {
        await logError(params.source_id, params.customer_id, ERR_SERVER, String(e), "GENERATE_TOOL");
        return { content: [{ type: "text", text: ERR_SERVER }] };
      }
    }
  );

  // Tool 2: edit
  server.registerTool(
    "edit",
    {
      description: "Edit images using the TaTTTy Editor Suite. Returns 1 to 10 image URLs.",
      inputSchema: {
        customer_id: z.string().describe("The customer ID"),
        prompt: z.string().describe("The edit instruction prompt"),
        source_id: z.string().describe("The source identifier for this request"),
        output: z.string().optional().describe("Number of output images requested"),
        upload_1: z.string().optional().describe("First image URL to edit (as text)"),
        upload_2: z.string().optional().describe("Second image URL to edit (as text)"),
      },
    },
    async (params) => {
      try {
        const v = validateInputs(params);
        if (!v.ok) {
          await logError(params.source_id, params.customer_id || "UNKNOWN", v.msg, v.actual, "INPUT_VALIDATION");
          return { content: [{ type: "text", text: v.msg }] };
        }

        const result = await doEdit(params);

        if (result.error) {
          return { content: [{ type: "text", text: JSON.stringify(result.error) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({ images: result.images }) }] };
      } catch (e) {
        await logError(params.source_id, params.customer_id, ERR_SERVER, String(e), "EDIT_TOOL");
        return { content: [{ type: "text", text: ERR_SERVER }] };
      }
    }
  );

  return server;
}

// ─── Worker Entry ─────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // MCP endpoint — Streamable HTTP transport (JSON-RPC 2.0)
    if (url.pathname.startsWith("/mcp")) {
      return createMcpHandler(createServer)(request, env, ctx);
    }

    // ─── Original HTTP endpoint ────────────────────────────────────
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    try {
      const body = await request.json();
      const { customer_id, prompt, negative_prompt, source_id, outputs, output, upload_1, upload_2 } = body;

      // 1. Validation
      const v = validateInputs({ customer_id, source_id });
      if (!v.ok) {
        await logError(source_id, customer_id || "UNKNOWN", v.msg, v.actual, "INPUT_VALIDATION");
        return new Response(JSON.stringify({ error: v.msg }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      // 2. Branch: Edit_openai source
      if (source_id === "Edit_openai") {
        try {
          const result = await doEdit({ customer_id, prompt, source_id, output, upload_1, upload_2 });

          if (result.error) {
            return new Response(JSON.stringify(result.error), {
              status: 200,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }

          return new Response(JSON.stringify({ images: result.images }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (e) {
          await logError(source_id, customer_id, ERR_SERVER, String(e), "EDIT_HTTP");
          return new Response(JSON.stringify({ error: ERR_SERVER }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }
      }

      // 3. Default generate
      try {
        const result = await doGenerate({ customer_id, prompt, source_id, negative_prompt, outputs, upload_1, upload_2 });

        if (result.error) {
          return new Response(JSON.stringify(result.error), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        return new Response(JSON.stringify({ image_url: result.image_url }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      } catch (e) {
        await logError(source_id, customer_id, ERR_SERVER, String(e), "GENERATE_HTTP");
        return new Response(JSON.stringify({ error: ERR_SERVER }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
    } catch (e) {
      // JSON parse failure or other unexpected error
      return new Response(JSON.stringify({ error: ERR_SERVER }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  },
};

// ─── Error logging (best-effort) ──────────────────────────────────

async function logError(source_id, customer_id, error_replied, actual_error, workflow_step) {
  const logPayload = {
    "SOURCE ID": source_id || "UNKNOWN",
    "TIMESTAMP": new Date().toISOString(),
    "CUSTOMER ID": customer_id || "UNKNOWN",
    "WORKFLOW STEP": workflow_step,
    "ERROR MESSAGE REPLIED": error_replied,
    "ACTUAL ERROR": actual_error,
    "RETRY COUNT": 0,
    "RETRY FAIL COUNT": 0,
    "CUSTOMER REFUNDED AMOUNT": 0,
  };

  try {
    await fetch(ERROR_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logPayload),
    });
  } catch (e) {
    // Do nothing. The customer still gets their proper response.
  }
}