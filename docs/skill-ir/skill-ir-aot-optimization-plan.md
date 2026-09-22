# Skill IR AOT 当前执行计划

- 更新日期：2026-09-22
- 路线：按skill/task范围设计领域表达，当前为源码可见授权与信任边界任务。
- 状态：AA0–AA13完成发布；代码与证据529cf0b3已核对origin/skill-ir-aot。
- 唯一实时入口：[current-status.md](current-status.md)
- 方法合同：[spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)
- 当前任务书：[AA0–AA13](../superpowers/plans/2026-09-22-authorization-authoring-reuse-and-value.md)
- 当前设计：[研究§7.24](skill-dsl-research.md#724-aa-作者声明修改复用与领域价值)

用户与学长确认：分类帮助确定范围，DSL可由AI起草、人工设计；改善可体现为质量、完整性、稳定性、效率或使用便利。本轮让用户可编写、修改一类授权任务，程序接管机械字段和变更检查，用同底座实验辨认领域表达的价值。

## 当前交付队列

| 阶段 | 工作 | 验收要点 |
|---|---|---|
| AA0–AA2 | 恢复、作者v2与lowering | 政策/期待归作者，内部身份归程序；稳定ID、共享对象、v1兼容 |
| AA3 | 普通入口与诊断 | init/check/run直接v2，原目录基准不变；诊断指向作者字段 |
| AA4–AA5 | 依赖快照与只读compare | 属性/要求/源码变化可见；旧session不足明确；不自动复用答案 |
| AA6 | 公共信息及评价对齐 | plain/ledger/conditions同事实、公共问题、v4、模型与评价 |
| AA7–AA8 | 两项独立作者原/变使用 | 保留原稿和自行修订；实际deny/allow变化；辅助介入透明 |
| AA9–AA10 | 六任务面板、一次共享修订 | 同底座12单元，最多4补充；初轮/修订/作者单列 |
| AA11–AA13 | 复核、统一文档、发布 | 有限相关验证，归属提交并推送用户origin，完成后停止 |

## 范围与执行

- 直接在skill-ir-aot，不新建分支/worktree；只推用户origin。
- 保留七项既有代码修改及历史untracked；旧结果和保护Q1/held-out/prospective不动。
- 不新增目标仓库，不做主动发现、目标执行、部署判断或patch。
- 开发gpt-6-astra / medium，被测xty/gpt-5.6-sol独立计量；真实成本unknown如实报告。
- 正常12面板单元及至多4作者分析单元，最多另加4个共享修订单元；不以运行时长/次数为目标，付费无美元上限。
- v4用于显式实验，legacy默认保持兼容；作者/修改改善与运行方法改善分开，不预设正向结果。
- 当前任务书与status维护执行，研究总文档按主题归入设计及结果，不在索引之后堆叠摘要。

## 复核依据与恢复

Z首轮四任务legacy/v4首答完整交付1/4与3/4，最终均3/4；调用7/4，input 43,719/21,926，output 20,017/10,705。v4 header超时及迟到usage保留，legacy仍默认；作者36条诊断后经主代理纠正完成原/变任务，独立编写改善仍待检验。175测试/1229断言和typecheck经复核通过。

AA接手时读取状态页、本任务书和研究§7.24，建立唯一结果根status并按nextAction恢复。结果根为`results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/`；历史证据由[索引](evidence-index.md)与[历史](history.md)承载。

AA最终：独立作者1/2首稿有效、2/2经至多一次作者接力完成；两组原/变deny→allow。前五组plain/ledger质量持平、ledger成本更高；header条件解释改善但初轮有一次修复。共享unknown检查假拒绝已红绿修正并离线重检，不重报初轮成绩。16单元/17调用，183测试/1337断言、typecheck通过。剩余边界是真人工时/美元未知、development范围、无自动答案缓存；完整结论见研究§7.24。
