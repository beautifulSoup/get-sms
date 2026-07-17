import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../src/server";
import { SQLiteStore } from "../src/db";
import { getLatestCode } from "../src/mcp";
import { DEFAULT_CODE_INDICATORS, type Config } from "../src/config";

function setup() {
  const store = new SQLiteStore(":memory:");
  const config: Config = {
    port: 3000,
    dbPath: ":memory:",
    mcpApiKey: "secret-mcp",
    devices: [{ label: "主力机", token: "tok-a" }],
    codeIndicators: DEFAULT_CODE_INDICATORS,
    windowMinutes: 10,
  };
  return { app: buildApp(store, config), store, config };
}

describe("end-to-end", () => {
  it("ingested SMS becomes retrievable via getLatestCode", async () => {
    const { app, store, config } = setup();
    await request(app).post("/ingest/tok-a").send({ text: "【淘宝】验证码 123456" }).expect(202);
    const r = getLatestCode(store, config, { keyword: "淘宝" });
    expect(r!.code).toBe("123456");
  });

  it("rejects MCP requests without a bearer token", async () => {
    const { app } = setup();
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", method: "ping", id: 1 });
    expect(res.status).toBe(401);
  });

  it("does not 401 an authenticated MCP request", async () => {
    const { app, config } = setup();
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${config.mcpApiKey}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      });
    expect(res.status).not.toBe(401);
  });
});
