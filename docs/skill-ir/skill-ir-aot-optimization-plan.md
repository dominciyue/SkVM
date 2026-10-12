# Skill IR AOT 当前执行计划

更新于2026-10-12。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BF0–BF17：真实可执行授权 DSL、自动编写接线与变化消费](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)，`completed-with-unmet-criteria / BF17已发布`。规划基线`74bf7bef`、实际接管`34e5e302`；最终源码`869c0cbe`，实质成果`4a002635`已推用户origin并核对，六首位置及三具名修订均已处置。
- 方法合同：[spec§14.45](skill-ir-aot-optimization-spec.md#1445-bf-executable-contract-and-authoring)；复盘统一在[研究§7.67](skill-dsl-research.md#767-bf-真实可执行程序与自动编写接线)，依据为§7.66发布后复核。
- identity：`authorization-executable-contract-v1`。继续`skill-ir-aot`，只推用户origin，不创建分支/worktree；派发后新开发线程是代码、共享方法文档和Git的唯一写者。
- 开发`gpt-6.1-sol/max`，实验用已授权官方账号`gpt-5.6-sol/high`。第三方暂停、OWUI仅离线、旧未知和held-out/Q1/prospective/readiness/历史0/6保持。

## 已完成的工程与未达责任

BF已接通作者文件、模型工具与previous共同核心，显式函数范围、实际调用前缀、当前输入重算及来源/程序失效。真实两函数可见性程序在null输入下checked/unreachable，普通可搬移例子与关键反例通过。相关1902测试/1平台skip、2研究测试及主/BF类型通过；全src误跑104失败原件保留，保护锁未动，不称全仓通过。

隔离自动编写三份D均0采用；作者消费和previous实际使用成立，但四问整题0/8 full。变化/fresh替换了给定程序，previous在修复后epoch恢复2/使用2，当前unknown且新请求程序拒绝导致合同invalidated。运行版本与最终程序不同，观察费用取舍不能称同条件净收益。作者含义继续与自动B隔离。

## 下一责任

| 责任 | 当前证据 | 继续工作的边界 |
|---|---|---|
| 自动可执行编写 | 原D无声明；两具名D修订只提交无效形状，0自动R1 | 改进通用编写与source owner定位，不能把A含义给B或放宽错误声明 |
| 完整原任务质量 | 根查找回退和独立deleted版本参数仍有漏项/错误，17/32逐题full | 保留原四问、整篇交叉阅读及实际调用参数流；局部性质不替代完整回答 |
| 给定程序消费成本 | previous恢复2并实际用2，fresh/previous的epoch和最终程序不同 | 等运行版本/最终程序下再测质量和全成本；不恢复旧答案/verdict |
| 请求级证明 | 当前局部call-prefix可运行，callee效果/框架认证与数据库选择仍缺 | 针对具体真实缺口改表达/消费，不无边界扩语言或借helper局部成功认证请求 |

约8小时是工作量估计。BF16已核现有来源顺序/双调用/搬移覆盖，并重建53个真实发送包；现有encoder候选与实际一致，新增减负0bytes。有限调用已关闭，不等待凑时长或自动追加新面板。

## 范围和验收

1. 明确区分request-operation与function-contract，局部结论携带假设和剩余上游职责。helper不伪标请求entry；假设不能自证待检查性质。
2. 作者文件、模型工具和previous共用来源/编译/检查核心，宿主填机械身份，作者或模型提供源码含义。普通入口复用现有inquiry，不另造CLI平台。
3. 原完整skill和四问保留。局部程序checked/violated、source语义支持、整题质量和收益各自判断；任何缺失或unknown不能默认为安全。
4. 首次共享故障保存原件、红绿修复再具名复验，不把已知坏实现跑满；同因两次无进展转确定性定位，失败与费用不覆盖。
5. 六首位置分自动H/D、同包作者消费、变化fresh/previous三轨；可选第二H/D对与最多三具名修订。研究输入排除开发者参考程序、旧答案和evaluator。
6. 官方账号沿64总工具/768KiB显示/32MiB读取/45分钟会话；恢复及unknown规则见任务书。费用按唯一尝试记一次，cache不重复相加，USD/隐藏请求/真人分钟未知保留。

## 验收与维护

BF [验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/verification/acceptance-matrix.json)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/summary.json)与[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/accounting.json)按A/B/C记录。9归档/8模型交付，known input12,734,868含cache11,745,280/output73,991；实际USD、隐藏、开发探子与真人成本未知。同epoch原H/D均2/4逐题full；D累计input/output/耗时更高、非缓存input较低，不据账号token推算实际美元优势。H保留普通opt-in候选，D显式研究，项目默认不变。

`74bf7bef`已修正研究正文中的include_deleted跨调用误判：原两件P/F/F/P保留，后续评价按各次调用实参重新核定。旧BE回答/评阅/统计不改；新测试与证据放BF identity。完整历史见current-status、研究§7.66及Git。

研究统一更新§1/§7.67/§11；spec14.45写方法，usage/developer-guide写已实现接口。根conversation_log/handoff/communication仅本地同步。不新增阶段化组件正文，不重复全历史审计；当前修改所需测试、类型与文档核验通过后按目的提交并只推用户origin。
