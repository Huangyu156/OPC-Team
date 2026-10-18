# 模型选择器 · 思考强度 · 流式呈现 · 交互契约

| 项 | 值 |
|---|---|
| 上游 | `dsh-claude-style` v0.16.3，`.upstream-ref/`（只读），`packages/client/src` |
| 本地 | `claud-skin` worktree，`src/web-ui/src/flow_chat` + `src/web-ui/src/infrastructure/markdown` |
| 范围 | 只定义交互与信息架构：入口、展开、分组、键盘与指针、状态回显、边界、无障碍、降级 |
| 不含 | 视觉数值（见 `visual-contract.md`）、实现顺序（见 `model-effort-controls-gap.md`、`streaming-motion-gap.md`） |
| 状态 | 契约待裁决；**未改任何代码** |
| 日期 | 2026-10-19 |

## 0. 一句话结论

上游三个控件共用同一套交互骨架：**触发器只描述自己打开的东西**、**卡片一次只有一张**、**飞行中不收回已有内容**、**提交后卡片留在原地**。本地三处都在骨架之外：强度被塞进模型卡片、滑块被换成按钮组、流式速度被两个系统同时拥有。契约的核心工作是先把入口与状态所有权拆清，其余逐条对齐。

---

## 1. 上游交互契约归纳

### 1.1 模型选择器（`features/model/model-picker.ts` 702 行 + `model-picker.css` 234 行）

| 维度 | 契约 |
|---|---|
| 入口 | 宿主槽位 `[data-slot="conversation.input.model"]` 内，皮肤自建 `button.dsh-claude-model-btn`，插在宿主 seat 之前；`aria-haspopup="menu"`，`aria-label` = 触发文案 + 当前模型名 |
| 层级 | 两级。一级 = 当前 provider 的模型 + 分隔线 + More models 行；二级 = 剩余 provider 分组，贴在卡片右侧 |
| 滚动 | 一级卡拆「可滚动列表 + 固定页脚」：`.dsh-claude-popover-body` 是 `flex:1 1 auto; min-height:0; overflow-y:auto`，页脚（分隔线 + More models）在滚动区外，行始终可达 |
| 分组 | provider 内模型按 model id 排序（catalog 原始顺序是站点偶然顺序）；官方 provider 不出组名；当前 seat 若不在列表内，追加在分隔线上方 |
| 展开方式 | 点击切换；`autoPopover === ALL` 时额外支持 hover，开 100ms / 关 150ms（两级卡更宽，100ms 走不完跨间隙的路程） |
| 指针追踪 | 卡开期间 document 捕获阶段 mousemove，±8px 带内算在卡内；`pointerInPicker()` 把两张卡之间的窄缝也算作未离开 |
| 定位 | `side:'above'`，gap 6；二级卡贴一级卡右侧 `+2`，越界翻左并夹到 `[8, vw-w-8]`，底对齐并夹到视口内 |
| 一次一张 | `registerPopover('model', close)`：两级卡注册为一个条目，避免开二级时折掉一级；`closeOtherPopovers('model')` 保证同屏一张 |
| 状态回显 | 触发器永远可点（`modelBtn.disabled = false`）；仅在 `selecting` 且目录未就绪时加灰度类，标签仍显示旧模型名——飞行中灰掉会读作坏了 |
| 空/加载 | `!seated && status ∈ {idle,loading,selecting}` 时只画一行加载文案；**in-flight 的 seat 不清空已有列表**（慢提供商往返数秒） |
| 提交 | `pickModel → dir.select() → 关闭卡片`；强度提交后卡片**保持打开**，便于连续微调 |
| 重绘 | 内容签名（status/locale/current/quickProviders/描述开关/计费 epoch + 每段 id:机数）不变就不重建；语言变更清签名 |

### 1.2 思考强度（`features/effort/effort-picker.ts` 468 + `control.ts` 669 + `ladder.ts` 73 + `room.ts` 43 + `matrix.ts` 152）

| 维度 | 契约 |
|---|---|
| 入口 | **独立触发器**，`position: fixed` 由 body 挂载，每帧按模型触发器的 `getBoundingClientRect` 钉在旁边；`aria-haspopup="menu"`，`aria-label` = 强度标签 + 当前档名。理由记录在源码注释：档位是高频微调、模型是低频决策，两者节奏不同，各占一个触发器与一张卡 |
| 预留空间 | 触发器宽度通过 `marginRight` 加到模型触发器上，并把模型名的 `maxWidth` 让出溢出量；行内有余量时由 flex 间隙吸收，否则由模型名截断吸收 |
| 卡片结构 | 头（标签 + 当前值 + 退出值残影）→ 轴两端（更快 / 更强）→ 轨道（填充 + 刻度 + 顶点点阵 + 旋钮），`role="slider"` `tabindex="0"` |
| 顺序 | 宿主文档承诺 `efforts` 从弱到强，实测适配器违约（`xhigh,high,low,max,medium`），因此**按强度表重排再回填原槽位**；不可排名的档位保持原位；`undefined`（模型自身默认档）永远排最前 |
| 指针 | `pointerdown`（仅主键）→ `preventDefault` + `stopPropagation` + 捕获指针 + 立即把旋钮放到按下点（读作"移动"）+ 预览档名；首帧 move 之后才算 `dragging`（按下即置位会杀掉过渡）；每帧合并一次读后写；移出控件 ±6px 即就地落位，不跟指针跑 |
| 触感 | 段内使用正弦阻尼（系数 0.8，必须 <1，否则位移非单调、旋钮会倒退）；命中判定读原始坐标，曲线只改变视觉路径 |
| 提交 | `settle()` 先提交再落位再刷新文案：先画后提交会用旧选中值，名字回退并重放换名动画、顶点属性闪断导致点阵重扫 |
| 回显等待 | 提交后进入 `pendingEcho`（上限 12s，慢提供商实测约 8s）；期间 **update 不覆盖旋钮位置**，消除释放瞬间的"D 形回弹"；快照命名了目标档位即清；阶梯 id 序列变化也清（另一个问题，旧回显不会来） |
| 键盘 | `ArrowLeft/Down` 减一、`ArrowRight/Up` 加一、`Home` 首档、`End` 末档，全部 `preventDefault` + `stopPropagation`，提交后同步刷新 ARIA 与文案；无阶梯时提前返回 |
| ARIA | 有阶梯：`aria-valuemin/max/now/valuetext` + `aria-label`；无阶梯：`aria-disabled="true"` 并移除四个属性，根节点加 `data-empty`（凹槽降透明度、值显示为破折号、旋钮仍可移动并缓动回家） |
| 关闭 | hover 模式离开即关；拖拽中 `mouseleave` 不关（`isHeld()` 守卫）；拖拽释放用 `elementFromPoint` 判断是否在卡内；`close(reason)` **忽略 `composer`**——模型卡在输入框聚焦时关，强度卡不关 |
| 稳定边界 | 只有**已 settled** 的 seat 且无名可用阶梯才收回触发器；飞行中不得拿走触发器、不得让滑杆掉进空态（会被报为选择器崩溃）。滑杆元素构建后**永不 detach**（重插会重启换名与入场扫掠，每次往返都读作闪烁） |

### 1.3 流式呈现（`features/chat-reveal/` 8 文件 + `chat-fold/` + `chat-follow/`）

| 维度 | 契约 |
|---|---|
| 机制 | 字符到达即全量入 DOM，透明度从微弱升到自身颜色；`::highlight()` 不接受 `opacity`，因此 alpha 由 `color` 承载，每步一条构建期生成的规则 |
| 强度 | 24 步（规则成本上限，读作连续渐显），最淡 20%；`CHAT_REVEAL_MS` 从 motion token 读 |
| 错峰 | 同批字符之间再错开 1–8ms（按批次淡入时长等比），这是"梯子"感的来源 |
| 作用域 | 只作用于流式容器，容器外元素在样式匹配阶段被祖先过滤；observer 只看容器内变化 |
| 历史 | 安装时已存在的流式容器记为历史，不重放 |
| 让路 | 连续 4 帧慢于 50ms 即停止渐显 3s（文本照常到达，只是跳过渐显）；帧缝按名义 16.7ms 补偿；超过 1s 的间隔视为隐藏页，不计为"忙" |
| 折叠静默 | 读者点击/按键折叠后 400ms 内该容器不渐显；只在 click 时扫子树（keydown 的 target 常是整个 body） |
| 颜色源 | 段的颜色取自段所在文本节点 `parentElement` 的 computed color（markdown 层在流式期间会重建节点），变化时才写 CSS 变量；读 computed style 是强制样式解析，必须每段只读一次 |
| 能力降级 | 缺 `CSS.highlights` 或 `Highlight` 构造器时引擎返回 null，由安装方处理 |
| 光标 | 上游**正文没有光标**；唯一的 caret 是 composer 的 contenteditable overlay |

---

## 2. 差距与冲突

| # | 冲突点 | 上游 | 本地 | 处置 |
|---|---|---|---|---|
| **C1** | 入口语义 | 强度有独立触发器 + 独立卡片 | 强度嵌在模型卡片 summary 内，且模型触发按钮里再塞一段「思考强度：高」文案（`ModelSelector.tsx:2016-2026`） | **拆触发器**。一个按钮只描述它打开的东西；强度触发器与模型触发器并列，两者共用一个浮层组（开一张关另一张） |
| **C2** | 阶梯假设 | 假设 `efforts` 是有序档名阶梯 | preset 是异构 `actions`：`effort` / `toggle` / `budget_tokens` / `request_patch`，含 off/auto/adaptive/custom（`reasoningPresetPresentation.ts:27-47`） | 滑杆只在**可排名子集**成立时出现；含 `budget`/`custom`/`request_patch` 时退回现有分段控件。用滑杆给不可排名档位编造顺序是错误复刻 |
| **C3** | 提交节奏 | `commit` 立即 `onPick`，卡片保持打开 | 每次提交是 `agentAPI.updateSessionModel` 往返 + 乐观写 store + 失败回滚 + toast，且 `reasoningLoading` 期间整个触发器被 disabled（`ModelSelector.tsx:1384-1459`） | 逐格提交会产生请求风暴。改为**合并提交**：拖拽在 settle 提交，键盘走尾随合并（见 IC-E5） |
| **C4** | 浮层归属 | body 挂载 + fixed + 自量自预留（宿主槽位是 React 管的） | 明令 `createOverlayPortal` + `ownerRef` + 退出期保留 `open`，禁裸 portal 与按类别改 z-index | 照抄 body 挂载即违规。触发器留在 composer 行内，卡片走 `createOverlayPortal`，定位交给浮层所有者 |
| **C5** | 动效真值源 | `data-dsh-claude-motion` 已解析三元态，样式与 JS 读同一答案 | 只有 `isReducedMotionPreferred()`（`motionPreference.ts:58-60`）与构建期把 duration 置 0ms（`build.mjs:155-163`）；三个 hook 各自 matchMedia | 阻尼/滑行/换名/渐显错峰必须读同一真值，否则「CSS 停了 JS 还在算」 |
| **C6** | 焦点色 | 明确「强调色永不用于焦点描边」（composer 场） | 焦点环默认 accent（`color.focus.ring` ← accent[500]） | 两处分开裁决：滑杆轨道沿用本地焦点环以保持一致；composer 场按 `visual-contract.md` §6.1 走。需签字 |
| **C7** | 速度所有权 | 只有到达渐现，文本立刻全量进 DOM | 打字机 90–720cps **再叠**到达渐现（`useTypewriter.ts` + `useStreamingTextReveal.ts`） | 复刻流式前先裁决 A/B（`streaming-motion-gap.md` §4.1）。两者同跑时任何"错峰"参数都会以 16ms 为节奏重启 |
| **C8** | 虚拟化 | 无虚拟列表 | 消息列表虚拟化，滚出再滚回会重挂（`FlowTextBlock.tsx:30-32` 的 `replayOnMount=false` 是结论） | 任何新动效挂 Range/Highlight 或 WAAPI，**不得**挂在行容器 keyframe 上 |

补充差距（非冲突，按优先级）：本地渐显无错峰、无慢帧让路、无突发上限（`streaming-motion-gap.md` G1/G8）；`FlowTextBlock.tsx:160` 每个打字机 tick 重算解析；本地无 `data-opc-motion` 单一真值。

---

## 3. 交互契约

编号即测试与评审锚点。`IC-M` = 模型选择器，`IC-E` = 思考强度，`IC-R` = 流式呈现。

### 3.1 模型选择器（IC-M）

- **IC-M1 入口**：composer 尾行动作区（`ChatInput.tsx:7104-7126`）内的模型触发器；`aria-haspopup="menu"`、`aria-expanded`、`aria-controls`、`aria-busy`。触发器只承载模型名与 chevron，**不再承载强度文案**（强度移到 IC-E1 的触发器）。
- **IC-M2 层级**：摘要层（模式 / 模型 / provider）→ 模型层 → provider 层；`ArrowRight` 从 provider 行进模型层，`ArrowLeft`/`Escape` 逐层退。层级动画沿用现有 forward/back 方向语义。
- **IC-M3 一次一张**：模型卡与强度卡互斥，共用浮层组的关闭回调；不得靠"点外部"隐式互关。
- **IC-M4 飞行中**：模型/强度任一请求在飞时，卡片保持可读，已就绪的选项仍可点；失去列表数据时显示一行加载文案，**不清空**。
- **IC-M5 关闭与焦点**：`Escape` 关闭并把焦点还给触发器（仅当焦点在卡内）；指针点外部关闭不改焦点。
- **IC-M6 溢出**：模型名单行用 `OverflowText`，`data-overflow-trigger` 放在触发器按钮上。
- **IC-M7 未支持态**：`externalSelection?.disabled` 或远程/派发会话不支持切模型时，触发器禁用并给出 `disabledReason`；提示走既有 Tooltip，不新增弹窗。

### 3.2 思考强度（IC-E）

- **IC-E1 入口**：与模型触发器并列的独立触发器；标签 = 当前档名（无阶梯时为破折号）；`aria-haspopup="menu"`，`aria-label` = 本地化「思考强度」+ 当前档名。**位置偏离上游**：上游把强度触发器放在模型触发器**右侧**，并用 `margin-right` 在行内预留自身宽度（让模型名截断吸收）；本地的模型触发器右侧紧邻语音与发送按钮，若照抄会把强度挤到语音之后，故本地放在模型触发器**左侧**，宽度由 flex `gap` 与模型名 `OverflowText` 共同吸收，不写 margin。
- **IC-E2 形态选择（由数据决定，不由皮肤决定）**：
  - 全部选项可排名且 ≥3 档 → 滑杆；
  - 含 `budget`/`custom`/`request_patch` 或档数 <3 → 现有 `ReasoningIntensityControl` 分段控件；
  - 无任何 preset → 触发器不出现（不画禁用滑杆）。
- **IC-E3 顺序**：按强度表排序后回填原槽位；不可排名档位保持原相对位置；自动档（`reasoningAutomaticValue(...)` 有值）或 `allowDefaultReset` 时**固定第一档**，视觉上与其他档位区分（不参与强弱的线性读法）。
- **IC-E4 指针**：轨道 `touch-action: none`；主键按下即把旋钮放到按下点、预览档名；拖动超过 3px 才算 dragging；移出轨道 ±6px 就地落位；拖拽中卡片 `mouseleave` 不关闭；释放点用 `elementFromPoint` 判定是否在卡内，在外则关闭卡片。
- **IC-E5 提交（本地语义）**：
  - 拖拽：`pointerup` 提交一次当前档；
  - 键盘：每格先把旋钮与文案更新到本地，提交走 **200ms 尾随合并**，合并窗口内只发最后一次；
  - 提交在飞：后续输入进入"最新值挂起"位（只保留最后一个），当前请求返回后立刻发；不做队列；
  - 到达上限（12s）仍无回执：释放控件并进入错误态，`aria-live="polite"` 播报失败，值与旋钮回落到提交前位置；
  - 提交失败：乐观值回滚（沿用现有 store 回滚路径），播报失败，不关卡片。
- **IC-E6 状态**：`idle` / `dragging` / `pending`（请求在飞）/ `disabled`（会话不可改或无权限）/ `empty`（阶梯为空）。`pending` 期间旋钮**保持已提交位置**，不被快照回拉。
- **IC-E7 键盘与 ARIA**：轨道 `role="slider"` `tabindex="0"`，`ArrowLeft/Down`、`ArrowRight/Up`、`Home`、`End`，`PageUp/PageDown` 按 10% 步进并夹紧；全部 `preventDefault` + `stopPropagation`；`aria-valuemin/max/now` 与 `aria-valuetext`（本地化档名）随值同步；`empty` 时 `aria-disabled="true"` 且移除四个属性。RTL 下 `ArrowLeft` 仍读作"更强"还是"更弱"需在 §5 D2 裁决，默认沿用 ARIA 语义（值与方向无关，按数值增减）。
- **IC-E8 焦点**：键盘打开 → 焦点进轨道；指针打开 → 焦点不动；`Escape` 关闭并把焦点还给触发器；卡片内只有轨道一个可 Tab 元素，不设陷阱。
- **IC-E9 指针 hover**：上游 hover 开卡受 `autoPopover === ALL` 开关控制；本地 `ModelSelector.tsx` 全文无 `onMouseEnter`/`hover` 打开路径（已核对），因此契约取「hover 展开默认不存在」为现状，若将来产品开启，再按 100/100ms 意图时长追加，且强度卡关闭不受 `composer` 聚焦影响。
- **IC-E10 结构稳定**：卡片内滑杆节点在会话切换、模型切换、语言切换时**不得重挂**（重挂会重放换名与点阵入场）；只允许更新属性与文本。

### 3.3 流式呈现（IC-R）

- **IC-R1 速度所有权**：先裁决 `streaming-motion-gap.md` §4.1 的 A（保留打字机，渐现只做质感）或 B（去打字机，速度交给 flush）。未裁决前不改任何节奏参数。
- **IC-R2 只追加才动画**：仅当内容以既有文本为前缀追加时产生到达；替换/重写不重放（本地 `startsWith` 守卫已有，保持）。
- **IC-R3 错峰**：同批字符按段序号错开 1–8ms，随批淡入时长等比缩放；改错峰不得增加 `::highlight` 规则数（现 32 条已近上限）。
- **IC-R4 让路**：连续 4 帧慢于 50ms 停止渐显 3s；`document.hidden` 立即停止；`prefers-reduced-motion` 命中时**拆引擎**（清 range、撤属性）而不是 CSS 隐藏。
- **IC-R5 突发上限**：单批超过阈值（建议 4000 字形）不建到达，只整体淡入；打字机同步在 backlog 超阈值时走 `revealImmediately`，避免远程重连回灌把 footer 拖住数十秒。
- **IC-R6 复制与选择**：采用 Range/Highlight 方案，不插入 span、不改 `user-select`；正文不新增光标字符。
- **IC-R7 虚拟化**：动效只能挂在 paint 层或 WAAPI，不得用行容器 keyframe；`replayOnMount` 保持 false。

### 3.4 降级矩阵

| 场景 | 模型选择器 | 思考强度 | 流式 |
|---|---|---|---|
| 窄屏（< 480px） | 卡片宽度夹到 `calc(100vw - 16px)`（`ModelSelector.scss:165` 已是此写法），层级改为前进/后退单页 | 卡片改为贴 composer 底边的整宽面板；轨道命中高度抬到 `--opcteam-control-hit-target` | 不变 |
| 触摸优先（`data-density="touch"`） | 行高按 `min-block-size: var(--opcteam-control-hit-target)`（compact 36 / touch 48）抬升，不覆盖 `overlay.menu.itemHeight` | 命中区同规则，取消 hover 展开 | 不变 |
| 远程工作区 | 照常（命令已代理） | 照常 | 重连回灌走 IC-R5 |
| 远程控制 / 派发会话 | 命令未支持 → 禁用 + 明确原因，**不静默本地写入** | 同上 | 后台会话 rAF 暂停，重连后不重放历史 |
| Peer 设备模式 | 由 `ControllerLocal` 表决定，被代理则照常 | 同上 | 同上 |
| ACP 会话 | 走既有 ACP 分支与 65s 超时 | 阶梯来自 ACP，加载期显示 `pending` 而非空滑杆 | 不变 |
| 能力缺失（无 Highlight API） | — | — | 引擎返回空，正文按普通流式渲染 |
| 减少动效 | 卡片淡入改瞬时 | 阻尼与滑行取消，档位即时落位 | 拆引擎 |

---

## 4. 状态机总表

```
强度触发器      idle ──click──▶ open ──settle──▶ pending ──echo──▶ idle
                  ▲                │                  │
                  └── Escape/外点 ─┘                  └─ 失败/超时 ─▶ error ──▶ idle
形态            ladder ──(数据不可排名)──▶ segmented ──(无 preset)──▶ hidden
轨道            idle ──down──▶ pressed ──move──▶ dragging ──settle──▶ pending
                  └──────────────────────────── up/cancel ──────────▶ idle
流式            streaming ──(append)──▶ revealing ──(160ms/稳定)──▶ settled
                  └──(慢帧/隐藏/减动效)──▶ bypass ──▶ settled
```

---

## 5. 待裁决

- **D1**：强度触发器与模型触发器并排（C1 的处置）是否接受行宽代价——模型名可用宽度减少约一个档名宽度。
- **D2**：RTL 下方向键语义（IC-E7）取 ARIA 数值语义还是视觉方向语义。
- **D3**：焦点色（C6）两处是否分治。
- **D4**：流式速度所有权 A/B（IC-R1），这是产品决策。
- **D5**：滑杆替换分段控件的门槛（IC-E2 的"≥3 档"）是否合适。
- **D6**：顶点档位的点阵材质是否复刻。本地 `motion.duration.loop` 是 720ms，上游点阵周期 1450ms，唯一可行写法是 `calc(loop * 2)`；若评审禁止在组件里对 token 做倍数运算，则 `data-apex` 降级为只改旋钮与档名颜色（`§6.2` 已按此写）。

---

## 6. CSS / token 映射

### 6.1 颜色

| 上游语义 | 本地 token | 备注 |
|---|---|---|
| `--dsw-alias-label-primary` | `--opcteam-color-content-primary` | 档名、选中行 |
| `--dsw-alias-label-secondary` | `--opcteam-color-content-secondary` | 分组名、轴标签 |
| `--dsw-alias-label-tertiary` | `--opcteam-color-content-muted` | 描述行 |
| `--dsw-alias-label-caption` | `--opcteam-color-content-caption` | token 存在（`light.tokens.json:85` = `rgba(0,0,0,.40)`；`dark.tokens.json:85` = `{color.content.muted}`），但 palette 投影把 caption 与 muted 折到同一个 `colors.text.muted`（`buildBuiltinAppearance.ts:140` 与 `:144`）——这是 R1 的角色分裂缺口，皮肤外观下两者取值相同。**只用于非必要 meta**；承载必要信息的次级文字改用 `content-secondary`（R3：上游 caption 2.53:1 不达 AA） |
| `--dsw-alias-bg-overlay` | `--opcteam-color-surface-raised` | 卡片与吸顶组头 |
| `--dsw-alias-interactive-bg-hover` / `--dsh-claude-hover-bg` | `--opcteam-color-action-neutral-surface-hover` | 行 hover、轨道凹槽 |
| `--dsw-alias-border-l2` | `--opcteam-color-border-subtle` | 0.5px 细线统一走 subtle |
| `--dsw-alias-brand-primary` | 顶点态用 `--opcteam-color-accent-default`；**焦点环不跟它**，用 `--opcteam-color-focus-ring`（= `ref.color.neutral.650`，非 accent） | 上游明确"强调色永不用于焦点描边"，本地 `color.focus.ring` 在通用主题里等于 `neutral.650`，但 `buildBuiltinAppearance.ts:183` 把两个 Claude 外观投影成 `accent[500]` —— 这是 C6 的实证来源，需按 D3 裁决 |
| `--dsh-claude-apex-flash` | `--opcteam-color-accent-hover` | 点阵亮层 |
| 旋钮静态白 `#ffffff` | `--opcteam-color-surface-raised` | 上游两外观都钉死白；本地 `AppearancePalette` 没有"恒白"字段（`AppearancePalette.ts:203-239` 无 static 组），只能用 surface 与 action-neutral 的对比度读作凸起。暗色下这会变成"比凹槽更亮的圆角块"，与上游一致；亮色下凸起感靠 1px `border-default` 补 |
| `--dsh-claude-inverse-fill/ink` | `--opcteam-color-content-primary` / `--opcteam-color-surface-canvas` | provider 徽标，反色对 |

### 6.2 时序与缓动

| 上游 | 本地 | 说明 |
|---|---|---|
| `--dsh-claude-duration-instant`（80ms） | `--opcteam-motion-duration-instant`（80ms） | 等值命中，用于非拖拽态的旋钮落位与属性复位 |
| `--dsh-claude-duration-move`（200ms） | `--opcteam-motion-duration-base`（220ms） | 最近档；`fast`(140ms) 对跨档行程读作瞬跳 |
| `--dsh-claude-duration-swap`（150ms） | `--opcteam-motion-duration-fast`（140ms） | 按值取最近档。`content-swap`(320ms) 语义虽然同名，但对 13px 档名换字慢一倍，会读成卡顿 |
| `--dsh-claude-duration-surface` / `exit`（150/120ms） | `--opcteam-motion-duration-fast`（140ms） | 卡片出入同档，退出由浮层所有者统一 |
| `--dsh-claude-duration-fade` / `enter`（300/320ms） | `--opcteam-motion-duration-content-swap`（320ms） | 卡片入场等值命中 |
| `--dsh-claude-ease-glide` | `--opcteam-motion-easing-smooth`（`cubic-bezier(.77,0,.175,1)`） | 往返位移 |
| `--dsh-claude-ease-standard` / `in-out` | `--opcteam-motion-easing-standard` / `enter`、`exit` | 出入分治 |
| `--dsh-claude-period-flash`（1450ms） | `calc(var(--opcteam-motion-duration-loop) * 2)` = 1440ms | 本地 `motion.duration.loop` 是 720ms 的通用循环档，与上游点阵周期差一倍，直接取用会把材质读成另一种。这是全文唯一允许的 token 倍数推导，必须写注释；若评审不接受 token 运算，降级为 **D6**：顶点点阵不做，`data-apex` 只改旋钮与档名 |
| 渐显 160ms | 现状 `STREAMING_TEXT_REVEAL_MS = 160`（`src/web-ui/src/infrastructure/markdown/useStreamingTextReveal.ts:3`） | 与 `fast`(140)/`base`(220) 都不等值，改读任一档都会改观感；改动前必须先裁 IC-R1。JS 与 CSS 必须同源（C5） |

不予 token 化（保持组件内常量并注释）：hover 意图 100/150ms（是意图时间，不是视觉时长）、渐显错峰 1–8ms（亚帧）、提交合并 200ms、回执上限 12s。

### 6.3 尺寸与层

| 上游 | 本地 | 说明 |
|---|---|---|
| 卡宽 264/320、248/360 | `--opcteam-overlay-menu-inline-size`(220) / `min-inline-size`(160) / `max-block-size`(480) | 复用浮层 token。就地收窄已有先例：`ModelSelector.scss:165` 与 `ReasoningPresetSelector.scss:55` 都在组件根上重写 `--opcteam-overlay-menu-inline-size`，不新增卡宽 token |
| 行高 30/32 | `--opcteam-overlay-menu-item-height`(30) | 该值固定在 `system.tokens.json`，density 集只覆盖 `space.component.*` 与 `control.*`（`density-compact.tokens.json` / `density-touch.tokens.json`），**不覆盖 `overlay.menu`**。触摸命中区只能靠局部 `min-block-size: var(--opcteam-control-hit-target)`（compact 36 / touch 48），先例 `design-system/packages/ui/src/flow-chat/ask-user/AskUser.module.css:566-567` |
| 行圆角 5/6px | `--opcteam-overlay-menu-item-radius`（= `radius.base` 8px） | 本地最接近档是 8px，接受 ≤2px 偏差，不为复刻新增档 |
| 行间距 | `--opcteam-overlay-menu-row-gap`(2) | 菜单行间距只能由该 token 拥有，不得用局部 margin（`MenuComposition.contract.test.ts` 会拦） |
| 卡内边距 | `--opcteam-overlay-menu-surface-padding`（= `space.2` 8px） | 卡片列表区可局部压到 0（先例 `ModelSelector.scss:213-214` 同时把 `surface-padding` 与 `scrollbar-gap` 置 0），页脚内边距另给 |
| 轨道 30px / 旋钮 16×30 / 凹槽圆角 8px | 轨道高 `--opcteam-overlay-menu-item-height`(30)、旋钮宽 `--opcteam-space-4`(16)、凹槽圆角 `--opcteam-radius-base`(8) | 三个值恰好都在现有阶梯上；`corner-shape` 本地不引入；触摸命中高度 ≥44px 由 density token 提供 |
| `--dsh-claude-layer-control`（z-index） | **不映射** | 本地禁止自定 z-index；浮层层级由 `createOverlayPortal` 与 `layer.*` token 拥有 |
| `--dsh-claude-swap-distance`（4px） | `--opcteam-motion-distance-sm`（= `space.1` 4px） | 等值命中，换名位移 |

### 6.4 契约锚点（可测试属性）

沿用本地既有 `data-opc-*` 命名，不新增皮肤私有分支：

- 根：`data-opc-component="model-selector"`，`data-opc-part="root" | "trigger" | "reasoningTrigger" | "reasoningSlider" | "reasoningSliderInput"`。
- 状态：`data-opc-state`（`idle|open|pending|empty|error`）、`data-reasoning-ladder="ranked|segmented|hidden"`。
- 流式：`data-streaming`、`data-stream-reveal-active` 已有，保持；新增 `data-opc-motion="full|reduced"` 于 `documentElement`。
- 全部属性必须在 TypeScript 侧写入，并在 DOM 契约审计中登记。

### 6.5 禁止

- 提高 `scripts/theme-color-governance-baseline*.json` 或测试期望计数来让审计通过；新色必须复用既有语义 token 或新增最小 owner 契约。
- 硬编码色值；`AppearancePalette` 不携带排版与动画强度，因此不得为了皮肤另开外观字段。
- 自定 z-index、裸 React portal、按类别覆写浮层层级。
- 给虚拟化行容器加 keyframe。

---

## 7. 验收锚点

| 契约 | 现有测试入口 |
|---|---|
| IC-M* | `src/web-ui/src/flow_chat/components/ModelSelector*.test.tsx`、`ModelSelectorPortalLayer.test.ts`、`ModelSelectorProviderLevels.test.tsx` |
| IC-E* | 新增 `ReasoningStrengthSlider.test.tsx`；沿用 `ReasoningIntensityControl.test.tsx`、`ReasoningPresetSelector.test.tsx` 的 ARIA 断言风格 |
| IC-R* | `src/web-ui/src/infrastructure/markdown/useStreamingTextReveal.test.tsx`、`src/web-ui/src/flow_chat/hooks/useTypewriter.test.ts` |
| 浮层与焦点 | `src/shared/ui/OverlayStack.test.tsx`、`OverlayOwnership.contract.test.ts`、`MenuPopover.test.tsx` |
| 菜单行间距 | `src/shared/ui/MenuComposition.contract.test.ts` |
| 命令 | `pnpm run check:web`、`pnpm run motion:audit`、`pnpm run theme:color-audit:all` |

## 8. 参考路径

上游：`.upstream-ref/packages/client/src/features/model/model-picker.ts`、`model-picker.css`、`features/effort/{effort-picker.ts,control.ts,ladder.ts,room.ts,matrix.ts,effort-picker.css}`、`features/chat-reveal/{reveal-engine.ts,reveal-paint.ts,reveal-highlights.ts,reveal-params.ts}`、`shared/popover.ts`。

本地：`src/web-ui/src/flow_chat/components/{ModelSelector.tsx,ModelSelector.scss,ReasoningIntensityControl.tsx,ReasoningIntensityControl.scss,reasoningPresetPresentation.ts,ChatInput.tsx}`、`src/web-ui/src/flow_chat/components/FlowTextBlock.tsx`、`src/web-ui/src/flow_chat/hooks/useTypewriter.ts`、`src/web-ui/src/infrastructure/markdown/{useStreamingTextReveal.ts,Markdown.scss}`、`src/web-ui/src/shared/utils/motionPreference.ts`、`design-system/packages/design-tokens/src/system.tokens.json`、`design-system/packages/design-tokens/scripts/build.mjs`、`src/mobile-web/src/components/{ChatModelControls.tsx,CompactSettingsSheet.tsx}`。

兄弟文档：`ui-adaptation-guide.md`（外观层）、`visual-contract.md`（视觉数值与三项裁决）、`model-effort-controls-gap.md`（改造顺序）、`streaming-motion-gap.md`（流式链路与 A/B）、`skin-architecture-options.md`（ADR）。
