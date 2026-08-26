# 客户管理（CRM）改造方案

日期：2026-08-26　状态：第一期已实现（2026-08-26），待部署验证

## 30 秒版

- 新增一个**全局** Durable Object `CrmDO`（SQLite），存客户、待办、活动记录。邮件数据留在原来的 `MailboxDO` 里不动，两者通过「邮箱地址」和「邮件 ID」关联。
- 客户按**邮箱地址自动建档**（来信 / 发信时自动记录），你只需要在界面上给客户打「付费 / 普通」标签。
- 收件箱列表和线程视图里，付费用户的邮件带醒目标记；线程视图里一键「加入待办」。
- 待办有独立页面 `/crm/tasks`，完成时选择完成方式（已回复 / 已发版 / 已修复 / 其他）并可填备注。
- MCP 新增 6 个 `crm_*` 工具，和现有邮件工具在同一个 `/mcp` 端点，AI 工具可以查客户、改标签、建待办、完成待办。
- 第一期（当前 3 个需求 + MCP）约 **2 天**；后续扩展（时间线、标签、多邮箱合并、订阅/收入、提醒）都在同一套表结构上加，不用重构。

---

## 1. 为什么单独一个全局 DO

现有架构：每个邮箱一个 `MailboxDO`，互相隔离。客户管理如果塞进 `MailboxDO`，会有三个问题：

1. 同一个客户可能给 `support@a.com` 和 `hi@b.com` 都写过信，客户档案会分裂
2. 「所有待办」必须跨邮箱看，逐个 DO 查再合并，慢且复杂
3. MCP / AI 工具操作客户时不应该关心它在哪个邮箱

所以新建单实例 `CrmDO`（`idFromName("crm")`），复用项目现成的 Drizzle + `applyMigrations` 迁移器，代码风格和 `MailboxDO` 一致。不用 D1：项目没有引入 D1，且数据量级（几千客户、几千待办）DO SQLite 完全够。

## 2. 数据模型（CrmDO 内）

```
contacts            客户
  id                TEXT PK (uuid)
  email             TEXT UNIQUE (小写)
  name              TEXT            来信 From 的显示名，可手改
  tier              TEXT            'unknown' | 'free' | 'paid'   ← 可扩展为任意字符串
  tags              TEXT (JSON [])  预留
  notes             TEXT            自由备注
  metadata          TEXT (JSON {})  预留：自定义字段（付费方案、渠道、语言…）
  email_kind        TEXT            'personal' | 'corporate' | 'automated'
  source            TEXT            'auto' | 'manual'
  first_seen_at / last_contact_at / created_at / updated_at

tasks               待办
  id                TEXT PK
  contact_id        TEXT → contacts.id (可空)
  title             TEXT            默认取邮件主题
  description       TEXT
  status            TEXT            'open' | 'done' | 'cancelled'
  priority          TEXT            'normal' | 'high'（预留）
  due_at            TEXT（预留）
  source_mailbox_id TEXT            来自哪个邮箱（如 support@timelinevisualizer.net）
  source_email_id   TEXT            来自哪封邮件（跳回线程用）
  source_thread_id  TEXT
  resolution_type   TEXT            完成方式：'replied' | 'released' | 'fixed' | 'other'
  resolution_note   TEXT            如「v1.4.2 已修」
  resolution_ref    TEXT            引用：回复邮件 ID / 版本号 / commit
  created_at / updated_at / completed_at

activities          活动记录（客户时间线的底座）
  id                TEXT PK
  contact_id        TEXT → contacts.id
  task_id           TEXT → tasks.id (可空)
  type              TEXT            'email_in' | 'email_out' | 'tier_change' | 'note' | 'task_created' | 'task_done'
  summary           TEXT            一句话
  ref               TEXT (JSON)     {mailboxId, emailId, threadId, from, to…}
  created_at
```

设计要点：
- `tier` 用字符串不用枚举约束，未来加 `vip` / `trial` / `churned` 不用改表
- `activities` 第一期只写不读（界面不展示），但从第一天开始积累，二期直接做客户时间线
- 一个客户多个邮箱（同一人换邮箱）：二期加 `contact_emails(contact_id, email)` 表，把 `contacts.email` 降为「主邮箱」，现有数据平滑迁移

## 3. 与邮件系统的连接点

### 3.1 自动建档
`receiveEmail`（`workers/index.ts`）存完邮件后，`ctx.waitUntil` 调 `CrmDO.recordEmail({direction:'in', email: 发件人, name, mailboxId, emailId, threadId, subject})`：
- 没有该邮箱的客户则新建（`tier='unknown'`, `source='auto'`），有则更新 `last_contact_at`
- 写一条 `email_in` 活动

三个发送路径（网页发送 / 回复转发 / Agent 工具）同样记 `email_out`。全部异步、失败只打日志，不影响收发。

垃圾邮件也会建档，所以客户列表默认只显示 `tier != 'unknown'`，`unknown` 放在「未分类」筛选里。

### 3.2 收件箱标记
线程列表接口（`GET /emails?threaded=true`）返回前，把所有 `participants` 的邮箱去重后批量查一次 `CrmDO.getTiers(emails[])`，给每条线程加 `contact_tier` 字段。一次列表请求多一次 DO 调用，可接受。

前端：
- 列表行：`paid` 显示实心彩色徽标「付费」，`free` 显示灰色「普通」，`unknown` 不显示
- 线程视图发件人旁同样徽标 + 下拉菜单「标记为付费 / 普通」+「加入待办」
- 可选：筛选条加「只看付费用户」

### 3.3 待办跳回邮件
当前选中邮件只存在前端状态里，URL 上没有。需要给 `email-list` 加 `?email=<id>` 参数支持，待办列表才能链接到 `/mailbox/<mailboxId>/emails/inbox?email=<id>` 直接打开那封邮件。

### 3.4 完成待办
- 手动：待办页 / 线程视图里点「完成」，选完成方式 + 填备注 / 引用
- 半自动（二期）：在有未完成待办的线程里发出回复时，弹「同时把待办标记为已回复？」

## 4. API（挂在现有 Hono app，同一 Access 鉴权）

```
GET    /api/v1/crm/contacts?tier=&q=&page=          客户列表
GET    /api/v1/crm/contacts/:id                      客户详情（含待办、活动）
PATCH  /api/v1/crm/contacts/:id                      改 tier / name / notes / tags
GET    /api/v1/crm/contacts/lookup?emails=a,b,c      批量查 tier（列表标记用）

GET    /api/v1/crm/tasks?status=open&contact_id=      待办列表
POST   /api/v1/crm/tasks                              新建（可带 source_* 引用）
PATCH  /api/v1/crm/tasks/:id                          改标题 / 状态 / 完成方式
```

实现放 `workers/routes/crm.ts` + `workers/lib/crm-tools.ts`（MCP 和 Agent 共用的纯函数，沿用 `tools.ts` 的模式）。

## 5. MCP 工具（加进现有 `EmailMCP`）

| 工具 | 用途 |
|---|---|
| `crm_get_contact` | 按邮箱查客户（tier、备注、未完成待办数） |
| `crm_upsert_contact` | 建档 / 改 tier / 改备注 |
| `crm_list_tasks` | 列待办，支持 status / contact 筛选 |
| `crm_create_task` | 从邮件建待办（传 mailboxId + emailId 自动关联客户） |
| `crm_complete_task` | 完成，带 resolution_type / note / ref |
| `crm_log_activity` | 记一条自定义活动（AI 处理后留痕） |

现有 `get_email` / `get_thread` 返回里顺带加 `contact_tier`，AI 读邮件时就知道对方是不是付费用户。侧栏 Agent 也拿到同一批工具，系统提示里加一句「付费用户优先」即可。

## 6. 前端页面

```
/crm                    客户列表（tier 筛选、搜索、未完成待办数）
/crm/contacts/:id       客户详情：基本信息 + 待办 + 时间线（二期）
/crm/tasks              待办看板：open / done 切换，按客户 / 邮箱 / tier 筛选，点击跳回邮件
```

入口：首页邮箱列表上方加「客户管理」卡片；邮箱侧栏底部加「CRM」链接。组件用现成的 `@cloudflare/kumo`。

## 7. 分期

**第一期（已实现）**
1. ✅ `CrmDO`（`workers/crm/`）+ 三张表 + 迁移 + `wrangler.jsonc` 绑定 `CRM`（migration v4）
2. ✅ 自动建档：收信（`receiveEmail`）、网页发送 / 回复 / 转发、Agent 发送全部挂钩，仅个人邮箱自动建档
3. ✅ 客户列表页 `/crm`（tier 筛选、搜索、手动添加）+ 客户详情 `/crm/contacts/:id`（改 tier / 名字 / 备注，待办，时间线）
4. ✅ 收件箱列表徽标 + 未完成待办标记；线程视图发件人旁「Paid / Free / 加入待办 / CRM」
5. ✅ 待办页 `/crm/tasks`（open / done / cancelled，完成时选 replied / released / fixed / other + 备注 + 引用，跳回邮件）+ `?email=` 深链接
6. ✅ MCP 工具 `crm_get_contact` / `crm_upsert_contact` / `crm_list_tasks` / `crm_create_task` / `crm_complete_task` / `crm_log_activity`；侧栏 Agent 同款 5 个工具；`get_email` / `get_thread` / `list_emails` 返回带 `contact_tier` / `has_open_task`

第一期实现文件：`workers/crm/`、`workers/db/crm-schema.ts`、`workers/lib/crm-tools.ts`、`workers/routes/crm.ts`、`shared/email-domains.ts`、`app/routes/crm*.tsx`、`app/components/crm/`、`app/queries/crm.ts`。

本机无法运行 `wrangler dev`（Workers AI 绑定需连 Cloudflare，网络受限），第一期只做了类型检查和构建，运行时行为需部署后验证。

**第二期（按需）**
- 客户时间线 UI（数据一期已在攒）
- 回复时自动提示完成待办
- 标签、自定义字段编辑 UI
- 一个客户多邮箱合并
- 订阅 / 付费信息：对接 Creem / Lemon Squeezy webhook 自动把 tier 置为 paid，存方案和到期日到 `metadata`
- 待办到期提醒（Cron Trigger + 发邮件给自己）
- 批量操作、CSV 导入导出

## 8. 已定决策（2026-08-26）

1. **`tier` 取值**：第一期只有 `free` / `paid`（未标记为 `unknown`）。表结构不限制取值，以后加 `vip` / `trial` 只改常量。
2. **自动建档规则**：只给**个人邮箱**自动建档；企业 / 自有域名邮箱和自动发信地址不建档，等手动「标记 tier」或「加入待办」时顺手建。
   - 个人 / 企业按域名判断：域名在公共邮箱服务商名单（`shared/email-domains.ts`，取自开源 free-email-domains 列表）内 → `personal`，否则 → `corporate`
   - 本地部分是 `noreply` / `no-reply` / `notifications` / `mailer-daemon` / `newsletter` 等 → `automated`
   - 结果存到 `contacts.email_kind`，客户列表可按它筛选
   - 已知误判：个人自有域名会被当企业（不自动建档，手动一次即可）；小团队用 Gmail 会被当个人

## 9. 不做的事

- 不做多用户 / 权限：延续现有「过 Access 即全权」的边界
- 不改 `MailboxDO` 的邮件表，避免动现有收发逻辑
- 不引入 D1 / 外部数据库
