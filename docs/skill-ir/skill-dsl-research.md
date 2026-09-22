# Skill 分类与领域 DSL 研究总文档

更新于 2026-09-22。本文件是这条研究路线唯一持续维护的**研究与开发复盘正文**，合并 S0–S11、D0–D11 及后续研究，并记录 DSL 实现中发现和解决的问题。实时执行状态仍由 [current-status](current-status.md) 维护，待办见[当前计划](skill-ir-aot-optimization-plan.md)。

## 1. 当前结论

**V/W/X/Y已结束发布，Z0–Z12获用户授权并准备派发。** Y建立authoring、条件结果和顶层命令；Gitea三任务12次运行的判断正确，P/C质量持平而C开销更高，总体mixed。复核发现公共method选择漏项、六次C首答均因wire结构失败重新生成，以及HTTP403细节的评价层级争议。Z将补入口、减轻模型wire、做匹配验证及原/变任务试用，设计见§7.23；尚无Z结果。当前继续单repo/ref、显式源码与义务的有界能力，本地化I1暂缓，历史数据保留。

已经站得住的判断：

- 一个 skill 包可能包含多个任务；相同文件格式、目录结构或 read→model→check 流程，不等于相同任务语义。
- 分类服务于范围选择。应区分任务类别、首版能力范围和实验输入，不要求先建立完整生态分类学。
- DSL 允许组织 agent 判断，也允许调用程序；不局限于固化执行或节省 token。目标包括直接用 DSL 写所选范围的 skill。
- 可以复用 SkVM 的运行、模型路由、记录、验证和包基础；现有 CLI 不需要重建。具体接入方式应后于语言使用方式的选择。
- 已有窄域探针支持部分定位、回填与约束设计；V/W 完成了授权原型的真实模型消费，提供了结果传输、共同条件漏项及开销的具体观察。
- 本地化候选的 Markdown/YAML 回填问题保留在 §8；当前授权路线的引用、迟到 fallback 与评价混合问题已在 §7.20 记录为工程修复完成，剩余问题是领域关系表达。

当前开发 **source-visible authorization/trust-boundary assessment**：固定项目版本，检查主体对资源执行操作时的权限关系与源码控制。T 已把 E9 的配置/profile 对照修订为 B/D 整体方法比较，首版实现单一声明与配套支持。文献综合、workbook/browser 和本地化保留比较结论；各路线的真实效果随各自运行记录更新。

## 2. 研究目标与术语

项目希望围绕一类 skill 中的一种任务，设计可编写、修改、使用和检查的领域表达，改善真实任务效果。DSL 可以由 AI 起草、人工继续设计；不把自动生成语法当作研究完成。

| 概念 | 本文含义 | 不能混同 |
|---|---|---|
| skill 成员 | 来自可追溯来源的操作说明及相关脚本、参考资料、模板 | 被某个 skill 处理的普通输入文档 |
| 任务类别 | 共享目标、领域对象、操作、关系和完成要求的一组任务 | 文件后缀、运行目录或通用步骤集合 |
| 首版能力范围 | 为实现和验证而先支持的格式、操作和环境 | 整个研究类别的定义 |
| 实验输入 | 用来运行任务的具体文档、项目、数据或状态 | 独立 skill 成员或来源谱系 |
| 离线任务 | 不依赖改变真实远端业务状态的任务 | 只能研究本地材料、不能调用远端模型 |
| DSL 方法 | 领域表达及其被消费后产生的实际含义 | 为统一 IR 换名字，或任意 steps/run 字段 |

研究类别从外部真实任务确定，已有实现只影响成本和实施顺序，不能证明类别成立。质量、完整性、稳定性、效率、成本及使用便利均可有价值；一次实验提前选主要目标和必要质量要求，完整报告取舍。

## 3. 两轮调研及后续复核的关系

| 阶段 | 做了什么 | 当时结论 | 当前地位 |
|---|---|---|---|
| S0–S11，2026-09-19 | 结构阅读、工作分类、候选范围对照、DSL 手工表达与效果方案 | 宽范围“离线保存约束转换”值得小原型 | 探索基线；宽范围随后被收窄，不能当最终类别 |
| D0–D11，2026-09-20 | 原文义务复核、标准对照、单元/保护/生命周期代码探针 | 技术 Markdown 本地化 `proceed-narrow` | 有界方法候选；不是生产实现或收益证明 |
| 交付后复核，2026-09-20 | 重跑测试并加入内存反例，核对 provider 接线 | 有新增漏检和计量缺口，可定向修复 | 限定探针主张，并为将来实现保留问题 |
| 用户方向校正，2026-09-20 | 明确外部类别证据不能由本地支持面代替 | 暂缓 I1，重新比较候选类别和 DSL 必要性 | 当前决定，覆盖旧交接中的“下一步直接 I1” |

以上变化是同一研究过程中的修订，不是互不相干的项目。旧阶段原文和探针保留为证据，但不再作为新的调研入口。

## 4. 语料、结构与分类：已有发现

### 4.1 分母与读取深度

S 阶段登记 52 个 development 包：31 个此前获取的远端包、6 个本地 pilot、15 个新增公开包；深读 24 个包并形成 30 张任务卡。它们是目的性选样，不代表生态占比；登记、读正文、读依赖、看 trace、实际运行必须分别记录。

早期来源偏 API/测试/合同检查。新增材料补充了文档、表格、交互工具、配置、审查、研究与创作，但主选范围的核心论据仍集中于三个任务卡：Law、本地 i18n、公共 skill-i18n。前两个属于同一项目 fixture 家族，不能算三个独立外部谱系。

除一份继承的摘要级 Law 观察外，S 深读卡主要是 source-only。D 的端到端是 recorded stub，评审也是测试替身；这些都不能被写成真实模型成功记录。

### 4.2 有决策价值的结构维度

任务卡应记录：意图与完成条件、必要/可选输入、环境和状态、领域对象及规则、分支/反馈/用户交互、程序/agent/用户职责、产物、结构与语义检查、失败与部分完成、依赖读取情况、原文位置及推断。

S 阶段发现：

- i18n-helper 同时涉及扫描、生成 locale、代码替换和完整性检查；不能简单按整个包贴一个标签。
- Markdown 输出可以来自翻译、法律格式转换或开放式写作，其正确性要求不同。
- PDF 文件可以参与离线提取，也可以参与有授权与状态的在线协作；格式不决定任务类别。
- 脚本存在不等于实际被调用；schema 或文件结构正确也不能代替业务、语言或专业质量。

### 4.3 工作分类及其限制

S 阶段用六个任务提出 v0，再用另一组六任务修订；得到十个暂定范围及 30 个 assignment，九项 challenge 导致一项主类与一项次级语义调整。PDF 混合任务、OCR、交互 PDF 与评估类横切能力仍存在争议。这不是分类准确率，也没有真人一致率。

保留的方法是：以任务目的和操作含义为主，应用主题用于发现，自动化条件、支持状态、评价方式作为独立维度。各类别需有纳入条件、近似反例、混合任务和对 DSL 设计的具体影响。

S 后续的外部成员与实际需求补证已由 E 展开，当前 T 再补窄授权任务映射与真实案例；不能按通过探针的能力倒推类别。精确规则和旧 assignment 见证据索引，不在本文复制大型 JSON 表。

### 4.4 E1 外部发现路线与偏差

本轮先按任务目的、对象和约束检索，不按 `DSL`、`localization` 或已有 SkVM backend 名检索。聚合目录只提供线索，登记和正文判断都回到固定提交的原始仓库、维护者 issue、测试或规范。发现路线如下：

| 发现路线 | 核心问题 | 已进入深读的代表来源 | 目前看到的结构差异 |
|---|---|---|---|
| 结构化产物构造/修复 | 怎样创建或修改一个仍可计算、可打开、可核验的产物？ | Anthropic XLSX、DSL Builders Spreadsheet、PracticalSwan Excel | workbook/sheet/range/formula/style/chart 等对象与既有 OOXML、公式和工具接口绑定 |
| 证据驱动审查 | 怎样从边界、源路径和可复现结果形成可验证 finding？ | Cloudflare security-audit、Trail of Bits differential-review、GitHub security-review | principal/resource/boundary/candidate/finding/evidence/coverage 等对象比通用 report 字段更具体 |
| 多来源研究综合 | 怎样检索、筛选、阅读多篇论文并综合可追溯主张？ | DeerFlow systematic-literature-review、ai-skill-scholar literature-review | query/candidate/shortlist/paper/claim/citation/theme/gap 与筛选、可读性和来源覆盖相连 |
| 状态化工具操作 | 怎样让动作基于当前状态，并留下可重放的结果观察？ | Microsoft Playwright CLI、Anthropic webapp-testing | page/session/element locator/action/assertion/trace 与真实浏览器状态、工具语言和运行环境相连 |
| 保留比较候选 | 已有本地化语义是否仍比以上类别更适合首轮？ | guo-yu skill-i18n 与既有 D 探针 | protected span/unit/locale/target/freshness 清楚，但独立外部成员和实际使用证据仍少 |

E1 登记 26 个来源记录，其中 12 个选入的外部 skill 成员来自 11 个独立来源家族；同一仓库的多个 skill、skill 与其自家 domain tool、issue 与被讨论的 skill 均不扩充独立家族分母。表格和安全各有三个独立成员，研究综合与浏览器操作各有两个独立正例及一个近似反例或问题记录；本地化仍只有一个外部成员加本项目旧 fixture/探针，不能把后者写成第二个外部谱系。

明显偏向包括：英文、GitHub、Agent Skills 格式、开发者工具、近期活跃项目和搜索可见来源。stars、搜索排名、自述“battle-tested”均不作效果证据。普通库/教程、fork/转载、没有可读 skill 正文的营销页、同源近重复和只增加输入实例的材料不计新成员。外部代码从未安装或执行；当前行为信息只来自正文、maintainer 示例、issue 复现或明确标注的结构推断。因此，本轮可以支持有界选类，不能估计生态占比。

### 4.5 E2 真实任务卡与读取深度

12 张完整任务卡位于 [observations.jsonl](../../results/skill-ir/skill-dsl-research/observations.jsonl)，每张都分别记录用户输入、领域对象、操作、条件、约束、判断、交互、外部状态、错误处理、产物、质量依据、依赖读取和谱系。以下为可还原任务的短索引，不用包名或输入实例代替任务：

| 成员 / 任务 | 用户给什么 | 系统实际做什么 | 怎样算好 | 关键领域对象 |
|---|---|---|---|---|
| Anthropic XLSX | 现有 workbook 或数据、精确公式/格式/路径 | 分开读取公式与缓存值，编辑、重算、重开和 spot-check | 文件可开、零公式错误、样本公式正确、既有语义未损 | workbook、sheet、range、formula/cache、style、external link |
| DSL Builders Spreadsheet | JSON/YAML 构造说明或 workbook+query | CLI create/query，解析 JSON 结果；能力不足才窄 fallback | query 命中预期 sheet/row/cell/value，缺口和 fallback 透明 | spec、workbook、sheet、row、cell、criterion |
| PracticalSwan Excel | CSV/XLSX、布局要求、当前 host tools | 选择 MCP/openpyxl/helper，构造公式/图表/pivot 并重开 | 公式和范围正确，格式/metadata 不丢，工具使用可核对 | formula、chart、pivot、format、metadata |
| Cloudflare Security Audit | repo/ref、scope/profile/budget、prior evidence | reconnaissance→coverage ledger→hunt→independent validation→JSON/report | 覆盖缺口可见，confirmed 有 bounded result，schema/ledger 通过 | principal、resource、boundary、control、coverage unit、finding/evidence |
| Trail of Bits Differential Review | base/head 或 PR、history/tests | 风险 triage、before/after、blame、coverage、blast radius、attack scenario | 改动均被分级，高风险有历史/调用/测试/场景依据 | diff、baseline invariant、caller、test、attacker、blast radius |
| GitHub Security Review | repo/path、manifests/lockfiles/source | dependency/secret/deep scan、cross-file flow、自我复核、patch proposal | finding 有 path/line/trace/risk/confidence/fix，误报被丢弃 | source/sink、secret、dependency、auth control、finding、patch |
| DeerFlow Systematic Literature Review | topic、N/time/category、citation format | 一次 arXiv 检索、分批抽取、跨文献主题综合和格式化 | 每篇同时在 annotation/reference，主题/分歧/缺口有依据 | query、paper、batch、theme、convergence、gap、citation |
| ai-skill-scholar Literature Review | research question、filter、可选已有 session | OpenAlex/可选 arXiv 检索、去重、两轮筛选、fetch plan、全文综合 | shortlist 理由与 full-text 状态可追，综合区分共识/争议/缺口 | session、candidate、shortlist、include reason、fetch status、claim |
| BESSER Paper Review（近似反例） | 单篇 paper、venue、paper type、criteria | 阅读、数字/引用一致性检查、按投稿类型批评并排优先级 | 评价标准适合 paper type，问题和建议定位具体 | submission、claim、result、venue criterion、review action |
| Microsoft Playwright Plan/Generate/Heal | workspace、seed、feature/scenario、实时页面 | observe→plan→actions/code→assertions→run→debug/reconcile | 独立 seed、可观察断言、test pass，修复不掩盖 product bug | session、page state、snapshot/ref、locator、action、assertion、trace |
| Anthropic Webapp Testing | 本地 app/server/port、预期 UI 行为 | server lifecycle、rendered DOM discovery、Playwright actions、log/screenshot | server/browser 正确清理，结果由 UI/log/artifact 支持 | server、port、DOM、selector、action、console、screenshot |
| guo-yu Skill i18n | skill/file、locale、config/overwrite policy | 定位、选择、翻译 prose、保留技术内容、写 locale target、处理 freshness | 目标齐全，保护项和 frontmatter name 不变，译文自然，源未覆盖 | source/target、locale、protected span、config、freshness |

读取原则不是“读过 SKILL.md 就算深读”。Cloudflare 补读了 reconnaissance/hunting/validation/reporting 和 schema；DeerFlow 补读 arXiv helper、eval 与三个模板；ai-skill-scholar 补读 orchestration、必需的 scholar-search 及 OpenAlex helper；Playwright 补读 plan/generate/heal、session、trace 和可复现 issue。目标依赖才读取：Cloudflare 的 domain companion 需由具体 target reconnaissance 选择，Microsoft 的其他命令参考不改变当前任务卡边界，ai-skill-scholar 的可选 arXiv 包也没有被写成已读事实。

分母保持分离：12 个 skill 成员不等于 12 类任务；一张卡可含多个职责，但本轮只选择与类别比较有关的任务种类；paper/workbook/page 是输入实例；模板、helper、issue 和同维护者 domain tool 是依赖或问题证据，不增加成员或独立谱系。

### 4.6 E3 实际问题、已有解法与证据强弱

E3 不把“结构化会更稳定”当需求证据。每个候选都先回答：什么触发问题、影响什么、现有方案已经解决了什么、剩余部分是否真需要新的领域表达。完整问题记录位于 [observations.jsonl](../../results/skill-ir/skill-dsl-research/observations.jsonl)。

| 候选 | 具体问题与证据 | 现有方案做得好的地方 | 对新 DSL 的当前含义 |
|---|---|---|---|
| 有证据的软件安全审查 | Cloudflare issue #20 的单目标小样本暴露 advisory/domain correctness、malformed return、reachability、recall 与成本缺口；#21 复现 coverage ledger 可引用不存在的保留产物。Trail of Bits 与 GitHub 成员补足 diff/history、跨文件 flow、confidence 和 patch 边界。证据强但效果数据有界。 | trust boundary、coverage unit、candidate fingerprint、`needs_validation`、独立 verifier、schema/ledger validator、source trace 与 honest incomplete 已很成熟。 | 可能需要的是可检查的 scope/boundary/control/evidence/verdict 义务，而不是通用步骤语言；声明不能替代当前 advisory、部署事实、专业判断或召回率。 |
| 系统性学术证据综合 | DeerFlow #1862 是真实用户问题：一般研究未限制学术来源、缺 citation format、跨多篇综合溢出 context；维护者接受 skill-only 的 arXiv helper、模板和分批方案。ai-skill-scholar 显示 search/screen/fetch/read 状态容易混淆。证据中等，无效果对照。 | 专用搜索 helper、stable identifier 去重、两轮筛选、include reason、全文/摘要状态、持久 session、batch failure 日志和 single-paper 路由都已给出好解法。 | query→candidate→screen→read status→claim/citation→theme/disagreement/gap 有真实共同语义；但 Markdown+helper+JSON state 可能已经足够，必须在 E6 正面比较。 |
| 含公式 workbook 构造/修复 | DSL Builders issue #20/#24/#31/#7/#5 分别显示日期值类型、构造与 I/O、流式内存、merge 性能与 auto-width 边界；Anthropic/PracticalSwan 还要求公式/缓存分读、重算、重开和特性保留。领域问题强，新增语言证据弱。 | OOXML/openpyxl/LibreOffice、现有 JSON/YAML workbook 语言、query criteria、recalc/reopen 与 host-adaptive fallback 已覆盖大量确定性工作。 | 最多像一层任务合同，把需求、对象、公式来源、backend 和验证证据连起来；不应复制现有 workbook schema 或把工具缺陷当成新 DSL 的理由。 |
| 状态化浏览器测试生成/修复 | Playwright #42790 确认 locator 只在观察状态唯一，状态恢复后会歧义；#42777 显示 attached browser+bfcache 可使 refs 过期。问题强，新增语言证据弱。 | Playwright TypeScript、semantic locator、strict mode、snapshot/session/trace、seed reset、显式 assertion 与 plan→generate→heal 已构成可执行领域语言。 | 若有价值只能是很薄的 precondition/observed state/action/assertion/mismatch provenance；新语法很可能重复 Playwright，先作为负向比较。 |
| 技术 skill 文档本地化 | 外部 skill 明确保护 code/path/command/id/URL、frontmatter identity、源非覆盖和 freshness；本地 D 探针复现 YAML 与列表/引用结构逃逸。外部证据弱、本地实现问题中等。 | protected kinds、source/target 分离、locale target、freshness，以及本地 snapshot/refill/check/review 已形成窄域办法。 | 单个外部家族和零公开结果不足以支撑首选；保留为有实现基础的后备方向，不用本地 fixture 补成外部需求。 |

近似反例也限制类别：BESSER 的单篇投稿评审与多篇文献综合都产出引用和报告，但前者围绕 paper type、venue bar、内部数字一致性与 revision priority，后者围绕候选集合、screening、read status、跨文献主张与 gaps。共享 `review/citation/report` 字段只是一层外壳，不能据此合并任务。

跨候选的稳定结论是：真实失败分别发生在证据覆盖、研究状态、workbook 类型/运行时、页面状态和受保护文档结构上。抽掉这些对象后只剩 read→plan→act→check，恰好不能解释任何一个 issue。因此 E4 只保留共同领域含义经得住近似反例、且至少有不同来源成员支持的类别；“有真实问题”不会自动晋级为“应设计新 DSL”。

### 4.7 E4 从成员推导的三个研究类别

以下比较先看类别和需求，不看 SkVM 已有哪些 backend 或哪条路径最省实现。每个类别同时区分完整研究对象、拟议首版范围和具体实验输入；首版限制不反向缩写类别定义。

| 研究类别 | 独立正例与近似反例 | 共同领域含义 | 必须保留的差异 | 拟议首版范围 / 输入样本 | 最强反对意见与未知 |
|---|---|---|---|---|---|
| **有证据的源码安全评估** | Cloudflare full audit、Trail of Bits differential review、GitHub broad security review，3 个独立家族；近反例为 Sentry skill-scanner：同样有 finding/severity，但对象是 agent-skill supply chain，不是应用边界 | scope；surface/change；principal/resource/boundary 或 source/sink/invariant；control；candidate；source trace；coverage obligation；verdict/confidence。finding 必须由 scoped path 和验证结果支持，coverage 不能由报告存在代替 | full audit 的确定 coverage 和 fresh verifier；diff review 的 before/after、history、caller/blast radius；broad review 的 dependency/secret/data-flow 和 patch proposal | **研究类别**仍含三种变体；E8 后的 **profile v0** 仅限一个 repo/ref 上的 source-visible authorization/trust-boundary assessment，显式 principal/resource/entry/control/trace/verdict/gap，不含 diff、dependency/advisory、secret、通用 source/sink、patch 或 live probe | 共同类别成立不表示一个声明模型可覆盖全部成员。profile v0 只代表授权边界；尚不知它相对已有配置能改善 coverage honesty、错误诊断或维护成本 |
| **系统性学术证据综合** | DeerFlow 与 ai-skill-scholar，2 个独立家族；近反例为 BESSER 单篇投稿评审 | research question；query/scope；candidate/stable ID；screen decision+reason；availability/read status；paper-level claim/method/result/limitation；citation；theme/convergence/disagreement/gap。综合结论必须回到已读状态和论文级证据 | DeerFlow 的单来源、一次检索、无持久 session 的 bounded batch；ai-skill-scholar 的多来源、持久 session、两轮筛选、fetch plan/full-text state | 类别含多来源检索与全文阅读；首版可从 supplied metadata 或一个公共 provider 取得 bounded candidates，做 dedup/screen/read-status/evidence/synthesis，不声称穷尽；输入采用真实 RAG 和 sparse-autoencoder 请求 | Markdown+搜索 helper+JSON session 可能已经表达全部稳定状态；未知 search strategy 是否应进入语言、theme/gap 的最小证据门槛、首验是否必须全文 |
| **含公式 workbook 的语义构造与修复** | Anthropic XLSX、DSL Builders、PracticalSwan，3 个独立家族；近反例为 flat values-only CSV/简单 pandas 分析 | workbook/sheet/cell-range；typed value；formula/cache；style/layout；chart/feature；assumption/source；post-save observation。公式、范围、样式和验证均绑定同一 workbook 状态 | Anthropic 的 financial/recalc/external-link 安全；DSL Builders 的 JSON/YAML create/query；PracticalSwan 的 host-adaptive MCP/openpyxl 与 chart/pivot | 类别含 feature-rich workbook；首版仅一个 XLSX、sheet/typed cell/formula/basic style/assumption/recalc/reopen/cell-range checks，暂排 macro、external link、pivot、streaming scale 和无 renderer 的视觉主张；输入为新 budget 与 changed formula/date edit | OOXML 库、公式语言、builder schema 和 query validator 已经是成熟领域语言；未知任务合同是否比现有 schema+配置多提供足够价值 |

纳入与排除也按任务含义而非文件/工具决定：安全类纳入 source-grounded application finding，排除 live pentest、一般 code review 和 skill supply-chain scan；文献类纳入多论文 search/screen/read/synthesis，排除单篇 peer review、一般 web research 和纯 bibliography；workbook 类纳入计算与特性语义必须保留的工作簿，排除简单平表导出和只读分析。

不进入前三但继续作比较的两项：浏览器测试有两个独立家族和强 issue，但 Playwright 已提供 action/assertion/locator/trace/runner 的可执行领域语言，因此是 E6 的“现有语言已充分”负向对照；本地化有清楚的窄语义和本地探针，但外部只有一个家族，降为 implementation-ready backup，不能用本地材料补足外部类别证据。

当前不做无依据加权总分。三个类别都进入 E5 共同语义压力测试；E6 优先把安全评估与文献综合写成同任务的 Markdown/现有格式/候选声明对照，workbook 用来施加最强的 existing-language/config 反对压力。仓库复用与实现工时到 E9 才单列，不参与本轮类别选择。

### 4.8 E5 领域语义还是通用流程外壳

对每个类别选两个真实成员，使用同一组概念实例化；随后删除 `read/model/tool/check/write/report step` 等通用词。概念只有在它能改变行为、结果授权或失败状态时才保留。完整逐概念来源、可变范围和影响见机器记录；正文只保留判断。

| 类别 | 同一词汇的两个真实实例 | 删除通用流程词后仍存在的含义 | 成员专属实现，不伪装成共同语义 | 近似反例处理 | 结果 |
|---|---|---|---|---|---|
| 有证据的源码安全评估 | Cloudflare：repo/ref scope、boundary/control/attack-class coverage unit、fingerprinted candidate、source/local artifact、fresh verifier、confirmed/needs_validation/rejected；Trail of Bits：base/head scope、changed invariant/risk obligation、regression candidate、diff/history/caller/test/attack evidence、adversarial re-read、finding/refuted disposition | `assessmentScope`、`securityObligation`、`candidate`、有 provenance 的 `evidence`、独立的 `verification`、阈值化 `verdict`、有分母的 `coverage`；它们分别限定可查区域、必须回答的问题、finding 资格和 complete/no-finding 主张 | attack-class hunting、git/call-graph 工具、agent topology、具体 validator schema | skill-scanner 不能靠任意 `targetType` 吸收：skill supply-chain 的 package provenance、prompt/tool exfiltration 与应用 principal/resource/control 不是同一对象，拒绝出类 | **类别语义通过、单一 profile 未通过**：authorization-boundary 可封闭；diff/history/blast-radius 与 broad dependency/secret/data-flow 需要不同模型，不能靠自由字段吸收 |
| 系统性学术证据综合 | DeerFlow：bounded arXiv corpus、批量 abstract extraction status、paper observation、themes/disagreement/gaps；ai-skill-scholar：persistent multi-source corpus、stable-ID dedup、两轮 include/exclude reason、fetch/full-text status、paper evidence、共识/争议/缺口 | `researchQuestion`、`candidateCorpus`、`screenDecision+reason`、`readStatus`、`paperEvidence`、跨论文 `synthesisRelation`、`citationIdentity`；它们限制谁能进入综合、可以声称到什么粒度、主题/缺口需由哪些 paper records 支持 | arXiv/OpenAlex query、batch/subagent scheduling、全文 fetch、citation renderer | 单篇投稿评审没有 candidate corpus、screen decision 或跨文献关系；venue/type bar、内部一致性和 revision priority 是另一类，路由而非放宽 | **通过**：共同状态和关系具体；仍需防止 search strategy 与 theme 支持阈值藏回 prose |
| 含公式 workbook 的语义构造与修复 | Anthropic：new/existing XLSX/XLSM、typed cell/formula/cache、preservation、save→LibreOffice recalc→reopen、formula/spot checks；DSL Builders：JSON/YAML workbook、typed value/formula/style、no-flatten preservation、create→query、cell/range criteria | `artifactScope`、`cellSemantics`、formula `dependencyGraph`、`preservationObligation`、materialized/recalculated state、workbook `postcondition`；它们决定 backend 安全性、读写模式和何时可声称正确 | OOXML library、builder CLI、LibreOffice、host Excel MCP | flat CSV/简单 dataframe 没有 workbook dependency、preservation、recalc 或 rich-object postcondition；拒绝，不能把全部字段改 optional | **类别通过，新语言必要性未通过**：稳定概念已大量存在于 OOXML、公式、builder schema 与 query format |

这一步留下两条类别级语义：安全评估的“义务—证据—验证—裁决—覆盖”与文献综合的“候选—筛选—读取状态—论文证据—综合关系”。它们不是同一个 DSL；而且 E8 进一步证明，类别级安全词汇也不足以让一个 authorization profile 表达 diff 或 broad review。workbook 类别同样真实，但最强解释是复用现有领域语言再加薄任务配置。E5 只证明共同含义能跨成员表达，**不证明**单一数据模型、新语法、解释器或效果改善。

## 5. 三个候选范围为什么发生变化

| 候选 | 曾看到的共性 | 关键反对意见 | 当前处理 |
|---|---|---|---|
| 保存约束转换 | source/target、保护、选择、转换、检查 | Law、文档翻译、应用改写的“选择”和“保留”含义不同，可能只剩流程外壳 | 不作为跨领域候选；技术文档本地化保留为单家族、有本地探针的后备方向 |
| 约束产物构造/修复 | 产物要求、机器检查、语义评审 | XLSX/PPTX/env/skill package 的领域规则差别大，现有工具可能已承担价值 | 收窄为“含公式 workbook 的语义构造与修复”，作为 E4 三个类别之一及 existing-language 压力项 |
| 有证据的评估 | finding、来源、判断、不确定性 | 共同字段可能只是报告格式，专业判断不能互换 | 收窄为“有证据的源码安全评估”；E5 必须证明 boundary/control/evidence/coverage/verdict 不只是报告字段 |
| 多来源研究综合 | query、candidate、screen/read state、claim/citation、theme/gap | 搜索和综合判断可能都留在自由文本，现有 helper+JSON state 已足够 | 形成“系统性学术证据综合”候选；与单篇投稿评审明确分开 |

D 阶段选择技术文档本地化，是因为可明确区分可翻译文字与代码、路径、占位符、元数据等保护对象，并做可执行探针。这说明它容易形成有界实验，不足以证明外部需求、成员丰富度或相比替代方案的价值最强。E4 因此把它降为后备方向；单 Markdown、单 locale 仍只是 D 的实现限制，不是类别存在的证据。

## 6. 来源义务复核与迁移边界

| 来源任务 | 原始职责 | 不应伪装成原始共性 |
|---|---|---|
| 公共 skill-i18n | 文件/语言选择、配置优先级、首次交互、自然翻译、保护技术内容、frontmatter、目标冲突、增量更新、分享集成 | 自动翻译引擎、统一 ICU、摘要 freshness、重试和完整性检查并非都由原文指定 |
| 本地 i18n-helper | 识别框架、选择用户可见 literal、生成资源、改代码调用、保留插值、比较 key 集 | 全源不可写和统一失败策略是项目选择；原任务确实要求修改代码 |
| Law | 提取、适用性、层级重建、字符保真、检查与条件交付 | 法律适用性不是翻译单元选择；已有脚本行为也不完全等于说明中的承诺 |

所有义务标明 `source`、`implementation-observed`、`inference`、`runtime-default` 或 `active-narrowing`。账本只证明已列义务有去向，不能证明提取完整；需要回到原文独立检查遗漏。

必要义务可以留给原 skill 的剩余流程，但这属于职责切片，不是完整迁移。把 webapp-testing 或 i18n-helper 的正文拿去翻译，只是本地化任务的输入，不能声称优化了它们原来的测试或应用国际化功能。

## 7. DSL 方法与相关工作合并结论

### 7.1 三种使用方式与一个必要基线

1. agent 直接阅读领域声明：接入简单，但声明是否被遵守需实测。
2. 将声明渲染成有界指令与任务上下文：可以统一规则与诊断，但需检查是否只是更好的提示组织。
3. 解释器处理确定操作，在判断点调用模型：控制更强，也带来更多领域实现和维护成本。

基线是合理整理的 Markdown，必要时配相同程序和自动调用时机。必须说明收益来自领域表达、指令组织、确定程序还是运行控制；不存在“叫 DSL 就一定优于配置”的前提。

### 7.2 文献与标准对项目的具体影响

| 一手资料 | 已借鉴的内容 | 边界 |
|---|---|---|
| [Agent Skills Specification](https://agentskills.io/specification) | 包装、可选资源、渐进加载 | 不定义统一任务语义 |
| [Nickerson 等分类方法](https://d-nb.info/1256597325/34) | 目的导向、概念与案例迭代 | 本项目仅作工作分类，不声称互斥完备分类学 |
| [Fowler DSL Guide](https://martinfowler.com/dsl.html) | 先领域含义后表面语法 | 语法简单不代表领域边界简单 |
| [Joshi 的 DSL 实践](https://martinfowler.com/articles/llm-and-dsls.html) | 领域表达连接模型和执行 | 单领域经验不等于普遍效果 |
| [DSPy](https://arxiv.org/abs/2310.03714)、[LMQL](https://lmql.ai/docs/language/overview.html) | 声明、模型调用与优化/控制的分离 | 不提供本项目领域分类；输出约束不保证任务正确 |
| [Gherkin](https://cucumber.io/docs/gherkin/reference/) | 条件、行为、结果的可读表达 | 文字场景仍需执行绑定 |
| [SkillsBench 1.1](https://www.skillsbench.ai/blogs/skillsbench-1-1)、[SWE-Skills-Bench](https://arxiv.org/abs/2603.15401) | 具体任务上的效果、开销与失败应分开 | 版本与任务分母不同，不转移其效果估计到本项目 |
| [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html) | analysis run/target、invocation、VCS provenance、result/location/fingerprint/code flow/baseline/fix 等静态分析结果交换 | 是结果语言，不单独声明预运行 security obligation、trust boundary、fresh verifier 或未知 coverage 分母；候选不应替代 SARIF |
| [CodeQL CLI](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-cli) | 对支持的代码库创建 database、执行固定 query suite、生成 SARIF 并报告诊断 | 足以完成固定规则静态扫描，故该任务排除出 profile；不能由此推断它完成开放式授权边界评估 |
| [PRISMA 2020](https://www.prisma-statement.org/prisma-2020) | eligibility/source/search/selection/data collection/synthesis、排除理由、certainty、protocol/amendment 等系统综述报告义务 | 主要是报告指南，且主指南偏 intervention review；不等于 agent 的 live candidate/read/evidence state，也不能轻率声称 conformance |
| [CSL 1.0.2](https://docs.citationstyles.org/en/stable/specification.html) | 引用和 bibliography 样式、locale 与现有 processor 生态 | 只负责格式，不负责筛选、读取状态、论文证据或综合支持；官方 release notes 还将 CSL JSON input schema 标为不完整、非规范 |
| [XLIFF 2.1](https://docs.oasis-open.org/xliff/xliff-core/v2.1/xliff-core-v2.1.html) | unit/segment、source/target、inline code 与原始数据、删除/复制/重排含义 | 复用语义不等于实现标准交换格式或 agent 执行器 |
| [ITS 2.0](https://www.w3.org/TR/its20/) | 可译性、术语、注释、空白和质量元数据 | XML/HTML 规则不能直接当 Markdown selector |
| [Okapi](https://okapiframework.org/wiki/index.php/Glossary) | text unit、inline code、skeleton、filter/writer | 借鉴分工，不要求引入整个平台 |
| [unist](https://github.com/syntax-tree/unist) | 源坐标和 AST 定位 | UTF-16 offset 不是跨版本稳定身份，也不保证重写保真 |
| [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) | 参数、复数/选择语法和完整消息上下文 | 本轮仅探索 classic；不从旧资料推断其他版本当前状态 |

来源查阅日期和详细摘录仍可由旧 research-notes/review 原件追溯。后续新文献直接补到本节，注明改变了哪项决定，避免只累计摘要。

### 7.3 E6 同任务的 Markdown、现有格式与候选声明比较

详细逐字段实例和变更演练见 [method-comparisons.json](../../results/skill-ir/skill-dsl-research/method-comparisons.json)。这是设计演练，没有运行模型或外部 skill，也不把“少改几个字段”冒充实际人工节省。

| 候选与固定任务 | 整理 Markdown | 现有格式/配置 + 相同 helper | 候选领域声明 | E6 判断 |
|---|---|---|---|---|
| 安全：固定 ref 上离线检查 admin export 的跨租户授权边界；同一 source/git/sandbox/ledger/result validator，一次发现+一次独立验证 | scope、principal/resource/entry/control、证据阈值、verdict 与 coverage 都能写清；最易保留细微安全说明。弱点是 ID、principal×relation coverage 和 stale result 仅靠约定 | Cloudflare-style seeded coverage ledger + finding JSON 已能机读；confirmed result 可复用 SARIF 的 location/codeFlow/provenance/baseline/fix。SARIF 不负责 planned obligation、fresh verifier 或 unknown denominator | `source-authorization-assessment/v0-sketch` 用单一 closed `authorization-boundary` obligation 连接 scope、principal/resource/relation、evidence threshold、verification、verdict、coverage，并编译到现有 ledger/SARIF | 仅保留为与**现有配置 + 同一 helper**公平配对的实验表示，不是默认建议。它不覆盖 diff/broad review；增量必须由效果对照证明，不能从结构整齐推断 |
| 文献：2022–2026 RAG hallucination mitigation，arXiv+OpenAlex、两轮筛选、12 篇、区分 abstract/full text、综合主题/分歧/缺口、IEEE；同一 search/dedup/fetch/citation helper | protocol 可读且足以指导单轮任务；candidate/session/evidence/synthesis 的 ID 和 freshness 需另行约定 | PRISMA-aligned protocol/checklist + ai-skill-scholar-style session JSON + CSL/template 已分别覆盖报告义务、live state 和引用格式；同一 helper 可筛选、标 stale、计 support | `scholarly-evidence-synthesis/v0-sketch` 把 eligibility、screen reason、read status/claim ceiling、paper evidence、synthesis support refs 和 citation choice 合在一处 | 统一 profile 更整齐，但现有 protocol+structured session+helper 已足够作为首个实现；profile 只保留为对照条件，不默认建设新语言 |

要求变化也没有给候选声明特权。安全任务增加 `service-account` 和 same/cross-tenant coverage 时，Markdown 要同步 principal/obligation/coverage，现有 ledger 要补生成规则与 rows，候选声明改 principal/relation 字段；**只要相同 helper 拥有同一结构，现有 JSON 同样可以枚举缺失 coverage**。文献任务改为只收 empirical+open full text、每个 theme 至少两篇、IEEE→APA 时，三种表示都要改 eligibility/read/synthesis/citation；candidate profile 只是较容易用统一 ID 标记 shortlist/theme/citation stale，不能声称已经省时。

因此，本轮不把“DSL”限定为新语法。安全候选若继续，只能是 JSON/YAML 承载的 versioned **authorization-boundary experimental profile**：它尝试把 obligation 与 evidence/verification/verdict/coverage 闭合，并复用 SARIF/现有 ledger；现有配置若用同一 helper 获得相同行为，就是更简单的胜者。文献候选的最强默认答案仍是整理 protocol + structured session + existing citation tool；只有后续对照证明统一 profile 的 linkage/staleness 带来实际质量或维护收益，才升级其地位。workbook 不再另写平行示例：E5 已确认成熟 domain language 足够，这本身就是 E6 的负向答案。

### 7.4 E7 消费方式、责任与最小接入

详细责任矩阵、错误状态和接口核对见 [consumption-design.json](../../results/skill-ir/skill-dsl-research/consumption-design.json)。三种消费方式的结论：

| 方式 | 声明怎样影响实际使用 | 能硬保证什么 | 主要问题 | 决定 |
|---|---|---|---|---|
| agent 直接读 | strict parse 后把 raw profile 放入 SKILL 或资源，由 agent 自行解释，产物事后验证 | 仅能保证 preflight shape 与最终 artifacts 被检查 | coverage expansion、fresh verifier、no-severity、no-live-probe 在运行中仍多为提示；声明可能只是装饰 | 保留为 Markdown/raw-profile 基线 |
| **渲染为有界指令** | parser/resolver 展开 obligation×principal×entry coverage，生成有界 skill text 和 seeded ledger；普通 agent 执行；随后检查 evidence/verifier/verdict/coverage cross-reference | closed kind、ID/ref、safe path、coverage expansion、staleness、verdict state、evidence existence/digest、complete-claim gate | 不能保证安全推理正确；当前 ordinary adapter 也不强制 source-only tool policy | 仅作为 profile 实验臂的消费方式；不预判胜过配置 |
| 解释器主导 | host 安排 recon/hunter/verifier、选择 context、typed model calls、local checks、merge/coverage/SARIF | 最强 scheduling、budget 和 state control | 先重做一套 Cloudflare-like 审计引擎，混淆 orchestration 与 language 收益 | 暂拒；只有 render 因明确控制缺口失败才重议 |

推荐路径不是“profile→模型→成功”，而是：

```text
profile
  → strict parse / semantic resolve
  → deterministic coverage expansion + bounded skill render + seeded ledger
  → existing ordinary run / adapter / original natural task
  → agent source reasoning and candidate evidence
  → deterministic relation, evidence, verifier, verdict and coverage validation
  → independent task-quality evaluation + optional confirmed-result SARIF mapping
```

职责必须分开：parser/validator 管 closed obligation、ID/ref、路径、coverage/staleness/verdict gate；host/tool policy 管网络和 target-controlled execution；agent 判断源路径、控制是否有效、attack scenario、source evidence 是否足够；独立 evaluator 判断漏报、误报和语义质量。schema pass 不产生安全 success，模型自称 confirmed 也不绕过 verifier/evidence gate。

只读接口核对支持最小复用而不支持直接宣称已接通：

- [skill-loader](../../src/core/skill-loader.ts) 已有 `buildSkillBundleFromContent`，能承载确定性 render；[run](../../src/run/index.ts) 已复制 fixture、在 skill 部署前可捕获输入 bytes、部署 bundle、调用 adapter 并返回 `RunResult`。`executeRun` 当前收 `ResolvedSkill` 而非预构造 bundle，因此下一轮无生产修改的 probe 可物化临时普通 skill 目录，不复制 run lifecycle。
- [core types](../../src/core/types.ts) 的 `SkillBundle`、`AgentAdapter`、`RunResult` 与四种 evaluator method 足以承载通用运行、usage、step 和 status；security artifacts 不应塞进 `RunResult`。profile-specific validator 先保持 pure function，重复 benchmark 时才考虑 `custom` evaluator。
- [bare-agent](../../src/adapters/bare-agent.ts) 的 inject/discover 已能消费 rendered skill，但固定暴露 `write_file`、`execute_command` 和 `web_fetch`，没有 per-run allowlist。故“source-only/no-network”当前只是 prompt rule，不能被写成 host 保证；真实模型实验前必须显式提供 read-only 边界，或诚实限定为未强制。
- [structured provider](../../src/providers/structured.ts) 已有 typed extraction 与 fallback usage 累计，但 render 模式不应为“结构化”额外增加一轮模型调用；只有未来确证需要 bounded interpreter 才使用。[pre-run snapshot](../../src/run/pre-run-input-snapshot.ts)、[workdir manifest](../../src/core/workdir-manifest.ts) 和 [durable trace](../../src/core/durable-runtime-trace.ts) 可复用原始输入、文件 delta 和运行遥测，但都不证明 security semantics。

E7 当时建议无需新 CLI：authorization-profile parser/resolver/renderer/result validator 与等价配置 adapter 共用 semantic helper，临时渲染普通 skill 后调用既有 run。这是历史接入提案；当前 T7 比较固定源码上下文和受限只读工具，T6 再决定实验臂，双 adapter 不再默认必建。不能用提示词冒充已执行的工具隔离。

### 7.5 E8 反例、独立复核与范围收窄

完整挑战记录和原判断见 [challenge-review.json](../../results/skill-ir/skill-dsl-research/challenge-review.json)。四个反例真正改变了建议：GitHub broad review 的 dependency/advisory、secret、通用 source/sink 和 patch proposal 不能由 authorization obligation 表达；Trail of Bits diff review 需要 baseline/head、changed invariant、history、caller/test 与 blast radius；“review and fix”中的 patch 生成、应用和回归验证是独立 mutation task；固定 CodeQL query suite 已由 CodeQL CLI 与 SARIF 充分解决，不需要 profile。

一次独立只读复核没有 Critical，提出三项 Material：类别偷换、相对已有配置的增量未证明、输出能力边界不清；两项 Minor 为 counterexample provenance 混入成员来源、同家族 issue 不应扩充分母。全部接受：机器记录已将 member/counterexample source ID 分开，独立家族数不变，且当前建议明确收窄而非追搜更多材料来挽救宽结论。

| 能力或事实 | 当前归属 | profile v0 处理 |
|---|---|---|
| authorization obligation、principal/resource/entry/control、coverage denominator | profile 或等价现有配置 + helper | **实验内** |
| source evidence、fresh verifier、verdict、honest gaps | ledger + deterministic cross-reference validator | **实验内** |
| confirmed finding 的 location/code flow/provenance/baseline/可选 fix 描述 | SARIF | 复用，不重建 |
| 固定 query 静态扫描 | CodeQL/既有 analyzer + SARIF | 排除，现成工具充分 |
| 当前 advisory、dependency freshness、secret scan | 外部数据/专用 scanner | 排除 |
| deployment reachability/runtime exposure | 部署或运行证据 | source-only 时只能 `needs_validation` |
| patch 生成/应用/测试/发布 | 独立 mutation task | 排除 |
| diff invariant/history/caller/blast radius | 未来可能的 diff-review variant | 排除出 v0 |

E8 的最终修订是：**研究类别可以比首个表示宽；首个表示只能叫 `source-authorization-assessment/v0-sketch`，只支持 `authorization-boundary`。** 它进入 E9 的理由不是已经优于配置，而是范围足够封闭，可以用一个很小的配对实验被证伪。若现有配置 + 同一 helper 达到相同质量、诊断和变更稳定性，则不建设该 profile；若两者都无助于真实安全质量，也停止语言路线。当前没有真实模型运行、precision/recall、decoy、维护时间或跨模型证据。

### 7.6 E9 当时的范围、可行性与工作包建议（历史）

完整决定见 [scope-decision.json](../../results/skill-ir/skill-dsl-research/scope-decision.json)。当前建议分成两层，避免把“任务值得做”和“值得新建 DSL”混为一件事：

- **推荐任务范围：** 一个 repository/ref 上、source-visible 的 authorization/trust-boundary assessment；只处理 principal、resource relation、entry surface、control trace、evidence、fresh verification、verdict 和有分母 coverage。
- **推荐方法现在时：** 整理后的安全指导 + schema-backed 配置 + deterministic coverage/staleness/result helper + audit ledger + 可选 SARIF。**暂不推荐独立 DSL、冻结作者 API 或完整解释器。** `source-authorization-assessment/v0-sketch` 只是配对实验的可读表示；若 strongest existing config 用同一 helper 获得等价语义与诊断，配置胜出。

下面是 admin-export 设计情景的作者可读示例。`abc123` 和路径名尚未绑定真实仓库、提交或输入 fixture；它用于表达演练，不能作为真实案例证据。它是 YAML-shaped notation，不冻结字段名：

```yaml
version: source-authorization-assessment/v0-sketch
scope:
  sourceRef: abc123
  include: [admin-export-route, authz-middleware, tenant-lookup, export-query, relevant-tests]
obligations:
  - id: admin-export-tenant-boundary
    kind: authorization-boundary
    entries: [GET /admin/export]
    resource: tenant-export
    controlsToTrace: [authentication, authorization, tenant-binding, query, response]
    expectations:
      - { principal: unauthenticated, resourceRelation: any, expected: deny }
      - { principal: member, resourceRelation: same-tenant, expected: allow }
      - { principal: member, resourceRelation: cross-tenant, expected: deny }
evidencePolicy:
  confirmedRequires: [source-trace, source-visible-boundary-failure, retained-evidence, independent-verification]
  deploymentOnly: needs_validation
coverage:
  expandBy: [obligation, entry, expectation]
  completeBlockedBy: [planned, gap, blocked, stale]
outputs: [coverage-ledger, audit-findings-json, optional-sarif-confirmed-results]
```

要求变为“service-account 同租户允许、跨租户拒绝”时，只新增两条 closed expectation；shared helper 必须新增两个 coverage cell，并把旧 complete result 标 stale，不能把 member 证据静默复制过去。**profile 和现有配置臂必须得到完全相同的 expansion、staleness 和诊断**，少改几行不等于省人工。相反，请求“比较 base..head、从 history 恢复 invariant、查 callers/tests/blast radius、生成并应用 patch”时，`differential-regression` 应在模型调用前被拒绝并路由；不能靠自由字段把 v0 扩宽。

首个效果目标不是笼统“发现更多漏洞”，而是 **requirement change 后的 coverage honesty**：必需 cell 完整枚举、旧结果失效、false complete/no-finding 被阻止、诊断能精确指向缺项。必要质量 floor 为：cell 恰好生成一次且 ID 稳定；confirmed 均有 in-scope obligation、保留 source evidence 和不同 verification record；`needs_validation` 无 severity 且不满足 confirmed/complete；planned/gap/blocked/stale 阻止 complete；已知漏洞不能被拒绝，带 upstream control 的 decoy 不能被确认；diff/fixed-scan/deployment/mutation 请求必须拒绝或路由。任一语义失败不能被 schema pass 抵消。

公平对照只有两个主臂：C 为 strongest existing JSON config + seeded ledger，P 为 experimental profile + bounded render；两者固定相同 natural task/source bytes、安全指导、模型/设置、tool policy/context、canonical helper、coverage/validator/output schema、一次生成和至多一次 actionable repair。shared helper、renderer template、model 或 SARIF 产生的收益不得算给 profile。若 normalized semantics/outcome 等价，或 P 只改名字/字段布局，选择 C；只有 P 阻止了一个预注册而 C 接受的 authoring/change defect，或在两者均过质量 floor 时降低实际 correction effort，才继续 P；质量与成本互有胜负则记 inconclusive。

工程上可行但不昂贵也不自动值得做。粗略设计估算（不是实测工时）：deterministic probe 为 **3–5 engineer-days**，包括一个 canonical authorization-plan、两个薄 adapter、共享 expansion/validator/render、两项小型公开 fixture、变化/不支持 case 和 focused tests；若再做真实模型配对，需先有经验证的 development-only read-only boundary，再加 **2–4 engineer-days** 物化临时普通 skill、复用 `executeRun`、运行/评价与遥测。现有 loader/run/provider/evaluator/snapshot/manifest/trace 大量可复用，故无需新 CLI；但 bare-agent 缺 per-run tool allowlist 是真实前置条件。更重要的是，强配置对照降低了独立 DSL 的优先级，这一资源判断不改变任务语义适合度。

下一轮最小工作包叫 **authorization configuration-versus-profile parity probe**：只实现 development-only canonical plan/validator、existing-config adapter、experimental-profile adapter、共享 coverage/staleness/result helper、两个 fixture 和机器对比；read-only isolation 后才可选真实模型 runner。停止条件很明确：两臂归一化与结果等价且 P 不降低实测 correction effort，采用配置并停止 DSL；P 需要任意表达式/更多 review variant 时不扩域；任一臂未过漏洞/decoy floor 时最多修一个有诊断的局部缺陷，否则 inconclusive；隔离不可用就停在 deterministic parity；不加 CLI、registry、解释器、多 agent scheduler 或通用安全语言。

### 7.7 E 完成后复核：进入原型前的定向补证

2026-09-20 复核后，用户同意据此制定 T0–T10 任务书。以下记录当时提出、随后由 T/V/W 推进的问题；E9 原件保留历史含义。该时点材料支持候选实验，尚需补设计与运行证据；当前进度以 §1 和 §7.21 为准。

1. **配置与 DSL 不应被当作互斥概念。** [Fowler 的 DSL Guide](https://martinfowler.com/dsl.html)明确允许以 XML/YAML 数据表示承载领域语言。JSON Schema 本身不等于领域语义，但若配置能表达主体、资源、允许/拒绝关系、覆盖义务及解释规则，就可能是数据形式的领域声明。应停止没有增量的第二套表示，而不能从两种表示等价推导整个 DSL 方法无价值。
2. **区分方案收益与表示收益。** 当前 C/P 共用 canonical helper、展开和 validator，等价输入获得等价 coverage 结果本来就是正确性要求。确定性 parity 可检验接线与语义一致性，不能单独证伪任务收益或作者体验。后续若测整个方法，应与信息相当的原始/整理 skill 比较；若单测作者表示，需从相同自然任务分别编写/修改，观察错误、修正和开销。没有可区分的表示假设时，只实现一套声明与 helper，不花数日搭建必然等价的两臂。
3. **窄范围的跨成员映射仍需补足。** 12 成员、11 家族是跨候选语料分母，不能当作授权任务的独立成员数。Cloudflare 提供主要 ledger/verifier 语义；[GitHub security-review 原文](https://github.com/github/awesome-copilot/blob/7e375eac04fa04f291859ca962a4d8a3bb8b7564/skills/security-review/SKILL.md)也明确含授权、BOLA/IDOR 与上游控制复核职责。因此有第二来源线索，但仍需将两者的授权职责逐项映射，标出未迁移的 dependency/secret/patch 等职责，不能因为完整包出域便忽略其中的同类任务，也不能声称整个包已覆盖。
4. **coverage 的分母不能自行证明完整。** 已声明 cell 全部填写，只能说明已声明任务已处置；若入口或主体一开始漏列，helper 可能给出形式上的 complete。明确 obligations、expectations、entry 清单分别由用户需求、源码发现或作者提供；记录依据与未知。至少加入漏入口/漏角色反例，区分 declared coverage、source-discovery status 和证据语义支持。授权政策不能从当前代码行为反推，否则可能把现有缺陷写成预期。
5. **先确定真实输入与判定依据。** admin-export 目前是设计情景。应选可定位真实源码的漏洞/已修复或上游控制反例，并包含源外配置导致无法确定的情形。公开修复、维护者测试、政策说明等可支撑答案；评测答案不进入被测 agent 上下文。证据文件存在、另一 verification ID、另开一次模型调用，都不能单独证明结论正确或复核独立。
6. **只读边界采用最小实现。** 当前 bare-agent 固定注册 write/command/web 工具，原报告对此判断正确。最早的语义实验可给固定源码快照，或用受目录约束的只读搜索/读取工具；宿主负责保存回答。无需为只读源码推理先重建完整审计 sandbox 或 CLI。若随后执行目标代码，再按该执行任务处理隔离需求。调用模型的宿主网络与 agent 访问业务网络应分开记录。

T 阶段交付：跨来源授权职责映射、真实 fixture 与单独保存的判断依据、coverage 分母来源和漏项反例、明确可区分的实验假设及最小接入建议。完成后可直接制定窄原型实现任务，但不自动开发；实际模型是否遵守、任务质量是否改善、开销是否下降，留给运行回答。E9 的 3–5 加 2–4 engineer-days 只是旧设计估算，不是已验证开发时长或新的等待门槛。

### 7.8 T0 恢复与问题固定

T0 以 `39f6f66`、`origin/skill-ir-aot` 同步的普通 checkout 启动，保留 19 个已修改 tracked path、235 个 untracked porcelain entry 和 8,113 个 untracked file。研究正文与 T 任务书当前未纳管；current-status、plan、spec 与 E 机器证据已纳管但工作树有既存修改。详细 hash、六个研究问题、基线验证和发布责任记录在 [targeted-study-status.json](../../results/skill-ir/skill-dsl-research/targeted-study-status.json)。

本轮明确分开四件事：JSON/YAML 配置本身可以承载领域语义；整套方法收益包含声明、helper、coverage/evidence 协议与运行控制；额外表示收益必须有独立的作者错误或修改负担假设；deterministic parity 只证明入口一致，不能证明或否定真实任务收益。E 没有运行授权原型，旧工时和 C/P 停止条件保持历史地位。当前最缺的是同一授权切片的跨 skill 原文映射，以及可供后续评价的真实输入/oracle 分离。

### 7.9 T1 同一授权切片的跨 skill 职责

用于比较的同一请求固定为：**在一个固定 repository/ref 中，只用源码判断一个已命名的授权敏感操作；较低信任的已认证 member 是否能对不满足授权关系的资源执行该操作。不得执行目标代码、探测部署或推断源外控制；返回可定位证据和 `confirmed`、`unknown` 或 `rejected`。** 这不是任何来源的原句，而是从两者都支持的 focused authorization review 中主动缩窄出的研究切片；T3 仍须把它绑定到真实源码和 oracle。

原文依据分别是固定提交的 [Cloudflare security-audit](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md) 及其 `RECONNAISSANCE.md`、`HUNTING.md`、`VALIDATION-AND-REPORTING.md`、`ATTACK-CLASSES.md`、`WEB-PROTOCOL-AND-AUTH.md`，以及 [GitHub security-review](https://github.com/github/awesome-copilot/blob/7e375eac04fa04f291859ca962a4d8a3bb8b7564/skills/security-review/SKILL.md) 的 `vuln-categories.md`、`language-patterns.md` 和 `report-format.md`。逐项文件/行位置保存在 `T1-authorization-responsibility-map`，以下表不是只按标题或 task card 推断。

| 职责 | 共同责任 | Cloudflare 成员特有 | GitHub 成员特有 | 未说明、主动缩窄与 agent 责任 |
|---|---|---|---|---|
| 触发与范围 | 授权/access-control 请求可以触发源码审查 | 明分 guidance 与 full audit；focused review 不自动启动六阶段或写完整产物 | 每次执行八步；未给 path 时默认 whole project | 两者都不提供具体产品政策。T 主动限定固定 ref、单操作、source-only；宿主/用户接受范围，agent 定位相关源码 |
| 输入 | repository/path、相关源码与框架事实 | full audit 另要求 target、source ref、scope/profile、prior ledgers 等 | path、语言/框架 manifest、dependency/config | 本切片只取固定 ref、任务范围、允许源码和政策材料；不把 prior-run、dependency 数据强塞为必需输入 |
| 主体、资源、操作 | 从 caller-controlled selector/action 追到 authorization control 与受影响资源；BOLA/IDOR 是共同例子 | 明确要求 lower-trust principal、starting capability、intended control、crossed boundary、concrete result | 给 ownership、middleware、resolver、privilege-escalation 与框架模式，但没有强制统一 tuple | 当前代码行为不能自证预期政策。agent 可提议入口、主体、关系与控制；人/宿主依据有权威的政策来源接受 expectation |
| 政策来源 | 都要求理解 intent/control，而不能只数 `if` | 强调 intended control、strongest source-visible control 和 source/deployment visibility | 强调 context/intent，并在 self-verification 中检查 sanitization、framework 或 middleware | 两者都未给“用户需求 > 项目政策/测试 > 当前实现”的完整权威顺序；T2 必须显式记录来源和 unknown，不从缺陷代码反推 allow/deny |
| 源码追踪与上游控制 | 跨文件追踪输入到敏感效果，复读候选并检查 upstream/preventing control | deterministic coverage unit；检查 sibling、legacy、batch、retry 等平行路径，保留 reviewed paths/checks | holistic cross-file flow；self-verification 明确问 framework/middleware 是否已处理 | GitHub 的 files/lines scanned 不是入口×角色分母；Cloudflare 的已生成 ledger 也不能发现自身漏列。T4 分开 declared obligations、source discovery 和 evidence support |
| 裁决与证据 | 只有未被可见控制反驳的具体边界结果才保留；要给文件/行和风险说明 | `confirmed` / `needs_validation` / `rejected` 分离；confirmed 需完整 source trace、最小观察结果、fresh verifier 与机器校验 | self-verification 后 downgrade/discard，保留 severity/confidence；runtime-dependent 情形没有独立 unknown contract | 另一模型或 confidence 不能单独构成真值。T 使用 confirmed/unknown/rejected；生成 agent 给证据，评价者依据独立 oracle 判正确性 |
| 结果与修复 | 说明受影响行为、位置、风险和最小修复方向 | 结构化 findings 后派生报告，只描述 source fix，不改目标 | severity 分组报告；critical/high 生成待人审 patch | 本轮不需要 patch 或整份审计报告；agent 可写 invariant/fix direction，但不能应用修改 |

因此，两个独立来源家族确实共享一组不是通用 workflow 外壳的授权关系：`principal`、`resource relation`、`operation`、`entry/control trace`、`strongest visible upstream control`、`evidence` 和 `disposition`。差异也不能被抹平：Cloudflare 的 coverage、source/deployment unknown、独立 verifier 和运行隔离仍属其完整审计；GitHub 的 dependency、secret、广泛类别、语言模式、severity report 和 patch proposal 仍属其完整 review。当前结论只支持**两个成员、两个来源家族的同一任务切片**，不声称重写两个完整 skill。

[Trail of Bits differential-review](https://github.com/trailofbits/skills/blob/123037ec8aed26f0d86327cc39137ee5043e5deb/plugins/differential-review/skills/differential-review/SKILL.md) 继续作为清晰边界：它的 base/head、before/after invariant、blame/history、changed caller/test blast radius 是输入和领域关系，不是单 ref authorization assessment 的可选装饰。未来可把它用作 variation task；当前遇到 diff 请求应路由，而不是增加任意字段吸收。机器可核对结论见 [observations.jsonl](../../results/skill-ir/skill-dsl-research/observations.jsonl) 的两个 `T1-` 记录。

### 7.10 T2 授权任务语义、政策来源与接受责任

首版只需要表达影响单 repo/ref、source-visible authorization 判断的关系，不需要通用安全语言：**某个 principal 在一组 conditions 下，经一个 entry 尝试对具有某种 resource relation 的资源执行 operation；一个被接受的 policy source 给出预期，control trace 和 evidence 说明实现是否支持该预期，缺少决定性事实时保留 unknown。**

| 概念 | 任务含义 | 谁提供或接受 | 对行为/结果的影响 |
|---|---|---|---|
| `repositoryRef` | 本次判断唯一的源码身份 | 用户/研究作者提供，宿主核对 | 所有 entry、control 和证据只在该 ref 有效 |
| `principal` | 较低信任身份类及起始能力 | 作者可声明；模型可从源码提议；接受另行记录 | 决定比较谁的权限，不能只写泛称 attacker |
| `operation` | read/write/transition/delegate/invoke 等受保护效果 | 作者命名任务；模型绑定实际代码效果 | 决定 trace 的敏感终点 |
| `resourceRelation` | owner、same-tenant、cross-tenant、unrelated 等主体—资源关系 | 作者声明规范关系；模型发现 selector/owner 字段 | 区分同一 operation 的允许与拒绝实例 |
| `condition` | authentication、tenant、assurance、lifecycle、middleware 或可见性前提 | 作者声明政策条件；模型发现源码条件/缺失事实 | 改变 expectation，或迫使结论为 unknown |
| `entry` | 实现该 operation 的接口和 handler path | 作者可 seed；模型做受限平行入口发现 | 说明实际检查了什么，不自证“全部入口” |
| `policySource` | 给 expected allow/deny/unknown 提供规范依据的位置 | 用户/研究作者/宿主接受；模型只能提议并引用 | 没有 accepted source 就不能把观察升级为政策违背 |
| `controlTrace` | entry → identity/resource binding → authorization/upstream control → protected effect | 模型发现并引用，评价者复核 | 避免把局部缺 check 当成越权 |
| `taskConclusion` | `source_supported_failure`、`source_refuted` 或 `unknown` | 模型提议，独立 evaluator 依 oracle 判分 | 这里的 source-supported 不是 Cloudflare full-audit `confirmed`；本轮没有执行最小 local check |

责任分成三层：用户或研究作者默认只需给自然任务、repository/ref、范围、可读取源码，以及其确有权确定的显式授权要求；模型可以从允许源码中发现入口、identity/resource selector、上游控制、维护文档/测试和源外依赖，也可以提议新增主体或关系；宿主/评价者接受何种政策来源适用、解决冲突、核对 trace 是否支持结论，并保留 oracle-only 的维护者修复或回归测试。模型不能同时提出政策、接受政策并用自己的输出证明自己正确。

允许的政策来源及边界如下：

1. **显式任务要求**可以给出本次评价的规范关系，但要确认提供者有权定义它，且没有未解决的项目政策冲突。
2. **项目政策或文档**必须绑定 revision、位置和对该 operation 的适用性。
3. **独立维护测试**可支持 intent，尤其是维护者为缺陷加入的 regression test；仍要检查它是否独立于可疑路径、是否过时和范围是否相符。它可以作为允许输入，也可以只放 oracle，但必须登记可见性。
4. **当前实现行为**只是一条 observation，永远不能因为“代码现在允许”就推出“政策允许”。
5. **proxy、IdP、IAM、secret、runtime configuration 或 deployment fact**如果不在允许源码/fixture 中，不猜存在或不存在；若其决定答案，结论为 `unknown` 并写明需要的观察。
6. 来源冲突时不套一个盲目的优先级。保留各自位置，标为 `conflicted`；由任务作者/宿主记录哪一项支配及原因后，才允许形成 violation 结论。

以下只是用 JSON/YAML 数据承载同一语义的**研究示例**，不是新语法、真实案例或冻结的生产 schema。它以 GitHub 的 document ownership/BOLA 例子和 Cloudflare 的 principal/resource/boundary 要求为语义来源；T3 才替换为真实 repo/ref 与 oracle。

```yaml
illustrativeSemanticsOnly: true
task:
  repository: <T3-public-repository>
  ref: <fixed-commit>
  operation: read-document
  sourceMode: source-only
obligation:
  principal: authenticated-member
  resource: document
  resourceRelation: not-owner
  expected: deny
  policySource:
    kind: explicit-task-requirement
    reference: T1-bounded-request
  declaredEntry: GET /api/documents/:id
evidenceRule:
  inspect: [entry, identity-binding, ownership-selector, upstream-middleware, protected-read-effect]
  externalDecisiveFact: unknown
  allowedConclusions: [source_supported_failure, source_refuted, unknown]
```

完全等价的自然语言是：在固定源码版本上检查声明的 document-read endpoint 及受限范围内的平行入口；已认证 member 不得读取不属于自己的 document。把 identity 与 document selection 追到上游 middleware 和返回效果；若可见控制执行 ownership，反驳候选；若 proxy、identity 或政策事实缺失且决定结论，返回 unknown；不得运行应用或声称全仓覆盖。若自然语言和数据形式的要求不同，就是作者输入差异，不能算表示效果。

机器证据见 `T2-authorization-domain-semantics` 与 `T2-policy-source-acceptance-and-unknown`。T2 只固定概念、依据和解释责任；具体字段名、枚举及 validator 留给 T9 的最小原型决定。

### 7.11 T3 真实源码输入、独立答案与未知边界

T3 选择同一个固定 [Open WebUI source ref](https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9)，不是为了把三个情形计成三个独立项目，而是让同一政策和实现家族内的细小差别真正改变答案。模型可见输入、精确允许文件与 evaluator-only oracle 见 [authorization case manifest](../../results/skill-ir/skill-dsl-research/cases/authorization/manifest.json)。每次后续运行只能把单个 case 的 `allowedInputFiles` 复制到新目录；不能递归部署 `cases/authorization`、manifest、许可证或 `oracles/`。

| Case | 被问的关系 | 模型可见的决定性路径 | Oracle 结论及独立依据 |
|---|---|---|---|
| `owui-process-file-write` | 已认证非 admin 只拥有源 file，能否向无 write grant 的既有 KB 写入 | `/process/file` 的 file ownership、caller-supplied `collection_name`、`save_docs_to_vector_db` 与 vector insert | `source_supported_failure`；固定源码 trace、其直接子提交 [`d11e06f`](https://github.com/open-webui/open-webui/commit/d11e06f1b7f6f6298c31432d88fec7c4a40c7499) 补上的 destination write gate，以及 [GHSA-4g37-7p2c-38r9](https://github.com/open-webui/open-webui/security/advisories/GHSA-4g37-7p2c-38r9) 相互支持 |
| `owui-process-text-controlled` | 同一非 admin 能否把自选 text 写入无权限 KB | `process_text` 在 sink 前调用 write validator；helper 委托 shared filter；existing KB 必须通过 `check_access_by_user_id(..., permission='write')` | `source_refuted`；必须沿 caller/shared control 复核，不能只看局部 vector sink 报缺 check；[`ba83613`](https://github.com/open-webui/open-webui/commit/ba83613ff297bc82db660b5273f04672d744902f) 提供历史佐证 |
| `owui-trusted-header-deployment` | 外部未认证 client 在实际部署能否伪造 email header 冒充用户 | env-controlled trusted-header branch 会把 header 绑定为 email 并发 session；输入没有实际 env、proxy stripping、ingress/topology | `unknown`；固定源码只证明条件能力，项目 hardening guidance 只规定 proxy 应做什么，不能证明某部署是否启用、隔离或正确剥离 header |

三种答案使用同一个任务语义：principal、operation、resource relation、entry、strongest visible control、effect 和证据；区别来自**可见 control 是否存在以及决定性事实是否在 source 外**。`process_file` 的修复对应、advisory、期望 disposition 和隐藏漏项只在 oracle；模型输入只含规范要求、固定源码 crop 与禁止外推的边界。公开 GHSA 或补丁标题不直接充当答案，评价者仍须核对 policy、entry-to-effect trace 与上游控制。

源码 crop 附 Open WebUI 原许可证。`open-webui/docs` 固定版本未解析到许可证，因此没有复制其正文，只记录 URL/commit/line 并在 task 中由研究作者释义 hardening 要求。旧 `abc123`/admin-export 仍是 synthetic design illustration，不升级成真实效果证据；T 的真实演练以后述三个 case 为准。本轮未安装或执行 Open WebUI、未运行 PoC/回归测试、未访问部署，也没有模型调用，所以这里建立的是可评答案与隔离边界，不是任务效果。

### 7.12 T4 三种“完整”及其失效条件

一个 `complete: true` 无法同时回答“作者声明的项目是否填完”“源码到底探索了哪里”和“证据是否支持答案”。首版必须把三类分母与状态分开：

| 维度 | 分母与来源 | 可机械保证 | 明确不能保证 |
|---|---|---|---|
| declared obligations | 经接受的 `principal × operation × resourceRelation × condition × entry` tuple；来自有权威的 task/policy source | 每个已声明 tuple 有 `pending/disposed/conflicted/out-of-scope` 状态，必填字段齐全 | 声明没有漏 entry、角色、关系或政策；作者不能用自己的清单证明分母完整 |
| source discovery | 固定 ref 下实际采用的入口枚举方法、搜索路径、角色/关系、发现项、排除项和未解决区域 | 说明实际搜过哪里，暴露 `discovered-unmapped`，区分 `not-searched/unknown` | 未搜索代码不存在相关路径；source 外部署行为可判断；一次 grep 等于全仓覆盖 |
| evidence support | 每个具体结论在精确 source/policy ref 下的 entry→binding→control→effect trace | 路径/ref/location 可定位，并由语义复核给 `supported/refuted/unknown/stale/conflicted/invalid-location` | 任务分母完整；文件存在就支持结论；另一模型同意就是真值 |

因此可接受的报告是：“已处置 6 个 accepted declared obligations；独立 discovery 在范围内找到 7 个 entry，其中 6 个已映射、1 个待映射；4 个结论 supported、1 个被 upstream control refuted、1 个因 deployment facts 缺失而 unknown。”不能压成“100% complete”。待映射 entry 阻止 all-entry 声明，但不抹掉另一个已被独立支持的 `process_file` 发现。

[coverage-challenges.json](../../results/skill-ir/skill-dsl-research/cases/authorization/oracles/coverage-challenges.json) 把已知遗漏只放 evaluator 侧，并对真实案例做以下变化演练：

| 变化 | 谁能发现、依据什么 | 旧记录失效 | 可以保留 |
|---|---|---|---|
| 声明只列 `process_text`，漏同 router 的 `process_file` | 有权读 router 的独立 route enumeration，或 evaluator hidden oracle；process_text-only 固定上下文不能发现 | repo/all-entry completeness | `process_text` 自身 disposition；固定上下文结果若明确限域仍可正确 |
| 只列 owner/unrelated，漏“非 owner 但有 explicit write grant”关系 | accepted policy 加 shared filter 的 `check_access_by_user_id(..., permission='write')` | all-non-admin coverage 与 blanket non-owner deny | 已单独举证的 owner/unrelated 观察 |
| 用户要求“file ownership 不授权 destination KB”，声明却写成允许 | 宿主比较已接受 task requirement 与 authored declaration | expectation 和 verdict，直至授权方解决 conflict | 源码 trace 作为 observation |
| 从 `841c9045` 换到修复子提交 `d11e06f` | ref mismatch 与 relevant-path diff | 新 ref 上的旧 failure 结论 | 旧 ref 的历史证据；未变化的 policy obligation |
| 授权政策发生变化 | 宿主/评价者核对 policy revision 与 applicability | expectation 及依赖它的结论 | 仍与新 ref 一致的实现事实 |
| citation 只指向 sink，或 line 不再含 validator | 先机械验 path/ref/location，再由 evaluator 读 caller/helper/shared filter | evidence support | obligation 与 discovery 记录 |
| trusted-header source 全填，但 env/proxy/ingress 仍缺 | evidence record 显式列 external dependency | deployment safe/exploitable 结论 | conditional source trace 与正确 `unknown` |
| 新 ref 只改无关 README | 宿主核对 relevant bytes 和 scoped entry universe 未变 | 不自动造成语义失效；旧证据仍只属于旧 ref | 验证 relevant scope 未变后，可在新 ref 复用 trace，无需仅因无关 diff 重做语义审查 |

“隐藏遗漏”不是要求模型在看不到材料时猜中。固定完整源码 crop 模式只测试 bounded honesty：不得把 declared completion 扩成 repo completeness；将来受限只读 discovery 模式才额外测试是否找到 sibling entry。这样可以把 helper 只会填表、agent 漏发现、证据不支持和合理 unknown 区分开，而不是再增加一个重复 gate。

### 7.13 T5 语义评价、复核独立性与 abstention

[evaluation-protocol.json](../../results/skill-ir/skill-dsl-research/cases/authorization/oracles/evaluation-protocol.json) 固定四层判定；后一层不能由前一层自动推出：

| 层 | 判定者与依据 | 证明什么 | 不证明什么 |
|---|---|---|---|
| structure valid | deterministic host；schema、enum、case/ref、allowed input path | 输出结构和边界可处理 | evidence 存在、支持或答案正确 |
| evidence present | deterministic host；引用文件/location/text 可定位 | 结果确有可复核引用 | 引用是相关 control/effect 或支持结论 |
| evidence support | semantic rechecker；accepted policy 与完整可见 entry→binding→control→effect trace | 一项结论被 source 支持、反驳或因决定性事实缺失而 unknown | 声明/发现分母完整、整个任务正确 |
| task correct | oracle-holding experiment evaluator；case oracle、hidden omissions、完整模型结果 | disposition、关键 trace、scope honesty 与错误记录符合独立依据 | 对其他项目/模型的一般效果，或真人一致率 |

三个 case 的答案标准不为原型便利而降低：`process_file` 必须认出 file ownership 与 destination-KB write authorization 不同，并把 caller-supplied target 追到 insert；`process_text` 必须沿 caller validator、denied set 和 shared KB write policy 反驳 sink-local false positive；trusted-header 必须保留 `unknown`，同时说明 feature gate、identity-to-session 条件路径，以及 env、direct reachability、proxy stripping/replacement 等决定性缺口。只给正确标签而没有这些关键 trace，不能记满分。

作者/发现者提出对象、搜索允许源码并给证据，但不能接受自己的政策来源或自评分。semantic rechecker 必须看到原始 task inputs 和完整 citation/trace，不能只看最终 label；experiment evaluator 在生成结束后持有 fix/advisory、hidden omission 与 rubric，不把 oracle 回灌给被测 run。另开上下文或用第二个模型只提供程序上的分离，不等于不同专业背景或不相关错误；本轮也没有真人复核，不能报告人工一致率。

错误至少分开记录：把已有上游控制报成缺陷的 false positive；漏掉 source-visible failure 的 false negative；把条件源码写成实际部署事实的 unsupported deployment inference；把 fixed crop/filled checklist 写成全仓完整的 unsupported completeness；以及 citation 虽存在却没有 binding/control/effect 的 evidence decoration。评价者据实际引用复核，不用 validator pass 或“另一个模型同意”替代真值。

`unknown` 只有在**指出能改变答案的缺失事实、保留已支持的条件路径、给出最小补充观察且不声称 safe/exploitable**时才是正确 abstention。若允许输入已经决定 `process_file` 或 `process_text`，仍返回 unknown，就是过度拒绝。all-unknown baseline 在两个 source-decidable case 上失败；在 deployment case 也只有同时给出条件路径与缺失事实才有有限得分。后续报告 decision correct、关键 trace、误报/漏报、unsupported inference/completeness，以及 resolved/unresolved fraction，不能靠零误报把全部拒绝包装成成功。

### 7.14 T6 三类实验问题与下一原型评价

[next-prototype-evaluation.json](../../results/skill-ir/skill-dsl-research/next-prototype-evaluation.json) 把旧 E9 的一组 C/P stop rule 改成三个不同问题：

1. **整套方法收益是下一原型的主问题。** B 是信息相当的 organized Markdown：同一自然任务、政策、允许源码、结论 enum、evidence/scope 要求和 answer contract；D 是最小授权领域声明，加 deterministic normalization、declared-obligation expansion、bounded render、evidence-reference checks、分离的 discovery/evidence state 和 complete-claim rule。两臂固定同一 model/settings、源码、信息、fixed-context read-only capability、timeout、capture、evaluator 与 repair policy；D 的 helper 能力差异公开列为 intervention。结果只能归因于**整套声明+支持**，不能归因于语法。
2. **额外作者表示暂不进入第一原型。** 当前没有证据说明第二套语法本身会减少错误或负担，因此不建 M、YAML 或第二 adapter。若后续 authoring trace 暴露漏 relation/stale ref，才从同一自然需求分别编写 organized Markdown 与 structured declaration，再给两者同 helper/validation/repair/model，随后发同一变化请求（增加 explicit write grantee 与新 ref），记录首稿遗漏、矛盾、修正、token/call/time/cost。若作者是模型，只报 model-assisted authoring，不能报人工分钟或人工节省。
3. **deterministic parity 只在确有多个受支持入口时检查接线。** 等价输入必须产生相同 canonical declaration、render、obligation IDs、validator decision 与 complete-claim behavior；不调用模型。mismatch 是实现缺陷；equivalence 可以删除冗余入口，但不证明或否定整套方法。绝不为制造 parity 实验而先建第二语法。

第一 feasibility panel 是一个 project/ref 下三个真实条件，加两个 evaluator 设计变化（漏 entry 的 bounded honesty 与 broken evidence location）。初次只需每 case 一对 matched B/D，用来确认可运行和观察方向；只有问题变成 run-to-run stability 时才预先定义重复。这个小面板不能支持 prevalence、跨项目泛化或统计显著性。

主指标为每 case 的 `taskDecisionCorrect`，但缺 oracle-critical trace 不算完整成功。必要质量要求是：检出 source-visible positive；不对 upstream control decoy 误报；deployment case 给有内容的 unknown；evidence 真支持 disposition；complete claim 不越过 declared/discovered scope；hidden omission 不被抹掉。另报 false positive/negative、unsupported deployment/completeness、decorative evidence、excessive abstention，以及 generation/fallback/format repair/domain repair/tool call，input/cached/output/total observed tokens、elapsed、actual USD 与 unknown USD、resolved/unresolved fraction。质量、token、时间和成本不要求全部同向，不能合成一个方便的总分。

预先解释五种结果：D 在满足质量底线时改善预定错误，记 `support`，只进入有界的跨项目或 discovery 能力实验；质量增益伴随成本或局部退化，记 `tradeoff` 并只保留真正负责的 support；B/D 在本面板都正确，记 `no-observed-difference`，对该面板优先更简单基线或改问预定的 harder question，不作普遍否定；D 增加错误或无增益成本，记 `negative` 并缩减/停止；信息、runtime、repair 或 oracle 不等导致不能比较，记 `inconclusive`，只修协议并重跑受影响 pair。旧“3–5 日 parity + 2–4 日 paired run”未经实测且建立在错误归因上，不再沿用；T9 按一个 canonical B/D slice 的真实模块和测试重新给最小工作范围。

### 7.15 T7 最小消费路径与只读边界

只读核对了 [skill-loader](../../src/core/skill-loader.ts)、[run entry](../../src/run/index.ts)、[bare-agent](../../src/adapters/bare-agent.ts)、[agent-loop](../../src/core/agent-loop.ts)、[structured provider](../../src/providers/structured.ts)、[agent tools](../../src/core/agent-tools.ts) 及直接类型。详细决定在 [minimum-consumption-path.json](../../results/skill-ir/skill-dsl-research/minimum-consumption-path.json)。

| 方式 | 能回答的问题 | 额外变量与边界 | 决定 |
|---|---|---|---|
| fixed complete allowed context | 给定完整 bounded path 时，B/D 是否正确判断 positive、upstream-control decoy 与 deployment unknown，证据和 scope 是否诚实 | 不测试主动发现；context 必须只来自 manifest 的 exact `allowedInputFiles` | **第一原型选择**；宿主读入完整小型 crop，直接结构化模型调用，零 model tools |
| restricted local read-only discovery | agent 是否在预声明 repo/path root 内枚举 sibling entry、角色和控制，包括隐藏的 `process_file` | 工具能力、搜索策略、返回预算和更大源码都会改变干预 | 后续独立实验；直接调用 `runAgentLoop`，只注册 allowlisted list/read/search executor |

第一路径的宿主顺序是：在 model workspace 外解析 manifest；创建新目录并只复制单 case 允许文件；以同一事实渲染 B 或 canonical D；把所有允许源码嵌入无工具的 structured call；在模型不可见位置做结构/evidence-location/semantic evaluation 并保存 trace。不得把 `cases` 父目录当 fixtures，也不得把 research cases/oracles 放进 skill bundle：`loadSkill` 会递归列出 bundle file，`executeRun` 还会递归复制 task 邻接 `fixtures/`，错误的目录边界会直接泄漏答案。可复用其 fresh workdir、pre-run snapshot、manifest、adapter lifecycle 和 result capture，但输入目录必须先由本轮 host 精确构造。

现有 `BareAgentAdapter` 不能原样用于 source-only：它每次都注册 `read_file`、`write_file`、`execute_command`、`list_directory` 和 `web_fetch`；shared executor/listing 用 `path.resolve(workDir, userPath)` 却没有随后验证 root containment，command 继承 host environment，web tool 可访问 URL。提示词隐藏能力不构成拒绝能力。后续 discovery 应给 `runAgentLoop` 仅三个本地工具：`list_allowed_files`、`read_allowed_file`、`search_allowed_text`；executor canonicalize 路径并拒 absolute/parent/symlink escape、未知工具、write、command/subprocess、web/network 和 target execution。模型调用 provider 的网络与 agent 能访问目标网络是两件事：前者可开，后者由工具端为零。

计量也分层：initial semantic generation、forced structured transport fallback、format/schema repair、post-validation domain repair 和 later discovery tool calls 分别记录。`agent-loop` 会累计每次 response token、all-or-nothing actual `totalCostUsd`、tool call/duration、timeout；bare-agent 的最终 `cost` 可能是 estimate，不能伪装 actual USD。`extractStructured` 会累计 prompt+parse 内部 retries，但若第一层 tool-use 已收到 response、随后因缺 tool call 或 schema/content 失败而 fallback，返回值不包含那次 response 的 token/cost。下一原型在报告 B/D usage 前需要一个聚焦的 per-attempt telemetry wrapper 或小修复+测试；这是最小实现缺口，不在本轮顺手重构 provider。

失败归属必须保留：provider/auth/rate-limit 是 infrastructure；parse/schema 是 structured transport/format；domain validation 是任务质量，只能获得预先相同的 repair 机会；path/tool denial 是 host policy evidence，不能转用更宽工具重试；timeout/max-step 是 operational outcome，不能静默判正确。本轮没有实现任何路径，也没有执行目标代码。

### 7.16 T8 真实案例纸面演练与独立核验

[manual-design-walkthrough.json](../../results/skill-ir/skill-dsl-research/manual-design-walkthrough.json) 在 `owui-process-file-write` 上逐步走完：自然要求固定“own source file 仍无 destination-KB write grant”；声明 principal/operation/relation/conditions/entry/deny policy；coverage plan 要求 identity、source/destination 区分、target selector、strongest upstream control 与 write effect，并把 source discovery 标为 first prototype 未测试；真实 crop 证明 file ownership、caller target、无 destination gate 与 vector insert；最后按 structure/evidence presence/evidence support/task correctness 四层得到 `source_supported_failure`，同时限定单 entry/ref、source-only、无 exploit/repo completeness。

同一演练再用两个反例挑战：`process_text` 若只看 sink 会误报，必须沿 caller validator、denied set 和 shared KB write permission 得到 `source_refuted`；trusted-header 的 identity-to-session branch 不能替代 env/proxy/ingress 事实，必须给 conditional trace 与 `unknown`。T4 隐藏 `process_file` 时，fixed context 只能诚实声明 declared entry 已处置、discovery 未测试；只有后续 restricted-read 模式才测试发现 sibling。这些地方说明 declaration/helper 能组织义务和状态，却不能替 agent 判断 control、替宿主接受政策或制造外部事实。

换到 GitHub security-review 的同类职责，无需 Open-WebUI 字段或按仓库成功分支：`collection_name`、`file_id`、KB UUID、FastAPI `Depends` 和具体 permission call 都留在 source evidence/control trace。GitHub 的 framework/middleware、language pattern、severity/confidence/report 指导与 Cloudflare 的 lower-trust capability、strongest visible control、source/deployment visibility、full-audit ledger/verifier 可围绕同一声明渲染，但各自 broad/full 职责不被删除。若请求改为比较 `841c9045` 与 `d11e06f`，base/head、changed invariant、history 和 blast radius 成为领域关系，应路由 Trail of Bits differential task，而非在 single-ref profile 塞自由字段。

一次干净上下文的 default agent 对 manifest、全部 case 输入/oracle、coverage/evaluation protocol、walkthrough 及固定 repo/fix/docs 做只读核验：Critical 0，材料性更正 0，确认三项答案与输入隔离。它提示一个网页渲染路径显示不同源码行号；主线程随后用 exact ref 的 GitHub contents API 重新定位，确认 route `process_file` 1546、`process_text` 1772、validator 2339，与 manifest/crop 一致。后续引用保留 ref+path+crop/original location。该核验没有修改文件，不是人工审核或一致率，也不证明错误不相关；目标代码、PoC、tests、部署、模型/evaluator 均未运行。

### 7.17 T9 方法就绪决定与下一最小原型

[prototype-readiness-decision.json](../../results/skill-ir/skill-dsl-research/prototype-readiness-decision.json) 将**任务完成状态**与**方法建议**分开：T9 的研究决定已完成，T10 尚需归并、验证和发布；方法建议为 `ready-with-bounded-questions`，不是“方法有效”或“生产就绪”。支持进入窄原型的证据是：两个独立 skill 家族支持同一授权切片；一个固定真实项目/ref 提供 source-supported failure、upstream-control refutation 和 deployment-dependent unknown；三类完整性与四层评价已经分开；输入/oracle 隔离和真实纸面演练可复核；首个消费路径已收窄到 exact fixed context、zero model tools 和已有 structured provider/run 基础。

仍有界但必须由运行回答的问题是：B/D 哪一臂能否正确给出关键 trace、减少预注册错误或虚假 complete；structured fallback/repair 的实际发生率及完整 token/call/time/cost；随后受限只读 discovery 能否找到 sibling entry；相同语义能否迁移到第二个真实项目。当前证据不支持 production DSL、通用授权语言、full/diff/broad review、部署或 exploitability 判断、patch、主动发现及跨项目/跨模型效果主张。

下一最小原型只有四个实现切片，不能扩成生产安全平台：

| 切片 | 最小内容 | 明确不做 |
|---|---|---|
| declaration and semantics | 一个 strict canonical JSON `AuthorizationTaskV0`；由同一事实对象渲染信息等价的 B 与 D | YAML、自定义语法、第二 adapter、任意仓库字段、SARIF、解释器 |
| coverage and result contract | stable obligation ID；declared/discovery/evidence 分状态；disposition、关键 trace、citation、外部缺失事实与 bounded complete claim | 用 schema/evidence existence 冒充语义支持 |
| fixed-context host | 只复制 case 的 exact `allowedInputFiles`；zero model tools；B/D 共用模型、设置、上下文、answer contract 与 repair budget；结果写在模型不可见处 | CLI/生产默认修改、active discovery、目标执行、oracle 泄漏 |
| telemetry and evaluation | 每次 generation/fallback/parse/format repair/domain repair 计量；deterministic 前两层与 oracle task evaluation；测试通过后每 case 一对 B/D | 首轮加入 semantic-rechecker model、重复运行或生产调度 |

最先写的失败测试已由真实 case 和 T4 漏项直接给出：exact input isolation；B/D 同事实等价；`discovery=not-tested` 不得产生 repo-complete；evidence presence 不得折叠为 support；positive、upstream-control、useful-unknown 三项 oracle；all-unknown 不得算成功；structured fallback 必须计入每次尝试；fixed-context 必须暴露零工具。前七类属于已有确定答案的 contract/oracle 测试；模型对照只回答真实输出质量、错误类型与开销，不再搜文献或重议领域概念。

旧 E9 的“3–5 engineer-days parity + 2–4 engineer-days paired run”已撤销且不换算为新的日历承诺。替代范围是：一个 experiment-only driver、一个 schema/renderer/validator 组、一个 oracle evaluator、一个聚焦 telemetry wrapper 或修复、约十个 focused tests；测试通过后才计划六次模型运行（三个 matched B/D pair）。这只是可直接写实现计划的工作边界，不是实测工时；本轮 `automaticNextStep=false`，不自动启动实现。

### 7.18 T 完成后复核：进入原型前的局部修正

2026-09-20，用户再次提供 E 阶段摘要；新鲜现场已到 T 交付 `50ca563`，因此当前建议依据 T 的真实案例、语义与评价设计，不重复开展 T。T 研究与任务书已纳入 Git；current-status、plan、spec 等既有修改仍在工作树，提交对齐不代表工作树干净。

现有基础足够进入实验性窄原型，无需再做一轮广泛选类或文献综述。单项目三个情形支持方法可行性试验，不能直接证明整类、跨项目或主动发现收益。仍有三项实现前必须明确的局部问题：

1. **trusted-header oracle 漏了入口开关。** [输入源码](../../results/skill-ir/skill-dsl-research/cases/authorization/inputs/owui-trusted-header-deployment/auths_signin.py) 第 11–15 行在 trusted-header 分支前检查 `ENABLE_PASSWORD_AUTH`，关闭时直接 403。[当前 oracle](../../results/skill-ir/skill-dsl-research/cases/authorization/oracles/owui-trusted-header-deployment.json) 的缺失事实和条件结果未包含该开关。因此“trusted header 启用且能直达”不足以单独支持其条件路径；需注明入口开关及后续认证成功条件。最终 `unknown` 不变，首轮实验前应显式修订 oracle/评分依据并保留变更记录，本次复核不悄悄覆盖原答案。
2. **语义评分尚是协议，不是已实现能力。** [evaluation protocol](../../results/skill-ir/skill-dsl-research/cases/authorization/oracles/evaluation-protocol.json) 已正确区分四层，但尚需说明每次语义判断由谁、依据哪些引用和矛盾作出，如何记录争议。关键词/函数名命中只能作覆盖提示，不能自动判证据支持；第一小面板可保留逐项可审阅判断。实现应至少检查正确改述、带正确关键词但否定关系错误、忽略入口控制等反例，不先建设通用语义评价平台。
3. **零工具需定义为零可执行外部能力。** 当前 [structured provider](../../src/providers/structured.ts) 用不执行的 tool schema 承载结构化输出。可以复用该输出通道，同时禁止读写文件、命令和网络工具执行；不能既要求完全没有任何 schema tool，又原样调用该接口。若坚持请求中没有 tools，需明确选用 prompt/parse 路径。每次 fallback/失败响应的计量仍须补全。

下一步应把以上局部修正纳入最小实现计划，然后实现 canonical declaration、B/D 同事实渲染、coverage/result contract、固定上下文宿主及逐次计量/评价。约十类确定性失败测试通过后做三个 matched B/D pair。六次运行仅用于确认链路和发现问题；真实质量、实际开销及后续重复/第二项目是否值得做，由结果决定，不再用检索代替运行。

### 7.19 V 开发合同与持续复盘

2026-09-20，用户确认从研究进入开发。[V0–V10](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)已完成，下文描述其已实现接口与运行结果；W 的待实现变更集中在 §7.20。执行细节与失败原件由原任务书和 development 数据承载。

**分类如何进入实现。** 按“任务目标→领域对象→决定答案的关系/规则→跨来源映射→近似反例→程序/模型分工”识别任务范围。首版接收明确的单 ref 授权任务；已有 skill 可以把对应职责写成声明，其余职责保留。首版不需要训练分类器，也不以构造所有 skill 的类别树为前置。

**最小组件。** `src/task-dsl/authorization/` 负责 schema、semantics、render、result 和公开导出；`src/benchmarks/authorization-dsl/` 负责精确输入、provider 包装、fixed-context host、评价与开发脚本。前者不依赖案例 ID 或 oracle，后者承担实验数据映射。已有 provider 路由、Zod、Bun 与 token 类型直接复用。

**已实现领域接口。** `AuthorizationTaskV0Schema`/`AuthorizationTaskV0`、`Diagnostic`、`parseAuthorizationTask`、`CompiledAuthorizationTask`、`compileAuthorizationTask` 和 `renderAuthorizationTask` 已落地并由 `index.ts` 导出。解析层只判断 closed shape，语义层单独报告 duplicate/dangling/ambiguous reference；政策 conflict/unresolved 仅阻塞引用它的展开义务。无义务返回 `needs-input`，不会产生 vacuous complete；已有 runnable 与 blocked 同时存在时返回 `partial`。同一 authored obligation 内重复 entry 只展开一次并保留 warning；展开 ID 由 authored obligation ID 与 entry ID 决定，数组重排不改变身份。B/D 共用同一 facts；B 组织成 Markdown，D 附 canonical facts、展开任务、依赖和诊断，源码插槽各出现一次。

**领域声明。** `source-authorization-assessment/v0` 的实际 v0 字段为 `schemaVersion/taskId/request/repository/sourceRef/sourceMode/policySources/principals/resources/entries/obligations/scopeAssurance/requiredAnalysis/constraints`。政策记录文本、位置、revision 与 `accepted/conflicted/unresolved` 接受记录；主体记录 role、description 和 starting capabilities；入口记录允许源码位置。每条义务写明 `principalId/resourceId/relation/operation/expectation/conditions/policySourceId/entryIds`，其中 expectation 为 `allow/deny/conditional`，只展开显式 entry，避免把所有维度机械组合。实体名称可变化，核心对象采用 strict schema；starting capabilities 和 conditions 空数组正常处理。缺必要事实输出字段路径诊断，政策冲突只阻塞相关义务。

**作者与政策。** 首版三份声明由开发者根据允许的 task/source 编写，保存字段来源。政策接受记录写明接受者角色、适用理由和来源；当前实现行为进入观察，不作为规范依据。模型后续可辅助起草，但自动编写与主动发现是后续功能。首版生成输入不含预期结论或答案提示。

**执行顺序。** parse→semantic resolve→明确义务展开→B/D 渲染→宿主附精确源码→structured provider→结构/引用/覆盖检查→必要局部修复→生成结束后读取 oracle 评价。首轮模型没有文件、命令或网络执行能力；结构化 schema tool 只是输出通道。程序记录声明处置、source discovery 和 evidence 三种状态，source discovery 为 `not-tested`。

**结果接口。** `AuthorizationResultV0` 使用 `source-authorization-assessment-result/v0`，逐展开 obligation 返回 `source_supported_failure/source_refuted/unknown`、explanation、entry/binding/control/effect/condition 分组事实与 citation、决定性缺失事实和建议观察，并显式选择 declared-only 或 repository-all-entry scope claim。`validateAuthorizationResult` 分开输出 strict structure、declared disposition、host-owned `discovery=not-tested`、citation presence 和 `evidenceSupport=unreviewed`。引用只可指 exact bundle path 和 crop 行，保留 quote 必须出现在该范围；sink-only 引用可为 present，但缺 binding/control 等 fact group，绝不自动升级 support。正常 unknown 可完成对应声明义务，但空 missing facts/observation 产生 actionable diagnostic；漏项、重复、陌生结果和 unsupported completeness 不抹掉其他有效结论。

**变化处理。** 义务 ID 由作者 obligation ID 与 entry ID 稳定关联，数组重排保持不变。validation 保存 repository/ref、exact source digest、政策文本/位置/revision/status 和 obligation semantics 的轻量 dependency snapshot。政策、相关源码或 obligation scope 变化标 `needs-review`；只有 ref 改变而这些依赖相同，也先保持 needs-review，宿主另行确认 bounded entry universe 未变并写明 reuse basis 后才记 `reusable`。旧结果仍属于原 ref；没有新增哈希冻结链。

**固定上下文宿主与调用计量。** `runAuthorizationTask` 接受 task、精确 `SourceBundle`、注入 provider、B/D arm 和界限参数；不解析案例目录或 oracle。宿主仅提供 `submit_authorization_result` 输出容器，没有可执行外部工具。wrapper 在实际 `provider.complete` 前登记 schema/fallback/repair attempt，已返回响应的 usage 只汇总一次，未知费用保留 null。V runner 的恢复规则不会重新派发已登记单元；9 月 21 日复核发现，内存中的迟到解析仍可触发 fallback，且 repair 超时会丢失返回对象中的 initial。W 将修复这些生命周期缺口，V 归档按已有快照解释。

**准备阶段新发现 V-PREP-01：自动探测会改变比较条件。** [registry](../../src/providers/registry.ts) 第 167–219 行默认给 openai-compatible 包装 AutoProbeProvider；[auto-probe](../../src/providers/auto-probe.ts) 可在解析错误后发出额外探测、切换协议并写入路由。V5 宿主只接受注入 provider，因此其 mock 路径不会初始化 registry、探测或写配置；V7 实验入口仍必须在创建 provider 前设置 `SKVM_AUTO_PROBE=0`，并用入口测试固定这一点，避免真实 B/D 中途换路由或产生 wrapper 外调用。

**评价与迭代。** 首三个真实条件各运行一对 B/D。两臂同事实、模型、源码、输出合同与修复机会；方法差异记录在 comparison config。`AuthorizationSemanticReviewV0` 绑定 case/task、initial/repair、实际输出 provider attempt、原始输出 SHA-256、rubric version、reviewer 身份，以及每项判断的 answer JSON pointer、exact source location 和 oracle rule；首轮 reviewer 角色固定为 `development-agent`，不称真人或独立模型服务。程序先验证 review 完整性与绑定，再分开计算 label correctness、critical facts、scope honesty、deterministic diagnostics、task decision 和 error classes；任何语义支持都来自显式 review，不从关键词或 citation 存在性推导。初始输出全部完成后再读取 oracle 填写 review，评价内容不返回被测修复流程。有具体共享缺陷时先补反例、修实现，再追加一轮受影响配对，首轮仍保留。

**V8 首轮真实结果。** 六个预定单元均按冻结顺序且每单元 fresh context 发出一次，没有换案例或重发 completion-unknown。四个单元完成，`process-text D` 与 `trusted-header B` 在 180 秒宿主截止时仍有 pending 请求，保留为 `timeout-unknown`，故只有 file pair 可配对评价。完成单元经输出哈希绑定 review 后：file B 为 partial、file D 为 full-success；text B 为 full-success；trusted-header D 为 partial。唯一完整 pair 的 D 相对 B 少 1 次 provider call、2,353 input tokens、3,537 output tokens、1,408 cache-read tokens 与 109,057.317 ms 已知 elapsed，但单一 pair 不支持推广 D 优势。全轮 14 次 provider call 中 12 次有响应、2 次 pending；已知用量为 46,560 input、26,583 output、1,408 cache-read、0 cache-write tokens。provider 对 14 次调用均未报告实际 USD，故总成本是 unknown 而非 0。原始与评价证据位于 `development/authorization-v0/runs/initial/`。

**V9 revision 1（运行前）。** 首轮三个 completed initial outputs 在语义上回答了问题，却把 authored obligation ID 写成结果键；validator 因 closed compiled target 是 `author::entry` 同时报 foreign/missing。该现象跨 B/D 且修复调用能纠正，最窄共享根因是 result contract 只说“declared entry obligation”，没有把 exact runnable output IDs 列为闭集。红测试现已要求 B/D 的 `## Result contract` 同时列出 exact expanded IDs，并明确禁止 authored ID、遗漏和额外 ID；renderer 由同一 compiled object 生成这段合同，不含 case ID 分支、结论或 oracle。效果修订固定在 `comparison-config-v9-expanded-id.json`，只重跑首轮双臂均完成且直接受影响的 file pair；citation mismatch、trusted-header 条件遗漏与 provider timeout 不冒充此修复的目标。

**V9 revision 1 结果。** B 与 D 的首个 schema response 都使用 exact `file-owner-without-destination-write-grant::post-process-file`，说明目标 foreign/missing-ID 缺陷已由共享合同消除。B 的 response 仍因缺 `suggestedObservations` 且 `results` 混入字符串而不能解析，prompt fallback 于 180 秒保持 pending；D initial 的 obligation/结论/语义事实正确，但八处 citation 行/quote 不匹配，唯一 domain repair 后 full-success。修订共 4 次 provider call（3 response、1 pending），已知 10,612 input、5,187 output tokens，四次 actual USD 均 unknown。由于 B timeout，修订不形成 pair，不能用 D 单臂宣称质量改善；初轮与修订证据分别保留。下一轮应选择“先简化领域支持”：在相同 fixed-context 任务上收窄非决定性字段、改善 schema transport 与 citation 表达/校验，再决定是否进入第二项目；现在增加入口发现只会把未解决的传输成本放大。

**当前局部问题归属。** trusted-header 的 `ENABLE_PASSWORD_AUTH`、authentication/user 和 session 条件已在 evaluator-only revision 中补齐，T oracle 原件保留且最终 expected disposition 仍为 unknown。exact expanded-ID 合同由 V9 解决；schema/fallback shape 与 citation fidelity 是下一轮 transport 工作；trusted-header 的 authentication false branch/四种条件结果仍是模型推理缺口；三个 pending-at-timeout 继续属于 completion unknown。工具 schema、零执行能力与关闭 auto-probe 均已有测试，不再作为未完成项。

**使用与测试。** 公开领域函数为 `parseAuthorizationTask`、`compileAuthorizationTask`、`renderAuthorizationTask`、`validateAuthorizationResult`；实验宿主公开 `runAuthorizationTask`，开发入口为 `src/benchmarks/authorization-dsl/run.ts` 的 `check/run/evaluate/status`。仓库根执行 `bun ./src/benchmarks/authorization-dsl/run.ts check` 会验证声明、rubric 与 exact bundle，写 `check.json` 和六份 preview；`run --config=./results/skill-ir/skill-dsl-research/development/authorization-v0/comparison-config.json` 是唯一会初始化 provider 的命令，默认写 `runs/initial`；全部生成结束并填写 review 后，执行 `evaluate --run-dir=./results/skill-ir/skill-dsl-research/development/authorization-v0/runs/initial` 离线重算；`status` 只读。help/check/evaluate/status 不创建 provider。修订配置和结果分别为 `comparison-config-v9-expanded-id.json` 与 `runs/revision-1-expanded-id-contract/`，不得与 initial 拼接。总状态、结果和 V10 离线复验分别见 `status.json`、`summary.json`、`offline-replay.json`。聚焦测试目录为 `src/task-dsl/authorization` 与 `src/benchmarks/authorization-dsl`，同时运行现有 typecheck；修改 provider 才增加相关专项回归。

**复盘约定。** 实现期间每个有意义问题按“触发→根因→解决→验证→方法变化→剩余项”在本节相关主题更新，并在 §12 追加短记录；原始日志和机器证据放 `results/skill-ir/skill-dsl-research/development/authorization-v0/`。本轮计划写好时不创建空运行结果。错误处理、字段调整或评分修订改变当前行为时同步本节、spec 和任务书，不额外建立平行开发报告。

### 7.20 W 复核结论与下一轮设计

2026-09-21，先复核 V 代码、原始输出和语义 review，再按 [W0–W9](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)完成共享修复、离线演练和三组真实配对。前置证据见[复核记录](../../results/skill-ir/skill-dsl-research/development/review-20260921.json)，W 机器结果见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/summary.json)。本节区分已验证的工程能力、当前方法证据与下一轮最小假设。

**研究基础的可用程度。** 外部任务研究已经给出可用的分类方法：由目标、领域对象、决定答案的关系、跨来源映射及反例确定范围。授权任务的 principal/resource/relation/operation/condition/policy/entry 已能表达三个真实条件，程序与模型分工也已运行。下一步所需信息主要来自消费失败，而非更多泛读数量。第二项目仍承担以后检验领域语义迁移的责任；当前三个条件均来自 Open WebUI。

**引用问题与 W1 处理。** `renderSourceBundle` 原来只展示裁剪范围却要求模型复制 exact path、行号和 quote。现在 source catalog 以 repository/ref/path/content digest 生成稳定 ID，按 crop 行号显示全部允许源码；宿主从单一 source ID 和闭区间绑定 canonical path 与整行原文。目录顺序不影响 ID，相同字节的不同路径仍不同；重复路径、陌生/旧 ref ID、越界和跨来源范围 fail closed。原始文件位置只作 provenance，不混入 crop 行号。合法引用与 semantic review 仍分开，未用 oracle 选片段。

**传输问题与 W2/W9 处理。** revision B 既漏字段又在 `results` 混入字符串。新增 `source-authorization-assessment-wire/v1`：模型只写 exact obligation ID、结论、解释、五组事实、source ranges、unknown 信息和 scope；`authorization-wire-normalizer/v1` 绑定 task/repository/ref、canonical result v0 和 quote。明确结论可省略 missing/observation 并规范为 `[]`，unknown 缺两项仍报错。schema tool 与 prompt fallback 共用同一实测 schema；旧 `AuthorizationResultV0` parser/validator 未删除。归一化拒绝 malformed item、重复/陌生/missing obligation、错 ref 和无效引用，不猜答案字段。W9 审查进一步确认：任一 error 级归一化诊断都必须使 canonical result 不可交付，一次 repair 后仍 invalid 则返回 `transport-failed`。

**生命周期问题与 W4 处理。** 根因不是计时数值，而是 phase 外层 `Promise.race` 返回后，底层 extraction 仍拥有派发 fallback 的能力。deadline 已移到每次 wrapped `provider.complete`：超时作为 provider 级 completion-unknown 错误关闭单元，因此解析链终止；每次派发前再检查 closed、整单元剩余时间和四次上限。attempt 在派发时固定 phase，事件记录 dispatch/response/error/timeout/late settlement/closed/rejected，并可追加 `events.jsonl`；离线评价从事件归并调用事实。迟到响应只补 usage/cost，不产生答案；repair 超时保留 initial。固定配置仍为 per-call 180 秒、unit 600 秒、6000 output tokens、最多四次派发和一次 repair。

**评价问题与 W5 处理。** V 的 `taskDecisionCorrect` 原口径保留为 `authorization-evaluation/v0`。附加的 v1 分解单列 `semanticDecisionCorrect`（label 与有定位的 disposition review）、`evidenceSemanticSupport`（关键事实 review）、`transportValid`（结构、义务及引用可归一化）和 `deliveryComplete`（机械交付完整且 scope 可接受）。因此正确判断但坏引用不再被描述成语义错误，引用合法但论断矛盾也不能冒充成功。无答案或无有效 review 为 unknown；四种逻辑等价条件表述由 review 判因果，不按固定措辞。

**开发与比较。** 引用目录→wire/归一化→精简 B/D 与 repair→关闭与事件→分层评价→离线演练→三个原案例的新六单元配对均已完成。B/D 使用同一模型、源码、输出接口和修复机会，源码只插入一次；历史 V 与新 W 分版本报告。W8 的六个真实结果没有给出共享 revision 依据，故 revision 明确为 none，没有追加调用、答案提示或 rubric 放宽。W9 独立代码审查找到一个未在六份有效最终结果中触发的 invalid-wire 交付缺口，已修复、验证并发布；W0–W9 已关闭。

**W0 反例基线。** 旧实现的授权回归 51/51、284 assertions 和主 typecheck 均通过；这只证明 V 合同自洽。随后四个新增 synthetic 测试分别准确失败于：源码没有稳定 source ID/逐行标签；实际 provider schema 仍要求任务元数据、path 与 quote；宿主 5 ms 截止后，25 ms 到达的无工具响应继续触发第二次 prompt fallback；评价对象没有独立的 `semanticDecisionCorrect` 等字段。该组红灯把 W 的四个共享缺口固定为可回归行为，未调用模型或目标。

**W7 实际配对。** 固定 `xty/gpt-5.6-sol`、temperature 0、auto-probe off、per-call 180 秒、per-unit 600 秒、最多四次派发和一次 repair，按 B/D、D/B、B/D 完成 6/6 单元。file B 的首个 schema tool shape 无效后同一 phase fallback 成功；text B 首结果把两个 citation range 绑定到错误 source ID，一次 diagnostics-only repair 后成功；其余四单元首个 schema response 可归一化。最终 `transportValid=6/6`、`deliveryComplete=6/6`、`semanticDecisionCorrect=6/6`，file/text 四单元 evidence supported，trusted-header 两臂 evidence missing。B 为 5 次 dispatch、15,866 input、6,116 output、3,456 cache-read tokens；D 为 3 次、7,013、3,302、3,456。总已知调用时长 460,574.8948 ms，8 次调用实际 USD 均 unknown。

**W7 review 边界。** trusted-header 两臂都合理报告 deployment `unknown`，但都未明确陈述 closed-control、authentication-failure、trusted-proxy-safe、attacker-header-reachable 四种 outcome；D 没有陈述 optional signup。独立只读复核者同意这些核心缺口，但认为 B 的代码引文可把 password gate 和 signup 算作支持。主 review 依 rubric 的“state”要求采用更严格口径：引文内容不替代答案本身的明确陈述，分歧保留而不改答案或 rubric。

**W8 当时的归因与决定。** W 将剩余 partial 初步归为领域条件关系表达缺口，选择 `study-missing-domain-relations`，暂不迁移第二项目。D 在该小面板开销更低且没有 repair/fallback，质量和完整性未提高。后续复核补充了评分粒度与声明表达的解释；用户确认的新 X 路线见 §7.21，W 原决定作为历史保留。

**W9 完成前审查。** 独立只读审查指出 normalizer 虽把重复/陌生/missing obligation 和无信息 unknown 标记为 invalid，但仍可携带 canonical result，host 可能将它交付为 `completed-with-diagnostics`。新测试先在四类归一化反例及双次 invalid host 路径准确失败，随后改为“任一归一化 error 都禁止 canonical result”并回归通过。该修复不依赖案例名、oracle 或模型重跑，不改变 W7 六个有效最终结果与 W8 方法决定。

**文档归属。** 状态页只维护当前工作和结果导航，plan 只维护近期顺序，spec 保留持续规则；本文件维护设计与复盘。V 的过期草案段落已合并进实际接口，原始失败和历史任务仍可追溯。复核接纳此前共享文档中与代码一致的改写，不继续以“混有修改”为由搁置整批文档；无关源码仍由原任务负责。

### 7.21 X 完整能力阶段设计

2026-09-21，用户在 W 复核后确认按完整能力交付制定下一轮任务书。原则是代码小步实现、阶段完整交付；第二项目提前提供反例，旧三例不必全满分后才继续。[X0–X13](../superpowers/plans/2026-09-21-authorization-dsl-capability-delivery.md)是执行清单，本节维护当前设计。状态 `completed-development`：X0–X13 已完成并发布，初轮真实结果、逐义务评价、方法比较、一次共享合同修订、普通使用复验和最终验证均已保留；不自动扩展下一轮。

**为什么扩大本轮范围。** W 的模型消费与计量已经可用，继续只修旧案例会降低获取新信息的速度。现有 B/D 共用 canonical declaration、输出合同和宿主，主要差异位于领域方法指令。接下来既要检验这种组织方式，也要让作者实际写任务、用自备输入运行，并检验换项目后的语义适配。

**先校准任务与评价。** trusted-header 的公开 requiredAnalysis 要求识别配置/身份关系、区分源码与部署、说明缺失事实；严格 review 另外要求显式四种条件结果、signup 和 403。新评价 v2 分开必要语义、解释完整性与可选细节，接受逻辑等价表述，保留源码引用不足以替代因果解释的要求。规则在新生成前确定，旧 W review 不改；关系层缺失只是当前原因假设，须与表述要求和提示组织一起检验。

X1 已把该原则落为 evaluator-only `authorization-evaluation-rubrics/v2`、hash-bound `authorization-semantic-review/v1` 和六个判例。`ENABLE_PASSWORD_AUTH` 必须为真与“为假时路径被阻断”等价；精确 HTTP 403 是解释完整性。header→email→authentication 是必要因果，optional signup 只单列覆盖；条件源码能力、实际 gate/ingress/proxy/authentication 缺失是正确 unknown 的必要语义。标签正确但必要语义未陈述记 partial，决定性因果被反转才记 incorrect；可选细节缺失不改变 `semanticDecisionCorrect`、`taskDecisionCorrect` 或在其余层完整时的 full-success。W B/D 复用旧生成做只读 v2 重评：必要语义和 unknown 均支持，两臂仍因未枚举完整条件结果而 partial；W 原 review/summary 字节未改。

**领域关系。** 不将五节点登录链变成所有授权任务的必经顺序。X3 在原 file/text/header 与 FastAPI owner/role 两项义务上走查后，六类保持为 entry-control、identity-binding、resource-binding、authorization-decision、effect-reachability、external-assumption。共同 profile 的前五类 required，external-assumption 默认为 when-present；task 可把外部事实提升为 required，或用既有 kind 增加 task-specific when-present 分支，但 signup/proxy 不进入共同要求。默认分析依赖为 decision → identity/resource、effect → entry/decision、external → effect，只在同一 expanded obligation 内解析，不表示源码控制流顺序。编译器检查 ID、显式 obligation 映射、依赖适用性和环，并只展开作者声明的 requirement-obligation 对；模型发现源码里的条件、分支、适用性和结果，并用本次 facts/citations 说明。源码循环不等于分析依赖循环，程序不代替模型求解源码控制流。

**X3 反例结论。** 资源所有权与 superuser override 不需要新增项目专属类别；同一 kind 可按义务重复，因而两条 authored obligation 能拥有各自 decision/effect 问题而不产生跨入口笛卡尔积。trusted-header 的 deployment facts 是 task-specific required external assumption，可选 provisioning 则是 identity-binding 的 when-present 补充。两个声明示例只含公开问题和字段来源，不含 observed branch truth、oracle、expected finding 或评价标准。冻结机器合同位于 `authorization-capability-v1/relation-contract-v1.json`，示例位于其 `relation-examples/`；X4 将以 strict schema 和 pure compiler 验证其可实现性。

**X4 实现结果。** `relations.ts` 以 strict schema 隔离单项 shape 错误，拒绝重复 requirement、陌生/歧义/不可运行 obligation、陌生或不同 expanded obligation 的 prerequisite 与 dependency cycle。候选 entry 只来自作者显式映射并稳定排序；cycle 或局部引用错误不会抹掉其他义务的有效 pending question。compiler 不写入 allow/deny、源码控制、攻击路径或适用性答案。独立复核未发现 critical/important，指出字符串组合 key 与 `author::entry` delimiter 可碰撞；两项先加红测，再分别改为结构化 tuple key 与 `%`/`:` segment escaping，普通已有 ID 不变。

**覆盖记录。** 每项 coverage 关联 requirementId、expanded obligationId、addressed/unknown/not-applicable、说明及当前答案 fact pointers。addressed 表示已回应，语义仍需 review；required 不允许静默跳过，when-present 的不适用须有理由。缺部署事实可成为有内容的 unknown。若第二项目显示六类边界不合理，依据反例修订这一设计，不按项目名写成功分支。

X5 已把这份记录接入版本化 `source-authorization-assessment-wire/v2`。只有显式提供 analysis requirements 的运行采用 v2，归一化结果仍是 canonical v0，coverage 独立保存为 sidecar；旧 wire/v1、run 与 replay 继续按原合同工作。`validateRelationCoverage` 机械检查遗漏、重复、陌生 requirement、错误 expanded obligation、同义务 fact pointer、required 跳过和 unknown 理由，并把正确关联的状态明确标为 `semanticSupport: unreviewed`，不从 citation 存在推断因果正确。宿主在同一条一次修复路径中返回可操作诊断；持续无效 coverage 以 diagnostics 结束，不能伪装完整交付。

**输入、接口与兼容。** 一个 `authorization-assessment-input/v1` 文件包含 task v0、`sourceIdentity`、sourceRoot、显式 sources 和可选 analysisRequirements。`sourceIdentity` 是 X6 为可检查 ref/task 一致性加入的明确绑定，repository/ref 必须与 task 相同；不是 manifest 或 oracle。相对 root 以该输入文件为基准，canonical root 仍须位于输入目录内；普通使用不需要研究 caseId、manifest、oracle 或评审资料。`loadLocalAuthorizationInput` 复用 exact-reader 核心但允许 `src/...`，旧 reader 仍限制 `inputs/`。新 wire 扩展显式版本化，归一化生成 canonical v0 及 coverage sidecar；W 的 wire/v1 与历史评价继续可读。普通入口复用 benchmark 宿主，没有重构整个运行架构。

**X6 实现结果。** 缺显式 requirements 时，输入装载器从 authored obligations 实例化公开 `authorization-core-v1` 六项 profile；显式要求则原样 strict 编译，只有 ready plan 才能运行。sourceRoot/path、junction/symlink、缺文件、normalized duplicate、task/ref、声明行范围都在 provider factory 前检查。check/inspect 是纯离线路径；run 每次生成时间+nonce session，以 `wx` 文件和新目录避免覆盖，append-only index 只定位 session。session 保存 JSON/JSONL/文本三类产物；provider 不可用时不谎称 dispatch，dispatch 后缺终态统一显示 completion-unknown。独立复核找到 root junction 外逃和失败 artifact 清单两项问题，均先以红测复现再修复。

**X7 同事实三臂与作者体验。** renderer 现显式接受 N/B/D，switch 阻止第三臂落入旧 D 分支。三臂从同一 `AuthorizationRenderFacts`、公开 analysis plan、source catalog、wire/v2 与 result contract 生成：N 把全部 schema 字段确定性写成自然说明，B/D 共用 canonical JSON，D 只额外给出授权因果链和 prerequisite-order 方法。普通 check/run 的 `--arm` 从 preview 贯穿 session、dispatch、host、inspect、字符分项与 telemetry；X7 初始默认 D，X12 根据实际面板改为 B，非法值始终在读 input/建 provider 前拒绝。合成例子三次 provider-free check 均 valid，N/B/D prompt 分别为 11,141/11,837/12,177 characters；字符不冒充 token，真实 token 只采用 provider response，当前 X7 尚无真实调用。单次 evaluator summary 可记录 N，B/D pair summary 仍在运行时拒绝非 B→D 配对。

两份真实 skill 映射来自固定 MIT 版本的 Cloudflare security-audit 与 GitHub awesome-copilot security-review。人工/agent 辅助只映射其 fixed-ref 授权敏感操作切片到 declaration 与六类 requirements；全审计编排、dependency、secret、patch 等剩余职责继续属于原 skill，不声称自动转换。skill 来源数 2 与目标代码项目数 2 分账。自包含例子以 synthetic 标记，不是漏洞或 evaluator fixture。作者变化 trace 做四次 deterministic check：基线 valid，遗漏 sourceIdentity 同步得到 `source-identity-mismatch`，移动 entry 未更新 sources 得到 `declaration-source-location-invalid`，补齐后 valid；两次错误、零 provider、零目标执行，未测真人时间，不主张人工节省。机器记录为 `render-interventions-v1.json`、`skill-responsibility-mappings-v1.json` 与 `authoring-experience-v1.json`；独立只读复核未发现 critical/important。

**X8 离线接线与运行冻结。** 五个任务已通过同一 ordinary parser、analysis ledger、精确 source catalog、wire/v2 mock host、coverage validator 和 v2 evaluator template 入口；四种 synthetic 变化分别证明 prerequisite 删除、声明条件反转、when-present 问题删除及 required external fact 缺失会改变 plan、prompt 或诊断，而不被计作新项目证据。复制自包含例子到临时普通目录后完成 check/run(mock)/inspect，没有研究绝对路径、manifest 或 oracle 依赖。新增的 experiment-only capability runner 只编排已存在的 local-run/host 语义：在 provider 创建前冻结 config/revision/顺序，逐单元创建不可覆盖 session，终态与 completion-unknown 不重发；仅“已有 session 但尚无 dispatch”可新建 session 继续。恢复时交叉核验 unit result、session、dispatch、run 与 result 身份，篡改在 provider factory 前失败。实现固定为 `dccd83099dd4f2779604d18f9ad36e62aa8f5a31`，配置 SHA-256 为 `23e22d8e3f6f49728d1ba1eb2db8afde7b861053bace435607b6222a64b57fec`；五任务、20 个 B/D 重复及 3 个 N 补充共 23 单元的 provider-free check 为 valid。评价路径只写入 metadata，生成结束前不读取 rubric。授权回归 129/129、813 assertions 与 typecheck 通过；真实 provider 和目标执行仍为 0。

**X9 初轮真实生成。** 冻结面板按提交顺序一次执行：五任务 × B/D × 两次 fresh context 加三个预定 N 补充，23/23 都完成；没有 completion-unknown、timeout、terminal failure、domain repair 或目标执行。30 次 provider 调用由 23 次 schema-tool 与 7 次 prompt-parse 组成。2026-09-22 复核纠正旧记述：后者是结构输出失败后的 transport fallback，按原任务附 JSON 要求重新请求模型；没有将旧答案交给模型做纯格式转换，也不是带领域诊断的 domain repair。调用和 token 已包含这些请求，历史事件不改。provider 报告 input 102,579、output 61,942、cache-read 45,824、cache-write 0 tokens，response duration 已知小计 2,273,732.1484 ms；30 次实际 USD 均未报告，故总额为 unknown 而不是零。全部生成结束后才向 evaluator 提供 rubric；原始 response、attempt、session 与 unit identity 不因后续评价而改变。

**X10 逐义务评价与方法结论。** 23 份 development-agent review 绑定 raw-output digest、attempt、rubric、answer pointer 与 evaluator source；程序另载入仅用于评价、未曾进入 prompt 的 rubric source，并以同一入口重放。结果为 14 full-success、5 partial、4 incorrect，且 23/23 necessary semantics supported、coverage valid、scope accepted、transport valid、delivery complete。四个 incorrect 不是授权因果缺失：text B 一次、FastAPI foreign-update D 两次和 N 一次都正确解释 deny 在 effect 前生效，却把应为 `source_refuted` 的结论写成相反的 `source_supported_failure`。五个 trusted-header 结果均正确 unknown、必要语义 supported，但未完整枚举 closed gate、failed authentication、safe proxy 与 attacker-header-reachable 四种结果，且漏 optional default-None detail，故均为 partial。

B 的十个主单元为 7 full、2 partial、1 incorrect，first response accepted 8/10，12 次调用，input/output/cache-read 为 31,082/25,314/27,520；D 为 6/2/2、6/10、14 次调用和 52,755/28,136/18,304。两臂 necessary semantics 与 coverage 都为 10/10；D 在 text repeat 1 改善一次，却在 FastAPI update 两次退化，因而当前数据没有显示 D 的额外关系覆盖或总体质量收益。D 的已知 duration 小计较短，但受顺序和 cache 混杂，不能抵消其更多调用/token 或被写成速度因果。共同 profile、ledger、coverage 和普通入口的工程价值体现在五任务同链交付和遗漏可见性；因为 N 也共享这些底层支持，本实验不能把它们归为 DSL 相对原始 agent 的独立因果收益。三个无重复 N 仅为 1 full、1 partial、1 incorrect，不能作稳定性判断。离线 replay 的 summary digest 一致；第七次窄只读复核确认四个标签错误、B/D totals、D 无额外 necessary/coverage 收益及 N 的限制。X11 的唯一共享缺陷假设因此是输出合同列出 enum 却没有解释其相对“声明期待”的方向；先加反例，再仅修改共同 renderer，并把追加验证与初轮分开。

**X11 单一共享合同修订。** 新测试先证明 N/B/D 的共同 output contract 只列 enum、没有解释方向；最小修改明确三个 label 都相对 declared policy expectation，而非 allow/deny 的同义词。`source_supported_failure` 是固定源码支持规范期待在声明条件下失败，`source_refuted` 是固定源码支持规范期待被执行并反驳 failure，`unknown` 是现有源码/上下文不足。没有改变 facts、analysis requirements、source、rubric、wire、评价口径或 B/D method difference。修订实现 `7b619b4d9afc1bd950fd86613f1f538fe109a249` 在调用前提交，四单元顺序与停止规则写入 `revision-config-v1.json`。

唯一追加轮为 text B/D 与 FastAPI foreign-update D/B 各一次。四项均初次 generation 结束为正确 `source_refuted`、full-success、necessary semantics supported、coverage valid、scope/transport/delivery accepted；3/4 first response accepted，FastAPI B 的 schema response 把 coverage 放错层，随后一次 prompt-parse 成功，仍无 domain repair。合计 5 次 provider 调用、input 25,674、output 9,836、cache 0，actual USD 5/5 unknown，目标执行 0。普通入口首次未带仓库本地 `SKVM_CACHE` 时在 provider 创建前失败、无 dispatch；保留该 infrastructure session 后设置与 X9 相同 route location，才运行预定单元。revision 的 4/4 只支持“标签合同是可修共享缺陷”的诊断；不覆盖初轮 14/5/4、不证明一般可靠性，也不触发继续增样。D 的有用共同 declaration、source/citation、ledger 与 coverage 被保留，但当前没有理由让普通入口为了 D 名称默认承担额外方法指令。

**X12 普通使用复验与能力判定。** X12 不为报告重复付费，而是通过当前 `local-run.ts inspect` 读取 X11 同一普通入口、同一修订实现生成的 Open WebUI controlled-text B 与 FastAPI foreign-update B session。两者都为 completed、正确 `source_refuted`、coverage valid；inspect 不初始化 provider、无需 evaluator，也不执行目标。省略 `--arm` 的 synthetic check 返回 B、`authorization-core-v1` 六项要求和零诊断；作者四步 deterministic trace 仍以 `source-identity-mismatch` 和 `declaration-source-location-invalid` 精确指出 identity/path 漂移。结果 JSON 对每个义务固定保留 decisive missing facts 与 suggested observations；unknown 时须具体填充，非 unknown 时为空数组而不是隐去合同。

冻结初轮的 B/D necessary semantics 与 coverage 都为 10/10，D 没有额外收益，first-response acceptance 更少且调用/input/output token 更多；因此普通入口默认由 D 改为 B，N/D 继续显式可用，历史 arm/session/replay 不改。工程与迁移验收支持同一实现处理两项目，差异全部来自 declaration、requirements 和显式 source，没有生产代码项目名成功分支。效果仍保留 14 full、5 partial、4 initial incorrect；trusted-header 的 incomplete condition enumeration 和四项旧 label 错误不因工程交付消失。能力状态定为 `bounded-development-capability`：推荐单 repo/ref、作者显式源码与义务的 source-visible 授权/信任边界分析；不推荐 repository discovery、目标/部署执行、whole-skill 自动转换、patch 或 production-default security decision。下一轮最小实现是把现有严格 check/run/inspect 包为 opt-in 顶层 SkVM 命令，并先在一个新 held-out repo/task 验证，不提前扩成完整生产系统。机器记录为 `usage-verification-v1.json`。

**使用交付。** 薄脚本支持 check/run/inspect，输出机器 JSON、事件和简明文本结论；只有 run 调模型。一个自包含 synthetic 例子用于上手，真实两项目用于结果验证；另从现有语料选两份独立 skill，明确授权职责到 DSL 的映射及剩余职责。skill 来源与目标代码项目分开计数，人工/agent 辅助映射不称自动转换整个 skill。作者步骤、字段修改与诊断可观察；未测真人时间时不称人工节省。X 最终以实际可运行命令替换任务书中的接口设计说明。

**第二项目。** 先从现有外部研究来源选取，再用官方源码/认证 GitHub 补全；最多考察三个候选，按政策和源码证据是否可定位选取首个合格者，不按模型成功筛选。选非 Open WebUI fork 的项目，准备两个有不同权限关系的任务，优先挑战只适用于登录/proxy 的结构。模型输入与评价资料分开；已暴露资料按 development 记录。来源获取受阻时继续其他独立工作，并如实标记跨项目部分未交付。

X2 查过现有索引后用认证 GitHub CLI 选择首个合格候选 `fastapi/full-stack-fastapi-template@cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`；它不是 fork，许可证为 MIT。两项新义务分别是普通认证用户更新他人 item 应被拒绝，以及 active superuser 读取他人 item 应被允许，直接挑战 owner relation 与 role override，不含 signup/proxy。`items.py`、公开回归测试和许可证的归档字节与官方 git blob SHA 一致；任务/源码和 evaluator 资料物理分开，development 暴露已记录，目标项目及测试均未执行。首次 contents URL 因 PowerShell 插值形成错误路由并返回 404，修正 endpoint 后继续同一候选，没有重启或换容易案例。

**比较与因果。** 主面板为五任务 × B/D × 两次 fresh-context 重复，共 20 单元；再对原 file、原 trusted-header、第二项目首任务各跑一次 N 自然说明，共三单元。三臂事实、公共要求、源码和输出协议相同；D 的 ledger 方法组织差异明确保存。N 共享底层支持，结果只能解释模型可见结构组织的作用，不归因为整个 SkVM 相比原始 agent 的总收益。两次重复用于观察逐任务波动，不作总体可靠性估计。

**连续执行与决定。** X1 评价与 X2 获取可独立推进，随后关系支持和普通输入接线在同轮完成。有证据的实现问题先加反例再修，最多一轮受影响 B/D 追加；缺少正向研究结果不阻止普通入口与独立任务。若 D 无额外帮助，采用更合适的表达并保留共同声明/helper；若第二项目未完成，整体标部分交付。原始失败、未知费用、开发成本和版本分别记录。

### 7.22 Y 条件表达、默认迁移与价值验证

2026-09-22 用户确认沿用“分类确定范围、按类/任务设计 DSL、效果包含多维收益”的路线，并授权任务书写完后派发新线程连续开发。[Y0–Y14](../superpowers/plans/2026-09-22-authorization-dsl-transfer-and-value.md)已结束发布；以下保留设计与逐阶段结果。后续复核确认公共method漏项，转交§7.23的Z任务；历史实验及机器总结保持原版。开发模型 `gpt-5.6-sol / max` 与实验 provider 设置分别记录。

**复核发现。** X 的 23 个单位来自五任务和两项目；最终标签正确19/23，完整成功14/23。143条coverage为125 addressed、5 unknown、13 not-applicable；必要分析事实supported与coverage-valid不能合写成23次正确判断。真实面板使用逐任务问题清单，默认六类profile仍缺新项目直接迁移证据。Y1 已先以两项失败测试复现 CLI 省略arm为B、公开check/run函数仍默认D的分歧，再把两个公开默认统一为B；显式D和旧session不变，示例README同步。sourceIdentity当前是作者声明互校及字节绑定，普通界面须说明来源核验状态。

**方法选择。** 同轮补充轻量条件请求与条件结果sidecar、作者输入派生、现有CLI薄适配、P/L/C对照及第三项目默认profile迁移。暂不扩为全仓发现或通用程序分析。条件请求只指定公开义务/条件及有界规模，分支真假、可达性和依据由模型回答；假设不得变成实际部署事实。宿主检查ID、赋值、重复、指针和显式遗漏，语义仍由评价者判断。旧版本继续可读，无条件任务不强制生成分支。具体类型、兼容、测试和文件责任以Y任务书为准。

**Y2 条件合同定稿。** task v0 继续 strict，不为加 ID 静默扩字段；可选 `authorization-condition-analysis-request/v1` sidecar 以 authored obligation 为范围，用 `conditionBindings: [{id, name}]` 将稳定显式 ID 绑定到该义务内唯一的既有 condition 名，basis 仍取原 task。这样避免数组序号身份，也不把 name/basis/结果复制成第二份真相。编译只把请求展开到同 authored obligation 的 runnable expanded obligations。输出 `authorization-condition-analysis-result/v1` 保存 branch assumptions、effect、explanation、同义务 fact pointers、missing facts、显式未分析 ID 和 `bounded|incomplete`；启用时用 wire/v3，未启用继续原 v1/v2。`bounded` 只证明每个请求条件至少被某个假设考虑，不声称穷举所有组合或程序路径；`incomplete` 必须列出遗漏与限制。reachable/blocked 至少有同义务事实，unknown effect 或 unknown-valued assumption 至少有决定性缺失事实。宿主只判结构，`semanticSupport` 保持 unreviewed。

三个无项目名公共走查分别覆盖 owner/role override、配置 gate 和外部代理部署未知；均只给 authored policy、condition name/basis、公开问题和上限，不给 source outcome。公共完成要求与 evaluator-only 判例在生成前同时冻结但物理分开：评价先看 necessary decision，再看 condition explanation，最后单列 optional detail；正确标签但漏请求的条件变化是 partial，反转决定性 gate 或把部署假设写成事实是 incorrect，未请求的默认值/可选路径不降级。机器合同见 Y 结果根的 `contract/condition-contract-v1.json` 与 `evaluator/condition-evaluation-cases-v1.json`。

**Y3 纯函数实现。** `conditions.ts` 已实现 strict request/result schema、authored condition name→显式 ID 编译和机械结果校验。编译器遇到同请求重复 ID/name、task 内重复 condition name、陌生义务/condition 或无 runnable expansion 时给定位诊断；单个 authored request 有歧义时不输出其部分 plan，独立义务仍可保留为 partial。validator 拒绝同分支相反赋值、跨义务/陌生 ID、相同 assumptions 的重复或冲突 effect、超出 branch 上限、遗漏未显式列出、无缺失事实的 unknown，以及跨义务/悬空 fact pointer；合法 incomplete 可以显式保留未分析条件。无 request 返回 `not-requested`，不改变旧任务。红态为缺失模块；实现后条件聚焦 11/11、授权全套 144/144（860 assertions）及 typecheck 通过。窄只读独立核验无 critical/important，未把 missingFacts 文字内容的语义判断错误塞给宿主。

**Y4 运行接线。** 失败测试先证明 renderer 没有 condition plan、wire/v3 不存在且 host 会把 v3 当作旧协议。实现后，三臂收到同一份不含答案的 condition plan，prompt 把 assumptions 明确标为 hypotheses；只有 ready condition request 才选择 strict wire/v3，canonical v0 和 relation coverage 保持原结构，未启用任务继续 v1/v2。host 将 initial/repair 的 condition sidecar 与机械 validation 分开保存；跨义务 condition ID 和 canonical fact pointer 会沿用一次 diagnostics-only repair，最终语义支持仍为 `unreviewed`，生成时不读 evaluator。聚焦35/35（318 assertions）、授权全套148/148（903 assertions）与typecheck通过；未调用真实provider或目标。

**Y5 编写规范化。** `authorization-assessment-authoring/v1`只保留task、sourceRoot、sources及可选profile/condition request；normalizer从task唯一派生sourceIdentity，物化现有`authorization-core-v1`六类问题并标`derived`，task-supplied requirements则原样保留。缺policy或obligation expectation集中返回带path/fix的needs-input，不从源码或模板猜allow/deny；普通loader继续负责同一sourceRoot、portable path、symlink/junction和声明位置边界，并验证默认profile未漂移。一次红测还发现修改实体ID后会同时产生3个真正悬空引用和6个下游profile噪声，修复为task未ready时停止派生检查，只报可操作根因。replay artifact从未改写的synthetic authoring克隆出22个主体/资源/关系/入口/条件等字段变化，三次check为ready→3 dangling references→ready；provider/目标执行/真人参与均为0，不声称人工时间或节省。聚焦6/6（62 assertions）、授权全套154/154（965 assertions）和typecheck通过。

**Y6 顶层CLI。** `skvm authorization init/check/run/inspect`只作现有authoring、local input/run、host与inspect的薄路由：init写synthetic例子或同目录`--from`规范化且不覆盖；check/inspect零provider；run省略arm仍为B并总建新session。condition request存在时才把condition plan送入preview/host并保存sidecar/validation，未提供继续ledger/v2。临时普通目录覆盖template+source后check valid、父级sourceRoot拒绝、两次mock run生成不同session、inspect无新增调用。真实source help/check通过；Node shim首次因Windows npm只暴露bun.cmd而选择不存在的bun.exe，新增红测后解析其`node_modules/bun/bin/bun.exe`，shim help通过。相关回归165/165（1018 assertions）和typecheck通过；remote provider、目标、oracle均为0，不声称npm已发布。

**Y7 研究接线与冻结。** 新`authorization-value-study-experiment/v1`把`studyArm=P|L|C`与历史`renderArm=N|B|D`分开，所有研究单元固定`renderArm=B`。P使用自然化完整声明、与L/C逐字相同的公共问题及基础wire/v1，不把已编译ledger、coverage或condition sidecar放进模型上下文或结果；L使用ledger/wire-v2；C在L上增加answer-free condition plan和wire/v3。三者复用相同local host、source reader、repair与telemetry。研究摘要直接消费evaluator v2的语义review，分别保存结构诊断、first response、prompt fallback、repair、四类token、调用、时间和实际USD未知；C字段存在或空结构不会覆盖缺失的语义评价。首个测试先因`value-study.ts`不存在失败；核心五项测试（59 assertions）和render/host/local/value聚焦回归37/37（389 assertions）通过。实现固定为`4524bfe25ec4c8cc66948872609f05f56c91512e`，随后冻结原五任务各P/L/C一次共15单元，轮换为P-L-C、L-C-P、C-P-L、P-L-C、L-C-P，config SHA-256为`b0aa6278...7140b`。provider-free check得到5 cases、15 units、0 diagnostics；exact config临时副本的15单元机械mock全部completed，评价路径用空占位且未进入任何prompt，remote provider与目标执行仍为0。新鲜授权全套160/160（1079 assertions）及typecheck通过。该mock只证明路由、transport、持久化和恢复，不是质量或成本证据；Y8才运行真实provider。

**Y8 冻结真实开发面板。** 在未改变Y7配置、顺序或预算的情况下，`xty/gpt-5.6-sol`完成五任务P/L/C各一次，15/15为completed，没有timeout、completion-unknown或terminal failure，也没有目标执行。25次provider调用由17次schema-tool和8次prompt-parse组成，trusted-header的L、C各使用一次diagnostics-only domain repair；P/L/C调用分别为6/8/11。已知token合计input 122,593、output 56,192、cache-read 10,368、cache-write 0；P为19,623/8,427/0，L为38,522/16,950/4,480，C为64,448/30,815/5,888。25次usage均完整，但provider均未返回费用，已知USD小计0不代表免费，总额继续为unknown。初轮身份、失败transport与repair都保留在分母；本记录只冻结生成和运行负担，不在读取evaluator前判断质量，也不允许后续review改写原始答案。

**Y9 离线评价与候选。** 全部生成关闭后才读取 evaluator-only rubric。15/15 结论、必要语义、task decision、scope 和 review binding 均正确；12项 full-success，trusted-header 的三项均因解释细节为 partial，没有 incorrect、unsupported deployment claim 或 needs-review。三个匿名候选的独立只读复核确认必要决策无差异，只有带有界 condition branches 的候选明确区分 closed gate、failed authentication、trusted-proxy-safe 与 attacker-header-reachable；它还严格确认“forbidden error”不等于答案显式写出 HTTP 403，“may be unset”不等于显式写出默认 None。独立packet漏录P答案的一条 environment-controlled fact，导致一项 supported/missing 分歧；分歧和身份均保留，最终按完整 hash-bound 答案位置维持 supported。未发现需要重跑模型的共享生成合同/实现缺陷，追加单元为0。

评价实现先用红测补上两处边界：review answer pointer可指向同一hash-bound wire中的coverage/condition sidecar；候选选择按缺失的解释 criterion 数量比较，而不是把所有partial单元压成同一个计数。最终P/L/C均为5/5结论和必要语义正确；解释缺口分别为2/2/1，因此按预定次序选择C用于有限迁移比较。这个增量只来自trusted-header条件枚举；C同时使用11次调用和101,151 known tokens，L为8次和59,952，P为6次和28,050。故当前是一个窄条件完整性增益及明显运行开销取舍，不改变ordinary默认B/L，C仍为opt-in。离线replay以0模型调用、0目标执行重现summary SHA-256 `41fd0b9...b45c`，实际USD继续unknown。

**Y10 读取新项目之前的方法冻结。** 提交`76b1c13a`之后、读取任何候选源码/README/政策正文之前，机器记录固定C为结构化迁移候选，ordinary默认仍为B/ledger，迁移只用`authorization-core-v1`而禁止task-specific requirements。每任务P/C各两次fresh context，第二次反序；零基偶数任务P-C/C-P，奇数任务C-P/P-C。正常三任务12单元，只有两项合格则8单元，不替换失败任务或单元。metadata-only候选顺序为Gitea、Vikunja、Memos；按公开非归档、非既有项目fork、许可、固定commit，再按政策依据、authorization entry、至少两种权限关系和可封闭源码筛选，遇首个合格即停止，不能按答案难度或标签组合换项目。该迁移是method-fixed development evidence，不冒充旧受保护held-out。

**Y10 第三项目获取与任务冻结。** 首个候选`go-gitea/gitea@fc28937a8d772fe9e4025c9b5f24d5db4d86610b`满足公开、非fork/归档、MIT许可、固定源码、显式403/role gate、公开integration evidence与至少三种可封闭权限关系，故按first-eligible规则纳入并停止查看Vikunja/Memos。首次partial-clone blob hydration缺LICENSE与`issue_lock.go`，保留该retryable错误后对同一ref作unfiltered fetch成功，未换项目或输入。三任务依次是：read collaborator跨用户读取另一协作者权限（self/repo-admin/site-admin例外）、有issue-write token scope但无repository issue-write时添加assignee、已有repository issue-write但无repo/site admin时锁issue；三者都固定deny expectation，不为了标签平衡改样本。作者输入、七个模型可见source snapshot、三个normalized assessment与evaluator-only oracle/rubric物理分开；六段Go snapshot经换行归一后逐行等于fixed commit，公开integration test只进入evaluator evidence。三个普通`authorization init --from`均派生`authorization-core-v1`六类问题，task v0要求的两条`requiredAnalysis`在三任务逐字相同而非task-specific清单；`authorization check`均为valid、1 condition plan、0 diagnostics。首次init真实暴露缺`task.requiredAnalysis`，补共享泛化文本；随后作者复核移除源码crop未直接表达的assignability条件并重新规范化，不以模型结果调题。assessment的sourceRef provenance保持`authored`，git固定ref核验证据只在acquisition记录中写verified。项目/任务选择确含开发代理专业判断，真人参与/时间节省主张、provider调用、目标/部署执行与保护集读取均为0；18项criterion已在Y11生成前冻结。

**Y11 迁移运行器兼容。** Y7 的 experiment/v1 语义继续固定为每例各一次 P/L/C，既有配置、结果和重放不改。新增 experiment/v2 只用于方法固定后的普通输入迁移：case 引用现成 `authorization-assessment-input/v1`，同时冻结 source root/list；unit 显式保存 P/C、重复序号和 P-C/C-P 顺序，检查器要求每个重复恰好各一臂并强制第二次反序。运行前把 normalized assessment 与准确源码物化到 run root，确认 `authorization-core-v1` 和 condition request，再逐单元复用同一个 `executeLocalAuthorizationRun`，因此每次仍创建 immutable fresh session，host、repair、telemetry 和恢复语义没有第二条实现。生成期只验证 evaluator 路径存在，不读取其内容。红态为 v2 export 缺失；实现后 v1/v2、评价与本地入口聚焦回归 15/15（194 assertions）及 typecheck 通过，远端 provider 和目标执行仍为0。

首次对 v2 结果作离线汇总时还暴露一个评价器边界：候选选择器原先假定 L/C 都有样本，因而把本轮零单元的 L 当成“零缺口、零成本”赢家。新增红测稳定复现后，选择器改为零单元候选不得参与比较；恰有一个已观察候选时以 `only-observed-candidate` 记录依据，两个都不存在则拒绝生成无意义结论。v1 的 L/C 正常比较不变，v2 现在只把实际观察的 C 与 P 比较。授权 DSL 全套 86/86（754 assertions）和 typecheck 通过。

**Y11 迁移生成冻结。** 绑定实现`d1afddc8`与配置SHA `b5477832...88bfa`的三任务12单元全部completed，12个session互异；没有timeout、completion-unknown、terminal failure、domain repair或目标执行。20次provider调用由12次schema-tool和8次prompt-parse组成；P为8次调用、known input/output/cache-read `20,211/9,982/7,296`，C为12次、`41,202/34,365/34,176`，合计`61,413/44,347/41,472`，cache-write为0。20次usage完整但费用均未报告，actual USD继续unknown。生成关闭前没有读取evaluator内容，全部首答/fallback与初轮身份保持原样；本记录尚不作语义质量判断。

**Y11 迁移评价与变化输入。** 冻结生成后才读取rubric/oracle并物化hash-bound review。12/12结论、semantic/task decision、scope、transport与delivery正确；8项full、4项partial。collaborator和assignee各四项全部full；lock四项都正确区分route admin gate、writer gate与lock effect，但只写forbidden/denied/rejected，没有答案级明确写`HTTP 403`，因而同时缺一项necessary和一项explanation criterion。P/C各为4 full、2 partial、2个解释缺口，未观察到C的决定、必要语义或条件完整性增量；C却使用12比8次调用、109,743比37,489 known tokens及919,329比388,763毫秒。独立只读复核同意统一HTTP状态遗漏，另对assignee-P和lock-P各一项condition outcome判missing；主评审按完整答案的control/effect/condition连接位置维持supported，并保留分歧。

该重复lock遗漏不足以证明共享生成合同/实现缺陷：同一冻结合同在另外两例稳定产出显式HTTP 403，事后加lock专属提示会泄入评价知识，因此追加provider单元为0。真正发现的共享实现缺陷是离线选择器把零样本L当成零缺口赢家；以红测修复为零样本候选不参与比较，随后0-call replay重现summary SHA `66dfb36...946`。另将collaborator任务从different-user/deny改成self-query/allow，保持固定Go代码字节不变；普通authoring init/check仍valid、默认六项profile不变，declaration及P/C prompt SHA均确定性变化，且不新增模型单元。可表示性在三种权限关系上成立，但编写仍需专业项目/源码/关系/政策/条件/evaluator选择；没有真人时间或节省证据。ordinary默认继续B/L，C保留opt-in而不扩为默认。

**Y12 能力与实际价值判定。** 最终判定为`mixed`，而不是“结构可运行即整体正向”。默认profile迁移在三种Gitea权限关系上无需task-specific analysis requirements，12/12最终决策正确，证明有界表示和同一执行链可以迁移；但lock这一任务的两臂两次重复都漏答案级HTTP 403，所以必要语义只有8/12，不能称一致full。P/C各4 full、2 partial且解释缺口相同，C在迁移中没有质量增益，却为1.5倍调用、2.93倍known tokens、2.36倍known time。逐任务也都是质量持平且C更贵，不是平均数掩盖的结论。

条件层唯一正向证据仍是Y9 trusted-header的一项预定条件结果枚举，且没有观察到决定性质量退化；但它未转移到本轮三任务并伴随明显运行负担，所以只构成局部正向与总体取舍。共同declaration/helper在ordinary authoring、source/path绑定、共享profile、immutable session、结构校验、telemetry、hash-bound review与离线replay上建立工程价值；两个面板共27个观察单元的决策全对，但P共享大部分底层支持且没有unsupported-platform control，不能把正确率因果归给DSL。authoring自动派生sourceIdentity与六项requirements，却仍需专业选择项目、七份source snapshot、三种关系/expectation、16项条件、8项binding和18项evaluator criterion；未测真人时间，不声称节省。故ordinary继续默认B/L；C只在交付物明确需要有界条件分支时opt-in，停止默认扩展及额外推理/复核调用。八个task definition、重复与三个项目都不计作八个独立skill来源；本轮仍是development证据。

**Y13 统一复盘与有限验证。** 问题是工程入口已经形成、Y11迁移和Y12价值结论已经冻结，但使用说明仍缺条件层的证据化选择规则，开发指南仍把顶层命令误写成非产品CLI，状态页也停在迁移评价之前。证据是开发面板只有一项条件枚举增量，而Gitea迁移P/C质量持平且C使用1.5倍调用、2.93倍known tokens和2.36倍known time。修改因此只同步usage、developer guide、current status、plan/spec、任务书和唯一机器summary，不改运行合同、不新增模型调用。新鲜验证为授权/benchmark/CLI共167项测试、1137 assertions全过，typecheck通过，源码入口help、示例check和Node shim help均成功；迁移config check为3 cases/12 units/0 diagnostics，0-call replay重现SHA `66dfb36...946`；文档测试12/12，治理扫描10,628文件且0 broken/legacy/governance error；本轮结果树416个JSON和54个JSONL中的171条记录全部解析，敏感信息定向扫描0命中。影响是工程交付可发布，但研究结论仍为`mixed`、actual USD仍unknown、保护输入和目标执行仍为0；ordinary固定B/L、C明确opt-in，验证不构成新的质量样本或默认升级依据。

**公平比较。** P是信息齐全的普通说明及基础引用/计量；L增加默认领域ledger/coverage；C再加条件层。三者共享业务事实、公开分析要求、源码、模型和修复机会，协议差异和成本显式记录。共同评价接受P的等价文字分析，不因缺少专用字段扣语义分。本轮评估表达与运行支持组合，不把效果单独归因于JSON语法。原五任务开发面板15单元；最多6修订单元。方法固定后再读取第三项目正文，用默认profile而非任务专属问题清单，P与选定结构化方法在2–3任务上各两次重复，正常12单元。选择先看必要质量，再看条件完整性、成本和编写负担；C无增量就保留L。

**编写与交付。** 新authoring输入复用现有task，派生重复sourceIdentity/default requirements；缺政策与expectation集中报needs-input，不猜测填充。`skvm authorization init/check/run/inspect`复用现有宿主，init示例明确synthetic，普通输入保留作者来源，只有run调用模型。method与历史N/B/D分开，默认ledger/B，条件层opt-in。新项目来源独立选择，不读取旧保护集；首次迁移后修方法时保留首次结果，后续记development。允许工程完成而效果mixed/negative，按缺项而非阶段终态数判交付。

**研究问题与开发复盘。** Y期间继续在本节补充实际条件合同、默认profile失配、编写负担与比较结论，§12只写短记录；机器材料进入`development/authorization-transfer-value-v1/`。不另建每轮设计正文或重复历史审计。

### 7.23 Z 输出减负与实际使用

2026-09-22用户要求制定并派发下一轮，开发线程用`gpt-6-astra / medium`。当前任务书为[Z0–Z12](../superpowers/plans/2026-09-22-authorization-dsl-protocol-and-usability.md)，被测模型仍用既有Sol路线独立配置。本节登记设计和复核依据，尚无Z实验结果。

**复核证据。** `authorization check --method=plain`实际返回Unknown option，Y承诺的公共method仅有研究内部P/L/C路径。六个Gitea C首答按当前wire/v3离线重放全部失败：4项缺facts.condition，2项conditionAnalysis写成数组，2项版本字段错误，其中一项还重复嵌套/缺branches。均随后重新请求原任务；失败schema-tool合计47,330 known tokens，成功fallback合计62,413，P总量37,489。这些合计含cache、不是美元权重。源码级根因须再核模型可见schema与本地Zod，不能仅据失败归咎模型。lock的正确拒绝被因HTTP403未显式书写同时扣necessary/explanation，也应与真正权限推理错误分开。

**方法与工程选择。** 停止默认增加分析层，先补公共plain/ledger/conditions解析；省略参数兼容Y有request启用条件、无request走ledger的行为，显式选项及冲突均有预览和provider前诊断。wire/v4尽量只让模型输出事实/关系/判断，固定版本、任务身份、分组及重复包装由宿主生成；fact ID在义务内绑定，旧canonical和语义检查复用。不得自动猜结论或伪造事实，旧wire失败保持失败；schema层省字段只减少机械负担。

**比较与试用。** 先对齐新评价：授权决策、决定性控制、条件解释、协议响应细节分别报告；旧rubric只读，重评分变化不当新方法收益。已暴露的header及三个Gitea任务旧/new条件wire各一次，共8单元，同事实/模型/预算/修复机会；一次明确共享修订最多4单元。另完成collaborator原任务与self-query变化任务各一次普通run，观察真正答案变化。作者优先真实外部使用者，无人时干净上下文代理，只给usage与任务/源码/政策；记录草稿、check、修改和参与者身份，不声称真人节省。正常10单元、至多14，不新增目标项目或保护输入。

**交付与解释。** 首答schema/交付率、最终质量、fallback/repair、分字段token/cache、耗时及作者步骤共同判断。传输改善如实写为协议/运行减负；新wire没有收益就保持可选，不把工程完成写成DSL优于普通说明。Z期间把每个实际问题和解决记录在本节；机器材料统一进入`development/authorization-protocol-usability-v1/`。

## 8. 技术文档本地化候选：已设计到哪里

以下为 D 阶段候选设计的完整要点，**暂缓实施，不作为所有类别的统一设计**。

### 8.1 作者、运行时与评审分工

- 作者声明任务要求、源/目标语言、显式输入/输出、保护种类、术语/注释、歧义/覆盖/评审策略和来源；迁移场景带义务账本。
- 运行时提供严格解析、路径解析、源快照、单元/保护清单、上下文、结果检查、回填、暂存与发布。
- 模型只返回按 unit ID 对应的翻译/保持/问题，不返回命令、写文件路径或发布决定。
- 语义评审判断意思、流畅性、术语等；结构检查不能自行产生 acceptable 结论。

旧拟议作者文件为 `technical-document-localization.json`，版本 `technical-document-localization/v0`。核心分组为 `task`、`input`、`targets`、`protection`、`policies`、`provenance`。首版只接受一个 UTF-8 Markdown 与一个 locale 目标；选择规则和必要检查固定于 profile，不让用户声明没有实现的 checker。具体旧类型和签名留在证据索引中的交接原件；若候选重新入选，应先解决本节后的反例，再更新设计。

### 8.2 表示与约束

原始 snapshot 是回填依据；AST 只选择与定位。单元身份结合文档、源版本、位置与出现序号，重复文字不共用身份。按倒序替换坐标，未修改区域从原文复制。

保护不仅有“文本一样”，还区分字节/字符、次数、所属单元、顺序与结构关系。命名占位符与位置参数不能默认采用同一重排规则；零保护项为 not-applicable。选择结果被完整返回，不等于选择器找到了所有应翻译内容。

D 首版考虑 CommonMark/GFM、简单 YAML frontmatter、标题、段落、列表、引用、表格和链接文字；代码、图片、链接目标等保留。复杂 YAML、HTML/MDX、应用 AST 改写、Law/OCR、完整 XLIFF、多目标事务等不在首版。ICU 探针存在，但尚无合适声明绑定，因此未纳入作者界面。

### 8.3 生命周期与结果

候选顺序为 resolve/preflight → extract/render → model → validate/refill/check → review → stage/publish。任务状态、执行状态、检查状态、语义评审和发布状态分别记录。无人值守的 ask 返回 needs-input；模型自称完成不授权发布。

既有 `executeRun` 没有统一的本地化后置检查与发布接口；旧交接提出只在现有 CLI 加 opt-in 路由并保留普通路径，**从未要求重建完整 CLI**。是否采用该接法，在范围与消费方式重新确认后决定；也可以先用现有函数验证方法。

## 9. 探针结果与复核问题

### 9.1 已有证据

D5–D8 四组探针共 45 项测试、126 项断言，严格类型检查通过；交付后复跑结果相同。内容包括重复/跨文档身份、源变化、token 所属、链接/frontmatter、字节 round trip、部分失败、needs-input、源未变和受控发布。

探针对比表明：在所测 fixture 上，源坐标回填保持 no-change 字节，而 AST stringify 和简单整文重建不保持。该结论限于所测表示与内容；不能推出任意替换仍保持合法结构。

完整串联使用 stub agent 和测试 reviewer。真实模型消费、翻译质量、效果和跨环境均未证明。已有目标替换不提供跨文件事务或崩溃原子性。

### 9.2 交付后可复现反例

| 问题 | 观察 | 后续责任 |
|---|---|---|
| frontmatter 引号/值语法 | `description: "Hello"` 的值换为 `A: B`，得到无效 YAML，现有 constraints 仍 pass | 上下文相关编码与目标 YAML 检查 |
| 列表/引用结构逃逸 | 替换文字可新增列表项或让文字脱离引用，现有检查仍 pass | 明确允许的变化；目标重解析与结构关系检查 |
| 结构化调用计量 | mock 中 tool-use 失败再 fallback，实际 2 次调用、input 30/cost .03，返回仅 input 20/cost .02 | 区分生成、回退、领域修复，累计真实 usage；这是模拟值，不是付费记录 |
| 模型可用性判断不足 | registry 也支持 route.apiKey 与 override，不能仅凭无环境变量判无路由 | 使用配置解析判断可用性，不展示凭据 |

定位：[units.ts](../../results/skill-ir/dsl-semantics-readiness-20260920/probes/units.ts)、[constraints.ts](../../results/skill-ir/dsl-semantics-readiness-20260920/probes/constraints.ts)、[structured.ts](../../src/providers/structured.ts)、[registry.ts](../../src/providers/registry.ts)。这些问题说明未来实现需修正；本次合并不修改代码或旧实验记录。

## 10. 效果评价与工程复用

O 是原 skill，M 是信息相当的整理 Markdown，MH 是 Markdown 加相同 helper，DH 是声明加相同 helper。MH/DH 要同时控制工具能力、自动调用时机、修复机会与发布规则；否则只能解释整条方案差别，不能单独归因于 DSL。

正常任务完成、边界拒绝、结构正确、语义质量和使用开销分开报告。合法拒绝不等于所有任务成功，零单元也不是优化收益。收益可为质量、效率或修改/诊断体验，但应事先定义主要目标和允许代价。

D 曾提出两任务的小面板、“无需人工修复即可发布”的主指标和 20% token 代价边界。这些是当时本地化候选的实验提案，不是所有后续类别必须继承的门槛；换范围应在运行前重新论证。小样本 ceiling/tie/inconclusive/helper-only/tradeoff/negative 分开，不能靠选择指标把负向改成成功。

可复用基础包括：现有模型路由、自然任务入口、trace、输入快照、验证与产物工具。旧 IR、优化器 action、包导出流程不是新 DSL 的必经层。旧 I1–I5 为本地化候选的备用路线：解释层→领域核心→普通入口→对照→示例交付；当前不自动执行。

## 11. 当前问题表与决策记录

| ID | 待回答问题 | 影响层 | 现有证据/限制 | 下一动作 |
|---|---|---|---|---|
| Q1 | 哪类外部任务值得首先做领域方法？ | 影响选类 | 两个独立 skill 家族支持单 repo/ref、source-visible authorization/trust-boundary 切片 | 范围已定；原型不扩大到 full/diff/broad |
| Q2 | 成员共享领域含义还是流程外壳？ | 影响选类 | principal/resource/operation/control/evidence 可迁移；成员完整职责不能迁移 | v0 只保留 authorization-boundary；其他变体路由 |
| Q3 | 用户反复遇到什么问题？ | 影响选类 | Open WebUI 三个真实条件给出 positive/decoy/unknown；漏入口等变化另存 evaluator oracle | 原型先测 bounded decision/evidence/scope honesty，再决定跨项目 |
| Q4 | 配置、好说明或现成语言是否足够？ | 影响方法价值 | 配置可承载领域语言；当前没有独立表示收益假设 | 先测 B 与声明+支持 D 的整体方法；暂不建第二表示 |
| Q5 | 领域声明应怎样被消费？ | 影响方法价值 | 首轮选择 exact fixed context、zero model tools 与 structured call；明确不测 discovery | 下一轮只实现 experiment-only 最小路径，active discovery 后置 |
| Q6 | 如何实现不损失结构？ | 仅影响未来实现 | 存在回填反例 | 只有本地化重新入选时才补编码与结构检查 |
| Q7 | 如何评价且避免错误归因？ | 影响方法价值 | 四层评价、B/D 整体干预、abstention 与错误/开销指标已预定义 | 真实模型对照只回答运行未知；不把 helper 收益归因语法 |

决策沿革：

- **2026-09-19 / S：** 宽保存约束转换为主选，证据为结构卡与手工推演，收益未测。
- **2026-09-20 / D：** 宽范围降为共同运行模式，选窄本地化做代码探针，提出 I1–I5。
- **2026-09-20 / 复核：** 45 项测试复跑通过，同时新增结构与计量反例；缩小主张，不抹掉已完成工作。
- **2026-09-20 / 用户决定：** 暂缓 I1，先用外部任务重新检查类别；不预设本地化、不重建 CLI；本文件成为持续调研正文。
- **2026-09-20 / E8：** 宽安全 profile 未经住边界成员；收窄为只含 authorization-boundary 的实验表示，并将“现有配置 + 同一 helper”设为必须击败或至少显示不同收益的主对照。
- **2026-09-20 / T9：** 真实案例、oracle、coverage/evidence 与最小消费路径支持 `ready-with-bounded-questions`；首轮改为 organized B 对 domain-method D 的整体方法比较，第二表示和 active discovery 后置，旧 engineer-day 估算撤销。

## 12. 后续追加规则

1. 每轮研究直接更新本文件对应主题，不另建日期化 research-report、research-notes、semantic-design 或 review-and-decisions 作为新的结论正文。
2. 同时在本节末追加简短记录：日期、问题、新证据、结论变化、未决项、最窄证据位置。若推翻旧结论，改当前正文并保留决策沿革，不能只在末尾追加“覆盖上文”造成矛盾。
3. 新来源、任务卡、原始模型记录和探针等机器证据集中在 `results/skill-ir/skill-dsl-research/` 持续追加；运行分次标识用于区分证据，不另写一套叙述报告。只有真正需要重跑的脚本/fixtures 保留代码。
4. 新任务书仍放 plans，写要做的事，不复制结果正文。current-status 只写短状态和指针，plan 只写当前待办，spec 只写方法边界。
5. 与旧分类组件的分工：本文件承载 DSL 研究发现和选择理由；classification-and-routing 保留已有工程路由、合同与历史发放接口。
6. 本次新增一个长期研究职责，当前阅读集由 14 份增至 15 份；旧两轮结果 Markdown 保留为历史证据，不继续平行维护。单文档采用主题整合加简短追加，不无限粘贴重复摘要。
7. 开发阶段沿用本文件：记录可定位的问题、根因、解决、验证及方法变化；接口与使用说明随实现更新到 §7.19。执行状态和长日志留在机器文件，日常无方法影响的小修复可合并一条记录。

### 2026-09-20 合并记录

**当时状态（E 启动前）：** 合并 S/D 的目的、语料、分类、范围变化、标准、义务映射、候选语义、探针、评价与实现建议，并补入复核反例；当时 E0–E10 外部类别与 DSL 价值研究尚未执行。其后完成情况见下方 E0–E9 记录与本文当前结论。

### 2026-09-20 E0 恢复记录

以当前工作树重新读取状态、计划、spec 14.34、本文件和 E0–E10 任务书。I1 继续暂缓，本地化只保留为候选；D 阶段 45 项测试只证明所测定位、回填、约束和生命周期路径。本轮未知已按影响选类、影响 DSL 价值、仅影响未来实现分类，下一步从不同任务目的与来源家族制定外部发现路线，不用修复旧本地化代码代替研究。

### 2026-09-20 E1 外部发现记录

按结构化产物、证据审查、研究综合、状态化工具四条目的路线回到原始仓库和 issue，登记 26 个来源、12 个选入 skill 成员、11 个独立家族与 7 条方法观察；本地化仅为保留比较项。检索偏差、谱系合并、选入/排除和未执行外部代码均已显式记录。下一步 E2 为选入成员补齐必要依赖并写可还原的真实任务卡，不把正文摘要冒充完整依赖阅读。

### 2026-09-20 E2 真实任务与依赖记录

为 12 个选入成员写成可还原任务卡，明确输入、行为、产物、质量、领域对象、条件/约束/判断、交互、状态、错误和读取深度。安全审查、文献综合、表格和浏览器任务的关键依赖已补读；未选择的 target-specific 或 optional 依赖逐项保留为未读，不从摘要推断。任务卡进一步确认：相同工具不必同类（Playwright 可做探索、测试生成和证据捕获），相同“review”词也不必同类（多论文综合与单篇投稿评审对象和质量准则不同）。下一步 E3 查每个候选的实际改进问题及已有解决方案，并把 issue/测试/maintainer 示例与结构假设分开。

### 2026-09-20 E3 实际问题与现有解法记录

为五个候选补齐触发条件、影响、既有方案、证据强弱、结构假设和不能推出的结论，并增加单篇评审反例与跨候选边界。安全和文献综合显示的是义务/状态可追溯问题；workbook 与 browser 的问题同样真实，但现成领域语言已经很强；本地化只有一个独立外部成员。新增五条 DSL Builders issue 记录说明日期类型、构造与 I/O、内存、merge 性能和 auto-width 的真实边界，同时明确这些多为现有工具内部问题。下一步 E4 从成员推导约三个类别，不看 SkVM 复用成本，不用通用 workflow 外壳或无依据总分选赢家。

### 2026-09-20 E4 类别归纳与候选比较记录

从独立成员推导出有证据的源码安全评估、系统性学术证据综合、含公式 workbook 的语义构造与修复三个类别；分别固定共同目标/对象/操作/关系、变量、必须保留的成员差异、纳入排除、真实正例、近似反例、首版范围与输入样本。浏览器测试因 Playwright 已有可执行领域语言而转为负向对照，本地化因只有一个外部家族而降为后备。不使用加权总分，也不以 SkVM 现有 backend 或复用成本选类；E5 将删除通用流程词并用同一概念表达两个真实成员，检查共同语义是否仍成立。

### 2026-09-20 E5 领域语义压力测试记录

用同一词汇分别表达 Cloudflare/Trail of Bits、DeerFlow/ai-skill-scholar、Anthropic XLSX/DSL Builders，并逐概念登记来源、含义、可变范围及行为/结果影响。删除 read/model/tool/check/write 后，安全仍剩 obligation/evidence/verification/verdict/coverage，文献仍剩 corpus/screen/read status/paper evidence/synthesis relation，workbook 仍剩 typed cell/formula dependency/preservation/materialized state/postcondition。skill scanner、单篇 peer review、flat CSV 均拒绝或分流，不靠 arbitrary instructions 吸收。安全与文献进入 E6；workbook 类别成立，但默认假设应是现有领域语言加薄配置已经足够。

### 2026-09-20 E6 DSL 与替代方案比较记录

以完全相同的任务、输入、helper 和验证机会，分别写成整理 Markdown、现有格式/配置+helper、closed candidate profile，并做需求变化演练。SARIF 已负责静态分析 result/location/codeFlow/baseline/provenance/fix，不负责 pre-run security obligation/fresh verifier/unknown denominator；安全方向只保留编译到 ledger/SARIF 的 thin profile 候选。PRISMA、structured session 与 CSL/template 已覆盖文献 protocol/state/citation，统一 profile 不足以成为默认实现。变更演练只证明 cross-reference/staleness 可检查，不声称人工省时。下一步 E7 比较安全声明的 direct read/render/interpreter 消费及最小 SkVM 接入。

### 2026-09-20 E7 消费方式与接口核对记录

比较 raw direct read、bounded render 和 interpreter-led 三种消费：direct read 只作基线；选择 strict parse、deterministic coverage expansion、bounded skill render、ordinary agent 和 post-validation；完整 audit interpreter 因过早复制调度/sandbox/merge 而暂拒。职责拆成 deterministic profile rules、agent security judgment、host tool isolation、independent semantic evaluation。只读核对现有 skill loader、executeRun、adapter、provider/structured extraction、RunResult/evaluator、snapshot/manifest/trace；可复用通用生命周期，但 bare-agent 固定暴露 write/command/web 且无 per-run allowlist，source-only/no-network 不能冒充 host 保证。下一步 E8 用反例和独立阅读挑战该推荐。

### 2026-09-20 E8 反例与独立复核记录

用 GitHub broad review、Trail of Bits diff review、review-and-fix 混合任务和固定 CodeQL query suite 挑战 thin security profile；前两者暴露不同领域关系，混合任务暴露 mutation 边界，CodeQL 证明现成工具充分的排除项。独立只读复核确认三项 Material：当前模型只覆盖 authorization-boundary、对配置的增量未证明、SARIF/外部事实/patch 能力边界需拆开；两项 provenance/counting Minor 已处理。主张因此从 full/diff/broad 类别级 profile 收窄为 `source-authorization-assessment/v0-sketch` 的实验臂；E9 只设计公平配对评价和最小实现，不补搜材料或进入生产开发。

### 2026-09-20 E9 范围决定与最小工作包记录

推荐范围固定为单 repo/ref 的 source-visible authorization/trust-boundary assessment；当前方法默认是 schema-backed 配置、shared deterministic helper、audit ledger 与可选 SARIF，暂不推荐独立 DSL。补齐 admin-export 可读示例、service-account 变化和必须拒绝的 differential-review 示例；主要收益选 coverage honesty，质量 floor 同时约束 coverage、evidence/verifier、verdict、漏洞/decoy 与出域路由。公平对照固定 existing config 与 experimental profile 共用 helper/model/input/validator/repair，避免把 helper 收益算给 profile。下一轮仅做 3–5 engineer-day deterministic parity probe；read-only boundary 成立后才考虑另 2–4 engineer-day 的真实模型配对。停止条件优先选择配置、inconclusive 或 stop-both，不扩展成 CLI、解释器或生产系统。

### 2026-09-20 E10 验证与发布记录

机器证据、来源引用、成员/家族/task-card 分母、当前文档链接、governance 与 staged attribution 均 fresh 核验；独立完成审阅的两项 Important、两项 Minor 已修正，无 Critical。仓库扫描只保留一条 E0 已知历史断链，未新增断链。提交 `7552cd6` 只包含 `results/skill-ir/skill-dsl-research/` 八个新文件并已推送 `origin/skill-ir-aot`；共享 current-status/plan/spec、本研究正文和任务书在 E0 前已有 dirty/untracked 内容，故本地同步但未整文件提交。最终状态 `completed-with-open-questions`，没有真实模型运行、付费调用、生产代码、CLI 或 I1。

### 2026-09-20 T 任务书制定

用户同意针对 E 复核问题继续研究，新增 T0–T10 定向任务书。下一轮从同类职责、真实输入与答案、分母来源、整体方法/表示/一致性三类问题推进；不预设双表示或单纯 parity 验收，不扩大为新一轮泛分类。当前仅制定计划与同步入口，T 状态与案例材料尚未创建，未启动实现。

### 2026-09-20 T1 授权职责映射记录

回读两个固定提交及授权相关依赖后，用同一 source-only 单操作请求逐项映射 trigger、输入、principal/resource/operation、政策、trace、upstream control、verdict 和 result。两个来源支持共同授权语义，但 Cloudflare 的 coverage/unknown/独立复核与 GitHub 的 dependency/secret/report/patch 仍保留成员归属；Trail of Bits 的 diff/history/blast-radius 明确路由。新增两个 `T1-` observations，没有新增来源、运行外部项目、调用模型或修改生产代码。下一步 T2 将政策来源、可由源码发现的事实和必须保留的 unknown 写成领域规则。

### 2026-09-20 T2 授权语义与政策来源记录

定义了只覆盖本轮任务的 repository/ref、principal、operation、resource relation、condition、entry、policy source、control trace 和 task conclusion；没有扩成通用安全语言。用户/研究作者提供自然任务与其有权确定的政策，模型可以发现并提议源码对象/控制，宿主/评价者接受规范来源和解决冲突。当前实现只作 observation，源外决定性事实和政策冲突均保留 unknown。用同一 document-ownership 需求给出 JSON/YAML 数据与自然语言等价示例，明确它不是新语法、真实 fixture 或冻结 schema。下一步 T3 用真实源码、维护者修复/测试和独立 oracle 替换示例占位。

### 2026-09-20 T3 真实案例与 oracle 分离记录

固定 Open WebUI 提交 `841c9045`，建立三个真实条件：`process_file` 的 destination-KB write 缺口、`process_text` 已有 caller/shared write control 的误报反例，以及 trusted-header 依赖实际 env/proxy/ingress 的 unknown。输入与 oracle 分目录，manifest 精确列出每个 case 的允许文件并禁止部署父目录；修复提交、GHSA、期望答案和隐藏项只对 evaluator 可见。保留 Open WebUI 许可证；docs 许可证未解析，故不复制正文。新增 5 个 source、2 个 observation；没有目标执行、模型或付费调用。下一步 T4 用这些 case 演练 declared obligations、source discovery 和 evidence support 的不同失效方式。

### 2026-09-20 T4 覆盖分母与失效演练记录

把 accepted declared obligations、实际 source discovery 和逐结论 evidence support 分成三个分母与状态空间；给出“6 个声明已处置、7 个发现入口中 1 个待映射、4 supported/1 refuted/1 unknown”的可接受表述，禁止压成 complete/100%。在 evaluator-only `coverage-challenges.json` 中演练漏 `process_file`、漏 explicit write grantee、需求/声明冲突、相关 source ref 变化、政策变化、断裂 citation、源外事实继续缺失及无关 README 变化，逐项记录发现者、失效范围和可保留证据。固定上下文只评 bounded honesty；受限只读模式才评主动发现，不要求看不到输入的模型猜隐藏项。下一步 T5 固定语义判定者、独立性及 abstention 质量。

### 2026-09-20 T5 语义评价与 abstention 记录

固定 structure valid、evidence present、evidence support、task correct 四层判定及各自 host/rechecker/oracle evaluator，不让 schema pass、引用存在或第二模型同意替代真值。三个真实 case 保留严格参考答案和关键 trace；作者/发现者、semantic rechecker、experiment evaluator 分工，fresh context 只算程序分离，不虚构真人或错误独立。定义 false positive/negative、unsupported deployment/completeness 和 evidence decoration；正确 unknown 必须列条件路径与决定性缺口，all-unknown 在两个 source-decidable case 上失败。下一步 T6 将整体方法、额外作者表示和 deterministic parity 改写成可区分实验问题。

### 2026-09-20 T6 可区分实验问题记录

第一原型只比较 B（信息相当 organized instruction）与 D（最小领域声明及 obligation/evidence support），并明确这是整套 intervention bundle，不把 helper 差异归因给语法。额外 M/第二表示没有独立证据，暂不实现；只在出现漏 relation/stale ref 的作者问题后，才从同一自然需求做同 helper 的编写/修改比较。parity 仅在实际存在多入口时用 deterministic test 检查 normalization/behavior，等价可删冗余入口但不否定方法。三个真实 case 加两个 designed challenge 只支持 feasibility；预定义 task correctness、质量底线、错误、resolved fraction、调用/token/time/USD，并区分 support/tradeoff/no-difference/negative/inconclusive。旧 3–5 + 2–4 engineer-day 方案撤回，T9 按具体 slice 重估。下一步 T7 只读核对现有 SkVM 的最小消费路径。

### 2026-09-20 T7 最小消费与工具边界记录

只读核对 skill-loader、run、bare-agent、agent-loop、structured provider、agent-tools 和相关 types 后，第一 B/D prototype 选择宿主拼装 exact allowed inputs 的 fixed complete context，直接 structured provider、零工具；它测试判断/evidence/scope honesty，明确不测主动发现。后续 discovery 才用 `runAgentLoop` 加 canonical allowlist 的 list/read/search，工具端拒 write/command/web/path escape/target execution。现有 bare-agent 固定暴露 write/command/web 且缺 root-containment，不可用提示词伪装只读。另定位 structured fallback 会漏计先前失败 tool-use response 的 usage，下一实现需聚焦修复/包装计量，不在本轮改 provider。下一步 T8 在真实 case 上完整纸面走通并做独立只读核验。

### 2026-09-20 T8 纸面推演与独立核验记录

在真实 `process_file` case 上按自然需求→领域声明→coverage plan→source evidence→四层 conclusion 完整走通，并以 `process_text` upstream control、trusted-header external facts、T4 hidden omission 挑战。换 GitHub security-review 指导仍使用同一领域字段，Open-WebUI identifiers 只作 evidence；成员特有 guidance 保留，base/head 变化任务继续路由 differential review。独立 default-agent 只读核验 Critical 0、材料性更正 0，确认三项答案和 input/oracle isolation；网页行号提示经 exact ref API 重查后确认 manifest 范围。该核验不称人工审核，paper walkthrough 不称行为成功。下一步 T9 给出 ready/revise 决定和可直接写实现计划的最小原型范围。

### 2026-09-20 T9 方法就绪与最小实现决定记录

方法建议为 `ready-with-bounded-questions`，与尚待 T10 发布的任务状态分开。下一最小原型只含 canonical JSON declaration+B/D renderer、coverage/result contract、exact fixed-context zero-tool host、完整 telemetry+oracle evaluator；约十个首批失败测试来自真实 positive/decoy/unknown、hidden omission、evidence support 与 fallback 计量。领域语义、oracle 和隔离无需继续搜证；真实模型必须回答质量、错误和开销，后续 discovery/第二项目另立问题。旧 3–5 + 2–4 engineer-day 估算撤销，替换为可枚举模块、测试和测试通过后的六次 matched run，不给未测日历承诺；本轮不自动开发。

### 2026-09-20 T10 归并验证与发布准备记录

解析 15 个研究 JSON、40 条来源及 52 条既有 observation，确认 18 条 T1–T9 记录 ID 唯一；三个真实 case 的 8 个 exact input 与 5 个 evaluator-only 文件无交叉，关键 source trace 均能在裁剪输入定位。文档链接单测 12/12 通过；纳入本轮 staged 文件后的 9,310 文件扫描为 broken/legacy/governance error 各 0，三条 `technical-document-localization` 旧引用只按精确 source/target 记为 retired；cached diff check 通过。独立 default-agent 交付审阅 Critical 0，指出的 output index 已补齐；该复核不是人工评审或效果证据。25 个归属文件已进入证据提交 `2118a7d`；current-status、plan、spec 三个 T0 前已 dirty 的共享文件只做本地同步，未吞入该提交。最终状态提交与 `origin/skill-ir-aot` 推送完成后，本轮停止，不自动启动原型。

### 2026-09-20 V 开发准备

用户确认进入开发，制定 V0–V10 实施任务书，明确 JSON 声明、义务展开、B/D renderer、结果/覆盖、精确输入、模型宿主、计量和逐事实评价的文件责任。核对现有 provider 与真实 task 字段后，增加实验子进程关闭 auto-probe、显式字段来源映射、trusted-header 入口条件修订和初始/修复结果分开记录。同步当前状态、plan/spec 与开发指南；没有创建运行状态、修改生产代码或发起模型实验。下一动作是 V0 恢复现场、V1 失败测试与领域 schema 实现。

### 2026-09-20 V0 开发现场

以 `50ca563` 且与 `origin/skill-ir-aot` 一致的普通 checkout 启动，保留 20 个既有 tracked 修改和 234 个 untracked porcelain entry；本轮只拥有新授权 DSL、benchmark、development 证据以及可重构的 V 文档块。Bun 1.3.14、Python 3.12.13 和文档检查入口可用；仓库本地 `.skvm` 中存在已配置的 `xty/*` openai-compatible route，真实实验将显式关闭 auto-probe 且不输出凭据。开发状态位于 `development/authorization-v0/status.json`，模型、付费调用和目标执行计数均为零。下一动作是 V1 strict schema 与语义解析红测试。

### 2026-09-20 V1 声明与语义解析

**V1-SEM-01。** 触发：accepted policy 的自由文本可说明规则，却不能让 renderer/validator 稳定区分规范期待是 allow、deny 还是 conditional。根因：任务书最初只列 relation/operation/conditions/policy reference，缺少义务级规范方向。处理：在 obligation 增加 closed `expectation`，保持当前实现 observation 与规范分离；任务书和本节字段表同步。验证：generic record fixture 的 accepted、conflicted、dangling、duplicate 和 empty-obligation 路径共 9 项测试、26 assertions 通过。方法变化：仍是同一 canonical JSON，不增加表示或案例分支。剩余：V2 renderer 必须把 expectation 与 policy 原文同时传入两臂。

**V1-DEV-02。** 触发：Bun 1.3.14 在 Windows 上把不带 `./` 的 test path 当 filter，首次命令未选中测试。根因：任务书命令缺显式相对路径前缀。处理：六处聚焦 test 命令统一加 `./`，随后红灯准确表现为缺少 schema/semantics 模块，再以最小实现转绿。验证：`bun test ./src/task-dsl/authorization/schema.test.ts ./src/task-dsl/authorization/semantics.test.ts` 为 9/9；这不是产品行为问题。剩余：后续所有新 test 命令沿用显式路径。

### 2026-09-20 V2 义务展开与 B/D 渲染

**V2-SEM-01。** 触发：同一 authored obligation 重复列出 entry 时，初版 compiler 产生两个相同 ID。根因：展开直接遍历数组，没有区分 authored duplicate 与独立 obligation。处理：每条 obligation 局部去重、保留 `duplicate-entry-reference` warning；全局 entry 数组仍以 ID 检查歧义。验证：重排、重复、追加 explicit-grantee relation、缺 principal role 和依赖 revision 红测转绿；领域目录为 17/17、86 assertions。方法变化：只展开作者显式 tuple，不引入笛卡尔积或自动关系发现。

**V2-RENDER-02。** B 与 D 从同一 `AuthorizationRenderFacts` 生成；逐项断言 repository/ref、自然请求、政策原文/接受理由、主体、资源、条件、scope、全部分析/约束和结论 enum 确实出现在两个 prompt，而不只存在 sidecar。三份真实 declaration preview 均为一项 runnable obligation、一个源码插槽；B 是 organized Markdown，D 额外显示 canonical facts、compiled plan、dependency/diagnostic state。差异属于整套领域支持，不归因于语法。剩余：实际模型是否利用这些组织差异由 V8 回答。

### 2026-09-20 V3 精确输入、声明与评价修订

**V3-INPUT-01。** 精确 reader 只接受 `inputs/` 下 portable allowlist path，先拒 absolute/parent，再以 realpath 拒 symlink/junction escape；缺文件返回诊断，不递归搜索或扩大目录。bundle 分开 crop-local 行号与 original locations，prompt 不含 oracle bytes。红灯为缺少 inputs 模块，最小实现后 6/6、54 assertions 通过，包含三份真实 manifest/declaration 集成。

**V3-AUTHOR-02。** 三份 declaration 由各自 task/source 可见事实编写，字段来源写入 `authoring-map.json`；没有 disposition、correctDisposition、GHSA 或 fix commit。测试最初错误禁止 `source_supported_failure/source_refuted` 字样，点验后确认这些是原 task 明示的允许结论 enum，故把检查收窄为真正答案字段/标识，保留用户可见 answer contract。方法边界不变：禁止答案泄漏，不禁止任务本身给出的结论集合。

**V3-ORACLE-03。** trusted-header 历史 oracle 漏掉 `ENABLE_PASSWORD_AUTH` 先行 403 和 `authenticate_user_by_email` 必须产出 user 才返回 session。T 原件不改；本轮 evaluator-only revision 新增 entry gate、header gate、identity binding、authentication/session 条件，以及实际配置、ingress/proxy 和 deployed auth outcome 缺口，并加入 control-disabled/auth-failed 反例。expected disposition 仍为 `unknown`；变化只提高条件 trace 与评分要求，不向生成或 repair 暴露。

### 2026-09-20 V4 结果、证据与变化状态

**V4-RESULT-01。** 触发：单一 pass/fail 会把“返回了答案”“引用存在”“引用支持”和“全范围完成”混在一起。处理：新增 strict `AuthorizationResultV0` 与 validation envelope，分列 declared/discovery/evidence presence/evidence support/completeness；missing/duplicate/foreign obligation、ref mismatch、越界/错 quote、缺 fact group、无内容 unknown 和 repository-complete 各有独立 diagnostic。验证：10 项红测先失败于缺 result 模块，最小实现后 10/10、33 assertions；领域全套 27/27、119 assertions。方法变化：deterministic host 只把 citation 判为 present/invalid，semantic support 初始永远 `unreviewed`。

**V4-CHANGE-02。** 相关 source digest、policy 内容/revision/status 或 obligation semantics 改变均标 `needs-review`；仅 source ref 改变且所有 bounded dependencies 相同，也必须先有宿主记录的 entry-universe-unchanged reuse basis 才能标 `reusable`。旧 parsed result/ref 原样保留。空 obligation 分母给 `needs-input` 和 null completion，不产生 100%。剩余：V5 host 需把这些机械 diagnostics 用作有界 repair，而不能把 oracle 或 semantic review 注入修复。

### 2026-09-20 V5 固定上下文宿主与逐次计量

**V5-HOST-01。** mock 红测先失败于缺少 telemetry/host 模块；实现后，宿主只暴露不执行的 `submit_authorization_result` schema tool，统一附加一次 exact source，检查 task/bundle repository/ref/mode，并仅把 actionable 机械 diagnostics 连同原可见输入送入至多一次 domain repair。初始与修复结果分别保留；未知工具名作为 protocol failure，不进入 tool-result continuation。无响应 timeout 保留 pending attempt，返回 `timeout-unknown` 且不重发。

**V5-TELEMETRY-02。** 每个底层 `provider.complete` 在调用前建 attempt，schema tool 无调用而 fallback 成功会保留两条 response；无响应异常保留 error 与 unknown usage/cost，缺一个 USD 时总 actual USD 为 null、已知小计仍保存。原始生成文本、tool arguments、tokens、duration 和 stop reason 保留，常见 authorization/token/secret 值在持久化副本中遮蔽；provider 内部重试次数不可见，明确记为 unknown，不伪造计数。

**V5-SCHEMA-03。** 触发：实际发送 schema 的测试发现 citation 使用 `superRefine` 后，现有 Zod→JSON Schema 转换器把嵌套 citation 退化为空对象。根因是通用转换器不展开 `ZodEffects`。处理：不扩大共享 provider 变更；结果 citation 保持普通 strict object，使 path/startLine/endLine/quote 全部进入模型 schema，`endLine >= startLine` 仍由已有 deterministic validator 检查并产生 `citation-out-of-range`。验证：host/telemetry 加领域全套 36/36、155 assertions，`bun run typecheck` 退出 0。方法边界不变，模型/付费/目标调用仍为零；剩余是 V6 语义 review 与 V7 实验入口。

### 2026-09-20 V6 语义 review、质量判断与配对统计

**V6-REVIEW-01。** evaluator-only `rubrics.json` 把两个 base oracle 和 trusted-header revision 转为三个可验证 rubric；后者使用六项修订事实，expected disposition 仍为 unknown。review 必须逐项给 `supported/contradicted/missing/uncertain`、理由、answer JSON pointer、exact bundle source location 与 oracle rule，并绑定输出 attempt、raw-output digest 和 rubric version；missing 使用 null answer location，未解析/重复/陌生事实、失效 pointer、错误 source/rule/binding 均阻止程序给出语义结论。宿主 artifact 因此增加逻辑 generation 涉及的 provider attempt IDs 与实际输出 attempt ID，不改变调用。

**V6-SCORE-02。** 六种手写形状固定了语义边界：正确改述 full success；包含正确关键词但因果反转仍失败；漏上游 control、漏 entry gate、bare unknown 和 source-decidable all-unknown 均不能靠 schema/citation 得分。程序不匹配关键词，只消费人工填写的 development-agent review；把任一必要事实从 supported 改为 uncertain，会从 true 变为 needs-review/null，而不是暗自判真。`taskDecisionCorrect` 只有 label、全部关键事实、disposition support、scope honesty 和 deterministic checks 同时通过才为 true；partial/incorrect/needs-review 和 false-positive/negative、deployment inference、false completeness、evidence decoration、excessive abstention 分列。

**V6-AGG-03。** run summary 保留 initial/repair/final quality、两阶段 diagnostics、schema/fallback/domain-repair 次数、已知 token、已知 elapsed 小计、unknown duration、已知 USD 小计和 unknown total；pair summary 只计算 D−B 差值，不把未知费用改为零。红测先失败于 evaluator 不存在；最小实现后 benchmark+domain 为 47/47、228 assertions。类型检查随后捕获 mixed review status 数组被 TypeScript 扩成 `string[]`，根因点验后仅增加显式 union 类型，focused tests 与 typecheck 均转绿。模型、付费和目标执行仍为零；V7 负责入口与离线演练，V8 后才填写六份实际 review。

### 2026-09-20 V7 开发入口、恢复语义与离线演练

**V7-RUNNER-01。** `comparison-config.json` 在结果前固定 `xty/gpt-5.6-sol`、仓库本地 `.skvm` route、temperature 0、180000 ms timeout、6000 max output tokens、provider 未报告的 context limit、一次 domain repair、file→text→header 案例顺序和 B/D→D/B→B/D 臂顺序。run 在 lazy provider import/creation 前设置 `SKVM_AUTO_PROBE=0` 与 exact cache；help/check/evaluate/status 没有 provider factory 路径。每个单元先保存 config/declaration/source/prompt 与 dispatch，再调用宿主；存在 run.json 的终态或只有 dispatch 的 completion-unknown 均不自动重发，新尝试必须换 attempt 并写原因。

**V7-OFFLINE-02。** `check` 验证 manifest/source/ref、strict declaration、compiled obligation、rubric fact/obligation/source location、每 case 唯一 B/D，并输出声明、file list、诊断和六份 exact-source preview。注入 mock provider 的测试完成 6 单元 generation、同目录恢复 0 重发、显式 review、6 个 unit summary 和 3 个 pair summary；随后 CLI evaluate 证明不创建 provider。真实 `--help/check/status` 各以 0 退出，check diagnostics 为零；这一演练只证明接线，不是模型或方法效果证据。

**V7-INPUT-03。** 触发：check preview 同时显示 declaration entry 1–75 与 exact reader crop 1–74。根因是声明作者把终止换行当作可引用空行，reader 则按实际文本行计数；五个 source 文件均有同类差一。处理：加入 declaration location 必须落在 exact bundle 的 invariant，把五个 endLine 收敛为 74/44/52/13/62，并重生成 preview/check。验证：runner 红测先收到 75>74，最终领域+benchmark 全套 50/50、276 assertions 与 typecheck 通过。方法未改变，只消除模型可见允许范围与宿主引用验证的不一致；真实模型调用仍为零。

### 2026-09-20 V8 三组真实 B/D 生成与离线评价

**V8-RUN-01。** 触发：按冻结配置运行 file→text→trusted-header 六单元。结果：file B/D、text B、trusted-header D 完成；text D 在 schema response 后的 prompt fallback pending，trusted-header B 在首个 schema request pending，均于 180 秒截止并标记 `timeout-unknown`。处理：遵守 completion-unknown 不重发，保留两次失败及未知 usage/cost；其余生成全部结束后才读取 rubric。验证：index 记录四 completed、两 failed-terminal，所有六个目录均保留 dispatch、prompt、declaration、source bundle 与 run artifact；没有目标执行、网络搜索、oracle 暴露或替换案例。方法变化：三 pair 计划不变，但首轮 pair completeness 明确为 1/3，不能把单臂结果拼成三对。

**V8-REVIEW-02。** 触发：四个完成单元需要逐事实判定而机械 citation 合法性不足以证明语义。处理：填写八份绑定 actual attempt、raw-output SHA-256、rubric revision、answer pointer、exact source location 与 oracle rule 的 development-agent review；两个 timeout 单元不造 answer/review。file 与 text 完成答案的关键事实均有源码支持；trusted-header D 正确保持 deployment unknown，但没有完整陈述 authentication failure 不发 session，也未列齐 control-disabled、auth-failed、safe-proxy、attacker-header-reachable 四个条件结果，相关两项记 missing。验证：离线 evaluator 接受全部绑定 review，得到 file B partial/D full-success、text B full-success、trusted-header D partial，整体按缺两臂保持 incomplete。

**V8-FAILURE-03。** 触发：四个 completed initial outputs 中三个使用 authored obligation ID，而 contract 要求 expanded `author::entry` ID；三者因此同时出现 foreign/missing-obligation diagnostics。另有三个初始答案和两个修复答案出现 citation-text mismatch，修复后的 trusted-header D 还保留上述两项语义遗漏。根因：前者是 arm-neutral 输出合同没有把 exact runnable output IDs 列成显式闭集；citation 问题来自模型给出与 crop 不完全一致的行/quote；trusted-header 缺口属于模型条件推理。下一步：V9 先用红测试修 exact-ID 共享接口，只选择一个受影响案例做独立 B/D revision；不按案例注入答案，不把模型推理或 timeout 伪装成 renderer 缺陷。

### 2026-09-21 V9 共享 exact-ID 修订与一次受影响配对

**V9-ID-01。** 触发：首轮三个 completed initial outputs 使用 authored ID，domain repair 才改成 expanded ID。根因：shared result contract 没有列出输出键闭集；D 的 compiled plan 虽含 expanded ID，也仍出现同类错误，说明自然语言合同优先级不足。处理：红测试先证明 B/D contract 均缺 exact list，再由 renderer 从 compiled runnable obligations 生成共同 closed list，并明确禁止 authored/omitted/foreign ID。验证：红测试按预期失败；实现后 focused authorization suite 51/51、284 assertions，revision config 离线 valid；两臂首个 schema response 均使用 exact expanded ID。方法变化：只增强共同输出合同，不改变事实、结论、oracle、输入或两臂方法差异。

**V9-RUN-02。** 仅按运行前记录追加 file B/D revision。B schema response 使用正确 ID，但缺必填数组且在 `results` 混入字符串；fallback 在 180 秒 pending，保留 `timeout-unknown`。D 使用正确 ID，initial 因八项 citation-text mismatch 为 partial，一次 diagnostics-only repair 后 full-success。四次 provider call 中三次有 response、一次 usage/completion unknown；已知 10,612 input、5,187 output tokens，actual USD 总额 unknown。修订 pair 不完整，未与首轮拼接。剩余问题按层归属：schema/fallback 是 transport，citation 是证据表达，trusted-header 事实遗漏是条件推理，timeout 是 completion unknown；本轮不再追加调用。

**V9-NEXT-03。** 下一轮选择“先简化领域支持”，不是增加入口发现或直接迁移第二项目。最小实现应在现有 fixed-context file/text 任务上减少结论明确时的非必要观察字段、让 schema tool/fallback 接受同一窄形状，并设计能由宿主可靠核验的 citation 表达；以无 repair 完成率和 completion-unknown 率作为门槛。理由是本轮 18 次 provider call 中有 3 次 pending-at-timeout，已完成答案又普遍依赖 citation repair，扩大入口/项目会先放大成本而不是检验领域收益。

### 2026-09-21 V10 离线复验、工程收口与独立复核

**V10-REPLAY-01。** 用归档声明、exact source bundle、模型回答和既有 hash-bound semantic review 重跑 parse、compile、validate 与 summary；所有 compiled/validation 对照一致，两份 evaluation-summary digest 不变，记录为 `reproduced`。这次复验没有 provider call、目标执行或新语义判断，也没有把已有 review 冒充重评。

**V10-VERIFY-02。** 新鲜验证为 authorization 51/51、284 assertions，主 typecheck 通过，文档单测 12/12，链接/治理检查无 broken、legacy 或 governance error，94 份 authorization-v0 JSON 全部可解析。独立只读复核未发现 critical defect 或凭据材料，确认 exact-ID 改动由共同 compiled obligations 生成、两臂一致；其指出的状态/checklist 收口已在发布流程中处理。

**V10-DELIVERY-03。** 交付范围限定为 development-only canonical declaration、compiler、B/D renderer、fixed-context zero-executable-tool host、validator/change state、逐调用计量、hash-bound review、evaluator 与可恢复 runner；不包含生产 CLI、入口发现、target execution、patch、held-out 或跨项目主张。工程状态为 `completed-development`，比较状态仍为 incomplete/effectiveness `not-established`。八个 V 归属提交已通过 `ff5a98a` 推送 `origin/skill-ir-aot`，既有脏工作树未清理或吞并。下一轮最小实现只收窄 schema/fallback 与 citation transport，并在原 fixed-context 案例测无 repair completion 和 completion-known rate。

### 2026-09-21 V 二次复核与 W 开发准备

**W-PREP-01。** 复核原始响应、review 与评分代码，区分引用交付失败和条件推理遗漏；离线 mock 复现超时后 fallback 继续派发，外部调用为零。既有授权回归 51/51、284 assertions 通过，说明需要补充迟到响应反例。详细证据和待实现修复更新 §7.20；V 数据原字节保留。

**W-DOC-02。** 合并状态页和计划的重复历史说明，修复研究正文“尚无真实消费”、V 任务书“尚未开始”等过期状态，采用已复核的共享组件文档更新。W0–W9 制定完成；本轮未启动 W 代码或模型实验。文档验证与提交记 conversation log 和 Git。

### 2026-09-21 W0 基线与共享反例

**W0-RED-01。** 触发：V 回归全部通过，但真实运行留下引用返工、异常 wire、迟到 fallback 和混合评分。根因：旧测试只覆盖 V 已有合同，没有把四项复核发现写成期望行为。修改：保留 51/51、284 assertions 与 typecheck 基线，再加入逐行 source ID、窄 provider schema、timeout 后禁止新 fallback、语义与 citation delivery 分离四项 synthetic 红测。验证：三个 focused test 文件分别以 1、2、1 个目标断言失败，迟到 mock 在宿主返回后从一次调用增长为两次；外部 provider、目标执行和费用均为零。含义：W1–W5 的成功条件现在由可复现行为约束，不能靠文档宣称修复。

### 2026-09-21 W1–W5 引用、wire、生命周期与评价分解

**W1-CITATION-01。** 触发：模型必须从未编号正文复制 path/line/quote，真实 file 与 revision 输出反复 quote mismatch。根因：模型承担了宿主可确定的机械绑定。修改：source catalog 提供 ref-bound ID 与 crop 行标签，normalizer 从 exact bytes 生成 path/quote；原始位置独立保存。验证：order/duplicate/LF/CRLF/non-one start/trailing newline/stale ref/out-of-range/cross-source 与普通 generic-save 声明均通过。含义：引用选择仍由模型完成，机械抄写从比较变量移出。

**W2-WIRE-02。** 触发：canonical schema 让模型复制请求元数据且 malformed array item 使整次结果无效。根因：模型 wire 与持久化 result 共用版本。修改：wire v1 与 normalizer v1 分版，unknown 才强制 missing/observation；schema tool/fallback 使用同一窄结构。验证：实际 provider JSON schema 不含 task/repository/ref/path/quote，fallback schema 同样只含 sourceId/range；旧 canonical tests 保持通过。含义：新运行可区分传输失败与 canonical 验证，V 原件仍可回放。

**W3-PROMPT-03。** 触发：D 的 canonical facts 与 compiled plan 重复相同义务信息，repair 又复制完整首 prompt。根因：方法说明、共同事实和修复材料没有分节。修改：B/D 共用 byte-identical declaration/result contract/source marker，只保留不同方法 instructions；repair 各放一次声明、合同、源码、当前 wire、诊断。验证：结构对象等价、源码单次插入、分节字符和 repair 总字符均由测试核对；字符不换算为 token。含义：W 配对更接近方法差异而非重复量差异。

**W4-LIFECYCLE-04。** 触发：5 ms timeout 后 25 ms 无效响应仍触发第二 dispatch，repair timeout 丢 initial。根因：超时包围整个 extraction，却未撤销 wrapped provider 的派发权限。修改：provider 边界实现 per-call/unit deadline、closed state、四次 cap、事件 sink 与 late settlement；initial 生命周期提升到 catch 外。验证：正常、schema fallback、late valid/invalid、pending、repair timeout、provider reject、post-close、第五次拒绝和恢复不重发均通过；JSONL 含 dispatch/response/closed，late usage 可从事件归并。含义：completion unknown 不再扩散成隐藏请求，实际无法结算的调用仍保持 unknown。

**W5-EVAL-05。** 触发：file B 的事实和结论 review supported，却因 citation mismatch 得到旧 partial/task false。根因：单一字段把 semantic、evidence、transport 与 delivery 合取。修改：增加四个分解字段并保留旧字段计算。验证：坏引用/正确语义、合法引用/错误论断、scope 夸大、缺条件、无效 review 与四种等价条件表达共 9 个 evaluator 测试通过。含义：后续 B/D 报告能指出收益属于推理、证据还是格式，不改写 V 当时结论。

### 2026-09-21 W6 全链离线演练与兼容重放

**W6-MOCK-01。** 三个现有声明按 B/D、D/B、B/D 经 compile、共享 renderer、source catalog、wire v1、normalizer、host、review 和 evaluation 运行六个 injected-provider 单元，6/6 terminal、3/3 pair；恢复再运行没有新派发。注入 schema fallback、malformed wire/citation、late valid/invalid、repair timeout 与 semantic contradiction 均得到预期状态。语义 contradiction 后 evaluation report 仍是结构有效的 `completed`，对应 unit 为 partial，证明自动消费者不能把 exit 0 当语义成功。

**W6-REPLAY-02。** 在不写 V 目录的前提下，用当前 canonical parser/validator 重放 initial 六单元八个 generation 和 revision 两单元两个 generation；validation digest 与旧 `taskDecisionCorrect`/quality/error classes 全部匹配。派生的四层字段写入 W 的 `v-replay-*.json`，明确标为复用旧 hash-bound development-agent review 的 reanalysis，不称新独立评价。`check/status/evaluate/replay` 均不创建 provider；模型可见六份 preview 不含 oracle path/rule、expected disposition 或 GHSA 标识。

### 2026-09-21 W7 三组真实配对

**W7-RUN-01。** 冻结实现 revision `f15f4c7` 和配置后，按 B/D、D/B、B/D 完成三个既有案例共六个 fresh-context 单元。六个单元均 completed，无 completion unknown；file B 发生一次 schema→prompt fallback，text B 因跨 source citation range 使用一次 domain repair。最终 transport/delivery/semantic decision 均 6/6，file/text 四单元 full-success，trusted-header 两单元 partial。八次 provider dispatch 共 22,879 input、9,418 output、6,912 cache-read tokens；实际 USD 八次均未报告。

**W7-REVIEW-02。** trusted-header B/D 都正确 abstain 为 unknown，并明确部署 gate、ingress、proxy 与认证结果缺失；共同漏掉四种条件 outcome 的完整表达，D 另漏 optional signup。独立只读复核与主 review 对 B 的两个隐含项存在宽严差异；最终采用“答案须明确陈述，不能只靠引文代码补全”的保守口径，分歧进入 summary。

### 2026-09-21 W8 无修订与方法决定

**W8-DECISION-01。** 真实结果没有暴露 wire、引用绑定、生命周期或评价实现的共享缺陷；剩余漏项属于领域条件推理。按任务书不加入案例答案提示、不放宽 rubric、不追加 revision。D 比 B 少两次调用、少 8,853 input 与 2,814 output tokens，但三对语义判断一致、trusted-header 证据完整性同为 missing，故不宣称 D 质量优势或启动第二项目。下一轮只研究缺失领域关系的最小、通用表示。

### 2026-09-21 W9 独立审查与最终验证

**W9-REVIEW-01。** 独立代码审查发现一项 important：invalid normalization 可能仍交付 canonical result。先增加 duplicate/foreign/missing obligation、无信息 unknown 与 host 双次 invalid 回归，确认 3 个测试按预期失败；最小修复后聚焦测试 17/17、授权两目录 77/77（449 assertions）和 typecheck 通过。公共 provider 专项 4/4（12 assertions）通过。离线 W replay 重现六单元，模型与目标执行均为 0。独立审查无 critical 或其他 important/minor；其初始“不可发布”结论已针对唯一问题完成修复和回归。

### 2026-09-21 X 完整能力阶段准备

**X-PREP-01。** W 二次复核新鲜通过授权/provider 81/81、461 assertions；确认 B/D 共用声明和输出底座，trusted-header 部分评分涉及显式表达粒度。用户接受扩大下一轮：评价校准、可选关系、普通输入、第二项目及对照一并交付。制定 X0–X13，同步当前状态、plan 与 spec，W 历史资料不改。本次只写任务书和设计，未启动 X 或新模型调用。

### 2026-09-21 X0 恢复与基线

**X0-BASELINE-01。** 从与 `origin/skill-ir-aot` 一致的 `9204239` 普通 checkout 启动，保留 7 个既有 tracked 源码修改和 233 个 untracked porcelain 条目。建立 `authorization-capability-v1/status.json` 与单一 `journal.jsonl`；授权基线新鲜通过 77/77、449 assertions。未重放 V/W、未调用模型或目标。下一步交错执行 X1 评价 v2 校准与 X2 第二项目获取。

### 2026-09-21 X1–X2 评价校准与第二项目

**X1-EVAL-01。** 先以新增测试确认 v2 导出不存在，再实现三层 rubric/review/evaluation 路径并保留 v0/v1。六个判例覆盖等价否定、漏 signup、正确 unknown、代码引用无因果、错因果和漏决定性控制；归档 W B/D 只读重评都为 necessary supported、decision correct、explanation partial。授权回归 80/80、465 assertions 通过，typecheck 通过；provider/目标调用均为 0。

**X2-PROJECT-01。** 首个候选 FastAPI full-stack template 满足非 fork、MIT、固定 ref、明确 owner/superuser 分支和公开回归依据，故按预设 first-qualified 规则停止候选搜索。归档的 `items.py`、`test_items.py`、LICENSE 分别匹配官方 blob `f0eb30e`、`3e82cd0`、`f11987b`；两项任务与 evaluator 分离，公开 development 状态和未执行目标限制明确。下一步用五个任务检验六类分析要求。

### 2026-09-21 X3 跨任务关系合同

**X3-RELATION-01。** 五个任务走查没有推翻六类边界：共同 profile 前五类 required、external-assumption when-present；trusted-header 可显式提升 external 为 required，optional provisioning 用重复的 identity-binding when-present 表示。FastAPI 的 owner/role 反例证明不应把 signup/proxy 固化，也证明 decision/effect 要能按 authored obligation 分开。冻结合同明确同义务依赖、显式 pair 展开、compiler/model 分工与禁止答案预填；两个 answer-free 示例的 task 均通过 v0 schema。未调用模型或目标，X4 先以失败测试实现 strict requirement 与 ledger compiler。

### 2026-09-21 X4 analysis ledger compiler

**X4-LEDGER-01。** `relations.test.ts` 先因模块缺失红灯，随后 strict requirement schema、局部诊断、同义务 prerequisite、cycle 隔离、when-present pending、跨 expanded obligation 展开、顺序稳定与无笛卡尔积转绿。窄只读复核发现 NUL 组合 key 及 `::` expanded ID segment 两个 minor collision；各自新增可复现红测后用结构化 key 与可逆 segment escaping 修正。聚焦 23/23，授权全套 93/93、500 assertions 与 typecheck 通过；无网络、模型或目标执行。X5 接通 coverage sidecar 与宿主机械验证。

### 2026-09-21 X5 coverage sidecar 与宿主检查

**X5-COVERAGE-01。** 新测试先分别暴露缺失的 `relation-result` 模块、wire/v2 导出和宿主仍按 v1 拒绝 v2 answer。实现后，v2 仅附加 coverage sidecar，canonical v0 不变；validator 检查 requirement/expanded obligation、required/when-present 状态、理由及同义务 source-backed fact pointer，把语义支持留作 `unreviewed`。宿主保存 initial/repair 的 raw wire、canonical、coverage 与诊断，并只复用既有一次确定性修复；持续无效 coverage 以 `completed-with-diagnostics` 收束。旧 v1 与 replay 回归继续通过。授权全套 105/105、547 assertions 和 typecheck 新鲜通过；独立只读复核无 critical/important，仅指出两个已有下层测试覆盖的 minor 测试粒度建议。无 provider 调用、网络获取或目标执行。X6 转入自备输入与 provider-free 检查。

### 2026-09-21 X6 自备输入与不可覆盖 session

**X6-LOCAL-01。** `local-input.test.ts` 与 `local-run.test.ts` 先因模块缺失红灯；实现普通 path reader、source/task/ref 与行范围检查、默认/显式 profile、check/run/inspect 及 immutable session 后转绿。独立只读审查无 Critical，指出 `sourceRoot` junction 可先解析到输入目录外以及 provider-unavailable 报告列出未生成 artifact；两项均新增红测，改为读源码前验证 canonical root，并让 artifact 清单只声明实存/将写文件。授权全套 115/115、607 assertions 通过；typecheck 与文档检查随阶段提交新鲜复验。mock provider 只验证本地接线，不计真实 provider 调用；无目标执行。X7 开始同事实 N/B/D 与自包含例子。

### 2026-09-21 X7 同事实 N/B/D 与作者体验

**X7-RENDER-01。** 失败测试先证明传入 N 会静默使用 D，且本地 CLI 不接受 `--arm`；改为显式三分支后，N 使用自然说明、B 使用 organized instruction、D 使用因果/prerequisite method，三者共用同一 facts、公开 requirements、source、wire/v2 和输出合同。arm 与分节字符贯穿 check/session/dispatch/host/inspect，provider token 仍只取真实 response。单次 evaluator summary 扩为 N/B/D，pair summary 的 B→D guard 保留。自包含 synthetic 例子三臂 check 均 valid；prompt 字符为 N 11,141、B 11,837、D 12,177，不解释为 token。两份 pinned MIT skill 仅映射授权切片，剩余职责保留；authoring trace 四次 check 中两次给出精确诊断，未测真人时间。授权全套 120/120、709 assertions 通过；typecheck 的 per-run/pair 类型耦合经 N 回归修复后通过。独立只读复核未发现 critical/important；无真实 provider 或目标执行。X8 转入五任务与 synthetic 变化的共同离线链。

### 2026-09-21 X8 离线接线、恢复协议与面板冻结

**X8-OFFLINE-01。** 五个真实任务和四种 synthetic 变化通过共同 parser/ledger/source/mock-host/coverage/evaluator-template 路径；普通例子复制到临时目录后完成 check/run(mock)/inspect，确认不依赖研究绝对路径、历史 manifest 或 oracle。为 23 单元真实面板增加 experiment-only 薄编排器，先以失败测试锁定分母、顺序、预算、path-safe ID、终态恢复、claim-only 禁止重发、initialized-without-dispatch 安全继续及跨 artifact 篡改拒绝。独立只读复核确认恢复边界无阻断问题。实现 revision `dccd83099dd4f2779604d18f9ad36e62aa8f5a31`；冻结配置 `experiment-config-v1.json` 的 SHA-256 为 `23e22d8e3f6f49728d1ba1eb2db8afde7b861053bace435607b6222a64b57fec`，provider-free check 得到 5 cases/23 units/0 diagnostics。授权回归 129/129、813 assertions 与 typecheck 通过；模型、付费和目标执行均未发生。X9 将严格按已提交配置生成，全部生成后才进入 evaluator。

### 2026-09-21 X9 冻结真实面板生成

**X9-RUN-01。** 已提交的实现 `dccd830` 和配置 `23e22d8...57fec` 按既定顺序完成 20 个 B/D 主单元与 3 个 N 补充；23/23 completed，无未知完成、timeout、terminal failure、domain repair 或目标执行。30 次 provider 调用中 23 次为 schema-tool、7 次为 prompt-parse；总 token input 102,579、output 61,942、cache-read 45,824，实际 USD 30/30 unknown。所有生成完成后才开放 evaluator，初轮原始身份不因后续 review 改写。

### 2026-09-21 X10 逐义务评价与独立结论核验

**X10-EVAL-01。** 新 evaluator 先以缺模块和 evaluator-only source path 不在 model bundle 的红测暴露边界；实现 hash-bound review materialization、逐单元 v2 评价、项目/案例/臂/重复聚合与离线 replay，并把 rubric-only source 独立载入，不污染模型输入。23 个初轮单位评价为 14 full、5 partial、4 incorrect；全部 necessary semantics、coverage、scope、transport 与 delivery 均通过。四个错误都是 explanation 正确而 conclusion enum 方向相反。B 为 7/2/1、12 calls，D 为 6/2/2、14 calls；两臂 necessary/coverage 都是 10/10，当前不支持 D 额外收益。N 无重复，不能作稳定或全系统因果结论。独立只读核验点验四个错误单元和聚合 totals，未发现摘要矛盾；离线 replay digest 一致。聚焦测试 13/13、70 assertions 与 typecheck 通过。下一步只修共同 label 语义合同，并用受影响 text、FastAPI update 的 B/D 各一次作唯一追加验证。

### 2026-09-21 X11 共享 conclusion 合同与唯一追加验证

**X11-REVISION-01。** renderer 红测先在 N/B/D 三臂共同失败；修订只解释三个 conclusion label 相对 declared expectation 的方向，聚焦测试 9/9、142 assertions 转绿。实现 `7b619b4` 与四单元配置在 provider 调用前提交。text B/D、FastAPI update D/B 四单元最终均为 source_refuted/full-success，必要语义与 coverage 4/4；三项 first response 直接接受，FastAPI B 使用一次 prompt-parse，总调用 5、input 25,674、output 9,836、actual USD unknown、domain repair 0、目标执行 0。离线脚本以新 raw-output hash 绑定四份 review，评价均 valid；typecheck 通过。首次普通 run 因未传 `SKVM_CACHE` 在 provider factory 前失败、provider calls 0，保留后安全继续。初轮结果未重评换身份，revision 不替代四个旧错误；停止继续调用并转 X12。

### 2026-09-21 X12 普通使用复验与能力判定

**X12-USAGE-01。** 先以失败测试锁定省略 arm 应采用 B，再把 ordinary check/run 默认从 D 改为 B；显式 N/B/D 和旧 session 读取不变。synthetic example 的省略-arm check 为 valid/B/六项要求/零诊断；作者 trace 三项测试与 local input/run 共 14/14、104 assertions 通过。通过普通 inspect 复用 Open WebUI controlled-text B 与 FastAPI foreign-update B 的 X11 session，两项目均 completed/source_refuted/coverage valid，新增 provider 与目标执行为零，且不装载 evaluator。机器记录绑定两个 result 与 authoring artifact 的 SHA-256。能力定为 bounded development：单 repo/ref、显式 source/obligation 可用；仓库 discovery、目标/部署执行、whole-skill 自动转换、patch 和生产默认均不在范围。初轮 14/5/4、header partial、N 无重复、USD/human time unknown 继续保留。下一轮最小实现仅为 opt-in 顶层命令适配器加一个新 held-out repo/task，不在本轮提前生产化。X13 只做统一验证、文档/证据同步与发布。

## 13. 原始证据索引（只在需要细节时读取）

| 内容 | 原件 |
|---|---|
| S 总报告、研究方法与版本笔记 | [报告](../../results/skill-ir/skill-task-dsl-preparation-20260919/research-report.md)、[笔记](../../results/skill-ir/skill-task-dsl-preparation-20260919/research-notes.md) |
| S 来源、任务卡、分类 | [sources](../../results/skill-ir/skill-task-dsl-preparation-20260919/sources.json)、[cards](../../results/skill-ir/skill-task-dsl-preparation-20260919/structure-cards.jsonl)、[classification](../../results/skill-ir/skill-task-dsl-preparation-20260919/classification.json) |
| S 手工演练及状态 | [method-probes](../../results/skill-ir/skill-task-dsl-preparation-20260919/method-probes.md)、[status](../../results/skill-ir/skill-task-dsl-preparation-20260919/status.json) |
| D 来源核对与决定、设计细节 | [review](../../results/skill-ir/dsl-semantics-readiness-20260920/review-and-decisions.md)、[design](../../results/skill-ir/dsl-semantics-readiness-20260920/semantic-design.md) |
| D 案例、探针结果与代码 | [cases](../../results/skill-ir/dsl-semantics-readiness-20260920/cases.jsonl)、[probe-results](../../results/skill-ir/dsl-semantics-readiness-20260920/probe-results.json)、[probes](../../results/skill-ir/dsl-semantics-readiness-20260920/probes/package.json) |
| D 当时提出的实现交接、状态 | [handoff](../../results/skill-ir/dsl-semantics-readiness-20260920/implementation-handoff.md)、[status](../../results/skill-ir/dsl-semantics-readiness-20260920/status.json) |
| E 外部来源、观察、方法对照、反例与持续状态 | [sources](../../results/skill-ir/skill-dsl-research/sources.jsonl)、[observations](../../results/skill-ir/skill-dsl-research/observations.jsonl)、[method comparisons](../../results/skill-ir/skill-dsl-research/method-comparisons.json)、[consumption](../../results/skill-ir/skill-dsl-research/consumption-design.json)、[challenge](../../results/skill-ir/skill-dsl-research/challenge-review.json)、[status](../../results/skill-ir/skill-dsl-research/status.json) |
| T 授权真实案例、允许输入、独立答案与原型决定 | [manifest](../../results/skill-ir/skill-dsl-research/cases/authorization/manifest.json)、[walkthrough](../../results/skill-ir/skill-dsl-research/manual-design-walkthrough.json)、[prototype decision](../../results/skill-ir/skill-dsl-research/prototype-readiness-decision.json)、[targeted status](../../results/skill-ir/skill-dsl-research/targeted-study-status.json) |
| V 授权 DSL 开发、真实运行、复验与总结果 | [status](../../results/skill-ir/skill-dsl-research/development/authorization-v0/status.json)、[summary](../../results/skill-ir/skill-dsl-research/development/authorization-v0/summary.json)、[offline replay](../../results/skill-ir/skill-dsl-research/development/authorization-v0/offline-replay.json)、[initial](../../results/skill-ir/skill-dsl-research/development/authorization-v0/runs/initial)、[revision](../../results/skill-ir/skill-dsl-research/development/authorization-v0/runs/revision-1-expanded-id-contract) |
| X 授权完整能力、初轮评价、合同 revision 与普通使用复验 | [status](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/status.json)、[initial evaluation](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/runs/x9-initial-v1/evaluation-summary-v2.json)、[revision evaluation](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/runs/x11-conclusion-contract-v1/revision-evaluation-v1.json)、[usage verification](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/usage-verification-v1.json) |

原件中的 nextAction、frozen、proceed-narrow 代表当时阶段；当前选择以本文件第 1 节及 current-status 为准，不因保留原件而重新启动旧任务。
