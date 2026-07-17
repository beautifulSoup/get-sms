# GetSms

A self-hosted, single-user service that collects the SMS your own phones
receive and exposes one MCP tool — `get_latest_code` — so your AI agent can
fetch a verification code by keyword.

You run your own instance. There is no shared or hosted service, no
accounts, and no multi-tenant anything. It's you, your phones, your server.

## What it is

GetSms stores **every SMS message** your phones forward to it, persistently,
in a local SQLite database. It does not try to guess which messages are
verification codes at write time — everything is stored as-is. Filtering
happens at read time: your MCP client asks for a code by `keyword` (the
sender/brand, e.g. `淘宝`), and GetSms looks for a recent message that
contains both that keyword and a verification-code phrase.

## ⚠️ Security warning

**Read this before you deploy.**

GetSms keeps a **persistent, plaintext archive of every SMS message you
forward to it.** This is not a short-lived relay that forgets messages after
they're read — it is a permanent log of your SMS history for as long as the
database file exists. That makes it meaningfully more sensitive than a
one-shot code-forwarding service: if the server is compromised, an attacker
gets your entire SMS history, not just one code.

- Run it only on a machine you trust and control (your own server, your own
  VPS, your own home box) — not on shared or untrusted infrastructure.
- **GetSms does not do TLS itself.** Put it behind a reverse proxy (nginx,
  Caddy, Traefik, etc.) with a real certificate before exposing it to the
  internet, or restrict it to a private network / VPN.
- Keep the SQLite database file (`GETSMS_DB_PATH`) private — restrict its
  file permissions and don't back it up to somewhere less trusted than the
  server itself.
- **This is not end-to-end encrypted.** The server sees every message body
  in plaintext, because it has to, in order to extract codes and store your
  history. There is no protection against a compromised server other than
  not compromising it.

If this trade-off doesn't work for your threat model, don't deploy GetSms.

## How it works

```
[a phone]                       [your server, one process]        [your agent]
receives a code SMS                                                needs a code
   │                                                                    │
   │ phone automation (iOS Shortcuts)                                  │ MCP: get_latest_code
   │ POST /ingest/{device token}                                       │ (keyword required)
   ▼                                                                    ▼
 ┌──────────────────┐  store as-is, tag device   ┌──────────────┐  query  ┌──────────────┐
 │ Ingest HTTP API  │ ──────────────────────────▶│ SQLite store  │◀────── │  MCP Server  │
 │ /ingest/:token   │                             │ full archive  │        │              │
 └──────────────────┘                             └──────────────┘        └──────────────┘
```

Incoming SMS are written to SQLite unmodified — no filtering happens at
ingest time. All matching (keyword, verification-code detection, time
window) happens when the MCP tool is called.

## Platform note

**There is no app to install, on purpose.** iOS gives third-party apps no
API to read SMS at all, so no app — GetSms's or anyone else's — can do it.
The only consumer-available path on iOS is Apple's own **Shortcuts**
automation, which can watch for incoming messages and POST them somewhere.
That's what GetSms's device side uses for v1: see
[`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md).

Android support (via SmsForwarder or Tasker, which can read SMS with user
consent) is on the roadmap for v2 but not implemented yet.

## Quick start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Generate a random MCP API key and a random token for each phone you plan
   to forward from:
   ```bash
   openssl rand -hex 16
   ```
   Put the API key in `GETSMS_MCP_API_KEY` and one token per device into
   `GETSMS_DEVICES` (see [Config reference](#config-reference) below).
3. Start it:
   ```bash
   docker compose up -d
   ```

The server listens on the port set by `GETSMS_PORT` (default `3000`) inside
the container, mapped to `3000` on the host by `docker-compose.yml`. Put a
TLS-terminating reverse proxy in front of it before exposing it publicly —
see the security warning above.

## Configure your phone

Device-side setup (iOS) is a Shortcuts automation, not an app install. Follow
[`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md) for exact,
numbered steps, including the required trigger configuration and a
reliability caveat you should read before relying on this for anything
time-sensitive.

## Connect your agent

Point your MCP client at:

```
https://YOUR_SERVER/mcp
```

using Streamable HTTP transport, with header:

```
Authorization: Bearer <GETSMS_MCP_API_KEY>
```

The server exposes exactly one tool, `get_latest_code`:

```ts
get_latest_code({ keyword, device?, since? })
```

- `keyword` — **required**. The SMS source/brand: the Chinese `【】`
  signature (e.g. `淘宝`, `京东`, `12306`) or an English service name.
  Omitting it returns nothing — GetSms will not hand back "the latest code
  from anywhere."
- `device` — optional, filters to one device's `label` (from
  `GETSMS_DEVICES`).
- `since` — optional ISO timestamp; overrides the default recent-message
  time window (`GETSMS_WINDOW_MINUTES`).

A message matches when its body contains `keyword` **and** contains one of
the configured verification-code indicator terms, and was received within
the time window. The tool returns the extracted code (if one could be
found), the raw message body, the device label, and the received timestamp.

## Config reference

All configuration is via environment variables (see `.env.example`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `GETSMS_MCP_API_KEY` | yes | — | Bearer token your MCP client must present to call `/mcp`. |
| `GETSMS_DEVICES` | yes | — | JSON array of `{"label": "...", "token": "..."}`. Each entry is one phone: `label` identifies it in results, `token` is the per-device ingest secret used in the `/ingest/:token` URL. |
| `GETSMS_PORT` | no | `3000` | Port the server listens on. |
| `GETSMS_DB_PATH` | no | `./data/getsms.db` | Path to the SQLite database file. |
| `GETSMS_WINDOW_MINUTES` | no | `10` | Default lookback window (minutes) for `get_latest_code`, overridable per-call via `since`. |
| `GETSMS_CODE_INDICATORS` | no | `验证码,verification code,verification,code,OTP,one-time,passcode` | Comma-separated list of terms that mark a message as containing a verification code. |

## Development

```bash
npm install
npm test
npm run dev
```

- `npm test` runs the Vitest suite (`npm run test:watch` for watch mode).
- `npm run dev` runs the server with `tsx watch` for live reload.
- `npm run typecheck` runs `tsc --noEmit`.

No build step is required to run GetSms — it's plain ESM TypeScript executed
directly via `tsx`. Requires Node.js >= 20.

## Endpoints (reference)

- `POST /ingest/:token` — webhook the phone automation posts to. Body:
  `{ "text": "<sms body>", "sender"?: "..." }`. Returns `202` on success,
  `401` for an unknown token, `400` if `text` is missing/empty.
- `POST /mcp` — MCP Streamable HTTP endpoint, requires
  `Authorization: Bearer <GETSMS_MCP_API_KEY>`.

## License

MIT — see [`LICENSE`](LICENSE).
