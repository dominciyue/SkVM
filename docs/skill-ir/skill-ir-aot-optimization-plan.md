# Skill IR AOT 当前执行计划

更新于2026-10-09。唯一实时入口为 [current-status](current-status.md)。

- 当前任务书：[AZ0–AZ18：授权性质抽象、真实检查与变化复用](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)，`authorized-not-started`。
- 方法合同：[spec §14.39](skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)；依据：[研究§7.61](skill-dsl-research.md#761-az-性质抽象材料采用与真实检查的开发决定)。
- 复核基线 `10bc06f0`。开发 `gpt-6.1-sol/max`，实验当前官方账号 `gpt-5.6-sol/high`。第三方API与AV旧位置继续暂停。

## 当前目标

让同一授权DSL围绕原问题选择证据、采用有范围的局部摘要并形成可核对结论，完成Download和OWUI完整原skill任务，检验两包消费和三类变化复用，再比较质量与开销。单性质闭合作为开发里程碑，原问题分母不缩减。

已有结构索引、MRO、procedure-summary、source-materials、inquiry/native和CLI继续复用。拟新增显式 `operation-evidence-v6`；不再把每个未知都扩成通用语言实现任务。真实缺陷当场红绿修复，不先跑满已知坏实现。

## AZ 队列

| 阶段 | 责任 | 实际验收 |
|---|---|---|
| AZ0–AZ2 | 一次失败归因、采用诊断、格式恢复、计量与路由 | 能说明材料停在哪一层，保留拒绝与总成本 |
| AZ3–AZ6 | 性质合同、现有摘要扩展、相关依赖、关键框架摘要 | 有依据地改变需求；未知影响不被抹去 |
| AZ7–AZ9 | 调度、局部采用、双入口、Download单性质 | 实际来源采用与检查，独立源码复核 |
| AZ10–AZ12 | 两个完整原任务、两包消费、三变化 | 原问题完整性、局部/整体复用分列 |
| AZ13–AZ15 | 三臂有限比较、独立评价、外部能力校准 | 协议失败计入原分母；整体方法/表达增量分开 |
| AZ16–AZ18 | 回归、研究归纳、文档与origin发布 | 真实可用、效果与未达分别交付 |

完整质量面板为2任务×3臂×2重复=12位置，符合相同条件的native首件可复用；另有1个单性质开发位置、2包消费和6变化位置。修订单列，不用重复调用凑时长。原件/评价隔离，源码衍生答案不得作为DSL预填事实。

## 执行规则与外部阻断

1. 发现共享缺陷，暂停受影响位置，当场定位、红测、修复和具名复验；独立工作继续。
2. 不因D失败无限推迟N基线；未达是结果。不同代码/合同版本不可混成同版本比较。
3. 摘要须有来源、适用性质、参数/对象、残余及撤回条件。模型context标签不是排除证明。
4. 账号已授权；AY旧记录提示2026-10-14 16:47恢复，当前是否可用按真实证据判断。明确额度不足时停止试探，完成独立工程并保留未运行位置，不换身份/通道或购买额度。
5. 工程、真实原任务、作者消费、质量/开销、变化复用分别验收；不能只凭离线包将研究目标标完成。

## 继承与维护

AY以 `completed-with-unmet-criteria` 收束，14尝试、10交付、2不可用、2失败，12质量未运行；详情见 [final closure](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)。旧原件和所有历史分母保留，新结果写 `authorization-property-abstraction-v1`。

继续 `skill-ir-aot`，仅推用户origin，新开发线程独占写入。研究同步§1/§7.61/§11；只更新已有长期组件文档。源码和能力测试不重复全历史审计；文档只维护当前入口和本轮涉及的开发文档。
