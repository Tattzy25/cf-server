// src/worker.ts

// Global CORS config
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

// Global Agent Link Headers to attach to all successful text/json responses
// Points agents directly to the discovery endpoints
var AGENT_LINK_HEADERS =
  '</.well-known/acp.json>; rel="acp", ' +
  '</.well-known/api-catalog>; rel="api-catalog", ' +
  '</.well-known/mcp/server-card.json>; rel="mcp-server-card"';

var worker_default = {
  async fetch(request: Request, env: any)
 {
    // 1. Handle Preflight CORS Requests
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // 2. Handle Agent Discovery GET Endpoints
    if (request.method === "GET") {
      // robots.txt with Content-Signals
      if (path === "/robots.txt") {
        const robotsTxt =
          "User-agent: *\n" +
          "Allow: /\n" +
          "Content-Signal: ai-train=no, search=yes, ai-input=yes\n";
        return new Response(robotsTxt, {
          headers: { ...CORS, "Content-Type": "text/plain" },
        });
      }

      // auth.md root file
      if (path === "/auth.md") {
        const authMd =
          "# Agent Registration & Authentication\n\n" +
          "This API uses OAuth 2.0 protected resource metadata for agent authentication. " +
          "Please discover authorization routes using verification endpoints.\n";
        return new Response(authMd, {
          headers: { ...CORS, "Content-Type": "text/markdown" },
        });
      }

      // /.well-known/acp.json (Agentic Commerce Protocol)
      if (path === "/.well-known/acp.json") {
        const acpDiscovery = {
          protocol: { name: "acp", version: "0.1.0" },
          api_base_url: "https://api.tattty.com",
          transports: ["http"],
          capabilities: {
            services: [
              {
                type: "commerce",
                description:
                  "AI tattoo image generation, model training, and editing services.",
              },
            ],
          },
        };
        return new Response(JSON.stringify(acpDiscovery), {
          headers: {
            ...CORS,
            "Content-Type": "application/json",
            Link: AGENT_LINK_HEADERS,
          },
        });
      }

      // /.well-known/api-catalog
      if (path === "/.well-known/api-catalog") {
        const apiCatalog = {
          linkset: [
            {
              anchor: "https://api.tattty.com",
              "service-desc":
                "https://api.tattty.com/.well-known/mcp/server-card.json",
              status: "https://api.tattty.com/health",
            },
          ],
        };
        return new Response(JSON.stringify(apiCatalog), {
          headers: { ...CORS, "Content-Type": "application/linkset+json" },
        });
      }

      // /.well-known/oauth-protected-resource
      if (path === "/.well-known/oauth-protected-resource") {
        const oauthMeta = {
          resource: "https://api.tattty.com",
          authorization_servers: ["https://api.tattty.com/oauth/v2"],
          scopes_supported: ["generate", "read"],
        };
        return new Response(JSON.stringify(oauthMeta), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // /.well-known/mcp/server-card.json (Model Context Protocol Server Card)
      if (path === "/.well-known/mcp/server-card.json") {
        const mcpCard = {
          serverInfo: {
            name: "mcp-artist-generator",
            version: "1.0.0",
          },
          transport: {
            type: "http",
            endpoint: "https://api.tattty.com",
          },
          capabilities: {
            tools: true,
            resources: false,
          },
        };
        return new Response(JSON.stringify(mcpCard), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // /.well-known/agent-skills/index.json
      if (path === "/.well-known/agent-skills/index.json") {
        const agentSkills = {
          $schema: "https://agentskills.io/v0.2.0/schema.json",
          skills: [
            {
              name: "mcp-artist-generator",
              type: "mcp",
              description: "Exposes tattoo sketching tools via MCP",
              url: "https://api.tattty.com/.well-known/mcp/server-card.json",
            },
          ],
        };
        return new Response(JSON.stringify(agentSkills), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // Quick Health check route fallback
      if (path === "/health") {
        return new Response(JSON.stringify({ status: "healthy" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Your Existing Image Generation Logic (Requires POST)
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const mcpUrl = body.mcp_url;

        const res = await fetch(mcpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
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
          }),
        });

        const rpc = await res.json();
        if (rpc.error) {
          return new Response(JSON.stringify({ error: rpc.error.message }), {
            status: 502,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        const textItem = rpc.result?.content?.find(
          (c: any) => c.type === "text",
        );

        const text = textItem?.text;

        return new Response(text, {
          headers: {
            ...CORS,
            "Content-Type": "application/json",
            Link: AGENT_LINK_HEADERS,
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Invalid request payload or internal failure.",
          }),
          {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Fallback for any unsupported routes/methods
    return new Response(
      JSON.stringify({ error: "Method not allowed or route not found." }),
      {
        status: 405,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  },
};

export { worker_default as default };
