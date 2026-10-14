# BM0–BM20：源码分支补齐、按职责消费与可靠交付

> 执行模型：`gpt-6-astra/high`。按顺序完成适用队列；执行时使用 executing-plans、systematic-debugging、test-driven-development 和 verification-before-completion。常规实现、验证和已授权实验无需再等确认。失败后先定位共享原因，当场修复并定向复验，再决定是否继续同类调用。

**Goal：** 让自动作者补全当前 Download 程序遗漏的拒绝分支和必要前提；让消费过程真正使用程序已计算的部分，同时保留原 skill 的全部四问；用同期对照判断是否减少重复工作。交付可运行程序、可读执行过程和真实收益结论，不预设正向结果。

**Architecture：** 复用现有 resource workflow、渐进草稿、trial、源码失效、账号 adapter 和普通入口。新增或合并实现源码义务候选、当前结果分层及显式 directed 消费投影。模型判断源码语义，宿主管理位置、引用、版本、执行和预算；不继续补通用 Python 解释器，不建立新的 CLI 或生产平台。

**Tech Stack：** TypeScript、Bun、Zod、现有源码索引、PowerShell 示例、官方 Codex 账号 adapter。开发使用 `gpt-6-astra/high`；实验固定已授权官方账号 `gpt-5.6-sol/high`，第三方 API 保持暂停。

日期：2026-10-14。新 identity：`authorization-branch-verified-consumption-v1`。规划基线：`cb8a721a7a1520ef90d1ec262391066ac9b1daac`。本计划登记时为 planned；未执行任何 BM 模型位置。

## 一、接管与阅读顺序

实施记录：BM0从30773a53接管，登录与本地进程已核验，六例普通零模型基线与BL一致；共享工程提交7c935ffe，身份、评价轴与预算已预登记；A0现已派发，其他用途待观察。185项定向回归、收尾补修90项回归、主/研究类型、15文档测试及ShareLink离线检查通过。

BM8协议细化：本机TurnStartParams没有dynamicTools覆盖，thread/resume不能改变工具哈希。预算预留阶段用宿主主动turn/interrupt结束工具阶段，必须观察服务器真实interrupted及本地closed，才允许同用途tools=[]子会话；原工具回合仍记录interrupted/undelivered，不伪称completed。普通中断、未知、错误或quota/auth不满足此条件。服务器自然completed沿原合同处理。该调整是实现真正工具隔离所必需的生命周期细节，匿名fake transport已分别验证确认和丢失确认；总预算、一次最终回合及B/C对称保持。

1. 阅读外层及仓库 AGENTS、[当前状态](../../skill-ir/current-status.md)，核对分支、工作树和最近提交。继续 `skill-ir-aot`，只推用户 origin，不建分支或 worktree，不处理原有 `.tmp/`。
2. 完整阅读本任务书、[spec §14.52](../../skill-ir/skill-ir-aot-optimization-spec.md#1452-bm-branch-completion-and-directed-consumption)、[研究 §7.74](../../skill-ir/skill-dsl-research.md#774-bl-复核与-bm-分支补齐和按职责消费)。BL §14.51/§7.73用于理解形成过程，当前方法以 BM 为准。
3. 阅读 [Download 普通示例](../../../examples/authorization-assessment/download-workflow/README.md) 与 BL 的 [summary](../../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)、[execution](../../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/execution.md)、[固定自动稿](../../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/authoring/automatic-program.json)。按需读取 BL 逐用途原件、场景和成本，不重跑历史全量审计。
4. 开发者可以读取 evaluator；实验作者和消费者的上下文、工作区和可用工具必须与 evaluator/历史答案隔离。开发提示里的具体修复判断不复制成实验答案。

开发线程是生产代码、研究方法、当前状态与 Git 的唯一写者。只读探子限于明确独立核验，按 AGENTS 的角色和等待规则运行。记录阶段日志到外层 conversation_log；跨线程决定同步 repo 文档。

## 二、已经核实的出发点

BM作者职责补修：A1-first在60工具后仍0程序/0trial，最终自然答已交付。离线实际首派发显示账号首指令仍是普通Task-answer，structured初始authorInstruction为空；两入口的编辑职责首轮缺位。新增共享INITIAL_PROGRAM_AUTHORING_INSTRUCTION，使edit首轮明确先编写/修订与试算，再交付全部原问题；不注入源码答案或额外预算。两入口红绿及7定向测试/79断言、研究类型通过。A1/initial-author-contract为第二个具名额外用途，固定A0不再改选。

BM首件处置：A0-first在60探索单位/49工具调用后由宿主确认中断，原14步未修改、0trial、无自然交付。真实日志中的willRetry=true重连提示被terminalError残留，错误地阻止已确认闭合后的final child；按服务器重试语义分离暂态与终态错误，原事件仍保留。现有12单位作者提醒原先跳过任何已有草稿，现扩展为提醒其inspect/trial/patch，仍只出现一次、不关闭工具、不提供语义答案。两处均有红绿复现，具名确认A0/recovered-author计入四额外用途额度，首件及费用不改写。

| BL 事实 | 本轮处理的责任 |
|---|---|
| A0/A1 最终各 15/18 有限行为匹配，A0 14 步 | 自动编写已经可以产生有用程序；补齐具体分支，不再从“程序完全建不起来”出发 |
| invalid-version、other-root-version 未显式拒绝 | 实际为 conditional/无返回，不能误写成越权返回；需要从源码读出拒绝出口并写入程序 |
| no-external 缺 constructor 完成条件 | `ObjectPermissionChecker(user)` 在 owner 分流前构造；owner 短路和未知初始化要分别表达 |
| owner/null-owner 路径仍无条件调用 has_perm | 检查外部调用的执行条件，不能用宽泛 gap 代替真实短路关系 |
| current/default 返回 11/archive，空 version 返回 12/original | 保留已有正确选择、root 回退、排序及源码变化能力，修新缺口不能损失旧行为 |
| 两对 C/B 四问质量相同，C input 为 4.63/5.23 倍 | 旧 full 消费的增加成本已可见；新消费必须改变重复信息和职责分工后再测 |
| C1 恢复 5 份材料、实际采用 0；宿主仍执行了程序 | 区分源码材料采用与程序执行，不能由 program tool 调用为 0 推出程序未使用 |
| C2 达到工具上限后没有自然交付 | final-only 必须落实为无工具的回答阶段，不能只给一句仍可忽略的提示 |

复核代码入口：`program-coverage.ts` 目前只检查作者自报覆盖与步骤引用；`program-authoring-context.ts` 因而看不到未申报的分支；`program-consumption-context.ts` 的 full 上下文投影保留报告，而 wire 层已有同回包引用去重；账号工具响应仍反复携带 currentContext；`program-delivery.ts` 的 finalOnly 条件阻止收尾，消费模式也缺少可靠收尾接线。开始修改前亲读当前实现，不能仅凭本段行号或历史结论写代码。

## 三、本轮目标与约束

- **自动程序轴：** A0 修订 BL 自动稿，A1 从空稿独立编写；保留首稿和每次 patch。先验证版本拒绝、跨根拒绝、初始化未知、owner 短路，再覆盖全部 18 个已暴露场景及独立的机械变化。不同来源的作者成果分列。
- **实际使用轴：** 同一固定 A0 程序处理原输入、空版本与拒绝输入，普通入口产出当前值、前提、缺口和原四问自然答复；源码变化后能失效并修订。未触发分支仍能在按需详情中查看。
- **效果轴：** 两对同期 B/C 使用同模型、原 skill、原四问、源码范围、输入和总预算。C 多拿到自动程序这一处理产物，评价的是“生成并消费程序”的整体效果，不把它解释为 DSL 语法单独的优势。作者、维护成本另列并计算有条件的摊销。
- **工程边界：** full 仍为默认；directed 显式启用。旧 compact、严格检查、保护输入、历史结果保持。当前求值不自动升级源码语义证明，不把 conditional 改名就当作成功。
- **实质窗口：** 按约 8–12 小时工作量组织工程和有限实验；提早完成可以交付，不睡眠、重复验证或重复抽样凑时间。遇到通道阻塞继续独立工程，真实未运行部分如实关闭。

## 四、实现约定

### 4.1 源码义务候选与渐进修稿

复用已读取源码的 skeleton/flow，提取分支出口、raise/错误出口、return、外部调用完成依赖的**候选位置**。不依靠函数名决定授权含义；不自动填 guard/principal/resource 或期望返回对象。调用存在也不意味着每次输入必须执行它。

可采用以下内部形状，字段名可按现有类型收敛；不能另造一套覆盖事实：

```ts
type ProgramObligation = {
  id: string;
  source: { path: string; startLine: number; endLine?: number };
  kind: "branch-exit" | "error-exit" | "return-exit" | "call-completion";
  origin: "source-structure" | "author";
  stepIds: string[];
  state: "unmapped" | "mapped-unreviewed" | "external" | "out-of-scope-unreviewed";
  reason?: string;
};
```

宿主候选与作者声明分别记录。作者映射不构成覆盖证明；不用名称/行号白名单把 Paperless 直接判正确。可执行局部继续执行，未映射候选可见，不强制整份先全绿才能试算。新增模块仅在既有文件无法承载清晰职责时使用。

### 4.2 当前结果与未覆盖范围分层

建议纯投影 `ProgramOutcomeView` 含 `execution`（computed/denied/conditional/unresolved）、当前值、实际需要的外部前提、当前执行缺口与程序覆盖缺口。旧 report/status 保留。

当前值有结果、存在其他分支缺口、源码语义尚未认证这三件事可以同时成立。实际路径缺必要前提时仍为 conditional；不得删除 gap 或注入 external=true 使结果变绿。`semanticSupport: unreviewed` 与 `requestOperationCertified: false` 保持真实含义。条件来自执行事件及已提交声明，不能用 evaluator 的正确答案补齐。

### 4.3 directed 消费和真实减负

通过现有 `--program-context` 增加显式 `directed` 模式。首次材料保留完整原问题、程序适用范围、当前执行结果及条件、相关规则/未触发分支摘要、源码引用和仍需分析的职责。后续工具回包发送变化部分和可取回的当前引用，避免每轮重发整份执行、输入集合及历史草稿。

不能只给“文件 11”这种单值摘要；版本、授权、fallback 等规则仍可按需取回，旧 compact 丢失反事实信息的教训要进入测试。不得禁止模型核验源码，也不把“请少读”当作已降低成本。若源码、输入或程序 revision 改变，撤回旧引用并重新交付相应内容。账号和 structured 接口同核，计量实际发出的内容。

### 4.4 可靠收尾

在原会话预算中保留一个最终回答机会，覆盖 edit 与 consume。工具额度耗尽后切换真正无工具的回答回合。当前 adapter 在 thread/start 注册 dynamicTools，resume 沿用原会话；先从本机协议能力及 fake transport 确认可用机制。若不能在同一会话变更工具表，允许在原回合已知完成后启动一个 tools=[] 的收尾子会话，归属同用途并共享原总预算，显式记录 thread lineage。它仅拿完整原问题、当前依据与必要可读材料，不做新取证、不拿评价答案、不充当额外独立样本。B/C采用相同收尾规则，不能把提示文字当工具隔离完成。

只在本地生命周期明确完成、剩余原 wall budget 足够时启动该回合；未知、正在运行、认证/额度拒绝不自动重发。最终答复使用当前 basis，旧 task answer 保留为 stale，不拿修改说明顶替答案。无工具阶段无工具预算可消耗，模型 token/时间和该回合仍全部计入原用途。

## 五、任务队列

### BM0 接管、身份和实际基线

- [x] 核对 Git/运行进程/账号本地状态，登记新 identity、实际实施 SHA 和现有未知请求隔离；不做额外模型健康探针。
- [x] 登记八用途、源码 allowlist、原四问、输入/预算/评价规则、实现 epoch；区分 required acceptance 与 observed result。
- [x] 仅复跑普通入口的 default、empty-version、invalid-version、other-root、denied、no-external 六个零调用案例，确认与 BL 原件一致。

### BM1 先写失败测试

- [x] 为三个已知缺口写来源明确的失败测试；使用匿名输入/源码结构，测试不能按 skill 名称分支。
- [x] 覆盖 owner 已放行时不调用 object grant、初始化未知仍保留前提、拒绝后没有文件步骤、旧正确版本选择保持。
- [x] 写 full 默认兼容、directed 规则可取回/引用失效、consume final-only 仍能回答、unknown 不重发的失败测试并确认失败原因。

测试表达的行为示例（以现有 fixture 构造器实现，不复制成生产特殊判断；下面的invalid-resource是测试guard显式声明的failure值，并非执行器推断的固定枚举）：

```ts
expect(obligations.some(o => o.kind === "error-exit" && o.state === "unmapped")).toBe(true);
expect(invalidVersion.termination).toBe("invalid-resource");
expect(invalidVersion.returned).toBeUndefined();
expect(missingInitialization.conditions.length + missingInitialization.gaps.length).toBeGreaterThan(0);
expect(ownerAllowed.events.find(e => e.id === "grant")?.outcome).toBe("skipped");
expect(outcome.value).toBeDefined();
expect(outcome.coverageGaps.length).toBeGreaterThan(0);
expect(outcome.requestOperationCertified).toBe(false);
expect(finalTurn.tools).toEqual([]);
expect(totalChargedTools).toBeLessThanOrEqual(64);
```

### BM2 源码候选接入作者循环

- [x] 修改 `src/task-dsl/authorization/program-coverage.ts`、`program-authoring-context.ts`，必要时新增 `program-obligations.ts` 及测试；从当前已读 skeleton/flow 接线，禁止新建第二套 parser。
- [x] 同时显示作者声明和源码候选；对删掉声明、重复映射、过时引用、未知外部含义给定点诊断。
- [x] 匿名分支/错误/return/外部调用及既有 ShareLink 离线结构验证同核；候选只辅助发现遗漏，不宣称完整控制流覆盖。

### BM3 trial 与针对性修复

- [x] 在既有 `program-trial.ts`、`resource-program-draft.ts` 和 context 接线中，让作者看到自己试算的实际输入、路径、返回/拒绝、未映射候选与执行缺口。
- [x] 允许作者根据源码选择变化输入；宿主可提供机械可复现的变异方式，不提供 oracle 返回值、正确程序或标准答案。
- [x] 一个缺口修好后重跑该反例和相邻已正确路径；patch 保留输入绑定、作者目标和无关步骤。只修回显而未变更程序不得记录为修稿成功。

### BM4 当前结果分层

- [x] 在 `resource-relations.ts` 的既有结果上增加纯投影，必要时新增 `program-outcome.ts` 与测试，不平行重写执行器。
- [x] 验证 computed value/拒绝/缺前提与 coverage gaps 可同时表达；旧 conditional 不由新标签静默提升为完整授权证明。
- [x] 从普通入口保存相同分层字段和可读步骤，不能只存在于研究 runner。

### BM5 输出含义与字段映射

- [x] 复用或补充轻量输出字段含义声明，使作者选择的 key 能和实际值/依据一起展示；不能靠 result/archive 等特定拼写评分。
- [x] 映射由作者提交或已有类型机械推导，保持 source-supported/unreviewed 区别；歧义和缺映射可诊断。
- [x] 对照 literal-shape、值匹配、有限行为匹配分别计数。不要用宽松字段匹配掩盖错误文档或错误分支。

### BM6 directed 按职责消费

- [x] 修改 `program-consumption-context.ts`、现有 inquiry/native/CLI context 解析，完整保留 full 和 compact。
- [x] 当前可计算部分给结构化结果、条件、规则与引用；其余四问职责保持可见。不得预写最终安全结论或强制模型信任未经语义核实的程序。
- [x] 验证默认/空版本/显式版本/拒绝/未知前提的规则取回，避免只在当前值上省上下文。

### BM7 跨回合增量与观测

- [x] 在真实账号工具响应装配处接线增量视图；BL 的同回包去重保留。必须核对最终发给模型的包，不能只量测未发送的中间对象。
- [x] 记录每回合源码读区间、重复读字节、规则/状态重复字节、按需详情次数、模型已知 input/cache/output 和 wall time。
- [x] 断线恢复/新会话无旧引用时发送必要基底；input/source/program 改变只失效受影响材料，不能返回旧结论。

### BM8 消费与编辑共同可靠收尾

- [x] 修 `program-delivery.ts` 及现有 `src/benchmarks/authorization-dsl` 账号接线、`src/adapters/codex-account-session.ts` 对应职责；先用 fake transport/已归档生命周期验证。
- [x] consume 在工具上限、修稿后、当前答案 stale 时均能进入至多一次无工具回答；保持原总时限和终态约束。
- [x] unknown/interrupted/额度拒绝不伪造完成；能留的自然文本照存，交付与程序正确性分别评价。

### BM9 普通入口集成与兼容

- [x] 零调用走通 prepare/check/run 的相关既有路径、draft/trial/details/restore 和显式 directed 参数，研究脚本不另写执行器。
- [x] 运行受影响回归、主类型和匿名多 operation 用例；修复与方法说明同步后提交共享实现，形成首个实验 epoch。

### BM10 最薄实验接线

- [x] 在 `results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/` 建立 manifest、status、attempts、评价及费用入口；复用既有研究库，只加必要编排。
- [x] `prepare/preflight/run/evaluate/replay/status` 需可恢复，具体脚本命令写进该目录 README。preflight 零模型，模型输入不包含 evaluator、正确 patch 或历史自然答案。
- [x] 检查 B/C 信息与预算可比、作者产物来源、当前程序固定规则、外部副作用隔离。禁止将评价器观察自动返回给仍在运行的同一实验臂。

### BM11 A0 自动修订并固定消费稿

- [ ] 从 BL A0 原字节出发，模型根据完整原 skill、任务、允许源码、新公共反馈和自己的 trial 修订；主代理不得编辑其字段。
- [x] 保存首件及每次 patch，在结束后用独立 evaluator 检查 18 旧场景及机械变化。首失败即读实际调用定位：共享缺陷先红绿修复，再登记修订用途；不先把已知坏配置的后续队列全部跑完。
- [x] 固定 A0 最终程序用于主消费。A0 是 model-repair-existing，不能记为从零独立编写。即使 A1更好也不择优替换 A0。

### BM12 A1 独立编写

- [x] 另一干净账号会话从空稿出发，信息和修订预算相同，不见 BL/A0 程序或评阅答案。
- [x] 独立评价，报告能否从零补齐相同分支。A1 成功/失败不改变 A0 消费分母。

### BM13 第一对 C0 → B0

- [x] C0 使用固定 A0 + directed，B0 使用完整原 skill、同输入/源码/四问、相同普通只读工具与总预算，不提供程序；相同实现 epoch。
- [x] 先看 C0 实际程序路径、自然答案、token 组成。若出现共享缺陷，当场修复，保留首件，后续对照使用清楚标记的 epoch；不能混成“同条件首对”。
- [x] 如 C0仍重复读/重做，先判断来源是缺规则、缺信任依据、传输重复或模型主动核实。不能用提高预算、删除原问题或隐藏条件取得节省。

### BM14 第二对 B1 → C1 及 C2 拒绝消费

- [ ] 第二对使用同固定稿和空版本输入，反转顺序；存在 BM13 共享修订时，两对分别报告实现版本，不能伪称同实现重复。
- [x] C2用明确拒绝输入测试程序停止和自然四问交付；这是交付验证，不拿无基线的位置宣称收益。
- [x] 首对已明确负向时，先完成有依据的共享修复，再跑第二对。没有可落实修改则第二对记 not-run-no-intervention，推进源码维护与工程交付，不重复已知负向方式凑数。

### BM15 S0 源码维护及离线第二结构

- [x] 在允许的源码副本上沿既有变化机制做一个预先登记的权限条件变化，旧结果失效，模型一次针对性修改后验证受影响场景及无关分支。
- [x] 同一共享逻辑在已有 ShareLink 离线材料检查绑定、拒绝、源码变化和 directed 详情；无需新增该任务真实模型位置。
- [x] 固定 A0原稿不被S0覆盖，源码副本不会执行目标业务。

### BM16 独立评价与总成本

- [x] 逐题评源码含义、条件精度、证据引用及遗漏；自然答案、可执行程序、有限场景行为、依赖失效各自评分。正确自然解释不能补上未改程序。
- [x] 评价“宣称没给外部事实”与输入实际是否给定一致，避免旧 rubric 对条件精度过宽。新增规则在首个 BM 模型调用前固定，不能按好坏改分母。
- [x] 输出 positive-observed / tradeoff / no-observed-difference / negative / inconclusive；两对有改善也只声称本轮 development 观察。
- [x] 计入作者、修订、维护、失败/未知、消费；cache只计一次。若每次消费成本仍不低于基线，摊销点记不存在或未建立。官方配额 tokens 不能换算成虚构 USD/真人分钟。

### BM17 普通使用交付

- [x] 更新既有 Download 示例与 run.ps1，使用户能选择固定自动稿、输入、directed/full，并看到当前值、实际拒绝、前提及剩余职责；不增加 HTML。
- [x] 默认示例使用哪份程序写清来源。新稿未改善时保留旧默认，新稿作为显式示例；开发者校正稿只供定位，不替换自动成果。
- [x] 零调用实跑 default、empty、invalid、cross-root、denied、no-external；保存相应 execution.md。搬移仅需验证本轮示例依赖，避免再造全仓档案。

### BM18 有限最终验证

- [x] 按下列起始命令运行新模块及受影响测试，再补实改路径；如合并模块，更新本节命令，不创建空测试凑清单。
- [x] 主/研究类型、研究 replay、文档与 diff 检查各一次；新失败定位修复后只重跑相关集合。旧全 src 104 失败保留，不为本轮去修改冻结锁。

```powershell
bun test ./src/task-dsl/authorization/program-obligations.test.ts ./src/task-dsl/authorization/program-outcome.test.ts ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/resource-program-draft.test.ts ./src/task-dsl/authorization/program-authoring-context.test.ts ./src/task-dsl/authorization/program-trial.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/program-delivery.test.ts --timeout=15000
bun test ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts ./src/benchmarks/authorization-dsl/inquiry-run.test.ts ./src/adapters/codex-account-session.test.ts ./src/adapters/codex-account-recovery.test.ts --timeout=15000
bun run typecheck
bun test ./results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/study.test.ts
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/tsconfig.json
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

### BM19 文档与发布

- [x] 同步 current-status、当前 plan、spec §14.52、研究 §7.74、usage/开发指南相关段及示例；不新增长期研究正文。
- [x] 每个有意义阶段简记外层日志，保留方法修订的原因与首次证据；代码、工程、自动编写、实际使用、收益分轴结论。
- [ ] 精确暂存本轮文件，检查凭据/绝对本机缓存引用和 diff，提交推送用户 origin/skill-ir-aot，并核对远端 SHA。原件及 `.tmp/` 保留。

### BM20 按实际结果收束

- [x] 汇总八用途及具名修订的已执行/未运行/未知、自动稿18场景和新增机械变化、逐题评价、两对成本、交付故障和剩余责任。
- [x] 交付普通运行命令和可读过程；若仍失败，明确卡在作者、程序表达、输入、消费还是账号生命周期，指出下一处最小共享修复。
- [x] finiteQueueComplete 与 researchGoalAchieved 分开；存在必要验收未达时不能标整体研究目标完成。队列处理完后停止新调用，不无限启动后继 identity。

## 六、真实用途、修复和预算

八个主用途：A0修订旧自动稿、A1独立空稿、C0/B0基础对照、B1/C1空版本对照、C2拒绝交付、S0源码维护。A0无可运行稿时消费保留 not-run，不偷偷补人工程序；可单列一个 developer-assisted 诊断判断消费机制，但它占用下述修订额度且不进入自动主对照。

每用途沿现有有界读取限制（最多32 MiB源码读取、768 KiB展示）和最多64个工具预算单位，总 wall window 45分钟；最后120秒留给至多一个最终回答回合。开始前核对现有计量单位并写入 manifest，不能把工具单位称模型请求次数。作者最多两次针对性 continuation 与一次最终交付，仍在同一原总预算内；消费者最多一次最终交付。不得给后续回合重置时钟或64额度。

全轮允许最多四个**具名额外真实用途**用于有证据的共享修复确认；一个修订配对占两个。每个先记录根因、代码变动、期望改进和实际差异。单因连续两次未改善转离线定位；不把可修共享缺陷写成整批跑完才修，也不重复同提示碰运气。未用额度无需用完。

首件的低分/格式错误/预算耗尽均保留。协议失败仍占端到端分母，语义评价另列；不由新标签消除失败。任何首次明确共享缺陷立即暂停受影响后续位置，修复/验证/登记新 epoch 后继续独立位置。研究权限允许这类修订，无需常规确认。

旧未知请求只读确认和隔离，不重发、不补费用。新 quota/auth 拒绝暂停对应通道；同因 routing 的一次有据恢复失败则暂停。中断可持久恢复已知可恢复会话，恢复与新用途分清。没有服务器终态时保留 unknown，处理其余工程；不得因等待一个旧请求阻塞整份任务书。

## 七、完成时要回答的五个问题

1. 自动作者是否从源码发现并补上遗漏分支？修稿与独立编写各是什么结果？
2. 同一固定程序能正确处理哪些输入，哪些情况拒绝、依赖外部前提或仍未知？
3. 消费者实际省去了哪些重复读取/推导，哪些仍需模型，四问质量是否保持？
4. 最终交付是否真正完成，未完成来自何种生命周期或预算原因？
5. 含作者及维护成本后，有无本轮可观察的收益，后续最值得修的共享原因是什么？

这些答案比新增模块数、测试数、运行时长更重要。保持源码与评价证据，不通过放松语义、隐去失败或删题来得到正向结论。

## 八、2026-10-14 实际收束

有限队列为 completed-with-unmet-criteria，停止新增模型调用。8个真实attempt覆盖6个主用途及2个具名修复；B1/C1按首对negative且无具体共享修订的规则未运行。12观察turn、7自然交付、0活动/未知。BM11修稿成功项保持未勾选：A0虽交付但未patch/trial，仍为原14步；BM14第二对保持未勾选并按not-run-no-intervention处置。BM3由S0实际补入拒绝guard、三保留场景及两个新增反例验证，不能倒填成A0成功。

1. A0首件暴露重试通知阻断交付，修复确认可交付但未修程序；A1首件无程序，修正初始edit职责后独立产出12步、3patch和1trialbatch。A0/A1字段映射后分别15/18、14/18，literal均2/18。初始化、grant短路等执行缺口独立保留。
2. 固定A0默认返回11/archive，空版本12/original，明确false在授权guard停止；非法/跨根version无文件但缺显式源码拒绝，无外部事实仍缺初始化前提。S0副本维护17步、三保留场景和两个拒绝反例通过，不替换A0。
3. C0比B0少源码检索/读取，但仍核实规则；两者四问均P/P/F/P。实际状态/缺口与协议字节增大，C输入3.82倍，fresh输入3.33倍，输出更高；没有净节省。C0耗时受并行离线检查负载影响，不作隔离性能因果结论。
4. 7次自然交付，A0首次未交付保留。A0修复、A1首件、A1修复及C0均实际使用无工具最终子回合；C2/S0自然单turn完成，不能称强制预算恢复。8本地归档关闭且已核验。
5. known input17,189,793（含cache15,432,192一次）/output97,517；USD、隐藏provider请求、开发/探子和真人成本unknown。首对negative，未建立摊销点。下一最小责任是作者根据已有源码候选表达初始化先于owner短路并针对该分支trial；S0证明拒绝guard已有表达能力，不据此扩大语言。

证据与普通运行入口见[执行记录](../../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/execution.md)、[最终检查](../../../results/skill-ir/skill-dsl-research/development/authorization-branch-verified-consumption-v1/verification/final-checks.json)及[Download示例](../../../examples/authorization-assessment/download-workflow/README.md)。184生产定向测试/1229断言、4研究测试/29断言及主/研究类型通过；旧全src104失败不称修复。15文档测试、当前变更链接/治理锚点及编辑文件diff检查通过。全量链接检查保留10处基线既存历史引用失败；原始模型答案行末空格保留，不伪称全量diff检查无警告。发布核对另记。
