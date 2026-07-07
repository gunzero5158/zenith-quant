# 商业化版本验收报告与上线指南

> 分支：`commercial`　验收日期：2026-07-07　对照文档：[COMMERCIAL_SPEC.md](./COMMERCIAL_SPEC.md)

## 一、验收结果（对照 SPEC 第 5 节，逐条实测）

| # | 验收标准 | 结果 | 实测证据 |
|---|---------|------|---------|
| 1 | 注册→验证码→激活→自动登录，免费 2 次 | ✅ | 新用户 `/api/auth/me` 返回 `freeUsesRemaining: 2` |
| 2 | 免费次数 2→1→0，用尽且无余额返回 402 | ✅ | 连续分析：`free_use 剩1` → `free_use 剩0` → 第三次 HTTP 402 |
| 3 | 充值 ¥5 入账 500 分，分析扣至 495 分 | ✅ | webhook 入账后 `balanceCents: 500`；平台分析后 `495` |
| 4 | webhook 重放不重复入账 | ✅ | 同一事件发两次均 200，余额精确 500 分 |
| 5 | LLM 失败降级规则报告并自动退款 | ✅ | 账本出现 `free_use` + `refund` 配对，免费次数返还 |
| 6 | 管理员改单价即时生效；非管理员 403 | ✅ | 改 10 分后下次扣费 `chargedCents: 10`；普通用户访问 admin 接口 403 |
| 7 | 管理员配置默认模型并测试连通 | ✅ | `/api/admin/test-llm` 返回 `ok: true` 与模型回包样例 |
| 8 | BYOK（自带 Key）分析不扣费 | ✅ | `aiSource: "byok", chargedCents: 0`，余额不变 |
| 9 | AdSense 配置后顶/底渲染，未配置不渲染；全站无 apimax | ✅ | 配置环境变量后首页出现 2 处 `adsbygoogle`；apimax 引用 0 处 |
| 10 | 构建、测试、性能达标 | ✅ | `npm run build` 通过；165/165 测试通过；计费+鉴权开销约 10ms（目标 <50ms） |

补充验证过的边界：未登录分析返回 401 并引导登录；余额不足但开启了本地兜底时返回免费规则报告（不吞请求）；行情源全挂产生的模拟数据绝不会走付费模型；坏 cookie 不再 500；充值金额低于 ¥5 被拦截（Stripe CNY 最低限制）。

## 二、Code review 结论

8 个视角并行审查共 42 条候选，确认修复 10 条正确性/安全问题（详见提交 `6b1c752`），要点：模拟数据防扣费、生产环境强制 Turso、资金操作补偿回滚、Stripe 孤儿入账防护、AUTH_SECRET 严格化、localStorage 不再存账户数据等。

**已知限制（本期接受，下期可改进）**：
- Serverless 函数在 LLM 调用中途被强制超时杀死时，已扣费用无法自动退（窗口极小；账本有 charge 无对应报告可人工核对）
- 内存限流是单实例的（验证码类限制已落库，是持久的）；如需更强防护可接 Upstash
- 用户切换股票导致前端放弃进行中的付费请求时，该次费用不退（余额会在窗口聚焦时自动刷新校正显示）
- 管理设置有 30 秒缓存，多实例下价格调整最迟 30 秒生效

## 三、上线操作指南（一次性配置）

### 1. 创建 Turso 数据库（免费）
```bash
# 安装 CLI 并注册：https://docs.turso.tech
turso db create zenith-prod
turso db show zenith-prod --url        # 得到 TURSO_DATABASE_URL
turso db tokens create zenith-prod     # 得到 TURSO_AUTH_TOKEN
# 在本机项目目录执行一次建表：
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
```

### 2. SMTP 邮箱（发验证码）
任选：QQ 邮箱（开启 SMTP，授权码做密码）、Gmail（应用专用密码）、Resend/SendGrid 的 SMTP 模式。

### 3. Stripe
- 控制台创建 Restricted/Secret Key → `STRIPE_SECRET_KEY`
- Developers → Webhooks → Add endpoint：`https://你的域名/api/billing/webhook`，事件选 `checkout.session.completed` → 得到 `STRIPE_WEBHOOK_SECRET`
- 建议在 Stripe 设置里开启 Alipay/WeChat Pay 支付方式（CNY 直接可用）

### 4. Vercel 环境变量（Production）
```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
AUTH_SECRET=<openssl rand -base64 32 生成>
ADMIN_EMAILS=hmasterh@outlook.com
SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... SMTP_FROM=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://你的域名
NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-...          # 可后补，未配置时不显示广告
NEXT_PUBLIC_ADSENSE_SLOT_TOP=...
NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM=...
```

### 5. 上线后第一件事
用 `ADMIN_EMAILS` 里的邮箱注册并验证 → 页面右上角出现「管理」入口 → 在 `/admin` 配置平台默认大模型（provider/baseURL/模型名/API Key）→ 点「测试连通性」确认 → 按需调整单价（默认 0.05 元/次）。

### 6. 建议用 Stripe 测试模式先走一遍
用 `sk_test_` 密钥 + 测试卡 `4242 4242 4242 4242` 完整跑一次充值→扣费，确认无误后换正式密钥。

## 四、合规提醒（上线前请确认）

- **行情数据源**：当前使用 yahoo-finance2 等非官方接口，商业化运营存在授权风险，建议尽快替换为有商业授权的行情源
- **投资建议免责声明**：建议在页面 footer 增加"本内容不构成投资建议"声明
- AdSense 需要站点通过 Google 审核后才会实际出广告
