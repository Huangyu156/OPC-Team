# 流式输出特效：上游实现 vs 本地链路 · 差距与接入方案

| 项 | 值 |
|---|---|
| 上游 | `dsh-claude-style` v0.16.3，本地 `.upstream-ref/`（只读） |
| 本地 | `claud-skin` worktree，`src/web-ui/src/flow_chat` + `src/web-ui/src/infrastructure/markdown` |
| 范围 | 只做「回答的流式输出」：打字/淡入/光标/分块渐现/滚动跟随 |
| 状态 | 调研结论 + 接入清单；**未改任何代码** |
| 日期 | 2026-10-19 |

## 0. 一句话结论

**上游的"打字感"不是打字机**，是**字符到达时的 alpha 渐现**（CSS Custom Highlight + 24 级步进 + 1–8ms 级联延迟）；本地已经有同一套底层（`useStreamingTextReveal`，32 级 / 160ms），**并且额外叠了一个真实的打字机（`useTypewriter`，90–720 cps）**。两者同时跑才是今天的观感差距所在：上游"字符立刻出现但慢慢变实"，本地"字符被拖慢出现，出现后又再淡入一次"。

上游唯一的"光标"是 **composer 的 overlay 光标**（`features/caret/caret.ts`，516 行，量 contenteditable 的折叠 Range 画一个元素），**回答正文里上游没有光标**。本地唯一的流式光标是 `MermaidBlock.tsx:173` 的 `█`。

---

## 1. 上游：文件、行号与机制

### 1.1 `features/chat-reveal/` —— 到达渐现引擎（核心）

| 文件 | 行 | 机制 |
|---|---|---|
| `chat-reveal.ts` | 20–46 | 安装器。`motionReduced()` 为真时**不装载**；`subscribePrefs` 变化时把引擎**拆掉**（不是 CSS 隐藏），并撤掉 `data-dsh-claude-chat-reveal` 标记 |
| `reveal-engine.ts` | 61–163 | `createChatRevealEngine()`。缺 `CSS.highlights` / `Highlight` 直接 `return null`（能力降级）。把已在页面的 `[data-streaming]` 先记为 history（不回放）。`revealYield()` 让路逻辑在 `reveal-paint.ts:40` |
| `reveal-diff.ts` | 21–93, 111 | `commonHead/commonTail/commonPrefix/commonSuffix/sliceText` + `createRevealScanner`。**只有真正追加的可见后缀**才产生 arrival；重写走 diff 预算（`CHAT_REVEAL_REWRITE_DIFF_BUDGET = 4096`，`LOCAL_REWRITE_LIMIT = 64`） |
| `reveal-paint.ts` | 28–202 | `createRevealPainter(state, {clearHighlights, showStep, publishRunColor})`。`scheduleFrame()`:49 → `requestFrame({write})`（`engine/src/frame.ts`，一帧内 read 全跑完再 write 全跑完）。每段有 `bornAt / delay / age`，按 age 落桶。慢帧让路：`SLOW_FRAME_MS = 50` 连续 `4` 帧 → `revealYield()` 3s |
| `reveal-highlights.ts` | 10–48 | 每个 step 一个 `Highlight` 对象，**注册一次，之后只换 range**（避免每帧重建 marker）。空 step 调 `clear()` 而不是 `delete()` |
| `reveal-params.ts` | 15–57 | `CHAT_REVEAL_MS` 从 motion token 读；`STAGGER_DIVISOR 50`、`MIN_STAGGER 1ms`、`MAX_STAGGER 8ms`——**同批字符之间真的错开 1–8ms**；`BURST_LIMIT 10000`、`FIRST_SIGHT_LIMIT 200`、`FRAME_GAP_MS 40`、`NOMINAL_FRAME_MS 16.7` |
| `constants.ts` | 141–153 | `CHAT_REVEAL_ATTR`、`CHAT_REVEAL_STEPS = 24`、`CHAT_REVEAL_MIN_OPACITY = 0.2`、`CHAT_REVEAL_HIGHLIGHT_PREFIX = 'dsh-claude-tok-'`、`CHAT_REVEAL_COLOR_VAR` |
| `scripts/feature-sheets.mjs` | 43–54 | **样式是构建期生成的**：步 0 → 20% alpha，末步 → 100%，作用域 `[CHAT_REVEAL_ATTR] [data-streaming]`（含子元素两条选择器）。用 `color-mix(in srgb, var(--run-color, currentColor) N%, transparent)`——**只降 alpha，不改色相**（`::highlight()` 不支持 `opacity`） |

### 1.2 `features/chat-follow/` —— 滚动跟随 + 流式滑移

| 文件 | 行 | 机制 |
|---|---|---|
| `chat-follow.ts` | 45, 180, 204, 220, 268, 332 | 流式期间给**流列**跑一条 `Animation`（transform 滑移）吸收增长，宿主自己的跟随不被中断；`slideWanted()` 读 `data-chat-following-tail`；`slideCarried()` + `grew`，上限 `SCROLL_EASE_LEAD_PX`（1200px）；`slideSync()` 用 ResizeObserver 驱动 |
| `chat-follow.ts` | 476–477 | `createChatProcessFollow()` + `FOLLOW_TAIL_ATTR` 标记 |
| `engine/src/scroll-owner.ts` | 186, 226, 339, 442 | `readerHolds` / `submissionHolds` / `joinScrollOwner` / **`handBackFollow`**（交还位置，且 `HAND_BACK_MIN_INTERVAL` 节流，防止一串 tool call 把位置钉死） |
| `engine/src/scroll-ease.ts` | 63, 98, 112, 133, 156 | `SCROLL_EASE_LEAD_PX = 1200`；`stepSpring(position, velocity, target, seconds)` **带速度的弹簧**；`springArrived`；`easeScroll` / `stopScrollEase` |

### 1.3 `features/chat-wait/` —— 等待行

`wait-loader.ts:263 startWaitLoader`，`WaitLoaderMotion = 'bounce' | 'line' | 'orbit'`（`:30`）；`running-owner.ts:4 foreignRunningLineOwns` 防串线；`chat-wait.css`（530 行）负责文案轮换 + 时钟 + 钉住关系。

### 1.4 `features/caret/` —— composer 光标（**非正文**）

`caret.ts` 516 行：`CARET_ATTR / CARET_HOST_ATTR / CARET_LAYER_ATTR / CARET_MOTION_OFF / CARET_VISIBLE_ATTR`（`:1`），靠 MutationObserver 监听 `contenteditable`/`data-composer-input`（`:196`），量 collapsed Range 后绝对定位一个图层；`read() === CARET_MOTION_OFF` 时完全不动画（`:175`, `:356`）；`document` 级 capture 滚动跟随（`:463`）。**这是输入框光标，回答正文没有光标。**

### 1.5 动效偏好

`core/prefs.ts:148 writeMotionAttribute(mode)`：只往下写**已解析**的两种答案到 `data-dsh-claude-motion`（`MOTION_FULL` / `MOTION_REDUCED`），因为"样式表无法改写自己的 media query"（注释原文）。`:139 systemPrefersReducedMotion()`、`:177 motionReduced()` 读回三元态（`auto` 时回落到 media query）。`:158 refreshMotionAttribute()` 只在解析结果**真的变了**才通知订阅者。

---

## 2. 本地：`src/web-ui/src/flow_chat` 流式链路

### 2.1 完整链路

```
ACP/peer 事件
  → EventBatcher                     services/EventBatcher.ts
      DEFAULT_EVENT_MAX_LATENCY_MS = 100   (:20)
      TEXT_CHUNK_MAX_LATENCY_MS     = 32   (:26)
      key = text:{session}:{round}:{type}:{reasoningKind}:{attempt}
  → flow-chat-manager/TextChunkModule  → FlowChatStore 文本条目 (isStreaming / status)
  → FlowTextBlock                     components/FlowTextBlock.tsx
      useTypewriter                     hooks/useTypewriter.ts
      MarkdownRenderer                  infrastructure/markdown/MarkdownRenderer.tsx
        useStreamingTextReveal          infrastructure/markdown/useStreamingTextReveal.ts
  → TimelineContentBlock / ModelRoundItem (data-streaming, 揭示门)
  → VirtualMessageList  (@tanstack/react-virtual)
      useFlowChatFollowOutput           components/modern/useFlowChatFollowOutput.ts
      flowChatTailFollow                components/modern/flowChatTailFollow.ts
```

### 2.2 打字机 `hooks/useTypewriter.ts`（406 行）

| 行 | 内容 |
|---|---|
| 47 | `safeGraphemeRevealEnd` —— `Intl.Segmenter` 优先，回落码点，**不切 emoji/ZWJ** |
| 83–113 | `BASE 90 cps` / `ACCEL 2 per backlog` / `MAX 720 cps` / `FINISH 2400 cps` / `MAX_CHARS_PER_PAINT 18` / `FINISH 64` / `MIN_PAINT_INTERVAL 16ms` / `FINISH 8ms` |
| 129 | `replayOnMount` **默认 false**：虚拟列表滚出去再滚回来会重挂，回放会读成"会话自己刷新" |
| 229–230 | `isRevealing = !revealImmediately && !prefersReducedMotion && (animate \|\| displayText.length < targetText.length)` |
| 240 | `revealImmediately \|\| prefersReducedMotion \|\| pageIsHidden` → 直接跳到全文（`:253` 还刻意避免在折叠态每块都 setState） |
| 278–288 | `animate` 翻假但还没追平时**继续排空**，绝不 snap |
| 290–362 | tick：`dt` 钳到 ≤100ms，`fractionalCarry` 累加，`commitTypewriterReveal` 出整数步进 |
| 369–376 | `matchMedia('(prefers-reduced-motion: reduce)')` 独立监听 |
| 378–394 | `visibilitychange` → 立刻追平 |

### 2.3 到达渐现 `infrastructure/markdown/useStreamingTextReveal.ts`（210 行）

这是本地**已经存在**的、与上游同构的实现：

| 行 | 内容 |
|---|---|
| 3 | `STREAMING_TEXT_REVEAL_MS = 160`；`LEVELS = 32`；`NAME = 'opc-stream-reveal-'` |
| 36 | `readRuns(root)` —— TreeWalker 跳过 `button` / `[aria-hidden]` / `.katex-mathml` |
| 114 | `reduced = matchMedia('(prefers-reduced-motion: reduce)').matches` → 直接 `stop()` |
| 129 | **只有 `streaming && appended && current.text.startsWith(before.text)`** 才记 arrival |
| 137–157 | 每次 content commit **只解析一次 range**（二分找 run），帧里只搬桶 |
| 172 | `level = floor((1 - (1-p)^2) * 32)` 二次缓出 |
| 183 | 注释记录实测：把作用域收到真正到达的父元素，两次开屏 style 从 128.3/223.3ms → 45.4/61.4ms |
| 198–208 | `prefers-reduced-motion` / `visibilitychange` → `clear()` |

CSS：`infrastructure/markdown/Markdown.scss:610–616`
```scss
@for $level from 0 through 31 {
  [data-stream-reveal-active]::highlight(opc-stream-reveal-#{$level}) {
    color: color-mix(in srgb, currentColor #{20% + $level * 2.5%}, transparent);
  }
}
```

### 2.4 单个文本块 `components/FlowTextBlock.tsx`（253 行）

| 行 | 内容 |
|---|---|
| 22 | `CONTENT_IDLE_TIMEOUT = 500` —— 内容 500ms 不动就认为流结束 |
| 94–97 | `useTypewriter(content, isStreaming, {replayOnMount})` + `useReportTypewriterReveal(id, isRevealing)` |
| 100 | `isVisuallyStreaming = isStreaming \|\| isRevealing` |
| 103–121 | `markdownStreaming` **延迟两帧**才落，避免 Prism 升级与 footer 插入同帧闪 |
| 158 | `isActivelyStreaming = (isStreaming && isContentGrowing) \|\| isRevealing` |
| 160–163 | `parsedContent = useMemo(() => parseDeepResearchContent(displayContent), [displayContent])` ← **每个打字机 tick 都重算** |
| 217–225 | `data-streaming` / `data-opc-state` 落点（这就是皮肤可用的作用域锚） |
| 238–253 | memo 比较器 |

### 2.5 揭示门 `hooks/typewriterRevealGateContext.ts` + `TypewriterRevealGate.tsx`

`report(key, revealing)` + `isAnyRevealing`；`TimelineContentBlock.tsx:45,52` 用 `gate.isAnyRevealing` 决定 `data-streaming`，`ModelRoundItem` 的 footer 靠它等视觉收尾。

### 2.6 滚动跟随 `components/modern/useFlowChatFollowOutput.ts`（319 行）

| 行 | 内容 |
|---|---|
| 阶段 | `reading → pending-send → awaiting-output → following` |
| `run.current` | 每帧算 `reachableTarget = min(target, scrollHeight - clientHeight)`，`easeFollowOffset(from, target, elapsed)` |
| `flowChatTailFollow.ts:49` | `easeFollowOffset` = 纯指数、时间常数 **65ms**、无过冲 |
| `flowChatTailFollow.ts:4,45` | `resolveAnimatedJumpBehavior` ≤ 3 屏才 `smooth` |
| `available()` | `isViewportActive && !isViewportSuspended() && !document.hidden && clientHeight > 0` |
| `viewportOwner.claim/release` | one-shot-navigation / user-gesture / follow-output 之间的写入仲裁 |

### 2.7 本地已有动效基础设施

- `shared/utils/motionPreference.ts:58 isReducedMotionPreferred()`、`:67 getMotionAwareScrollBehavior()`（`smooth` → 减动效时降 `auto`）、`:23 recordInteractionModality` / `:39 installInteractionModalityTracking`（指针 vs 键盘）。
- design tokens：`design-system/packages/design-tokens/scripts/build.mjs:155–165` 在 `@media (prefers-reduced-motion: reduce)` 下把 `--opcteam-motion-duration-{fast,normal,content-swap,slow,loop}` 全置 `0ms`。
- `app/styles/motion.scss`：`data-motion="interactive|view|popup|presence|overlay|none"`，fallback 选择器一律 `:where()`（零特异性）。
- 虚拟行内**刻意杀掉挂载动画**：`components/modern/VirtualItemRenderer.scss:106 animation: none`（注释：行每次进渲染窗都会重挂，淡入读成"整段在闪"）、`components/FlowTextBlock.scss:25 &.streaming .markdown-renderer { animation: none; }`。
- 唯一 WAAPI 入场：`useSubmittedMessageMotion.ts`（用户消息送达，非流式），带完整 reduced-motion / visibility / 焦点 / abort 收尾。

---

## 3. 差距对比

| # | 维度 | 上游 | 本地 | 差距性质 |
|---|---|---|---|---|
| **G1** | 同批字符的错开 | `STAGGER 1–8ms`，每段有独立 `delay`（`reveal-params.ts:17–21`） | 同一批（32ms flush 内的全部字形）共享一个 `at`，整批同步淡入 | **观感差距主因之一**。一次 90 字的 flush 在上游是"梯子"，在本地是"一次齐闪" |
| **G2** | 谁拥有"速度" | 只有到达渐现；文本**立即**全量进 DOM | 打字机（限速 90–720 cps）**再叠**到达渐现 | **双重动画**。`useTypewriter` 每 16ms 改一次 `content` → `useStreamingTextReveal` 的 `source` 每 tick 变 → arrival 窗口以 16ms 为节奏重启。必须二选一 |
| **G3** | 增长吸收 | transform 滑移流列（`chat-follow.ts:180–332`），宿主跟随不被打断 | 无滑移，每帧 `scrollTop` 由 `easeFollowOffset` 写 | 本地用 rAF writer 换取了 UI 树不可变；虚拟列表已按此设计，不构成缺陷 |
| **G4** | 缓动形状 | 带速度的弹簧 `stepSpring`（`scroll-ease.ts:98`）+ 1200px lead | 指数、65ms 常数、目标钳到可达位置 | 本地无速度状态；长距离跳转不如弹簧"有惯性"，但对 ResizeObserver 中途夹紧更稳 |
| **G5** | 动效偏好 | **已解析三元态**镜像到 `data-dsh-claude-motion`（`prefs.ts:148,177`） | 三个 hook 各自 `matchMedia`（`useTypewriter.ts:77,371`；`useStreamingTextReveal.ts:114,198`；`useFlowChatFollowOutput` 走 `motionPreference`） | 无单一真值源；皮肤无法继承"强制精简"设置 |
| **G6** | 光标 | composer overlay（`caret/caret.ts`） | 原生 `caret-color`（`RichTextInput.scss:24`）；正文无光标（仅 `MermaidBlock.tsx:173` 的 `█`） | 上游**也没有**正文光标；「正文打字光标」是新设计，不是复刻 |
| **G7** | 等待行 | `chat-wait`：文案轮换 + 3 种 loader 运动 | `RuntimeStatusSlot` + i18n 提示轮换（`stableHintIndex`） | 本地缺 loader 形态，不缺轮换 |
| **G8** | 大消息体 | 无打字机 → 每次 flush 只重解析一次 | `parsedContent` 依赖 `displayContent`，**每 tick 重算解析**（`FlowTextBlock.tsx:160`） | **本地独立于皮肤的最大性能缺口** |

---

## 4. 接入方案

### 4.1 分层裁决（需要拍板的一条）

**先决定谁是"速度"的所有者**，其余都在它之后：

- **方案 A（保留打字机，渐现只做质感）**：`useTypewriter` 继续限速；`useStreamingTextReveal` 的 `delay` 由**打字机自己的 commit 序号**推导（第 n 次 paint 的字符 → `delay = clamp(n*1ms, 1, 8)`），不引入第二个时钟。改动最小，观感 = 今天的节奏 + 更柔的边缘。
- **方案 B（上游忠实：去掉打字机）**：文本 markdown 走 `replayImmediately` 语义，速度交给 32ms 的 EventBatcher flush，渐现承担全部"打字感"。更接近上游，但**回答出现速度会明显变快**——这是产品决策，不是技术决策。

建议 A 作为默认，B 作为可切设置（`data-opc-motion` 上的粗/细两档）。

### 4.2 钩点清单（按层，自下而上）

| 层 | 文件 | 动作 |
|---|---|---|
| **L0 偏好** | `src/web-ui/src/shared/utils/motionPreference.ts:58` 旁边 | 新增 `resolveMotionMode(): 'full' \| 'reduced'` + 写 `data-opc-motion` 到 `documentElement`，`matchMedia('change')` 时重解析（对照 `prefs.ts:148,158`）。三处读这一处 |
| **L1 渐现** | `infrastructure/markdown/useStreamingTextReveal.ts:129–157` | 给 `Arrival` 加 `delays: number[]`（按 run 序号 × stagger），`:178` 的桶计算改成 `now - arrival.at - delay`。保持"每 commit 只解析一次 range"（`:137`）不变 |
| **L1 CSS** | `infrastructure/markdown/Markdown.scss:610` | 步数**保持 32**（不要再加，样式成本已在注释里量化）。若要更细腻，改 `STREAMING_TEXT_REVEAL_MS` 而不是步数 |
| **L2 打字机** | `hooks/useTypewriter.ts` | 只读 L0 的解析结果替换 `:77` 与 `:369`；新增 `burstImmediateChars`（默认 4000）：`backlog > N` 时走 `revealImmediately`，专治远程重连后的一次性大回灌 |
| **L3 揭示门** | `hooks/typewriterRevealGateContext.ts` | 无需改；但 UI 侧等待必须带上 `burstImmediate` 语义，否则重连后 footer 会被拖住 `backlog/720` 秒 |
| **L4 滚动** | `components/modern/useFlowChatFollowOutput.ts` | **不改**。若日后要上游式滑移，必须以**第四个 `viewportOwner`**（`claim('stream-slide')`）接入，且只作用于 `VirtualMessageList.tsx:2290` 的 `data-streaming-output='true'` 且是最后一行；不要给整个列表加 transform |
| **L5 等待行** | `components/modern/RuntimeStatusSlot.tsx` | 可加 loader 形态，但 `chat-wait.css` 的钉住关系依赖宿主属性，本地要先有等价锚 |
| **L6 光标** | **不做** | `caret.ts` 是 contenteditable overlay；正文加 `█` 会污染 `user-select: text` 与复制内容（`Markdown.scss:32` 明确 `cursor: text; user-select: text`） |

### 4.3 与现有增量更新 / 虚拟滚动的协同（硬约束）

1. **不新增行级淡入**。`VirtualItemRenderer.scss:106` 与 `FlowTextBlock.scss:25` 的 `animation: none` 是**结论**不是疏忽：行每次进入渲染窗都会重挂。任何新动效必须挂在 `useStreamingTextReveal` 的 paint 层（Range/Highlight，不动布局）或 WAAPI（`useSubmittedMessageMotion` 模式），**不能**用 CSS keyframe 挂在行容器上。
2. **不改 `useTypewriter.ts:129` 的 `replayOnMount` 默认值**。上游没有虚拟列表，本地有；回放会读成"会话刷新"。
3. **不碰 `EventBatcher` 的分批**。`TEXT_CHUNK_MAX_LATENCY_MS = 32` 是打字机的水源节奏，改它等于同时改打字机与渐现两个系统的输入分布。
4. **滚动写入只能有一个胜者**。已由 `viewportOwner` 仲裁；新的动效若要动滚动，必须走它，不得直接写 `scrollTop`。

### 4.4 动效降级（prefers-reduced-motion）

- **必须**：`matchMedia` 结果变化时**拆引擎**而不是 CSS 隐藏（上游 `chat-reveal.ts:32–35` 的做法）。本地 `useStreamingTextReveal.ts:198` 已有等价实现，新增的 stagger 必须一并走 `clear()`。
- **必须**：`document.hidden` 时同样跳过（两处已有）。
- **应当**：`documentElement` 上的 `data-opc-motion` 同时驱动 design token 的 `0ms`（`build.mjs:155`）与 JS 侧解析，避免"CSS 停了、JS 还在算"。
- **不要**：用 `motion: always`（强制播放）覆盖系统偏好。上游有这条路（`MOTION_FULL`），本地没有对应设置项；引入它需要先有设置入口与 i18n 键。

### 4.5 性能

| 关注点 | 现状 | 结论 |
|---|---|---|
| Range 解析 | 每 content commit 一次（`:137`） | **保持**。加 stagger 只增加桶数，不增加 TreeWalker 次数 |
| `::highlight` 规则数 | 32 条（`Markdown.scss:610`） | 已接近上限；不再增加。每条都靠 `[data-stream-reveal-active]` 收窄，`:183` 有实测依据 |
| 解析重算 | `FlowTextBlock.tsx:160` 每个打字机 tick 重算 `parseDeepResearchContent` | **先修这个**（与皮肤无关）：把 `displayContent` 的解析按"已稳定的前缀"做缓存，或让打字机的 `displayContent` 只在段落边界变 |
| 帧预算 | `useTypewriter` 已限 18 字/帧、16ms 间隔；渐现 160ms/32 级 | 叠加时最坏 2× 文本节点改写/16ms；采用 §4.1 方案 A 后消失 |
| 慢帧 | 上游 50ms×4 帧 → 让路 3s（`reveal-paint.ts:78–82`，`revealYield()` 在 `:40`） | 本地无让路。**建议移植**：连续慢帧时清空 arrivals，只保留高亮收尾 |

### 4.6 大消息体

- 触发点不是字数而是**单次 flush 的字形数**。上游 `BURST_LIMIT = 10000`、`FIRST_SIGHT_LIMIT = 200`（首次见到就不回放）。
- 本地需要两条阈值：`ARRIVAL_BURST_LIMIT`（超过则整批不建 arrival，只做一次整体淡入）与 `FIRST_SIGHT` 语义（已有：`:129` 的 `appended` 判断天然排除首次挂载）。
- 长答案的正文复制/选择：Range 方案不插入 span，`user-select` / `selection` 不受影响，这点上游与本地一致，**必须守住**。

### 4.7 远程会话

| 场景 | 风险 | 处理 |
|---|---|---|
| Peer 重连回灌（`PeerSessionRefreshModule`） | 一次性到达数千字；打字机按 720 cps 爬 → footer 被揭示门拖住数十秒 | §4.2 的 `burstImmediateChars`：超过阈值走 `revealImmediately` |
| 重放（cursor replay） | `content` 可能是**替换**而非追加 | 已有 `:129` 的 `startsWith` 守卫 → 不产生 arrival，正确 |
| 后台会话（dispatch / 远端控制器） | `document.hidden` 时 rAF 停 | 两处已有 visibility 处理；不要在隐藏时排 rAF |
| 跨版本 | 皮肤只是 CSS 层 | 属性锚（`data-streaming`、`data-stream-reveal-active`、`data-opc-motion`）是唯一契约，不新增持久化字段 |

---

## 5. 落地清单（按提交粒度）

1. `shared/utils/motionPreference.ts`：`resolveMotionMode()` + `data-opc-motion` 镜像 + change 监听；`useTypewriter` / `useStreamingTextReveal` 改读它。验证：`pnpm run check:web`、`pnpm run motion:audit`。
2. `useStreamingTextReveal.ts`：per-run `delay`（1–8ms）+ `ARRIVAL_BURST_LIMIT` + 慢帧让路。验证：`pnpm --dir src/web-ui run test:run src/infrastructure/markdown/useStreamingTextReveal.test.tsx`（已有 appended-only / 独立时钟 / 重挂稳定 / 减动效 四类断言，扩写 stagger 与 burst 用例）。
3. `useTypewriter.ts`：`burstImmediateChars`。验证：`pnpm --dir src/web-ui run test:run src/flow_chat/hooks/useTypewriter.test.ts`。
4. `FlowTextBlock.tsx:160`：解析缓存（独立收益，建议单独提交）。验证：`FlowTextBlock.test.tsx`、`markdownParseCache.test.ts`。
5. 皮肤侧：把 `data-opc-motion` 纳入 `opc-claude-style` / `opc-claude-night` 派生，只读属性，不新增 token。

**不做**：正文光标、列表行级淡入、`EventBatcher` 分批调整、滚动滑移（除非先接线第 4 个 `viewportOwner`）。

---

## 6. 复现命令

```bash
# 上游（只读）
sed -n '1,60p' .upstream-ref/packages/client/src/features/chat-reveal/reveal-params.ts
sed -n '25,60p' .upstream-ref/scripts/feature-sheets.mjs

# 本地
sed -n '76,120p' src/web-ui/src/flow_chat/hooks/useTypewriter.ts
sed -n '110,200p' src/web-ui/src/infrastructure/markdown/useStreamingTextReveal.ts
sed -n '605,620p' src/web-ui/src/infrastructure/markdown/Markdown.scss
```
