# 外部服务调用发信 API

日期：2026-08-29

用于其他服务（如 license 发放）以某个邮箱身份发邮件。鉴权走 Cloudflare Access 服务令牌，不需要改 Worker 配置。

## 鉴权

1. Zero Trust → Access → Service Auth → Service Tokens → 创建令牌，记下 Client ID / Client Secret
2. Zero Trust → Access → Applications → 找到 Worker 对应的应用 → Policies → 新建策略：**Action = Service Auth**，Include = Service Token = 上一步的令牌（动作选 Allow 不会生效）
3. 每个请求带两个头：

```
CF-Access-Client-Id: <CLIENT_ID>
CF-Access-Client-Secret: <CLIENT_SECRET>
```

令牌过了 Access 后拥有和登录用户相同的权限（可以读写所有邮箱和 CRM），请只放在服务端环境变量里；泄露后在 Service Tokens 页面 Roll 轮换。

## 发信

```
POST https://<worker 域名>/api/v1/mailboxes/{邮箱}/emails?wait=1
Content-Type: application/json
```

```json
{
  "to": "customer@gmail.com",
  "from": { "email": "support@timelinevisualizer.net", "name": "Timeline Visualizer" },
  "subject": "Your Timeline Visualizer Pro license key",
  "html": "<p>Hi …</p>",
  "text": "Hi …"
}
```

| 字段 | 说明 |
|---|---|
| `to` | 字符串或数组 |
| `from` | 必须等于 URL 里的邮箱；字符串或 `{ email, name }` |
| `subject` | 必填 |
| `html` / `text` | 至少一个 |
| `cc` / `bcc` | 可选，字符串或数组 |
| `attachments` | 可选，`[{ content: base64, filename, type, disposition: "attachment" }]`，总大小受 Cloudflare 5 MiB 单封限制 |
| `in_reply_to` / `references` / `thread_id` | 可选，回复已有线程时用 |

### 两种模式

**`?wait=1`（推荐给关键邮件）**：等 Cloudflare Email Service 接受后再返回。

- `200 { "id": "...", "messageId": "...", "status": "accepted" }` — Cloudflare 已接受，进入投递
- `502 { "id": "...", "status": "failed", "error": "..." }` — 未被接受（地址无效、域名未验证、超配额等），Sent 记录已回滚，可安全重试
- `400` 参数错误 / `403` 鉴权失败

**不带 `wait`**：立即返回 `202 { "id", "status": "sent" }`，投递在后台进行，失败只记日志。适合非关键通知。

`accepted` 表示 Cloudflare 已接受，不等于收件人已收到；退信等最终状态需要接入 Email Service 事件订阅（未实现，见 `docs/crm-design.md` 二期）。

### 副作用

- 邮件写入该邮箱的 Sent 文件夹，收件人回信会归入同一线程
- CRM 自动记录一条发信活动（个人邮箱的收件人若无档案会自动建档为 Unclassified）

### curl 示例

```bash
curl -X POST "https://agentic-inbox.webcareercontact.workers.dev/api/v1/mailboxes/support@timelinevisualizer.net/emails?wait=1" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"customer@gmail.com","from":{"email":"support@timelinevisualizer.net","name":"Timeline Visualizer"},"subject":"Your license key","html":"<p>…</p>","text":"…"}'
```
