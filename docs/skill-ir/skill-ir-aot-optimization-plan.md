# Skill IR AOT 当前执行计划

更新于2026-10-12。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BH0–BH17：DSL渐进编写、有效草稿保留与高效消费](../superpowers/plans/2026-10-12-authorization-incremental-authoring-and-efficient-consumption.md)，`planned-authorized`。基线`4595339f`；保留BG已运行的Download程序，规划未新增生产实现或模型结果。
- 方法合同：[spec§14.47](skill-ir-aot-optimization-spec.md#1447-bh-incremental-program-authoring-and-consumption)；复盘统一在[研究§7.69](skill-dsl-research.md#769-bh-发布后复核与渐进编写消费决定)。BG已有结果见§7.68和[summary](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json)。
- identity：`authorization-incremental-program-v1`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；派发后新线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。

## 本轮主要交付

先修已复现的resourceWorkflow整体拒绝与自动修稿丢失，再让模型对同一Download逐步编写、普通消费者按当前结果完成四问。紧凑消费保留原件与按需源码，第二已暴露任务ShareLink做离线共享算子检验。自动编写、真实使用和净收益各有自己的证据。

| 阶段 | 主要工作 | 留下的实物 |
|---|---|---|
| BH0–BH2 | 接管、坏步骤红测、局部解析及控制缺口 | 好步骤继续、坏控制不丢失的公共编译器 |
| BH3–BH6 | 薄source、持久草稿、patch和工具接线 | 普通入口内增量修稿/执行/inspect |
| BH7–BH9 | compact/full消费、可读轨迹、当前程序来源回归 | 按需详情及当前值/缺口保真的消费投影 |
| BH10–BH11 | 同任务隔离作者与原/变消费者 | 自动原稿、修改和同程序实际消费 |
| BH12–BH14 | 第二任务离线迁移、一次消费配对、独立核对 | 共享算子结果、逐题质量与真实开销 |
| BH15–BH17 | 必要验证、统一文档与发布 | 可运行例、分轴结论与origin交付 |

预计约8小时有用工作量。先取得普通入口局部修稿后仍可运行的成果，再推进模型编写和使用；不等待全仓/完整质量才演示，不用睡眠、重复验证或额外面板凑时长。

## 方法调整

1. progressive按资源步骤编译；坏value的数据依赖和坏guard/return的控制影响分别传播。保留顺序及诊断，独立结果继续。
2. 宿主只补唯一来源及固定机械字段；缺说明不造理由，缺source不造含义，source变化仍撤回相关结果。
3. 持久草稿按revision增量修改，省略不删除；consume不改活动程序，edit的候选/采用/旧活动结果清楚区分。
4. 共用原有限求值/来源/普通入口，compact只投影当前状态并允许实际详情读取，不隐藏原职责或增加另一执行器。
5. A1作者不见开发者程序/评阅；C1/C2消费自动原字节，P配对固定同一给定程序，仅消费视图不同。第二任务仅离线。
6. 原四问逐题质量、自动编写、材料使用、完整调用tokens和耗时各自报告；字节变短不当作真实净收益。

## 执行与恢复

首次共享错误原件留存，当场红测→共享修复→绿测→具名确认；同因两次无进展转本地根因分析，不把坏面板跑满，也不按任意修订总数停止工程。已定位的预算截断允许有理由调整，同版配对保持共同条件。

官方通道明确routing失败一次具名恢复，连续两次仍失败暂停外部派发；quota/auth暂停该通道，unknown核原生命周期而不自动重发。独立工程和零模型运行继续。成本按实际回执唯一计量，cache含在input时不重复相加，USD/隐藏/开发代理/真人时间未知保留。

BH模型队列为A1、C1/C2、P-full/P-compact五首位置。自动资源程序缺失则C零调用结束，partial产物可以带缺口实际消费；P已有程序继续。新共享根因当场修复并具名确认，旧失败不改。BG7归档/5交付、3源自动稿/0资源步骤、同信息取舍及BF104项全src失败均保持；第二ShareLink的未知逻辑请求不自动重派。

## 文档与验证

主文档更新spec14.47、研究§1/§7.69/§11、current-status与本计划；普通接口落地后更新usage/developer-guide，不新增长期组件正文。根账本仅本地。

开发用相关红绿、主/研究类型、一次必要授权联合回归；文档按当前更改与已有retired/governance配置验证。不重跑全历史/全src审计或为了通过而改保护锁。最终先展示怎样运行及真实结果，再说明剩余责任。
