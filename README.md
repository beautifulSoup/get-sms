# GetSms

> A self-hosted, single-user service that collects the SMS your own phones receive and exposes one MCP tool — `get_latest_code` — so your AI agent can fetch a verification code by keyword.

You run your own instance. There is no shared or hosted service, no accounts, and no multi-tenant anything. It's you, your phones, your server.

- **One job, done well** — an AI agent asks "give me the 淘宝 code" and gets it.
- **No app to install** — the device side reuses tools that already exist (iOS Shortcuts today).
- **Tiny & auditable** — one Node process, SQLite, no telemetry, no outbound calls.
- **MCP-native** — plug it into Claude Code, Cursor, or any MCP client over Streamable HTTP.

---

## Contents

- [What it is](#what-it-is)
- [⚠️ Security warning](#-security-warning)
- [How it works](#how-it-works)
- [Why there's no app to install](#why-theres-no-app-to-install)
- [Quick start](#quick-start)
- [Configure your phone](#configure-your-phone)
- [Connect your agent](#connect-your-agent)
- [Production deployment (HTTPS)](#production-deployment-https)
- [Run without Docker (systemd)](#run-without-docker-systemd)
- [Config reference](#config-reference)
- [API reference](#api-reference)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## What it is

GetSms stores **every SMS message** your phones forward to it, persistently, in a local SQLite database. It does not try to guess which messages are verification codes at write time — everything is stored as-is. Filtering happens at read time: your MCP client asks for a code by `keyword` (the sender/brand, e.g. `淘宝`), and GetSms looks for a recent message that contains both that keyword and a verification-code phrase.

The `keyword` is required by design. An agent must know *which* service's code it wants — GetSms will never hand back "the latest code from anywhere," so a leaked MCP key can't be used to vacuum up every code you receive.

## ⚠️ Security warning

**Read this before you deploy.**

GetSms keeps a **persistent, plaintext archive of every SMS message you forward to it.** This is not a short-lived relay that forgets messages after they're read — it is a permanent log of your SMS history for as long as the database file exists. That makes it meaningfully more sensitive than a one-shot code-forwarding service: if the server is compromised, an attacker gets your entire SMS history, not just one code.

- Run it only on a machine you trust and control (your own server, your own VPS, your own home box) — not on shared or untrusted infrastructure.
- **GetSms does not do TLS itself.** Put it behind a reverse proxy (Caddy, nginx, Traefik, etc.) with a real certificate before exposing it to the internet, or restrict it to a private network / VPN. See [Production deployment](#production-deployment-https).
- Keep the SQLite database file (`GETSMS_DB_PATH`) private — restrict its file permissions and don't back it up to somewhere less trusted than the server itself.
- **This is not end-to-end encrypted.** The server sees every message body in plaintext, because it has to, in order to extract codes and store your history. There is no protection against a compromised server other than not compromising it.

If this trade-off doesn't work for your threat model, don't deploy GetSms.

## How it works

```
[a phone]                       [your server, one process]        [your agent]
receives a code SMS                                                needs a code
   │                                                                    │
   │ phone automation (iOS Shortcuts)                                   │ MCP: get_latest_code
   │ POST /ingest/{device token}                                        │ (keyword required)
   ▼                                                                    ▼
 ┌──────────────────┐  store as-is, tag device   ┌──────────────┐  query  ┌──────────────┐
 │ Ingest HTTP API  │ ──────────────────────────▶│ SQLite store  │◀────── │  MCP Server  │
 │ /ingest/:token   │                             │ full archive  │        │              │
 └──────────────────┘                             └──────────────┘        └──────────────┘
```

Incoming SMS are written to SQLite unmodified — no filtering happens at ingest time. All matching (keyword, verification-code detection, time window) happens when the MCP tool is called. Both the HTTP ingest API and the MCP server run in a single Node process.

## Why there's no app to install

**On purpose.** iOS gives third-party apps no API to read SMS at all, so no app — GetSms's or anyone else's — can do it. The only consumer-available path on iOS is Apple's own **Shortcuts** automation, which can watch for incoming messages and POST them somewhere. That's what GetSms's device side uses for v1: see [`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md).

Android support (via SmsForwarder or Tasker, which can read SMS with user consent) is on the roadmap but not implemented yet.

## Quick start

Requires Docker, or Node.js >= 20 (see [Run without Docker](#run-without-docker-systemd)).

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Generate a random MCP API key and a random token for each phone you plan to forward from:
   ```bash
   openssl rand -hex 16   # run once per secret
   ```
   Put the API key in `GETSMS_MCP_API_KEY` and one token per device into `GETSMS_DEVICES` (see [Config reference](#config-reference)).
3. Start it:
   ```bash
   docker compose up -d
   ```

The server listens on `GETSMS_PORT` (default `3000`), mapped to `3000` on the host by `docker-compose.yml`. **Put a TLS-terminating reverse proxy in front of it before exposing it publicly** — see below.

## Configure your phone

Device-side setup (iOS) is a Shortcuts automation, not an app install. Follow [`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md) for exact, numbered steps, including the required trigger configuration and a reliability caveat you should read before relying on this for anything time-sensitive.

## Connect your agent

Point your MCP client at your server's `/mcp` endpoint using **Streamable HTTP** transport, with a bearer header:

```
https://YOUR_SERVER/mcp
Authorization: Bearer <GETSMS_MCP_API_KEY>
```

For example, with Claude Code:

```bash
claude mcp add --transport http getsms https://YOUR_SERVER/mcp \
  --header "Authorization: Bearer <GETSMS_MCP_API_KEY>"
```

The server exposes exactly one tool, `get_latest_code`:

```ts
get_latest_code({ keyword, device?, since? })
```

- `keyword` — **required**. The SMS source/brand: the Chinese `【】` signature (e.g. `淘宝`, `京东`, `12306`) or an English service name. Omitting it returns nothing.
- `device` — optional, filters to one device's `label` (from `GETSMS_DEVICES`).
- `since` — optional ISO timestamp; overrides the default recent-message time window (`GETSMS_WINDOW_MINUTES`).

A message matches when its body contains `keyword` **and** contains one of the configured verification-code indicator terms, and was received within the time window. The tool returns the extracted code (if one could be found), the raw message body, the device label, and the received timestamp. Note: the "received" timestamp and the time window are both measured from when the **server** ingests the forwarded message, not the phone's actual receipt time — any delay in the forwarding automation counts against the window.

## Production deployment (HTTPS)

GetSms speaks plain HTTP on `GETSMS_PORT`. Terminate TLS with a reverse proxy. [Caddy](https://caddyserver.com) is the least-effort option — automatic Let's Encrypt certificates:

```caddyfile
# /etc/caddy/Caddyfile
sms.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

That's the whole config — Caddy obtains and renews the certificate automatically (ports 80 and 443 must be reachable). Then only expose 443 (and 22) at your firewall; keep `3000` bound to localhost.

<details>
<summary>nginx equivalent</summary>

```nginx
server {
    listen 443 ssl;
    server_name sms.example.com;
    ssl_certificate     /etc/letsencrypt/live/sms.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sms.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```
</details>

If your server can't use standard ports 80/443, run the proxy on any high port (e.g. `8443`) and include it in the URLs you give your phone and agent — a real certificate can still be obtained via a DNS-01 ACME challenge.

## Run without Docker (systemd)

GetSms is plain ESM TypeScript run via `tsx` — no build step. To run it directly under systemd:

```bash
# on the server, as a non-root user (e.g. "getsms")
git clone <your-fork> /opt/getsms && cd /opt/getsms
npm ci --omit=dev
cp .env.example .env && $EDITOR .env
```

```ini
# /etc/systemd/system/getsms.service
[Unit]
Description=GetSms
After=network.target

[Service]
Type=simple
User=getsms
WorkingDirectory=/opt/getsms
EnvironmentFile=/opt/getsms/.env
ExecStart=/usr/bin/node /opt/getsms/node_modules/tsx/dist/cli.mjs src/index.ts
Restart=always
MemoryMax=400M
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now getsms
```

## Config reference

All configuration is via environment variables (see `.env.example`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `GETSMS_MCP_API_KEY` | yes | — | Bearer token your MCP client must present to call `/mcp`. |
| `GETSMS_DEVICES` | yes | — | JSON array of `{"label": "...", "token": "..."}`. Each entry is one phone: `label` identifies it in results, `token` is the per-device ingest secret used in the `/ingest/:token` URL. |
| `GETSMS_PORT` | no | `3000` | Port the server listens on. |
| `GETSMS_DB_PATH` | no | `./data/getsms.db` | Path to the SQLite database file. |
| `GETSMS_WINDOW_MINUTES` | no | `10` | Default lookback window (minutes) for `get_latest_code`, overridable per-call via `since`. Measured from server ingest time, not the phone's actual receipt time. |
| `GETSMS_CODE_INDICATORS` | no | `验证码,verification code,verification,code,OTP,one-time,passcode` | Comma-separated list of terms that mark a message as containing a verification code. |

## API reference

- `POST /ingest/:token` — webhook the phone automation posts to. Body: `{ "text": "<sms body>", "sender"?: "..." }`. Returns `202` on success, `401` for an unknown token, `400` if `text` is missing/empty.
- `POST /mcp` — MCP Streamable HTTP endpoint, requires `Authorization: Bearer <GETSMS_MCP_API_KEY>`. `GET`/`DELETE` return `405`.

## Development

```bash
npm install
npm test          # Vitest suite (npm run test:watch for watch mode)
npm run dev       # tsx watch, live reload
npm run typecheck # tsc --noEmit
```

No build step is required — plain ESM TypeScript executed directly via `tsx`. Requires Node.js >= 20. The test suite covers config parsing, the SQLite store, code extraction/matching, the ingest webhook, the MCP tool logic, and an end-to-end path.

## Roadmap

- **Android device side** — setup guide for SmsForwarder / Tasker (the server side is already device-agnostic).
- **Optional generic SMS query tool** — read non-code messages, off by default.
- **Pluggable storage** — Redis/Postgres backend behind the existing store interface for multi-instance setups.

## Contributing

Issues and PRs welcome. Please:

- Keep the single-user, self-hosted, no-telemetry design intact.
- Follow the existing TDD style — add/adjust tests alongside code; `npm test` and `npm run typecheck` must pass.
- Keep each source file focused (see `src/` — config, storage, matching, ingest, MCP, wiring are separate).

## License

MIT — see [`LICENSE`](LICENSE).
