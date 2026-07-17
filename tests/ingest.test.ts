import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createIngestRouter } from "../src/ingest";
import { SQLiteStore } from "../src/db";
import { DEFAULT_CODE_INDICATORS, type Config } from "../src/config";

function appWith() {
  const store = new SQLiteStore(":memory:");
  const config: Config = {
    port: 3000,
    dbPath: ":memory:",
    mcpApiKey: "k",
    devices: [{ label: "主力机", token: "tok-a" }],
    codeIndicators: DEFAULT_CODE_INDICATORS,
    windowMinutes: 10,
  };
  const app = express();
  app.use(express.json());
  app.use("/ingest", createIngestRouter(store, config));
  return { app, store };
}

describe("ingest router", () => {
  it("accepts a valid token and stores the message", async () => {
    const { app, store } = appWith();
    const res = await request(app)
      .post("/ingest/tok-a")
      .send({ text: "【淘宝】验证码 123456", sender: "1069..." });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    const rows = store.queryMessages({ sinceMs: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].device_label).toBe("主力机");
    expect(rows[0].body).toBe("【淘宝】验证码 123456");
    expect(rows[0].sender).toBe("1069...");
  });

  it("rejects an unknown token with 401 and stores nothing", async () => {
    const { app, store } = appWith();
    const res = await request(app).post("/ingest/nope").send({ text: "x" });
    expect(res.status).toBe(401);
    expect(store.queryMessages({ sinceMs: 0 })).toHaveLength(0);
  });

  it("rejects a body without text with 400", async () => {
    const { app } = appWith();
    const res = await request(app).post("/ingest/tok-a").send({ sender: "x" });
    expect(res.status).toBe(400);
  });
});
