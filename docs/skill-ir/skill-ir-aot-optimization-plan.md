# Skill IR AOT 当前执行计划

更新于2026-10-12。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BG0–BG16：真实任务 DSL 全流程运行、渐进执行与可读结果](../superpowers/plans/2026-10-12-authorization-end-to-end-practical-execution.md)，`completed-with-unmet-criteria`。从`4a247638`接管；实际程序、会话、计量及分轴结果见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json)。
- 方法合同：[spec§14.46](skill-ir-aot-optimization-spec.md#1446-bg-practical-end-to-end-execution)；复盘统一在[研究§7.68](skill-dsl-research.md#768-bg-全流程优先与同任务执行决定)。BF原结果和复核依据保留在§7.67。
- identity：`authorization-practical-execution-v1`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；派发后新线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定的astra6 high；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停、OWUI仅离线、旧未知和保护证据保持。

## 本轮主要交付

同一个真实Download任务，从完整原skill/原四问和允许源码出发，交付可读DSL程序、ordinary run、实际逐步轨迹、自然结果及同程序变化重跑。首先保证一次有实质计算与结果的完整流程，自动编写和稳定收益随后分别评价。

| 阶段 | 主要工作 | 留下的实物 |
|---|---|---|
| BG0–BG1 | 接管、阅读主链并写真实程序 | 同任务程序初稿及首个公共阻断 |
| BG2–BG4 | 薄作者前端、局部继续、资源/选择/授权/返回关系 | 进入公共核心的可执行程序 |
| BG5–BG7 | consume/edit、可读trace、正常/拒绝/缺失/回退 | 同程序的离线主链与变体结果 |
| BG8 | 第一次普通官方账号全流程 | 完整skill/四问、实际DSL执行和最终答案 |
| BG9–BG12 | 同任务自动编写、变化消费、必要公平对照和源码复核 | 原稿/修订、实际使用及分层评价 |
| BG13–BG16 | 相关验证、可搬移例、当前文档和发布 | 可复制命令与原件支持的结果 |

预计约8小时有用工作量，首个普通全流程优先在前2–3小时取得；不等全部检查、自动编写或质量对照成功才运行，不用等待或重复审计凑时间。

## 方法调整

1. 局部缺口不清空全程序。progressive保留独立有效片段，受影响处为条件/具名缺口，模型可继续带引用解释。
2. 宿主补机械字段与唯一来源定位；含义由作者或模型读源提供。源码、主体/对象与变化失效仍准确，不把未知改成许可。
3. 导入程序的消费保持活动版本，模型新稿独立保存；有效替换只在显式edit进行。真实source变化照常撤回相关旧结论。
4. 优先复用现有跨源与有限求值能力，只补主链所需领域关系；不重建Python全集、研究专用执行器或另一套CLI。
5. A开发者编写、B模型独立编写、C消费均用同一个主任务。BF visibility helper仅作回归，不继续替代Download主链。
6. 原四问全部保留；逐题计算/模型解释/未解、整体质量、自动化、实际收益各自报告。C给定程序对照的Markdown获得相同源码含义。

## 执行与恢复

首次共享错误原件留存，当场红测→共享修复→绿测→具名确认；同因两次无进展转本地根因分析，不把坏面板跑满，也不按任意修订总数停止工程。已定位的预算截断允许有理由调整，同版配对保持共同条件。

官方通道明确routing失败一次具名恢复，连续两次仍失败暂停外部派发；quota/auth暂停该通道，unknown核原生命周期而不自动重发。独立工程和零模型运行继续。成本按实际回执唯一计量，cache含在input时不重复相加，USD/隐藏/开发代理/真人时间未知保留。

BG现有7归档/5模型交付，原作者程序与同程序变化均实际消费；10变体、源码变化失效及可读普通会话已落地。自动编写只有3源局部合同，未产生资源主链；一对同信息比较为质量/时间与token成本的取舍，净收益未建立。继续工作应针对自动表达及重复上下文成本，不自动增加模型样本。旧BF的9归档/8模型、17/32逐题full、0/8整题full及104项全src失败原件保持，见[BF验收](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)。

## 文档与验证

主文档更新spec14.46、研究§1/§7.68/§11、current-status与本计划；普通接口落地后更新usage/developer-guide，不新增长期组件正文。根账本仅本地。

开发用相关红绿、主/研究类型、一次必要授权联合回归；文档按当前更改与已有retired/governance配置验证。不重跑全历史/全src审计或为了通过而改保护锁。最终先展示怎样运行及真实结果，再说明剩余责任。
