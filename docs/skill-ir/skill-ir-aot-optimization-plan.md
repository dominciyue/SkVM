# Skill IR AOT 当前执行计划

更新于2026-10-11。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BD0–BD16：源码解释持续补齐、独立性质检查与真实质量比较](../superpowers/plans/2026-10-11-authorization-semantic-completion-and-real-quality.md)，`ready-for-dispatch`。用户要求新`gpt-6.1-sol/max`开发线程连续实施；本次规划未修改生产代码或运行新实验。
- 方法合同：[spec §14.43](skill-ir-aot-optimization-spec.md#1443-bd-semantic-completion-and-real-quality)；复核依据：[研究 §7.65](skill-dsl-research.md#765-bd-解释持续补齐与独立质量比较)。已复核开发基线`f37ee589`；实际接管时记录任务书提交后的HEAD。
- identity：`authorization-semantic-completion-v1`。显式策略`semantic-completion-v1`继承task-binding/v7，旧默认保持。继续`skill-ir-aot`、仅用户origin，不新开分支/worktree。
- 实验沿用当前官方账号`gpt-5.6-sol/high`；第三方API和AV旧位置继续暂停。两个旧OWUI未知仅离线处置，不追加真实派发。

## 当前目标

让模型已经正确提交的局部解释得到保留，并持续补齐当前原问题所需的缺字段、调用含义和分支。宿主在材料变化时独立计算性质，终答格式失败与已有源检查分别记录。完整原skill、全部原题和严格对象/可达性检查保持。

质量比较与材料复用采用各自的准入条件：N/D公共输入、只读和协议可运行后，就能比较最终回答，D不必预先拥有checked性质。previous仍须当前合格跨源材料、独立源码支持和可恢复会话。原题自然质量、程序检查、实际复用及总开销分别验收。

## 未完成队列

| 阶段 | 开发责任 | 所需验收 |
|---|---|---|
| BD0–BD1 | 接管登记、真实partial/格式原件与公开路径红测 | 区分已接收但未完成、源码缺失、格式阻断；人工参考仅在评价侧 |
| BD2–BD3 | 持续解释责任、当前问题优先及多题公平推进 | partial不提前结束决定性责任，修一字段不清其他项，无进展具名终结 |
| BD4 | 独立性质计算、缓存与失效 | 合法材料可在最终答案前产生检查；依赖/语义变化撤回旧结论，report不改状态 |
| BD5–BD6 | 窄编辑提交与分阶段恢复预算 | 官方静态工具Schema和实际上下文一致；源格式错误不吃光终答修正，仍受64总量约束 |
| BD7–BD8 | 原问题分支/事实映射、普通入口和完整skill会话 | 源内可知与用户未知分清；实际session可inspect/previous，原四题不减 |
| BD9–BD11 | 新研究实现、局部诊断及两次N/D同期比较 | D未checked仍可参比，首件/共享修订分列，质量与全部开销实际测量 |
| BD12 | 原三变化的fresh/previous | 当前合格局部材料才进入；确实采用/重算/失效，无基础六位置具名未执行 |
| BD13–BD16 | 反例、有限联合验证、归纳和发布 | 工程/真实局部性质/完整任务/比较/复用/净收益分开记录，推origin核对 |

11逻辑位置为`extraction-download`、两次N/D配对4位置及policy/premise/source的fresh/previous6位置。局部诊断12工具；完整运行64工具、768KiB显示、32MiB读取、45分钟。源码编辑与终答格式分别给予有限更正，总预算不增加；所有拒绝和修订计量。

## 执行与修复

1. 从真实失败的红测开始，复用现有核心和入口；不扩大语言语义或增加仓库成功特判。
2. 共享缺陷当场保存原件、定位、红绿修复和具名复验。受影响实验先修再跑，独立工作继续；新根因可以继续解决。
3. 同一原因连续两次没有保留进展，停止重抽并转最窄确定性诊断。源码/依赖真正变化可重新打开对应责任。
4. 模型从本次共同原文提出语义，宿主填机械身份；评阅答案、人工参考和历史正确解释不进入实验上下文。完整原包/原题不变。
5. routing明确终态允许一次具名恢复；连续两次或累计三次恢复仍失败暂停本轮外部派发。quota/auth暂停；unknown仅核查原生命周期，不换账号、清锁或重发。
6. 工程任务连续推进，常规检查点不等待确认；有限队列结束仍有研究未达项时如实关闭执行，不宣称研究目标实现。

## 继承证据与维护

BC已以`completed-with-unmet-criteria`发布至`f37ee589`：5尝试全部自然交付，0合格跨源性质；17 prepared中12 unknown、首件2缺逐题查询、premise3未检查。五份四题评阅累计11full/9partial，属于重复任务及变化；5份完整任务均partial。4比较/3previous未派发，旧准入不改写。真实已接受partial仍缺字段和终答格式阻断见[BC验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/acceptance-matrix.json)及研究§7.64。

源码准备80.59s→21.58s及当前派生重放为已有工程证据，不重新定位已解决热点。BC归档1,833通过/1平台跳过和类型检查保持；上一轮复核新鲜49tests/369断言。known input16,788,094含cache15,453,312/output86,987；美元、隐藏请求、开发与探子和真人成本未知。BB未知处置、held-out/Q1、prospective/readiness及历史0/6均保留。

研究过程统一追加§7.65并同步§1/§11、spec§14.43及当前状态；普通接口变化同步现有usage/developer-guide。新开发线程为唯一写者，保留其他本地材料。只运行受影响测试、类型与必要文档核验，不重复全历史审计或为时长重复调用。
