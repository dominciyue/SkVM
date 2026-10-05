# AU0–AU21：操作级取证与授权 DSL 贯通实施任务书

> **For agentic workers:** use superpowers:executing-plans, systematic-debugging, test-driven-development and verification-before-completion. 用户已授权本任务书的连续开发、必要联网/付费调用与用户 origin 发布，常规检查点不等待确认。主开发线程负责设计、实现及最终验证；只读探子遵循本次用户指令：default、fork_turns=none、任务自包含、同时派发后等待全部返回、不让探子改文件或决定方案。

**Goal:** 将授权任务声明落实为操作级共享取证、有限领域解释和可检查结论，修复 AT 的错入口、继承/helper漏读、对象与权限表达不足，并交付完整原 skill 的原任务与变化使用。

**Architecture:** 沿用 SkVM inquiry/native、provider、trace、只读工具和有限求值基础。新增操作级来源空间与义务执行计划，结构适配器提供可核对的符号/调用/继承候选，模型解释局部业务含义，宿主组合与计算；政策和用户前提作为独立输入。新策略显式启用，旧默认与旧实验合同保留。

**Tech Stack:** TypeScript、Bun、Zod、现有源码/模型运行工具；为 Python/Go 选择有真实语法树和名称解析能力的薄适配器，复用可获得的解析器。CodeQL 是待测适配选项，Cedar/RepoAudit/IRIS 是实现参考，不默认安装完整新平台。

日期：2026-10-05。状态：`in-progress`。执行模型：`gpt-6.1-sol / max`。实际 Git 仓库 `D:/skill优化/SkVM`，分支 `skill-ir-aot`；不创建分支/worktree，仅发布用户 `origin`。研究基线 `ba27716041d4e6e5f6f8f3a51e694e25c49323d4`，执行时保留其后本任务书发布提交。

本轮按一轮约 8–12 小时主动工作安排，约六成投入质量、四成投入编写与复用。按有效产物推进，完成即收口，不等待或重复调用凑时长。开发模型与被测模型分开；实验默认 `xty/gpt-5.6-sol`，沿用现有配置。替换不可用路由须记录并作用于整个配对块。

## 一、启动上下文与边界

主开发者本人按顺序阅读：

1. `D:/skill优化/AGENTS.md`、仓库 `AGENTS.md`，本线程收到的最新用户子代理规则优先。
2. [current-status](../../skill-ir/current-status.md)、本任务书、[当前计划](../../skill-ir/skill-ir-aot-optimization-plan.md)。
3. [spec §14.34](../../skill-ir/skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)的研究定位、输入边界与 AU 合同；[研究正文 §1、§7.50–7.51](../../skill-ir/skill-dsl-research.md)。
4. [开发指南](../../skill-ir/developer-guide.md)的 inquiry/native、semantic source blocks、focused transactions、reuse 部分；[普通使用](../../usage.md)。
5. AT [summary](../../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)、[manifest](../../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/manifest.json)、[最终评阅](../../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/evaluations/at15-final-change-and-consumer-source-reviews.json)。按具体失败点验原件，不重读全部旧任务书和九月全史。

运行 `git status --short --branch`、查看最近提交，保留其他修改。本轮取得共享方法文档与 Git 的唯一写入责任；派发主线程此后只读观察。交接/通信记录仅在发生恢复歧义时读取；阶段进展追加 `D:/skill优化/conversation_log.md`。

授权任务类仍为单 repository/ref、源码可见的授权与信任边界评估。源码只读，不执行目标应用、依赖安装脚本、部署或业务 patch。允许执行我们自己的解析器、求值器、fixture 与测试。获取依赖源码只按真实锁定版本；源码缺失和动态解析缺口显式记录。保护输入、Q1、readiness 和旧 prospective 不动。

继承 AT 的 [inherited-seals](../../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/inherited-seals.json)：paperless-notes、memos-share、memos-remove 的未知请求不因改 identity/模型而重发。已响应但费用缺报保持 unknown，不影响独立开发。

## 二、需要解决的真实断点

| 断点 | 当前代码/证据 | 本轮必须观察的变化 |
|---|---|---|
| 同一 CreateIssue 八题分别展开六类源码工作，七个 stored units 中六个落在 repo 创建函数 | `inquiry-program.ts`；AT GitHub author original/consumer attempt-2 | 一次正确操作定位，多问题引用共同来源解释；错误同名操作不进入当前关系链 |
| 词法索引和模型提交依赖不足以发现继承/helper对象链 | `evidence-preparation/discovery.ts`、`inquiry-domain-scheduler.ts` | 结构候选独立于模型的依赖清单；漏报依赖时能产生具体补查动作 |
| `procedure-summary.ts`遇到对象guard、对象返回、effect和call退回精确展开；权限计算缺有限map/集合/顺序表达 | `semantic-flow.ts`、`control-evaluation.ts` | 有来源的对象/权限摘要可组合，条件和异常保留，不再要求模型反复重建整张图 |
| 结论检查发现问题但下一步仍靠模型自由摸索 | `inquiry-focus.ts`、`control-conclusion.ts` | 诊断指向当前缺失的关系和可执行读取/解释动作，且轨迹记录实际执行 |
| 整体partial或任何源码变化均拒绝previous | `inquiry-reuse.ts` | 结构事实、待复核解释、完整结论各自管理；只保留依赖有效的材料，重新计算结论 |
| 两条original native自然条件说明充分，机器交付仍失败；changed与作者消费者仍partial | AT native/author/consumer原件 | 同一生产链同时交付有据的自然答案和一致的检查结果，变化任务实际可用 |

外部实现阅读结论已在研究 §7.51；本轮带着上述断点读对应实现与测试，避免只重复文献摘要。重点为 CodeQL RestFramework 的 qualified API/继承/实例模型、Cedar partial evaluation、RepoAudit 按 value/function/context 推进队列、IRIS 结构候选与模型语义分工。

## 三、开发合同

### 3.1 操作、问题与事实

新增显式策略 `operation-evidence-v1`，通过现有 `--strategy` 和 `--authorization-strategy` 选择；沿用同一共享核心，不复制 provider 或另一套 CLI。

引入 `authorization-inquiry/v2` 内层声明：增加 operations，每项含id、request及可选entryHint；每题保留原 request/premises 等内容，以operationId引用操作，以intent区分behavior、policy-comparison、scope义务。声明中的operation还需绑定源码入口才能成为下述OperationIdentity。`authorization-inquiry/v1` 保持严格兼容。v1归一化需保留所有问题与原字节，证据不足时不自动合并操作；明确候选后再绑定共同操作。一次模糊grouping不能让后续所有问题共享错入口。

以下是 AU1 要落实的内部责任合同，字段可随实际类型整合，但四个层次必须保留；接口变化在开始实现前同步任务书/spec，日常细节不用再问用户：

```ts
type ObligationIntent = "behavior" | "policy-comparison" | "scope";
type FactLevel = "structure" | "interpreted" | "checked";
interface OperationIdentity {
  id: string; repository: string; sourceRef: string;
  entrySymbolId: string; sourceRevision: string;
}
interface OperationQuestion {
  questionId: string; operationId: string; intent: ObligationIntent;
}
interface SourceFactDependency {
  kind: "source-span" | "symbol-resolution" | "candidate-set" | "framework-model";
  key: string; revision: string;
}
interface OperationSourceFact {
  id: string; operationId: string; level: FactLevel;
  evidenceIds: string[]; dependencies: SourceFactDependency[];
  semanticSupport: "unreviewed";
}
```

模型解释来源与宿主结构事实分开保存。`checked`仅表示已执行对应机械检查，语义等级另存。相同函数的参数化解释可共享；每个调用位置的实参、主体/资源身份、政策和用户前提分别实例化。不同仓库/ref/源码、同名函数、不同调用对象不能误合并。跨问题投影由宿主分配 ID 与引用，旧 question-level checker 可先消费投影，不要求模型重复生成同一函数。

普通用户继续提供 skill、任务、工作区和模型配置；conformance 另需独立政策。operation metadata、trace和索引由系统生成或模型辅助声明。作者不用填写正确答案、调用图或期望路径。

### 3.2 结构定位与领域解释

结构适配器至少覆盖两条真实链所需的 Python/DRF 与 Go 调用模式：定义边界、限定名称/import/alias、类与继承方法、receiver或调用位置、实参/形参来源及返回对象候选。框架模型绑定可获得的版本与具体源码关系；项目名称不得决定成功或允许/拒绝。

语法树提供结构定位，名称绑定与框架规则补充关系。不能仅换一个 parser 而继续把唯一同名候选视为调用关系。候选边要说明依据和不确定性；动态分派/反射/外部缺源码给出 unresolved，不靠函数名字写行为摘要。

由未满足的授权义务反向查询结构候选并生成动作，例如定位调用对象、读取override、核对被检查资源与效果对象。调度优先解决能影响当前结论的缺口，已解释相同来源不重复生成；独立问题可继续。有限索引、排除理由和剩余覆盖范围可查，不追遍数据库驱动与所有框架内部。

领域摘要表达参数化主体/资源、前置条件、正常/拒绝/操作错误返回、授权控制和相关效果。扩展实际所需的有限集合成员、map lookup及显式有序比较；权限顺序来自当前源码/独立声明。缺键、未知、null、错误解释分别保留，禁止补零、默认allow或按reader/writer名称猜顺序。优先扩展现有谓词/semantic flow，而非重新建设统一IR。

组合必须保留调用对象、条件和来源范围。摘要与精确展开做等价fixture检查；无源依据的摘要不能补进生产运行。对可见源码的模型解释仍需独立语义评价。

### 3.3 失效、交付与作用归因

当前运行保持固定源码快照；变化后进入新会话。结构事实可按依赖复用，模型解释保留原审查等级并重新绑定，旧 final/check flags 不复用。索引变化、新增override、import解析、候选集合与框架版本也是失效因素；不能只比较已读文件。

允许从partial会话恢复仍有效的材料，但必须分别报告材料复用与完整任务复用。关系不能证明不受影响时清除相关解释，保留可重查的原材料，不把整份历史partial提升为checked。

答案由当前事实与条件产生。宿主稳定渲染可确定的结论/条件/来源骨架，模型提供说明；说明与结构矛盾要留诊断并修复。未知前提下覆盖完整的条件答案可以充分；尚未找对源码的泛泛unknown仍是未解决。

## 四、文件责任与成果位置

| 责任 | 主要文件 |
|---|---|
| 声明、操作身份、问题归一化 | `src/task-dsl/authorization/inquiry.ts`、`inquiry-program.ts`；新增 `operation-program.ts` / `.test.ts` |
| 共享来源事实与依赖投影 | 新增 `src/task-dsl/authorization/operation-facts.ts` / `.test.ts`；现有 `control-slice.ts`、`inquiry-semantic.ts` |
| 结构索引与框架适配 | 现有 `src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts`；新增同目录 `structure-index.ts` / `.test.ts`，解析器适配按职责置于 `structure/` |
| 义务到动作 | 现有 `inquiry-worklist.ts`、`inquiry-domain-scheduler.ts`、`inquiry-focus.ts`、`inquiry-domain-runtime.ts`；新增 `operation-work.ts` / `.test.ts` 承载共享计划生成，不承载第二个运行循环 |
| 有限领域摘要及条件 | 现有 `procedure-summary.ts`、`semantic-flow.ts`、`control-evaluation.ts`、`control-conclusion.ts` 与对应测试 |
| 两入口、消费与复用 | `inquiry-run.ts`、`inquiry-native.ts`、`inquiry-local.ts`、`inquiry-reuse.ts`、`inquiry-wire.ts`、`src/cli/authorization-inquiry.ts`、`src/cli/run.ts` 与对应测试 |
| 本轮薄runner和记录 | `results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/`，生产逻辑禁止复制进runner |

新模块名称是职责划分；能用已有模块清晰承载时优先复用，在AU1记录实际路径。生产fixture放相邻测试或测试专属目录，领域真值仅供测试。结果根只放本轮 `status.json`、`manifest.json`、`study.ts`及测试/类型配置、`runs/`、`evaluations/`、`repair-events/`、`summary.json`、`accounting.json`，不额外建十几份说明文档。研究过程追加现有研究正文；实现说明同步现有开发指南/usage。

## 五、AU0–AU21 工作队列

每个实现任务都拆成：写指定反例 → 确认按预期失败 → 实现 → 同一测试通过 → 适用回归 → 记录/提交。新文件先有可失败的接口测试，不写镜像实现的凑数测试。

### AU0 接管及失败映射

- [ ] 登记基线和本轮状态，核对四个已暴露任务及封存；只点验与六类断点有关的AT原件。
- [ ] 建立 `model/` 与 `evaluator/` 路径隔离；model仅承载用户原请求/政策/前提和原始源码选择。评阅、预期结果、正确行号清单、repair-event不进入运行上下文。
- [ ] 为每个断点登记触发案例、共享模块、可观察修复现象；保留原始问题及全部义务。
- [ ] 创建薄runner状态和中断恢复入口，恢复时只接续已知未派发工作，不重发未知完成请求。

### AU1 设计内部合同与输入兼容

- [ ] 在本任务书和spec写出v2 operations/questions、共享事实、调用实例、义务动作、失效规则的实际接口；解释如何投影到旧checker。
- [ ] 写v1兼容、v2多问题同操作、不同操作不能误合并、policy/scope问题不重复找入口四组失败测试。
- [ ] 定义 `operation-evidence-v1` 的实际策略枚举、两入口参数和日志字段；旧默认保持。
- [ ] 编写从原始自然任务到声明的普通使用流程，机械信息由宿主派生；完成设计自检后连续实现。

### AU2 外部实现到本地结构原型

- [ ] 阅读CodeQL RestFramework相关模型和测试、Cedar求值分支、RepoAudit工作队列；只摘录具体机制和限制到研究正文。
- [ ] 对Python/DRF和Go各做一个零模型结构探针：别名/继承/receiver/实际调用位置；比较薄AST适配与可用CodeQL查询的定位覆盖、准备成本和来源可追溯性。
- [ ] 当前环境已发现Bun/Python，Go未在PATH中。允许为只读解析器增加明确依赖或使用成熟语法树库；不把安装失败变成回退纯正则后宣称完成。禁止执行目标仓库build/install脚本。
- [ ] 选择可维护的实现路径，记录确切依赖版本及来源许可；完成后进入实现，不将整仓静态分析平台设为前置。

### AU3 操作归一化与共享事实

- [ ] 实现operation-program/operation-facts及schema分发；operation先绑定真实入口，再让相关问题引用。
- [ ] 解释模板与调用实例分开，宿主管理source/operation/question投影身份，保留原问题和精确前提/政策来源。
- [ ] 测试重复问法共用来源、不同对象调用隔离、错入口撤回后依赖失效、原问题仍全部交付。
- [ ] 将失败草稿与接受材料分开，结构无效不能覆盖现有正确事实。

### AU4 结构索引、名称和调用绑定

- [ ] 在structure-index实现源码位置、限定名称、import/alias、类/receiver和调用候选；source_read仍展示原字节/行号。
- [ ] 匿名反例包含两个模块同名create、注释假函数、alias调用、继承override及对象返回；唯一词法名称不得通过结构绑定。
- [ ] 对没有唯一解析的调用输出候选与解析缺口，保留模型进一步取证渠道。
- [ ] 所有索引/读取成本进入已有统计，复用来源校验，避免另建重复哈希/审批链。

### AU5 框架模型与对象传递

- [ ] Python/DRF连接route/view/mixin/serializer/save中的相关调用与对象，Go连接route/handler/receiver/service及参数传递。
- [ ] 模型描述框架关系与适用版本，项目函数名仅作为解析得到的绑定；禁止Paperless/Gitea专用成功分支。
- [ ] 对被检查对象A而实际返回/创建绑定对象B、绕过基类的override、错误receiver各写负例。
- [ ] 真实源码结构探针输出实际关系和剩余缺口，不预填授权答案。

### AU6 义务驱动补读与解释调度

- [ ] 将未满足的entry/principal/resource/guard/effect/exception义务编译为可执行动作，候选来自结构索引和明确模型解释两条来源。
- [ ] 模型故意漏报决定性helper时，结构候选仍能触发补读；读过未解释则进入解释而非重复读取。
- [ ] 共享操作的policy-comparison与scope问题复用来源解释，独立问题不因一个缺口停摆。
- [ ] 记录每次动作的触发义务、关系、读取/解释结果及关闭理由；无进展时切换到缺失关系或明确边界。

### AU7 有限授权语义与未决条件

- [ ] 扩展实际需要的map lookup、集合成员、显式有序值比较，以及参数化主体/资源条件；保留原谓词兼容。
- [ ] 测试缺键与null区分、未知前提残余条件、不同权限顺序、类型错误、短路与互斥分支。
- [ ] 保留源码中实际表达的权限关系；模型不得用角色名字自动补层级。
- [ ] 求值结果给出值/残余条件/解释错误及来源，分别驱动回答、补证和修复。

### AU8 领域摘要与关系组合

- [ ] 在现有semantic-flow/procedure-summary上支持参数化对象guard、返回对象及有限相关效果摘要，保留正常/拒绝/操作错误路径。
- [ ] helper摘要与caller实例按显式参数和对象关系组合；绑定失败只影响相关义务。
- [ ] 同一fixture做精确展开与摘要求值配对，覆盖条件、返回、被保护对象和结果；故意删分支或换对象时必须发现差异。
- [ ] 环/动态/超界保留具体未决项；不能通过删原义务或提高complete标志达到通过。

### AU9 结论检查到下一动作及同源交付

- [ ] 将缺入口关系、错对象、未解释helper、分支缺口等诊断映射到具体动作，复用现有focus恢复与局部事务。
- [ ] 宿主产出当前有效的结论/条件/引用骨架；native自然说明使用同一快照，重要结论相冲突时纠正并保留原答。
- [ ] 测试错误第二次检查清除旧结果、范围说明不触发新业务入口、被拒绝路径无需声称不可达效果成功。
- [ ] 结果分别报告机械checked、源码语义、任务充分性，保留未解决原因。

### AU10 两入口与第一条真实纵向链

- [ ] inquiry和native接入相同operation核心、结构适配器、预算和日志；修改现有CLI帮助与测试。
- [ ] 用Gitea CreateIssue、Paperless ShareLink create各一次真实新策略调试，模型从允许原始源码自行定位/解释；首答完整保留。
- [ ] 按统一失败处理立即修复并复验；同一共享缺陷暂停所有受影响待派发位置。
- [ ] 至少推进到可明确观察“定位正确—关键依赖展示—对象/条件进入解释—当前结论”的链。若仍失败，回到AU3–AU9修改接口，不能直接跑满主面板代替修复。

### AU11 材料级复用与变化失效

- [ ] 扩展inquiry-reuse区分结构材料、模型解释与结果；partial材料恢复保留原等级，全部结论重新检查。
- [ ] 建立source/symbol/candidate-set/framework依赖索引，覆盖helper修改、新增override、alias/route变化。
- [ ] 政策变化不复用旧policy mapping；前提变化不保留受影响binding；相关行为解释按依赖处理。
- [ ] 测试“无关文件变化保留有效材料”与“旧已读文件不变但解析变化失效”成对案例；不触碰旧会话快照。

### AU12 真实原任务与变化任务普通使用

- [ ] 两份完整原skill分别绑定ShareLink create、CreateIssue；原任务与一个明确政策/前提变化各一次fresh，共4位置。
- [ ] 通过普通 `skvm run` 原样加载skill与参考资料，新策略实际发挥作用；其余skill职责保留。
- [ ] 检查自然说明、当前结构结果、实际关键取证和原问题覆盖。生成的声明/工具包不得由主代理手补正确图。
- [ ] 每个不良位置进入当场针对性修复与复验；原/修结果分别评价，不能只保存最后一版。

### AU13 作者输入与原字节消费

- [ ] 两个原skill各生成原稿/变化稿，共4稿。作者只见原始任务、源码范围、完整skill和独立政策，不见评价答案。
- [ ] 优先让作者声明operation与义务，机械路径/版本由宿主派生；格式、任务忠实性与消费分别记录。
- [ ] 每稿最多一次正常字段诊断修订；合格稿按原字节进入普通消费者，共4计划消费位置。
- [ ] 下游共享实现失败修共享代码，保持作者原稿。未经真人实际操作，不填真人分钟或人力节省。

### AU14 政策、前提、源码变化配对

- [ ] 对同一操作分别做政策变化、前提变化、源码变化；每种fresh与materials-previous各一次，共6位置。
- [ ] previous可恢复依赖有效材料，旧答案不导入；partial基础的材料复用单列，完整任务复用要求两边实际充分。
- [ ] 源码变化仅发生于本轮开发副本，原件不改；必须反映被移除的控制或改变的对象绑定。
- [ ] 比较实际读取/解释/重算次数、最终答案和总成本，记录失效理由；无法安全复用的部分明确fresh处理。

### AU15 四任务三臂质量面板

- [ ] 运行前登记四个原始任务：OWUI ingestion、Paperless Download、ShareLink create、Gitea CreateIssue；原始任务问题/政策不得按结果裁剪。
- [ ] 三臂各4位置，共12首位置，均经普通native入口并加载同一完整原skill：N为普通允许源码工具、无inquiry编译/检查约束；M-O为Markdown自然任务经生产前端归一化后使用新结构工具与operation核心；D-O为语义等价声明加同核心。三个Python任务使用归档Cloudflare包，Gitea使用归档GitHub包。实验臂名称只放runner配置，不新增平行CLI。
- [ ] N按自然答案独立评价，无结构输出不判语义失败；M-O/D-O的公开任务信息、完整skill、来源、模型、预算及修复机会一致。自然前端与声明前端各自生成内部计划的差异和成本完整计量；若当前native入口无法表达这两种前端，AU10补生产接线后再比较，不能在runner私造方法。自动声明/准备成本计入，不能给D额外真实答案。
- [ ] 新核心对照检验执行支持，M-O/D-O检验表达差异。AT旧结果只作历史诊断，不能与新版混成同版本效果。
- [ ] 逐行评阅后再派受同一路径影响的后续行；已知共同缺陷立即暂停修复，不为完整首轮继续制造失败。不同版本首轮分块展示，不把修后结果覆盖首答。

### AU16 小型机制消融及实际浪费修复

- [ ] 仅对真实轨迹中已使用的机制做诊断：选择不同结构任务，分别取消operation共享或义务驱动补读，最多4个初始位置，其他条件不变。
- [ ] 未采用或仍被共同缺陷阻挡时，把调用投入共享修复，记录消融不适用原因。
- [ ] 针对重复源码、重复解释、全历史上下文和冗长工具schema修通用渲染；不删除决定性源码或原始档案制造节省。
- [ ] 给出“机制实际被用到→哪类错误变化→质量与开销”的逐项结果，避免仅以token下降认定全面成功。

### AU17 独立源码评阅和修复归因

- [ ] 对所有实际运行位置核对终答、真实源码和原始义务，分别列正确、遗漏、错误、条件不足、传输/预算/框架缺口。
- [ ] 重点核验两任务的主体/资源同一性、owner/权限分支、字段传递和实际效果范围；不得把中间轨迹正确内容补成终答。
- [ ] 独立只读审查可以定位证据，主开发者点验并裁决；说明是AI审查还是人工，形式校验不替代源码质量。
- [ ] 每项失败关联repair-event、是否适用、是否实际复验及结果。修订基于共享原因，不能向被测模型透露oracle答案。

### AU18 联合回归与零调用重放

- [ ] 一次运行受改动影响的领域、源码工具、provider、native、CLI测试，主及本轮runner类型检查。
- [ ] 从本轮raw报告重算汇总/调用/成本，检查首轮、修订、未运行、未知请求均有位置；复用现有原件绑定，不新建多层冻结链。
- [ ] 验证旧默认与v1输入兼容、新v2及策略显式可用；不重跑所有历史付费面板或全盘审计。
- [ ] 文档与目录检查一次，只有具体失败才修后复验；不建clean worktree，不做临时目录整盘清理。

### AU19 研究复盘与可使用说明

- [ ] 在唯一研究正文追加本轮“问题—设计—实际采用—效果—未解决”，明确哪些借鉴外部实现、哪些是待证贡献。
- [ ] 更新developer-guide、usage与一个现有授权示例，提供从原始任务开始、查看结果、修改前提、重新使用的实际命令。
- [ ] 同步current-status、plan、spec，只保留当前入口；不新增一批阶段Markdown。
- [ ] 汇总工程、真实使用、方法效果、成本四项结论；涉及的全部旧结果、封存及保护边界保持。

### AU20 发布与工作区责任

- [ ] 按模块提交，仅推用户origin；不触碰upstream、不提交缓存/凭据/他人材料。
- [ ] 最后核对分支、远端提交与本轮暂存范围；所有源文件与报告路径可由普通入口找到。
- [ ] 同步短conversation log，提供未达项的具体模块、触发任务、已经尝试的修复及恢复命令。

### AU21 完成判定与停止

- [ ] 清点所有计划位置及适用任务，确保没有将未执行、仅单测通过或被阻断的位置写成成功。
- [ ] 目标验收看两条结构不同的真实原skill链及变化使用、具体系统缺陷的回归、实际比较与成本；有限队列执行完成与目标达成分别记录。
- [ ] 若依赖能力仍无法完成，记录明确边界和已做接口修订，收口为未达状态，不无限重抽也不假称完成。
- [ ] 全部适用工作终结后结束本队列；无新增用户指令不扩展到其他安全任务类、整skill转换或未见样本研究。

## 六、失败测试与验证命令

机制测试矩阵必须同时有成功与反例：

| 输入变化 | 预期现象 |
|---|---|
| 一个操作拆为行为/政策/范围三题 | 来源解释共享，三题仍分别交付；政策/范围不查找三个新入口 |
| 同名create属于另一个模块/资源 | 不被选入当前调用链 |
| 子类覆盖基类方法、import使用alias | 定位实际方法；不明解析保留候选 |
| 模型不提交已存在的相关helper | 结构关系触发待核实补读，而非默认为覆盖完整 |
| guard检查A、effect关联B | 同对象义务失败并定位绑定缺口 |
| 未知owner、权限缺键、显式null | 三种状态不混同，不填默认成功/失败值 |
| 摘要删除一个条件分支 | 与展开计算差异被检出 |
| 政策变更 | 来源解释按依赖保留，政策与结论重算 |
| 新增override但原已读文件不变 | 解析/candidate-set依赖失效，旧解释不继续当current |
| partial会话含正确结构材料 | 可恢复材料并重新核验，整体checked不继承 |
| 同一无效修复连续出现 | 停止原样循环，转具体缺口或共享接口修复 |

测试代码必须断言实际结果而非只检查字段存在。每个新增测试文件首先在缺实现/旧实现上失败，再实现。源码fixture只执行我们自己的分析，不执行业务代码。AU1/3可先在 `operation-program.test.ts` 写入以下接口红例；当前v1编译器对有效v2返回needs-input，首项应据此失败，修复后两个断言组均通过：

```ts
import { expect, test } from "bun:test";
import { compileAuthorizationInquiry } from "./inquiry-program.ts";

function declaration() {
  return {
    schemaVersion: "authorization-inquiry/v2", mode: "behavior",
    operations: [{ id: "create-item", request: "Assess item creation", entryHint: "items.create" }],
    questions: [
      { id: "behavior", request: "Which caller can create the item?", operationId: "create-item", intent: "behavior", premises: [] },
      { id: "scope", request: "Which source-visible limits remain?", operationId: "create-item", intent: "scope", premises: [] },
    ],
  };
}
test("one operation shares entry work while retaining all questions", () => {
  const input = declaration(), before = structuredClone(input);
  const program = compileAuthorizationInquiry(input);
  expect(program.status).toBe("ready");
  expect(program.questions.map(q => q.id)).toEqual(["behavior", "scope"]);
  expect(program.queue.filter(item => item.kind === "entry")).toHaveLength(1);
  expect(input).toEqual(before);
});
test("a question cannot silently bind to an absent operation", () => {
  const input = declaration();
  input.questions[1]!.operationId = "another-operation";
  const program = compileAuthorizationInquiry(input);
  expect(program.status).toBe("needs-input");
  expect(program.diagnostics.length).toBeGreaterThan(0);
});
```

后续queue与旧投影接口若因真实实现需调整，应同步此代码与AU1合同，保留“一份入口工作、两项问题、输入不被改写、缺引用拒绝”的语义，不能只改断言让旧重复展开通过。

从仓库根执行，按阶段选择相应文件，新增文件创建后方执行：

```powershell
bun test ./src/task-dsl/authorization/operation-program.test.ts ./src/task-dsl/authorization/operation-facts.test.ts
bun test ./src/benchmarks/authorization-dsl/evidence-preparation/structure-index.test.ts ./src/benchmarks/authorization-dsl/operation-work.test.ts
bun test ./src/task-dsl/authorization/procedure-summary.test.ts ./src/benchmarks/authorization-dsl/inquiry-reuse.test.ts ./src/benchmarks/authorization-dsl/inquiry-native.test.ts
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl
bun run typecheck
python -B -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python -B scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
```

AU0/1创建薄runner后登记其真实typecheck、单位置运行和replay命令。本文件列出的新接口/路径是要实现的责任，不代表已经存在；执行记录必须保存实际采用路径与命令，避免向用户给未验证命令。

## 七、实验输入、预算与即时修复

四个原始输入位于AT `model/inputs/owui-ingestion.json`、`paperless-download.json`、`paperless-share-create.json`、`gitea-create-issue.json`。Paperless采用AT manifest声明的locked-framework active input，不能误用缺框架旧输入造成假退化。源码范围及原始问题从这些输入机械继承，拷贝到AU时仅重定位sourceRoot并记录来源修订。

完整原skill来自 `results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/` 与 `github-security-review/`；保留整个包和参考加载。AT作者稿/消费者用于定位缺陷，正式AU作者仍从未填目标的原始任务生成。

首轮计划：调试2、native4、作者4、消费者4、变化6、主面板12，共32位置；可适用消融最多4位置。具名修订额外记账。分母用于不漏任务和不藏失败，不是付费总上限或必须耗满的配额。单位置默认24 provider请求、64工具动作、768KiB累计源码展示、32MiB读取/索引、6000输出tokens、300秒单请求超时；作者可单列较小预算，保持原/变一致。AU1用源码大小与确定性探针校准后登记，比较块各臂一致，旧默认不改。所有declaration/fallback/continuation/review计入真实请求，结构计算独立计量。

每次不良表现立即执行：

1. 保留raw、当前版本、原始终答和明确诊断；区分格式/定位/未读/未解释/错误语义/预算/传输/评价争议。
2. 共享bug暂停受影响后续行，写反例修生产实现，再跑触发任务；不能以“先跑完首轮”为由继续。
3. 每个可修问题至少尝试一次针对性修复和同题验证；同原因可共用修复，但逐项记录适用和观察结果。独立缺口继续开发。
4. 两次同根因没有新的解释或交付进展，回到接口/任务粒度/结构模型调整；不原样重抽、不仅增token预算。扩预算诊断另列。
5. 源码不可得或动态关系无法可靠解析，保留具体边界，推进其他工作；不得臆造摘要。未知完成请求按封存协议处理，已响应但USD未知继续如实计量。

成本记录模型请求、完整input/output/cache（cache只计一次）、各阶段耗时、源码/框架准备成本、可获得USD及unknown。开发代理与项目provider分账；真人时间没有实际观察就不估算。研究模型使用源码和用户条件，评价方独立核对；自动生成结构候选的过程/成本可查。

## 八、验收与恢复

| 验收面 | 应交付的证据 |
|---|---|
| 系统修复 | 多问题共享正确入口；独立结构候选发现漏报；对象/权限摘要与展开一致；变化失效具体可查 |
| 完整实际使用 | 两份原skill原/变真实使用，自然说明充分且检查结果一致；失败与修订逐项保留 |
| 编写和复用 | 4稿原字节消费；3类变化fresh/materials-previous配对；部分材料与完整任务收益分列 |
| 方法研究 | 12首位置及修订/未执行原因；结构工具、领域执行和表示方式的收益分别归因 |
| 可维护性 | 两入口共用核心、旧默认兼容、普通例子可运行；研究集中在一个正文，成本与恢复入口可读 |

恢复点只需记录stage、实际代码版本、当前失败/修订、最后已知请求、下一未派发动作、相关文件。进程中断后读取它和当前Git，不重新开始全套审计。原件完整保留，临时副本集中在 `D:/skill优化/project-maintenance/runs/authorization-operation-evidence-v1/`。

## 九、执行记录

- 第七轮`operation-duty-granularity-v1`5/5响应即transport-failed，累计105/105；1 operation保留3问及原责任，2个current units，无终答。原始两拒绝payload均为合法typed source calls加广告中可见的focused schemaVersion/focusId；strict pure-tool分支禁止这两个路由字段，形成广告/解析不一致。下一小型TDD允许pure source step的显式typed路由元数据并无损降低为原tool calls，元数据不选择focus、不接受语义；缺calls、invalid metadata/调用及多余action payload拒绝。模型广告精确分支同步，原件零调用重放后同题`source-step-metadata-v1`复验，不扩预算。
- 本阶段该red及AU13四个red、portable/admission两red、ordinary对账red均转green，联合791 pass/1skip/5093断言与主/AU双类型通过。独立wire核验确认calls原样且无解释；作者/消费核验的undefined对账案例在实际capture（number/null）未成立，但补正整数/全响应约束及null/undefined/零/fraction/缺报反例。作者预算原/变12步、最多一次字段修复；消费者在实际原报告SHA绑定的忠实性/raw工具评阅后才准入。两原失败source payload零调用重放通过；语义、实际采用和效益未验收。

- AU13薄接线计划：作者仍通过完整原skill的ordinary run，从原brief、public current policy和机械source/scope metadata写v2配置及USAGE，不提供目标问题集、答案或控制图；两variant统一12步作者预算，原始完整bundle、actual conversation和source index前后身份保留。最多一次字段修复，未知完成跨arm封存。消费者必须匹配登记作者/variant/input/完整skill及draft/USAGE SHA；复制配置原字节与允许的source快照，不重写相对sourceRoot，再以ordinary完整原skill+同operation核心消费，原自然brief保持、完整声明零重复author调用。匿名TDD覆盖metadata-only输入、policy/source身份拒绝、原字节消费和无有效稿零调用准入；source/tool副作用由raw独立核验，未核验target执行记unknown。仅results薄接线，当前第七轮不改变共享运行核心。

- 第六轮`direct-focused-step-v1`已关闭：21派发/21响应、六问终答均unknown且检查拒绝；14个current source units主要重复同一class/route/framework体，没有accepted serializer/exact-object单元。累计100/100、美元未知。独立SHA/source/轨迹核验及主抽查确认：容器恢复形成终答（2 wire failures、16无损格式归位），但D1把同一创建动作拆成5个operations，反复取证而未闭合授权。下一针对性修复先用匿名反例：明确operation为用户实际动作，同一动作的endpoint/inheritance/serializer/policy/scope责任共享operation；多动作仍分别声明，宿主不猜测合并、不改模型问题。主读actual structured contract发现union仍自动套value，引发calls外壳错位；改广告为单一根object及kind枚举，保留每动作严格union解析和旧输入合同，不增加猜测归位。仅调整共享作者指南与operation模型广告，回归/双类型/文档后同题`operation-duty-granularity-v1`修订，不扩预算、不投喂评价结论。作者/消费者/变化薄接线待此阶段后继续；语义未达与格式改善分列。
- 此修复4个预期red转通过，focused24 pass/223断言、联合784 pass/1skip/4994断言，主/AU双类型及独立只读接口核验通过。16个实际归位payload零provider复核逐一保持完整显式内容，原件SHA未变；第四/五轮旧wire故障通过真实六问交付与此证据具名解除，所有model-draft语义失败保留。独立评阅的无条件policy-satisfied及normalization序号误述由主原文裁定纠正。尚未证明新粒度实际改善。

- 第五轮`focused-envelope-routing-v1`仍transport-failed，20派发/20响应、无终答，累计79/79；独立轨迹核验指出7次容器格式拒绝、normalization为0，接收中间解释不等于交付。连续两轮同因失败，下一调整公开operation structured step接口：将当前focused action及identity/unit直接放到一个根容器，来源calls仅可选附带；final亦直接使用focused result字段。宿主仍无损转成既有核心step，普通native工具和旧focused广告合同保留。同步结构入口指南消除tool/control与action两层kind的矛盾，匿名TDD覆盖每阶段/批量/empty-no-op calls/实际provider广告与解析；不猜已冲突的kind、不填源码语义。验证后同题具名修订，再以真实改善记录解除共同容器故障，质量责任继续独立。
- 此调整与ordinary/cap接线已完成TDD：4个接口预期red转通过；预算3失败例转通过；薄runner4 red转通过，中央任务身份额外red/green。fresh联合782 pass/1skip/4944断言、主/AU双类型通过。独立interface代码核验未发现证实缺陷。普通审查的原brief-hash疑点经实际CLI整段输入定位未成立；改用中央naturalRunTaskId，actualreference reads按实际空/非空完整记账，不强制读所有安装文件代替原skill质量评阅。immutable supplementary registration保留4输入、两完整skill 22/8文件与publicchangedpolicy；尚无普通provider调用。

- 第四轮`source-transaction-batch-v1`在首次解释时transport-failed，3派发/3响应、0接受source units，累计59/59；没有终答，不能以历史partial替代本轮。原始解释把完整focus元数据/unit/calls放在step根，`controlDelta`仅含also；一次受限修复又重复套同kind/value容器。独立评阅与主SHA/原始响应抽查确认属于容器协议问题，尚无批量质量进展。下一修复只对明确完整的focused payload及同kind重复容器作无损归一化；不补unit、focus、调用、权限或答案，冲突/多义字段拒绝。匿名TDD/共享回归与主类型后同题具名修订，affected wire/source/delivery派发继续暂停。
- 无损格式修复已完成：2个预期red断言转通过，含冲突拒绝的3新反例与旧focused/wire共23 pass/125断言；共享750 pass/1skip/4677断言、主/AU双类型通过。原第四轮两个失败payload在当前解析器零provider/零工具重放均可解析；尚未接受其语义或交付答案。实际4个声明问题逐项not-delivered已存SHA绑定评阅，独立轨迹核验中第三轮单元数的误报已按原件7个校正。下一实际用例为`focused-envelope-routing-v1`修订attempt-4。

- AU12/AU15接线计划：新增results侧薄ordinary runner，调用真实`skvm run`，N/M-O/D-O均保留同一完整原skill、公共自然任务/当前policy/来源及预算；补充不可覆盖的skill bundle SHA清单和公开changed-policy身份，不重写32位置原manifest。记录实际reference读取、完整trace与任务hash绑定raw conversation，作者/原字节消费者随后复用同一入口。N无形式检查标作not-applicable，不能伪造checked。公开native尚无6000输出token限额选项，需小型TDD补齐实际dispatch cap后才能派发普通比较，不能只在研究manifest写预算而不执行。准备接线不修改正在运行的结构调试核心。

- 2026-10-06 第三轮ShareLink `source-link-c3-v1`已关闭：21派发/21响应，4个源码绑定、7个source units，3问仍partial；累计研究provider56请求/56响应，USD未知。独立源码/轨迹核验与主代理抽查确认：前两轮解释相同认证体的重复上下文以及revisit句柄漂移仍占用会话；可得serializer/object-permission源不能列作不可得事实。下一共享修复计划：匿名反例验证依赖的actual caller receiver、revisit稳定替换、同操作read候选与格式错误退役；新策略允许单次解释至多4个明确已读且当前完整窗口已展示的source units，沿用同一provider/runtime/budget，不推断控制意义。旧单体接口兼容。完成TDD、回归/双类型和文档同步后提交并同题修订；完整技能登记/普通入口接线随后推进。
- 同阶段9个预期失败反例已转通过（第一例的缺parameters测试fixture先修正，再确认receiver断言的预期失败）。独立只读代码核验未发现已证实缺陷；主代理另补source-review correction的receiver漂移反例并修复。最新联合770 pass/1skip/4845断言与主/AU双typecheck通过。第五个附带单元受schema max3限制，模型unit不能提交宿主source字段；本轮真实质量/费用仍未宣称改善。

- 2026-10-06 第二轮共享修复完成匿名验证：唯一源码callee自动绑定及旧关系撤回，模糊/未解析同名receiver不提升为唯一；按实际C3解析零参数super，宽引文不替代具体source unit解释，退役work项的参数修订保留receiver。首批8个失败反例及独立核验后的4个失败反例已转通过；最新定向63 pass/326断言（与86项旧定向集合重叠，不相加），新字节联合761 pass/1skip/4824断言、主/AU双类型与diff检查通过。普通native显式M/D1选项3失败例转通过，独立入口核验无问题。旧help ancestry文字已改为实际row-id；source-only说明不要求未请求部署验证。下一动作：提交origin、同题`source-link-c3-v1`修订，不使用评价侧结论做模型输入。

- 2026-10-06 AU10第二次ShareLink具名修订`source-context-receiver-v1`已关闭：21派发/21响应，实际接受9个source units（首次3个），6问终答均partial；完整语义链仍因入口callee未链接而失败，另保留一次缺claim格式诊断。原件SHA与独立评阅存入本轮results。下一共享修复计划：匿名反例覆盖唯一源码关系的自动callee身份绑定与模糊关系拒绝、按实际C3上下文解析零参数super；仅绑定模型已声明调用，不推断参数/guard/permission/effect。已有helper的参数链接优先于继续展开候选。完成定向与较广回归/类型检查、同步文档和提交后再同题具名修订。普通原技能入口增显式`--authorization-method=M|D1`，M整段自然任务机械归一化且声明调用0，D1模型声明计入同一会话预算；3个预期失败已转通过，尚需较广验证。累计研究provider35请求/35响应，费用未知；quality/普通使用/作者/变化面板尚未派发。

- 2026-10-06 AU10首次ShareLink调试已关闭：14派发/14响应、64工具动作、3个source units，最终partial，首件与raw保留。源码已读的文档校验尚未被解释；根入口把静态register写成运行时call，继承方法重复展开占用取证预算。当前修复计划依次为：匿名反例验证raw-string路由与继承接收者；只在类入口展开DRF配置义务、方法沿实际AST调用推进；显示/选择已有来源工作；增加静态关系步骤而不赋予权限含义；跑定向回归后同题具名修订。AU11材料级复用正在实现，保留有效未评阅source模板，重新生成规则与政策判断，不继承旧终答/check。独立源码评阅与主代理裁定写到本轮results，不进入model目录。

- 2026-10-06 AU10派发准备：714联合pass/1skip/4588断言，主类型与AU类型通过；薄runner 3检查/16断言通过。实际命令`study.ts develop <debug-id> [repair-id <exact-row-id>/attempt-n] | replay`，通过旧generic claim/repair/replay和生产`executeLocalInquiryRun`接入；32原位置不重写，未知跨arm封存，先逐调试位置核验/修复再面板。优化后结构探针另存`structure-probes-optimized-v1.json`；此处仍无研究provider结果。第二次准备时照旧help传literal original/attempt-1，在claim/provider前被拒，provider调用0；随后使用实际row ancestry。

- AU9诊断动作共用focus的revisit/link/条件回答；独立只读核验后先写三个失败反例，再修Go最长模块绑定、首次候选选择阶段更新及失效依赖旧版本重激活。错误入口重新定位立即撤回旧facts/投影/helper，原始记录保留；42项针对性检查通过。结构metadata仍是固定原索引候选，无源码读证据，最终快照终检负责拒绝运行中变化，不重复全库读取。

- AU2–AU8生产原型与匿名反例已落地：operation facts、Python/Go AST名称与继承候选、路由/DRF义务、有限权限求值和对象摘要共用旧focused循环。首次结构探针原件保留；普通自然入口整段任务机械归一化，无额外声明调用。工程原型不等于阶段验收，诊断动作、材料失效、真实调试/双入口/面板与独立评价仍未完成，研究provider调用0。

- AU0 已接管，启动 Git 为 `dfe7ec32`、干净。`authorization-operation-evidence-v1/study.ts init|check` 登记32首位置、重定位四原输入（Paperless使用locked-framework）及seal SHA；model只读取显式白名单，2个接口检查通过，无provider调用。
- AU1 实际接口：`AuthorizationInquirySchema` 分发 strict v1/v2；v2 operations `{id,request,entryHint?}`，question 增加必需 `operationId,intent`，其余原字段保留。program新增 `operations`（sourceQuestionId为宿主选取的首个behavior题，否则首题）、`operationQuestions`及 `originalDeclaration`；每操作只编译一套六类来源工作，旧checker消费每题的独立投影。v1每题保留独立操作，绝不凭问法自动合并。运行先接受当前完整source入口绑定，再从其参数化source units投影，question级premiseValues/policyRules不共享。来源身份包含repo/ref、入口symbol与源码修订；调用身份仍由semantic-flow的显式arguments与invocation管理。结构/解释/机械checked分别存储，semanticSupport均unreviewed；入口撤回与依赖revision变化撤回关联投影，旧草稿保留。新增策略沿用focused循环，结构取证插入同一worklist，不另建provider循环。

- 2026-10-05：根据研究§7.50–7.51与当前接口核验制定AU0–AU21。用户明确要求派发 `gpt-6.1-sol / max` 开发。此时仅任务书/方法合同与导航同步，生产实现和本轮实验尚未开始。派发后的新线程负责连续推进和更新状态。

- 2026-10-06 AU10第八轮/AU14阶段：同题第八轮13/13known、transport-failed，累计118/118；来源metadata实际三步通过，7单元含initial/精确文档validator，无final。独立只读`au_share_eighth_wire`/`au_share_eighth_quality`与主SHA原件核对完成；主纠正phase-mismatch推断、遗漏单元/来源及只计末请求token。named `link-explanation-v1`仅保留typed原说明，精确helper/参数反例继续拒绝，原seq12无损零调用proof；seq5/13不重写。
- AU14显式实现计划已按TDD落实：先写6位置/任务identity、公开policy/premise只改对应字段、known partial与unknown反例、per-material source变化和单文件唯一条款测试；再复用initialize/compare/executeLocalInquiryRun与source-copy/edit helpers，完成原输入同SHA配对、partial-only lock、旧答案不导入、previous拒绝不自动fresh。未使用AT full-base准入，也未派变化provider。缺实现及completionUnknown反例先红，修后focused/联合通过。
- 新鲜联合797pass/1skip/5123断言，AU类型通过；测试literal修正后主类型复核。先提交/推origin，再同题第九轮验证link-explanation-v1；若仍有相同语义或阶段缺口，按实际原因调整接口或有限未达归因，不原样无限重抽。尚未执行的Gitea、ordinary/author/consumer/changes/quality保持未运行。
- 2026-10-06 AU10第九轮/AU18计量：8/8known、transport-failed，累计126/126；1操作/4问/10来源单元含owner-aware helper，全部无终答。独立只读ninth review与main原件裁定保持，实际未调用link不推广其修复效果。已按重复根容器遗漏原因改为统一metadata边界：省略固定version才派生，typed source reason原文保留，显式错误版本/focus/calls/语义仍拒绝。五阶段与错误反例先红后绿，两原payload0provider proof；下一次必须检验这一统一接口，不再按任意未知字段逐个扩大语言。
- AU18计量显式计划落实：缺实现时先红，复用AT capturedProviderRecords/proofStatus与AS sumUsage，构建原件SHA review绑定、单次ordinary/structured计量、首答修订面板、作者独立raw目标执行审计和活动进程收束边界。三个计量反例绿；独立au_accounting_review未找到当前原件重复计量/成本抹零问题，主增强活动进程字段。802pass/1skip/5170断言；等价schema类型修正后11定向pass/193断言及主/AU类型绿。9闭合/126known/0未知/0新provider重算已生成accounting/call-index/summary。
- 先提交并推origin，再同题`focused-context-routing-v1`第十轮实际检验，然后逐行推进其余registered debug/ordinary/author/consumer/变化/质量。有限队列与研究目标都尚未完成。
- 2026-10-06第十轮未知完成：request16网络timeout，16/15、累计142/141，原task16位置全sealed；debug保留timeout-unknown，其他15位置admissions零调用blocked-sealed-unknown-completion。不会重发Share、换入口/模型/政策/source/author身份。AU12/13/14/15中对应Share位置现以具体封存证据为未达，不能写为实际完成。
- 独立au_share_tenth_review与au_unknown_scope_review及主SHA/guard/ledger点验：source95有效、current16单元不是final；typed source reason实际采用、omitted version未实际出现。seq9实为interpret额外reason，动作名合法，不再扩大任意字段。已有ScopedAdjudicationSchema原report/proof SHA/retainTaskPause机制保留所有Share task-level pause，仅给显式16个其他task首位置释放共享wire/source/delivery暂停；实际assertNoUnknownTask在Share抛出、另外3task通过，0provider。timeout不进repairs improved。
- 后续有限计划调整：先提交原件/范围裁定/文档，再Gitea debug首次；Gitea native/author/consumer与三任务质量仍按原登记逐行实际评阅。Share相关消融/变化不适用原因须保留。当前accounting10归档attempt、0活动进程、1未知原请求，队列与研究目标均未完成。
- Gitea首轮原件SHA `39eb60cb7c01d2a39d1f4eadc2de1cb2660f52512133d7791b01e0676120ab0c`，11/11已知响应、transport-failed、三问无终答。独立raw/source审查与主精确safeParse裁定：seq10/11的interpret动作合法，拒绝源为额外typed reason；不是direct kind不受支持。内部fallthrough/步骤/数组值亦无效，不能通过格式恢复提升为正确语义。实施前计划：匿名每阶段反例先红，将reason统一为focused action的typed optional说明（defer仍必需），不选择focus、不补参数/对象/关系/结果；model/parser/native共享合同，让原解释体原样进入既有focus-schema诊断。原payload零provider重放应仅证明路由通过、内部错误仍拒绝。定向/共享回归与双类型、文档/原件提交后，同题`focused-action-explanation-v1`复验一次；任何语义重复仍按接口/有限未达处理，不原样无限重抽。
- 该阶段2个预期red转通过；36定向pass/364断言、804联合pass/1平台skip/5241断言、主/AU类型通过。原seq10/11 unit和reason保持，canonical routing通过而coreAccepted=false；独立探子的unsupported-kind推断由主原文裁定纠正并留在评阅。11归档原件零模型计量为153/152、1unknown usage/completion（原Share），fresh2580301/cache127360/output125295，USD未知。下一实际复验须单列新版本，不解除Share封存，也不把当前工程证明算作Gitea交付。
