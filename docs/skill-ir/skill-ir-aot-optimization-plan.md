# Skill IR AOT 当前执行计划

- 更新日期：2026-09-27
- 路线：按skill/task范围设计领域表达，当前为源码可见授权与信任边界任务。
- 状态：AE/AF/AG已发布且交付后复核完成，维护基线`08ac8b93`。用户已授权AH0–AH14连续开发及发布，规划完成后派发单一开发任务。
- 唯一入口：[current-status.md](current-status.md)
- 合同：[spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)
- 当前任务书：[AH0–AH14](../superpowers/plans/2026-09-27-authorization-semantic-quality-and-reuse.md)
- 当前设计：[研究§7.27](skill-dsl-research.md#727-ah-语义质量与真实编写复用)；前轮证据保留在§7.25–7.26。

分类继续服务于范围，DSL价值包含编写、修改、质量与效率。AB同包/schema/核心可处理两项目八状态；Markdown 8/8 full、DSL 6/8 full，后者两项标签错误，必要控制与解释均正确。DSL整体收益未建立，准备/修改/运行负担及限制见研究§7.25。

## 最近完成的独立并行队列

| 任务 | 完整目标 | 验收与所有权 |
|---|---|---|
| AE0–AE11 | 明确政策状态的v5协议、完整接线和MD/DSL效果对照 | 24首轮至多4共享修订；核心与共享文档/Git唯一写者 |
| AF0–AF8 | 场景工作区、普通v2声明生成和来源预览 | 离线新模块/handler/示例，已有输入不改，ready后交AE |
| AG0–AG8 | 计量语义纯模块、比较脚本、AB口径澄清 | 离线新路径，旧provider/报告只读，ready后交AE |

三者是不同目标，AF/AG不承担AE研究任务。均Astra ultra及宿主Fast/priority；精确速度倍率未测。侧任务不写Git、不装依赖、不写共享文档。AE面板24/24 completed，四组各6/6 full，26次provider dispatch，0追加；v5无本轮质量增量，旧默认不变。AF三场景普通输入与共享政策变更检查通过，主CLI compose路由已接；AG完成16条AB原usage澄清并为AE报告提供完整prompt/total口径。AE核对归属文件hash、完成授权回归266 pass/1 skip及typecheck，并分别提交、仅推用户origin。实际USD未知，工程工具不增研究分母；当前任务已结束，不为凑分母追加调用。

AB token复核：旧+12.0%为非缓存input+output；完整prompt+output（含单列缓存读取）为+3.279%。本轮AG追加可复算说明，旧AB原件保留。

## 当前 AH 执行队列

回答质量约60%、编写/修改/复用约40%作为投入优先级；不加权成单一“成功分数”。AE四组质量持平且DSL完整token高约27%，下一阶段应从真实授权语义问题入手，而非再改协议名字。保持authoring/v2和现有wire，复用已交付工具。

1. **领域缺口与类内材料。** 以外部skill中的授权职责定位所有权/租户绑定、上游控制、角色例外和决定性缺失事实。优先复用已读来源；新来源/新输入明确登记，保留反例与政策依据。形成具体失败假设和可检查的必要判断，普通题、困难题均保留，不按某一方法结果换样。
2. **语义方法实现。** 先核对现有entry/binding/control/effect事实是否足以表达真正困难的关系。仅在真实遗漏需要时，让模型明确控制检查的是哪个主体/资源、该控制对哪条路径生效；宿主检查关系/证据引用一致，源码语义仍由独立评价复核。避免重复已有generic coverage字段或建设全仓发现平台。
3. **配对效果验证。** 新旧方法和合理Markdown基线使用同源码、政策、模型、预算及评价。优先看决定性错误、漏掉的控制/例外、证据支持与合理unknown，再看首答/修复及完整token。若新增模型复核轮次，提供同等调用预算的普通说明对照；新增判断机制和表达形式的贡献分开解释。
4. **作者与复用。** 使用AF工作区承载公共政策和显式场景变化，验证任务事实保持、政策变更同步和普通check/run。记录实际准备/修正动作和运行负担；没有真人记录时不推人工分钟收益。由未参与方法实现的作者使用提供更有信息量的反馈。

用户已确认上述方向并要求创建开发任务。AH0–AH14将来源/机制诊断、纯领域计划、普通run接线、工作区变更说明、真实四臂比较和独立作者使用放在同一轮完成。一个`gpt-6-sol / max`任务为唯一代码/共享文档/Git写者，不拆为争抢相同文件的并行开发任务。

| 阶段 | 工作 | 直接产物 |
|---|---|---|
| AH0–AH3 | 基线、skill职责、困难材料、机制合同 | 有出处的类内机制及同事实比较材料 |
| AH4–AH6 | 可选control-binding策略、实际run、场景变更反馈 | 兼容默认的程序与focused测试 |
| AH7–AH9 | Markdown/DSL×standard/新策略四臂及评价 | 首答、必要质量、修复和完整开销 |
| AH10–AH12 | 独立作者原/变任务、普通使用、方法取舍 | 编写复用证据与唯一研究正文更新 |
| AH13–AH14 | 有限回归、离线复验、归属提交和origin发布 | 可用示例、证据和同步工作区 |

最多10状态×4臂及预选4状态的第二次重复，共56计划单元；共享实现bug修订最多8单元，作者账户单列。继续当前单ref授权任务类，保留全部失败和旧AB/AE原件，不预定正向结论、不以扩样追分。AH0开始前不创建虚构完成状态。

## 已完成AB交付队列

| 阶段 | 工作 | 验收要点 |
|---|---|---|
| AB0–AB2 | 基线、来源规则、新任务与oracle | 首合格来源；policy与实现分开；最多两项目八状态，失败不换样 |
| AB3–AB4 | locate与薄skill使用包 | 显式文件只读定位；复用现有runtime/v2，无repo专用分支 |
| AB5 | Markdown共同host研究入口 | 真实作者Markdown，源码/v4/计量共同，repair不换臂 |
| AB6–AB7 | 四作者原/变编写、输入准备修复 | 两臂同资料/工具/机会；主代理不代填；记录机械与语义负担 |
| AB8 | 真实对照（完成） | 16/16 completed、16次响应、0 unknown、0目标执行；原始标签保持 |
| AB9–AB10 | 评价、价值判断（完成） | MD 8 full、DSL 6 full/2标签错误；追加0，整体收益未建立 |
| AB11–AB13 | 普通使用、有限验证、发布 | 包能按实际路径使用；统一复盘；归属提交并推送用户origin |

## 工作边界

- 直接在skill-ir-aot，不建新分支/worktree，只推用户origin。9月27日维护已提交六项原注释整理并归一第七项EOL状态；历史本地材料原位保留、逐项本地排除，新改动继续按实际归属处理。
- 新项目按任务书登记external development；旧Q1/held-out/prospective/readiness和历史结果不动。
- 不做仓库主动发现、目标执行、部署验证或patch，不建设UI或通用模板引擎。
- 本轮开发gpt-6-sol / max，主面板继续既有xty/gpt-5.6-sol并记录实际路由；认证网络和有目的付费已授权，美元unknown如实报告。新任务直接使用本地项目和主开发分支，不另建worktree。
- 基线普通说明与DSL共享执行工具、公开事实和修复机会，作者材料真正独立；结论限同helper流程比较。
- 任务完成后停止，不等待或重复调用凑时长；受阻研究分支与独立工程分开推进。

## 已有结果与恢复

AA复核183/183测试、1337断言及typecheck通过；独立模型作者1/2首稿有效，行号修订后2/2完成，四次普通运行均正确deny→allow。五组plain/ledger都full，ledger input+output多54.6%、累计调用耗时多23.3%；header conditions解释更全但有一次修复。初轮与离线规则修订、作者与分析成本分别保留。

AB恢复读状态页、本任务书、研究§7.25及执行代理建立的`results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/status.json`。当前结果的紧凑导航见[`results/skill-ir/experiment-catalog.json`](../../results/skill-ir/experiment-catalog.json)；统一研究正文及时更新主题，原始证据由[索引](evidence-index.md)与[历史](history.md)承载。

## 9月26日独立并行队列

AB revision 2从AB9恢复，保留16条真实生成结果，完整研究和交付由一个任务连续负责。另有两个独立目标，均非AB拆分：

| 队列 | 目标 | 任务书 |
|---|---|---|
| AC0–AC7（已集成`8f27afb3`） | DSL编辑schema、字段说明、结构差分检查和独立编辑示例 | [AC](../superpowers/plans/2026-09-26-authorization-authoring-editor-support.md) |
| AD0–AD7（已集成`ffc6578e`） | 既有实验目录的只读核验、检索、摘要导出工具 | [AD](../superpowers/plans/2026-09-26-experiment-catalog-maintenance.md) |

三任务Astra ultra、Fast配置；AC/AD仅写独占目录且不调用业务模型、不写Git索引。AB负责所有共享文档、精确归属提交和用户origin发布。工程间必要协作通过各自ready.json/integration-notes与任务消息，不并发覆盖文件。各自完成/partial独立记录，不把侧任务纳入AB实验分母。
