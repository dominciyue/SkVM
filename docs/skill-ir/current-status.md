# Skill IR 当前状态

更新于 2026-10-06。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；机器状态和原始结果保存具体进度，历史任务书保存当时的执行记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**当前授权队列为 [AU0–AU21 操作级取证与授权 DSL 贯通](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md)，状态 `in-progress`，开发线程拥有共享代码、方法文档、状态与 Git 的唯一写入责任。** 开发模型 `gpt-6.1-sol / max`，研究基线 `ba277160`；启动HEAD/origin为`dfe7ec32`。继续本地`skill-ir-aot`，仅发布用户origin。AU1–AU9原型与32位置登记已实现。AU10九次ShareLink共126请求/126响应；第九轮1操作/4问、10个current来源单元含owner-aware helper，但没有终答。缺固定version的defer及带typed reason的来源步骤被拒绝，现统一只派生省略的固定version、保留原source说明；错误version/focus/工具/payload及对象连接边界保持。两原payload零调用重放、802pass/1平台skip/5170断言，等价类型修正后定向11pass/193断言与主/AU类型通过；待提交/同题`focused-context-routing-v1`实际复验。AU13作者/原字节ordinary消费者、AU14同输入fresh/materials-previous薄接线已TDD，实际位置未派发。AU accounting/call-index/summary已从原件重算9闭合尝试，首答/修订分列；fresh input2103261/cache107008/output93847，USD/developer/AI/human均保留未知，研究目标未达。完整原skill22/8文件清单、独立changed policy及实际6000预算保持。恢复见AU results `status.json`，旧结果与封存保持。

最近的 [AT0–AT19](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md) 有限队列已以 `completed-with-unmet-criteria` 收束。持久focus、宿主身份、纯有限helper摘要、字段/返回对象、源码终检和双入口已实现。[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)分别记录工程、实际使用、比较和成本结论；原件和封存保留。

12质量首位置均实跑、源码partial、checked/bounded为0；4完整原skill原/变native和4有效忠实作者稿的原字节消费均已完成。两个original native的自然条件说明充分，formal仍失败；changed native及消费者均partial。政策/前提fresh各一次，两previous因无full checked/bounded基础实际阻断、0调用。相同源码副本/输入的两次fresh均partial，第二次终答正确说明移除exact-document guard，第一次仍unknown。Go注释误定位具名消费者修订消除了假入口，但仍partial。37原件关闭、556派发/556响应，无活动或未知完成；[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/accounting.json)记录完整prompt 9,400,874、output 403,256，美元/真人/开发未知、目标执行0。718项共享回归及40项provider/研究检查通过（集合有重叠，不相加），双类型通过；[37原件零调用重放](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/verification/at17-final-replay.json)通过且原字节未改。搜索读取8,379,114→2,039,548字节仅证明机械减负；质量/净收益未建立，底层未闭合而未追加消融。

最近完成的 [AS0–AS19](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md) 以 `completed-with-unmet-criteria` 收束，完整源码质量与净收益未建立。[AS汇总](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)和 [AS status](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/status.json)继续保存其原结果。`semantic-flow-v1` 已接入 inquiry/native，旧默认与 `guided-evidence-v2` 保留。

AS 固定 15 质量、4 native、8 变化、2 源码变化位置，作者4稿与原字节消费另列。12个可运行质量首轮均保留并评阅，源码语义完整为0；两份完整原 skill 的4个原/变 native位置均实际消费，最后1/4形式checked/bounded、0/4完整源码质量。4份作者稿格式有效并按原字节消费，下游仍部分失败。Memos remove三臂和五个依赖位置保持封存（8/29）；Paperless五个变化位置因无合格原基线零调用阻塞。Notes/Memos share封存不动。身份见 [manifest](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json)、[继承封存](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/inherited-seals.json)及[依赖准入](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification/dependent-admissions.json)。

局部修复实际消除了协议、参数身份、坏稿恢复及候选定位的具体障碍，但已读helper未进入解释、current-offer/handle错误、源码条件遗漏和效果断言过强仍阻止完整交付。AS验证744 pass/1 skip/4867断言，另2项provider合同/8断言，共746项通过；主/AS类型和离线重放通过。39份已关闭原件共300派发/298响应，AS无活动实验；已知完整prompt 7,707,021、output 296,467，另有2次usage缺报，美元/真人/开发成本未知。本次接续复核重跑78项相关测试、405断言通过，未新增模型调用。

## AR 停止快照与继承事项

- 最后工程提交 `cc88bfb2`；已观察调用下界 507。AR 机器状态仍保存退出前的 `in-progress` 快照，不代表进程继续运行。八个主首行已留档并评阅，16 行分母及修订分别保留；六个未运行位置可按新计划承接，两个 Notes 位置及其它未知请求继续封存。
- 两份原 skill 生成的授权配置已经格式有效；随后独立 inquiry 消费中，Memos 最后请求未知，Download 已知修订仍有图和语义缺口。原 skill 的 native 完整授权链仍待验收。
- 新非 API 程序已从原 skill 生成，经保留候选的 host-recovery 导出 draft；同包原/变任务实际执行并交付。中性前提变化 previous 已 checked/bounded，8 次请求、零新源码工具动作；真实授权变化复用与净收益仍待检验。
- 复核发现互斥 admin/non-admin 路径被当作共同前驱，以及已接受角色拒绝事实在终答重新写成 unknown。AS 将模型的语义选择与宿主的身份、路径展开和结果关联分开，先以真实反例检验共享修复。

| 恢复所需信息 | 权威入口 |
|---|---|
| 最新执行及未达责任 | [AU任务书](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md)；已结束的[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)及AS原件保持 |
| AR 停止前状态 | [status.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)、[handoff.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/handoff.json) |
| 普通使用的失败与裁定 | [ordinary-adjudication.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-adjudication.json) |
| 真实派发、响应与未知费用 | [ordinary-accounting.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/ordinary-accounting.json) |
| 语义评价及未运行分母 | [evaluation-summary.json](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json) |
| 根因与方法 | [AT结果 §7.49](skill-dsl-research.md#749-as-复核与-at-源码解释闭合计划)、[AT复核 §7.50](skill-dsl-research.md#750-at-复核任务拆分与领域表达的衔接)、[接入点与源码参考 §7.51](skill-dsl-research.md#751-系统修改的接入点源码参考与可检验贡献)；AS原设计与结果见[§7.48](skill-dsl-research.md#748-as-局部语义展开与真实交付) |

## 已有能力与待解决问题

| 路线 | 已有实现 | 当前使用边界 |
|---|---|---|
| 授权任务 DSL | 领域声明、authoring/prepare/edit/run/compare、只读源码工具、局部图、三值求值及引用/结论检查 | 有界 development 能力；决定性依赖、条件提取、协议服从及完整交付仍需完善，新增策略显式启用 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、模型修改说明和脚本、局部验证修复、原子导出、自然消费 | 已有真实生成与消费记录；收益 mixed/negative，按各包证据判断 |
| 确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 和 recipe import | 保留原支持合同及有界案例 |

AQ 旧/新策略 full均为2/20，原 skill checked交付为0/4；具体分母见[研究 §7.35](skill-dsl-research.md#735-aq-授权领域执行设计)。AT完整质量仍未建立；每个作者问题展开六类源码工作，GitHub消费者修订中7个已存unit仅1个落在CreateIssue，其余6个在无关repo创建函数。AU据此修任务/事实边界、结构相关性、领域摘要与义务调度，并将材料级复用和完整任务复用分别验收。费用和人力缺测、readiness、历史 `0/6`、Q1 与保护输入保持原有状态。

## 开发与维护入口

- 普通命令和模型配置：[使用说明](../usage.md)。代码定位和检查：[开发指南](developer-guide.md)。
- 当前队列：[当前计划](skill-ir-aot-optimization-plan.md)；方法合同：[spec AU](skill-ir-aot-optimization-spec.md#1434-au-operation-evidence-contract)。
- 分类、方法、复盘：[唯一研究正文](skill-dsl-research.md)；旧结果：[证据索引](evidence-index.md)、[历史](history.md)、[实验目录](../../results/skill-ir/experiment-catalog.json)。

[治理](../superpowers/plans/2026-10-04-workspace-and-document-governance.md)已完成材料收存、旧日志压缩、正文归并和停止后的入口校正。当前阅读集 15 份，版本化材料 14 份；研究仍统一在一个正文中。原件及恢复索引在 `project-maintenance/20261004-governance/`，AR/AS 结果及 `.skvm` 保留。五份可再生成的 Python 字节码已清除；三个此前删除被拒绝的空目录保留。AS、AT执行均已结束；AU已授权，派发后由新线程成为共享代码/方法文档/Git唯一写者。Git实时状态以实际检查为准。

更新本页时替换过时段落，不把逐次测试与派发日志不断追加为新的“当前状态”。

2026-10-06最新恢复：Share第十轮`278bc5cd`在request16网络超时，16派发/15响应；累计142/141，1项usage及完成未知。当前Share逻辑任务16个登记位置全部封存，15个未派位置写明blocked-sealed-unknown-completion；不重发、换模型或改身份。原件SHA `dbae38f7bc29d4df99e30234aefaaca76a38d3376cfcb6ada4a5c95a5ae0cf24`；独立AI与主范围guard点验见tenth evaluation/proof。`scope-adjudications.jsonl`只释放另三个独立逻辑任务的显式16位置共享调度暂停，retainTaskPause保持。下一项Gitea debug首次执行；工程802回归不等于Share实际完成或质量收益。最新accounting fresh2365846/cache119680/output107365为已知响应subtotal，USD未知。