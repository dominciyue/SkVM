# 下一阶段提案：可检验分类与受限 skill 自动构造

日期：2026-09-06。提案基准：`skill-ir-aot@f6c057a`。状态：路线已获用户采用；Q1 v2 development 标注发放包与 Q2 当前能力盘点已实现，独立标注尚未开始。它仍不授权 prospective 选择、Q3/Q4、参与者 session、新付费、旧 held-out、Stage M/N 或发布。

2026-09-07 路线补充已确认并同步至 spec 第14.12节和 plan 第4.41节：真实Q1标注与API生产构造development并行，稳定冻结后前瞻迁移，再用第二profile检验复用。扩样用于检验适用范围，不能代替构造前端。详见[规模分析](sample-scale-and-automation-scope-analysis-2026-09-07.md)。下文24来源与3×4矩阵是保留的试点设计，不能理解为完整自动化或可靠性充分分母。

## 1. 推荐方向与三种选择

推荐下一阶段回答一个具体问题：**能否在执行前识别一组公开规则充分、输入结构明确的任务，并由冻结的类别构造器在新输入上自动生成合格产物，而不再编写任务专用代码？**

| 方案 | 得到什么 | 代价与不足 |
|---|---|---|
| 先完成现有 8-row 人工实验 | 两位参与者在限定任务上的编写/审核成本描述 | 不能回答新 skill 的分类预测力或自动构造，适合作为后续补充 |
| 先做小型前瞻分类与一个受限自动化家族（推荐） | 分类可重现、预测与运行结果可对照、新任务适配成本可量化 | 需冻结能力范围，完成新任务迁移，而不是复跑两个旧 preset |
| 直接做任意 SKILL.md 到可执行代码 | 最接近通用 optimizer 愿景 | 混合自然语言理解、程序综合、oracle 和运行环境问题，当前缺少可控验收边界 |

选择第二条；前两条最终汇合。当前 clean-source 成果作为稳定起点保留，不再把复现旧 fixture 当成新增研究证据。

## 2. “自动化”需要分三个层次

| 层次 | 实际输入与人工 | 能写的结论 |
|---|---|---|
| 运行自动化 | 人已写好 adapter/plan，机器反复运行 | 运行时无需模型；当前已有 |
| 类内任务自动构造 | 类别规则、工具与 profile 已冻结；新任务只换公开数据和普通配置，不补代码、不补任务专用规则 | 该受限类别支持新任务自动构造；下一阶段必须建立 |
| 新 skill 自动接入 | 新 skill 的规范、资源和声明进入同一构造流程，无人工编写该 skill 的语义映射 | 在声明支持的 skill 表示范围内自动编译；比上一层更强，必须单独计数 |

自然语言 SKILL.md 被人工转成完整 DSL/模板/sidecar 时，这部分仍是编程或适配劳动。不能因 TypeScript LOC=0 就记作无人工。普通路径、格式、模板选择与任务专用规则要分开；一段包含全部答案的配置也不算自动构造。

首轮允许一次性编写类别构造器，但要公开该成本；新输入上的代码、规则和模板改动目标为 0。若新 skill 接入还要写 profile，就只获得“类内任务自动构造”，不宣称第三层完成。

## 3. 把 R1/R2/R3 变成可以执行和检验的判据

继续保留现有非互斥路由用于解释。研究数据改为逐 requirement、逐 workflow step 记录，下列四个维度分别填写，不能以一次通过/失败倒推：

| 维度 | 必须回答的问题 | 可接受的证据 |
|---|---|---|
| 验证依据 | 每项质量要求能否从公开输入与规则判断？ | 规范条款、公开输入字段、独立 checker 对应关系；覆盖不到的要求明确列出 |
| 构造依据 | 输出内容和关键决策如何产生？ | 已有脚本、规范中的转换规则、模板绑定、明确输入参数；仅有“应正确/合理”不够 |
| 执行条件 | 工具、依赖、状态、输入范围是否明确？ | 锁定工具和本地资源、可检查前置条件、明确输出与允许副作用；随机计算可另记固定种子 |
| 剩余选择 | 是否仍需选择语义、业务政策或解释模糊要求？ | 谁提供该选择、何时提供；缺失时标 unknown/review，不能由默认值伪装为已解决 |

建议导出四种操作状态：

1. **规则充分且当前能力支持**：前置条件满足、关键规则明确、可映射到冻结操作库，预测可以自动构造。
2. **规则充分但当前能力不支持**：任务本身规则清楚，现有 parser/operation/backend 尚缺；这不是专家不可替代。
3. **部分步骤需要语义选择**：只固化其余步骤，在剩余决策处保留 review。
4. **信息不足**：输入/要求/验证依据未明确，暂不作自动化预测。

“规则充分”是关于规范的判断；“当前能力支持”是关于版本化系统能力的判断。不能把“当前程序恰好成功”写进类别定义，否则预测实验会成为循环论证。若预先判为支持但运行失败，保留标签和失败，记录为构造器或判据问题。

混合任务按依赖图处理：一个人工决定影响后续输出时，依赖它的步骤不能提前宣称全自动。步骤覆盖率只作诊断，不用“多数步骤可机械化”代替完整任务通过。

## 4. 第一类优先选择什么

建议选择 **公开结构驱动的离线转换与报告生成**，并将首版范围收紧为：JSON/YAML/键值文本/明确语法文本输入；公开转换政策；读取、抽取、筛选、集合运算、确定性派生和模板输出；质量要求可独立执行检查。不是所有 JSON 任务都属于该类，也不是所有该类任务都已被当前 DSL 支持。

建议先做以下三个 profile 的开发适配，随后冻结并测试新输入。API 与 Env 来自现有项目积累；changelog 是需要独立完成来源与许可证冻结的新候选，目前仅作结构分析。

| Profile | 自动化切片 | 前置条件 | 不纳入首轮承诺 |
|---|---|---|---|
| API Tester | OpenAPI 到离线测试计划/报告 | 支持的 schema 子集、参数约束和生成政策明确；不支持结构要检出 | 任意 OpenAPI、真实服务正确性、从目录猜 API、自由选择测试框架 |
| Env Manager | 显式变量名/声明/可识别静态引用到差异和配置报告 | 支持语法、必填/类型规则有公开依据；无引用只标待确认 | 从名字猜类型、证明变量未使用、动态拼接变量名、自动删除线上配置 |
| Changelog | 约定式提交快照到分组日志 | commit 范围、类型分组、breaking-change 标记和输出格式明确 | 从任意 diff 猜业务价值、撰写营销亮点、在线发布或自动打标签 |

API 的错误状态不能仅因 schema 列出某个 4xx 就任意选择。必须由公开生成政策说明如何关联错误类型，否则该项仍缺构造依据。类似地，固定随机种子只能增加可复现性，不能补足语义正确性。

## 5. 真实 skill 结构说明了什么

Agent Skills 官方格式要求 SKILL.md，scripts/references/assets 都是可选；正文没有统一可执行语义。因此 frontmatter 合法、有脚本、提及 schema，都只能作为候选特征，不能直接作为可自动化标签。[官方规范](https://agentskills.io/specification)

| 实际来源 | 可机械执行的部分 | 尚需判断的部分 | 本阶段用途 |
|---|---|---|---|
| 本仓 API Tester | schema 端点与参数、三类用例模板 | 发现无规范 API、选框架、真实失败后修复 | 核心 profile；完整 skill 与切片分开 |
| 本仓 Env Manager | 变量名提取、来源记录、集合差异 | 动态使用、类型/部署语义 | 核心 profile；显示条件化自动化 |
| wshobson/changelog-automation | Conventional Commits 标记、分组规则和模板 | 发布亮点、升级建议、非规范提交含义 | 新 profile 候选；成熟工具对照现成 |
| anthropics/pdf 的 fillable-form 路径 | 字段提取、合法值检查、填值脚本 | 把人类字段含义映射到 field_id、非填充表单的视觉定位 | 分类边界；首轮不扩 PDF backend |
| anthropics/webapp-testing | with_server.py 管理服务生命周期 | 选择测试目标、控件、操作序列和断言 | “有 scripts 不等于整体自动化”的对照 |
| wshobson/openapi-spec-generation | 已有规范的校验、确定工具后的代码生成 | design-first 的接口设计、缺失业务规则 | “出现 OpenAPI 不等于规则已充分”的对照 |
| 本仓 BIDS | schema 规定 entity 顺序和命名 | DICOM/非标准源数据到语义实体的映射 | 类内候选与边界案例；不复活旧实验 |

对应来源：[changelog skill](https://github.com/wshobson/agents/blob/main/plugins/documentation-generation/skills/changelog-automation/SKILL.md)、[PDF forms](https://github.com/anthropics/skills/blob/main/skills/pdf/forms.md)、[webapp-testing](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md)、[OpenAPI skill](https://github.com/wshobson/agents/blob/main/plugins/documentation-generation/skills/openapi-spec-generation/SKILL.md)。本轮已经阅读的这些样本必须记为 discovery，不能在后续冒充未见验证样本。链接指向本轮检查的 main 页面，正式采样前需锁定 commit、资源和许可证，不视为已冻结实验输入。

本地事实抓手：[API source](../../benchmarks/skill-ir/pilots/api-tester/source/SKILL.md) 第 13–55 行；[Env source](../../benchmarks/skill-ir/pilots/env-manager/source/SKILL.md) 第 13–35 行；[BIDS source](../../benchmarks/skill-ir/pilots/bids/source/SKILL.md) 第 257–282 行。

## 6. 如何把分类做到可交付

建议首轮预算化样本为 **24 个去重的 skill 源包**，不是统计充分性保证：12 个用于规则开发（可包含既有 7 个及本轮已阅外部样本），另 12 个在规则冻结后进行独立应用。新样本从至少 4 个独立仓库取样，并按内容谱系去重；多个 fork、翻译或复制版本不能算独立迁移。

抽样在看性能结果前按结构特征分层：有脚本/无脚本、有显式规范/没有显式规范、纯本地/依赖外部状态。保留所有选中样本和排除理由，不能只挑能编译的任务。这里的新样本是另行设计的公开研究材料，绝不使用仓库已有受保护 held-out；创建与隔离方式需写进新协议。

每个样本记录完整 skill 的原始职责，再标出研究切片及被排除的职责，避免不断缩小任务直到必然成功。标注以要求/步骤为单位；同一个源包的多个切片是相关样本。

完成标准：

- 固定分类手册：定义、优先级、正反例、unknown 处理和字段取值；规则从公开证据得出。
- 两位标注者先独立标注，再记录分歧与裁决；报告裁决前一致率，不把讨论后的共识当独立一致性。AI 可辅助定位，不能把两个模型的一致当专家真值。
- 对冻结后的样本输出预测，再运行支持切片或保留明确拒绝理由；不在看到成败后改标签。
- 同时报告自动接纳覆盖率、接纳后成功率、误接纳和拒绝原因。若全部拒绝，不能以零错误宣称分类有效。
- 保留验证不足、能力缺失、语义选择和实现错误的区分；新发现只进入下一版本。

这足以形成“可复现分类方法 v1 与小规模前瞻检验”。它不证明覆盖所有 skill，也不需要为完成毕设而先建立整个生态的完备分类学。

## 7. 现有代码应如何复用

不能把早期 shadow 的限制当成整个系统现状。早期 [automatic-domain-construction](../../src/benchmarks/skill-ir/automatic-domain-construction.ts) 第 321–339 行会报告 domain-runtime/artifact-compiler gap，但后续已经存在可执行的 [restricted domain plan](../../src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts)：第 24–159 行包括读取文本/JSON、JSON Pointer、键值解析、正则抽取/筛选、字段投影、集合运算、布尔选择、JSON/模板写入等操作；另有 [collection plan](../../src/skill-ir/verified-artifact-collection-plan.ts) 的枚举键与排序去重。

这些能力可以复用，但“操作存在”不等于自然语言到操作序列的自动映射已合格。自动推导入口、source grounding、语义组合和独立质量验证仍需逐项对齐；不建议另造第三套 runtime。

API 领域编译器已经输入驱动，但 [adapter/input schema](../../src/benchmarks/skill-ir/api-tester-artifact-compiler.ts) 第 24–84 行把输入路径、variant、输出文件、task id 模式和两任务数量绑定到冻结研究身份。下一阶段应让新的生产绑定层接收输入/输出和能力范围，旧 wrapper 继续保留旧身份与字节合同。不要直接放宽旧 schema 或修改旧 lock 来接纳新案例。

拟采用的流程是：

```text
公开 skill 资源 + task 数据 + 明确参数
    -> 要求/规则与来源映射
    -> 与冻结 capability profile 匹配，列出未支持要求
    -> 已有操作库或领域 backend 生成计划
    -> 既有 package/runtime 执行
    -> 独立 checker 检查产物
    -> 成功或有具体原因的 unsupported/review-required
```

profile 允许复用已审核领域代码；新增一项 profile 的人工语义工作必须计入接入成本。解析前端可以先只接明确的结构化声明/已知公开规范；这时主张限定为“声明式子集自动编译”。从自由文本推断声明若用模型，需要另立 compile-time synthesis 实验，runtime 仍可零模型；不能把这个困难藏在“导入”二字中。

只有出现具体、可复用且被至少两个用例需要的缺口时才提议扩操作；不先为所有领域设计通用 DSL。此处是后续设计方向，不自动解除当前 DSL 扩展暂停状态。

## 8. 如何证明一类任务自动化，而非记住旧例

保留原初检设计：三个 profile 各 **4 个新输入，共 12 个迁移任务**。它与第6节24个skill来源是不同分母，也不能把三个profile合并为某一个profile的可靠性证据；JSON/YAML双表示不算独立任务。2026-09-07确认先做深API主profile；稳定后的扩展研究另立identity，主profile约20–30个独立真实输入与10–20个边界输入，分类总规模向48–60来源/8–12原始仓库扩展。数量是资源建议，不原地扩充旧合同，也不构成统计保证。

流程和验收：

1. 在开发样本上完成 profile、独立 checker 与允许的普通参数；写清全部支持/不支持特性。
2. 冻结构造器和能力表后，再由独立准备者形成新任务输入并提前记录接纳预测；不向构造器提供 expected output 或 checker 派生的答案。
3. 每个已接纳任务只运行固定构造流程，不人工修改候选、模板或映射；自动构造与人工修复结果分列，不能用修复后的 pass 填自动成功列。
4. 使用独立契约检查、alternative-valid 输出和针对具体错误的 mutation；共享解析库不等于完全独立，至少避免 checker 直接调用生成器的全部派生逻辑。
5. 另加边界输入检查，例如未支持的 schema 组合、缺少字段含义、非规范提交、动态环境变量访问。须明确拒绝或要求信息，不能静默忽略后报成功。
6. 同时保留正常任务的执行通过率。首个能力版本的工程验收目标为预先接纳的 12 个输入全部通过、任务专用人工改动为 0、零运行时模型调用，并正确处理列明的边界输入；这是有限测试集验收，不是总体成功率保证。

若出现失败，保留失败及原预测；可以据此开发下一版本，但同一任务不能再成为下一版本的未见迁移证据。无需因为失败就启动更多模型采样。

新输入迁移、新skill接入和原语新组合分别评价。跨skill主张要求冻结导入器/编译器/profile集合后接入未见来源，无新增语义适配代码；若逐skill写backend，则计为能力开发。每项评价同时报告完整声明要求、排除职责、接纳覆盖与接纳后失败；全拒绝不能构成自动化成功。

## 9. 基线必须回答两个不同问题

**自动化是否成立：** 在固定公开合同下，新输入是否能无任务专用人工修复地产出合格结果。该问题不需要模型基线也能回答。

**Skill IR 增加了什么：** 与直接确定性脚本/成熟工具相比，是否减少新接入的人工步骤、重复适配代码、错误配置、跨任务复用成本，或改善可追溯性。不能期待把同一生成器包进 IR 后一定质量更高；若只是标准封装，就按工程贡献报告。

API 可比较直接生成器；Schemathesis 仅在双方共同支持的生成/检查任务上比较，不能把它的 live API 测试和本项目离线计划计成同一种成功。Changelog 使用 [git-cliff](https://git-cliff.org/docs/) 作为成熟工具对照，它已经能从 conventional commits 和配置模板生成日志。应让直接工具也获得相同公开信息和必要检查，不能故意提供较差基线。

配置、领域规则、模板、人工 DSL、代码均计入适配劳动；分开一次性平台、每 profile、每 skill 和每 task 的成本。只有需要重新主张对 LLM 的质量/成本改善时，才设计新的同分母模型比较并申请相应预算。

## 10. 与现有 B successor 的衔接

现有 [人工投入设计](api-tester-human-effort-successor.md) 的 2 人 × 4 task、ABBA/BAAB、同 scorer 与真实 active minutes 可以保留。其状态仍为 design-only-not-authorized，不会因本提案而执行。

顺序建议是先确认候选生成器在新任务上有可靠行为，再创作 B 的四个人工实验任务并安排真实参与者。自动迁移测试和参与者实验用不同任务；参与者不得提前看到答案。B 测“候选是否帮助审核者”，不是自动分类真值，也不证明一般人群效应。

若 Q2 改变了生成器或公开合同，Q4 必须使用绑定新版本的 successor lock/identity；不能沿用旧 digest 却运行新代码。已有 8-row 设计可以作为设计基础，不能当成可原地改写的实验记录。

现协议任一最终输出失败就将同质量分钟比较置 null，应保留该规则。即使主比较关闭，仍应描述所有行的质量结果、活动时间和失败原因，不能只挑成功者平均后宣称节省人工。本提案不修改旧设计或实际参与者授权要求。

## 11. 工作包和停止点

| 顺序 | 工作包 | 可审阅交付 | 进入下一包的条件 |
|---|---|---|---|
| Q1 | 分类手册、来源清单与发放包 | 逐 requirement 字段、12-source/24-unit 完整分母、A/B 空白表、抽样/去重规则、未覆盖职责 | 包可直接发放并机器拒绝漏项/漂移；未知和混合情况有明确处理 |
| Q2 | 类别能力映射与最小构造路径 | API/Env 能力边界；changelog 来源审计；复用现有 plan/runtime 的设计与实现 | 开发样本通过，支持范围明确，接入人工有账；不动旧 freeze |
| Q3 | 冻结后的前瞻分类与迁移 | 12 个新的分类源包预测；另一个 12-task 构造矩阵；直接工具对照 | 报告覆盖率、成功/误接纳、拒绝与适配成本；失败不被修复结果覆盖 |
| Q4 | B 人工投入小实验 | 现有 successor 下的任务/参与者/真实区间记录 | 参与者与任务准备完毕且单独授权；不要求有模型费用 |
| Q5 | 论文与工具收口 | 分类方法、受限构造方法、迁移/人工结果、失败解释、源码复现说明 | 每项主张只引用对应分母与范围；外部操作者可复核支持路径 |

可以并行准备 Q1 的公开材料与 Q2 的代码能力对照；Q3 必须在方法冻结后执行，Q4 不能借用已暴露任务。无需为了规划每一步再新增一个 authority 层；沿用现有 validator、scorer、冻结与日志机制，只增加缺失的分类和适配字段。

当前具体接力已推进为Q1真实标注与[API生产绑定实施](../superpowers/plans/2026-09-07-api-tester-production-binding.md)，不继续停留在能力盘点。Q2/Q3内补齐完整合同覆盖、冻结导入器的新skill接入和直接工具对照；Q4只能报告本参与者/本任务的人工效果，Q5落实支持矩阵和独立操作者复现。工作包全部结束不预设正结果或任意自然语言skill自动编译。

若时间紧，最低有意义闭环是：**分类手册 v1 + 一个明确家族的前瞻迁移 + 直接脚本对照 + 现有源码复现**。B 若未能安排参与者，明确未测，不阻塞自动构造问题的独立结论；若只能完成 API 新输入测试，结论必须收窄到该 profile，不能写成跨 skill 自动化。

## 12. 相关研究对新增贡献的约束

- [From Anatomy to Smells，arXiv v2，2026-07-03](https://arxiv.org/abs/2607.01456v2) 对 238 个真实 skill 做定性结构分析，报告 13 个高层/44 个低层语义组件。可以借鉴其独立编码与分歧记录方法，但本项目不应重复主张首次给 SKILL.md 做结构分类。
- [What Keeps Agent Skills from Being Reusable?，arXiv v1，2026-08-09](https://arxiv.org/abs/2608.08453v1) 研究大量公开 skill 的缺陷、包装与路由。它讨论的结构/可复用性指标不能直接证明任务语义可自动构造；本项目应以真实构造与拒绝结果验证分类用途。
- [数据整理中的归纳程序综合，Microsoft Research，2015](https://www.microsoft.com/en-us/research/publication/applications-inductive-programming-data-wrangling/) 将受限语言应用到字符串转换、数据提取与格式变换，同时指出示例规格歧义需要解决。这支持先选窄领域、显式规则和有限操作，但不能据此声称几条示例就是完整规范。
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) 与 git-cliff 为 changelog 提供规范和已有实现；[Schemathesis](https://arxiv.org/abs/2112.10328v1) 为 schema 派生测试提供相关工作。新价值应落在条件化接纳、可复用构造和适配劳动测量，而不是重新发现这些确定性工具。

这些论文/页面是本轮研究依据，尚未对其全部实验进行独立复现；特别是结构 smell 比例不能换算成本项目的可自动化比例。

## 13. 实施状态与当前边界

Q1/Q2 已按本提案实现为独立机器合同：v2 分类单位是 requirement/workflow step，四组证据字段导出四状态；12 个 development 源包已按 commit、package root、license 与 manifest 冻结并拆为 24 个完整单位，A/B 空白表绑定同一 package digest；另 12 个 prospective 名额保持未选择、未查看。语义影响目标必须存在并由依赖路径承接，真实 submission 会复算 prediction。API Tester、Env Manager、Changelog 的 21-capability 能力图与最小构造路径已落盘。权威实施说明见 [`classification-handbook-v2.md`](classification-handbook-v2.md) 和 [`q1-development-annotation-package-v2.md`](q1-development-annotation-package-v2.md)，机器数据见 `benchmarks/skill-ir/classification/`。

当前只创建了两份全空的 A/B 发放表，没有真实标注者结果，也没有报告一致率、分类覆盖率或迁移成功率。未来裁决前统计已固定为总体、分来源、四状态混淆表和四证据维度分歧。冻结 snapshot 中三个 profile 的 `new-input-ready` 均为 false；API/Env 为历史切片，Changelog backend/checker/comparator 仍缺失。snapshot 之后的 API additive production binding 已在明确 OpenAPI 子集内以两份公开 development 新输入 2/2 通过独立 checker、0 model/API/paid；这只是 development 候选，不回写 snapshot，也不是 prospective、跨 skill 或迁移成功率证据。operation 存在、历史 fixture 通过和 runtime 可运行仍不能替代对应范围的新输入 composition 证据。

本阶段没有运行效果实验、模型/API/付费调用、参与者 session、held-out 或历史矩阵，没有修改 core/DSL/artifact/scorer、旧 lock/result、portfolio 或 readiness。Q3 的 prospective 来源选择与 12-task 构造矩阵、Q4 的 B successor 人工实验均须另行授权；若 Q2 后续改变生成器或公开合同，Q4 必须使用新 identity。
