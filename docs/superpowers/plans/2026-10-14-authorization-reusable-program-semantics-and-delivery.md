# BL0–BL21：可复用自动程序、变化试算与可靠交付

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking. 用户已经授权连续开发、常规修复、官方账号实验及发布；不在例行阶段重新请求确认。

**Goal:** 让隔离作者从完整原 skill、自然任务和允许源码，生成能处理声明范围内变化输入的同一个程序；在普通入口实际试算、修稿，并可靠交付原四问的回答。先补当前版本选择、根对象查询、排序和外部参数表达的共享缺口，再用固定自动原稿检验实际消费与成本。

**Architecture:** 复用现有 `resourceWorkflow`、输入绑定、渐进编译、program/patch/details、账号与 structured 宿主、来源失效和 previous。新增轻量的可复用编写目标、按当前 revision 的有界试算及答案生命周期；同一共享内核服务模型工具、普通入口和研究脚本。源码含义仍由模型阅读并编写，宿主执行机械运算和诊断，不从评价器填入正确程序。

**Tech Stack:** TypeScript、Bun、Zod、现有有限表达式/资源求值器、PowerShell 示例、官方 Codex account adapter；不引入另一套 CLI、语言分析器或展示系统。

**状态：** 2026-10-14 计划就绪，待新线程实施。本文件尚无 BL 实现或效果证据。

| 项目 | 本轮约定 |
|---|---|
| identity | `authorization-reusable-program-v1` |
| 已核对生产基线 | `02b79e4b8a9b1f0622b203858d06eea721214485`；接管时另记计划提交后的 HEAD |
| 开发模型 | 用户指定 `gpt-6-astra`，reasoning `high` |
| 实验模型 | 已授权官方账号 `gpt-5.6-sol/high`；第三方 API 继续暂停 |
| 分支与发布 | 原 `skill-ir-aot`，仅用户 `origin`；不创建分支/worktree |
| 工作量 | 参考 8–12 小时实质开发；不等待、重复审计或反复抽样凑时间 |
| 方法入口 | spec §14.51、研究 §7.73；研究结论只维护既有研究总文档 |

## 一、接管顺序和本轮要解决的事实

主代理亲自阅读以下基础，不让探子替代设计上下文：

1. `D:/skill优化/AGENTS.md`、仓库 `AGENTS.md`、[当前状态](../../skill-ir/current-status.md)、本任务书。
2. [spec](../../skill-ir/skill-ir-aot-optimization-spec.md) §14.50–§14.51；[研究正文](../../skill-ir/skill-dsl-research.md) §1、§7.72–§7.73、§11。
3. [Download 普通说明](../../../examples/authorization-assessment/download-workflow/README.md)、[使用说明](../../usage.md)中的 edit/consume/account 部分、开发指南的对应模块。
4. BK 的 `summary.json`、`quality.json`、`comparison.json`、`authoring/automatic-program.json`、`evaluation/answers/A0-scope-feedback-turn-3.txt`，均位于 `results/skill-ir/skill-dsl-research/development/authorization-recoverable-authoring-v1/`。只按需读取实际事件。
5. 本地 `D:/skill优化/project-maintenance/bk-review-20261014-2557eba0/review.md`、`verification.json`。它们用于开发诊断，不进入实验模型上下文；缺本地副本时依以上仓库证据恢复，不停工等待。

发布后复核已跑 105 项定向测试、667 断言，以及默认、空版本、拒绝三次普通零模型运行。三次都返回相同文档11且为 conditional。BK 的原矩阵为值7/14、有限行为5/14；这解释了“能够执行，但自动程序还不能承担变化输入”。本轮不重跑全历史审计。

### 已确认的关键问题

| 问题 | 现有证据与代码位置 | 本轮责任 |
|---|---|---|
| 把当前样例当作完整适用范围 | A0末答以当前 fixture 没有显式 version 为由停止，随后自然说明又准确描述其它版本分支；`program-authoring-context.ts` 的 `authoredScope` 主要是文字反馈 | 将可复用编写目标和当前执行实例分开，让变化试算进入普通编写过程 |
| 外部参数形状不一致 | 模型稿传 actor/object、`perms/obj`，给定事实使用标识、`permission/resource`；`resource-relations.ts` 精确匹配后得到 unknown | 展示字段、类型和对象路径差异；由模型按源码/显式事实写投影，不能自动同名授权 |
| 有序选择与根查询遗漏 | `select` 默认 unique；已有 `unique:false`、null排序、有限转换和条件算子，原稿没有完整使用；root关系缺失后直接回退，漏按root标识查询 | 明确已有操作语义，先做匿名反例；作者从源码补关系，不能靠增加通用语言语义替代接线 |
| 修稿说明覆盖任务回答 | BK A1首答有实质内容，后续只剩反馈说明；账号最终 text 取末回合，structured 也有最后 final 覆盖路径 | 分离修稿回合与任务交付，保留版本依据和原始每回合文本 |
| 消费仍重新探索且更贵 | BK两对质量持平，C input分别约2.15倍、2.46倍；C1重复展示源码59,275bytes | 在真实发送层定位重复，再做有损风险可核对的状态增量/按需详情；实际tokens另测 |

这几项不是五套新框架。优先把现有程序与工具接通；新字段、工具和文件只承载当前确实缺少的责任。

## 二、实现合同

### 2.1 可复用目标与渐进执行共存

- 继续接受局部可执行草稿，允许当场试算。`conditional` 不阻止保存、展示、修稿或诊断性消费。
- 普通 edit 目标可显式选择 `current-input` 或 `reusable`；BL作者使用 reusable。旧调用默认兼容，不暗中改变其它工作流。
- 可复用目标来自用户任务/本轮编写请求，不从当前 fixture 是否包含某个值推断。识别输入维度、分支来源及适用范围的工作由作者阅读源码完成。
- 复用当前 `scope`、`sourceDeclarations`、步骤引用和 `gaps`。只增加必要的目标/覆盖摘要；不要把每个源码 anchor 变成必须填满的字段清单。
- 一个建议的共享反馈形状如下；实现可复用已有等价类型，但必须保留这些区分：

```ts
type AuthoringCoverageItem = {
  id: string;
  source: { path: string; startLine: number; endLine?: number };
  stepIds: string[];
  disposition: "implemented" | "unwritten" | "external";
  reason?: string;
};
type AuthoringTarget = {
  mode: "current-input" | "reusable";
  coverage: AuthoringCoverageItem[];
};
```

这是源码覆盖的作者声明及机械引用检查，不是源码等价证明。空表、自称 implemented、当前场景通过都不能自动获得“可复用完整”评价。未执行分支可以保留，但必须可见；真实环境外部条件单列，源内可写关系不能仅因当前输入没触发就称外部条件。

### 2.2 当前程序的有界试算

在既有 program 工具族增加 `authorization_program_trial`，普通本地运行和 structured/account 共用实现。拟定请求：

```json
{
  "expectedRevision": "current-program-revision",
  "cases": [
    { "id": "case-a", "resourceInputs": {}, "externalAssumptions": [] }
  ]
}
```

- 每次1–4个场景，单个场景沿现有大小/表达式上限；不接受 `expected`、正确答案、评价标签或参考程序。
- 一项场景消耗一个现有工具预算单位，批量不是免费扩充预算。回复只给当前revision、实际步骤/返回/终止/条件/具名差异，过长内容通过现有details读取。试算事实沿现有合同标为未审阅输入；模型自拟的外部grant不变成已验证事实，不能借试算取得主任务授权结论。
- 输入限定在当前合同的同一 operation；不得借trial替换scope、政策、源码或source hash。旧revision、过期来源、缺候选、跨operation均产生明确诊断。
- 使用 `compileExecutableContract` 已核验的当前源码与候选、`executeResourceWorkflow` 同核执行；不直接绕过编译器执行任意 raw。可复用已验证源材料，避免每个case重读全仓。
- trial是试算，不改活动输入、持久程序、previous、check/verdict或默认结果。源码变化仍依当前失效规则处理。渐进坏步骤保持其控制影响。
- 主代理编写的匿名测试用于确定性实现；真实作者可见development场景只有事实和实际执行反馈。独立评阅的期望结果始终在评价侧。

### 2.3 外部事实、选择和未决条件

- 外部调用继续按明确名称和完整实参绑定。反馈区分无此事实、同名但键/类型/值不匹配、多条相冲突事实、明确false。诊断展示必要字段路径，避免重复打印整份大型对象。
- 允许模型用已有表达式显式提取标识/字段；禁止按 `has_perm` 名称、同样数字、近似字段名或忽略对象差异自动采用grant。
- `select` 的唯一查找与排序后首项语义要在工具广告、实际反馈和示例中一致。优先复用 `unique:false`、显式order及null规则；若确需新语法，保持旧默认并通过匿名反例论证。
- 当前已走路径的执行条件、未走分支的覆盖缺口、完整请求授权证明分列。未走分支不凭空污染已确定的局部值；仍可能影响当前路径的未知guard不得被移除。显示 `conditional` 时指出条件究竟来自哪一层。

### 2.4 可靠最终交付

- 保存 `firstAnswer`、每回合原文、每版程序和最终交付来源。宿主显式区分修稿阶段与任务回答阶段，不按文本长短或“预算”关键词挑最好答案。
- 最终回答绑定当前任务、来源、输入与程序revision。修稿说明不覆盖仍然有效的任务回答；依据变化后，旧回答标 stale，在原预算内安排至多一次明确的最终回答阶段。
- 不能取历史高分首答冒充新稿终答。没预算或通道没交付时，展示已有答及 stale/缺失原因，保留最终未交付。
- account 与 structured 使用同一继续/交付决定，保留既有 text/result 兼容和原始最后消息供诊断。修复不能增加finalOnly后的空回合，不能恢复别的消费者答案。

### 2.5 不增加另一套协议负担

先统计实际重复的状态/源码/工具描述字节和每轮provider usage，再选一处共享减负。保留原skill、四问、所有与本任务有关的规则、来源和备选分支；状态可以用revision增量和details读回。字段字节量只用于定位，不换算成精确token，也不把所有重读都认定为浪费。full默认保持；本轮不再设完整compact新面板。

## 三、代码责任和必需反例

| 责任 | 主要位置（相对仓库） |
|---|---|
| 目标、覆盖和作者继续 | `src/task-dsl/authorization/program-authoring-context.ts` 及测试；必要时新增轻量 `program-coverage.ts`/测试 |
| 试算共享核 | 新增 `src/task-dsl/authorization/program-trial.ts`/测试；复用 `executable-contract.ts`、`resource-relations.ts`、`program-input-binding.ts` |
| 草稿与原子修改 | `resource-program-draft.ts`/测试；新可选元数据须贯穿raw/canonical/patch/reuse，不得在strict解析中悄悄丢失 |
| 模型工具和普通入口 | `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts`、`inquiry-native.ts`、`inquiry-wire.ts`、`inquiry-run.ts`、`inquiry-local.ts`，以及 `executable-contract-entrypoints.test.ts` |
| 最终回答生命周期 | 上述run/local及 `src/adapters/codex-account.ts` 的 `runCodexAccountInquiry`；复用 `src/adapters/codex-account-session.ts` 的回合原文，必要时新增小型 `program-delivery.ts`/测试 |
| 消费和传输 | `program-consumption-context.ts`/测试、`inquiry-context.ts`/测试；只有已定位的重复路径才修改 |
| 实际示例 | `examples/authorization-assessment/download-workflow/`；ShareLink只做离线共享能力检验 |
| 本轮薄研究调度 | `results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/`，复用生产入口，禁止另写一套语义执行器 |

至少覆盖这些有区分力的反例：

1. 相同外部名称，正确标识与完整对象的差异可诊断，false不被当unknown或true；另一对象/权限不能借用grant。
2. 多个合法记录的有序首项、唯一查找冲突、null排序、相同排序值的第二键；不同ID和数组排列仍按程序语义选取。
3. 根关系为空但可按root标识查到对象；查不到时才走有来源的回退。fixture若违反领域不变量，先具名为不适用，不能猜期望。
4. reusable目标下，当前输入未触发某源码分支，该分支仍在覆盖待办；current-input旧模式兼容。
5. trial多场景不改变活动输入/previous；旧revision/来源变化、缺draft、跨operation、超case数或超预算均有具名结果。
6. 有效片段可试算；未知/无效guard仍阻挡受它控制的return，不能因局部执行就报完整授权。
7. patch省略元数据保留、显式清除/替换按合同、坏patch原子回滚；恢复后仍识别同一目标。
8. 首答后无程序变化的反馈不抹掉交付；程序/source/input变化后旧答失效；finalOnly停止；最终阶段失败不伪造新答。
9. 独立消费者看不到作者答案/另一消费者答案；自然补答没有改变程序时，程序行为分数保持原样。
10. 发送减负后，分支规则、外部条件与剩余原任务仍可获取；机械字节下降和provider token分别记录。

## 四、执行队列

### BL0 — 接管与责任登记

- [ ] 读启动文件，核对branch/HEAD/origin和现有线程。主开发线程是唯一代码、共享文档和Git写者；只读探子按AGENTS使用。
- [ ] 保留当前 `.tmp/` 及其他原有文件，不借本轮做清理。新建本identity状态、用途登记和验证入口；不复制整套历史证据。
- [ ] 记录工程、实际自动程序、四问质量、收益四个轴，尚未运行项不能写true。

### BL1 — 建立共享失败测试

- [ ] 按第二、三节将外部参数、排序、trial隔离和末答覆盖拆成匿名失败测试，确认真实红因。
- [ ] 保存BK原参数的零调用诊断映射；旧源码/原稿/答案不改写，开发参考程序不成为自动验收件。

### BL2 — 修外部参数反馈和选择合同

- [ ] 实现字段/类型/身份不匹配诊断和准确的false/unknown区分，保留精确绑定。
- [ ] 同步select广告与执行语义，验证排序/唯一性反例；已有算子足够时不新造操作。
- [ ] 聚焦测试转绿后提交一份共享修复；不因测试数增加宣称自动稿已修好。

### BL3 — 接通可复用作者目标

- [ ] 在现有配置/作者反馈中加入可复用意图，覆盖声明及source/step关系采用现有资料；缺内容可渐进补齐。
- [ ] 分开当前执行、源内未编码、外部条件和证明缺口。不再以fixture没给某值作为可复用完成理由。
- [ ] 原子patch、序列化、恢复和普通edit均保持目标；匿名旧接口兼容通过。

### BL4 — 实现同核trial

- [ ] 实现第二节的有界试算、revision/来源检查、同operation和预算计量。
- [ ] 复用当前编译环境，不重复索引全仓，不写活动输入。每项失败与实际执行都能通过details定位。
- [ ] 无expected参数，研究脚本仅调用公共函数。

### BL5 — 接通account、structured和普通入口

- [ ] 工具广告、解析、native dispatch、structured program action及本地入口共用trial和作者反馈。
- [ ] 匿名双入口测试走 source-read → program → trial → patch → trial，而不是只直接调用求值器。
- [ ] 证明试算不会隐式授权run目标代码，不会绕过源码失效；目标执行保持0。

### BL6 — 修最终交付生命周期

- [ ] 按2.4实现修稿与任务回答分轨，保留原回合及依据；必要的最终回答阶段共享原预算。
- [ ] 用A1实际快照派生复核加匿名红绿，证明反馈不再静默覆盖答复，同时不挑历史高分。
- [ ] account/structured、持久恢复、finalOnly和中断分别验证一次；不再做全历史账号审计。

### BL7 — 薄研究入口与早期A0准备

- [ ] 提供 `status`、`offline`、`run <purpose> <attempt>`、`summarize`、`verify`，所有运行调用普通production路径。
- [ ] 模型allowlist与evaluator目录分开。开发者任务书、BK原稿、历史答案、评阅、修复解释不进入作者。
- [ ] 启动前一次确定性检查确认工具确实可用、请求输入无oracle；不额外付费做健康探针。

### BL8 — A0：独立编写、试算与当场修稿

- [ ] 从无稿开始，完整skill/四问/源码/current事实和reusable目标交给官方实验模型。第一次可执行程序立即保存并试算，不等一切证明完整。
- [ ] 作者可读取development变体事实并调用trial，依据自身程序实际行为及源码修订；宿主不给期望文件、正确guard或参考步骤。
- [ ] 最多两次有实质待办的同线程继续，沿原总预算；不能因模型说“无补丁可做”就忽略可见未编码责任，也不能无进展重复continue。
- [ ] 保存首稿、修后稿、首次/最终答与实际trial使用。出现共享错误立即按第五节修；不要先把已知坏接口跑满。

### BL9 — 当前原稿的行为矩阵

- [ ] 对A0链当前模型原字节跑既有14场景；另加有源码依据的root查询命中、标识重命名/排列变化及明确false/未提供事实的反例。
- [ ] development可见输入与评价专用输入分开登记；后者不称prospective或独立held-out，不能用评阅期望来修作者。
- [ ] 分列字段值、对象身份、选择/拒绝/终止、剩余条件、完整请求证明。自述覆盖不替代独立源码核验。

### BL10 — 修共享缺口并取得一次采用确认

- [ ] 将每个差异归到工具接口、执行语义、来源缺失、模型编写或任务外事实；找到现成算子能表达的情形就改反馈/调用接线，不扩语言全谱。
- [ ] 每个新共享根因先红绿修复，再用受影响原提案零调用确认；确需模型确认时只增加一次具名修复attempt，首次失败保留。
- [ ] 仅模型语义遗漏时，用剩余作者预算请求读相应允许源码和实际trial，不手写patch，不把eval expected搬进反馈。同因第二次无改善后转向尚可推进的独立责任。

### BL11 — 量化并减少重复上下文

- [ ] 从本轮实际发送原件定位重复源码、全状态和工具广告。沿已有byte meter和provider usage分别汇总，组件token没有来源就unknown。
- [ ] 至少处理一个有证据且可无损读回的共享重复点；如果不存在安全有效的重复点，记录具体观察，不制造压缩率。
- [ ] 保留四问、完整skill、适用范围及备选关系；新增delta失配时可显式full读回。确定性保真检查后再进入消费epoch。

### BL12 — A1：不同起点的独立作者

- [ ] A0已有可执行稿且接口稳定时，从空版本事实无稿开始；看不到A0稿/对话/评价。
- [ ] 使用同一reusable目标和trial能力，首稿/修稿分存；同样检查其默认与变化分支，不能用A1最好稿替换A0首稿统计。
- [ ] 没有A0产物时先处理BL10，不派第二作者碰运气；有限修复耗尽后具名记录A1依赖不足。

### BL13 — 消费产物选择和分母固定

- [ ] C0前一次选定A0链最新可运行、具有当前源码依据的模型原稿；局部可运行也可诊断消费，不要求整题full。
- [ ] 保存原字节和已有revision/source绑定；不增设另一层冻结系统。C0/C1使用同稿，A1/S0不得替换它。
- [ ] 程序没有产生就没有可解释的消费比较，记录原因，不以BK/BG/开发者稿补位。

### BL14 — C0/B0、B1/C1两对实际消费

- [ ] 顺序C0→B0、B1→C1，分别默认和空版本。同代码epoch、模型、完整skill/四问、源码/事实、总预算。
- [ ] C普通consume/full，禁止program/patch；B无给定程序但源码工具相同。C1可以previous恢复C0合格程序和源码材料，当前输入重新计算，旧答案不进入上下文。
- [ ] 核对程序确实被调用及其结果被怎样使用；自然纠错单列。最终交付、四问质量、input/cache/output/时间/工具全部报告。
- [ ] C比B多了作者预处理，归为整条工作流比较；作者/修订费用单列，不归因成纯DSL语法优势。

### BL15 — C2拒绝消费与变化失效

- [ ] 同一固定稿用明确拒绝事实进行一次真实消费；区分精确false、参数不匹配和真正未知。无匹配事实时保留条件，不能硬报授权通过或拒绝。
- [ ] 原稿在默认/空版本/拒绝及一个新标识变体中fresh/previous零调用一致；搬移后来源、输入和结果仍可追溯。
- [ ] 源码副本改变一个决定性条件，旧相关结果撤回、无关材料可保留；不改原source。

### BL16 — S0：当前稿的源码变化维护

- [ ] 有可恢复A0原稿时，执行一次S0实际edit；只看变化源码、自身原稿和当前诊断，模型自行修订。
- [ ] 比较修前/修后及至少一个未改变输入场景，避免单点补丁破坏其它分支；S0不替换消费稿。
- [ ] 没有稿或通道暂停则具名未运行，先完成同责任的匿名/离线失效验证，不伪造模型维护结果。

### BL17 — 第二结构和公共可用性

- [ ] ShareLink仅离线验证同一trial、目标、外部事实、修稿与交付状态，加入匿名不同对象/不同operation反例。
- [ ] 不按Download/ShareLink名称编写成功路径，不重新获取skill、不追加第二项目付费面板。
- [ ] 普通目录内验证可搬移原稿运行/查看/变化输入；清除本轮重复实现，核心只保留一套。

### BL18 — 用户可运行交付

- [ ] 更新Download现有run.ps1/README：一条默认当前自动稿命令及输入变化命令；失败保留真实退出码，不自动换开发者参考稿。
- [ ] `execution.md`展示来源读取、自动首稿、实际trial、patch、最终程序逐步计算、自然答和具名限制，细日志在旁边JSON/原件。
- [ ] 新自动稿未产出时明确示例仍用BK历史稿，不把历史默认刷新称本轮完成。不制作HTML或新CLI层。

### BL19 — 评价与完整工作流成本

- [ ] 独立评阅原四问，按盲化臂标签/源码依据裁定；最终答、首答、修后、模型原稿/开发者诊断分别记账。
- [ ] 两对报告positive/tradeoff/negative/inconclusive和逐字段差异；两对不足以证明普适稳定性。只有质量不退且存在实测收益时才支持本例收益。
- [ ] input已含cache时不重复加，记录作者+修稿+维护+消费成本。provider未报USD继续unknown；已知tokens可报告观察的摊销条件，不能称实际美元或真人节省。

### BL20 — 联合验证、文档一致性和研究复盘

- [ ] 运行相关联合测试、主/本轮研究类型、文档单测、改动文件链接和零调用重放；旧全src104失败及历史JSON断链不作为本轮全仓绿色声明。
- [ ] 研究§7.73记录根因—修复—实际采用—结果，并更新§1/§11；同步spec14.51/current-status/plan/usage/developer-guide和本地日志。
- [ ] 检查current-status、plan和handoff不再同时写“已完成/待实施”；当前状态简短，逐次调用留本轮results。无需全仓文档治理。

### BL21 — 发布和最终交接

- [ ] 分目的提交实现/证据/文档，只推用户origin/skill-ir-aot并核对live SHA。保护原件、`.tmp/`、其它线程和历史未跟踪内容。
- [ ] 给当前自动稿公开运行命令、实际默认与变化输出；逐项回答“是否自动写出、程序处理了哪些分支、哪些仍由自然回答补、成本怎样”。
- [ ] 适用工作及失败处置全部终结才收束；工程完成、有限队列结束、自动可复用主链与研究效果分别判定，未达项写到具体模块/原件/下一责任。

## 五、失败处理、真实用途与预算

八个首用途：A0、A1、C0、B0、B1、C1、C2、S0。它们解决不同责任，不是重复抽签。A0/A1各最多两次有据自身稿继续；最终回答阶段占用这项用途剩余窗口和预算，不能在外面另开免费回合。每次program/trial/patch按实际工具和case计数。

每位置初始64工具单位、32MiB实际读源、768KiB源码显示、45分钟会话窗口，沿已有设置；一项trial场景一单位。同用途继续不重置。确有截断证据需调整时先同步合同/两臂预算，而不是放宽来掩盖接口错误。新增不同共享缺陷各最多一次具名真实确认，全轮最多三次此类额外确认；超过后仍修工程、做离线验证，保留实际采用未确认，不自动扩样。

每次表现不好先当场查看真实输入/工具/结果：

1. **共享实现错误：** 暂停受同错误影响的位置，红测→修复→原提案零调用验证→必要的一次具名真实确认。不要跑满已知坏面板。
2. **源内语义遗漏：** 在当前作者剩余预算内反馈实际轨迹、待读源码和未完成范围；不喂期望答案。程序事实和作者推断分开。消费者没有改稿权，其自然纠错是观察，不能改写固定稿。
3. **合理外部未知：** 给出具名条件及影响，继续无依赖责任；不为了拿到绿色填写true。
4. **通道问题：** 先保存原生命周期、部分usage和稿件。旧BJ R0/BK C2记录不覆盖、不重发；本地工具宿主关闭且有界只读核查后可隔离，独立授权用途可继续。新额度/认证立即暂停；一次有据通道修复后同因再次失败则暂停该通道，推进离线责任。
5. **质量或成本负向：** 保留首件和完整分母，定位机制责任。不能删除失败、换输入/名字重跑到只留成功，也不为追时长追加面板。

如果真实采用没有发生，给出“模型读到什么→提交什么→宿主采用什么→实际返回什么”的具体链。首轮partial不是自动停工条件；已定位且在授权范围的共享修复、输入变化、失效和交付责任应继续完成。

## 六、模型材料隔离与研究边界

完整原skill沿 `authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/`，Download允许源码沿 `authorization-interprocedural-property-v1/model/packages/download/source/`，ref `126ec414a8b65158368653a2604ae58415e43103`，沿当前allowedPaths。原四问保持：

- `requested-document-and-returned-file`
- `authorization-and-selection-order`
- `alternate-version-authorized-resource`
- `missing-facts-and-conditional-conclusions`

本任务书中的正确分支描述属于开发诊断，不把任务书原文发送给作者。作者只收原skill/任务、允许源码、明确输入事实、可复用意图、公共操作合同、自身程序与真实运行反馈。历史答案、评阅、参考程序和评价期望隔离；模型可根据源文提出自己的覆盖列表。任何开发者含义注入另标developer-assisted，不计自动成功。

本轮研究目标是这一个已暴露任务中的可复用自动程序与真实消费。ShareLink仅离线工程迁移；不读取held-out/Q1 reserve、不新增prospective，不改变旧readiness/历史0-of-6。目标源码只读，有限DSL解释不执行目标应用或业务API。完整授权证明、程序值、自然源码质量分别评价，不通过放松guard把unknown改成checked。

## 七、验证命令和验收

工作目录 `D:/skill优化/SkVM`。新增两个小模块后，最小实现验证命令为：

```powershell
bun test ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/resource-program-draft.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-trial.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts --timeout=15000
bun test ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account-recovery.test.ts ./src/benchmarks/authorization-dsl/inquiry-run.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts --timeout=15000
bun run typecheck
bun test ./results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/study.test.ts
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/tsconfig.json
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

若复用现有文件承载责任而未新建建议模块，先更新本表/命令为实际路径。失败要核实内容与环境，不能以无关旧失败掩盖本轮回归，也不为固定测试总数重跑。

| 验收轴 | 本轮要看到的交付 |
|---|---|
| 公共工程 | 两宿主均能目标→写稿→trial→patch→trial→最终答；反例通过，来源和预算有效 |
| 真实自动编写 | A0从无稿产出模型原字节，实际调用trial并修订；首次/修后原件完整，没有手工语义回填 |
| 可复用程序 | 同稿覆盖源文内声明范围；默认、空/显式/非法版本、查询/回退、排序、拒绝及未知有独立逐案判据；未实现处逐项可见 |
| 可靠交付 | 原四问的最终回答可定位到当前依据，修稿 chatter 不抹答；缺交付不由历史高分填补 |
| 实际使用/修改 | 两输入真实消费、拒绝消费、当前输入重算；源码变化撤回及一次模型修稿分别留证 |
| 效果 | 两对同条件逐题质量和实际usage/耗时，作者成本分账；结果可为负向，不能保证预定正向 |
| 普通用户成果 | 一条命令运行当前自动稿，能看逐步结果、变化输入与剩余条件；出处和状态清楚 |

参考工作分配：前约2–3小时修共性接口及交付，随后约3–5小时交错进行真实作者、定向修复和变化检查，最后约2–4小时消费、失效、减负验证及交付。实际按依赖和证据推进，不强制等满时间；有尚可完成的独立责任时不因一个模型位置失败而提前结束整轮。
