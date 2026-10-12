# Skill IR AOT 当前执行计划

更新于2026-10-13。唯一实时入口为[current-status](current-status.md)。

- 当前任务书：[BI0–BI23](../superpowers/plans/2026-10-13-authorization-authoring-closure-and-reliable-consumption.md)，`in-progress`。实际接管fde04c26，工程提交00053b32；A1/A2及C1已交付，C2正在消费同一冻结原稿。
- 方法合同：[spec§14.48](skill-ir-aot-optimization-spec.md#1448-bi-authoring-closure-and-reliable-consumption)；复盘统一在[研究§7.70](skill-dsl-research.md#770-bi-作者目标有序修稿与保真消费)。BH实际结果见§7.69及[summary](../../results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/summary.json)。
- identity：`authorization-authoring-closure-v1`。继续`skill-ir-aot`，只推用户origin，不建分支/worktree；新线程独占代码、共享方法文档与Git写入。
- 开发`gpt-6.1-sol/max`，按用户指定；实验沿已授权官方账号`gpt-5.6-sol/high`。第三方暂停，OWUI/历史未知ShareLink仅离线，旧未知和保护证据保持。

## 本轮主要交付

已有程序能实际运行，自动作者仍只补成4步；compact降低首对成本却遗漏完整任务条件。本轮修作者目标持续、有序补丁和任务上下文，让模型原稿接管资源选择主链，并用原/变同稿与两组同期full/compact检验实际可用性。

| 阶段 | 主要工作 | 留下的实物 |
|---|---|---|
| BI0–BI2 | 接管、实际发送上下文/顺序反例、共享红测 | 作者被消费提示覆盖、guard落在return后的准确复现 |
| BI3–BI7 | 作者进度、原子stepOrder、候选/活动、普通工具共核 | 能在正确位置补链的实际author/patch/run/inspect |
| BI8–BI11 | 原问题与剩余职责、compact、保存恢复、离线场景 | 保留分支和源码线索的紧凑上下文 |
| BI12–BI16 | 隔离作者、现场修复、同稿变化、两组消费配对 | 自动原稿/修订、机器轨迹、逐题质量与真实成本 |
| BI17–BI21 | 第二任务离线复用、可用交付、实质补强与文档 | 共享机制、普通命令与明确未达责任 |
| BI22–BI23 | 必要联合验证、聚焦提交推送 | origin同步及分轴验收 |

预计约12小时有用工作量，真实作者在中段尽早运行，不等全部离线工作完成。提前完成或通道暂停时继续任务书中的恢复、编辑、发送计量和可搬移性补强；不通过睡眠、重复审计或新增面板凑时长。

## 方法调整

1. edit在活动程序出现后仍保持作者目标；current、computed、作者完成分开，允许带缺口交付。
2. patch增加显式stepOrder，精确排列合并后的全部ID；缺省保持旧行为，非法排列原子拒绝，新增不可达步骤给诊断，不自动移动guard/return。
3. 原稿、候选预览、活动程序与各自revision分开；恢复和source变化重算，不能使用旧结果掩盖新稿失败。
4. compact保留原问题、剩余任务、分支规则和可访问源码线索，只减少重复表达；普通CLI默认兼容，示例先回full。
5. A1无开发者程序/答案/评阅；A2只恢复其自己的稿。C1/C2固定自动原字节，P两组固定已有开发者程序，自动与给定材料效果分账。
6. 不用全局checked阻挡局部运行，也不通过删除问题、造来源或改unknown换成功。程序贡献与自然补答逐项说明。

实际作者形成12步并采用，但scope选择第二题、场景事实在第一题下，输入为空且执行未知；空version、非owner授权和root失查回退仍未闭合。C1/C2先按同一冻结原稿和同一源码epoch完成，不手工改稿。随后BI20只补通用的作者输入绑定提示：显示当前scope实际可用的输入名字及其他原题下已有输入名字，不复制值、不跨题注入、不替模型选择scope。这个确定性补强不追加第三次作者重抽，也不把已有原稿升级为成功。

## 执行与恢复

首次共享错误原件留存，当场红测→共享修复→绿测→具名确认；不跑完已知有缺陷的面板。同因两次无进展转本地分析，不按任意修订总数停止工程。配对代码改变时旧臂保留，当前两臂须重新对齐。

官方通道明确routing失败一次具名恢复，连续两次或累计三次恢复仍失败暂停外部派发；quota/auth暂停，unknown核原生命周期不自动重发。独立工程和零模型运行继续。完整input含cache一次，作者/消费/修复分账，USD/隐藏/开发代理/真人时间未知保留。

BI最多8个首位置：A1、条件性A2、C1/C2、P0-full/compact与P1-compact/full。A2无需运行或C无程序时具名零调用，P继续；partial程序可实际消费。具名修复额外记录，不反复抽样追胜。旧全src104失败、BG/BH原件及第二ShareLink未知保持。

## 文档与验证

更新spec14.48、研究§1/§7.70/§11、current-status与本计划；公共接口落地后更新usage/developer-guide和例子README，不新增长期组件正文。根账本仅本地。

开发用相关红绿、主/研究类型、一次必要授权联合回归；文档按当前更改与已有retired/governance配置验证。不重跑全历史/全src审计或为了通过而改保护锁。最终先给自动稿怎样运行及其实际结果，再报告工程、自动主链、完整任务质量与收益。
