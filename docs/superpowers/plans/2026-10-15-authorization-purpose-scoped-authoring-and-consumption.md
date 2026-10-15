# BN0–BN19：聚焦修稿、按用途消费与执行语义闭环

> **执行者：** 新线程使用 `gpt-6-astra/high`，按 `superpowers:executing-plans` 逐项推进；实现使用 systematic-debugging、test-driven-development 和 verification-before-completion。用户已授权开发、提交和推送以及当前官方账号实验，常规阶段连续执行。子代理仅做 AGENTS 允许的独立只读探索，主线程负责设计、代码、裁定和发布。

**Goal：** 让模型把当前可执行程序的剩余源码分支真正写进去，使普通消费者直接使用当前程序与必要源码，在保留原 skill 全部问题的前提下减少重复状态和重复推导；交付一份可运行、可复查且效果有实际计量的有限任务程序。

**Architecture：** 保留现有 resource workflow、source snapshot、draft/patch/trial、两种宿主入口、账户生命周期与普通 CLI。调整的是作者工作前沿、按用途选择的工具/提示、状态增量与最终交接。既有 `directed` 显式模式承载新流程；`full` 默认及严格性质分析入口保持兼容。源码含义由模型判断，宿主处理位置、版本、执行和失效，不再堆通用语言语义。

**Tech Stack：** TypeScript、Bun、Zod、现有源码索引与官方 Codex account adapter；开发 `gpt-6-astra/high`，实验沿用已授权官方 `gpt-5.6-sol/high`。第三方 API 暂停。

日期：2026-10-15。规划基线：`a1ea1f3ca26b8f5ee4b088c359eefbbb442d7beb`。新 identity：`authorization-purpose-scoped-program-v1`。状态：`in-progress`。BN0–BN9 工程已通过离线验证并发布662b9c0c；BN10 A0已完成冻结，BN11以后继续。实际接管 HEAD 为 `1b95fa964647b5b41572c7ce0e5b5a883c595aae`。约 8–12 小时为实质工作窗口，提前完成可交付，不等待、重复审计或重复抽样凑时长。

## 一、接管上下文

1. 读外层与仓库 AGENTS、[当前状态](../../skill-ir/current-status.md)，核对 Git。继续 `skill-ir-aot`，只推用户 `origin`；不新建分支/worktree，不处理原有 `.tmp/`。
2. 完整读本任务书、[spec §14.53](../../skill-ir/skill-ir-aot-optimization-spec.md#1453-bn-purpose-scoped-authoring-and-consumption)及[研究 §7.75](../../skill-ir/skill-dsl-research.md#775-bm-复核与-bn-聚焦修稿和消费线路调整)。BM 合同、结果保持历史，不向 BM 追加实验行。
3. 读 [BM execution](../../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/execution.md)、[comparison](../../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/evaluation/comparison.json)、[attempts](../../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/attempts.json)及[普通示例](../../../examples/authorization-assessment/download-workflow/README.md)。按需读原始模型输入/工具回包/自动稿，不通读所有历史结果。
4. 实验仍用完整 `cloudflare-security-audit` 原 skill、Paperless 固定源码及原四问。开发者可读评价器；实验进程仅访问允许的源码、原任务、当前输入和自己生成的程序。任务书的缺陷分析、开发者参考程序、历史答案、评分和场景期望不能进入模型工作区或提示。
5. 本线程独占当前生产实现、方法文档及 Git 写入；其他原有变更逐项保留。日志按阶段追加外层 `conversation_log.md`，长期复盘只追加研究总文档。

## 二、BM 复核：已知事实与待验证解释

| 实际事实 | BN 要解决的责任 |
|---|---|
| A0 修订仍为 BL 14 步原字节，字段映射 15/18；A1 新稿 12 步，14/18 | 自动程序已能产生结果，剩余问题是拒绝、初始化、短路及 A1 root 回退，不从“无执行器”重新出发 |
| A0/recovered-author 在 b5448641；首轮 edit 指令修复在其后的 2c618b0f，A1 才实际使用 | 修复版尚未重新验证 A0 修稿；不能把 A0 旧失败归因于最终新指令 |
| 当前 ordinary 默认返回 11/archive；非法版本无文件返回；no-external 仍漏 constructor 条件 | 正常值、正确拒绝、必要前提、调用顺序分别验收，保留旧 conditional 状态与分数 |
| 已读完整函数全部生成候选；A0 修复末端 214 项仍 unmapped，作者声明常用宽区间 | 先筛选和分页当前程序相关候选；宽区间可帮助定位，不能直接当成逐分支证明 |
| sourceObligations 与 feedbackGroups.sourceCandidates 重复投影；firstBlocker 不采用候选 | 有大量待办，但没有稳定的单项修稿责任；要形成实际 edit→trial→review 循环 |
| C0 19 次 search、19 次 read、1 次 prepare、3 次 declare、2 次 check，未请求 program details | 当前程序消费还混入旧性质构造职责；工具、初始提示和宿主调度需按用途一致 |
| C0 的 44 个发送回包中，sourceIndex 累计约 363,509 序列化字节、sourceWindows 259,954 字节 | 真正的发送增量优先处理不断增长的索引和窗口，不凭报告大小猜 token 来源 |
| C/B 同期 P/P/F/P；input 2,335,871/611,051，output 11,070/8,124 | 已知 input 比为 3.82；fresh input 约 3.33 倍，缓存不能解释全部差距 |
| C0 无工具子回合重新启动，未 resume 原线程；C0 耗时有离线检查并行负载 | 不误诊为收尾继承全部历史；检查重建包是否漏掉决定性材料，下一配对避免 CPU 干扰 |
| S0 实际自动补出非法/跨根版本 guard；匿名执行测试可表达初始化与短路 | 现有操作有表达能力；先修作者采用和消费线路，新增语法需由真实反例证明必要 |

上述字节按实际事件反序列化后紧凑 JSON 重编码统计，用于定位字段，既不是 tokenizer 结果，也不是各组件的因果成本。BM 旧分母和原件保持。2026-10-15 主线程新鲜复核：58 项相关测试/387 断言通过；普通零模型 default、invalid-version、no-external 三项重现，未运行模型。

## 三、交付目标与方法选择

### 3.1 这次继续做什么

- **程序完成：** A0 在最终修复版和新流程中修订既有自动稿，A1 从空稿独立编写。模型自行决定源码意义、表达式和试算输入，开发者不代写最终稿。
- **实际使用：** 固定 A0 原稿处理普通、变化及拒绝输入，能看到选择、拒绝、跳过和条件的真实过程。语义不完整的局部稿仍可做有标记诊断消费，缺稿不拿 A1、S0 或开发者稿替补 A0。
- **消费减负：** 将“执行/解释已有程序”从“重新建立性质分析”中分开。仍允许读完整原源码，保留原四问和其余 skill 职责。减少工作来自宿主分工和信息传递，而非禁止核验。
- **效果：** 同期比较普通源码基线与程序消费，逐题评价质量，记录完整 input、cache、output、耗时及作者/维护成本。正向结果必须由真实使用支持。

### 3.2 不扩大工作面

本轮不扩语言、框架、外部 skill、未见样本或 CLI 平台；ShareLink 只做既有材料的离线接口迁移。无新增来源抓取或 live target 执行。完整 skill 和四问继续作为整题分母；局部程序质量另列，不能用一问替换整题。

### 3.3 共享接口约定

在现有显式 directed 模式内，按 `programMode` 派生用途，不再新造多个平行策略名。需要新增小类型时，应能归入现有组件：

```ts
type ProgramPurpose = "author" | "consume";
type AuthorStage = "locate" | "edit" | "trial" | "review" | "answer";
type EvidenceDelta = {
  basisRevision: string;
  sequence: number;
  added: Array<{ id: string; path: string; startLine: number; endLine: number; sha256: string }>;
  removedIds: string[];
  totalCount: number;
};
```

用途源于用户操作；stage 源于真实草稿/试算进度；源码选择源于程序引用、明确问题范围和已读依赖。任何字段都不能根据 evaluator 的正确答案计算。引用失败返回可恢复诊断；未发送的文本不许伪装成模型已读。将旧大结果留在宿主和原始归档，普通回包只带当前责任及变化，详情仍可取回。

## 四、代码责任图

| 责任 | 优先修改位置 | 定向测试 |
|---|---|---|
| 来源候选的范围、分组与映射 | `src/task-dsl/authorization/program-obligations.ts`、`program-coverage.ts` | `program-obligations.test.ts`、`program-coverage.test.ts` |
| 作者进展、当前修稿项与 trial 反馈 | `src/task-dsl/authorization/program-authoring-context.ts` | `program-authoring-context.test.ts` |
| 用途、静态工具表和两宿主接线 | `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-local.ts`、`src/adapters/codex-account.ts` | 现有 inquiry/native、account 定向测试 |
| 源码窗口、索引增量与可恢复详情 | `src/benchmarks/authorization-dsl/inquiry-context.ts`、`program-consumption-context.ts` | `inquiry-context.test.ts`、`program-consumption-context.test.ts` |
| 执行、外部调用顺序和失效 | `src/task-dsl/authorization/resource-relations.ts`、`program-outcome.ts`及其现有执行依赖 | 先定位已有 resource/program 测试，扩匿名正反例 |
| 当前依据及无工具收尾 | `program-delivery.ts`、两宿主已有 finalContext 路径 | `program-delivery.test.ts`、`codex-account.test.ts` |
| 普通演示、研究驱动和评价 | `examples/authorization-assessment/download-workflow/`、新 identity 结果目录 | 新 `study.test.ts`，复用 BM 驱动而不改 BM |

只有职责无法由这些组件清楚承载时才加小模块，禁止复制一套 runtime。实现前亲读将修改的完整函数及调用者。代码文件以仓库当前实际路径为准，先定位再编辑，不能根据历史行号猜接口。

## 五、执行队列

### BN0 接管与有限基线

- [x] 核对分支、HEAD、工作树及本机是否有活动模型用途。保留 BM 原件、`.tmp/` 和旧未知。
- [x] 在新结果目录登记当前 epoch、假设、用途、评价分母与原件位置。没有模型调用就不填写真实效果。
- [x] 直接复用本轮复核已确认的 BM 事实；只对影响修改的代码做定点检查，不再全量重放历史。

### BN1 还原实际成本链

- [x] 从 BM C0/B0 的 `raw/account-turn-1.json` 中读取真正发出的 client contentItems，分别统计工具表、提示、回包、最终交接及按字段字节。输出小型 `baseline-wire.json`，不复制一份巨型原件。
- [x] 将 sourceIndex 全量增长、窗口变化、重复引用与 legacy 属性调用逐项定位到代码。当前 guidance 分支与普通 state 分支分开；不要把通用分支的行为套到 C0。
- [x] 给出本轮具体修改预期及可失败判据：实际 currentContext 的增长应与本次新增材料相关，而非每读一段便重发历史目录；效果由后续真实 pair 决定。

### BN2 先把行为评价补到执行轨迹

- [x] 新建 evaluation-only `behavior-assessment.ts` 与 `study.test.ts`，保留 BM 的 literal/semantic-field 两种旧口径，另加 strict trace 轴。
- [x] 写匿名正反测试：initializer 在 owner 短路前被执行；owner/null-owner 不调用 permission query；non-owner 精确调用；false 停止；缺 initializer 留条件；非法/错误父资源有明确拒绝；拒绝后无文件选择/return；root fallback 与 nulls-last 排序保持。
- [x] 对错误程序也要断言失败，不能只检验参考程序自身。例如：

```ts
const executed = (events: Array<{ op: string; outcome: string; inputs?: any }>) =>
  events.filter(e => e.op === "external" && e.outcome !== "skipped");
// 测试夹具使用匿名 init/check 名称；正确轨迹与旧式无条件 check 分别验证。
expect(executed(ownerTrace).map(e => e.inputs.name)).toEqual(["init"]);
expect(executed(nonOwnerTrace).map(e => e.inputs.name)).toEqual(["init", "check"]);
expect(deniedTrace.some(e => e.op === "return" && e.outcome === "computed")).toBe(false);
```

- [x] 先确认红测失败原因，再修必要的通用执行缺陷；如果执行器已有能力，就只补评价和作者接线，不编造新语法。评价器的具体期望不发送给作者。

### BN3 按用途接通真实工具表和初始提示

- [x] 为现有 `directed + edit/consume` 路径确定一个共享用途函数，两入口都调用。作者使用 source、program、patch、trial、details；消费者使用 source、程序当前结果/详情与正常交付。
- [x] 对只要求消费有限程序的用途，去掉强制重新 `prepare_properties → declare → check_properties` 的隐式任务；严格性质功能留在现有显式研究/严格入口。若内部仍需任务 ID/operation 元数据，从原声明机械保留，不生成授权结论。
- [x] 给程序路径使用专门的传输说明，移除不适用的 `propertyDemand.frontier` 提示。源码、原 skill 和全部问题都在，原严格路径的工具与行为仍兼容。
- [x] 红测检查**实际 thread/start 工具表及实际首 prompt**，不是只检查一个配置对象：consume 无草稿写工具/隐式性质构造，edit 首轮明确交付程序，普通 full 不变。fake transport 与 structured 入口均覆盖。

### BN4 来源候选变成相关、可读回的工作前沿

- [x] 已读函数候选按当前程序引用及已知依赖、原任务范围分组；无证据相关的已读函数留目录可取回，不自动塞进当前修稿项。空稿先让模型选择实际相关函数，不能按 Paperless/函数名白名单判相关。
- [x] sourceObligations 保存一份，回包只显示当前小组、数量和可读回目录。宽 source 区间显示“包含哪些候选”，exact span 映射继续独立、unreviewed；不以区间包含关系自动消除缺口。
- [x] 选择当前责任的顺序为输入/编译根因、当前执行缺口、当前函数候选、其余声明。无法确定语义时允许模型说明待查来源，不能把未处理候选标成完成。
- [x] 测试加入大量已读无关函数，当前反馈大小不随之线性增长；真实相关外部调用和错误出口仍可进入工作前沿。删除 coverage 不会让候选消失，旧来源不继续映射。

### BN5 持久的 edit→trial→review 循环

- [x] 复用 createProgramAuthorLoop，保存当前函数/责任、依据 revision、proposal/patch/trial 事实和最近一次明确进展。新增 sourceCandidates 本身不算修稿进展。
- [x] 已有稿先 inspect/试算当前稿，空稿在读到当前完整相关函数后提交局部稿。把早期提醒改成可观察阶段：有稿未修→edit，修改后未试算→trial，有实际 trial→review。未读必要源码时仍能读取；禁止通过要求填未知语义来凑 patch。
- [x] 在既有总预算内为 patch/trial 和最终交付保留动作；若连续读取已读无关内容而无编辑进展，明确交接到当前责任。必须利用已有已知终态续作机制，不能在未知/活动请求上开新回合；不要仅增加一段“请尽快修改”的提示就宣布完成。
- [x] 先用 fake model 行为测试模拟：宽读取→检查点→patch→trial→修订→任务答案；另测一直不提交、合法 no-change、缺源码、未知终态及预算耗尽。无实质进展最多一次纠偏，保留失败而不无限继续。

### BN6 源码目录和窗口的真正增量

- [x] 在当前 encoder/投影内实现按稳定 evidence ID 与 basis 的增量目录；初始发送当前所需来源，后续只发新增/撤回项，数量及详情入口始终可见。
- [x] 源码工具已返回的窗口不再自动附赠整份增长中的 sourceWindows；新相关窗口可以显式发送，旧内容按 ID 从当前宿主读回。先测回包“源文本”和“源索引”各自大小，不只压缩 archive。
- [x] 同一依据重复序列化后，sourceIndex 的新增集必须为空；添加一个 evidence 只增一个；来源变更撤回旧项；新账户子会话必须重新给自包含当前材料，不能引用前一线程未见的 contextSequence。
- [x] 可实现确定性差分核心并在调用处复用：

```ts
function changedById<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const old = new Map(before.map(x => [x.id, JSON.stringify(x)]));
  const current = new Set(after.map(x => x.id));
  return {
    added: after.filter(x => old.get(x.id) !== JSON.stringify(x)),
    removedIds: before.filter(x => !current.has(x.id)).map(x => x.id),
    totalCount: after.length,
  };
}
```

- [x] 将实际发送包还原成与全量相同的目录/当前依据；保留 full/compact 兼容测试。只有离线字节下降时仍标工程量测，模型 token 尚待真实调用。

### BN7 消费内容：计算结果、规则和剩余工作各司其职

- [x] 默认给当前值/拒绝/条件、采用的来源及局部范围、关键分支摘要和原四问。当前程序未覆盖的上游权限与外部完成事实仍明确展示。
- [x] 原四问不必每轮整段复制；首 prompt 和最终交接完整出现，中间用当前问题 ID/原文可取回。未触发分支在详情中可见，空版本、错误版本和源码变化不能被单一当前返回值遮住。
- [x] 不允许用“请信任程序”掩盖错稿。源码仍可读取；模型发现程序不符时报告冲突，consume 不静默修稿，产生单列修稿请求。
- [x] 测试值正确但前提缺失、旧程序 basis、不存在的 details ID、改变输入而沿用旧结果及未覆盖问题。任何一种都不能升级认证。

### BN8 最终交接保真

- [x] 检查实际 tools=[] 子回合的输入，不假设它继承历史。保存本用途已读来源索引、当前程序与输入、实际依赖/条件、模型已有问题结论及其出处、剩余缺口；每项区分模型观点与宿主计算。
- [x] 用四问 task ID 管理交付，最终包不得在截断时静默丢掉一问的唯一出处；预算不足时列出未交接材料并允许如实未完成。不得从 evaluation/旧答案补内容。
- [x] 测试两个传输入口、工具中断确认、无确认、暂态 retry notice、输入变化令旧答 stale。保留 BM 的 known terminal 与同用途预算规则，无新增恢复风暴。

### BN9 两入口集成与离线迁移

- [x] 通过 ordinary inquiry 和 account adapter 的 fake transport 完整走 source→program/patch→trial→consume→final；检查实际 tools、prompt、回包和费用归属。
- [x] 用已有 ShareLink 材料做匿名接口迁移，证明用途投影、增量、拒绝及失效没有按 Download 名字特判。零模型、零目标执行。
- [x] 跑受影响生产测试和主类型检查，保存一次结果。通过后提交工程，再开始有限实验；不要求全仓旧冻结证据重新全绿。


工程记录：受影响生产回归 184 项/1613 断言通过；末次 sourceDeclarations 引用修正及实际发送包测试后，定向 13 项/125 断言通过。主/研究类型检查、文档 15 项及 ShareLink 零模型迁移通过。账户会话采用稳定 ID 增量；结构化入口是无历史的单次请求，保持自包含快照，不能据此宣称增量 token 收益。完整技能、原四问、候选目录、同用途预算及原始失败保留。

### BN10 A0 真实修订当前自动稿

- [x] 使用新 identity，读取 BM 固定 A0 原稿原字节、当前允许源码、原四问、普通输入和新作者流程。这是独立新用途，不能改 BM 原件或谎称恢复其旧终态。
- [x] 观察真实 patch/trial。首次出现共享接口故障立即停受影响派发，定位、红绿修复并登记 epoch，再做一次具名确认；不要先跑完整队列。
- [x] 作者只看到自己的试算实际输出，不看到 evaluator 正确值/失败场景清单。冻结其最终原稿供消费，记录首稿、每次修改、最终稿、未修改 no-change。

### BN11 A1 从空稿的独立作者

- [ ] 同源码/skill/四问与同总预算，以空稿从零开始；不提供 A0、S0、历史答案或开发者程序。
- [ ] 检查首个 proposal、首个可执行稿、patch、trial 的真实时点。A1 原稿独立评价，不替换 A0 为消费选择。
- [ ] 若新流程仍只给自然答案而没写稿，归到自动编写未达，不以“功能已实现”结案；只允许有具体共享修改后的具名确认。

### BN12 原稿的完整有限语义检查

- [ ] A0/A1 分别运行原 18 development 输入，另列 BN2 的初始化/短路/拒绝后续动作 trace 检查和重命名/无关记录变换。保留字面输出、复核字段映射与严格轨迹三轴。
- [ ] 将源码评阅与机器结果逐项绑定。字段改名映射只能对应原表达式，不补缺值或条件；不修改历史 evaluator 使新稿过关。
- [ ] 若作者稿不完整，保留诊断消费资格但不宣称可复用完整程序；后续成本按相同质量口径评价。

### BN13 第一对真实 B0/C0

- [ ] 先 B0 后 C0，固定同一生产 epoch、完整原 skill、原四问、源码、输入、模型、努力级别与总预算。两个用途串行，暂停 CPU 重的离线检查。
- [ ] B0 是源码自然基线，保留相同来源访问、普通 skill 引用和交付支持；C0 增加固定 A0 程序及新用途消费。完整代码/prose 预处理差异和作者成本单列，这是整套程序工作流比较。
- [ ] 真实记录 program execution 与材料使用、按需 details、重复读区间、工具种类、实际发送字节及 token。没有 program tool 调用不直接判“未使用”，依据宿主执行和交付事实。
- [ ] 逐字评阅四问，重点核对排序、初始化、owner 短路、上游权限与当前程序冲突。第一次错误当场排查；语义意见只有回到源码才可改评。

### BN14 首对后的修复与有限确认

- [ ] 若结果负向，先查真实发送和动作分布。只有可定位、可实施的共享修复才派发一对新的 B1/C1；两臂都在新 epoch 重跑，原首对完整保留。不得只重跑 C 与旧 B 配。
- [ ] 若首对质量保持且成本下降，可用反序 C1/B1 确认，仍只一对，换空版本输入但保留全部原问题。
- [ ] 若同因已经一次共享修复仍无改善，停止该比较方式。继续普通使用、维护和交付，不追加幸运样本。

### BN15 拒绝消费与源码维护

- [ ] C2 用固定 A0 稿和明确拒绝输入，检验不会返回文件且原四问仍有最终交付。
- [ ] S0 对现有已暴露的源码副本权限条件变更做一次真实修稿：先撤回旧依据，再由模型读实际 diff/source 并修订；不提供正确 guard。用保留原/变输入离线检查。
- [ ] S0 原稿单列，不替换 A0；若作者同时修好其它分支，额外改善可记观察，但不回填 A0 成绩。

### BN16 普通使用和可移植交付

- [ ] 更新现有 Download README/run.ps1，保持参数和默认兼容。新的自动稿只有实际通过对应有限语义验收后才更新示例默认；否则给显式命令和准确缺口，不把开发者参考偷偷变默认。
- [ ] 普通运行输出当前结果、逐步过程、所用源码/程序版本、缺口与四问交付。说明何时只需改输入重跑，何时源码变化需要模型修稿。
- [ ] 搬移一次当前会话/程序副本做零调用 current→changed→stale/repair 检查；不用全量临时 worktree/archive 审计。

### BN17 效果判断和后续分支

- [ ] 分别回答：执行器可表达吗、作者实际写出了吗、自动稿有限行为正确吗、消费者用了什么、完整四问质量怎样、成本是否降低。列首件/修订，未知/未运行保留分母。
- [ ] 本轮有界研究目标的完整验收同时要求：A0和独立A1均通过预先登记的有限行为及轨迹要求；固定A0普通/变化/拒绝消费可交付；源码变化正确失效及修订；同期完整四问达到逐题full，并取得下条的两对有界正向观察。任何一项未达就分轴报告，不能靠降低问题分母或将conditional统一改名完成验收。外部事实未知但表述准确的条件答案可以full。
- [ ] 至少一对质量无退化且 input/output 中至少一项下降、其余开销逐项公开，才能称局部取舍或初步收益；只有同类改动在两对均质量保持且总 observed input+output 更低，才写“两对有界正向观察”。这仍不是跨任务泛化。
- [ ] 作者/维护成本分别报告；若单次消费更贵，不计算正的 break-even。若更便宜，用同口径 token 给出条件摊销区间，USD 和真人分钟未知则保持未知。
- [ ] 若修稿已有实质改善而消费仍负向，将可运行程序保留为显式分析辅助，并停止继续堆消费摘要。若自动作者在有具体修复后仍补不齐当前有限语义，交付需审阅的作者流程与剩余缺口，下一步由用户决定任务范围，不再自动开一轮相同实验。

### BN18 文档收口与精简

- [ ] 研究只追加总文档 §7.75；同步 current-status、spec§14.53、当前 plan、usage、developer guide 中实际受影响入口。不新增长期结果 Markdown。
- [ ] 当前状态与研究开头、当前计划及导航表必须一致，修复“正文已完成/开头尚未实施”的矛盾；BM 原任务书和结果不重写。
- [ ] 旧阶段长说明保留历史定位，普通示例优先当前步骤，将重复历史命令归入已有历史章节/链接，避免新使用者先读多轮实验日志。

### BN19 最终验证与发布

- [ ] 按实际修改范围跑一次联合回归、主/研究 typecheck、文档单测和当前修改链接检查，失败按根因修复后仅复跑相关项。旧全 src 104 失败、十处历史链接缺档不写成已修。
- [ ] 零模型复算当前报告和实际发送统计，核对原稿/首失败没有覆盖。账户工具与研究原件不包含凭据，不读取 key 文本。
- [ ] 仅提交本轮文件，核对 diff 和实际 tracked 状态，推用户 `origin/skill-ir-aot` 并核对远端。最终报告同时给普通运行命令、实际值/拒绝/条件、自动稿来源和未达项。

## 六、真实用途、预算和恢复

| 用途 | 内容 | 进入条件 |
|---|---|---|
| A0 | 新流程修订 BM 固定 A0 | 工程/实际首 prompt 已验证 |
| A1 | 从空稿独立编写 | 同一已验证作者路径，无 A0 泄漏 |
| B0/C0 | 首对完整原任务 | C0 有本轮固定原稿；缺稿两者均不为凑数派发 |
| B1/C1 | 反序确认或共享修复后的成对确认 | 只按 BN14 执行一种，不叠加 |
| C2 | 明确拒绝输入消费 | 本轮固定原稿存在，可如实诊断 |
| S0 | 源码变化维护 | 本轮原稿可恢复；失败和缺稿如实记录 |

最多八个正常用途；额外最多两个具名共享修复用途，预留给 A0/A1/交付中真正发现的故障，不凑满。B1/C1 本身已是一对确认，不再另加修订 pair。每根因最多一次修后真实确认；语义难点先做零模型诊断再决定共享改动，不用重复提示重抽替代修复。

单用途沿现有上限：64 host 工具单位、786432 display bytes、33554432 read bytes、2700000ms 总 wall；所有作者继续和至多一个无工具最终子会话均共享此预算。应更早完成，不把上限当目标。预算与用途数量用于控制无效重复，不作为扩大事实主张的样本门槛。

遇到可修共享错误当场暂停受影响调用、记录最短反例、红绿修复、登记 epoch、定向确认，独立工作继续。quota/auth 立即暂停该通道；路由/传输故障一次有据恢复仍失败则暂停对应通道。unknown 不自动重发，旧请求按 BK 合同只读核查并隔离，新独立用途不冒充旧恢复。平台/宿主预算触发的已确认中断才按 BM 规则做同用途最终交接。

## 七、实际验证命令与交付格式

从仓库根执行，先用 `./` 明确测试路径，避免 Bun 将路径当筛选词：

```powershell
bun test ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-obligations.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/program-delivery.test.ts ./src/task-dsl/authorization/program-outcome.test.ts ./src/benchmarks/authorization-dsl/inquiry-context.test.ts ./src/adapters/codex-account.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
```

新 identity 内复用 BM 驱动约定，实现 `study.ts status/offline/summarize/verify`，研究类型配置包含实际导入；`status/offline/summarize/verify` 均零模型，真实派发由独立明确的用途命令完成，禁止 summarize 隐式补跑。结果集中放在 `results/skill-ir/skill-dsl-research/development/authorization-purpose-scoped-program-v1/`，只保留必要 compact 机器报告、原稿、评价和一份 `execution.md`，raw 按既有本地归档约定保存。

最终每轴记录 `engineeringComplete`、`automaticProgramComplete`、`ordinaryUseDelivered`、`wholeTaskQuality`、`benefitObserved`、`finiteQueueComplete`、`researchGoalAchieved` 的真实结果；布尔验收目标放独立 requirements，不把“要求通过”记成“实际通过”。没有正向结果也必须交付可运行现状、具名缺口及下一条可检验决定。
