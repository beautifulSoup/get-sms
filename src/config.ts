export interface DeviceConfig {
  label: string;
  token: string;
}

export interface Config {
  port: number;
  dbPath: string;
  mcpApiKey: string;
  devices: DeviceConfig[];
  codeIndicators: string[];
  windowMinutes: number;
}

export const DEFAULT_CODE_INDICATORS: string[] = [
  "验证码",
  "verification code",
  "verification",
  "code",
  "OTP",
  "one-time",
  "passcode",
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mcpApiKey = env.GETSMS_MCP_API_KEY;
  if (!mcpApiKey) {
    throw new Error("GETSMS_MCP_API_KEY is required");
  }

  const rawDevices = env.GETSMS_DEVICES;
  if (!rawDevices) {
    throw new Error("GETSMS_DEVICES is required (JSON array of {label, token})");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDevices);
  } catch {
    throw new Error("GETSMS_DEVICES must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("GETSMS_DEVICES must be a non-empty JSON array");
  }
  const devices: DeviceConfig[] = parsed.map((d) => {
    if (!d || typeof d.label !== "string" || typeof d.token !== "string") {
      throw new Error("each GETSMS_DEVICES entry must have string label and token");
    }
    return { label: d.label, token: d.token };
  });

  const indicators = env.GETSMS_CODE_INDICATORS
    ? env.GETSMS_CODE_INDICATORS.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CODE_INDICATORS;

  return {
    port: env.GETSMS_PORT ? Number(env.GETSMS_PORT) : 3000,
    dbPath: env.GETSMS_DB_PATH ?? "./data/getsms.db",
    mcpApiKey,
    devices,
    codeIndicators: indicators,
    windowMinutes: env.GETSMS_WINDOW_MINUTES ? Number(env.GETSMS_WINDOW_MINUTES) : 10,
  };
}
