import { describe, it, expect } from "vitest";
import { SQLiteStore } from "../src/db";

function make() {
  return new SQLiteStore(":memory:");
}

describe("SQLiteStore", () => {
  it("inserts and returns an id", () => {
    const s = make();
    const id = s.insertMessage({
      device_label: "主力机",
      body: "【淘宝】验证码 123456",
      received_at: 1000,
      ingested_at: 1000,
    });
    expect(id).toBeGreaterThan(0);
    s.close();
  });

  it("queries by time window, newest first", () => {
    const s = make();
    s.insertMessage({ device_label: "a", body: "old", received_at: 100, ingested_at: 100 });
    s.insertMessage({ device_label: "a", body: "new", received_at: 300, ingested_at: 300 });
    const rows = s.queryMessages({ sinceMs: 200 });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("new");
    expect(rows[0].sender).toBeNull();
    s.close();
  });

  it("filters by device", () => {
    const s = make();
    s.insertMessage({ device_label: "a", body: "x", received_at: 500, ingested_at: 500 });
    s.insertMessage({ device_label: "b", body: "y", received_at: 500, ingested_at: 500 });
    const rows = s.queryMessages({ sinceMs: 0, device: "b" });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("y");
    s.close();
  });

  it("persists across reopen", () => {
    const path = `/tmp/getsms-test-${process.pid}.db`;
    const s1 = new SQLiteStore(path);
    s1.insertMessage({ device_label: "a", body: "kept", received_at: 1, ingested_at: 1 });
    s1.close();
    const s2 = new SQLiteStore(path);
    const rows = s2.queryMessages({ sinceMs: 0 });
    expect(rows.map((r) => r.body)).toContain("kept");
    s2.close();
  });
});
