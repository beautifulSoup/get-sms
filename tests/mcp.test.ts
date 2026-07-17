import { describe, it, expect, vi, afterEach } from "vitest";
import { getLatestCode } from "../src/mcp";
import { SQLiteStore } from "../src/db";
import { DEFAULT_CODE_INDICATORS, type Config } from "../src/config";

const cfg: Config = {
  port: 3000,
  dbPath: ":memory:",
  mcpApiKey: "k",
  devices: [],
  codeIndicators: DEFAULT_CODE_INDICATORS,
  windowMinutes: 10,
};

afterEach(() => vi.useRealTimers());

function storeWith(msgs: { device: string; body: string; at: number }[]) {
  const s = new SQLiteStore(":memory:");
  for (const m of msgs) {
    s.insertMessage({ device_label: m.device, body: m.body, received_at: m.at, ingested_at: m.at });
  }
  return s;
}

describe("getLatestCode", () => {
  it("returns the code for a matching keyword within the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "主力机", body: "【淘宝】验证码 123456", at: 1_000_000 - 60_000 },
    ]);
    const r = getLatestCode(s, cfg, { keyword: "淘宝" });
    expect(r).not.toBeNull();
    expect(r!.code).toBe("123456");
    expect(r!.deviceLabel).toBe("主力机");
    s.close();
  });

  it("ignores messages older than the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "a", body: "【淘宝】验证码 123456", at: 1_000_000 - 20 * 60_000 },
    ]);
    expect(getLatestCode(s, cfg, { keyword: "淘宝" })).toBeNull();
    s.close();
  });

  it("does not match a message lacking a code indicator", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([{ device: "a", body: "【淘宝】您的快递已签收", at: 1_000_000 }]);
    expect(getLatestCode(s, cfg, { keyword: "淘宝" })).toBeNull();
    s.close();
  });

  it("does not match a code message with a different keyword", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([{ device: "a", body: "【京东】验证码 4321", at: 1_000_000 }]);
    expect(getLatestCode(s, cfg, { keyword: "淘宝" })).toBeNull();
    s.close();
  });

  it("returns the newest match when several qualify", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "a", body: "【淘宝】验证码 111111", at: 1_000_000 - 120_000 },
      { device: "a", body: "【淘宝】验证码 222222", at: 1_000_000 - 30_000 },
    ]);
    expect(getLatestCode(s, cfg, { keyword: "淘宝" })!.code).toBe("222222");
    s.close();
  });

  it("honors an explicit `since` overriding the default window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "a", body: "【淘宝】验证码 123456", at: 1_000_000 - 30 * 60_000 },
    ]);
    const since = new Date(1_000_000 - 60 * 60_000).toISOString();
    expect(getLatestCode(s, cfg, { keyword: "淘宝", since })!.code).toBe("123456");
    s.close();
  });

  it("filters by device", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "work", body: "【淘宝】验证码 123456", at: 1_000_000 },
      { device: "main", body: "【淘宝】验证码 999999", at: 1_000_000 },
    ]);
    expect(getLatestCode(s, cfg, { keyword: "淘宝", device: "main" })!.code).toBe("999999");
    s.close();
  });
});
