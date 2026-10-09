# Skill IR AOT 当前执行计划

更新于2026-10-10。唯一实时入口为 [current-status](current-status.md)。

- 当前任务书：[BB0–BB16：跨函数性质闭合、渐进解释与真实使用](../superpowers/plans/2026-10-09-authorization-interprocedural-property-closure.md)，`completed-with-unmet-criteria`，本次获准执行结束并已发布至用户远端。两次OWUI未知原件/费用保留；三个fresh各一次结束，policy/source自然partial、premise终态routing失败未交付；其它未知保护不变。
- 方法合同：[spec §14.41](skill-ir-aot-optimization-spec.md#1441-bb-interprocedural-property-closure)；复核依据：[研究 §7.63](skill-dsl-research.md#763-bb-跨函数性质闭合的复核与开发决定)。BB公共链与同epochN/M/D证据保持；16位置13已尝试/3previous blocked，15去重尝试/12自然交付，真实跨函数性质闭合和稳定净收益未建立。分项结果见BB verification/acceptance-matrix.json。
- 代码基线 `ad936715`。开发 `gpt-6.1-sol/max`，实验当前官方账号 `gpt-5.6-sol/high`；第三方API和AV旧位置继续暂停。

## 当前目标

让当前源码中的跨函数调用、对象传递、守卫和效果进入可复查的性质检查链。复用已有源码索引、有限求值、材料与普通入口；新增行为显式v7，旧策略和历史重放兼容。先修公共链和反例，再验证两原skill的完整任务、实际包消费和变化复用。

Download入口的effect解释没有生成call，helper材料虽可用却未采用；v6 binder和checker还有单来源边界。跨单元修复必须验证实际参数和调用实例，不能只扩大anchor查找集合。渐进解释保留相关unknown，局部闭合与完整原题分别评价。

## BB 队列与验收责任

| 阶段 | 责任 | 所需验收 |
|---|---|---|
| BB0–BB1 | 接管、归因、公共链正反例和最小表示设计 | 原件可定位；错对象、重复调用、未注册守卫等红测有据 |
| BB2–BB4 | 调用/角色分离、跨单元对象联系和性质检查 | 跨函数正例与违例均有实际采用及非空当前trace |
| BB5–BB7 | 渐进解释、相关前沿、双入口和BA派生重放 | 未解释相关影响仍unknown；公开read/edit链接通；旧原件不改 |
| BB8–BB10 | 新通道规则、Download和OWUI真实pilot | 有目的有限恢复；独立源码评阅与机器检查分列 |
| BB11–BB13 | 两任务三臂、两包、政策/前提/源码变化 | 同epoch同题同事实，原问题保留，复用范围和基础明确 |
| BB14–BB16 | 归因、必要减负、有限验证和发布 | 真实成本/未知分账，普通命令可用，未达责任可恢复 |

主登记16逻辑位置：2 pilot、6质量、2消费、6变化。同一次运行可在满足条件时引用，但不重复计样本或成本。修订和新epoch保留首件，不把不同实现的输出混成公平比较。结果目标与实际结果分别登记。

两次OWUI未知已按用户各自限定处置保留原report/raw/费用和锁字节，没有再次OWUI或fresh重抽授权。三fresh按policy→premise→source完成，两个交付各2采用、性质unknown。三个previous仍缺当前同方法/epoch且有checked/violated跨源trace的合格consumer基础。本次重放未通过，隔离定位createInquiryTools准备180.53秒未返回；后续拆分walk/源加载/词法/AST准备的计时，确认根因再修复，不能将RSS或本次中间采用当作验证通过。原包性质undeclared、真实角色/参数映射和完整原题缺口分别为未达责任，不把fresh当作复用测量。

## 执行与修复规则

1. 共享缺陷当场保存原件、定位、红测、修复、绿测和具名复验；受影响队列暂停，独立工作继续。
2. 同因连续两次无改善停止重抽，转原参数/确定性诊断；新根因可继续处理。不把一次修复额度当整个开发的上限。
3. 已有跨函数求值和草稿累积继续使用；不新增通用语言引擎，不通过省略原题、删除未知或自动补答案达标。
4. BB采用独立登记的有限官方恢复规则：就绪pilot可同通道重新进入，连续两次routing终态失败或累计三次恢复仍失败即暂停；quota/auth立即暂停，unknown先核查原生命周期。BA历史暂停保持，不切第三方/账号/模型。
5. 新研究使用完整端到端分母，另报有效答案质量。绑定、采用、机械检查、源码评阅和研究收益分别验收，研究成功不由测试数决定。

## 继承与维护

BA保留22位置/4尝试/3自然交付/20未运行，Download修订仍partial，OWUI原题自然full但机器unknown，具名复验routing失败。其[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)、原包与失败原件不补写；AZ/AY及更早结果亦不改。

继续`skill-ir-aot`，仅推用户origin，新开发线程独占写入。研究同步§1/§7.63/§11，更新现有usage与组件文档，不增加长期阅读入口。主/研究类型和受影响回归及文档检查通过后发布，不重复全历史审计或等待凑时长。
