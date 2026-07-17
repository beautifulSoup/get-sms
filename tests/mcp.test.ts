import { describe, it, expect, vi, afterEach } from "vitest";
import { getLatestCode, handleGetLatestCode } from "../src/mcp";
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

describe("handleGetLatestCode", () => {
  it("rejects an empty/whitespace keyword without performing a search", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    // Store a message that WOULD match if a search were performed, to prove
    // the empty-keyword path short-circuits before any lookup happens.
    const s = storeWith([{ device: "a", body: "【淘宝】验证码 123456", at: 1_000_000 }]);
    return handleGetLatestCode(s, cfg, { keyword: "   " }).then((result) => {
      expect(result.content[0].text).toMatch(/keyword.*required/i);
      s.close();
    });
  });

  it("returns the no-match message when the keyword has no match", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([{ device: "a", body: "【京东】验证码 4321", at: 1_000_000 }]);
    return handleGetLatestCode(s, cfg, { keyword: "淘宝" }).then((result) => {
      expect(result.content[0].text).toMatch(/No matching verification code/);
      s.close();
    });
  });

  it("extracts the numeric-brand sender's code correctly end-to-end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = storeWith([
      { device: "主力机", body: "【铁路12306】您的验证码是123456", at: 1_000_000 },
    ]);
    return handleGetLatestCode(s, cfg, { keyword: "12306" }).then((result) => {
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBe("123456");
      s.close();
    });
  });
});
