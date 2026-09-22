# Skill IR AOT 当前执行计划

- 更新日期：2026-09-22
- 路线：按 skill/task 范围设计领域 DSL，当前为源码可见授权与信任边界任务。
- 状态：Y已结束，公共method入口遗漏转交Z；Z0–Z12已授权连续执行。
- 唯一实时入口：[current-status.md](current-status.md)
- 方法合同：[spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)
- 当前任务书：[Z0–Z12](../superpowers/plans/2026-09-22-authorization-dsl-protocol-and-usability.md)
- 当前设计：[研究 §7.23](skill-dsl-research.md#723-z-输出减负与实际使用)

用户与学长确认：分类帮助确定范围，DSL 可由 AI 起草、人工设计；改善可以体现为质量、完整性、稳定性、效率或使用便利。当前用主体、资源关系、操作、条件、政策和入口表达授权任务。JSON 是表达载体，效果比较决定是否保留额外结构。

## 当前完整交付队列

| 阶段 | 工作 | 验收要点 |
|---|---|---|
| Z0–Z1 | 恢复、补齐公共method | plain/ledger/conditions可选择；省略参数兼容；实际行为与预览一致 |
| Z2–Z4 | 首答诊断、紧凑wire及归一化 | 六次历史失败可定位；模型只写判断与事实；宿主填固定元数据；语义检查保留 |
| Z5–Z6 | 宿主接线、计量与评价校准 | 新旧协议公平；授权判断与HTTP响应细节分列；旧成绩保留 |
| Z7–Z8 | 八单元匹配运行、一次共享修订 | 首答与最终质量、fallback和成本完整；最多四个补充单元 |
| Z9–Z10 | 实际编写、变化任务、默认选择 | 两次普通分析；记录作者步骤；依据实际质量与开销决定适用模式 |
| Z11–Z12 | 文档、有限验证、发布 | 统一研究复盘；归属提交并推送用户origin；完成后停止扩展 |

本轮固定四个已暴露任务，比较条件模式的旧wire/v3与紧凑wire/v4，共八个单元；另做原任务和变化任务两次普通使用。正常十单元，至多十四单元；范围用于防止重复试验，不是美元额度。开发任务使用gpt-6-astra / medium，被测模型仍为xty/gpt-5.6-sol。评价口径变化与方法收益分开报告。

## 工作边界

- 单repo/ref、显式源码与授权义务；不新增仓库自动发现、目标执行、部署验证或patch。
- 直接在skill-ir-aot工作，不创建新分支/worktree；仅发布用户origin，保留无关tracked/untracked。
- 复用provider、host、CLI、validator、telemetry，不复制一套平台。
- 省略method保持Y行为：无condition request采用ledger/B，有明确request启用conditions；显式plain/ledger/conditions可选择，新协议默认由匹配结果决定。
- 旧Q1/held-out/prospective保护输入不读，历史结果不覆盖；本轮不新增仓库或未见输入。
- 网络、认证GitHub及有目的付费调用已授权；实际/估计/unknown费用与开发代理成本分列。
- 工程缺项明确标记，研究negative不阻塞独立工程；不等待、重复审计或重复调用凑时长。

## 已有结果与恢复

S/D/E/T完成分类、来源、范围与语义准备；V/W建立原型、传输与计量。X在两项目五任务的23次初轮得到14 full/5 partial/4 incorrect，共同标签合同复测4/4 full；普通CLI默认B，D没有额外观察收益。Y新增条件结果、authoring与顶层CLI：开发P/L/C面板15/15决策正确，C只在一个任务少一项解释缺口；方法固定的Gitea迁移12/12决策正确、P/C质量持平，C为1.5倍调用、2.93倍known tokens和2.36倍known time。最终价值为mixed，ordinary继续B/L、C opt-in；旧成绩不重写，actual USD unknown。

恢复读取状态页、Z任务书、研究§7.23和Z执行代理创建的status.json；只按实际未完成项继续。原始证据由[证据索引](evidence-index.md)和[历史](history.md)承载。Z任务书已记录Y的method漏项、六次C首答传输失败和HTTP403评价争议，优先修共享实现并验证真实使用。
