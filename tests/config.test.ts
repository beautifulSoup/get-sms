import { describe, it, expect } from "vitest";
import { loadConfig, DEFAULT_CODE_INDICATORS } from "../src/config";

const base = {
  GETSMS_MCP_API_KEY: "secret-key",
  GETSMS_DEVICES: '[{"label":"主力机","token":"tok-a"},{"label":"work","token":"tok-b"}]',
};

describe("loadConfig", () => {
  it("parses required fields and applies defaults", () => {
    const c = loadConfig(base);
    expect(c.mcpApiKey).toBe("secret-key");
    expect(c.devices).toHaveLength(2);
    expect(c.devices[0]).toEqual({ label: "主力机", token: "tok-a" });
    expect(c.port).toBe(3000);
    expect(c.dbPath).toBe("./data/getsms.db");
    expect(c.windowMinutes).toBe(10);
    expect(c.codeIndicators).toEqual(DEFAULT_CODE_INDICATORS);
  });

  it("overrides defaults from env", () => {
    const c = loadConfig({
      ...base,
      GETSMS_PORT: "8080",
      GETSMS_DB_PATH: "/tmp/x.db",
      GETSMS_WINDOW_MINUTES: "5",
      GETSMS_CODE_INDICATORS: "验证码, code ",
    });
    expect(c.port).toBe(8080);
    expect(c.dbPath).toBe("/tmp/x.db");
    expect(c.windowMinutes).toBe(5);
    expect(c.codeIndicators).toEqual(["验证码", "code"]);
  });

  it("throws when MCP api key missing", () => {
    expect(() => loadConfig({ GETSMS_DEVICES: base.GETSMS_DEVICES })).toThrow(/GETSMS_MCP_API_KEY/);
  });

  it("throws when devices missing or empty", () => {
    expect(() => loadConfig({ GETSMS_MCP_API_KEY: "k" })).toThrow(/GETSMS_DEVICES/);
    expect(() => loadConfig({ GETSMS_MCP_API_KEY: "k", GETSMS_DEVICES: "[]" })).toThrow(/GETSMS_DEVICES/);
  });

  it("throws when a device is missing label or token", () => {
    expect(() =>
      loadConfig({ GETSMS_MCP_API_KEY: "k", GETSMS_DEVICES: '[{"label":"x"}]' })
    ).toThrow(/label and token/);
  });

  it("throws when GETSMS_PORT is not a finite number", () => {
    expect(() => loadConfig({ ...base, GETSMS_PORT: "abc" })).toThrow(/GETSMS_PORT/);
  });

  it("throws when GETSMS_WINDOW_MINUTES is not a finite number", () => {
    expect(() => loadConfig({ ...base, GETSMS_WINDOW_MINUTES: "abc" })).toThrow(/GETSMS_WINDOW_MINUTES/);
  });
});
