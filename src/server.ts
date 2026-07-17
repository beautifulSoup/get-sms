import express from "express";
import type { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SQLiteStore } from "./db";
import type { Config } from "./config";
import { createIngestRouter } from "./ingest";
import { createMcpServer } from "./mcp";

export function buildApp(store: SQLiteStore, config: Config): express.Express {
  const app = express();
  app.use(express.json());

  app.use("/ingest", createIngestRouter(store, config));

  function mcpAuth(req: Request, res: Response, next: NextFunction) {
    if (req.headers.authorization !== `Bearer ${config.mcpApiKey}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  }

  // Stateless Streamable HTTP: a fresh server + transport per request.
  app.post("/mcp", mcpAuth, async (req, res) => {
    const server = createMcpServer(store, config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const methodNotAllowed = (_req: Request, res: Response) =>
    res.status(405).json({ error: "Method Not Allowed" });
  app.get("/mcp", mcpAuth, methodNotAllowed);
  app.delete("/mcp", mcpAuth, methodNotAllowed);

  return app;
}
