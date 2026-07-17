import { describe, it, expect } from "vitest";
import { matchesKeyword, hasCodeIndicator, extractCode } from "../src/codes";

describe("matchesKeyword", () => {
  it("matches the 【签名】 signature", () => {
    expect(matchesKeyword("【淘宝】您的验证码是123456", "淘宝")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(matchesKeyword("Your Google code is 55321", "google")).toBe(true);
  });
  it("returns false when absent", () => {
    expect(matchesKeyword("【京东】验证码 9988", "淘宝")).toBe(false);
  });
});

describe("hasCodeIndicator", () => {
  const ind = ["验证码", "verification code", "code", "OTP"];
  it("detects Chinese indicator", () => {
    expect(hasCodeIndicator("【淘宝】您的验证码是123456", ind)).toBe(true);
  });
  it("detects English indicator case-insensitively", () => {
    expect(hasCodeIndicator("Your verification CODE is 4321", ind)).toBe(true);
  });
  it("returns false for a non-code message", () => {
    expect(hasCodeIndicator("【顺丰】您的快递已签收", ind)).toBe(false);
  });
});

describe("extractCode", () => {
  it("extracts a 6-digit code from Chinese SMS", () => {
    expect(extractCode("【淘宝】您的验证码是123456，请勿泄露")).toBe("123456");
  });
  it("extracts a 4-digit code", () => {
    expect(extractCode("code: 4321")).toBe("4321");
  });
  it("does not pick a digit run longer than 8", () => {
    expect(extractCode("订单号1234567890123 验证码 5678")).toBe("5678");
  });
  it("returns null when no code present", () => {
    expect(extractCode("【顺丰】您的快递已签收")).toBeNull();
  });
});
