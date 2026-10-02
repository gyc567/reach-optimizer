# TopDiggX Web 版开发方案（审计修订版 v2）

> 2026-10-01 依据仓库代码全面审计后修订。原版的事实错误、重复造轮子、与现有系统的契约冲突均已修正；修订明细见附录 A。

## 审计结论摘要

原方案的整体方向正确（Next.js 扩展现有 `apps/api`、客户端直调 `rules-engine`、深色 X 风格），但有 **4 个会导致返工的硬伤**：

1. **资产盘点失真**：`app/page.tsx`（落地页）、`lib/styles.ts`、Auto-optimize API、完整的 Reach 预测引擎（在扩展端 `forecast-engine.ts`）**都已存在**，原方案把它们列为"新建"，按原方案执行会造成覆盖事故和重复造轮子。
2. **核心数据错误**：信号是 **25 个**（不是 22）；breakdown 示例的分值/分组与 `weights.json` 对不上；"B+ tier" 不存在（实际 5 档：critical / below_average / good / excellent / perfect）。
3. **MiniMaxi 适配方案不可行**：要改的文件路径不存在，且全系统有 **4 处硬编码 `api.anthropic.com` 的裸 fetch**，只改 client 构造参数根本切不走。
4. **会破坏已发布扩展**：`/api/analyze` 是线上 Chrome 扩展正在消费的公共契约（CORS 全开），原方案直接把它改成流式响应会打挂现有客户端。

其余修正：客户端评分示例代码缺必填字段无法通过类型检查；`/api/trending`、`/api/timing` 是真实实现不是 Mock；Hook 质量 AI 实际返回 1-10 分 + 6 维数据（不是方案里虚构的三条进度条）；登录体系（X OAuth + JWT）与推文追踪已存在，P2 功能大部分是"接数据线"而非"从零建"。

---

## 0. 已核实资产清单

### 0.1 直接复用（已核实存在）

| 资产 | 路径 | 说明 |
|------|------|------|
| `ScoreEngine` | `packages/rules-engine/src/engine.ts` | `evaluate(input: TweetInput): AnalysisResult`，**25 个信号**，baseScore=30 |
| 预测引擎 | `apps/extension/src/content/forecast-engine.ts` | `computeForecast()` → `ReachForecast` + `WhatIfScenario[]`，含置信区间、概率、combined 场景。**方案 §7 的公式是它的阉割版，应整体移植共享** |
| 评分 Overlay UI | `apps/extension/src/content/ScoreOverlay.tsx`（1073 行） | 仪表盘/信号条 UI，可移植为 Web 组件基底 |
| `/api/analyze` | `apps/api/app/api/analyze/route.ts` | 引擎复算 + AI slop/hook + trending +5 叠加；登录后落库；**已发布扩展在用的契约，不可改响应格式** |
| `/api/suggest` | `apps/api/app/api/suggest/route.ts` | `{content, type: 'hook'\|'cta'\|'self-reply'}` → `{suggestions: string[]}`（3 条重写）。注意：**`cta` 类型未单独实现**，落到 hook 分支 |
| `/api/tweets/auto-optimize` | `apps/api/app/api/tweets/auto-optimize/route.ts` | **5 轮迭代已存在**：每轮 3 变体、真实引擎评分、≥85 或平台期停止、`maxDuration=60`。**方案 Phase 2 的"客户端实现 5 轮"应改为直接调它** |
| `/api/trending` | `apps/api/app/api/trending/route.ts` + `lib/trending.ts` | **真实实现**：twitterapi.io + 15min 进程缓存，失败降级空数组。不是 Mock |
| `/api/timing` | `apps/api/app/api/timing/route.ts` | GET/POST 均可；POST `{timezone}` → `TimingResponse`（currentStatus / weeklyWindows / **7×24 heatmap**） |
| `/api/account-health` | `apps/api/app/api/account-health/route.ts` | 真实账号健康度：`reachMultiplier 0.6-1.3`、`forecastCorrectionFactor`（预测引擎的输入） |
| 鉴权体系 | `app/api/auth/*` + `lib/auth.ts` | X OAuth 2.0 登录 + JWT cookie `reachos_token`，dashboard 服务端读取 |
| 推文追踪 | `app/api/tweets/track|metrics` + 4 个 cron | 追踪、15min 抓取指标、权重自学习、预测校准（`lib/calibration.ts`、`lib/weight-learner.ts`） |
| 限流 | `lib/middleware.ts` `applyRateLimit` | 按 userId/IP，所有 AI 端点已接入 |
| 样式系统 | `apps/api/lib/styles.ts` | 颜色/字体/间距/radius/shadows/`getScoreColor`/`getScoreTier`/`signalBucketColors`，**比原方案设计的更全，直接复用** |
| 落地页 | `apps/api/app/page.tsx` | Hero/Features/Stats/CTA，含 Chrome Web Store 导流。**原方案"新建 page.tsx"会覆盖它，需先迁移** |
| Dashboard | `app/dashboard/page.tsx` + `TweetRow.tsx`/`CopyButton.tsx` | 已含 StatCard、TimingHeatmap（页内局部组件）、推文列表、OAuth 门 |
| 共享类型 | `@reach/shared-types` | `AnalysisResult`、`ReachForecast`、`WhatIfScenario`、`TimingResponse`、`AccountHealth` 等**全部已定义** |
| 权重配置 | `packages/rules-engine/src/config/weights.json` | version 4.1.0，25 信号 + 5 tier |

### 0.2 需要新建/修改

| 资产 | 说明 |
|------|------|
| `packages/rules-engine/src/forecast.ts` | 把 `forecast-engine.ts` 从扩展迁入共享包（详见 §7），扩展改为引用 |
| `apps/api/components/`（目录已存在，空） | TweetComposer / ScoreGauge / SignalBreakdown / ReachForecast / AIOptimizer 等 |
| `app/(scorer)/page.tsx` 或迁移落地页 | 评分器首页。决策见 §2.1 |
| `app/error.tsx` / `app/loading.tsx` | Next 约定文件（比手写 ErrorBoundary 更贴合 App Router） |
| `/api/analyze/stream`（可选，P1） | 流式 AI 建议**新端点**，不动现有契约（扩展兼容） |
| `app/analyze/page.tsx` | 账号分析页（优先接 `/api/account-health`，Mock 仅作未登录 fallback） |
| MiniMaxi 适配 | 统一 LLM 调用封装，替换 4 处裸 fetch（详见 §6） |

### 0.3 必须做的决策

| 决策项 | 建议 |
|--------|------|
| 评分器 vs 落地页抢 `/` | **评分器放 `/`**，现有落地页内容迁到 `/welcome`（或压缩为评分页底部一个 section），Header 保留 "Install Extension" 导流 |
| 是否建 `/api/scoring/score` | **不建**。客户端直调引擎（纯 TS 无 Node API，已验证；`transpilePackages` 已配置），服务端场景已有 `/api/analyze` |
| 客户端引擎 vs 服务端评分不一致 | 沿用现有语义：客户端权威（即时 0-100），`/api/analyze` 叠加 AI/trending delta 后返回 `serverDelta`，UI 标注"AI 修正 +N" |

---

## 1. 概述

TopDiggX Web 版让用户无需安装 Chrome 扩展，即可对推文进行实时评分、AI 优化和分析任意账号。

### 核心功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 实时评分 | 输入推文，实时显示 0-100 分 + 25 信号 breakdown（18 个无条件信号即时计算，7 个条件信号标注"未触发"） | P0 |
| Reach 预测 | 移植现有 `computeForecast`：预测曝光 + What-if 场景 + 置信区间 | P0 |
| AI 优化 | Hook 重写（`/api/suggest`）、Auto-optimize 5 轮（**调现有** `/api/tweets/auto-optimize`） | P1 |
| 账号分析 | 登录用户接 `/api/account-health` 真实数据；未登录降级 Mock | P2 |
| 评分历史 | 登录后评分自动落库（`/api/analyze` 已实现），Dashboard 展示 | P2 |

### 技术栈

| 项目 | 选择 |
|------|------|
| 框架 | Next.js 15 App Router + React 19（扩展现有 `apps/api`，端口 3100） |
| UI 风格 | 深色主题 + X/Twitter 设计语言，统一用 `apps/api/lib/styles.ts` |
| 评分算法 | `@reach/rules-engine` 客户端直调（包为纯 TS，无 Node API，扩展端已验证可行） |
| AI | Anthropic 兼容端点（默认官方；MiniMaxi 通过 `ANTHROPIC_BASE_URL` 切换，见 §6） |
| 状态管理 | React useState + useCallback（轻量级） |

---

## 2. 页面结构

### 2.1 路由

```
/                   → 推文评分器（P0；现有落地页内容迁至 /welcome）
/welcome            → 原落地页（Hero / Features / Stats / CTA，保留扩展导流）
/dashboard          → 用户中心（已存在，本期只做组件提取与入口）
/analyze            → 账号分析（P2）
/privacy            → 已存在，不动
```

### 2.2 布局规范

颜色/字体/间距**不要新写常量**，全部 import 自 `apps/api/lib/styles.ts`（已含 `colors` / `fonts` / `spacing` / `radius` / `shadows` / `getScoreColor` / `getScoreTier` / `signalBucketColors`）。需要的增补直接加到这个文件里。

与现有系统对齐后的关键值：

- 评分颜色：`getScoreColor` — 80+ 绿 / 60+ 蓝 / 40+ 黄 / 20+ 橙 / 以下红
- tier 文案（英文，跟随 `weights.json` labels）：0-20 Don't Post / 21-40 Significant Revision Needed / 41-60 Average / 61-79 Strong / 80-100 Exceptional。**不要用 "B+" 这类自创分级**
- 字体：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`；等宽用 `fonts.mono`
- 间距：8px 基准网格（`spacing.xs..xxl`）

---

## 3. 首页 `/` — 推文评分器

### 3.1 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Logo + Nav (Dashboard / Install Extension)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  TweetComposer                                             │ │
│  │  textarea (placeholder + char count /280)                  │ │
│  │                              [AI 优化 ▾]  [清空]            │ │
│  │  媒体开关: [图片] [视频] [引用推] [外链]  ← 条件信号上下文    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │   ScoreGauge        │  │   ReachForecast                 │  │
│  │   (圆形仪表盘)       │  │   ~12.4K (±区间)                │  │
│  │       72            │  │   Strong · isEstimate 标注      │  │
│  │    ▓▓▓▓▓░░░         │  │                                 │  │
│  │   Strong (61-79)    │  │   What-if:                      │  │
│  └─────────────────────┘  │   [+图片] +35%  [+视频] +45%    │  │
│                           │   [黄金时段] +25% [蹭趋势] +15%  │  │
│                           │   [外链+好奇心钩子] +18%          │  │
│                           └─────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  SignalBreakdown (可折叠，按 4 桶分组，数据来自 weights.json)│ │
│  │  ▼ Engagement                                              │ │
│  │    reply: 12/12  click: 8/8  favorite: 7/7  retweet: 7/7  │ │
│  │    quote: 6/6  share: 5/5  share_via_dm: 6/6              │ │
│  │    share_via_copy_link: 4/4                                │ │
│  │    (+ 条件信号未触发: photo_expand / vqv / quoted_click… ) │ │
│  │  ▼ Curiosity  ─ profile_click: 7/7  follow_author: 5/5    │ │
│  │  ▼ Dwell      ─ dwell: 8/8  cont_dwell_time: 4/4          │ │
│  │  ▼ Risk       ─ (负分信号，预测命中时显示扣分与原因)         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  AIOptimizer (默认折叠，点击 [AI 优化] 展开并调用)          │ │
│  │                                                           │ │
│  │  AI Slop: 12/100 (natural)                                │ │
│  │  Hook: 7.5/10 · bold_claim                                │ │
│  │  ├ attention_power  ████████░░ 8                          │ │
│  │  ├ curiosity_gap    ██████░░░░ 6                          │ │
│  │  ├ specificity      █████████░ 9  …(6 维)                 │ │
│  │  feedback: "…"                                            │ │
│  │                                                           │ │
│  │  [重写 Hook ×3] [Auto-Optimize 5 轮] [复制最佳版本]        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Footer: © TopDiggX · 扩展下载 · /welcome                        │
└─────────────────────────────────────────────────────────────────┘
```

要点修正（相对原方案）：

- **Tier 显示 72 → "Strong"**（excellent 档 61-79），不是 "B+"
- **媒体开关必须加**：`TweetInput.hasMedia/hasMediaType/isQuoteTweet` 影响 vqv/photo_expand/quoted_* 等条件信号，纯文本输入会让这些信号永远 "未触发"，What-if 也失去意义
- **AI 面板数据以真实返回为准**：`aiSlopScore`(0-100) + `HookQualityResult{overall 1-10, 6 维, hook_type, feedback}` + suggestions 列表
- 评分为 0（空文本）时显示占位，不显示 "Don't Post" 吓人文案

### 3.2 交互设计

| 交互 | 行为 |
|------|------|
| 输入文字 | debounce 后**仅客户端** `engine.evaluate()`（<50ms），不触发任何 API |
| 切换媒体开关 | 重新 evaluate，条件信号即时生效；forecast 重算 |
| 点击 What-if 项 | forecast 引擎的 `scenarios[]` 已算好 delta，直接展示，无需重算 |
| 点击 [AI 优化] | 手动触发 `POST /api/analyze`（可选 stream 端点），显示 AI delta + 建议 |
| 点击 [重写 Hook] | `POST /api/suggest {type:'hook'}` → 3 条候选，逐条展示客户端重评分 |
| 点击 [Auto-Optimize] | `POST /api/tweets/auto-optimize {maxRounds:5}`，轮询展示每轮 best（≤60s） |
| 字符数 > 280 | 红色警告（对标普通 X 用户上限） |

**成本控制（原方案缺失）**：debounce 输入路径上**只允许**本地引擎；任何 AI 端点都必须由明确点击触发。匿名用户走 `applyRateLimit`（已有），上线前建议再加匿名日配额。

### 3.3 智能 Debounce

| 文本长度 | Debounce |
|----------|----------|
| 0-50 字符 | 150ms |
| 51-140 字符 | 250ms |
| 141-280 字符 | 400ms |
| > 280 字符 | 600ms |

---

## 4. 组件设计

### 4.1 组件列表

| 组件 | 文件 | 描述 | 来源 |
|------|------|------|------|
| TweetComposer | `components/TweetComposer.tsx` | 文本框 + 字数 + 媒体开关 | 新建 |
| ScoreGauge | `components/ScoreGauge.tsx` | 圆形仪表盘（可移植扩展 `ScoreOverlay.tsx` 的表盘） | 移植+改造 |
| SignalBreakdown | `components/SignalBreakdown.tsx` | 4 桶可折叠；条件信号显示 "未触发 + 开启条件" | 新建（数据全在 `signalScores`） |
| ReachForecast | `components/ReachForecast.tsx` | 预测 + scenarios 列表 + 置信度 | 新建，数据来自共享 `computeForecast` |
| AIOptimizer | `components/AIOptimizer.tsx` | AI 面板：slop/hook 6 维/建议/5 轮结果 | 新建，API 已存在 |
| TrendBadge | `components/TrendBadge.tsx` | trending 对齐提示（`/api/trending` 真实数据） | 新建 |
| StatCard | `components/StatCard.tsx` | **从 dashboard/page.tsx 提取**（当前是页内函数） | 提取 |
| TimingHeatmap | `components/TimingHeatmap.tsx` | **从 dashboard/page.tsx 提取**；数据源可换 `/api/timing` 的 heatmap | 提取 |
| LoadingSkeleton | `components/LoadingSkeleton.tsx` | 骨架屏 | 新建 |
| ErrorBoundary | 用 `app/error.tsx` 约定 | Next App Router 官方错误边界 | 新建（约定文件） |

### 4.2 状态流（修正版）

```
TweetComposer (onChange, debounced) ──客户端本地──▶ engine.evaluate({text, platform:'x', isThread, hasMedia, mediaType, isQuoteTweet})
    ↓ AnalysisResult
├── ScoreGauge (score, tier)
├── SignalBreakdown (signalScores)
└── computeForecast({analysis, accountHealth:null, timingStatus, hasMedia, hasExternalLink, avgViews:null, trackedTweetCount:0})
    ↓ ReachForecast
    └── ReachForecast 组件 (predictedReach ± 区间, scenarios[])
          ▲ timingStatus 来自 POST /api/timing {timezone: Intl 浏览器时区}

[AI 优化] 点击 ──▶ POST /api/analyze {content, hasMedia, mediaType, ...}  ──▶ AIOptimizer (+serverDelta 标注)
[重写 Hook]    ──▶ POST /api/suggest {content, type:'hook'}
[Auto-Optimize]──▶ POST /api/tweets/auto-optimize {content, maxRounds:5}
```

关键类型（全部已在 `@reach/shared-types`，不要自造）：

```typescript
// 客户端评分 — TweetInput 必填 platform/isThread/hasMedia，缺了编译不过
const result = engine.evaluate({
  text, platform: 'x', isThread: false, hasMedia, mediaType, isQuoteTweet,
});

// 响应即 AnalysisResult { score, baseScore, tier, signalScores, applicableSignals,
//   aiSlopScore, suggestions, highlights, isServerEnhanced, trendingAlignment? }
```

---

## 5. API 设计

### 5.1 评分：客户端直调，不新建服务端评分端点

原方案的 `/api/scoring/score` **取消**，理由：

- `rules-engine` 纯 TS（全包无 `process`/Node API，已核实），Next `transpilePackages` 已配置，客户端 import 直接可用——扩展端就是这么跑的
- 服务端增强场景（AI 叠加、落库）已由 `/api/analyze` 覆盖，其契约为 `AnalyzeRequest{content, platform?, isThread?, hasMedia?, mediaType?, isQuoteTweet?, quotedText?, quotedMediaType?, postsToday?}` → `AnalyzeResponse{success, data: AnalysisResult} + serverDelta`
- What-if 的 reach 预测在客户端 `computeForecast` 完成（§7），无需服务端

### 5.2 复用端点（全部已存在，仅列契约差异）

| 端点 | 方法 | 契约 | Web 版用途 |
|------|------|------|-----------|
| `/api/analyze` | POST | 上表；限流已内置 | AI 面板（手动触发） |
| `/api/analyze/stream` | POST | **新建（可选）**：`ReadableStream` 逐 token 返回建议文本；响应头协商或独立路径，**不动现有 JSON 契约**（扩展兼容） | 流式建议 |
| `/api/suggest` | POST | `{content, type:'hook'\|'cta'\|'self-reply'}` → `{suggestions: string[]}`；**`cta` 未单独实现**（落到 hook 分支），方案里不要承诺 CTA | Hook 重写 3 条 |
| `/api/tweets/auto-optimize` | POST | `{content, maxRounds≤5, hasMedia?, mediaType?, isQuoteTweet?, quotedMediaType?}` → `{originalScore, finalScore, improvement, rounds[], bestText}`；`maxDuration=60` | 5 轮迭代 |
| `/api/timing` | GET/POST | POST `{timezone}` → `TimingResponse{currentStatus, message, nextWindowLocal, weeklyWindows, heatmap, timezone}` | forecast 的 timeMultiplier + 热力图 |
| `/api/trending` | GET | `?woeid=1` → `TrendingResponse{trends[], fetchedAt, cacheExpiresIn}`；无 key/失败降级空数组 | TrendBadge |
| `/api/account-health` | GET（需登录） | → `AccountHealth{healthScore, reachMultiplier, factors[], forecastCorrectionFactor, ...}` | 账号分析页（P2） |

### 5.3 响应示例（以真实 AnalyzeResponse 为准）

```json
{
  "success": true,
  "data": {
    "score": 72, "baseScore": 30, "tier": "excellent",
    "signalScores": { "reply": { "signal": "reply", "type": "positive", "bucket": "engagement", "score": 12, "max": 12, "applicable": true, "firedRules": [...], "subRules": [...] }, "...": "...(25 个)" },
    "applicableSignals": ["reply", "click", "..."],
    "aiSlopScore": 12,
    "suggestions": [{ "ruleId": "signal:reply", "severity": "positive", "title": "Reply", "description": "..." }],
    "highlights": [], "isServerEnhanced": true,
    "trendingAlignment": { "isAligned": true, "matchedTrends": [...], "bonusPoints": 5 }
  },
  "serverDelta": 6
}
```

原方案 §5.2 自创的 `{text, media:{hasImage, hasLink...}}` 请求体和 `{reachPrediction:{base, withImage...}}` 响应体**废弃**——与 `TweetInput`/`ReachForecast` 双轨并行只会制造转换层 bug。

---

## 6. AI 集成

### 6.1 现状（审计核实）

- 全系统模型统一为 **`claude-haiku-4-5-20251001`**（不存在 "MiniMaxi Haiku/Sonnet" 命名）
- LLM 调用共 5 处：
  - **裸 fetch 硬编码 `https://api.anthropic.com/v1/messages`（4 处）**：`app/api/suggest/route.ts`（hook 重写 + self-reply 两处）、`app/api/tweets/auto-optimize/route.ts`、`packages/ai-checks/src/analyzer.ts` 的 `generateHookSuggestions`
  - **走 Anthropic SDK（1 处）**：`packages/ai-checks/src/claude-client.ts` 的 `analyzeWithClaude`（供 `analyzeSlop` 确认、`assessHookQuality` 使用），`new Anthropic({ apiKey })`
- `lib/env.ts` **没有** `ANTHROPIC_BASE_URL`；`.env.example` 也没有
- SDK 构造不传 baseURL 时会自动读 `ANTHROPIC_BASE_URL` 环境变量，但**裸 fetch 不会**

### 6.2 MiniMaxi（或任意 Anthropic 兼容端点）正确接法

原方案"改 `packages/ai-checks/src/lib/anthropic.ts` 一行"不可行（文件不存在，且改不到 4 处裸 fetch）。正确做法：

1. **统一出口**：新建 `packages/ai-checks/src/anthropic-fetch.ts`：

```typescript
export function anthropicBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
}
export async function callAnthropic(apiKey: string, body: Record<string, unknown>) {
  const res = await fetch(`${anthropicBaseUrl()}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  return res.json();
}
```

2. **替换 4 处裸 fetch**（suggest×2、auto-optimize、analyzer.generateHookSuggestions），消除重复代码
3. **SDK 路径**：`createClaudeClient` 改为 `new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL })`
4. **env 注册**：`lib/env.ts` 增加 `ANTHROPIC_BASE_URL`（默认空串），`.env.example` 增加注释项，Vercel 环境变量同步设置；`turbo.json` build env 白名单可补
5. **模型名**：保留 `claude-haiku-4-5-20251001` 常量集中定义（如兼容端点要求不同模型名，只改这一处）
6. 环境变量**不是**"已在 .env.local"（原方案表述不实），需按上述步骤显式添加

### 6.3 AI 功能映射（修正）

| 功能 | 实现 | 触发 |
|------|------|------|
| Slop 检测 | `AIAnalyzer.analyzeSlop`（启发式 + LLM 确认，0-100） | /api/analyze |
| Hook 质量 | `AIAnalyzer.assessHookQuality` → `overall 1-10 + 6 维 + hook_type + feedback` | /api/analyze |
| Hook 重写 ×3 | `/api/suggest {type:'hook'}`（haiku） | 手动 |
| Auto-optimize 5 轮 | `/api/tweets/auto-optimize`（haiku，每轮 3 变体） | 手动 |
| Self-reply | `/api/suggest {type:'self-reply'}` | 手动（可后续加入面板） |
| 流式建议 | 新端点 `/api/analyze/stream`（SSE） | 手动（可选 P1） |

注意：重写/优化类 prompt 已内置**语言跟随**（`detectLanguage`，当前支持 en/tr）与反幻觉约束，Web 端直接受益，无需另做 i18n。

---

## 7. Reach 预测模型

### 7.1 不新写公式——移植现有引擎

`apps/extension/src/content/forecast-engine.ts` 是经过 2026-05 针对 x-algorithm 重新校准的完整实现，原方案 §7 是其子集。行动项：

1. 迁移到 `packages/rules-engine/src/forecast.ts`（导出 `computeForecast`、`formatNumber`），`shared-types` 的 `ReachForecast`/`WhatIfScenario` 类型保持不变
2. 扩展端 `apps/extension/src/content/forecast-engine.ts` 改为 `export * from '@reach/rules-engine/forecast'`（或保留文件 re-export，vite 已能 transpile 工作区 TS 源码）
3. Web 端从 `@reach/rules-engine` 导入，匿名场景输入：`accountHealth=null`、`avgViews=null`、`trackedTweetCount=0`、`timingStatus` 来自 `/api/timing`

### 7.2 现有引擎语义（必须遵守，原方案多处违背）

```
predictedReach = baseReach × (score/50) × timeMultiplier × trendMultiplier
               × mediaMultiplier × linkGapMultiplier × healthMultiplier × calibrationFactor
```

| 因子 | 取值 | 原方案的错误 |
|------|------|-------------|
| baseReach | 有追踪数据用 avgViews；否则 followers×5%（下限 50）；匿名兜底 **200** 并标记 `isEstimate` | 原方案只有 followers×5%，匿名首页没有 followers 概念 |
| mediaMultiplier | 图片 ×1.35 / 视频 ×1.45，**二选一不叠加** | 原方案 What-if 把 +图片 +视频当可累加开关，与引擎语义冲突 |
| linkGapMultiplier | **仅当"有外链且 click 信号 fired curiosity_gap"** 时 ×1.18；裸链接无加成无惩罚 | 原方案 "+链接 +950" 是错的——v4 模型里链接本身不加成，"给外链加好奇心钩子"才是场景 |
| timeMultiplier | good_now ×1.25 / better_later ×1.12 / off-peak ×0.85，状态来自 /api/timing | 原方案未写数据来源 |
| trendMultiplier | trendingAlignment.isAligned ×1.15 | 一致 |
| health/calibration | 登录用户来自 `/api/account-health`（0.6-1.3 / 校准系数） | 一致但原方案未写来源 |

What-if 场景直接消费引擎返回的 `scenarios[]`（已含 `delta/deltaPercent/alreadyApplied`）：

| 场景 id | 条件 | 说明 |
|---------|------|------|
| `add-curiosity-gap` | 有外链且 gap 未触发 | ×1.18 |
| `add-image` / `add-video` | 无媒体 | ×1.35 / ×1.45 |
| `optimal-time` | 非 peak 时段 | 重算 good_now |
| `trending` | 未对齐 | ×1.15 |
| `combined` | ≥2 个未应用 | 全量重算（取 video 为媒体上限） |

UI 另需展示引擎自带的 `reachLow/reachHigh`（置信区间随 dataPoints 收窄）、`replyProbability` / `bookmarkProbability` / `viralChance`、`confidence` / `dataPoints` / `isEstimate`。

### 7.3 数字格式化

用引擎的 `formatNumber`：`≥10K → "12.4K"`、`≥1M → "1.2M"`、其余 `toLocaleString`。

---

## 8. 数据设计：真实优先，Mock 仅兜底

### 8.1 账号分析（P2）

**优先接真实数据**（原方案完全没提这些已存在的能力）：

- 登录用户：`GET /api/account-health`（healthScore、reachMultiplier、followers、engagement rate、forecastCorrectionFactor）+ dashboard 同款 `trackedTweet` 数据（服务端组件直读 Prisma，参考 `app/dashboard/page.tsx` 的模式）
- Mock 降级：仅当未登录或接口失败时展示 `MOCK_ACCOUNTS`（原方案 §8.1 可保留为 fallback 数据结构，但 `signalDistribution`/`bestPostingTime` 字段应与真实 `AccountHealth.factors[]`、`/api/timing` 的 weeklyWindows 对齐）

### 8.2 Trending

**删除 MOCK_TRENDS**。`/api/trending` 是真实实现：twitterapi.io + 15min 服务端缓存，无 key 或失败时降级为空数组——Web 端做空态处理即可（"趋势暂不可用"）。

---

## 9. 开发任务分解（修订）

### Phase 0：共享化前置（半天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 迁移 forecast 引擎 | `packages/rules-engine/src/forecast.ts` | 从扩展迁入，`computeForecast`/`formatNumber`，补 vitest |
| 扩展适配 | `apps/extension/src/content/forecast-engine.ts` | 改为 re-export，验证 `pnpm --filter @reach/extension build` |
| 提取 Dashboard 组件 | `components/StatCard.tsx`、`components/TimingHeatmap.tsx` | 从 `app/dashboard/page.tsx` 抽出，页面改为 import |

### Phase 1：核心评分（P0）

| 任务 | 文件 | 说明 |
|------|------|------|
| 落地页迁移 | `app/welcome/page.tsx` + `app/page.tsx` 重写 | 原落地页整体搬迁，`/` 让位给评分器；Header 保留扩展导流 |
| TweetComposer | `components/TweetComposer.tsx` | 含媒体开关（hasMedia/mediaType/isQuoteTweet/hasExternalLink） |
| ScoreGauge | `components/ScoreGauge.tsx` | 可移植扩展表盘；`getScoreColor` 取色 |
| SignalBreakdown | `components/SignalBreakdown.tsx` | 4 桶分组，条件信号显示开启条件 |
| ReachForecast | `components/ReachForecast.tsx` | `computeForecast` + scenarios；匿名兜底 200 标注 isEstimate |
| 首页组装 | `app/page.tsx`（client）+ `app/error.tsx` + `app/loading.tsx` | 客户端引擎 debounce 评分；timing 用浏览器时区调 `/api/timing` |
| TrendBadge | `components/TrendBadge.tsx` | `/api/trending` 真实数据 + 空态 |

### Phase 2：AI 优化（P1）

| 任务 | 文件 | 说明 |
|------|------|------|
| AIOptimizer | `components/AIOptimizer.tsx` | 调 `/api/analyze`：slop + hook 6 维 + 建议 + serverDelta 标注 |
| Hook 重写 | 复用 `/api/suggest` | 3 条候选 + 客户端重评分 |
| Auto-optimize | 复用 `/api/tweets/auto-optimize` | 轮次展示 rounds[]；loading ≤60s；失败重试 |
| 流式建议（可选） | `app/api/analyze/stream/route.ts` | **新端点**，SSE；现有 `/api/analyze` 契约不动 |
| 匿名配额 | `lib/middleware.ts` 或新 lib | AI 端点匿名日限额（防成本失控） |

### Phase 3：账号分析 + Dashboard 整合（P2）

| 任务 | 文件 | 说明 |
|------|------|------|
| 账号分析页 | `app/analyze/page.tsx` | 登录接 `/api/account-health` + trackedTweets；未登录 Mock 降级 |
| Dashboard 增强 | `app/dashboard/page.tsx` | 加"新建评分"入口、评分历史（analysis 表已自动记录） |
| MiniMaxi 适配 | `packages/ai-checks/src/anthropic-fetch.ts` 等 | 按 §6.2 统一封装并替换 4 处裸 fetch（可提前，独立交付） |

---

## 10. 验收标准

### 功能

- [ ] 输入推文后评分显示 < 500ms（含 debounce），纯客户端路径零 API 调用
- [ ] 25 信号按 4 桶分组，分值与 `weights.json` 一致（单测对照配置）
- [ ] 条件信号（photo_expand/vqv/quoted_*/topic_consistency/post_frequency/cont_click_dwell_time）在未满足条件时显示"未触发"而非 0 分混淆
- [ ] What-if 展示引擎 `scenarios[]` 原值（delta/deltaPercent/alreadyApplied），不二次发明计算
- [ ] AI 面板字段与 `HookQualityResult`/`aiSlopScore` 真实结构一致
- [ ] Auto-optimize 调用现有端点成功，5 轮/平台期/≥85 停止逻辑由服务端保证
- [ ] 账号分析：登录显示真实数据，未登录显示 Mock 并标注"示例数据"

### UI/UX

- [ ] 深色主题，全部颜色来自 `lib/styles.ts`（不新增第二套色板）
- [ ] tier 文案与 `weights.json` labels 一致（Don't Post / Strong / Exceptional…）
- [ ] ScoreGauge 动画流畅；SignalBreakdown 折叠动画
- [ ] 响应式（移动端可读）；键盘可达；无 console error

### 性能与兼容性（新增）

- [ ] 客户端评分 < 50ms；首屏 < 2s（4G）
- [ ] **扩展回归**：发布后扩展调用 `/api/analyze`、`/api/suggest`、`/api/tweets/auto-optimize`、`/api/trending`、`/api/timing` 行为不变（响应格式、CORS、字段名）
- [ ] AI 流式（若做）只走新端点，旧端点 JSON 契约不变

---

## 11. 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|------|------|------|
| 覆盖现有落地页导致 SEO/导流损失 | 扩展安装量下降 | 落地页整体迁 `/welcome` 并加跳转；`/page.tsx` 重写前 diff 备份 |
| **改 `/api/analyze` 响应格式打挂已发布扩展** | 线上事故 | 契约冻结；流式走新端点 `/api/analyze/stream`；任何字段只增不改 |
| AI 端点被匿名用户刷爆成本 | 账单失控 | 现有 `applyRateLimit` + 新增匿名日配额；AI 仅手动触发，输入路径零 AI 调用 |
| MiniMaxi 兼容差异（模型名/tool use/流式） | AI 功能降级 | 集中常量；失败时 UI 显示"AI 暂不可用"，本地评分不受影响（现有降级模式） |
| 客户端/服务端评分不一致（AI/trending delta） | 用户困惑 | 沿用现有语义：客户端权威 + `serverDelta` 标注，不覆盖本地分 |
| twitterapi.io 额度用完 | trending 失效 | 服务端已降级空数组；Web 空态提示 |
| 迁移 forecast 引擎影响扩展 | 扩展预测偏差 | Phase 0 先补引擎单测（固定输入对比旧输出），再切换扩展引用 |

---

## 12. 后续规划（标注已有基础）

- [ ] Chrome 扩展与 Web 组件库更深共享（ScoreOverlay ↔ ScoreGauge/SignalBreakdown 同源）
- [ ] Web Worker 评分（防主线程阻塞；25 信号文本分析当前 <50ms，优先级低）
- [ ] 推送通知（最佳发帖时间提醒；`/api/timing` + Web Push）
- [ ] 多账号管理、团队协作
- [ ] 自学习调优：**已有基础**（`/api/cron/learn-weights` + `lib/weight-learner.ts` + `/api/cron/calibrate-forecast` + `lib/calibration.ts`），Web 侧只需把校准结果（`forecastCorrectionFactor`）接进 forecast 输入——登录用户已通

---

## 附录 A：审计发现明细（v1 → v2 修订记录）

严重度：🔴 会导致返工/线上事故 · 🟡 设计缺陷 · 🔵 遗漏/改进

| # | 严重度 | 原方案位置 | 问题 | 修正 |
|---|--------|-----------|------|------|
| A1 | 🔴 | 审计发现表、Phase 1 | `app/page.tsx` 已存在（落地页），"新建"会覆盖 | 落地页迁 `/welcome`，评分器接 `/`（§2.1） |
| A2 | 🔴 | §6.2 | 要改的 `packages/ai-checks/src/lib/anthropic.ts` 不存在；且 4 处裸 fetch 硬编码 api.anthropic.com，改 client 构造参数无效 | §6.2 统一封装替换 4 处调用点 + env 注册 |
| A3 | 🔴 | §6.4、Phase 2 | `/api/analyze` 改流式会破坏已发布 Chrome 扩展（CORS 公共契约） | 新端点 `/api/analyze/stream`（§5.2） |
| A4 | 🔴 | §1、§3.1、§10.1 | "22 信号"错误，实际 `SIGNAL_NAMES` 25 个（engagement 12 / curiosity 3 / dwell 3 / risk 7） | 全文改 25；分组按 `weights.json` bucket |
| A5 | 🔴 | §3.1 | breakdown 示例分值/分组与 weights.json 不符（dwell 归错桶、vqv 4→8、缺 share_via_dm 等 6 个信号、48/8/12 分值算错） | §3.1 按真实 bucket 重画；"B+ tier"→ Strong（tiers 实为 5 档英文 label） |
| A6 | 🔴 | §7 | 预测公式重复造轮子：扩展 `forecast-engine.ts` 已有更完整实现（区间/概率/combined/gap 门控/匿名兜底），原方案还是它的语义阉割版（+链接场景违背 v4 模型） | §7.1 整体移植共享包；§7.2 列明引擎真实语义 |
| A7 | 🔴 | Phase 2 | Auto-optimize 5 轮要"客户端实现"，但 `/api/tweets/auto-optimize` 已存在（每轮 3 变体+真实评分+停止条件） | 前端直接调用现有端点 |
| A8 | 🟡 | §5.1 | `engine.evaluate({text})` 缺 `platform/isThread/hasMedia` 必填字段，无法通过类型检查 | §4.2 给出完整调用示例 |
| A9 | 🟡 | §5.2 | 自创 `/api/scoring/score` 契约与 `TweetInput`/`ReachForecast` 双轨并行 | 端点取消，复用现有契约（§5.1/§5.2） |
| A10 | 🟡 | §6.1 | "环境变量已在 .env.local"不实；`env.ts`/`.env.example` 均无 `ANTHROPIC_BASE_URL`；模型名 "MiniMaxi Haiku/Sonnet" 错误（实际统一 claude-haiku-4-5-20251001） | §6.2 显式注册 env + 模型常量集中 |
| A11 | 🟡 | §3.1 | AI 面板 "Hook 78/结构 85/互动 72" 为虚构；真实返回 `overall 1-10 + 6 维 + hook_type + feedback` | §3.1/§6.3 按真实结构展示 |
| A12 | 🟡 | §5.3、§8.2 | `/api/trending`、`/api/timing` 标为 Mock；实际均为真实实现（twitterapi.io+缓存 / 静态研究数据+时区） | 改"真实数据 + 空态降级"；删 MOCK_TRENDS |
| A13 | 🟡 | §4.2、Phase 1 | "创建 `lib/styles.ts`"——文件已存在且更全；另建会造成第二套色板 | 统一复用并增补（§2.2） |
| A14 | 🟡 | 功能表 P2、Phase 3/4 | 登录（X OAuth+JWT）、推文追踪、评分落库、校准闭环均已存在，方案按从零描述 | §0.1 盘点；P2 改为"接数据线"（§8.1） |
| A15 | 🟡 | §3.1 | 纯文本输入让 7 个条件信号（photo_expand/vqv/quoted_*/topic_consistency/post_frequency/cont_click_dwell_time）永远"未触发"，What-if 失去意义 | TweetComposer 增加媒体开关（§3.1/§3.2） |
| A16 | 🟡 | 全文 | 缺 AI 成本控制设计：若输入路径调 /api/analyze，每 debounce 触发 3 路 LLM 并行调用 | 明确"输入零 AI 调用、AI 仅手动触发 + 匿名配额"（§3.2/§11） |
| A17 | 🔵 | §5.3 | `/api/suggest` 的 `type:'cta'` 未单独实现（落到 hook 分支） | 文档标注，不承诺 CTA（§5.2） |
| A18 | 🔵 | §4.1 | ErrorBoundary 组件 vs Next `app/error.tsx` 约定 | 改用约定文件（§4.1） |
| A19 | 🔵 | §8.1 | 账号分析 Mock 字段与真实 `AccountHealth`/`TimingResponse` 结构不对齐 | Mock 仅作 fallback 且字段对齐（§8.1） |
| A20 | 🔵 | §12 | "自学习模型调优"列为未来，实际 cron 自学习+校准已运行 | 标注已有基础（§12） |
| A21 | 🔵 | 全文 | 未提语言跟随（ai-checks `detectLanguage` en/tr）与反幻觉 prompt 约束 | §6.3 说明直接受益 |
| A22 | 🔵 | §2.2 | 颜色常量与现有 `lib/styles.ts` 命名不一致（card vs bgSecondary） | 收敛到现有文件（§2.2） |

## 附录 B：关键契约速查

```typescript
// packages/shared-types
TweetInput        { text*, platform*: 'x'|'linkedin'|'threads', isThread*, hasMedia*, mediaType?, isQuoteTweet?, quotedText?, quotedMediaType?, postsToday?, recentTopics? }
AnalysisResult    { score, baseScore: 30, tier, signalScores: Record<SignalName, SignalScore>, applicableSignals, aiSlopScore, suggestions, highlights, isServerEnhanced, trendingAlignment? }
SignalScore       { signal, type: 'positive'|'negative', bucket: 'engagement'|'curiosity'|'dwell'|'risk', score, max, applicable, firedRules, subRules, suggestion? }
ReachForecast     { predictedReach, reachLow, reachHigh, vsAverage, replyProbability, bookmarkProbability, viralChance, scenarios: WhatIfScenario[], confidence, dataPoints, isEstimate }
AccountHealth     { healthScore, reachMultiplier: 0.6-1.3, factors[], isPremium, followerCount, avgEngagementRate, forecastCorrectionFactor? }
TimingResponse    { currentStatus: 'good_now'|'better_later'|'off_peak', message, nextWindowLocal, weeklyWindows, heatmap: number[7][24], timezone }

// weights.json v4.1.0：25 信号 · baseScore 30 · tiers 0-20/21-40/41-60/61-79/80-100
// 端点：analyze(POST) · suggest(POST) · tweets/auto-optimize(POST) · timing(GET/POST) · trending(GET) · account-health(GET, 需登录)
// 鉴权：X OAuth → JWT cookie `reachos_token`；限流：applyRateLimit(userId ?? IP)
```
