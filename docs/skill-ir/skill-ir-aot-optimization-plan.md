# Skill IR AOT 当前执行计划

更新于2026-10-13。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BK0–BK19](../superpowers/plans/2026-10-13-authorization-recoverable-authoring-and-real-delivery.md)，计划就绪、尚未实施。先处理会话持久记录/未知隔离，再取得真实自动稿、同稿变化和消费比较。
- 方法合同：[spec§14.50](skill-ir-aot-optimization-spec.md#1450-bk-recoverable-authoring-and-real-delivery)；复核和开发过程统一在[研究§7.72](skill-dsl-research.md#772-bj-复核与-bk-可恢复自动编写决定)。BJ实际结果保留在§7.71。
- identity：`authorization-recoverable-authoring-v1`，实施基线`af226837`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；开发线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6-astra/high`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。

约8–12小时为参考实质任务窗口，不等待或重复验证凑时长。BJ原R0不重发、不改终态/费用。BK将历史unknown与本地运行状态分开；已有核查无法恢复、宿主已关闭且独立用途已授权时，可隔离旧请求继续A0。新额度/认证及重复通道故障按任务书暂停对应通道，仍推进独立工程。

## 当前开发责任

| 责任 | 实际缺口 | BK动作 |
|---|---|---|
| 会话与恢复 | ephemeral不可读回与全局unknown锁造成等待 | 分离服务器终态/本地宿主/研究处置，持久读取与原稿检查点，隔离旧R0 |
| 输入与原稿 | 显式绑定已接入，实际作者尚未采用 | 复用BJ接口，用A0真实program/patch验证 |
| 作者运行闭环 | 早期checkpoint主要是提示 | 进度与有界继续接入普通循环，共享总预算，保存首稿/执行/修订/自然答 |
| 版本、权限与root关系 | BI两轨有限完整匹配均0/14 | 源码可见关系由作者补写，同自动原稿跑变化矩阵，精确外部条件保留 |
| 编写与复用 | BJ没有新自动稿/消费者 | A0产物固定后C0/C1/C2实际消费，S0在可恢复程序上做源码变化 |
| 质量与成本 | BJ无实际比较，未知费用保留 | C0→B0、B1→C1同期比较，原四问和编写/修稿总成本分账 |

普通入口继续使用[Download说明](../../examples/authorization-assessment/download-workflow/README.md)中的BI自动原稿显式命令；BK尚无新产物。BJ授权联合1950pass/1平台skip/12975断言及类型通过，发布后99定向测试/740断言、两次公开零模型运行复核通过；这不是BK实施证据。BK交付当前自动稿后再更新示例，不回落到开发者程序冒称成功。

## 继承的真实结果

BI最终发布ace945fa，八位置全部交付、无BI活动/未知请求。A2恢复稿12步但原/变消费均无文件计算；自然整题5/8 full分属作者、自动稿消费者和开发者材料，P0 tradeoff/P1 negative。[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/summary.json)及旧原件保持，开发者25步程序不替代自动成功。历史1942授权联合通过/1平台skip、类型和15文档测试是BI验证记录。

发布后定向复核68测试/502断言通过，公开运行仍conditional。诊断性补入输入仅用于定位剩余含义缺口，不回填BI或记为自动成功。BJ重新承接未达责任，不向BI补行；BH/BE及held-out/prospective/Q1/readiness、历史0-of-6、旧未知与全src旧104失败保持。
