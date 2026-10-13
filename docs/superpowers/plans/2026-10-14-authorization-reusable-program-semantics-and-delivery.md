# BL0–BL21：可复用自动程序、变化试算与可靠交付

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking. 用户已经授权连续开发、常规修复、官方账号实验及发布；不在例行阶段重新请求确认。

**Goal:** 让隔离作者从完整原 skill、自然任务和允许源码，生成能处理声明范围内变化输入的同一个程序；在普通入口实际试算、修稿，并可靠交付原四问的回答。先补当前版本选择、根对象查询、排序和外部参数表达的共享缺口，再用固定自动原稿检验实际消费与成本。

**Architecture:** 复用现有 `resourceWorkflow`、输入绑定、渐进编译、program/patch/details、账号与 structured 宿主、来源失效和 previous。新增轻量的可复用编写目标、按当前 revision 的有界试算及答案生命周期；同一共享内核服务模型工具、普通入口和研究脚本。源码含义仍由模型阅读并编写，宿主执行机械运算和诊断，不从评价器填入正确程序。

**Tech Stack:** TypeScript、Bun、Zod、现有有限表达式/资源求值器、PowerShell 示例、官方 Codex account adapter；不引入另一套 CLI、语言分析器或展示系统。

**状态：** 2026-10-14 从 b516e106 接管，共享实现至34ae933e，联合169测试/1136断言通过。八用途/14观察turn已处置，7用途交付；C2预算失败只读确认interrupted，原记录保留。A0/A1首稿0/18、最终15/18，两对比较negative，S0维护三输入符合源码。适用工程/有限队列完成，完整自动范围/研究收益未达，最终发布核验中；详见status/summary/execution。

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

- [x] 读启动文件，核对branch/HEAD/origin和现有线程。HEAD/live origin均b516e106，父线程idle；本线程唯一写者，两个窄只读探子仅定位接口。
- [x] 保留当前 `.tmp/` 及其他原有文件，新建本identity状态、用途与预算登记；研究验证入口在BL7补齐。
- [x] 记录工程、实际自动程序、四问质量、收益四个轴，尚未运行项保持false。

### BL1 — 建立共享失败测试

- [x] 外部参数/排序、trial隔离、目标保留、末答覆盖均先观察匿名红因后实现；严格trial额外字段异常由独立核验复现后修复。
- [x] 保存BK原参数的零调用诊断映射（bk-parameter-diagnostic.json）；旧源码/原稿/答案不改写，不作为编译器验收或自动成功。

### BL2 — 修外部参数反馈和选择合同

- [x] 实现字段/类型/身份不匹配诊断和准确的false/unknown区分，保留精确绑定。三项新增红测确认后12测试/65断言通过。
- [x] 同步select广告与执行语义，验证排序/唯一性反例；已有算子足够，不新增操作。
- [x] 1c6a5072已提交共享诊断；不宣称自动稿已修好。

### BL3 — 接通可复用作者目标

- [x] authoringTarget与--authoring-target=reusable接入，覆盖source/step声明保持unreviewed。
- [x] 当前执行、未编码coverage、external和proof分组；未走分支不污染当前确定值。
- [x] 原子patch、序列化/恢复和普通edit保持目标，旧默认current-input兼容。

### BL4 — 实现同核trial

- [x] 当前候选revision、同operation、1–4case、每case一单位及来源读预算已实现。
- [x] 每批每引用文件只验证一次后复用compiler；活动输入不变，trialCaseId详情需精确draft revision，过期来源拒绝。
- [x] strict schema不收expected，runProgramTrial为公共同核函数；研究入口在BL7调用生产链。

### BL5 — 接通account、structured和普通入口

- [x] 工具广告、解析、native dispatch、structured action和普通入口共享实现；执行记录保留trial。
- [x] 匿名双入口read→program→trial→patch→trial通过，2case计2单位，活动7与trial19/23/31隔离。
- [x] 沿现有source-only compiler，来源变化拒绝并撤回当前资格；目标执行0。

### BL6 — 修最终交付生命周期

- [x] 三阶段及task/source/input/program摘要接入双宿主；最多一次明确final-answer，保留firstAnswer/原始末消息。
- [x] BK A1真实第二回合确有program变化；零调用派生复核保留首答为stale、finalOnly不再追加，未把历史首答升级为当前成功。见verification/bk-a1-delivery-replay.json。
- [x] account/structured和finalOnly状态机、持久恢复已定向验证；新增最终phase本身interrupted/unknown普通run→inspect 2测试18断言，stale首答保留且无第四次调用，不再做全历史审计。

### BL7 — 薄研究入口与早期A0准备

- [x] 本identity study.ts提供上述命令及prepare/preflight/freeze；模型运行只调executeLocalInquiryRun，离线只调check/compare。
- [x] 作者输入仅四问/原skill/允许源码/current事实及四组development事实；evaluation和其他作者资料隔离。18场景矩阵另列可见与评价专用development，非held-out。
- [x] 一次preflight确认95文件、13工具（含trial）、四组事实无expected，provider=0；研究类型与1测试/44断言通过。

### BL8 — A0：独立编写、试算与当场修稿

- [x] A0-first无稿启动，完整skill/原四问/源码/事实；每次模型原提案即时checkpoint，首稿和最终14步稿分存。
- [x] A0实际2批trial，输入来自development事实；无评价期望或开发者步骤注入。
- [x] 原预算内2次作者继续，随后一次明确最终答阶段；四turn均完成且本地关闭，未重发。
- [x] 首答/修稿文本/最终答及trial完整留存。最终delivery=current；原始模型语义仍待18场景核验。

### BL9 — 当前原稿的行为矩阵

- [x] A0首稿和固定最终原字节分别重放18场景：首稿0/18，最终raw-specific字段映射后15/18，literal shape仍2/18；新增四场景全部留原始轨迹。
- [x] 矩阵登记4个作者可见事实与评价专用development，不称held-out/prospective，不向作者回灌expected。
- [x] 字段值/拒绝/条件分评；非法版本、跨根版本和缺constructor条件失败。原稿自报覆盖未升级为证明，完整请求仍未认证。

### BL10 — 修共享缺口并取得一次采用确认

- [x] 三项有限失败归为模型编写遗漏：非法/跨根版本缺拒绝guard，constructor完成条件未编码。现有guard/external已能表达；ORM身份及查询观察保留有限事实边界，不扩大语言。
- [x] strict trial和重复字段引用碰撞均有独立反例红绿确认；实际提案零调用重放保持原语义。额外模型修复attempt为0；三个模型遗漏不伪称共享修复。
- [x] A0/A1各用完两次自身稿继续，仍有遗漏；不再追加同因重抽、不手写patch、不喂expected，推进固定稿消费和维护。

### BL11 — 量化并减少重复上下文

- [x] accounting.json累计八实际运行的发送samples、source/state/schema/skill字节、重复字节及provider usage；input含cache，组件token未知。多turn meter为累计，新发送字节不等于provider内部历史重放。
- [x] 同响应顶层与executableContract重复草稿字段改为带SHA的同响应引用；A0实际4turn响应零调用重放完全还原，共少333568字节，不声称token/耗时收益。
- [x] full默认及原四问/skill/范围/备选关系不变；引用原值就在同响应，原始归档与details仍保留。引用形状碰撞反例红绿通过，消费前固定代码epoch。

### BL12 — A1：不同起点的独立作者

- [x] A1从空版本事实独立无稿开始，未暴露A0材料；四turn已交付当前答案。
- [x] 一批trial、首稿/最终18步稿分存；矩阵首稿0/18、最终15/18，未替换A0选择或分母。
- [x] 依赖满足：A0已产出可运行稿；无产物分支不适用，不存在碰运气补位。

### BL13 — 消费产物选择和分母固定

- [x] C0前选定A0-first最终14步原稿，SHA600aa500…，普通check/inspect已有当前来源和局部执行。
- [x] frozen-selection保留已有revision/session及原字节SHA；A1/S0不替换，后续C0/C1共用。
- [x] A0确有当前自动原稿；未产出分支不适用，未使用历史/开发者稿补位。

### BL14 — C0/B0、B1/C1两对实际消费

- [x] C0→B0、B1→C1全部完成，同source tree561d1501、输入/来源/模型/skill/四问/预算，绑定核验通过。
- [x] C无program/patch；C1恢复5材料而实际使用0，answerReused=false，固定14步稿重算12/original。
- [x] 实际declare/check与结果使用、当前交付、四问质量、usage/耗时/工具分存；两对四问均full，C输入4.63/5.23倍且输出/耗时更高，均negative。
- [x] 工作流比较包含作者预处理差异，A0/A1/S0成本独立分账，不称纯语法或去重的因果收益。

### BL15 — C2拒绝消费与变化失效

- [x] C2真实固定稿精确false命中并guard拒绝；模型耗尽64工具未交付，四题unanswered。只读核查interrupted，原unavailable/部分usage保留，不重发；不是完整交付成功。
- [x] 默认/空版本/拒绝/renamed-and-reordered在搬移副本fresh/previous零调用相同，answerReused=false，来源/输入/结果可追溯。
- [x] 副本views.py权限条件反转，previous撤回旧return，原source字节未变；见verification/source-change.json。

### BL16 — S0：当前稿的源码变化维护

- [x] S0一次实际edit，模型1patch并提交有效14步稿，1批4case trial，单turn/current答案。
- [x] 三组原输入不变，旧稿撤回；修后默认/空版本拒绝、原denied到11/archive，符合源码反转；固定消费SHA未变。
- [x] 本轮依赖可用并已运行；无稿/暂停分支不适用，维护不等于补齐原三个遗漏。

### BL17 — 第二结构和公共可用性

- [x] ShareLink离线公用runtime验证target/trial/patch；明确false拒绝、不同对象参数错配、无事实unknown、不同operation拒绝；交付current→stale→current。1测试10断言，无模型和目标写入。
- [x] 核心无技能名成功分支；第二结构仅developer-assisted离线工程证据，无新skill获取或付费面板。
- [x] 普通目录三次run/inspect及搬移fresh/previous四输入通过；研究包装共用生产check/runtime，不增加语义执行器。

### BL18 — 用户可运行交付

- [x] run.ps1默认本轮A0固定稿，author请求reusable；默认/空/拒绝命令exit0且inspect验证，失败仍保留真实退出码，无参考稿替换。
- [x] 本轮execution.md已展示读取/首稿/trial/patch/14步计算/首终答/三项缺口；后续真实比较完成后补齐成本和质量终态。
- [x] 新A0原稿已产出，历史fallback分支不适用；README明确分开BL当前与BK历史，无HTML或新CLI层。

### BL19 — 评价与完整工作流成本

- [x] 全部答案经盲评及主代理出处裁定，原评阅自身的错路径/推断和裁定理由留存。7交付用途四问full，C2四题unanswered；首答/原稿单列。
- [x] 两对negative，字段差异及同条件绑定在comparison.json；不能推广两对、不能宣称正向收益。
- [x] known input21097032含cache19419008/output106101，作者/维护/消费分账；C2最终usage及USD/开发探子/真人未知。无观测消费节省，不能计算正摊销阈值。

### BL20 — 联合验证、文档一致性和研究复盘

- [x] 169联合/1136断言、主与最终研究类型、3研究/58断言、15文档测试通过；39当前新增/修改链接0错误，八archive关闭核验、所有零调用重放通过。旧全src104失败及历史JSON不称本轮全仓绿色。
- [x] 研究§1/§7.73/§11、spec14.51/current-status/plan/usage/developer-guide、execution和本地日志同步实际结果、成本及未达责任。
- [x] 当前入口/计划/交接改为实际收束与待发布，旧计划/中途记录标历史；不扩全文档治理。

### BL21 — 发布和最终交接

- [ ] 分目的提交实现/证据/文档，只推用户origin/skill-ir-aot并核对live SHA。保护原件、`.tmp/`、其它线程和历史未跟踪内容。
- [x] 当前示例命令/14步过程、默认/空/拒绝实际值、15/18未达项、自然答与程序区分、两对负向及费用分账已公开。
- [x] 八用途及C2失败处置终结，无活动；工程/有限队列true，完整自动范围/研究false。下一责任明确指向遗漏guard/constructor、材料实际采用和预算内自然交付，不追加抽样。

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
