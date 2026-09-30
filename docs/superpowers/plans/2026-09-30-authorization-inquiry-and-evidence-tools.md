# AO0–AO16：真实授权任务、领域 DSL 与有界取证工具

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行。一个开发线程负责实现、共享文档、真实实验和发布；子代理按 AGENTS 只做边界明确的只读探索与核验。用户已授权连续推进，常规检查点记录后继续，不等待再次确认。

**Goal:** 让授权类 skill 从自然任务和原始源码出发，通过可演进的领域声明与可执行取证工具完成分析；纠正提前提供答案和作者评价偏差，在真实任务中检验回答质量、编写与复用。

**Architecture:** 复用现有 SkVM skill loader、agent loop、provider/telemetry、源码定位与快照、声明编译及普通 CLI。区分行为调查与政策符合性；以共用只读工具提供源码访问，DSL 在其上组织控制对象、资源对象、受保护操作、条件和证据缺口。保留旧 fixed-context 接口，新流程显式启用。普通使用及研究走同一生产实现。

**Tech Stack:** TypeScript、Bun、Zod、现有 authorization 模块、SkVM adapter/skill bundle、Git 与认证 GitHub CLI。沿用共享 token-accounting；不另建 CLI 平台、通用安全扫描器、完整静态分析器或统一 IR。

---

## 1. 授权、范围与交接

- 日期：2026-09-30；2026-10-01状态：`completed-and-published`。规划基线 `cdcbb7446524fc2cc32739b8d9d62d672ae4792f`；实际从干净`aea87139`启动，工程绑定`218f5bbf`，56行/319调用已关闭且不再采样。首次完整发布`47942ac33f1eda0f9140d449e496fc2230aff4f3`与用户origin一致、工作区干净；完成记录另随本书同步。
- 开发线程：`gpt-6.1-sol / max`。被测 provider 保持 `xty/gpt-5.6-sol`，逐请求保存实际配置；开发模型和被测模型分账。
- 在 `D:\skill优化\SkVM` 的 `skill-ir-aot` 开发，仅推送用户 `origin/skill-ir-aot`，不开新分支、不写 upstream。无关修改及历史本地材料保留。
- 结果根：`results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/`。AO0才创建 `status.json`、`journal.jsonl`；原AN及更早身份不改。
- 唯一研究正文为[研究总文档](../../skill-ir/skill-dsl-research.md)§7.34；问题、设计变更、解决和结果持续追加，不新建一轮一份的研究正文。
- **质量约六成、编写与复用约四成仅为开发精力安排**，不是评价权重、样本比例或验收分数。
- 网络、认证gh和有目的的付费调用已授权，无用户美元上限；仍执行有限的任务规模与资源预算，记录失败/超时/未知计费，不按分数反复重抽。
- 本轮允许对已公开development项目补齐原始源码、开发同类新任务和离线变化副本；不读取历史保护的held-out/Q1 reserve，不执行目标代码、部署、攻击请求或补丁。源码补读是本轮明确新增能力，旧fixed-context限制只约束旧路径。
- 连续完成AO0–AO16；效果负向可如实交付，但尚未实现的必需工程不能写成全部完成。外部阻塞只关闭对应子流，继续独立工作。结束后不追加无关任务凑时长。

必读顺序：根与仓库AGENTS → current-status → 本书 → spec §14.34的用户澄清和AO合同 → 研究§7.33交付后复核及§7.34 → usage、相关developer-guide。旧AN是关闭记录，不继续其paid行。代码修改前亲读确切模块；恢复时按status.nextAction与journal，不重做历史全量审计。

## 2. 本轮必须解决的实际问题

1. AN作者检查以区分大小写的子串判定Markdown语义，`Deny`和逗号差异被误拒。旧v2 local-edit不能改request，而评价要求其改变。原结果保留，在新身份修评价和接口。
2. 新前端作者曾收到完整`currentTask`，两份原稿只是复制。完整声明应零模型编译，真实作者实验从自然brief开始，模型提取与宿主展开分别计量。
3. GetSharedMemo输入已描述无需认证、token绑定及NOT_FOUND行为。来源公开不代表适合作为待调查行为的已知结论。原始源码可见，结论应由本次方法分析得到。
4. 现有schema要求policy/expectation；无外部规范的行为调查必须编造规范才能进入旧路径。这是需要修改的领域模型问题。
5. host分析只接收固定源码，工具能力主要发生在准备阶段。已有索引和补读函数可复用，需要接入分析中的缺口处理。
6. 当前职责来源为Cloudflare `security-audit`与GitHub `security-review`；目标项目不是skill分母。最近AN未加载这两个完整源skill。本轮补充真实加载及职责接入记录。

## 3. 设计合同

### 3.1 输入职责与两种任务

普通输入只要求自然问题、repo/ref、本地源码范围和可选入口提示；政策符合性另需真实用户规范。允许用户直接写DSL；不强迫每次用模型生成它。

- `behavior`：询问某主体对某资源执行某操作的实际控制和条件。无需normative policy或预期allow/deny；结果报告源码行为、条件、证据和未知。
- `conformance`：用户提供独立的规范要求，分析实现是否遵守。政策来源、作者场景假设和实际行为分别保存；源码当前实现不能自证规范。
- 入口提示可以是用户指出的函数、文件或操作；允许范围按完整相关模块/子树登记，不能只挑答案所在行。定位或路径不明由系统在允许范围内找，无法确定时列具体缺口。
- 用户给出的主体、资源、场景是真实任务事实。未给出的角色例外、owner状态、token效果、HTTP结果和完整条件分支不得由研究适配器预填。方法可以在运行中推导候选并绑定证据。
- 原始源码中自然包含的业务逻辑可以读取；评价rubric、历史回答、解答说明及对应tests/advisory若直接透露所问结果，放在生成范围之外。每个来源按其在本任务中的用途记录，不靠字符串黑名单判断是否泄漏。

增加窄入口 `authorization-inquiry/v1`，领域类型建议放 `src/task-dsl/authorization/inquiry.ts`，精确字段在AO1据现有类型固定：

```ts
type InquiryMode = "behavior" | "conformance";
interface InquiryQuestion {
  id: string;
  request: string;
  principal?: string;
  resource?: string;
  operation?: string;
  entryHint?: string;
  premises: Array<{ text: string; origin: "user" }>;
}
interface AuthorizationInquiry {
  schemaVersion: "authorization-inquiry/v1";
  mode: InquiryMode;
  questions: InquiryQuestion[];
  policy?: { text: string; origin: "user" | "external-policy"; location: string };
}
```

schema执行跨字段规则：conformance缺政策为needs-input；behavior不注入假政策或expectation。repo/ref/sourceRoot/允许源码范围继续复用现有context，不重复放入每个question。可缺的结构不强制占位；必要歧义给具名诊断。

新增域结果 `authorization-inquiry-result/v1` 保存question级behavior、branches、evidence、missing和可选policyAssessment。behavior路径不生成虚假的旧conclusion。旧v2/v6路径保持；新结果在inspect/compare与session中有明确版本。共用引用、源码身份、计量及生命周期，不复制旧运行平台。

### 3.2 DSL承担的领域工作

声明负责表达问题和规范；编译器生成待查事项，不预填控制路径。模型观察单独记录：

```ts
type EvidenceState = "pending" | "observed" | "unresolved";
interface AuthorizationObservation {
  questionId: string;
  kind: "entry" | "principal-binding" | "resource-binding" | "guard" | "effect" | "exception";
  subject: string;
  object?: string;
  claim: string;
  state: EvidenceState;
  evidenceIds: string[];
}
```

作用是关联检查对象与效果对象、入口与上游控制、条件与例外、主张与实际已读证据。宿主可发现未引用、对象绑定未交代、分支重复/缺口等机械问题；不能用同名、正则或有citation就证明授权语义正确。不同编程语言复用关系，不用Memos/Paperless等项目名选择成功路径。

完整与未知分开：未找到控制不自动等于没有控制；允许源码内仍可补的缺口与真实部署未知不同。短路拒绝能决定问题时，不因无关缺口强制弃答；决定性链不完整时保留partial和下一条取证需求。

### 3.3 共用可执行只读工具

复用 `loadPortableSourceBundle`、`locateAuthorizationSource`、`indexAuthorizationSymbols`、`discoverAuthorizationEvidence`、`readDiscoveryWindows` 与 `prepareAuthorizationEvidence`。提供统一工具接口：列出允许源码、查找文字/符号、读取原行范围；返回原行号、来源身份、截断及预算情况。

- 范围来自用户选定的源码目录/文件。路径解析复用现有canonical path与junction/symlink约束；不开放任意shell、写文件或网络工具给被测分析器。
- 新普通输入可将允许目录确定性枚举成范围；排除.git、密钥、研究结果/oracle和依赖缓存。不要把旧12文件限制变成选任务门槛；支持具名、可配置文件/字节预算，超过时保留可用部分与具体范围缺口。
- 小源码单元可完整读取；大文件分片、去重，保留省略处。模型请求读取的范围与真正收到的范围分别记录。
- 源字节在session中变化时停止受影响取证并留诊断；旧源码、已读内容及费用保留。引用只能绑定实际向该次分析公开过的字节。
- 工具都经同一执行器，普通Markdown基线与DSL获得相同原始访问权限。DSL增加的领域队列、关系记录及诊断属于显式干预。
- 不为此构建全仓call graph或解释器；词法索引继续只做定位辅助。

### 3.4 分析中取证循环

复用已有agent loop或structured action提议机制。模型每步可请求受限读取、提交证据观察或提交最终回答；宿主执行工具，将结果加入同一个session，后续推理可据此修正观察。准备阶段一次性读取后再次固定回答，不能当成本项完成。

宿主负责question与证据身份、幂等读取、资源上限、事件保存和取消；领域模型负责选依赖、判断控制和形成答案。已有telemetry覆盖authoring、read-proposal、analysis、repair、fallback所有dispatch，不只计最后一答。

初始默认：每次provider 300秒；每session 1200秒、最多12次provider dispatch、24次工具调用、256KiB累计向模型公开的源码。可基于零调用fixture大小在AO9前统一调整并说明，两比较路线预算相同。达到上限保存已有分析及缺口，不无限循环。最多一次具名交付修复计入这些总上限，取证步数不伪装成零成本修复。

### 3.5 自然作者与修改

自然brief不含目标JSON、不附已填好的principal/resource/branches字典。模型得到schema说明和与实测案例无关的合成例子，从当前任务生成声明；host只派生ID、引用、显式context和机械展开。完整DSL作为输入时零模型编译。

先修request编辑能力及作者语义评价，再做新比较。政策改变时继续检查受影响场景；问题文本改变时同步真正供分析使用的request，说明文本的语义一致性独立评价。原稿不看到未来变更，变稿才接收自然变更要求和原稿。

Markdown只做基本结构/可读性检查，语义采用独立逐项review；不得用大小写或整句匹配拒绝等义陈述。DSL结构严格，但语义同样按表达的意思评价。字段合法和语义正确分别报告。不要为获得主消费结果手填失败作者稿；该失败留账后继续其他独立任务。

### 3.6 源skill与普通使用

获取已登记固定ref的两个原skill正文、直接引用资料和许可证：Cloudflare `security-audit-skill@c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`、GitHub `awesome-copilot@7e375eac04fa04f291859ca962a4d8a3bb8b7564`，路径均见已有skill-duty-map。先查本地来源；缺原件时用认证gh按固定ref获取，失败保留，不偷换最新版。

通过SkVM的 `loadSkill/buildSkillBundle` 和普通run链真实加载原正文。原skill中的全仓扫描、部署等职责本轮由用户任务范围明确排除；范围提示两臂相同。保留源skill原件，不把自写摘要当原skill。

为同类授权职责交付薄工具包/skill扩展：可调用当前DSL编译、只读取证和检查能力，保留来源与剩余职责。基于现有runtime registry向bare-agent增加opt-in的授权只读工具集合；原默认工具集不改。工具集合必须在执行器层限制，不能只在prompt写“不要写文件”。所有对照共用只读原语；新包额外的领域工具有真实调用trace。

若不能在现有普通run中直接注册，允许新增一个薄专用adapter并复用runAgentLoop/loader/logging；不得另建研究专用假消费者。依赖已有SkVM运行时的事实写清，不以自包含二进制打包作为本轮门槛。

## 4. 文件职责与反例

**AO1已定接口（2026-10-01）。** 生产入口`authorization inquiry init/check/run/inspect/edit/compare`，输入inquiry-input/v1选择natural brief+mode/policy或完整inquiry；policy origin为user|external-policy。方法M/D0/D1默认D1。新`inquiry-local.ts` owns离线检查/归档/编辑/比较，`inquiry-native.ts` owns普通skill只读注册与增量轨迹；现有bare-agent/run添加authorization-scope/domain-tools/trace opt-in。作者接受沿authoring-assist，旧local-edit新增request。study额外row-ledger负责unknown终态及两次基础设施故障暂停；匿名评价沿evaluate.ts，作者语义沿author-review.ts。预算实际派发12、动作24、累计目标源码展示262144 bytes；源skill正文另计token。精确公共类型和边界已同步spec/guide。

以下新增名称为本轮具体实施位置；AO1可按已存在职责合并文件，改名同步本书，不能留下未接线空模块。

| 职责 | 生产位置 | 测试位置 |
|---|---|---|
| 无预填答案的任务模式/编译 | 新`src/task-dsl/authorization/inquiry.ts`、`inquiry-program.ts` | 对应`*.test.ts` |
| 观察与结果检查 | 新`src/task-dsl/authorization/inquiry-result.ts` | 同名tests；旧outcome-result兼容 |
| 只读工具与范围 | 新`src/benchmarks/authorization-dsl/inquiry-tools.ts`；复用`evidence-preparation/` | `inquiry-tools.test.ts`、discovery/prepare tests |
| 分析取证循环 | 新`src/benchmarks/authorization-dsl/inquiry-run.ts`；提取host/telemetry可共用逻辑 | `inquiry-run.test.ts`及local-run tests |
| 自然作者与request编辑 | `authoring-assist.ts`、`authoring-task.ts`、`authoring-workspace/local-edit.ts` | authoring/local-edit tests |
| 普通入口 | `src/cli/authorization.ts`及新薄`authorization-inquiry.ts` | 新`authorization-ao.test.ts` |
| 真实skill工具注册 | `src/adapters/bare-agent.ts`、现有adapter types/run配置接线；必要薄adapter | adapter专项目录及run tests |
| 示例 | 现有`examples/authorization-assessment/reusable-skill/`、`task-semantics/` | 真实普通入口mock与一次搬移 |
| 本轮研究 | 新结果根`study.ts`、`author-review.ts`、`evaluate.ts`、`study.test.ts`、`tsconfig.json` | 零调用check/replay及匿名review |

重点反例先红后绿：

```ts
// inquiry.test.ts：不再迫使行为调查猜规范。
const behavior = {
  schemaVersion: "authorization-inquiry/v1", mode: "behavior",
  questions: [{ id: "q1", request: "Who can update a record?", premises: [] }],
};
expect(AuthorizationInquirySchema.safeParse(behavior).success).toBe(true);
expect(AuthorizationInquirySchema.safeParse({ ...behavior, mode: "conformance" }).success).toBe(false);
expect(JSON.stringify(compileAuthorizationInquiry(behavior))).not.toContain('"expectation"');
```

```ts
// local-edit.test.ts：复用文件中现有valid base fixture。
const edited = applyAuthorizationLocalEdit(base, {
  schemaVersion: "authorization-local-edit/v1", reason: "Ask about the revised task",
  operations: [{ kind: "request", statement: "Can a member update their own record?" }],
});
expect(edited.status).toBe("ready");
expect(edited.value!.request).toBe("Can a member update their own record?");
expect(edited.value!.policies).toEqual(base.policies);
expect(base.request).not.toBe(edited.value!.request);
```

```ts
// inquiry-result.test.ts：以下公共校验函数由AO5实现。
const observation = { questionId: "q1", kind: "guard", subject: "caller", object: "record",
  claim: "An ownership guard applies", state: "observed", evidenceIds: ["not-read"] };
const diagnostics = validateInquiryObservations([observation], { questionIds: ["q1"], shownEvidenceIds: [] });
expect(diagnostics.some(item => item.code === "evidence-not-shown")).toBe(true);
```

其他必须用mock验证的执行序列：首次只见entry → 模型请求symbol/search → host返回实际helper → 模型据helper回答；不存在helper保留source-gap；同名不同作用域返回候选不乱选；一次局部拒绝足以回答时不强制读完所有依赖；工具请求写文件/shell未注册且执行拒绝；原skill确被load，模型实际调用新包工具；结束/超时后没有新增dispatch；源码变化与路径越界被准确区分。

## 5. 实验安排

### 5.1 主质量任务与三条路线

在已暴露项目里登记8个任务，按下列职责顺序落实实际ref与操作。允许因源码无法取得记录not-run，不能看模型成绩后换任务。

| 项目/操作 | 任务类型 | 要检验的工作，不预填答案 |
|---|---|---|
| Memos GetSharedMemo | behavior | 分享token如何关联资源，入口及依赖中的控制和例外 |
| Paperless Download | behavior | 请求选择、版本/资源绑定和读取控制的关系 |
| Open WebUI file ingestion | behavior | 文件授权对象与后续写入/处理对象是否一致 |
| Gitea self-query相关入口 | behavior | 跨用户与本人场景中实际的路径差别 |
| Memos成员管理 | conformance | 用户明确要求只有管理员可移除其他成员，源码如何执行 |
| Paperless note相关操作 | conformance | 用户指定查看/修改权限要求，owner等未给前提按源码分支分析 |
| Paperless ShareCreate | conformance | 用户指定分享创建的资源权限要求，检查继承与局部控制 |
| Gitea issue操作 | conformance | 用户指定repository权限要求，检查上游和效果路径 |

conformance政策作为独立、明确的实验用户需求编写，不能从该代码结果反推；每任务在AO9给一段自然问题，不附预期实现结果或decisive-path清单。任务中的必要场景可以说明，源码待查条件不在准备时枚举完。

三路线使用同一自然brief、原始源码访问范围、模型、资源预算、结果要求和评价：

- **M：** 普通Markdown任务说明加共用只读工具，不加载DSL领域程序。
- **D0：** 当前任务生成领域声明并运行，关闭新增的领域证据队列/一致性反馈，仍有同样通用读取能力。
- **D1：** 同一声明路线加领域取证队列、关系记录及缺口反馈。

8×3共24个主session。D0/D1的声明提取属于真实运行阶段，有调用则计入；不得免费给D臂人工填好的结构。M/D0比较整套表示与使用方式，D0/D1重点看领域运行支持；不把组合差异强行归因于语法。

再预登记4个变化任务各M/D1一对，共8session：政策变化、资源主体关系变化、决定性控制的离线源码变体、路径/符号重命名且语义不变。按上述顺序绑定到前四个满足条件的主任务；合成源码变体与真实上游任务分开报告，构造者知道答案的事实记录在evaluator侧，不冒充unseen。变体不执行目标代码。

总质量规模32session。比较首答/终答正确性、关键证据支持、遗漏/错误确定性、合理unknown与可补缺口、请求场景完整性；不再把字符串命中或字段存在当质量。无效输出和准备失败仍留分母。

### 5.2 真实作者与复用

选Memos政策变更、Paperless前提变更两个任务。每个任务自然Markdown与DSL两路线、原/变各一稿，共8计划稿；至多一次基于公开诊断的修订。变稿只在原稿有效后进行，依赖失败如实blocked。

输入只有自然brief、源码context和普通指南，不含完整currentTask/期望目标JSON；指南例子使用无关合成名称。评审同时看结构、当前需求表达和语义等价，允许合法自选key/不同措辞。人工/开发代理不代填模型失败稿。

有效稿在普通入口自然消费，最多8session；声明任务义务按brief在生成前登记，实际遗漏与多余展开分别统计。变化后compare必须指明旧结果需要何种复查，不复用旧答案冒充新分析。

### 5.3 两个来源skill实际使用

每个源skill选2个上述范围内任务，原skill与加入DSL工具支持的对应包各一次，共8session。加载完整原SKILL.md，给相同授权职责范围和共用只读工具；新包实际调用领域工具才记为使用。

保存skill来源/ref、实际加载内容、宿主范围提示、每次工具调用、结果与残余职责。普通CLI/adapter的接线通过mock后才执行真实调用。某源skill依赖暂不支持的能力时，报告具体不兼容；不得以重新手写一个同名skill替代。

本项是源职责接入与有界使用证据；与32行质量面板、作者实验分别分母。已有有效消费可作为使用演示，不再为漂亮演示重复付费。

### 5.4 评价、修订与费用

- 生成前登记自然brief、source范围、可选政策来源、方法设置、顺序和评价口径；以一个提交和单一manifest保存身份，不再建立多层重复hash gate。
- 研究生成进程只得到input包和目标源码访问根，evaluator/oracle不在工具可见范围；目录分离和实际输入检查先完成。用一个不含真实答案的canary测试验证oracle文件无法读取，再只读抽查全部实际prompt/tool记录的来源。
- 开发者可核对源码制定evaluator，但不得把结果转写进生成指南；复核生成输入是否保留了所测推理。所有案例都明确development，不主张从未暴露或不存在预训练记忆。
- 语义review在生成关闭后按匿名答案进行，注明development-agent评审而非真人；争议回到源码与预定任务要求，记录裁定。不得按“DSL应该赢”改变必要项。
- 共享代码bug先写确定性失败测试，修复后允许一个配对修订区块，最多8受影响session；先登记选择理由，主结果保留。普通低分不触发反复重抽。
- provider dispatch后未知完成不自动重发；两次连续基础设施故障先推进离线工程，最多两次有理由的连通性检查。确认未dispatch才安全恢复。
- 每阶段记录模型调用、工具调用、fresh/cache/output、墙钟、累计响应时间、实际费用/unknown。完整prompt中缓存只计一次；作者、取证、最终分析、修复与消费分账，开发代理与真人时间未知不记零。

## 6. AO0–AO16执行队列

每项实现按具体反例→确认失败原因→共享代码→聚焦通过→文档同步执行。工程细节可依据代码自主修正，本轮大方向保持；不是每个小步骤都要另做一轮设计审批。

### AO0 基线与恢复

- [x] 读取上下文，确认分支、HEAD和已有改动；建立结果根status/journal、责任人、nextAction及逐session状态。
- [x] 只核本轮依赖的AN复核材料和现有普通示例；不重跑全部历史实验。
- [x] 记录模型配置、已授权网络/费用与只读目标范围；不输出凭据。

### AO1 输入、来源及接口定稿

- [x] 亲读schema、authoring、host、工具和adapter接口，落实第3节的模式/结果/工具公共类型及普通命令。
- [x] 取得两个固定源skill正文与直接依赖，区分来源skill和目标源码；保存许可证/来源信息及读取失败。
- [x] 对GetSharedMemo等旧输入逐项标记规范、原始材料、预先归纳的实际行为与oracle；本轮使用新自然brief，不改旧输入。
- [x] 把精确schema/API及必要的既有接口调整写入本书与研究§7.34后继续。

### AO2 评价与编辑缺陷修复

- [x] 在新`author-review.ts`/tests中保存`Deny`、标点变化、同义表达正例，以及主体/否定词/政策版本反转负例；结构检查与语义review分开。
- [x] 为普通local-edit增加明确的request操作，测试修改范围、原对象不变、compare失效与所有旧操作兼容。
- [x] 用原AN响应做离线校准附录，标明新口径；原AN评价/消费结果不覆盖、不补算未运行的行。

### AO3 行为调查与政策检查编译

- [x] 写第4节schema红例：behavior无policy/expectation有效，conformance缺policy给诊断，未提供角色/前提不自动补值。
- [x] 实现inquiry编译计划，稳定关联question、显式前提和用户规范；旧authoring/v2仍走旧路径。
- [x] 新结果表达行为与条件，policyAssessment仅在有规范时使用；inspect/compare可读，不虚构旧conclusion。

### AO4 共用只读取证工具

- [x] 从既有discovery/read/prepare提取共享执行器，支持范围内list/search/symbol/read并保存原行号、字节和缺口。
- [x] 用临时合成源码测试同名作用域、循环/动态依赖、分片、重复读、路径越界、源码改变和预算耗尽。
- [x] 固定allowed source范围与实际已读证据集合；读取oracle/密钥/范围外文件及目标执行工具均无法调用。

### AO5 领域关系与缺口反馈

- [x] 编译待查事项，接入observation ledger；控制对象、效果对象、入口/上游、条件/例外用共同语义组织。
- [x] 测试未读引用、跨问题误绑、重复/冲突分支、无证据观测、不存在控制与未找到控制的区别。
- [x] 把机械诊断与语义待复核分别标记；不因字段齐全自动判安全，不要求每个任务都有同一套可选关系。

### AO6 分析中的补读循环

- [x] 用mock完整走首次不足→请求helper→真实工具返回→继续分析→结果校验，确认补读发生在同次分析过程。
- [x] 接入既有provider生命周期、取消、费用、首答与修复；所有新dispatch入账。
- [x] 测试预算耗尽、工具失败后的partial、不可补外部事实、短路决定、关闭后不再派发；旧fixed-context回归保持。

### AO7 自然作者与变化

- [x] 接普通authoring-assist，从未结构化brief生成inquiry/DSL，保存字段来源；完整DSL零provider编译。
- [x] 当前与未来变更隔离，具名修订仅改变诊断允许字段；规范修改与格式修复分开。
- [x] 两种作者表示共用事实和可实现的编辑能力；自然brief不携带currentTask成品、答案或预拆全分支。

### AO8 普通命令与真实skill接线

- [x] 扩展现有authorization init/check/run/inspect与相关edit/compare，显式选择新模式；check无provider，普通run调用AO6。
- [x] 实现opt-in只读工具集合或薄adapter，接已有skill-loader、runAgentLoop和durable trace；默认bare-agent行为不改。
- [x] 更新现有reusable-skill，给真实可调用入口、运行时依赖和剩余职责；mock验证源skill已加载、工具被实际调用、结果回到任务回答。

### AO9 任务与全部路径预检

- [x] 登记24主行、8变化行、8作者稿/至多8消费、8skill使用行，具体自然brief/ref/范围/政策和来源分列。
- [x] 对实际每种参数组合走一次零provider普通入口，覆盖behavior/conformance、M/D0/D1、edit、skill工具注册及inspect/compare。
- [x] 做输入来源审查与oracle不可读canary测试；固定一个执行manifest/实现提交，保存恢复命令，不设重复冻结仪式。

### AO10 质量与变化任务执行

- [x] 交错M/D0/D1执行24主行、M/D1执行8变化行，保存从brief、作者、工具读到首答/终答的完整链。
- [x] 失败不换题，未知不重发；生成关闭后独立匿名评价必要语义、证据、分支、误报漏报和可补缺口。
- [x] 分别报告M/D0、D0/D1以及变化任务，说明预处理和工具贡献，不预定正向结论。

### AO11 自然作者与同包复用

- [x] 执行两任务两路线原/变8稿及依赖有效的真实消费；所有修订、无效和阻塞保留。
- [x] 核对模型确有提取/组织工作，宿主只做登记的机械展开；禁止生成完整目标后再让作者复制。
- [x] 从任务brief核对实际交付义务，检查变化后说明/声明一致、旧结果需复查和最终答案质量。

### AO12 两来源skill真实使用

- [x] 通过普通加载链执行两源skill各两任务、原/领域支持各一次，保存8session和真实工具事件。
- [x] 确认源SKILL正文与版本、范围提示一致；新包未使用工具、忽略职责或依赖失败均按实际报告。
- [x] 原skill、DSL支持包、目标代码项目分别计数；结论限定到实际完成职责。

### AO13 具名共享修订

- [x] 根据确定性反例判断有无共享实现缺陷；没有则零追加关闭该区块。
- [x] 有缺陷先红绿修复，登记至多8个受影响的配对session；首轮和修订单列，不以修订替换分母。
- [x] 普通错误、模型能力不足或收益不明显保留分析，不按评分继续加提示和重抽。

### AO14 结论与普通示例

AO13实际：普通scope-only mode/policy未传给native模型的确定性反例已红绿修复，2项/11断言通过。实测自然prompt原已提供这些字段，受影响登记行0，付费修订0；原冻结和输出保持。评审格式/政策/相邻函数争议分别留原文与具名裁定。具体结果只在研究§7.34和机器摘要维护。

- [x] 说明DSL到底新增了哪些领域表达、可执行工具与普通使用步骤，哪些仍由模型/用户负责。
- [x] 质量、作者/复用、来源skill接入和完整运行代价分别报告；未知USD/真人工时继续unknown。
- [x] 更新研究§7.34、usage/developer-guide、spec/plan/current-status和实验目录；已有例子增加自然任务→取证→回答→修改/复查命令，不建HTML。

### AO15 一次有限验证

- [x] 跑新增聚焦测试、现有授权相关回归、涉及的adapter/run回归、主和研究脚本类型检查、零调用重放。
- [x] 文档检查、归属diff与敏感信息检查各做一次；一次只读独立核验关注输入职责、取证边界、语义评价公平及真实skill加载，具体问题修后定向复验。
- [x] 一次仓外复制验证普通示例的相对路径、工具依赖与离线check；复用已有真实session演示inspect，不重复付费。

实施时新增测试位于上述目录，精确命令写进verification。必跑基础命令：

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization-ao.test.ts ./src/cli/authorization.test.ts ./src/cli/authorization-an.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts
bun test ./results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/study.test.ts
bun run typecheck
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/tsconfig.json
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

研究入口至少提供 `study.ts check`、`status`、`run`、`replay`，其中check/status/replay零provider；新增接口名在AO1固定。不要照抄不存在的旧测试路径或把未发现测试算通过。仅当测试暴露风险时扩展验证，不跑全历史冻结审计。

### AO16 发布与关闭

- [x] 按实现、真实证据、文档进行归属明确的提交，推送用户origin/skill-ir-aot，核对远端SHA及工作区。
- [x] 给出普通使用命令、实际完成/失败分母、DSL领域与工具能力、质量及成本取舍、明确剩余问题。
- [x] 状态区分工程交付与方法收益；必需工程有缺项则记录incomplete/blocked原因，不能用“适用任务均完成”隐藏遗漏。全部适用交付终结后停止本队列。

AO16发布证据保存在结果根`publication.json`。原SSH连接关闭后，使用已有GitHub登录按次切换HTTPS推送同一用户origin；未修改持久remote配置。普通步骤见reusable-skill/SKILL.md，严格分母、失败、未知费用及剩余source-skill职责见研究§7.34与机器摘要。后续只同步完成状态，不追加paid单元。

## 7. 连续执行与自主修改

这是一个完整能力阶段，不是只写新prompt或修两个包。执行者可根据真实代码收敛字段、合并重复模块、调整无意义的展示要求，并同步本书与研究；可以修通用语义和工具接线，不以现有schema不可修改为前提。

若新能力无法复用旧result形状，保留版本化的新结果并共用底层设施；不要伪造policy/expectation仅为让旧validator通过。若自然任务无法唯一决定政策，behavior任务仍能继续调查，conformance对应项给needs-input。若没有质量改善，解释领域机制何处未奏效及真实代价，完成工程和证据交付，不制造正向结论。

初始无时间填充目标、无平台/美元硬上限承诺。按status/journal恢复剩余任务，只有外部条件阻塞的子流停止；其余工程、离线核验、文档和发布继续。所有付费与外部行为沿已授权范围执行。
