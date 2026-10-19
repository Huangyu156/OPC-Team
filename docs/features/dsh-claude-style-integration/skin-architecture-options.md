# dsh-claude-style 接入架构候选评估

> 状态：设计评估（提议中，未运行验证命令）
> 范围：`src/web-ui` 外观/皮肤层；不改 Rust、不改组件结构
> 输入：`.upstream-ref/`（Nwflower/dsh-claude-style v0.16.3）、`spec.md`、`ui-adaptation-guide.md`、`visual-contract.md`
> 分支：`claud-skin`（worktree `H:\智能体开发\OPC-Team\.dsh\gitworktree\claud-skin`）

---

## ADR-000: 皮肤能力走 appearance 数据面，而非引入 DSH 插件宿主

### 状态
提议中（等待评审；替代方案 A/C 见下）

### 背景

上游是**宿主注入型皮肤插件**：cordis 打包分发，`skin.json` 声明 `id/bodyAttr/data-dsh-claude-style/accent/wiring`，
客户端在 `body` 属性下用私有 token 与 CSS 覆盖宿主别名，并自带 JS 功能（scheduler / chunks /
stylesheet park / usage ledger / peakrate / routes）。

OPC-Team 已有**声明式外观系统**（`src/web-ui/src/infrastructure/appearance/**`）：外观是数据
（`AppearancePackage`，含 `globals` 颜色/长度/时长/缓动 + `renderers` 投影 + 可选 `components` 结构化 part），
由注册表（每个视觉 owner 一个 `.appearance.ts` 描述符）校验并编译为 CSS 变量/Monaco/主题 token。
现有兼容只做到配色（`builtins/claudeStyle.ts`、`claudeNight.ts`、`palettes.ts`）。

结论性问题：**上游剩余差异，哪些是「外观数据不足」，哪些是「产品功能缺失」？**

### 可表达性分层（决定方案成本的关键证据）

| 层 | 差异内容 | 现有系统能否表达 | 证据 |
|---|---|---|---|
| L0 颜色/字重 | 4 级面色阶、暖描边取色、代码配色 | ✅ 已覆盖 | `builtins/palettes.ts`、`buildBuiltinAppearance.ts` 投影 |
| L1 外观数据缺口 | focus 环取 primary（非 accent）、行内代码/代码块面色、暖灰滚动条 | ⚠️ 需 3 个 palette 字段 + 2 行 `link` 投影；滚动条字段已存在 | `visual-contract.md:344,347,374-404`、`AppearancePalette.ts:94,135` |
| L1′ 结构化外观 | 0.5px hairline、radius 4/16、`--dsw-shadow-lv2`、动效时长/缓动 | ⚠️ Style IR 已能表达（`borderWidth?/borderTopWidth?/boxShadow?`、`globals.lengths/durations/easings`），缺的是 **part 覆盖与 property profile** | `appearance/types/*.ts:226-242,571`；`buildBuiltinAppearance.ts:455-520` |
| L2 组件结构 | 窄栏布局、时序轨道、工具行对齐、表格圆角裁切 | ❌ 需逐 owner 组件/描述符改动 | `ui-adaptation-guide.md` 区域清单 |
| L3 DOM+JS 运行时 | bundle patch、DOM 观察总线、27 个 feature 模块、宿主 Node 服务 | ❌ 且**不应**由皮肤承担 | `.upstream-ref/packages/client/src/entry.ts`、`host/` |

上游体量：`client` 45,772 行 / 308 文件 / 27 feature；`engine` 5,285 行；`host` 2,976 行；
`contracts` 1,886 行；主题层 801 行 `tokens.json` + 8 个 CSS 共 2,217 行。
本项目 appearance 域：71 文件；注册表 509 行、约 70 个 `.appearance.ts` 描述符；
审计规模 246 surfaces / 2,957 DOM contracts / 280 styled component owners（`spec.md:328`）。

### 决策

**采用候选 B：把上游当作设计意图来源，移植为本地 appearance 能力（palette 字段 + 最小语义 token +
registered part 覆盖），不引入 DSH 插件宿主。**

### 备选方案

见下方 §候选方案对比。

### 影响

- 皮肤能力继续留在 appearance 域（数据 + 投影），组件与平台层零改动。
- L3 的 JS 功能（usage 面板、调度器、样式接管）**不进入皮肤**，作为独立产品 feature 单独立项。
- theme token ratchet 需要显式 owner 契约与 decision 记录，而不是抬高基线。

---

## 候选方案对比

| 维度 | **A. 上游即插件（做 DSH 兼容宿主）** | **B. 移植为本地皮肤层 + appearance 扩展** ⭐ | **C. 重构核心组件 + 抽象皮肤契约 v2** |
|---|---|---|---|
| 改造范围 | 新建 cordis 兼容宿主 + client 注入点 + DOM 观察总线 + 宿主 Node 服务门面；上游冻结为依赖 | palette 3 字段 + 2 行 `link` 投影 + ≤3 个 `markdown.*` token + registered part 覆盖 + 1 个 builtin 外观 | 语义组提升（motion/结构描边/markdown 族）+ 消费组件重构 + 注册表/property profile/主题生成器/基线迁移 |
| 工作量 | 大（新增 3–8k 适配行，且需长期跟上游版本） | 小–中（1 个 feature slice，纯前端数据面） | 大（波及 280 styled owners 的样张与 171 个设计系统 token 取值模型） |
| 「平台无关产品逻辑 + 平台适配器」边界 | ❌ 违反：把 DSH 的 DOM/注入模型搬进产品，web-ui 变成被第三方 CSS/DOM 主宰 | ✅ 符合：皮肤是 appearance 域的数据 + 投影 | ✅ 符合，但属**过早抽象**（Rule of Three：当前只有 1 个皮肤需求） |
| theme token ratchet | ❌ 硬冲突：上游自带 body 属性私有 token + CSS 覆盖，绕过 appearance 编译器与 `theme:color-audit:all` → 审计盲区 | ⚠️ 可控：`themePreset.nearTotal` 7→≤8 需在 `theme-color-near-pair-decisions.json`（现 8 条）新增 1 条决策；`occurrences`/`uniqueColors` 上升必须用**合并冗余值**抵消，而非抬 `max`；`indistinguishableTotal` 必须保持 0 | ❌ 高风险：基线需先升后降重算，near-pair 决策集重写 |
| i18n audit | ❌ 冲突：上游 `locale/en.json|zh.json` + 每 feature `copy.json` 绕过 `locales.json` 契约与无硬编码 CJK 预算 | ✅ 无影响（外观名 1–2 个 key 走契约） | ⚠️ 需同步检查（若新契约引入用户可见标签） |
| core boundaries | ❌ 宿主 half 的 usage ledger/peakrate/routes 与 services/contracts 职责重叠；新增命令需在 `remote_surface/table.rs` 登记行 | ✅ 不触 Rust，零新增命令 | ⚠️ 若抽象落在 shared 契约层需重新过 `check:core-boundaries` |
| remote 四场景 | ❌ 全部失效：DOM 观察需真浏览器；detached dispatch 无插件宿主；peer 模式无注入点 | ✅ remote workspace / detached 完全不受影响（纯前端数据）；peer 沿用现有 ControllerLocal 语义（`table.rs:112-120` 已登记 `appearance_market_*`）；**remote control（mobile web）有独立 `src/mobile-web/src/theme/`，不消费该外观 → 文档明示「不复用」而非假装支持** | ⚠️ 抽象只覆盖 web-ui；mobile-web 独立主题使收益被截断 |
| 升级与持久化形状 | ❌ 双配置源（上游 live prefs/settings form 与本地 config 并存）；上游 DOM 选择器随产品 DOM 变更即碎；插件版本 ≠ 宿主行为（AGENTS 明确「包版本相等不是行为证据」） | ✅ palette 新字段为可选取值，旧构建忽略未知字段即可；包 `schemaVersion` 与 `requiredCapabilities` 不变；**要求 registry 对未知 part 宽容降级**（新增兼容测试） | ❌ 契约 v2 本身成为持久化形状（包 schema、快照），需能力协商 + 旧包兼容路径，成本高于收益 |
| 结论 | 否决（除非目标改为「成为 DSH 的兼容宿主」这一独立产品方向） | **推荐** | 推迟到出现第 2/3 个皮肤需求时再评估 |

---

## 推荐理由

1. **缺口不在运行时，而在数据面。** 上游可见价值的 L0/L1/L1′ 三层，现有 appearance 编译器
   已具备表达手段（`globals.lengths/durations/easings`、`borderWidth/boxShadow`、part + property profile、
   内置外观已用 `composeAppearancePackage` 产出 `schemaVersion: 2` 包）。真正缺的是
   3 个 palette 字段、≤3 个 `markdown.*` 语义 token，以及 part 覆盖清单。
2. **与仓库硬约束零冲突。** 不动组件、不动 Rust、不改基线语义（只加 decision 记录）、
   不新增 remote surface 行、不动 i18n 契约。
3. **可逆性最高。** 皮肤是数据：回滚 = 删除 builtin 条目 + 恢复 palette 常量 + 移除 decision 行；
   无持久化迁移、无跨版本协议。
4. **把越界部分挡在门外。** L3 的 JS 功能（usage 面板、调度器、样式接管）是产品功能，
   应由 `flow_chat/**`、`app/scenes/settings/**` 作为独立 feature 承担，而不是借皮肤之名注入 DOM。

---

## 分阶段路径

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0**（本分支） | 3 个 palette 字段（focus / code 面色 / 启用 `scrollbar`）+ `link` 两行投影 + P0-1…P0-6 常量修正 + 新增 1 条 near-pair decision | `pnpm run appearance:contract-audit`；`pnpm run theme:color-audit:all`；`pnpm --dir src/web-ui run test:run src/infrastructure/appearance/registry/AppearanceRegistry.test.ts` |
| **P1** | ≤3 个 `markdown.*` 语义 token（带最小 owner 契约）+ 用**已有 part id** 交付 hairline/radius/shadow/motion 覆盖（不新增 part 语义） | 同上 + property profile 测试；`indistinguishableTotal` 仍为 0 |
| **P2**（可选） | L2 结构差异逐个 surface 提最小 owner 契约（每处 1 条 decision），不做全局抽象 | surface 级 `appearance:contract-audit` |
| **P3**（条件触发） | 出现第 2/3 个皮肤需求时，再评估候选 C 的契约抽象 | 需独立 ADR |

---

## 风险与回滚

| 风险 | 触发条件 | 缓解 | 回滚 |
|---|---|---|---|
| R1 新增取色被判「不可区分」 | near-pair 判定 | 用 visual-contract 已记的替代色阶（`-3` 亮度梯） | 移除该 decision 行，恢复原常量 |
| R2 新常量推高 `occurrences`/`uniqueColors` | 基线 ratchet | 同批合并冗余 token 值，禁止抬 `max` | 同上 |
| R3 旧构建读到新 palette 字段/新 part | 就地升级 | 字段全部可选；registry 对未知 part 宽容忽略（补兼容测试） | 无迁移，仅数据回退 |
| R4 把 L3 功能塞进皮肤 | 实现时图省事 | 代码评审红线：appearance 域不得出现 DOM 观察/定时器/网络 | 拒绝该 PR |

**回滚成本**：低。无 Rust 改动、无持久化形状变更、无跨版本协议；回滚即数据回退。

**remote 四场景声明**：本方案在 remote workspace / detached dispatch 下无行为影响（纯前端数据）；
peer device 沿用既有 `ControllerLocal` 语义，不新增 surface 行；remote control（mobile web）
不消费该外观，需在功能文档中**明示不复用**。以上为设计结论，未做真机验证。

---

## 关键文件路径

**上游（只读参考）**
- `.upstream-ref/skin.json`、`.upstream-ref/packages/client/src/entry.ts`（注入模型）
- `.upstream-ref/packages/engine/src/skin.ts`（皮肤接缝）、`.upstream-ref/packages/client/src/theme/tokens.json`（801 行）
- `.upstream-ref/packages/host/`（宿主 Node half，2,976 行）

**本项目 — 外观数据面**
- `src/web-ui/src/infrastructure/appearance/builtins/claudeStyle.ts`、`claudeNight.ts`、`palettes.ts`
- `src/web-ui/src/infrastructure/appearance/builtins/AppearancePalette.ts`（`:94` scrollbar、`:135` focus、`:229` motion）
- `src/web-ui/src/infrastructure/appearance/builtins/buildBuiltinAppearance.ts`（`:455-520` globals/renderers 装配）
- `src/web-ui/src/infrastructure/appearance/builtins/composeAppearancePackage.ts`（`:197-216` `requiredCapabilities` 合并）
- `src/web-ui/src/infrastructure/appearance/registry/defaultAppearanceRegistry.ts`（509 行，约 70 描述符）
- `src/web-ui/src/infrastructure/appearance/types/*.ts`（`:226-242` Style IR；`:571` `allowedProperties`）
- `src/web-ui/src/infrastructure/appearance/schema/AppearancePackageValidator.ts`（`:154` 顶层字段白名单）
- `src/web-ui/src/infrastructure/appearance/appearanceTokenContract.ts`、`appearanceDomainTokens.ts`、`appearancePropertyProfiles.ts`

**本项目 — 治理与验证**
- `scripts/theme-color-governance-baseline.json`（`:176-181`、`:260-265`）
- `scripts/theme-color-near-pair-decisions.json`（当前 8 条）
- `docs/architecture/theme-token-optimization.md`、`docs/architecture/i18n.md`
- `src/crates/contracts/product-domains/src/remote_surface/table.rs`（`:112-120`）
- `src/crates/assembly/core/builtin_skills/create-opc-skin/`（皮肤包创作工具）
- `src/mobile-web/src/theme/`（独立主题，证明 remote control 不复用）

**本特性文档**
- `docs/features/dsh-claude-style-integration/spec.md`、`ui-adaptation-guide.md`、`visual-contract.md`
