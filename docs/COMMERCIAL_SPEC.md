# Zenith Quant 商业化版本 — 产品规格与开发计划

> 分支：`commercial`　基线：main (fb13c5c)　文档版本：2026-07-07

## 1. 目标

把现有免费版改造为可收费运营的线上产品：注册登录、按次计费、Stripe 充值、管理员可调价格与默认模型、广告位。

## 2. 产品需求（含已确认的默认决策）

| # | 需求 | 实现决策 |
|---|------|---------|
| R1 | 按次计费，单价管理员可调，默认 0.05 元/次 | 余额以「分」存储避免浮点误差；单价存 DB（`app_settings`），默认 5 分；管理后台可改 |
| R2 | 邮箱验证注册 | 邮箱+密码注册 → 发 6 位验证码（10 分钟有效，最多试 5 次，60 秒重发冷却）→ 验证后激活。SMTP 通过环境变量配置（QQ 邮箱/Gmail/Resend 均可）；未配置 SMTP 的开发环境在接口响应中回显验证码便于调试 |
| R3 | 新用户体验 2 次 | 独立的 `freeUsesRemaining` 计数器（不是赠送余额），单价调整不影响「2 次」语义；先扣免费次数再扣余额 |
| R4 | 线上默认模型管理员可选 | 平台默认 LLM 配置（provider/baseURL/model/apiKey）存 DB，管理后台可改可测试连通性；apiKey 读取时脱敏 |
| R5 | 顶部+底部广告 banner（Google AdSense） | `AdBanner` 组件，`NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT_TOP` / `_BOTTOM` 环境变量控制；未配置时不渲染（不留白） |
| R6 | 去掉 apimax 引导 | 删除首页引导卡片和设置弹窗里的 apimax 链接（下拉选项文案「Custom Endpoint」保留，去掉 apimax 字样） |
| R7 | Stripe 充值 | Stripe Checkout（托管页），套餐 ¥5/¥20/¥50 + 自定义金额（¥1–¥500），货币 CNY；webhook 验签+幂等入账 |

### 计费规则（关键决策，验收时请确认）

- **收费点**：调用 `/api/analyze` 且使用**平台默认模型**生成 AI 报告 = 1 次收费。
- **免费情形**：① 用户自带 API Key（BYOK，原有设置弹窗保留）；② LLM 调用失败降级为本地规则报告时**自动退款**（只为成功的 AI 报告收费）。
- **登录门槛**：所有分析（含 BYOK）都要求登录，便于风控。
- **扣费顺序**：免费次数 → 余额；余额不足且无免费次数时返回 402，前端引导充值。

## 3. 技术方案

### 3.1 技术栈（在现有 Next.js 16 + React 19 上增量添加）

- **数据库**：Drizzle ORM + libSQL —— 本地/CI 用 `file:` SQLite 文件，生产用 Turso（免费额度充裕，Vercel 兼容，同一驱动零差异）
- **认证**：自研轻量方案 —— bcryptjs 哈希密码、jose 签发 JWT 存 httpOnly cookie（7 天），中间件校验；不引入重型 auth 框架
- **邮件**：nodemailer + SMTP 环境变量
- **支付**：stripe 官方 SDK
- 广告：AdSense 脚本按需注入

### 3.2 数据模型

```
users             id, email(unique), passwordHash, emailVerifiedAt, freeUsesRemaining(默认2),
                  balanceCents(默认0), isAdmin, createdAt
verification_codes id, email, codeHash, purpose(register), expiresAt, attempts, createdAt
credit_ledger     id, userId, deltaCents, type(charge|refund|topup|free_use), refId, note, createdAt
app_settings      key(pk), value(json), updatedAt        -- price_per_use_cents / platform_llm
stripe_events     eventId(pk), processedAt               -- webhook 幂等
```

- 扣费/入账全部走 DB 事务 + `credit_ledger` 流水，余额可由流水重放核对。
- 管理员：登录时邮箱命中 `ADMIN_EMAILS`（逗号分隔）即置 `isAdmin`。

### 3.3 API 设计（全部在 `src/app/api/` 下新增）

```
POST /api/auth/register        {email, password} → 发验证码
POST /api/auth/verify          {email, code} → 激活并登录（种 cookie）
POST /api/auth/login           {email, password} → 登录（未验证则提示先验证并可重发）
POST /api/auth/logout
GET  /api/auth/me              → {email, balanceCents, freeUsesRemaining, isAdmin, pricePerUseCents}
POST /api/billing/checkout     {amountCents | package} → Stripe Checkout URL
POST /api/billing/webhook      Stripe 回调（验签、幂等、入账）
GET  /api/admin/settings       管理员读设置（apiKey 脱敏）
PUT  /api/admin/settings       管理员改单价 / 平台 LLM 配置
POST /api/admin/test-llm       用当前平台配置发一条测试请求
GET  /api/admin/stats          用户数 / 今日分析次数 / 累计充值
改造 POST /api/analyze          鉴权 + 计费 + 无 BYOK 时用平台默认模型
```

### 3.4 前端页面

- `/auth`：登录 / 注册 / 输入验证码（单页三态，风格沿用现有深色 UI）
- 主页头部：余额徽标 + 充值按钮 + 退出；未登录显示「登录」
- `/recharge/success|cancel`：充值结果页
- `/admin`：设置表单 + 统计卡片（非管理员 403）
- `AdBanner` 顶部/底部；删除 apimax 卡片

### 3.5 环境变量（上线需在 Vercel 配置）

```
TURSO_DATABASE_URL / TURSO_AUTH_TOKEN   数据库（本地缺省走 file:dev.db）
AUTH_SECRET                             JWT 签名密钥（openssl rand -base64 32）
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_ADSENSE_CLIENT / NEXT_PUBLIC_ADSENSE_SLOT_TOP / NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM
ADMIN_EMAILS                            管理员邮箱，逗号分隔
NEXT_PUBLIC_APP_URL                     站点地址（Stripe 回跳用）
```

## 4. 开发计划

| 阶段 | 内容 | 产出 |
|------|------|------|
| P1 | 数据层：schema、迁移、db 单例 | `src/lib/db/*`，`drizzle/` 迁移 |
| P2 | 认证：注册/验证/登录/登出/me + 邮件 | `src/lib/auth/*`，`api/auth/*` |
| P3 | 计费：analyze 接入扣费/退款/平台模型 | `src/lib/billing/*`，改 `api/analyze` |
| P4 | Stripe：checkout + webhook + 结果页 | `api/billing/*`，`/recharge/*` |
| P5 | 管理后台 + 前端（auth 页、余额、广告、去 apimax） | `/admin`、`/auth`、`AdBanner` |
| P6 | 测试/review/性能/debug | 单测 + 端到端记录 + code review 修复 |
| P7 | 验收 | `docs/ACCEPTANCE.md`（逐条验收证据 + 上线操作指南） |

## 5. 验收标准

1. 新邮箱注册 → 收到验证码 → 激活 → 自动登录，`freeUsesRemaining=2`
2. 分析一次（平台模型）→ 免费次数 2→1→0；再分析 → 余额不足返回 402
3. Stripe 测试充值 ¥5 → webhook 入账 → 余额 500 分；分析一次 → 495 分，流水正确
4. 重放同一 webhook 事件 → 不重复入账（幂等）
5. LLM 故意配错 → 分析降级为规则报告 → 自动退款，流水含 refund
6. 管理员改单价为 10 分 → 下一次扣费 10 分；非管理员访问 /admin 与管理接口 → 403
7. 管理员改默认模型并「测试连通」成功
8. BYOK 用户分析 → 不扣费
9. 配置 AdSense 环境变量后顶/底部渲染广告位；未配置不渲染；全站无 apimax
10. `npm run build` 通过、全部测试通过、analyze 延迟相对基线无明显回退（计费开销 < 50ms）

## 6. 明确不做（本期）

- 微信/支付宝直连（Stripe Checkout 内可开启 Alipay/WeChat Pay 支付方式，无需改代码）
- 密码找回邮件流（后台可手工处理，下期补）
- 多币种、发票、退款自助
- 新增页面仅中文界面（分析报告语言仍随原有多语言设置）
