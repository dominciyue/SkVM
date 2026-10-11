# Skill IR AOT 当前执行计划

更新于2026-10-12。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BF0–BF17：真实可执行授权 DSL、自动编写接线与变化消费](../superpowers/plans/2026-10-12-authorization-executable-contract-and-authoring.md)，`planned-authorized / 待新线程接管`，规划基线`74bf7bef`。用户授权约8小时连续开发；任务书已登记，尚无BF实现或效果。
- 方法合同：[spec§14.45](skill-ir-aot-optimization-spec.md#1445-bf-executable-contract-and-authoring)；复盘统一在[研究§7.67](skill-dsl-research.md#767-bf-真实可执行程序与自动编写接线)，依据为§7.66发布后复核。
- identity：`authorization-executable-contract-v1`。继续`skill-ir-aot`，只推用户origin，不创建分支/worktree；派发后新开发线程是代码、共享方法文档和Git的唯一写者。
- 开发`gpt-6.1-sol/max`，实验用已授权官方账号`gpt-5.6-sol/high`。第三方暂停、OWUI仅离线、旧未知和held-out/Q1/prospective/readiness/历史0/6保持。

## 本轮要解决的具体问题

BE公开v7链与H/D前端已实现，但D1及修订只有可用helper、无可投影entry；previous恢复材料却未实际使用。声明还受当前focus与窗口限制，合法已读source无法独立提交。跨源绑定本身已经存在，不重复造resolver。

因此先把三个问题拆开：开发者能否写出真实可执行程序；模型能否经同一核心自动编写；普通使用及变化能否获益。开发者程序可以有源码语义，但只作表达诊断/给定程序消费，禁止进入自动编写输入后冒充生成成功。

## 约8小时队列

| 阶段 | 工作 | 预计投入 |
|---|---|---:|
| BF0–BF1 | 接管、评价勘误、原题与失败输入 | 0.5h |
| BF2–BF3 | 真实程序、条件范围与表达反例 | 1h |
| BF4–BF5 | 已读来源路由、声明保留与实际材料接线 | 1.25h |
| BF6–BF7 | 现有CLI薄接入、持久会话与变化检查 | 1.25h |
| BF8–BF9 | 第二结构离线压力检查、普通消费与输入隔离 | 1h |
| BF10–BF12 | 隔离自动编写、当场修复、同包实际使用 | 1.5h |
| BF13–BF14 | 分层previous、独立评阅与成本 | 0.75h |
| BF15–BF17 | 有用余量、相关验证、文档及发布 | 0.75h |

时间为工作量估计，不保证研究结论。提前完成先处理任务书内有用余量，不等待/重跑凑时长；实验通道暂停时继续独立工程。常规检查点不等待用户。

## 范围和验收

1. 明确区分request-operation与function-contract，局部结论携带假设和剩余上游职责。helper不伪标请求entry；假设不能自证待检查性质。
2. 作者文件、模型工具和previous共用来源/编译/检查核心，宿主填机械身份，作者或模型提供源码含义。普通入口复用现有inquiry，不另造CLI平台。
3. 原完整skill和四问保留。局部程序checked/violated、source语义支持、整题质量和收益各自判断；任何缺失或unknown不能默认为安全。
4. 首次共享故障保存原件、红绿修复再具名复验，不把已知坏实现跑满；同因两次无进展转确定性定位，失败与费用不覆盖。
5. 六首位置分自动H/D、同包作者消费、变化fresh/previous三轨；可选第二H/D对与最多三具名修订。研究输入排除开发者参考程序、旧答案和evaluator。
6. 官方账号沿64总工具/768KiB显示/32MiB读取/45分钟会话；恢复及unknown规则见任务书。费用按唯一尝试记一次，cache不重复相加，USD/隐藏请求/真人分钟未知保留。

## 已有证据与维护

BE有限执行完成、研究未达；六质量首件N/H/D逐题full为3/8、4/8、4/8（同任务重复），D相比Hinput约3.50倍、非缓存约1.59倍、耗时约1.49倍。14模型运行全部交付、整题0/14、35D检查unknown、0合格跨源性质；previous实际材料使用0。H保留普通opt-in候选，D显式研究，项目默认不变。

`74bf7bef`已修正研究正文中的include_deleted跨调用误判：原两件P/F/F/P保留，后续评价按各次调用实参重新核定。旧BE回答/评阅/统计不改；新测试与证据放BF identity。完整历史见current-status、研究§7.66及Git。

研究统一更新§1/§7.67/§11；spec14.45写方法，usage/developer-guide写已实现接口。根conversation_log/handoff/communication仅本地同步。不新增阶段化组件正文，不重复全历史审计；当前修改所需测试、类型与文档核验通过后按目的提交并只推用户origin。
