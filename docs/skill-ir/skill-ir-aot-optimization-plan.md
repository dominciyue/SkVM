# Skill IR AOT 当前执行计划

更新于2026-10-15。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BN0–BN19](../superpowers/plans/2026-10-15-authorization-purpose-scoped-authoring-and-consumption.md)，planned-not-started。复核和计划已完成，生产实现及真实BN实验由新线程接管；不向已关闭BM补行。
- 方法合同：[spec§14.53](skill-ir-aot-optimization-spec.md#1453-bn-purpose-scoped-authoring-and-consumption)；复核和开发过程统一在[研究§7.75](skill-dsl-research.md#775-bm-复核与-bn-聚焦修稿和消费线路调整)。BM实际结果保留在§7.74。
- identity：`authorization-purpose-scoped-program-v1`，已核对规划基线`a1ea1f3ca26b8f5ee4b088c359eefbbb442d7beb`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

约8–12小时为参考实质任务窗口，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。

## 当前开发责任

| 责任 | 实际缺口 | BN动作 |
|---|---|---|
| 分支补齐 | 所有已读函数产生大量unmapped，候选未形成当前修稿责任 | 相关函数前沿、单份候选、持久edit→trial→review；初始化和短路按轨迹验收 |
| 执行含义 | 字段分数尚未覆盖调用顺序/跳过；A1另漏root回退 | 保留旧18场景口径，新增严格事件顺序、拒绝后续动作及缺事实评价 |
| 消费实现 | C0仍构造旧性质；每回包的来源索引和窗口累积 | 按用途工具/提示、当前目录增量、详情读回；保留源码核验与原四问 |
| 最终交付 | 无工具收尾已交付，但重建材料仍有语义遗漏 | 核对真正发送的自包含交接，保留各问题唯一出处和缺口 |
| 自动化与维护 | A0尚未在最终edit首指令修复版复验；A1自动新稿已产生 | A0本轮修稿、A1从零、固定稿消费及S0维护分列，禁止替换选稿 |
| 效果判断 | BM首对质量相同且C输入3.82倍，耗时受并行负载影响 | 串行同epoch首对，具体修复或正向确认后才第二对；成本分账 |

普通入口当前使用[Download说明](../../examples/authorization-assessment/download-workflow/README.md)中的BL A0固定14步自动稿：默认文件11/archive，空版本12/original，明确false在授权处停止，仍为有限conditional。这些是BL原结果；BM固定A0仍15/18，A1新稿14/18。固定稿非法/跨根拒绝及constructor完成条件缺口保留，S0另存的副本维护稿不会改变它的评分。完整请求证明和稳定净收益未达；没有历史或开发者稿补位。

## 继承的真实结果

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM最终发布a1ea1f3c，八attempt/十二turn/七自然交付，A0原稿未改、A1新稿14/18，首对negative且无第二对；初始化、短路和完整自然质量未达。BN承接这些责任，旧原件与评分不回填。A0为修订既有自动稿，A1从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
