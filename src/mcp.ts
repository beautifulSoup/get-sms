import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SQLiteStore } from "./db";
import type { Config } from "./config";
import { matchesKeyword, hasCodeIndicator, extractCode } from "./codes";

export interface CodeResult {
  code: string | null;
  body: string;
  deviceLabel: string;
  receivedAt: number;
}

export function getLatestCode(
  store: SQLiteStore,
  config: Config,
  params: { keyword: string; device?: string; since?: string }
): CodeResult | null {
  let sinceMs = Date.now() - config.windowMinutes * 60_000;
  if (params.since) {
    const parsed = Date.parse(params.since);
    if (!Number.isNaN(parsed)) sinceMs = parsed;
  }

  const rows = store.queryMessages({ device: params.device, sinceMs });
  const hit = rows.find(
    (r) => matchesKeyword(r.body, params.keyword) && hasCodeIndicator(r.body, config.codeIndicators)
  );
  if (!hit) return null;

  return {
    code: extractCode(hit.body),
    body: hit.body,
    deviceLabel: hit.device_label,
    receivedAt: hit.received_at,
  };
}

export function createMcpServer(store: SQLiteStore, config: Config): McpServer {
  const server = new McpServer({ name: "getsms", version: "0.1.0" });

  server.registerTool(
    "get_latest_code",
    {
      title: "Get latest verification code",
      description:
        "Return the most recent SMS verification code from a given source. " +
        "`keyword` is REQUIRED and should be the sender/brand (e.g. the Chinese 【】 signature like 淘宝/京东/12306, or an English service name). " +
        "Only messages containing the keyword AND a verification-code term, received within the recent time window, are considered.",
      inputSchema: {
        keyword: z.string(),
        device: z.string().optional(),
        since: z.string().optional(),
      },
    },
    async ({ keyword, device, since }) => {
      if (!keyword || keyword.trim() === "") {
        return {
          content: [
            {
              type: "text",
              text: "A non-empty `keyword` (the SMS source/brand, e.g. 淘宝) is required. Nothing was returned.",
            },
          ],
        };
      }

      const result = getLatestCode(store, config, { keyword: keyword.trim(), device, since });
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: `No matching verification code for keyword "${keyword.trim()}" (it may be outside the time window or not yet received).`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  );

  return server;
}
