# 实验结果导航与保留说明

更新于 2026-10-28。新课题是[按类别进行分层代码固化](../../docs/skill-ir/tiered-solidification.md)，目前完成方向研究与治理，尚无新课题的效果实验。旧结果按当时输入、实现和评价合同解释。

## 先看哪些结果

| 用途 | 入口 | 在新课题中的身份 |
|---|---|---|
| 分类和真实 skill 来源 | [S 分类](skill-task-dsl-preparation-20260919/classification.json) | 52 包、24 深读、30 任务卡；已暴露开发语料 |
| 真实 trace、包生成和成对消费 | [U 汇总](trace-guided-skill-optimization-20260913/final-report.json)、[G 汇总](general-skill-optimization-20260913/final-report.json) | 混合效果与失败分析，支持设计新测量，不代替新测试 |
| 生成、修复、实际消费的工程材料 | [F 汇总](general-generation-reinforcement-20260914/final-report.json) | 复用程序/包链路，保留负向成本记录 |
| 授权 DSL 最后结束的研究 | [BU 汇总](skill-dsl-research/development/authorization-source-differential-v1/summary.json)、[验收](skill-dsl-research/development/authorization-source-differential-v1/verification/acceptance-matrix.json) | 有限执行和独立验证资产；旧授权主线已收束 |
| 跨阶段代表性结论 | [实验目录](experiment-catalog.json)、[证据索引](../../docs/skill-ir/evidence-index.md) | 导航快照，最终以对应原件为准 |

## 本次盘点与处置

治理前本目录有 **66,575 个文件、29,286,613,435 字节的逻辑长度（约 27.3 GiB）**，其中 Git 跟踪路径 37,725 个。`skill-dsl-research` 占约 25.6 GiB；它含大量归档运行，体量不等于生产实现规模。NTFS 压缩后的实际占用没有在此次计量中估算。完整分组见[盘点 JSON](governance-inventory-20261028.json)。

本轮补齐入口、更新代表性目录，并把旧实验退出当前运行队列；**没有删除或迁移任何实验原件**。既有 `.tmp/` 保留，其中可能含唯一记录，不能仅因名称为临时目录就删除。

| 材料 | 决定 |
|---|---|
| 原始请求、响应、失败、未知状态、评价与成本 | 按旧身份保留；历史结果不回填，不将已暴露材料改称未见样本 |
| 已压缩的原件及分卷索引 | 保留现有形式，不再复制一套；读取按原恢复说明 |
| 自动包、固定输入、来源与执行依赖 | 有引用/验证绑定的继续保留；不是普通缓存 |
| 可重建环境、重复 checkout、缓存 | 逐项确认无唯一证据、无活动进程且有重建依据后才能清理；本次未据名称作删除决定 |
| 逐轮说明/大日志 | 原件留在结果根，当前文档仅保留结论与链接 |

## 后续写入

新课题首次实验再创建一个主题结果根，将编写、选择、执行、恢复、评价放在同一根下。修复用 attempt/revision 区分，保留首轮，不为每次修复另开身份和文档。

可复用代码放现有 `src`/`scripts`，本目录存输入、报告和必要证据。开发语料、评价依据、外部未知和冻结材料分别标明；避免模型在运行时读到独立评价答案。

离线查目录：在仓库根运行 `bun ./scripts/experiment-catalog/cli.ts show` 或 `check`。未登记目录不等于可以删除。
