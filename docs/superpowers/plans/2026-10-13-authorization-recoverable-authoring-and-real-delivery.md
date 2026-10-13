# BK0–BK19：可恢复自动编写、实际程序补齐与同稿交付

> **For agentic workers:** 使用 `superpowers:executing-plans`，连续实施下列任务。用户已要求新线程使用 `gpt-6-astra / high` 开发，并在 BJ 复核后授权本轮工作。普通实现、定向验证、已授权账号实验、提交和向用户 origin 推送无需重复确认。执行线程独占代码、共享文档和 Git；只读探子遵守 AGENTS，不代写生产代码或自动作者程序。

**Goal:** 从完整原 skill、原四问、允许源码和场景事实自动编写并修好一份可运行程序，展示真实的写稿、试算、修稿、变化输入和消费过程；同时消除旧未知会话使全部新工作永久等待的问题。

**Architecture:** 复用 SkVM 的官方账号适配器、普通 inquiry 入口、resourceWorkflow、渐进编译、原子 patch、previous 和执行归档。账号终态、宿主活动状态、研究处置分别记录；作者循环根据自身草稿和实际执行反馈推进，宿主不提供源码答案。允许局部程序先运行，原四问质量、程序行为、自动编写和收益分别验收。

**Tech Stack:** TypeScript、Bun、Zod、现有 Codex app-server 接口和 PowerShell 示例。开发 `gpt-6-astra/high`；实验继续使用已经授权的官方账号 `gpt-5.6-sol/high`。第三方付费 API 仍暂停，不自行改实验模型。

**状态：** in-progress；BK0–BK1已提交，BK2/3/5/6账号接线定向验证通过，真实A0待派发；structured入口与其余责任继续实施。基线 `af2268377ddafc542b0d899057c4e9bc1eeb9c34`；分支 `skill-ir-aot`；新 identity `authorization-recoverable-authoring-v1`。本任务书是当前新工作合同，BJ 队列及原件维持结束状态。约 8–12 小时表示实质工作量和优先级窗口，不承诺耗满时间，不等待、不重复审计、不重复模型抽样凑时长。

## 一、复核依据与明确改变

BJ 的输入绑定、草稿反馈和来源失效修复有确定性证据。主线程在基线运行 99 项定向测试、740 断言，全部通过；普通零模型入口再次执行得到：BI 原稿 `conditional/returned=null`；仅加 inputBinding 的开发者诊断稿算出文档 11 的归档候选，但仍 conditional。原 BJ 14 场景的两轨完整有限行为均 0/14，绑定诊断轨仅值匹配 6/14。诊断干预不计自动成功。

唯一实际 R0 在 turn/start 确认后出现 `codex-child-exit:4`，未记录模型工具或答案；远端终态、usage、USD 未知。`src/adapters/codex-account-session.ts` 当前使用 `ephemeral:true`；BJ `study.ts` 的全局 `ledger.some(unknown)` 禁止任何新位置。现有恢复路径无法获得旧终态，两条规则形成持续等待。退出码 4 的深层原因未证实，不预判为额度、路由或模型语义问题。

本轮明确修订：

1. **保留 R0 unknown，但解除其作为所有新工作永久前置条件的地位。** 不修改旧结果，不重发 R0，不把新 A0 冒充 R0 修复成功。新任务具有本轮已授权的独立目的，并记录与旧未知请求的关系及潜在重复成本。
2. **先获得一次真正的自动作者使用。** 首轮 A0 从零开始，避免再把能否读回 BI/BJ 历史会话设成启动条件。已终结的自身稿可继续修订；开发者参考稿不进入作者。
3. **将试写提示补成可观察的作者流程。** 有稿后实际执行并反馈；自然答案先结束时，可在已知终态后有界继续完成自身编写任务，保存每段原答和费用。不能只增加一句“请继续”。
4. **先处理已知缺口，再比较。** 优先版本、权限、root 回退及返回关系。原四问继续评价，whole-task checked、所有性质 bound、收益胜出均不作为局部试跑的门槛。

官方 [App Server 文档](https://learn.chatgpt.com/docs/app-server)说明 `thread/read` 可以读取保存的线程而不恢复执行，`thread/resume`可继续保存的线程，动态工具定义可随线程保存。实施时以本机版本的实际 schema/行为核验兼容性；文档不证明旧 ephemeral 请求能够找回。不要切换登录方式、读取 token 文件或另造 provider。

## 二、必读上下文与文件地图

亲自阅读基础文档和将修改的确切源码。大轨迹定点读取，不重审 AY–BJ 全历史。

1. `D:/skill优化/AGENTS.md`、`D:/skill优化/SkVM/AGENTS.md`。
2. `docs/skill-ir/current-status.md`、本任务书全文、spec §14.50、研究 §1/§7.71/§7.72/§11。
3. `D:/skill优化/project_handoff.md` 当前 BK 恢复点、communication 最新 BK 决定。
4. BJ `summary.json`、`status.json`、`attempts.json`及 R0 原生命周期；BI 自动原稿与 BJ binding-only 诊断只给开发者阅读。
5. `examples/authorization-assessment/download-workflow/README.md`及下表代码、相关测试。

| 责任 | 修改或复用位置（相对 SkVM） |
|---|---|
| 账号子进程、持久记录、终态 | `src/adapters/codex-account-session.ts`、`.test.ts` |
| 独立的恢复处置纯函数 | 新增 `src/adapters/codex-account-recovery.ts`、`.test.ts`；只承载生命周期判定，不成为新实验框架 |
| 官方通道调用与归档 | `src/adapters/codex-account.ts`的`runCodexAccountInquiry`、`src/benchmarks/authorization-dsl/inquiry-local.ts`；两普通入口共用，不把继续循环写进研究runner |
| 作者状态与阻断投影 | `src/task-dsl/authorization/program-authoring-context.ts`、`.test.ts` |
| 作者循环/工具调度 | `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-run.ts`、`inquiry-domain-runtime.ts`，对应测试 |
| 原稿及修稿 | `src/task-dsl/authorization/resource-program-draft.ts`、`program-input-binding.ts`、对应测试 |
| 程序执行与范围边界 | `src/task-dsl/authorization/resource-relations.ts`、`executable-contract.ts`、对应测试；有反例再改 |
| 普通公共路径 | `src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts`、`inquiry-reuse.ts` |
| 普通示例 | `examples/authorization-assessment/download-workflow/run.ps1`、`README.md`；ShareLink 仅离线复用 |
| 本轮研究记录 | `results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/`，记作下文 BK 目录 |
| 当前说明 | 既有 current-status、plan、spec、研究总文档、usage、developer-guide；不新增一轮一篇组件说明 |

实际账号调用模块的定位命令：

```powershell
Set-Location 'D:/skill优化/SkVM'
rg -n 'runCodexAccountSession|accountContext|programMode' src/adapters src/benchmarks/authorization-dsl
```

## 三、生命周期与作者循环设计

### 3.1 三种事实分开

保留既有 `terminalStatus`，新增恢复信息应兼容旧归档，不改旧 schema 字节。最小共享判定合同如下；字段放置可按现有 telemetry 结构调整，但含义不变：

```ts
export type AccountRecoveryObservation = {
  terminal: "completed" | "failed" | "interrupted" | "unknown" | "not-started"
  localExecution: "active" | "closed" | "unconfirmed"
  reconciliation: "not-attempted" | "terminal-found" | "not-found" | "unavailable"
  channel: "available" | "quota-or-auth-blocked" | "repeated-transport-failure"
  nextPurpose: "same-attempt" | "independent-task"
  independentAuthorized: boolean
}
export type AccountRecoveryDecision = {
  action: "inspect-existing" | "resume-after-terminal" | "quarantine-and-continue" | "pause-channel"
  allowNewTurn: boolean
  keepTerminalUnknown: boolean
  reason: string
}
```

共享 `decideAccountRecovery` 只读这些已观察事实：

- local active/unconfirmed 时先处理本进程持有的会话；不能靠经过几分钟推断已结束。
- quota/auth 或连续同因通道故障只暂停该通道；离线开发继续。
- unknown 且未核查时，先一次有界只读核查；不调用 turn/start。
- 已核查无法恢复、宿主执行已关闭、下一独立用途已授权时，可以隔离 unknown 并继续新任务；旧终态、费用和原始账本保持原样。
- same-attempt unknown 不自动补发；已知终态后的继续编写是新 turn/attempt，关联原身份并独立记账。
- 出现晚到终态，追加 reconciliation 观察；不得悄悄覆盖已发布的历史记录或将晚到工具写入当前稿。

不要用全局 `ledger.some(unknown)` 实现本轮准入。局部租约/输出目录保护作用于仍可能被同一宿主写入的资源，不把历史陌生会话当作当前运行中的写者。不得全盘杀进程，只处置本轮自己创建且能确认身份的子进程。

### 3.2 可恢复账号记录

优先将新账号会话设为可存储模式，并验证本机 thread/read/resume 与动态工具合同；保持模型、受控工具、只读源码、无评价器访问等原边界。不能只改 `ephemeral:false` 就宣称恢复完成。

- 在派发前记录逻辑 purpose/attempt 和输出路径；收到 thread/turn ID 后立即保存，所有回调带该身份。
- 区分 turn/start 已尝试、已确认，以及 provider terminal 已观察；发送异常但是否到达不明仍是未知。
- 持久化每次已接受的草稿、原子修稿和其来源身份；进程退出后已有稿可恢复，但不能据此说模型调用完成。
- 读取保存终态使用只读 RPC；`thread/resume` 不得被用来偷偷重启未知 turn。新 turn 仅按明确的处置决定启动。
- 恢复需重新核对受控配置和工具定义，宿主按既有 previous 机制重建领域状态；恢复模型会话历史不自动恢复旧求值、政策判断或答案。
- 本机版本若不支持可靠保存/读取，写明能力缺失，仍实现本地原稿检查点与 unknown 隔离。不要无限等待持久化完善才尝试独立 A0；也不要声称具有尚未验证的服务器恢复能力。

**明确接点。** 当前`CodexAccountSessionOptions/Result`没有持久模式或thread/turn结果字段，`AccountTransport`只有send/onMessage/onExit/close，RPC request闭包在单次会话内。BK2需要将最小RPC生命周期抽成可复用私有帮助函数，并在适配器暴露只读读取入口及其结构化结果；不要求给transport另造多套read/resume方法。只读入口不得调用turn/start或执行工具。会话选项、结果和事件归档增加兼容的purpose/attempt、thread/turn及持久能力记录，线程身份不以prompt文本代替。普通inquiry报告及顶层账号adapter都传递这些结果。新增字段/接口的名字可随实际代码调整，但不能只在mock或研究脚本里模拟。

### 3.3 作者流程按实际稿件推进

继续使用 `createProgramAuthorLoop`。将 discover/draft/repair/review 的进度与下一步动作接入真正的宿主循环：

1. 已读到可引用函数后尽早试写；既有 12 探索单位提示保留为提醒，不算已发生程序提交。
2. program/patch 后读取本次 revision 的编译、实际输入、执行事件和阻断；无效新稿不展示旧稿值。
3. 将**输入/结构错误、可执行程序缺口、性质证明缺口、真实范围外条件**分组。某个 property locator 错误不能在反馈中遮住可修复的资源执行缺口；所有诊断仍可查看，不能删除错误以提高状态。
4. 在 edit 模式为写稿/修稿保留可用预算。必要源码工具仍开放；source 工具不是被永久关闭来强迫模型猜答案。
5. 模型在已知终态先交自然答案、而稿件仍有可行动机械缺口时，允许最多两次有目的的自身稿继续回合。优先正式同线程继续；若工具恢复能力不足，走普通 previous 恢复自己的已完成会话，明确标修订。不得恢复未知 R0 或用他人程序替代。
6. 所有继续回合共用该作者位置的总工具/显示/时间预算；不把 64 自动变成 3×64。每段原答保留，费用累计；继续理由来自实际稿件和执行诊断，不来自 oracle。
7. 没有新的稿件、读源或已处理阻断进展时停止同因继续，定位共享接口。模型拒绝继续或只剩真实外部事实时可以诚实结束，作者未完成状态保留。

不强求固定步数，不由宿主生成领域规则。输入数据是示例事实，源码关系由作者读取并表达；source-visible 但未编写的 helper 与真正范围外后端分别呈现。

**继续回合的宿主。** 当前`runCodexAccountInquiry`只调用一次`runCodexAccountSession`，随后在finally关闭native runtime。BK6在这一公共编排层接入编辑模式的有界继续决定，使用native当前稿件/预算快照，并在整个作者位置结束后才关闭运行时；会话层负责已知终态、thread/turn与受控工具。普通`executeLocalInquiryRun`和`CodexAccountAdapter.run`沿同一入口受益。测试须通过这个实际编排函数，而非手动拼接几份mock报告。structured provider复用作者决定与累计预算逻辑，保持自己的传输方式。继续产生新的turn/attempt记录，每段答案保留；累计usage须按官方事件是否为线程累计量做差或去重，不能把多轮累计计数相加。

## 四、阶段安排与任务

| 工作段 | 参考投入 | 交付 |
|---|---:|---|
| BK0–BK4 | 2h | 旧未知处置、会话记录和恢复核心 |
| BK5–BK8 | 2h | 实际作者循环、第一份真实稿及当场修复 |
| BK9–BK12 | 3h | 主链补齐、同稿变化和独立确认 |
| BK13–BK16 | 2.5h | 真实消费、变化复用和有限比较 |
| BK17–BK19 | 1.5h | 共享验证、普通使用、归纳发布 |

合计参考约 11 小时；模型响应和实现难度会改变实际耗时。每个缺陷先定位再修复，适用责任做完即可提前交付。约第 9 小时整理仍欠的实际确认，后段优先已有稿件和交付，不新开研究方向。没有新可行动证据时不耗满时间。

### BK0 — 接管、建立分轴状态

- [ ] 核对基线、分支、origin和其他写者；不建分支/worktree。新目录建立 `status.json`、`attempts.json`、`repairs.jsonl`，目标字段与结果字段分开。
- [ ] 保存 BJ R0 的引用和本轮处置决定，不复制改写其 attempts/status；本轮研究目标初始为 false，未测为 null/not-run。
- [ ] 记录实际开发时间段；睡眠、平台中断与等待不记主动工作。第一项实现进入 BK1 红测。

### BK1 — 消除全局 unknown 死锁

Files：新增 recovery 纯函数及测试；研究 runner 调用该函数，旧 BJ runner 不改。

- [ ] 用下面反例写失败测试，再实现 §3.1 判定。`decideAccountRecovery` 从新增模块导出。

```ts
import { expect, test } from "bun:test"
import { decideAccountRecovery } from "./codex-account-recovery.ts"
const unknown = {
  terminal: "unknown", localExecution: "closed", reconciliation: "not-found",
  channel: "available", nextPurpose: "independent-task", independentAuthorized: true,
} as const
test("isolated historical unknown permits an authorized independent purpose", () => {
  expect(decideAccountRecovery(unknown)).toMatchObject({
    action: "quarantine-and-continue", allowNewTurn: true, keepTerminalUnknown: true,
  })
})
test("the same unknown attempt is never automatically replayed", () => {
  expect(decideAccountRecovery({ ...unknown, nextPurpose: "same-attempt" }).allowNewTurn).toBe(false)
})
test("a live local owner and unavailable account still block new turns", () => {
  expect(decideAccountRecovery({ ...unknown, localExecution: "active" }).allowNewTurn).toBe(false)
  expect(decideAccountRecovery({ ...unknown, channel: "quota-or-auth-blocked" }).action).toBe("pause-channel")
})
test("unreconciled and unauthorized unknowns do not pass", () => {
  expect(decideAccountRecovery({ ...unknown, reconciliation: "not-attempted" }).allowNewTurn).toBe(false)
  expect(decideAccountRecovery({ ...unknown, independentAuthorized: false }).allowNewTurn).toBe(false)
})
```

- [ ] 测试 not-started、已知 completed、interrupted、迟到终态只追加、不同输出目录互不污染。未观察到的本地关闭不能写成 closed。
- [ ] 在派发前保存本地purpose/attempt身份，按thread/turn/toolCall绑定回调；不同attempt输出隔离。重启后只读旧记录不得将旧工具调用派到新native runtime，不能只依赖单进程`finished`变量。
- [ ] 聚焦红绿通过后提交本项；不增加多重等价许可门。

### BK2 — 账号 ID、退出与持久读取接线

- [ ] 读取本机已安装版本的接口 schema/帮助；需要时查上述官方文档。仅做接口/元数据核查，不派发健康模型请求。
- [ ] 在普通账号路径记录 thread/turn 与 persistence/recovery 信息；保留脱敏 stderr、最后事件、已发送/已确认状态。
- [ ] 用现有 AccountTransport 测试模式模拟：启动确认前退出、确认后退出、保存终态可读、记录不存在、旧会话迟到回调。预期未知仍未知，当前稿不会被旧回调修改。
- [ ] 新持久线程可读取同 thread 的终态；同一工具 callId 的重复回调不重复执行，恢复后冲突 ID 具名拒绝。保持现有只读工具验证。

### BK3 — 稿件检查点和中断后的可用状态

- [ ] program/patch 成功后沿现有归档保存当前 raw、revision、来源和活动/候选区别；不把保存推迟到模型最终回答之后。
- [ ] 测试“有效稿→坏 patch→transport 退出”：raw可读、坏提案保留、当前 preview 不冒充旧值；恢复后重新求值。
- [ ] 测试输入变化和源码变化沿原 previous/source pin 逻辑，恢复会话不绕过失效。

### BK4 — 有界核查 R0，建立新 A0 的明确处置

- [ ] 读取已经保存的 R0 核查证据；只有新持久能力能提供新信息时才做一次原 thread/turn 只读查询。已有 not-found 不反复请求。
- [ ] 确认本地旧宿主不再持有工具写入，记录 `terminal=unknown` 与 quarantine 处置；不重发 R0、不删除费用未知项。
- [ ] 新 A0 是本任务书授权的 fresh 作者，不带 BI/BJ previous，不等待旧未知转为成功。记录该准入依据及未解决的潜在旧计费。
- [ ] 若当前账号实际额度/认证失败，暂停模型分支，继续 BK5–6/9/15/17 的适用工程；不得绕第三方或反复试登录。

### BK5 — 作者反馈给出真实可执行下一步

- [ ] 将 §3.3 的诊断分组和当前 revision 进展接到共享投影，保持完整原问题。先写“证明定位错误与资源缺输入同时存在，两者均可见且资源修稿仍可进行”的反例。
- [ ] 测试无稿、只有不合法候选、旧活动/新候选、已恢复稿、只有真正外部条件五种情况；不重复传送无变化的巨大诊断对象，详情可读回。
- [ ] 日志记录 draft/execute/repair 事件及实际新增计算关系；model自报完成不关闭剩余职责。

### BK6 — 有界继续编写进入普通循环

- [ ] 将早期试写、修稿预算及已知终态后的继续接入 native/account，structured 路径共享决定逻辑；不另造独立研究专用 agent。
- [ ] 用匿名 mock 跑完整公共链：读源→首稿→缺数据→binding patch→值变化→拒绝分支→终答；另测自然终答先结束后，在剩余预算中继续自身稿。
- [ ] 断言最多两次编写继续、总预算不重置、同因无进展结束；unknown终态不触发同请求继续；所有原答与成本保留。
- [ ] 本项和生命周期聚焦通过后立即进入真实 A0，不等所有变体和最终联合回归完成。

### BK7 — A0：首个真实独立作者

- [ ] 原 skill、四问、root-default、允许源码，edit/full，无 previous、无给定程序、无评价器/开发诊断输入。
- [ ] 记录第一次 program/patch、当前输入接线、第一次实际执行、修订和终答。保留持久终态查询信息。
- [ ] 若先交自然答案，按 BK6 在已知终态后继续自身稿，归入 A0 修订成本；首稿和最终稿分别评价。
- [ ] 出现任何共享接口错误立即进入 BK8；不拿这个错误继续跑后续作者和消费者。

### BK8 — 根据真实失败当场修复

- [ ] 将错误定位为通道、协议、输入/来源接线、算子、作者调度或源码语义；找到实际工具参数和反馈，先复现再改共享实现。
- [ ] 每个不同的已诊断共享修复允许一次具名真实确认，原失败不覆盖。同因两次无改善转离线定位，不重发相同请求求幸运成功。
- [ ] 若为作者含义缺口，提供自身稿、当前输入、真实执行和通用读源问题；不提供正确文件 ID、分支表达式或参考程序。
- [ ] 确认采用未发生时写“离线已修、实际未确认”，但继续尚可独立完成的责任。

### BK9 — 补齐源内关系，保留精确外部条件

- [ ] 检查自动稿的版本 absent/empty/explicit/invalid、root查询/回退、owner/非owner、排序及文件表示关系；这是开发/评价清单，不传给隔离作者作为正确答案。
- [ ] 对源码可见却整体 external 化的函数，反馈实际可读来源和未实现边界；真正未知后端/检查器构造继续条件化，不默认允许。
- [ ] 先验证现有算子能表达实际关系；有匿名反例证明缺能力才扩展共享算子。禁止 Download/仓库名成功分支、语言语义全谱或手写语义回填自动稿。

### BK10 — 同一原稿的变化矩阵

- [ ] 保存 A0 最新模型原字节，再跑现有14个development场景；沿原源码独立判定值、guard、终止与剩余条件。
- [ ] 优先分析默认、empty-version、denied、root回退四项。先输出实际行为，再与评价侧 expected 对照；expected 不进入模型上下文。
- [ ] 模型需要变体反馈时只展示输入、自身程序和实际轨迹，标为反馈辅助修订；之后重算受影响场景，首稿结果保留。
- [ ] 无程序仍记录 not-produced，不能用 BI/BG 或开发者稿填 A0 的位置。

### BK11 — 作者原稿选择与继续修订

- [ ] 消费选择规则固定为 A0 链最新可运行模型原稿；没有可执行稿则消费者依赖不足，不挑历史参考。局部可运行可以消费，完整验收另算。
- [ ] C0开始前将A0链最新可运行模型原稿选定一次，保存原字节、revision和实际来源；C0/C1/C2全部使用这一份。A1、后续A0修订或S0不得替换它；受影响消费另列新epoch，首轮比较保留。只复用已有包/会话绑定，不再建一层冻结哈希系统。
- [ ] 后续共享修复明确哪些结果受影响；修后的消费另记 epoch，不能用跨版本件拼成同条件收益。

### BK12 — A1：一次独立起始输入确认

- [ ] A0 已形成可执行关系且相关接口稳定后，从 empty-version 无稿开始独立编写；看不到 A0 稿、评阅或答案。
- [ ] 记录 first-draft 和修订，不把 A1 最好结果替换 A0。A0仍无可用稿时推迟 A1，先做明确的共享责任。
- [ ] 仅用于检验新起点是否仍能编写，同一暴露任务两次开发运行不扩大为跨skill泛化。

### BK13 — C0/C1/C2：真实固定稿消费

- [ ] 当前自动稿在默认、empty-version、denied分别consume/full；消费者无program/patch写权，全部原四问保留。
- [ ] C0/C1/C2均使用官方`gpt-5.6-sol/high`、独立purpose/attempt与新输出目录；不继承作者对话、答案、评阅或开发诊断。C1允许的previous仅恢复C0的已选程序及合格源码材料，不能resume作者线程或恢复C0答案；模型/代码epoch及输入白名单随派发归档。
- [ ] 验证实际执行及被答案使用，条件候选不得说成已许可返回。自然补答与程序计算列开。
- [ ] C1可恢复C0合格程序材料，必须按当前输入重算；旧答案/候选值不恢复。不要求原整个任务full才允许观察局部使用。

### BK14 — 同期 B0/B1 与收益

- [ ] 将 C/B 联合安排为 C0→B0、B1→C1；两对各自同源码、skill、四问、事实、模型、总预算和代码epoch。C2单列。
- [ ] B使用普通无给定程序的完整skill路径，源码工具相同；C多出自动产物是工作流预处理差异，报告含编写成本的价值，不归因为纯DSL语法。
- [ ] 逐题质量、input/cache/output、工具、时间分别报告，cache已计input时不再加一次。实际USD未提供就unknown。
- [ ] 没有任何值得消费的自动局部产物时不派B凑比较；已有partial可用稿时保留真实负向/取舍，不因结果难看撤销比较。

### BK15 — 输入/源码变化后的恢复

- [ ] 同自动原字节以fresh/previous零调用核对输入变化，相关输出重算、独立材料保留；无现成自动稿时离线诊断明确另轨。
- [ ] 新普通目录内复制允许源码并改变一个决定性分支，原 source 保持；旧相关结果撤回，自身raw可继续edit。
- [ ] 自动稿可恢复时执行一次 S0 真实源码变化修稿，模型只看变化源码和自身稿/诊断。主链无程序时 S0具名未运行，不制造成功基础。

### BK16 — 可搬移和真实过程展示

- [ ] 普通目录中运行当前自动稿、inspect和变化输入；execution.md先展示读源/首稿/修改/实际逐步结果与条件，原始记录旁存。
- [ ] README明确自动/恢复/开发者稿来源。自动稿未产生则明确当前示例仍为历史稿，不能悄悄换成开发者成功程序。
- [ ] 不制作HTML，不另建CLI；直接改既有run.ps1和普通usage。脚本失败返回实际退出状态，保存的partial可继续查看。

### BK17 — 尚有时间时处理实质共享缺口

- [ ] ShareLink仅离线验证同一恢复、绑定、局部执行和预算；匿名跨operation、过期候选、false/unknown guard、坏return保持原边界。
- [ ] 若真实轨迹暴露重复机械状态，先量化再做可读回的无损减负；本轮不重开compact面板。
- [ ] 删除本轮新引入的重复实现，保留一个公共准入/恢复决定和一个作者反馈内核。不要治理全仓或清理他人目录。

### BK18 — 联合验证与研究归纳

- [ ] 必要受影响测试、主/本轮研究类型检查、文档测试及改动文档链接一次通过；没有新变化不重复全历史验证。
- [ ] 独立核对自动稿来源、实际tool采用、输入变化、自然四问、未知计量。测试总数只说明回归，不作研究进度百分比。
- [ ] 研究§7.72持续追加发现与修复，最终更新§1/§11、spec§14.50、current-status、plan、usage/developer-guide和根日志。

### BK19 — 发布与交付

- [ ] 分目的提交，只推用户origin/skill-ir-aot，核对live SHA；不提交无关文件、不改旧保护证据。
- [ ] 首先给当前自动稿运行命令和实际输出，然后报告各验收轴。未达项列具体模块、失败记录、已试修复和剩余动作。
- [ ] 全部适用工作有实际处置才收束；工程完成、有限队列结束、自动主链完成、研究目标达成分别填。无收益时如实保留，不用“所有任务勾选”替代成果。

## 五、真实调用范围、恢复与评价

八个首用途：A0独立作者、A1变化起点作者、C0/C1/C2同稿消费、B0/B1基线、S0源码变化修稿。A0/A1各最多两次自身稿继续已列入授权，所有回合共用各自总预算。不同共享缺陷的具名确认另列，必须先有诊断和修复，不按新名字掩盖重复抽样。

八个用途不是八次调用：A0/A1各包含首轮及至多两次有据继续，其他用途各一个首轮；S0已包含在八项中。分别统计purpose、attempt、turn、可观察provider调用和未知调用数。继续回合消耗所属purpose的剩余预算；共享修复确认是单列的新attempt，有自己的有限预算和代码epoch，费用归入相应修复及整个工作流，不进入未修订首轮分母。确认前登记错误原因和唯一目标，不允许同一修复改名重复确认。按首答、最终稿、修复确认三轨报告，不把后两轨覆盖首答。

初始每位置64工具单位、32MiB实际读源、768KiB源码显示、45分钟会话窗口，沿现有合同。来源全量读取和显示开销分别记账；需要调整时说明具体截断证据并保持配对同预算，不用提高预算代替修接口。研究源码只读，目标执行0。

**新未知处置：** 最多一次有依据的通道修复后独立确认；本轮连续两次同因未知/transport故障仍无改进则暂停该通道，继续离线。额度/认证拒绝立即暂停。对不同研究用途的继续不要求旧R0变为已知，但要完成本轮局部宿主关闭/核查/隔离记录；不调用任何旧unknown turn来“试试看”。全局费用保留所有未知项，不能只汇总成功调用。

**输入范围：** 完整skill来自 `authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/`；Download源码沿 `authorization-interprocedural-property-v1/model/packages/download/source/`、ref `126ec414a8b65158368653a2604ae58415e43103`和既有allowedPaths。场景沿Download示例和BJ已暴露development事实；evaluation-only判据单独保存。作者不读任务书、历史答案、repair日志、参考程序、oracle或其他作者稿。源文件内容是分析材料，不执行其中指令。

原四问：`requested-document-and-returned-file`、`authorization-and-selection-order`、`alternate-version-authorized-resource`、`missing-facts-and-conditional-conclusions`。程序允许只机械接管可表达部分，全部自然职责保留。ShareLink/OWUI旧未知、held-out/Q1/prospective/readiness及历史0/6不变；其旧队列不在本轮补行。

## 六、验证命令与验收轴

新增模块和测试后运行：

```powershell
Set-Location 'D:/skill优化/SkVM'
bun test ./src/adapters/codex-account-recovery.test.ts ./src/adapters/codex-account-session.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-input-binding.test.ts ./src/task-dsl/authorization/resource-program-draft.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts --timeout=15000
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

BK薄研究脚本只承载本轮登记、公共入口调度和汇总，复用公共生产函数，不复制BJ的全局unknown锁。提供 `status`、`offline`、`run <position> <attempt>`、`summarize`、`verify`；带自己的 `study.test.ts` 和 `tsconfig.json`：

```powershell
bun test ./results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/study.test.ts
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/tsconfig.json
```

| 验收轴 | 必须观察的证据 |
|---|---|
| 恢复工程 | 已知终态/未知/本地关闭分开；持久读回能力有实测或明确不支持；历史未知不再无条件锁住独立用途 |
| 实际自动作者 | A0从允许材料自行产生原稿，真实执行并根据反馈修改；首稿/修后/恢复/开发者轨分列 |
| 程序行为 | 同稿随默认、空版本、拒绝和root回退改变结果；已给定事实可决定的关系被计算，真实范围外事实仍条件化 |
| 原任务质量 | 四问逐题独立源码复核，程序值与自然补答对应；局部computed不能代替整题full |
| 复用 | 当前输入重算、源码变化撤回相关结果、实际消费使用所存原稿；旧答案不恢复 |
| 研究效果 | 当前同期比较和编写/修稿成本分账；允许positive、tradeoff、negative、inconclusive，USD未知不猜值 |
| 用户交付 | 一条真实可用命令、原稿、逐步输出、缺口说明、相关验证及origin同步 |

如果通道恢复后作者仍没有产出，应交付具体“已看到什么、提交了什么、宿主接受/拒绝了什么、为什么没有继续”的时间线，不能再只用测试通过数和partial标签解释。本轮优先取得真实程序与真实过程，后续默认升级依据实际证据决定。
