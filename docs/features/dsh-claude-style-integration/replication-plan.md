# dsh-claude-style 深度复刻与完全兼容：总体方案

分支：`claud-skin`（worktree `H:\智能体开发\OPC-Team\.dsh\gitworktree\claud-skin`）
上游：`https://github.com/Nwflower/dsh-claude-style` v0.16.3（本地检出 `.upstream-ref/`）
状态：方案评审稿，未写实现代码。

配套文档：

- [visual-contract.md](visual-contract.md) — 视觉契约与 token 账
- [interaction-contract.md](interaction-contract.md) — 交互契约（模型选择器 / 思考强度 / 流式）
- [streaming-motion-gap.md](streaming-motion-gap.md) — 流式动效差距与接入
- [model-effort-controls-gap.md](model-effort-controls-gap.md) — 两个控件的逐行差距
- [skin-architecture-options.md](skin-architecture-options.md) — 架构选型 ADR-000
- [spec.md](spec.md) / [ui-adaptation-guide.md](ui-adaptation-guide.md) — 上一版浅层兼容的既有产物

---

## 1. 上一版为什么"只是换了颜色"

三条根因，都不在配色本身：

1. **上游不是主题包，是运行时皮肤插件。** `.upstream-ref/skin.json` 声明 `bodyAttr: data-dsh-claude-style`，`packages/client` 45,772 行 / 308 文件 / 27 个 feature，靠 bundle patch + DOM 观察总线改造宿主 DOM；`packages/host` 还有宿主 Node 服务。上一版只搬了 `theme/tokens.json`（801 行）与部分 CSS，等于只搬了上游的一层。
2. **本项目的外观体系是"数据 + 投影"，不是"CSS 覆盖"。** 内置外观走 `composeAppearancePackage` 产出 `schemaVersion: 2` 包（含 `globals.lengths/durations/easings`、`renderers`）。只改颜色常量时，结构、动效、控件形态三类差异根本没有出入口。
3. **三个被点名的缺口都在组件 owner 里，不在外观数据里。** 模型选择器、强度滑杆、流式特效分别是 `flow_chat/components/**` 与 `flow_chat/hooks/**` 的职责。

---

## 2. 架构选型（ADR-000，已定）

按"差异可表达性"分层，成本由层决定而非代码量：

| 层 | 上游差异 | 现有体系 |
|---|---|---|
| L0 配色/字重 | 面色阶、暖描边 | ✅ 已覆盖 |
| L1 外观数据 | focus 取 primary、行内代码面色、暖灰滚动条 | ⚠️ 缺 3 个 palette 字段 + 2 行 `link` 投影 |
| L1′ 结构化外观 | 0.5px hairline、radius 4/16、shadow-lv2、动效时长缓动 | ⚠️ Style IR 已能表达，缺 part 覆盖与 property profile |
| L2 组件结构 | 两个 seat、真滑杆、流式阶梯渐现 | ❌ 需逐 owner 改动 |
| L3 DOM+JS 运行时 | bundle patch、DOM 总线、宿主 Node 服务 | ❌ 且不该由皮肤承担 |

**结论：采用 B「移植为本地皮肤层」，否决 A「上游即插件」，推迟 C「组件契约 v2」。**

- A 被否决的硬理由：把 DSH 注入模型搬进产品，与"平台无关产品逻辑 + 平台适配器"直接冲突；绕过外观编译器形成审计盲区；remote 四场景全失效（DOM 需真浏览器，detached 无宿主）；双配置源且选择器随上游 DOM 变更即碎。
- C 推迟的理由：Rule of Three —— 第 2/3 个皮肤需求出现前，抽象成本高于收益；且契约 v2 本身会变成持久化形状，需要能力协商。
- B 的可逆性最高：回滚 = 删 builtin 条目 + 恢复常量，无迁移、无跨版本协议。

分工红线：**皮肤只做数据与投影；控件与动效属于产品 feature，走各自 owner。** L3 功能混入即为评审红线。

---

## 3. 四个工作流

### 3.1 视觉（P0/P1）

上游真实数值来自 `.upstream-ref/packages/client/src/theme/tokens.json`（`docs/STYLE.md` 是生成物），不是从截图猜的。

- 复用约 40 个现有 token；新增 **3 个可选 palette 字段**（`background.input`、`focus.ring`、`markdown.inlineCode`，全部带 `??` 回退 → 其余 9 个 appearance 生成物逐字不变）。
- 新增**至多 3 个语义 token**，全部在 `markdown.*` 族（171 个现有 token 里完全没有这一族）。
- 圆角：上游 4/8/16 与本地**仅被投影的三个** radius token 一一对应 → `sm 6→4`、`lg 12→16`，`base 8px` 已对齐。

三处明确违反上游规则、建议直接修正：

1. **focus 用 accent 是错的。** `buildBuiltinAppearance.ts:183`（及 `:275` 的 chrome 分支）把 `color.focus.ring` 投成 `accent[500]`；上游 `STYLE.md:236-244` 原文 "Accent is never used for focus strokes"，light 用 espresso `#141413`、dark 反转为亮 ivory。而且本地设计系统 light 自己的 `color.focus.ring` 本就是 `neutral.650` —— 是 Claude palette 把它改坏的。改回 primary 文字色后，对比度余量从 3.04 贴线变为 ≈18。
2. **正文链接是 cyan。** `color.link.*` 在 171 个 token 里存在（`{ref.color.cyan.500}`），但 `buildBuiltinAppearance.ts` 从不投影它 —— 加 2 行即可。
3. **CTA 标签不达 AA。** 上游 `#faf9f5` = 2.96:1、本地 `#ffffff` = 3.12:1 均 FAIL；`#141413` = 5.90:1 PASS。按硬门处理。

侧栏有实测倍数差距：canvas 两套逐字命中源码（`#fcfcfb` / `#141413`，覆盖率 100%），但 light 侧栏 `#f0efe6` ↔ 画布距离 **27.5**，上游 `#fbfbf9` ↔ `#fcfcfb` 只有 **2.4**，约 11 倍。dark 侧栏 `#0e0e0f`、菜单 `#1c1c1f`、empty-row `#151415` 三处 **B>R**，违反"无冷灰"。

**ratchet 账（关键机制，§7.2 "rung 律"）：** 半透明叠色的 near 对**全部**来自 `alphaDiff=0.02~0.03` 的相邻 rung；描边梯（≥0.05）本来 0 对。实算：light element 五档 `[3,5,8,11,15]%` → 3 对，三档 `[3,8,14]%` → 0；dark ivory 同 3→0；dark 白杂项 `[5,6,8,9]%` → 5，`[5,9,18,30]%` → 0。可释放 **−11**，新增面色阶花 **+8**，**净 −3**（near 债务 7→4）。

### 3.2 模型选择器 + 思考强度滑杆（P2）

差距不是配色调尺寸，而是**拓扑**：上游两个 seat（模型触发器 + 独立强度触发器），本地一个按钮内嵌。

上游：`features/model/model-picker.ts`（702 行，`modelSlotOf` :36 隐藏宿主 seat、自建卡片 :443）；`features/effort/effort-picker.ts`（468 行，卡片 `side:'above', gap:6` :133，滑块只构建一次 :259，release 才关 :270）；`features/effort/control.ts`（669 行，`role="slider"` :109，`fill/ticks/matrix/knob` :90-93，`DETENT 0.8` :296，阻尼 :308，`aria-valuemin/now/valuetext` :430-433，commit :447）；`features/effort/ladder.ts`（73 行，`none0…ultra8` + `orderEffortIds`）；`features/effort/room.ts`（43 行，`reserveEffortRoom` 给模型名让出溢出）。

本地：`flow_chat/components/ModelSelector.tsx`（2373 行）—— 死 prop `reasoningTriggerPresentation` **:139**（全文件仅此一处，从未被读取），行内强度摘要 `part="reasoningSummary"` **:2016-2026**，强度块 `__reasoning-control` **:2314-2328**；`ReasoningIntensityControl.tsx`（283 行）根 `part="reasoningSlider"` :160、`SegmentedControl` :219；挂载点 `ChatInput.tsx:7104-7125`（`:7123` 传了那个死 prop）。

交互契约要点（IC-M / IC-E1~E7）：

- 强度获得**独立触发器**，位于模型触发器**左侧**（右侧紧邻语音与发送，照抄上游会把强度挤到语音之后）。
- 形态由数据决定：**全部可排名且 ≥3 档**才用滑杆；含 `budget`/`custom`/`request_patch` 退回现有分段控件；无 preset 则不出现。这条是对上游的偏离，因为本地 preset 是异构 actions 而非线性阶梯。
- 按强度表重排后**回填原槽位**（未知项保槽位），否则档位会左右颠倒；自动档固定第一档且不参与线性读法。
- 拖拽在 settle 提交；键盘走 200ms 尾随合并 + 最新值挂起位；超时释放回落。
- `role="slider"` + 方向键/Home/End/PageUp/PageDown，ARIA 四属性随值同步，`empty` 时移除并置 `aria-disabled`。

文件动作：

- 新建 `ReasoningEffortTrigger.tsx`(+scss/appearance)、`ReasoningEffortSlider.tsx`(+scss)、`hooks/useReasoningSelection.ts`、`utils/effortLadder.ts`(+test)。
- 重写 `ReasoningIntensityControl.tsx/scss` 为 inline 变体包装 —— **保留 testid 与 `part` 名**，避免打爆现有 4 个测试文件。
- 修改 `ModelSelector.tsx`（让 :139 prop 生效、降级或删除 :2314-2328）、`ChatInput.tsx:7104-7125`（挂 seat + 注入单例 hook）、两个 `.appearance.ts`、`registry:17`。
- 删除死代码 `ReasoningPresetSelector.tsx`（258 行，唯一引用 `defaultAppearanceRegistry.ts:17`）—— 清理前确认无接线计划。

token 落点：复用 `content-*` / `surface-raised` / `border-*` / `accent-default` / `focus-ring` / `radius-pill` / `space-*` / `motion-*`；**不新增 palette 字段、不动 near-pair 基线**；focus **不得用 accent**。

### 3.3 流式输出特效（P2）

**上游没有打字机。** 它的"打字感"是字符到达时的 alpha 渐现：CSS Custom Highlight + 24 级步进（20%→100% alpha）+ 同批字符错开 1–8ms，样式由构建期生成（`.upstream-ref/scripts/feature-sheets.mjs:43-54`），只降 alpha 不改色相（`::highlight()` 不支持 `opacity`）。上游回答正文**没有光标**；唯一的 `caret.ts`（516 行）是 composer 的 contenteditable overlay。

本地已有同一套底层 `infrastructure/markdown/useStreamingTextReveal.ts`（32 级 / 160ms / `color-mix`），**并且额外叠了一个真打字机** `flow_chat/hooks/useTypewriter.ts`（90–720 cps）。差距在这四点：

| 差距 | 上游 | 本地 |
|---|---|---|
| 同批错开 | `STAGGER 1–8ms`（`reveal-params.ts:17-21`） | 32ms 内整批**同步**淡入 → 一次闪，不是阶梯 |
| 速度归属 | 只有渐现，文本全量即刻进 DOM | 打字机限速**再叠**渐现 → 双重动画 |
| 动效偏好 | 三元态落 `data-dsh-claude-motion`（`prefs.ts:148,177`） | 三个 hook 各自 `matchMedia`，无单一真值源 |
| 大消息解析 | 无打字机，每次 flush 解析一次 | `FlowTextBlock.tsx:160` 每个 tick 重算解析 |

接入清单：

1. **L0** 新增 `shared/utils/motionPreference.ts` → `resolveMotionMode()` + 根节点 `data-opc-motion`，三个 hook 改读它。
2. **L1** `useStreamingTextReveal.ts:129-157` → per-run `delay`（paint 序号 × 1–8ms）+ `ARRIVAL_BURST_LIMIT` + 移植上游慢帧让路（`reveal-paint.ts:78-82`）。**顿数保持 32**，靠时长调细腻度。
3. **L2** `useTypewriter.ts` → `burstImmediateChars`，专治 Peer 重连回灌，否则 footer 被揭示门拖住 `backlog/720` 秒。
4. **L4 滚动不改**：本地用 rAF writer + 可达位置钳制，比上游 transform 滑移更适合虚拟列表。
5. **L6 光标不做**：Range 方案不动 span，而正文 `█` 会污染复制内容。

硬约束：不加行级 CSS keyframe（`VirtualItemRenderer.scss:106`、`FlowTextBlock.scss:25` 的 `animation: none` 是虚拟列表的结论）；不改 `replayOnMount` 默认值；不动 `EventBatcher` 的 32ms；减动效必须**拆引擎**而非 CSS 隐藏。

---

## 4. 分阶段落地

| 阶段 | 内容 | 主要文件 | 出口条件 |
|---|---|---|---|
| **P0** | 数据面：3 个 palette 字段 + `link` 投影 + focus 改 primary + radius sm/lg + 1 条 near-pair decision + 常量修正 | `AppearancePalette.ts`、`buildBuiltinAppearance.ts`、`claudeStyle.ts`、`claudeNight.ts`、`theme-color-near-pair-decisions.json` | `pnpm run appearance:contract-audit`、`pnpm run theme:color-audit:all` 通过且基线只降不升 |
| **P1** | ≤3 个 `markdown.*` token、已有 part id 覆盖、hairline 0.5px、shadow-lv2、时长缓动 | `appearanceTokenContract.ts`、`defaultAppearanceRegistry.ts`、owner 契约 | 上述审计 + 未知 part 宽容降级测试 |
| **P2** | 结构：两个 seat、真滑杆、流式阶梯渐现、动效真值源统一 | `flow_chat/components/**`、`flow_chat/hooks/**`、`infrastructure/markdown/**` | 焦点 window 的组件测试 + `pnpm --dir src/web-ui run test:run <focused>` |
| **P3** | 清死码/死 prop，记录 ADR；再评估契约 v2 | `ReasoningPresetSelector.*`、`ModelSelector.tsx` | 全仓引用为零、无回归 |

每一阶段结束都要跑：`pnpm run check:core-boundaries`（若动了 Cargo/tool policy）、`pnpm run i18n:audit`（若动文案）、`pnpm run theme:color-audit:all`（动色/主题）。

---

## 5. 待裁决（阻塞 P0 起点）

- **R1 结构缺口**：皮肤私有 token 命名空间、角色分裂、0.5px 发丝线这类结构性绘制，是否另立 ADR？
- **R2 ratchet 置换**：是否接受"用不可见的 alpha 梯换可见的面色阶"（净 −3，7→4）？
- **R3 AA 是硬门还是上限参考**：视觉契约按硬门写并列了 E1–E3 例外清单，不会自行放宽。
- **D1–D6**：两 seat 的布局代价、RTL 方向键语义、焦点色分治、速度所有权归属、滑杆门槛、点阵是否复刻（`motion-duration-loop` 720ms vs 上游 1450ms 周期）。
- **D4 速度所有权**：上游没有打字机，本地有。建议保留打字机只用于本地流式，渐现对齐上游错峰；需确认这是否会改变既有手感预期。
- **测量前置**：实测 dark 菜单面是 `#1c1c1f`（= `background.secondary`）而非声明的 `elevated #262421`，所以"把 light elevated 改成 `#ffffff` 就能分离浮层"这个推论**可能不成立**——这是唯一可能让 P1 返工的点，建议先测。
- **素材**：C4 上游 hover/selected/focus/open-menu 动态态截图（决定洗涤上限 5% vs 8%）、C5 代码块与行内代码截图；并确认 `assets/live-claude*.png` 那 4 张是否在当前 palette 常量下采集（sidebar 有 1 步偏差）。

---

## 6. 已知风险

| 风险 | 应对 |
|---|---|
| R1 新取色被判不可区分 | 用 −3 亮度梯替代 |
| R2 基线指标上升 | 同批合并冗余值，**禁止抬 max** |
| R3 旧构建读新字段/part | 字段全可选 + registry 对未知 part 宽容降级 + 补兼容测试 |
| R4 L3 功能混入 | 评审红线：皮肤提交中不得出现 DOM 观察/宿主服务 |
| P2 改动撞现有测试 | 保留 testid 与 `part` 名；先跑受影响测试基线 |
