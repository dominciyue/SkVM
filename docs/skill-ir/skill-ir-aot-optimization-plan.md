# Skill IR AOT 当前执行计划

更新于2026-10-10。唯一实时入口为 [current-status](current-status.md)。

- 当前任务书：[BC0–BC14：任务性质准备、跨调用语义修复与可重放交付](../superpowers/plans/2026-10-10-authorization-task-binding-and-replay-reliability.md)，`in-progress-publication`；工程、原包两件和三fresh已收束，BC14待推送核对。11位置中4尝试、7资格阻断，5去重尝试/5自然交付。
- 方法合同：[spec §14.42](skill-ir-aot-optimization-spec.md#1442-bc-task-binding-and-replay-reliability)；复核依据：[研究 §7.64](skill-dsl-research.md#764-bc-任务性质准备与跨调用修复)。实施基线 `ee1a0522`；当前合格跨源性质0、完整任务均source-partial，比较和实际previous复用未达。下一动作及原件见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/acceptance-matrix.json)，不得以授权收束升级研究成功。
- 开发 `gpt-6.1-sol/max`，实验当前官方账号 `gpt-5.6-sol/high`；继续skill-ir-aot、仅用户origin，第三方API和AV旧位置继续暂停。

## 当前目标

普通用户给出原skill和自然任务后，系统先产生可追溯的性质问题，再让有源码依据的跨函数对象解释进入现有v7检查。BC已实现显式task-binding-v1及准备/定向修复，确定性公开链通过；真实入口/effect角色、closure和逐题性质绑定仍未闭合。后续先处理这些原件中的确切缺口及完整分支/缺失事实映射，再登记新的真实验证计划；不自动追加外部运行。

两原作者包4题/11题都无properties；质量common文件各有1题/1性质，两者不是同一输入。任务前端保留所有原题并生成独立sidecar；Download request、user、pk、document按实际源解释，不能自动改类型。准备热点已定位为重复语法遍历，拥有worker和当前树memo保留相同源身份/revision；原件派生重放仍明确保留缺失含义，不把工程修复当成真实效果。

## BC 队列与验收责任

| 阶段 | 责任 | 所需验收 |
|---|---|---|
| BC0–BC1 | 登记与源码准备定位/修复 | 阶段/文件/耗时明确，真实scope完成；取消不遗留拥有的工作 |
| BC2–BC3 | v7指引、任务性质准备、普通双入口 | 无手写properties仍有合法准备路径；不删原题、不注入答案、成本入账 |
| BC4–BC6 | 参数含义、定向编辑、对象联系、公开链 | 同对象跨调用正例及错误对象反例；无效新编辑撤回旧检查 |
| BC7–BC8 | 原件派生重放、生命周期/计量 | 零新增语义重放与新模型修复分开，准备/协议/源码/通道失败分层 |
| BC9–BC11 | Download原包、小比较、三变化 | 真实局部链先于配对；原四题保留；局部/整题复用分别验收 |
| BC12–BC14 | 搬移使用、有限验证、研究归纳与发布 | 原CLI可操作，原件/未知保留，远端核对；据实登记效果 |

11个逻辑位置是1个native、两次N/D配对4位置、3种fresh/previous共6位置。同一attempt仅在完全等价条件下引用且去重。修订和新epoch保留首件，结果目标与实际结果分开。OWUI只离线迁移，不重新派发未知消费。

BC previous资格绑定实际同范围合格性质、当前源码/策略和trace，不硬编码consumer位置；没有完整原题基础时只评价局部复用。旧BB三previous继续blocked，不用BC结果回填。原未知和限定处置保留；当前Download新身份的具体执行责任见BC任务书。

本轮实际17个model-prepared性质中12个unknown、首件2个缺逐题查询、3个因最终格式拒绝未检查，跨源checked/violated为0。四N/D与三previous分别留零派发preflight；三fresh均保留原四题并独立评阅，不能替代原任务合格基础或复用收益。known input16,788,094含cache15,453,312/output86,987，USD等未知单列；[summary](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/summary.json)与[收束](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/authorized-execution-closeout.json)分开工程、实际使用、完整队列及研究目标。

## 执行与修复规则

1. 共享缺陷当场保存原件、定位、红测、修复、绿测和具名复验；受影响队列暂停，独立工作继续。
2. 同因连续两次无改善停止重抽，转原参数/确定性诊断；新根因可继续处理。不把一次修复额度当整个开发的上限。
3. query由原问题/政策/前提准备，source解释由真实源码提出；oracle和历史答案不进入模型。严格对象/可达性检查及渐进草稿保持，不扩大无关语言语义。
4. 新Download在实现就绪后进入官方通道，明确routing终态有限恢复；quota/auth暂停，unknown只核查原生命周期。旧BB未知/限定处置不改写，不以新identity清锁，不切第三方/账号/模型。
5. 新研究使用完整端到端分母，另报有效答案质量。prepared、bound、adopted、checked/violated、源码质量、复用及收益分别验收。

## 继承与维护

BB以completed-with-unmet-criteria收束：16位置13尝试/3previous blocked，15去重尝试/12自然交付；两fresh partial、一routing未交付，真实跨源性质trace为0。known input32,038,537含cache29,105,920/output136,921；两OWUI部分usage及最终未知单列。425核心/29研究与类型通过，完整replay未过，原[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/acceptance-matrix.json)保持。BC规划时新鲜轻量51 tests/362 assertions通过。BA/AZ/AY及更早原件不改。

继续`skill-ir-aot`，仅推用户origin，新开发线程独占写入。研究同步§1/§7.64/§11及spec§14.42，更新现有usage与组件文档，不增加长期阅读入口。主/研究类型和受影响回归及文档检查通过后发布，不重复全历史审计或等待凑时长。
