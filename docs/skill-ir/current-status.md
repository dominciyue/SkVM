# Skill IR 当前状态

更新于 2026-10-06。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；机器状态和原始结果保存具体进度，历史任务书保存当时的执行记录。

## 当前工作

研究主线是 **按 skill/task 范围设计领域表达**。当前任务类为单 repo/ref、源码可见的授权与信任边界评估：围绕主体、资源、操作、条件和政策组织取证、判断与检查。质量约六成、编写复用约四成指开发投入安排，各项质量要求分别验收。

**当前授权队列为 [AU0–AU21 操作级取证与授权 DSL 贯通](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md)，状态 `in-progress`，开发线程拥有共享代码、方法文档、状态与 Git 的唯一写入责任。** 开发模型 `gpt-6.1-sol / max`，研究基线 `ba277160`；启动HEAD/origin为`dfe7ec32`。继续本地`skill-ir-aot`，仅发布用户origin。AU1–AU9原型、32位置登记、完整原skill22/8文件清单、作者/原字节消费者、变化配对与计量薄接线已实现并做反例验证，实际研究目标未达。

Share第十轮request16网络超时，16派发/15响应；同一Share逻辑任务16位置全部封存，其余15位置零调用blocked。原件SHA `dbae38f7bc29d4df99e30234aefaaca76a38d3376cfcb6ada4a5c95a5ae0cf24`，不重发或换身份。已有`retainTaskPause:true`范围裁定仅允许另三个独立原任务的显式16位置。Gitea第三轮在`272390cc`为21/21已知、四问终答partial且全unknown/rejected，4个current source units、sourceRef正确。源码常量和空数组已实际提交，但root仍错写调用关系，typed字段alias和helper参数重bind继续阻断；不把可得未解释源码归为部署前提。现有显式typed bind已能表达字段身份，新增精确别名类型提示和匿名指南而不扩大自动类型接受；1个预期red转绿，73定向pass/560断言与主/AU双类型通过。此前788联合pass/1平台skip、15 provider/native pass保持。旧reason失败经原payload无损proof和同题已知终答，仅裁定路由改善。该修复后已进行下面的完整原skill普通入口纵向诊断（AU10/AU12）；其结果、下一登记位置与未达责任分列。不再重抽第四轮structured debug。

完整原skill的Gitea native原/变在同`d2ba9490`各24/24已知；原/安装bundle与输入保持、raw/native一致，参考读取均0、目标执行0。两自然报告有字段限制及创建服务依据，形式均未checked/bounded。原位12current units、认证/admin/异常partial，末focus过时与helper类型错误；变化位3units，将any repo reader等同issues-unit reader的conditional SATISFIED未由org/team权限与admin例外支撑，原任务仍partial。日志根缺陷猜测不成立。旧分类器漏了两类正常草稿拒绝，1预期red转绿、52相关pass/235断言、双类型通过；精确原report重放归model-draft，原review保持，SHA范围裁定仅解除显式非Share行的误分类暂停。原/变native及structured debug不再重抽。

原政策作者首稿在`e458fa6f`5/5已知、11工具动作、目标执行0，nested误投及USAGE消费者check禁令使原稿partial；原件保持。`9a4c76f6`唯一修订5/5已知，实际读取首稿后root交付/格式/任务忠实性通过，四职责与原policy保持，消费者工具禁令修正。变化政策作者首稿同代码5/5已知、7工具动作，单一操作/六职责、any authenticated repository reader政策原文与完整skill适用职责保持，无字段修订。两稿源/原安装bundle保持、raw目标执行0，SHA绑定独立评阅合格；它们仍未证明源码结论质量或编写收益。合同3预期red、55相关检查和双类型通过。

原字节Gitea消费者在`187d2195`的request22结果检查派发后网络超时，22/21、无终答、formal unknown；source346文件有效、16current units、原稿/完整skill保持，不能用草稿单元代替交付。原件SHA `7e27e22bc5954516a8a4e22bf77cdff6af8d966cf7c2bdd7a178f271f8132dad`，raw/native计数一致；ordinary全响应守卫导致unbound诊断，不是已证明日志绑定缺陷。Gitea任务全部10种登记表示封存，剩余消费者变化位及3质量位零调用blocked，不换身份重发。SHA范围裁定保持Gitea/Share任务暂停，仅允许两个独立Python原任务的6质量首位置。

OWUI N/M-O在同`5ac2d651`完整原Cloudflare包分别7/7、24/24已知，26/39工具、source173文件有效、参考读取0、目标执行0；两自然终答partial，N formal不适用、M-O未checked/bounded。N漏bypass/hash拒绝/已有collection no-op等可见分支；M-O补述这些控制，但未交付外层caller和完整认证来源，6current units、1operation/1question不替代终答。主纠正探子引用中间解释及将formal与自然充分性混判。源码reason原样成为诊断而被分类白名单遗漏；1匿名预期red转绿、56相关pass/265断言、双类型通过，独立代码审查未发现已证明错误。仅按current unit与诊断的精确来源匹配归model-draft，原report/review/质量保持，零调用SHA裁定释放余4登记行。下一OWUI D-O，再Download N/M-O/D-O；修前后版本分列。

最新原件重算21归档尝试、311派发/309响应、2项完成与usage未知；known fresh7582951/cache968192/output299738，USD/developer/AI/human均未知，目标执行0。32原位置零provider重放通过，实际ordinary与作者原件按SHA绑定独立评阅。首答、修订、封存和未派位置分别保留；工程通过不能代替实际完整链或质量收益。恢复见AU results `status.json`，旧结果与保护输入保持。

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
