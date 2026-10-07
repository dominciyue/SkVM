# Skill IR AOT 当前执行计划

更新于2026-10-07。本页维护当前目标与未达责任，原件由研究正文和实验目录导航。

- 唯一实时入口：[current-status](current-status.md)。
- 当前任务书：[AY0–AY23 授权问题依赖、完整使用与收益验证](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)，authorized-not-started。
- 方法合同：[spec AY](skill-ir-aot-optimization-spec.md#1438-ay-question-dependencies-and-usable-domain-execution)；依据：[研究§7.59–§7.60](skill-dsl-research.md#759-ax-离线交付复核与下一步方法建议)。
- 复核基线b8918e4d已推origin；AX最后生产修复9039fd3f、源码树6042b79e。开发gpt-6.1-sol/max，实验为已授权当前账号gpt-5.6-sol/high。第三方API与AV十二旧位置继续暂停。

## 当前目标

形成真实可用的有界授权DSL：按原问题追源码依赖，连接框架前置权限、helper参数/返回资源和结论；同一实现完成Download与OWUI完整原skill任务、两作者包消费和三类变化复查，再比较质量和运行/复用减负。复用现有结构索引、operation、source-material、inquiry/native和CLI，新行为显式v5。

用户希望本轮完成可用成果并取得正向收益，验收因此覆盖实际使用和效果。原题、完整skill及失败首件保留；工程可用但收益mixed时分别报告。

## AY 队列

| 阶段 | 责任 | 验收对象 |
|---|---|---|
| AY0–AY2 | 接管、定向外部代码借鉴、账号终态/恢复 | 已知failed与unknown分开；原件状态保留 |
| AY3–AY5 | 失败反例、问题种子、有限依赖 | 每题来源、必要/排除/未知边界 |
| AY6–AY9 | 框架权限、对象连接、调度、逐题检查 | 同一授权链；完整原题；过期检查撤回 |
| AY10–AY12 | 上下文、材料失效、双入口 | 减少真实重解释；自然输入和旧包兼容 |
| AY13–AY16 | 两原skill、两作者消费者、三变化 | 当前checked及源码full；材料真实采用 |
| AY17–AY19 | 三臂两次重复、现场修复、独立评价 | 整体工具/表示增量分开；完整成本 |
| AY20–AY23 | 必要回归、交付、文档和发布 | 普通命令实用；六项状态；origin一致 |

22个必需首位置：2 native、2 consumer、6变化、12质量。修订和必要新作者稿追加单列。质量与编写复用约60/40指精力分配。连续按任务推进，不等待或重复实验凑时长。

## 工作规则

1. 真实失败当场分型；共享缺陷红测→修实现→绿测→同例具名复验，再继续受影响位置。
2. 同因两次无改善停止原样重抽，回到实际回调和代码改接口/局部拆分，其它责任继续。
3. 复用已有MRO/DRF/callee；不按项目/skill名分支，未知副作用不强行排除。
4. 实验只读允许源码、完整skill、用户政策前提；evaluator、旧正确答和研究根因不进入模型。
5. 账号已授权，无需再确认。额度拒绝停无效请求、独立工程继续；新尝试确认旧执行结束，不切第三方或购买额度。
6. 工程、账号真实运行、完整原skill、作者消费、同条件收益、变化复用分别验收。

## 继承与维护

AX原20首位置中9已尝试、17归档、11待执行；[AX summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)和原unknown保持。AY建立承接映射运行新版本位置，两有效作者包及418文件离线交付复用。AW/AV/AU原结果、readiness、Q1、held-out、prospective和旧0/6保持，不重复全历史审计。

继续skill-ir-aot，只推用户origin。新开发线程接管后为唯一写者；研究正文更新§1/§7.60/§11，结果集中authorization-question-closure-v1，临时运行集中project-maintenance。只更新现有组件文档，不清理其它任务材料。
