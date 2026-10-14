# pi-deepseek-cache 变更日志

## v0.3.1：对齐 pi 1.2.x 宿主 API 与 DeepSeek 现行口径

> 本版本修正三类问题：（1）宿主包被当成 `dependencies`，既拉取重复运行时又触发 pi 的启动告警（#25 / #27，由外部贡献者修复合入）；（2）宿主 pi 早已从 0.84 升到 1.2，扩展的宿主 API 与类型依赖停留旧版；（3）v0.3.0 依据一条**已被官方撤销**的公告计算 v4-pro 价格。
>
> 同时修复 CI：`lint` 步骤自 v0.2.0 起在每次 main 推送都失败，导致 `tsc` 与 `vitest` 长期没有把关（这也是下面这些问题能潜伏至今的直接原因）。

### 修复：依赖声明（#25 / #27）

> 由外部贡献者 **@zzddk** 在 #26 实现并合入，保留原作者署名；本节由维护者补充验证与后续跟进。

- **宿主包被声明为 `dependencies`（严重）**：`@earendil-works/pi-ai` / `pi-coding-agent` / `pi-tui` 是 pi 宿主向扩展提供的包，官方要求声明在 `peerDependencies` 且范围为 `"*"`（见 pi `docs/packages.md` → “Declare dependencies”）。写在 `dependencies` 里有两个后果：
  - pi 启动告警：`Host-provided extension packages must be declared in peerDependencies with a "*" range, not dependencies`，并提示物理副本可能绕过扩展加载器的模块映射、产生重复运行时模块（#27）。
  - npm 会为扩展额外安装一整份 pi 运行时及其传递依赖，而扩展实际只用宿主提供的三个模块（#25）。
- 现 `dependencies` 整个字段移除，三个包改为 `peerDependencies: "*"`。pi 的受管 npm 安装使用 `--omit=peer`，因此消费者不再安装任何运行时依赖。
- **实测对照**（按 pi 的受管参数 `--omit=peer --legacy-peer-deps` 安装）：修复前 **133 个包 / 136 MB**，修复后 **1 个包 / 124 KB**。
- **启动告警对照**：用 pi 自身的 `DefaultResourceLoader`（即 `[Extension issues]` 横幅背后的代码路径）加载本包，修复前复现出上述告警原文，修复后 `warnings` 为空。
- **后续跟进（本版本一并完成）**：仅去掉 `dependencies` 会让 lockfile 把三个包钉在 `0.84.2`，而 `peerDependencies: "*"` 又使 Dependabot 无法提出升级（`"*"` 没有可 bump 的范围），CI 会永远按两年前的宿主类型校验。现将三个包以 `^1.2.0` 列入 `devDependencies`：消费者不会安装 devDependencies，pi 的告警也只检查 `dependencies`。

### 修复：宿主 API（pi 1.2.x）

- **`complete` 已不是 `@earendil-works/pi-ai` 的根导出**：pi-ai 1.x 把旧的全局 `stream()` / `complete()` 收进 `@earendil-works/pi-ai/compat`（该文件自述：_“Temporary compatibility entrypoint… This module is deleted with the coding-agent ModelManager migration.”_），根入口只剩 `createModels()` 与各 provider 工厂。
  - 运行时不受影响：pi 的扩展加载器把 `@earendil-works/pi-ai` 依旧指向 `compat.js`（`dist/core/extensions/loader.js` 注释：_“Extensions resolve the pi-ai root to the compat entrypoint (a strict superset of the core entrypoint): existing extensions using the old global API keep working at runtime until compat is removed.”_）。但类型层面已经失配，且 compat 明确是待删除的过渡层。
  - 现已改用官方推荐路径 `ctx.modelRegistry.complete(model, context, options)`：由宿主在请求时解析鉴权（API key / OAuth / headers），因此不再需要手传 `apiKey` / `headers`。由此**扩展不再导入 `@earendil-works/pi-ai` 的任何符号**，彻底摆脱对 compat 过渡层的依赖。
- **`ctx.ui.custom` 的 `done` 形参**：1.2.x 下 `done` 推断为 `(result: unknown) => void`，与 overlay 构造函数的 `() => void` 不兼容；改为显式 `ctx.ui.custom<void>(...)`。
- **`context` 事件的消息类型**：1.2.x 的 `AgentMessage` 联合类型不再声明 `customType`（改为由各扩展通过 `CustomAgentMessages` 声明合并自行扩展），旧实现把它断言成自定义接口才能通过类型检查。现改为结构化读取，并顺手修掉一个真实隐患：旧实现遇到 `event.messages` 不是数组时会返回 `{ messages: [] }`，**等于丢弃全部消息**；现改为返回 `undefined`（不改动）——鉴于该事件下丢失消息会直接改变送给模型的上下文，这比默默清空安全得多。

### 修复：DeepSeek 计价口径

- **`deepseek-v4-pro` 计价少算约 7 倍（严重）**：v0.3.0 依据 V4.1-Flash 发布公告中“自 2026-09-14 起 v4-pro 请求全部路由至 V4.1-Flash 并按 Flash 价结算”的表述，把 v4-pro 映射到 Flash 价。但该计划**已被官方撤销**：官方变更日志在 **2026-09-10**（即原定切换日之前）声明 _“we have decided to continue providing API services for DeepSeek V4 Pro after September 14, 2026, with the billing method remaining unchanged.”_。官方价目表也一直列着 v4-pro 自身价（命中 0.044 / 未命中 1.32 峰值，模型版本 DeepSeek-V4-Pro-0813），pi 自身的模型目录同样是 `cacheRead 0.044 / input 1.32`。现改回官方价目表：命中价少算约 7.3 倍（0.044 / 0.006）、未命中价少算约 4.4 倍（1.32 / 0.30）的问题已修正。
- **峰值时段未排除中国公共假期**：官方注(2) 定义峰值为 01:00-04:00 / 06:00-10:00 UTC 的周一至五，**并排除中国公共假期**（全部节假日与周末均为谷值）。旧实现只按 UTC 工作日判断，在中国法定假期的上述窗口内会把谷值当峰值，**高估**节省额一倍。现按国内官方节假日安排（国办发明电〔2025〕7号）以 UTC+8 自然日判定并排除；未收录年份不匹配任何区间，退化为旧行为（只会保守高估，不会静默低估）。
- **legacy 名 `deepseek-v4-flash-vision-exp` 无需新增映射（复核后修正）**：该名字原本已被 `lookupPricing` 的 `startsWith` 回退归入 `deepseek-v4-flash`，取价正确。真正的问题是这层回退行为未被文档化，已补注释，并移除一个永远不会被命中的冗余键。

### 修复：摘要可信度

- **截断的摘要会被当成检查点（严重，接受代码审查建议）**：`summarizeWithFlash` 从未检查 `stopReason`。官方 pi-ai 把 `finish_reason: "length"` 映射为 `stopReason: "length"` 并照常 resolve，且 error 路径保留已生成的局部 `content`。已生成的局部摘要会被 pi **原文替换历史**，并按输入哈希写进 `summary-cache.json`——一次截断不但丢上下文，还会被缓存固化。pi 自身明确拒绝该情形（`dist/core/compaction/compaction.js`：_“A length stop contains partial text and must not become a session checkpoint.”_）。现内联同语义判定（该函数未从包根导出），遇 `error` / `length` 告警并回退默认 compaction。
- **鉴权预检会误判纯 headers/OAuth 类 provider**：官方 `ResolvedRequestAuth` 允许 `ok: true` 而 `apiKey` 为 `undefined`（走 header 鉴权）。旧判定 `!auth.ok || !auth.apiKey` 会把这类 provider 当成鉴权失败，静默放弃自定摘要。现只看 `!auth.ok`。
- 上述两项修正均由独立代码审查子代理提出，并已补充回归用例：把 `index.ts` 回滚到修正前，这 3 个用例确实失败（`3 failed | 58 passed`），修正后 61/61 通过。

### 其它

- `devDependencies` 的 pi 包从 `^0.84.2` 升到 `^1.2.0`。需说明的是：`tsc` 的 4 个错误**并非**这次升版引入——在 `main` 自己的 lockfile（锁定 0.84.2）上同样存在，根因是 pi-ai 1.x 起根入口不再导出 `complete`。升到 1.2.0 是为了让 CI 校验用户实际运行的宿主版本。
- 同步更新 `docs/prefix-cache-principle.md` §4.3（v4-pro 价目表与假期规则）与全部 `index.ts:NNN` 行号引用，并新增覆盖 Pro 价、假期时段、未收录年份、谷值折半、摘要截断护栏与 headers-only 鉴权的测试（52 → 61）。

### 待处理（不在本次变更范围）

- `main` 的 CI 已经**很久没有绿过**：查 `.github/workflows/ci.yml` 的全部历史运行，v0.2.0、v0.2.1、v0.3.0 三次 main 推送全部在 `test -> Lint` 步骤失败（另有最早一次失败在 `setup-node`）。失败内容是 `tests/` 下的 27 个 `@typescript-eslint/no-explicit-any` / `no-unsafe-function-type` 错误，以及 11 个文件未过 `prettier --check`。因为 lint 先失败，`tsc` 与 `vitest` 长期实际上没有把关——这也是上述四项问题（宿主 API 失配、既有类型错误、v4-pro 计价、摘要截断）能长期潜伏的直接原因。需单独一次修复（已在后续提交中处理）。

## v0.3.0 (2026-09-29): 对齐官方现行口径复查

> 本次以官方 [Context Caching on Disk](https://api-docs.deepseek.com/guides/kv_cache)、[Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing) 与 [V4.1-Flash 发布公告](https://www.deepseek.com/en/news/deepseek-v4-1-flash/) 为 Ground Truth，核查实现与文档的一致性。修复 3 处会导致用户误判的实质错误（成本估算与 `deepseek-v4-pro` 计价、`tools` 前缀诊断盲区）、1 处指向不可用模型导致命令无法执行的文档与脚本问题，以及多处与官方现行口径不符的声明。

### 修复

- **成本估算与官方价目表脱节（严重）**：原常数 `0.014 / 0.44` 与注释标称的 `deepseek-v4-flash` 峰值价均不正确。`0.014` 是 2024 年 news0802 的首发 cache-hit 价（已下线）；`0.44` 约为 `deepseek-v4-pro` 的 input 成本，与注释标称的 flash 串了模型。现改为按官方价目表选价：`deepseek-flash`（含 legacy 名 `deepseek-v4-flash`）命中 0.006 / 未命中 0.30（每百万 token）。
- **`deepseek-v4-pro` 计价错误（严重）**：官方公告 [V4.1-Flash](https://www.deepseek.com/en/news/deepseek-v4-1-flash/) 明确“自 2026-09-14 04:00 UTC 起，所有 `deepseek-v4-pro` 请求路由至 V4.1-Flash 并按 V4.1-Flash 价结算，直至 V4.1-Pro 发布”。因此 pricing 页面上 v4-pro 的 0.044 / 1.32 已是历史价，实际结算应按 Flash 价。首版修复误信了该历史价列（会把 pro 用户节省额高估约 3 倍），现已按公告口径修正，并在代码注释中标明冲突与后续升级点。
- **忽略 peak/off-peak 时段**：官方注(2) 定义峰值为 01:00-04:00 / 06:00-10:00 UTC 周一至五，谷值为峰值的一半。原实现只用峰价，导致约一半时间金额错误。现按调用时刻判定时段并自动减半，`/cache-stats` 直接展示所用模型、时段与单价。
- **前缀指纹遗漏 `tools`（严重，诊断盲区）**：官方要求 `system` + `tools` + `messages` 三段整体完整匹配某个已落盘的 cache prefix unit。pi-ai 的 `openai-completions` `buildParams` 将 `system` 并入 `messages`，但 `tools` 是**独立顶层字段**；旧实现只哈希 `messages`，因此扩展增删工具或变更工具 schema 会击穿缓存却**零告警** —— 而这正是 pi 中最常见的破坏源。现将归一化后的 `tools` 单独纳入指纹。
- **仅比对上一轮前缀**：官方 unit 独立完整、可并存，且未使用的条目数小时至数日内才清理。回落到早期已落盘前缀仍是有效命中（官方 Example 2）。现保留有界集合（`MAX_KNOWN_PREFIXES = 8`），命中任一即视为追加式。
- **模型改名后摘要静默失效**：官方注(1) 明确 `deepseek-flash` 为当前模型名，legacy 名 `deepseek-v4-flash` 仍受理但模型已退役。原实现只查 legacy 名，一旦 pi 模型目录跟进官方改名即失效。现两个名字依次尝试，并按实际命中的名字记录 `details.summarizer`。
- **`cacheWrite` 恒为 0 的死 UI**：官方 usage 仅提供 hit/miss，无 cache write 字段（pi-ai 读的 `prompt_tokens_details.cache_write_tokens` 永不下发）。现改为未观测到非零写入时隐藏「缓存写入」行。
- **文档与脚本指向已停用模型**：`README.md` / `README.zh.md` / `INSTALL.md` / `NEXT-STEPS.md` / 3 个测试脚本均指示用户运行 `pi --model deepseek/deepseek-chat`。官方已于 2026-07-24 停用 `deepseek-chat` / `deepseek-reasoner`（二者从未是独立模型，只是 `deepseek-v4-flash` 的思考 / 非思考模式别名），且 `@earendil-works/pi-ai` 的 DeepSeek 目录里根本没有这两个 id（只有 `deepseek-v4-flash` / `deepseek-v4-pro`），该命令无法执行。已统一改为目录中真实存在的 `deepseek/deepseek-v4-flash` / `deepseek/deepseek-v4-pro`；同时在价目表中保留二者的同价映射，供旧会话与自建代理兜底。
- **节省额精度**：flash 档谷值每百万命中仅省 $0.147，固定 2 位小数丢失有效信息。现小于 $1 用 4 位小数。

### 文档修正

- **「compaction verbatim 回放 parity」为伪声明**：`README.md` / `README.zh.md` 与原理文档均声称对齐 Harness `summarizeWithLlm` 的 verbatim 回放（`system+tools+shadowed messages` + 尾部指令），但实现是把历史序列化为**单条 user 消息**、不传 `system`/`tools` —— 架构上相反，导致每次 compaction 冷启动全量 prefill，拿不到 warm prefix。已改为显式标注「无 parity」，并在原理文档新增 §7.4 说明差异、后果与后续对齐路径。
- **原理文档 §1.2 使用了已被取代的缓存模型**：表格中的「任意前缀重叠即复用」是 2024 年旧口径，与 §2 逐字引用的现行口径（Sliding Window Attention 下每个缓存前缀是独立完整单元，须**完整匹配**）自相矛盾。已按现行口径重写。
- **64 token 粒度被当作现行约束**：该表述仅存于 2024 年 news0802，现行 kv_cache 指南已改为「独立完整 cache prefix unit」+「按固定 token 间隔切分」。§3.3 已改为并列两种口径并标注引用纪律。
- **定价三套数字互相矛盾**：代码 `0.014/0.44`、文档 `0.027/0.27`、且两者均不对应现行价目表。§4.3 已改为直接列出官方价目表与时段规则，并说明本项目实现方式。
- **摘要缓存「跨会话复用」措辞**：key 为 `sha256(序列化历史全文)`，需历史逐字节相同，跨会话几乎不可能命中。已注明真实命中场景为同会话内重复压缩。
- **命中率口径混淆**：状态栏与图表为跨轮**累计**值，官方为**按请求逐次**统计。`/cache-stats` 现同时展示「累计命中率」与「本轮命中率」，并在故障排查中说明增删扩展等同于改写历史。
- **过期引用**：`README`「up to 90% less」为 2024 年口径；原理文档中 `index.ts:NNN` 行号全部刷新。

### 新增

- 测试从 28 增至 52：覆盖官方价目表（flash / v4-pro 路由至 V4.1-Flash 故同价 / legacy 名同价 / 已停用别名兜底 / 未知模型保守下界 / peak 与 off-peak 折半）、`tools` 指纹（增删、schema 变更、顺序抖动不误报、消息追加不告警、历史改写告警、早期前缀回落视为命中、首轮不告警、会话切换重置、空 payload 静默跳过）、`cacheWrite` 行显隐、累计与本轮口径差异、摘要器模型名回退。
- 测试隔离修复：`clearPersistedData()` 补上 `summary-cache.json`，消除跨用例的磁盘状态污染。

### 验证

- `npx tsc --noEmit`：4 处既有 SDK 形态不一致（`complete` 导出、`custom` 回调签名、`context` 事件名），与 0.2.1 相同，未新增。
- `npx vitest run`：52 tests passed（0.2.1 为 28）。

## v0.2.1 (2026-09-07): 前缀缓存适配修复（基于官方文档复查）

### 修复

- **工具排序确定性**：`before_provider_request` 的 `payload.tools` 排序由 `localeCompare` 改为码点比较（Harness `orderTools` parity）。`localeCompare` 依赖 ICU/locale，跨机器/跨 locale 可能给出不同顺序，正是要消除的抖动来源；排序始终生效（已排序时替换内容等价）。
- **跨会话误报**：`session_start` / `session_before_switch` 时重置 `lastPrefixHash` / `lastPrefixLen`，切换/新建会话不再把旧会话残留哈希与新会话前缀比对而误报"缓存前缀变化"。（安装的 `@earendil-works/pi-coding-agent` 类型无 `session_switch` 事件，改用可取消的 `session_before_switch`。）
- **成本估算过时**：单价由 0.027/0.27 更新为当前 `deepseek-v4-flash` 峰值价（cache hit $0.014/M、miss $0.44/M；谷值减半，01:00-04:00 / 06:00-10:00 UTC 周一至五），节省额不再被低估约 40%。

### 优化

- **前缀哈希边界对齐官方 cache unit**：诊断哈希由 `messages.slice(0, -1)` 改为完整消息列表（官方规则：cache prefix unit 在用户输入末尾落盘），最后一条消息的改写不再漏诊；追加式增长（官方 Example 1 语义）仍不打扰。
- **README 措辞校准**：`README.md` / `README.zh.md` 的 "byte-for-byte / 逐字节稳定" 弱化为 "跨轮次稳定、逐 token 一致"，与官方 "fully match a cache prefix unit" 表述对齐（诊断哈希是 wire 字节的规范化代理，非字节本身）。

### 验证

- `npx tsc --noEmit`：4 处既有 SDK 形态不一致（行 1/515/528/562，HEAD 相同），未新增；`npx vitest run`：28 tests passed；`npm run lint`：32 problems 与 HEAD 相同，未新增。

## v0.2.0 (2026-08-20): Harness 对齐的前缀缓存强制 + 原子持久化

> 本版本以官方 [Context Caching on Disk](https://api-docs.deepseek.com/guides/kv_cache) 与 DeepSeek Harness 五重强制为 Ground Truth，重构前缀缓存命中路径。新增 `docs/prefix-cache-principle.md`（507 行）沉淀官方三种落盘时机 / 两示例 / 计费字段 / best-effort 与 Harness 谱系。

### 新增

- **原理文档** `docs/prefix-cache-principle.md`：官方逐字摘录（request boundaries / common prefix detection / fixed token intervals）+ Harness 五重强制（`orderTools` / `canonicalHeader` / `deepFreeze` / `mapUsage` DISJOINT / verbatim compaction）+ Pi 三钩子映射，含全链路源码行号证据。

### 优化

- **稳定工具排序**：`before_provider_request` 中对 `payload.tools` 按 Harness `orderTools` 码点字典序重排（兼容 `name` / `function.name`），以 `{...payload, tools: sorted}` 非破坏性返回替换，链式场景可观测，工具顺序抖动不再击穿缓存。
- **前缀包含检测**：用 `stableStringify`（键排序递归）+ SHA-256 替代 `JSON.stringify` 的键序敏感哈希；存 `lastPrefixLen + lastPrefixHash`，以 `hash(prefix.slice(0, lastLen)) === lastHash` 判定追加 vs 改写，仅既有前缀被改写/中间插入才告警，空前缀与 `unknown` payload 静默跳过，根治每轮追加误报。
- **原子持久化**：引入 `ensureStatsDir` / `atomicWriteJson(tmp + renameSync)`，`scheduleSaveStats` / `scheduleSaveHistory` / `flushPendingWrites` / `saveSummaryCache` 全链路原子，去撕裂 JSON；`WRITE_DEBOUNCE_MS=1000` 合并高频 `message_end`。
- **生命周期收尾**：新增 `session_start`（初始化 `extensionCtx` 保障首次解析失败可通知）与 `session_shutdown`（`flushPendingWrites` 兜底），对齐 Harness 追加式 log 的退出不丢数语义。
- **摘要 LRU**：`MAX_SUMMARY_CACHE=64`，`setSummaryCache` 超限删最旧一条（Map 插入序），避免长会话无界膨胀。
- **图表健壮性**：补 `const chart: string[] = []` 缺失声明，`mid` 类型守卫改为 `typeof mid === "number"`，`cache-reset` 同步重置 `lastPrefixLen`。
- **上下文健壮性**：`context` 钩子加 `Array.isArray` 防御，返回过滤后 `{messages: onWire}` 保持顺序。

### 文档

- `README.md` / `README.zh.md` 增补“稳定工具排序 / 前缀包含检测 / 原子持久化 / LRU / 原理文档”特性与 P1/P2/P3 的 Harness 谱系列。

### 验证

- `npx tsc --noEmit --skipLibCheck`：剩余 4 处既有 SDK 形态不一致，未新增错误；`npx vitest run`：28 tests passed。

---

## 修复

### 2026-05-31: 添加持久化存储，解决 resume 时数据为 0 的问题

**问题**: 每次启动 pi 后，`/cache-stats` 命令显示的数据为 0，resume 会话后数据丢失。

**原因**: 扩展的统计数据存储在内存中，每次启动 pi 都会重置。

**解决方案**: 添加持久化存储功能，将统计数据保存到 `~/.pi/agent/extensions/deepseek-cache/stats.json`。

```typescript
// 新增功能
const STATS_DIR = join(homedir(), ".pi", "agent", "extensions", "deepseek-cache");
const STATS_FILE = join(STATS_DIR, "stats.json");

function loadStats(): Stats {
  // 从文件加载统计数据
}

function saveStats(stats: Stats) {
  // 保存统计数据到文件
}
```

**影响**:

- 数据在 pi 重启后保持不变
- resume 会话后数据不会丢失
- 所有会话共享同一份统计数据

### 2026-05-31: 修复 /cache-stats 命令在 print 模式下无输出

**问题**: 在 `--print` 模式下执行 `/cache-stats` 命令没有任何输出。

**原因**: pi 的 `--print` 模式使用 `noOpUIContext`，其中 `ctx.ui.notify` 是一个空函数，不会输出任何内容。

**解决方案**: 在命令处理器中同时调用 `ctx.ui.notify` 和 `console.log`，确保在两种模式下都能输出统计信息。

```typescript
// 修改前
handler: async (_args, ctx) => {
  ctx.ui.notify(stats, "info");
};

// 修改后
handler: async (_args, ctx) => {
  ctx.ui.notify(stats, "info");
  // 在 print 模式下,notify 是空函数,需要直接输出到 stdout
  console.log(stats);
};
```

**影响**:

- 在交互式模式下: `ctx.ui.notify` 正常工作
- 在 `--print` 模式下: `console.log` 输出到 stdout

**测试**:

- 添加了新的单元测试验证 `console.log` 被调用
- 所有 24 个测试全部通过

## 版本历史

### v0.1.0 (2026-05-31)

**初始版本**:

- P1 命中率遥测: 实时显示缓存命中率
- P2 前缀守卫: 剥离易变区消息,保护缓存前缀
- P3 缓存友好的 compaction: 用 v4-flash 做确定性摘要
- 完整的单元测试和集成测试
