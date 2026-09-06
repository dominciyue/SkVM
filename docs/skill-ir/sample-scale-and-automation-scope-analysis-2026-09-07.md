# 样本规模、类内自动化与 Q1–Q5 预期效果

日期：2026-09-07。分析依据版本：`11cb628`。用户已确认本文的开发路线，规范性约束已同步至[spec第14.12节](skill-ir-aot-optimization-spec.md)，活跃顺序见[plan第4.41节](skill-ir-aot-optimization-plan.md)。本文保留论证与资源建议，不修改冻结手册/分母、不单独授权效果实验；未选择新增prospective来源。

## 1. 判断

需要扩展样本，但应把分类的外部适用性、类内新输入构造、跨 skill 接入和工程可靠性分开验证。现有 12 development + 12 reserved prospective 可作为分类方法试点；每 profile 4 个新输入只能做初步迁移检验。增加源包数量本身不会补上规则抽取、领域构造器和新 skill 接入能力。

推荐采用“适度扩大分类样本 + 深做一个受限家族 + 再检验复用”的路线。只完成当前规模的 Q1–Q5，可以形成小规模研究闭环和有明确支持范围的工具；不能由工作包全部完成推导出任意自然语言 skill 的完整自动编译。

## 2. 最新状态和样本边界

分析读取时 checkout 为11cb628、tracked clean；之后API生产绑定设计与实施计划已提交，实际开发状态以当前组件记录/Git为准。cad4926的分母绑定与语义依赖问题已有v2修订，标注包为12来源、24个选中职责单元；尚无真实标注与一致率。Q2冻结snapshot仍为21 capabilities、3 profiles、0 new-input-ready。依据：[v2手册](classification-handbook-v2.md)、[发放包指南](q1-development-annotation-package-v2.md)。该分析未重跑上一阶段全部验证。

24 单元不能视为 24 个独立 skill，也不能视为原 skill 全部原子要求。当前规则是一项 selected responsibility 对应一个 unit，而 responsibility 由研究者预先分组；有的单元含多个动作。独立标注的一致率检验的是该固定分母上的判定可复用性，不验证分母切分本身的完整性。

| 来源 | 当前研究切片 | 完整 skill 中未由该切片覆盖的工作 |
|---|---|---|
| API Tester | 已有受支持 OpenAPI 的离线计划/报告 | API 发现、真实服务执行、认证/fixture/环境失败修复 |
| Env Manager | Env 名与受支持静态引用的比较、脱敏报告 | 动态访问判断、部署平台/CI/secret 同步 |
| PDF | 用户已提供语义字段映射后的可填充表单处理 | 语义映射本身、OCR、其他 PDF 变换与非填充表单坐标推断 |
| Webapp testing | 已声明命令与端口的服务生命周期 | UI 探索、断言设计、交互测试和失败诊断 |
| i18n-helper | React+i18next 的公开 placeholder/plural 子集 | 任意框架、翻译语义与产品术语等更广目标 |

依据：[来源清单](../../benchmarks/skill-ir/classification/q1-development-sources-v1.json)、[标注包单位](../../benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json)、[API 原始流程](../../benchmarks/skill-ir/pilots/api-tester/source/SKILL.md)、[Env 原始流程](../../benchmarks/skill-ir/pilots/env-manager/source/SKILL.md)。这些是源包范围差异，不代表尚未执行的分类标签。

因此应同时报告：切片内要求的履行情况、被排除的完整职责、满足全部声明要求的源包数量。没有固定且经过审查的职责粒度时，不把简单单位计数比率称为完整语义覆盖率。

## 3. 代码中的真正缺口

- [automatic-construction.ts](../../src/benchmarks/skill-ir/automatic-construction.ts)：源级构造能抽取候选合同/IR，但 :390–413 明确 domain semantics/runtime 需人处理，package 为 non-executable、executionPlan=null。此结论只指该源级入口，不否认后续已有可执行 runtime。
- [automatic-output-construction.ts](../../src/benchmarks/skill-ir/automatic-output-construction.ts)：:181–235 从预先声明的 StructuralExecutionPlan 自动发现唯一同名顶层 JSON 字段投影；不是一般语义映射。
- [automatic-restricted-domain-plan.ts](../../src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts)：:455–484 接收完整 plan、readablePaths、writablePaths 后执行；正则、字段、模板等规则需由调用方或上游构造器提供。
- [external-skill-import.ts](../../src/skill-ir/external-skill-import.ts)：:289–300 根据 recipe 组装 task description、plan、review patch、checker 等；manifest 明确 automaticDiscovery=false。

当前生产链的优势是已组装计划的执行、检查、来源追溯和封装。新的工程重点应是“公开任务合同到可执行计划/领域 backend 的生产绑定”，不能把增加一个导入命令当成自然语言语义构造已解决。

## 4. 如何定义某一类的完整自动化

建议先限定：**公开规范明确给出构造规则的离线数据转换、检查与报告任务**。进一步列出输入规范版本、支持特性、规则来源、输出合同、允许副作用和资源边界。JSON/YAML 只是载体；格式相同而业务政策不同的任务不因此属于同一可构造子类。

类别定义应先于实验结果。supported/missing 是相对于当前能力版本的状态，而不是永久的 skill 本体类别。不能先选择成功项，再把“这一类”定义为这些成功项的集合。

条件化自动化目标：对预先声明支持范围内的新输入，固定构造器仅接收公开数据和普通参数，自动完成接纳检查、构造、执行、独立验证与交付；任务专用代码、语义规则、模板修改和候选修复均为零。范围外输入需给出具体未支持原因。应联合报告接纳覆盖和接纳后的失败，防止全部拒绝得到虚假的零失败。

三个层次需要不同证据：

1. **输入迁移**：固定 skill/profile，换独立项目的数据，不能逐任务改规则。
2. **skill 接入迁移**：固定导入器/编译器/profile 集合，接入独立作者的未见 skill，不新增语义适配代码；有人工映射的单独计为 assisted onboarding。
3. **组合迁移**：已有原语的新组合由固定前端构造，不为新组合手写 plan 或 checker。新领域 backend 的开发是能力扩展，不是冻结编译器的泛化成功。

建议先选声明式或工具合同明确的子集。若以后引入模型把自由文本编译为声明，应另测编译期成功、人工修复与费用；零运行时模型调用不等于全过程零模型/人工。

有限测试不能证明开放世界任意输入的正确性。更强的“支持范围内完整”工程结论需要明确语义、原语前后置条件、组合约束和完整特性覆盖；是否进一步做形式化证明取决于论文目标。

## 5. 扩样建议

以下数字是资源可控的建议，不是统计充分性的定理，也不改写已有冻结分母。

| 层次 | 建议规模/方式 | 回答的问题 |
|---|---|---|
| 当前方法试点 | 保留既有 12 development 与 12 reserved prospective 的版本化合同 | 四证据判定能否独立应用，前瞻小样本是否暴露规则问题 |
| 扩展分类研究 | 总规模向 48–60 个去重来源扩展，尽量覆盖 8–12 个独立原始仓库 | 判据是否只适用于原有来源和人工作者风格 |
| 工程主 profile | 开发侧稳定后，新增约 20–30 个独立真实输入及 10–20 个专门边界输入 | 是否能在新任务中保持零任务专用修改，并合理拒绝 |
| 更强可靠性目标 | 根据预先声明的容许失败率及独立抽样设计决定规模 | 失败率能被约束到多低，而非仅展示几个成功 |
| 大规模元数据普查 | 有额外研究问题时再做数百/更多来源的低成本索引 | 结构分布与候选发现，不充当人工语义真值或自动化成功率 |

新增样本分层应覆盖：脚本驱动、规范驱动、模板驱动、开放语义/动态状态边界，以及相似结构却需要不同人工决策的成对样本。优先补新机制、新输入结构、新组合和新失败模式，不按热门列表重复收集 API/Env 改名版。fork、翻译、复制模板与同一仓库任务应按来源分组，不能都当成独立样本。

扩展来源应另立研究身份，预先划分开发与未见评价部分，并与已有 prospective 配额去重。本文只讨论取样方法，没有检索或选择新的具体 skill 内容作为 prospective。

### 小矩阵为什么不能支持低失败率

在独立、同分布 Bernoulli 试验且零失败的理想条件下，失败概率的单侧 95% 精确上界为 `1 - 0.05^(1/n)`：

| 零失败样本 n | 失败率上界 |
|---:|---:|
| 4 | 52.7% |
| 12 | 22.1% |
| 30 | 9.5% |
| 60 | 4.9% |
| 299 | 约 1.0% |

数字为本轮直接计算，方法依据 [NIST exact binomial limits](https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbici.htm)。项目当前并没有这些零失败实测结果。三个 profile 的 4 项不能机械合并为某一个 profile 的 n=12；相关变体、生成测试和挑选样本也不能套用独立随机抽样解释。边界 mutation 单独报告，它测试拒绝/检测行为，不代表自然分布中的失败率。

## 6. 文献与成熟项目给出的参照

| 来源 | 实际研究对象 | 对本项目的启示 |
|---|---|---|
| [Agent Skills 官方格式](https://agentskills.io/specification) | SKILL.md 元数据与自由 Markdown 正文；脚本、references、assets 为可选资源 | 包装格式没有提供统一形式语义；存在 SKILL.md 不是可编译合同 |
| [From Anatomy to Smells v2](https://arxiv.org/abs/2607.01456v2) | 对 238 个 skill 定性分析，归纳 13 高层/44 低层结构组件 | 可借鉴结构维度；本项目 12 来源适合方法试点，不能宣称整个生态完整结构分类 |
| [What Keeps Agent Skills from Being Reusable? v1](https://arxiv.org/abs/2608.08453v1) | 138,133 文件、20,556 仓库的可复用性缺陷与路由研究 | 大规模包装/路由分析和真实构造验证是不同问题；不能把 smell 比率换成不可自动化比率 |
| [SkillsBench v4](https://arxiv.org/abs/2602.12670v4) | 87 tasks/8 domains，配对无 skill/有 skill 条件与确定性 verifier | 借鉴任务结果、固定对照和分领域报告；它检验模型用 skill 的效果，不证明 AOT 消除运行时模型 |
| [Microsoft 数据整理程序综合](https://www.microsoft.com/en-us/research/publication/applications-inductive-programming-data-wrangling/) | FlashFill/FlashExtract/FlashRelate 的受限转换及规格歧义 | 先固定窄领域和构造语言；可检查/有示例仍需解决意图歧义 |
| [git-cliff](https://git-cliff.org/docs/) | 已能基于提交记录、解析规则与模板生成 changelog | 必须加入直接工具对照，测 SkVM 额外提供的可复用接入、追溯和人工成本变化 |

本轮查阅上述官方页面/论文摘要与相关方法说明，未独立复现外部论文的实验。文献中的样本量不是本项目的最低合格门槛。

## 7. Q1–Q5 全部完成的实际效果

以下均以对应实验真实完成为条件，不预设结果一定为正。

| 阶段 | 能交付什么 | 不能自动推出什么 |
|---|---|---|
| Q1 | 可复用的任务判定手册、来源/单元数据、独立标注分歧与一致率 | 自动理解任意 skill；完整生态分类；分类准确率等于标注一致率 |
| Q2 | 支持范围明确的生产绑定/构造器、独立 checker、开发验证与适配成本账 | 只盘点 21 capabilities 就达到 3 个 profile 完整自动化 |
| Q3 | 冻结后的分类用途、新输入接纳与构造结果、边界拒绝、直接工具对照 | 3×4 全过即普遍可靠；换数据等于新 skill 自动接入 |
| Q4 | 本参与者/本任务下的编写与审核修复时间、质量及失败记录 | 2 人×4 task 推出一般人群节省比例或理论最低人工 |
| Q5 | 论文、代码、CLI、支持矩阵、复现材料和外部使用说明 | 独立于 Q1–Q4 数据的额外正确性/泛化证据 |

如果三个 profile 均只通过各自人工编写的 backend 处理新输入，成果是三个受限领域的自动化实现和统一封装。要进一步称为共同家族的可复用编译方法，应新增冻结前端下的新 skill/新组合接入试验，展示共同构造机制，而非仅共享一个 runtime。

建议在既有 Q2/Q3 内补清楚三项验收，不另造 Q6：完整声明合同的要求覆盖、冻结导入器下的新 skill 接入、固定输入分母上的直接工具/脚本对照。Q5 还应落实独立操作者的新环境复现与错误说明；跨平台结论需实际跨平台验证。

## 8. 近期顺序

1. 先使用现有 v2 包完成真实 development 独立标注；保留固定粒度的一致率含义，不以新增来源推迟它。
2. 同时另行明确 API 主 profile 的生产输入/输出合同、支持特性、构造路径与 checker。实际优先级应是构造能力，不继续堆叠只有 schema 的治理层。
3. 在开发材料上实现并检验新输入零任务专用修改；若公开规范不足就命名缺口，不能用人工隐藏规则填平。
4. 方法稳定后才启动独立版本的扩展分类与冻结后的迁移检验；保留失败和原预测。
5. 第二个 profile 用于检验共用机制，随后决定是否值得做第三个与大规模扫描。

该顺序支持先完成一项可辩护的受限自动化贡献，再按证据扩展范围。若新增 skill 都要求新 backend，应据实将目标限定为可审计领域适配平台；若冻结构造器能接纳多来源新 skill 且无需新语义代码，才有更强的类级自动化证据。

## 9. 本轮工作边界

只读核对源码与最新文档，两个只读代理分别核查完整职责/切片差异和构造入口的人工输入；主线程抽查关键代码与源 skill。进行了公开网页研究和上述概率计算。未启动项目模型/API/付费实验、真实参与者、held-out、prospective 选择、Q3/Q4、readiness 变更或代码实现。本文与 conversation log 为本轮新增分析记录，未 commit/push。
