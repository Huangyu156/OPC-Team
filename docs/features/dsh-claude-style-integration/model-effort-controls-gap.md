# 模型选择器 + 思考强度滑动选择器 · 上游对照与改造方案

范围：只做这两个控件。分支 `claud-skin`，worktree `H:\智能体开发\OPC-Team\.dsh\gitworktree\claud-skin`。
上游：`.upstream-ref/`（dsh-claude-style v0.16.3，皮肤插件）。本地：`src/web-ui/src/`。

约定：`U/` = `.upstream-ref/packages/client/src/`，`W/` = `src/web-ui/src/`。

---

## 1. 上游定位（文件、行数、角色）

| 文件 | 行数 | 角色 | 关键行 |
|---|---|---|---|
| `U/features/model/model-picker.ts` | 702 | 模型选择器：**隐藏宿主 seat、自建按钮与卡片** | `modelSlotOf` :36（`[data-slot="conversation.input.model"]`）；`install` :38；说明注释 :40-59（宿主 seat 是「两页菜单」，皮肤改成自建）；卡片 `dsh-claude-popover-card dsh-claude-model-popover` :443；页脚 :449；子卡片 :481；卸载归还宿主 seat :494-504；隐藏宿主 seat :535-539 |
| `U/features/model/model-picker.css` | 234 | 模型控件样式 | `dsh-claude-model-divider` :264；分组行 :385-390 |
| `U/features/model/model-picker.manifest.ts` | 32 | 特征清单（`pref: 'modelPicker'` 等） | — |
| `U/features/model/catalog.ts` | 214 | 目录/分组/当前值读取 | — |
| `U/features/model/rows.ts` | 201 | 行渲染 | — |
| `U/features/model/brand.ts` | 77 | provider 品牌标记 | — |
| `U/features/model/copy.ts`、`copy-fallbacks.ts` | — | 文案 | — |
| **`U/features/effort/effort-picker.ts`** | **468** | **思考强度选择器：独立 seat 触发器 + 独立 popover 卡片** | `install` :39；`:118-133` 一次只开一个卡片 + **先标记 open 再定位** + `positionAnchoredPopover(effortBtn, effortPop, { side: 'above', gap: 6 })` :133；:224 房间随名称/卡片变化；:250 视口或卡片变化的即时重定位路径；**:259 滑块只构建一次、卡片终身持有**；:270 松手在卡外 → 在 **release** 才关闭；:285-296 幂等守卫 + `removeStrayNodes(document, 'body > .dsh-claude-effort-popover', …)` + `className = 'dsh-claude-popover-card dsh-claude-effort-popover'` :296；:302-303 按住不放不在卡内关；:309 已挂载则不重复 append 滑块；:365 无 effort 行时不渲染；:387-395 hover 意图（`pressKeepsPopoverOpen`）；:421 先写状态再等宿主回声；:445-457 外部按下/Esc 关闭 + resize/scroll 与 CSS 回流**同帧**重钉 |
| **`U/features/effort/control.ts`** | **669** | **滑块本体：DOM 结构 + 几何 + 磁吸 + ARIA** | `createEffortControl(opts)` :72；`root .dsh-claude-effort` :78；`head` :79；`label` :80；`value` :81；`value-ghost` :85；`ends` :86；`end`（Faster/Smarter）:87-88；**`track` :89**；`fill` :90；`ticks` :91；`matrix` :92；`knob` :93；**`track.setAttribute('role','slider')` :109**；`createEffortMatrix(track, matrix)` :112（点阵穹顶）；`PENDING_ECHO_MS = 12000` :160；`state()` :170；文案 `effortFaster`/`effortSmarter` :198-199；几何 `trackBox`/`measureTrack`/`geometry`/`positionFor`/`place` :209-279；`pointerTravel` :279；**`DETENT = 0.8`** :296；`dampTravel`（阻尼）:308；`nearest` :320；`paintApex` :335；`paintTicks` :351；`paintValue` :390；**`paintAria` :408**（`aria-valuemin='0'` :430、`aria-valuenow` :432、`aria-valuetext = 档位名` :433，不可用时移除三属性 :421-424）；`commit` :447；`releaseCapture` :458 |
| **`U/features/effort/ladder.ts`** | **73** | **强度阶梯排序（把适配器给的乱序 id 归位）** | `EFFORT_STRENGTH`：`none 0, off 0, minimal 1, light 2, low 3, medium 4, high 5, on 5, xhigh 6, max 7, ultra 8`；`isRankedEffort` :41；`orderEffortIds(ids)`：可排名项按强度填回原槽位、未知项保留适配器位置、`undefined`（模型默认档）排最前 |
| **`U/features/effort/room.ts`** | **43** | **在模型触发器右缘预留强度触发器的位置** | `EFFORT_ROW_SELECTOR = '[data-dsh-claude-part~="row"]'`；`reserveEffortRoom(modelBtn, need)`：先清 `maxWidth` → 设 `marginRight = need px` → 行溢出时 `maxWidth = 当前宽 − 溢出`，返回改后 rect；`releaseEffortRoom` 两项都清 |
| `U/features/effort/matrix.ts` | 152 | 轨道上的点阵材质 | — |
| `U/features/effort/effort-picker.css` | 363 | 强度控件样式 | — |
| `U/features/effort/effort-picker.manifest.ts` | 12 | `id:'effort', order:90, reads:['model'], pref:'modelPicker', stylesheets:[{file:'effort-picker.css',rank:270}]` | — |
| `U/theme/tokens.json` | 801 | 皮肤私有 token | 皮肤自持 `--dsh-claude-*` / `--dsw-*` 覆盖 |

### 上游机制要点（逐条结论）

1. **两个 seat，两张卡**：模型触发器与强度触发器**并列**在 composer 行内；强度触发器挂在 `<body>`、由模型触发器盒定位；两张卡互斥（`:118-119` 用 `closeOtherPopovers`）。
2. **行内触发器 = 值 + 材质；滑块在 popover 内**（`side:'above', gap:6`），不是行内轨道。
3. **滑块是真正的 slider**：`role="slider"` + `aria-valuemin/valuenow/valuetext`，两端写 `Faster` / `Smarter`（方向语义），带 `fill / ticks / matrix / knob`，`DETENT 0.8` 磁吸 + `dampTravel` 阻尼，拖动中不提交（`:270` release 才关；`:447 commit`）。
4. **占位**：`room.ts` 在模型触发器右缘留像素，行放不下时**让模型名让出溢出**，避免出现行内横向滚动条。
5. **阶梯排序**：`ladder.ts` 修复 Qoder/Raccoon/MiniMax 等适配器乱序/倒序（注释里点名 `xhigh, high, low, max, medium`），保证右端一定是"更强"。

---

## 2. 本地定位（现状实现）

| 文件 | 行数 | 关键行 |
|---|---|---|
| `W/flow_chat/components/ModelSelector.tsx` | **2373** | 死 prop `reasoningTriggerPresentation?: 'meter' \| 'label'` **:139**；根 `data-opc-part="root"` :1971-1975；触发器 `<button data-testid="chat-model-selector-btn" data-opc-part="trigger">` :1978-2028（`aria-haspopup="menu"`、`aria-expanded`、`aria-busy`、`aria-controls`）；模型名 `part="name"` :2010-2012；**行内强度摘要 `<span data-testid="chat-model-selector-trigger-reasoning" data-opc-part="reasoningSummary">` :2016-2026**（纯文本 `t('reasoningSelector.title'): 档位名`）；chevron :2027；下拉 `part="dropdown"` :2054-2072；`part="options"` :2088（`data-panel-kind`）；设置页开关 :2233；`part="selectionSummary"` 模型字段 :2286-2312；**`.opc-model-selector__reasoning-control`（`data-reasoning-mode=auto\|manual`）:2314-2328**，其内 **`<ReasoningIntensityControl …/>` :2319-2327** |
| `W/flow_chat/components/ReasoningIntensityControl.tsx` | **283** | props :9；组件 :27；state `expanded / previewValue / pending / focusRevision` :38-41；根 `data-testid="chat-model-selector-intensity-control" data-opc-part="reasoningSlider"` :160-162；值 `part="reasoningSliderValue"` :171；触发按钮 `data-testid="chat-model-selector-settings-reasoning"` :181；`FlowChatCollapse` :197 → 选项 `data-testid="chat-model-selector-reasoning-options" data-opc-part="reasoningSliderInput"` :207-209 → **`SegmentedControl` :219**；装饰 天空 `part="reasoningSliderSky"` :241 / 星云 :247 / 极光 :270 |
| `W/flow_chat/components/ReasoningIntensityControl.scss` | ~590 | `.opc-reasoning-control` :13；私有 tint 由 `--opcteam-color-link-default` × `--opcteam-color-accent-secondary` 合成 :18-29；`oklch` glow :34/:42；复用的设计系统 token：`space-6/1` :50、`type-label-md-*` :53-57、`effect-blur-base` :153、`radius-pill` :217、`motion-easing-standard` :85/:179/:187 |
| `W/flow_chat/components/ModelSelector.scss` | ~30 KB | token 用量（去重×次数）：`space-1`×13、`color-link-default`×8、`color-content-on-dark`×8、`space-2`×7、`color-surface-raised`×6、`color-content-primary`×6、`content-secondary`×5、`content-muted`×4、`color-accent-default`×4、`type-label-md-font-weight`×3、`effect-blur-base`×3、`surface-panel`×3、`radius-lg`×2、`motion-easing-standard`×2、`action-neutral-surface-hover`×2、`accent-secondary`×2 |
| `W/flow_chat/components/ReasoningPresetSelector.tsx` | 258 | **死代码**：唯一引用是 `W/infrastructure/appearance/registry/defaultAppearanceRegistry.ts:17`，composer 里无人使用 |
| `W/flow_chat/components/ModelSelector.appearance.ts` | 33 | parts 已含 `reasoningSlider`、`reasoningSliderSky/Nebula/Aurora/Input/Value`、`reasoningSummary`；states `open/loading/selected` |
| `W/flow_chat/components/ReasoningPresetSelector.appearance.ts` | 30 | parts `root/trigger/menu/…`；facet `presentation: meter\|label` |
| `W/flow_chat/components/ChatInput.tsx` | 7151 | 挂载点 :7104-7125：`ChatComposerEndActions` → `.opc-chat-input__actions-right`（`part="actionsRight"`）→ `.opc-chat-input__model-usage-group`（`part="model"`）→ `<ModelSelector … reasoningTriggerPresentation="label" />` **:7108-7124**（**该 prop 在 :7123 传入，组件内从未读取**） |
| `W/app/scenes/profile/views/AssistantQuickInput.tsx` | — | 第二处挂载 :115（Claw 模式，`className="aqi__model"`） |
| `W/infrastructure/config/components/ReasoningPresetEditor.tsx` | **824** | 设置页的**预设表单**（label / actions / JSON patch），不是滑块 |
| `W/infrastructure/config/components/ReasoningConfigPanel.tsx` | — | 设置页容器 |
| `W/app/scenes/settings/pages/ai/ModelSettingsPage.tsx` | **4816** | `DefaultModelConfig` :21、`ReasoningConfigPanel` :35、reasoning 工具 :73-78；汇总文案 :2693-2705；校验 :1904-1919 |

### 测试钉子（改造必须先看这些）

- `W/flow_chat/components/ReasoningIntensityControl.test.tsx`：:26 `chat-model-selector-settings-reasoning`、:28 `chat-model-selector-reasoning-options`、:31 `chat-model-selector-intensity-control`、:71 `data-opc-part="reasoningSliderSky"`。
- `reasoningTriggerPresentation` 被 5 处钉住：`ModelSelectorAcpMode.test.tsx:158`、`ModelSelectorExternal.test.tsx:297` 与 `:730`、`ModelSelectorProviderLevels.test.tsx:208`、`ChatInputWorkspaceStripLayout.test.ts:540`。
- 与外观契约相关：`ModelSelector.appearance.ts` 的 parts 是 `AppearanceSurfaceDescriptor` 契约，重写结构必须同步。

---

## 3. 逐项差距清单

| # | 维度 | 上游 | 本地今天 | 判定 |
|---|---|---|---|---|
| G1 | 触发器拓扑 | 模型触发器 + **独立强度触发器**（两个 seat，两张卡） | **单按钮**，强度档位以文本塞在模型按钮内部（`reasoningSummary` :2016-2026） | **结构不同** |
| G2 | 档位交互 | `role="slider"` 可拖动轨道（fill/ticks/knob/点阵，`DETENT 0.8` 磁吸 + 阻尼） | `SegmentedControl` 离散按钮（:219），**无 role=slider、无数值语义** | **结构不同** |
| G3 | 两端语义 | `Faster` / `Smarter` 命名方向 | 无 | 缺失 |
| G4 | 开合模型 | hover-intent + open/close delay + body 上的固定定位卡（`side:'above', gap:6`），与模型卡互斥 | 受控下拉 + 内联 `FlowChatCollapse`（在模型菜单里再展开） | **结构不同** |
| G5 | 阶梯排序 | `ladder.ts` 强度表重排（含 `light/on` 等 provider 私有名），未知项保槽位 | 按 catalog 顺序直出 | 缺失（会左右颠倒） |
| G6 | 行内占位 | `room.ts` 预留像素、模型名让出溢出 | 无（同一按钮内，不需要） | 结构升级后**必需补** |
| G7 | 提交时机 | 松手/Esc/外点才提交；`PENDING_ECHO_MS = 12000` 待回声 | `previewValue` + `onSelect` 即时提交 | 行为不同 |
| G8 | 材质 | track + 点阵 matrix + apex + knob | 天空/星云/极光全息背景（:241/:247/:270） | 材质语言不同 |
| G9 | 样式/token | 皮肤私有 `--dsh-claude-*` 命名空间 | `--opcteam-*`（tint 由 `color-link-default` + `accent-secondary` 合成） | 上游路径在本仓库**不可用**（`visual-contract.md` §1 R1） |
| G10 | 无障碍 | 有 slider 语义，但上游自身多处对比度不达 AA | Segment 缺 slider 语义 | 需按 AA 硬门偏离上游（`visual-contract.md` §11） |
| G11 | 死代码 | — | `ReasoningPresetSelector`（258 行）无实时消费者；`reasoningTriggerPresentation` 无消费者 | 清理/接线 |
| G12 | 设置页 | 上游设置页**也没有**强度滑块（只有 quick-providers） | 设置页是预设表单（`ReasoningPresetEditor` 824 行） | 不对齐点，但保存链路必须继续被滑块复用 |

**一句话结论**：差距不是"配色/尺寸"，而是**拓扑（两个 seat vs 一个按钮）+ 交互件（真 slider vs Segment）+ 阶梯排序**三件事；其中 G1/G2/G5 必须新增/重写组件，G6 是 G1 的必然配套，其余可在现有 token 与 palette 上落地。

---

## 4. 改造方案

### 4.1 目标组件树

```
ChatComposerEndActions
└─ div.opc-chat-input__actions-right            (ChatInput.tsx:7105)
   ├─ div.opc-chat-input__model-usage-group      (:7107)
   │  └─ ModelSelector                          纯模型控件（强度相关全部移出）
   │     └─ button.opc-model-selector__trigger  [part=trigger]
   │        ├─ OverflowText  [part=name]
   │        ├─ (A) ReasoningEffortSummary       NEW：meter|label（读 reasoningTriggerPresentation）
   │        └─ Icon chevron-down
   └─ ReasoningEffortTrigger                    NEW 独立 seat（默认在模型触发器之后）
      ├─ button  [part=effortTrigger]  值文字 + EffortMeter（点阵强度）
      └─ Popover placement="top" gap=6（@opc-team/ui）
         └─ ReasoningEffortSlider               NEW / 重写自 ReasoningIntensityControl
            ├─ head: label + value + value-ghost
            ├─ ends: Faster / Smarter
            └─ track[role=slider, aria-valuemin/now/valuetext]
               ├─ fill / ticks / knob / dot-matrix
```

模型下拉内部：`:2314-2328` 的 `opc-model-selector__reasoning-control` 保留为**降级路径**（ACP 模式等无独立 seat 的场景），但内部由新的 `ReasoningEffortSlider` 渲染（`variant="inline"`）。

### 4.2 状态来源（唯一真相，必须上提）

现状分散在 `ModelSelector.tsx`：`catalogReasoningPresets`、`selectedReasoningDescriptor`、`effectiveReasoningDescriptor`、`automaticReasoning`、`handleSelectReasoningPresetFromControl`。

改造：抽出 `W/flow_chat/hooks/useReasoningSelection.ts`，对外只暴露
`{ presets, steps, selected, automatic, pending, select(presetId), allowDefaultReset }`；
`ModelSelector` 与 `ReasoningEffortTrigger` **同时消费同一个 hook 实例**（由 `ChatInput` 持有并下发，避免两份状态各自 pending）。`key={sessionId:currentModelId}`（:2320）语义保留，作为 hook 的 reset key。

### 4.3 阶梯排序（纯函数，先写先测）

新建 `W/flow_chat/utils/effortLadder.ts`：移植 `U/features/effort/ladder.ts` 的 `EFFORT_STRENGTH` 与 `orderEffortIds`，保留"未知 id 保槽位、`undefined` 默认档排最前"。配套 `effortLadder.test.ts`（Qoder 乱序、`none` 结尾倒序、未知 id、单档）——上游注释里点名的三个真实反例直接做用例。

### 4.4 样式 / token 落点

- **不新增 palette 字段、不动 `scripts/theme-color-governance-baseline*.json`**（`visual-contract.md` §7.2：near-pair 7/7 已用满）。
- 全部复用现有设计系统 token：`color-content-primary/secondary/muted`、`color-surface-raised/panel`、`color-border-subtle/default/strong`、`color-accent-default`、`color-focus-ring`、`color-action-neutral-surface-hover`、`radius-pill/radius-lg`、`space-1..6`、`effect-blur-base`、`motion-duration-*` / `motion-easing-standard`、`type-label-md-*`。
- 强度热力（fill 渐变）继续用现有合成法（`color-link-default` × `accent-secondary`），但**取消** `ReasoningIntensityControl.scss` 里观感主导的天空/星云/极光三层（:13-29、:241/:247/:270 对应节点），改为上游的 **track + ticks + 点阵 + knob**，可省掉大量私有变量与 `oklch` 计算。
- focus 描边**不得**用 accent（上游硬规则，`visual-contract.md` §6.1、§9.2）→ 用 `color-focus-ring` / `color-field-borderfocus`。
- 改完跑 `pnpm run theme:color-audit:all`。

### 4.5 需新建 / 重写 / 清理的文件

| 动作 | 文件 | 说明 |
|---|---|---|
| 新建 | `W/flow_chat/components/ReasoningEffortTrigger.tsx` (+`.scss`, +`.appearance.ts`) | 独立 seat 触发器 + 上方 popover；`placement top`、gap 6、外点/Esc 关闭、一次只开一张卡（与模型下拉互斥） |
| 新建 | `W/flow_chat/components/ReasoningEffortSlider.tsx` (+`.scss`) | `role="slider"`、键盘（←→/Home/End/PageUp/Down）、指针拖动 + 磁吸 + 阻尼、`aria-valuetext=档位名`、松手才 `onSelect` |
| 新建 | `W/flow_chat/hooks/useReasoningSelection.ts` | 上提状态（4.2） |
| 新建 | `W/flow_chat/utils/effortLadder.ts` (+`.test.ts`) | 阶梯排序（4.3） |
| 重写 | `W/flow_chat/components/ReasoningIntensityControl.tsx` / `.scss` | 改为 `ReasoningEffortSlider` 的 inline 变体包装；保留 `data-testid` 三件套与 `part="reasoningSlider*"` 以免测试全崩 |
| 改 | `W/flow_chat/components/ModelSelector.tsx` | 删 :2314-2328 的强度块或改为 inline 变体；让 :139 的 `reasoningTriggerPresentation` **真正生效**（:2016-2026 渲染 meter/label）；删死 prop 需同步 5 处测试 |
| 改 | `W/flow_chat/components/ChatInput.tsx` | :7104-7125 挂 `ReasoningEffortTrigger`、注入 hook 实例 |
| 改 | `W/flow_chat/components/ModelSelector.appearance.ts` / `ReasoningPresetSelector.appearance.ts` | parts 与 facet 同步（`AppearanceSurfaceDescriptor` 是契约） |
| 改 | `W/infrastructure/appearance/registry/defaultAppearanceRegistry.ts:17` | 若删 `ReasoningPresetSelector` 则同时摘注册 |
| 删除 | `W/flow_chat/components/ReasoningPresetSelector.tsx` / `.scss` / `.appearance.ts` | 死代码（G11）；**先确认无计划接线**，否则改为接线而非删除 |
| 不动 | `W/infrastructure/config/**`、`ModelSettingsPage.tsx` | 设置页契约（`reasoning.presets` / `default_preset` / catalog）是滑块的数据源，只读不写 |

### 4.6 建议分阶段（每阶段可独立验证）

- **P0 接死线**：`reasoningTriggerPresentation` 生效（meter 摘要）+ 新建 `effortLadder.ts` + 测试。零结构风险。
- **P1 拆 seat**：新建 `ReasoningEffortTrigger` + `useReasoningSelection`，模型下拉内保留 inline 副本。此时两处入口并存。
- **P2 换滑块**：`ReasoningEffortSlider` 替换 `SegmentedControl`，补 ARIA 与键盘，补 `room` 等价的行内占位（本地因同按钮内可先不做）。
- **P3 清死码**：删 `ReasoningPresetSelector` 及其注册、删死 prop、同步测试。

### 4.7 验证命令（来自 `W/infrastructure/config/AGENTS.md` 与 `W/AGENTS.md`）

```bash
pnpm --dir src/web-ui run test:run src/flow_chat/components/ModelSelectorProviderLevels.test.tsx src/flow_chat/components/ModelSelectorExternal.test.tsx src/flow_chat/components/ModelSelectorAcpMode.test.tsx src/flow_chat/components/ReasoningIntensityControl.test.tsx
pnpm --dir src/web-ui run test:run src/infrastructure/config/components/ModelSettingsDialog.presentation.test.ts src/app/scenes/settings/pages/ai/ModelSettingsPage.presentation.test.ts
pnpm run theme:color-audit:all
```

---

## 5. 风险与前置裁决

| 项 | 内容 | 建议 |
|---|---|---|
| R1 | 上游靠皮肤私有 `--dsh-claude-*` 命名空间；本仓库无插槽（`ui-adaptation-guide.md:175-180`） | 只做"结构 + 交互 + 现有 token 取值对齐"的等价复刻，不追 token 命名空间 |
| R2 | near-pair 预算 7/7 已满 | 本改造**不新增可见面色阶**；如必须，先按 `visual-contract.md` §7.2 释放 |
| R3 | 上游强度滑块自身有对比度/可达性缺陷（§11.2） | WCAG AA 为硬门：轨道两端文字对比度、focus 描边取 `color-focus-ring` |
| R4 | `ReasoningIntensityControl` 的 testid 被测钉住 | 换实现但**保 testid/part 名**，避免一次改动打爆 4 个测试文件 |
| R5 | 双入口（模型菜单内 + 独立 seat）可能状态分叉 | 必须共用 4.2 的 hook 实例，禁止各自 `useState` |
