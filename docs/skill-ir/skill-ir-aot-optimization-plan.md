# Skill IR AOT 当前执行计划

更新于2026-10-14。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BM0–BM20](../superpowers/plans/2026-10-14-authorization-branch-completion-and-directed-consumption.md)，已授权登记、待开发线程接管；当前没有 BM 工程或实验结果。
- 方法合同：[spec§14.52](skill-ir-aot-optimization-spec.md#1452-bm-branch-completion-and-directed-consumption)；复核和开发过程统一在[研究§7.74](skill-dsl-research.md#774-bl-复核与-bm-分支补齐和按职责消费)。BL实际结果保留在§7.73。
- identity：`authorization-branch-verified-consumption-v1`，已核对规划基线`cb8a721a`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。接管时tracked干净，原有未跟踪`.tmp/`不清理。

约8–12小时为参考实质任务窗口，不等待或重复验证凑时长。沿BK恢复合同区分旧unknown、本地宿主与研究处置；不重发原请求、不改终态/费用，核查隔离后可开展已授权独立用途。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。

## 当前开发责任

| 责任 | 实际缺口 | BM动作 |
|---|---|---|
| 分支补齐 | 作者自报覆盖漏掉非法/跨根拒绝及初始化前提 | 从已读源码产生结构候选，模型解释和映射，同核trial后定向patch |
| 执行含义 | 当前值、必要条件与其它分支缺口混合 | 分层投影，保留旧状态和未认证边界，不删gap求通过 |
| 消费实现 | full重复传输，恢复材料未被使用，仍重复读源码 | 显式directed按职责交付、规则可取回、后续变化投影与真实计量 |
| 最终交付 | finalOnly后仍请求工具，C2缺自然答 | 原预算内真实无工具收尾，edit/consume共同接线，unknown不重发 |
| 自动化与维护 | BL两作者15/18；S0局部源码变化成立 | A0自动修订、A1独立从零；固定A0两对消费与拒绝消费，S0单列 |
| 效果判断 | BL两对四问质量持平、输入4.63/5.23倍 | 第一对出现共享原因当场修；不同epoch分开；无具体改变不重复负向方式 |

普通入口当前使用[Download说明](../../examples/authorization-assessment/download-workflow/README.md)中的BL A0固定14步自动稿：默认文件11/archive，空版本12/original，明确false在授权处停止，仍为有限conditional。A0/A1首稿均0/18、最终均15/18；非法/跨根拒绝及constructor完成条件缺口保留。完整请求证明和稳定净收益未达；没有历史或开发者稿补位。

## 继承的真实结果

BL最终发布cb8a721a。A0/A1自动程序均15/18有限行为匹配；非法/跨根版本没有显式拒绝，缺外部事实时未保留constructor条件。两对原四问均full，消费更贵；C2无自然交付，原unavailable及后查interrupted均保留。程序确实执行与源码材料实际采用为0分别成立。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-reusable-program-v1/summary.json)和§7.73保持原证据；USD、开发和真人成本未知。

BM承接未达责任，不向BL补行。A0为修订既有自动稿，A1才是从零独立编写，二者不混合。BI/BJ及更早原件、held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。工程完成、实际自动主链、四问质量与净收益分别验收。
