# Skill IR AOT 当前执行计划

更新于2026-10-09。唯一实时入口为 [current-status](current-status.md)。

- 当前任务书：[AZ0–AZ18：授权性质抽象、真实检查与变化复用](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)，`completed-with-unmet-criteria`；有限队列按通道停止规则收束，研究目标未达。
- 方法合同：[spec §14.39](skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)；依据：[研究§7.61](skill-dsl-research.md#761-az-性质抽象材料采用与真实检查的开发决定)。
- 复核基线 `10bc06f0`。开发 `gpt-6.1-sol/max`，实验当前官方账号 `gpt-5.6-sol/high`。第三方API与AV旧位置继续暂停。

## 当前目标

让同一授权DSL围绕原问题选择证据、采用有范围的局部摘要并形成可核对结论，完成Download和OWUI完整原skill任务，检验两包消费和三类变化复用，再比较质量与开销。单性质闭合作为开发里程碑，原问题分母不缩减。

已有结构索引、MRO、procedure-summary、source-materials、inquiry/native和CLI继续复用。显式 `operation-evidence-v6`已接入，比较生产快照 `cef00a3c`。一次针对性协议修正仍未形成单性质采用；Download N/M自然源码评价full/partial，D官方路由失败。余下17位置未运行，完整框架摘要、第二任务、两包实际消费及真实复用收益继续未达。

## AZ 验收与剩余责任

| 阶段 | 责任 | 实际验收 |
|---|---|---|
| AZ0–AZ2 | 一次失败归因、采用诊断、格式恢复、计量与路由 | 工程已验证；官方路由故障被捕获和停止，未声称已修复宿主 |
| AZ3–AZ6 | 性质合同、现有摘要扩展、相关依赖、关键框架摘要 | 有界垂直链通过反例；完整框架语义摘要仍缺 |
| AZ7–AZ9 | 调度、局部采用、双入口、Download单性质 | 接线与撤回通过；两次实测0采用/0检查，里程碑未达 |
| AZ10–AZ12 | 两个完整原任务、两包消费、三变化 | 原字节兼容/搬移、离线撤回通过；真实使用和复用未达 |
| AZ13–AZ15 | 三臂有限比较、独立评价、外部能力校准 | 3/12尝试、N/M交付，结论inconclusive；OSS三fixture校准通过 |
| AZ16–AZ18 | 回归、研究归纳、文档与origin发布 | 原件汇总、确定性核验和发布；保留全部未达责任 |

完整质量面板为2任务×3臂×2重复=12位置，符合相同条件的native首件可复用；另有1个单性质开发位置、2包消费和6变化位置。修订单列，不用重复调用凑时长。原件/评价隔离，源码衍生答案不得作为DSL预填事实。

## 执行规则与外部阻断

1. 发现共享缺陷，暂停受影响位置，当场定位、红测、修复和具名复验；独立工作继续。
2. 不因D失败无限推迟N基线；未达是结果。不同代码/合同版本不可混成同版本比较。
3. 摘要须有来源、适用性质、参数/对象、残余及撤回条件。模型context标签不是排除证明。
4. 账号已授权；AY旧记录提示2026-10-14 16:47恢复，当前是否可用按真实证据判断。明确额度不足时停止试探，完成独立工程并保留未运行位置，不换身份/通道或购买额度。
5. 工程、真实原任务、作者消费、质量/开销、变化复用分别验收；不能只凭离线包将研究目标标完成。

当前官方通道因workspace routing终态不可用，恢复前不派发。恢复后仍从原登记的未运行位置开始，先确认缺失框架/协议机制能在有界反例及真实采用中成立；不继续无依据扩通用语言，不把旧两任务重复包装成新泛化样本。[summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)保留恢复位置与原分母。

## 继承与维护

AY以 `completed-with-unmet-criteria` 收束，14尝试、10交付、2不可用、2失败，12质量未运行；详情见 [final closure](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)。旧原件和所有历史分母保留，新结果写 `authorization-property-abstraction-v1`。

继续 `skill-ir-aot`，仅推用户origin，新开发线程独占写入。研究同步§1/§7.61/§11；只更新已有长期组件文档。源码和能力测试不重复全历史审计；文档只维护当前入口和本轮涉及的开发文档。
