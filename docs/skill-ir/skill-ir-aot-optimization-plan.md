# Skill IR AOT 当前执行计划

更新于2026-10-12。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BE0–BE18：领域问题前端、相关依赖与机制价值验证](../superpowers/plans/2026-10-11-authorization-question-workflow-and-mechanism-value.md)，`completed-with-unmet-criteria / BE18已发布`，实质成果`96ed3472`与live远端一致。六质量首位置、两具名D修订、六变化逻辑位置全部交付，16归档/14模型运行/2未启动；finiteQueueComplete/publicationComplete true、researchGoalAchieved false。原质量0/6整题full、全部实际0/14，35D检查unknown、0合格跨源性质。变化为tradeoff/negative/no-observed-difference，previous实际材料使用均0，见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/acceptance-matrix.json)。
- 方法合同：[spec§14.44](skill-ir-aot-optimization-spec.md#1444-be-question-workflow-and-mechanism-value)；复核与研究统一在[§7.66](skill-dsl-research.md#766-be-领域问题前端与机制价值验证)。
- identity：`authorization-question-workflow-v1`。继续`skill-ir-aot`，只推用户origin，不创建分支/worktree；派发后新开发线程是共享代码/方法文档/Git的唯一写者。
- 开发`gpt-6.1-sol/max`，实验沿用已授权官方账号`gpt-5.6-sol/high`。第三方暂停、旧OWUI未知只离线，held-out/Q1/prospective/readiness及历史0/6保持。

## 当前判断

请求义务、相关依赖、渐进转换、共享投影和独立H/D前端已实现；最后保守依赖修复不影响10份原D快照所用分支，原epoch不回填。225核心测试/1418断言、12研究测试/68断言及主/研究类型通过。H保留为普通opt-in辅助候选，D为显式研究入口；未建立一般H>N、稳定D质量/检查增量或净收益，不改变项目默认。

R0来源准备和R1含义分开：policy/premise各恢复1 partial R1而使用0，source撤回R1并保留R0，R2均false。当前D1普通会话实际搬移后公开init/check/inspect/compare零模型通过，不能据此宣称模型消费或性质收益。完整分支/事实映射、实际含义使用和合格跨源链仍是未达责任。

## 收尾与后续边界

BE18实质成果已提交、推用户origin并核对远端SHA；[发布回执](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/publication.json)另行提交，无待派BE位置。[执行收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-workflow-v1/verification/authorized-execution-closeout.json)区分工程通过、研究未达和条件未执行。R2条件未成立，所以实际旧合格性质撤回实验未执行；不把公共fixture写成这项实际验收。

有限原顺序N1/H1/D1、D2/H2/N2完成；四子题属于同一任务的相关观察。D1/original在变化前固定，source-previous只有两件推理前配置失败及一个实际交付恢复，未重发完成或未知请求。首件/具名修订/恢复及全部已知和未知费用保留。后续研究必须针对未达责任形成有证方法决定，不能据本轮连续授权自动追加样本。

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
