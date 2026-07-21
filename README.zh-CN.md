# GetSms

**[English](README.md) | 中文**

> 一个自托管、单用户的服务：收集你自己手机收到的短信，通过一个 MCP 工具 —— `get_latest_code` —— 让你的 AI 智能体按关键词取到验证码。

你运行自己的实例。没有共享或托管服务、没有账号、没有任何多租户。就是你、你的手机、你的服务器。

- **一件事，做好** —— AI 智能体说一句「给我淘宝的验证码」，就能拿到。
- **无需装 App** —— 设备端复用已有工具（目前是 iOS 快捷指令）。
- **小而可审计** —— 一个 Node 进程、SQLite，无遥测、无对外连接。
- **原生 MCP** —— 通过 Streamable HTTP 接入 Claude Code、Cursor 或任意 MCP 客户端。

---

## 目录

- [是什么](#是什么)
- [⚠️ 安全警示](#-安全警示)
- [工作原理](#工作原理)
- [为什么没有 App 要装](#为什么没有-app-要装)
- [快速开始](#快速开始)
- [配置你的手机](#配置你的手机)
- [接入你的智能体](#接入你的智能体)
- [生产部署（HTTPS）](#生产部署https)
- [不用 Docker 运行（systemd）](#不用-docker-运行systemd)
- [配置参考](#配置参考)
- [接口参考](#接口参考)
- [开发](#开发)
- [路线图](#路线图)
- [贡献](#贡献)
- [许可证](#许可证)

## 是什么

GetSms 把你手机转发过来的**每一条短信**持久化地存进本地 SQLite 数据库。它不在写入时判断哪条是验证码 —— 一律原样存下。过滤发生在读取时：你的 MCP 客户端按 `keyword`（短信来源/品牌，如 `淘宝`）请求验证码，GetSms 会去找一条**同时**包含该关键词和验证码提示词的近期短信。

`keyword` 是**刻意设为必填**的。智能体必须知道自己要*哪个*服务的码 —— GetSms 永远不会返回「随便最近的一个验证码」，所以即使 MCP 密钥泄露，也没法被用来把你收到的所有验证码一网打尽。

## ⚠️ 安全警示

**部署前请务必阅读。**

GetSms 会**持久保存你转发给它的每一条短信的明文存档**。这不是读完即忘的短命中转 —— 只要数据库文件还在，它就是你短信历史的永久记录。这让它比「一次性转发一个码」的服务敏感得多：一旦服务器被入侵，攻击者拿到的是你**全部**的短信历史，而不只是一个验证码。

- 只在你信任并掌控的机器上运行（你自己的服务器、VPS、家用主机）—— 不要放在共享或不可信的基础设施上。
- **GetSms 自身不做 TLS。** 对外暴露前，请用反向代理（Caddy、nginx、Traefik 等）配上真实证书，或者把它限制在私有网络 / VPN 内。见[生产部署](#生产部署https)。
- 保护好 SQLite 数据库文件（`GETSMS_DB_PATH`）—— 收紧文件权限，别把它备份到比服务器本身更不可信的地方。
- **它不是端到端加密的。** 服务端必然看到每条短信明文 —— 因为要抽取验证码、要存历史。除了「别让服务器被攻破」之外，没有其他手段能防住一台被入侵的服务器。

如果这个取舍不符合你的威胁模型，就别部署 GetSms。

## 工作原理

```
[某台手机]                       [你的服务器,单进程]              [你的智能体]
收到验证码短信                                                    需要验证码
   │                                                                    │
   │ 手机自动化(iOS 快捷指令)                                            │ MCP: get_latest_code
   │ POST /ingest/{设备 token}                                          │ (keyword 必填)
   ▼                                                                    ▼
 ┌──────────────────┐  原样存储,标记设备          ┌──────────────┐  查询  ┌──────────────┐
 │ Ingest HTTP 接口 │ ──────────────────────────▶│ SQLite 存储   │◀────── │  MCP Server  │
 │ /ingest/:token   │                             │ 全量存档      │        │              │
 └──────────────────┘                             └──────────────┘        └──────────────┘
```

进来的短信原样写入 SQLite —— 写入时不做任何过滤。所有匹配（关键词、验证码识别、时间窗）都发生在 MCP 工具被调用时。HTTP ingest 接口和 MCP 服务跑在同一个 Node 进程里。

## 为什么没有 App 要装

**这是刻意的。** iOS 根本不给第三方 App 读取短信的 API，所以任何 App —— 无论是 GetSms 的还是别人的 —— 都做不到。iOS 上唯一面向普通用户的路径是苹果自带的**快捷指令**自动化：它能监听收到的消息并把内容 POST 到某处。这就是 GetSms v1 设备端用的方式：见 [`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md)。

Android 支持（通过能在用户授权下读短信的 SmsForwarder 或 Tasker）在路线图上，但尚未实现。

## 快速开始

需要 Docker，或 Node.js >= 20（见[不用 Docker 运行](#不用-docker-运行systemd)）。

1. 复制示例环境变量文件：
   ```bash
   cp .env.example .env
   ```
2. 生成一个随机 MCP API key，以及每台要转发的手机各一个随机 token：
   ```bash
   openssl rand -hex 16   # 每个密钥跑一次
   ```
   把 API key 填进 `GETSMS_MCP_API_KEY`，每台设备一个 token 填进 `GETSMS_DEVICES`（见[配置参考](#配置参考)）。
3. 启动：
   ```bash
   docker compose up -d
   ```

服务监听 `GETSMS_PORT`（默认 `3000`），由 `docker-compose.yml` 映射到宿主机 `3000`。**对外暴露前请在前面加一个终止 TLS 的反向代理** —— 见下文。

## 配置你的手机

设备端（iOS）配置是一个快捷指令自动化，不是装 App。按 [`docs/setup-ios-shortcut.md`](docs/setup-ios-shortcut.md) 的逐步图文操作，包括必需的触发器配置，以及一个在依赖它做时间敏感的事之前你应该先读的**可靠性提醒**。

## 接入你的智能体

用 **Streamable HTTP** 传输，把你的 MCP 客户端指向服务器的 `/mcp`，带上 bearer 请求头：

```
https://你的服务器/mcp
Authorization: Bearer <GETSMS_MCP_API_KEY>
```

以 Claude Code 为例：

```bash
claude mcp add --transport http getsms https://你的服务器/mcp \
  --header "Authorization: Bearer <GETSMS_MCP_API_KEY>"
```

服务只暴露一个工具 `get_latest_code`：

```ts
get_latest_code({ keyword, device?, since? })
```

- `keyword` —— **必填**。短信来源/品牌：中文 `【】` 签名（如 `淘宝`、`京东`、`12306`）或英文服务名。不传则返回空。
- `device` —— 可选，按设备的 `label`（来自 `GETSMS_DEVICES`）过滤。
- `since` —— 可选 ISO 时间戳；覆盖默认的近期时间窗（`GETSMS_WINDOW_MINUTES`）。

一条短信匹配的条件：body 同时包含 `keyword` **和**某个配置的验证码提示词，且在时间窗内收到。工具返回抽出的验证码（如果能抽到）、原文、设备标签和接收时间。注意：这里的「接收」时间戳和时间窗都是从**服务器**摄入这条转发消息时算的，不是手机实际收到的时间 —— 转发自动化的任何延迟都会计入时间窗。

## 生产部署（HTTPS）

GetSms 在 `GETSMS_PORT` 上跑纯 HTTP。用反向代理终止 TLS。[Caddy](https://caddyserver.com) 最省事 —— 自动签发 Let's Encrypt 证书：

```caddyfile
# /etc/caddy/Caddyfile
sms.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

整个配置就这些 —— Caddy 自动获取并续期证书（需要 80 和 443 端口可达）。然后防火墙只放行 443（和 22），把 `3000` 绑在 localhost。

<details>
<summary>nginx 等价配置</summary>

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

如果你的服务器不能用标准的 80/443 端口，把代理跑在任意高端口（如 `8443`），并在给手机和智能体的 URL 里带上它 —— 通过 DNS-01 ACME 挑战一样能拿到真实证书。

## 不用 Docker 运行（systemd）

GetSms 是通过 `tsx` 运行的纯 ESM TypeScript —— 无需构建步骤。直接用 systemd 跑：

```bash
# 在服务器上,用一个非 root 用户(如 "getsms")
git clone <你的-fork> /opt/getsms && cd /opt/getsms
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

## 配置参考

所有配置通过环境变量（见 `.env.example`）。

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `GETSMS_MCP_API_KEY` | 是 | — | MCP 客户端调用 `/mcp` 必须出示的 Bearer token。 |
| `GETSMS_DEVICES` | 是 | — | JSON 数组 `{"label": "...", "token": "..."}`。每项一台手机：`label` 用于在结果里标识它，`token` 是用在 `/ingest/:token` URL 里的每设备摄入密钥。 |
| `GETSMS_PORT` | 否 | `3000` | 服务监听端口。 |
| `GETSMS_DB_PATH` | 否 | `./data/getsms.db` | SQLite 数据库文件路径。 |
| `GETSMS_WINDOW_MINUTES` | 否 | `10` | `get_latest_code` 的默认回看时间窗（分钟），可用 `since` 按次覆盖。从服务器摄入时间算起，非手机实际接收时间。 |
| `GETSMS_CODE_INDICATORS` | 否 | `验证码,verification code,verification,code,OTP,one-time,passcode` | 逗号分隔的提示词列表，用于判定一条短信含验证码。 |

## 接口参考

- `POST /ingest/:token` —— 手机自动化 POST 到的 webhook。Body：`{ "text": "<短信正文>", "sender"?: "..." }`。成功返回 `202`，未知 token 返回 `401`，`text` 缺失/为空返回 `400`。
- `POST /mcp` —— MCP Streamable HTTP 端点，需要 `Authorization: Bearer <GETSMS_MCP_API_KEY>`。`GET`/`DELETE` 返回 `405`。

## 开发

```bash
npm install
npm test          # Vitest 测试(npm run test:watch 为监听模式)
npm run dev       # tsx watch,热重载
npm run typecheck # tsc --noEmit
```

无需构建步骤 —— 纯 ESM TypeScript 通过 `tsx` 直接执行。需要 Node.js >= 20。测试覆盖配置解析、SQLite 存储、验证码抽取/匹配、ingest webhook、MCP 工具逻辑和一条端到端路径。

## 路线图

- **Android 设备端** —— SmsForwarder / Tasker 的配置指南（服务端已与设备无关）。
- **可选的通用短信查询工具** —— 读取非验证码短信，默认关闭。
- **可插拔存储** —— 在现有存储接口后接 Redis/Postgres，支持多实例部署。

## 贡献

欢迎 Issue 和 PR。请：

- 保持单用户、自托管、无遥测的设计。
- 遵循现有的 TDD 风格 —— 代码与测试一起加/改；`npm test` 和 `npm run typecheck` 必须通过。
- 保持每个源文件职责单一（见 `src/` —— 配置、存储、匹配、ingest、MCP、装配各自分开）。

## 许可证

MIT —— 见 [`LICENSE`](LICENSE)。
