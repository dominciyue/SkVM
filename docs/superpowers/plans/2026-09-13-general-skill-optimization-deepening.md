# 单次真实 trace 驱动的通用 skill 优化：持续开发任务书

> **For agentic workers:** 使用 superpowers:executing-plans 连续推进；实现遵循 TDD。主代理负责方案、代码和最终验证，子代理按最新 AGENTS 仅承担独立只读探索。常规检查点不等待用户确认。

**Goal:** 改进现有优化器，使不同结构的 skill 能从一次真实运行出发，完成有依据的机会分析、脚本复用或生成、文档重组、新包导出与自然消费；用少量真实验证反馈开发，不围绕两份既有包做定制修补。

**Architecture:** 复用 JIT-optimize 的 Evidence、模型工作区、loop 和 proposal，把优化动作、实现选择、通用打包与验证反馈接进同一条链。API/Env 是可选领域组件，skill 自带脚本和模型生成的小程序也是实现来源；未接管职责继续由 agent 完成。

**Tech Stack:** TypeScript/Bun、现有 headless-agent/provider/trace adapters、proposal storage、Skill IR 与已有领域 checker；按原 skill 需要使用 Python/Node 等已有运行时。

**状态：** revision 1，`active`，2026-09-13。G0 completed，G1 corpus evidence completed / implementation commitment open，G2 active。U0–U7 已完成且结果保持 mixed；本轮为新的 development 工作，不是 prospective 或 held-out。

**队列：** G0–G14 主队列；X1–X3 为主链达到要求后、交付窗口前自动选择的有限深化队列。工作量按约 16–24 小时的连续开发范围设计，实际时间由故障和已有能力决定，不承诺靠任务文字保证运行时长。

## 1. 已确认决定与北向目标

- 优化输入是已运行过的 skill 文件夹、至少一次真实 trace 和可获得的任务资源。谁运行就接受谁的记录；不把用户摘要冒充完整轨迹，不限定 agent 品牌。
- 一次 trace 足以启动有依据的改进。跨运行重复不是准入条件；依据可来自 skill 规则、脚本接口、真实输入输出和已有公开格式。一次观测不证明所有分支或未来收益。
- 优化过程允许并需要模型。考虑所有有依据的机会；没有最大热点、原任务已成功或只有小收益，都不是拒绝条件。
- 广读 skill 的目的是发现共享实现缺口。阅读数量不是泛化证据，实验数量不是开发产出；不再先建大型分类或评测工程才动代码。
- 通用化的是发现并实施优化的过程。不同 skill 可以获得不同程序、文档调整或 no-change；不能强迫都输入 API binding 或都生成同一 helper。
- 类范围暂表述为“含可参数化机械子步骤或可改进信息组织的 agent skill”。这是工程适用范围，不是完成了完整分类学。专业判断、实时状态等仍可由 agent 承担。
- 允许大幅重组外观。保留任务目的、关键约束和未接管职责，不逐字保留全文；原包默认不覆盖，通过实际 diff 和受影响行为检查保持可恢复性。
- 只有运行中使用了新包且结果合格，才证明包可消费。节省 token、速度、质量、使用便利分别报告；没有价格不计算实际 USD 节省。
- 工作直接留在 `skill-ir-aot`，只推用户 `origin`。不新开开发分支、不合并无关修改、不碰 `upstream`。

## 2. 已知基础、缺口与复用位置

基线是 `a07e338` 的 U0–U7 交付。两份 API 包已实际消费；4 对质量均通过，耗时/输出 token 下降，输入/cache/observed 总量上升。它们作为旧回归输入，不覆盖原报告。

| 现有位置 | 当前事实 | 本轮用途 |
| --- | --- | --- |
| `src/jit-optimize/index.ts`、`loop.ts` | 已有日志优化；log 路径不评价，仅按实际修改保存选轮 | 接入新包导出和可选验证，不另写优化 loop |
| `types.ts`、`optimizer.ts` | 六类机会存在；提示仍偏缺陷修复/约 50 行新增限制 | 扩展可执行动作，允许单次成功 trace、资源重组和脚本生成 |
| `workspace.ts`、`src/proposals/storage.ts` | 模型改副本，真实 FS diff 权威，已保存原件/轮次 | 延续实际文件变化与依赖追踪，补齐动作的持久化 |
| `src/proposals/deploy.ts` | accept 默认部署到原 skill，具有旧语义 | 新包独立导出，不借此悄悄 accept 或覆盖原件 |
| `src/jit-optimize/solidification.ts` | 当前 builder 固定追加 API section、contract 和 helper | 保留 API 兼容入口，抽出通用包输出，避免末尾机械追加 |
| `src/jit-optimize/consumption.ts`、`effect.ts` | 已核验 helper 工具调用、配对效果 | 推广到包声明的入口，补自然使用和统计口径 |
| `src/core/pi-runtime.ts` | assistant usage 已按消息归并 | 复用去重路径，分别计运行、响应、工具和重试 |
| `src/cli/jit-optimize.ts` | 已有 `--task-source=log`，输出 proposal | 增加可选新包输出，保持旧命令兼容 |
| `scripts/skill-ir/skill-family-acquire.ts` | 已有认证获取、缓存、来源和失败记录 | 缺少结构样本时续取，不重建获取器 |
| `results/skill-ir/skill-family-deepening-20260911/sources.json` | 已有 31 个 development skill 正文；结构多样性仍需核对 | 首选阅读来源，不接触保护样本 |
| `results/skill-ir/trace-guided-skill-optimization-20260913/trace-archives.json` | 已有 10 份 developer-generated trace 归档 | 选需要的记录使用，不重做整批归档审计 |

本轮阅读还应覆盖 `docs/architecture.md`、`docs/usage.md`、`docs/jit-boost.md` 的相关接口。不能只看 Skill IR 子目录后宣布主工程能力不存在。

### 拟新增的小型模块

以下是实施位置约定，不表示这些文件现在已存在；若 G0 发现同职责模块，原位扩展并更新任务书，禁止重复建一套。

| 新文件 | 单一职责 | 新测试 |
| --- | --- | --- |
| `src/jit-optimize/action-plan.ts` | 动作依赖、事实引用、适用条件和残余职责的轻量描述 | `test/jit-optimize/action-plan.test.ts` |
| `src/jit-optimize/implementations.ts` | 选择原脚本、领域组件、生成程序或文档修改 | `test/jit-optimize/implementations.test.ts` |
| `src/jit-optimize/package.ts` | 从实际 proposal 导出通用可消费包 | `test/jit-optimize/package.test.ts` |
| `src/jit-optimize/package-validation.ts` | 修改涉及的运行检查及反馈，不新造领域 oracle | `test/jit-optimize/package-validation.test.ts` |
| `scripts/skill-ir/general-skill-development.ts` | 本轮少量案例编排，调用生产接口，不承载成功特判 | `test/jit-optimize/general-skill-development.test.ts` |

## 3. 执行、时间、失败和成本

- 以代码实现和故障修复为主。广读目标 24–30 份不同正文、深读目标 8–10 份及直接依赖；先读至少六份有结构差异的样本就进入实现，后续阅读穿插进行。优先说明型、自带脚本型、多参考资料型、多步工具型、外部状态/判断型，不把 30 份近似 API 模板当成多样性。
- 初始广读与整理约 2–3 小时封顶；每次后续深读必须回答一个实现问题。缺少正文或网络失败时用已有成功材料继续，不能为了凑数量等待配额恢复。
- 争取前 6–8 小时完成第一条非 API 的“单次 trace→proposal→新包”链，再处理自然消费和复用。时间是调度提示，不是阶段失败条件。
- 截止于用户指定的新时间；未指定新时间时，2026-09-14 18:00（Asia/Shanghai）起优先修复与 G14 交付，不再开 X 队列。若启动时已过该时间，先交付一个最小闭环，不自动重新给自己追加一天。
- 单点连续约 60–90 分钟没有可检验进展，记录定位结果并缩小问题或切换独立阶段。失败不关闭整轮；有新证据允许后续修复。不得重复同一模型请求直至只留下成功样本。
- 联网、认证 GitHub CLI、公开远端 API 和有用途的付费模型调用已授权，无用户设定金额上限。费用用于采集、优化、消费或明确验证，分类记录；认证信息不进入包或 Git。
- 外部获取对瞬时错误采用已有退避；同资源无新信息的失败不持续重试。遇到 GitHub search 限额可使用已知仓库 tree/blob、缓存及直接内容入口，不盲等 search。
- 执行生成程序前检查本次涉及的文件写入/外部副作用，使用可重建任务目录；不要重放历史 trace 中的真实发送、部署或删除。普通本地修改无需反复确认。
- 遵守平台安全控制；不增加多层签名、摘要冻结、clean checkout 循环或重复全量扫描。旧保护证据、Q1 reserve、held-out、旧 prospective、clean-002 均不是本轮任务。
- 子代理只做窄范围只读探索；角色、并发数、等待方式按当时有效的 AGENTS 和工具限制执行。主代理亲读基础设计及即将修改的代码，负责设计、修改和最终验证。
- 常规检查点持续推进。全部主任务及适用 X 队列完成后交付并停止，不以等待用户叫停为理由无限新增目标，不用 sleep/重复测试凑时长。

### 记录约定

新 development 材料放在 `results/skill-ir/general-skill-optimization-20260913/`；包原件仍使用现有 proposal 存储。仅在 G0 实际启动时创建 `status.json`，记录阶段状态、最近成功动作、下一动作、已知故障、恢复命令和本轮变更归属。状态文件可更新，尝试结果单独保留；不建立新 write-once 执行协议。

来源广读、真实 trace、开发任务、实际执行分别计数。历史材料只引用，不将两个 API 成功包、后采集 trace 或格式转换副本重复算成新 skill/独立运行。公开后加入样本一律为 development，不声称未见泛化。

## G0 — 接续现场与最小基线

**读取/修改：** 当前状态、任务书、`src/jit-optimize/index.ts` 和相关组件；创建本轮 `status.json`，不先运行旧大矩阵。

- [x] 核对分支、最近提交及 dirty 文件，特别保留 `src/skill-ir/skill-family-minimum-delivery-run.ts`、`docs/skill-ir/1.md` 和历史 raw/cache。
- [x] 阅读本轮将修改的主工程接口，确认 log-only 当前不评价、API builder 独立、accept 会部署的事实。
- [x] 一次运行 `bun test ./test/jit-optimize/solidification.test.ts ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/effect.test.ts`；实际结果为 9/9 tests、31 assertions。
- [x] 建立 G0–G14 状态和源材料路径，旧 U0–U7 标记为已完成基线；新任务仅 G1 标记 active。

**完成：** 恢复入口清楚、修改归属清楚，可以直接开始 G1/G2。

## G1 — 多样化正文阅读转化为代码问题

**复用：** `scripts/skill-ir/skill-family-acquire.ts`、上述 sources 索引、`benchmarks/skill-ir/pilots/` 已暴露 source。

- [x] 读取已有 sources 索引，区分 31 份成功正文、0 正文重复、8 个成功仓库谱系和 1 个仓库获取失败；未读取 metadata-only reserve 或保护样本。
- [x] 首批及补充样本共广读 30 份、深读 10 份，逐份记录原文位置、资源形态、机械/判断步骤和可疑开销。
- [x] 已有语料达到结构广度，因此本轮未新增网络获取；既有来源的 commit、license、闭包问题和仓库失败仍完整保留。
- [x] 输出 `corpus-review.json` 和 `implementation-backlog.json`，8 项问题均带证据定位、当前代码、跨结构范围与拟测试行为。
- [ ] 优先处理真实重复机制，例如已有脚本发现、参考资料按需加载、输入提取、程序结果摘要、剩余流程交接。至少三项进入 G3–G11 的实际代码；两成员共用证据有帮助，但不设每个合理修复都必须已有两个正例的门。

**完成：** 语料阅读已经产生可测试的实现问题；数量不足如实说明，不阻塞开发。

## G2 — 单次真实 trace 与可重建任务上下文

**修改：** `src/jit-optimize/trace-adapters.ts`、`evidence.ts`、`workspace.ts`；对应已有 adapter/workspace 测试。

- [ ] 为首个非 API 工程案例选择一份真实完整运行；不足时用授权 agent 正常执行明确公开任务采集一次，注明 developer-generated。不要把 synthetic parser fixture 算成真实运行。
- [ ] 先写测试：一个成功 trace 可以进入优化；没有 usage 仍可分析；原 skill 中未运行的规则仍可读取；同一记录复制两次不成为两次独立运行。
- [ ] 保留任务资源、可见工具调用与结果、源定位和缺项。无法重建环境时可先生成修改，效果标为未测；不得猜成功结果。
- [ ] trace 与原 skill 的关系按文件、命令和用户声明记录，不靠摘要推导真实性。只读取本任务相关资源，不扫描用户全部私人会话。
- [ ] 变化输入留给后续验证，不能把第二条执行记录偷偷喂回仍声称“单次 trace”的优化。

**运行：** `bun test ./test/jit-optimize/trace-adapters.test.ts ./test/jit-optimize/workspace.test.ts ./test/jit-optimize/task-source-criteria.test.ts`。

## G3 — 让优化机会成为可实施的动作

**修改：** `types.ts`、新增 `action-plan.ts`、`loop.ts`、proposal history 的对应类型/存储；保留已有六类机会兼容。

建议在 `OptimizeSubmission` 添加可选 `actions`，旧 proposal 缺失时保持旧行为。新增结构用于编排，不是要求所有用户输入 JSON：

```ts
export interface OptimizationAction {
  id: string
  kind: "reuse-script" | "domain-backend" | "generate-script" | "restructure-docs"
  evidenceIds: string[]
  sourceRefs: string[]
  dependsOn: string[]
  inputs: string[]
  outputs: string[]
  preconditions: string[]
  changedPaths: string[]
  residualDuties: string[]
  verification: string[]
}
```

- [ ] 先测试重复 action id、未知依赖、依赖循环会给出定位；没有动作的旧 proposal、纯文档动作、空输入列表可以解析；optional 不等于一律填空伪装信息已知。
- [ ] 每个动作把 trace 中的具体值与可变参数分开。参数可来自文本、目录、CLI、配置或对象，不固定为 OpenAPI schema。
- [ ] 记录哪些步骤被程序替代、哪些继续由 agent 完成；一次未观察到的职责不能默认为删除。
- [ ] 将 actions/opportunities 随 round/history 持久化并可显示，真实 FS diff 仍权威；不能仅因模型列出 changedPaths 就认定已经实现。
- [ ] 解析错误只阻止受影响动作的执行，并保留可靠证据与诊断；必需依赖缺失时不能装作该动作可用。

**运行：** `bun test ./test/jit-optimize/action-plan.test.ts ./test/jit-optimize/infra-blocked-submission.test.ts ./test/proposals/storage.test.ts`。

## G4 — 优化模型从修故障转向改善完整工作过程

**修改：** `optimizer.ts` 的 `buildOptimizerPrompt`/`normalizeSubmission`、`workspace.ts` 的上下文组织；测试 `optimizer-prompt.test.ts`。

- [ ] 先写行为测试：成功且只运行一次的规则明确转换可以提出动作；专业判断无法固化时保留；未知 score 不变成失败；无可检验改进可 no-change。
- [ ] 去掉以“存在 defect”“跨运行重复”“约 50 行新增”为普遍准入条件的措辞。保留具体依据和质量目标，允许生成多文件小程序与移动教程。
- [ ] 用本轮 G1 问题驱动模型读取相关脚本/参考资料，不要求先读所有历史。长 trace 使用索引与按需定位，原始事实可回查，摘要不取代原件。
- [ ] 不强迫一个巨大改动承载全部机会；独立机会可合并，也可分动作修复。文档简化不能删除关键条件换取短文本。
- [ ] 区分“用户任务专用优化”和“可复用 skill 改进”：明确参数与适用范围即可，不能将一次答案硬编码后声称通用。

**运行：** `bun test ./test/jit-optimize/optimizer-prompt.test.ts ./test/jit-optimize/infra-blocked-submission.test.ts ./test/jit-optimize/workspace.test.ts`。提示词文本断言之外，用一个真实 proposal 检查动作是否落到文件。

## G5 — 统一实现选择，保留领域边界

**新增/修改：** `implementations.ts`、`action-plan.ts`，必要的 API/Env 薄适配；不改冻结的历史生成器。

- [ ] 先测试同一个“复用原脚本”动作可指向两个不同目录中的脚本；选择不依赖 skill/repo 名称；普通文本或目录输入不要求 API binding。
- [ ] 实现四条路径：原 skill 可执行脚本；匹配的 API/Env 组件；模型生成的小程序；纯文档/流程调整。证据适合哪条就用哪条，不机械优先插入 API helper。
- [ ] 从 skill 和可见运行提取 CLI、文件输入输出、依赖和运行时要求。未知参数保留缺项；后端需要的确定参数可内部派生，不让用户填写无关研究身份。
- [ ] 领域组件不适用时继续尝试其他有依据的动作或原流程；实现错误与“不适用”区分，不能把程序崩溃全部包装为正常 fallback。
- [ ] 能通过薄适配复用现有能力就不再实现同一算法；单个新领域的语义不要塞入通用 core。

**运行：** `bun test ./test/jit-optimize/implementations.test.ts ./test/jit-optimize/action-plan.test.ts ./test/jit-optimize/solidification.test.ts`。

## G6 — 模型生成的小程序能运行、能改变输入

**新增/修改：** `package-validation.ts`、optimizer 工作区指引；复用现有 headless-agent/运行记录。

- [ ] 选 G1/G2 中规则明确的一项机械工作，让模型在 proposal 副本生成参数化脚本。若原 skill 已有等价程序，改为复用，不为凑“生成”指标重写。
- [ ] 先测试明确行为：改变输入文件名和字段后结果相应变化；合法空输入按任务规则处理；缺必需资源明确报错；不把第一次产物写成常量。
- [ ] 每个程序提供简洁帮助、参数说明、结果位置和可分辨的成功/不适用/错误结果。长结果写文件，stdout 返回后续步骤需要的摘要与路径。
- [ ] 在可重建目录执行，核对任务既有规则或独立工具；自生成测试只能算检查，不能成为唯一正确性依据。例：i18n 保留占位符并比较 key 集，文件转换检查数据字段与格式，不用同一生成器重算自己证明正确。
- [ ] 首次失败将命令、错误和相关文件反馈给现有 optimizer 修复；保存尝试，不新增无人理解的多层 verifier。

**运行：** `bun test ./test/jit-optimize/package-validation.test.ts`，并运行本阶段实际生成程序的原输入/变化输入检查。

## G7 — 生成面向使用的通用 skill 包

**新增/修改：** `package.ts`、`solidification.ts` 兼容适配、workspace/proposal 文件收集；测试 `package.test.ts`。

目标公共接口（G8 调用；本轮新增，不是假定已存在）：

```ts
export interface BuildOptimizedSkillPackageOptions {
  proposalDir: string
  packageDir: string
}
export interface BuildOptimizedSkillPackageResult {
  status: "exported" | "no-change"
  packageDir?: string
  sourceProposalDir: string
  validation: "not-run" | "passed" | "failed"
}
// package.ts 导出 buildOptimizedSkillPackage(options): Promise<BuildOptimizedSkillPackageResult>
```

- [ ] 先测试纯文档包、复用脚本包、生成脚本包都可导出且不注入 API 文件；原包未改；no-change 不宣称 exported optimization；旧 API 构建/验证接口仍可运行。
- [ ] 从实际选中 snapshot 和 diff 正确处理新增、修改、删除/移动文件，保留必要许可证与资源；不盲信模型自报清单，不整体排除 skill 必需的隐藏配置。
- [ ] 新入口前置适用条件、任务流程、程序调用和剩余职责。长教程/模板按需读取，不在旧入口末尾堆第二套重叠流程，不把完整原文和新原文同时强制注入。
- [ ] 把 manifest 的领域固定字段隔离到可选实现信息；包 identity 可从 proposal 标识，不新造复杂签名协议；运行时与依赖从实际内容列出。
- [ ] 允许版式大改，关注行为保留：例如 i18n 占位符、文档转换正文、实验单位/seed 等按实际案例检查，不增加整包逐句审核。
- [ ] 导出与部署分开。生成新包不得暗中调用 accept 覆盖原 skill；现有显式 accept 行为保持兼容，必要修复限定于已复现问题。

**运行：** `bun test ./test/jit-optimize/package.test.ts ./test/jit-optimize/solidification.test.ts ./test/jit-optimize/workspace.test.ts ./test/proposals/storage.test.ts`。

## G8 — 接进现有 CLI，一次操作拿到新包

**修改：** `src/cli/jit-optimize.ts`、`src/jit-optimize/index.ts`，需要时补 `OptimizeConfig`/result 的可选字段；更新 `docs/usage.md` 相关段。

- [ ] 先测试新增 `--package-out` 参数只导出新包、不触发 autoApply；没有该参数的旧命令输出保持兼容；no-change/infra-blocked 不谎称新包生成。
- [ ] 将 G7 接在真实 proposal 结果后，输出包路径、实际修改类别、验证状态和缺项。不能用一次 API-only 脚本模拟通用 CLI 已接通。
- [ ] trace 入口仍使用现有 `--task-source=log`/`--logs`。从 trace/skill 中提取可见任务资源；无法取得的内容给出具体缺项，不要求所有格式先转成 API JSON。
- [ ] 不把 log 模式按 diff 选出的 bestRound 当成效果最佳。生成、技术检查、实际消费和测得效果分开表达。
- [ ] 用真实 skill 和单条 trace 从 CLI 导出新包；所用命令的真实路径写入本轮结果，避免交付时仍只给抽象目录示例。

**运行：** `bun test ./test/cli/jit-optimize.test.ts ./test/jit-optimize/package.test.ts ./test/jit-optimize/loop-infra-blocked.test.ts`。

G8 完成后的新增用法是现有日志命令增加 `--package-out=./optimized-skill`；它是计划实现的参数，在本阶段通过前不能列为现有能力。

## G9 — 将验证失败反馈给局部动作

**修改：** `package-validation.ts`、`loop.ts`、action/history/result 的必要字段；复用已有轮次，不建立另一套优化器。

- [ ] 先测试两个独立动作中一个失败时，成功动作可保留；失败动作的依赖动作一起取消或修订；不能回退半个共享文件而丢失其他修改。
- [ ] 区分脚本执行错误、参数缺失、入口不明确、结果不符和环境无法重建。反馈给模型的是具体错误与相关文件，不反复注入全部历史。
- [ ] 对可明确定位的问题执行有证据的修复。无法可靠拆分共同改动时回退整个相关组，再保留其他独立组，不强行做行级自动逆补丁。
- [ ] 优化流程可结束为有用的部分包、no-change 或仍未通过的候选；“验证未运行”不得等同“通过”。

**运行：** `bun test ./test/jit-optimize/package-validation.test.ts ./test/jit-optimize/action-plan.test.ts ./test/jit-optimize/loop.test.ts ./test/jit-optimize/pick-best-round.test.ts`，后两项仅在 loop/选轮受改动时执行。

## G10 — 自然任务驱动的 agent 消费

**修改：** `consumption.ts`；新增 `general-skill-development.ts`；复用 `runHeadlessAgent` 和本轮 G6 检查。

- [ ] 先测试消费识别来自实际 read/exec 及结果，支持包声明的不同入口名；不能仅搜索 `api-task-solidify.js`，也不能把帮助命令/失败调用算成完成。
- [ ] 给 agent 正常任务、资源与 skill 位置，不在实验提示中指定 helper 路径、命令或内部 binding。调用指引由新包提供。
- [ ] 至少一项任务在局部程序完成后仍需 agent 完成后续步骤，核对最终结果而非仅核对 helper 被调用；复用 JIT-boost 时避免全 run 提前结束。
- [ ] 不适用输入由原流程继续，程序失败则明确修复/回退；报告区分脚本调用成功与任务成功。
- [ ] 纯文档优化包不要求调用一个不存在的 helper，验证其真实读取流程和任务结果。

**运行：** `bun test ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/general-skill-development.test.ts`，随后运行一个非 API 新包的自然任务。

## G11 — 修复共享上下文开销与统计口径

**修改：** package/optimizer 上下文策略、`effect.ts`、`src/core/pi-runtime.ts` 的必要计数字段；沿用已有 provider usage 解释。

- [ ] 从实际新 trace 定位重复读取、全文脚本阅读、过大工具返回和无意义重做；每项修复落在生成/交接策略，不手改两份历史成品。
- [ ] helper 给出足够的帮助和摘要，agent 通常无须读打包源码；诊断确实需要源码时仍允许读取，不能为了数字好看禁用必要工具。
- [ ] 先测试 runCount、model response/turnCount、toolCallCount、retryCount 分离；流式重复事件不重复计。不能把 agent 运行次数标为底层 API 请求总数。
- [ ] 分别报告 input/output/cacheRead/cacheWrite、可用的 reasoning 与 provider total；已有 Pi completions 输入扣缓存逻辑保持正确，不再次扣除。不同 provider 缺失字段保留 unknown。
- [ ] 统计工具返回字符量仅作为诊断，不能代替 token；长返回压缩必须保留后续判断需要的错误和结果。
- [ ] 付费单价未知时不硬编码官方价格当成当前代理商价格；可记录有来源的估算与实际账单的区别。摊销只在同单位、可比成本已知时计算。

**运行：** `bun test ./test/jit-optimize/effect.test.ts ./test/jit-optimize/consumption.test.ts`，以及被修改 Pi 计数函数对应的现有测试。先定位原测试文件再添加行为例，不重测无关 provider。

## G12 — 用少量多结构案例检验共享过程

**复用/修改：** 本轮 development 编排脚本及结果；实现修复回到 G3–G11 对应模块。

- [ ] 工程目标：保留一个 API 兼容回归，至少两个结构不同的非 API skill 走同一 CLI，其中覆盖原脚本复用和生成脚本或文档重组。候选优先来自 G1/G2；不强行把专业判断转成确定程序。
- [ ] 核心非 API 案例只提供一条真实运行给优化器；用原任务和一个变化任务验证新包。第二条消费 trace 不回灌后仍称单次。
- [ ] 初始每个可执行修改仅做必要配对，模型、任务、环境尽量一致，采用交错顺序。明确波动或归因问题才补一次有目的重复，不预设大型样本矩阵。
- [ ] 两个 skill 共用流程代码，具体脚本可不同；共用 helper 字节不是过程泛化的必要条件。若工程人工介入了 mapping/脚本，要说明并修产品入口，不能计全自动成功。
- [ ] 保留不适用、无改动、失败及效果 mixed。找不到有效机会时先诊断方法偏置或输入信息，不能无限换 skill 找正例；追加案例须对应新结构或新修复问题。

**完成：** 有可消费的非 API 输出和对共享实现的具体验证；广读数、尝试数、包数、消费数、收益数分别报告。

## G13 — 检查后加入 development 成员是否需要核心特判

**范围：** G1 已暴露但未用于前期实现的一份不同结构 skill；若没有则从普通公开来源补一份，仍标为 development。

- [ ] 在不预先编写按 skill 名称的分支下，运行已有优化入口；只有一条 trace 也允许开始。
- [ ] 记录首次结果：可导出、部分修改、no-change、输入缺失或实现失败。不能把配置填写工作隐去，也不把阅读正文当优化成功。
- [ ] 若失败暴露共享缺陷，回到对应生产模块修复，再保留首跑与修订结果。这是开发反馈，不使用“修订后 prospective 成功”措辞。
- [ ] 检查运行路径是否依赖研究目录、旧 identity、API 字段或特定 helper 名；去除实际暴露的耦合，不做全仓抽象重构。

**完成：** 对过程的复用边界有明确证据，无须先冻结方法。

## X1–X3 — 主链提前完成后的有限深化

仅在 G0–G13 的产品链已达到下述最低要求、尚未进入交付窗口且没有用户停止指令时执行；每项最多约 2 小时。有新问题可转主线修复，无问题就结束，不要求三项凑满。

- [ ] **X1 多资源与相对路径：** 从 G1 找一个 references/scripts 混合包，用现有 importer/workspace/package 路径验证资源移动后仍可调用；修共享路径解析，原输入与空目录/缺资源各检查一次。
- [ ] **X2 单次 trace 信息不足时的可用降级：** 利用真实缺 usage/返回的已知格式，验证只输出有依据的文档/调用改进或具体资源诊断；不把缺失补零，不再新增没有真实记录的 agent adapter。
- [ ] **X3 轻量文档重组的自然效果：** 选已读、无适合生成程序但长说明明显的 skill，通过同一 optimizer/package 路径生成按需参考资料；用一个正常任务检查关键规则保留、实际读取量与结果。无改善如实记录。

## G14 — 有限验证、交付和恢复说明

**更新：** `docs/usage.md`、现有 `docs/skill-ir/optimization-and-artifacts.md` 相关组件段、current-status/spec/plan，根 handoff/communication/conversation log。

- [ ] 一次合并运行本轮实际改动模块的测试及 `bun run typecheck`；运行 `python scripts/check_skill_ir_doc_links_test.py` 与一次相关链接检查。新增文件纳入检查，不重复历史矩阵/归档校验。
- [ ] 用户交付至少包括一条完整真实命令、原 skill/trace 来源说明、新包位置、实际使用方法、修复过的共享问题和效果限制。真实路径来自本轮运行，不能以示例命令代替实际完成。
- [ ] 最终报告分开列：通用过程已实现的能力、仍需人工接线的地方、每案例实际结果、开发/优化/消费/评估成本。机器 report 可简短，不用 HTML、PPT 或新增一批阶段 Markdown。
- [ ] 状态与结果按下节标准填写；不能把“所有阶段已终结”写成“通用优化成功”。修改同一文件前读取最新字节，不覆盖文档治理或其他开发线程变化。
- [ ] 精确提交本轮生产代码、测试、必要文档及脱敏结果；只推 `origin/skill-ir-aot`。核对一次远端对齐即可，不为写最后 SHA 再生成整轮证据。
- [ ] 写出未完成问题及可执行恢复动作；停止继续扩展。用户明确叫停时立即保留现场，不把未完成目标误标 complete。

## 4. 验收与诚实结束

### 最低产品要求

1. 通用 CLI 能从真实 skill + 一条 trace 导出新包；用户无须先理解内部 API binding，非 API 包不被注入 API helper。
2. 至少一个非 API 成员完成真实自然消费，关键任务结果合格；另一个不同结构成员完成同一流程的实际尝试，局限明确。
3. 原 skill 的程序/资源可复用，生成程序或重组文档至少一条实际实现；修改依据可以追溯，原包保留。
4. 至少三项由多样化阅读或 trace 暴露的共享问题落到生产实现与行为验证，不仅修改两个成品或增加说明文字。
5. 已有 API 回归保持可用；未涉及的历史合同/结果不改。至少一个实际收益指标有测量，其余负面/未知指标同时保留。

进一步目标是两个不同结构非 API 成员均自然消费、变化输入有效、至少一项改进在多个成员上有用。没有达到不能声称普遍适用于“大多数 skill”，但可交付已实现的准确范围。

### 状态不能混用

- `completed-with-measured-benefit`：最低产品要求达到，质量可比且至少一项实际指标有可观察收益；仍逐项保留 mixed/未知成本，单次观察不等于稳定因果效果。
- `implemented-with-mixed-or-no-benefit`：过程和消费已实现，收益尚不清楚或没有改善；若有可修问题且仍在执行窗口，继续修复，不以该报告提前完成收益目标。
- `partial-delivery`：产品链仍需人工接线或无非 API 消费；交付代码和准确缺口，持续目标若尚有可执行任务则不标 complete。
- 单个来源失败、单个 no-change、未知收费、未开启 prospective 不阻止其他开发。真正需要用户提供不可替代资源时，说明具体缺项，同时完成独立工作。

## 5. 可直接设置的持续目标

执行 `D:\skill优化\SkVM\docs\superpowers\plans\2026-09-13-general-skill-optimization-deepening.md` revision 1 的 G0–G14，并在主链达标且交付窗口前按条件执行 X1–X3。以生产代码和通用优化过程为主：复用已有公开 development 语料，阅读多样化 skill 和真实 trace 发现共享缺口；让一次真实运行能驱动脚本复用/生成、文档重组、通用新包导出与自然 agent 消费。API/Env 只是可选领域组件，不为两个既有包定制成功分支，不要求所有 skill 使用 API binding。模型用于有依据的优化，所有有效机会都可处理；保持任务目的、关键约束与残余职责，原包默认保留。少量真实运行指导修复，不扩大型实验矩阵；失败保留并依据证据继续修复，不在常规检查点等待确认。直接在 skill-ir-aot 开发，网络、认证 GitHub CLI、远端 API 和有用途的付费调用按既有授权使用，未知成本保留。不得触碰保护样本、改写历史结果或夹带他人文件；完成后提交推送用户 origin 并交付真实命令、代码、新包及效果范围。记录恢复状态，按实际成果判断完成；不以阶段终态替代成功，不通过等待、重复测试或无限续作凑时长。
