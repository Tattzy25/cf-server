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

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    // No try/catch. If JSON is malformed, the worker crashes.
    const body = await request.json();
    const { customer_id, prompt, negative_prompt, source_id, outputs, output, upload_1, upload_2 } = body;

    // 1. MAZE VALIDATION (Intentional logic, not a fallback)
    if (!customer_id) {
      const msg = "Please Log In";
      await logError(source_id, "UNKNOWN", msg, "Missing customer_id", "INPUT_VALIDATION");
      return new Response(JSON.stringify({ error: msg }), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    if (!source_id) {
      const msg = "Server Error Please Try again Later";
      await logError(source_id, customer_id, msg, "Missing source_id", "INPUT_VALIDATION");
      return new Response(JSON.stringify({ error: msg }), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    // 2. BRANCH: Edit_openai source → different Dify endpoint, up to 10 images
    if (source_id === "Edit_openai") {
      return await handleEditOpenai({ customer_id, prompt, source_id, output, upload_1, upload_2 });
    }

    // 3. DEFAULT DIFY CALL
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

    // No try/catch. If Dify is down or returns garbage, the worker crashes.
    const result = await response.json();

    if (result.error) {
      return new Response(JSON.stringify(result.error), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    // 4. SUCCESS EXTRACTION
    const textPart = result.result.content.find((c) => c.type === "text");
    const payload = JSON.parse(textPart.text);
    const imageUrl = payload.structured_output.image_url;

    return new Response(JSON.stringify({ image_url: imageUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};

// ─── Edit_openai branch ───────────────────────────────────────────
// Calls a different Dify MCP endpoint with tool name "TaTTTy Editor Suite".
// upload_1 and upload_2 are optional (image URLs as text).
// Returns 1–10 images.
async function handleEditOpenai({ customer_id, prompt, source_id, output, upload_1, upload_2 }) {
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
    return new Response(JSON.stringify(result.error), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const textPart = result.result.content.find((c) => c.type === "text");
  const payload = JSON.parse(textPart.text);
  const images = payload.structured_output.images;

  return new Response(JSON.stringify({ images }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

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
    "CUSTOMER REFUNDED AMOUNT": 0
  };

  // Logging is best-effort. If it fails, we don't care — never crash the customer's response.
  try {
    await fetch(ERROR_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logPayload)
    });
  } catch (e) {
    // Do nothing. The customer still gets their proper response.
  }
}