# AP0–AP4：授权运行器共享合同修复小任务

> **For agentic workers:** Use `superpowers:executing-plans`，按下列复现→失败测试→修复→有限验证连续执行。用户已授权这项修复，无需再次等待常规确认。主开发者亲自实施；子代理限于必要的独立只读核验。

**Goal:** 修复 AO 已确认的 Schema 约束丢失、缺少有效协议修复反馈、最终检查被工具预算挤占的问题，使普通入口能可靠遵循并完成已有合同。

**Architecture:** 沿用共享 `extractStructured`、inquiry 分析循环和 native 域工具。生产合同、发给模型的合同和失败诊断保持一致；使用既有 fallback 机会恢复格式；在原有总预算内为最终机械检查预留位置。本轮不实现新的领域推理策略。

**Tech Stack:** TypeScript、Bun、Zod、现有 provider mock、authorization inquiry、已有 telemetry。

状态：AP0–AP3完成，AP4验证通过、待发布核对。实际起点HEAD `df18fece`、工作区干净，含尚未推送的任务书提交；工程基线：`256db3c12bfbea3b1ba01d324da41d51b8167411`。工作目录 `D:\skill优化\SkVM`，分支 `skill-ir-aot`。开发模型请求 `gpt-6.1-sol / max / Flash`；派发接口支持 model/effort，未提供速度参数，不能将请求的 Flash 写成实际已启用。不得修改全局模型/速度配置。

## 范围与协作

- 这是一个短工程任务，完成下面五步即交付，不扩展成新面板或长队列。
- 本线程负责源代码、相关测试、当前文档和 Git 发布；父线程继续讨论领域方法，不并行修改这些代码或研究总文档。
- 不新建分支或 worktree，不修改其他线程的内容。若发现并发变化，合并最新局部内容，不能恢复旧文件覆盖。
- AO 原始 run、request、review、summary、manifest 和冻结任务书保持原字节；修复证据放新位置。旧模型响应可作为只读反例，不改历史统计，不重发旧行。
- 验证使用 mock 与离线记录，项目 provider/API/付费调用为 0；开发代理自己的费用另计。不得以付费重跑代替确定性验证。
- 不扩展 CLI、前端、采样、owner 语义、依赖图、分支求值或未知状态研究；这些由父线程与用户另行讨论。
- 使用现有测试及一个紧凑验证记录，不增设审批、全量历史审计或重复摘要链。

## 必读上下文（按顺序）

1. `D:\skill优化\AGENTS.md`、仓内适用的 `AGENTS.md`；以当前状态页和用户最新要求纠正旧阶段指针。
2. `docs/skill-ir/current-status.md` 的 AO 当前节及本任务书。
3. `docs/skill-ir/skill-dsl-research.md` 的 §7.34；`docs/superpowers/plans/2026-09-30-authorization-inquiry-and-evidence-tools.md` 的 §3、§4、§5。
4. `src/providers/structured.ts` 及对应测试；`src/benchmarks/authorization-dsl/inquiry-run.ts`、`inquiry-native.ts`、`inquiry-tools.ts` 及对应测试。
5. `src/task-dsl/authorization/inquiry-result.ts`，理解结构校验与语义质量的职责。
6. AO 证据根：`results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/`。只定位下列行，不通读全部原始请求。

已核实的证据：

| 缺陷 | 具体位置或记录 |
|---|---|
| 本地 `calls.max(8)`，发给模型的数组无 `maxItems` | `inquiry-run.ts:15-18`；`structured.ts:224-228`；AO `runs/consume-memos-remove-MD-original/` 与 `-changed/` 的保存请求 |
| 10/9 个合法只读动作触发整次协议失败 | 上述两行的 `run.json.error`；4/3 次 provider 调用后无终答 |
| fallback 未带入首次实际校验诊断 | `structured.ts:48-75,117-172`；fallback 换输出通道，却仍缺同一约束或具体错误反馈 |
| 最终域工具检查被预算拒绝 | `inquiry-native.ts:50-75`；AO `skill-use-detail.json` 中 Cloudflare/Paperless domain 行 |

## AP0：确认基线并固定反例

**Files:** 本任务书；上述源代码与测试；新增紧凑记录 `results/skill-ir/authorization-runtime-contract-repair-20261001/verification.json`（交付时创建）。

- [x] 查看当前分支、工作区与最近提交，记录本任务起点。无需重新验证已冻结的全部历史阶段。
- [x] 从两个消费行仅提取动作数量、错误、已发送 schema 的数组字段，证明缺的是 `minItems/maxItems`。不能将真实源码或整份原始提示复制成庞大新 fixture。
- [x] 用通用临时源码和 mock provider 重现同一问题。测试中使用中性的 task/repo 名，避免依赖 Memos/Paperless 名称。

## AP1：生产合同与模型 Schema 同步

**Modify:** `src/providers/structured.ts`。
**Test:** `src/providers/structured.test.ts`。

- [x] 先写失败测试：捕获 provider 收到的 tool schema；对嵌套 `z.array(...).min(1).max(8)` 断言包含 `minItems: 1, maxItems: 8`，并覆盖 `.length(2)`、optional、union 内的数组以及无约束数组。
- [x] 测试 prompt+parse schema 也携带相同界限，验证两种传输共用同一转换结果。
- [x] 在 `ZodArray` 分支保留 items，并按照实际 Zod 定义映射数组长度界限：

```ts
return {
  type: "array",
  items: zodToJsonSchema(def.type as ZodTypeAny),
  ...(def.exactLength
    ? { minItems: def.exactLength.value, maxItems: def.exactLength.value }
    : {
        ...(def.minLength ? { minItems: def.minLength.value } : {}),
        ...(def.maxLength ? { maxItems: def.maxLength.value } : {}),
      }),
}
```

- [x] 测试成功后再进行下一步。不要顺带替换整个 schema 库或扩大到全部 Zod 特性的重构。

## AP2：将明确的协议诊断用于既有恢复机会

**Modify:** `src/providers/structured.ts`；必要时 `src/benchmarks/authorization-dsl/inquiry-run.ts` 的错误说明。
**Test:** `src/providers/structured.test.ts`、`src/benchmarks/authorization-dsl/inquiry-run.test.ts`。

- [x] 先写失败测试：第一次返回9或10个动作，下一次 mock 根据明确诊断返回合法8个动作；断言 fallback 请求包含 `calls`、允许上限和首次错误类别，原失败与调用计量仍保留。
- [x] 在既有 tool-use→prompt+parse fallback 中传入有界结构诊断，例如字段路径、错误码、界限和实际数量。把诊断作为数据，不能将模型原文或源码中的指令提升为系统指令。
- [x] 不增加既有调用次数上限，不对 provider 网络错误、超时或未知完成自动重发。现有 fallback 的一次请求应能获取可行动反馈。
- [x] 不静默截取前8项，不把剩余合法动作丢弃，不把未知工具转换为允许工具。模型可分两轮请求，宿主按原总预算计量。
- [x] 第二次仍违反合同则保留具体失败诊断和原始响应；不得标成成功。至少覆盖“超限→合法”“超限→仍超限”“provider错误不fallback”“预算已耗尽不额外派发”四种情况。
- [x] 说明本修复确保规则可见且恢复有依据，不声称所有真实模型都必然服从。

## AP3：为最终机械检查保留预算

**Modify:** `src/benchmarks/authorization-dsl/inquiry-native.ts`。
**Test:** `src/benchmarks/authorization-dsl/inquiry-native.test.ts`，按需 `src/adapters/bare-authorization.test.ts`。

- [x] 先写失败测试：启用domain工具，总预算24；普通源码/reference/compile/observe消耗到22后，新的探索动作被拒绝，但一次 `authorization_check_result` 及其一次诊断修复仍可执行，总实际执行次数不超过24。
- [x] 默认在domain模式内保留2个检查位置（第一次和一次修复）；非domain路径保持原预算。对显式极小预算，采用与现有检查一致的具名诊断，不允许负数或隐藏增加预算。
- [x] 预算判断区分 exploration 与 final check，并让模型可见各自剩余额度。保持现有源码大小、调用数、超时和两次check上限；拒绝的动作与实际执行的动作分别记录。
- [x] 在“没有编译”“检查2次均失败”“连续拒绝后重试”“源码/引用仍需隔离”等情况下，结果不能被误标有效。
- [x] 未启用domain工具的既有测试继续通过。不得通过把全部工具上限调大来掩盖该问题。

AP3实现细节：domain总预算至少3（一次compile加两次check），显式1/2在创建时返回具名`tool-budget`错误，非domain仍接受原有正整数预算。探索上限固定为总上限减2；工具返回与报告暴露探索/check/总额剩余，并以executed区分实际执行和预算拒绝。此细节不增加总预算、不影响源码和引用隔离。

AP3另一个红灯反例：首次check有效、第二次无效时，旧实现仍暴露首次result；现已按最后一次实际check清除旧有效result。三次预算拒绝不能挤占或刷新check位，两次无效后第三次提交保留拒绝。

## AP4：验证、说明及交付

**Docs:** 本任务书、`docs/skill-ir/current-status.md`、`docs/skill-ir/skill-dsl-research.md`（在 AO 附近追加短修复说明）、相关 spec/使用说明仅更新受影响的合同。

- [x] 运行相关 provider、inquiry、native、adapter 和CLI测试；主typecheck。测试选择一次确定，不重复全仓历史审计。
- [x] 在仓库内执行：

```powershell
bun test ./src/providers/structured.test.ts ./src/benchmarks/authorization-dsl/inquiry-run.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts ./src/adapters/bare-authorization.test.ts ./src/cli/authorization-ao.test.ts
bun run typecheck
bun ./results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/evaluate.ts replay
git diff --check
```

若当前PATH无Bun，使用既有 `C:/Users/14182/AppData/Roaming/npm/node_modules/bun/bin/bun.exe`，不安装第二运行时。

- [ ] AO replay只核对保留结果未变；新增mock恢复结果单列。新记录仅保存测试命令、结果、修复前后行为、相关提交与项目调用0；实际USD/真人收益不作新增结论。
- [x] 更新已有文档中受影响的参数/行为，运行现有文档单测，不新建长期组件文档。
- [x] 向 `D:\skill优化\conversation_log.md` 追加简短阶段记录。
- [ ] 仅提交本任务文件，推送用户 `origin/skill-ir-aot`，核对远端。SSH不可用可用既有gh认证的HTTPS方式，不修改持久远端配置或打印凭据。
- [ ] 最终报告列出：修了什么、反例如何恢复、验证结果、是否仍有工程阻塞、SHA及工作区状态。完成后停止，不启动新研究任务。

AP4有限验证：指定五文件加原provider两个回归及inquiry-tools，共44 pass/0 fail、201断言/8文件；主typecheck exit0，AO evaluate replay重现56行/104映射且provider0；现有文档单测12/12，diff --check通过。AO结果目录git diff为空；独立default只读探子按具体函数/行号核验无阻塞。未扩展历史审计或付费实验。

## 验收清单

- 模型可见数组限制和本地数组限制一致，真实归档的9/10动作错误有对应通用回归。
- 既有fallback能看到具体字段诊断；成功/失败/超时的调用与输出如实保留。
- 总24工具预算内最终check可用，不牺牲原来的只读、路径和源码限制。
- AO 32条质量行、8作者、8消费、8源skill的历史结果不变。
- 工程测试、类型检查及选定离线重放通过，提交发布到用户主开发分支。
- 不宣称本轮已提高语义质量；领域取证调度、分支求值与结论核验继续由父线程讨论。
