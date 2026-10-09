# BB0–BB16：跨函数性质闭合、渐进解释与真实使用

> **For agentic workers:** 使用 `superpowers:executing-plans` 执行本任务书。连续完成有限队列；常规检查点无需等待确认。实现采用 TDD，遇到真实共享缺陷当场定位、修复和具名复验。父线程只负责本任务书和派发，接管线程负责代码、实验、共享文档及发布。

**Goal:** 让原始 skill 的授权任务中，跨函数的调用、对象传递、守卫和效果真正进入同一条可复查的性质检查链；再验证完整原题、原包消费和变化复用。局部闭合是开发里程碑，完整任务与实际收益分别验收。

**Architecture:** 复用现有源码索引、语义编辑、有限控制流、材料投影、账号 adapter 和 SkVM CLI。保留源码调用结构，将领域标注作为语义信息附着；沿真实调用实例的实参、形参、返回和 receiver 联系对象；逐性质检查可达路径并保留相关未知。新增行为显式选择 `operation-evidence-v7`，旧策略和历史重放继续兼容。

**Tech Stack:** TypeScript、Bun、Zod/Ajv、已有 Python/Go 索引和有限求值器。开发 `gpt-6.1-sol / max`；实验使用已授权的当前官方账号 `gpt-5.6-sol / high`。第三方付费 API 继续暂停。

**执行状态：** `paused-by-user`。用户于2026-10-09明确要求提交远端并停止本任务书，后续再重启。BB0–BB8工程通过，BB9/BB10真实pilot已完成但局部性质未闭合，BB11六位置同epoch比较已完成；BB12一个消费者交付、另一个中止且完成未知，BB13仅准备、六变化未运行。BB14已有部分计量与归因；本次保存和发布不标有限队列或研究目标完成。

**恢复入口：** 先检查 `consumer-owui-native/original` 原生命周期与保留的 `dispatch.lock`。本地runner及其直接子进程已退出，但没有已保存server终态；不要重发同请求。用户重启只撤销用户暂停，未知完成保护仍须按第六节处理。零调用状态命令为 `bun ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.ts status`。

## 一、接管、目标与边界

- 代码复核基线：`ad9367155a5c9876445cfca9bd30c9055cfe8afa`。接管时以包含本任务书的当前 `skill-ir-aot` 为准，先检查实际 Git 状态。
- 新 identity：`authorization-interprocedural-property-v1`。
- 新证据目录：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/`。由 BB0 创建；不要提前伪造结果。
- 临时源码副本、解压原件和运行工作区：`D:/skill优化/project-maintenance/runs/authorization-interprocedural-property-v1/`。只保存必要的可复现材料到仓库，不清理其他任务目录。
- BA 的 22 位置、4 尝试、20 未运行及通道暂停保持原记录。BB 接续未达工程责任，使用新身份和下述恢复规则，不补写 BA 的结果或把其队列标完成。
- 工作继续在 `skill-ir-aot`，不创建分支或 worktree；只推用户 `origin`。开发线程是本队列唯一代码/共享文档/Git 写者。
- 质量约六成、编写与复用约四成是开发精力安排。没有预设 DSL 必须胜出；原问题、政策和允许源码范围保留。
- 不增加新语言、通用解释器、完整安全平台或展示层。保留既有 MRO/receiver/super 能力；只有当前决定性调用确实需要的小范围修复才进入本轮。
- 不把等待额度、重复测试、重跑同因失败算持续开发。独立工程完成后如实验仍被外部阻断，留下准确的恢复入口；不将研究目标标完成。

### 必读顺序

1. `D:/skill优化/AGENTS.md`、`D:/skill优化/SkVM/AGENTS.md`，然后[当前状态](../../skill-ir/current-status.md)和本任务书全文。
2. [spec §14.41](../../skill-ir/skill-ir-aot-optimization-spec.md#1441-bb-interprocedural-property-closure)、[研究 §1、§7.63、§11](../../skill-ir/skill-dsl-research.md#763-bb-跨函数性质闭合的复核与开发决定)。相关基础设计由主代理亲自读，不能只依赖探子摘要。
3. BA 的 [summary](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)、[当前 runner](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/study.ts)、[任务书](2026-10-09-authorization-semantic-submission-and-adoption.md)中的输入、公共使用与恢复合同。
4. 按责任读取下表源码及其测试；先理解现有跨函数求值，再决定新表示的最小改法。确切修改代码由主代理亲自完整读取。
5. 普通入口参照 [usage](../../usage.md)及[开发指南](../../skill-ir/developer-guide.md)对应 authorization 小节。跨线程决定有疑问时再读根目录 handoff/communication，不通读全部旧日志。

## 二、已核实的问题与避免重复的误判

| 已核实事实 | 本轮必须解决的责任 |
|---|---|
| Download 修订有 7 份 current/available 材料，只采用入口；入口把 `self.file_response` 标成 primitive effect，生成 blocks 中没有 call | effect 标注不能抹掉源码调用；不能通过伪造材料采用计数解决 |
| `source-interpretation.ts` 的 effect/context 分支不走普通 emitCall；投影只连接 `kind=call` | 调用结构与领域角色正交，效果是否发生仍须检查被调函数和实际控制路径 |
| v6 binder 只查一个 skeleton；checker 又按同 source id/SHA 过滤 guard/effect | 同时修绑定、对象传递、可达性与检查消费，单加 resolver 不够 |
| 语法 anchor 表示源码位置；跨函数实参/形参 anchor 不同，同一 helper anchor 可被不同对象多次调用 | 以调用实例和已有值传递证明对象关系，禁止“同 ID 即同对象”或“不同 ID 即不同对象” |
| BA OWUI 已有 1 条 bound query、2 次语义检查；检查为 unknown，原因包含未采用 effect 和开放依赖，trace 为空 | 目标是当前材料真的被性质检查消费；不能再宣称“真实运行从未生成过 query” |
| OWUI root 的 await 创建/残余顺序已修；原提案离线恢复 3 次采用，真实复验 routing 失败 | 当前重放与新真实结果分列；不得把该失败笼统归因于 middleware 跨函数 |
| 现有 source-edit 保留合法草稿，显式 unresolved 也能进入不完整单元；已有多函数参数、receiver、super 测试 | 补公共提交到检查链的组合缺口，不重写现有跨函数基础，也不声称旧测试全是单函数 |
| v6 binder 不比较两个 resource anchor 是否相等；后续检查才判断对象关系 | 错资源的有效查询应产生 violated 或 unknown，而非一律当绑定格式错误 |

外部评阅中的“只改三个文件”“解析到 anchor 就正确”“任意守卫与效果找到即可 bound”均不是本轮设计依据。代码定位和研究依据见 §7.63。

## 三、实现合同

### 3.1 调用与领域含义分开

实际 source call 保持 call 身份、源位置、实参、receiver、结果和潜在异常。模型标注其为 permission/effect/context 时，不删除调用联系。一个调用可含多个有源码依据的语义侧面；类型层应区分这些含义，不能靠复制两个互不相干的节点假装同时成立。

调用了带 effect 标注的 helper，并不自动说明效果发生。提前返回、拒绝、异常以及未知副作用都要进入路径；caller 的 effect 候选和 callee 的实际效果不得重复计数。原始 primitive effect 仅在其自身有充分来源和适用语义时使用，无法下钻的调用保持具名边界。

### 3.2 跨单元引用与对象传递

- 引用必须限定当前 source unit、revision/源码身份、anchor 和 question/operation；运行时进一步绑定 call instance。模型选择宿主提供的引用，宿主生成机械身份。
- 解析只负责找当前引用，**不证明对象等价或守卫有效**。未知、过期、歧义和未注册来源分别诊断，不静默选第一个匹配。
- 用已有 `semantic-flow`/参数映射/receiver/返回值追踪建立对象联系。不同形参可来自同一实际对象，同一 helper 被两次调用也必须各自求值。无法证明则 unknown，不能凭变量名、文本相似或模型一句“相同对象”合并。
- 守卫要处于实际到达效果的路径上，顺序和分支正确，所需权限与效果匹配。只有已证明注册及调用联系的 middleware/decorator 才可进入路径；源码中存在某函数不是可达证据。
- 查询可以询问“是否存在必要守卫”。没有 guard 是待判断事实，不能让 Schema 强制用户先捏造一个 guard 才允许分析。

### 3.3 渐进解释与结果层次

合法字段、可用片段和未解释位置分别保存。部分解释可以支持一个范围明确的性质；遗漏分支、相关未知调用和异常仍阻断其影响到的结论。不得把未填 role 自动改成 context/no-effect，或绕过必要的源码读取。

结果沿用现有层次并统一显示：引用/传输有效性、材料可用与采用、查询绑定、性质 checked/violated/unknown、自然答案完整性。`bound` 只是查询可定位，`checked` 必须有当前证据和非空路径；确认违例同样是有用的分析结果。源码答案 full 与机械 unknown 可以同时出现，分别解释原因。

相关未知必须保留；与当前性质无关的残余按明确依赖隔离，而不是用 question 下的全部缺口封锁每个性质。任何 whole-task 完整主张仍覆盖原题全部义务。

### 3.4 兼容与更新

新增跨单元语义显式启用 v7；v6 及旧存档按原合同读取。复用现有控制结构，避免建立平行 IR。源码变化、引用 revision 改变、调用映射变化、无效新提交或政策/前提变更，按实际依赖撤回旧当前结果；保留历史轨迹。局部材料恢复不恢复旧 verdict。

## 四、代码责任与测试位置

| 责任 | 现有文件（仓库相对路径） |
|---|---|
| 策略和公共类型 | `src/task-dsl/authorization/control-slice.ts`、`semantic-flow.ts`、`source-materials.ts` |
| 语义编辑和 lowering | `src/task-dsl/authorization/source-edit.ts`、`source-interpretation.ts` |
| 性质声明、绑定、依赖 | `src/task-dsl/authorization/property-query.ts`、`property-dependencies.ts`、`property-demand.ts` |
| 路径和性质检查 | `src/task-dsl/authorization/control-conclusion.ts` 及现有 evaluator |
| 投影与运行接线 | `src/benchmarks/authorization-dsl/source-material-projection.ts`、`inquiry-domain-runtime.ts`、`inquiry-domain-scheduler.ts` |
| 当前前沿/公共入口 | `inquiry-focus.ts`、`inquiry-worklist.ts`、`inquiry-context.ts`、`inquiry-native.ts`、`inquiry-run.ts`，均在 `src/benchmarks/authorization-dsl/` |
| 结果交付 | `src/task-dsl/authorization/inquiry-result.ts` |
| 原包与官方账号 | 复用 `src/adapters/codex-account-session.ts`、现有 account/native entrypoints；只为已复现的本地边界缺陷改动 |

在原模块旁扩充有意义的测试。组合测试新增 `src/benchmarks/authorization-dsl/interprocedural-property-entrypoints.test.ts`；如需要独立的身份/值传递帮助模块，按实际职责命名并更新本节，不按仓库或 skill 命名。新 runner 和研究测试放新证据目录的 `study.ts`、`study.test.ts`、`tsconfig.json`，复用已有执行/归档函数，不复制整条 runtime。

### 最低正反例矩阵

所有判据通过公开 source-read → 当前 source-edit → projection → property check；仅给内部函数手填成功图的测试不能替代这一组合测试。

| ID | 形状 | 预期 |
|---|---|---|
| P1 | entry 将 user/doc 作为 who/target 传给 helper，helper 校验后执行效果 | 不同 anchor 的同一实际对象能沿当前调用实例检查；trace 包含两函数 |
| P2 | 同一 source call 被解释为受保护效果，实际 callee 有检查和拒绝分支 | call 保留；拒绝路径不执行效果；只计一次实际效果 |
| P3 | caller 先检查，callee 后执行；返回对象还会被下游使用 | 参数/返回关系有效，跨单元守卫与效果进入同一条路径 |
| N1 | 用 user-A 的检查保护 user-B 的操作 | 有据时 violated；身份信息不足时 unknown；不误判 checked |
| N2 | 检查 doc-A 却修改 doc-B | 同上；绑定有效和对象不匹配分开 |
| N3 | AuthMiddleware 存在但未注册到该路由 | 不产生保护关系；具名未注册/不可达信息保留 |
| N4 | 相同 helper 调用两次，第二次换对象或绕过守卫 | call instance 分离；第一调用的检查不覆盖第二调用 |
| N5 | guard 仅在另一分支，或效果在 guard 之前 | 构造可达反例；不能只按源码中存在 guard 放行 |
| N6 | read 权限被当成 delete/write 许可 | 根据本次明确政策拒绝该推导；源码行为与政策评价分列 |
| N7 | 明确缺少 guard，源码路径已充分覆盖 | 能生成查询及有证据的违例；不被“必填 guard”挡在绑定层 |
| N8 | 过期 source revision、跨题引用、重复/歧义 anchor | 精确拒绝并撤回旧当前结果；历史仍可读 |
| N9 | helper 提前拒绝/返回/抛错，caller 上仅有 effect 标签 | 不凭标签声称效果发生；保留真实控制结果 |
| U1 | 已解释必要路径，旁侧未知与本性质无关 | 局部结论附明确范围，旁侧 unknown 仍在任务报告 |
| U2 | 未解释调用能改变对象、守卫或相关异常 | 保持本性质 unknown；命名缺口、下一动作及出处 |

测试源码可从以下普通形状开始，再增加分支/返回/错误对象变体。源码解释仍通过公开编辑填写，宿主不能直接注入答案：

```python
def handle(user, document, permitted):
    return perform(user, document, permitted)

def perform(actor, target, permitted):
    if not permitted:
        return False
    target.remove(actor)
    return True
```

`permitted` 如何约束 actor/target 必须来自源码或显式政策；该布尔量本身不自动证明对象授权。按测试目的补上相应检查函数和对象来源，不能让匿名简例偷偷赠送真实任务所缺的事实。

## 五、BB0–BB16 连续任务

### BB0 接管和最小证据登记

- [x] 检查分支/HEAD/脏文件和活动运行，读取必读上下文。基线553509a6，起始工作树干净；BA活动/未知完成均为空。SSH远端查询失败，发布阶段重新核实同fork。
- [x] 创建新 identity、status、manifest；分开 `requirements` 和 `outcomes`，后者初值 pending/not-measured，不用一串 true 表示验收要求。
- [x] 提取 BA 的 Download transaction-priority-1、OWUI original 和 await 离线重放所需输入；保留出处，不复制全部历史目录。见 `fixtures/ba-original.json.gz`；零模型调用、原件不改写。
- [x] 建立代码责任、BB 阶段和下述 16 个实际使用位置。BA 原件及未执行行不变。登记回归3 pass/15断言、本轮tsc通过。

### BB1 用公共链写失败测试

- [x] 先为 P1/P2/P3 和 N1–N9/U1–U2 写最小失败测试，记录原实现在哪层失败；复用已有多函数参数/receiver 测试。
- [x] 分清缺类型、丢 call、错对象、控制不可达、传输/通道五类原因。测试应验证行为和反例，不为新字段存在而写镜像断言。
- [x] 读完确切代码后确定 source ref/call context 的最小表示，写回 spec §14.41。本任务书允许该表示的局部细化，无需常规确认。

### BB2 保留调用结构并接入多种领域含义

- [x] 修复 effect/context 分支导致 source call 不进入调用投影的问题。调用创建顺序、await、实参、receiver 及异常来源沿用既有证明。
- [x] 明确 effect 候选、被调用行为和已发生效果的关系；不要自动把每个 effect 标签升级成无条件执行。
- [x] P2、N9 红→绿；旧 primitive effect、receiver、await、来源顺序反例通过。

### BB3 建立有调用上下文的跨单元对象联系

- [x] 在现有材料/运行上下文中解析当前限定引用。完整 skeleton/interpretation 从实际 owner 获取，不能假定 SourceMaterial 已包含它们。
- [x] 复用 actual→formal、receiver、return/alias 传递；同 helper 多次调用各自保留实例。
- [x] P1/P3 与 N1/N2/N4/N8 红→绿。记录身份来源和无法解析原因，杜绝按名字或全局首匹配合并。

### BB4 让性质检查消费跨单元路径

- [x] 同步 `property-query`、`property-dependencies`、`control-conclusion` 与 runtime 接线，消除只在同 source 内找 guard/effect 的隐含限制。
- [x] 查询支持 guard 缺失；引用有效、性质满足、性质违反和证据不足分别输出。
- [x] 检查控制顺序、分支、权限含义和对象关系；N3/N5/N6/N7 必须得到准确结果。检查 trace 给出真实采用的单位、调用、来源行和相关未知。
- [x] 逐性质隔离依赖。一个性质完成后，原问题其它未决义务继续保留。

### BB5 渐进解释进入当前材料

- [x] 保留现有合法编辑累积机制，让已完成且范围有效的片段可以参与本性质；未解释点具名保留。
- [x] 不自动补 role/guard/predicate，不把未读源码假定无影响；完成视图告诉模型“哪一处仍阻止哪一条性质”。
- [x] U1/U2、无效新提交撤回旧检查、缺口后续补全和源码修订失效全部验证。

### BB6 面向性质的取证与当前编辑视图

- [x] 在现有 worklist/focus 中优先展示当前性质所缺的 caller/callee、对象映射、guard/effect 或相关源码，避免一次输出全部候选和重复长 Schema。
- [x] schema、示例、槽位和实际 wire 共源；跨单元引用由宿主列候选，模型选含义，宿主不赠送结论。
- [x] 开放依赖仍可查询；24条有界预览显示剩余数量和source_structure/source_read入口。保留全量原件；尚无实际token减负结论。

### BB7 公共双入口与归档重放

- [x] 同一匿名任务从普通 native 和 inquiry 入口完成 read→edit→material→query→check，不能用 `initialSemanticUnits` 或直接写 store 代替实际提交。
- [x] 源文件、对象参数或当前绑定改变后，旧结果撤回和新检查均从公共入口发生；v6历史兼容定向测试通过。原政策变化的真实复用仍归BB13。
- [x] 对两份BA原提案通过公开source事务做当前实现的派生重放；Download 7材料/5采用，OWUI 5材料/5采用，原1/0不改。只迁移同SHA有效anchor的宿主revision，新增语义字段0；完整原题仍有未知，见verification/ba-derived-replay.json。
- [x] “bound 数增加”不作为完成标准：跨函数正例和错误对象反例均有非空当前检查轨迹，之后进入真实pilot。公共链21 pass/209断言；联合12文件425 pass/4447断言与主typecheck通过。

### BB8 有目的的官方通道恢复

- [x] 将第六节规则写入新runner；success→routing、连续routing、第三次恢复失败、quota/auth、unknown、重复claim和付费并发互斥均先红→绿。15 tests/60断言与研究tsc通过；original-byte评阅输入哈希及failed部分文本不算交付已补。
- [x] 核实BA最后failed终态、无活动/未知完成，继承lifecycle SHA982ab021...与原状态保持，见verification/inherited-terminal.json。新身份允许就绪真实pilot重新进入，无额外probe。
- [x] runner接通实际生命周期、终态、用量可用性及失败原因归档；实际dispatch证据待BB9。输入共同事实等价和两包原字节95/173文件预检通过，不算真实消费。

### BB9 Download 跨函数局部真实闭合

- [x] 用当前实现、BA 同份允许源码和原完整 skill/brief 运行首个 pilot；标明本次重点性质但保留原题全部问题。首件官方completed，完整原skill/原题实际加载；1单元/1入口采用、1性质unknown、0跨源trace，原件保留。
- [x] 检验入口→helper 的实际调用与对象联系。具名optional-field-clear-1模型自主生成2单元/2采用（1调用），完整原题自然评阅full；输入没有历史答案或手制graph。
- [x] 验收实际材料采用、跨单元性质 trace、相关缺口和独立源码核验。性质仍unknown/空trace；入口value与helper principal/resource不一致、查询未绑定，实际局部闭合未达。
- [x] 首次失败立即按第七节处理。可选字段清除72 pass/565断言、主/研究typecheck与原草稿零调用点验通过。具名复测completed，但null清除使用0，不能认定修复实际采用或新增采用的因果。联合428 pass/4483断言与原件重放1 pass/8断言通过。

现场修复计划：首件把guardBranch附在resolver调用上，后续虽把guardRef改到实际condition，旧调用字段仍在草稿中。source-edit只能赋值，兼容完整annotation替换可移除该字段，但当前增量接口不能清除。先用匿名公共链红测，再仅为可选annotation字段支持value:null删除；role/explanation、根字段和unresolved仍不可空。清除不产生条件/对象/权限含义，继续沿原lowering与检查器重验。保存首件、源码独立partial评语及费用，修复产生新epoch，以pilot-download/optional-field-clear-1具名复测；质量面板之后统一使用新epoch，不混用首件。

复测已归档：41宿主回调、总预算61/64、格式拒绝3/两检查用完；input2,559,542（含cache2,342,656）/output9,283。点验拒绝来自入口未标参数与helper标注不一致，未证明共享类型连接缺陷，不为它再抽样或自动补含义。Download M通过原输入/完整源码与skill/epoch/模型/预算/入口/方法一致性核验后引用该修订；新增模型调用0，非独立样本。

### BB10 OWUI 第二种真实结构

- [x] 使用同一共享实现运行 OWUI 原完整任务，重点判断输入文件授权与目标 collection 效果关系。
- [x] 不假定两种资源相同，也不预置“middleware 保护了目标”的答案；根据实际源码定位 guard/effect。
- [x] 记录 await/root 修复、跨调用对象和效果在真实链中的采用；首件full、具名复测partial与机器unknown分别保留。修复已匿名红绿及真实复验，局部性质验收仍未达。

OWUI首件已completed，自然原题full，7单元/115控制步骤但0采用/性质unknown。主线程点验materialProjection发现入口callable-creation-invalid：源码callback创建及调用顺序保留，后续缺condition的if却生成missing-<anchor>，源码order只识别choose-<同anchor>。现场计划仅在v7保留未知branch的源码顺序名称，step仍unresolved；不更改索引、谓词或创建/control/身份validator。匿名公开read→edit→material先验证未知branch在创建前后不误封全部材料、创建在未知branch内部仍拒绝，并保留移除/挪动/错身份反例。零调用原草稿派生诊断与新epoch具名复测分列；既有M引用保留，比较面板新epoch配对需具名补齐。

具名source-order-marker-1已completed：8单元/10实际采用，官方原skill/原题加载true；2性质unknown、空trace，principal及重复绑定、开放route/framework依赖保留。自然partial，主要输入/输出对象关系正确但完整处理条件未充分展开。48/64预算、24回调、格式拒绝3/两检查用完；input3,063,681（含cache2,880,256）/output13,396。修复的真实采用恢复与局部性质未达分别记录，不为模型缺口重复派发。

### BB11 同条件完整任务比较

- [x] 两任务各运行 N/M/D，共6主质量位置；src7100b13f同epoch、模型/预算/原题/源码/原skill实际加载核验通过，M引用pilot去重。
- [x] N原自然输入+只读工具；M等价Markdown+共享工具；D同事实声明+共享工具。方法差异与表示比较分列。
- [x] 声明机械渲染，旧答案/evaluator/修复记录隔离；全部原问题独立评阅，作者/修复成本未知项保留。
- [x] 顺序共享修复后的Download M具名配齐，旧epoch引用留历史。OWUI D根只有未知分支、未lower实际creation/body，主点验属于模型遗漏，不再修严格validator或重抽。
- [x] development观察：Download N/D full、M partial；OWUI三臂partial。D token高于N，不能据单次或未知USD声称稳定净收益。见verification/quality-panel.json。

### BB12 两包真实消费与编写体验

- [ ] 沿用 BA 已恢复的两份真实作者包，保留原声明/Usage 字节，通过现有适配走 v7 普通入口。两位置各一次消费，记录完整 skill 和工具实际加载。
- [ ] 若旧包缺本轮必要字段，宿主可进行有记录、无领域答案的机械迁移；需要新增语义的稿件单列新版本，不能继续称原字节消费。
- [ ] 记录用户必须提供什么、宿主自动生成什么、哪些错误能在发模型前定位，以及实际修订次数。未观测真人分钟就不报告人力节省。

暂停快照：Download inquiry消费者completed，自然评阅partial，2单元/8采用；原声明4827字节和Usage原件保留，完整skill与全部4题请求实际加载，四题性质均undeclared，无合格跨函数基础。OWUI native消费者已经派发、33个宿主工具回调均完成，完整skill和11题请求实际加载；用户要求停止后本地进程退出，没有最终答案/server终态。保存中止生命周期/工具原字节、末次可见usage，最终用量与完成状态unknown，付费锁保留。两包整体消费尚未验收通过。

### BB13 政策、前提、源码三种变化

- [x] 预先选 Download 的一个明确政策变化、一个前提变化和一个最小源码变化，保存共同变化事实与评价要求。不得把预期答案放入 runtime。
- [ ] 每种 fresh/previous 配对，共 6 个位置。选择性复用必须指向当前可用材料和依赖，而不是回放旧结论。
- [ ] 合格基础按所评估范围判断：局部性质的完整基础可测局部复用；原任务仍有缺口时不得报告完整任务复用。没有合格局部基础则 previous 明确 blocked，fresh 仍可检验新任务，不用缺少整题 full 永久封闭所有复用研究。
- [ ] 源码删除守卫、改变对象或改变前提激活路径应触发对应失效/再分析，给出反例。局部恢复数量、实际采用和当前答案质量分开记录。

`model/change-registration.json`保留三种共同变化事实及原来源，三个fresh位置因用户暂停未派发，三个previous位置因无当前同方法/epoch的checked或violated跨源trace而blocked。没有变化模型调用，不补写复用效果。

### BB14 结果归因与必要减负

- [ ] 从原件生成提交→接受→材料→采用→绑定→检查→自然答案的漏斗，指出每次首阻断。协议、宿主、通道、模型语义失败可以同时记录，不能用单一 partial 覆盖原因。
- [ ] 全部计划位置留在端到端分母；另报已交付答案的质量。不要删除协议失败来“翻正”结论，不按任意失败比例决定是否重要。
- [ ] input/cache/output按 provider 原口径计量，缓存只计一次；模型请求、动态工具、自动读取、连接恢复各自统计。作者、修复和复用准备成本单列，未知 USD/隐藏请求/开发代理/真人工时保持 unknown。
- [ ] 若轨迹证明重复完整视图是主要冗余，可做一个共享的增量反馈修复并对相同输入复验；保留原请求和质量，不在本阶段继续扩大研究范围。
- [ ] 结论可为 positive、tradeoff、no-observed-difference、negative 或 inconclusive；局部正例、完整使用及净收益分别给证据。

暂停前已保存六臂自然评阅、实际lifecycle反馈体积点验及去重计量。16位置中10已尝试/6未运行，11个真实尝试中10自然交付、1未知完成；已知input26,561,789（含cache24,095,872）/output114,442，中止尝试最终usage另标unknown。D两任务token高于N且没有自然等级优势，不据单次development观察或未知USD报告稳定净收益。BB14完整队列归因仍未完成。

### BB15 有限联合验证和文档

- [ ] 跑受影响单测、主与本轮研究类型检查、BB 零调用重放和文档检查；通过后不重复全历史审计。
- [ ] 现有 usage/组件文档补一条真实可运行命令与实际输出含义；命令来自当前 CLI 帮助和已保存示例，不写占位路径冒充复现。
- [ ] 研究 §1/§7.63/§11 同步实际缺陷、修复、失败和结果；current-status/plan/spec同步真实状态；根 conversation_log 写简短阶段记录。
- [ ] 验收矩阵逐项填 observed outcome 与证据位置。工程、真实跨函数闭合、完整任务、包消费、变化复用、研究收益六项分别判定。

### BB16 发布与可恢复交付

- [ ] 只暂存本轮归属文件；检查新压缩原件的 Git 属性和归档可读性，避免再次被 text 过滤损坏。
- [ ] 聚焦提交，推用户 `origin/skill-ir-aot` 并核对实际远端。不得重置其他工作或推 upstream。
- [ ] 总结实际可用范围、仍未达责任、首阻断、外部暂停条件及下一条可执行命令。有限队列结束与 researchGoalAchieved 分开。
- [ ] 存在外部阻断时完成独立工程和上述交接；不重复探针、等待或无关工作凑运行时间。

## 六、真实运行分母、预算和恢复

主登记 16 个逻辑位置：2 pilot、6 完整质量、2 包消费、6 变化。引用同一次真实运行时用同一 attempt id，去重计费和独立样本数。具名修订属于原逻辑位置；每次均保留原件、修改原因、commit、method epoch 和完整成本。主表始终展示首件，修订另列。未运行行写出确切原因，不能静默减少分母。

初始单会话沿 BA 公共上限：64 个宿主工具预算单位、786432 display bytes、33554432 read bytes、2700000 ms；动态调用与自动读取共同消耗原预算，实际模型回调单列。格式修复/有效检查沿已修的有限合同，不退费、不暗增预算。若研究发现预算本身应改，先用原轨迹说明原因并为所有可比较臂登记新 epoch；不能只给失败 DSL 臂加量。

**本任务书为新 BB identity 明确修订 BA 的一次性累计恢复规则：**

1. 保留 BA 原暂停及失败原件。确认无活动/未知完成后，允许一次已经就绪的 BB 真实 pilot 作为同账号、同模型的有目的重新进入；这次不是额外健康探针，也不证明通道已恢复。
2. 已确认终态的 routing/connection 故障可在同逻辑位置具名恢复；成功完成的真实模型任务重置“连续 routing 失败数”，但不清除累计失败/成本。
3. BB 连续两次同类终态 routing 失败，或 BB 累计三次 routing 恢复尝试仍遇失败，暂停外部实验。首次重新进入也记入恢复总账；不要另建 identity 来重置本轮上限。
4. 明确 quota/auth 拒绝立即暂停该通道；不切账号、端点、模型、第三方 API 或新凭据绕过。未知完成只核查已有本地生命周期，不重复发同请求。
5. 暂停后继续独立实现、确定性反例、重放和文档；不要求用户为普通工程重新授权，不忙等额度。报告按真实未达状态收束。

这里的限制针对已知反复路由失败的重试；正常有目的开发与实验沿用户既有授权，不设美元总额或“必须跑够若干小时”。

## 七、现场修复规则

每次表现不好先保存原件，再区分：输入/源码不足、共享表示/调度/检查缺陷、模型解释错误、协议错误、通道错误。每项可操作的共享根因在当前进程完成一次针对性诊断、红测、修复和可比较复验；模型随机语义错误不能自动触发答案模板或仓库专用分支。

- 发现已知坏 Schema 或共享编译缺陷时，立即停止受影响队列；不把主面板先跑完再修。
- 同因连续两次没有改善，停止重复派发该位置，回到原始输入/公共链确定性诊断；其他独立责任继续。新证据说明新根因，可修后再有目的验证。
- 修复不会覆盖首件；代码改变产生新 epoch。零调用重放只验证当前处理，不证明模型采用或改写旧实测。
- 若要超出本任务类、放弃核心正确性或重写大块语言引擎，先在研究/spec中给出具体冲突并回报用户；普通设计细化和共享修复继续执行。

## 八、验证命令与证据合同

从 `D:/skill优化/SkVM` 运行。先跑改动附近测试，最后联合一次：

```powershell
bun test ./src/task-dsl/authorization/source-interpretation.test.ts ./src/task-dsl/authorization/source-edit.test.ts ./src/task-dsl/authorization/semantic-flow.test.ts
bun test ./src/task-dsl/authorization/property-query.test.ts ./src/task-dsl/authorization/property-dependencies.test.ts ./src/benchmarks/authorization-dsl/source-material-projection.test.ts ./src/benchmarks/authorization-dsl/property-runtime.test.ts
bun test ./src/benchmarks/authorization-dsl/interprocedural-property-entrypoints.test.ts ./src/benchmarks/authorization-dsl/semantic-submission-entrypoints.test.ts ./src/benchmarks/authorization-dsl/source-edit-counterexamples.test.ts
bun test ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.test.ts
bun run typecheck
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/tsconfig.json
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
git diff --check
```

新测试和研究 tsconfig 由相应 BB 阶段创建，不能把其尚不存在称作现有工程失败。研究 runner 应至少提供 `status`、`run`、`review`、`replay`、`summarize` 的明确入口，复用已有执行函数；在实现后把精确选项和实际示例补回本任务书及 usage，不预填未验证命令。

最低证据为：manifest/status、匿名反例结果、两原件派生重放、每次真实尝试的公共输入/原件/生命周期、独立源码评阅、逐性质 trace、计量与最终 summary/verification。身份、当前来源和冻结原件沿已有必要绑定；不为相同事实另造多层摘要锁或每步整仓审核。

## 九、外部借鉴与本轮取舍

- [Absentia](https://arxiv.org/html/2610.00977v1)：借鉴源码/路由事实图与模型授权推理分层、沿调用追踪、反例核验和变化依赖。推断出的项目惯例是待检验假设，用户独立政策单独保存。该工作不能代替本项目真实评价。
- [Paralegal](https://www.usenix.org/conference/osdi25/presentation/adam)：借鉴领域属性、源码标记和依赖检查的分工；本项目保留模型解释的不确定性，不冒称已有 Rust 程序分析的保证。
- AZ 已有 Semgrep CE 匿名校准。本轮优先闭合公共真实链；不重复做一个与授权语义不匹配的通用规则基线来宣称胜出。若复用现成工具发现当前具体缺口，记录适用边界和实际贡献即可。

交付重点是一个能展示“当前源码中的这条跨函数授权关系为何成立、为何违反、哪里未知”的真实执行过程，随后回到完整原 skill 的问题和变化使用。不要再用测试总数、绑定数量或框架支持清单代替这条过程。
