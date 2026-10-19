# dsh-claude-style 深度视觉复刻 · 视觉设计契约

| 项 | 值 |
|---|---|
| 版本 | v0.2（待 §1 三项裁决后冻结为 v1.0） |
| 日期 | 2026-10-19 |
| 分支 / worktree | `claud-skin` · `H:\智能体开发\OPC-Team\.dsh\gitworktree\claud-skin` |
| 上游 | https://github.com/Nwflower/dsh-claude-style（本地 clone 于 `.upstream-ref/`） |
| 本地落地 | `opc-claude-style`（light）/ `opc-claude-night`（dark），spec 状态 implemented |
| 契约性质 | 只定义数值与验收判据，不含实现；不修改任何 baseline 文件 |
| 状态 | **draft — 需要 §1 三项裁决后才可验收** |

## 0. 一句话结论

上游皮肤不是「换一套颜色」，而是**同一套暖色在 4 个面色断点上重新分配 + 阅读面切衬线 + 描边语义随明暗反转（light 不透明暖梯 / dark 半透明白高光）+ focus 用文字色而非 accent + 一批本地面板结构上表达不了的角色**。

三条硬结论：
1. **逐字复刻在本地审计下不可能通过**（§7.1 有算式：上游自己的调色板就含 1 对 indistinguishable，而本地预算是 0）。
2. **但按角色投影可以做到比今天更保真、同时把 ratchet 债从 7 降到 4**（§7.2 的 rung 律与置换方案）。
3. **上游有 3 处规则本地当前明确违反**（focus ← accent、正文链接 ← cyan、CTA 标签对比度不足），其中 focus 一处同时是「上游明示硬规则」与「无障碍余量 3.04 → 18」的双赢修正（§6.1）。

契约的价值在于把这个替换关系写成可验收的数字，并把「必须偏离上游」的地方显式列为例外而不是静默妥协。

---

## 1. 需要你裁决的三件事

### R1 · 结构与基线：本地上游不是「同一种抽屉」

本地契约要求 token 从 palette 出发（`builtins/claudeStyle.ts` → `builtins/buildBuiltinAppearance.ts` → `@opc-team/theme` `themeCssVariables`），上游则是在宿主已有的别名上做 CSS 覆盖。**上游没有独立的 `--claude-*` 语义 token，它覆盖宿主别名**；本地没有这条路（`ui-adaptation-guide.md:175-180` 明确列出「per-appearance 组件 CSS 不可用」）。

**所以「深度复刻」只能等价为：在 palette 可表达的子空间内，令每个 token 的取值与上游同角色 token 一致。** 三类必然缺口（无法在本层表达，需你决定是否立 ADR）：

| 缺口 | 上游做法 | 本地等价物 |
|---|---|---|
| 皮肤私有 token 命名空间（`--dsh-claude-*`，约 40 个） | 皮肤自己定义、宿主读它 | 只能落到现有 token；无插槽 |
| 角色分裂（例如 `--dsw-alias-bg-layer-1 ≠ 2 ≠ 3` 且 `--dsh-claude-chip` 另立） | 一个语义角色一个值 | 一个 palette 字段最多投 2-3 个 token |
| 结构性绘制（`canvas.fillRect` 0.5px 发丝线、`chrome.css` 重绘标题栏、`hero.css`、`sidebar.css`、`wallpaper.css`） | 直接绘制 DOM | 无 —— builtin palette 不携带绘制 |

### R2 · ratchet 预算：现在**零余量**，必须先腾再花

- `scripts/audit-theme-colors.mjs:702-720` 判据：`distance ≤ 2 && alphaDiff ≤ 0.003` → **indistinguishable**（预算 max **0**）；`distance ≤ 10 && alphaDiff ≤ 0.03` → **near pair**（`themePreset` 预算 max **7**）。
- spec:388-455 记录：本轮已把 `themePreset` near **2 → 7**、uniqueColors **78 → 97**，并在 `scripts/theme-color-near-pair-decisions.json` 记了 5 条 `keep`。**7/7 已用满。**
- 所以任何新增可见面色阶，都必须先释放等量 near 对。§7.2 给出释放量（−11 可得）与置换方案（净 −1），因此**最终基线可以低于 7**——这符合根 AGENTS.md「Lower theme baselines when measured debt is removed」。

**裁决点**：you 是否接受「用不可见的 alpha 相邻 rung 换可见的面色阶」这一置换。这是 R1、R3 之外唯一会动到既有 rung 的决定。

### R3 · 无障碍：上游有三处**自身不达 WCAG AA**，复刻时必须偏离

| 项 | 上游值 | 实测对比度 | 结论 |
|---|---|---|---|
| clay 底上的按钮标签（light） | `--dsw-alias-brand-text` `#faf9f5` | **2.96:1** | 正文级 FAIL（需 4.5）。本地现用 `STATIC_WHITE` `#ffffff` = **3.12:1**，同样 FAIL |
| clay 底上的按钮标签（dark） | 同上 `#faf9f5` | **2.96:1** | 同上；而本地 dark 已用 `#141413` = **5.90:1 PASS** |
| 第三级文字 `--dsw-alias-label-tertiary`（light `#8f8a7e`） | 3.35:1 on canvas | **FAIL** | 上游拿它写 CLI 模式名与时间行 |
| caption `#a6a094` / dark `#6b6a65` | 2.53:1 / 3.40:1 | **FAIL** | 上游拿它写时间戳 |
| 输入框描边 `border-l1..l3` | light 1.22–1.86:1；dark 1.27–2.71:1 | **低于 1.4.11 的 3:1** | 输入框边界靠填充差 + focus ring 兜底 |
| selected row 上的次级文字 | `element.medium` 叠 14% → `#6e6a60` 只剩 **3.93:1** | **FAIL** | 本轮新发现，上游与本地 spec 都没提 |

**裁决点**：AA 是硬门还是上限参考。我的建议是**硬门 + 显式例外清单**（§11），三处必须偏离上游：CTA 标签取 `#141413`；tertiary 只用于非必要 meta 或 ≥18.66px；selected row 的洗涤上限压到 5%。

---

## 2. 权威依据

### 2.1 上游（`.upstream-ref/`，逐字读取）

| 内容 | 位置 |
|---|---|
| 全部 token 取值（唯一权威） | `packages/client/src/theme/tokens.json`（顶层 `typeface` / `apex` / `palette` / `motion` / `layer`） |
| 值的说明与用途（`use` / `note` / `host` 字段） | 同上，已内联 |
| token schema | `packages/client/src/theme/tokens.schema.json` |
| 排版三族 | `packages/client/src/theme/typography.css` |
| 标题栏 / 侧栏 / 第三方覆盖 | `packages/client/src/theme/chrome.css`、`sidebar.css`、`third-party.css`、`hero.css`、`wallpaper.css` |
| 设计说明文档 | `docs/STYLE.md`（Palette :5-124、两套调色板 :124-155、Windows 标题栏 :155-167、右侧栏 :167-199、Typography :199-206、Shapes :206-244、Motion :244-343、Layers :343-365、正文选中 :365-384、Markdown 材质 :384-405、行内代码 :405-413、Popover :413-509） |
| 决策记录 | `docs/adr/D30-palette-and-typeface.md` |
| 皮肤硬规则 | 仓库根 `AGENTS.md` 的 CSS 段（无纯白/纯黑/冷灰；强调色 <10% 可见元素；选中用平台色；focus ring 用 input 色） |

### 2.2 本地（本 worktree）

| 内容 | 位置 |
|---|---|
| light palette | `src/web-ui/src/infrastructure/appearance/builtins/claudeStyle.ts` |
| dark palette | `src/web-ui/src/infrastructure/appearance/builtins/claudeNight.ts` |
| palette → token 投影（唯一投影点） | `src/web-ui/src/infrastructure/appearance/builtins/buildBuiltinAppearance.ts:126-206` |
| palette 接口与助手 | `src/web-ui/src/infrastructure/appearance/builtins/AppearancePalette.ts`、`paletteHelpers.ts` |
| 注册与目录 | `src/web-ui/src/infrastructure/appearance/builtins/palettes.ts`、`catalog.ts` |
| 不变量测试 | `src/web-ui/src/infrastructure/appearance/builtins/appearancePresetOutput.test.ts` |
| 根节点取色（决定 chrome 上色） | `src/web-ui/src/infrastructure/appearance/adapters/ThemeTokenAppearanceAdapter.ts:21` |
| 设计系统基线值 | `design-system/packages/theme/src/light.tokens.json`、`dark.tokens.json` |
| 审计判据 | `scripts/audit-theme-colors.mjs:702-720`（阈值）、`:672-678`（欧氏 RGB 距离）、`:664-670`（规范色键） |
| 预算 | `scripts/theme-color-governance-baseline.json`、`scripts/theme-color-near-pair-decisions.json` |
| 已有分析 | `docs/features/dsh-claude-style-integration/spec.md`、`ui-adaptation-guide.md` |

---

### 2.3 上游数值的完整性边界（重要）

`tokens.json` **不是**上游色值的完整清单。功能级与主题级 CSS 里仍有硬编码的 alpha 与 hex，且**与 tokens.json 的声明不一致**：

| 文件 | tokens.json 声明 | CSS 实际使用 |
|---|---|---|
| `theme/sidebar.css` | 描边 dark 白 `.09/.18/.30` | **白 `.08` / `.14` / `.18`**、light `rgba(20,20,19,0.12)`、`rgba(0,0,0,0.08)`、`rgba(0,0,0,0.10)`、`#787672`、`#a6a094` |
| `theme/typography.css` | — | light 表格框 `rgba(20,20,19,0.14)`、dark bubble `rgba(250,249,245,0.06)`、`#f0f0ef` |

**两条后果**

1. **真实的上游 alpha 阶梯比 tokens.json 更密**：light ink 有 `.08/.10/.12/.14`（**2% 相邻**）、dark white 有 `.06/.08/.14/.18/.30`。这**加强**了 §7.1 的结论——上游在 2% 递增的相邻 rung 上大量取值，而这些在本地审计里**每一对都是 near pair**。所以「逐字复刻」不仅不可能通过审计，而且是**成倍**不可能。
2. **契约的 alpha 阶梯以「角色」而非「单值」为准**：§4 的 L6-L9 / D6-D7 给出的是**角色归属**（subtle/base/medium/strong），实现时若某处 CSS 需要 `.12` 这类值，应**落到最近的契约 rung 上**（即接受 ≤2 步偏差）而不是新增 rung——这正是 §7.3 第 2 步「先降 rung」的意义。

**方法学结论**：**权威值优先级 = `tokens.json` > 主题级 CSS 的实际取值 > 功能级 CSS > 截图**。前两者冲突时以 tokens.json 的角色语义为准、以 CSS 的具体值为证据。

## 3. 差距总表（八项）

| # | 维度 | 上游 | 本地今天 | 判定 | 能靠现有 token 覆盖 |
|---|---|---|---|---|---|
| 1 | 色彩层级 | 4 级面色阶 + 3 级不透明暖描边（light）/ 4 级面色阶 + 3 级半透明白描边（dark） | 3 级面色阶（light 实际 2 级可见）+ 5 级半透明 ink/ivory 描边 + 5 级半透明 element 洗涤 | **结构不同** | 否 —— 需 palette 字段与投影改动（§9） |
| 2 | 字体与衬线族 | 5 个 token：sans / serif / **prose（serif Latin + sans CJK 回退）** / code / brand | spec v1.3.0 已把 19 个 editorial role 重映射到 `--opcteam-font-family-serif` | **已交付，但 CJK 落回 sans** | 是 —— 只需在 serif stack 的 CJK 前插 serif CJK（§5.3） |
| 3 | 字号/行高/字重节奏 | `--dsw-font-markdown-h2/h3` 用 `font:` 简写重声明；`--dsh-content-font-delta` 承载用户字号；行高 26/24 | 19 个 role token 重映射，字号/行高沿用设计系统 | **部分** | 是（若接受设计系统节奏）；h2/h3 需确认宿主是否也走简写 |
| 4 | 间距与圆角 | 圆角 **4/8/16** 三级（另有 12/6px popover、9999px CTA 药丸、及一批宿主控件副本几何）；间距 **4px 节奏** | `createStandardRadius()` → `sm 6 / base 8 / lg 12`（**只这三个被投影**）；`createStandardSpacing()` = 4px 节奏 ✓ | **sm 偏大 2px、lg 偏小 4px；间距已对齐** | 是 —— 改 palette 常量（§6） |
| 5 | 边框与阴影 | light 不透明暖梯 `#e8e6dc/#dedcd2/#d0cdc1`；dark 半透明白 `.09/.18/.30`（是「高光」不是轮廓）；`--dsw-shadow-lv2` 两套；**focus 用 primary 文字色（light espresso / dark ivory），绝不用 accent** | light 半透明 ink 8/14/20/30/45%；dark 半透明 ivory 10/16/22/30/42%；`effects.shadow.*`；**focus ← `accent[500]`（违反上游硬规则）** | **方向错**（light 该不透明暖、dark 该白而非 ivory、focus 该 primary 而非 accent） | 是 —— 改 palette 常量 + §9.2 的 `colors.focus` 字段 |
| 6 | 图标风格 | 上游 primarily Lucide 系 + 皮肤自绘（`logo-ink`、`ripple-*`、`apex-*`） | 默认 Lucide（`src/web-ui/AGENTS.md`） | 一致 | 是 |
| 7 | 动效与过渡 | 5 个语义 duration（80/120/150/250/320ms）+ 10 条 easing + 位移/缩放/模糊/周期，共约 60 个 token | `motion.duration` / `motion.easing` 两个字段；`buildBuiltinAppearance.ts:486-508` | **表达力差一个数量级** | 否 —— 本层只能给 1 组 duration/easing（§10） |
| 8 | 明暗对应关系 | 同一套暖色在 4 断点重分配；dark 用不透明暖面阶、light 用 1-2 步色阶 | light 与 dark 各自独立编制，dark 的中性色**偏冷**（`claudeNight.ts:17-20` 注释说明复用其他 dark builtin 的「canonical dark neutrals」） | **dark 违反上游「无冷灰」硬规则** | 是 —— 改 palette 常量 |

---

## 4. 视觉契约 · 分 surface 数值表

以下为本契约的**验收数值**。`现状` 列取自 spec:117-150；`契约` 列为建议值。**所有契约值都经过 §7 的审计与 §11 的对比度核算。**

### 4.1 Light（`opc-claude-style`）

| # | surface / role | 上游同角色值 | 现状 | **契约** | 依据 |
|---|---|---|---|---|---|
| L1 | 主画布 canvas / panel / card | `bg-base`/`bg-layer-1` `#fcfcfb`、`card` `#fcfcfb` | `#fcfcfb` ✓ | **`#fcfcfb`** | 不变 |
| L2 | 侧栏 + 根节点 chrome | `sidebar-fill`/`bg-layer-2`/`selector` `#fbfbf9` | `background.chrome` `#f0eee6` | **`#fbfbf9`** | **P0 最大差距** |
| L3 | overlay / menu / input / 代码块 / raised | `bg-overlay`/`menu`/`input-major`/`markdown-code-block` `#ffffff` | `background.elevated` `#fcfcfb`；**实测**（§4.3）menu 也是 `#fcfcfb` = canvas **逐字相同 → 零填充分离** | **`#ffffff`** | 浮层需要可见抬升；**实现前须确认 menu 消费的是 `panel` 还是 `raised`（§14.8）** |
| L4 | 分节 / field group / chip / 分段控件 | `bg-layer-3` `#f9f9f6`、`chip` `#f6f6f4` | `background.tertiary`/`workbench` `#f5f3e8` | **`#f6f6f4`** | 取 chip |
| L5 | bubble / 表格头 / hover-solid | `bubble`/`table-head` `#f0f0ef`、`hover-solid` `#f0efe9` | `element.base` = ink@8% ≈ `#e9e9e8`（偏深 6 步） | **`#f0f0ef`**（`element.base`） | 见 §8 |
| L6 | 描边 subtle | `border-l1` `#e8e6dc` | ink@8% | **`#e8e6dc`** | 改不透明暖梯 |
| L7 | 描边 base（卡片/面板/输入框轮廓、分隔线） | `border-l2` `#dedcd2` | ink@14% | **`#dedcd2`** | 同上 |
| L8 | 描边 medium（hover） | `border-l3` `#d0cdc1` | ink@20% | **`#d0cdc1`** | 同上 |
| L9 | 描边 strong | 无直接对应 | ink@30% | **`#c2beb0`**（暖梯延伸，1.86:1） | 新增以补齐第 4 级 |
| L10 | element subtle | 无（上游用不透明面） | ink@3% | **ink@3%** 保留 | 半透明在浅色下表现正确，且是 `surface.subtle`/`quiet.hover` 的载体 |
| L11 | element base | `bubble` `#f0f0ef` | ink@8% | **`#f0f0ef`** 不透明 | 与 L5 合一，消除近色对 |
| L12 | element medium（selected / neutral.surfaceHover） | `interactive-bg-active` clay@30%？ | ink@11% | **ink@5%**（而非 11%） | §11.4：selected row 上的次级文字只能撑到 5% |
| L13 | element strong | — | ink@15% | **ink@14%**（与 medium 差 ≥0.03 alpha 或改不透明） | §7.2 rung 律 |
| L14 | 文字 primary | `label-primary` `#141413` | `#141413` ✓ | **`#141413`** | 不变 |
| L15 | 文字 secondary | `label-secondary` `#6e6a60` | `#3a3833`（上游无此级，深 52 步） | **`#6e6a60`** | 5.25:1 ✓ |
| L16 | 文字 muted / caption / placeholder | `label-tertiary` `#8f8a7e` | `#6b6960`（≈ 上游 secondary） | **`#8f8a7e`** ⚠ | 3.35:1，见 §11.2 例外 |
| L17 | 文字 disabled | `label-caption` `#a6a094` | `#a8a69d` ✓（Δ≈2） | **`#a6a094`** | 2.53:1，非必要 |
| L18 | accent default | `brand-primary` `#d97757` | `#d97757` ✓ | **`#d97757`** | 3.04:1 |
| L18b | **focus 描边**（`color.focus.ring` / `field.borderFocus` / `borderActive`） | espresso `#141413`（**绝不是 accent**） | `#d97757`（← `accent[500]`，**违反上游硬规则**） | **`#141413`** | 17.96:1 ✓，见 §6.1 |
| L19 | accent hover | `button-primary-hover` `#c6613f` | `#c6613f` ✓ | **`#c6613f`** | 3.95:1 ✓ |
| L20 | CTA 标签 | `brand-text` `#faf9f5` | `STATIC_WHITE` `#ffffff` | **`#141413`** ⚠**必须偏离上游** | 5.90:1 PASS vs 上游 2.96 FAIL |
| L21 | link（正文 Markdown 链接） | `--dsh-claude-link` `#184f95` | **cyan** `color.link.default = {ref.color.cyan.500}`（未投影！） | **`#184f95`** | 7.89:1 ✓；本轮最硬的缺口 |
| L22 | link hover | `--dsh-claude-link-hover` `#a94f2f` | cyan.600 | **`#a94f2f`** | — |
| L23 | 行内代码 ink / 底 | `#943333` / black@5% | 无对应 | **`#943333`** / black@5% | 7.55:1 on `#ffffff` ✓ |
| L24 | 文本选中 | 平台色 focused `#3366D0`/`#FFFFFF` | 设计系统值 | **保持平台色** | 上游硬规则：不随主题 |
| L25 | 滚动条 | `rgba(208,205,193,.9)` / hover `rgba(143,138,126,.8)` | `color.scrollbar.thumb`（`buildBuiltinAppearance.ts:119-121` 按 type 给黑白） | **改用上游暖灰** | 现状是全主题统一的冷灰 |

### 4.2 Dark（`opc-claude-night`）

| # | surface / role | 上游同角色值 | 现状 | **契约** | 依据 |
|---|---|---|---|---|---|
| D1 | canvas / panel / scene / sidebar / chrome | `bg-base`/`sidebar-fill` `#141413` | primary/scene `#141413` ✓；**secondary `#1c1c1f`（偏冷）**；**chrome/tertiary `#0e0e10`（偏冷）** | **`#141413`**（sidebar/chrome 与画布同值） | 上游侧栏=画布；「无冷灰」 |
| D2 | background.secondary / 代码块 | `bg-layer-1`/`markdown-code-block` `#1c1b1a`（暖） | `#1c1c1f`（B>R，冷） | **`#1c1b1a`** | — |
| D3 | tertiary / overlay / banner / 表格头 | `bg-layer-2`/`bg-overlay`/`table-head` `#242320` | tertiary/workbench `#0e0e10` | **`#242320`** | — |
| D4 | raised / card / popover | `--dsh-claude-raised`/`card` `#1e1e1d` | `background.elevated` `#262421`（暖但亮 2-4 步） | **`#1e1e1d`** | — |
| D5 | workbench / input-major | `input-major` `#0f0e0d`（**比画布更深**） | `background.workbench` `#0e0e10`；`color.field.background` ← `background.secondary` `#1c1c1f`（**比画布更亮，方向相反**） | **`#0f0e0d`** | 需新增 `background.input` 字段（§9.2） |
| D6 | 描边 subtle/base/medium | 白 `.09/.18/.30` | ivory `.10/.16/.22` | **白 `.09/.18/.30`** | 上游：深色描边是「高光」不是「轮廓」，必须是白 |
| D7 | 描边 strong | 无 | ivory@30% | **白@30%**（= medium，或 `#5b5b5a`） | 合并以省 near 对 |
| D8 | element subtle/base/medium | —（上游无 element 梯） | ivory 4/6/9/12/16% | **白 4/9/16%**（subtle/soft=4、base=9、medium/strong=16） | §7.2 rung 律，near 3→0 |
| D9 | 文字 primary | `label-primary`/`brand-text` `#faf9f5` | `#f0eee6` | **`#faf9f5`** | 17.50:1 ✓ |
| D10 | 文字 secondary | `label-secondary` `#b0aea5` | `#c2bfb4` | **`#b0aea5`** | 8.29 / 7.07 ✓ |
| D11 | 文字 muted / caption | `label-tertiary` `#8f8d84` | `#a8a69d` | **`#8f8d84`** | 5.54 on canvas / **4.72 on `#242320`——贴线通过** ⚠ |
| D12 | 文字 disabled | `label-caption` `#6b6a65` | `#6b6960` ✓ | **`#6b6a65`** | 3.40:1，非必要 |
| D13 | accent default / hover | `#d97757` / `#e08a6d` | ✓ / ✓ | **不变** | 5.90 / 7.04 ✓ |
| D13b | **focus 描边** | bright ivory（`#faf9f5` 档，**绝不是 accent**） | `#d97757`（← `accent[500]`） | **`#faf9f5`** | 17.50:1 ✓，见 §6.1 |
| D14 | CTA 标签 | `#faf9f5` | `#141413` ✓ | **`#141413`**（保持现状，偏离上游） | 5.90:1 PASS |
| D15 | link | `#8ab4f8` | cyan（未投影） | **`#8ab4f8`** | 8.75 ✓ |
| D16 | 行内代码 ink | `#e8a08a` | 无 | **`#e8a08a`** | 8.05 on `#1c1b1a` ✓ |
| D17 | bubble | 白@6% | 无 | **白@9%**（与 hover/border.subtle 同值） | 省 near 对；比上游亮 3 点，见 §7.2 |
| D18 | scrollbar | `rgba(58,56,51,.9)` / hover `rgba(107,106,101,.9)` | 按 type 给 `rgba(255,255,255,.3)` | **改用上游暖灰** | — |
| D19 | session title 静息 | `--dsh-claude-session-ink` `#8c8983` | 无 | 无插槽，记录为缺口 | 5.29:1 |
| D20 | 行 ink-strong | `#f5f4ef` | 无 | 无插槽，记录为缺口 | 14.27 on `#242320` |

---

### 4.3 实机采样（对 `assets/live-claude*.png` 的区域众数取色）

方法：按区域取众数色（避免文字抗锯齿污染），区域定义 = sidebar-body `(10,300,280,470)`、canvas-main `(700,460,1400,700)`、theme-menu `(432,330,452,700)`、settings-menu `(246,530,266,730)`、sidebar-search `(30,55,210,70)`、empty-row `(12,272,270,290)`。脚本 `.dsh-tmp/`（不入提交）。

| 区域 | light 实测 | 覆盖率 | dark 实测 | 覆盖率 | 声明值 | 判定 |
|---|---|---|---|---|---|---|
| canvas-main | `#fcfcfb` | **168000/168000 = 100%** | `#141413` | **100%** | `background.primary` `#fcfcfb`/`#141413` | ✓ 逐字一致 |
| sidebar-body | `#f0efe6` | 43371/45900 = 94% | `#0e0e0f` | 44713/45900 = 97% | `background.chrome` `#f0eee6`/`#0e0e10` | **各差 1 步**（G 239≠238 / B 15≠16） |
| theme-menu | `#fcfcfb` | 3651/7400 | `#1c1c1f` | 3651/7400 | `background.elevated` `#fcfcfb`/`#262421` | light ✓；**dark 不符**（实测 = `background.secondary`） |
| settings-menu | `#fcfcfb` | 2736/4000 | `#1c1c1f` | 2880/4000 | 同上 | 同上 |
| sidebar-search | `#f1f1e9` | 2322/2700 | `#0f0f0f` | 2327/2700 | 无对应声明 | 独立面（B=R 中性） |
| empty-row | `#eae9e0` | 3904/4644 | `#151415` | 3918/4644 | 无对应声明 | dark 的 `#151415` **B(21)>R(20) → 冷** |

**四条可验收结论**

1. **L2/D1 的差距有了实测倍数**：light 侧栏↔画布 = Δ(12,13,21) → **距离 27.5**；上游 `#fbfbf9`↔`#fcfcfb` = Δ(1,1,2) → **距离 2.4**。**本地是上游的约 11 倍。** dark 侧栏↔画布 = Δ(6,6,4) → 距离 9.4，而上游是 **0（同值）**。→ L2/D1 是全契约最硬的可测项。
2. **dark 的「冷」已被实测确认，不是推断**：侧栏 `#0e0e0f`（B>R）、菜单 `#1c1c1f`（B>R）、empty-row `#151415`（B>R）。上游硬规则「无冷灰」在 dark 三个面上同时被违反。
3. **light 的浮层完全没有填充分离**：theme-menu 实测 `#fcfcfb` 与 canvas **逐字相同**（100% 覆盖率的同一色），只靠阴影区分；dark 的菜单反而有抬升（`#1c1c1f` vs `#141413`）。→ **L3 在 light 是「零分离」，在 dark 是「分离了但方向是 `background.secondary` 而非 `elevated`」**。后者修正了 L3/D4 的落点：**菜单/浮层面走的是 `color.surface.panel`（← `background.secondary`），不是 `color.surface.raised`（← `background.elevated`）**。实现前必须按此复核，否则改了 `elevated` 而浮层无变化。
4. **截图是「关系证据」，不是「数值证据」**：canvas 与（light）菜单两个 100% 覆盖率的区域**逐字匹配源码**，而 sidebar 两套各差 1 步。因此本契约的权威数值一律取自 `tokens.json` 源码 + palette 源码，截图只用于确认**相对关系**（侧栏 vs 画布、浮层 vs 画布、冷暖）。**不要用截图反推十六进制值。**

**排版交付的实机验证**（对 `(620,330,920,400)` 区域放大 3× 对比，`live-claude-light.png` vs `live-claude-serif.png`）：

- ✓ **拉丁文editorial role 确实切成衬线**：同一串 `OPC-Team,` 在非衬线捕获中为 grotesque sans，在 serif 捕获中清晰呈现衬线（O/P/C/T/m 有明显 serif）。→ 验收项 A/D 的排版部分**有实机证据**。
- ✓ **CJK 在 serif 捕获中仍是 sans**（`创造`/`随` 四张全部为 sans CJK）——**与 §5.3-1 的预测一致，也与上游 `--dsh-claude-font-prose` 的故意设计一致**（上游 serif 栈本身就不含 CJK 字形，靠后排的 sans CJK 兜底）。→ **§13 的 C3 已由实机证据关闭**：`live-claude-serif.png` 展示的是「拉丁衬线 + 中文无衬线」，**它就是当前实现的真实状态，不是「CJK 也应衬线」的期望**。
- 因此 §5.3-1 的 CJK 衬线是**一个纯粹的取舍**（做 = 比上游更激进；不做 = 与上游一致），不再有信息缺口。

---

## 5. 排版契约


### 5.1 上游三族（`tokens.json` `typeface`）

| token | 上游值 | 用途 |
|---|---|---|
| `--dsw-font-family` | `'Anthropic Sans Web Text','Claude Style Inter','Noto Sans SC','Source Han Sans SC',-apple-system,…` | chrome + body 默认 |
| `--dsh-claude-font-serif` | `'Anthropic Serif Web Text','Claude Style Noto Serif',Georgia,'Times New Roman',` **+ sans CJK 列表** | 通用衬线 |
| `--dsh-claude-font-prose` | 同上（serif Latin 领先、sans CJK 兜底） | **仅 Markdown 正文** |
| `--dsh-claude-font-code` | `'Anthropic Mono Web','JetBrains Mono',…,ui-monospace,'SF Mono','Fira Code',Consolas,…` | 代码 |
| `--dsh-claude-font-brand` | `'Anthropic Serif Web Text', var(--dsh-claude-font-serif)` | 品牌字 |

**关键事实**：上游注释明确「serif Latin 面不含 CJK 字形，所以栈以 serif 领头、把 sans CJK 排在后面」——**中文在 prose 里落回 sans CJK**，这是上游的**故意行为**，不是缺陷。

### 5.2 本地现状（spec:198-281）

19 个 editorial role token 在 `[data-opcteam-design-system-root][data-opc-appearance='opc-claude-style'|'opc-claude-night']` 下重映射到 `--opcteam-font-family-serif`。保持 sans 的：`body-*`、`label-*`、`meta`、`micro`、`overline-*`、`support`、`flow-control/meta/micro/support`、`heading-card`、`heading-navigation`、`heading-compact-page`、`code-*`。

**判定：已达成「阅读面 serif / chrome sans」的契约目标，且与上游 prose 只作用于正文一致。**

### 5.3 契约补充项（P1）

1. `--opcteam-font-family-serif` 当前 CJK 落到 profile 的 sans（`zh-CN` → OPC HarmonyOS Sans SC）。若要中文正文也呈衬线，在 serif stack 的 CJK sans **之前**插入 `"Songti SC", SimSun, "Noto Serif CJK SC"`；GitHub/Gitee 的整体观感主要来自中文，**这是「深度复刻」观感差距最大的一处排版项**。是否做需你定（上游不做）。
2. `--dsw-font-markdown-h2/h3` 上游用 `font:` **简写**重声明（`:700 calc(18px+Δ)/calc(26px+Δ) prose`、`h3: 700 calc(16px+Δ)/calc(24px+Δ)`），因为宿主读简写、覆盖 `-font-family` 子 token 无效。本地需确认宿主是否同样读简写；若是，则 19 个 role 重映射对 h2/h3 无效——**这是一个需要在实现前验证的假设**（见 §13 C2）。
3. `--dsh-content-font-delta` 是上游承载用户字号偏好的机制。本地 `FontPreference` 仅尺寸（`ui-adaptation-guide.md:175-180`），无需对齐。

---

## 6. 形状 / 间距 / 边框 / 阴影契约

本地 `paletteHelpers` 提供 `createStandardRadius()` / `createCompactRadius()` / `createSlateRadius()`、`createStandardSpacing()`、`createStandardEasing()`。spec 未记录 Claude 两套使用的具体数值；上游数值取自 `docs/STYLE.md` 的 Shapes 段。

| 项 | 上游（`STYLE.md:206-244`） | 本地 | 契约 |
|---|---|---|---|
| 圆角基准 | **4 / 8 / 16 px** 三级 | `effects.radius` 走 `createStandardRadius()` = **sm 6 / base 8 / lg 12 / xl 16 / 2xl 20 / full 9999px**；但投影**只消费 sm/base/lg**（`buildBuiltinAppearance.ts:489-491` → `radius-sm/base/lg`），`xl`/`2xl` **未被投影** | **P2：`sm:'4px'`、`base:'8px'`、`lg:'16px'`**——上游三级与本地三个被投影的 radius token **一一对应**，`base: 8px` 已对齐，只需改 sm（6→4）与 lg（12→16）。`full: '9999px'` 已与上游 CTA 药丸一致 |
| 圆角例外 | popover 卡 **12px**、其行 **6px**；CTA 药丸 **9999px**；宿主控件副本保留自身几何（composer 卡 **18px** = 宿主 22px − 4；内联 composer **14px** 与 **11px**；permission/workspace 分段 **7px**；视图 tab **5px**；peak-rate/file 药丸 **999px**） | 只有三个被投影的 radius token，无 per-component 圆角插槽 | **组件级缺口**：12/6/18/14/11/7/5px 无法经 palette 表达，需组件侧改；`xl`/`2xl` 虽然存在但不通向任何 token（**建议不要为了塞 12/20 而启用它们**） |
| 边框 | **1px**；dark 是「高光」而非轮廓 → 白 `.09/.18/.30`；light 保留不透明暖梯 | 见 L6-L9/D6-D7 | 见 §4 |
| 发丝线 | **0.5px**，仅用于**侧栏与对话区之间的分隔**（`theme/chrome.css`，retina 上一个设备像素）+ Markdown 表格框 + trajectory chip | 无 | **这是 R1 所述的结构性绘制缺口**：上游的侧栏/画布关系是「1-2 步色阶 + 0.5px 发丝线」，本地只能表达色阶（§7.2）。发丝线需另立 ADR（C7） |
| 其它单向分隔线 | 一律 **1px** | `color.border.*` | 若本地用 0.5px 表达普通分隔线，需回改 |
| 间距 | **4px 节奏**（`STYLE.md:229`）；`--dsh-claude-distance-*` 是**动效位移**（4/8/12px），不是布局间距 | `createStandardSpacing()` | 确认本地 `createStandardSpacing()` 是 4px 节奏即**已对齐**；无需改动 |
| 阴影 | `--dsw-shadow-lv2`：light `0 4px 18px rgba(20,20,19,.10), 0 1px 3px rgba(20,20,19,.05)`；dark `0 4px 16px rgba(0,0,0,.30), 0 1px 3px rgba(0,0,0,.14)` | `effects.shadow.xs/sm/base/lg/xl` | **P1：`shadow.lg` 应对齐 lv2**（暖色阴影是 Claude 观感的一部分，本地若要精确需按 light/dark 分别给值） |
| 底边渐隐 | 转录区**绝不**用阴影在 composer 后渐隐：composer 底座画一条不透明 `bg-base` 横条 + 上方一条 `--dsh-composer-fade-h` = **40px** 渐变带；同 token 又是转录区底部留白 | `effects`/组件 | 记录为组件级缺口，不在本轮 |
| 模糊 | 动效模糊 2/3px（`--dsh-claude-blur-*`） | `effects.blur` | 保持 |
| 层级 z-index | `10/20/30/99999/2147483000` | 组件自有 | 无插槽，记录为缺口 |

### 6.1 focus 契约（上游硬规则，本地当前**违反**）

上游 `STYLE.md:236-244` 明确：

> Focus: the composer field lights up — its hairline takes **the input box's own shadow colour (espresso `#141413` in light)** with a 1px halo in the same tone and a deeper drop shadow. Dark **inverts the face**: on the near-black canvas a black edge carries no cue, so the hairline and halo become **bright ivory** — the field visibly lights up instead of deepening. … **Accent is never used for focus strokes.**

本地投影把 `color.focus.ring`、`color.field.borderFocus`、`color.field.borderActive` 全部 ← `accent[500]`（`buildBuiltinAppearance.ts:176-177`，spec:171-196）。这**直接违反上游硬规则**，而且设计系统 light 自己的 `color.focus.ring` = `{ref.color.neutral.650}`、`color.field.borderFocus` = `{ref.color.neutral.550}`，本来就是中性色——**是 Claude palette 把它改成了 accent**。

| 项 | 上游 | 本地现状 | 契约 |
|---|---|---|---|
| light focus 描边 | `#141413`（espresso，+ 同色 1px halo） | `#d97757`（3.04:1 贴线） | **`#141413`**（17.96:1 ✓） |
| dark focus 描边 | bright ivory（`#faf9f5` 档） | `#d97757`（5.90:1 ✓） | **`#faf9f5`**（17.50:1 ✓） |

**收益**：同时满足上游硬规则、满足 SC 1.4.11 且余量从「3.04 贴线」变成「≈18 大余量」、并让「focus 用 accent」不再与「accent 是强调色、覆盖 <10% 元素」互相污染语义。**这是本轮性价比最高的一处修正**，实现方式见 §9.2 的 `colors.focus?.ring`。

---

## 7. ratchet 代价与执行顺序

### 7.1 逐字复刻不可行（算式）

用车同一算法（`colorDistance` 欧氏 RGB、色值去重后配对，与 `--no-baseline` 输出口径一致）实算上游 `tokens.json` 全量 palette：

| 集合 | distinct 色值 | near | indistinguishable | 预算 |
|---|---|---|---|---|
| 上游 light 逐字 | 33 | **14** | **1**（`#f9f9f6` ↔ `#faf9f5`，Δ1.41） | near ≤7 / ind = **0** |
| 上游 dark 逐字 | 34 | **12** | **1**（`#8c8983` ↔ `#8c8a82`，Δ1.41） | 同上 |
| 本地 light 今天 | 23 | 6 | 0 | — |
| 本地 dark 今天 | 22 | 6 | 0 | — |

**上游自己的调色板就含有 indistinguishable 对，而本地预算是 0。** 因此逐字复刻在本地审计下**不可能通过**——这不是实现问题，是两套契约的判据不同。契约必须是「按角色投影」。

### 7.2 置换方案：净 **−3** near 对（7 → 4）

半透明叠色的 near 对**全部**来自 `alphaDiff = 0.02~0.03` 的相邻 rung（同 RGB、距离 0）；描边梯（alphaDiff ≥ 0.05）本来 0 对。实算：

| 阶梯 | 方案 | near |
|---|---|---|
| light ink element | `[3,5,8,11,15]%`（现状） | **3** |
| light ink element | `[3,8,14]%` | **0** |
| dark ivory element | `[4,6,9,12,16]%`（现状） | **3** |
| dark ivory element | `[4,9,15]%` | **0** |
| dark translucent white 杂项 | `[5,6,8,9]%` 混用 | **5** |
| dark translucent white 杂项 | `[5,9,18,30]%` | **0** |

**rung 律（本契约的机制性结论）**：同一主题内所有半透明叠色只从一组离散 alpha 取值；**复用同一个 alpha 不产生近色对**（同色值去重、只计一次），而 2% 递增的相邻 rung **必然**产生。所以把 5 rung 降到 3 rung、并把 4-6 个角色折到同一 alpha 上，是**唯一**既提升可见保真度又降低审计债的做法。

**净账（仅本轮涉及的角色）**

```
释放：light element 3 + dark element 3 + dark 白杂项 5        = −11
花费：上游 light 面色阶新增（canvas↔sidebar, canvas↔overlay,
      sidebar↔overlay, sidebar↔section, section↔bubble）      = +5
      （dark 面阶 canvas↔input / layer1↔card / layer2↔card）   = +3
      （#c2beb0 无关；#fcfcfb↔#ffffff 已在现账本中）           =  0
合计                                                          = −3
```

**结论：可以做到 `themePreset` near 从 7 降到 4**，同时让 light 从「浮层与画布不可分」变成上游的四级面色阶。**这是本轮唯一能同时改善保真度与降低 ratchet 债的路径，也是 R2 裁决的实质。**

### 7.3 执行顺序（避免返工）

1. 先改 light 的 chrome/tertiary/elevated（L2/L3/L4）与 CTA 标签（L20）、link（L21）——**纯可见收益、不新增 near 对**（`#fcfcfb↔#ffffff` 已在账本）。
2. 再降 rung（§7.2 的 −11），`node scripts/audit-theme-colors.mjs --json --no-baseline --top 0` 确认余量。
3. 再补 light 面阶与 dark 暖化（D1–D5）。
4. 最后处理描边（L6–L9、D6–D7）与 element（L11–L13、D8）。
5. 每步后跑 `pnpm run theme:color-audit:test`；只在全部落定后统筹调停账本条目（`ui-adaptation-guide.md:247-258`）。

**注意**：`themePreset` 域聚合**全部** builtin palette（既有 5 条 `keep` 全是跨 palette 冲突，如 `#f0eee6 ↔ #f5f3e8`）。所以**任何新色值都必须对全域复核**，不能只看 Claude 两个 palette。上表金额是按 Claude 内部算的下界，最终以 `--no-baseline` 实测为准。

---

## 8. 图标与材质契约

| 项 | 上游 | 本地 | 契约 |
|---|---|---|---|
| 图标 | Lucide 系 + 皮肤自绘（`logo-ink` `#141413`/`#faf9f5`、`ripple-ink`/`ripple-wave`、`apex*`） | 默认 Lucide，`pnpm --dir src/web-ui run icons:check` | 保持 |
| 代码块底 | `markdown-code-block` `#ffffff`/`#1c1b1a`，宿主用 `!important` 钉在 `pre.shiki` | `color.surface.raised`（= `background.elevated`） | 靠 L3/D2 落地 |
| 代码块 banner | `#ffffff` / `#242320` | 同 raised | 无独立插槽，记录为缺口 |
| 表格头 | `#f0f0ef` / `#242320` | `color.actionCard.background` ← `element.base` | 靠 L11 落地 |
| 行内代码 | 底 black@5%/white@5%，ink `#943333`/`#e8a08a` | 无对应 token | **需新增 palette 字段**（§9.3） |
| 链接 | `#184f95`/`#8ab4f8` + 下划线 `rgba(...,0.6)` + hover `#a94f2f`/`#f0a488` | `color.link.default` **未投影**，全主题恒为 cyan | **需投影 `link`**（§9.1）——本轮最硬的缺陷 |
| Popover | 自带 `--dsh-claude-layer-float: 99999`、`shadow-lv2`、`scale 0.97~0.99` | 组件自有 | 记录为缺口 |
| 滚动条 | 暖灰 `rgba(208,205,193,.9)` / dark `rgba(58,56,51,.9)` | `buildBuiltinAppearance.ts:119-121` 按 type 给 `rgba(0,0,0,.3)`/`rgba(255,255,255,.3)` | 靠 palette 的 `scrollbar` 字段覆盖（已支持） |
| 文本选中 | 平台色 focused `#3366D0`/`#FFFFFF`、unfocused `#C7C7C6`/`#000000` | 设计系统值 | **保持平台色，不随主题**（上游硬规则） |
| focus 描边 | light espresso `#141413`（input 框自身阴影色）+ 同色 1px halo + 更深投影；dark **反转**为亮 ivory；**Accent 绝不用作 focus 描边** | `accent[500]` | **P0-6：见 §6.1** |

---

## 9. Token 清单

### 9.1 现有 token 可覆盖（复用，零新增）— 占绝大多数

| 想表达的上游角色 | 复用本地 token | 靠哪次改动 |
|---|---|---|
| canvas / panel / card | `color.surface.canvas`、`color.surface.panel` | palette 常量 |
| 侧栏 + 根节点 | `color.surface.chrome`（`ThemeTokenAppearanceAdapter.ts:21` 是根节点取色点） | L2 / D1 |
| 浮层 / menu / input 面 | `color.surface.raised` | L3 / D4 |
| 分节 / field group | `color.surface.tertiary`、`color.field.groupBackground` | L4 / D3 |
| bubble / 表格头 / hover-solid | `color.actionCard.background`、`color.numberBadge.background`、`color.action.neutral.surface`（← `element.base`） | L5/L11 |
| hover 洗涤 / 选中 | `color.action.quiet.hover`、`color.selection.surface`、`color.action.neutral.surfaceHover` | L10/L12 |
| 四级文字 | `color.content.primary/secondary/muted/disabled` + `color.content.caption` + `color.field.placeholder`（后两者同源 `text.muted`，`buildBuiltinAppearance.ts:140`/`:144`） | L14-L17 |
| 描边三级 | `color.border.subtle/default/strong`、`color.field.border/borderHover`、`color.composer.border` | L6-L9 |
| accent / focus | `color.accent.default/hover`、`color.focus.ring`、`color.field.borderFocus/borderActive`、`color.action.primary.*` | L18/L19 |
| 阴影 | `shadow.xs/sm/base/lg/xl` | §6 |
| 滚动条 | `colors.scrollbar.thumb/thumbHover` | §4.1 L25 |
| Markdown 链接 | **`color.link.default` / `color.link.hover`** — token 已存在（light `{ref.color.cyan.500}`），只是**没有投影** | **加 2 行投影** |
| 代码块底 | `color.surface.raised` | L3/D2 |
| 渲染无关（选中色、字体） | font profile / 组件 | §5 / §8 |

### 9.2 需要新增 **palette 字段**（不是新设计系统 token）

`AppearancePalette` 增 **3 个可选字段**，`buildBuiltinAppearance.ts` 各加 1 行带 `??` 回退的投影。**其余 9 个 builtin 不填 → 输出逐字不变 → 无测试与账本扰动。**

| 新字段 | 投到 | 为什么现有字段不行 |
|---|---|---|
| `colors.background.input?: string` | `color.field.background` | 深色下 input 比画布**更深**（`#0f0e0d` < `#141413`），而 panel 比画布**更亮**（`#1c1b1a`）。今天两者都由 `background.secondary` 驱动 → 方向互斥，一个字段表达不了 |
| `colors.focus?: { ring: string }` | `color.focus.ring`、`color.field.borderFocus`、`color.field.borderActive`（回退 `colors.accent[500]`） | 上游硬规则「**accent 绝不作 focus 描边**」，且 focus 在 light 用 espresso、dark 用 bright ivory（**随主题反转**）。现有投影把它们绑死在 `accent[500]` → 无法表达。设计系统 light 自己的 `color.focus.ring` = `{ref.color.neutral.650}` 本来就是中性色，是 Claude palette 把它改成了 accent |
| `colors.markdown?: { inlineCodeBg, inlineCodeFg }` | `color.markdown.inlineCode.*`（**该 token 不存在，需 §9.3**） | 行内代码底/ink 在上游是独立角色，本地无任何字段承载 |

> **回退默认值即现状**：三处 `??` 一写，`light.ts`/`dark.ts`/`monochrome.ts`/`slate.ts`/`midnight.ts`/`cyber.ts`/`tokyoNight.ts`/`chinaStyle.ts`/`chinaNight.ts` 的生成物逐字不变 —— 这直接满足验收项 **B7**。

### 9.3 需要新增 **语义 token**（最小 owner 契约）

按根 AGENTS.md：「If a change truly needs a new color or key, add the smallest owner contract and document why existing semantic, component, or specialized-domain tokens cannot cover it.」

**已核实**：`design-system/packages/theme/src/light.tokens.json` 与 `dark.tokens.json` 各 **171 个 token**，其中
- `color.link.default` = `{ref.color.cyan.500}`、`color.link.hover` = `{ref.color.cyan.600}`(light) / `{ref.color.cyan.400}`(dark) —— **token 存在，但 `buildBuiltinAppearance.ts` 从不投影它** → Claude 下正文链接是 cyan。这是 §4.1 L21 的成因。
- `color.field.borderFocus` = `{ref.color.neutral.550}`（两 mode 相同）、`color.focus.ring` = `{ref.color.neutral.650}`(light) / `{color.accent.default}`(dark)。
- **`markdown.*` 族完全不存在**（171 个 token 里没有任何 markdown token）→ 行内代码/代码块若要独立取值，必须是**新增语义 token**，不是「复用已有名字」。

| 候选新 token | 上游角色 | 现有 token 为何不够 | 建议 |
|---|---|---|---|
| `color.markdown.link.default/hover/underline` | 正文链接三态 | `color.link.*` 是**全局**链接色（含 chrome 内链接）；上游刻意让 Markdown 链接用蓝 `#184f95`、其他链接用 clay（宿主 `--dsw-alias-link #c6613f`），**两者必须能取不同值** | **P1**：若接受「全站链接统一走 `color.link.*`」，则不需新 token，只加 2 行投影即可（**推荐**，代价最小） |
| `color.markdown.code.inlineBackground/inlineForeground` | 行内代码 | 无 markdown 族 | **P1** |
| `color.markdown.code.blockBackground/bannerBackground` | 代码块 + banner | `color.surface.raised` 已被 popover 占用，两者上游取不同值（light 均 `#fff`；dark `#1c1b1a` vs `#242320`） | **P2**：dark 下才分裂；light 可用同一值 |
| `color.surface.overlay` | popover overlay | `color.surface.raised` 单值；上游 light overlay `#fff` ≠ card `#fcfcfb`、dark overlay `#242320` ≠ card `#1e1e1d` | **P2：建议不做**，用单值 `raised` 并接受 dark 取 `#1e1e1d`（§4.2 D4） |
| `color.content.emphasis`（第 5 级文字） | `--dsh-claude-ink-strong` `#f5f4ef` | 与 `content.primary` 差 9.27 距离，会新增 near 对 | **P3：不建议** |
| `colors.focus.ring` 的**设计系统级**对应 | — | **不需要**：`color.focus.ring` / `color.field.borderFocus` 已存在，只是取值被 palette 绑到 accent | **不新增 token**，只加 palette 字段（§9.2） |

**净结论**：**至少 1 个、至多 3 个**新语义 token 是必要的（全部属 `markdown.*` 族，且若接受「全站链接统一」则只剩行内代码/代码块，可合并为 1 个 `color.markdown.code.*` 组）；其余全部走 palette 常量 + 3 个新 palette 字段 + 2 行 `link` 投影。这个比例（新增 ≤3 / 复用 ~40）本身就是「深度复刻是否值得动 token 层」的答案。

---

## 10. 动效契约

上游有约 60 个动效 token；本地 `motion` 只有 `duration`/`easing` 两字段（`buildBuiltinAppearance.ts:486-508`）。**本层无法表达。**

| 上游语义 | 值 | 本地可否表达 |
|---|---|---|
| `duration-instant` | 80ms（光标跟随） | 否 |
| `duration-feedback` / `reveal` / `exit` | 120ms | 是（→ `motion.duration` 若取 120ms） |
| `duration-surface` / `swap` | 150ms | — |
| `duration-open` | 250ms | — |
| `duration-enter` | 320ms | — |
| `duration-bounce/flight/step/pop/rise` | 350/400/500/500/500ms | 否 |
| `ease-standard/out/in-out` | `ease`/`ease-out`/`ease-in-out` | 是 |
| `ease-enter` | `cubic-bezier(0.34,1.3,0.64,1)`（回弹） | 否（单值字段） |
| `ease-glide/settle/spring/roll/harmonic/damped-*` | 6 条 | 否 |
| `distance-nudge/travel/rise` | 4/8/12px | 否 |
| `scale-surface/dropdown/dialog/dot-mid` | 0.98/0.97/0.96/0.55 | 否 |
| `blur-soft/enter` | 2px/3px | 否 |
| `duration-reduced` | **0.01ms**（不是 0，否则 `transitionend` 不触发） | 否（归 host/OS） |
| 周期类（orbit 2400ms、rotate 10s、blink 1000ms、spin 850ms、sweep 1500ms 等 20+） | — | 否 |

**契约**：
- **P1 可做**：把 `motion.duration` 定为 **120ms**、`motion.easing` 定为 **`ease`**，对齐上游最主流的 feedback/reveal/exit 一档（这是唯一有意义的单值选择）。
- **P2 需你裁决**：`ThemeTokenName` 的 `motion.*` 是否扩容为语义组（`motion.duration.feedback/reveal/surface/open/enter`、`motion.easing.standard/glide/settle/spring`）。**这动的是设计系统契约，不是 appearance**，超出本轮 scope（spec:471-479 已把「复刻上游运行机制」列为 out of scope），我建议**立 ADR 而非本轮做**。
- **明确不做**：reduced motion（归 host/OS）、周期类动画、`data-dsh-motion` 三态。

---

## 11. 无障碍契约（WCAG AA 为硬门）

### 11.1 文字对比度矩阵（实测）

| 场景 | 值 | 比 | 判定 |
|---|---|---|---|
| L primary `#141413` on `#fcfcfb` | — | 17.96 | PASS |
| L primary on sidebar `#fbfbf9` | — | 17.79 | PASS |
| L secondary `#6e6a60` on canvas / sidebar / overlay | — | 5.25 / 5.21 / 5.39 | PASS |
| L muted `#8f8a7e` on canvas / overlay / section | — | 3.35 / 3.44 / 3.18 | **FAIL** |
| L disabled `#a6a094` on canvas | — | 2.53 | FAIL（非必要） |
| L link `#184f95` on canvas / overlay | — | 7.89 / 8.10 | PASS |
| L inline-code `#943333` on `#ffffff` | — | 7.55 | PASS |
| L accent `#d97757` on canvas（UI 边界 3:1） | — | 3.04 | PASS（贴线） |
| L accent-hover `#c6613f` | — | 3.95 | PASS |
| L apex `#8b7ad0` on canvas | — | 3.53 | FAIL（仅限图形，不得作正文） |
| L meter-peak/valley | — | 4.71 / 5.30 | PASS |
| **L CTA 标签 `#faf9f5` on clay** | 上游值 | **2.96** | **FAIL** |
| **L CTA 标签 `#ffffff` on clay** | 本地现状 | **3.12** | **FAIL** |
| **L CTA 标签 `#141413` on clay** | 本契约 | **5.90** | **PASS** |
| D primary `#faf9f5` on `#141413`/`#1c1b1a`/`#242320` | — | 17.50/16.32/14.92 | PASS |
| D secondary `#b0aea5` on `#141413`/`#242320` | — | 8.29 / 7.07 | PASS |
| D muted `#8f8d84` on canvas / layer-2 | — | 5.54 / **4.72** | PASS（贴线） |
| D link `#8ab4f8` on canvas / codeblock | — | 8.75 / 8.16 | PASS |
| D CTA 标签 `#141413` on clay | — | 5.90 | PASS |
| D inline-code `#e8a08a` on `#1c1b1a` | — | 8.05 | PASS |
| D apex / meter | — | 6.37 / 8.52 / 8.78 | PASS |

### 11.2 必须偏离上游的三处（例外清单）

| # | 项 | 上游 | 契约 | 理由 |
|---|---|---|---|---|
| E1 | clay CTA 标签 | `#faf9f5`（2.96） | **`#141413`（5.90）**，light 与 dark 一致 | 按钮标签是正文级文字；本地 dark 已经这么做，light 应统一 |
| E2 | `label-tertiary` 作正文 | 3.35 | 仅用于**非必要 meta**，或 ≥18.66px bold / ≥24px | 否则 AA 不达 |
| E3 | caption / disabled | 2.53 / 3.40 | 仅用于时间戳、不可交互项 | 上游同样如此 |

### 11.3 非文本对比度（SC 1.4.11）

| 项 | 实测 | 判定 |
|---|---|---|
| L 描边 on canvas/overlay | 1.22–1.86 | 低于 3:1 |
| D 描边（白 .09/.18/.30 合成后） | 1.27 / 1.72 / 2.71 | 低于 3:1 |
| L focus ring `#d97757`（**现状**） | 3.04 | 通过（贴线） |
| D focus ring `#d97757`（**现状**） | 5.90 | 通过 |
| **L focus ring `#141413`（契约）** | **17.96** | 通过（大余量） |
| **D focus ring `#faf9f5`（契约）** | **17.50** | 通过（大余量） |

**契约**：输入框等控件**不得**只靠描边表达边界与状态。必须同时具备（a）可见 label 或填充差（上游 light 输入框 `#ffffff` on `#fcfcfb`；dark `#0f0e0d` on `#141413`——**两者都靠 L3/D5 才成立**），（b）focus 描边用 **primary 文字色**（light `#141413` / dark `#faf9f5`）而非 accent，且 ≥3:1。这样 SC 1.4.11 由填充差 + focus 共同满足，**这反过来使 L3（`#ffffff`）与 D5（`#0f0e0d`）成为无障碍必需项而非美化项**；同时契约态把 focus 的余量从 3.04 提到 ≈18，**不再贴线**。

### 11.4 洗涤层上的文字（本轮新发现）

| 场景 | 实测 | 判定 |
|---|---|---|
| L secondary `#6e6a60` on ink@8% (→`#e9e9e8`) | **4.44** | **FAIL** |
| L secondary on ink@14% (→`#dcdcdb`) | **3.93** | **FAIL** |
| D muted `#8f8d84` on white@8% (→`#272726`) | **4.49** | **FAIL（贴线失守）** |
| D muted on white@14% (→`#353534`) | 3.69 | FAIL |
| L ghost hover clay@11% 上的 primary / link | 16.05 / 7.06 | PASS |
| D 同上 | 15.22 / 7.61 | PASS（accent `#d97757` 在 clay 洗涤上 5.14 PASS；light 上仅 2.72，**accent 不得作浅色洗涤上的文字**） |

**契约（硬性）**：`element.medium`（= `color.selection.surface`、`color.action.neutral.surfaceHover`）以及任何 ≥8% 的深色洗涤，**其上的次级/三级文字必须提升到 primary**，否则洗涤上限压到 **5%**。这是本轮唯一一个「上游也错、必须本地自行加严」的项。

### 11.5 其它

- 触控目标 ≥44px：沿用设计系统，无需改。
- 键盘可达：不改结构，自然满足。
- `prefers-reduced-motion`：归 host/OS（上游 `--dsh-claude-duration-reduced: 0.01ms` 的教训是**不要用 0**，否则 `transitionend` 永不触发——若将来本地做 reduced motion，记下这条）。

---

## 12. 优先级与验收标准

### 12.1 优先级

| 级 | 项 | 为什么 |
|---|---|---|
| **P0-1** | L2/D1 · 侧栏与根节点色阶（light 12-21 步 → 1-2 步；dark 与外画布同值） | 面积最大、观感差异最直接；上游 `sidebar-fill` 与 canvas 的关系是本皮肤的身份 |
| **P0-2** | L15-L17 · light 四级文字梯对齐（含新增第 4 级） | 全站正文/元信息密度最高；现状 secondary 比上游深 52 步 |
| **P0-3** | D1-D5 · dark 暖化（去掉冷灰） | 违反上游硬规则，且是「看起来不像 Claude」的主因 |
| **P0-4** | L21/D15 · `color.link.*` 投影 | 现在正文链接是 **cyan**，与 Claude 完全不符；改动量 2 行 |
| **P0-5** | E1 · CTA 标签改 `#141413` | AA 硬门 |
| **P0-6** | L18b/D13b · **focus 改用 primary 文字色**（非 accent） | 违反上游明示硬规则「Accent is never used for focus strokes」；且把 focus 余量从 3.04 贴线提到 ≈18；改动量 = 1 个 palette 字段 + 3 行投影 |
| **P1-1** | L3/D4 · 浮层抬升（light `#ffffff`、dark `#1e1e1d`） | 无障碍必需（§11.3）+ 浮层与画布现在不可分 |
| **P1-2** | L6-L9/D6-D7 · 描边改不透明暖梯（light）/ 白（dark） | 结构性 |
| **P1-3** | §7.2 · rung 置换（−3 near） | 解锁下面所有项的前置条件 |
| **P1-4** | L20/D20 · 行内代码 + 代码块角色 | 需新 palette 字段 |
| **P1-5** | §5.3-1 · CJK 衬线（若你要中文正文也呈衬线） | 中文观感最大项 |
| **P2** | shadow.lg 对齐 lv2；滚动条暖灰；motion 单值对齐 120ms/`ease` | 细节 |
| **P3 / 不做** | 动效 token 扩容、z-index 层、hero/wallpaper 绘制、皮肤私有 token 命名空间 | 需 ADR，超本轮 scope |

### 12.2 验收标准（可勾选）

**A. 数值类**
- [ ] A1 light：`color.surface.chrome` = `#fbfbf9`，与 `color.surface.canvas` `#fcfcfb` 距离 ≤2.5
- [ ] A2 light：`color.surface.raised` = `#ffffff`，与 canvas 可见分离（≥5）
- [ ] A3 dark：`color.surface.chrome` = `color.surface.canvas` = `#141413`
- [ ] A4 dark：`background.secondary`/`tertiary`/`elevated` 三者 R≥G≥B（暖），**无 B>R 的值**
- [ ] A5 light 文字四级 = `#141413`/`#6e6a60`/`#8f8a7e`/`#a6a094`（允许 ±2 步的审计停靠）
- [ ] A6 dark 文字四级 = `#faf9f5`/`#b0aea5`/`#8f8d84`/`#6b6a65`
- [ ] A7 light 描边 = `#e8e6dc`/`#dedcd2`/`#d0cdc1`（+strong），全部**不透明**
- [ ] A8 dark 描边 = 白 `.09/.18/.30`
- [ ] A9 `color.link.default` 在 Claude 下 = `#184f95`(light)/`#8ab4f8`(dark)
- [ ] A10 CTA 标签两套均 = `#141413`
- [ ] A11 `color.focus.ring`、`color.field.borderFocus`、`color.field.borderActive` 在 Claude 下 = `#141413`(light)/`#faf9f5`(dark)，**且不等于 `color.accent.default`**
- [ ] A12 `effects.radius` 的 `sm/base/lg` = `4px/8px/16px`（`xl`/`2xl` 保持不在契约内）；`full` = `9999px`；间距仍为 4px 节奏
- [ ] A13 普通单向分隔线为 1px（0.5px 仅保留给侧栏/对话区分隔，若本地未做该分隔则不得使用 0.5px）

**B. 审计类**
- [ ] B1 `pnpm run theme:color-audit:all` 通过，且 `themePreset.indistinguishableTotal` = **0**
- [ ] B2 `themePreset.nearTotal` **≤ 7**，并已把实测值写回 baseline（若低于 7，**必须下调**）
- [ ] B3 `scripts/theme-color-near-pair-decisions.json` 中每条 Claude 相关条目 reason ≥60 字符、reevaluation ≥30 字符、owner 为已存在路径
- [ ] B4 未修改任何 baseline 以「让审计通过」；若数值上调，原因必须是**新增可见色阶**，并在契约里披露
- [ ] B5 `pnpm --dir src/web-ui run type-check`、`npx vitest run src/infrastructure/appearance` 全绿，快照按 `-u` 有意更新
- [ ] B6 `pnpm run appearance:contract-audit`、`theme:visual-contract`、`i18n:audit`、`check:web` 与 guide:184-204 期望一致
- [ ] B7 其余 9 个 builtin appearance 的生成快照**逐字不变**（证明新 palette 字段是可选且带回退）

**C. 无障碍类**
- [ ] C1 正文（primary/secondary）在所有基调 surface 上 ≥4.5:1
- [ ] C2 CTA 标签 ≥4.5:1（两套主题）
- [ ] C3 `element.medium` 及其以上洗涤上不存在 secondary/muted 文字；或洗涤 ≤5%
- [ ] C4 focus 描边在其落点上 ≥4.5:1（契约值 ≈18:1），且 **`color.focus.ring` ≠ `color.accent.default`**（上游硬规则：accent 绝不作 focus 描边；设计系统 light 本身亦为中性 `neutral.650`）
- [ ] C5 light `accent` 不作为浅色洗涤上的文字色（2.72 FAIL）
- [ ] C6 例外清单 E1-E3、§11.3 未被静默放宽；每条例外有本文档的行号引用

**D. 实机类**
- [ ] D1 激活 Claude 后 `getComputedStyle(document.body).backgroundColor` = `rgb(251, 251, 249)`（light 根=侧栏）/ `rgb(20, 20, 19)`（dark）
- [ ] D2 主画布 = `rgb(252, 252, 251)` / `rgb(20, 20, 19)`
- [ ] D3 正文链接计算色在 Claude 下为 `rgb(24, 79, 149)` / `rgb(138, 180, 248)`
- [ ] D4 与 `assets/live-claude-light.png`、`live-claude-night.png` 并排目视：侧栏/画布关系、文字四级的相对强度一致
- [ ] D5 **侧栏↔画布距离**（§4.3 方法复采）：light ≤ 3（上游 2.4，现状 27.5）；dark = 0（上游同值，现状 9.4）
- [ ] D6 **dark 无冷灰**（§4.3 结论 2）：侧栏、菜单、empty-row 三个面的实测值均 R≥G≥B；现状三处均为 B>R
- [ ] D7 **浮层与画布的距离**（§4.3 结论 3）：light ≥ 5（现状 0）；dark ≥ 5 且为暖值
- [ ] D8 采样脚本对 100% 覆盖率区域应逐字命中源码值（`#fcfcfb`/`#141413` 已证）；若出现 1 步偏差先排查是否截图过期（§14.9）而非改契约

### 12.3 不变量（不得违反）

- 不修改 `scripts/theme-color-governance-baseline*.json` 以外的任何放宽动作；不新增 broad allowlist
- 不改 `design-system/packages/theme/src/*.tokens.json`（guide:163）
- 不改 `scripts/theme-visual-governance-contract.json`、`Opc-Installer/**`、`src/apps/cli/src/ui/theme.rs`
- `appearancePresetOutput.test.ts` 的全部不变量继续成立（`color.action.primary.background` = `components.button.primary.background`、`field.border` = `border.base`、`field.groupBackground` = `background.tertiary`、`actionCard.background` = `element.base`、`action.neutral.content` = `text.secondary`、semantic 必须等于 `createSemanticColors(mode)`、git 必须匹配设计系统、禁用 `accent[800]`/`purple[50|400|800]`/`background.quaternary`/`background.tooltip`/`element.elevated`、禁字面量 `#fdfdfd`/`#e2e6eb`/`#f0f2f5`）
- **浅色下 `field.background` 必须与 canvas 有可见差**（因 `field.background` ← `background.secondary`，而 `surface.panel` 同源；若要 `panel`=`#fcfcfb` 而 `input`=`#ffffff`，就必须用 §9.2 的 `background.input`，不能靠改 `background.secondary`）

---

## 13. 需要你补充的素材

| # | 素材 | 用途 | 阻塞什么 |
|---|---|---|---|
| ~~C1~~ | ~~上游圆角实测值~~ | — | **已解决**：`docs/STYLE.md:206-244` 给出 4/8/16px 基准 + popover 12/6px + CTA 9999px + 宿主控件副本例外 + 4px 间距节奏 + 0.5px 发丝线 + 阴影 lv2。已并入 §6 |
| C2 | **本地上游 Markdown h2/h3 的实际生效路径**（宿主是否用 `font:` 简写读 `--dsw-font-markdown-h2`） | §5.3-2 | 若不成立，19 个 role 重映射对 h2/h3 无效 |
| C3 | ~~`live-claude-serif.png` / `live-claude-night-serif.png` 的说明~~ | — | **已解决（实测）**：见 §4.3——serif 捕获中拉丁 `OPC-Team,` 确为衬线，CJK 仍为 sans，**与上游 `--dsh-claude-font-prose` 的故意设计一致**。CJK 衬线因此是纯取舍，不是信息缺口 |
| C4 | **上游动态态截图**：hover / selected / focus / open menu / popover 各一张（light+dark） | §11.4 洗涤层、§8 popover | 洗涤上限 5% vs 8% 的最终取值 |
| C5 | **上游代码块与行内代码截图**（light+dark） | §9.2/§9.3 | 行内代码 token 形状（一个字段 vs 一组） |
| C6 | **你对 R1/R2/R3 的裁决** | 全文 | 冻结 v1.0 |
| C7 | （可选）上游 `chrome.css`/`sidebar.css`/`hero.css` 中**结构性**绘制的清单：哪些你希望本地也做（会引入组件改动，超出本轮 scope） | §1 R1 表第三行 | 是否要另立 ADR |

**已有、可直接用于验收的素材**：`assets/live-claude-light.png`、`live-claude-night.png`、`live-claude-serif.png`、`live-claude-night-serif.png`（4 张，本 worktree 内）。我尚未逐像素比对这四张，因为契约的数值口径已经能从 `tokens.json` 逐字取得——**若你希望我把这 4 张也纳入验收基线（作为 A/D 组的目视判据），请确认，我会补一节像素采样。**

---

## 14. 开放问题

1. **`label-tertiary` 的归属**：本地 `color.content.caption` 与 `color.content.muted` 同源于 `text.muted`（`buildBuiltinAppearance.ts:140`/`:144`）。上游 tertiary 与 caption 是**两级**。若要对齐四级，需要第 4 个 palette 文字字段（或让 caption 取 `text.disabled`）。当前 4 个字 text 字段 → 上游 4 级，是够的；但「tertiary 与 caption 分别投哪两个本地 token」需定：建议 muted→tertiary、disabled→caption，**并接受 caption 失去 `color.content.muted` 的语义**（后者是更常用的 token）。这是语义命名冲突，**需你定**。
2. **light `element.medium` 的角色冲突**：它同时是 `color.selection.surface` 与 `color.action.neutral.surfaceHover`。§11.4 要求它 ≤5%，但作为 selected row 底色 5% 可能太弱（上游 `interactive-bg-active` 是 clay@30%）。**替代方案**：selected row 改用 clay 洗涤（上游做法），则 `selection.surface` 需要能取 accent 系值 —— 这会让 `element.medium` 从 `selection.surface` 解绑，需要改投影。**需你定。**
3. **dark `input` 与 `workbench` 是否同值**：上游 `input-major #0f0e0d` 而 `workbench` 由宿主给。建议同值 `#0f0e0d`，减少一个色值（也减少 near 风险）。
4. **`#c2beb0`（L9 strong）**：上游没有第 4 级描边。若你认为不该凭空延伸暖梯，也可让 `border.strong` = `#d0cdc1`（与 medium 同值，零 near 代价）。**需你定。**
5. **是否接受 light CTA 取 `#141413`**：这会让 Claude light 的按钮看起来与上游不同（白字 → 深字）。这是 R3 的具体化，**需你明确确认**——我不会替你放宽 AA。
6. **focus 是否改用 primary 文字色**（§6.1 / P0-6）：这是唯一一处「上游明示硬规则 + 本地无障碍同时受益」的改动，但会让 focus 从橙色高亮变成深/浅中性色描边。若你希望保留橙色 focus，则必须承认它违反上游硬规则，并且 light 下 3.04:1 是贴线通过。**需你定。**
7. **`colors.focus` 用独立字段还是直接复用 `colors.text.primary`**：独立字段更明确（将来某个 appearance 可能想用非文字色做 focus），但多一个 palette 字段。我倾向前者（§9.2），**需你定。**
8. **浮层/菜单面到底消费哪个 token**（§4.3 结论 3）：实测 dark 菜单 = `#1c1c1f` = `background.secondary`，而不是声明的 `background.elevated` `#262421`；light 两者同值无法区分。**这意味着「把 light `background.elevated` 改成 `#ffffff` 就能让浮层与画布分离」这个推论可能不成立。** 需要先在 Web UI 里定位菜单/popover 的实际样式 owner（很可能读 `color.surface.panel` 或 `color.field.background`）再决定改哪个字段。**这是 P1-1 的实现前置条件，也是唯一可能让一个 P1 项返工的点。**
9. **实测的 1 步偏差**（sidebar `#f0efe6` vs 源码 `#f0eee6`、dark `#0e0e0f` vs `#0e0e10`）：需要你确认这 4 张截图是否为**当前 palette 常量**下重新采集的。若不是，请重采，否则 §4.3 只能作为关系证据（已在 §4.3 结论 4 声明）。

---

## 附：本契约用到的一次性核算

以下脚本仅用于产出上表的数字，位于 `.dsh-tmp/`，**不属于交付物，不进入提交**：

- `.dsh-tmp/pairs.mjs` —— 早期标注版近色对扫描（已被下一版取代）
- `.dsh-tmp/contract-math.mjs` / `.dsh-tmp/contract-math2.mjs` —— 按 `audit-theme-colors.mjs:664-720` 的口径复算：色值去重后的近色对/不可区分对、rung 阶梯研究、对比度矩阵（含洗涤层合成）
- `/tmp/r.py`（区域众数取色）与 `/tmp/c.py`（hero 文本放大对比）—— 供 §4.3 的实机采样与排版验证；依赖 bundled Python `Pillow 12.3.0`

复算口径与审计一致：欧氏 RGB 距离、`alphaDiff ≤ 0.003 → indistinguishable`、`≤ 0.03 → near`、色值去重（同色值只计一次）。**唯一已知口径差**：审计的 near 对基于**源码字面量字符串**去重，因此同一颜色若在源码里写成两种拼法（如 `#141413` 与 `rgba(20, 20, 19, 1)`）会**被计为不可区分对**。实现时必须保证同一色值全仓拼法一致。
