# Skill IR AOT 当前执行计划

更新于2026-10-11。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BE0–BE18：领域问题前端、相关依赖与机制价值验证](../superpowers/plans/2026-10-11-authorization-question-workflow-and-mechanism-value.md)，`in-progress / BE13`。六首件同tree`7b379ddb`全交付、整题均partial。truthy说明复验实际采用该谓词但暴露部分源码转换异常；原声明复演与78pass/614断言已修为未知控制点，四N/H实际合同未变。新根因的一次具名复验和分层变化继续。
- 方法合同：[spec§14.44](skill-ir-aot-optimization-spec.md#1444-be-question-workflow-and-mechanism-value)；复核与研究统一在[§7.66](skill-dsl-research.md#766-be-领域问题前端与机制价值验证)。
- identity：`authorization-question-workflow-v1`。继续`skill-ir-aot`，只推用户origin，不创建分支/worktree；派发后新开发线程是共享代码/方法文档/Git的唯一写者。
- 开发`gpt-6.1-sol/max`，实验沿用已授权官方账号`gpt-5.6-sol/high`。第三方暂停、旧OWUI未知只离线，held-out/Q1/prospective/readiness及历史0/6保持。

## 当前目标

修掉错误的框架检查义务和与性质无关的依赖阻断，把“源码含义”与“逐题绑定/结论”分开，减少模型重复处理机械字段和上下文。实现可独立运行的H领域辅助，以及使用同一helper、增加声明编译/组合/检查的D；保留完整原skill、全部原题与严格对象/可达性检查。

BB已有跨单元绑定，BD已有持续partial和独立性质计算，继续复用。领域前端让模型解释原文中的授权问题，宿主填写机械身份；不重建resolver，不扩语言语义，不把开发评阅或历史答案输入实验模型。

## 连续队列

| 阶段 | 工作 | 验收重点 |
|---|---|---|
| BE0–BE3 | 接管、DRF请求receiver红绿、相关依赖范围 | Serializer/Field不背dispatch义务；真正请求权限/未知相关边界仍保留 |
| BE4–BE5 | 实际模型上下文计量、源码含义跨题共享、按需投影 | 量实际发送内容，不把归档当prompt；不同对象/调用/问题不串用 |
| BE6–BE9 | 领域声明前端、独立H、D编译、普通入口和匿名反例 | H无需source-edit；D经真实公开链进入旧检查器；静态账号工具与runtime一致 |
| BE10–BE13 | 六位置N/H/D两轮、现场修复、逐题评阅 | 同完整原任务、原skill/源码/预算；首件保留，D没有checked仍做质量比较 |
| BE14–BE15 | 三变化分层复用、普通消费与说明 | R0来源/R1含义/R2性质分别准入，不携带旧自然答案，不伪造会话 |
| BE16–BE18 | 研究归纳、定向验证、提交推送和接手 | 工程、自然质量、检查、复用、净收益分别报；研究未达则保持未达 |

首位置顺序N1/H1/D1、D2/H2/N2，共六会话；四子题属于同一任务的相关观察。另登记policy/premise/source的六fresh/previous首位置：第一份可恢复D主会话作为基础，按逐项R1/R0资格复用材料，合格R2另列。修订按新attempt保存，不覆盖原件或重复记账。

## 失败处理与评价

1. 共享错误当场保存、红测、修复、绿测和具名复验；不要继续受已知缺陷影响的面板。纯模型语义遗漏按源证据诊断，不能把参考答案写进提示冒充修复。
2. 同因两次没有保留进展就停止重抽并转确定性定位；新根因可继续。共同helper行为改变时重建受影响比较，D独有修订与首轮分列。
3. 自然答案与机器检查分开，协议失败留端到端分母。评价N–H辅助增量、H–D声明检查增量，保留support/tradeoff/no-observed-difference/negative/inconclusive，不预设DSL胜出。
4. 记录实际input/cache/output、耗时、模型可见context字节、语义/传输/工具拒绝。字节不能冒充精确token归因；实际USD、隐藏请求和真人时间未知仍unknown。
5. 共用64总工具/768KiB显示/32MiB读取/45分钟会话；自动动作和恢复计入。routing一次具名恢复、连续两失败或本轮累计三次恢复仍失败则暂停外部派发；quota/auth暂停，unknown只查原生命周期。独立工程照常推进。
6. 常规检查点不等待确认，不为时长重复运行。研究失败不妨碍诚实发布可用辅助能力，但有限队列结束不能标作研究成功。

## 继承事实与维护

BD最终发布`6c8c79e3`，五尝试全交付、零格式拒绝；四质量整题均partial，N逐题6/8、D4/8，D七性质unknown、零合格跨源性质；两对tradeoff/negative、六变化未运行。它说明当前整体方案尚无稳定收益，没有单独识别DSL语法价值，也没有证明跨单元机制缺失。原件见[BD验收](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-completion-v1/verification/acceptance-matrix.json)，详细依据保留研究§7.65。

研究统一追加§7.66并更新§1/§11；spec§14.44写最终方法，usage/developer-guide写真实接口。新结果只入本identity，不新增日期化组件正文。根conversation_log/handoff/communication按阶段同步，仅本地保存。只做受影响验证和当前文档核验，八条已知历史断链不改原件掩盖。
