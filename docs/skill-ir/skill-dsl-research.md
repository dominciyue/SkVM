# Skill 分类与领域 DSL 研究总文档

更新于2026-10-10。本文件是这条研究路线唯一持续维护的**研究与开发复盘正文**，合并S0–S11、D0–D11及后续研究，并记录实现问题与修复。实时状态由[current-status](current-status.md)维护，未达责任见[当前计划](skill-ir-aot-optimization-plan.md)。

## 1. 当前结论

**授权任务已有局部语义、来源材料、变化失效和官方账号双入口；BB接通v7跨函数公共链，真实材料采用已有进展，但真实性质检查尚未闭合。** 当前范围仍为单repo/ref、源码可见的授权与信任边界评估。稳定质量或净收益尚未建立。BC下一轮转向任务性质准备、跨调用解释修复和准备阶段故障，计划已登记，尚未实施。

BB已接通v7匿名公共跨源检查及两BA原提案派生采用，同epochN/M/D为Download N/D自然full、M partial，OWUI三臂partial；真实跨源性质trace仍0。Download原包partial/8采用，OWUI两尝试均无已保存终态/答案、最终费用未知，具名末次32采用不代表交付。用户2026-10-10限定批准的三fresh已各执行一次：policy/source自然partial/各2采用/性质unknown，premise终态routing失败未交付，三previous缺合格基础。本次授权执行以completed-with-unmet-criteria收束，16位置13尝试/3blocked、15去重尝试/12自然交付；finiteQueueComplete与researchGoalAchieved仍false，BA暂停保持。

当前结构关系复用AY source-bindings/v35，显式v6已有任务性质绑定、有限摘要采用、依赖/调度范围和逐题性质检查的有界实现；AZ实际运行仍为0接受/采用/检查。AY Download v35的3单元/30步骤/2采用及OWUI v35为0保持历史口径。新源码摘要仅采用未使用返回的平坦普通调用；动态框架、返回值组合和复杂异常仍用既有解释或明确残余，不能据工程测试推定完整任务收益。

日常先读本节与[当前状态](current-status.md)。当前开发决定见[§7.64](#764-bc-任务性质准备与跨调用修复)，BB结果见[§7.63](#763-bb-跨函数性质闭合的复核与开发决定)，BA实际结果见[§7.62](#762-ba-从真实拒绝到可用语义编辑)，AZ/AY形成过程保留在§7.61/§7.60。方法形成过程见§4–§7.18，历史开发记录保留在§7后续章节。本地化候选保留在§8–§9，暂缓实施。

### 当前方法怎样分工

| 部分 | 实际职责 | 仍需判断的内容 |
|---|---|---|
| 领域声明 | 记录任务模式、主体、资源关系、操作、前提、政策来源与允许源码范围，展开待分析义务 | 声明来源是否真实、政策是否确为当前任务要求 |
| 宿主与工具 | 提供只读定位/取证、原行引用、局部状态、预算、失效传播、检查和交付；AR 增加工作队列与局部图更新 | 有限程序只能处理已提取的关系，未提取分支须继续取证和解释 |
| 模型 | 阅读原始源码，提出带出处的局部控制、条件、依赖与答案 | 决定性源码选择、别名/对象绑定、自然政策映射和完整解释 |
| 评价 | 分开核对答案语义、证据支持、程序检查和实际交付；保留首答、修订与未运行项 | 程序检查与语义复核各有边界，独立评语也须回到原始源码核实 |

这套方法复用 SkVM 的模型路由、普通 CLI、trace、编译和验证基础。领域能力已经进入代码和工具；既有 IR/AOT 与包导出按任务需要使用，不要求所有 task 经过同一中间表示。

### 证据走到了哪里

- **类别依据：** 外部 skill 的任务卡支持主体、资源、操作、控制、证据和义务等共同对象。Cloudflare/GitHub 的授权职责可以映射到同一切片，完整安全审计、差异审查、依赖/secret 扫描及 patch 职责另行保留。来源及反例见 §4、§6、§7.9。
- **固定材料上的结果：** 多轮同材料 Markdown/DSL 比较未显示稳定表示优势；AJ/AK 等阶段的改善主要来自共同补齐决定性源码。AN 的固定材料终答和作者前端记录有工程价值，比较条件的局限见 §7.33。
- **自主取证后的问题：** AO 的 32 项质量任务终答严格完整 9 项；AQ 旧/新执行策略各 2/20 full，新策略交付更少。AQ 有 11 次自动补读，四次原 skill 消费 checked 交付仍为 0/4。决定性源码漏读、提取不全、协议和预算共同造成失败，详见 §7.34–§7.35。
- **AR 已取得的局部证据：** 工作队列、局部窗口、更新和预算交付已有实现；非 API 程序同包原/变消费与中性前提 previous 已实际发生。真实授权完整链、真实授权变化复用和主面板仍有未达项。AR 的旧机器状态保留停止前快照，具体原答、失败和修订见 §7.36–§7.47。
- **AS实际结果：** 12个可运行质量首轮均评阅，源码语义完整0/12；4个完整原skill原/变native均实际消费，最后1/4形式checked/bounded、0/4完整源码质量。4份模型作者稿格式有效并按原字节消费，下游仍部分失败。局部机制消除了具体协议、参数和定位障碍；三同版本首轮块未显示新核心/DSL完整质量增益。10个变化位置因封存或无合格base零调用阻塞。结果、成本和精确边界见§7.48。
- **AT实际结果：** 12质量首位置全部partial，checked/bounded为0；两份完整原skill原/变4native均运行，original的两份自然条件说明充分，changed及formal完整链未达。4作者稿有效忠实且原字节消费均partial；政策/前提fresh和同输入源码副本fresh共4次partial，两previous无合格base阻断0调用。具名修复消除注释假入口，仍未闭合语义。37原件、556/556调用响应、完整token计量，USD/开发/真人未知；只证明部分机械减负。详见§7.49与[AT summary](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json)。

最新AY结果补充：两份原skill和两包原字节消费均已实际运行。Download消费者源码评阅full但机器partial，OWUI消费者仍漏决定性helper；政策/前提变化已有部分运行，源码变化及质量位置受账号额度阻断。[最终收束](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/final-closure-v35.json)记录可见完整input 32,465,835、output 125,283、其中cacheRead 29,939,200（已包含在input），USD/隐藏请求/开发/真人成本未知。旧AX、AW结果保留其当时口径。

当前关键问题是：**让真实任务中的跨函数对象和控制关系进入有证据的性质检查。** BB公开read/edit、采用与检查的匿名正反例及双入口通过；真实角色/类型映射仍不完整或矛盾，原包未声明性质，采用记录没有形成非空跨源性质trace。fresh已运行但previous缺合格基础，稳定效果未建立。425核心测试、29研究测试和主/研究类型通过；本次完整离线重放未通过，隔离计时180.53秒仍在createInquiryTools准备阶段，内部根因待确认。授权执行结束、未知保留与后续责任分别见§7.63及收束原件。

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

AH回读安全来源时只映射Cloudflare与GitHub两个独立skill家族中的单repo/ref授权分析职责；目标源码中的Open WebUI、FastAPI、Gitea三个项目与八个任务状态是测试输入，不是额外skill成员。full/diff审计、patch、secret和dependency职责仍按原来源保存。出处、依赖读取深度与近似反例见[AH职责图](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/skill-duty-map.json)。

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

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

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


</details>

### 7.20 W 复核结论与下一轮设计

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

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


</details>

### 7.21 X 完整能力阶段设计

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

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


</details>

### 7.22 Y 条件表达、默认迁移与价值验证

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

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


</details>

### 7.23 Z 输出减负与实际使用

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-22用户要求制定并派发下一轮，开发线程用`gpt-6-astra / medium`。当前任务书为[Z0–Z12](../superpowers/plans/2026-09-22-authorization-dsl-protocol-and-usability.md)，被测模型仍用既有Sol路线独立配置。本节保留设计、复核依据及完整Z实施结果；最终发布为1ae35ccb，后续编写与复用工作见§7.24。

**复核证据。** `authorization check --method=plain`实际返回Unknown option，Y承诺的公共method仅有研究内部P/L/C路径。六个Gitea C首答按当前wire/v3离线重放全部失败：4项缺facts.condition，2项conditionAnalysis写成数组，2项版本字段错误，其中一项还重复嵌套/缺branches。均随后重新请求原任务；失败schema-tool合计47,330 known tokens，成功fallback合计62,413，P总量37,489。这些合计含cache、不是美元权重。源码级根因须再核模型可见schema与本地Zod，不能仅据失败归咎模型。lock的正确拒绝被因HTTP403未显式书写同时扣necessary/explanation，也应与真正权限推理错误分开。

**方法与工程选择。** 停止默认增加分析层，先补公共plain/ledger/conditions解析；省略参数兼容Y有request启用条件、无request走ledger的行为，显式选项及冲突均有预览和provider前诊断。wire/v4尽量只让模型输出事实/关系/判断，固定版本、任务身份、分组及重复包装由宿主生成；fact ID在义务内绑定，旧canonical和语义检查复用。不得自动猜结论或伪造事实，旧wire失败保持失败；schema层省字段只减少机械负担。

**比较与试用。** 先对齐新评价：授权决策、决定性控制、条件解释、协议响应细节分别报告；旧rubric只读，重评分变化不当新方法收益。已暴露的header及三个Gitea任务旧/new条件wire各一次，共8单元，同事实/模型/预算/修复机会；一次明确共享修订最多4单元。另完成collaborator原任务与self-query变化任务各一次普通run，观察真正答案变化。作者优先真实外部使用者，无人时干净上下文代理，只给usage与任务/源码/政策；记录草稿、check、修改和参与者身份，不声称真人节省。正常10单元、至多14，不新增目标项目或保护输入。

**交付与解释。** 首答schema/交付率、最终质量、fallback/repair、分字段token/cache、耗时及作者步骤共同判断。传输改善如实写为协议/运行减负；新wire没有收益就保持可选，不把工程完成写成DSL优于普通说明。Z期间把每个实际问题和解决记录在本节；机器材料统一进入`development/authorization-protocol-usability-v1/`。

**Z1–Z2 实施。** 公共method通过同一选择器映射既有P/L/C执行输入；显式method固定B，省略保持input-request/default，report/session/text保存选择。红测复现Unknown option后，20项聚焦回归及typecheck通过，三模式真实provider-free check与Node help通过。六个旧C首答仍全部被原v3拒绝，fallback全部通过，已知失败/fallback token重现47,330/62,413。离线捕获实际extractStructured产出的tool schema：facts.condition必填、conditionAnalysis对象及嵌套版本常量均正确；converter缺strict对象/数值数组边界，但不解释这些已见错误，route也没有strict:true。历史记录只有请求摘要，schema为未变转换路径重建，远端约束执行仍未知；本轮不改provider，避免混入第二个干预。

**Z3 wire/v4字段责任定稿。** 顶层仅results。每项保留obligationId、conclusion、explanation、facts、decisiveMissingFacts、suggestedObservations；facts为{id,kind,statement,citations}，ID只在该义务内唯一。plain没有coverage/condition；ledger在item内加coverage（省obligationId，用factIds）；conditions再加condition（branches省obligationId、用factIds，保留assumptions/effect/explanation/missingFacts、unexaminedConditionIds/completeness/limitations）。宿主固定版本、task/repository/ref和declared-only scope，按kind分组、按ID排序后建立canonical pointer，引用仍由exact catalog解析；重复/陌生ID报原字段路径，绝不按位置猜绑定。复用v1引用归一化及既有coverage/conditions validator，空组仅表示没有事实。模型不填写任何版本常量；v1–v3解析与失败原件不改，新协议先显式opt-in。

**Z4–Z6 实施与预注册。** compact normalizer复用已有引用、coverage和condition检查，host复用该检查结果；同义务事实重排得到相同canonical结果，重复/缺失/外义务ID、非法source/range、空缺失事实unknown及条件冲突反例通过。普通入口新增独立`--wire=legacy|v4`，默认暂为legacy；新计量保存每次实际tool schema、本地schema诊断、首答schema/交付、fallback/repair与模型输出字符，token仍仅取provider报告。聚合173/173、1216 assertions及typecheck通过。评价v3补充使用显式response criterion集合，不用关键词推断任务必需性；响应细节不再混入necessary semantics，公开明确要求时仍影响完整交付。lock的必要项改为两admin均false时拒绝的控制语义，HTTP403保留独立细节项；所有旧评分不改。接下来四任务交替legacy/v4共8单元，两版使用同一v3评价；本轮没有provider转换器修改。

**Z7–Z8-STRICT-01 (2026-09-22).** The initial frozen eight-unit panel closed before review. Legacy delivered 3/4 (one strict extra-key failure), v4 delivered 3/4 (one timeout retained as unknown; late usage reconciled only). Independent source/answer review found necessary semantics supported in all six delivered answers, but header/collaborator legacy condition explanations incomplete. Unlike the six historical nesting failures, the new assignee fallback emitted `coverage[3].missingFacts`: local Zod rejects the extra key while the converter omitted `additionalProperties: false`. A captured real tool/fallback-schema regression failed first, then the shared converter was minimally corrected for strict objects only, preserving passthrough objects. Both wire arms receive this correction. One assignee old/new revision pair is authorized and kept separate; no timeout resend or answer patching. Focused provider/compact/audit regression: 5 tests, 46 assertions pass.

**Z7–Z10-RESULT-01 (2026-09-22).** Frozen initial panel (four exposed tasks, conditions method only): legacy/v4 first schema-valid and complete delivery were 1/4 versus 3/4; final delivery was 3/4 versus 3/4. Legacy assignee failed transport; v4 header timed out and was never resent or promoted after late settlement. All six delivered decisions and necessary controls were supported. Final full quality was 1/4 versus 3/4 (among delivered: 1/3 versus 3/3); legacy header omitted closed-gate/failed-authentication outcomes and legacy collaborator omitted independent exception outcomes. First-delivered full quality was 0/4 versus 3/4. Independent read-only review checked these decisive differences and both lock answers; their missing explicit HTTP403 remains a response-detail gap, not a wrong admin gate. This is one observation per wire/task, not a reliability estimate.

Initial legacy/v4: 7/4 calls, 3/0 fallbacks, 0/0 domain repairs; input 43,719/21,926, output 20,017/10,705, cache-read/write 0; summed known call duration 880,027/537,944 ms. The v4 amount includes the header response that arrived after the 180-second call deadline; it counts cost but not delivered quality. Per-task first/final quality, prompt/output character mechanisms and calls/timing are in `panel-summary.json`. No dollar estimate substitutes for unknown provider actualUSD.

The single shared strict-schema revision was frozen at `2a4ca3d3`, limited to the assignee pair. Both final answers are full, but legacy still failed its first shape and required fallback (2 calls; input 8,350/output 6,179/cache-read 4,480; 297,196 ms), while v4 delivered its first answer (1 call; input 1,033/output 2,441/cache-read 4,480; 121,337 ms). The correction aligns the advertised/local contract; it does not establish provider enforcement or eliminate old-wire generation failures. Initial and revision records remain separate; no further run was added.

**Z9-AUTHOR-01.** A clean-context agent saw usage and collaborator source/natural policy, not completed assessment/oracle/history. Its draft guessed grammar and returned 36 normalization diagnostics. Main-agent schema correction preserved scenario intent, and usage now provides exact required task fields and links the existing full synthetic authoring example. The original draft and diagnostic round-trip are retained; there was no second independent authoring success trial. Ordinary plain CLI then completed different-user/deny and self-query/allow in one call each, using identical policy/source hashes, with seven recorded field-path changes. Main semantic review confirmed both actual decisions: both labels are source_refuted because their respective policy expectations are enforced. Input 5,357/output 2,493/cache 0 for both runs; agent costs unmeasured and human minutes unknown.

**Z10-DEFAULT-01.** Keep legacy wire as default because header delivery regressed to timeout despite fewer observed calls/tokens and stronger delivered condition explanations elsewhere. v4 remains an explicit option for all three methods; real matched evidence covers conditions only. Method omission retains input-request→conditions, otherwise ledger/B. Explicit plain is suitable for lighter ordinary answers, ledger for requested traceable coverage, conditions for explicit bounded condition outcomes. This is engineering delivery/retry relief and observed local explanation benefit, not discovery of a new authorization capability or measured human savings. The full round uses 12 analysis units/16 dispatches, input 80,385/output 41,835/cache-read 8,960/cache-write 0, no unknown usage after late settlement, actualUSD unknown, target executions/protected-input reads zero. Historical Y calibration is offline and labeled evaluation-version-only.


</details>

### 7.24 AA 作者声明、修改复用与领域价值

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-22用户授权写完即派发[AA0–AA13](../superpowers/plans/2026-09-22-authorization-authoring-reuse-and-value.md)，开发使用gpt-6-astra / medium。AA以175测试/1229断言为基线，完成作者、变更与同底座面板；本节同时保存设计、问题及最终结果。

**问题与取舍。** v1作者输入仍直接要求完整canonical task；Z独立首稿的36条诊断主要暴露内部字段/嵌套知识负担。只补说明不足以证明改善，直接建设自然语言转换平台又会引入新变量。本轮选择薄作者语言v2：用户写政策、角色、资源、入口与场景，程序派生身份、默认约束、义务及条件绑定；复用原canonical/host，不创建另一套执行器。

**声明合同。** v2以命名字典表达policies/principals/resources/entries/scenarios，场景显式引用对象并保留relation、operation、expectation与可选条件分析。程序只拼接作者原文和机械字段，不从源码猜规范答案。actorRole/sourceRefVerification仍标作者声明。旧v1和normalized input继续兼容；check/run直接读v2，原输入与normalized快照分存。主请求、政策与角色关系依然需要作者表达清楚，确定性检查不承诺识别所有自由文本矛盾。

AA1映射规则（authoring-v2-lowering/1）：字典按键排序后生成canonical数组；ID为类型命名空间加UTF-8百分号转义键，条件ID包含场景和条件两个分隔编码段。数组顺序保留；禁止原型键、控制字符和首尾空白键。policy→policySources（kind=explicit-task-requirement、actorRole=task-author）；principal role原样，facts用中性标签拼成description，capabilities→startingCapabilities；resource type原样、facts→description；entries位置原样；scenario→obligation，引用按字典名称解析。缺facts/capabilities/conditions只表示未声明。共同requiredAnalysis、固定scope和只读constraints由版本规则提供，additionalQuestions/Constraints追加。condition request仅从显式analyzeConditions派生，不从源码决定期待或分支真值。provenance分别列明作者路径与派生字段。AA0新鲜基线175/1229；AA1三项测试按未支持v2预期失败。Z的36条诊断分为错误嵌套/字段名、缺canonical机械字段、缺作者语义字段三类，不能把所有错误都计成可自动消除的负担。

**修改与复用。** 现有result.ts快照保存主体/资源ID而缺属性，也未完整覆盖request、入口位置、公共要求等。新执行依赖需涵盖实际模型输入与结果合同，compare按变化解释受影响场景，旧session缺依赖保持needs-review。模型读过的全局source变化不能仅凭最终citation缩小影响。先交付只读适用性判断和修改传播，不自动复用旧答案或重标语义正确。

**评价与试用。** 两项独立作者试用覆盖Gitea different-user→self-query及FastAPI普通用户→superuser，记录草稿、诊断、自行修订、辅助介入及普通运行。六个已有任务的plain/ledger或plain/conditions在同v4、同源码/公共问题/模型/评价下配对，包含positive/refutation/allow/deny/unknown；正常12面板+至多4作者单元，一次明确共享修订最多4追加。作者负担、过期结果识别和运行质量/成本分别解释，不用格式字段存在充当领域收益。

**维护。** AA实质问题与解决追加在本节，及时同步当前设计；结果放统一AA目录。Z结果已从文末证据索引之后归回§7.23，原机器数据及历史评分均未修改。下一执行任务沿用当前主分支，保留七项原代码修改，不扩到主动发现、目标执行或新任务类别。

**AA2–AA6工程记录。** v2确定性lowering及版本分发、直接loader、init格式、原稿/normalized/provenance分存与只读compare已通过红绿测试。完整task快照补齐角色、资源、入口与公共要求；session另外绑定profile、condition request、method/wire、normalizer、全部source及prompt摘要。compare只说明适用性；同一fixed context中的任何输入变化保守影响全部场景，不按最终citation缩小。历史快照缺字段明确needs-review，V离线replay按其旧快照形状比较，绝不回填旧文件。集成测试同时暴露plain inspect把缺coverage与报告空数组误判为不一致，已统一其既有空值约定。AA6红测复现plain丢失condition request的公共分支问题；现在三method均接收相同的自然条件问题及分支上界，sidecar仍只在conditions执行，历史结果不重跑。

**AA7–AA8独立作者。** 两个干净上下文模型作者只得到usage快照、完整synthetic v2、自然任务/政策和固定源码，没有canonical答案、rubric或内部schema。FastAPI原/变首稿valid；Gitea把上游247–301行误作本地58行文件的位置，首次一项诊断。共享诊断经红绿测试改成作者字段路径与本地有效行范围后，一位新干净作者接力只修原/变入口的四个行号字段。主代理字段纠正0，最终2/2作者均valid；这只是程序流程隔离，不是文件系统权限隔离或真人实验。两组普通运行各2次均一调用交付，源码/政策保持相同，Gitea跨用户→自查、FastAPI普通用户→superuser均有源码支持的deny→allow。两次compare均needs-review；Gitea场景重命名呈删除/新增，FastAPI稳定场景呈修改。作者分别改5和6条路径（含对象级场景删除/新增），没有要求重写内部ID。humanMinutes和作者/开发代理美元成本未知；不能以Z的36诊断和本轮1诊断直接作随机化可用性因果比较。

**AA9初轮同v4结果。** 配置在生成前冻结，12面板与4作者单元全部生成结束才评分。面板首答schema有效12/12、完整交付11/12，最终交付12/12；实际决策与必要控制12/12正确，无观察到的误报、漏报或无依据额外事实。首答已交付full10/12，最终full11/12；未交付不从分母删除。前五组plain/ledger均5/5 full，各5调用，已知input/output分别15,442/5,733与24,392/8,347，调用耗时约325.1/400.8秒：未观察到ledger质量收益。header plain一调用（3,207/1,325 tokens，65.5秒），必要语义正确、解释partial；它未明确对照trusted-proxy-safe与attacker-header-reachable后果，也未在回答中明确HTTP403。conditions最终解释/响应细节完整，但初答未交付、诊断修复后共2调用（15,751/5,942，287.3秒）。两者均解释了可选signup，均未用答案文字说明header默认None；宿主展开的引用内容不算模型解释。完整逐项评价、首答和修复保留在[AA汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/summary.json)。

**AA10具体共享缺陷与修订。** header首答的三个blocked分支已由关闭入口/配置/失败认证决定效果，检查器却因其他assumption=unknown强迫填写decisive missingFacts，造成一次不必要修复。新增独立反例先失败，再把要求限于effect=unknown；reachable/blocked仍必须有同义务fact pointer，语义仍unreviewed。留存首答离线重检valid，原始失败、修复及17次实际调用不改；追加付费单元0。这证明消除了一个假拒绝，不能改报“新实测一调用”。作者键中的孤立UTF-16 surrogate也由红测定位：encodeURIComponent会抛错，现先返回可定位schema诊断；合法输入lowering未变，冻结面板不重跑。

**AA11复核与结论。** 三个只读独立语义复核后，主代理按具体指针裁决：self-query的source_refuted表示政策失效被反驳，不能等同deny；header signup被复核者遗漏；引用里的None/403不能代替回答文字；有源码支持的额外role/group事实不是unsupported。原复核与9项裁决分存。窄工程审查提出的drive-relative逃逸未在定向实例复现（实际missing-root，不宣称穷尽Windows边界）；所谓规则遗漏由实际prompt/task摘要覆盖。最终183测试/1337断言、typecheck通过；mock失败恢复、普通help/init/check/inspect/compare及多场景变化演示保留。全轮16分析单元、17调用，已知input64,134/output25,289/cache-read4,864/cache-write0；usage完整，actualUSD未知。普通有界任务推荐显式plain/v4；需要可检查覆盖清单选ledger，需要有界条件后果选conditions。legacy和省略method的兼容默认不变。本轮证明编写/变更helper可用、运行层存在tradeoff；不声称更广任务、真人工时、自动答案缓存或部署安全得到验证。


</details>

### 7.25 AB 外部复用与普通说明对照

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-22用户授权写完即派发[AB0–AB13](../superpowers/plans/2026-09-22-authorization-external-reuse-and-baseline.md)，开发gpt-6-astra / medium。AA复核新鲜通过183测试/1337断言和typecheck，本节登记下一轮设计，不提前宣称新项目效果。

**研究问题。** plain仍使用DSL编译、引用绑定与输出检查，AA只比较了领域系统内部的轻重模式。下一轮回答两个问题：同一方法和使用包能否在新项目被独立编写并修改；相较信息完整的独立Markdown说明，DSL流程在哪些准备、同步修改或交付环节有帮助。保持authoring/v2，不以不断增加模式或语言版本推动开发。

**外部来源。** 在读取新正文前登记资格、候选顺序和输入上限，认证GitHub获取最多6个候选，选择首两个独立合格项目。每项目两操作及原/变条件，共至多8任务状态；不按模型成功选样，不拿旧例填新迁移分母。源码、政策/用户规范、实际实现和oracle分开，材料不足保留原因。新材料进入external development，不改旧held-out/Q1/prospective身份。

**工程。** 薄skill使用包调用现有check/run/compare，模型分析与程序验证真实接通；不复制runtime。增加只读locate供两臂定位用户指定文件的实际行号，返回多个匹配而不猜入口；解决作者混淆上游和裁剪行号的问题。先记录方法/项目/单次场景字段复用，只有独立作者暴露同类机械重复才抽取小型确定性组合helper，无依据不建模板引擎。

**公平比较。** MD作者直接写说明，DSL作者写v2，两边拿同一中立brief、源码、政策与问题，使用同样locate与两轮诊断机会。MD不能来自DSL自动渲染。研究manifest仅支持共同身份、源码、引用和评价；不经隐蔽声明给MD注入答案或DSL方法。共享v4 plain、provider、deadline、输出合同和修复机会，比较属于同helper下的编写/执行流程，非完整原生安全skill或纯语法因果。

**执行与结论。** 满额16原/变配对分析单元，一次共享修订最多4追加；四项模型作者工作另计成本，真人时间未知。分别评价作者负担、修改识别、任务质量与调用/token/time，失败及unknown保留。MD若同样好且更便宜即推荐轻路径，DSL若减少遗漏或同步改动就指出确切机制。兼容默认不变，不预设positive；实际问题和解决归本节，机器记录进入统一AB结果根。

**AB0–AB7 实际准备。** 已按预先登记顺序选取linkding与django-todo的固定commit，分别提供5文件35,292字符及7文件18,549字符，均保留完整文件及许可证。两项目×两操作×原/变共8状态，固定16分析单元；只覆盖owner、认证读者、assignee、group/staff关系下的授权可达性，不执行目标。作者为四个独立Luna上下文，另四个干净接力完成一轮修订。DSL首稿8/8因未知字段不通过；MD首稿虽非空但8/8混入作者阶段不回答指令，不算语义就绪。共享阶段说明与v2字段说明修订后，由作者自行重写，主代理仅原文转存。两DSL作者均报告重复复制公共字段，增加可选白名单整项替换composer，测试先红后绿；不重写本轮作者输入、不虚构节省。最终8份DSL与8份中立manifest检查通过，16单元mock全部完成；193测试/1402断言通过。结果、首稿、修订原文与作者token分别保留于AB根。

**AB8 真实生成结果（2026-09-22）。** 固定顺序的16个 fresh-context 单元全部 `completed`，16/16 provider calls 响应，0 completion-unknown，0目标执行；被测为`xty/gpt-5.6-sol`、temperature0、auto-probe off。已知 input/output/cache-read 为146,886/17,566/6,528 tokens，actualUSD unknown。原始canonical label为14个`source_refuted`与2个`source_supported_failure`；后一项的回答正文自述正确方向但标签相反，保留原始字节，等待AB9冻结评价。四组compare均标记变化任务 `needs-review`，未宣称语义复用或节省调用。机器摘要见[`experiment-catalog.json`](../../results/skill-ir/experiment-catalog.json)，逐单元回答见`authorization-external-reuse-v1/answer-reading.txt`；本轮仍属于development evidence，不证明生产安全、目标执行或跨项目泛化。

**9月26日恢复决定。** 原执行因账户额度中断，已核对16条终态，采用AB revision 2接着评价而不重发生成。run/result原始字节保留，评价区分标签一致性、实际授权推理与解释完整性。部分本轮证据尚未提交，由恢复任务精确归档。新增独立AC编辑支持回应作者未知字段反复修改，AD目录工具回应跨轮结果检索/维护负担；它们各有独立任务书和文件所有权，AB统一发布共享文档。尚无这两个工程任务的使用收益数据。

**AB9评价与裁决。** 所有生成终结后，按冻结v3 rubric逐criterion绑定原始回答哈希，主代理阅读16条解释与事实，并独立点验两项标签错误及todo代表项。Markdown为8 full；DSL为6 full、2 incorrect，均为linkding变化任务。remove-owner正文甚至自行写出正确标签，asset-anonymous也正确说明deny，但两者canonical仍为`source_supported_failure`。实际preview已明确`source_refuted`表示政策被执行，wire与canonical标签相同，未定位共享合同/归一化缺陷，因此追加生成0。实际allow/deny推理、必要控制、解释、scope、transport和delivery均16/16正确或通过，不能据此把两项交付错误改为成功。两条remove变化答案缺精确成功响应细节，仅记optional missing；两臂该细节均7/8，不影响full。初评、独立点验与裁决分别保存，离线重算重现summary SHA `148dc888...b917`，0 provider调用。

**AB10负担与价值。** 两臂各8次调用、无fallback/repair。Markdown input/output为69,011/8,572，DSL为77,875/8,994；累计provider响应耗时497.3/455.1秒。原报告input+output口径为DSL多12.0%，耗时少8.5%。2026-09-27复核发现provider适配器的input已扣除缓存：MD另有6,528 cache-read，完整prompt+output为84,111；DSL为86,869，因此这一完整口径为多3.279%。两个百分比对应不同指标，旧机器summary保持原字节，由AG追加可复算澄清。缓存与收费单价各自影响费用，actualUSD仍未知。模型作者四组各一次干净修订：首稿语义就绪均0/8，最终各8/8；DSL/MD作者总token为671,649/789,130，项目间方向相反，包含系统、工具和缓存上下文，不是独立人工准备耗时。DSL四组变化涉及6/8/5/6个JSON路径，MD相应替换5/6/3/3行，单位不可互换；未证明同步改动或工时减少。分析、作者、开发/评价代理成本分账，actualUSD与真人时间未知。

同schema/核心/包复用了角色、资源、政策、入口、义务、引用和运行合同；新项目仍需准备源码闭包、规范政策、关系与场景、入口位置及研究专用manifest/rubric。四次compare均`needs-review`，有结构化影响提示但没有缓存答案或减少调用。composer回应两作者机械复制，只是可选整项替换辅助，未用它重写本轮输入或实测节省。同helper下的完整Markdown在本小面板质量更好且分析token更少；无需结构化复用时优先轻说明。MD目前仅研究入口，普通使用继续显式plain/v4，按覆盖/条件需要选择ledger/conditions，兼容默认不改。

**AB11交付与边界。** [薄包](../../examples/authorization-assessment/reusable-skill/SKILL.md)保留完整synthetic输入及实际文件名，依赖已有SkVM/Bun。八份真实DSL输入及源码移到仓外临时目录，经普通CLI check、inspect、compare；执行环节离线注入原始wire建立新验证session，逐条确认语义payload未变，原始session未改，网络provider与新模型观察均0。它验证可携带使用路径，不算新增研究成功。实际prompt parity确认八状态作者MD原文、共同源码和合同一致；无项目名核心分支。两个项目均属Django，当前八状态没有自然政策失效正例或部署unknown；这些输入不是新skill家族，也不支持全仓发现、生产安全、人工节省或纯语法因果。完整分项目/状态/臂成绩与成本见[AB汇总](../../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/summary.json)。

**独立工程后续。** AC针对作者未知字段问题补充本地draft-07编辑资产、字段反馈和有限结构差分，保持v2/runtime权威；105结构用例及12个runtime-only反例检出，未改变AB材料或增加作者试验。AD提供现有实验目录的离线查询、显式路径核验与带来源版本的摘要导出，不读取答案或重新评分。两者均为确定性工具交付，没有模型质量或真人时间收益数据，也不增加研究样本、skill家族或当前长期文档成员。


</details>

### 7.26 AE/AF/AG 结果表达、场景复用与计量

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-27复核AB、AC、AD后，新鲜授权回归202/202、1919断言、目录工具24/24、147断言及typecheck通过；本地与origin均为2525d387。MD8/8、DSL6/8的质量结论保留。两个错误的wire和canonical同向，renderer已有枚举定义，因此下一轮检验更直接的表达能否减少模型标签选择错误，而不把它描述成已定位的归一化bug。

**AE完整方法实验。** [AE任务书](../superpowers/plans/2026-09-27-authorization-explicit-policy-result.md)让可选wire/v5使用`satisfied / violated / undetermined`表达声明政策是否满足，宿主映射既有canonical；源码判断和理由仍由模型产生。普通入口及MD研究入口共用接线，旧v4/default保留。四个已暴露linkding原/变状态加Open WebUI政策失效/部署unknown两例，MD/DSL×v4/v5共24首轮。两因素分开比较，材料与评价要求一致；错误/未知完整保存，一次共享代码修订最多4追加。本轮按development机制验证执行，实际结果见下方AE5–AE7记录。

**AF独立使用工具。** [AF任务书](../superpowers/plans/2026-09-27-authorization-scenario-workspace.md)把已存在的整字段composer接到显式场景工作区，验证后一次生成普通authoring/v2输入及来源说明。共同政策只维护一份，变体明确填事实；不自动推政策真值、复用旧答案或引入新任务语言。它有自己的示例、测试和交付，进展不依赖AE真实面板。

**AG独立计量模块。** [AG任务书](../superpowers/plans/2026-09-27-token-accounting-semantics.md)区分非缓存input、inclusive input和unknown来源，输出完整prompt/total及缺值诊断。AB分析适配器扣缓存，作者日志input已含缓存，两者不能套同一公式。AG追加AB澄清证据，旧raw/summary/评分不动；新AE报告采用明确口径，费用未报告继续unknown。

三个任务直接在skill-ir-aot独占路径并行；AF/AG只写新增模块及其结果，AE是共享文档和Git唯一发布者。结果状态分别记录，不把独立工具测试计入方法样本。开发Astra ultra、宿主Fast/priority；被测Sol配置保持登记值，精确1.5倍速度未测。后续在本节追加根因、修复、验证及方法取舍。

**AE1–AE3实现。** `policy-result.ts`以strict schema替换模型字段，复用v4 fact、coverage、condition schema及既有引用检查；satisfied/violated/undetermined仅映射到source_refuted/source_supported_failure/unknown。模型原始v5、normalizer/v5与canonical/v0分开保存，inspect显示两层身份；任何v5归一化错误不交付canonical。host、renderer、普通check/run/inspect/compare和MD恢复贯穿显式v5；MD默认v4、普通legacy默认均保持。旧作者材料中的输出版本提示以共同结果合同为准，不改任务事实。红测覆盖三态、字段互斥、未知缺失事实、非法引用、三method、一次repair、timeout不重发、resume版本与compare继承；预面板授权回归211测试/2004断言通过。

**AF共享接口协调。** 生成输入位于新目录而源码不复制，原input-directory边界禁止`../project`，与搬移合同冲突。AE导出`loadLocalAuthorizationInputValue(value,inputFile)`共用文件loader内核，允许明确的相对父目录选择；源文件仍受effective sourceRoot封闭，root junction不得隐式越过显式选择的共同祖先边界。未来输出目录不必存在，check-only无需写文件。原junction与文件symlink反例继续通过；8测试/35断言。AF独立完成原始坐标与最终坐标双重语义核对。

**后续投入优先级。** 用户确认单次回答质量改善约60%、编写/修改/复用约40%；这是问题选择与投入优先级，不形成加权总分。当前AE/AF/AG范围和预算保持，尚未扩大到完整安全审查或新类别。

**AE4固定材料。** 四个linkding状态的独立作者MD、DSL、neutral manifest和源文件按AB字节复用；Open WebUI file/header用AA普通输入与源码，MD由开发主代理从单独保留的公开brief一次编写，不调用DSL renderer、不读取oracle答案。两臂共享公开问题、条件范围和输出合同；既有材料中v4/旧enum的输出提示由显式v5共同合同覆盖，事实不变。`97788944`实现及实际源码哈希、六例/24单元交替顺序、既有v3 rubric哈希和原预算写入AE panel-config；一次零网络provider演练24/24 completed。随后按此配置执行首轮，生成终结前未读取评价材料。

**AE5–AE7实际机制结果。** 冻结的24单元均一次获得终态`completed`；生成全部关闭后才读取既有AB/AA rubric，按原始provider回答SHA逐criterion完成24份review。四组Markdown-v4、Markdown-v5、DSL-v4、DSL-v5各6/6 full，政策结论与实际allow/deny/unknown推理均24/24正确，必要语义均支持；四份trusted-header均合理保留部署unknown。新增v5没有减少本轮反向标签错误，因为新v4也没有此类错误；不能把AB旧DSL 2/8错误改写为本轮v5的收益。首答完整交付四组为6/6、6/6、5/6、5/6；DSL-v4有一次prompt-parse fallback，DSL-v5有一次domain repair，最终均full。没有共享实现缺陷，追加单元0。结果仅对这六个已暴露development案例和共同helper流程成立，不说明一般可靠性或单独语法因果。[冻结配置](../../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/panel-config.json)、[逐项review](../../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/evaluator/review-decisions.json)、[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/panel-summary.json)及[离线回放](../../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/ordinary-verification.json)可复核。

按AG明确的`skvm-disjoint`口径，四组完整prompt+output分别为59,848、59,549、75,751、75,580；同表示v5相对v4为Markdown -0.50%、DSL -0.23%，其中prompt本身分别+0.62%、+1.71%。两组DSL比同协议Markdown完整token多26.57%/26.92%，这里含各自一次额外调用。全部26次实际provider dispatch有用量记录，实际USD均未报告；已知响应时长分别约249.8、265.4、398.0、380.9秒，单样本无速度结论。模型收费与开发代理费用不可从token或字符估算。逐次计量包含fallback/repair，零缓存读取如实记录；生成后评价与离线重放均零provider。最终选择保留兼容默认，v5作为可选、语义清晰的表达，不宣称已提升质量。

**AE8普通搬移验收。** 六份原DSL输入与源码复制到仓外临时位置，普通CLI对v4/v5共12次check，离线注入各原结果wire建立12个新session，并逐一inspect canonical payload与compare完整依赖；12/12一致，网络provider、目标执行和新模型观察均0。该复现验证普通使用路径与记录可携带，不扩AE生成分母。

**AF场景工作区交付。** 共同base、三个明确场景replacement生成owner/outsider/role-override三份普通authoring/v2与非语义来源sidecar。只读预览报告字段来源与搬移坐标；发布仅Windows，以独占新目录避免覆盖，并在作者原坐标和最终坐标检查声明与源码边界。整份工作区复制到普通C盘临时目录后，三份原场景及共同政策文字更新后的三份输入均经主CLI检查；旧生成字节不变。65个focused测试通过、1个平台跳过、149断言；集成路由额外先红后绿。它证明有界字段装配和维护单份政策，不测真人编辑时间、模型正确率或token节省。见[AF ready](../../results/skill-ir/authorization-scenario-workspace-20260927/ready.json)和[完整示例](../../examples/authorization-assessment/scenario-workspace/README.md)。

**AG计量口径交付。** 纯模块区分`skvm-disjoint`、`inclusive-input`与`unknown`，并让完整总量、已知小计、缺失记录及无法计算的百分比有不同表示；独立离线脚本复算AB16条分析usage，校验19个原始来源hash，旧报告原字节不动。AB完整prompt+output Markdown 84,111、DSL 86,869，即DSL +3.279%；旧+11.969%仅是fresh input+output。作者含缓存input的总量Markdown 789,130、DSL 671,649，账户不能混加。AG focused 50测试/131断言及脚本typecheck通过；它提供可比成本口径，不改变AB质量，也不提供实际USD、真人节省或host精确速度倍率。[AG澄清](../../results/skill-ir/token-accounting-semantics-20260927/ab-accounting-clarification.json)与[计量模块说明](../../scripts/token-accounting/README.md)保存来源和限制。

**交付后复核与下一问题（2026-09-27）。** 重新运行授权、AF/AG与目录工具相关353项测试，352通过、1个平台跳过、2440断言；typecheck及AE零provider离线重算通过。四组`explanationComplete=5`而full=6已点验：每组file-positive没有单独explanation层criterion，因此该维度为not-applicable，并非把partial当full；trusted-header响应细节单独分层，必要判断未因可选细节加分。MD首答6/6、DSL首答5/6和最终6/6继续分列。交接各23份AF/AG文件摘要匹配，当前提交均已跟踪。

当前最明确的研究发现是：单次更名结论协议没有显示增量，模型输出波动存在，六个已暴露案例尚不能区分更深的领域方法。下一步按质量60%/复用40%检查同一授权类内的真实困难关系：身份与目标资源绑定、上游控制、角色例外和外部事实。先用案例定位缺口，再决定是否需要显式控制对象/路径关系，不能只再添加通用coverage字段。实验保留同资料Markdown与旧方法对照，若引入额外模型轮次则匹配调用预算；复用已有AF减少准备重复，费用沿用AG字段。该方向为建议，尚未生成新样本、协议或模型结果。


</details>

### 7.27 AH 语义质量与真实编写复用

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-27，用户在交付后复核基础上确认继续开发并要求新任务获得完整上下文。[AH0–AH14](../superpowers/plans/2026-09-27-authorization-semantic-quality-and-reuse.md)由一个`gpt-6-sol / max`任务负责，基线为`08ac8b93`及规划提交。质量约60%、编写复用约40%是投入顺序，两个方向分别验收。以下保留预设方法，再记录实际执行与取舍。

**代码与问题。** 现有`relations.ts`已列entry/identity/resource/decision/effect/external六类问题，`prerequisiteIds`表达分析依赖；`relation-result.ts`核对同义务coverage及事实引用，`render.ts`已有领域因果链文字。下一实现需要解释新增机制如何超过这些已有支持，不能只再添加一份通用清单。候选支架把每个显式义务中的主体、效果目标、控制对象和适用条件组织为局部对照问题；源码里的对象相等性、控制可达性、角色例外及外部事实仍由模型分析，宿主不从引用存在推断真值。

**选择与实现。** 继续改结论标签的收益证据不足；直接建设控制流分析器或全仓发现会扩大干预。当前选择在现有authoring/v2及wire之上实现显式`control-binding-v1`策略，先用真实反例与旧profile对照，再确定最小pure compiler/renderer。strategy=standard保持历史prompt及默认；普通check/run/inspect/compare、MD研究入口和恢复身份贯穿实际选择。新增关系字段须有真实表示缺口，默认不增加wire版本或第二套执行器。

**可区分的实验。** M0/D0分别是独立Markdown和现有DSL；M1/D1分别给两种表示相同的新支架。四臂同源码、政策、公开问题、plain/v4、模型和修复机会。若M1/D1共同改善，收益归共享领域方法；D1–M1才帮助解释相同支持下的表示/流程差异。预案上限是10状态和4重复、最多56分析单元；真正冻结时按资格选出8状态和3重复，共44单元。全部原始结果、必要语义、可选细节、首答、repair和完整token分别报告；结果出现后不换题或调低要求。

**复用的实际问题。** AF的整字段替换可能遮住base政策的更新，这也是合法override。新增只读变更反馈应定位继承、覆盖、最终值变化和复查范围，提醒作者核对适用性，不能擅自覆盖其政策。两个中立任务包分别安排独立MD/workspace作者的原任务和变化任务，记录真实草稿、诊断、修正和遗漏；模型作者与真人分钟分开。完整运行依赖继续用于旧结果适用性判断，不按答案引用子集缩小。

**研究维护。** 来源职责映射补到§4/§7.9，本轮设计、反例、实现问题和取舍在本节更新，机器材料进入AH单一结果根。实际问题按触发、根因、解决、验证、方法变化简写；当前主题随实现同步，不建立另一套每轮研究报告。新任务负责有限回归、普通使用示例及origin发布，旧结果与本地历史材料保持原样。

**AH0–AH6实际进度。** [来源职责映射](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/skill-duty-map.json)确认Cloudflare security-audit与GitHub security-review是两个独立正例家族，但仅取其单repo/ref授权路径职责；Trail of Bits diff review及Sentry skill-scanner保留近似反例。目标项目是输入，不扩增skill分母。两个不同源码情形给出可问的区别：Open WebUI file路径检查源文件ownership却写入另一目标集合；process_text路径的caller/helper先做有效目标写权限检查，不能仅因sink局部无检查就报失败。现有六类requirement和fact/citation足以承载答案，缺的是义务局部的对象/路径适用范围提问。故纯`reasoning-plan.ts`只产生问题、不填源码结论，不增加schema或wire；standard无新增段，MD与DSL共享同段，repair保留。普通check/run、会话身份、inspect和compare均接通；两个聚焦红绿阶段及typecheck通过。这是工程事实，语义收益待四臂模型评价。

**工作区反馈。** 只读比较从同一次plan读取保存base字段快照，并为每个variant保存有效源码字节摘要。报告共同字段变化、继承/整字段override、有效声明变化、成员增删及复查原因；相同值override仍按显式来源解释，单纯生成目录搬移且源码字节相同不冒充有效源码变化。旧run适用性仍由完整执行依赖检查，引用过的部分文件不足以自动复用答案。AH6 synthetic测试覆盖政策继承、override遮蔽、无效引用、成员增删和坐标搬移；尚无真人节省证据。

**AH2材料与分母。** [候选登记](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/candidate-selection.json)在新模型输出前固定4个旧锚点+4个Gitea/FastAPI新AH状态，三目标项目、零synthetic真实面板状态；Gitea曾出现在早期development面板，不能写成未暴露或新skill家族。八份普通authoring/v2均通过无provider检查；独立干净上下文Markdown作者的原稿及文件坐标修订理由单列。四臂为8×4加3个预选新状态重复×4，共44单元；新状态缺外部部署事实型合格材料，因此没有硬凑第4个重复。rubric按实际效果allow/deny/unknown、政策标签、必要关系、解释和可选细节分层，评价材料与模型输入物理分开。

**AH7–AH9运行和盲审。** [冻结配置](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/panel-config.json)记录同一`xty/gpt-5.6-sol`、plain/v4、每单元6000 token及相同修复机会；SHA-256为`b22651ddbf1722d57596d66f67bc6aa5b25ae0cb5993c2833ce7dc7d98a73284`。44/44已dispatch且completed，恰好44次provider调用、0 fallback、0 domain repair、0 completion-unknown、0目标执行；预设的共享实现修订条件未触发，修订单元0。生成关闭后，8份匿名包由独立只读评审覆盖44行；9条决定性或代表性unknown再由两位独立评审点验。评分时机械转换答案定位为JSON pointer并清空4条`missing`项的无效位置，原意见、转换及4条位置更正均保存。二审的trusted-header分歧按冻结rubric裁定两项：一条答案漏认证失败不发会话的必要分支，另一条漏明确的四结果枚举；二者从supported改为missing。其他分歧按明确结论标签和输入已声明主体保留首评，理由见[裁定](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/evaluator/adjudications.json)。[44行汇总](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/panel-summary.json)经零provider离线replay逐字复现，摘要SHA-256为`d0d7cce1cec974a165c8dd2682005dfb21f6074b46fe0e8faab5f09408d49ee5`。

| 臂 | 初轮full/8 | 预定重复full/3 | 合计full/11 | 正确政策标签/11 | 必要语义supported/11 | 完整prompt+output tokens/11 |
|---|---:|---:|---:|---:|---:|---:|
| M0 Markdown标准 | 6 | 2 | 8 | 11 | 10 | 34,264 |
| D0 DSL标准 | 4 | 1 | 5 | 8 | 11 | 45,237 |
| M1 Markdown局部支架 | 6 | 2 | 8 | 11 | 10 | 41,402 |
| D1 DSL局部支架 | 5 | 2 | 7 | 10 | 10 | 50,905 |

**问题→根因→解决→验证→取舍。** 正确解释拒绝却选择相反政策标签在D0的controlled-text一次、lock两次出现；D1修正这三次，但FastAPI superuser读产生一次`unknown`过度弃答。M0/M1的政策标签均11/11正确，未观察到共同方法带来的标签增益。Open WebUI header四臂都漏协议HTTP 403及完整四结果说明，M1另漏认证失败不发会话的必要分支；Gitea assignee初轮和重复均缺至少一项条件分支，局部支架没有解决这两类解释问题。M0初轮assignee另漏一项必要路径，M1补齐，但该答仍partial。根因是模型在现有义务与源码上作局部语义判断和标签表达时不稳定；现有六类requirement已能表达目标关系，没有证据需要新机器关系字段。解决仅把义务局部的控制对象、效果对象、上游路径、例外和外部事实问题做成可选共享支架，并交由独立语义评价判断。相同问题在MD没有提升full，在DSL有2/11净提升却仍低于MD同支架，故不把单臂增益归因于DSL编译，也不改普通默认。M1比M0多7,138完整tokens，D1比D0多5,668；相同支架下D1比M1多9,503。适合单次任务时仍优先更轻的Markdown说明；`control-binding-v1`是供明确需要局部路径核对时显式试用的研究选项。

**AH10–AH11作者与普通使用。** 两个中立包分别测试FastAPI公共政策变化和Gitea other-user→self关系变化，各有独立MD/workspace模型辅助作者，计4份原稿和4份变化交付；两次不合规/不完整尝试排除并保留缘由。FastAPI公共政策在工作区base改一次，foreign场景显式改、owned场景继承生效；MD两份文本均修改。Gitea仅other-user场景变化、self场景保持，工作区变更报告准确显示有效主体/资源/场景变化；但changed replacement的`taskId`来源文字仍称“查询他人”，结构检查未发现该语义矛盾，按原稿保留。[作者检查](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/author-study/changed-checks.json)及[普通临时目录演示](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/ordinary-demo.json)显示compose/check、只读比较、既有mock inspect均可用，未对变化任务重新发模型答案。文件数和JSON路径数不是同一工作量单位；真人分钟、作者模型token、生产复用质量均未测，不能声称省时或更准。

**成本与边界。** 四臂合计118,328完整prompt和53,480输出，共171,808 tokens；cache-read已单列计入prompt，44条usage均有值，实际USD为44条未知。作者模型用量与真人时间另列未知，不折算费用。两个独立正例skill家族提供任务职责，三项目八状态只是公开development测试输入，不支持全skill转换、跨模型或未见项目泛化，也不证明目标部署安全。工程的只读政策继承/override提示可帮助作者定位应复查处；旧答案是否适用仍需完整运行依赖和语义复核。AH的研究结论为`mixed`：DSL臂有局部改善与回退、共享方法无稳定完整性提升、增加token；工程复用有可核验作用，但真人效率未知。


</details>

### 7.28 AI 任务语义答案合成与变化后复用

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-27，AH复核新鲜复现338 pass/1平台skip、2372断言、typecheck及零provider离线摘要；本地/origin均为`d1b82005`。用户确认[AI0–AI16任务书](../superpowers/plans/2026-09-27-authorization-task-semantics-and-reuse.md)，由新的`gpt-6-sol / max`任务在主开发分支连续执行，质量60%/复用40%分别报告。

**问题定位。** AH的DSL增量主要是三次标签方向修正，同时superuser任务新增过度弃答；D0必要语义11/11而D1为10/11。输入已给定caller身份，但当前author facts为自由文本，模型又要求证明源码裁剪外的认证绑定。新策略仍是每义务四类问题，分支和自由解释的语义由模型承担。plain路径已经把声明自然语言化，因此下一工作要改任务语义和程序责任，而非宣称首次把JSON变成自然语言。

**公开要求与评价。** 旧Markdown入口移除单独publicAnalysis，靠作者正文承载问题；assignee当前无write权限的任务又被要求解释权限为真时的其他分支。本轮建立无答案的共同公开要求段，两种表示逐字共享，区分当前问题与显式请求的反事实/响应细节。旧评分原样保留；新评价主任务以实际交付要求为依据，额外解释单列。

**选择的实现。** 在authoring/v2/normalized input增加可选版本化analysisContract sidecar，表达declared-entry/supplied-path/deployment边界、局部任务假设和有界请求分支；复用当前condition/compiler/引用检查。模型仍分析源码，程序解析引用、展开请求、检查遗漏和确定对照。wire/v6允许模型提供实际allow/deny/unknown，由宿主对照无条件policy expectation；conditional明确保留模型政策判断。新旧接口兼容，不从自由解释猜结果、不把作者假设当部署真值、不建控制流分析器。

**完整使用。** 新语义贯穿check/run/inspect/compare和workspace。作者两包原/变输入实际运行并独立评价，弥补AH只检查变化文件的缺口。旧taskId可保持稳定身份，当前摘要与历史来源说明分开；结构诊断不冒充语义审查。首稿失败、越界尝试、修订和真实消费费用单独记录，没有真人记录时不推算真人收益。

**研究安排。** 8状态四臂及4预定重复共48主单元，三机制的outcome-only观察6单元，作者真实原/变消费最多16单元；共享实现bug修订另最多8。M0/D0与M1/D1分别比较旧/新支持，同支持再比较表示。全部公共事实与要求相同，程序不读oracle；来源和新场景变化明确记为development。小设计调整写入本节和任务书后继续，不增加日常确认。

**AI1–AI3 落地。** 本轮结果根已在模型生成前冻结8题公开要求、显式请求分支和分层rubric；两个新增状态是原源码上的`declared-scenario-variation`。作者`analysisContract.scenarios`仍按作者名称索引；lowering产出的normalized sidecar改为按`obligationId`列举场景，`atEntryId`和`conditionId`均为稳定canonical引用。布尔赋值在normalized侧写成`true/false/unknown`字符串，以便沿用已有condition值域。程序只展开可运行的已声明入口，入口前提不跨入口传播，反事实不含预期effect。v6预定采用互斥`decision`对象（unconditional的`observed`或conditional的`policyStatus`）及独立薄`branchResults`；普通plain不被迫输出relation coverage。旧输入无sidecar时保持旧结果结构和默认选择。AI3聚焦测试已红绿通过；这一段仅说明接口和离线工程，不宣称答案质量改善。

**AI8–AI10 真实质量证据。** [冻结配置](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/panel-config.json)SHA-256为`a9adbb38...01f63d8`；8状态、54单元在首个分析模型调用前确定。全部单元只占用一次：40 completed、9 timeout-unknown、5 transport-failed；55次provider调用含1次诊断修复，41次收到响应，14次usage未知。已知input 75,463、output 43,204、cache-read 48,256 tokens分列，实际USD未报告，不作零成本推断。完整分母、逐单元结论与离线重放见[AI summary](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/panel-summary.json)，评价只读模型和代码证据而非schema字段存在。

初轮计划各8：M0/D0/M1/D1最终full分别8/6/7/8；D0两条timeout。双方均完成的配对里，M0→M1为8→7，D0→D1为6→6；OWUI file一条固定crop的helper前缀缺口可合理支持unknown，保守敏感性把M1改为8/8，因此不能据这条宣称新支持变差。重复各臂计划4，完成数依次0/1/2/3，网关超时与断连使该区块没有可解释的质量胜负。v6机械地从observed行为推出政策标签；两条label-direction机制观察均正确，但旧臂本轮已完成答案也正确，没有实测完整率增量。入口前提和显式请求分支在初轮已完成答案中均获独立语义支持；请求分支的两条单独机制观察均超时。结果是可靠工程支持与不确定/中性质量证据，不是自动授权安全决策的证明。

评价用新公开rubric的薄study适配层，而非强行复用AH v3 evaluator的旧固定oracle条目；普通host的事实引用、条件和显式分支验证保持权威。41份匿名回答由8个fresh-context只读评价者逐案核验，Gitea self首评误读`source_refuted`经已测试真值表与独立复核修正，OWUI file争议保留主口径和敏感性。生成结束后才建评价包；全部packet原文/hash、映射、评分和裁定均在结果根。

**AI11 独立作者和消费冻结。** 两包中立brief分别交给Markdown和结构化作者；各作者的变稿只看自己的原稿。8份首次尝试中5份直接有效、2份在传输层无响应、1份JSON结构错误。传输重试后两份结构化原稿有效；结构化Gitea变稿的一次诊断修订仍多一个结尾`}`，因此作者最终有效交付为7/8。为完成下游消费，另存原始失败和[单字符机械恢复记录](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-packages/gitea-relation-change/dsl/recovery.json)，仅删除末尾多余括号，字段与字符串未改，绝不计作者成功。12个外层作者请求中9个收到响应、3个传输失败且usage未知；已知input 14,329/output 10,873/cache-read 1,792 tokens，实际USD和内部HTTP重试次数未知；真人分钟未测。[作者账户](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-use-account.json)保留逐次尝试。FastAPI变稿准确改为owner-only政策且源码不变；Gitea变稿准确变为self关系，但结构化作者还改了taskId、scenario key及若干说明字段，属于作者编辑扩散，不能把所有prompt变化归于关系变化。Markdown消费使用仅从中立brief组装的必要runner输入，不读取结构化作者产物。[8 session/16场景消费配置](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-use-config.json)在调用前冻结，SHA-256 `0f454556...9a2e9740c84`；AI12按该冻结身份消费，并将作者失败与分析失败分开报告如下。

**AI12 修改后真实消费。** 冻结的8个fresh-context session全部完成，原/变各4个，每个回答2个场景。普通run的wire/v6实际行为与宿主派生政策标签经[逐案独立源码复核](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-use-reviews.json)为16/16 full：FastAPI未改源码下，owner-only变化使superuser-read从政策满足变为源码支持的政策失败，foreign-update仍为deny；Gitea nonadmin查询从other变self后由403变为通过guard并查询已给定存在的collaborator，repo-admin场景保持allow。所有答案均明确入口假设不是上游身份绑定或部署事实证明。结构化Gitea变稿来自上述机械恢复，故16/16是**被消费答案**的语义成绩，不能写成8/8作者直接有效。一次Gitea Markdown原稿首答结构未交付，经既有一次诊断repair后完成；分析总计9次provider调用、9次响应，已知input 27,782/output 13,531/cache-read 3,200 tokens，响应耗时求和344,124ms，实际USD未知。作者与分析合计已知input 42,111/output 24,404/cache-read 4,992；3次作者传输失败的用量和实际总费用仍未知，真人分钟未知。原/变session都用普通inspect核验，4个changed输入对原session的compare均为`needs-review`，未把旧答案当新答案；[hash-bound汇总及零provider重放](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/author-use-summary.json)保留完整逐项账户。

**AI13–AI14 普通交付与方法取舍。** [可搬移合成示例](../../examples/authorization-assessment/task-semantics/README.md)包含入口已给定身份、显式反事实、部署未知和仅改接受政策的workspace变化；在普通临时目录compose/check了两种synthetic输入，并搬移FastAPI作者包/同字节源码进行compose/check，用真实已存session离线inspect/compare验证变化依赖定位，零新增provider或目标执行，记录见[ordinary example](../../results/skill-ir/skill-dsl-research/development/authorization-task-semantics-v1/ordinary-example.json)。工程已完成可选语义合同、局部程序、分支闭集与确定政策对照的普通生命周期；fixed crop上的模型语义仍须审阅。AI8–AI10同要求质量面板未显示稳定的新机制优势，重复区块又受传输缺失限制；AI12的16/16只支持这两包已暴露development原/变任务的端到端消费，不能当作机制相对Markdown的新增质量增益。当前普通默认保持兼容：简明一次性源码问题可继续plain说明；当用户确实给出入口假设、反事实或政策变化，并需要遗漏检测与确定政策对照时显式使用`analysisContract`/v6。没有真人时间、美元或未见项目证据，不主张编写省时、成本回本、一般可靠性或部署安全。


</details>

### 7.29 AJ 证据准备与局部修改

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-27父任务复核：`47c08965`与用户origin同SHA，工作区干净；359 pass/1平台skip、2494 assertions、typecheck通过，AI面板和作者消费评价均零provider复现。用户批准继续并要求开发任务配置`gpt-6-sol / max`（被测provider另为`xty/gpt-5.6-sol`），按[AJ0–AJ16任务书](../superpowers/plans/2026-09-27-authorization-evidence-preparation-and-local-editing.md)在主开发分支连续推进。2026-09-28 AJ0从规划提交`8fa7280a`的干净工作区启动；实时恢复位置见[AJ status](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/status.json)。

**根因与方法。** AI争议行的helper前缀没有进入固定裁剪，评分者对可达结论产生合理分歧。现有v6可以检查标签映射和请求分支，但源码材料是否足够仍取决于准备。作者变化稿先全量重写JSON、再求顶层diff生成workspace，出现taskId/场景名扩散和括号错误。AJ把改进放到这两个真实环节：运行前的有界证据准备，以及先产生局部patch再由程序物化。

**证据准备。** 保持单repo/ref和显式入口，按允许文件、原行号、指名依赖和预算构造普通输入及紧凑缺口报告。完整文件在预算内优先保留；显式范围和可靠定位可补充，模型建议只作为待检验路径提议。声明材料齐全与实际控制有效分开；partial允许携带缺口继续分析，越界或身份错误拒绝。分析模型继续fixed-context/零工具，不引入全仓自动发现或目标执行。新准备器同时服务Markdown与DSL。

**局部修改。** 使用现有policy/scenario/entry key，模型只提交要变的政策、关系、expectation或前提。程序检查冲突、稳定身份、影响场景并输出完整v2，复用workspace/compose和普通check/run。政策文字改变后需要明确受影响场景的政策对照，不能靠当前源码倒推规范。旧compare继续按全部模型输入依赖复查，不以引用子集复用答案。具体接口、路径和测试由AJ任务书统一维护。

**研究设计。** 8个公开development任务中的2个为AI回归，6个为此前未进入效果面板的同类任务；至少3个源码项目，至少1个新项目。材料按来源/结构资格选定，不按方法成绩选题。四臂为Markdown/DSL×原材料/新prepare材料，同证据层内共享原字节及公共任务。32初轮加8预定重复，另两包8session原/变消费；共享bug修订单列。分别判断共同证据准备、领域表示、局部编辑的收益，并报告首次失败、未知请求usage、准备与分析成本。用户质量60%/复用40%的投入取向保持，当前不承诺positive。

**执行约束。** AI14个传输缺失先诊断；新生成按任务交错四臂、默认串行，连续基础设施失败时先完成其他工程并保存未派发队列。旧失败不会被重发覆盖。研究与开发问题持续追加本节，完成后给普通示例、真实证据和当前建议，不扩增平行研究正文。

**AJ0–AJ1接口核对。** 2026-09-28从干净`8fa7280a`启动后，读旧AI生命周期可证实9个`timeout-unknown`含180秒客户端deadline、5个`transport-failed`含网关socket中断；旧结果不能证明共享provider代码缺陷，也不能把未知usage补零。`loadPortableSourceBundle`已经封闭文件与junction边界，catalog/sourceId和普通check/run共用；locator仅做literal命中，不会识别完整函数。因此准备请求的`from`可以引用entry或依赖ID以实际应用深度预算，`match`只验证显式行范围的唯一命中。输出的normalized普通input内嵌来源/范围/缺口报告，loader核对快照行数并让普通source renderer把同一报告送到check和真实run。入口缺失时无可运行输入，其他依赖缺口可partial。局部patch由程序按既有key物化v2，不传taskId或oracle真值。上述小接口调整已同步AJ任务书，红绿测试将固定跨入口串用、缺helper、范围/预算和无关字段不变等反例。

**AJ2–AJ6工程接线。** 新`prepareAuthorizationEvidence`以portable reader读取请求白名单，先保留所有入口，再按声明依赖与预算读取；重叠范围合并，每个文件保留一段连续的原行号片段，剩余预算优先扩为整文件。缺失、歧义、深度和字节限制记具名gap，不由文件名推断guard。`authorization prepare`只在新目录发布normalized输入、source快照和report，check-only零写入/零provider。普通loader机械核对report身份、状态、文件列表及片段行数；render、run、session、inspect及compare共用同一准备上下文和完整依赖。新`applyAuthorizationLocalEdit`只接受声明key的policy/scenario/premise补丁；重复字段或未知目标报错，政策操作需每个引用场景显式给出expectation，包括不改变值的本次复查。`authorization edit`先做纯补丁、composer结构校验与相对源码根搬移，完整稿经普通loader验证才发布；缺复查时保存不可运行draft。先前聚焦测试34项/213断言与typecheck通过；最终聚合门禁仍待AJ15。不把确定性工程测试写成质量收益。

**AJ8候选约束。** 现有公开development索引中的Linkding、Django Todo已进AB效果面板，Open WebUI、FastAPI、Gitea已进后续效果面板；登记的两份外部skill职责映射不自动提供新源码项目。因此既有目录没有可证明符合“六个新任务、至少一个新项目”的现成候选列表。不能拿旧案例换名满足新样本要求。

**AJ3/AJ8–AJ9进度。** 可选`--proposal-model`现在发起至多一次位置建议调用，提议依赖仍通过原prepare validator；声明中的动态分派、外部中间件或缺符号可保留具体gap，费用/usage在有报告时单列。当前只有mock测试，没有真实提案调用。两个新公开项目Memos（MIT）与Paperless（GPL-3.0）以及AI回归项目固定ref的32个源码/许可文件已用Git blob身份核验；[case-selection.json](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/case-selection.json)在任何AJ分析答案前固定2回归+6新development任务及2个预定重复。实际先获取源码并只读核对可行性，后写正式候选登记，偏离原拟顺序；登记明记该偏差，生成后不按表现换题。新项目不因此自动成为外部skill成员。8组普通基线/prepare输入已通过材料审计；7份ready，Paperless share-create因同文件远距依赖超过64KiB为partial具名gap。OWUI基线改用无编辑性断言的原始完整handler，Memos GetShared修正为仅按token查询关联memo并保留token有效性外部未知。独立Markdown作者仅见中立brief，8次首稿均完成且逐份独立核验，实际费用未报告。独立evaluator-only oracle已在分析前封存。40单元四臂顺序、输入/实现哈希及重复位置冻结于[panel-config.json](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/panel-config.json)，SHA-256为`ed5fb8546282dca20aabacfa8cf9a0cc6a9bd7944ff599965eb2348bc7ff2821`；根据AI历史180秒客户端截止，在首个AJ分析调用前统一采用300秒/调用、900秒/session、6000输出token预算。普通check验证16份输入，6个零provider mock覆盖四臂及条件/双场景；重复check确认无自动重发，研究脚本单独typecheck通过。尚无AJ分析调用或目标执行。

**AJ10–AJ11质量结果。** 冻结40单元串行全部`completed`，其中3份Markdown首答经预定的单次诊断修复，实际43次分析调用、0 fallback、0传输未知、0目标执行。全部生成关闭后才物化40份匿名包并独立盲评；Memos GetShared的叙述与结构标签矛盾另行裁定。全分母首次完整交付37/40、首次full 24/40、最终full 26/40、结论正确27/40；初轮M0/D0各4/8 full、M1/D1各7/8，预定重复M0/D0各0/2、M1/D1各2/2。同证据层M/D初轮打平；准备材料在两个表示中均改善了OWUI file、Memos create-share与Paperless download，D1在Paperless share-create多一项full，却在Memos GetShared从M1的有理unknown退化为错误canonical标签。故这里可支持“决定性helper/source字节进入输入改善这组任务”，不能把共同材料增量算成DSL语法收益，也不能把ready或引用存在视为语义证明。Paperless share-create仍有64KiB具名gap。逐单元、成对差异、首次/修复与[零模型重放](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/panel-summary.json)保留原结果，未因分数触发可选共享修订。

**AJ12作者修改与消费。** 两个事先固定的Memos/Paperless包由互不看稿的Markdown与DSL作者各写原稿及变稿；DSL变化为局部patch、Markdown可直接局部编辑。8份首稿中6份语义有效：Memos DSL变稿漏更新政策location/revision，Paperless Markdown变稿包含答案式政策期待；两处各一次具体诊断修订后8份有效，首稿均保留。Paperless Markdown政策的等价改写曾被字面匹配误报；研究者构造的Markdown变更消费输入有一次未变政策revision误写，均在冻结消费前独立核对并记录。8个新鲜普通session全部完成，独立源码复核16/16预定场景full；四个变更输入的旧session compare均`needs-review`且本身零调用，随后各有独立变更run。Paperless DSL作者把三个helper也声明成入口，致其原/变两次各从2场景扩为8义务；8次消费合计28个expanded义务，额外12项均正确但明显增加输出工作量。消费[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/author-use-summary.json)把作者首稿有效率、最终有效率、场景质量和膨胀开销分开，不把16/16倒写成首稿8/8，也不把compare误称语义重算。

**AJ13普通交付与成本。** [可搬移合成示例](../../examples/authorization-assessment/evidence-editing/README.md)在仓外临时目录用同字节源码演练partial（`range-required`具名gap）、ready、局部edit、变更后ready和三次普通check，均零provider/目标执行；AJ12的8个真实session又经公开CLI inspect、四组compare复核，记录在[ordinary-example.json](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/ordinary-example.json)。研究调用分账：中立Markdown材料作者8次，input 4,939/output 4,437；质量分析43次，input 254,997/output 46,462/cache-read 37,120；两包作者含修订10次，input 22,255/output 7,468；两包消费8次，input 90,914/output 19,614。合计69次、已知input 373,105/output 77,981/cache-read 37,120，实际USD未报告，真人分钟未知。准备工程零实际模型提案调用。质量改善伴随较大准备后输入，且Paperless DSL多入口扩大消费输出；尚无同材料表示的稳定质量、人工节省或成本回本证据。保持旧普通默认兼容，只在用户有明确入口、所需helper及有界预算时推荐显式`prepare`，在已声明政策/场景局部改变时用`edit`并重新运行；源码缺口、旧答案适用性和固定裁剪边界继续显式呈现。该建议限公开development任务与源码可见判断，不等于生产安全或部署结论。

**AJ14–AJ15归并验证。** 工程、示例、使用说明、研究问题表、任务书、spec与实验目录已经按实际结果对齐；独立只读复核没有发现数字或新源码diff的可行动问题。新鲜授权相关回归376 pass/1平台skip、2597断言，主typecheck和全部AJ脚本typecheck通过；四项AJ离线replay均零模型，文档12测试、15782文件链接/治理扫描与实验目录检查无阻断。结果根1059 JSON及117 JSONL/361条记录可解析，定向凭据模式扫描零命中。旧AI面板runner的冻结实现哈希与AJ改动后的共享`local-run.ts`不同，按合同拒绝重新解释历史run；旧AI面板评价、作者消费评价及作者消费runner仍零调用复现。这个哈希拒绝不作为旧模型结果失败，也不改冻结身份。完整命令、摘要与限制见[AJ verification](../../results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/verification.json)。


</details>

### 7.30 AK 有界依赖准备与源码片段

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-29用户确认AJ复核后的方向，要求下一任务由`gpt-6-sol / max`执行。[AK0–AK16任务书](../superpowers/plans/2026-09-29-authorization-bounded-dependency-preparation.md)从干净`9105e74c`规划提交启动，AJ工程基线为`b0cfbc10`，继续现有主开发分支。研究调用使用`xty/gpt-5.6-sol`；开发任务配置与研究provider分别记录。

**问题与根因。** AJ的同文件范围合并为连续区间并使用余量扩整文件，远距helper把无关字节带入预算；Paperless share-create仍缺serializer-user。Paperless DSL作者把三个helper当分析入口，两次消费额外展开12项义务。实际依赖清单主要由研究者提供，模型位置提议只做过mock。另一个父任务mock确认：提议响应带用量但JSON无效时，普通Error和CLI退出丢失usage；旧AJ无真实提议调用，历史统计不受影响。

**领域方法与工程。** 明确任务入口和支持证据的关系，依赖只扩证据范围；在允许文件内先用可核对定位信息形成候选，再让可选模型提出位置/受限补读，宿主执行路径、来源和预算验证。模型不填授权答案或改政策。源码按多片段保留原字节及原行映射，catalog、引用、普通run与compare一起接线；省略区间显式展示，跨缺口引用拒绝。旧显式依赖v1兼容，新路线通过现有prepare显式启用。每次准备调用先留账再解析，已知用量与未知费用保留。

**评价设计。** 先对AJ原八份请求做零模型v1/v2同请求预算比较，隔离片段算法；真实路线只给入口、政策和允许文件，不能复制专家依赖表。八任务Markdown/DSL×显式依赖v1/自动定位v2共32初轮，两个预定任务各四臂重复，共40单元。两表示共享准备产物和缺口，完整流程成本包括准备。另两包8次原/变作者消费，检验范围是否膨胀、准备和编辑到底由谁完成。原始失败、修订与缺口均保留；受控源码变体标synthetic，旧材料不改。

**当前取舍。** v2显式依赖打包的工程收益成立，有界词法定位仍是可检查的辅助入口。自动路线未证明能替代作者列决定性依赖；同材料DSL也未显示最终语义增益。保持任务类别、v6及普通默认。已知依赖宜显式列原行范围并用v2；引用明显、文件白名单小的任务可尝试discover，按report补尚缺的决定性位置并重新准备。源码和政策变化仍需compare后fresh run。后续问题直接追加本节，不另写平行研究正文。

**AK0–AK2接口与留账。** 从干净`9105e74c`启动，用户origin同SHA。新版请求`authorization-evidence-request/v2`显式选择分段，报告`authorization-evidence-report/v2`在每文件保留原始包络范围及`segments`（原始/快照闭区间、来源）；包络不授予缺口引用权限。普通input/v1只扩展可选report联合类型，wire/default/旧v1连续扩整文件行为不改。定位读取1MiB、累计展示64KiB、最终64KiB、12文件、深度3的共同预算暂不调整。第一组反例证实原proposal在解析前丢用量且输出父目录预检太晚；复用现有telemetry，将dispatch/response事件持久化后才解析，失败account与发布目录分离。模拟123 input/7 output/$0.001、schema/位置拒绝、timeout与取消已有聚焦回归；超时完成未知不自动重发。Memos历史争议没有确定性共享实现反例，不能借此改答案或触发额外采样。

**AK3–AK7工程结果。** v2保留多个实际原行片段、去重UTF-8字节，拒绝缺口引用；映射经过普通loader/catalog/resolver、canonical结果、session/inspect与compare，搬移不会丢原行坐标。真正多入口继续展开；两个场景加三个support仍为两个义务。词法候选索引受作者白名单与1MiB累计读取预算限制，初窗保留半数展示预算供补读；该读取数只计候选索引阶段，普通输入校验和最终快照读取另行发生，不能当成全流程物理I/O总量。缺失/同名歧义、动态、循环和深度分别诊断，不是全仓或语义调用图。模型最多两轮已展示位置建议、一次纯格式修订；账户在解析之前保留响应，输出预检在派发之前。未展示行拒绝、Unicode展示计数、词法声明名误作调用及生成ID碰撞均有回归。新鲜授权聚合402 pass、1平台skip、2735断言；主typecheck通过，工程提交`a9f80284`。

**AK8–AK9准备观察。** 固定八任务、两条材料路线和40单元顺序后才调用模型。同一专家请求的v2片段打包均ready，字节下降且原始范围覆盖不减；share-create从v1 partial、3/4参考范围覆盖转为v2 ready、4/4。这是零模型算法对照，不能代替入口seed路线。八个真实自动准备job共14次调用：七个发布（1 ready、6 partial），Memos GetShared因补充literal缺失或歧义失败且保留账本。精确参考范围覆盖与决定性语义覆盖分开判断，不按回答事后手补。详细范围、窗口、gap和usage见[准备汇总](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/preparation-summary.json)与[packing对照](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/packing-summary.json)。

| 任务 | 同请求v1→v2源码字节 | 入口seed自动产物 | 实际找到/仍缺 |
|---|---:|---|---|
| Open WebUI file | 17,498→17,367 | partial，9,894 | 入口与部分关联；仍缺vector写入helper |
| FastAPI superuser read | 5,157→1,187 | partial，460 | 入口足以回答所给superuser前提；仍缺上游CurrentUser完整绑定 |
| Memos CreateShare | 36,936→6,799 | ready，4,203 | 已有决定性ADMIN/管理控制；只覆盖1/4旧声明完整范围，不等于语义失败 |
| Memos GetShared | 25,961→9,083 | failed | 补读literal歧义，1次响应保留，相关4单元阻塞 |
| Memos MemberLeave | 29,762→2,644 | partial，6,548 | resolution/admin参考范围2/2；更深依赖达到深度预算 |
| Paperless download | 43,266→2,831 | partial，2,115 | owner-aware/file-response已纳入；仍缺root resolution/version selection |
| Paperless notes POST | 29,694→4,015 | partial，5,885 | owner-aware已纳入；全局permission旧完整范围未覆盖，任务已给全局前提 |
| Paperless ShareCreate | 28,678→3,775 | partial，1,391 | 找到serializer-user；仍缺global permission/document validation/owner-aware |

**AK10–AK11质量。** 40计划单元全部关闭，36 completed、4 preparation-blocked；39次分析调用含3次诊断repair，fallback 0。五个独立只读探子在关闭后对匿名首答/最终和实际源码评审，首答33/40 full、最终36/40 full。其中12项为合理unknown，确定行为且完整的回答为24/40；不能把更谨慎的unknown当作依赖闭合。Memos GetShared在显式材料中仍因token存在/过期未给定而正确保留条件unknown，标签与条件叙述一致。未发现确定性共享分析合同缺陷，额外修订分析单元为0。

| 准备/表示 | 初轮最终full | 重复最终full | 全轮合理unknown | 全轮完整且确定 |
|---|---:|---:|---:|---:|
| 显式v1 / Markdown | 8/8 | 2/2 | 2/10 | 8/10 |
| 显式v1 / DSL | 8/8 | 2/2 | 2/10 | 8/10 |
| 自动v2 / Markdown | 7/8 | 1/2 | 4/10 | 4/10 |
| 自动v2 / DSL | 7/8 | 1/2 | 4/10 | 4/10 |

同材料最终质量没有表示差异；自动材料的完成配对初轮为7/8、重复为1/2，注册分母不删阻塞行。自动路线比显式路线多出OWUI写入、download绑定和share-create绑定三个决定性缺口，降低了可确定问题数。原始首答、配对和来源理由见[质量汇总](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/panel-summary.json)。这一端到端比较也包含专家请求与入口seed的不同前置投入，不能把差异单独归因于v1/v2 packing。

**作者接口诊断修正。** 研究driver最初只描述authoring/v2形状，遗漏完整已有schema；两份DSL原稿及各自唯一正常格式修订仍缺`request/policies/schemaVersion`等字段。零调用反例显示仅走归一化会先在版本退出，不能给作者完整结构诊断。按任务书§5.3先修driver：展示已有完整editor schema并合并结构诊断，另登记两次仅格式纠正，原首稿、首修和成本保留。八首稿5份可运行，三次正常修订后6份可运行，两次额外纠正后8份可运行；13次作者调用全部分账，不能按原单次修订预算声称8/8自然成功。Paperless变化使用新ref的受控synthetic源码，政策与场景不改；Memos只改政策期待。

**AK12原/变消费与评价纠正。** 两包8个fresh session全部completed，8次调用，声明场景与展开义务均为16；support没有重演AJ的额外入口膨胀。原稿复用同入口、白名单和ref的实际自动快照；Memos政策变化重建任务身份但复用源码，Paperless源码变化用先前实际定位请求再次准备（1额外job、0模型），不追加专家位置。四个compare均needs-review，八份最终作者说明忠于共同brief。共同事实转成MD消费canonical scaffold的宿主工作是公开任务前提，不计作独立作者自动完成。

严格按冻结作者brief，首/最终消费均12/16 full，4项partial来自Paperless缺失的owner前提。原helper和synthetic helper都先允许`obj.owner is None`；作者只声明“not owner”，不能自动补“另有非空所有者”。两份原稿view-only和变稿Markdown两场景给出无条件deny，缺少这个分支；原稿change-granted有grant时两分支都allow，仍full。变稿DSL明确区分null-owner allow与非空foreign-owner deny并保留unknown，两场景full。首轮评审曾把Memos正确报告变化政策冲突判为错误、把无版本作者首稿当成消费首答；独立二审与主代理按引用裁定，所有原始评分保留。附加非空foreign-owner假设的敏感性为14/16 full，另外2项DSL unknown在该假设下过度弃答；不是新采样或主结果。质量面板notes问题明确写“different user owns”，没有作者brief歧义。具体理由见[作者消费汇总](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/author-use-summary.json)和[裁定](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/evaluator/adjudications.json)。

**完整成本与剩余工作。** 74次provider dispatch全部响应且usage已知：405,708 fresh input、44,416 cache-read、74,252 output、cache-write 0；完整prompt 450,124，含output总计524,376 tokens。actual USD全部未报，开发/评审代理宿主用量、底层transport attempts和真人分钟另记unknown，不以单价估算冒充实测。阶段成本如下，失败、首修与额外纠正均计入；准备在两种表示及重复间共用，只计一次。

| 阶段 | 调用 | 完整prompt tokens | output tokens |
|---|---:|---:|---:|
| 8自动准备job | 14 | 77,172 | 8,875 |
| 40质量单元 | 39 | 295,943 | 41,408 |
| 8作者交付及修订 | 13 | 40,590 | 11,008 |
| 8fresh消费 | 8 | 36,419 | 12,961 |

作者仍要接受政策、准确声明关系/入口/白名单、检查决定性gap、区分sourceRef与政策修改，以及复核不完整前提。语义评价确认有界消费链，但没有真人省时或一般自动依赖可靠性的证据。仓外具名v2示例已零调用验证映射、省略、编辑与两义务；普通命令见[示例](../../examples/authorization-assessment/evidence-editing/README.md)，全账本见[合并摘要](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/summary.json)。

**AK15核验。** 相关402 pass/1平台skip及主typecheck后，16个实际冻结实现文件的当前字节和Git blob均一致。研究脚本typecheck、文档12测试/链接、10项目录、定向凭据扫描和8份普通session inspect通过；所有AK离线复算零provider。旧AJ面板评价复现，旧AJ作者评价因授权修改的local-run冻结哈希不同拒绝，旧身份不改。[独立diff核验](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/independent-diff-review.json)未发现阻断发布问题；确认定位第二轮只展示补窗而不重给首窗（proposal.ts:109），可能影响质量，作为后续有界窗口策略事项保留，不修改已冻结初轮。完整验证见[verification](../../results/skill-ir/skill-dsl-research/development/authorization-bounded-preparation-v2/verification.json)。


</details>

### 7.31 AL 源码定位恢复与普通作者闭环

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-29，用户确认AK复核后的方向，要求派发`gpt-6-sol / max`执行[AL0–AL16](../superpowers/plans/2026-09-29-authorization-location-recovery-and-authoring.md)。工程、预登记真实生成、匿名评价与成本归因已完成；质量改善来自部分共同源码恢复，同材料MD/DSL未显示稳定优势，普通作者语义负担仍存在。最终验证与发布由机器状态记录，不再追加采样。

**复核依据。** 父任务在`c0604c5c`验证402 pass/1平台skip、2735断言、typecheck及三项零调用重放。Git与用户origin一致。八项同请求v2准备的源码合计216,952→47,701字节，原要求范围得到保留。自动准备的确定性回答损失仍集中在OWUI、下载及分享授权缺口，GetShared准备未发布；源码充分性与完整unknown分开报告。

**具体机制问题。** 对七份AK自动proposal的34个可选match作离线核对，25个没有原文字面命中、3个在声明范围内唯一但全文件重复、6个全文件唯一。该分母是定位字段，不是必要控制数，部分与已有入口重叠。模型把说明/省略号写进match，而prepare先要求全文件唯一，再检查所给范围。GetShared带路径和范围的解释式补读失败会抛出整个job；第二轮fresh请求只给新窗口和旧ID，未给必要的旧源码与依赖摘要。作者的完整schema和结构诊断改进主要位于AK研究driver；Paperless则另有owner为空与前提未指定的语义问题。

**当前方法。** 沿用当前领域声明和分析host。宿主给窗口/符号标识，模型选择位置和补读需求；原文校验与理由分开。安全的补读缺口逐项诊断，保留验证通过的入口/依赖，缺必要材料时保持partial或invalid。第二轮携带预算内相关旧上下文及新窗口，重发字节/token单列。作者通过现有init/check获得结构建议，通过已有conditions/assumptions/branches说明前提；不把“未知”写成null或非空，不自动接受政策。ready仅闭合请求声明的依赖，模型漏声明的决定性控制仍可能未读；结构诊断不能识别所有政策版本说明残留或代替语义判断。

**AL1接口定稿。** [归档零调用重放](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/archived-reproduction.json)复现34字段=25无字面命中、3范围内唯一/范围外重复、6全局唯一；GetShared的3项补读在第一项解释式literal失败时整批终止。内部提议采用显式v3 selector：shown-range绑定仓库/ref/源码digest及真实连续窗口，indexed-symbol提供待补读位置，literal-search保留精确字面与范围消歧。自然说明使用独立description，不降级或删除错literal。公开request/v1保持旧语义，request/v2使用所声明范围消歧；补读逐项返回resolved/unresolved与候选和预算，不将安全缺口升级为整批失败。二轮沿用12文件/1MiB索引读取、累计64KiB展示/最终64KiB、深度3、两轮定位加一次纯格式修订，重发源码计入展示预算；元数据、完整prompt及provider用量另记。

**AL2–AL5离线工程。** 红例先证实v2范围唯一被拒、safe read整批抛错、失败父节点仍纳入子项、二轮无旧上下文、取消后未dispatch窗口被记为展示、CLI丢失read gap和索引后源码变化未拒绝。纯selector、逐项恢复、父链处理、v3二轮及普通发布接线后，50项聚焦测试/236断言通过。GetShared旧3个错literal现在各返回not-found，既不删除literal也不伪造补窗；真实新准备仍须重新生成位置。相同旧响应重放只是机制证据，不能充当新模型观测或质量提升。入口/义务计数保持，paid failure、格式修订、timeout unknown和publication failure继续使用原telemetry；所有实际费用未知与已知用量分开。

**AL6普通作者接口。** AK缺字段首稿的最小反例先只得到版本错误，现由已有local schema提供适用结构诊断；init/check/prepare复用同一normalizer/loader路径，缺版本仍invalid，不进入引用/源码的连锁报错或provider。明确v2与高置信v2形状可获schemaPath/fix，不明输入和显式未知版本不套v2；v1/normalized兼容。33项相关测试/751断言通过。它降低了诊断获取的程序性负担；AL11实际结构有效5/8→6/8、严格语义有效4/8→5/8，一份DSL原稿一次修订后仍失效，变化稿与下游阻塞。不据此推断真人省时。

**AL7前提决定。** 既有premise/conditions/requestedBranches足以清楚表达unspecified、absent、other-present和self，不增加泛型owner字段或项目特例。14项测试/88断言确认：不补非空前提、仅显式分支展开、相反结构化赋值具名拒绝、premise编辑只改目标声明并使ordinary preview/program/compare依赖变化、源码不变。共享模型上下文的compare仍保守影响全部运行场景；自然语言冲突不由host猜测。AL11的Paperless原/变brief在生成前冻结owner未指定→other-present，没有事后补非空假设改变主评分。

**验收与解释。** 先用归档响应及重命名/重复符号等synthetic测试验证共性，再从AK八个seed各真实准备一次。四个主缺口做旧归档自动材料/新自动材料×MD/DSL的16计划行，两个sentinel新材料补4行；旧GetShared无输入的两行保留blocked。分析采用同一当前实现fresh消费，旧回答不拼入新配对。两包8作者稿和8次原/变消费检验普通诊断与条件表达。按确定解决、条件完整、过度弃答、真实外部未知、作者前提缺失和可补源码缺口报告，并计入准备/修复全成本。真实调用前登记输入和评价规则；后续实现问题、修复与结果继续追加本节。

**AL8冻结与核验。** 工程提交`fdd9fc7a`及脚本末尾空行修正`25155066`后登记58项实现字节，生成入口核对冻结身份；旧结果与错误match不改。427 pass/1平台skip、2875断言，主与研究脚本typecheck、12文档测试和链接检查通过。独立只读核验发现返回期间取消仍可完成或追加格式修订，两个红例后补返回时检查，原usage保留；in-flight取消仍等待既有provider返回/截止，不宣称能中止底层请求。20质量行和两包8稿/8消费的公开前提、允许未知、决定性依据在生成前登记且与生成入口隔离。

**AL9实际准备。** 八项各执行一次，全部发布（5 ready、3 partial），13次调用均有响应，完整prompt132,733/output11,072 tokens；actualUSD全未知，已知响应耗时552,546ms，目标执行0。GetShared这次partial发布，旧版整体阻塞未重现；FastAPI的CurrentUser歧义和Memos的深度gap明确保留。机械整段criterion范围完全覆盖为2/8，这些范围部分大于最小决定性语句，不能据此直接声称只有两项语义充分，也不能以8/8发布声称质量完整。新旧材料由当前同一分析实现消费，低分不追加抽样；见[准备账户](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/preparation-summary.json)与[范围覆盖](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/preparation-coverage.json)。

**AL12普通例子。** 两个既有例子补充valid/bad/valid的exact-literal恢复与四种owner前提、显式分支、局部premise edit及普通生命周期命令。[仓外零调用核验](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/portable-verification.json)保留具名目录`D:/skill优化/project-maintenance/authorization-al-portable-20260929`，相对路径、partial/ready发布、具体结构诊断和same-source/changed-program检查均通过；没有执行目标或重复真实模型演示。

**AL10共享实现修订。** 原20行生成关闭后的定位核验发现Python多行声明在同缩进`)`处被误判结束（OWUI helper 1340–1348，实际续至1537；Download resolver 1401–1406，实际续至1427）。Download首提议还同时含非空`reads`和末尾`reads:[]`，JSON.parse静默采用后者。三个反例先红、补逻辑后55项准备/CLI测试260断言转绿：词法索引先平衡声明header再扫描body，v3严格检查各对象的重复JSON属性（包含转义同名），通过已有一次格式修订处理，不代选模型意图。原结果保留；按任务书登记唯一修订区块，只对两个受影响新材料增加两次相同entry-seed准备和4次MD/DSL分析，预算不变，另列原/新freeze及费用。尚不以修复存在推断质量改善。

**AL10主面板结果。** 20计划行18完成、旧GetShared两行因历史准备无产物阻塞。首答6/20、最终8/20完整，其中6确定解决、2为GetShared的完整条件答案，外部token状态仍未知；9部分、1错误。四个主任务每臂注册4个新旧配对，实际可执行3对；可执行改善为ShareCreate，GetShared另由阻塞变为条件完整，不把它算作可执行配对。两sentinel的4行均完整。以下分母包含两个sentinel，不能与旧材料4行直接解释为无混杂总比例提升。

| 材料/表示 | 计划/完成/阻塞 | 首答完整 | 最终完整 |
|---|---|---|---|
| 旧自动 / Markdown | 4 / 3 / 1 | 0 | 0 |
| 旧自动 / DSL | 4 / 3 / 1 | 0 | 0 |
| 新自动 / Markdown | 6 / 6 / 0 | 3 | 4 |
| 新自动 / DSL | 6 / 6 / 0 | 3 | 4 |

OWUI新MD在未读helper正文时直接断言目标集合无授权检查，判为unsupported certainty/incorrect；新DSL保留允许源码缺口，判partial，不是过度弃答或完整unknown。最初两份只读评审对ready或未展示helper采用了较宽推断，最终按实际材料和冻结规则裁定，分歧及原判断保存在[质量评审](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/evaluator/quality-reviews.json)。主面板literal unknown为9行，原因非互斥：真实外部3、允许源码缺口10；后者包含MD未承认的缺口。外部事实未知、可补源码遗漏与条件政策undetermined不合并成“成功unknown”。

**唯一修订区块结果。** 两次准备各两次定位调用，四次分析均首答关闭、无格式fallback或domain repair；最终2/4完整。Download两臂由partial改善为确定拒绝：root_doc的owner-aware view检查在选择有效文件版本之前，错误的file_doc权限不能绕过root检查。准备报告仍partial，未解决的root解析等gap在已冻结身份/资源前提下不妨碍这一决定性路径。代价是最终源码1,527→60,547字节，完整prompt准备52,107、分析49,988 tokens，不能称为成本下降。OWUI索引已展示完整多行helper给定位模型，最终选择只保留1458–1467及1527–1534，共18/77评价范围行，1468–1526仍遗漏；两臂合理unknown但仅partial，MD由无据确定性变为有据弃答。该结果另存[修订评价](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/revision-summary.json)和[修订覆盖](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/shared-revision/coverage.json)，不替换原20行，不继续按低分追加调用。

**AL11作者与消费。** 8计划稿实际派发7份首稿与2次普通diagnostics修订，共9调用；Paperless DSL原稿失效后，依赖它的变化稿没有派发。自动结构有效首稿5/8、最终6/8；独立严格语义有效4/8→5/8。Memos DSL变化稿政策正文/expectation已改变，却将policy.reason和publicInstruction仍称为original policy；结构有效并不能证明修改完整。Paperless MD原稿一次结构诊断后明确未指定owner和absent/other分支，变化稿仅把实际前提改为other-present；DSL原/修订稿仍不是可消费领域声明，未手修替代。

8计划fresh消费6完成、2作者阻塞；16声明义务实际展开12，首答7/16、最终9/16完整，3部分、4阻塞。session首答3/8、最终4/8完整，不能与逐义务分母混用。Memos MD原/变及DSL原稿6项完整；DSL变化稿的other项标签正确但理由继续把新政策叫原政策，判partial。Paperless MD原稿两项过度弃答：它已找到局部owner-aware分支，却在给定handler-entry和global权限前提后仍把未展示上游class当作当前决定性缺口。变化稿两项完整，实际other-present条件下view-only被拒、有change grant被允许，并保留absent反事实的source-allow/政策失败，不新增owner非空假设。

三组可做compare均为needs-review，第四组作者失效阻塞；三个实际原/变源码文件的字节/path/digest/repo/ref相同。旧compare-summary的sameSourceBytes字段比较整个sourceBundle JSON，不能据其中两个false声称源码改变；[文件级证明](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/compare-source-verification.json)单列相同文件与不同元数据。Paperless MD原材料partial、变化材料ready，源码相同而准备gap元数据变了；这仍是消费上下文差异，变化稿较好回答不能全部归因于owner前提。比较只提示共同上下文重新分析，没有自动复用旧答案。逐义务来源见[消费评价](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/consumers-summary.json)和[作者评审](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/evaluator/author-reviews.json)。

**AL13完整成本与摊销。** 下表包含全部实际dispatch和diagnostics修订；完整prompt已将cache-read加到fresh input一次，cache-write为0。64次全响应且usage已知，actualUSD全部未提供。响应耗时合计3,722,584ms（约62.04分钟）是各响应时长之和，不是研究墙钟或真人投入。开发/只读评审的宿主token与成本、隐藏传输重试和真人分钟均未知，不能估算为0。

| 阶段 | 调用 | 完整prompt tokens | output tokens | 已含cache-read tokens |
|---|---|---|---|---|
| 八项初次准备 | 13 | 132,733 | 11,072 | 0 |
| 20行主质量面板 | 21 | 86,768 | 23,124 | 4,480 |
| 作者首稿/普通修订 | 9 | 28,183 | 13,979 | 0 |
| 三份有效原稿准备 | 5 | 44,372 | 4,484 | 0 |
| 原/变消费 | 8 | 45,621 | 17,133 | 4,480 |
| 共享修订准备 | 4 | 52,107 | 3,851 | 0 |
| 共享修订分析 | 4 | 49,988 | 4,470 | 0 |
| 合计 | 64 | 439,772 | 78,113 | 8,960 |

fresh input430,812、完整prompt+output517,885 tokens。旧AK自动材料的14次获取、prompt77,172/output8,875仅保留历史成本，不再冒充AL实际派发。8份初始准备全部收费一次；其中6份各消费两次共12次，两份未消费的32,395 prompt开销仍计入总数。只对已消费6份作算术示例：一次消费各份的准备prompt均摊16,723，实际两次消费均摊8,361.5；包含两份闲置开销则为11,061.1/实际消费。三个有效作者原稿准备跨6消费均摊7,395.3 prompt，修订准备跨4消费均摊13,026.75。这些除法没有新调用，也不证明端到端净节约。所有阶段、cache口径、freeze、实际/计划分母和摊销由[统一摘要](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/summary.json)零provider重算。

**方法判断与剩余责任。** 逐项恢复避免GetShared一次错literal取消整批，准确位置和补正文对ShareCreate、Download有实际帮助；词法索引和二轮prompt仍不保证最终关键材料选择完备。适合自动准备的任务须有明确入口、白名单、固定ref及可限定依赖；已知决定性helper可用显式request/v2，不必重复定位。最有价值的下一问题是让提议明确交代仍未验证的关键控制范围，以及作者改变政策/前提时同步reason/publicInstruction和反事实解释；不扩成全仓AST或按任务名注入答案。普通check只给结构与来源支持，政策来源、完整前提、语义复核及原skill的其他职责仍由作者/评审承担。公开development、冻结入口和专业brief不证明whole-skill自动转换、一般可靠性、部署安全或DSL净收益；没有执行目标、held-out采样或默认方法切换。

**AL15最终只读复核。** host核验发现显式read ID碰撞会让普通prepare按first-match取错selector。主线程用重复/默认ID、跨轮未执行read和CLI逐项归属三个反例确认失败；宿主分配唯一诊断ID并保留原request.id后35项聚焦/193断言通过，不增格式修订或付费调用。作者/前提与研究分账的另外两项复核没有可操作问题，未确认的词法边角只保留为限制。最终离线实现另绑verification-freeze，原58项和唯一研究修订59项身份不改；全部64次真实调用仍按当时实现报告，研究分数没有因工程收尾被替换。

新鲜最终回归433 pass/1平台skip、2903断言，主/研究类型检查、七项零provider重放、评价重算、12项文档测试与链接/目录检查通过；三个实现身份分别核验，85项登记来源绑定一致，凭据候选0。独立复核没有未关闭critical/important问题。命令、原始输出和预期红例保留于[最终验证](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/verification.json)，[复核处置](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/final-review.json)记录实际修正；历史AK runner因冻结实现改变而拒绝的边界保持。

**AL16发布。** 工程、真实证据/示例及结论已推送用户origin/skill-ir-aot，完整头`bc59120026ecd8035068ba26cdc76813971cf65f`与远端SHA核对一致、工作区干净；最终状态随收尾提交同步，[发布记录](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/publication.json)保留首个完整发布身份。入Git后的链接扫描对归档日志内退役路径报错，原日志不改、12项精确引用登记后检查通过；不是新增当前文档或放宽通用检查。所有生成与评价流已关闭，不再调用provider、扩样或改默认。


</details>

### 7.32 AM 控制上下文与作者复用

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-29，用户在AL复核后要求编写下一轮任务书并派发`gpt-6-sol / max`。[AM0–AM16](../superpowers/plans/2026-09-29-authorization-control-context-and-reuse.md)继续同一源码可见授权任务类，优先改共享生产路径和普通使用。至2026-09-30，工程、43次真实调用、匿名源码评审、主代理裁定和有限验证已关闭，首次完整交付头`f7e0b2050f7d452320554d485b4128ad941e7070`已与用户origin核对，最终完成记录随后发布。以下保留设计、失败和修订过程，实际结果以本轮[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/summary.json)为准。

**AL复核定位。** 基线`5426a0e6`与用户origin一致、工作区干净；父任务新鲜回归433 pass/1平台skip、2903断言，typecheck与零provider评价重放通过。OWUI完整helper已经给定位模型读取，最终只保留18/77评价范围行；最终10,173字节，仍有预算。Download补材料后两臂完整，同时增长至60,547字节。接下来的问题是有界控制上下文选择及无关材料膨胀，现有indexed-symbol已经支持完整符号，无须另造全仓索引框架。

作者复核发现两个可修的接口问题。AL原作者请求要求assessment/evidenceRequest包络，修订prompt遗漏原outputRule与publicBrief，Paperless修订回裸assessment仍被拒绝；原稿是JSON结尾语法错误、stopReason为end_turn且output未达上限，没有证据把它归因于token截断。Memos变稿虽改政策与expectation，reason/publicInstruction仍称原政策；现有edit可以改reason，却没有publicInstruction等说明的定向操作，研究字段白名单也未提供完整修改空间。应先让普通工具具备完成修改的接口，再评价作者是否正确使用。

复用复核发现AL消费者从成功dependencies重建request，省略proposal.gaps。Paperless原/变源码字节和ref相同，报告partial→ready的同时gaps被清空；旧缺口只在job说明保留。AM将源码、成功依赖和pending gaps一起继承。解决缺口要有新材料，不再相关要有显式范围/前提理由；纯前提主对照保持相同源码与gap元数据。分析模型仍可以根据明确前提判断某缺口不影响当前问题，避免把所有缺口都变成弃答理由。

**拟实施方法。** 现有prepare增加opt-in控制上下文策略：小可调用单元优先保留完整范围，大单元在预算内保留可靠控制片段及明确省略；只选相关类方法。宿主扩展单独标来源和范围，保留原行号、允许文件、源身份及预算，不冒充定位模型已读内容。现有init根据context生成已知元数据、entry seed及紧凑作者指引，领域政策/前提仍由作者填写；首稿与修订共用相同brief和输出合同。local edit允许定向修改相关说明，prepared-material复用保留缺口生命周期。具体接口由AM1核对当前代码后固定，所有能力必须接进普通路径。

**评价与实验。** 回答是否有据和任务是否解决分别统计，区分确定解决、完整条件答案、合理外部未知、可补源码缺口和作者前提不足。AK/AL历史full定义有差异，旧评分保持，不能用总比例推断同口径退步。AM沿八个已暴露seed做零模型packing核验；四个主缺口各新准备一次，以AL最新有效材料/AM材料×MD/DSL形成16个fresh质量session。两包8份作者稿和8次消费检验已知字段生成、政策说明同步、同材料前提修改与旧结果复查；计划16义务，失败及实际展开另列。准备、修复、作者、消费全成本分账，独立评审使用隔离oracle，实际美元费用和真人分钟未测则记unknown。

后续实现问题、红绿反例、接口调整、真实结果与仍未解决的责任继续追加本节。当前普通分析默认、既有DSL和全部历史结果保留。

**AM0–AM1启动与接口。** 干净`0726c44e`上建立新status/journal及八seed摘要清单，四项基线使用AL最新实际产物。亲读生产链确认发现器会枚举类全部方法，最终prepare又仅保留所选片段；callable-v1显式关闭整类枚举并在最终读取后补唯一最小可调用单元，新增字节单列host-context。边界不可靠或超预算保留原范围并声明不完整，不推断源码答案。init context输出领域字典为空的v2稿、宿主entry seed及紧凑指引；作者首/修稿共用同一任务合同。定向文本操作和affectedText不猜自然语言。reuse绑定完整源摘要并继承所有pending gaps；旧报告无绑定需重新准备，复用不缓存答案。具体公共字段见本轮任务书AM1定稿，所有更改先用小反例验证。

**AM2–AM8工程反例。** 四个普通CLI反例先得到4失败：未知context/init/reuse参数及定向文本操作被拒；对应共享模块接线后转绿。控制纯函数的重命名、多行、同名方法、Unicode预算、源漂移及不可靠边界得到预定状态；另两个红例暴露字符串中的伪def和去缩进续行/装饰器不属于原边界，词法处理后15项控制/发现测试通过。宿主新增来源不计定位模型展示，索引预算和最终预算分列。作者首/修稿保留同一合同，init三文件先检查冲突；30项作者/编辑/前提/CLI聚焦测试通过。8项复用/普通反例确认pending gaps和成功依赖不丢、原ref/原始文件的未保留字节改变也使复用失效；缺口解决需新范围，不相关需具名前提变化，旧缺口仍可追溯。跨卷临时fixture最初被正确路径拒绝，改为复制同目录synthetic源，未改变生产路径边界。真实效果尚待AM9–AM11，不以工程转绿代替质量收益。

**AM8冻结前验证与协议。** 相关回归455 pass/1平台skip、3004断言，主与AM脚本typecheck通过；追加的类发现验证9 pass/44断言，确认策略只显示相关方法且省略选项维持旧枚举。四seed普通CLI预检、两包四份真实init草稿和八proposal零模型packing通过。固定同proposal下OWUI源码从10,173增至17,498字节，Download从60,547至60,725；这只是机械材料对照，尚不代表模型或语义收益。四项新准备、16行当前实现下AL/AM×MD/DSL、两包8稿和8消费/16义务已按任务书登记；所有作者稿用生产renderer保持首稿/修订合同，DSL仅交付v2或edit，宿主生成seed。作者材料每包只准备一次，各消费走普通edit/reuse并逐项核对source/gaps，纯前提不改gap相关性。评价两维枚举及分母计数红例转绿，准确unknown和条件解决分开。实际USD和真人时间仍未知。

**AM10具名入口修订。** 首四个AL/Markdown行因runner传入非普通合同的instructionOrigin而在provider之前invalid，四行调用为0、原报告保持。DSL q05/q06随后完成，暂停阻止其余派发。唯一共享修订区块修正研究入口metadata为已有independent-author，顺带把尚未使用的compare参数固定为普通--previous；生产host、源、公开问题、输出合同、模型和预算均不改。新增零provider入口反例确认Markdown到达普通provider边界和compare进入session校验。预登记只补四个已失败MD行，0额外prepare，原16分母与另列修订4行保持；尚未派发的既定行使用相同修正配置继续。此为具名工程错误恢复，不按模型低分重抽。

同一修订区块在作者派发前的仓外复制演练另发现：Zod重排included字段顺序，使runner按JSON文本比较的继承检查误报。实际source/range/gap/materialBinding均按值相等。共享核验改用深值比较，仍严格保留数组顺序与所有字段；作者known-fields的结构比较也采用同一语义，不把对象属性顺序当领域事实。三项入口/复用反例与两项评价协议测试共5 pass/19断言，研究typecheck通过。初版revision freeze/registration字节另存，修订仍只补预登记四行，不增加prepare或消费重跑。10个仓外普通CLI步骤全部通过，两个示例继承全部pending gaps并要求fresh分析。

**AM9实际控制材料。** 八个归档proposal的[零模型packing](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/packing-replay.json)不是新准备成功。固定proposal下OWUI为10,173→17,498字节，Download为60,547→60,725，其余任务也保留机械状态和新增缺口；有界上下文可能增加材料与gap。四个新主job全部发布partial，共7次提议调用，允许文件与入口不按评价答案补选。原始已绑定文件字节、最终快照和定位展示分别计量：

| 主任务 | 原始绑定字节 | 最终快照字节 | 定位展示总/唯一/重发字节 | complete/uncertain单元 | pending gaps |
|---|---:|---:|---:|---:|---:|
| OWUI process_file | 121,813 | 18,131 | 31,986 / 21,204 / 10,782 | 3 / 1 | 1 |
| Memos GetSharedMemo | 28,244 | 6,597 | 17,001 / 9,459 / 7,542 | 10 / 1 | 5 |
| Paperless Download | 238,545 | 6,722 | 8,169 / 8,169 / 0 | 3 / 5 | 7 |
| Paperless ShareLink create | 374,999 | 3,449 | 7,110 / 4,652 / 2,458 | 1 / 4 | 4 |

OWUI最终保留retrieval.py:1340–1539的完整save_docs_to_vector_db，host-context精确补1340–1367、1388–1457、1468–1516、1535–1539等原来只给定位模型看的正文；变量来源、existing collection分支和insert均可引用。process_file与access validator也有可靠完整范围。新Download job没有整类成员枚举；root document检查、request/version/effective file和serve_file分开保留，相关类方法仍是部分范围。新6,722字节与AL 60,547字节来自不同的模型选择，不能作为固定proposal下packer独立省字节的证据。GetShared入口170–213被机械标range-uncertain但保留源码，resolver/depth缺口仍在；ShareLink继承框架create不在允许文件内，仍未知。独立[控制覆盖核验](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/evaluation/control-coverage.json)区分机械状态与实际决定性控制：partial并不必然阻塞明确早期拒绝，unit-complete也不授予路径语义或部署成功。

**AM10回答可靠性与解决结果。** 生成关闭后，四个匿名只读评审按任务分组核对首答/终答、关键控制、全部请求分支及作者稿，主代理按源码和既定规则裁定；72条最终答案评分和8条作者评分均可零provider重算，原评审与分歧保存于[evaluation](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/evaluation/)。主16行有12个有效终态、4个零调用入口invalid；首答supported 8、unsupported 3、blocked 5，解决8（4确定/4条件）。终答supported 9、unsupported 3、blocked 4，解决9（4确定/5条件），没有过度弃答，错误确定性3。唯一修订4行首答3有据且解决、1交付阻塞，终答4有据且解决（2确定/2条件）；五次调用含一次domain repair，不替换主16分母。首答交付无效按预定blocked规则计，不能以修订后的有效答案倒填首答。

三个负结果为q06 Download、q08与q16 ShareLink：源决策deny及因果控制正确，host已正确派生source_refuted，解释却明确称source_supported_failure，与作者accepted deny expectation矛盾。该文本政策对照错误在首答/终答均保留，故unsupported/unresolved；标签方向由既有outcome-result/render合同确定，未为结果更换评分规则。源码当前owner未指定并不总是未解决：Paperless change-granted在owner absent/other-present两支均allow，当前效果可确定；view-only两支不同，完整分支答案才算conditional。OWUI的源码可见写路径与配置/处理条件分开陈述，未执行或验证数据库效果。

仅作有界描述，修复入口后可用的AL/MD四行与AM/MD四行终答均4/4有据且解决；AL/DSL为2/4，AM/DSL为3/4，主要负例是上述政策解释。AL/MD是另列修订观察，主面板仍保留原四行阻塞。四个已暴露任务、不同材料选择及一次入口恢复不支持表示的稳定因果优势；不同口径的AK/AL历史总率继续保留，不能串成质量趋势。

**AM11作者与自然消费。** 两个作者包共享准备各两调用，Memos材料6,548字节/1 gap、Paperless 10,827字节/5 gaps，两项均partial；连同主job共6项准备，未使用额外修订prepare。8计划稿实际派发6首稿/2次唯一修订，共8调用。四个MD原/变稿首/终语义有效；Memos原DSL首稿atEntry:boolean，修订虽改类型却提前改成变更政策/other-member expectation，原任务语义及check仍无效；Paperless原DSL修订引用未声明的condition描述，普通check拒绝。两个变DSL稿依赖阻塞、零调用，主代理未补领域字段。生产renderer确实保持原brief/合同/权限，但这不足以防止语义漂移或错引用。宿主仅自动known metadata/entry seed；MD宿主骨架只编码公开brief明确事实，其贡献与模型作者贡献分账，不作为自动推断领域事实。

8计划消费实际4个MD session完成、4个DSL依赖阻塞；16声明义务实际展开8，无额外入口。消费首答4有据且解决、12阻塞（其中4为Paperless首答domain交付无效、8为作者依赖）；终答8有据且解决（7确定/1条件）、8作者阻塞，没有终答错误确定性。6次分析调用包含两次Paperless唯一domain repair。四次有效消费全部继承相同source、ranges、materialBinding和每一pending gap，两次变化compare均needs-review；另两组计划compare因作者阻塞。Memos政策变化同步reason/instruction，Paperless仅改当前owner premise并保留counterfactual，源码与gap不因修改而变ready。完整稿与消费缺失均保留于[作者消费汇总](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/author-use-summary.json)，只能支持这两包的有界材料复用，不能证明整体作者负担减少。

**AM12–AM13普通使用与成本。** [evidence-editing](../../examples/authorization-assessment/evidence-editing/README.md)和[task-semantics](../../examples/authorization-assessment/task-semantics/README.md)给出普通init/check/prepare/edit/reuse/compare/fresh run命令。一次仓外复制执行10个零provider步骤，源码字节和全部pending gaps逐项相等；有偿run步骤标明而不为演示新增调用。复用从新输入选择的raw根实际读取全部已绑定文件，按repo/ref/相对路径/字节验证，允许搬移相同副本；一个新增回归证明新副本字节改变仍拒绝。该合同不比较物理目录名，也不宣称全仓或每个allowlisted文件等价。

全部43/43调用响应，fresh input315,021、cache-read16,768、cache-write0，完整prompt331,789、output60,919、合计392,708 tokens；阶段成本见[成本与复用](../../results/skill-ir/skill-dsl-research/development/authorization-control-context-v1/cost-and-reuse-summary.json)。主准备7调用/完整prompt98,066，主质量13/83,674，修订分析5/40,086，作者共享准备4/41,597，作者8/23,797，消费6/44,569。已知provider累计响应耗时1,801,197.5ms，不能当真人或端到端工时。每包准备实际被2次有效消费使用，完整prompt分摊Memos6,004.5、Paperless14,794 tokens/次；阻塞DSL臂所留准备成本未扣除，未把4计划消费当实际分母。43次actualUSD均未知，宿主开发/评审模型用量、隐藏transport retries与真人分钟也未知，不用标价估算冒充实测。

**AM14–AM15收尾边界。** 唯一共享研究修订关闭后，普通字段指引补明atEntry为入口字符串、condition为同场景字典key；这项生成后的说明没有追加请求，未测模型收益。原base/shared-revision实现freeze和首轮失败保留，独立verification freeze绑定原生成freeze、generation-closed及43次调用。首答评分包仅附已有deliveryComplete，未改评价枚举或阈值。一次只读代码核验的sourceRoot身份疑问已按可搬移字节绑定合同裁定，增加新根读字节的反例并同步usage/spec。最终相关回归459 pass/1平台skip、0 fail、3013断言/63文件，主与研究typecheck通过；12项文档测试、链接/目录和五项零provider检查重放通过。AM归档保留原字节，Git格式属性只精确允许source末尾空行、numbered preview行尾空格及manifest/journal CRLF，工程代码/文档仍检查；冻结材料不为格式检查而修剪。暂存Git blob与691份原字节材料、63项当前freeze核对无差异，凭据扫描零命中；首次完整发布已核对用户origin。当前小函数上下文、宿主元数据与缺口继承适合入口/白名单可限定的源码任务；新策略保持opt-in，普通分析默认不迁移。剩余限制是可靠词法边界、未纳入依赖、作者语义/引用错误和解释政策方向一致性；本轮不追加低分样本或泛化/部署安全主张。


</details>

### 7.33 AN 当前任务合同与领域声明展开

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-30，用户在AM父任务复核后授权`gpt-6-sol / max`执行[AN0–AN16](../superpowers/plans/2026-09-30-authorization-task-contract-and-authoring.md)。本轮继续当前任务类，重点从寻找更多源码转向减少重复编写和输出合同冲突；已有v2/v6、控制上下文及gap复用继续作为基础。工程、40次真实调用、作者消费与独立评价已完成，发布核验见本节末尾记录。

**复核事实。** AM最终头`af6a2cd0`与origin一致，工作区干净；父任务分组复跑交付459 pass/1平台skip、3013断言，另补study.test.ts的2项/12断言，typecheck和零provider评分重算通过。主16终答9有据且解决、3解释错误、4研究入口阻塞；修订4/4另列。AM验证记录的protocol.test.ts路径未匹配现有计数测试study.test.ts，后者本次已实际补跑，历史记录不覆盖。

**新的具体定位。** q06/q08/q16实际run.json的DSL提示仍含requiredAnalysis要求返回source_supported_failure/source_refuted，后面的v6却要求observed decision且由宿主比较。对应Markdown提示无该旧要求。render收集旧requiredAnalysis，v6只移除allowedConclusions，未迁移旧格式指令。三例源码行为和宿主映射正确、解释反转，提示冲突是已确认干扰；其对全部错误的因果作用待新对照。AL/AM四对DSL的领域request/policy/主体/资源/obligations逐字段一致，未发现材料对照偷偷更换政策。

AM作者original prompt同时含原政策、未来政策、两组expectations及changeRequest，Memos修订用了未来版本。Paperless的错误引用则说明模型仍在跨scenarios/premises/branches转写同一事实；生成时guide没有收尾后新增的atEntry字符串/同场景condition说明，因此尚不能把最终guide称作已验证改善。已确认的工程缺口是当前任务隔离和机械展开不足，模型随机性与领域语义能力仍须通过真实运行判断。

**本轮方法。** 普通作者前端把一个case的主体、资源、操作、政策期待、入口、前提和分支放在同一作用域，编译到现有v2并保存来源映射。当前快照与具名变更分别提供；缺失领域事实保留诊断，有界纠错不顺带换政策。已有workspace/compose/local-edit优先复用。新合同模式只迁移已知输出格式要求，领域义务、source和未知自定义内容保留；实际provider请求验证唯一适用协议。政策摘要复用已有host比较，原模型解释与矛盾保持可见，conditional保持模型分析责任。

**验证安排。** 固定AM四份材料作Markdown/DSL×旧兼容/新统一合同16个fresh质量session；两包Markdown/完整v2/新前端三路线原/变共12作者稿、12消费和24计划义务。三路线使用相同当前brief，旧v2同样获得最新版普通指南；所有宿主代填字段、机械展开和模型创作贡献在派发前登记。结构、公开事实、语义等价和消费分别评价，合理命名不因隐藏固定key被拒。回答有据与任务解决沿AM双维口径，原始回答与最终交付分开；全部失败、修订和未知费用保留。

接口选择、红绿反例、真实结果及剩余问题记录如下。当前默认、历史结果和保护输入保持；AN1按实际代码修正的小接口已同步任务书。

**AN0–AN1现场与接口。** 启动HEAD `3251ff0c`、`skill-ir-aot`干净；AN结果根已建独立status/journal。q06/q08/q16的归档真实DSL提示带旧`requiredAnalysis`返回标签，v6又要求`observed`；Memos原稿任务含未来政策，首稿`atEntry`为boolean，Paperless修订condition使用未声明的自然语言。这些是观察而非对全部质量错误的因果证明。新前端只表达当前单一政策和具名case，作用域内派生入口/条件引用到现有v2；普通入口固定`init --context --task --out`。无效稿只允许诊断登记的JSON Pointer局部修订，有效稿变更继续走edit/compose。新运行选项`--task-contract=current-v1`只支持plain/explicit-v1/v6并绑定session/compare；已知旧输出指令在协议边界迁移，未知冲突给诊断。具体工程及实验结果待红绿测试和真实运行。

**AN2–AN7工程反例。** 合成重命名任务验证当前快照拒绝未来字段，具名政策变更要求逐case重审期待且不改原快照；新前端把case内的前提入口和条件引用机械展开到有效v2，缺政策、重复case、错误入口及跨case引用在分析前诊断。字段来源侧车按JSON Pointer区分明确给出的内容、模型作者内容和宿主引用。AM式boolean `atEntry`及自然语言condition可在原无效稿保留的前提下，只按已登记诊断叶子做一次局部修订；附带改政策/期待被拒。真实mock provider请求确认current-v1清掉已知旧返回要求，MD/DSL共用v6输出协议；未知自定义格式要求具名报错。宿主政策摘要和原模型解释分字段留存，明确相反标签沿原单次repair，不用正则代替一般语义评审。相关工程回归419 pass/1平台skip、2951断言，类型检查通过；真实16/12/12实验尚未派发，不能预判效果。

**AN8零付费登记。** 已对四项固定AM新材料逐任务登记Markdown/DSL×compatibility/current-v1共16行，并从两个公开brief投影三路线原/变12当前快照，另登记12消费、24义务、来源绑定、统一模型/超时/修订次数和AM双维评价规则。原稿提示只含当前快照；Memos原版未来政策字符串不进入提示。16个真实质量参数组合经普通运行入口抵达mock provider，保存准确请求，均通过普通check，四臂每任务输入和源码包摘要一致；12个作者提示及其current-v1编译/check/reuse组合也零provider通过。预检先发现OWUI归档旧要求使用`exact input locations`，与其余三项`exact supplied-source locations`不同；添加这条确切迁移及红绿反例后重跑16/16通过。预检的mock发送不计付费模型观察；实际结果见下文。

**AN9固定材料质量。** 生成前[冻结](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/generation-freeze.json)绑定63项输入和实现文件，16项质量fresh session全部真实完成，21次分析调用含5次原有单次修复。生成关闭之后才读取评价oracle；[逐行评分与摘要](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/evaluation-summary.json)同时保留首答和终答：首答11/16有效交付且源码支持，终答16/16有据且解决，其中12项确定、4项条件完整。compatibility与current-v1各8/8终答支持，八组配对均无终答质量升降；首答分别5/8与6/8，不能据此声称新合同稳定提高质量。五份初答因wire决策类型或引用范围无效而未交付，即使其中原始叙述与源码相符，也按冻结口径记blocked，修复后才计终答。原AM的三份矛盾解释仍保留为历史；AN的新结果不能追认提示冲突是其唯一因果原因。

**AN10–AN11编写与消费。** 两包三路线原/变共12计划作者稿，原稿未获原协议接受使3份变稿依赖阻塞；实际9稿派发、12次作者调用含3次诊断修订。原协议接受的终稿为5/12：Markdown 0/4、完整v2 DSL 1/4、新前端4/4。新前端机械展开已声明的入口/前提/条件、ID和引用；政策、期待、owner存在性由输入提供。Memos DSL原稿返回context/draft包装，未满足所需根结构。Markdown字面匹配拒绝与Paperless DSL变更失败的原因已在下方交付后复核更正，不能统称为领域事实遗漏或政策改错。原协议接受稿经普通check、同源准备复用和fresh run完成5/12消费session，另7项作者依赖阻塞；24计划义务中10项实际交付、14项阻塞。5次最终消费均有据且解决（3确定、2条件完整），首答仅3次有效交付；两组具名变化仍需复查旧答案。新前端的4/4稿和4/4消费保留为这两包已给定结构化任务的工程使用证据，作者路线优劣需结合下方评价及输入职责问题解释。

**AN12有界修订与普通使用。** 消费开始前发现研究runner以对象键顺序比较复用报告，使已`claim`但未派发模型的消费行被拒；先红绿改为结构比较并分开付费前/后恢复，随后又修正离线准备归档重入时的独占保存。原冻结及AN9/AN10字节不改，两份[消费专用修订身份](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/generation-revision-2.json)逐次登记，最终只继续5份有效稿，不重抽低分或无效作者稿。普通[当前任务示例](../../examples/authorization-assessment/task-semantics/README.md#start-from-a-scoped-current-task)展示当前task→init/check/prepare→fresh run→具名变更→reuse/check/compare→fresh run；`init/check/prepare/reuse/compare`不调用模型，两次`run`需要用户配置模型并付费。一次仓外复制离线核验14文件摘要、原/变同源和同pending gaps、变化任务与材料摘要差异、两份有效current-v1检查；provider与目标执行均为0，见[portable-verification](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/portable-verification.json)。

**AN13效果和完整代价。** [40次真实请求](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/generation-summary.json)均有响应：质量21、作者12、消费7；已知fresh input174,684、cache-read20,736、output48,813，完整prompt195,420、总计244,233 tokens；provider已知累计响应耗时1,433,286.822ms。40次actualUSD均未由provider报告，宿主开发/评审开销、隐藏transport retries及真人分钟也未测，不能换算成实测美元或人力节省。工程上已消除可识别的旧格式指令冲突并减少作者重复引用；质量面板终答两合同打平，作者/消费优势只在有效样本及受阻分母下成立，不能归因于DSL语法本身。当前能力限于公开development、单repo/ref、已声明政策/入口/源码的source-visible任务；没有目标执行、部署核验、held-out或生产默认安全结论。旧默认兼容，新前端和current-v1仍显式选择。

**AN15独立核验与有限修正。** 两项只读复核分别抽查生产接口和生成/评分归档：当前/未来政策隔离、缺政策不推断、定向修订白名单、实际prompt合同、模型原解释保留、冻结分母、首答与终答区分及40次用量均有对应源码和档案。发现直接调用renderer可把current-v1与旧wire组合，以及评分replay只核评分包、不重核raw report/run原件；各先写失败测试，再分别拒绝非v6的直接组合、以原件摘要核对28个评分包。生产有效v6提示及已生成答案不变，原生成freeze不改，没有追加provider请求。相关回归480 pass/1平台skip、3146断言/67文件，主/研究类型、12文档测试、链接/实验目录和四项零provider重放均通过；实际USD/真人分钟及未见任务可靠性仍未知。归档提示未直接保存单独的“无oracle”证明，隔离依赖生成前冻结、生成关闭后才读取oracle及现有prompt档案；此限制不升级为污染事实。

**AN16发布。** 工程、原始调用/评分档案和文档按职责提交；首次完整头`d028fe97a0485bb753de8b6dc1b50acd0cde4ff8`已推到用户`origin/skill-ir-aot`并逐SHA核对，当时工作区干净。最后状态记录单独提交和同步；不扩样、重发失败行或读取保护集。普通入口见[task-semantics示例](../../examples/authorization-assessment/task-semantics/README.md#start-from-a-scoped-current-task)，逐案评级、费用未知项和零provider重放见[评价摘要](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/evaluation-summary.json)及[验证记录](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/verification.json)。

**2026-09-30交付后复核：评价与编写职责更正。** 父任务在`0decb0ef`上复跑480 pass/1平台skip、3146断言，主/研究类型检查及evaluation replay通过；本次模型和目标调用均为0。三项只读独立核验后，主任务直接检查原始响应、生产接口并运行内存反例，确认：

- [作者检查器](../../results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/author-protocol.ts)第93–100行用区分大小写的子串匹配检查Markdown。Memos修订稿明确写`Expected policy result: Deny`，只因缺小写`deny`被拒；内存中仅把该词改为小写即通过。Paperless修订稿的两条完整前提保留了相同授权事实，逗号差异导致整句匹配失败。这是原协议误拒，不是已证实的语义遗漏；派生变稿及消费仍未执行，不补算其成功。
- Paperless v2变更稿正确提交两条premise修改，普通local-edit返回ready且policy保持原样。原协议还要求request换为新问题，但[local-edit](../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts)的操作集合没有request修改；给作者的known context/draft仍带旧request。该行暴露接口与评价要求不一致，原有“改动了受约束政策/请求”的描述已更正。
- 两份新前端原稿与各自prompt中完整的`currentTask`按解析后JSON逐字段相同。它们验证了已给定领域声明的复制、编译及消费，尚未测到由自然任务提取这些领域字段的能力。新前端减少引用负担的实现确实存在；4/4相对另外两条路线的研究解释需要公平的事实输入和语义验收。

原始freeze、响应、评分和计费文件保持原字节，5/12、10/24仍是原协议的实际执行结果。本次未重评全部作者或补跑被阻塞行。后续讨论优先级为：语义验收校准与接口可表达性、自然任务到当前领域声明的实际编写、以及能暴露遗漏/矛盾的同类变化任务。新一轮任务书和执行尚未启动。

**2026-09-30用户澄清与职责核对。** 质量约60%、编写复用约40%是开发精力的安排，不是项目要求或评分权重。当前领域依据是Cloudflare `security-audit`与GitHub `security-review`的授权职责切片，见[skill职责图](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/skill-duty-map.json)；AN实际运行的是SkVM声明与宿主，未执行这两个完整源skill。Open WebUI、Memos、Paperless是目标源码，不扩充skill成员分母。普通[skvm-authorization示例包](../../examples/authorization-assessment/reusable-skill/SKILL.md)调用已有SkVM安装或checkout，未自带运行时。

目前有确定性schema/编译、义务与分支展开、源码准备、引用/覆盖检查、一次局部修复、变化复查和材料复用代码；分析host仍将固定源码送入模型，没有可执行的探索工具循环。旧trace优化路线另有程序脚手架和包导出，两条路线的能力分别记账，尚未证明当前授权DSL自动导出并接管完整源skill。

信息边界需要按职责检查。此次抽查未见AN生成链读取评分oracle，但GetSharedMemo的prompt政策已包括无需认证、有效token仅访问关联memo及失败NOT_FOUND等具体行为，来源写为固定源码与任务作者要求；这些内容会预先完成一部分行为整理。作者侧完整currentTask、入口、关系、期待和条件分支也由研究适配器预先组织。后续把用户规范要求、原始证据、系统实际提取的候选事实、评价答案分开；若考察行为调查，源码行为必须在运行中分析，不能先放入规范文本；若考察政策符合性，可提供真实外部政策，但保留实现是否满足它这一待判定问题。已有完整声明走零模型编译，自然任务编写从未填好的目标结构开始。当前fixed-context实验保留为局部机制证据，质量主实验应逐步覆盖需发现依赖、处理例外与变化的真实同类任务。

下一轮讨论允许继续改DSL领域语义和编译/工具支持，而非只改说明。可考虑区分行为调查与政策符合性任务、让同一事实成为说明和变更的共同来源、按诊断补读决定性源码；这些是待设计候选，未在本轮启动实现或模型实验。


</details>

### 7.34 AO 真实授权任务与领域取证工具

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-09-30，用户在AN复核与输入职责讨论后，授权`gpt-6.1-sol / max`执行[AO0–AO16](../superpowers/plans/2026-09-30-authorization-inquiry-and-evidence-tools.md)。2026-10-01从干净aea87139启动；工程、56行真实生成与语义评价已完成，有限验证与发布状态以[机器状态](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/status.json)为准。本轮支持有界取证和自然作者接线，未建立DSL稳定质量或人工节省优势。

本轮处理五个相连问题：作者语义误拒和request编辑缺项；完整目标声明预供；把源码实际行为写成已知政策；行为调查被强制要求expectation；分析宿主缺少运行中补读依赖。普通入口沿用SkVM，增加behavior/conformance区分、共用只读工具和领域观察/缺口队列；旧fixed-context路径继续兼容。

行为调查直接问实现中的授权行为，不构造假规范；政策符合性使用用户独立要求。模型从原始源码提取控制对象、资源绑定、效果和例外，宿主检查实际已读证据与引用/范围；语义判断仍接受独立复核。自然作者从brief提取领域内容，已有完整DSL直接零模型编译。取证和作者调用进入完整成本，不能只统计最终回答。

工程复用已定位的`readDiscoveryWindows`、`prepareAuthorizationEvidence`、`loadPortableSourceBundle`、skill-loader、runAgentLoop和计量；bare-agent原工具含写入/命令/网络，本轮需显式只读工具集合或薄adapter，执行器实际限制能力，旧默认不改。Cloudflare `security-audit`和GitHub `security-review`按已登记ref取正文并实际加载，授权职责接入与剩余职责分别报告。

质量面板在已暴露项目上以自然任务比较Markdown+共用工具、DSL基础路线与DSL领域取证路线，24主行加8变化行；两任务8自然作者稿/至多8消费和两个源skill8使用session另列。所有路线访问相同原始源码范围，不给D臂预写控制路径或目标答案。开发精力六四开，不设六四分数；原AN评分和历史字节保留。精确接口、运行预算、失败处理与验收在任务书，后续实施发现需同步本节。

**AO0–AO3接口与反例。** inquiry/v1把repo/ref/sourceRoot与允许范围留在context中，behavior不接受规范政策，conformance缺独立policy返回policy-required；纯compiler展开六类pending检查事项，不生成控制、expectation或旧conclusion。result/v1保留实际behavior/branches/missing，只有conformance有policyAssessment；observation检查本次展示证据及question关联，semanticSupport始终unreviewed。local-edit增加request操作，所有场景进入复查但policy/未指定文本保持。10项/53断言聚焦通过，初红及固定来源获取过程入journal；源skill原件已按ref获取，不把历史摘要当loader原件。下一步是同次分析内的受限源码请求。

**AO4–AO9工程与校准（2026-10-01）。** 生产新增`authorization inquiry init/check/run/inspect/edit/compare`，输入采用natural brief或完整inquiry、相对sourceRoot与allowedPaths；check不建provider，D0/D1在run中调用自然作者，M保留brief。共同只读工具在同次分析补读，稳定原行证据，D1增加六关系pending队列/observe反馈。结果只做结构/已展示证据检查，首答与终答分开，最多一次交付修复。普通bare-agent opt-in保留完整源SKILL和配套引用，注册共同读工具及可选compile/observe/check_result，原生continuation和实际请求入账、增量轨迹在源码根外保存。循环、Windows junction越界、未读证据、源码变更、预算和归档篡改均有确定性反例；归档比较不依赖JSON属性次序。

32质量、8作者稿、最多8消费、8来源skill使用共56行已登记，模型xty/gpt-5.6-sol；四项目固定ref共800原始文件，两源skill共28文件及许可证保留。Gitea upstream辅助范围补齐，synthetic重命名以实际gitea.dev模块前缀更新；改名/短路variant明确非upstream、非unseen。36项输入/方法和真实loader/注册预检零provider通过。12 dispatch/24动作/256 KiB累计model target-source/300s每调用/1200s每session固定，索引512文件/8 MiB；源skill参考正文另计provider token，不冒充目标源码。claim前置、unknown不重发、连续两次基础设施故障暂停新派发。仅登记和源码身份提示进入模型；evaluator、历史答案与construction说明不在生成范围。

[AN校准](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/an-calibration.json)零调用读取旧原稿的诊断修订响应：Memos的正确`Deny`因小写字面判据误拒，Paperless完整permission/owner前提因逗号/反引号差异误拒；只确认具名语义事实，未把整篇稿判为等价。旧变稿依赖阻塞、调用0，不能补作成功。旧GetSharedMemo policy本身预组织了实现分支，本轮behavior brief不供应这些规范答案。原AN分数、字节和分母保留。普通示例增加自然任务→同次读证据→回答→改request/compare；source-only和完整安全审计职责仍分列。

**AO10–AO12实际结果。** 工程218f5bbf绑定后完成56/56终态、319次provider派发。默认cache未命中xty route导致首4行配置失败、调用0；明确选择原有repo cache后只继续未claim行，没有重发或连通性付费探针。质量32行中27 completed、1 completed-with-diagnostics、4配置失败。两次Markdown Memos消费因单次提案反复超过8个工具动作而transport-failed；其4/3调用和原始输出保留，不归为基础设施丢失。生成全部关闭后才建立65匿名packet/104首终映射；61非空packet由六个独立default-agent复核，方法元数据隔离而表示仍可能被推断。

| 质量面板 | 计划分母 | 首答完整 | 终答完整 | 实际调用 | 完整prompt tokens |
|---|---:|---:|---:|---:|---:|
| M 主行 | 8 | 1 | 2 | 51 | 917,887 |
| D0 主行 | 8 | 1 | 1 | 49 | 554,070 |
| D1 主行 | 8 | 1 | 1 | 47 | 721,180 |
| M 变化行 | 4 | 3 | 3 | 26 | 301,925 |
| D1 变化行 | 4 | 2 | 2 | 25 | 293,718 |

共32行首答8、终答9完整。缺项主要是可补的owner/permission/privilege/helper/upstream证据链、行为disposition与解释矛盾，以及已知null-owner前提仍留不适用分支；通用只读工具确实补读原始源码，但pending队列未保证模型选择和解释决定性依赖。四条零调用配置失败使主行已交付数M/D0/D1为7/6/7，不能按总tokens较少宣称效率优势。短路变体正确拒绝无需枚举已不可达依赖；重命名变体跟随新符号仍可能漏关键helper。当前默认不因低分或未赢而调整。

**作者与复用。** 从自然brief独立生成的MD/DSL原/变各4稿，8/8结构与语义有效，32项登记需求均保留；没有宿主代填领域答案。作者9调用（MD4、DSL5，含一次结构transport fallback）。自然消费MD交付2/4、DSL4/4，严格完整各1/4；完整消费成本分别20/28调用、282,864/535,285 prompt tokens。四份变化compare均needs-review，保留旧失败也能比较依赖。主代理按生成前四项义务逐项记录最终消费为17 full、7 partial、8未交付（共32）；这个义务附录不是另一轮独立评审，严格session分母仍2/8完整。DSL null-owner变稿多留两条不适用branch和对应缺口，不能把字段齐全算当前任务完整。真人修改时间和节省均未测。

**源skill使用。** Cloudflare/GitHub原文及28直接配套文件固定ref保留；8session均经普通loader完整加载，扩展包保留原文前缀。原包4/4回答交付、3/4严格完整；领域包4/4交付、4/4语义完整，实际26/38调用、380,087/728,795 prompt tokens。这一小面板差异来自一个原包路由继承缺口，不证明稳定或类别级收益。四领域包均实际compile，native history共17个领域名称动作、14成功/3拒绝；runtime操作计数15另列。Cloudflare Paperless包耗尽工具预算后observe/check被拒绝，仍交付有据prose但没有checked domain result；因此领域结果检查是3/4，不能把注册或回答正确冒充完整工具闭环。其余安全审计、依赖/密钥扫描、动态执行、修复/patch、差异审查和全仓覆盖仍按source duty map保留，未被授权切片替代。

**AO13工程修订及评审裁定。** 普通native路径先前仅给repository/scope，scope文件里的独立policy未传给模型；新增natural conformance与完整inquiry反例确认红灯，最小修复传递当前声明原字段，2测试/11断言转绿、provider0。56行实测的自然prompt原已提供mode/policy，不受该缺陷影响，故共享修订session0且原冻结不改。原始评语保存在[receipt/raw](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/review/receipt.json)，[具名裁定](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/review/adjudications.json)纠正v2实现违规被误算答案错误、notes政策串入share政策、prose格式扣分和邻接process_text误当process_file；统一把允许范围内未读决定性依赖记为可补缺口。pretty-file SHA只在原字节确实匹配时归一到packet SHA，一份作者digest漏字符经原稿及四义务复核纠正；没有改写答案、源码或原评语。独立完成审查未报告可证阻断缺陷；之后的普通输入传递修复由主线程红绿验证。

**费用与交付边界。** [评价摘要](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/evaluation-summary.json)保存逐行首答/终答、结构状态、review、source IO、调用与时长。全部319调用usage已报告：fresh input3,956,583、cache-read769,792、output196,444，完整prompt4,726,375（缓存仅一次）、完整prompt+output4,922,819；累计响应4,923,698.496ms、逐session墙钟合计4,959,264ms，合计并非并行实验日历耗时。319项actualUSD均未报告，总额unknown，已知小计0不表示免费；开发代理tokens、真人分钟unknown，目标执行0、共享修订0。一个仓外普通例子复制后check/edit/inspect/compare零provider通过，并复用已有Paperless session验证相对源字节、旧结果current及修改后needs-review。工程能力和复验成立，模型取证完整性与整体方法净收益仍未建立；不追加采样。精确恢复命令见[结果入口](../../results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/README.md)。

**AP运行合同修复（2026-10-01）。** AO关闭后复核确认：两条消费的模型Schema未暴露本地1–8数组界限、既有fallback未提供首次具体字段诊断，native共用24动作可在最终check前耗尽。[AP0–AP4](../superpowers/plans/2026-10-01-authorization-runtime-contract-repair.md)用通用临时源码/mock先红后绿修复三处共性合同：两通道保留min/max/exact长度；一次既有fallback收到有界path/code/界限/实际数量数据，9/10动作可按8加剩余动作分轮请求，不截断；native在总24内保留22探索+2最终check，拒绝与执行分账，无效第二次check清除旧result。工程`ef9f1e57`已与用户origin核对；44测试/201断言、主类型、文档12测试及AO 56行/104映射离线重放通过，独立只读核验无阻塞。[验证记录](../../results/skill-ir/authorization-runtime-contract-repair-20261001/verification.json)单列mock恢复。原AO全部证据、分母与质量/费用统计不变，项目model/API/paid调用0；没有新增真实质量或人工收益证据，也不保证模型取证和结论必然完整。


</details>

### 7.35 AQ 授权领域执行设计

<details>
<summary>已关闭阶段的设计、结果与问题记录（展开）</summary>

2026-10-01，AP代码、44项测试/201断言、主类型与AO离线重放已复核通过，用户授权[下一轮AQ0–AQ16](../superpowers/plans/2026-10-01-authorization-domain-execution.md)，由`gpt-6.1-sol / max`执行，Flash请求未由派发接口确认。2026-10-02有限研究关闭，以下保留设计、开发问题与实际结果；完整机制验收缺口和收益未建立分别记录。

**根因和取舍。** 现有`compileAuthorizationInquiry`只展开六类pending问题；`inquiry-run`把它们放入提示，源码动作仍由模型选。`conditions`与`assessment-program`已有请求/覆盖合同，但没有条件真值求值器；`inquiry-result`核对结构、问题和已展示引用。这解释了为什么字段已经丰富，允许范围内的helper仍可能漏读、明确null-owner仍保留不适用分支、源码allow仍可能与规范deny混写。继续加提示改动小但缺执行约束，完整静态分析平台范围过大；本轮选择局部规则提取与宿主领域执行。

**方法。** 运行期控制slice区分主体、资源、guard、effect与路径依赖，所有规则记录证据与来源。模型从原始材料提议规则和依赖，宿主在共同预算内实际执行唯一可定位的补读；歧义、范围外与部署未知各自保留。有限条件代数支持相等/空值、all/any/not及已知前提代入，未知保留residual，早拒绝和明确前提可以排除无关路径。结论检查核对控制对象与效果对象、分支适用性、冲突及行为/政策对照。形式一致性和源码提取正确性分列，避免将带引用的错误规则固化成错误结论。

**研究依据。** [RepoAudit](https://arxiv.org/html/2501.18160v1)支持按需局部分析、跨函数记忆和多层核验的组织思路；[IRIS](https://arxiv.org/html/2405.17238v3)提供模型语义提取与程序分析协作的参考，提取质量仍需单独评价；[OPA的partial evaluation](https://www.openpolicyagent.org/docs/filtering/fragment)说明已知值代入、未知量保留条件的语义。这里采纳方法分工，不搬用论文效果数字，也不引入完整CodeQL/OPA运行平台。

**开发与检验。** 沿用inquiry/native两个入口和旧默认，新增可选`domain-evidence-v1`；同一核心在普通包中运行。AO八任务的M/D1与新旧策略四臂32session，加两个预选任务的四臂重复8session；另4个关闭机制消融和4次原skill普通消费，均为已暴露development。全部使用AP后共享运行器、原始源码和独立政策，没有预写控制路径。作者、提取、fallback和修复全部计费留账，不重复AO已完成的8稿作者面板。评阅分别检查提取、执行和最终回答；研究收益依据真实数据报告。

**AQ0–AQ2/AQ5/AQ6实施（2026-10-01）。** 从干净`c0cd32d2`启动，AP包含；本地`xty/*`路由与凭据可用性零dispatch确认。原结果独立只读定位把可读未读、对象错配、分支/政策矛盾和AP协议失败分开，登记在AQ root的`mechanism-cases.json`，它不进入模型输入。新增control-slice、control-evaluation、control-conclusion三个纯模块：局部key由宿主补稳定ID和digest；显式`after`表示控制先后，`authorizedBy`只表示提取模型声称的授权关系，不能从同名对象推断。rule的condition是该节点可达条件，effect/reject是路径终点，complete是待核验的提取闭合主张。模型将明确用户原句映射成已知binding；映射意义仍unreviewed。policyRules必须引用当前独立政策，映射不完整保持undetermined。谓词使用独立有限校验而非递归展开大型模型Schema，支持eq/neq/is-null/all/any/not，12层/64表达式节点有界，unsupported保留具名诊断。

14个纯模块业务反例先红后绿、95断言通过：原行证据与问题隔离、policy冒充source、null/missing、冲突增量及显式修订、全三值表、短路residual、typed对象、显式前驱环/缺口、错误行为/政策与17路径超限均被捕获。提取语义始终unreviewed。

**AQ3–AQ10接线与预检。** 依赖调度只接受已读源码中词法出现的提议symbol，从共享索引给位置候选；唯一位置每轮最多两次真实source_read，候选歧义需要模型显式修订。实际动作留origin、question/dependency、理由和预算；缓存复用已展示范围，源变化、父依赖环和范围外分别保留。read不等于checked，须把helper证据纳入有显式前驱的局部规则；这个checked仍只指运行合同。普通步骤可提交control delta，native observe/check进入同一个runtime，自动读占用共同24及native22探索额度。checked旧结果在提议修订后失效，关闭后无续发。每次检查保留原规则snapshot、raw结果和诊断，首答/终答的提取可独立评阅；不在模型上下文重放整份proposal ledger。

当前已知值绑定核对**原始用户brief/declaration**的原句，不能把作者模型新写的premise升级为用户事实；具体值映射仍需语义评价。policy自然原句只形成独立候选，未映射路径的规范结论undetermined。修改compare列policy-only/premise-only/source/strategy与受影响计算，源未变时机械索引可复用；当前保守地不自动加载旧语义slice，新任务fresh分析，因此未建立仅政策重算的成本节省。实际adapter文件是`bare-agent.ts`，任务书的`bare-authorization.ts`名字只对应测试，未新建第二adapter。

联合回归474 pass/1平台skip、3151断言；随后检查snapshot与作者伪造用户前提反例25 pass/166断言。主类型通过；研究脚本另有strict typecheck和3项分母/不重发/匿名隔离测试，24断言。40输入组合、两原skill普通loader及实际companion读取零paid预检通过，source工具不注册shell/写/网络，oracle canary拒绝，相对输入root正确。登记固定40质量+4消融+4native，臂顺序轮换、预选重复反序、最多两worker独立进程；生成关闭前禁止建立语义packet。此时真实provider调用0，规则提取和最终质量收益仍待实测。

**AQ11共享合同缺陷与预登记修订。** 首轮真实请求暴露共享JSON Schema转换遗漏：ZodEffects包装的字符串identity被发成object，record(unknown)的谓词成员被发成object，显式null也被发成object。两种extraction transport使用同一错误转换；这属于共享实现缺陷，而非答案低分。真实请求字段与先红的schema-capture回归登记于AQ root的`shared-revision.json`。原48单元继续绑定`3d4ba681`，全部关闭后才修转换；在任何语义评分前登记OWUI ingestion、Gitea self-query、Memos remove、Paperless notes的M-E/D-E共8个修订单元，条件和预算不变，独立列账、不替换原分母。native使用手写工具合同，不因这处转换修复追加采样。匿名评价同时保留raw首答/终答与native文字交付，检查是否工具验证成功单列；只提供原源码范围索引，按原文件核验意义，不从字段数推断质量。当前生成未关闭，尚无语义效果结论。

**AQ11恢复与共享修复。** 用户要求继续任务书后，确认原48行已封存（22 completed、20 transport-failed、2 budget-exhausted、1 timeout-unknown、2 completed-with-diagnostics、1 adapter-crashed），记录358次dispatch，未知完成不重发。两项既有红例新鲜复现后修复：共享转换器展开ZodEffects的输入schema，保留unknown/any的自由JSON值、显式null与nullable联合；本地Zod refinement与语义校验继续执行。研究driver为预登记revision绑定独立实现、沿用原任务/预算与独占claim，原48行不变。12项聚焦回归81断言通过；相关联合481 pass/1平台skip、3208断言，主/研究类型通过，原48行身份与预算零provider重放通过。修订八行只用于此具名实现缺陷，不按答案质量重抽；尚未建立语义评分或效果结论。

**AQ12生成关闭与评价裁定（2026-10-02）。** 首轮48行绑定`3d4ba681`，修订8行绑定`04b1b220`，全部关闭后才生成56匿名packet。6位独立首评、3位定向二审、2位图/动作审查读原源码；原文逐份保留，1份图审JSON的3个括号仅作格式恢复。主开发者沿实际raw、source、proposal/action/check裁定；首轮裁定先于汇总揭示，最后定向修正沿具体源码差异在汇总揭示后进行。开发者已见历史材料，最终裁定不是完全独立盲评。评语出现把无prose的raw答案当未交付、把未知owner/grants本身当错误、把手工读helper当自动命中、把传输Schema失败当checker检出等问题，不能直接把多数意见当真值。两个具体错误由源码复核确立：Notes消融把not-given grants当absent；Notes修订M-E在non-owner/no-grant拒绝条件里漏掉null-owner，`permissions.py:624-635`与`views.py:1857-1892`证明该分支仍可通过。完整条件答案与host接收状态分开；原图、原答均未手改。首个未接受控制proposal也参与提取评价，legacy observations不计控制图。裁定、原评语和56行见[AQ结果](../../results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/README.md)与[逐条裁定](../../results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/evaluator/adjudications.json)。

**实际质量与失败。** 40质量行M-L/D-L/M-E/D-E交付9/10/3/4，首/终full1/1/1/1（各10），过度unknown8/9/2/3；主面板无已证决定性错误，未交付仍在分母内。32原任务full3、8预选重复full1。4消融（OWUI scheduler-off/checks-off、Notes scheduler-off/checks-off）分别partial/not-delivered/full/incorrect，不能用这4个含协议失败的单元独立建立机制净收益。共享修订8行交付3/full1/incorrect1：2 completed-with-diagnostics、3 transport-failed、2 timeout-unknown、1 budget-exhausted；不替代原48。首轮存在共同Schema实现缺陷，不能把领域臂低交付解释成无缺陷实现的纯语义效果；不能丢掉失败后只报幸存答案。未建立稳定质量、token或人力净收益，结论negative/benefit-not-established。

最后定向源码核验发现三份ShareLink首評full不成立：两份自述owner-aware helper未读；一份helper已读但PassUserMixin未读，尚未证明serializer self.user与当前caller的来源关联。另两位只读核验者检查这些具体差异及剩余三份Memos share/Download full；评语原文另存。主裁定对actor绑定缺口保留partial，即使定向建议full，依据为`views.py:406-428`与`serialisers.py:2873-2885`，不盲从评语。两政策的措辞不同，不把Notes的禁止ownership替代条款移到ShareLink。草拟汇总中的2/2/2/1因此更正为最终1/1/1/1；原答案与原评语保持。

**真实机制与原skill边界。** 实际成功自动source读取11次/7会话（主面板1、修订10），失败或完全重复区间0。命中Memos current-user/resolver、Notes owner-aware helper、Gitea reqToken、OWUI file lookup及process/vector正文；分两段的正文续读不是同区间重复，也不能把父函数正文补读夸大成新helper发现。Host不适用路径/依赖0，未证明真实null-owner程序分支排除收益。7会话可沿缺失source binding node或非法有限谓词确认合同诊断；自然政策映射不足和对象/路径未闭合不等于checker误拒正确源码解释。提取图整体partial，不声称所有规则意义已独立证明；未建立语义误拒、错误接受或后续程序放大错误的具体事件，不据此声称无漏检。

四次原skill普通native消费保留完整原文、reference/compile/observe/check均有trace。Cloudflare Notes原/owner=null、GitHub Memos原/policy-v2的raw语义full3/4，另1份Memos原任务虽读三个backend但未读current-user与member resolver正文，源内主体/资源绑定缺口不能归为deployment-only；变化任务实际读了这两处。3份最终prose，变化Memos在预算末adapter-crashed但raw首/终存在。四者checked delivery0/4、自动source补读0，所以AQ13完整机制采用链未满足。纯函数与普通inquiry接线有工程证据，不能用它替代这项原生实际验收；AQ8只报告变化与机械索引适用性，fresh分析而非政策单独重算，复用节省也未实现。这些缺口保留，不另开采样追positive。

**完整代价与有限收口。** 全轮434次provider调用（首轮358/修订76）、0目标执行；已知input6,609,885/cache-read1,673,088/output388,229，完整prompt8,282,973 tokens，4次usage未知，434次USD未知，总USD为null。实际返回model、底层attempt数、开发代理用量/费用和真人分钟unknown；累计会话墙钟19,391,890ms不能当并发研究历时。源码index/physical read/display/cumulative model/resent分别103,011,150/361,969,155/1,116,705/4,116,030/3,012,441字节，是各会话阶段相加，非独有源码量或token。主/研究类型、481 pass/1平台skip、56行study/evaluation零provider重放通过；研究边界新增裁定变化不能重放旧分数的红绿例，8测试52断言。有限文档、历史保护、凭据与发布检查由AQ机器记录承载。保留opt-in工程，不提升readiness、不追加研究身份；最终发布到用户origin后停止。


</details>

<details>
<summary>AR 开发过程记录（§7.36–§7.46；进程已结束，未达项由 AS 接续）</summary>

### 7.36 AR 宿主引导运行与现场修复

2026-10-02，用户确认在复核后整理旧/新策略问题，下一轮必须对每个真实不良表现当场进行针对性修复并验证，同时继续开发。执行安排见[AR0–AR23任务书](../superpowers/plans/2026-10-02-authorization-guided-runtime-and-online-repair.md)，开发线程为`gpt-6.1-sol / max`，约12小时主动工作。本节保存设计与后续开发复盘，计划阶段不预填效果。

**经过核验的差距。** AQ主面板每臂8原题加2重复。M-L/D-L有可评价答案9/10、10/10，M-E/D-E为3/10、4/10；full均1/10。旧策略证据不足与新策略交付退化同时存在。AO同类原任务本来是M2/8、D1 1/8 full；AP只完成共享实现修复，无新质量面板。原skill四次消费raw3完整/1部分，checked0/4，不能从“没有checked”推断模型所有文字都错误。AQ修后8行有3可评价（1full/1partial/1incorrect）、3传输失败、2超时；修Schema后仍有任务机制与接口问题。

**代码与真实响应对应。** `inquiry-run.ts`的control分支使用delta，而tool/observe/final附带controlDelta；修订M-E真实响应给kind=control/controlDelta后被拒。native把嵌套control/result声明成泛object，靠长文字说明其结构；真实调用混用了source binding节点与user value绑定。宿主已有稳定ID和digest，但模型仍承担局部key、关系、修订目标与digest填写。调度器须先收到合法dependency，读helper后还要模型补一条有前驱和引用关系的规则才能进入checked；因此11次自动读没有形成完整使用链，四native自动读0，实际host排除不适用分支0。

**新增可复现缺陷。** 复核在`control-conclusion.ts:64`发现全question寻找binding，未要求其为当前rule的可达前驱。离线构造entry、恒假分支中的principal/resource绑定、只在entry后执行的effect，检查仍给ruleConsistency=true和bounded。该反例与原AQ实验失败分开，尚无证据证明它是原低分的原因。此次复核35聚焦测试/232断言及56行study/evaluation零调用重放通过，反例暴露现有测试未覆盖的关系约束。AR4补红绿回归。

**真正的设计问题。** 旧策略让模型自行搜和判断；AQ增加程序计算，但程序工作以模型先写好相当完整的图为前提。于是模型既要分析源码，又要维护图和接口，工作增加先于接管收益。有限真值表可以正确求值，但owner-null、not-given grant等条件若未正确提取，求值器无从补救。共同症结是取证缺口→下一步动作→局部解释→关系闭合这段运行控制还不充分。

**本轮分工。** AR复用既有模块，新增opt-in guided-evidence-v2。六类领域义务成为宿主worklist，候选依赖在没有完整控制图时也能进入定位/阅读；已读窗口进入局部解释队列，模型只提交当前问题的带出处语义增量。宿主承担统一wire、证据定位、机械身份、当前目标修订、状态推进、失效传播与预算。模型解释主体/资源/guard/effect/条件，宿主检查可达前驱和对象对应。词法候选不被自动提升为授权事实，原问题与policy均保留来源。

**现场修复协议。** 发现共享Schema或运行器故障立即暂停相关派发，保留已运行失败与未运行行，修改共享实现后同题复验。取消AQ“首轮全结束后才能修”的安排。每项真实不良结果都有根因、修复、复验和improved/unchanged/regressed/unresolved记录；同根因共用修复但逐项关联。修后表现与首答分列，新失败可以在本进程继续处理，不能盲重抽无变化的请求。每两题一块实时评价，整个过程标为adaptive development；比较按相同revision/模型/预算的块呈现，禁止答案泄漏或更换低分任务。

**继续向前的工程目标。** 除补AQ缺口，还实现政策/前提的实际局部重算、源码依赖失效和普通包的自然编写/修改使用。政策只改时复用仍适用的行为解释并重新映射规范；前提改时重算分支、补新激活缺口；源码改时按依赖失效。信息不足回fresh分析，旧结果不冒充当前结论。原skill的raw质量、checked交付、自动机制采用分别记录。开发精力约60/40仍只作工作安排，效果以真实结果判断。

**验证与排期。** 首个真实接口探针在AR2接线后立即执行，后续补读/解释随模块开发即时检验，不再只用手写合规mock通过后直接启动大面板。主比较八题两臂，四题增加同新核心的M辅助臂，区分整体流程和表示作用。使用已暴露development与非答案性的变化，不启动保护集/prospective。核心提前完成再按序做组合分支、复用体验和有数据的性能热点；不等待或重复全审计凑12小时。工程未达、使用未达与收益未建立分别保留，不以队列终结替代验收。

**当前使用边界。** 普通skill入口仍注入完整原skill，显式启用领域工具后由DSL组织其中的授权任务；独立inquiry入口可直接消费任务声明。能力针对源码可见的授权/信任边界任务类，同类任务跨skill复用，具体声明绑定当前任务、源码、用户事实和独立政策；未覆盖职责仍保留，普通默认不自动转换完整skill。新非API程序已有原skill→当前proposal/export→同包原/变自然消费证据，两份授权作者配置已格式有效；中性前提变化已实际checked复用，完整原skill授权checked交付、真实授权政策/源码变化复用仍未验收。

**最近修复与效果分层。** 真实OWUI local替换已被接受，旧重复add冲突归零，语义/最终图仍不完整。公共loop原额度内最多四交付派发并防探索两派发跨线，具名研究修复只豁免完整已知的显式祖先链；稳定82ede6e6的OWUI及中性相关检验各10/10，首final格式修复与结果诊断修复实际发生。OWUI原/终仍partial，中性原/终full、终答checked/bounded。首次公开previous9/9已导入证据/结构、重算当前路径，却因相关反事实写入当前分支而拒绝；两种源码行为解释full。公共指南/既有诊断澄清字段角色后，稳定89553549同一输入的具名previous8/8初/终checked/bounded，0新源码工具动作，105证据字节导入，false源规则保留/路径不适用、true路径checked，最终答案重新生成。仍有多余premise-unspecified标签，其detail明确没有缺事实；正文反事实无inline行引用的可用性也保留。独立评语与主裁定分列：要求排除的false再次列入当前branches不符合既有合同，compare的controlRulesReused:false描述零调用比较，不能否定后续实际run复用。累计507，新增均已知响应；原失败、unknown、首次16分母不改，实际授权使用与质量收益仍未建立。见[组合交付真实结果](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/combined-delivery-outcome.json)、[当前分支复用结果](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/current-branch-contract-reuse-outcome.json)及分列评审/主裁定。

**AR0–AR2启动（2026-10-02）。** 从干净`260477cc`开始，实际被测路由`xty/gpt-5.6-sol`配置及认证可用（未输出凭据）。AR root记录独立工程/使用/效果状态，原AQ材料只读引用。现场驱动的红绿测试覆盖共享缺陷停派、在途保留、原答不可覆盖、修后累计调用及未知成本、合法unknown；十份原/变输入离线检查通过。统一wire把structured control的模型可见字段改为controlDelta，旧delta只作无损别名；native从同一Zod生成完整nested schema并按同一合同解析。29项入口/Schema聚焦回归通过，真实短探针已立即启动，结果及后续修复待实际轨迹确认。此时guided工作队列、复用和质量收益尚未完成；不得从接口测试推断效果。

**首个接口探针与现场修订。** 中性四行源码的六调用探针未交付，使用6次真实provider、目标执行0，成本未返回；原请求和响应留于`probes/wire-1`，不计主质量面板。运行指南的`right:value`使模型反复提交裸布尔操作数，而实际代数要求左右均为`{binding}`或`{literal}`；随后模型又在最后机会提交control而非final。已明确指南格式并在剩余两次调用时限制为带可选局部增量的final（初次检查及诊断修订），不提高探针预算。停派驱动的并发回归又发现归档/评价与下一任务派发竞态，改为最多两题一块、全部已在途收齐后再推进。453 pass/1平台skip的相关联合回归、主类型、研究类型通过；修后真实同题验证待结果。旧AQ两份真实control响应重放仍因object型身份字段无效，未做猜测性强制转换，接口恢复不等于历史语义修复。

**第二探针与可达绑定修复。** 同原输入/同六调用预算的`wire-2`用5次调用取得正确的两分支原文字，但初次缺图/多余policy、修后把“enabled is unspecified”映射为已知null，故checked仍失败。独立只读复核认可原文字；其“null是合理未知占位”解释被主线程依据`controlBindings`及`partialEvaluate`纠正：null会按已知值比较并排除true/false路径。原复核和主裁定分开记录。新增保守显式未知文字拒绝规则及指南，unknown不再可伪成null/false；其它语言映射仍unreviewed。AR4红测试确实得到恒假非前驱、可达非前驱和同identity多对象均漏检，修后改为当前question明确前驱的唯一绑定。合法共同前驱和跨题隔离保留，458 pass/1平台skip联合回归通过。同题再复验仍需真实结果，未据原文字成功宣称checked。AQ绑定混用已定位到Cloudflare changed实际observe第22行，来源节点误放bindings被既有schema拒绝，先前type-error引用已更正。

**第三探针与局部更新接口。** `wire-3`在`480b38ad`用3次调用后transport-failed：tool根部额外observations被正确拒绝，但诊断未列未知字段；随后prompt+parse重发大Schema，返回两个拼接对象。原件保留，总调用14、目标执行0、费用未知。共享提取器新增具名字段诊断和一次同工具修复，保留完整工具合同、失败phase/sequence/rawResponse及计量。guided局部add/replace接口已接通普通inquiry/native共用运行时，sourceBindings与premiseValues分离，宿主填写revision digest，逐项拒绝保留好项并暴露未解决引用，原子回滚保留候选缺口但返回当前状态缺口。只读核验的跨组替换、dependency parent、回滚缺口问题经主线程红绿验证修正；dependency reason与替换元数据重名造成被丢也由新用例发现并修正。存在拒绝项时不能同时报一致/完整。468 pass/1平台skip、3203断言、主/研究类型通过；真实同题复验待执行，完整工作队列、实用与收益尚未验收。

**第四次同题复验与内部状态修正。** `wire-4`在`47016856`、原模型/原六调用预算下用5次调用checked交付正确两分支，bindings为空，未知输入未填null。首答仍多出behavior题的policyAssessment，仅该项经一次诊断修订移除，首/终原件分列；无Schema错误，因此本次没有直接触发同工具错误重试，不能将全部改善归因于它。总真实调用19、目标执行0、费用未知。点检又发现实际源码已完整读到，但`pathHint:"entry.ts:1-4"`被误作范围外；任何missing抑制decisive缺口的旧条件还会让前提未知遮住取证状态。两处反例红绿后只无损归一确实匹配索引候选的path/range，决定性源码缺口须分别具名；实际原轨迹重读原源码、零provider且不改答案的重放将partial纠正为bounded、依赖checked。模型可见结果Schema也按已知mode排除/要求policy字段，通用parser仍保留原坏答案与诊断。该四行机制探针不计主质量面板，普通skill与完整引导队列仍待实用验收。

**AR5–AR8工程与只读核验。** 六义务从空图启动，实际原文的词法候选经唯一位置自动读取或局部选择后进入待解释；宿主轮转问题、复用确切范围并随控制修订重算可达性。局部解释与普通inquiry/native调用合并，模型只提交当前WorkItem的语义增量，宿主绑定题目/出处，不从符号相等推导意义。选定原窗口完整保留，旧证据列目录；诊断及再请求旧范围可重新显示。只读核验发现同文本不同路径能伪装已见证据，主线程反例红绿后按完整窗口身份匹配；再请求旧稳定ID不能进入当前窗口的反例亦修复。新鲜63项聚焦回归/347断言、主类型通过；运行器另有6项测试/20断言验证修订只开放原失败、其他缺陷仍停派、完成未知不重发。尚无真实复杂源码解释或质量收益证据；原Paperless/Memos的同预算源窗口探针独立于主质量面板，下一步立即检验。

**Paperless真实源窗口与AR9交接（2026-10-03）。** 首次启动实际为provider-unavailable/0派发，外层误读不存在run文件造成错误unknown归档；原件保留，经identity-bound inspect另列零派发裁定后恢复。第二attempt用2派发，首个原文局部解释因paraphrased未知项且atomic:true整组回滚，随后网络失败。共享说明补可省略/原文未知项、默认逐项、成功/拒绝节点可达条件和明确对象前驱；第三attempt首轮18项接受，实际自动读取notes和权限helper，局部机制有进展。但随后读到非决定性词法候选，四次step格式错误修订、当前局部错误未全关闭，11派发/10响应后最后一请求300s超时完成未知，无final。该请求不重发；所有原件、失败和成本保留，不能把局部进展算checked交付。三attempt合计13派发，加四个wire探针总32；actualUSD、真人分钟和开发代理用量仍未知，目标执行0。AR9新增逐题分层状态、规则轨迹和usableQuestions，反例发现同名跨题错误去重及runtime错误未并入分层报告，两处红绿修正；新鲜506 pass/1平台skip、3346断言/76文件、主/研究类型、零provider replay通过。独立复核进程被中断，没有结论。用户要求整理并转交gpt-6-astra/xhigh；任务书和恢复记录保存尚未达的真实Memos、普通skill、复用、作者包及质量面板，效果仍未建立。

**恢复后的AR9复核（2026-10-03）。** 独立只读复核发现整体校验失败仍有canonical result，主线程失败用例确认并修复；外层run原已检查valid，但嵌套validation/native工具输出存在误用风险。逐题checks-off原本正确标unverified，复核所指true实际在汇总字段，现改为null并保留基础schema验证。主线程全局源失效注入又确认referenceValid误保留true，已修正；相邻题observation错误、重复答案、全局结构错误与局部可用输出都有确定性覆盖。65项相关回归/338断言通过，新增provider及目标调用0。独立发现与主裁定见`ar9-review-adjudication.json`，不代替语义变形、普通使用与收益验收；继续处理Paperless已保留的共享调度和step格式缺陷。

**Paperless共享调度/格式修复（2026-10-03）。** 主线程原响应点检确认四次错误分别是纯controlDelta漏kind和无calls的纯tool/controlDelta；引导探索parser仅对这两种无含混输入作无损归一，完整模型合同、混合字段拒绝及final专用阶段保持，原response与归一序号单列。词法调度反例确认唯一同名定义会触发无关读取，宽窗口带入邻函数，同一位置多入口重复待办；现只在selected确切范围发现、按原位置去重，未确认引用先等dependency关联或明确候选选择。独立只读核验未发现阻塞，跨模块与真实语义仍由主线程负责。40项/231断言后44项/254断言聚焦验证通过；原首稿18接受及四错误在原源码上零provider重放成功，仅入口/helper两读。该重放没有模型延续和final，不改原timeout-unknown、不解除真实运行的未决恢复限制，也不推断实际费用或收益。

**普通native已知声明编译（2026-10-03）。** 完整input.inquiry在guided模式由宿主零provider初始化已有program/runtime，移除重复compile工具，首个普通调用即看到真实源窗口；natural brief仍由模型声明并单列编译工具次数，原skill全文与reference通路保持。失败用例先确认未编译/未计来源，修后native、ordinary CLI和bare-agent 19项/126断言通过，包括一读一check的完整局部链。这是AR10工程接线，未代替两个真实source skill的四次消费，也未记为模型或费用节省。

**AR9条件反例与AR12普通复用（2026-10-03）。** 两项独立只读核验分别检查分层交付和未提交复用代码。未知条件路径被无条件allow/deny使用的反例确认；修复保留规范允许的完整条件回答，只拒绝没有当前真路径的确定结论。已有wrong-object/dead-binding、逐题来源和全局错误检查成立，漏提取分支、同key伪对象及自然语义污染仍须独立语义评价，未据机械测试宣称检出。复用反例确认旧前提句出现在否定/纠正文本时会被includes误保留；改为清除前提上下文改变问题的全部旧值。旧checked flags不能代替当前重验，坏前驱即使旧标记未变也拒绝；但本地档案并非恶意同步篡改认证，未加自证签名。普通run --previous、compare资格预览、来源归档与计量接通，源码/旧窗口变化及未知完成均在provider创建前拒绝复用；政策fresh/reuse一致、新激活helper读取有确定性证据。相关联合回归528 pass/1平台skip/3602断言，新增两项回归后复用10项109断言通过；费用总32次provider、目标0保持，真实消费和质量收益待验。

**原始局部错误与恢复范围（2026-10-03）。** 只读核验提示的“重复错误”经实际response序号点检校正：sequence4引入两个禁用evidenceIds，sequence8漏op；sequence6已补替换理由，sequence10提交依赖Schema修正但被当时的外层格式挡住。旧诊断留在后续request不等于每轮重新犯错。缺op现在给出具体add/replace提示但不替模型选择，host字段诊断说明原窗口绑定；三原始坏项仍拒绝，离线重放无provider。共享格式/读取修复只支持哈希绑定、具名不同任务机制探针的恢复裁定；Paperless原任务与主质量面板仍停派，原失败unresolved与未知费用保持。独立恢复核验发现完整row身份未绑定的风险，失败测试确认后修复；关于伪造零派发档案的主张未被当作当前原件漏洞，原attempt3已有11派发且同任务另受封存。32项143断言通过，真实Memos迁移尚待结果。

**Memos首次真实机制验证（2026-10-03）。** 在`2024eff3`、原12调用预算启动，两次请求均响应但未通过wire：明确source calls的原稿缺kind，约束修稿补kind后缺当前local版本常量。原始输出无final/无图，不能算取证成功。共享parser仅在guided已选合同补缺省schemaVersion，明确非空合法calls且无其它分支字段时补tool；显式错误版本、含混结果/观察、空calls仍拒绝，原模型Schema不变。两原稿分别离线解析，第一稿实际读取原API/连接服务窗口（含原显式重复读取共3次），无provider；37项264断言通过。累计真实34派发，Memos已知input25358/output459，actualUSD仍未知、目标执行0；同题复测及真实收益待验，原质量面板暂停。

**Memos同题修复与生命周期缺陷。** attempt-2在1aa23a68用12次请求/12响应获得raw final，wire失败0，最初10项局部解释被接受；随后入口过早离开当前工作列表导致两次局部提交整体拒绝，最终图不闭合且无checked交付。输入166336/output8197/cache-read62720，美元未知；累计派发46、目标执行0。匿名源码评价final partial、initial核心不正确；主裁定确认最终服务授权结论正确且原文说删除尝试，但最后管理员退出的存储层例外未读，不能扩大为完整移除语义。原评语、回答和绑定另存。共享生命周期经两项预期红测修复：未闭合已解释工作继续offered，待解释项优先，同题成功项只清包装错误；62项334断言与原前四步零provider重放通过。下一增量由整体拒绝转10接受/3项schema拒绝，非checked成功。真实同题复验待执行，Paperless未知请求和主质量面板仍暂停。

**AR9变形验收边界。** 错对象、不可达绑定、已知null分支遗漏、grant明确不存在与未提供的混淆、policy反推源码分别由具名反例检查。41项179断言通过，独立核验没有发现新增null/grant测试的错误绿色断言。只证明已提出图的机械一致性，未提出源码分支、alias和自然政策映射仍不受此证明；不把bounded或checked改称语义验证。

**普通原skill首次Memos与非API作者链。** 原GitHub skill普通native用10次provider返回但无checked交付：入口原文成功读取后被“仅最后两次读取”截掉，编译问题只有operation而无entryHint又导致入口工作未启动。两项红测后修复当前调用全部新窗口及operation词法入口，36项181断言一次聚焦检查通过；同题与政策变化复验继续。原失败保留，不作语义成功。独立工作流任务实际13次provider响应、无文件交付，普通循环越预算多发一次已修；当前proposal/export成功但只有文档变更、没有实现程序，故不满足新程序验收。模型称缺少现有parser/interface/checker而不生成程序的依据需要继续核对，不能由开发者手造程序替代真实作者链。

**非API程序与普通失败恢复。** 明确程序作者自然任务从完整原skill生成并实际运行Python清单命令，优化器生成参数化脚本及skill路由，但初次自动proposal因验证投影错误最终no-change。共用cwd材料化修复45项200断言后，保留模型候选原字节经现有validation/proposal/export API零模型恢复，主case及cwd case通过（独立语义case为0），导出draft包；原失败和source/optimizer贡献分列，不冒充首轮自动成功。同一包的仓外原/变化任务普通消费正在执行。Memos政策变化修复的raw self-removal判断经独立源码核验错误；EOF越界读取与空元数据阻碍已定向修，原坏答案保留，尚无checked交付或质量收益。

**第二次跨进程恢复（2026-10-04）。** 同一新非API导出包已在仓外原/变化任务各8调用自然执行并交付JSON与REVIEW，独立只读核验确认实际程序消费；两次原CLI末尾观察错误保留，宿主修复后不重发。Memos当前状态去重及预留收尾复验10派发/10响应、原skill文字交付，实际读取服务与三种数据库实现；尚无checked图，最新语义独立评价待做。两条不同生成轨迹的累计序列化messages字符由1,382,911到566,404，只是描述统计，不是固定轨迹因果收益。全部AR派发229，USD/人力未知，目标执行0。用户要求交gpt-6.1-sol/max，原进程停止；具名撤回未接受草稿仍是规范与2项失败测试，未实现。真实previous、两授权作者配置、主质量面板与发布继续未达，Paperless原未知请求及主面板暂停保持。

**撤回未接受草稿（2026-10-04续作）。** 交接的两项红测亲自复现后，新增跨组/来源失效/过时/无效兄弟反例，按question/group/key维护当前草稿拒绝。具名withdrawal仅退休未接受目标的诊断，原proposal和理由仍归档；已接受规则、别题、全局来源失效及悬空边继续检查，原子失败不应用撤回。普通native丢失撤回返回值的独立红例也修正。58项相关回归329断言及5项撤回/native测试26断言通过；主类型校验记录在AR root。工程修复不提升旧Memos图资格，不释放Paperless原未知任务或主质量面板；真实效果待同题具名复验。

**compact源码语义与真实归档计量（2026-10-04）。** 独立只读复核及主代理按出处点验支持最新原skill文字的nonself普通成员undergrant、self绕过管理员检查但共享目标/最后管理员限制；源码可见问题full/conditional，部署状态和作者HIGH评级不由此证明。原checked=false保留。六份native trace零provider派生进度，全部request/attempt/tool ID关联完整；UTF-8 messages累计EOF轨迹1,396,519 bytes、compact566,404 bytes，system/tools/toolResults另计，与交接时字符口径分开、不同生成轨迹仍非因果对照。compact实际19accepted/37rejected、37种诊断，9份队列快照0状态变化/最长连续8次停滞/0closed，不能用accepted数替代闭合。逐调用物理I/O和SDK载荷unknown；旧无request-worklist轨迹进度unknown。5项29断言及研究类型通过，独立统计核验未发现实质问题但只抽查compact；下一步针对已接受入口与队列关联缺口修复，不提高预算。累计229派发及未知USD/人力不变。

AR继续修入口队列停滞：原slice中同题已接受entry的原引用机械关联唯一索引声明，selectedBy保留定位方式，显式workSelections优先。4个反例覆盖手动读取、题/角色隔离、多位置/显式优先、修订和source失效；56项275断言及主/研究类型通过。compact实际原slice零provider重放使两题unlocated改为awaiting-verification，0新增读取，旧坏图未重验/提升。下一步Memos普通具名复验及两完整原skill的仓外授权配置作者；Download新作者不替换Paperless Notes封存身份，质量面板继续暂停。

**实际作者格式与原政策复验（2026-10-04）。** Memos worklist修后10调用/10响应，42accepted/0rejected、66队列变化/最长2次停滞、0closed；UTF-8 messages883,335、源码31,570/重发16,820 bytes。独立原正文复核full，主代理点验原政策/handler出处，仍保留两项图诊断，不把条件政策映射或helper关联问题当已通过。不同轨迹不能直接推因果成本改善。GitHub原skill授权作者首稿11调用交付四问题声明和USAGE，独立内容评价sound；格式互斥和CLI命令错误保留。模式专用complete Schema现显式广告运行时分支，4测试24断言；实际conv-log任务hash绑定归档4测试14断言，首0计数及一次prefix漏匹配unknown派生保留，具名修正11请求/11响应。原/修/消费分别计量，下一步实际模型修稿及独立Cloudflare/Download作者。previous定向4测试35断言通过；入口关联会再次显示已导入窗口，纠正旧零显示断言，不改历史记录。主/研究类型通过，累计250派发、USD/人力unknown，主面板与Notes attempt-3保持封存。原审稿与主代理对其计数/档案目录误判的更正在[复核裁定](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluations/current-source-review-adjudication.json)分列。

AR真实条件误拒补充：原政策Memos admin路径的guard/effect重复相同条件，实际residual为all(A,A)，政策为A；主代理点验表明这是有限布尔恒等式的检查缺口，并非独立政策sourceBound:false或用户值unspecified本身。两侧以同当前binding部分求值，新增比较只使用有限all/any结合、交换、幂等/单元素折叠，原源规则/digest/未知值不改，重复映射及不同条件仍拒绝。53测试310断言、主/研究类型与独立只读核验通过；纯原trace重放政策从undetermined到satisfied，但helper仍open，旧交付不升级，语义仍unreviewed。研究证据与原失败分列于[条件重放](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/policy-condition-replay.json)，累计250调用不增。

**作者配置普通消费与语义评价（2026-10-04）。** GitHub/Memos具名修稿6请求/6响应、Cloudflare/Download首作者7/7，两配置格式valid；主代理完整读取原稿及USAGE，独立复核未发现源码答案预填或授权范围扩张。Memos档案命名被误当便携目录的审稿意见另作更正，普通消费复制模型原字节为inquiry.json/USAGE.md并携原source在仓外运行，未私改配置。Memos11派发10响应，末次SDK timeout无最终答案，原transport-failed及前驱图错误保留，按未知末请求封存不重发；Download12/12，首次final含五题对象及无关字符串，唯一受约束修复返回control而非final，交付失败。原读证据已含versioning.py:193–194的异根版本拒绝，模型仍称resolver缺口，属于抽取遗漏；不能把格式修正提升为完整语义交付。累计286派发、无在途、USD/人力unknown、目标执行0，Notes attempt-3和主面板继续暂停。

AR `evaluate`现接严格语义评审及另存裁定，20项70断言、研究类型通过；独立核验发现attempt编号未绑目录、缺首报告标签漂移和非法数值计量，三项红例复现后修正。原评审与report字节绑定，first/repair与host/语义分开，输入/源码/revision/model/budget不符不配对。实际零调用评价仍列16未运行主行、2描述性探针、0已评主首次、0配对，未导入自由格式旧评审，效果not-established。普通消费原失败与独立核验均归档，下一步针对已知Download wire修复及普通SDK timeout状态边界，不能重复未知Memos请求。

**SDK超时与最终格式修复（2026-10-04）。** 实际Memos SDK先于300秒宿主timer抛出network timeout，旧终态只识别宿主超时；共享telemetry现按有界typed网络cause关闭请求，普通run、旧inspect和同题repair复用未知完成判据。原档案inspect仍为transport-failed，但派生completionUnknown:true，11派发10响应不改。独立核验另复现同步throw遗留pending，先红后绿接入同一结算。Download request-11/12本已有完整final Schema，修复提示却要求必要时请求源码且没有坏候选；既有一次同工具修复现明确当前常量，携最多32KiB编码UTF-8的原candidate为数据，不自动删答案或加第三次请求。58项303断言、主/研究类型通过，坏响应/原评审与裁定保留于[聚焦验证](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/sdk-final-repair-verification.json)。累计调用仍286；下一步仅具名复验已知全响应Download，Memos/Notes未知请求及主面板继续封存，resolver语义遗漏不因格式修正消失。

**Download真实具名复验与定位修复（2026-10-04）。** SDK/final修后普通CLI12派发12响应，五题首答/终答均保留；中途control额外observations由既有一次同工具修复成功，final未再污染，但全部问题图仍未checked。独立源码复核支持四题条件解释，授权题仍漏读允许范围内认证声明且过强概括全局权限；原评语与主限界另存。三题歧义未选、一题零候选prose提示阻断operation回退是下一共享根因。四项红例后仅零候选回退并在既有两入口上下文提供最多2个locationTasks/16候选，未读任务仍不能做局部提取，绑定组诊断不替模型迁移或解释。84项449断言、主/研究类型通过；实际同原input/source零provider重放候选2/2/3/1/1，只发生1个共享入口读、0新规则/前提，五题都待解释，非checked成功。累计298派发、USD/人力unknown、目标0；下一步以原作者字节具名复验定位修复，未知Memos/Notes和16行主面板保持暂停。

**Download定位复验与上下文缩减（2026-10-04）。** 同作者原字节普通CLI8派发8响应、24源码工具动作（4host自动补读）；五题格式/引用均valid，但图仍全部不checked，最终规则数1/1/4/6/0。独立终答源码复核五题均partial；Q5在request1/2/8确曾offered，permission helper body/versioning仍未读，不能将可避免源码缺口写成部署未知。第一final在request6、第二在8结束，全部prompt剩余12至5且非reserved，不归因预留预算。图定位审稿的首次快照与最终快照另分：Q3还有复合对象身份未绑定，Q4误把路径名作前驱，原接受项不等于闭合图。

原request8约70k证据目录重复且worklist约94k字符。共享修复仅轻量目录单次展示、保留全部状态/动作/引用的队列投影、显式可选helper线索及其轮转；结构化自然入口接通原brief零候选fallback。六项确定性红例后91项507断言及主/研究类型通过，独立核验未发现语义/来源/题域边界绕过。[机械上下文回放](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/compact-context-replay.json)保留同八次原请求窗口/任务，序列化消息2,471,023降到1,455,275字节，11条可选线索完整轮转；没有新model响应或完整当前prompt模拟，不能称实际token/费用或语义收益。累计306派发、无在途、USD/人力unknown、目标0；下一步具名复验当前共享修复，未知Memos/Notes及16行主面板保持原状态。

**compact真实复验与提前对象反馈（2026-10-04）。** 原作者字节和12/24预算的具名普通消费12派发/12响应，21源码动作（18read/3search，其中7host自动），0wire失败；Q1/Q2各22规则，Q3/Q4/Q5为7/6/1，仍无checked题。versioning真实补读发生，但permissions helper和认证声明未读；Q3/Q4还存在已读未关联依赖，不能把所有缺口缩成未读helper。input546074/output21510/cacheRead41600，美元与人力unknown，累计318调用。另一次原配置路径未传递的provider-unavailable原report明确0派发，派生汇总仅在同input/model身份匹配时恢复零，原null和费用不改，3项反例通过。当前实际结果不是质量收益。

过程反馈的共享缺口是typed身份声明不一致到final才提示。2项红例后抽出同一对象检查，按revision在final前反馈，保留partial草稿和最终验收，不自动alias或增加调用；134测试744断言、主/研究类型及独立只读复核通过。11原提议零provider回放保持accepted state及最终6对象诊断，第6提议revision46即可提示身份问题，原首次final revision88；回放无新答案、不升级原失败。下一步同原作者字节具名early-object-feedback复验，Notes/Memos未知请求与主面板暂停继续保留。

**历史失败语料裁定完成（2026-10-04）。** 六类真实坏响应已由具体原request/response、native工具行、typed-condition及终止状态指针核对；登记器同步使用新标注。Memos错误类型的实际provider attempt2及4与逻辑fallback编号分开；controlDelta/delta为OWUI attempt7。owner-null原文字本已保留，只缺形式条件；OWUI helper未读与已读未关联分开；预算为structured源码展示终止。四native轨迹八check全部invalid，未建立付费先valid后invalid；第七类按任务书方法修订保留确定性回归和有限负面结果，非真实历史发生。零provider点验及14测试37断言、研究类型通过；原AQ字节不改，不为补类别再启动付费或全量历史审计。

**提前反馈实际效果与解释轮转（2026-10-04）。** 具名原字节复验11/11，Q3对象诊断从request7提示，末次显式source binding使revision21的对象/局部Schema错误在revision23清除；最终仍Q1/Q3路径不闭合。旧六principal诊断消失但同等principal图未建立，不能记该语义修复；3题形式usable只是unknown/unresolved，独立原答/终答仍partial和major-partial。input447103/output13953/cacheRead55168，累计329、USD/人力unknown。31工具尝试中24计预算（10read/14search）、20成功、4其它错误、7预算拒绝；其中1host自动read，request子串出现次数不作执行计数。原初/终快照与审稿错误裁定均保留。

request8–11反复offered前两入口，过程对象诊断未进入解释focus。3项红例后同优先级已读解释轮转，诊断按题归属聚焦；审稿指出的名称碰撞另补红测，显式question优先、无归属同名规则不全选。137测试757断言及主/研究类型通过，11实际prefix的解释选择零provider重放不改原source/结果，不模拟完整prompt或location候选。下一步同作者/同预算具名explanation-focus复验；语义收益、完整checked和previous仍待验，主16行与未知任务封存保持。

### 7.37 2026-10-04：剩余条件反例与解释轮转实用失败

35项163断言/主类型补齐具名self/other/null/explicit grant和临时原源未读helper+complete:true联合反例；仅显式提取机械合同，任意自然语义与未声明分支仍未核验。explanation-focus实际9/9，5题全rejected，revision38/39；4个缺pathKey及7个缺after草稿未按原身份纠正/撤回，typed对象/前驱/路径与依赖未闭合。解释轮转覆盖5题，有进展但无checked或previous资格。26源码尝试中24计费、20成功、5hostread，4个目录搜索越域错误并非目录源码不可用；旧工具合同只承诺精确文件。权限助手只搜声明，body可读但未读；独立window-only full评语与主任务完整性裁定分存，版本/文件说明改善不代替权限分支。累计338调用、实际USD/人力unknown，主16面板和封存请求未释放。下一修复限定已索引目录搜索及有界拒绝目标原稿反馈，不猜条件或填前驱；见active taskbook与explanation-focus-outcome.json。

### 7.38 2026-10-04：索引目录筛选与拒绝草稿可修反馈

6项预期红例后145测试845断言/主与研究类型通过；初主类型仅新增测试的可能空evidence标注，经已非空断言修正。source_search/source_symbol共用已有索引内文件或目录筛选，slash边界隔离相似前缀，source_read仍精确文件。当前拒绝target按完整题/组/key缓存原稿及原host引用/档案指针；反馈最多4项/16KiB轮转，大项整项省略并明确指针，不填pathKey/after/条件/对象，不自动撤回。独立边界核验无新的可达问题；审稿提出Symbol/function clone异常是既有非JSON内部边界，JSON实际wire不能提供，原raw retention早已clone，不额外加门。真实7proposal归档expanded+拒绝fragment的ordinary重放保持完整accepted graph，11拒绝仍在；不覆盖完整9prompt/局部路由/依赖状态。4旧目录查询在相同索引可执行，2仍空匹配，helper定义有定位不等于body解释。0新增provider，累计338，USD/人力unknown；下一同原作者字节同12/24预算具名rejected-target-directory-v1普通复验，未知Notes/Memos和主面板未释放。

### 7.39 2026-10-04：目录实用进展与源码重送终止

rejected-target-directory普通复验11/11、24/24源码动作成功，17read/7search/9host，helper body与版本resolver已读；本轮无拒绝目标，不能声明原稿反馈实际收益。首次全check revision25仍invalid，slice35只有过程对象反馈，final仍原首答，5题rejected/0usable。累计模型源码256089、重送181393，余6055不能容纳下一request而未派发；整窗计数与runtime两数逐项相同。Q5持续占两解释槽，Q1粗类入口未读完，Q3/Q4虽可解释仍等待；wire失败、未incorporate和exact dependency hint分别保留。独立源码评审经点验router继承、上游权限class及model路径属性仍可用未读；源缺口与真实部署unknown分离。累计349、费用/人力unknown，无previous/主面板释放；下一计划仅有界公平推进、显式粗候选细化及剩余预算整窗选择，见active taskbook与rejected-target-directory-outcome.json。

### 7.40 2026-10-04：两槽公平推进与整窗预算修复

7项预期红例后共享structured/native接入剩余展示字节/剩余dispatch的整窗分配；focus保留首选修复机会，另一首选机会轮转其它ready题，超过两项decisive定位有界轮转。粗入口仍未读完且有原索引其它候选时提供显式再选择；不自动换成正确函数。完整候选及源码id/path/sha/text不改，未fit局部任务不得绑定，近期未展示窗口可在后轮展示，目录身份与普通已展示引用保留；原有自动last-two回灌由此替代。独立审查指出纯helper覆盖失败退回全部窗口，主代理按路径/hash/范围及parent-callsite补红绿后收紧为无offer；不把不一致内部fixture冒充已证模型跨文件漏洞。两项decisive同时fit无饥饿，未额外换序。155测试905断言、主/研究类型与Bun回放通过。6录制proposal accepted状态不变，11冻结snapshot整窗投影118228/重送43532，比原256089/181393少；这不是新完整prompt、模型答、依赖状态或因果质量收益，Node/tsx未宣称可运行。0新增provider，累计349；下一同原作者字节/xty模型/12provider、24tool、262144display普通source-window-budget-v1复验，unknown封存与主面板不变。

### 7.41 2026-10-04：整窗普通运行收口与跨题原子回滚

同原作者/源/模型/预算source-window-budget普通11/11，14成功源码动作（5read/9search/2host），0wire失败，31664display/20708resent，已到两次revision22完整check且final slice22；并未因展示预算终止。4ready题轮转，original/archive未定位无解释offer，refinement/deferred实际分支未发生。5题仍rejected/0usable/无previous；两个绑定仍缺pathKey/after，typed身份和前驱未闭合，最后只改prose不改图。独立全partial评语保留；主点验纠正“version helper范围外”的误读，versioning140-195属允许源，且views1368-1450身份body实际已读/展示却仍被原答称source gap；router/class/models可读遗漏与部署unknown分列。proposal5版本题合法atomic两项被另两题旧悬空前驱整体回滚，明确共享局部隔离缺陷，下一先红绿收紧atomic作用域，旧错误继续阻断各自结论。累计360/USD与人力unknown，不把不同轨迹字节/token减少称质量因果收益，不释放封存请求或主16面板；见source-window-budget-outcome及review/adjudication。

### 7.42 2026-10-04：局部原子事务与旧缺口隔离

依据7.41真实proposal5，先29pass/2预期fail/155断言，再31聚焦173与164联合964断言、主/研究类型通过；两项独立只读边界与回放核验未见实质可达回归。atomic按submitted canonical target及新增断链回滚，sourceBindings按rules身份，同题未触碰/其它题旧悬空不回滚当前合法项；新/被修改自身悬空、拒绝或withdrawal失败仍整体回滚，旧拒绝和最终validator保持。实际原件前4提议状态相同，第5事务单独13→15、2合法项接受、另2题旧缺口不变；0provider/source action/target，读取保留档案并写派生回放，不重放后续调度、prompt或答案。工程修复与checked/语义收益分列，累计360与费用unknown不变；下一不同项目Gitea原自然任务普通CLI相关验证，再推进配对块。见atomic-transaction-verification.json及replay。

### 7.43 2026-10-04：Gitea迁移原件与质量行调度边界

c236b383同原自然brief/源字节仓外D1/guided12/12、7成功host reads，48004display/39282resent，一次顶层atomic/baseRevision坏稿由既有same-tool修复；两check/final slice24，5诊断/0usable/无previous，全部atomic:false，不能称原子实际效应。初/终主裁定partial；独立final full及“末修图变”评语原样另存，主点验final仍未纳入已读admin body，APIContext同名方法实际调用Permission.IsAdmin而非库函数，最后delivery repair只prose，早先22/24提议并非末修。实际source-gap/候选错联与部署unknown分开，未证共同runtime缺陷。调度却把合法来源的负模型草稿当共享checker故障，同时硬编码kind阻挡有精确allowlist的quality行；两红例后31联合130、研究类型/3计量测试、两独立边界核验通过。精确failure/row/component/hash及原task封存保持，source-bound/结构有效/无error/raw final且ruleConsistency:false仅记行级model-draft失败，不改validator、分数或previous资格；尚未追加主行release。累计372/USD及人力unknown，下一按现修复证据记录不同任务范围，Notes封存与16分母保持，再启动成对块。


### 7.44 首配对块与预算内交付边界

同一冻结版本的首两题四主行已按原输入/源码/模型/预算成对保留并独立评阅：Memos分享为M full、D1 not-delivered（末请求未知）；Paperless下载为M not-delivered、D1 partial/over-unknown。它们不能证明质量收益。D1的下载决定性正文实际已展示，缺口在解释；机械checked同时证据unresolved，不能计为完整授权交付或previous复用。未完成的Memos控制prefix只获partial提取评价，既不是回答也不是checked结论。Notes仍保留在原分母，未知逻辑任务不重发。原件、配对与裁定见`quality-block-1.json`和`evaluation-summary.json`。

Paperless/M暴露另一种可修共享边界：累计重发预算在provider额度尚余时退出，没有最终机会。公共loop现于源码工具耗尽或重发将超限时在原预算内预留final，选择完整窗口与其余metadata，未展示正文仍不能作引用。最后provider机会及model/parser final-only合同也已一致。此工程修复与guided观察/局部图说明的澄清不保证源码解释正确；实际修后交付、不同项目效果与语义质量另列。验证及独立只读边界核查见`delivery-budget-verification.json`，不把修复倒写到四个首行。


### 7.45 预算修后的普通交付与源码缺口

同一已提交修复版本下，原自然Paperless下载与不同项目OWUI入库均在仓外普通CLI各5/5响应。Paperless在源码工具额度用完后实际触发final预留，避免旧版已有5次响应却没有答案的交付失败；OWUI自行进入回答并修正一次引用编号。这证明实际预算内交付接线，不能证明语义收益，也没有实际触发累计重发overflow的完整窗口子集分支。两份匿名源码评审和主裁定均为partial：下载仍缺owner-null与完整版本/helper，入库仍缺输入lookup/save helper并漏已展示的bypass不写入分支。首块原四行及不同版本关系保持，后续ordinary不拼入主配对。

两次公开previous命令也实际拒绝旧partial和未知完成session，没有provider或新session；这验证负路径，正向政策/前提复用仍未建立。未知MemosShare与Notes逻辑任务继续封存，只凭哈希绑定的共享工程/实际响应证据限定放行其它主行。详见`delivery-budget-outcome.json`、独立原评语/主裁定及`previous-first-block-refusals.json`。

### 7.46 第二配对块：首失败、修后原答与控制图分列

第二块冻结d940，OWUI/Gitea self两题继续轮换臂序。两首臂因未显式选择已有provider cache而0派发失败，原first保留；启动修复后OWUI/M原/终full、Gitea/D1原/终partial。同版对照OWUI/D1与Gitea/M均partial。累计446实际派发，八主首次评审、四同版配对、16分母，未运行和未知身份不变；修后full不取代首次失败，也未建立质量收益。

OWUI新臂三次wire坏稿均在12响应内处理；只读三个原窗口，admin/save helper仍未读。文字bypass分支正确，图effect条件遗漏；七个旧目标再次add造成冲突，不计每轮为七次新错误。实际最后两请求包含交付预留，独立轨迹评审的缺字段推断已另存纠正。Gitea旧臂核心self/other正确，但context repo-admin与converter可读未读；同名库helper不能替代。独立评语、主裁定、实际调用和图失败分别保留于`quality-block-2-second-arms.json`及绑定报告hash的记录。下一修模型可见的local冲突操作提示，不放宽add冲突或checked/previous资格。

</details>

### 7.47 2026-10-04 主线程复核：优先修分支合流与图—答案同步

本次复核以 `cc88bfb2785734c9c5eef822b0adb82867f420d2` 及现有 AR 原件为快照，读取实现、原始回答、控制图及分列评审；没有新增模型或目标调用。以下顺序保存当时的复核建议，不改写首轮评分、封存请求或 AR 完成状态。用户随后确认 AR 进程结束，并授权另写任务书派发；当前执行转入 §7.48 的 AS，下面的 AR 编号仅用于追溯未达责任。

**进度核对。** [机器状态](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/status.json)仍为 in-progress，记录 507 次已观察派发的下界。[主面板汇总](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluation-summary.json)有 8/16 个首轮位置留档并评阅，首轮终答 full 为 1；其中包含两次零派发的配置启动失败和一次末请求未知，修订另计。尚余 Memos remove、Paperless share-create、Gitea create-issue 三对共六个可运行主位置；另外两个 Notes 位置封存。工程进度、真实使用、主面板位置及全局调用量分别计数。

**新点验一：互斥路径被编码成共同前驱。** 最新 OWUI [原始运行](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/runs/quality-owui-ingestion-D1/attempt-3/sessions/2026-10-04T063101625Z-57b83405/run.json)的 `domain.slice.rules` 中，`guard.admin-file-lookup` 为 `caller_role == admin`，`guard.nonadmin-owned-file-lookup` 为 `caller_role != admin`；`continue.file-found` 与 `reject.file-not-found` 却都把两者放进同一个 `after`。当前 [controlRuleReach](../../src/task-dsl/authorization/control-conclusion.ts)将全部祖先条件相与，结果成为互斥条件同时成立。对同形谓词的零调用点验得到：未给 role 时 unknown，admin/user 两种给值时均 false。三值求值按现有合同工作，错误在该提取图的路径合并；这也暴露模型可见接口缺少便于表达“择一路径后继续”的构造。当前 DSL 已能分路径表达替代关系，无需因此推翻全部表示，也不应把现有 `after` 全部改成逻辑或。

**新点验二：已有领域事实没有稳定进入终答。** 同次运行实际显示了 `get_verified_user` 的 458–466 行，并已接受 `reject.unverified-role`：非 user/admin 角色返回 401。终答 `branches[id=unverified-role]` 仍写 unknown，称身份/角色语义未解释。现有 [结论检查](../../src/task-dsl/authorization/control-conclusion.ts)按 exact pathKey 关联结果，终答重新命名及自由复述使同一事实出现两套不同状态。另一个语义缺口是 `save_docs_to_vector_db` 在 collection 已存在、overwrite=false、add=false 时可直接返回 True；已读源码中的“调用成功但没有插入”仍未进入完整效果说明。具体原答与源码锚点见[组合交付评审](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/evaluations/combined-delivery-real-review.json)。

**已有改进与剩余负担。** 宿主已经补 question/evidence 绑定、revision、局部反馈和预算收尾；[局部解释接口](../../src/benchmarks/authorization-dsl/inquiry-local-extraction.ts)仍要求模型维护 targetKey、bindingKey、pathKey、after 与最终 branch id。过程对象反馈也已接通，不能把所有关系错误归因于“直到 final 才检查”。当前主要问题是读源、局部图和最终答案之间仍需模型反复翻译，接口与语义错误互相叠加。继续增加提示长度或重试次数的收益需要实跑检验，不能作为默认修复方法。

**真实使用与复用差距。** 两份原 skill 是 GitHub security-review 与 Cloudflare security-audit；它们生成的两份有效 inquiry 配置随后由独立 inquiry CLI 消费，与完整 skill 的 native 消费分列。Memos 配置消费末请求未知，Download 已知修订仍未完整，不能在本轮把未知任务换名重跑。非 API 工作流程序已有同包原/变消费，但包来自保留模型候选的 host-recovery，原自动回滚仍保留。[中性前提变化](../../results/skill-ir/skill-dsl-research/development/authorization-guided-runtime-v1/current-branch-contract-reuse-outcome.json)已 checked/bounded，零新源码工具动作、8 次模型请求；它处理 89 字节源文件、导入 105 字节行号证据，真实授权复用和净收益仍待检验。[planInquiryReuse](../../src/benchmarks/authorization-dsl/inquiry-reuse.ts)当前对任一索引文件/字节变化返回 fresh，尚未实现按受影响依赖保留其它解释。

建议按以下顺序继续 AR；每步关联旧失败和具名修后结果，不用修后成绩覆盖初轮：

1. **AR3/4/7/9：先做一次共享表达与交付修订。** 用真实错误建立小型确定性反例：互斥分支合流、不同资源绑定、helper 提前成功却无目标副作用、已知条件在终答退化为 unknown。让模型显式表达局部选择、条件、绑定与效果，宿主从这份唯一声明派生机械身份、分路径前驱及结果引用；前驱关系、对象别名和源码含义仍须有明确解释。先限定在现有有界图，不建设通用符号执行器。原版本保留，提取候选与宿主展开结果分别留存。
2. **AR9/17：把结果生成接到同一份当前状态。** 当前可行路径与用户请求的反事实分别承载，终答使用现有路径身份和已验证引用。检查关注“同一提取事实是否在回答中被改成另一种结论”，同时保留模型提取本身的独立源码复核。修复按一次局部问题包反馈原片段、当前候选和明确诊断；不要让模型为修一个字段重写整图。对已读待解释与真正未读缺口使用不同下一动作。
3. **AR10/11/13：先取得真实授权纵向完成，再扩大运行。** 使用已有、完成状态已知的真实任务做具名修后消费，保留原 skill、原自然问题及全部原义务；内部可逐问题调度。验收同时核对源码必要语义、图检查和实际交付，避免只优化 checked 数。两份原 skill 的完整验收继续保留；对已封存的 Memos 消费，明确记录原格 unknown。若需额外使用样例，应先登记为补充使用证据并说明选择理由，不替换旧格。
4. **AR12/16：在真实授权任务上检验变化。** 分别做前提变化、独立政策变化及源码变化；前两者对比 fresh 与 previous 的答案、证据、实际重解释工作和调用。源码变化先保证旧解释失效后 fresh 回答正确；“按依赖只重算受影响部分”作为明确的额外实现验收，不将当前全量 fresh 写成局部复用已完成。中性机制例留在机制分母。
5. **AR14/15：完成三对剩余可运行主位置和可执行辅助对照。** 每个配对块固定同一实现、模型、输入及预算；共享缺陷现场修复，受影响未派发行先暂停，已发生失败和未知留账。继续报告首轮/修订、raw 语义/结构交付、环境失败/模型失败。辅助同核心 Markdown 对照用于判断改进来自共同执行器还是表示。Notes 与其它未知身份保持封存，不为凑齐数量补样。
6. **AR18–20：最后一次相关联合回归与发布。** 当前已观察源码、程序消费、复用和主面板各有独立结论后再汇总；现有本地提交和治理改动由唯一发布者按归属整合。AR21–23 的可选扩展排在核心真实使用之后。每项修复以源码支持、必要问题解决和交付改善为目标，不以更多文档、测试数或已消除诊断数代替效果。

**本次验证。** 四项范围独立的只读核验后，主线程点验原始 OWUI 答案/控制图/原窗口及检查代码；另一次只读点验确认合流与陈旧终答问题。直接调用现有有限求值器检查上述三种 role 输入，结果与代码合同一致；没有改生产代码或重跑历史面板。文档工具单测 15/15，本节九个本地链接全部存在，研究文档 `git diff --check` 通过；未重复全仓扫描或业务回归。

### 7.48 AS 局部语义展开与真实交付

2026-10-04启动、2026-10-05收束，开发 `gpt-6.1-sol / max`，被测 `xty/gpt-5.6-sol`。AS从 `c90787f0` 接管，见 [AS0–AS19](../superpowers/plans/2026-10-04-authorization-semantic-lowering-and-delivery.md)。本轮工程/诊断机制有实际进展，完整源码质量、真实变化复用与净收益未达，结果为 `completed-with-unmet-criteria`；[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json)保存分母、原件、评阅与下一责任。下面先保留方法和执行过程，末尾收束实际结果。

**方法调整。** 保留现有领域对象、只读取证、三值代数和最终检查。新增窄的局部语义前端，让模型显式描述条件选择、每支的主体/资源绑定、继续或提前返回以及目标效果；宿主负责稳定身份、有限路径展开、出处关联和当前版本。旧 `after` 的共同前驱含义保持，局部合流不能用全局改成 OR 来补救。模型负责源码含义和别名关系，宿主不根据项目名、词法相似或 evaluator 答案推断它们。

**结果与调度。** 最终路径与引用从同一份当前解释派生；模型仍写解释、缺口和政策映射。保留模型原始文本，逐项指出与已提取事实的矛盾，局部修复回到相应原窗口。真实未读、已读待解释、已解释待检查三类状态使用不同下一动作。调用 helper、返回成功和实际受保护副作用分别表达；前提、反事实和当前路径分栏处理。路径展开超限或不能表达的程序结构保留明确缺口。

**使用与比较。** 先在已知完成、未封存的真实任务验证端到端，再按小块推进三臂比较：M/legacy、M/同新核心、D1/同新核心。两种原 skill 都经普通 native 入口实际加载；作者配置与独立 inquiry 消费另记。政策/前提变化比较 fresh 与 previous，源码变化先验证失效后 fresh 正确，再决定是否有充分依赖信息支持局部复用。AS 结果新建身份，旧 AR 的首答、未运行位置和封存任务保持原状；不以新身份绕过未知请求。

**开发与交付。** 每种真实不良表现当场分类并尝试一次针对性修复及复验，同根因共用修复；任何继续迭代须有新的诊断依据。优先完成机制和真实使用，随后才汇总工程、行为与收益。研究原件、实际费用未知及模型辅助作者成本如实保留，开发精力约六成质量、四成编写复用。

**AS0 原件核对。** 新清单固定五任务三臂、两原 skill 原/变、两任务政策/前提 fresh/previous 和源码变化共 29 位置，作者 4 稿另列。未知作者 Memos 消费的原配置 taskId、源码 ref、v1 政策及普通/admin/self 问题与预选原 remove 是同逻辑任务；按未知完成优先的合同，原 remove 三臂及五个依赖位置 blocked，仍保留 29 分母。旧 Notes/Memos share 封存不动。基线 602 pass/1 skip、typecheck 通过，配置路由和认证仅零调用确认；没有新的分析或质量成功。原件及精确来源见 [AS manifest](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/manifest.json)、[封存](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/inherited-seals.json) 和 [verification](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification.json)。

**AS1 接口决定（设计，尚未实用验证）。** `semantic-flow-v1` 同时用于 M-S/D-S、inquiry 和普通 run/native。模型提交 `authorization-semantic-update/v1` 的 `semanticBlocks`，每块引用当前原窗口的 `itemId`，声明稳定语义 `handle`、entry/helper、命名 block 及顺序 steps。宿主填题目、出处、版本和 canonical 身份。以下为匿名设计例，不是原项目的候选答案：

```json
{"itemId":"<current-offer>","handle":"endpoint","op":"add","role":"entry","start":"main","complete":true,"fallthrough":"allow","blocks":[{"name":"main","steps":[{"kind":"choose","name":"role","claim":"Explicit if/else","cases":[{"condition":{"op":"eq","left":{"binding":"role"},"right":{"literal":"admin"}},"body":"admin"}],"otherwise":"member"},{"kind":"effect","name":"write","claim":"Protected mutation"}]},{"name":"admin","steps":[]},{"name":"member","steps":[]}]}
```

| 模型明确的语义 | 宿主 lowering / 保留的责任 |
|---|---|
| 顺序与 choose 的各 case/body；显式 otherwise | 各替代路径展开共同后续，`after` 仍为 AND；otherwise 才授权补集，无 otherwise 留 `choice-uncovered` |
| bind 的对象类型、独立身份或明确 alias；call 的参数映射/callee handle | 对象按调用实例作用域编号，只有显式参数/alias 共享；同名不共享。未读/未解释 callee 保留依赖 |
| return 的值与入口许可结果；effect 的实际操作 | helper return 回到调用点，返回值仅替换明确局部结果名；成功 return 可没有受保护效果，不写成 effect |
| complete、拒绝、unresolved 及引用关系 | 有限展开（16 路径、128 v2 节点/题、深度12）；循环、缺体、越界和超限保留具名 residual |
| 当前版本的解释、缺口和独立政策映射 | `authorization-semantic-result/v1` 引用当前 revision/pathId，宿主形成当前分支/引用；旧版本、状态/效果矛盾留诊断；请求的反事实另列 |

必要的最小扩展是严格 `authorization-control-slice/v2`：增加 call/return/unresolved、terminal/outcome/returnValue 与原局部来源，路径另报 protectedEffect。v1 Schema 和求值保持；不把 return True 解释成写入或拒绝。v2 中中间 effect 与调用不是终点。共享 runtime 保存原 block 与展开映射，替换同题 handle 后重算其受影响图、失效旧 final；坏题的更新不丢其它题。previous 只同策略，重新核对原证据、semantic blocks 和当前 checker，绝不复用终答。复杂循环/动态别名及源码变化局部保留暂不实现，按 fresh 合同处理。

**AS2–AS7 工程核验（未建立实际收益）。** 匿名反例先观察预期失败，再实现共享前端/展开/结果、双入口接线及同策略 previous；当前授权联合检查 618 pass/1 skip/4148 assertions。两只读边界核验未发现 helper/互斥展开反例；其中“策略必须全段匹配”的建议与既有精确原文片段合同不一致，主线程保持 span 引用并明确语义映射仍未验证。主线程另复现反事实被排除后引用为空的问题，增加红例并从保留路径的前驱来源链补引用，不恢复为当前分支。原稿/诊断/装配和过期版本均保留。AS 真实派发仍为零，下一步登记的 OWUI D-S 首答；验证记录见 AS verification。

**AS8 首次实际派发及协议修复。** OWUI D-S 原位置在 `e5df3863` 首次运行：作者响应已保留，第二次请求由服务端明确拒绝 `submit_inquiry_step` 的无顶层 object Schema，2 派发/1 响应、805 已知 token、实际美元缺报；无源码读取、无授权答案。不是完成状态未知。共享 Zod→JSON Schema 的对象 union 缺 `type:object` 是可复现根因；红例确认后仅为全对象替代补 object，不限制混合 scalar/null union。632 pass/1 skip/4221 assertions、主类型检查通过。首失败保留在 AS runs，下一次为同位置具名修订，不改写首答，也不据协议修复声明源码质量改善。

**AS9 根据新传输证据调整。** 同位置 `as-object-union-v1` 修订在 `53370cc9` 又被明确拒绝：该服务还不接受顶层 anyOf/oneOf/allOf 等。此轮作者正常返回、宿主准备两原始入口窗口，尚无语义响应或答案。两轮共4派发/2响应，1773已知token，美元仍未知。停止这一协议形式，改为共享 structured transport 的固定 `{value:<完整原步骤>}` 对象外壳；嵌套完整 Schema 和原 Zod 检查保留，不以合并可选字段削弱步骤约束。原始响应、两次失败及修订身份均保留；下一次仍为同位置具名复验。新 wrapper 红例及普通 native 登记红例已转绿，联合634 pass/1 skip/4232 assertions，主与AS局部类型检查通过；尚不声明真实收益。

**AS9 第三次实际运行的本地根因。** `as-plain-object-wrapper-v1` 在 `efb1b0c8` 得到 5 派发/5 响应，语义提议真实返回，协议外壳已实际通过；累计 9 派发/7 响应，实际美元仍未知。运行因 `item.questionId` 崩溃而没有交付。只读定位之后，主线程用匿名入口调用 helper、helper 再含词法引用的实际读取回归复现：重算移除旧显式依赖，却留下引用它的词法子待办。共享 worklist 改为退役整棵子树，同时清除相关选择/失败状态，已读窗口、原提议和动作记录保留。相关 34 项测试及授权联合 620 pass/1 skip/4157 assertions 已通过。原自动 schema/wire 分类另作绑定原件的纠正，第三次原 report 不改写；下一步仍为同位置具名复验。语义展开超限与原源码解释尚待交付核验，不能据协议通过宣称任务成功。

**AS9 入口参数与展开边界。** `as-dependency-subtree-v1` 在 `e3c50a15` 得到 9/9 响应，交付 `completed-with-diagnostics` 原答及修答，旧崩溃消失；累计 18 派发/16 响应。当前检查明确拒绝未绑定 helper 参数，源解释有可用内容但不等于完整通过。只读定位与主线程代码核对确认：entry 已声明 `request:configuration`，宿主却未建立其身份，且只给泛化诊断。修订为显式入口参数建立按入口隔离的 typed binding，不供给值/权限；helper 映射仍严格检查，并指明缺映射、实参未绑定或类型差异。两匿名红例转绿，联合 622 pass/1 skip/4173 assertions、主与 AS 局部类型检查通过。用第四次原 accepted units 零调用重放，参数缺口消失但达到既有 16 路径上限；原图和提议不改写，下一次模型复验必须面对这一具名 residual。源码评阅提示已有集合早退等遗漏，尚待绑定原稿的完整评阅；美元未知、质量收益未建立。

**AS9 第五次与局部反馈。** `as-entry-parameter-v1` 在 `3179ffa3` 再获 9/9 响应；累计 27 派发/25 响应，525284 已知 input+output token，美元仍未知。当前 62 节点/10 路径，无参数缺口；模型将四条入口返回保留为 unknown，却在终答断言 conditional，检查拒绝。新反馈原先没有终点到局部步骤的对应，且该 unknown return 只藏在路径 gap 中。共享修订补窄 sourceTerminals 和具名返回步骤诊断，不推断许可、不给参考答案、不增加调用/上限。两匿名红例已绿；联合 625 pass/1 skip/4186 assertions，随后原 skill 最后响应/有界交付与变化登记检查共 24 focused pass/123 assertions。AS11 薄入口已准备，同输入配对与当前 base 资格由 public 接口核验，尚无变化实际派发。接下来同位置具名复验与登记的 Cloudflare/Paperless 普通 native 首次使用；首次失败、逐次修订及未达的源码完整性仍分列。

**AS9 第六次与字段定位。** `as-source-terminal-feedback-v1` 在 `0793f04f` 获 3/3 响应，但 step 把候选选择置于顶层，唯一格式修复重复同候选；没有读源，不能判断终点反馈采用。累计 30 派发/28 响应，538111 已知 input+output token，美元未知。两独立只读核验确认 Schema 正确且修复请求含原候选/诊断；补充从同一广告 Schema 派生的允许字段位置，按显式 discriminator 保留相容分支，guide 明写 parent。宿主不搬字段、不删除候选、不增加修复调用。匿名红例转绿；相关联合 669 pass/1 skip/4361 assertions，主与 AS 局部类型检查通过，真实采用尚待具名复验。

**AS10 首次普通入口的零派发故障。** 登记的 Cloudflare/Paperless 原位置在同版本初始化失败：薄 driver 写入绝对 sourceRoot，public loader 拒绝；缺 native trace 的原报告保守保留 unknown。日志只证明无可见请求，另一独立代码顺序核验及主线程点验确认确切 loader 异常先于 complete/agent loop。原 claim/report/CLI session/stdout/stderr/scope 与原版本代码片段以哈希绑定为零派发证明，原报告不改。匿名相对 scope、未知调用拒绝、证明缺失及篡改红绿测试通过；共享 claim/replay 可调用严格零派发 inspector，已有调用或额外请求证据不能解封。路径生成改为相对于新 scope 并 public-loader 验证。该次 provider/cost 为 0；其它封存不动，不计为 native 使用成功。接下来原行具名普通复验，作者及变化工作继续依其原合同推进。

**AS9 第七次与严格外壳诊断。** c16cbc62 的具名修订获 8/8 响应，controlDelta.workSelections 已采用且实际读源；新候选在 value 之外另放 controlDelta。原解析器的“外壳必须恰好单 key 才 unwrap”启发式退回旧格式，遮蔽了真实多字段错误，唯一修复也重复。主线程点验完整 root keys 后纠正只读核验对“嵌套 kind”的初步推断；匿名红例验证改为存在显式 value 即严格检查外壳，同时保留 discriminator 的实际路径和允许值。没有代搬/删候选或增加调用。累计38派发/36响应、733951已知input+output token；美元未知，仍无完整授权交付。联合770 pass/1 skip/4514 assertions、主与AS局部typecheck通过，下一步同位置 as-wrapper-diagnostics-v1 实际复验。

**AS12/AS13 入口准备及边界核验。** 三项独立只读核验定位两个真实身份缺口：源码变化旧锁只核对被改文件，作者消费没有绑定原 skill 未改及原稿字节。匿名红绿后，源码入口检查整个允许索引等于唯一登记编辑，并绑定当前 base/previous/意图和零-provider失效证据；作者入口共享 native 登记约束、绑定原 skill/task/claim/report/原 inquiry 与USAGE字节，再经普通CLI消费。原 skill完整加载，宿主不供给完整问题/答案/图；作者实际输出预算与质量分析分列。此处只证明工程准备，四稿/消费及真实变化尚未运行，没有人力或质量收益主张。

**AS9 第八次与坏稿恢复。** d7b44677 获11/11响应，严格外壳确已通过。独立原件核验定位：一个block被放进unit数组，helper用了自造itemId而非实际offered work-62d1...；callee关系仍因helper未被接受而未闭合。主线程代码点验另确认未归属question/handle的诊断没有合法替换关联，后续正常稿不能指出旧坏稿。共享修订给拒绝稿host draftId，完整修稿显式repairsDraftId；只有来源绑定且已知题/句柄匹配的接受稿清除其当前诊断，坏稿/尝试/修订链保留，空/非法/跨题不清错。元数据不进入源语义；反馈4稿/16KiB有界。两匿名红例转绿，联合772 pass/1 skip/4526 assertions、主及AS类型检查通过。实际采用仍待沿attempt-8具名复验。

**AS13 作者的初步实际证据。** 同一完整Cloudflare原skill产出原/变两稿，共7+5次已知响应；独立只读核验确认自然任务与当前政策义务覆盖、无预填答案/图、真实工具仅目录/读取及作者文件写入，可按原字节消费。GitHub原稿又获5/5响应并通过公开格式/scope/policy检查，变化稿和下游消费待办。作者完成只代表声明产物，不是授权回答。至此49分析派发/47响应加17作者调用，共66/64，1060964已知input+output token，美元及真人分钟未知；原首答、修订和作者成本分列。

**AS9 第九次及暂停归类。** 4fec382c获10/10响应；host坏稿ID实际反馈且被repairsDraftId引用，helper接受，入口仍因重复步骤名、未接受句柄使用replace、call上格式外authorizedBy拒绝。独立原件核验与主裁定确认拒绝正确，未提升完整交付。实验helper误把没有source-bound entry的这种已归档模型拒绝算作共享checker故障。匿名红绿后，仅对已知、已交付、结构有效且全部当前semantic诊断逐项对应拒绝稿/装配的情况限于model-draft；不对应的诊断、异常和unknown仍暂停共享机制。49focused pass/196断言，主及AS类型检查通过，两原报告零调用重判，原评审保留。

**AS10 原ordinary交付与定位流程。** 同版本Cloudflare原任务12/12响应并最终交付raw prose；模型未完成原entry候选选择，又用replace提交未接受handle，检查拒绝。原答错误转向bundle endpoint而遗漏指定ShareLinkViewSet/ShareLinkSerializer。主线程读原输入及serializer/helper纠正独立评审中自加caller事实，原用户未给具体权限前提。取证成功不等于有当前解释offer；没有证据证明宿主丢窗。共享guide补明locationTasks→嵌套workSelections→下一当前原窗口tasks，不自动猜入口、不提供项目答案；沿已知native原件再做一次具名复验。源码语义与整题完整仍未通过。

**AS13 四稿及原件字节。** GitHub变化稿7/7，四份作者首稿共24/24均格式valid，独立复核确认问题/政策覆盖与剩余原skill职责，原字节消费待办。累计95派发/93响应、1385557 input/103864 output/401817 cache-read，美元与人力未知，targetexec0。4fec382c修正本轮结果树Git属性，恢复被text转换损坏的原gzip；202 tracked文件与local原字节一致，3gzip均有效。只修本轮原件保留，不改历史protected结果或将首答覆盖成修后结果。

**AS10/AS13 定位恢复。** a7a09687的Cloudflare原复验11/11，声明成功且两unit接受；两次终检仍因conformance status/缺result字段失败。没有domain.check不能推断没有program，主线程已纠正该初步判断，原件明确model-tool编译。GitHub原作者按原字节普通CLI消费9/9，实际读到API注册/handler，当前offer却被初始唯一词法候选锁在无关funcinfo，无法用新发现替换。共享workSelections仍用原candidateId，现允许实际source_symbol返回的同范围候选，记录explicit-discovery-selection；未显示ID/跨题拒绝，换位置退役旧词法子树，原证据/提议保留，完整索引边界不由任意read范围假造。匿名两红例转绿，联合776 pass/1 skip/4554断言、main/AS types通过，实际恢复待同原稿复验。native终检补完整payload指引、已知Zod拒绝限model-draft，原失败不提升。累计115/113，1934939 input/119635 output/505241 cache-read；费用/人力未知，无质量收益主张。

**AS9/AS10后续定位和失效。** GitHub exact-author第二消费采用实际发现候选纠正原词法位置，仍因helper gap和stale revision部分拒绝；Cloudflare native第四次完整终检产生结构/来源有效、规则不一致结果，未解释关系和helper坏稿仍保留。两次共18/18响应。另有目录/省略路径的源码变更失效缺口，三项匿名红绿修正索引范围失效，无新增读取或模型调用；既有runtime全局来源变更检查继续阻止最终提升。具体原件在机器记录，不能据局部纠错声称整题成功。

**AS14–AS17首轮瓶颈和修订。** Download/ShareLink/Gitea三完整块同027eb024、同模型和原12/24预算；OWUI D-S首轮e5df3863是异版本协议失败，所有修订另列。旧流程均交付形式有效原答但源码解释不完整；Download遗漏全局GET view条件是具体错误。新核心首轮反复出现稿字段/当前offer/handle、helper解释和终答关联失败，未建立完整质量增益。离线判断绑定原SHA与版本；主裁定纠正独立评语中的已读/未读混淆、作者/消费hash混淆和把diagnostic结束判false-complete等错误，不把评价答案给被测模型。

| 原任务首轮 | M-L | M-S | D-S |
|---|---|---|---|
| Download | 5调用，形式有效/源码partial且漏GET条件 | 9调用，终答协议失败 | 9调用，终答协议失败 |
| ShareLink create | 5调用，形式有效/可用helper仍缺解释 | 10调用，部分图/诊断交付 | 9调用，入口未闭合/诊断交付 |
| Gitea CreateIssue | 6调用，形式有效/传递链部分 | 3调用，无有效终答 | 11调用，对象/路由关系未闭合 |

三块的全部首轮语义完整均为0。该表是小块实际工作量/质量描述；新核心要求局部语义状态，旧流程更轻，不能把形式有效等同真实正确。OWUI的M-L/M-S为5/9调用，D-S原首轮为2派发/1响应异版本，不能与修后9次记录拼成同版本胜率。无证据支持DSL表示增益或新核心净收益。

AS17窄修订只恢复完全省略且显式结果整体可解析的final kind，并为允许文件的错误range显示真实候选；原窗口、当前身份、坏稿及预算不放宽。原Download D-S/M-S零调用重放及77项517断言验证机械边界。两份quality修订共19/19响应：Download从无接受单元/无有效final推进为三不完整单元/诊断final；ShareLink仍为单入口未闭合。两轮wireNormalizations均为空，不能宣称实际采用了kind归一化。新增Gitea原native修订11/11实际收到range mismatch候选并调用source_symbol，三单元和终检通过，完整原skill格式交付；主源码点验仍发现 `form.Projects` 无条件传入service却被写成非writer忽略，以及未充分解释模型层调用却typed complete/performed。形式原结果不改，源码完整未通过。详见 [AS17评阅](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/evaluations/as17-repair-source-reviews.json)。

**真实使用与编写/变化。** 两份完整原skill的4个原/变native位置均有普通run实际消费、引用依赖和最终原文；最后1/4形式checked/bounded、0/4完整源码质量。Cloudflare原位置初始缺trace的unknown原报告保持，只在绑定初始化代码顺序/输入/日志/哈希的严格零派发证明后具名恢复，其它未知任务不解封。4作者首稿共24/24响应，6/6/8/8题的原/变配置均格式/scope/policy有效，宿主未补作者字段或答案；四稿原字节经public inquiry CLI实际消费，全部仍partial。有效声明和可复核消费是工程证据，未证明真人省时或完整分析收益。Memos五变化格因继承封存、Paperless五格因无当前合格base零调用阻塞；原29分母保留，无人工图/历史包补位，无真实变化源码消费。全部准入理由见 [dependent admissions](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification/dependent-admissions.json)。

**AS16成本与AS18验证。** 39份关闭原件累计300派发/298响应：质量首轮83、质量修订76、native76、作者24、作者原字节消费41。已知fresh input6,485,876、cache-read1,221,145、output296,467，完整prompt7,707,021；另2次HTTP协议拒绝的usage缺报，合计已知prompt+output8,003,488是部分计量，美元/开发代理/真人分钟均unknown。UTF-8请求/source read/display字节另计，不冒充网络body或token。全部重复和修复都计入成本，无净节省主张；[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/accounting.json)和[call index](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/call-index.json)绑定原件。最终相关联合744 pass/1 skip/4867断言、主/AS类型和离线重放通过，见[final verification](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/verification/final-joint-code.json)。测试只证明机制和兼容，不替代来源意义。

**未达责任与决定。** 暂不扩大语义语言或增加常规model/check门槛。后续优先解决已读关键helper不能成为接受解释、错误offer/handle反复、对象/实际效果和政策映射；再取得两原skill原/变的完整条件回答及真实变化合格基础。当前源码小块已暴露、修订适应性、同版本块少且全部partial，不能据一个形式提升建立泛化或因果结论。首答、修后、原回答、错误与封存均保留，AS不自动启动新样本或同根因无限复抽。

### 7.49 AS 复核与 AT 源码解释闭合计划

**复核状态。** 2026-10-05点验AS原答、评阅与当前代码，确认本地/用户origin同为`d05f018b`，旧进程已结束，工作区干净。AS为12个质量首轮0完整、4native最后1形式完成/0完整、4有效作者稿但消费均partial。测试口径为744项联合加2项provider合同，共746；本次另跑4个相关测试文件，78通过、405断言，零模型调用。

**哪些问题已经消除，哪些仍在。** 局部互斥路径展开、helper return/effect区分、坏稿身份恢复和真实候选纠正有实现及采用记录。新的主要断点是局部源码解释如何稳定完成：`inquiry-worklist.ts`的sync把已读正文标为awaiting-interpretation；`inquiry-domain-runtime.ts`每次modelContext重新生成至多两个offer；`applySemanticBlocks`要求模型匹配当前item/handle/op。这些合同各自有合理性，组合后仍要求模型同时维护源码、身份、修订和终答状态。继续加长guide难以消除这种负担。

**源码点验实例。** Gitea最后native的原answer将非writer的projects说成被忽略，但已经读到的handler原行624仍把`form.Projects`传给service，service原行53–57处理`projectIDs`。同答承认model层调用未解释，图却complete/performed。原件见[该报告](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/runs/native-github-security-review-gitea-create-issue-original/attempt-2/report.json)，独立评阅及主点验见[AS17 reviews](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/evaluations/as17-repair-source-reviews.json)。这是实际语义错误及过强效果判断，单修schema不会解决。Download还遗漏GET view_document条件并混同操作失败与授权拒绝；ShareLink链缺owner-aware/helper解释；OWUI输入file与输出collection的控制链未完整覆盖。

**评价应更细。** M-L存在正确的reader/write区分、exact-document guard、root-document关系；全任务完整为零并不描述所有局部进展。AT同时报告原任务充分性、必要义务的正确/错误/遗漏及协议交付；根据原始请求界定决定性依赖，避免要求追完所有框架/数据库内部。正确、充分的条件回答可达完整；已有可读决定性源码未解释仍是实际缺口。

**上下文诊断。** 在上述Gitea native原始请求中，第5次message字符总数74,841、当前局部上下文52,940，第11次89,599/47,959；这不是token或因果估计。`inquiry-native.ts`与共享feedback会携带源码、摘要、队列和诊断，AT将据实际构成缩小到当前任务，完整原始历史仍归档。

**设计与工作。** [AT0–AT19任务书](../superpowers/plans/2026-10-05-authorization-focused-closure-and-delivery.md)采用既有语义展开器上的显式focused-closure-v1：宿主持久保持当前解释，派生路由身份；模型提出来源支持的函数摘要，宿主组合参数/对象、条件与依赖。窄阶段合同减少无关字段，定向原文复查处理决定性语义矛盾，同源最终结果保留原skill格式。自查与独立源码评价分开计量，不把固定正确答案或人工图交给运行模型。

设计安排先做两个失败纵向案例并当场修共享缺陷，再做两原skill原/变与4稿实际消费、合格基础上的变化配对。主面板4任务三臂M-L/M-F/D-F共12位置，运行前固定共同输入/资源，失败和修订版本各自保留；源码范围修订在各臂同时使用。若合格原基线未取得，fresh变化诊断仍可推进，复用收益保持未达。下面保留实现与实际采用记录。

发布前只读复核明确：24次provider预算按单个任务×臂会话计量；M-L共享原始读取工具但保留legacy执行器，F才携带新的执行支持；evaluator台账与模型输入隔离。focus的源码变更失效与政策/前提重算分开，独立已解决主张保留。4个native原/变位置均可fresh运行，previous复用质量另验；作者字段修订与有效稿的runtime修复分别留账。

**AT0–AT7当前工程。** 从实际`9c86e9eb`接管，四原任务只作sourceRoot机械重定位，brief/policy不改；[AT manifest](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/manifest.json)锁定12质量、2调试、4native和4作者责任。模型输入明确allowlist，义务及历史错误放evaluator。共享focused核心已实现持久身份/延期重访、阶段Schema、来源保留、纯helper返回组合、返回对象、字段变换、操作错误和当前答案绑定。复杂对象/效果仍由现有展开器处理。模拟双入口和匿名反例通过，相关653 pass/1 skip/4347断言；真实采用、完整任务与净收益此时待跑。新主预算24/48/512KiB共用于三臂，旧默认不变；所有修订和自查计入成本。

**AT8首轮失败与修订。** ShareLink首轮21次派发均有响应，input134,632/output11,630/cacheRead9,728；美元未知。source_search/symbol参数全部无效，重复读耗尽48次实际工具预算，serializer未取到；最终还存在条件代数、调用参数与源码冒充用户前提的错误，完整质量未达。通用合同修复补齐实际工具参数和条件格式，link允许显式映射参数，错误values可在同一focus纠正；累计物理读预算按登记值执行。四个匿名反例先失败后通过，相关668 pass/1 skip/4367断言、两项类型检查通过。应用锁文件实际锁定DRF3.18.1，新增来源修订单列并共用于Paperless所有臂，首轮输入和来源原件不改；同题真实修订另验。

**AT8第二轮证据。** 首项合同修订后11/11请求响应，input89,161/output5,847/cacheRead4,224，费用未知。工具显示163,416字节却只有6,304字节源码进入模型：普通工具历史删掉正文，而focus只显示当前任务窗口。继承/serializer原文虽已读取，仍未成为解释链。当前第二项具名修复将未显示与近期普通读取作为有界supporting窗口；窗口本身不生成调用关系，模型须重访原caller、声明实际call，再解释真实helper。针对性红例修通，相关675 pass/1 skip/4499断言及主/AT类型检查通过；真实复验待跑。作者原稿与消费者保持原字节绑定，公开CLI现可传32次消费预算；格式有效与原任务充分性仍分别评价。

**AT8第三轮与接口回修。** 第二项具名修订8/8响应，input102,124/output5,831/cacheRead1,408；模型源码展示34,760字节，原文漏显已消除，final补出了global view与exact-document owner-aware条件。accepted unit却把自然语言写在start，找不到块导致路径在首call之前终止、没有依赖。主点验与只读核验一致；callee不存在本身会生成open dependency，不能另称为本例已经证明的调度bug。当前返回共享接口：块起点未声明则当场拒绝，focused模型schema去掉宿主callee；2红例修复后相关677 pass/1 skip/4505断言和双typecheck通过。原始任务仍partial，继承/用户传播及直接/组权限尚未充分解释；40次真实请求的费用未知。

**AT8外壳修复与AT11原稿。** ShareLink第四轮2/2响应因作者漏空premises停住；Gitea首轮5/5响应因明确control/tool路由外壳停住，没有接受解释或final。修复只归一唯一明确的外壳，空premises不引入事实；语义正文仍由当前focus严格检查。7份原始响应零provider重放全部可进入本地检查，其中1份正文错误仍被拒绝。相关679 pass/1 skip/4516断言和双typecheck通过，真实具名修订另验。两份完整原skill原任务作者各5次响应，交付10/8问题的有效配置与便携usage；独立只读核验确认任务/用户策略保留、无目标/网络/安装/额外模型调用。Cloudflare范围由已登记activeInput提供4条路径，非作者擅扩原始2路径。累计57/57响应，known input/output/cacheRead为384,337/37,039/48,128，美元与真人/开发成本未知；作者忠实与下游完整质量分开。

**真实外壳修订与AT16读取浪费。** ShareLink第五轮8/8响应，实际call已声明、helper已定位且调度过read；物理读取8,379,114字节后被8MiB预算阻断。不能把它说成未派出callee；当前修复source_search用既有索引筛出命中文件，再验证命中原件，预算不增加。Gitea第二轮21/21响应，接受handler与3个权限helper及实际link，但map/集合/有序比较保持unresolved，NewIssue尚未解释；final误把reqRepoWriter用于实际reader路由，不能判政策合规。两条仍partial。匿名搜索/正文预算先红后绿；新变化runner2项准入测试及联合682 pass/1 skip/4530断言和双typecheck通过。AT12登记ShareLink owner政策和非owner组授权前提，previous仅准入本轮SHA绑定源码full且checked/bounded结果；无合格基础时fresh诊断仍跑。AT13登记独立源码副本删除单一owner-aware子句、两次fresh，旧来源不改。实际采用/下游质量另验。

**最终方法与实际采用。** `focused-closure-v1`复用既有worklist/semantic lowering：宿主固定focus及question/source/version身份，处理add/replace、callee、当前path ID；模型只提出可定位源码解释。纯有限标量返回摘要可组合并保留条件析取，复杂对象、效果、循环、映射/集合和有序比较保留精确展开或缺口。普通supporting read只显示原文，实际caller仍须声明调用并连接helper。AT还修了局部start、wire外壳、累计读取、来源终检、已知坏候选分类及账本口径。模拟通过之外，真实记录观察到持久解释、typed helper link和当前答案路径；尚无完整checked闭合链。

AS六个断点在本轮的实际状态如下：

| AS断点 | AT实现与采用记录 | 最终边界 |
|---|---|---|
| 已读helper待解释、offer轮换 | 持久focus、显式延期重访、bounded supporting windows；Gitea接受handler和权限helper、ShareLink真实调度helper read | 已读原文仍未全部变成相关接受解释；继承对象关系未闭合 |
| 模型维护多重身份 | 宿主派生focus/item/unit/add-replace/callee/path，窄阶段合同与错误正文原位修复已使用 | 语义块/参数映射仍可错误；身份简化未建立完整质量收益 |
| 旧队列/拒稿反复带入 | 当前阶段合同、当前窗口与诊断为主，原历史归档；索引命中读取同题降至2,039,548字节 | 质量仍partial；源码终检修订使前后条件不同，只报告机械读取变化 |
| nonwriter Projects被误说忽略 | 主独立点验reader路由、Labels清空、Projects仍传到service；最终评阅纠正探子过高/过低评分 | 主表仍有Projects遗漏或未闭合，不宣称普遍解决 |
| 到达调用即performed/complete | 纯helper return、protected effect及operation error分层；无目标执行，未解释callee产生gap | final与source claim仍可能冲突；model插入及opaque effect未通 |
| 四有效作者稿消费不完整 | 四稿保持原问题和剩余skill职责，原字节输入/usage在外部便携目录实际消费 | 作者忠实4/4；下游四消费者均partial，编写完成不是分析完成 |

**12位置首轮。** M-L为整理Markdown加legacy，M-F为相同Markdown加focused支持，D-F为领域声明加focused支持。共同原始来源/模型/预算固定；实际实现修订分别记录，不把跨版本首轮当因果比较。每格为源码评分/实际provider请求数，所有格均unchecked/unbounded。

| 任务 | M-L | M-F | D-F |
|---|---|---|---|
| OWUI ingestion | partial / 4 | partial / 22 | partial / 11 |
| Paperless download | partial / 4 | partial / 21 | partial / 23 |
| Paperless ShareLink create | partial / 6 | partial / 9 | partial / 16 |
| Gitea CreateIssue | partial / 10 | partial / 21 | partial / 21 |

首轮共168调用，完整源码质量0/12，形式checked/bounded也为0。九个session实际进入一次diagnostics-only交付修复；ShareLink M-F的四次domain-repair请求含fallback/continuation，不能称四个独立修复机会。保留首/末诊断和逐行共享修复适用性见[repair applicability](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/repair-events/at-quality-repair-applicability-v1.json)。其余质量问题保持source-partial；底层仍未通，依AT15未追加填表消融。全任务完整为零保留了正确局部判断：reader/write、exact-document guard、GET/root关系和源file/输出collection区别。

**普通完整skill及作者稿。** 两份完整原skill均在同包原/变任务fresh使用，各24调用，共96；original Cloudflare ShareLink和GitHub CreateIssue的自然条件说明源码充分，changed两项partial。四项native形式均失败，不能将自然full作previous基础。作者Cloudflare原/变为10/6题、5/4调用；GitHub原/变为8/8题、5/6调用，20次总调用，四稿格式有效且独立忠实评阅通过。原字节消费者首轮分别30/28/30/19调用，均partial。注释`function and`曾被Go词法索引当唯一声明并宿主自动读取；通用注释/字符串屏蔽后，GitHub原稿具名consumer attempt-2用31调用消除了假入口，接受真实CreateIssue，但六个其它stored unit仍落在无关repo创建handler，总体仍partial。来源字节身份有效不等于问题相关性；所有原答和修订分别保留。下游消费共138调用，不能据作者稿有效宣称工具实用性成功。

**变化和复用。** owner-only政策fresh 7调用；非owner、global add/view和exact-document group view前提fresh 11调用，两项partial且政策undetermined。两previous实际admission因没有full源码且checked/bounded的当前base阻断，0调用，无实际复用收益。源码副本只删除serializer中139字节owner-aware conjunction，其它94文件、输入/政策、sourceRef标签与原源码不改；compare/previous在provider构造前拒绝旧答。相同副本和同输入的两fresh为21/11调用、均partial：第二次终答正确指出剩余global view不满足exact-document政策，第一终答仍将serializer关系列unknown。主纠正独立审计“两个终答都注意改变”的判断，不把中间/审计事实补成最终回答。完整endpoint/inheritance/object/save链仍缺。最新五条SHA绑定评阅见[final reviews](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/evaluations/at15-final-change-and-consumer-source-reviews.json)。

**成本、验证与最终判断。** 37已关闭尝试=8调试+12质量首轮+4native+4作者+5消费者（含具名修订）+4fresh变化；556请求/556响应，无活动或未知完成。fresh input 8,635,306、cacheRead 765,568、完整prompt 9,400,874、output 403,256，合计9,804,130；USD、开发代理用量、真人分钟仍unknown，known USD subtotal 0不是免费。目标执行0依据受限只读运行时及精确作者raw-tool审计；不把叙述字符串相加或未知填零。原件和逐调用证据见[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/accounting.json)、[call index](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/call-index.json)。共享回归718 pass/1 skip/4639断言，最终provider/研究40 pass/192断言（重叠集合不相加），主/AT类型通过；37原件[零调用replay](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/verification/at17-final-replay.json)通过且原字节未改。工程和有限实际使用交付，完整质量、变化复用、表示优势及摊销净收益未达。后续应修问题相关定位、可读caller/helper与继承对象关系、有序权限表达，再建立合格base；不再原样重抽。

### 7.50 AT 复核：任务拆分与领域表达的衔接

**复核依据。** 2026-10-05核对本地及用户origin均为`c375c8b5`、工作区干净后，点验原始native终答、作者原稿、消费者存储的semantic units、质量评阅及共享实现。三项独立只读探索提供定位，主线程核实关键原件与代码。新鲜运行五个相关测试文件，62通过、319断言；没有新增模型、业务API或付费调用。以下诊断不改变AT分母或旧评分。

**更靠前的任务拆分问题。** [compileAuthorizationInquiry](../../src/task-dsl/authorization/inquiry-program.ts)对每个question无差别展开entry、principal、resource、guard、effect、exception六类工作。[GitHub原稿](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/runs/author-github-security-review-original/attempt-1/authored-inquiry.json)把同一CreateIssue审查拆成8题，其中包括政策比较和source/deployment limits；这些题各自重新定位入口。具名修订后的[原字节消费者](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/runs/consume-author-github-security-review-original/attempt-2/report.json)共7个存储unit：1个来自`repo/issue.go`的CreateIssue，另外6个来自`repo/repo.go`两处仓库创建函数，同一原文还在不同问题下重复存储。worklist的候选来自词法提示，唯一候选可以自动选择；focus按问题轮换，尚未用共同操作身份及实际调用关系充分约束选取。上述事实支持优先调查“问题拆分—入口重选—重复解释”的影响，具体质量和成本因果量仍需后续修订验证。

**表达能力与真实任务不匹配。** [procedure-summary](../../src/task-dsl/authorization/procedure-summary.ts)仅对完整、纯有限标量return/reject生成可组合摘要；带principal/resource的guard、对象返回、effect、call等继续精确展开。[条件计算](../../src/task-dsl/authorization/control-evaluation.ts)直接支持eq/neq/null及all/any/not，尚无原生有序权限比较、map lookup或集合成员运算。实际任务的难点恰好集中在CanWrite/CanAccess、对象权限、继承方法、serializer与保存对象的关联。已有逐步展开和返回对象支持应保留，但当前摘要尚未覆盖这些主要路径，继续加长guide没有补足这些语义。

**把失败分为两类。** Gitea original [native终答](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/runs/native-github-security-review-gitea-create-issue-original/attempt-1/stdout.txt)已解释reader可创建基本issue、writer控制部分metadata，并追到保存代码；形式图仍缺CanWrite/CanAccess及effect关联。Cloudflare original也读出了精确Document、owner-aware分支和继承create，但图未闭合。两条属于自然说明充分、机器关系仍缺的样本。相对地，[质量终评](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/evaluations/at14-final-quality-first-source-reviews.json)保留了未读决定性helper、Projects遗漏、NewIssueWithIndex未读等实际分析不足。前一类应修解释到程序的转换；后一类应修取证与语义遗漏。现有checker拒绝尚未关联的图有其依据，本次未证明只需放宽checker即可解决问题。

**成熟度和比较。** 领域声明、只读取证、状态管理、有限求值和失败留账已有可运行底座；真实源码到完整可检查程序的转换仍处于研究原型阶段。四份作者稿的忠实有效说明前端可用，下游消费均partial说明端到端可靠性仍低。主面板M-L/M-F/D-F实际调用为24/73/71；这些记录没有建立净收益，且修订版本影响解释，不能据此作严格因果估计。M-L仍走共享inquiry/checker，并非独立普通agent基线。

**供下一任务书取舍的建议，尚未实施。** 保持授权任务类，先建立同一操作可共享的来源解释，把行为、政策比较和范围说明作为不同义务；只在principal/resource/调用关系等确有差异时重新分析，政策及用户前提不可被共享源码事实覆盖。再设计源码支持的有限权限与对象关系摘要，使任务DSL表达授权问题，内部局部程序负责必要计算。先用隔离的确定性fixture检验足够表达和错误检出，再让运行模型自行读取原始源码，完成一条真实原/变链后做第二种结构与完整原skill。主要评价继续核对源码正确性、任务充分性及机器检查，保留独立普通skill加相同源码工具的参考运行；不把evaluator答案或人工正确图交给被测模型。真实复用放在合格基础上，成本按取证、解释、修复和交付分账。下一轮应检验上述结构修订，避免继续用大批调用代替方法调整。

**补充讨论：DSL实际执行什么。** 2026-10-05在`2e8a9da1`上继续核对代码。外层[任务声明](../../src/task-dsl/authorization/inquiry.ts)保存问题、主体、资源、操作、用户前提及独立policy；内层semantic blocks由模型解释源码后提出，TypeScript宿主编译和执行有限控制关系。模型仍负责源码含义、参数关系、分支条件和policy映射，宿主负责身份、状态、有限计算及机械一致性。当前sourceBound说明原文关联，semanticSupport仍保留unreviewed；这套程序检查的是已提交解释的关系。普通native在最后另有模型生成prose：[beforeDispatch](../../src/benchmarks/authorization-dsl/inquiry-native.ts)在有checked result时要求按同答渲染；预算末尾没有checked result时仍允许带缺口的raw自然说明，因此自然full/formal失败有实际执行路径。

**漏读的关键边界。** [词法索引](../../src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts)依靠声明模式、缩进/括号和调用名，不提供完整import、receiver、别名和继承符号解析。[dependency scheduler](../../src/benchmarks/authorization-dsl/inquiry-domain-scheduler.ts)读取和检查已提交的`slice.dependencies`，另有词法lead，但缺少独立的决定性依赖完整清单。系统已经分别计量物理读取与实际provider上下文展示，也区分read、interpreted、linked、checked；应复用这些状态。真正待补的是模型遗漏一个依赖时，宿主怎样从源码结构和领域义务发现它。建议在明确支持的语言/框架内，以结构索引和版本化框架模型产生候选依赖，再以任务的授权义务筛选、追踪及排除；动态分派和外部缺源码保留具体缺口。AST定位本身也需要名称绑定和框架关系，不能只替换正则后宣称解决。缺少证据支持的业务关系仍由模型解释和独立核验。以上是下一设计候选，尚未实施。

**公开参考及适用边界（2026-10-05核对一手资料）。**

| 参考 | 已有能力与依据 | 对本项目的启发 |
|---|---|---|
| Cedar | [授权概念](https://docs.cedarpolicy.com/overview/terminology.html)围绕principal/action/resource/context、policy和entity计算决定；[Amazon Verified Permissions](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html)实际采用Cedar | 领域对象和关系要有执行语义；事实获取由调用方负责，我们还需解决源码事实提取 |
| CodeQL/QL | [源码数据库与查询](https://codeql.github.com/docs/codeql-overview/about-codeql/)及[框架/库模型](https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-python/)支持类型、调用及数据流分析；Python数据扩展接口仍标beta | 借鉴结构事实、模型库与规则查询的分工；评估复用现有提取能力，不把语言解析全部交给模型，也不默认引入整套新平台 |
| LMQL | [PLDI 2023研究](https://arxiv.org/abs/2212.06094)把提示、控制流和输出约束编译成推理过程；[约束文档](https://lmql.ai/docs/latest/language/constraints.html)说明支持后端下的生成期约束 | DSL的约束应实际影响执行；格式约束的实现与源码语义正确性分别检验，论文效果只属于其任务/模型条件 |

**特化的建议尺度。** 以授权任务共同的主体、资源、操作、关系和义务为语义，再区分读取既有对象、在容器中创建、集合返回、跨资源操作等模式；具体应检查什么仍由任务政策和源码确定。[Cedar授权模式](https://docs.cedarpolicy.com/bestpractices/bp-authorization-patterns.html)可作概念参考。语言/框架适配器处理继承、路由、对象传递，项目名称和函数名只作源码绑定，不写死允许/拒绝答案。足够特化的检验是同模式换仓库可复用核心、关键关系可计算、删除/换错控制或资源会被发现、变化时只重做受影响义务。范围外内容应可定位并解释，无需承诺任意动态源码的零漏读。权限顺序和资源关系来自源码/独立声明，不能预设所有项目都有同一角色层级。

**自然说明成果的准确范围。** AT两份original native按原始任务获得full conditional source explanation，四native各24调用；两份changed为partial。Paperless说明精确document、全局权限与owner-aware三分支、继承保存及严格policy关系；Gitea说明reader路由、writer控制部分附加字段、仍到达保存及所给policy冲突。[SHA绑定评阅](../../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/evaluations/at10-original-and-search-source-reviews.json)采用独立只读AI审查和主代理点验，非真人盲评。Gitea final未逐项列出Projects，原任务未要求该可选字段清单，主面板的字段义务评分仍保留。两条自然充分样本证明已有有内容的源码分析；重复稳定性、变化任务完整性、机器checked基础和净收益继续待验。关于给定严格policy的冲突仅针对该policy，不构成对项目部署漏洞的认定。

### 7.51 系统修改的接入点、源码参考与可检验贡献

2026-10-05继续做只读源码核验及公开实现调研；本节是下一设计的依据与建议，尚未实施或启动新实验。当前底座可沿用：inquiry/native共用的[运行时](../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts)、只读源码工具、来源身份、局部解释、有限求值和结果检查。需要重点调整任务/事实边界、结构定位与领域摘要；无需新建CLI或重写整个SkVM。

| 当前缺口 | 已核实接入点 | 需要设计的变化及验证方式 |
|---|---|---|
| 同一操作拆成多题后反复定位、解释，甚至选入无关函数 | `compileAuthorizationInquiry`为每题展开六类义务；worklist、control rules和bindings都按question隔离；evidence已有源码身份 | 增加operation级来源事实与依赖身份，各question引用同一行为解释，政策和用户前提分别计算。重复提问/换问法应复用同一正确入口；不同主体或资源不得误合并 |
| 未提交的决定性依赖容易漏掉，继承/别名/helper对象链靠模型补齐 | source_symbol、worklist候选、scheduler和focus显式caller/target/参数映射 | 接入语言符号与版本化框架关系，产生带来源的候选边；调度由未满足的授权义务选择补读对象。以继承覆盖、同名干扰、间接调用、模型漏报依赖等反例核验 |
| 自然说明已有内容，机器程序仍需大量低层展开 | [procedure-summary](../../src/task-dsl/authorization/procedure-summary.ts)已有纯有限返回摘要；对象guard等退回exact expansion | 扩展源码支持的主体/资源/权限摘要及有限操作，保留分支、对象身份、前提与缺口。先验证相同对象、owner分支、权限映射和被拒绝路径，不能按角色名称预设权限顺序 |
| 整体partial导致previous阻断，任意源码集变化也整体重做 | [planInquiryReuse](../../src/benchmarks/authorization-dsl/inquiry-reuse.ts)已有政策/前提区分，但要求完整checked基础；源码变化统一拒绝 | 区分可复用结构事实、待复核语义解释和完整结论；后续设计按事实依赖局部失效，结论重新计算。部分事实的保留不得继承旧checked标志。当前会话快照仍保持不变，源码变化进入新的会话 |

**公开实现阅读所得。** 本次读取相关源文件和测试片段，没有安装或运行这些项目，也没有完成全仓评估。

- [CodeQL RestFramework模型](https://github.com/github/codeql/blob/main/python/ql/lib/semmle/python/frameworks/RestFramework.qll)：`ModeledApiViewClasses`通过模块/成员关系定位框架类，`RestFrameworkApiViewClass`沿子类关系识别handler；`Request`模型跟踪实例和属性传播。[测试](https://github.com/github/codeql/blob/main/python/ql/test/library-tests/frameworks/rest_framework/taint_test.py)覆盖函数视图、类视图及request属性链。这为继承与对象链提供可执行的结构依据；代码也明确记录类属性赋值等遗漏。采用前需评估数据库准备、框架覆盖和查询成本，不能只复制几条QL规则而省掉其依赖的语义基础。
- [Cedar evaluator](https://github.com/cedar-policy/cedar/blob/main/cedar-policy-core/src/evaluator.rs)：`partial_evaluate`区分确定结果、求值错误和residual表达式，逻辑运算保留短路与类型检查；`partial_entity_stores_getattr`测试分别验证已知属性值与未知实体的残余表达式。可借鉴有限语义与具体未决条件的表示，尤其应区分“信息缺失”和“解释程序错误”。事实提取仍需我们解决；现有三值求值器可扩展，无需立刻更换语言。
- [IRIS实现](https://github.com/iris-sast/iris/blob/main/src/iris.py)先用CodeQL收集候选API，再由模型标注source/sink/传播规则，生成查询并运行分析；[论文](https://arxiv.org/abs/2405.17238)研究的是LLM与静态分析的结合。对本项目的直接启发是让结构提取提供候选范围，模型承担局部语义判断，避免让同一次自由生成同时决定候选是否存在和结论是否成立。
- [RepoAudit工作队列](https://github.com/PurCL/RepoAudit/blob/main/src/agent/dfbscan.py)以value/function/call-context组织按需探索，局部数据流分析结果推动后续调用；[路径验证器](https://github.com/PurCL/RepoAudit/blob/main/src/llmtool/dfbscan/path_validator.py)本身属于LLM工具。[论文](https://arxiv.org/abs/2501.18160)已研究按需探索、记忆和路径验证。这些构件已有先例；引用时需区分确定性检查与模型判断，不能仅凭validator名称推定独立正确性。

**拟验证的贡献。** 主假设是把授权任务中的主体、资源、操作和审查义务编译为可执行的取证需求：每个缺口能落到具体需要补查的调用、对象关系或分支，检查结果再驱动局部补充，而非仅向模型返回一串诊断。次假设是将源码行为、独立政策和用户前提分开，使同一操作的多个问题共享来源解释，并在变化后只重算受影响部分。需求驱动分析、程序摘要、缓存、部分求值本身均已有研究基础；本项目的增量要通过授权领域的义务到执行映射、漏项检出与变化一致性证明。本次调研尚不足以宣称首创。

**下一轮的研究与实现次序建议。** 先把AT的无关入口、继承遗漏、对象混淆、权限条件表达和整体失效分别落实为可复现机制案例；再为一个操作贯通声明、结构定位、局部解释、检查和原skill自然交付，并在不同结构上验证共享实现。失败暴露共享实现缺陷时暂停受影响调用，先保留失败、针对性修复并复验；不要求明知有缺陷仍跑完面板。已知开发案例用于修机制，新成员用于后续检验迁移，两个用途分账。结构提取器可以比较轻量语言/框架索引与CodeQL适配的实际成本后选择，不把实现一整套静态分析器设为前置任务。

评价同时记录源码正确性、义务充分性、漏读/错误绑定、首答与修复后交付，以及取证/解释/修复的实际调用开销。普通skill、同工具的Markdown方案和完整DSL方案分别保留，运行输入只包含真实源码、任务和明确政策，oracle留在评价侧。方法收益应进一步区分结构工具收益与DSL执行语义收益。变化复用的依赖索引还需覆盖名称解析、候选集合、框架版本及配置；只记录已读文件会漏掉新增override或路由改变。动态关系无法解析时返回具体缺口，未知条件不得自动填成允许、拒绝或零值。

### 7.52 AU 开发授权与验证安排

2026-10-05，用户要求书写下一任务书并派发`gpt-6.1-sol / max`开发。[AU0–AU21](../superpowers/plans/2026-10-05-authorization-operation-evidence-and-domain-closure.md)承接§7.50–7.51的具体缺陷与公开实现参考，依次开发操作归一化与事实空间、Python/Go结构取证、义务驱动补读、有限权限/对象摘要、材料失效与双入口消费。同类任务跨skill共用核心，项目函数名只作来源绑定。

真实验证保留四个AT已暴露任务、两份完整原skill与作者原字节消费；政策、前提和源码变化分别比较fresh与材料复用。独立普通skill参考、Markdown加同核心与DSL加同核心分开归因；首答与针对性修订、未派发和未知分别记录。共享缺陷立即停受影响调用，先修实现再复验；不再用大批已知受损调用代替接口调整。完整任务收益须依据真实充分答案；partial材料恢复保留原等级并重算结论。此处只登记已授权工作，方法创新和效果仍待本轮实际证据。

### 7.53 AU 操作事实与结构取证原型（有限队列已收束）

AU2–AU8已形成生产原型，AU10首次ShareLink调试已派发并保留partial结果。v2把operation和question分开，宿主每操作编译一份来源工作；同入口解释按原问题投影，政策和用户前提仍独立求值。操作事实保留repo/ref、入口、源码与候选/框架依赖，解释等级保持unreviewed。AU11材料恢复已做匿名验证，真实采用、源码质量和实际收益尚待验证。

Python/Go结构索引采用固定MIT许可的`@vscode/tree-sitter-wasm@0.3.1`，从已计量、允许的源码字节建立语法/名称/继承/调用/返回对象/路由候选。DRF模型只在源码可见的qualified继承上启用，沿实际MRO定位方法、serializer和permission候选；路由注册及middleware表达式保留源码位置。候选不是业务事实，动态接收者、语法错误和外部缺源码保持具体缺口。CodeQL在当前环境不可执行，因此未声称覆盖率等价或测得工具收益；公开框架模型仅用于责任设计。有限map/集合、显式角色顺序和短路求值保留错误与unknown；对象摘要使用同一semantic-flow展开器并检验对象/效果/异常身份。

首次零provider结构探针：Paperless允许95文件，1717符号、9763调用、1365可绑定，准备2430.8264ms、索引1412762bytes；Gitea允许346文件，3418符号、18305调用、5050可绑定，准备39660.2224ms、索引2314050bytes。原件在AU `evaluations/structure-probes.json`，后续优化探针另存。该计数不代表决定性关系完整、独立源码正确或任务完成。首轮完整回归暴露旧schema广告不含顶层null的兼容问题，已修正。目标源码执行0，开发/探子及真人费用未知，不能记为零。

首次ShareLink调试14请求/14响应、64工具动作、3接受单元，完整源码质量仍partial。独立源码与运行轨迹核验确认：决定性`validate_document`源码已读，但尚未进入解释；原入口把静态router.register写成call，raw-string注册又未进入结构模型，继承方法失去接收者并重复配置展开。共享修复先用五个匿名失败例定位，再支持静态context关系、实际receiver贯穿及已读结构work选择；74定向检查、727联合检查/1skip与双类型通过。首答、评阅裁定与修复事件保存于AU results。材料级partial恢复另有三个匿名例：保留有效模板、源码override失效、政策/前提独立重算，不继承旧终答/check。

同题具名修订`source-context-receiver-v1`21请求/21响应，接受单元增至9个，终答正确指出关键文档guard，但6问独立裁定仍partial：所有callee为空，入口initial仍阻断；ownerless/owner/direct/group未充分展开，源码政策比较又被未请求的部署信息限制。累计35请求/35响应；第二轮完整input352325/output19126/cacheRead24320（cache不重复加总），实际USD未知。下一共享修复以匿名失败例检验自动唯一来源身份绑定、实际C3的super、宽引文解释状态及保留receiver；旧callee在关系不唯一时撤回，参数/权限语义不由宿主补齐。独立代码核验发现的旧callee漏洞已补反例；普通M/D1入口核验无接线问题，完整原技能实用仍待派发。工程验证与源码质量/实际收益继续分列。

第三次`source-link-c3-v1`21请求/21响应、4个来源绑定、7个source units，3问仍partial，报告SHA与独立源码/轨迹裁定已存AU evaluations。完整input361682/output13225/cacheRead21888，USD未知；累计56请求/56响应。实际绑定有进展，但认证体重复上下文、revisit新handle及多问题投影重复来源事务消耗预算，最终把可得create/serializer/权限源码留作提取缺口。下一修复改为按actual caller确定receiver并保留原事务身份，新策略一次可解释至多4个同操作、已读且当前完整原文已展示的独立source units；九个匿名失败反例转通过，联合770 pass/1skip。该粒度调整沿用同一runtime/预算，不增加oracle或另建provider循环；真实质量、表示贡献与成本收益仍待同题及面板验证。

第四次`source-transaction-batch-v1`3请求/3响应，transport-failed、0接受source units、无终答；四个实际声明问题均not-delivered，不能复用前三轮partial作本轮交付。完整input26644/output2866、USD未知，累计59/59。主SHA/原始响应与独立评阅确认是focused payload错层及同kind容器重复；三个匿名反例验证无损路由恢复、冲突/缺identity拒绝，两个原失败payload零调用重放已可解析。格式修复与批量源码质量/成本收益仍分列，下一同题具名修订不携带评阅结论。

第五次`focused-envelope-routing-v1`20请求/20响应，仍transport-failed、无终答，五个问题均not-delivered；10次接受事件含替换，主原件确认6个current source units，不能记成10个现存单元。完整input362414/output13392/cacheRead31104，USD未知；累计79/79。两探子核验7次格式拒绝、normalization=0，类配置与继承create正文还存在错误归属；serializer/object-permission窗口可得而未接受。连续同因后改operation structured广告为单层action/result，仍lower到同一核心；三新匿名接口测试、公开output cap和薄ordinary runner已通过联合782 pass/1skip与AU类型。完整原技能22/8文件SHA及公开changed policy补充登记，真实普通使用/完整质量/净收益尚未验证。独立代码核验的日志身份疑点经CLI整段prompt锚点裁定未成立，中央身份函数复用避免后续约定漂移；零参考读取如实记录，由原skill职责的独立评阅判断充分性。

第六次`direct-focused-step-v1`21请求/21响应形成六问终答，但全部unknown/rejected、usable0；源码终检95文件有效。14个current units主要是同一class/route/framework体的重复，5个声明operations把同一创建动作按职责分开；serializer与exact-object权限无accepted单元。完整input418085/output16586/cacheRead17024，USD未知，累计100/100。独立SHA/轨迹/源码核验及主原始payload抽查确认：2 wire failures、16格式归位，实际终答改善只支持容器恢复，不支持语义授权/完整政策合规或净收益。下一修复以同一共享指南明确动作与职责粒度，保留多动作任务；模型广告从仍被自动套value的union改为单root object，严格action union校验继续。四个预期red转通过，联合784 pass/1skip/4994断言、主/AU类型及独立接口核验通过。评价侧的无条件policy-satisfied主张未采用，源中的ownerless/owner/direct/group分支需实际解释并比较。

第七次`operation-duty-granularity-v1`5请求/5响应，实际声明已为1操作/3问题，2current units，但纯source step携带广告中的schemaVersion/focusId被旧tool分支拒绝，transport-failed且全题not-delivered。完整input45225/output2690/cacheRead0、USD未知，累计105/105。两原payload在修复后零调用解析并保留各8个来源调用，仅解除具名路由风险；任务粒度改善不等于源码质量。AU13完整skill作者/原字节ordinary消费者薄接线及忠实性/raw审查准入已做匿名red/green，联合791 pass/1skip/5093断言与双类型通过；实际作者/消费者仍待派发。ordinary raw/native对账要求已知正整数且全响应，缺失值不能互相证明。

Gitea首轮`bd9348f0`原件11派发/11响应，1操作/3问、4个current source units，transport-failed且三问无终答。源码终检346文件有效仅证明输入身份；accepted caller把form.Deadline/repository错映为CanWrite的unitType，正确源码两处均为unit.TypeIssues。独立source/raw审查与主精确解析确认：direct interpret本来合法，seq10/11额外reason使normalization失败，fallback的tool/control诊断遮住真实原因；内部草稿还有非法fallthrough/步骤/数组值，不能在修路由时接受为正确解释。将reason统一为typed proposal metadata后，两原回复零provider通过canonical routing，原unit/说明保持且内部仍被focus-schema拒绝；两个预期red转通过，804共享pass/1skip/5241断言及双类型通过。下一同题具名复验检验既有定向诊断能否实际带来正确参数与交付；这里未宣称源码质量改善。累计11归档attempt、153/152、1未知完成仍属Share，actual USD/开发AI/真人未知；Share全部16位置封存，其他原任务独立推进。

第二次Gitea在`688463e4`为21/21已知，原件SHA绑定评阅判四问partial：字段级区别有用，创建/上游链仍unknown/rejected，usable0。终答sourceRef追加4的错误保持原文；主纠正探子只检查metadata而遗漏终答，以及把174累计调用错用成153旧合计。实际caller将CanWrite错改为CanAccess且未绑定，模型源码/连接错误独立保留。seq7额外revisit的拒绝被kind fallback掩盖，现准确呈现原envelope错误而仍拒绝。独立表达能力审查和主代码阅读确认源literal/有限array transform缺口；匿名TDD实现type:value source bind、有限字段值、参数/alias身份和unknown覆盖，源值不进入USER。赋值型helper按exact顺序展开，纯摘要仍组合；独立代码探子发现map字段投影遗漏，另先红再补一致性。8新反例转绿，44定向/471断言、788联合/1skip/5155断言、15 provider/native/87断言、双类型通过。新接口的真实采用仍须下一具名运行，不能把零调用证明或源码身份计为研究收益。12归档原件累计174派发/173响应，fresh3012982/cache141952/output155426，1原Share未知与USD/开发/AI/真人未知继续保留。

第三次Gitea在`272390cc`21/21已知响应，4current units、四问partial/unknown/rejected、usable0；sourceRef已正确。独立评阅与主精确payload裁定区分诚实unknown和任务覆盖不足，并纠正把event行号32/34/36当成实际派发序号的评阅；仅seq18有wireFailures，seq19为内部修订的core schema错误。新source值/清空Labels数组已实际提交，部分permission/resource附value或enum符号字符串仍无效，不能以采用次数宣称正确映射或净收益。当前首个阻断是resource别名引用仅有value投影的ctx字段；caller仍误写CanAccess，helper重bind已映射参数，局部名字又被声明为虚构formal。现有语法的qualified typed bind可表达源身份，增加匿名例与具体两端类型诊断，不自动提升字段、补目标图或放宽同对象检查。1新预期red转绿，73定向pass/560断言、双类型通过；现有reusable例和原Gitea输入离线check有效、0provider。旧reason路由仅由原payload保持proof与两次同题已知partial终答裁定improved，源码质量不提升。13原件/32位置零provider重放195/194，fresh3402922/cache176768/output190714；1Share原请求及实际USD/开发AI/真人继续未知、目标执行0。下一诊断转已登记完整原skill native-original普通入口，作者/忠实性/原字节消费者独立推进，不用第四次structured重抽或主面板替代调试。

完整原skill原生诊断在`d2ba9490`24/24已知，原/安装bundle与输入不变、raw/native一致、参考读取0、目标执行0。自然报告正确指出reader gate与writer字段限制后仍可到达NewIssue，独立源核验支持这一有条件政策疑点；但reqToken/reqRepoReader的认证及admin/site-admin例外、创建后close/refetch异常未充分展开。主裁定原任务partial，纠正探子的自然full建议，并区分明确授权范围与不适用的全项目扫描、剩余原skill职责和必需参考咨询。12current units含重复/错误helper，不用旧debug4单元描述本位；deadline关系未连，CanWrite helper把unitType写为permission，常量符号/prose值仍unreviewed。末check的defer/revisit改变snapshot而result保持旧focus，tool exit0不等于formal valid，形式not-checked-bounded。日志探子发现finalize才写conv文件，但默认root mismatch推断被主实际SKVM_CACHE与原raw24/24否定，没有宿主修复。14原件219/218，fresh4401813/cache324736/output215214；原Share完成未知、USD/开发AI/真人未知保持。下一native-changed与独立作者/原字节消费按登记继续，不重抽原位，收益比较仍未建立。

同HEAD native-changed亦24/24已知，3units、自然终答、形式not-checked-bounded；报告正确解释写权限仅控制字段，但把独立政策的any repo reader收窄为issues-unit reader，conditional SATISFIED缺org/team独立unit权限及admin例外支撑。主未采用探子的自然充分建议；enabled when条件不擅改iff。原源码条件审计与完整final/末check裁定在results；partial、0参考读取及未说明的原skill剩余职责保持。实际正常check返回草稿拒绝，被旧mechanicalReview因遗漏focus-next-item-unavailable/semantic-argument-unbound误标state/checker；inquiry/observation schema代码早已支持，主纠正探子关于这两项遗漏的说法。1匿名组合预期red转绿，52相关pass/235断言、双类型通过；精确原report0provider重放归model-draft，原review/失败不改，既有SHA限定范围裁定释放显式非Share行，不提升原任务。15原件/32位置243/242，fresh5309354/cache443008/output233727、USD/开发AI/真人及1Share原请求未知，目标执行0。接续原/变作者及合格原字节消费，原/变native不再付费重抽。

原政策作者首稿在`e458fa6f`5/5已知、11工具动作、目标执行0；完整原/安装skill及源输入保持。实际配置/说明误投`inquiry/`，原报告根交付ENOENT保留，nested字节单列入档。独立raw和忠实性审查支持配置覆盖原任务、政策原文且无source答案，但USAGE将作者临时禁止analysis/check命令及model调用变为消费者约束，整体partial不准入。主纠正先前12工具计数与探子的根路径/哈希转述。共享提示明确根文件和JSON成员、作者消费者职责，原稿修订准备只复刻实际字节到prior-draft而不由宿主提升为根交付；3预期red转绿，55相关pass/255断言、主/AU类型通过，独立代码核验未发现已证实错误。当前16原件248/247，fresh5328519/cache458368/output236395，原Share未知及USD/开发AI/真人未知保持；唯一具名字段/交付修订尚待实际运行，不能把提示或确定性修复当成真实消费收益。

`9a4c76f6`的唯一原政策作者修订5/5已知、11raw工具，实际读取两首稿后写入根文件；四项职责及policy保持，问题ID/措辞和principal intent改写未丢职责，USAGE消费者工具合同已修正。主完整两稿、独立忠实性/raw审查和原写入字节核对支持faithful准入；原件归档`authored-*`命名不等于工作区root路径缺失，探子相反判断已纠正。变化政策作者首稿同代码5/5、7工具、六职责且policy逐字、不将any repo reader收窄或when改iff；USAGE完整skill remains including是开放责任清单，不自动排除未枚举的适用职责，也不新增scope外扫描。两可用作者稿均未读目标源码、未执行目标、无oracle内容；原/变实际问题拆分4/6不同，应随原件列示，不能把policy或表示收益单独归因。18归档attempt258/257，fresh5365810/cache496000/output242238、目标执行0；原Share未知及USD/开发AI/真人未知保持。接续原/变原字节ordinary消费，作者合格不替代下游源码质量或净收益。

原字节Gitea消费者在`187d2195`派发22/响应21，request22仅广告结果检查工具后300秒网络超时，实际完成/usage未知、无终答、formal unknown。源终检346文件有效、16current units，完整原/安装skill、作者配置/USAGE原字节保持；raw与native均23工具、22/21请求响应，目标执行0、参考读取0。主纠正探子把工具侧车尾空行算成第24动作及allowedPaths的17条转述，实际分别23/16。原unbound诊断来自ordinary全响应守卫，不能据此猜日志身份错误或补发已未知请求。原件SHA与gzip压缩/解压SHA绑定评阅留档，source草稿不能提升为交付。Gitea剩余4位置零调用封存，原/变作者合格事实保持但变化消费者不得绕过同任务未知；沿用retainTaskPause机制仅放行其它两原Python任务的6质量位置。19归档原件累计280/278，fresh6302917/cache647040/output267336，2项Share/Gitea完成及USD/开发AI/真人未知保持；现有共享实现缺陷未证明，不增加修复或同题重抽。下一依次OWUI N/M-O/D-O、Paperless download N/M-O/D-O。

OWUI质量N/M-O在同`5ac2d651`分别7/7和24/24已知，26/39工具，完整Cloudflare原/安装bundle与输入保持、source173文件有效、参考读取0、target0。N终答交付owner/admin与file/collection分离，漏bypass、hash拒绝、已有collection no-op、truthiness及删除控制，natural partial、formal按N不适用。M-O终答补述bypass/去重/add-no-op，但外层files/knowledge caller和可得的get_current_user认证来源未完整交付，6current units、1operation/1question不能补终答；natural仍partial、形式not-checked-bounded。主纠正源码探子引用中间解释、将自然充分性与formal混判及raw探子未定位诊断生成点：semantic-flow.ts:37/51/135将原unit的unresolved reason原样变为code。分类白名单漏此来源而误标checker/delivery，非真实宿主异常；生产lower生成匿名red转绿，56相关pass/265断言、主/AU类型和独立代码核验通过。只精确匹配current unit/宿主诊断出处，身份不符、unknown/internal/pending/source-invalid保持暂停；原M-O SHA零provider重放归model-draft，原review/check/质量不改，不增加M-O修订。新的显式SHA范围裁定允许OWUI D-O和Download三臂，Gitea/Share未知封存保持。21归档attempt311/309、fresh7582951/cache968192/output299738、2未知与实际USD/开发AI/真人未知，净收益未建立；后续首位属修后版本，不能混作同revision效果。

OWUI D-O在`d50388db`24/24已知、1声明调用/1operation/5questions、42raw/native工具，source173有效、完整skill/input及reference/target0保持。自然终答仍partial，formal未闭合。当前1单元是无关AuditLogger.write；source_symbol已找到真实process_file，但raw没有select/workSelections。公开接口允许按同工作项重新选discovered候选，模型的defer及两次exit0解释不构成替换（后两次实际controlDiagnostics为focus-schema/focus-stage）。三独立核验后主纠正“same-name”、双block和4次check误述，实际5次check含3budget拒绝；未证明新宿主缺陷，不扩大语法、不付费重抽。正确prose与错误graph分别记录。

Download N/M-O同`d50388db`分别11/11、16/16已知、61/44显式工具（M另18自动source动作）、source95有效、完整Cloudflare原/安装bundle与原输入保持，reference/target0。N终答root授权、版本族/空参数/软删除及原件/归档选择充分，独立source/raw核验与主源码点验评natural full、formal按N不适用；M-O有正确root链和owner/grant条件表，但缺GET model permission、空version与具体文件打开的充分说明，自然partial。M的0accepted units不能形成source-bound graph；第二次check valid仅证明transport/reference/rule一致，current sourceBound:false/taskResolution:partial。旧研究分类误归共享checker；针对实际无单位/末检查与current精确一致的anonymous red转绿，只允许明确生产path/policy草稿拒绝，独立code审查的伪空数组反例亦先红后修。57相关pass/284断言、原report零调用SHA证明只放行最后D-O，不提升quality/check，不重抽M。24归档原件362/360、fresh9263844/cache1495552/output331088，2未知及USD/开发AI/真人未知，尚未建立新核心/表达净收益。

最后 Download D-O 在 `c7f201ba` 为24/24已知、1模型声明/1操作/4问题、51显式raw/native工具和5个自动source动作（预算56），source95有效、完整原/安装skill与input保持，reference/target0。当前3单位为download入口和两个同范围、不同receiver/work item的helper，不能据同范围推断共享binder缺陷；callee仍未连，typed literal及revisit拒绝继续阻断。实际4次observe格式拒绝、两次check正常返回valid:false；独立raw探子关于没有失败/自动补读/共享的判断由主原件纠正。终答有root owner/Guardian授权、版本族及实际source/archive文件依据，但遗漏DRF/GET前置认证权限、直接version pk与空version分支，并将形式未闭合扩大成已可得helper源码缺失；自然partial、formal未checked/bounded。原件、压缩/解压SHA和独立source/raw裁定在 [Download D评阅](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/evaluations/quality-paperless-download-D-O-attempt-1.json)，不重抽末位。

**AU21最终结论（2026-10-06）。** [summary](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/summary.json)为`completed-with-unmet-criteria`，finiteQueueComplete为true、researchGoalAchieved为false。工程实现、真实采用、独立源码质量和比较收益分别验收：操作声明/事实、结构候选、有限值与权限摘要、补读/关系修复、材料恢复、双入口及作者原字节消费接线已验证，完整任务质量与净收益未建立。当前证据由独立AI评阅及主AI源码裁定构成，没有测得真人评审时间或开发/探子用量。

| 登记类别 | 首位置 | 实跑首位 / 零调用封存 | 归档尝试 | 实际交付与边界 |
|---|---:|---:|---:|---|
| 纵向调试 | 2 | 2 / 0 | 13 | Share十轮/Gitea三轮；源码链未完整交付，Share第十轮未知 |
| 完整原skill native原/变 | 4 | 2 / 2 | 2 | Gitea两稿partial，Share封存，形式闭合0 |
| 原/变作者 | 4 | 2 / 2 | 3 | Gitea两份最终稿忠实合格，原政策只修订一次；不证明下游收益 |
| 原字节消费者 | 4 | 1 / 3 | 1 | Gitea原位未知无终答，其余封存；原稿字节保持 |
| 政策/前提/源码变化配对 | 6 | 0 / 6 | 0 | 零调用封存准入，不算实跑fresh/previous或复用收益 |
| N/M-O/D-O质量 | 12 | 6 / 6 | 6 | 一自然full、五partial；N formal不适用，域臂checked/bounded0 |
| 合计 | 32 | 13 / 19 | 25 | 12次修订另计，所有实际尝试均有报告SHA绑定评阅 |

**真实采用与机制边界。** OWUI D的1operation/5questions、Download D的1operation/4questions已机械共享来源工作；Download M另18自动source动作、D另5个，补读机制确有执行。OWUI D只接受无关audit入口，Download D虽接受同操作单位仍未闭合决定性root/helper，实际采用不等于充分源码解释。AU16最多四个位置不是调用配额：Share/Gitea分别在原request16/22未知后保持所有16/10种登记表示封存，另两任务没有计划所需两个不同结构的可信完整链，故机制比较不适用、provider0；[适用性记录](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/mechanism-applicability.json)保留未适用理由及已发生的机械采用。实际容器、receiver、批量、来源值和定向诊断修复只证明各自工程障碍变化，不提升为整体方法收益。

| 质量首位 | 执行Git版本 | 派发/响应 | 自然源码质量 | 形式 | 已知完整prompt | output |
|---|---|---:|---|---|---:|---:|
| OWUI N | `5ac2d651` | 7/7 | partial | not-applicable | 200,268 | 5,605 |
| OWUI M-O | `5ac2d651` | 24/24 | partial | 未checked/bounded | 1,400,918 | 26,797 |
| OWUI D-O | `d50388db` | 24/24 | partial | 未checked/bounded | 1,199,143 | 17,060 |
| Download N | `d50388db` | 11/11 | full | not-applicable | 420,504 | 6,217 |
| Download M-O | `d50388db` | 16/16 | partial | 未checked/bounded | 588,606 | 8,073 |
| Download D-O | `c7f201ba` | 24/24 | partial | 未checked/bounded | 1,230,743 | 18,482 |

四原任务的其余六质量首位置封存，保留在十二位置分母。同模型/源码/完整skill/预算/版本首答才可比较；OWUI与Download的N/M配对各在同版本，D均经局部分类修复后执行，不能混为三臂同版本总体效果。Download N/M的单次实际配对中，N充分且调用/prompt少于M；这只描述该配对，不证明普遍优劣。声明和准备成本留在原会话，author首答及唯一修订另计；完整skill安装与实际companion读取分别记录，不能以reference读取0称职责都已履行。

**计量与验证。** [accounting](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/accounting.json)和call-index从25原件重新计算，386派发/384响应：首稿211/210、具名修订175/174；两个请求完成与usage仍未知。已知fresh10,326,651/cacheRead1,663,488/cacheWrite0，完整prompt11,990,139、output349,570，prompt加output12,339,709；cache不重复加总。实际USD、开发模型/独立AI用量和真人时间未知，目标执行0。封存准入必须匹配登记task/status、providerCalls0和同任务cause report SHA；无缺件/活动且有显式结束声明才标有限执行完成，未知原请求继续强制研究未达。根级program计数与早期review schema内存投影消除汇总遗漏，原报告/评阅不重写。

三个计量反例先红后绿，6定向pass/34断言，独立代码核验未发现具体缺陷。最终联合844pass/1平台skip/5472断言/105文件，主/AU类型通过；[零provider回放](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/au18-final-replay.json)验证32位置及87个claim/report/review/archive原件前后SHA一致。平台skip保留不支持平台下拒绝且不写入的边界。使用说明和既有reusable skill同步显式入口选择、valid与source闭合差别，并用未封存Download输入做离线check，provider0。保护输入、Q1/readiness及历史证据保持。

**未达责任与已尝试修订。** Share决定性serializer/object/permission链经十轮接口、来源和关系修订仍未完整交付，原未知request16封存；Gitea经三轮structured、原/变native、作者唯一字段修订和原消费者仍无充分创建/权限链，原未知request22封存。OWUI外层caller、认证与truthiness/content分支未完整交付，D没有实际选择已找到的正确入口；Download N充分，M无accepted来源、D root/callee未闭合且遗漏已可见前置权限与版本分支。未证明新的共享binder或日志故障，不追加原样重抽、别名身份、消融或另一个任务；作者忠实性、机械减负和有限队列结束均不能替代研究验收。

### 7.54 AU 收束后复核：入口、来源连接和身份稳定性

2026-10-06，复核 `7f5bab6c`。登记、原件和质量分母与§7.53一致；重新读取 Download N/D 与 OWUI D 的自然终答，并点验运行核心。77项针对性测试、509断言通过，未重复844项历史联合验证。三项零模型探针发现以下共享机制缺口，证据见[复核结果](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/post-au-review-20261006.json)和[可重复探针](../../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/verification/post-au-review-20261006.ts)。本次没有修改生产实现、调用模型或改写旧报告。

| 问题 | 复核所得 | 下一步代码责任 |
|---|---|---|
| 无关词语成为操作入口 | `inquiry-tools.ts` 的 symbolHints按词匹配函数名；`inquiry-worklist.ts`在entryHint无候选时转用整段任务，并自动选择唯一候选。真实`/process/file`提示候选为0，任务中的`write`却恰好命中AuditLogger.write，原报告selectedBy为unique-index-candidate。当前结构索引只建DRF register/Go route关系，没有Python decorator route模型 | 按显式route/限定符号和源码连接生成入口候选；普通动词命中只能是待确认线索。补Python装饰器路由及相关性反例。已有select工具仍应保留，但不能将自动错选完全归于模型未纠正 |
| 已有helper因位置格式连接失败 | Download原解释的pathHint为`src/documents/views.py:1429-1448`，`operationCallSources`只比较文件/目录路径，匹配数为0。只在内存副本将其改成纯文件路径，匹配变为1，entry立即绑定到已接受的DocumentViewSet receiver helper | 将文件、范围和候选ID做成统一来源选择器；接收时明确校验或无损解析有行号的位置，错误格式返回对应诊断，不能沉默地变成缺失源码。仍须检查实参、控制分支及实际授权对象 |
| 源码身份混入运行选项 | `createInquiryTools`把整个options传给buildStructureIndex，后者把identity对象整体加入符号/调用ID。匿名同源码、repo/ref探针只变maxToolCalls或sourceRoot，symbol ID和index revision均改变 | 来源身份显式选取repo/ref、相对路径、源码内容与语法位置；运行预算/绝对目录另存。增加同源码搬移、预算变化、真实源码修改三类回归；旧ID的恢复须按确切来源核验，不能盲认旧缓存 |

第二项探针为适配本次索引，仅按文件、SHA和精确范围在内存中重绑定三个单元的source ID；没有改它们的含义、实参或旧原件。恢复一个callee连接尚未完成整个Download分析；原草稿仍有参数、条件和返回分支缺口。第三项验证了身份不稳定这一机制，实际复用损失还需通过生产恢复入口测量。旧评阅“未证明新的共享binder缺陷”保留为当时的结论；上述定位格式问题补充了此前漏掉的直接原因。

**任务负担仍需调整。** focused入口已经由宿主管理item/handle等身份，不能再说所有机械ID都由模型填写。但模型仍需写blocks/choose、typed bind/alias、call arguments、return/effect及多阶段修订，见`inquiry-focus.ts`执行指南与`semantic-flow.ts`。现阶段运行更像要求模型边审源码、边编写一份低层解释程序。下一版应继续复用现有核心，将源码可直接确定的调用名称、实参位置、来源选择器及有限条件骨架交给解析器；模型集中标注主体、资源、授权作用及难以静态解释的局部条件。只从实际源码生成骨架，评价答案仍隔离。超出支持范围时保留具体局部解释缺口，避免重新扩成通用IR。

**交付与流程也有两个问题。** Download D终答把未通过内部callee检查写成来源缺失，还把未给独立policy列入behavior分析的不完整原因；同源N答案已说明前置权限、root与版本对象、空version和文件选择。后续需要分别输出“源码未读/不可得”“内部映射尚未建立”“用户前提未知”“独立政策未提供”，保存已经有据的自然说明。两次只读模型请求超时又经旧assertNoUnknownTask扩散到同一逻辑任务的全部变体，导致19个首位零调用封存。AU当时遵守了任务书，但该规则过宽；下一轮应重新定义请求生命周期和有界恢复，仅把有副作用或仍由活动执行器处理的请求作为整任务暂停依据。旧未知请求、费用、失败分母及本轮封存原件保持，未来重试要明记，不能挑成功结果替换失败。

**建议的后续顺序。** 先将三项复现转为生产失败测试并修共享实现，再做来源事实到领域结论的接口减负及精确缺口反馈。用Download作为已有充分自然答案的开发对照，随后检验OWUI的入口与跨对象分支；在两条真实链实际交付后再扩展原skill作者/变化消费与配对面板。同一源码、模型、预算下分别记录自然答案质量、机器检查和开销。该建议尚未派发开发，也未解封或重跑旧任务；无需先再开一轮宽泛调研。

### 7.55 AV 源码辅助解释与局部恢复开发决定

2026-10-06，用户要求书写下一轮任务书并派发 GPT‑6.1 Sol / max / Flash，随后授权执行全部适用工作。[AV0–AV20](../superpowers/plans/2026-10-06-authorization-source-assisted-closure.md)当前in-progress。开发模型/推理强度已指定，Flash状态尚未核实；实验为xty/gpt-5.6-sol。本节统一记录设计、开发问题与实测，不另建研究正文。

**承接的具体责任。** §7.54 的三项缺陷进入首批失败测试：运行选项污染结构身份、文件行号位置与 helper 连接不一致、普通词 singleton 误作入口。进一步点验发现 scheduler 已有一部分行号归一化，operation links 却未复用；本轮要统一这项机械责任。现有 AST 索引已经保存调用表达式、参数文本、receiver 和候选，但没有有限分支骨架。已有 focus 管理身份，下一步减负主要针对模型反复生成调用/分支结构，而非另做一套身份包装。

**方法调整。** 同一领域核心中由解析器提供当前源码骨架，模型补领域角色、谓词和对象关系，宿主降低与检查。这个分工让领域知识进入调度和结论计算，同时减少模型兼任低层程序作者的工作。结构关系保持来源可查；动态控制、未知别名或未解释条件给出具体局部缺口。先做 Download、OWUI 两条真实纵向链，再做完整原 skill 编写、消费和变化，不先耗满大面板。

**恢复规则调整。** 当前 telemetry 用 Promise.race 实现超时并留 lateSettlement，超时后没有取消 delegate；普通 agent-loop 的 deadline 位于循环边界。AV 必须在两入口验证晚答不会执行工具或覆盖当前状态，能取消就传取消信号。之后允许只读请求在原预算内有限恢复，原 unknown/费用继续留账；不再把一次远端完成未知自动扩大为未来同 task 的永久封存。旧 AU 原请求、封存和分母保持，新执行明确使用版本化政策。仅修改研究 guard、不证明执行隔离不能算完成。

**评价和使用。** source-gap、interpretation-gap、premise-unknown、policy-unspecified 分开，保留有据的自然说明；behavior 缺独立 policy 不增加无关失败义务。完整原任务质量、机器检查、作者稿忠实性、原字节消费、变化复用和成本各自给结论。26个初始工作位置用于留全首答/失败/依赖处置，实际比较在稳定同版本块进行；每个可定位缺陷当场修共享实现并复验，不让后续调用继续承受已知故障。工程采用与研究增益尚待本轮实际证据。

**AV0–AV1工程记录。** 接管HEAD`531bc80d`、干净工作区；两名只读AI探子点验Download N/D、OWUI D及Gitea native/作者/消费者，14个旧原件SHA在AV评价侧留存，三个原自然输入原字节进入新model目录，未派发模型。身份/遍历顺序、真实目录副本和预算变化、旧ID唯一重绑定四项新行为测试先失败，再由显式repo/ref身份及确定排序修复；32项相关测试、170断言通过。旧ID重绑定只在所有索引文件字节、解析器/关系版本不变且精确path/SHA/范围唯一时成立，receiver必须可核验，框架依赖不盲补；旧报告不改。工程稳定性不代表真实语义或复用收益。

**AV2来源连接。** 合法range连接、精确非法定位诊断和单行旧定位三项行为反例先失败，共用`source-selector.ts`后58项相关测试/267断言通过。scheduler保留旧range/out-of-scope代码兼容，同时保存归一化selector；operation links和focus共用同一范围合同，来源错误进入当前解释诊断而非文件不存在。Download三单元只在内存按原SHA/范围重绑定，原带行号pathHint现在得到一个真实callee绑定；另一个语义诊断仍保留，未重写参数/条件或宣称整题full。证据在[AV阶段验证](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av1-av2.json)。

**AV3–AV4工程与边界。** 五个入口/路由反例及跨根alias挂载反例先失败；49项结构/worklist/reuse/runtime回归通过，主类型通过。旧入口重选撤销机制继续成立；原OWUI自然请求由源码路由选择process_file，[零模型定位](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av3-owui-route-mounts.json)仅证明实际入口进入工作队列。骨架生产接口的提前返回、未读、Go嵌套、短路/elif反例先失败，16项骨架/工具测试132断言通过。匿名Python/Go原文锚点及边见[骨架原件](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av4-anonymous-skeletons.json)。循环/异常/动态调用保持有位置的gap；有调用的短路不能无条件展开。下一步窄解释接口以revision、角色/谓词和显式对象关系进入旧降低器，真实效果尚未测。

**AV5窄解释与机械降低。** 实际source-interpretation/v1引用完整当前原文锚点和revision，六种角色加有限predicate/对象引用，不要求模型手写blocks/参数表。三个基础反例先失败；关键字顺序/空字面值、默认值和fallback计数再由实际反例补齐。局部缺谓词修复只提交一个annotation，其他调用不重交；交换guard/effect对象由原检查器检出。84项有关回归/419断言通过，主类型通过；允许/拒绝/未知/操作失败与等价旧图保持有限求值一致。动态默认值、unsupported控制和用户条件未知继续保留，不由explanation猜语义。目前provider和目标执行均0，真实采用仍待AV10起检验。

**AV6–AV7调度、上下文与同源缺口。** 三项新调度反例先失败：真实FastAPI依赖alias未补读、直接DRF方法漏框架前置、普通调用抢在条件调用前；修复进入同一worklist，读完待解释不重读。registration可生成有界context骨架，嵌套调用与局部定义的额外反例消除了结果别名/字段范围错误；关系版本升v3，旧材料按版本拒绝而非盲复用。模型prompt只保留一份原任务/政策和当前阶段说明，原文窗口保持完整，历史仍留trace。五类交付反例先失败，第六例核对未读范围，现四类gap与原始义务/当前revision对应；拒绝的新提案撤销旧终答/check，原文有效的独立说明保留为unreviewed。行为缺policy无额外失败；显式新选项允许conformance源行为继续，比较仍undetermined。327项有关回归/1610断言及主类型通过，provider/目标执行0。公开双入口、实际prompt消耗和真实采用等待AV9–AV10；这里不宣称完整源码质量。

**AV5–AV7独立核验。** 两名只读AI探子分别检查源码降低与当前交付。未唯一绑定callee的空形参映射被提出为潜在问题；主代理匿名未知/双候选反例确认实际实参仍在骨架，旧语义降低器建立decisive dependency并在`semantic-callee-uninterpreted`终止，不接受后续allow。未伪造形参映射或改业务逻辑；裁定和出处见[复核原件](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/evaluations/av5-av7-independent-review.json)。17项聚焦测试/80断言通过。交付状态复核未发现合同违例；这仅是工程核验，未进行真人评阅或provider调用，继续AV8。

**AV8请求生命周期。** 显式只读恢复政策`authorization-readonly-recovery/v1`在同一telemetry保留原timeout/unknown，本地消费者与远端状态分账；同请求一次、位置两次恢复共享派发预算。普通agent-loop的显式隔离阻止晚tool_calls/callback/continuation进入状态；fetch与Node helper传signal、取消后停止重试。独立AI复核发现晚error覆盖原timeout和关闭后的worklist读改变报告，两项匿名反例先失败再修复：晚error单列，关闭时冻结已知domain交付。113项联合测试/619断言通过，主类型通过；[复核与裁定](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/evaluations/av8-independent-review.json)及[验证/旧风险映射](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av8.json)保留责任。旧AU/AT/AS guard、原件与unknown未改；新Gitea development只在实际只读/空闲核验成立时准入，作者写文件不自动获得恢复资格，Notes/Memos仍不适用。provider/目标执行仍0，继续AV9公共接线；工程隔离不代表真实授权质量。

**AV9双入口与有限登记。** 显式operation-evidence-v2接到原inquiry和native M/D1；匿名实际定位/原文读取/来源annotation/当前check/自然交付通过，完整声明不重复作者调用。缺conformance政策继续行为并保留独立比较未知；远端unknown与已关闭本地材料分账，最终snapshot失效撤回当前交付。只读AI复核未发现公共合同缺陷；runner复核发现attempt/raw路径及作者报告绑定缺口，两项失败测试确认后修复，并补实际native首请求/source index/安装bundle证据核对。139项联合测试/1029断言、主/AV严格类型通过。薄runner登记26位置、5份ready原/变输入、3份待AV14基线输入；check/replay provider与目标执行0，300秒请求/7500秒实际session一致，不以默认20分钟截断。完整原skill及companions已绑定SHA，消费仍待实际调用。作者用现有loop与只读来源工具，仅两个根文件可写，消费者须原稿忠实性/原字节绑定通过；不新增求值或恢复循环。[AV9验证](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/verification/av9.json)和[独立复核裁定](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/evaluations/av9-independent-review.json)保留原件。真实采用、完整质量与净收益尚未建立，继续AV10。

**AV10派发前脚本修正。** Download首次登记因runner误用缓存变量而未载入route，production报告provider-unavailable且0派发；归档又误读不存在的run.json。两项失败测试后，改为production SKVM_CACHE并失效配置缓存、按已证零调用报告归档。8项/66断言和AV类型通过，配置provider可创建但未调用。保留首次原件及699555d2实现身份；以runtime-config具名修订继续，不把这项工程失败计作源码质量或unknown completion。验证在results的verification/av10-pre-dispatch.json。

**AV10首次真实使用和局部接口修正。** runtime-config为18响应/18派发，4次来源解释、2个来源单元、0图fallback；无check/终答，额外根字段complete/unit触发transport失败。usage完整、USD全未知；模型源码累计展示247868字节（重发223127）。独立AI复核及主源码点验确认路由边界应保留原字段后由当前事务严格诊断，三项新反例失败后修复，两个公共入口同focus修订通过。复核的错误文件位置和读工具/图fallback混淆已纠正；来源终态校验/全程读取两种计数的裁定修订在evaluations/av10-runtime-config.json保留并澄清。新增提示仅澄清ID和角色合同，无正确helper或答案。

**AV11 Go机械兼容核验。** 只读探子发现multiline链式Post未成route，主复验又发现if initializer调用被skeleton静默遗漏。两个匿名前置执行/嵌套分支反例先失败，修正仅verb空白和实际initializer顺序；真实CreateIssue的POST路由、middleware与NewIssue实参/结果进入机械结构，141 anchors，loop/short-circuit等六个gap保持。零provider/目标执行probe在verification/av11-go-probe.json。联合100项/642断言通过；真实授权语义和原/变完整skill仍待执行。

**AV10局部修订实际结果与终答诊断。** local-envelope派发21/响应20，原首次超时1次、显式只读恢复1次；原unknown留账。14个source提案、11次局修、2个接受单元，图fallback0、check0。草稿两份均partial，仍遗漏已可见的框架前置、根对象检查与文件选择关系；严格终答未接受，不能以trace补答。根终答内的路径conditional非法却误报外层result缺失，使一次wire修订无效。行为反例先失败，改为无损包装后严格nested诊断；53项/420断言、主类型通过。两名独立只读AI与主源码裁定见evaluations/av10-local-envelope.json，非真人评阅。完整prompt/费用有1项usage未知、21项USD未知；下一具名final-diagnostics复验同输入/预算，源语义重复局修尚未解决，工程修复不代表质量达标。

**AV10接受交付与AV11前局部机械修复。** final-diagnostics实际22/22、15提案/11局修/2单元、2次check；nested诊断实际促成一次字段修订并接受终答，原check仍ruleConsistency=false/partial。独立AI评阅的checked/bounded及完整version默认分支判断由主原件/源码纠正；root/file关系说明正确，owner/grant条件遗漏，available configuration和deployment仍混合，整体partial。原始空annotation修订仍触发重复名，主匿名反例和真实旧标注重放确认是宿主赋值身份缺陷。bind步骤身份与bindingName分开，分支变量及重赋值当前值保持；同时补基础有限谓词合同，不改非法算子。三项反例先失败，42项/212断言和58项/407断言、主类型通过；真实serve_file零调用重放消除三个重复名，原异常等gap保持。OWUI零调用探针的153/263 anchors说明实际输入/目标调用被定位，外层try仍gap；下一原OWUI实跑，不将这些工程结果视为充分语义。

**AV11真实采用与来源gap责任。** OWUI首跑21/21、18来源提案/15局修却0接受单元；正确route及输入/输出对象区别进入终答，owner/admin和默认目的地仍不充分。flow要求对opaque异常/循环内不执行的子调用错误地强制角色；匿名反例先失败后，按当前生成flow收窄机械必填，opaque原件与gap保持。71项/488断言与独立核验通过，同题flow-requirements真实22派发/21响应、1恢复及1usage未知，接受1单元/13步骤，rule仍false/终答partial。独立核验把“来源能回答”误作“终答complete”，主代理保留原判并纠正；实际终答称Files查询方法不可得，而注册源码中存在。两名只读探子与主点验定位`Files = FilesTable()`模块值没有进入跨文件receiver查找，不能把宿主未定位称源码缺失。

**AV11模块来源身份。** v4仅对唯一无重赋值的模块直接constructor，经实际import、唯一class与既有C3形成方法候选；参数/局部import或class/loop shadow、global写、条件/重复赋值、动态factory及来源歧义保持gap。声明文件SHA与class SHA进入依赖；匿名正反例先红绿，52项/185断言、独立24项/66断言和主/AV类型通过（集合重叠不相加）。173文件零probe定位实际Files两查询方法，未判业务意义。旧Download两份v3材料均正确失效，原件与原恢复证明保留；当前原任务具名基线及新输入准备成本全部进入后续变化分账。module-instances真实3/3尚未解释来源便因两次工具动作结构不符终止；现有单次结构修订并非宿主默改语义。独立核验确认发布合同与诊断一致，绑定实际采用尚未发生，同版本具名wire修订保留，不加新容器容错。

**AV14普通入口与版本化变化。** 可选entryHint注入own undefined破坏JSON保留声明/program严格相等；v1/v2反例先失败再保持省略，没有绕过归档身份。source values共用既有有限用户原文校验，跨题borrow被反例阻止，原全局brief则由host标记保留；行为→conformance只在材料层随独立policy允许，旧答案/check/政策映射全重算。73项/547断言及真实普通init/compare证明旧v3两材料可恢复，grade仍unreviewed。三个原v3变化输入完整原问题/范围保持，仅独立policy+mode、requested-document ownership前提，或95文件副本一guard实参root_doc→request_doc；原件不改。v4依赖变化后全部旧材料失效，所以六个未派发位置将从当前版本实际完整声明重新登记，严禁手改旧依赖制造收益。

**AV9并发与AV19普通示例。** 真实跨进程JSON EOF及延迟调用总数降低反例后，runner以owner锁串行读合并、同目录临时原子替换、providerCalls取max；10项/107断言及独立复跑通过。30秒残留锁明确失败，不自动删除；成本仍按每attempt原件重放。既有reusable-skill增加完整声明导出及q1前提编辑，零provider检验完整原brief/operation/question保留，未伪造session或实际复用收益。当前共享联合872 pass/1平台skip/5647断言，另provider10项/24断言通过；主类型、AV严格类型、15文档单测/链接/目录通过。真实完整skill native、作者原字节消费、变化、同版本质量及最终分账继续执行；这些检查不建立完整质量或净收益。

**AV12/AV13原件与源码裁定（2026-10-07接续）。** 四份完整原skill作者稿结构有效且独立准入，source/ref/key/tool界限保持，消费者直接使用原字节。三个已结束native与Download原消费者各24/24，但全部仍partial；Gitea普通issues-reader可达基础creation的原write-policy mismatch有直接源码依据，下游NewIssueWithIndex与HIGH分类仍partial。Download changed在可见root_doc授权后选file_doc的条件下没有明确给出独立exact-object政策缺口，不能用部署未知遮蔽源码已确定关系。两份初始复核误用了仅AV14存在的request_doc副本，OWUI复核又混旧attempt计数；主代理以原views SHA、当前raw及完整final纠正，并保留原判与核验限度。六份评估的原始report/final/raw绑定、计数和unknown USD语义经独立复算通过；源码可读、形式检查和完整终答分别评分。

**AV14当前实际准备。** 当前v4完整原声明普通init后，policy/premise/source三输入每对共享同字节/来源/预算，主源码保持、developer副本仅views.py:1424 root_doc→request_doc。三组零compare都实际0恢复/1失效；接受的一个helper单元没有保留source/fact dependency footprint，原始operationFacts identities/facts/retired全空。原脚本“接受1即恢复1”的预期被实际失败纠正，不把缺失材料手补或解释成已证明的retirement，也不将previous换fresh。此基础不能证明材料收益，仍完成六实际对照。

**AV恢复端点与停止事实。** 原账户三个运行在额度403结束；更换key但旧地址三次401各0响应。用户指定新端点后native Gitea changed20/20在第三次相同空observe触发防循环，两个consumer各15/14末次额度403。用户补充余额后，Download23响应/24派发末次再额度403，Gitea changed23/24末次网关524、usage及上游完成缺证；Gitea original12/12自然空end_turn仍无报告。29份report/raw逐条重算为397派发/385响应，修正先前395/383的少计汇总；12usage缺报及全部实际USD未知，预扣/余额不是费用。已知fresh input 23,407,558、cache-read 1,753,216、完整prompt 25,160,774、output 334,163 tokens；缺报量不估造。两次只读恢复、一次晚结算和两个原timeout/pending保留，网关上游未知另列。后台模型身份未核实，跨端点不能隔离方法效果。全部失败/无交付原件保留，十四首位置归档与研究达标不等。

**AV9完成状态修订。** 泛型循环曾在20<24且有工具预算时将防循环break记completed，并把中间text当final；native归档又只检查end_turn，空文本被计partial-delivered。具名实际证据定位停止分支后，匿名反例先失败：保留三次阈值但设明确error且不提升中间text；native分类分别要求自然terminal和非空原始final，artifact-only作者合同不变，不增加生成调用或预算。focused23项/155断言、联合894 pass/1平台skip/5789断言、主/AV严格类型与独立只读审查通过。零调用原件重判把空消费者记native-empty-final、无terminal运行记native-terminal-absent；29份原final/raw/report与14份受保护证据保持。旧状态原件不重写、旧准备成本单列，没有付费修复后语义复验，完整质量与净收益尚未建立。

**用户暂缓与当前交付。** 用户明确先不急做实验，最新账户余额仅为其报告的0.7元；新接口`https://yes.hubniconico.com/v1`只存于忽略的本地配置，未调用，可用性及后台模型未核实。六变化/六质量共12位置保留未派发，`finiteQueueComplete:false`、`researchGoalAchieved:false`；当前收口确定性修复、已结束原件评估、分账和发布。当前两结构没有完整可比链，机制对照零调用记录原因，不为数量追加消融。[当前摘要](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/summary.json)与[分账](../../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/accounting.json)提供下一恢复入口；以后用户选择继续时，同条件比较和全部准备成本合同仍有效。

### 7.56 AW 控制语义、局部材料与账号运行开发决定

2026-10-07，AV 暂缓后只读复核进一步明确三个责任。第一，source-skeleton 将 try/with/loop 等实际控制保留为 opaque gap，子调用定位成功仍不能参与有限求值。第二，inquiry-domain-runtime 的 retainFacts 必须先有 accepted entry 才保存 helper，projectOperationUnits 又只取已存事实；最新 Download 接受 helper 后 identities/facts 仍为零，因此三种变化准备均零恢复。第三，最新 Download 和 OWUI 各22/22响应却各只接受一个单元，分别有8/5和18/12次解释提交/局修；重复上下文仍重。109项针对性测试/538断言与主类型检查通过，说明这些缺口仍需改变实现与验收目标，而非重复跑同一验证。

本轮采用[AW0–AW22](../superpowers/plans/2026-10-07-authorization-control-materials-and-account-runtime.md)：扩展任务必要的有限正常/异常/短路语义；把来源材料、操作连接、当前前提/政策/结论分开；局部修复保留进展；两入口共用核心。材料允许先保存，任务结论仍须真实连接与当前核查；不通过改旧 footprint、降低完整标准或按仓库写成功分支取得结果。该方案仍服务单 repo/ref 的源码可见授权任务，完整原 skill 的其他职责保留。

用户询问能否用当前 GPT 账号的5.6 Sol实验。只读检查确认本机codex-cli 0.159.0-alpha.12.1、ChatGPT登录及model/list含gpt-5.6-sol；推理调用0，账号模型实际访问待验证。现有SkVM无Codex adapter，LLMProvider的apiKey/baseUrl不能承接登录态；计划通过官方app-server动态工具桥接同一领域工具，单列Codex harness和真实可见计量。开发模型gpt-6.1-sol/max，被测模型拟gpt-5.6-sol/high。旧付费API仍暂停；用户已明确回复“允许使用当前账号做实验”，新线程完成官方通道验证后即可执行，无需再询问，不自动切付费接口。

官方资料：[认证](https://learn.chatgpt.com/docs/auth)、[App Server](https://learn.chatgpt.com/docs/app-server)、[模型说明](https://developers.openai.com/api/docs/models/gpt-5.6-sol)。本轮优先复用CLI自身认证，不开展额外OAuth产品建设。不同harness/端点实验分别归档，旧AV十二位置保持原暂停状态。当前仅制定任务书、方法合同和导航；AW工程、真实实验与收益均未预记完成。后续实际问题与修复继续追加本节。

**AW接管与有限核心首段（2026-10-07）。** 新开发线程从486b5969接管干净skill-ir-aot，确认Download/OWUI最新原件及空native三组SHA，不修改AV归档。新策略`operation-evidence-v3`显式打开`finite-control/v1`骨架与路径覆盖；旧v1/v2仍保留opaque合同。try区分正常body、typed handler、else和finally；return/raise暂存后先执行finally，finally新出口覆盖旧出口。Python短路保存0/false/空容器等原始有限值，Go真值仅允许boolean；至多8项显式列表执行break/continue/else，动态循环保留0次/首项/未知后续关系。with退出协议和未知调用异常仍为可定位未知，不假定抑制能力或调用一定成功。未知异常路径从调用前状态产生，不能继承“效果已完成”。这些均为有界源码表示，不执行目标语言。

**AW来源材料首段。** 新source-materials以repo/ref、精确来源、receiver、语义版本和依赖保存unreviewed模板，身份不含question/focus/handle/目录/预算；helper在无入口时保存但不产任务规则。投影从当前accepted entry沿精确sourceCallId/唯一receiver关系采用可达helper，未调用的同名材料不投影；入口撤回只清连接，材料仍可用。调用实参、返回对象与当前值按独立question实例化。坏字段局修保留其他schema有效标注，旧revision不能覆盖有效事务。匿名生产inquiry/native均已实际启用新策略；273项联合测试/1562断言通过，首段主类型通过，新增接线后的类型检查继续。当前未进行账号推理、真实链重放或变化收益实验，这些测试不作为模型成功证据。

**AW恢复、投影与控制反例。** v3恢复只保留匹配的当前材料和原证据，清旧rules/dependencies/policy/check/final；eligible、available、restored、used分列，policy-only/premise-only重算。窄候选依赖不再把不相关模块import算成全仓失效，实际module-instance声明文件和owner/MRO仍进入足迹。相同store的已retired身份继续封存；fresh核验建立新记录，不伪造旧依赖。精确sourceCallId仍不足以证明实参：新负例调换实参先失败，再按源码keyword/position/default与caller有限绑定校验；未支持的expanded/动态实参保持unlinked。真实`@staticmethod`先出现错误self绑定，红绿修复后不注入receiver参数。嵌套布尔表达式先出现重复RHS调用，按外层包含关系修复；较早未知handler必须先于后面的确定handler，后者附“此前不匹配”条件，避免跳过真实源码顺序。provenance在依赖增广时先丢为model，新回归修复后保留test-authored/revalidated-original。

**AW真实原件离线与准备成本。** 生产inquiry分别以v2/v3消费Download/OWUI原始22响应序列；旧原件SHA和答案不改，当前身份变化不修旧proposal，全部仍completed-with-diagnostics，不能作为当前模型成功。另按当前精确来源SHA/范围及AST锚点tuple重新核验旧局部解释，属于新材料准备：Download保留1份当前helper，入口未接受时used=0；2条记录含依赖退休版本，不能计为2份可用材料。TEST-AUTHORED真实download wrapper接try/typed exceptions后采用2份材料，在3个原问题产生6条entry/call使用关系，仍保留3条未解释callee缺口。OWUI扩展try/with区域使旧opaque标注暴露55项条件/角色/返回/失败种类及stale-anchor缺项，未创建新有效材料。当前fresh validation的原文读量/elapsed分别入[offline](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/evaluations/offline-summary.json)和[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/accounting.json)；未放进任何真实模型输入。Gitea原输入M/v3零调用check有效，346源码文件，目标执行0。

**AW进度与实际载荷反例。** inquiry/native共享unit/input/meaningful-state/diagnostics指纹；重复反馈从continue到一次repair，再指向独立义务/诚实交付，新输入重置，预算不扩。最终字节审查发现OWUI新控制使payload从v2的3,877,501增至v3的5,751,215；只看重复源码展示略降会误判减负。独立只读探子定位为连续轮次重复sourceSkeleton的共享path/SHA/candidate及derived edges。两个真实入口新增回归先红，随后v3模型视图合并共同来源、保留全锚点与nested flow，宿主/raw完整骨架不改。具名compact-source-metadata重放原22响应，Download 1,940,324→1,790,665（-7.7%），OWUI 5,751,215→4,697,627（-18.3%），前后source display与原3/4问题保持；OWUI仍高于v2。前后8份压缩raw都保留，当前重算状态/requests/bytes/mock零tokens一致。这仅是同v3确定性元数据减负，旧响应存在stale身份、当前完整语义未接受，不能转为模型token/自然质量或净收益结论。

**AW官方账号驱动与能力裁定。** CLI 0.159.0-alpha.12.1的公开generated schema和官方资料已点验，stdio初始化实际成功。新增明确codex-account adapter和inquiry --harness，共用native definitions/execute/材料核心，由CLI拥有agent loop，不套LLMProvider。JSON-RPC mock覆盖initialize/thread/turn/dynamic工具、累计usage去重、空final、child-exit、timeout interrupt与late工具不执行；工具/原文/check/natural链在匿名数据完成。当前公开工具清单不能证明仅暴露动态受限工具，故默认transport在thread/start/turn/start前返回public-cli-tool-inventory-unverified；不是实际模型失败。内部请求数不可见只保留unknown，不作为额外阻断理由。模型固定gpt-5.6-sol/high，无私有端点、凭据正文或付费fallback。D0不静默换D1；不能兑现的provider请求/token/请求超时/恢复flag拒绝，宿主tool/read/display/session限额保留。账号review发现自然文本凭据和native工具trace可能漏脱敏，生产报告持久化反例先红后修，已知token/口令/账号字段在归档副本过滤；通用秘密检测不声称，live材料不被改写，掩码破坏身份时恢复按原校验拒绝。收口时公共inquiry归档漏宿主声明的反例先红后修，根报告保留inquiry/program，behavior及无独立policy的conformance均可inspect/init原声明，不混入answer/domain，推理0。cost numeric兼容槽由usageAvailable:false遮蔽，实际USD/internal requests保持null。

**AW收束与未达。** 适用离线队列completed-with-unmet-criteria，finiteQueueComplete=true，researchGoalAchieved=false。24个逻辑真实首位置均登记undispatched-prerequisite-unmet（原native与质量D-S可共用一次原件，不能双计）；没有为消耗数量发推理，AV十二旧位置仍暂停。核心工程有界通过；真实完整链未建立；材料复用仅确定性工程；整任务收益未测；账号工具通道unavailable。独立只读账号/证据审查及主代理出处裁定后修复上述回归，最终937pass/1平台skip/5909断言、主和AW严格类型通过，8份本轮raw和11份旧原件SHA核验通过。开发gpt-6.1-sol/max、探子、真人时间、USD均缺测分别记unknown；本轮账号推理/第三方API/目标执行为0。恢复责任首先在codex-account-session的官方排他工具能力核实，其次按新实际提案完成OWUI55缺项和Downloadcallee，再进入真实debug、完整skill作者/消费、三变化和matched质量。原提案重放与test-authored接线不替这项模型工作。未新增每阶段Markdown，当前阅读集15份保持；结果见[AW summary](../../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json)。

### 7.57 AW 收束后复核：运行能力与按问题求值

2026-10-07复核用户交付。接管时HEAD与用户origin均为5a25d75911af67ef2809ec74efefa015c84325ae，工作区干净。本人阅读当前合同/研究/任务书，三名default只读探子分别检索账号、有限语义与证据；结论经原文点验和零调用反例核验。本轮没有改生产代码、发起模型推理或恢复第三方API。新鲜定向回归68/68、342断言通过，未重复937项历史全量。

**账号阻点的精确性质。** [createCodexStdioTransport](../../src/adapters/codex-account-session.ts)将隔离状态固定为unverified-public-cli，runCodexAccountSession只允许test-transport继续；生产路径在initialize之后、thread/start之前必然返回unavailable。当前原件证明初始化成功和本地保护分支生效，没有证明官方账号推理失败或工具配置完全不可行。官方[App Server](https://learn.chatgpt.com/docs/app-server)提供dynamicTools与工具回调；[配置说明](https://learn.chatgpt.com/docs/config-file/config-reference)提供shell、apps、multi-agent、web search控制和命名文件权限。已存本机ThreadStartParams也含config、permissions、runtimeWorkspaceRoots，ThreadStartResponse含instructionSources、activePermissionProfile。现有生产请求尚未应用这些配置。它们是否覆盖本机所有额外能力仍需版本核验，不能简单把test-transport标志设真。下一轮应把“必须有动态工具排他证明”调整为“可执行的受控能力合同”：确立来源/评价隔离、目标不执行、额外工具禁用或有界同条件计量，再做匿名真实工具会话。该调整为本次研究建议，尚未实施；原AW结果保持。用户账号实验授权持续有效。

**已复现的结构性瓶颈。** [source-interpretation](../../src/task-dsl/authorization/source-interpretation.ts)要求generated flow中每个调用有role或unresolved，所有v3 context/effect调用再自动带mayRaise:true。[semantic-flow](../../src/task-dsl/authorization/semantic-flow.ts)逐项分叉未知异常，终态路径上限16；超限会撤销该question已生成rules/dependencies并只留semantic-path-limit。用零模型内存反例串联15个context调用加正常return，产生15条异常unknown和1条allow；改成16个调用就只有semantic-path-limit终态。这证明新增语法覆盖仍可能在求值规模上失效；尚无AW真实模型轨迹，不能把此反例当成已发生的模型失败。建议保留原任务全部问题，按每项授权性质筛选相关依赖、使用有来源的局部摘要、合并等价失败状态，在未知会影响资源/guard/effect时才继续展开。未知不能默认为安全，单纯增大路径上限也不能解决展开增长。

**已排除和待区分的疑点。** 探子提出try body raise、空handlers和正常finally可能吞异常。主代理点验发现structuredClone保留pending，内存复现输出authorization reject、仅cleanup effect、后续effect未执行、diagnostics为空，故排除该误报。账号callId缺失风险属于异常协议输入；本机generated DynamicToolCallParams明确callId必填，不将其当成已证实的真实失败。TokenUsageBreakdown也明确cacheWriteInputTokens字段，不能凭其它版本推断当前计量必然丢失。

**证据口径细化。** OWUI当前重新核验共56条诊断：41 role-required、8 condition-required、2 return-outcome-required、4 failure-kind-required、1 anchor-unshown；其中55条是必需语义注解缺项。另有两条context-exit及一条dynamic-call结构缺口。Download helper-only为1份当前可用材料、0使用；test-authored wrapper使2份材料在3个问题形成6条使用关系；三条callee缺项是各问题的记录，不能据此推出三个独立helper。24为逻辑位置，manifest允许一次原件共享后uniqueInitialPositionsIfShared=23，实际派发0。同v3元数据修订减负7.7%/18.3%属实；OWUI最终4,697,627字节仍较v2的3,877,501高21.15%，因此后续应同时记录绝对上下文、标注数和原任务答案。

**相关研究与本项目落点。** [RepoAudit §3.2–3.3](https://arxiv.org/html/2501.18160v3)按目标值和函数探索/保存路径事实，仅在相关值跨函数边界时继续，并校验控制顺序和路径条件；其评测对象主要是内存错误，授权方法需另验。[CodeQL Python data flow](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-python/)通过source/sink/barrier和自定义传播组织查询。这些方法支持“围绕所问性质组织局部关系”的设计选择；不是本项目已经取得收益的证据。SkVM可继续研究主体、资源身份、guard、实际effect及独立policy之间的可执行检查，并复用AW来源材料/变化失效，不再把完整函数的每个调用都当同等重要标注任务。

建议下一轮依次：核实并接通账号受控工具会话；修按问题依赖与异常状态合并的确定性反例；用完整Download原任务及一次policy/premise/source变化取得真实闭环；再检验OWUI复杂结构；最后同账号/模型/输入比较原skill、自然前端加核心、DSL加核心。每个坏表现当场定位共享原因并做具名修订，保留首件。当前只记录复核及建议，没有新任务书派发或新增效果结论。


### 7.58 AX 按授权问题求值与账号真实执行开发决定

2026-10-07，用户要求撰写下一步任务书并派发gpt-6.1-sol/max开发，同时再次询问能否使用当前GPT账号的5.6 Sol实验。此前明确账号授权继续有效，本轮采用官方CLI自管登录的gpt-5.6-sol/high，不重新索取许可、不恢复第三方API。[AX0–AX20](../superpowers/plans/2026-10-07-authorization-property-analysis-and-account-execution.md)以复核提交ccf00985为依据；AX正在开发，账号匿名工具链已有真实成功，完整任务和效果结论尚待验证。

**为什么调整方法。** AW扩展语法后，整函数每个call的语义标注和每个潜在异常的路径枚举成为新负担。§7.57已在真实代码上复现16个context调用触发整题上限。下一步将需求绑定原任务每个授权问题，围绕主体、资源、guard、effect及控制/数据关系选择必要解释，使用参数化来源摘要和保守异常合流。原源码和全部原问题保持；模型提出的相关性不冒充宿主证明，未知副作用或对象变化仍保留影响。这是在当前领域语义和工具上深化，不再建设统一IR。

**账号合同修订。** 官方App Server有动态工具、thread配置与权限字段；本机是否兑现需要实际核验。AX不再把缺少抽象“仅动态工具”的清单证明当永久前提，而是检查模型材料/来源范围、额外工具、指令来源和目标不执行等具体能力。真实生产transport须验证生效配置并完成匿名lookup工具会话，不能把test标志置真。账号能力不足时记录实际原因，继续独立工程；固定上下文试答只用于接入定位，不替代native动态链。依据为[官方App Server](https://learn.chatgpt.com/docs/app-server)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)及本机schema。

**研究借鉴与验证。** [RepoAudit](https://arxiv.org/html/2501.18160v3)的需求驱动函数探索与摘要、[CodeQL Python数据流](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-python/)的source/sink/barrier组织方式，为局部依赖提供实现参考。SkVM需自行检验授权对象身份、政策与行为分离，以及例外条件下结论充分性。先写16/64 context、资源替换、异常前后effect和finally顺序反例，再在Download/OWUI真实任务上验证；不把外部项目结果当本项目增益。

**执行与失败处理。** 20个首位置覆盖账号smoke、两完整skill native、Download inquiry、三变化fresh/previous、两作者/消费者和N/M-S/D-S对照。共享schema/连接/求值缺陷一旦出现，立即暂停受影响后续派发，写红测并修共享代码，首件与具名修订分开。oracle、旧正确图和开发者修补答案不进入执行模型。复杂任务尚未闭合时，独立作者/材料复用可继续，任务级收益仍依据当前完整原/变答案。六项交付状态分别记录工程、账号运行、native交付、作者消费、质量和复用。AX实际问题与解决过程继续追加本节。

**AX0–AX2实际接通。** 本机CLI及generated v2 schema为0.159.0-alpha.12.1；model/list提供gpt-5.6-sol/high。生产transport先枚举元数据中的MCP/skills名称，再以逐项关闭配置重启，检查有效config和thread权限/roots/instructionSources后才turn/start。空表不会移除继承配置，project_doc_max_bytes=0也没有阻止当前全局AGENTS加载；因此保留真实来源，以开发者已完整读过的当前通用用户政策path/SHA约束，各臂一致。宿主读取由已有source scope及预算执行，session cwd在仓库外空目录；evaluator/旧答案未提供。新增严格工具参数、重复身份/晚答、外来turn用量和额外配置拒绝回归。

首件`account-anonymous-tool-smoke/original`返回“code-mode host is disabled”，0宿主回调；不能记成源码失败或账号不可推理。官方[工具模式源码](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/mod.rs)表明远端model tool_mode可优先于本地开关；[受限globals](https://github.com/openai/codex/blob/main/codex-rs/code-mode-runtime/src/runtime/globals.rs)及[拒绝模块导入的resolver](https://github.com/openai/codex/blob/main/codex-rs/code-mode-runtime/src/runtime/module_loader.rs)支持约束Code Mode而非将其当Node执行器。主代理修复生产配置并恢复DynamicToolSpec的type:function，唯一具名`bounded-code-mode`修订完成一次真实宿主lookup及精确消费。首件可见input/output/cacheRead为26649/549/20352；修订为10361/105/4992，cacheRead是input内的明细，不能相加为总prompt。内部请求数和USD均null，CLI重试也未被伪记为已知请求。当前验证只证明账号工具链；性质四个红测仍失败，完整原skill/变化/作者/对照尚未派发。结果身份：[AX原件](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/manifest.json)。官方源码为当时main的实现依据，安装版本兑现以有效元数据及当前真实回调为证。

独立账号复核后，新增“仅完成事件/仅terminal items含原生执行”红测并修复，避免漏掉没有started事件的执行记录；配置同时显式关闭并核验`skills.bundled.enabled`和`skills.include_instructions`，不单靠skills/list。新字段经本机无推理配置探测确认为false；不追加第三次smoke或改写既有首件/修订。空实际instructionSources不强制生成额外准入文件；非空来源仍逐项核验当前SHA。当前31项账号/CLI回归、131断言通过。

**AX3/AX6第一项局部合流。** 七个语义反例先红：16/64 context路径/节点上限、effect/资源/unknown setter边界、typed handler/finally、对象与条件保留、finally覆盖和单题回滚。实现只汇总同block/同invocation中连续的显式context，无授权状态变化的语义成立才可合流；未知callee从未按名称裁掉。来源序列逐项保留，all-normal/first-unknown-exception摘要不把任何结果变已知，不改127/16上限，不跨其它步骤。异常仍未知，原normal出口可表示；不同effect之前/之后的失败保留不同前驱。还修复了超限题留下fieldChanges的旧缺口，独立问题不受影响。独立只读AI复核指出合并规则仍误标第一条调用为失败来源；两项来源断言先红，修为synthetic step与有序sourceOrigin.steps，异常claim标明可能来源集合。32项语义测试全绿；与控制schema、解释、摘要、结论共86 pass、457断言，主类型通过。当前只是局部算法；需求frontier、增量覆盖和v4入口尚待接线，不能记为完整任务效果。

**AX4–AX9性质需求与公开接线。** v4保留所有可能执行的call、predicate、return、raise及显式对象/别名/guard引用，只凭源码固定退出、布尔字面量分支、短路和空循环机械排除。unknown setter和异常清理不按名称去掉。八锚点字段frontier与完整宿主骨架分离，正确草稿增量保留，来源覆盖/提议含义/性质覆盖/整体充分分别报告，整体充分始终false。独立只读AI核验未发现不安全裁剪，指出部分控制仍保守过度需求。v4公开inquiry/native使用同一核心和独立property-control/v1材料版本，政策变更恢复/来源变更失效已测；多个原问题共享的决定性来源优先调度。完整skill在账号系统指令只出现一次，公开inquiry按原字节归档并核验session/report/run一致；篡改run侧skill元数据的反例先红后修。阶段红绿和当前回归记录在AX verification，尚不据此宣称真实完整任务或收益。

**AX10首件与账号边界修订。** 完整Cloudflare Download首件在42fe4a84使用完整原task/skill及伴随资源，官方CLI初期连接重试后自行派生源码探子；生产边界在collab wait事件关闭，0宿主源码回调、无终答，status unavailable，reason unexpected-native-account-tool:collabAgentToolCall。可见父会话input/output/cacheRead为65251/610/51328；内部请求、额外子会话用量和USD未知。不能当作源码质量失败或抹掉首件。官方[配置定义](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)说明agents.enabled独立默认true；只关multi_agent/multi_agent_v2不够。本机无推理probe兑现agents.enabled:false，生产改为同时核验该值，并在第一个subAgentActivity事件即关闭。三个反例先红，40项账号/公开入口回归、406断言及主类型通过；下一次是具名同原题修订，非新首件或第三次smoke。公开inquiry同时复用普通技能部署/包装，原skill字节单独归档，伴随文件可通过现有只读工具取得。

**AX10第二项真实接口缺陷。** `agents-disabled`修订在53c01783保持受控边界，并实际执行28个动态回调；宿主含自动读取共使用50/64次。模型还未产生最终自然答，在提交一个不符合当前schema的focused解释时，传输层直接关闭为account-tool-arguments-invalid。可见input/output/cacheRead为881976/2712/811136；首件与修订都保留，质量不能用已读源码数量代替。模型上下文连续增长至120946字节，源码再次发送277337字节，未接受语义单元。共享修复保留事务，将已注册工具参数错误返回具体字段诊断并计入同一预算；未知能力和身份冲突仍关闭。v4账号仅对实际已经传输且字节相同的JSON子值生成序号/路径/SHA引用，变更源或字段重新发送，保留全部源码和宿主草稿。三个红测后，同会话字段修复、相同预算、精确上下文重建和两个入口已通过；真实任务效果由后续具名修订验证，不把离线字节减少写成模型收益。

**AX10实际采用后的焦点接线修复。** `field-context`修订已转向当前源码锚点并反复提交源解释；其生成的try/raise步骤却仍被旧FocusedUnitSchema的十种步骤拒绝，停在同一个Download入口。该缺陷属于共享接线：v3核心和来源lowerer已经支持有限控制，焦点验证没有同步，不能要求模型改写合法异常步骤或删掉原异常。有限控制八种步骤与账号try/finally反例先红；焦点改为保留共享核心其余步骤，仅call.callee继续由宿主拥有。原修订不改写，后续以具名source-controls修订验证。归档检查另发现根results文本属性改变gzip字节；当前Git以本地完好的原始字节恢复并增加AX身份的原字节属性，旧提交保留，未改变实际输入/响应含义。

**AX10有限控制实际采用与交付阶段。** `source-controls`在b512be3e接受2个源码单元/15控制步骤，9次源解释提交、7次局部修复，无低层fallback；34动态调用中11项字段拒绝，含自动读取共59/64宿主动作。账号完成且有自然答，input/output/cacheRead为4006308/15706/3772544，内部请求/USD未知。最终两次有效check仍失败：账号上下文一直停在interpret，没有像provider预算路径那样提供当前answer焦点，模型提交的focused结果因此被判stale而未转成semantic结果。两个红测定位后，共享账号上下文在探索耗尽或首个check后进入既有部分交付阶段，停止自动读，保留全部问题/缺口并暴露精确answer合同；失败原件不升级。上一份field-context的独立只读AI评阅另确认其遗漏ownerless/owner/object-grant具体分支且把源码可见路由模板误列为未知，主线程点验权限函数和路由登记，故自然答质量仍部分。新修订的质量与形式验收继续分账。source-controls实际发送999237上下文字节，完整渲染3347749字节；机械引用效果不构成跨版本真实token或质量收益。

**AX10 answer-phase与AX12/AX13编排。** answer-phase在27ad63fd完成31动态调用（11项字段拒绝）、56/64宿主动作，接受2源码单元/16步，input/output/cacheRead为3637057/13059/3415936。交付已到answer且第二check结构有效，仍因已读helper未链接和unknown/conditional断言冲突而部分；检查失败不改评分器，也不视为源码图闭合。当前driver接通登记变化、作者和原字节消费者：全部复用生产账号/公开check/init/edit/来源副本接口，仅保留原稿、机械身份和顺序。变化基于当前完整原声明，旧登记只抽取独立policy/premise/sourceRoot，policy额外mode变化明记；作者最多一次字段修订，消费者先核验独立准入与原字节SHA，无人类计时。五项针对性测试/29断言和研究脚本严格类型通过，真实作者/消费/变化结果尚待运行。一次按整个结果目录的测试发现器误扫部署的原skill附带测试，35项附带CLI测试失败，另记为误扫，不纳入本轮针对性通过声明，未调查其具体环境原因或修改原skill。

**AX11原题与当前公开基线。** OWUI在b5e04212完成27次回调（2项字段拒绝）、46/64宿主动作、4单元/58步，17次源提交/12次局部修复，无fallback；input/output/cacheRead为3874016/18720/3566848。自然答准确解释普通用户的文件所有者查询、admin按ID查询、独立destination和bypass/deletion，但独立只读AI及主线程源码点验仍发现已有集合直接返回、不同file_id重复hash阻止写入和身份来源追踪遗漏。形式检查结构有效，Files接收者参数未绑定及另一callee未解释，不能把账号完成记成checked。公开Download同生产src tree完成28次回调、53/64动作，input/output/cacheRead为2435875/10492/2237312；自然答的ownerless/owner/grant分支正确，路由及具体运行/部署事实仍部分。三变化由该当前完整声明导出，保留全部问题，baseline只支持material-only研究。

**AX16可重算账与脱敏来源。** 当前collector逐一绑定9份首件/修订原件，可见父会话input/output/cacheRead为17511473/73372/16272896，非缓存input1238577；内部请求、USD、额外原生子会话及开发/探子用量未知。133个实际传输上下文直接核验；OWUI另外28个上下文中两份源码窗口因认证代码被日志脱敏而不能直接核验引用。零推理重建只读取登记SHA匹配的原源码，逐个窗口重建编号/范围/ID/bytes，且必须精确等于归档窗口的既有脱敏结果后才恢复；引用仍核验原digest，报告区别为verified-with-source-reconstruction，原raw不改。字段/缺报/篡改与脱敏来源反例先红绿，12项研究脚本测试/46断言及严格类型通过。该核验不是完整状态/材料重放；AX18继续承担后者。作者及N的claim同时改为实际common-only/legacy能力，未改变已运行生产核心。

**AX12首个变化与AX18状态重放。** 同src tree的policy fresh完成32次回调、53/64动作，接受9单元/107步，10次源解释提交/1次局部修复、无fallback；自然答指出根文档授权与实际file_doc分离、包含owner/grant和版本族，形式仍因未知异常/入口返回与未充分policy映射为partial。该一次变化不是跨版本收益，previous臂随后单独派发。零账号重放先定位到两类纯宿主耗时差异，不屏蔽语义字段；完整serialized状态/材料/预算在answer-phase、公开Download、OWUI和policy fresh的118原回调一致。回调须与实际incoming记录一致，原件篡改/JSON归档缺省/语义同名duration字段反例先红绿；旧src tree单列，原raw和任务质量不升级。独立核验另外指出重建窗口边界应显式检查，四类非法范围反例先红绿修复。后续原件继续纳入重放与成本，六变化、作者和质量责任尚未完成。

**AX12材料重新接纳修复。** policy previous保留两个入口材料却均current:false，accepted入口仍在，实际采用为0。根因是A→B→A后accept按原ID返回退休条目；之前“同store永久封存”的设计会让已经重新校验的当前解释失去材料。两个匿名红测分别复现当前材料为空与入口/实际helper投影为0；共享accept改为通过语义与依赖校验后更新同ID当前材料及最新绑定/证据/来源，退役历史保留，快照不自行复活失效条目。9项材料/投影测试37断言转绿；含恢复、runtime、两个入口及账号的84项回归685断言通过。修前六份同版本归档184回调已严格零账号重放并提交，保留原0采用和质量失败；后续用具名公开baseline及新登记，在修后src tree成对复验。Download作者common-only已完成且原稿待独立准入，OWUI作者可独立继续，消费者与领域比较等候修复。

**AX13作者准入与修后登记。** Download/OWUI两份common-only作者均完成，分别可见input/output/cacheRead为36489/4744/21760和40358/6295/25984。原稿、每次写入及使用说明保留；独立只读核验与主线程完整阅读确认全任务和剩余skill职责忠实，私有准入只绑定原字节及原输入SHA。95/173文件源码包已原字节复制且公开校验，尚未冒称模型消费。作者Usage仅有操作步骤，最终交付另补可复制的公开命令。fb808576修后Download公开baseline完成34回调，2单元/15步，1项入口材料投影，形式仍partial；34原回调严格重放一致。新具名变化登记/输入与旧路径分开，固定同生产src tree及各变化SHA，两个红测转绿、18项研究脚本74断言及严格类型通过，三变化公开检查全部valid。原policy两答仍部分，首次premise fresh自然条件说明独立评阅为充分，正式检查失败继续单列。

**AX检查后显式回访修复。** afc71124树下policy fresh具名修订完成24回调，可见input/output/cacheRead为2451211/11419/2241920，当前入口材料采用1，形式仍partial；该树baseline/policy两份58回调严格零账号重放封存。独立自然评阅判两答full，主线程全文阅读后点验Paperless GET权限映射与DRF继承has_permission，确认二者只列权限类却漏掉全局view_document入口门槛，最终仍partial，核心root/file/version/representation关系正确。随后发现账号每次检查后都以finalOnly撤销已被接受的显式revisit/nextItemId；原两份真实轨迹没有请求回访，不能将失败归因为实际回访失败。匿名生产接口两个红测复现focus再次切answer，修共享context/focus区分软交付和硬预算，合法显式源码选择保留至接受/放弃；未增加预算、自动读或语义标注。十文件138项967断言、另一个待源码选择/检查耗尽反例及主类型通过；独立review的dual-field绕过猜测经原OR拒绝条件排除，account/provider先sync再硬context的源失效路径维持。修后先登记当前公开baseline和同版本变化，再继续消费者/六臂，旧首件及两个历史树快照保留。

**AX当前真实通道拒绝。** `9039fd3f`/生产树`6042b79e`的具名公开baseline `explicit-source-revisit`在6动态回调后无终答，原状态completion-unknown、reason account-turn-failed保留。可见input/output/cacheRead为151288/1725/112512、130208ms；raw含四次request-timeout重连通知与最终usageLimitExceeded/turn failed，不能把通知数当已知底层请求数。一次只读应用usage显示ordinaryUsageAllowed:true，与“整个账号耗尽”相矛盾，但不证明该实验CLI/model通道恢复。私有裁定仅保存必要去身份元数据、原report/run/events SHA及通道范围，未购买/重置/切模型或重发。先检查原未知请求，再恢复同配置实验；实际缺口不以新identity抹去。

**AX15实际提案的零调用机制比较。** 当前baseline未完成，故只纳入afc71124的baseline/policy fresh冻结草稿；Git diff证明需求/合流纯核心未变，四处差异限账号测试和inquiry-native/domain-runtime/focus，不给完整新运行时或当前模型质量资格。同源草稿只重绑revision，两个源码单元的必需标注分别3→4、7→7，没有机械排除，完整离线载荷分别6429/17314→9867/23388与6629/17326→10067/23400字节。每份实际材料投影1，精确匹配原轨迹；开/关合流均14规则/3终态、失败来源合并0。未观察需求减负、真实合流采用或token/质量收益。独立核验指出投影须绑定原实际采用，主线程补缺失/不同关系负例，5测试30断言通过；total required与pending不混为一个计数，额外模型机制调用0。

**AX13/AX19完整交付包。** 仓库外包含418文件及1647201字节ZIP；Download原/变各95源码文件、OWUI允许范围173文件，完整Cloudflare/GitHub skill含22/8文件。原input brief逐字保留，原作者inquiry/Usage按准入SHA不改；OWUI许可证及原174项清单另存provenance。Download三变化保留四原题，premise仅用登记所有权替换旧未指定前提，policy显式conformance，source只views.py变化。11次实际公开零推理命令全部exit0，ZIP418条逐字节对manifest；inspect/compare使用现存旧partial baseline，仅证明接口，不声称当前消费或复用。Windows带显式env启动命名bun发生ENOENT，在任何artifact写入前退出；改用已有绝对process.execPath后构建成功，未安装替代环境。两位独立只读探子核对接口/来源，主线程纠正inquiry edit与local-edit混淆、原任务应取brief和173/174清单范围，最终包独立复核无阻塞。

**AX16–AX20待恢复检查点。** 17份归档覆盖9/20首位置，11尚未派发，活动尝试0；finiteQueueComplete与researchGoalAchieved均false。全部10份领域自然答已独立评阅与主裁定，早期三份Download自然答的探子将GET门槛归于全部答，实际只source-controls写明；该答仍漏ownerless分支，其余两答还漏全局GET/明确所有权分支，保留partial。只有旧premise fresh自然条件说明full而formal失败，真实作者消费者0、质量六臂0。四份smoke/作者capture另核验可见动态调用、宿主回执、稿件字节及完整skill，私有准入没有进入可见模型输入；隐藏原生活动/内部请求不声称穷尽。可见父会话input/output/cacheRead为34358571/152441/31914752、非缓存input2443819；301上下文直接核验、OWUI28上下文/2窗口精确重建。e1578bb1的184和afc71124的58回调严格快照保留，当前严格重放0；研究脚本23测试104断言及含delivery的严格类型通过。USD、隐藏重试/子会话、开发/探子和真人时间仍unknown。六项结果与下一具体责任在[AX summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/summary.json)：裁定未决→指定通道恢复→当前具名baseline/同版本变化→原字节消费者/六臂；源码解释/receiver/helper连接与全部原分支覆盖继续归本队列责任。

### 7.59 AX 离线交付复核与下一步方法建议

2026-10-07，针对`191a37e0`检查点重新阅读AX任务书、原自然答、主裁定、机制记录和共享实现，并核对用户origin。复核只执行本地确定性检查及公开资料检索，未派发项目模型推理、恢复第三方API或修改历史结果。本节区分实测事实和后续设计建议；AX原队列继续保留待恢复状态。

**交付与当前能力。** 仓库外目录与ZIP的418个文件逐字节一致，manifest列出的417项长度及摘要全部匹配。重跑AX七文件研究测试和property-demand/semantic-flow测试，共63通过、360断言；主typecheck、AX严格类型和包外Download公开check通过。此前11条公开命令的归档均为exit 0，本次只另跑一条代表性check。该包携带任务、原skill和源码，依赖现有SkVM及Bun运行；两份作者稿已有真实生成和原字节准入，实际消费者仍为0。自然回答的完整程度、程序检查和可搬移材料是三项不同的交付责任。

**最重要的实现差距。** `src/task-dsl/authorization/property-demand.ts`的`buildPropertyDemand`只根据固定源码退出、字面量分支、短路和空循环排除不可达锚点；85–94行继续要求全部可达call、动态condition、入口return、raise，以及草稿已经声明的对象/guard依赖。`questionId`在此层承担归属，问题中的主体、资源和effect尚未成为反向依赖切片的种子。八锚点frontier使标注可以分批，仍没有自动决定哪些可达代码会影响当前授权问题。AX最初提出的按问题减少解释负担，现阶段只完成了保守可达性及增量接口部分。

实际两份合格冻结提案的标注数为3→4、7→7，排除项为空；合流前后均14规则/3终态，合并失败来源为0。16/64个显式context合流的测试证明局部算法成立，而这些真实单元没有相应的context序列。因此下一轮应把问题依赖和对象连接排在继续扩展异常合流之前。当前机制证据没有支持减负，既不能把离线envelope增加归为完整模型开销，也不能把合流未触发归为代码未接线。

**具体源码遗漏。** `attempts/inquiry-download-original/material-reactivation/answer-original.md`第7行列出了权限类，随后正确解释root_doc对象授权、版本族和文件表示，却未展开GET的全局`view_document`门槛。包内`src/documents/permissions.py:36`覆盖GET映射，`framework/rest_framework-3.18.1/rest_framework/permissions.py:233`的继承`has_permission`再调用`user.has_perms(perms)`。主裁定partial有源码依据；独立AI的full意见保留但不替代该裁定。继承权限、框架入口及对象检查应进入同一条取证依赖链。另一个需避免的误诊是把lowerer不写callee视为漏接线：`inquiry-focus.ts:262`的link阶段已负责校验候选并设置callee/arguments；应定位某份真实提案为何没有完成该连接，而非重复增加一个同职责入口。

**账号失败应分层表示。** 最新原件保存了`usageLimitExceeded`及`turn/completed.status=failed`。当前`src/adapters/codex-account-session.ts:216`把所有非completed终态归为completion-unknown，因此原报告继续保留该状态。按照[官方App Server事件合同](https://learn.chatgpt.com/docs/app-server)，failed是明确的turn终态；建议新增只读裁定或兼容状态，将“已知失败、没有终答”与“传输丢失而终态未知”分开，内部重试和未报告用量继续unknown。额度拒绝只限定于已观察的实验通道。原17份父会话完整input为34,358,571，其中cacheRead 31,914,752；逐会话max累计而非逐通知求和，现有检查未发现重复相加。应继续检查长会话上下文和重复解释的来源，不能从该总数推算美元或断言额度拒绝的唯一原因。

**外部方法对照及适配判断。** [CodeQL Python数据流](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-python/)以表达式/参数和局部流组织追踪，[API graphs](https://codeql.github.com/docs/codeql-language-guides/using-api-graphs-in-python/)提供外部库、别名、参数和继承关系接口，并明确未提取库代码的继承需要额外模型。可借鉴到当前结构索引和源码材料层，优先补版本可核验的框架关系与参数/返回对象连接。[RepoAudit架构](https://github.com/PurCL/RepoAudit/blob/main/docs/architecture.md)将语法索引、局部语义事实、路径验证和记忆分层；其调用关系近似也有类层级等局限。[IRIS §3](https://arxiv.org/html/2405.17238v3)由LLM补充领域规格，再交给静态引擎求路径并做上下文裁定。对SkVM的推论是让模型解释局部授权含义，让宿主承担可机械确认的绑定、传播、依赖失效和结论汇总。这些项目的任务和评测各异，借鉴的是职责分工，效果需在本项目原题上验证。

**建议的后续顺序。** 下一任务书宜围绕“授权问题依赖与真实单任务闭合”编排：先修明确failed与unknown的状态区分；复用source-skeleton/worklist/source-material/semantic-flow，把问题关联到当前source中的主体、资源、控制和effect，再形成可追溯的依赖切片及函数摘要；将框架继承入口、helper实参/形参/返回对象连接作为首批共享责任。动态dispatch、未知写入和未解析依赖继续保留缺口，不能因模型称无关就排除。先以现有Download全过程验证正常授权链、原全部问题和原skill交付，再做作者包实际消费与原计划变化/质量对照；发现共享失败时立即修受影响路径，不继续消耗同类位置。OWUI已有集合/重复hash/身份来源分支用于检验同方法的另一结构，不加项目名成功分支。

逐问题应分别记录已读、已解释、关系已连、结论已检查及剩余影响；操作异常是否影响授权结论要有具体控制依赖依据，保留原要求中的异常分支。实验模型只能看到实际源码、用户前提和工具材料，开发者的标准答案与本节源码裁定仍留在评阅侧。运行层优先测量每次新增上下文、重复发送和同单元修复次数，再决定局部上下文/缓存改造，避免仅靠压缩说明。以上尚未实施；11个待执行首位置及所需同版本修订仍在原账中，不以新计划抹去。

### 7.60 AY 问题依赖完整使用与收益验证

2026-10-07，用户要求用gpt-6.1-sol/max新线程继续开发，实验使用当前账号gpt-5.6-sol，争取本轮做出真正可用且有正向收益的成果。[AY0–AY23](../superpowers/plans/2026-10-07-authorization-question-dependencies-and-usable-dsl.md)据此建立完整执行队列；本轮以 `completed-with-unmet-criteria` 收束。已登记22首位置、承接AX11位置并追加AX明确failed裁定，旧原件不改。账号终态/交付/用量分离及v5初版依赖/双入口反例已红绿验证；两任务同时checked/full和实测收益尚未建立。

2026-10-08用户要求45分钟内进入官方完整原任务实验，未进入则暂停并未达标收尾，进入则继续有限队列；这改变先补尽全部框架/Python支持再运行的执行顺序。22:45:09在开始约11分钟后实际进入正式Download turn并完成源码回调，限时启动条件已满足。CLI升级导致的首个零派发拒绝原件保留；精确0.162.0-alpha.2经本机experimental schema及实际有效配置/thread/指令SHA零推理核验后准入，38账号回归及主类型、授权宽回归通过。其后Download/OWUI完整原skill自然任务均交付，源码均partial；Download作者原字节消费者源码full而machine check仍partial，OWUI消费者partial且决定性向量写入callee未读。变化实际完成policy-fresh、premise-fresh/previous；policy-previous因workspace routing discovery failed、source-fresh因官方额度拒绝，source-previous及12质量位置未派发。账号返回恢复时间为2026-10-14 16:47，未自动重发。前者遗漏继承GET全局权限/owner-aware细分，后者遗漏空字符串collection真值；作者消费者先明确选错词法入口、答阶段的更换被拒，已有defer/revisit恢复合同未被采用，不能仅凭模型抱怨认定宿主重置bug。评阅不进入执行上下文；恢复材料、实际采用、完整质量与token收益分列。

本轮收尾裁定：工程闭环和普通入口可运行，两个原任务与两个作者包确实完成官方账号交付/消费；完整checked/full、三变化双臂和12质量面板未完成，且当前没有任何正向质量或token收益证据。OWUI消费者的共享64单位预算中仅23条模型回调，`save_docs_to_vector_db` 和 framework 项均在预算耗尽时保持 awaiting-read，不能归因于模型主动跳过或宿主调度缺陷。官方额度封顶后保留未运行分母、失败终态和未知USD/隐藏请求/开发探子/真人时间；不自动重发、不切换身份或模型。

**复核后的取舍。** v4已有性质frontier和合流，但真实提案未减轻标注。结构索引已提供import、C3/super、receiver、参数和有限返回信息；operation-work也有DRF前置权限候选，focus/link负责callee。新的实现责任是将这些信息按当前问题连接和实际消费，减少整函数解释与遗漏。保留既有runtime/CLI/材料层，新增显式v5与question-control/v1身份，不复制一套系统。

**方法。** 原问题和当前源码产生主体/资源/effect种子；宿主追踪有限数据、调用和控制依赖，模型解释局部授权含义。机械排除有来源理由；动态dispatch、未知副作用、资源替换和异常影响保留边界。框架前置权限与对象guard进入同一链，唯一可证明的实参/返回连接由host完成。每题分别记录已读、已解释、已连接、已检查和剩余影响，最终完整性由原题分母汇总。模型语义仍需独立源码复核。

**外部借鉴。** 延续§7.59的一手依据：CodeQL局部数据流/API模型用于对照节点和继承关系，RepoAudit局部探索与路径记忆用于对照摘要及失效，IRIS用于对照模型规格与确定性求值分工。AY1只进一步阅读对应实际代码和必要符号，记录采用处与反例；不引入整套外部框架，也不借其评测数字证明本项目收益。

AY1点验表：

| 责任 | 当前存在 | AY实际采用或缺口 |
|---|---|---|
| DRF/MRO/permission_classes | structure-index、operation-work已有源码候选 | 非显式callee尚未进入来源投影；继续接线 |
| receiver/keyword/default/return | source-interpretation、operation-links、source-material-projection | 原接口复用，独立对象身份仍由typed checker验证 |
| v4 demand | source-invariant reachability、八锚点frontier | v5增加AST def/use、控制/异常前驱、原问题及来源角色种子；未知调用不删除 |
| 材料 | 来源模板与逐题投影已分开 | v5使用question-control/v1；旧材料不自动改身份 |

定向源码实际读取：[CodeQL DataFlowPublic](https://github.com/github/codeql/blob/27a8a7e94a38c6f9a5de7405c4d216164fb3db49/python/ql/lib/semmle/python/dataflow/new/internal/DataFlowPublic.qll)的scope-entry及synthetic pre/post-update节点用于明确“未知调用可能修改对象”边界；[ApiGraphs](https://github.com/github/codeql/blob/27a8a7e94a38c6f9a5de7405c4d216164fb3db49/python/ql/lib/semmle/python/ApiGraphs.qll)的getParameter/getReturn/getASubclass和逐调用CallNode用于核对参数/返回与继承责任，未移植其求解器。RepoAudit的[IntraDataFlowAnalyzerInput](https://github.com/PurCL/RepoAudit/blob/160f5bcd378a02a2417e32e999f93ef5fa0f5e64/src/llmtool/dfbscan/intra_dataflow_analyzer.py)和[PathValidatorInput](https://github.com/PurCL/RepoAudit/blob/160f5bcd378a02a2417e32e999f93ef5fa0f5e64/src/llmtool/dfbscan/path_validator.py)用于核对函数起点、路径身份和实际源码上下文；其模型Yes/No不作为本项目确定性证明。[IRIS §3](https://arxiv.org/html/2405.17238v3)用于保持模型角色解释与确定性图求值分工。外部性能数字不进入AY收益账。

初版依赖红测4项均按预期失败，绿测连同原demand共12项通过；生产双入口新增v5红测两项失败，修复后source-assisted/source-interpretation共43项通过。初版只机械排除未被依赖使用的局部标量常量赋值，字段/调用/context角色不证明无影响；保留原骨架与每条排除出处。工程反例不等于真实任务通过。

2026-10-08首个native-download原件使用97bea268：官方CLI已升级0.160.0，旧版本准入返回unavailable/not-started，host回调0，推理未派发、自然答未交付、用量unknown。读取本机生成的experimental ThreadStartParams/Response、DynamicToolCall及TurnStatus合同后，为精确0.160.0增加兼容；每会话仍验证实际隔离配置/roots/指令pins，未核验未来版本不准入。版本红测18pass/1预期fail，账号联合37pass/260断言。另独立核验发现inspect未比对新增状态字段，篡改报告红测复现并修复；不升级原件，下一请求具名登记。

具名`native-download/capability-0-160`在2d76e592实际运行completed/delivered，31接受回调、8传输拒绝；宿主共享预算64含自动取证。可见input/output/cacheRead为4396476/15635/4227328，非缓存input169148，缓存已含input，不重复相加；USD/内部重试请求数unknown。自然答经独立只读AI核验及主代理点验为partial：请求级权限未闭合、混用非实际handler的object拒绝响应、缺省version行为误述。两次result check均被schema拒绝，checkHistory为空。评阅和诊断保存在AY results，不进入后续模型输入。

本轮定位到额外宿主计数错误：传输层拒绝的两次check记为exploration，最终totalUsed64却checksRemaining2、explorationRemaining-2。红测复现后改为同一保留check槽；当前答阶段直接给机械answerContract和数字path索引说明，不替模型写语义答案。逐题分母三项红测、独立关闭/未连接candidate两项红测、dispatch缺边两项红测均转绿。相关广回归963pass/1平台skip及主类型通过；后续budget/answer-contract修复的native/account/focus联合65pass/406断言。框架前置边界已进入v5逐题检查，完整源码组合及真实复验继续。

2026-10-08，`native-owui/original`在fa2c5820 completed/delivered，用量input/output/cacheRead为3748276/12912/3368960，fresh379316；29接受回调、1传输拒绝。核心输入文件/输出集合区别正确，但原答把Optional字符串“提供”当非空，漏空值对分支/add模式的影响，且未分清写向量前content更新与成功后状态更新，独立AI评阅经源码点验仍partial。七轮增量解释确有前进，最后59annotations/2unresolved生成34块/8空块/72步骤而被32块接口拒绝。v5复用无动作空块后原件零推理复验为27块/1空块/72步骤，步骤和跳转相同，单元接纳1；两个查询callee仍未解释，不升级原答。defer同时给两个目标现具名拒绝；停滞按保留有效字段值及当前缺口判断，评审所发现“状态未变但值已变”反例已红绿修复。修复后联合1008pass/1平台skip/6445断言、主/AY类型通过；评阅及原件复验见[AY reviews](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/native-owui-original.json)与[零推理复验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/owui-empty-regions-replay.json)。

实际上下文按原始wire重新验证：Download40包发送1458771 bytes，OWUI31包计量2151498、脱敏归档2151323；175字节差异单列。OWUI首包473086中propertyDemand349388、dependencies296530。只改需求反馈投影的零调用探针为7850 bytes、首包131548；完整图和required/deferred仍在宿主报告，原题/原源码可取回，不改变需求或语义判定。引用bytes代表引用原值，不能当作发送尺寸；这只是机械字节减少，尚无当前新版本token收益。既有两次有用量推理input合计8144752、output28547、其中cacheRead7596288（不再相加），USD/隐藏请求/开发探子/真人时间unknown。见[上下文分账](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/context-accounting-initial.json)。

OWUI具名`empty-regions-current-frontier`在a7788001完成交付：37接受/2传输拒绝，14源码提交、8局部修复、6接受单元、108步骤，实际3材料投影为入口和两文件查询。route/auth/session虽有解释尚未进入实际投影；`Files` receiver未绑定和`user.id`误标helper principal导致语义缺口。两次终答均在传输schema被拒，checkHistory0。自然答补充None/空串区别，但仍缺空content/空destination的真值分支、existing且add=False早返、写入前content更新与后失败残留，独立只读AI评阅经主点验为partial。input/output/cacheRead为4552853/18805/4283904，fresh268949；总4571658比首件3761188增加。三次有用量推理累计input12697605、output47352、cacheRead11880192、fresh817413；首次unavailable用量及USD/隐藏请求/开发/真人仍unknown。见[修订评价](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/native-owui-empty-regions-current-frontier.json)。

AY7修复保留当前唯一未重绑定模块实例的source/class证明，在v5编译器只生成普通value身份，同源导入alias共享它；参数/局部遮蔽、consumer alias重绑定、模块attribute写入与旧证明撤回关系。`source-bindings/v5`使旧footprint显式再验证。匿名红测先暴露缺证明/绑定/枚举，以及别名重绑定和独立错误identity，再转绿；70focused通过，联合1011pass/1平台skip/6466断言、主/AY类型通过。原提案零推理重编译移除Files未绑定，但保留标量principal误判、未解释callee和展开上限，原件不升级。当前answerContract枚举直接来自实际schema，不coerce自由文字。只读代码核验未发现具体缺陷；其vitest环境失败不算验证，主线程Bun结果单列。见[receiver复验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/owui-receiver-replay.json)。

AY11框架footprint发现两个确定性问题：每单元保存全工作队列的framework依赖，DRF修订又hash全framework目录。两个匿名红测转绿后，v5改为材料自身来源/实际receiver的`drf-source-dispatch/v2:<receiver>`，覆盖MRO、前置方法和当前permission/serializer配置的来源；v1校验不变。投影反例验证无关framework文件保留两个入口、另一入口变化只撤回它、共享前置控制改变撤回两个入口、普通helper无另一入口依赖。独立只读AI复核指出同文件无关编辑仍失效；这是既有整文件SHA契约的粒度限制，本轮明确保留，不宣称符号范围精度。24focused/78断言、联合1013pass/1平台skip/6476断言及主/AY类型通过；零实验调用，完整框架组合和真实变化消费继续。

AY6静态FastAPI请求组合已进入v5临时投影：源码确认的route/Depends与定义目标绑定当前call/SHA，递归依赖先执行、typed返回后进入原body；只在必要时增加未知Request环境，`contextArguments`不冒充原声明实参。原模板及普通Python默认声明不改，literal请求默认不自动当已知值。来源重绑定、conditional/wrapper、Annotated/Security/options、重复缓存、未知输入与未解释目标均保留具名缺口；按精确question/relation/source/receiver的实际采用关闭关系，修复回到原source而非scratch handle。独立只读AI提出环境实参混用，已分开并加反例；另称目标body改变不变revision，主代理以带source SHA的candidate身份及双文件反例否证，未增加重复检查。方法形式override、追加middleware/route与ASGI mount的4红测随后转绿；主线程新鲜106focused/363断言，联合1022pass/1平台skip/6610断言、114文件、13.19s，主/AY类型通过。

零模型复验保留完整原提案、原source/anchor身份及未投影诊断，仅更新机械revision。初始注入探针曾采用route/auth/session（6总采用）；补入口修改检查后，真实OWUI的`app.add_middleware`使当前探针仅有3普通采用，route/auth/session为read未采用、内层get_current_user与binding边界为pending。初始/当前报告分别留档，原自然答与评分不升级。当前模型契约不是目标安装版本证明，generator收尾、源码可见ASGI入口控制和DRF请求dispatch仍待闭合；本轮实验调用0，开发/探子token、USD/真人时间unknown。见[局部复核](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay6-request-composition.json)与[当前回放](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/owui-request-dependency-replay.json)。

**执行与账号。** 明确failed终态与completion-unknown分开，旧AX状态只追加裁定；用量缺报保持unknown。没有活动请求后，新具名尝试沿用户已授权账号通道运行。若通道仍拒绝，独立工程继续，实验待恢复；第三方API保持暂停。上下文改造从真实重复内容和重解释次数开始，不以离线字节变化冒充实际token节省。

**真实闭合。** 两份完整原skill分别处理Download/OWUI，优先消费两份AX原字节作者包，完成policy/premise/source三变化fresh与previous，再做N/M-S/D-S各两次重复。必需首位置22个，修订独立追加。N/D衡量整套工具，M/D衡量表示本身；共同模型、事实和宿主预算，执行侧不接触oracle、历史终答或本文根因裁定。每次共享故障当场红绿修复再继续受影响位置，不批量运行已知错误版本。

**成果判据。** 两真实任务和消费者要有当前checked及独立源码完整回答，变化复查有真实采用；正向效果按任务书预登记质量、同质量运行减负或真实复用减负判据实测。首件/修订及成本完整保留，工程可用与收益mixed可以同时成立。用户希望本轮完成项目，执行目标因此覆盖完整使用和收益；尚未得到数据时不预先保证正向结论。问题解决后的新事实继续维护本节和§1/§11。

AY6后续ASGI取证把通用配置缺口落到当前注册call及constructor/__call__/dispatch来源：`source-bindings/v7`保留参数与条件/异常/函数作用域，每route的`fastapi-source-asgi/v1`保存当前类/MRO来源，跨文件body变化撤回其footprint，无关文件不污染。注册的应用alias明确resolved/possible；探子指出重绑定alias被当确定注册，已补具名possible边界，不能从未知replacement证明app无影响，也不再把potential称为实际注册。跨root/global alias漏捕、参数遮蔽误借类、重复positional表达式丢失和source-root-qualified base被误报缺失均红绿修复。已读/已解释middleware仍无actual use，不能checked；词法顺序保持unproven。118focused/398断言，新鲜联合1034pass/1平台skip/6645断言、114文件、13.44s和双类型通过。原OWUI回放有11源码注册/11方法候选，仍3普通采用，外部类/base与continuation缺口保持；初始/current回放分别留档，原答不升级，实验调用0。见[局部复核](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay6-asgi-registration.json)与[当前来源回放](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/owui-request-middleware-replay.json)。DRF dispatch/action及ASGI完整组合继续，真实净收益未建立。

AY6同轮DRF来源小步（2026-10-08）：从原轮次保留的3.18.1 wheel追加提取缺失decorators.py，核对wheel SHA及94旧冻结文件，独立来源supplement不改旧树/input/allowlist。v8保留action/secondary mapping声明、实际receiver及router/factory/mapper/as_view候选，进入逐题工作和按receiver的footprint。真实Download首先暴露GenericViewSet[Document]被当未知base、漏dispatch；仅在当前源码同步无其它动作地return原cls时保留订阅身份，其余形式保持opaque。类内遮蔽、方法替换、动态参数队列漏捕、async/metaclass及继承override反例已红绿。独立核验提醒factory存在不证明映射，现显式mappingBinding/invocation unproven，不由开发者按body形状补框架语义。138focused/436断言，新鲜联合1054pass/1平台skip/6683断言、114文件、13.24s及双类型通过。保留初始14项、订阅修复22项及当前22项来源探针；当前GET→download仍是声明，应用schema class wrapper、动态handler/参数/异常组合未采用。原source ID保留、无新annotation/实验/目标执行、旧答不升级；开发/探子token、USD与真人时间unknown。见[局部复核](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay6-drf-action-source.json)与[当前来源回放](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-action-source-replay.json)。下一步补来源确认的class decorator与请求dispatch组合，然后具名账号复验；完整使用与净收益仍未达。

AY6/AY7参数接续（2026-10-08）：原uv.lock确定drf-spectacular 0.30.0 wheel SHA，追加utils/drainage来源且94旧文件不变。真实class decorator虽return原class，却会为继承方法创建转发wrapper并复制kwargs/schema，不能据库名或return豁免修改。先以v9通用参数binder接通签名明确且仅splat使用的普通参数包，复用到v5解释与实际投影；zero-argument super保留self。19项新反例覆盖typed signature、未知/逃逸包、重复/默认值与拒绝/异常继续。只读核验指出动态默认gap被解释层忽略，已显式unresolved；主另证实*args与keyword普通参数的实际冲突并红绿修复。探子的actor/kwargs反例被调用者签名排除，匿名Python核验与正例保留，没有盲从增添阻断。145focused/469断言，联合1073pass/1平台skip/6725断言/115文件/13.13s，主/AY类型通过。[当前来源探针](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-call-arguments-replay.json)保留12来源/78调用，三条initial/super初始化转发可绑定；dispatch alias/闭包handler仍有具名缺口，semantic units/material use均0，model read evidence=false、旧尝试不升级。来源抓取一次网络请求，模型/目标新增0；开发/探子token、USD与真人时间unknown。完整class/method绑定、动态handler和可变字段传播继续，之后具名账号复验；当前质量和正向收益未达。

AY6/AY7普通类装饰器小步（2026-10-08）：v10按源码保留继承class decorator声明、实参及factory/返回局部callable/argument-call/helper候选，进入现有read/interpret/link和逐题具名边界。invocation/transformation始终unproven；return原class的配置修改/异常不能豁免。主红测发现继承声明不变时仍须把实际子类字节纳入footprint，修复后对应材料撤回而无关receiver保留。独立核验指出重复exact class来源缺少明确receiver gap，已用单文件重复定义反例红绿补齐；所有歧义候选均可能参与，继续保守依赖，不把其中任一项当已证明无关。18新测试，156focused/500断言，新鲜联合1091pass/1平台skip/6775断言/115文件/10.70s，主/AY类型通过。真实[review后来源探针](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-class-decorators-reviewed-replay.json)核验94旧文件和独立补充，保留DocumentViewSet 1声明/14工作及UnifiedSearchViewSet含继承2声明/20工作；初始探针单独保留。接收类/MRO仍具名，包括APIView尚未捕获的Django View来源。没有新application annotations、model read evidence或material use，模型/目标/网络新增0、旧尝试不升级；开发/探子token、USD和真人时间unknown。见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay6-class-decorator-source.json)。继续闭包capture/实例字段、真实dispatch组合与账号复验，完整使用和实测收益仍未达。

AY7直接局部capture小步（2026-10-08）：v11保留当前唯一、无条件同步未装饰非generator局部def的owner/SHA/实际capture使用点；只由后续真实直接调用连接。外层稳定参数成为隐式参数，原Python签名与六角色保持；outer local/grandparent/nonlocal/pattern/default/annotation未知、replacement/escape均具名。定义声明不执行body，条件调用仍在原分支。匿名source-assisted采用证明拒绝阻止后续write，错capture/owner及变化源码撤回采用。两名独立只读review分别疑虑条件call和未注释capture类型；主按具体反例确认原控制分支和既有typed checker分别保留/拒绝，不以Python身份自动推主体语义，也不重复加门槛。20新测试，170focused/529断言，新鲜联合1111pass/1平台skip/6835断言/115文件/13.82s，双类型通过。

真实[局部callable探针](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-local-callables-replay.json)核验94旧冻结文件和独立supplement；49定义均有具名边界（26定义、21逃逸、2外层值），选中5个工厂/wrapper，directSourceCalls=0。失败proof中的capture仅为部分source leads，不是绑定environment；model read/application annotation/material use=0，模型/目标/网络新增0，旧inputs/allowlists/答不升级。开发/探子token、USD与真人时间unknown，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-local-callables.json)。原lock Django 5.2.16来源仅已定位，随后独立捕获/re-export和实际factory/dispatch字段/handler继续开发，完整请求、真实消费和净收益均未达。

AY7 public import小步（2026-10-08）：v12只穿过当前唯一无条件模块alias并保留逐hop来源与canonical class，partial/relative/conditional/cycle/歧义、consumer/terminal重绑定及attribute写入具名；不执行模块初始化或据库名免除变换。两个独立只读核验返回具体出处：一项提出未带alias的多级import疑点，主以同名顶层/子模块红测复现并修复；主补查另外三项红测，修复重绑定公开注解沿用旧receiver以及依赖参数/decorator helper的hop字节遗漏。19新测试，155focused/409断言，新鲜联合1130pass/1平台skip/6880断言/115文件/13.60s，主/AY类型通过。所选hop改变使实际材料撤回，无关module不扩大footprint；同一selected文件仍为整文件SHA保守失效。独立核验范围及主补查分列于[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-public-import-bindings.json)。

原lock Django 5.2.16 wheel SHA/size已核验，追加generic/__init__.py、base.py、utils/decorators.py的原字节，94旧冻结文件不变。[新来源探针](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-django-view-replay.json)使用100文件，两条真实Paperless MRO均连接到View，所选public hop变化撤回来源修订而无关export保持；六项View/descriptor来源工作可定位。缺base来源消除后class decorator的source gap解除，invocation/transformation仍unproven；returned factory closure、descriptor、类/method变换及action receiver不因source齐全而采用。model read/application annotation/material use=0，捕获网络1、探针模型/目标/网络0，旧input/allowlist/答不升级；开发/探子token、USD与真人时间unknown。随后继续实际closure invocation/environment、实例字段/dispatch handler、完整请求和官方具名复验，当前完整使用与净收益未达。

AY7返回callable小步（2026-10-08）：v13将独立来源proof与actual factory-result关系分开，当前唯一同步未装饰factory末尾return局部def、稳定capture及caller创建/调用身份沿同一binder、骨架、六角色和投影连接。factory声明生成普通value，闭包带普通instance参数以保留实际创建和原控制；匿名采用验证拒绝后不执行write，漏创建、错capture、覆盖instance、漏隐式参数和源码变化均撤回。主补两项nested function/lambda default跨层环境红测，具名阻断不完整capture。两只读核验给出的顺序/旧callee疑点经主反例未复现：未来创建尚无当前callee，旧callee先清除再绑定；未增加重复检查。投影探子的vitest收集失败不计验证，主Bun和另一探子核验分列。16新测试，228focused/704断言，新鲜联合1146pass/1平台skip/6939断言/115文件/14.02s，主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-returned-callables.json)。

真实[reviewed来源probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-returned-callables-reviewed-replay.json)核验94旧冻结字节及独立补充，共100文件、24返回定义、13来源合格、11具名缺口；初始24/15原件保留，另外2项跨层环境现在明确阻断。六项选中Django/DRF/schema wrapper均未采用，actualReturnedInvocations=0、model read/application annotation/material use=0，模型/目标/网络新增0，旧input/allowlist/答不升级。开发/探子token、USD和真人时间unknown。该工程能力仍不足以证明真实wrapped factory/descriptor/class/method请求；继续可变字段、动态handler和完整请求组合、官方账号实际复验及预登记收益比较，完整使用与正向实测收益尚未达。

AY7有限字段小步（2026-10-08）：v14复用transform按实际receiver identity保存显式typed字段对象，跨helper/返回共享；普通value保留有限复制，literal/unknown覆盖撤回旧typed字段，已复制alias和另一个receiver不串用。简单Python属性store保留实际RHS和effect失败顺序；augmented/delete/复杂目标及可见self setter/property具名。主先修复field constructor结果错拆receiver，再按只读核验的线索复现相同文本调用共用第一次结果；AST offset/sourceCallId/valueAnchorId现贯穿骨架、同一Python binder与投影。端到端有状态反例另暴露候选读取去重漏掉第二次实际采用，现接线按当前call ID选择而读取仍去重。主补跨文件基类新增setter红测，MRO类字节纳入candidateRevision，旧ordinary-store材料撤回而无关类稳定。

20新增反例、300focused/1085断言，新鲜联合1166pass/1平台skip/7018断言/115文件/11.01s和主/AY类型通过。两轮独立只读核验分别检查来源发生点与runtime身份/失效；主按具体出处补反例，不据零发现宣称穷尽，详见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-field-state.json)。真实[reviewed字段probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-field-state-reviewed-replay.json)核验94冻结文件及独立supplements，共100文件、6body/15简单store；机械窗口不是实验模型read，初始原件分留。application annotation/material use、模型/目标/网络新增0，旧input/allowlist/答不升级；开发/探子token、USD、真人时间unknown。动态handler、class/method/descriptor及ASGI/DRF完整请求仍待实际解释/采用，继续官方具名复验与预登记收益比较，AY7及完整使用/净收益未达。

AY7普通方法别名小步（2026-10-08）：v15将唯一无条件`handler=self.guard`的创建跨度/SHA、稳定原receiver及当前MRO override保留到同一binder/六角色/投影。实际采用必须保留ordinary创建且早于调用；错receiver、context省略创建、逃逸/重绑定及source变化不能连接。可见descriptor/getter、属性覆盖、wrapped/static/class/async target和owner均具名。独立source review复现static/class owner首参误充instance；主补decorated/async四项红测并修复，显式actual receiver也不能绕过。投影只读review的80项测试通过且未发现新缺陷，不作穷尽声明。23新增反例、323focused/1161断言，新鲜联合1189pass/1平台skip/7094断言/115文件/14.37s，主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-method-aliases.json)。

真实[reviewed方法别名probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-method-alias-reviewed-replay.json)核验94冻结文件和独立supplements，共100文件/6body/9别名，来源合格0，binding/receiver缺口保留；原始与reviewed原件独立保存且SHA相同。机械窗口不提供实验模型read，application annotation/material use、模型/目标/网络新增0，旧input/allowlist/答不升级；开发/探子token、USD及真人时间unknown。真实DRF/Django两条件handler及self.head字段alias不被该静态机制自动覆盖，继续有限动态选择/字段callable、完整请求及官方具名复验，AY7与完整使用/净收益未达。

AY7有限方法选择小步（2026-10-08）：v16保留同一稳定普通receiver的有限local method创建、当前target/SHA和原if/else路径；ordinary sentinel/token与既有choose在实际调用点分派，同一binder和六角色不变。未创建路径为UnboundLocalError/operation failure，顺序覆盖和重复target仍按原发生点；loop/try/elif创建、其它重绑定/escape和descriptor/wrapper保持具名。来源独立核验196项通过且未发现新缺陷；投影核验75项通过后指出仅逐variant检查不足，主红测复现改动一guard后另一合法variant仍可采用，现整体selector完整性先于逐创建/参数核验。复制extra call本来没有callee，原2 uses属于合法variant；保留该点验后按整体机械合同撤回畸形selector，未将探子线索当成已证实额外调用。入口初始化过晚和未创建失败出口被替换也已红绿。

27新增测试、350focused/1311断言、新鲜联合1216pass/1平台skip/7244断言/115文件/13.99s与主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-method-choices.json)。真实[reviewed有限选择probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-method-choice-reviewed-replay.json)核验94冻结文件和独立supplements，共100文件/6body，9别名仍具名，有限选择合格0/实际采用0；初始与reviewed分留且SHA相同。机械窗口不提供实验模型read或application annotation，模型/目标/网络新增0，旧input/allowlist/答不升级，开发/探子token、USD及真人时间unknown。真实getattr/fallback、字段callable、完整framework组合及官方具名复验继续，AY7与完整使用/净收益未达。

AY7普通getattr小步（2026-10-08）：v17以唯一无条件创建后的真实直接调用连接原receiver、selector/精确子call结果、当前普通MRO target与eager default来源；同一binder筛选参数可绑定的普通方法，ordinary token按实际selector生成后在handler调用点分派。default存在不证明属性不存在，未匹配属性和actual fallback选择仍具名；匿名`pick('guard')`实际返回值已沿精确call结果驱动选择，拒绝仍先于write。来源独立核验192项通过后指出literal仍列入所有同签名方法；主17额外方法红测复现已知selector被候选上限错误阻断，现先收窄再计上限。原runtime guard没有执行其它literal不匹配variant，来源精度修复与实际执行分开。投影只读核验45项/278断言通过且未发现新缺陷。

25新增测试、375focused/1407断言、新鲜联合1241pass/1平台skip/7340断言/115文件/14.83s和主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-method-lookups.json)。真实[reviewed lookup probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-method-lookup-reviewed-replay.json)核验94冻结文件和独立supplements，共100文件/6body/6 lookup边界，binding/receiver/owner缺口保留，来源合格与采用0。初始/reviewed分留且SHA相同，模型/目标/网络新增0、无实验模型read/application annotation/material use，旧input/allowlist/答不升级，开发/探子token、USD和真人时间unknown。继续条件lookup、fallback证明、字段callable、wrapper及完整framework组合和官方具名复验，AY7及完整使用/净收益未达。

AY7 lookup结构容量修正（2026-10-08）：主新增16候选/35块完整反例，先复现共享单元32块拒绝；独立只读核验又定位聚焦格式的单独32块限制，主沿实际source-update转换路径再次红测复现`focus-schema`拒绝。现由同一`SEMANTIC_BLOCK_LIMIT=64`供两处使用，helper返回已知guard时完整接纳/投影/执行且deny先于write；127 emitted-node和16终态路径预算保持，超限仍撤回本题规则。1新增用例，403focused/1550断言、新鲜联合1242pass/1平台skip/7357断言/115文件/11.42s与主/AY类型通过。只读65项/367断言的容量与边界核验另记；未改历史OWUI34块拒绝或真实source probe，实验model read/annotation/use与模型/目标/网络新增0，真实框架及净收益继续pending。

AY7条件lookup小步（2026-10-08）：v18将唯一getattr与有限普通method赋值的原if/else及try各区域连到真实handler调用，ordinary sentinel/token保持未创建操作异常和未知属性出口；default存在仍不证明缺失，直接else赋值fallback与getattr实际fallback分开。调用区域不进入token身份，同实参的try内外两次调用共用创建值；不同实参文本具名边界，避免按某一调用签名收窄共享创建。主来源/执行红绿后，11新增用例、414focused/1691断言、新鲜联合1253pass/1平台skip/7498断言/115文件/14.69s和主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-conditional-method-lookups.json)。来源只读197项通过后把分支外调用仍有候选标为错误；主原区域/sentinel点验及未知flag反例未复现错误执行，保留guard拒绝和UnboundLocalError/operation两条原路径，不添加会禁止正确异常路径的支配性要求。投影只读87项/587断言通过且未发现新缺陷，不作穷尽声明。

真实[reviewed条件lookup probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-conditional-lookup-reviewed-replay.json)核验94冻结文件和独立supplements，共100文件/6body/6 lookup。声明receiver下1个Django View.dispatch来源合格，指定应用receiver的3处lookup仍合格0（target-rebound/class-binding/receiver缺口），实际采用0；初始与reviewed分留，后者只新增声明/指定receiver资格分账。实验模型read/application annotation/material use/模型/目标新增0，probe网络0，开发/探子token、额外runner网络、USD及真人时间unknown。旧input/allowlist/答不升级。继续真实receiver字段mutation、class/wrapper、字段callable和完整请求，再官方具名复验；AY7与净收益未达。

AY7 receiver方法槽位小步（2026-10-08）：主红测确认helper已写`self.guard=self.fallback`，旧getattr仍执行class guard。v19在原ordinary方法创建保留机械methodRead，沿既有transform的实际receiver状态检查方法/default、后代字段和class槽位；未知写入同样具名，不猜新的字段callable。普通数据写入不再被whole-function mutation veto误拦，已创建alias后再覆盖保留原绑定，直接instance call重算当前来源事实；super不受instance槽位覆盖影响，原receiver构造的未知异常仍保留。直接call检查在嵌套实参之后，实参内改变槽位仍保守unknown，早期bound-reference capture继续pending。两个只读核验未发现新可复现缺陷，不作穷尽声明；主21新增用例、新鲜435focused/2027断言、联合1274pass/1平台skip/7834断言/115文件/15.65s和主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-method-read-state.json)。未增加谓词/模型角色、分支或执行预算。

真实[方法槽位probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-method-slot-replay.json)核验94冻结文件及独立supplements，共100文件/6body/6 lookup。APIView指定receiver的缺口从target-rebound变为class-binding；声明receiver仍合格1，指定应用receiver的3处lookup仍合格/采用0。模型read/application annotation/material use/实验模型/目标/探针网络新增0；开发/探子token、USD与真人时间unknown，旧input/allowlist/原答不升级。完整class/wrapper、字段callable和请求及官方实际复验继续；AY7、完整质量与净收益未达。

AY7函数对象边界小步（2026-10-08）：class/wrapper来源核对发现metadata写入不能统一当作普通data。主红测复现helper改`self.guard.__func__.__code__`后已创建引用仍错误执行旧body，匿名Python小程序确认实际bound method会执行替换body；v20将当前可定位的函数属性store留为protocol unknown，普通data继续既有transform，不猜替换实现。局部/模块/类属性/实例writer与公开import来源进入同一relation footprint，负type/MRO来源同样保留；外部type新增method撤回旧普通store材料，无关文件保持。循环不终止与class-local alias误指module同名函数已由主反例修复。来源探子报告的裸`self.saved`不等于module `saved`，主纠正该前提，再以真实class/instance连接复现并修复三个module alias遗漏。补修只读核验47项/173断言通过且未发现新可复现问题；另外两核验及不完整类型尝试分列保留，不作穷尽声明。

26新增用例、新鲜461focused/2113断言、联合1300pass/1平台skip/7920断言/115文件/24.76s和主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-function-attribute-stores.json)。新[函数属性probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-function-attribute-replay.json)验证94旧冻结及6独立补充文件；6执行候选body之外检查5个protocol body，17 stores中10个有函数来源边界，未解析的decorator参数不会因此取得class变换资格。声明receiver合格1、指定应用receiver合格/采用0；实验model read/application annotation/use/模型/目标/网络新增0，另有1次匿名Python语义核对，开发/探子token、USD与真人时间unknown，旧input/allowlist/答不升级。机械来源展开每store限128，原64块/127节点/16路径执行预算保持；class/wrapper实际变换、字段callable、早期bound-reference capture及完整请求和官方质量/收益继续pending。

AY7普通字段方法值小步（2026-10-08）：v21接通class/callable共用前驱，普通同instance的`self.slot=self.method`在原赋值点捕获实际receiver/target，经原transform跨helper保存，在原字段调用点按实际值分派。主红测复现普通token被当作方法及覆盖/错receiver后仍执行旧guard，另复现helper删除捕获metadata和移过提前return仍被材料采用；现分别在native身份与当前source创建/控制/相对顺序核验处撤回。后续源方法槽位替换保留已捕获target，函数对象属性变更继续v20具名边界；未引入按库名豁免、谓词或新模型角色。前两只读核验分别132项和133项/1165断言通过。主最终点验又红测复现短路赋值表达式内调用漏入顺序，移前capture仍被采用；现记录外层表达式call/short事件，右侧调用留在原控制体，另两用例和只读2项/20断言核验通过。三复核与主修复分列，不作穷尽声明；主补齐正/负descriptor字节与无关homonym检查。

31新增用例，新鲜492focused/2327断言、联合1331pass/1平台skip/8134断言/115文件/31.82s与主/AY类型通过，见[局部核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-field-method-values.json)。新[字段方法probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-field-method-reviewed-replay.json)核验94旧冻结和6补充文件，6候选body之外按声明receiver统计1个可能store/5个字段call来源合格；初始/reviewed报告分留，后者更新顺序事实，资格数不变；指定应用receiver的method store/字段call合格/实际采用仍0。source-invariant排除后不完整的正store图保守不采用。无实验model read/application annotation/use或模型/目标/探针网络新增，开发/探子token、USD与真人时间unknown，原输入/allowlist/答不升级；64块/127节点/16路径执行预算不变。跨receiver/任意closure/class/wrapper变换、早期capture、完整请求和官方复验及预登记质量/净收益继续。

AY7早期方法捕获小步（2026-10-08）：v22复用v21实际方法身份，在有嵌套实参call的普通同instance直接statement/assignment/return处先读取方法，再词法顺序执行实参，最后调用已捕获target。主红测复现实参覆盖slot后旧late read阻断原方法，补强断言又发现部分实现没有生成capture、却已去掉late read的假通过，现同时核验实际capture及fieldMethodRead。短路实参已有有限结果但缺机械来源映射，补入同一argumentFacts的简单valueFlow；原and/or结果沿同一binder传递，不扩大谓词或角色。主反例另复现多实参倒序和短路RHS追加调用仍被采用，现要求逐事件严格顺序与精确条件body。两只读核验无新可复现发现，后一份主要使用现有测试，范围分别记录，不作穷尽证明。

新[早期捕获probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-early-method-capture-replay.json)独立核验94旧冻结及6补充源码、6候选body，声明receiver下1处early capture合格，指定应用receiver下合格/实际采用均0；旧probe和实验原件保留。捕获前已覆盖、实参异常、短路跳过、未知基类/descriptor/wrapper/重绑定仍具名；外部target和负class/MRO改变撤回旧关系，无关homonym保持。无实验model read/application annotation/use或模型/目标/探针网络新增，开发/探子token、USD与真人时间unknown。实际class/wrapper变换、完整请求、官方复验和预登记净收益继续，AY7未完成。

新鲜验证为33新增、525focused/2676断言、联合1364pass/1平台skip/8483断言/115文件/33.76s及主/AY类型通过，见[早期捕获核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-early-method-capture.json)。源码probe SHA为`2cde2fc6f4a40d56211423dc65f8775207540e5321e62a972fefcef20ba8c0b0`；开发和探子用量未知不得以实验新增0替代。

AY7函数值与环境小步（2026-10-08）：v23让当前普通module引用和稳定外层参数local定义创建/读取真实source callable对象；参数/返回/alias/字段沿原有限核心保留身份，callback从实际对象取得capture而不是调用者同名变量。主红测先保留原函数参数未接线的失败，再对缺失/晚移/错环境创建和selector/unknown/额外call/effect逐一撤回。回调顺序挪过return、function参数属性写入遗漏也由主反例修复。候选来源传播不构成实际调用，完整source-read→interpret→material→native在真实propertyDirected设置下核验；裁剪删去创建图的材料当前保守不采用。

两次初始只读核验没有新可复现发现，主随后补测发现module generator被当普通callback、generator/async/wrapped创建者未阻断，以及generator consumer错误取得body执行资格，均红绿修复。另复现同module函数的各次读取都新建identity会漏掉前次function属性写入；现宿主module scope共享当前target/SHA身份，local invocation仍独立，非法module capture拒绝。最后只读复核395pass/2292断言及独立跨module/relay/mutation来源fixture通过，范围不含全量compiler审计；三复核与主补修分列，不作穷尽声明。

46新增用例，新鲜571focused/3018断言、联合1410pass/1平台skip/8825断言/115文件/20.08s与主/AY类型通过，见[函数值核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-callable-values.json)。[最终真实源码probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-callable-values-final-replay.json)验证94冻结及6补充文件，12body包含6原request候选及6实际schema/decorator/wrapper body；索引全域12模块引用/1局部引用/2稳定定义/1参数调用来源合格，所选body合格参数调用及实际采用0。SHA `51dc754caa97159ccdd15b612e60637f606d6cce3bfa6da1f73abb678fe0603c`；初始/reviewed/final报告与旧input/allowlist/答保留。模型read/application annotation/use与实验模型/目标/探针网络新增0，开发/探子token、USD、真人时间unknown。class/wrapper变换、完整请求、官方复验和预登记质量/净收益继续，AY7未完成。


AY7返回环境统一小步（2026-10-08）：v24移除v13的placeholder/implicit instance和caller capture重建，原factory定义创建实际sourceCallable，经唯一terminal return和原result/valueFrom传递；直接调用和普通/内联/转发参数从实际对象取得环境。caller局部重绑定不替换capture，factory可变cell/nested/default等边界保持。材料须保留原创建、return/result、if/try区域与严格顺序。主补creation挪过caller重绑定反例；初始fixture的writer被裁剪、证据无效，加入实际后续读取及writer存在断言后重新红绿，保留两份记录而不把无效fixture算实现缺陷。

两只读核验分别运行228pass/2024断言和215pass/503断言。后一项报告条件内联创建被接受；主核对当前合同后保留这种有原控制路径的候选，以跳过分支及creation挪出if/try的完整来源反例确认没有提前执行或错误采用，未增加重复无条件门槛。13新增，新鲜584focused/3272断言、联合1423pass/1平台skip/9079断言/115文件/20.07s及主/AY类型通过，见[返回环境核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-returned-environment.json)。[真实来源probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-returned-environment-replay.json)核验94冻结及6补充文件、12body，24返回定义/13实际定义合格，所选合格1；actual returned calls/arguments、application annotation/material use仍0，机械窗口不是实验模型read。SHA `11eb95492b4f5142f7c0b8ac39cef5621ee829cfbd4c304ea70bcb54112f7a01`；旧input/allowlist/报告/答不变。实验模型/目标/探针网络新增0，探子npx等其它网络与开发/探子token、USD和真人时间unknown。继续实际class/wrapper变换、完整请求、官方实际复验和预登记质量/净收益，AY7未完成。

AY7类引用身份小步（2026-10-08）：只读定位确认类实参仍是未绑定文本，v25据此在原实参读取处连接唯一稳定未装饰、无base/metaclass模块class的sourceClass当前身份。参数/return/valueFrom/alias/字段共享对象，重复读取不能清空之前的字段修改；不同类/普通token/局部覆盖保持独立未知。来源投影核验精确读取、当前target/SHA/import、原if/try及严格求值/同block顺序、唯一result和完整参数，不提供constructor、prototype或隐式decorator应用证明。

主16项预期红测转绿，补充外部class字节变化撤回未变caller材料、无关homonym保持、nested实参顺序及class修改后抛错/捕获再读对照。31新增，新鲜615focused/3464断言、联合1454pass/1平台skip/9271断言/115文件/20.22s与主/AY类型通过；两独立只读复核均未发现新可复现缺陷，主要基于现有测试，非穷尽审计，见[类引用核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-values.json)。[新来源probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-class-values-replay.json)核验94冻结及6补充文件、12所选body，全域19类引用来源合格，所选body合格/材料采用0；SHA `3b3c2692f1fd82a2e53afad9b0f67fdd576e6a2b346673743c0441350cce379a`。无实验模型读证据/应用标注，实验模型/目标/probe网络新增0，开发/探子token、USD和真人时间unknown，原input/allowlist/答不升级。继续实际decorator应用、class/method变换与完整请求、官方完整复验和预登记收益，AY7未完成。

AY7局部类定义小步（2026-10-08）：v26保留原function内class完整声明、namespace和decorator字节及原控制/顺序，将表达式从上到下求值、每次独立类创建、反向实际application及最终返回对象绑定接到既有binder/六角色/材料/native核心。普通literal字段、bare/imported与实际factory返回callable均有端到端对照；修改/返回scalar或新class/抛错保留，context不能删除application。无base/metaclass、方法/dunder/动态body及模块初始化边界仍保守；此步不假装已经采用真实应用模块装饰器。

主先修正unsupported predicate和effect异常预期两个fixture问题，再以有效红绿补dunder/class-cell、无raw call的局部shadow、formatted string body call被漏掉及returned closure中合格类定义。27新增，642focused/3938断言、联合1481pass/1平台skip/9745断言/115文件/20.91s及主/AY类型通过。两独立只读核验无可复现发现，均以现有测试为主、没有独立新fixture，范围见[类定义核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-definitions.json)。[真实来源probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-class-definitions-replay.json)核验94冻结及6补充文件、12所选body，全域7局部类/所选1类、合格及实际采用0；ExtendedSchema仍有base-unmodeled，SHA `502f40d9ca337e7d713da0bb44b796dc01bb839bee29ec75a54fa35dddd340bc`。无实验模型读证据/应用标注，实验模型/目标/probe网络新增0，开发/探子token、USD和真人时间unknown，旧输入/答/报告保持。实际继承/方法环境、模块类应用、原request及官方完整使用/预登记净收益继续，AY7未完成。

AY7局部类namespace/继承小步（2026-10-08）：v27保留原namespace内字段与普通同步方法的交错顺序，在类创建时保存实际sourceCallable及稳定直接外层参数环境；class属性中的函数沿原binder调用，不自动注入self。有限base资格来自同owner唯一稳定的先定义local class，实际创建仍须取得当前namespace对象并计算C3。主native/source端到端验证父类后续写入、子类覆盖、菱形顺序、两次factory环境、显式self/keyword及原if/try；缺失/伪造/晚移的方法、base、capture、SHA、calleeRead或参数撤回材料。跨层capture/super/class cell、动态base、module初始化及constructor不借静态候选获得执行资格。

主红绿另修class原声明误计rebound、dunder写入后沿过期MRO继续、mutable default和17 base错误资格；两题program的计数fixture及运行前cross-layer fixture更正不作为产品缺陷。39新增，681focused/4187断言、联合1520pass/1平台skip/9994断言/115文件/21.55s及主/AY类型通过；两独立只读复核均无可复现发现、以现有测试为主且没有独立新fixture，范围见[namespace核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-namespace.json)。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-class-namespace-replay.json)核验94冻结及6补充文件、12所选body，全域7局部类/所选1类、合格类与base/method事实、namespace调用候选及实际采用均0；ExtendedSchema保留动态base-unmodeled，SHA `8ce20c2c65dfb35adf2b638c88d7168c1fbef36754d194d9c8a3273d012f2d80`。原报告/input/allowlist/答不升级；无实验模型读证据/标注，实验模型/目标/probe网络新增0，开发/探子token、USD与真人时间unknown。继续动态BaseSchema/跨层方法环境、模块类应用、原request和官方完整使用/预登记净收益，AY7未完成。

AY7跨层稳定参数小步（2026-10-08）：v28沿词法最近绑定保留祖先parameter owner/SHA，将已证明普通nested helper/class method的free parameter需求逐层relay到返回closure；原定义创建实际sourceCallable环境，实际调用不从caller同名变量重建。匿名端到端验证两factory环境、class/local/deeper helper与function-valued祖先参数；最近参数遮蔽、local值/重绑定/nonlocal/global/match/lambda/wrapped/default/cell边界保持。主红绿补修类方法捕获名未进入lexicalNames而误借module/import同名函数，保留16/17容量反例。初始caller重绑定writer被性质裁剪，trace确认后补真实if读取和writer存在断言；该fixture失败不算产品缺陷。

两只读复核分别431pass/3092断言和338pass/825断言，以现有测试为主无独立新fixture。后一项指出implicit captureOwnerId仍标记直接relay owner；主核对所有消费者确认当前只是隐式参数truthy标记，未复现runtime caller环境重建；另写精准owner断言红测后修为原binding owner，并保留伪造origin拒绝。20新增，新鲜701focused/4315断言、联合1540pass/1平台skip/10122断言/115文件/22.32s及主/AY类型通过，见[跨层核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-transitive-capture.json)。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-transitive-capture-replay.json)核验94冻结和6补充源码/12body，61 capture事实/2祖先事实、relay事实/合格/采用0；24返回定义/13合格/所选合格1，ExtendedSchema仍base-unmodeled，extend_schema.decorator仍nested-scope-unmodeled。SHA `3fe6811437b86a5d144df2a884713bb0cf62aef43650f34dad007c9d5cc68000`；旧input/allowlist/报告/答不升级。无实验模型read/应用标注，实验模型/目标/probe网络新增0，开发/探子token、USD、真人时间unknown。继续局部callable对象捕获、动态BaseSchema/super/cell、module应用/constructor/原request及官方完整使用和预登记质量/净收益，AY7未完成。

AY7局部函数对象capture小步（2026-10-08）：v29只接纳普通class method直接调用同一创建owner内唯一稳定、无条件先定义的ordinary helper；helper按原valueCallable合同创建实际对象，方法保存该对象，调用从它保存的环境读取capture。来源proof固定点收敛后才暴露边，重绑定/nonlocal/global/未知cell/递归/default/escape与嵌套实参动作仍具名，native协议/六角色/预算不变。主两factory环境、caller同名重绑定、拒绝后effect及创建/环境/callee/参数篡改和源码失效反例通过；17新增，718focused/4419断言、联合1557pass/1平台skip/10226断言/115文件/22.35s及主/AY类型通过。额外nonlocal检查原已通过，没有产品修复声明。

两只读范围未发现可复现缺陷，来源核验284pass/638断言并有独立nearest shadow/forward/conditional/recursive/nonlocal小例，投影核验6pass/147断言与binder2pass/10断言、以现有测试为主，见[局部函数核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-local-function-capture.json)。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-local-function-capture-replay.json)核验94冻结与6补充文件/12body；28局部函数值定义/15合格、函数capture事实/调用候选/采用0。is_in_scope的methods在上层改写，仍capture-rebound；ExtendedSchema仍动态base-unmodeled。SHA `1bd90778c0a04ffda2cf8e9914bd17bc5aa78d0c89949ce9bb489bd4c5f0ed3b`；无实验模型read/应用标注，实验模型/目标/probe网络新增0，开发/探子token、USD、真人时间unknown，旧input/allowlist/答/报告不升级。继续稳定改写后capture环境、动态BaseSchema/super/cell、module应用/constructor/原request与官方完整使用/预登记净收益，AY7未完成。

AY7捕获前参数改写小步（2026-10-08）：v30将创建前完成的parameter preparation与创建后的mutable cell区分，保留全部plain assignment原source/owner/SHA/control/order/RHS证明；actual sourceCallable在原创建点保存当前对象，returned capture用environmentBinding指向原写入而不借初始factory literal。普通计算local值、晚写、aug/delete/loop/walrus/nonlocal/global/match/unknown scope继续具名。主17新增；初始9红中一个direct-helper断言取错proof的fixture更正，8个有效预期失败转绿；source-absent同名writer漏检另以4红复现并修复。两个旧负例原为创建前写，现改到创建后保留mutable-cell断言，不称产品回归。

新鲜735focused/4553断言、联合1574pass/1平台skip/10360断言/115文件/22.95s及主/AY类型通过。两只读复核分别294pass/664断言与169pass/2655断言，均以现有测试和静态抽查为主、无独立新fixture，见[捕获准备核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-capture-preparation.json)。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-capture-preparation-replay.json)核验94冻结/6补充源码、12body；67 capture/5准备事实/4合格/7写入，30局部函数值定义/19合格，24返回定义/16合格。真实is_in_scope来源gap消失；methods列表计算尚无执行证明，ExtendedSchema仍动态base gap、实际采用0。SHA `cb8663984555d88fefc4656c7ff0e9fd9bee997ddceb3e000c7790182cc03765`，无实验模型read/新应用标注或模型/目标/probe网络执行；开发/探子token、USD、真人时间unknown，旧input/allowlist/答/报告保留。继续动态base/super/cell、module/constructor/request、官方完整使用与预登记净收益，AY7未完成。

AY7动态标识符基类小步（2026-10-08）：v31以原sourceClass/binder/六角色接入owner parameter和创建前完成simple assignment的local identifier基类；写入来源/control/order/RHS及binding owner/SHA完整保留。actual base必须已有namespace/MRO，native按实际身份重新计算C3，函数参数和return保留该class对象。dynamic parent不供静态继承target，自有namespace ordinary方法仍须actual callableRead。匿名两factory不同base的继承字段/自己方法/返回身份及拒绝先于effect通过，duplicate actual/module marker和漏/改/移/额外writer拒绝；晚写/unknown scope/复杂base语法保持。主24新增；初始11pass/10fail转绿，conditional wrong-write未改变source的fixture更正不算产品缺陷。

新鲜759focused/4685断言、联合1598pass/1平台skip/10492断言/115文件/18.09s与主/AY类型通过。两只读核验312pass/710断言与175pass/2741断言，均以现有测试和静态核验为主、无独立新fixture，见[动态基类核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-dynamic-bases.json)。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-dynamic-base-replay.json)核验94冻结/6补充源码/12body，首次保留BaseSchema的1动态base和2写入事实，ExtendedSchema由base gap推进到method-cell-unmodeled。复杂RHS实际执行未证、合格类/实际采用0；SHA `0a103efe53ee3467877dc340bd07560e3d0b1b7cd010676496c00ae7dda4d26b`。无实验模型read/应用标注或模型/目标/probe网络新增，开发/探子token、USD、真人时间unknown；旧input/allowlist/答/报告保留。继续普通实例、super/class cell、module/constructor/request及官方完整使用和预登记收益，AY7未完成。

AY7普通局部实例小步（2026-10-08）：v32把同owner稳定、完整已知ordinary local C3的零参数默认构造连到原source call，sourceInstance保留独立对象和actual class/MRO。alias/参数/return/field保真，实例slot先于当前namespace；实际普通方法对象保存原环境并显式传同一self。constructor原区域、严格顺序、result/唯一writer与callee/参数均为材料采用合同，context不能删除。两个只读范围发现class-read绕过实例slot和dynamic基类误获默认构造资格，主Bun红绿确认并修正；另补self identity。native独立inline反例实际执行，source独立Vitest脚本在import.meta.resolveSync处失败，主复现与独立验证分账，见[普通实例核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-ordinary-instances.json)。

37新增、新鲜796focused/4872断言、联合1635pass/1平台skip/10679断言/115文件/24.22s与主/AY类型通过。[新真实probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-ordinary-instance-replay.json)核验94冻结/6补充文件、12body；7构造缺口，合格构造/实例方法候选/实际采用0，ExtendedSchema仍method-cell-unmodeled。SHA `23e7178bd53fcf4a4cf0fbe851b4ae2ef1bc59d8b27e7d650bdb1d2dee5a7f14`；无实验模型读/应用标注/模型/目标/probe网络新增，开发/探子token、USD、真人时间unknown，旧input/allowlist/答/报告保留。未知dynamic构造协议、自定义constructor/descriptor及返回实例未知方法目标保持具名；继续super/class cell、module/constructor/request、官方完整使用和预登记净收益，AY7未完成。

AY7实际class cell小步（2026-10-08）：v33在ordinary local namespace method创建时把原class-original对象保存为隐式__class__；显式cell读取、alias/返回与装饰器替换public类仍读取原对象。机械骨架参数固定value，材料要求精确cell捕获、原control/order、完整目标参数与类型，caller/public替代或缺/改/移均撤回。super内/外call仍具名未执行，实际C3后继查找下一步接续。新增红测发现v32未支持constructor作为context时漏掉阻断，现local class协议gap在context/effect前实际发出unresolved；旧v32原件保留，不追改其核验结论。

18新增、新鲜814focused/4985断言、联合1653pass/1平台skip/10792断言/115文件/25.57s及主/AY类型通过；两只读各跑既有套件无新独立反例，见[实际class cell核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-class-cells.json)。[冻结源码probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-class-cell-replay.json) SHA `f53ce003de789136d894a0b3c234548e7e28d8c0d674db5d567eff72cccf76ea`核验94原冻结/6补充文件、12body，恢复1类/16method/16cell的来源资格，36super缺口仍在，实际材料采用0。无新增实验模型读、应用标注、模型/目标/probe网络；开发/探子token、USD、真人时间unknown。既有六角色/谓词/预算与原input/allowlist/答/报告保持；继续actual super、module/constructor/request、官方完整使用与预登记净收益，AY7未完成。

AY7实际super/C3小步（2026-10-08）：v34以原__class__ cell的实际identity定位receiver instance C3后继namespace，绕过instance slot，保留原sourceCallable的identity/captures和绑定receiver。读取发生在实参动作之前，后续namespace覆盖不替换已保存函数；caller不能替代cell或self。源码保留原inner-call anchor、control/order和≤16有限候选，实际function token决定diamond后继。材料完整核验分支及每个分支实参；新增反例发现未选择分支错误self只在链接点校验可能漏阻断，现复用同一actualArguments在采用前校验全体候选。

30新增、844focused/5211断言、联合1683pass/1平台skip/11018断言/115文件/25.42s及主/AY类型通过；两只读仅验证现有套件、未构造新fixture，见[实际super核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-super-methods.json)。[冻结源码probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-super-method-replay.json) SHA `76422bda9ba9b6c20c47877876a6ca626c512ccfacee2103dc8d8408549deb1a`核验94原冻结/6补充文件、12body，仍有36super和7constructor gap、实际super候选0/材料采用0；未知外部动态父类的实际MRO尚未执行。此为机制工程证据，未完成真实class/module/constructor/request或官方完整任务/净收益。原输入/allowlist/答案/评估器/分母和旧结果保留；新增实验模型读/应用标注/模型/目标/probe网络0，开发/探子token、USD、真人时间unknown。继续AY队列，不勾选AY7。

AY7 schema runtime来源接续（2026-10-08，关系仍v34）：按原pin补充5文件，[来源清单](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/source-provenance/schema-runtime-source-v1.json) SHA `a8967b374ceadb7e99b0e40902ecd20b24244fa79bcff2505878b22de8eb0caa`、[105文件probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-schema-runtime-source-replay.json) SHA `e586bcfce39a8c34ea6b02f24ded2fa4b196138b5dd8b53eecd2b5e8b425d6ac`确认三个静态MRO及继承构造器/描述符。DefaultSchema.__get__实际需要APISettings字符串import、inspector构造和view setter，不能按ordinary协议豁免；配置字面不等于部署求值。模块definition/descriptor仍pending，36super/7constructor缺口、材料0。初次probe误用prefixed qualifiedName exact equality失败，改用现有resolveName后通过；生产代码未变。捕获3次GitHub API读取/1次源下载、另2次web定位失败；probe模型/目标/网络及应用标注0，其它成本unknown。旧来源/输入/allowlist/答案/评估器/分母保持，继续module/class/constructor/request及官方完整使用/收益。

AY7显式module初始化小步（2026-10-08）：v35把非空Python模块作为完整原文覆盖的独立源码单元，根class/function保留原声明/控制顺序创建，复用实际namespace/C3/装饰器返回和原native对象传递。根class不借用旧local method语义；模块函数按原声明和当前实际函数对象调用，嵌套实参动作及未执行导入/全局环境/协议仍明确阻断。实测匿名流程中，class字段、继承、instance和decorator返回替换都影响真实后继分支；不从来源资格推出应用执行。

30新增；初次RED 24失败，补充反例暴露声明前decorator读取与target SHA两个漏洞并修复，最终30通过/234断言；874focused/5445断言、联合1713pass/1平台skip/11252断言/115文件/50.42s和主/AY类型通过。只读索引review构造独立反例；材料review没有独立fixture，提出helper依赖静态疑点，主线程确认module创建变化撤回root footprint、真实源码变化撤回同文件所有symbol，并未复现stale采用，见[模块初始化核验](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/reviews/ay7-module-initialization.json)。

[105文件probe](../../results/skill-ir/skill-dsl-research/development/authorization-question-closure-v1/verification/paperless-module-initialization-replay.json) SHA `64ef2ec088c12799cdd964963456a6e3e7718ef5d9ffbe5d6ab6690b1046e76a`保存99非空模块、394 class/361 function声明事实，来源合格1 class/54 function不构成实际使用。ViewInspector仍body-unmodeled，DefaultSchema/AutoSchema仍base-unmodeled；12选定body有0super/1constructor gap、全索引36super/12constructor gap，实际材料0。root范围新增使constructor数量与旧7不可直接比较。原证据/输入/allowlist/答案/评估器/分母保留，实验模型/目标/probe网络新增0，其它成本unknown。原模块环境、constructor/descriptor/request及官方完整任务/AY22/净收益继续，AY7未完成。

### 7.61 AZ 性质抽象材料采用与真实检查的开发决定

2026-10-09，对外部模型评议做源码/原件复核后，用户要求编写并派发下一开发任务。[AZ0–AZ18](../superpowers/plans/2026-10-09-authorization-property-abstraction-and-real-use.md)使用gpt-6.1-sol/max，方法合同见[spec§14.39](skill-ir-aot-optimization-spec.md#1439-az-property-abstraction-and-real-use)。本节初始记录是开发决定，不是AZ效果结果。

**已核实根因。** [property-dependencies](../../src/task-dsl/authorization/property-dependencies.ts)把全部可达call/return/raise作为种子；[property-demand](../../src/task-dsl/authorization/property-demand.ts)继续要求所有可达call角色与条件，领域种子主要调整优先顺序。[operation-work](../../src/benchmarks/authorization-dsl/operation-work.ts)把类装饰器变换加入框架工作。这导致一个授权问题不断扩大为语言语义解释，缺少“本性质需要知道哪些行为”的适用抽象。下一轮在原图之上做性质需求与摘要边界，不把未知直接丢掉。

**外部评议纠偏。** AY实际14尝试/10交付/2不可用/2失败，并非14完整成功。OWUI v35的自然答遗漏空字符串collection/提前返回，Download遗漏全局GET权限/部分owner条件，两次独立评阅均partial。OWUI没有接受单元，而Download已有3单元/30步骤/2次采用；不能推断所有领域贡献为零。无模型注解的离线probe材料0也不能单独证明运行采用失败。AH实际Markdown8/11→8/11，DSL5/11→7/11，其稳定收益仍未建立。

`inquiry-result.ts`的整体safeParse与缺题诊断已防止坏question被过滤后整体有效，复核8 tests/40 assertions通过；原代码不需要增加同义拒绝层。`control-conclusion.ts`已有逐题/逐路径和条件结果。真正要补的是投影/连接失败原因、采用流水和对外状态含义。AY manifest中的acceptance为要求、closure为结果，命名易误读；AZ改为requirements/outcomes，旧原件不变。

**方法取舍。** 保留现有结构索引、MRO、有限控制、procedure-summary、source-materials及官方账号。新性质区分授权前置、检查/效果对象一致、效果可达与操作完成。局部摘要说明参数/对象、条件、返回、副作用、异常、适用范围、残余及撤回条件；模型解释与机械核验、独立语义复核分开。源中未知影响仍保留，不通过放宽checker或删原问题制造成功。

**协议与评价。** v6格式失败有独立有限修复预算，但每次失败计入总工具/调用/成本；原策略兼容。端到端分母包括未交付和协议失败，已交付语义正确率另列；共享缺陷当场修复、具名重测，旧首件保留。三臂N/M/D共享原任务事实与允许源码，M/D同一领域核心；先前D作者稿加工不能免费成为独有事实。D失败不能无限推迟N基线。单性质仅为里程碑，最终回到完整原skill问题。

**外部机制。** [CodeQL库模型](https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-python/)提供输入/输出摘要的工程参照；[Absentia](https://arxiv.org/html/2610.00977v1)的入口、不变量和反证组织可借鉴，但[其仓库](https://github.com/avduarte333/Absentia)在本次核对时未发布完整实现，不能登记为已运行外部基线。[Paralegal](https://www.usenix.org/conference/osdi25/presentation/adam)面向Rust隐私政策，[Semgrep Multimodal](https://semgrep.dev/blog/2026/idor-detection-benchmark-semgrep-multimodal/)强调授权检查与效果对象；借机制并记录适用范围，不把这些资料的数字移作项目收益。一次静态工具无发现不足以证明本工具更好。

本次实际借入的是CodeQL输入/输出与适用条件的组织方式，落在procedure-summary的参数/返回、当前实参及源码失效；未导入其value/taint模型作为授权证明。Absentia的入口→关系→反证对应当前property query及错对象反例，源码归纳出的不变量仍不是用户规范政策。Paralegal的政策与依赖图分工对应保留完整图、再按性质反向取需求，未运行Rust分析器。[Semgrep CE 1.180.0校准](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/verification/external-capability.json)以本地YAML规则扫描3个匿名非执行fixture：错对象1发现，修复/正常各0，错误0；仅匹配同一函数内显式检查表达式与效果表达式，不处理alias/跨函数/框架。商业Multimodal未运行，也不把这个窄校准称为目标应用基线。

**顺序与边界。** 先补诊断/恢复，再做性质与摘要，尽早验证Download单性质，然后完整Download/OWUI、两包、三变化及12位置比较。新identity为authorization-property-abstraction-v1；研究输入仍是已暴露development。账号授权保持，但旧记录提示额度至2026-10-14 16:47，是否恢复须看当前证据；不可用时做独立工程，保留未运行状态，不更换第三方通道或宣称研究达成。本轮后续问题、修复和实测统一在本节更新，§1/§11同步。

AZ1诊断工程（2026-10-09）：投影现在明确报告版本/来源/依赖筛除、入口角色、调用身份、目标歧义和实参绑定失败，仍保留有效局部材料。[零调用重放](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/verification/material-adoption-v35.json)保留原归档SHA及原check；Download的3份可用材料实际采用2次，首阻断是material-target-unavailable；OWUI无接受材料，首阻断是material-root-missing。9红→9绿/60断言、相关215测试/3228断言与主类型通过；新增模型调用0。此为采用可观察性，尚无新真实任务或效果结论。

**AZ实际收束。** [summary](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json)按原件重算：单性质首件0解释提交，修正后1提交但0接受；Download M首轮2提交仍0接受，三次均耗尽格式预算，无当前机器检查/结果。空模板修复了当前Schema的可见性，没有替模型填源码含义，也没有增加预算；同因一次修正后停止重抽。自然答案独立评价为单性质首件partial/修正full（仅窄题），完整Download N full、M partial；M具体遗漏继承的GET全局view_document条件，不能把列出权限类名当作分析该条件。N读原源码直接完成同一完整任务，未获得旧答案或评价器。

质量快照为cef00a3c，主面板N/M/D同一native入口、原完整skill、自然brief及共同预算；D首轮在tools=0时被官方workspace routing discovery failed终止，usage未知。保留12质量分母（2交付、1未交付、9未运行），两消费及六变化也未运行；结论inconclusive。D原作者稿4/11题与N/M规范化1题不同，需将作者拆分与准备成本作为表达比较限制。可见已知input5,283,565、output23,823、cacheRead4,686,976已含input，失败D用量及USD/隐藏请求/开发/探子/真人分钟保持unknown；不把5个可见会话当provider请求数。

离线包含空格外部路径check通过，95文件与原问题字节一致；当前partial单性质会话的搬移保持current，政策/前提/源码变化均needs-review、answerReused=false，当前0材料恢复/采用。新增政策同时把behavior改成conformance，不能称纯policy-only收益；既有该类确定性合同单列。1713pass/1平台skip、模板相关109pass、study/汇总8pass及类型检查是工程证据。完整框架语义摘要、完整原任务D链及真实变化复用未达，停止外围语义扩张；保留明确可证伪的下一责任：机制须在实际提交→采用→性质检查中生效，再评价收益。

### 7.62 BA 从真实拒绝到可用语义编辑

2026-10-09，复核基线29c400ff与用户origin一致，工作树干净。用户要求接续任务书并派发gpt-6.1-sol/max开发。[BA0–BA18](../superpowers/plans/2026-10-09-authorization-semantic-submission-and-adoption.md)和[spec§14.40](skill-ir-aot-optimization-spec.md#1440-ba-semantic-submission-and-adoption)记录新要求，发布任务书时尚无BA实施或实测结果。

**原件说明的实际障碍。** AZ三次领域运行都formatBudgetExhausted，acceptedSourceUnits/materialUses/checkHistory均0。对`single-download/format-contract-1/public-report.json`的`telemetry.account.toolRejections`复核：第一项把frontier中的field/value写进annotations，给出delegated、delegate、operation-failure等不合法值；第二项role=guard被拒，后面却混入unit/candidateId/另一个schemaVersion的要求。这来自[inquiry-focus](../../src/benchmarks/authorization-dsl/inquiry-focus.ts)的union及[账号Ajv全错误收集](../../src/adapters/codex-account-session.ts)，不能把候选分支报错当成真实focus已切换。第三项答案使用gaps与behavior模式的not_assessed；其后的形状有效检查仍因格式额度封闭被拒。

**语义问题还在下一层。** 同一原件`domain.focus.sourceInterpretations[0]`记录role改为condition后已经进入lowering，但只给自然解释、没有有限predicate；另有必要调用角色未填。草稿可以保留，完整unit尚未成立。因此“减字段”必须连同可填写的语义前沿、实际编译和材料采用验证，不能只改提示词或把无predicate放行。

**通道和比较的纠偏。** AZ的D会话为已终态failed/workspace routing discovery failed，quotaRefused=false、host tools=0，不能推出账号永久不可用。[AZ runner](../../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/study.ts)把单次失败映射为unavailable并停止后续17位置；原记录保留，BA新增一次同通道有目的恢复，重复同因/明确额度拒绝再暂停，未知完成不重复派发。另经runner与summary复核：三臂自然prompt相同，但D使用旧作者拆成4/11题的inquiry，M规范化1题。BA主比较须共用同一原问题映射及核心语义输入，旧作者稿单列消费。

**开发取舍。** 增加一个版本化语义编辑视图，宿主填写事务、版本和身份，模型填写带类型的局部含义，编译到原SourceInterpretation/有限控制；不另造平台。模型看到的slot与实际payload一致，Schema/说明/示例/解析共源；按选定分支输出精确错误，有限格式重试不封死剩余合法检查。合法草稿、完整单元、实际采用、性质检查、源码完整质量分别统计。保留旧协议、源码/对象/版本检查和unknown，不自动把错误枚举改成允许结论。

**验收和新研究问题。** 先从公共wire跑通源解释→采用→检查，随后回两完整skill、12位置同条件比较、两消费者和6变化。关注编辑接口改善是否转化为实际程序采用，以及程序采用是否改善原问题质量/复用；两者分别可被否定。当前只有57 tests/331 assertions的定向复核和代码/原件证据，没有BA效果。真实运行出错需当场定位、共享修复和具名复验，避免把已知坏实现跑满，也不以更多通用语言语法替代关键使用链。本节继续记录本轮缺陷、解决与实际结果。

**BA共享工程阶段（2026-10-09）。** 新source-edit是原SourceInterpretation的带类型输入适配：当前事务由宿主给出，模型按field/value编辑；role/explanation未齐的合法字段保留为草稿，条件散文仍不能替代有限predicate。原AZ role=guard参数经实际官方静态校验，从8个union分支错误变成1个role/允许值错误，原参数和旧评分均未改。预算原红测显示第一次拒绝即少一次纠正、耗尽后有效检查封闭、非检查提前少用2个位置；修订后首次拒绝有2次纠正、第三次进入finalOnly、有效检查仍可执行，下一次无效交付关闭工具。native/inquiry同会话记录实际总量与检查额度，不扩大总预算。

公共受限mock从读源码和公开空表单生成编辑，经wire/focus/lowering/projection得到1个源单元、1份材料、1次使用及bound性质，检查trace非空；官方与structured inquiry两入口均通过。匿名属性写入产生的未知异常仍保留为整体缺口，局部checked不推出整题或源码含义正确。定向182 tests/1394 assertions和主typecheck通过。此阶段真实模型调用0，BA5反例、真实采用、同题面板、作者消费和变化效果仍待完成。

独立核验后增加真实当前check断言，红测确认格式拒绝曾只撤回machineAnswer、仍保留旧当前check。修订将格式无效和新提案的交付/性质检查一起失效，历史checkHistory保留；当前形状有效但整体语义失败的性质诊断仍单列，不抹去局部检查。最终同组182 tests/1395 assertions及主typecheck通过。

**BA7/8准备。** 有界通道分类和公平输入先各红测，再共享接线。两原任务M/D现在读取同字节common inquiry、同program、同源码和完整skill；整段原请求保留为q1并记录逐句原文偏移，N保留原自然输入。M的普通v6前端显示naturalTask/原事实，D1显示声明，宿主程序及工具一致；旧4/11题作者包只进入消费位置。预检两任务通过，真实加载仍待各attempt的thread/start及instructionSources证据。恢复只在ready真实位置核实原failed生命周期后一次，不以历史失败永久封闭，也不增付费探针。此阶段研究/入口8 tests/70 assertions、相关native/account44 tests/337 assertions及研究typecheck通过；尚未派发。

**BA9首轮与共享修复。** `pilot-download/original`从29b5a832经普通native入口完成同账号有界恢复。实际system含完整22318字节skill，原请求完整；25个动态调用加39次自动读耗尽64总量，3次格式拒绝、1次语义检查。4次合法编辑、1份保留草稿形成1个包装单元/1份材料/1次使用，0绑定及checked性质，终答partial。helper虽部分已读却未解释，ownerless/owner/Guardian分支遗漏；GET权限在PaperlessObjectPermissions中覆写，不能误判为空。原答匿名独立评价的这个错误经源码纠正，原件及裁定保留。

轨迹定位到共享层：旧sourceUpdate指引与edit并列；return/raise提供不合结构的effect选项；当前解释未完成即自动展开，接受包装后装饰器的serializer候选挤过直接helper；同性质的其它source未绑定占位被当成重复绑定。分别先红测，再将v6编辑设为主指引、角色共用lowerer约束、当前事务暂停自动展开/已接受父源后优先直接调用、显式绑定优先于声明占位。未知框架边和错对象/提前返回/未知helper仍保留。静态无效final也花真实总量，因此可用检查次数取语义额度和实际剩余的较小值；不为保留两次检查退还失败成本。受影响1736 pass/1 skip/11424 assertions、主类型检查通过，两个只读独立复核无必须修复发现。具名复验前不得推断这些工程变化已改善模型质量。

首轮input1,338,020（已含cacheRead1,172,352）、output6,550，123,983ms；上下文原始6,279,106字节经既有无损编码发送2,613,607字节，仍有装饰器长参数重复的待核验减负线索。USD、隐藏provider请求及开发探子费用unknown，失败和恢复成本均保留。首轮机器闭合及完整任务效果未达，主质量板暂停到确认共享缺陷修复；同输入具名复验计入同一逻辑位置。

**同输入transaction-priority-1。** bfa29a6d的普通native复验completed：44动态调用+20自动读取，13次解释提交/9合法编辑，接受7源单元和54控制步。7份材料均current/available，使用仍只有entry1次，0性质绑定/检查；终答补上owner/grant分支，但仍漏实际receiver继承的GET模型权限，匿名源码复核partial。两个旧格式提案把propertyBindings放到annotation内；两个final先多questionId、后missing给string，严格拒绝符合合同，4拒绝后交付关闭。原提案及失败成本保留。

对“宿主丢了六个helper/entry已生成call”的独立核验意见，主代理点验原blocks后否决：entry把self.file_response解释为primitive effect，blocks中没有call；7材料仍保存且available，投影diagnostics为空。因此该提案没有通往helper的可执行调用，不能归因投影遗失，更不能自动把模型的effect改成另一个语义。source接受/直接helper调度有进展，完整采用链仍未成立；Download同因重抽暂停，独立OWUI位置继续。input5,552,133含cache5,325,312、output19,322，325,896ms；原始context10,450,766字节、编码后2,264,838字节。更多接受单元没有证实任务质量或成本收益。

本轮归档Git校验发现results强制text规则会损坏新增gzip；只为BA压缩文件增加binary规则，从未变本地原件重新暂存，并验证index字节、CRC与JSON。历史结果不改。新增零调用汇总器复用既有纯计量/固定12位置面板，首件与修订逐行保留、22位置分母及未运行原因不删、unknown不填0；2红→2绿/14断言和研究typecheck通过。

**OWUI独立位置与第二层归因。** bfa29a6d同预算completed：45动态调用+12自动读取，7解释提交/183合法编辑、接受5单元/108控制步；1格式拒绝后两个有效形状检查都执行，未耗尽格式预算。5材料中root因material-callable-creation-invalid不可用，0使用；1性质绑定unknown、轨迹空。input3,817,636含cache3,528,960、output20,991，389,606ms。自然答案解释owner/admin文件查找、独立目的collection、bypass、删除/追加/重复与具体剩余限制。第一次匿名意见把全knowledge读写删算作原题要求；主代理核对原brief后否决，新独立复核按原题判full，完整知识接口审计不能追加为扣分项。允许源码未建模的上游与部署配置未知仍明示，机械采用依旧失败。

精确源码1695的save_docs_to_vector_db具有模块函数值证明，原unit却无创建步骤。匿名同步版通过、await版红测；expressionFlow沿await操作数递归后第一层修复通过。原提案零调用重放仍拒绝，进一步点验发现前后db.commit/len/log调用保留为property-residual名的unresolved，既有顺序证明只识别实际call/context/effect等来源事件。第二匿名例增加前后未知调用后再次红测；lowering仅让此类调用保留context-<anchor>事件名，kind/reason/unknown及不完整状态不改，严格投影校验器完全不改。两个根因分别验证，不能把第一次匿名通过冒充真实问题已解。

**减负责任。** 两Download轨迹同一装饰器待办question为10,651字节，多候选重复携带长schema参数。调度散文现在只保留512UTF-8字节内的完整参数，超出显示长度及原行查阅指引；结构索引、依赖hash和框架unknown不变。12KiB匿名装饰器红→绿证明预览有界且原参数仍可取回。该工程减负尚不证明实际token、质量或复用收益。

原提案零调用重放完成：相同annotations/unresolved，仅更新宿主revision及生成步骤，5材料全可用、1entry+2call使用，原2未解释项及单元不完整保持；3个缺失/错源/晚建creation反证全部撤回root。未匹配数据库callee和router-options仍具名阻断，不能将派生3使用回填原运行的0或算真实检查成功。新受影响回归1739 pass/1 skip/0 fail、主/研究类型与15文档测试通过，两个只读复核未见必须修复代码问题。该阶段汇总3attempts/2pilot，随后具名普通OWUI复验如下。

**具名复验与外部阻断。** 11dc68a5的`pilot-owui/await-argument-read-1`在17,632ms后终态failed/workspace routing discovery failed，quotaRefused=false，0模型动态调用/2宿主启动读取，无答案且usage未报告。完整原skill/system和原题加载记录仍一致；性质checks/trace不存在，不填0伪装已检查。首个Download已用唯一同通道恢复，故当前paused-recurring-routing，无活动/未知完成，不轮询、不换模型或经普通CLI绕过。原压缩档、claim/report、空终答及外部lifecycle保留，20未运行位置逐项记录；3个previous变化另缺合格当前Download基础。修复实际采用与同版质效仍未验证。

**包恢复与剩余工程。** 重新检出会保留作者声明/Usage而缺可再生成源码树，原准备器在metadata已存在时不补源码，匿名红测复现公共check失败。BA薄包装先核对两份metadata原作者字节，再按原允许来源补缺失树并沿原admission/源码哈希检查，已有源码不覆盖、原作者语义不修。匿名恢复/幂等/错metadata拒绝绿测；两实际包搬移核对95/173文件哈希一致、0模型/目标执行。另补AZ预算混合序列，5实际尝试中3格式拒绝/1语义检查，语义失败无当前结果；这只是原已修工程的回归覆盖。新增定向14 pass/112 assertions、主/研究类型通过。普通CLI的check/init/搬移和native帮助实际零调用通过，完整消费仍受阻，不能升级为BA13实测。

**当前归纳。** 22逻辑位置、4尝试、3自然交付、20未执行、12质量全未运行，比较inconclusive。已知3份input10,707,789（已含cache10,026,624）、output46,863；第4份usage unknown，累计114动态调用/73自动读取、857,117ms，USD/隐藏请求/开发探子/真人成本unknown。工程修复和原字节可恢复已有证据，完整真实采用、普通两包消费、变化复用和质量增益均未建立。最小恢复先要新的外部路由证据，再登记新OWUI修订并取得合格当前Download基础；本轮不继续付费重试，研究目标及有限队列保持未完成。最终分项见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json)与[verification](../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/verification/final-closure.json)。

### 7.63 BB 跨函数性质闭合的复核与开发决定

2026-10-09，用户提供第二轮外部架构评阅并要求派发`gpt-6.1-sol/max`开发。复核基线ad936715与用户origin一致、工作树干净。新[BB0–BB16任务书](../superpowers/plans/2026-10-09-authorization-interprocedural-property-closure.md)与[spec §14.41](skill-ir-aot-optimization-spec.md#1441-bb-interprocedural-property-closure)已执行至真实比较和部分包消费，随后按用户明确要求提交并停止，状态paused-by-user；本段分开记录开发依据、工程和真实效果。

**调用关系的真实缺口。** [source-interpretation](../../src/task-dsl/authorization/source-interpretation.ts)的effect/context分支先生成对应步骤，普通emitCall在另一个分支。[projection](../../src/benchmarks/authorization-dsl/source-material-projection.ts)只为kind=call连接callee。因此“host的调用关系天然不受role影响”不符合当前执行代码。BA Download修订的7材料仍可用，但entry把self.file_response解释为primitive effect，没有生成call，正好暴露此接口问题。新实现应保留源调用结构和语义侧面，同时避免把调用或effect标签当成效果已发生。

**跨单元不止查找。** [property-query](../../src/task-dsl/authorization/property-query.ts)的binder接受单skeleton，局部anchors/annotations限制了引用；[control-conclusion](../../src/task-dsl/authorization/control-conclusion.ts)的性质检查又按同source/SHA找guard/effect。接线还经过[property-dependencies](../../src/task-dsl/authorization/property-dependencies.ts)，不能只改runtime签名。完整skeleton/interpretation属于focus/runtime，SourceMaterial并非它们的完整副本。

源码anchor是语法位置，不是运行对象。helper的actor与caller的user可以是不同anchor但同一实际对象；同一个helper anchor在两次调用中也可作用于不同对象。全局resolver既不能证明对象等价，也不能证明调用可达。新方案沿已有actual/formal、receiver、返回与alias关系，使用当前source/revision及call instance，检查guard顺序、分支、权限和真正到达的effect。未知、过期、歧义、未注册来源分别报告。

**绑定与判断的区分。** v6 binder对principal有局部身份约束，但并不要求guard和effect的两个resource anchor相等；对象一致性留给后续检查。合法的“检查A却操作B”查询应得到有据的violated或信息不足的unknown，不必一律以格式错误拒绝。查询也应能问“是否缺少必要guard”，不能先要求提交一个不存在的guard。

**对真实记录的纠偏。** BA OWUI original已记录1个bound query和2次语义检查，并非真实query始终为0。该查询在propertyAnalysis的逐需求依赖中，检查保留property-source-effect-unadopted/开放依赖及空trace；所以bound未形成实际机械闭合。root此前的await创建/残余顺序有明确红绿和同提案重放，不能仅根据material-root-missing倒推出middleware跨函数是根因。真实middleware/路由注册若进入BB，只按原始源码验证。

**已有基础的复用。** [semantic-flow测试](../../src/task-dsl/authorization/semantic-flow.test.ts)已有跨函数形参映射与对象隔离，[source-interpretation测试](../../src/task-dsl/authorization/source-interpretation.test.ts)已有转发、关键词/字面量和嵌套调用，[projection测试](../../src/benchmarks/authorization-dsl/source-material-projection.test.ts)已有entry/helper/super联系与缺失/错源反例。因此没有依据说“旧测试全是单函数”。待补的是公开read/edit到当前材料、查询和检查的组合反例。

**渐进解释的取舍。** 现有[source-edit](../../src/task-dsl/authorization/source-edit.ts)已经保存合法草稿，显式unresolved也能进入不完整单元。BB进一步区分可用片段与阻断本性质的未解释点，改善当前前沿和采用；不把缺role自动补成context/no-effect，不删除相关未知分支/异常，不用整体modelCovered放宽替代确实需要的源码读取。逐性质隔离相关依赖，完整原题仍保留全部义务。

**本轮顺序。** 先用错主体、错资源、同helper两次调用、未注册守卫、控制顺序、权限含义及过期引用等正反例修共享核心，再从native/inquiry公共入口检查实际采用。随后分别验证Download与OWUI，并回到完整原skill原题、同事实N/M/D、两原包消费和三变化。局部性质检查可先形成合格基础，局部复用据此评价；整题未达仍明确标出，不借局部完成改写完整任务质量。

**实验和恢复。** BB新登记16逻辑位置，首件/修订/epoch分列，相同attempt引用不重复计量。BA原件和20未运行保持。BB在核实无活动/未知完成后可用就绪真实pilot同官方账号gpt-5.6-sol/high重新进入；连续两次routing终态失败或累计三次恢复仍失败则暂停，成功任务仅重置连续计数。quota/auth立即暂停，unknown先核查原生命周期，第三方API保持暂停。该规则在BB8实现验证前只是一项合同。

**评价和外部借鉴。** 原问题自然质量、协议交付、材料采用和性质检查分层报告，协议失败仍在端到端分母，另报有效答案质量。不采用“失败超过某比例才重要”或“全部历史实验均无效”的笼统推断。[Absentia](https://arxiv.org/html/2610.00977v1)支持源码图/模型推理分层、沿调用核验授权关系及变化依赖的设计参考；[Paralegal](https://www.usenix.org/conference/osdi25/presentation/adam)提供领域属性和源码依赖分析分工的参考。本项目仍须验证模型解释和实际采用，不借用外部工具的证明保证或论文效果数。BB不会继续用外围Python/Go语法支持数代替当前授权关系闭合。

本节后续追加实际开发问题、处理、真实运行和未达责任；同时更新§1与§11。工程、完整实际使用、研究收益分别验收。

**BB1–BB7公共工程。** v7以实际owner的当前限定ref定位跨单元guard/effect，沿既有actual/formal、receiver/return及instance对象而非anchor拼写检查。所有源码call保留，effect/context成为附加领域含义；caller的effect只选后代真实效果，提前返回/抛错不虚构发生。P1–P3、N1–N9、U1/U2经公共source_read/edit链验证，错误对象、晚guard/缺guard和read/write不匹配给violation，未注册middleware/过期跨题引用及相关unknown给具名unknown。两个公共入口均以mock模型从原始源码编辑生成2单元/1call采用/非空跨源trace，没有注入semantic units，也没有真实账号调用。

渐进恢复红测发现两个额外共享问题：切换focus按focus id丢失合法partial字段；重复绑定被拒绝后下一check还能恢复旧verdict。v7改为源handle/revision草稿，并将当前hard source拒绝带入检查直到纠正；新源码读取仍失效。所有残余留在完整任务，独立effect之后unknown不笼统阻断已覆盖的局部性质。补充指引测试又发现v6旧说法与v7采用冲突，当前phase按版本选择实际合同。12文件联合425 pass/4447断言、主typecheck通过，新增指引后公开链21 pass/209断言。只读核验提出“声明占位与显式绑定应冲突”的意见经spec§14.40和既有反例否决；显式绑定优先于占位是已有合同，两份显式绑定仍严格拒绝。当前证据只判工程，BA派生重放和真实使用继续。

**BB7/8原件与派发准备。** 原unit/draft、program和checkHistory以压缩fixture保留，新增Git binary例外防止text过滤。公开重放起初遗漏source_symbol候选供应，并把显示裁剪视图当完整anchor全集；点验实际索引证明原来源SHA/id一致，修正为实际source_symbol结果选位及完整owner skeleton。仅宿主revision迁移，12份原解释annotations均保持原字节字段，新增含义0。Download 7材料/5采用、OWUI 5材料/5采用，原BA 1/0及原成绩不改。额外未解释caller/callee、框架与局部query unknown保留，派生检查不是模型实测；见verification/ba-derived-replay.json。

恢复runner已核实BA failed lifecycle SHA982ab021...、无active/unknown。共同原任务M/D使用同份声明/源码/skill，N保留完整自然brief；两原作者包声明/Usage字节相同，95/173允许文件预检通过，实际消费pending。独立只读核验后补付费并发排他、第三次恢复失败阈值、failed部分文本不算delivered、评阅使用原输入快照并验hash，均先红→绿；计量保留input含cache与cache子集，已有inputIncludesCache合同和测试，未采纳“二者已经相加”的错误意见。研究15 pass/60断言、公开重放1 pass/8断言和研究tsc通过。仍无BB模型调用，下一步真实Download pilot，不额外探针。

**BB9首件与局部修复。** pilot-download/original官方completed，完整bundle前缀和原题实加载均true。5解释提交/48有效编辑，仅1单元与1入口采用，1当前性质unknown且trace为空。input3,153,475（含cache2,738,048）/output11,663；USD/隐藏请求未知。独立原题评阅partial：根授权与版本族/原归档选择有据，但漏注册viewset、GET模型权限、存储路径/文件条件和部分异常；局部自然关系不能升级机器闭合。

最早阻断为file_response解释中的resolver调用被附guardBranch，后续把guardRef改到condition却保留旧调用字段。当前edit只能赋值，完整annotation替换可清除但需要切换兼容接口，故补可选annotation字段value:null显式删除；不自动移动guard、补对象或权限。匿名公共链先红于wire null拒绝，再绿于明确清除后重新采用/检查，72 pass/565断言；缺condition仍报缺口，清除不存在字段不消除unresolved。原草稿零调用点验只移除该误填字段，原结果不改，具名optional-field-clear-1以新epoch复测。material-target-unavailable在helper尚未接受之后出现，不支持把首因归为receiver/projection缺陷。

**BB9具名复测。** optional-field-clear-1官方completed；3提交/39有效编辑、2单元、2采用（1入口/1调用）、16控制步骤。input2,559,542（含cache2,342,656）/output9,283；完整原skill/原题加载true，USD/隐藏请求未知。独立原题评阅full，补齐GET全局权限、非法/无关版本、删除版本与文件存在性条件；其自标partial是机器状态，不代替自然语义评价。公共联合428 pass/4483断言、BA原件派生重放1 pass/8断言通过。

机器仍1性质unknown/空trace、查询未绑定。原草稿点验显示入口参数保持value，helper参数由模型标为principal/resource；helper内部将request本体标principal并不等于已建request.user关系。类型拒绝符合实际提交，未支持探子提出的“宿主type-link缺陷”，不得自动提升类型或补查询含义。3次格式拒绝耗尽格式额度，两检查用完，总预算61/64；模型未调用null清除，不能证明真实采用或把增量归为该修复。保留首件与修订，以完全同输入/源码/skill/epoch/模型/预算/入口/方法核验后将修订引用为Download M位置，成本与样本去重；参考工具先红绿、零付费调用。

**BB10首件与共享顺序修复。** OWUI官方completed，完整原skill/原题加载true，11提交/49有效编辑/7单元/115控制步骤，8材料但0采用/性质unknown。自然原题独立核验full，说明普通用户仅自己文件、admin主键读取、collection独立选择、bypass及错误/下游隔离边界；并未假设目的collection归属。input4,150,868（含cache3,875,584）/output14,969；25回调、45/64预算、1格式拒绝/两检查用完，未耗尽总预算。源码full与机器unknown分别保留。

探子初报仅归因解释缺口，主线程点验projection发现更早的入口material-callable-creation-invalid。原callback创建及db.commit/len/log真实顺序保留，但proof.order.after还要求后续if的choose-anchor；缺condition将它lower为missing-同anchor，错误地使合法partial入口整个不可用。v7只恢复该unresolved branch的原顺序名，不生成predicate/body/guard；不改结构索引或严格validator。匿名公开链before/after红于材料误拒绝，inside仍拒绝；最小修复后相关233 pass/3436断言，另补duplicate/misnested反例。原17条根注解不增不改，零调用当前处理0→7材料采用，结果保存verification/owui-source-order-diagnostic.json；不认证性质，不把派生采用计实测。

只读代码复核未发现顺序修复阻断。引用工具评阅的“wx会覆盖旧文件”经study.write的flag=wx原文否决；不为它增加重复gate。claim是派发前全身份权威来源，report只重验其实际持有的attempt/input/epoch/method/strategy及实际加载证据；补method/strategy不一致红绿。新pilot引用须具名追加并保留旧文件/history，仍费用/样本去重。源码修复产生新epoch，旧Download M引用仅作历史，新主面板需补齐。

**BB10具名真实复测。** 5fd3d5f7 / src tree7100b13f的source-order-marker-1保持原输入，官方completed/自然文本delivered，8提交/101有效编辑/8单元/129步骤、10采用（1入口/9调用）。原件creation误拒绝不再挡入口；两性质unknown/空trace，principal未绑定、重复property binding、effect未采用及route/framework开放依赖分别保留。24回调、48/64预算、格式拒绝3/两检查用完，非总预算耗尽；input3,063,681含cache2,880,256/output13,396。独立自然评阅partial：主要对象关系准确，完整load/error及empty/default条件未充分展开；line67已明确add=False早返，不接受评阅初报的完全遗漏。内部知识库caller调查属补充，不扩写原题范围。语义result被拒绝与官方自然文本已交付不是同层失败。未证明新共享根因，不重复抽样；同epoch配对与剩余队列继续。

**BB11同版完整比较与评阅裁定。** src7100b13f六主位置的源码、原题、skill、模型/努力/预算及实际加载核验通过，M引用去重、旧epoch引用保留。Download N/D自然full，M新配对partial；OWUI N/M/D自然partial。主线程按关键原文修正探子评语：Paperless子类GET要求全局documents.view_document，不能沿用DRF默认空映射；File与默认file-ID命名collection仍是不同资源，不能据命名推身份；模型将helper request标principal而caller为value不是已证宿主缺陷。OWUI D根只有两个缺condition未知分支，没有actual callable creation/body，严格拒绝与匿名inside反例一致。没有新共享根因，不加抽样。

Download N/M/D input分别694,702/2,896,542/3,062,681，output4,849/10,611/12,906；OWUI N/M/D input666,987/3,063,681/3,375,259，output6,956/13,396/15,369。缓存包含于input，仅计一次；两个任务N/D自然等级相同，D token更高，USD/隐藏请求/作者与开发代理成本及真人工时仍unknown，单次开发观察不支持稳定方法收益。完整身份与首件/修订见[quality-panel](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/quality-panel.json)。

**BB14反馈体积点验。** Download M/D实际lifecycle工具回答135,239/124,897 bytes，N为228,356；raw工具归档1,270,440/1,487,606 bytes中的重复完整domain并未发送给模型。不能用大report或raw.output.domain推断实际输入冗余，不据此加增量反馈修复。计量见[feedback-volume](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/feedback-volume.json)。评阅CLI曾拒绝登记的uppercase N/D位置，已改按既有positions核对ID，真实失败+红绿9 pass/37断言与研究typecheck通过，不改实验src epoch。

**BB12原包与用户暂停。** Download inquiry消费者completed，原声明4827字节及Usage字节保留，完整原skill和四个原题请求实际加载；合并自然brief不是本入口传输形式，其字面缺失不等于漏题。3提交/32编辑、2单元/16步骤、8采用（每题入口与调用各1），49宿主回调、56/64预算、1格式拒绝/两检查；原包四题性质均undeclared、resolver未解释，无合格跨函数基础。自然答案独立partial：GET全局权限及版本helper引用、无参数与无版本行的404条件仍有缺口；不能用机器unknown代替自然评阅。input2,938,052（含cache2,455,168）/output14,440。

OWUI native消费者已加载完整原skill与11个原题请求，原声明/Usage保留；Usage模型注入未观测，不声称全部作者说明已被模型消费。用户明确要求停止后，本地runner及直接子进程退出；已有33个宿主回调/33原工具记录，但无server完成终态或最终答案。中止生命周期与工具原字节压缩保存，status标completion-unknown，原dispatch.lock保留，不能重发。末次可见input5,465,192（含cache5,196,672）/output5,229只是中止前部分usage，不并入已完成总量，最终usage/耗时未知。

**暂停范围与计量。** 16位置中10已尝试、6未运行，共11个去重真实尝试、10自然交付；完整原题full共4份包含首件/历史，不能当作当前质量面板4份full。三个fresh变化已准备但按用户要求零派发，三个previous仍缺当前同方法/epoch、checked或violated且有实际跨源trace的基础。已完成尝试input26,561,789（含cache24,095,872）/output114,442，known duration2,845,086ms；中止尝试最终量、USD、隐藏请求、开发/探子成本和真人分钟unknown。当前结论为development比较观察、净效果inconclusive；有限队列和研究目标都未完成。本次只保存、验证和发布已有工作，后续用户重启先核查未知生命周期与原派发锁。分项见[summary](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/summary.json)、[accounting](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/accounting.json)。

**2026-10-10重启与未知处置。** 用户重启后主线程及独立只读核验确认原生命周期/工具SHA未变，267事件/33工具调用，无turn/completed或turn/interrupt；原thread/start明确ephemeral=true、path=null，同ID本地会话无匹配，本地原进程及直接子进程不存在。原临时线程无法据现有记录续跑，终态/最终费用仍unknown。用户随后明确选择保留未知原件、允许一次consumer-owui-native/user-resume-1新运行并继续原队列；授权与原锁按字节归档，原report/raw/部分usage不改。仅这一已批准原尝试移入retainedUnknownCompletions历史，其它新未知仍阻止派发，详见[恢复审计](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/resume-audit.json)及[人工处置](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/user-resume-1-disposition.json)。三种变化原题和输入SHA已复核，源码变化仅root_doc→request_doc；新增模型结果在本节后续记录，不据处置本身推断消费或效果。

**具名消费者超时及限定fresh继续。** 新运行在原45分钟上限后本地退出，315事件/21工具记录中仍无server终态，无自然答案，全部11题请求实际加载。7接受单元、32采用（8entry/24call）属于最后可观测机器状态，原包没有声明性质、未保存性质verdict，不代表消费验收通过。input13,798,358（含cache13,563,008）/output9,593为末次部分usage，最终量与USD未知。用户明确批准保留两次未知原件和费用，仅继续三个已登记fresh各一次，不再运行OWUI；新锁和raw按字节归档，见[限定处置](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/user-resume-1-fresh-disposition.json)。真实timeout报告暴露“非null usage对象被当最终量”的聚合缺口，红测后按unknown status/terminal排除并单列partial；29研究测试/137断言及研究类型通过，独立核验无重复计费问题。

**政策fresh当前观察。** 同src7100b13f、原题与skill，completed/22宿主回调；3提交/10合法编辑、2单元/15步骤、2采用。16当前source-demand query候选全部unbound，1原性质unknown、trace空。最早保留诊断是callee尚未解释，终态关键helper calls缺role；源码原稿和validator点验没有新宿主误拒绝依据。自然答案独立partial：根检查/版本返回及精确对象政策冲突判断正确，但未解释PaperlessObjectPermissions的GET全局documents.view_document要求，也缺非法/跨root版本和latest-or-root默认边界。机器unknown不是自然partial的依据。input2,222,495（含cache2,006,528）/output9,980。该中间记录时前提fresh待运行；三个previous仍无合格consumer基础，不把fresh当复用收益，最终结果见下一段。

**其余fresh与最终分项结果。** premise在工具使用前终态workspace routing discovery failed，0回调/0单元，无答案/usage；该失败进入分母、费用unknown，没有重抽。source按原恢复规则进入，completed/37回调、6提交/53编辑、2单元/17步骤/2采用；结构调用已映射pk/request，但caller为value而helper要求resource/principal，检查semantic-argument-unbound有据，不按同名自动提升类型。30当前query候选全unbound、原性质unknown/trace空。自然partial：正确识别request_doc授权和file_doc可能不同，但缺GET全局权限及latest-or-root回退；“missing version”在已列无query分支的表格中属含混，不擅自判为必然反转无query行为。input3,254,253（含cache3,003,520）/output12,499。三个previous因无合格当前consumer基础保持blocked，fresh不证明复用。

**验收与重放限制。** 15去重尝试/12自然交付、16逻辑位置13已尝试/3previous未运行；known input32,038,537（含cache29,105,920）/output136,921，两OWUI部分量单列、premise量未报。accounting.durationMs为本地已观测时长之和，含timeout，不能当未知服务器最终耗时。源码/研究测试425/29及两类型通过；本次完整重放发生运行时崩溃、一次取消和idle超时，原中间归档保留，历史完整结果不改。隔离OWUI profile在157ms提取原件后，createInquiryTools准备180.53秒仍未返回，提案阶段未进入；只定位阶段，内部根因未证，不写语义引擎修复。完整授权范围以completed-with-unmet-criteria收束，finiteQueueComplete仍false、researchGoalAchieved=false；各责任及后续最窄诊断见[验收矩阵](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/acceptance-matrix.json)和[收束](../../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/authorized-execution-closeout.json)。没有额外OWUI或fresh重抽授权。

### 7.64 BC 任务性质准备与跨调用修复

2026-10-10，用户要求复核BB最后三个fresh并派发gpt-6.1-sol/max继续开发。基线b1aa7b4c已与origin核对，工作树干净；[BC0–BC14任务书](../superpowers/plans/2026-10-10-authorization-task-binding-and-replay-reliability.md)及[spec§14.42](skill-ir-aot-optimization-spec.md#1442-bc-task-binding-and-replay-reliability)登记为planned-not-started。本次未修改生产代码、未新增模型实验。

**结果复核。** BB验收矩阵与accounting支持15去重尝试/12自然交付、真实跨源性质trace为0，policy/source fresh交付partial、premise routing未交付；两OWUI未知及部分usage保留。当前同epochDownload N/D full、M partial，OWUI三臂partial，D未显示稳定自然质量或成本优势。新鲜公共跨函数入口和BB四组研究轻量测试51 pass/362 assertions；没有重跑已知卡住的完整重放，也没有把归档425/29及typecheck称为本次新验证。

**三个可执行断点。**

1. 原包性质前端未闭合。BB `study.ts`消费者加载`model/packages/{download,owui}/inquiry.json`，分别4题/11题，properties均未声明；`model/inputs/*-common.json`是另一个输入，各1题/1性质。不能混淆两者而误判宿主吞字段。[property-query](../../src/task-dsl/authorization/property-query.ts)从问题properties或binding.proposed创建声明；[inquiry-focus](../../src/benchmarks/authorization-dsl/inquiry-focus.ts)的v7指引描述refs，却不附加旧PROPERTY_ABSTRACTION_GUIDE的无声明proposed说明。模板Schema虽可承载proposed，普通路径缺清楚的准备阶段。修复从实际渲染红测开始，再独立准备有来源的任务性质；不要期待模型先找到effect才能决定要问什么。
2. 跨调用解释尚不协调。Download caller把request/pk留为value，helper标为principal/resource，`semantic-flow`在实际参数与形参类型不一致时拒绝有据。应把两侧源码、对象来源和精确待修字段放进同一修复责任，再让模型从原文改正。request与request.user、标识pk与document对象有不同含义；自动提升value会制造错误通过。宿主继续负责实例/引用/失效，而不是替模型填写正确语义。
3. 准备慢点未定位。隔离180.53秒停在createInquiryTools；当前walk只遍历允许路径且排除无关目录，接着顺序读文件、词法索引、构建AST。不能说成扫描整个工作区，或从内存压力推定AST根因。现有准备缺细粒度进度与取消接口，下一轮先记录各阶段/文件，再修实测热点。普通运行和派生重放共用一条实现。

**选择与权衡。** 继续扩大实验面板会重复消费未生成性质、未对齐角色的输入；自动放宽类型会丢失对象一致性保证。BC选择复用v7、补显式task-binding-v1的前端与修复，暂缓外围语言语义扩张。首先让Download原四题经普通原包取得一条有实际跨源trace的checked/violated及独立源码支持，再做同条件N/D和三变化。局部合格基础按具体性质/源/epoch判断，不硬编码consumer位置；完整原题与局部复用分开报告。原包未改，准备sidecar和所有模型费用可追溯。

**授权与限制。** 新Download队列使用已授权官方gpt-5.6-sol/high；两旧OWUI未知不改，OWUI只做离线迁移。BB最后source-fresh已有completed终态，不能把整个账号当永久不可用；新unknown仍只核查原生命周期。第三方API、held-out/Q1、prospective/readiness和历史0/6不动。

**开发记录追加规则。** 后续在本节按“具体失败→代码/输入原因→修改→公开路径/真实采用→仍未解决”追加。记录准备阶段前后耗时、性质准备成本、调用修复是否真的被采用；以原件支持效果，不用测试数量替代真实成果。

**BC0接管。** 实施基线ee1a0522，现场干净，继续skill-ir-aot，仅用户origin。11个Download位置、同模型/预算与两旧OWUI未知按字节来源登记；[继承责任](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/inherited-failure-responsibilities.json)区分目标和实际失败。登记测试先红于空队列、后绿1test/5断言；无模型请求。准备故障仍先分段实测，不从内存或总超时猜根因。

**BC1准备定位与修复。** 173文件/3,149,729字节的原OWUI scope实测walk/加载/词法约310ms，完整基线80.59s；config.py解析29ms而事实提取50.85s。单文件CPU样本将主要热栈定位于sourceStoreOrder重复提取兄弟语句事件，非全盘扫描。仅当前AST内部memo后19.72s，加入拥有且可终止的事实worker后21.58s；原文件清单、源码身份及结构revision均相同，见[对照](../../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/preparation-comparison.json)。worker传递纯语法事实，主线程仍用现有关系器；取消先等待worker退出，后处理按调用批次让出执行。无模型语义缓存/持久缓存。18准备回归/119断言与361结构回归/947断言通过；两个公开入口取消后零派发。仍约12s后处理成本，不宣称全部热点已消除；本次真实准备完成后才进入原件派生重放。

**BC2实际指引接线。** 红测从无properties的原自然问题经公开read/select取得实际interpret视图，确实缺property-query-undeclared。v7现在在当前问题未声明时说明proposed形状、四kind和本题精确requirement跨度；已声明时不重复建议。没有附加冲突的旧v6采用指南。公共链23tests/234断言通过，保留跨题/stale/duplicate/null清除拒绝。该阶段只是提示接线，独立任务准备仍由BC3承担。

**BC3任务前端。** 配置由现有strategy承载`task-binding-v1`，继承v7内核而不改默认或另造CLI。严格任务提案只含kind、当前问题精确requirement跨度和可选permission跨度；ID由宿主生成，不收源码锚点、答案或verdict。原声明不替换，原包不写，全部原问题按序保留；性质之外的完整职责仍是residualRequest，缺政策明确needs-clarification。provider的prepare阶段与native的authorization_prepare_properties共享准入，前者请求计量、后者工具计量均保留，非法提案最多一次定向修订，两次失败不建domain。红测先证入口不识别配置及前端缺失；联合96tests/671断言和主tsc通过。接线重构一度影响旧domain scheduler的shown过滤，按原条件恢复并重跑通过。此时仍无BC真实模型请求，自动性质含义的实际质量待BC9。

**BC4冲突与撤回。** 当前调用求值保留结构化value→principal、value→resource mismatch，包含调用实例/参数/表达式；修复需求只从当前源SHA/revision与call/parameter anchors生成，定位两侧原行。task-binding focus自动回到保留的调用方草稿，模型可转helper更正角色，宿主不升级类型。材料拒绝亦保存原实参与提案差异，重复owner列出而不任选。红测发现编辑器已清空propertyBindings后，lowerSourceInterpretation仍从previous map带回旧绑定，导致checked复活；现以显式root数组整体替换（空数组保持撤回），省略仅保留当前数组。公开测试覆盖清空→重查unknown→其他字段编辑仍unknown，双调用实例、过期源和定向focus。370tests/4146断言通过；手写匿名含义只算工程验证，真实对象联系和普通原包效果尚待后续。

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

| ID | 问题 | 当前依据 | 接下来的判断 |
|---|---|---|---|
| Q1 | 哪个任务范围共享领域语义？ | 固定来源的授权职责支持 principal/resource/operation/control/evidence；混合职责单列，见 §4–§7.10 | 保持单 repo/ref、源码可见的授权切片 |
| Q2 | 声明如何带来实际行为？ | BB原包4题/11题无properties，v7缺无声明准备指引；实际采用尚无跨源性质trace | BC从原问题准备性质，再经公开入口绑定/检查；准备成本及全部原题保留 |
| Q3 | 为什么仍漏决定性源码或分支？ | caller value与helper resource/principal冲突有据；重放卡源码准备，内部热点未证 | BC定向修复两侧对象解释，先分段定位准备；不自动改类型或扩语言语法 |
| Q4 | 领域方法相对好说明的增量是什么？ | BB同epoch六臂：Download N/D full、M partial；OWUI三臂partial，D token更高 | 当前development观察不支持稳定净收益，USD及作者成本未知 |
| Q5 | 作者和变化复用是否可用？ | BB Download原包partial/8采用，OWUI两次未知；fresh两partial/一routing失败，previous三blocked | BC保留原包并系统生成sidecar；局部previous按实际同性质合格基础判断，完整任务复用另验 |
| Q6 | 本地化路线如何处理？ | 保留 §8–§9 设计及结构回填反例 | 暂缓；重新选择该类时再处理，不混入授权验收 |
| Q7 | 如何评价和计量？ | BB16位置/15去重尝试/12自然交付，known input32,038,537/output136,921；两OWUI终态/最终量未知、premise量未报 | 保留部分量与完整分母，已批准执行收束不升级finiteQueueComplete或研究成功，USD/隐藏/开发/真人仍unknown |

决策沿革：

- **2026-09-19 / S：** 宽保存约束转换为主选，依据为任务结构与纸面推演。
- **2026-09-20 / D：** 转为窄本地化探针，得到回填与生命周期证据，也暴露结构反例。
- **2026-09-20 / E/T：** 回到外部任务选类，收窄授权切片；固定真实案例、政策来源、独立答案及首版消费路径。旧本地化 I1 暂缓。
- **V–AN：** 逐步实现传输、领域关系、作者输入、修改与材料准备；同材料比较没有稳定表示收益。具体方法修订和结果保留在 §7.19–§7.33。
- **2026-10-01 / AO/AP：** 从固定材料转为任务内只读取证；AP 修复共享 Schema、诊断和检查预算，旧 AO 分母保持。
- **2026-10-02 / AQ：** 调度、三值分支求值和结论检查已有实现，真实交付退化与完整链缺口保留；继续加图字段不足以让模型顺利使用。
- **2026-10-02 起 / AR：** 宿主工作队列、局部解释和机械减负连同现场修复一起推进；每个真实失败及时处理，不再把已知坏实现跑满。当前记录见 §7.36。
- **2026-10-05 / AS：** 局部选择/效果与同源结果已共用，两原skill及作者原稿实际消费；机制改善有原件，完整质量/变化复用/净收益未达，以completed-with-unmet-criteria收束，责任见§7.48。
- **2026-10-05 / AT：** 持久解释事务、宿主身份、纯有限摘要、显示/读取/源码终检与通用词法修复已经实现及实际使用。12质量首位置0完整；4native原始自然说明充分2但formal0；4忠实稿消费均partial；fresh变化4partial、previous2阻断，37原件556/556。有限队列以completed-with-unmet-criteria收束；当前限制、真实修复和计量见§7.49。

- **2026-10-08 / AY：** v5初版已接通，账号0.160.0的Download具名尝试与OWUI首/修订实际交付，均源码partial、结构终答缺失。OWUI修订6单元/3实际投影；receiver值绑定、枚举合同、按receiver的框架footprint与静态Depends组合已红绿修复。当前零模型回放找到11middleware注册/11方法，具名阻断尚未证明的框架采用，完整ASGI/DRF链仍未达。总token增加、fresh下降分列，真实净收益未建立。DRF保留GET→download声明和22项来源工作，identity订阅找回继承dispatch，mapping binding与invocation未证明，类wrapper继续阻断。纯转发参数包已绑定，普通class decorator来源进入当前队列/精确依赖，变换采用仍0，真实dispatch alias和闭包handler仍待；联合1091pass/1平台skip及主/AY类型通过；整文件SHA粒度、原件、全部成本与独立裁定保留，22首位置和完整队列见§7.60。

- **2026-10-09 / AZ：** 有界性质/摘要/依赖与采用诊断、有限格式恢复落地。5尝试/4自然交付，单性质未闭合，N/M源码full/partial，D官方路由失败；17位置未运行，比较inconclusive，completed-with-unmet-criteria收束。见§7.61。

- **2026-10-09 / BA规划：** 原参数/代码和57项回归复核后，转向宿主管理语义编辑、精确协议反馈、可用检查预算、临时通道有限恢复和统一问题分母。任务书交付时未运行新实验，后续证据统一更新§7.62。

- **2026-10-09 / BA实施与阻断：** 编辑/预算/公共核心、事务调度、await与残余来源顺序及包恢复已有有界工程证据；4尝试/3交付，Download两答partial、OWUI原答full但无真实checked链。唯一恢复后再次终态routing暂停，20位置未运行，12质量无配对、比较inconclusive，实际消费/复用未测。发布工程与失败证据不标研究目标达成，恢复责任见§7.62。

- **2026-10-09 / BB规划：** 外部评阅经代码/原件核实后，转向调用与领域角色分离、调用实例中的对象传递、跨单元性质检查及渐进采用。保留现有多函数基础、bound/checked区分和全部原问题，新增v7及独立有限通道恢复合同。BB0–BB16已登记并准备派发，尚无BB实现或效果；见§7.63。

- **2026-10-09 / BB公共链：** BB1–BB6与匿名双入口已接通跨源真实call采用、对象/控制/permission反例和渐进恢复。合法partial字段跨focus保留，无效新绑定不能恢复旧verdict。联合425 tests及补充公共链21 tests通过；原件派生重放/恢复runner和真实16位置仍待执行，不能据工程测试宣称研究效果；见§7.63。

- **2026-10-09 / BB首件：** Download官方真实任务completed，连续routing计数重置但累计恢复与费用保留。Download首件partial、修订full；OWUI首件full，机器都unknown。null清除未实用，不推断因果；OWUI未知branch顺序名误拒绝由主线程定位、v7红绿修复，原草稿零调用0→7采用，首件不改。431项/4524断言联合通过；新epoch具名复测与主面板配齐继续，见§7.63。

- **2026-10-09 / BB比较、部分消费与用户暂停：** 同epochN/M/D六位置已评阅，Download N/D full、M partial，OWUI三臂partial；D token更高、稳定净收益未建立。Download消费者partial/8采用，OWUI消费者本地中止无确认终态，保留unknown及付费锁。三种变化事实已准备但六位置未运行；保存11尝试/10自然交付及known/unknown成本，按用户要求提交并停止任务书。后续重启先核查原生命周期，不重发未知请求，见§7.63。

- **2026-10-10 / BB重启：** 核验原ephemeral线程无终态/持久记录，原件SHA未变；用户明确批准保留原未知及费用后一次user-resume-1新运行并继续原队列。授权、原锁字节与retainedUnknownCompletions单列，未来未知保护不变。三种变化输入和原题已复核；22研究测试/110断言与diff检查通过，未据恢复处置本身升级实际效果，见§7.63。

- **2026-10-10 / BB限定执行收束：** 具名OWUI再次timeout无终态；用户明确保留两次未知/费用后仅批准三fresh各一次。policy/source自然partial、各2采用/性质unknown，premise终态routing失败无答案/usage，previous三blocked。非null timeout usage误计已红绿修复；15去重尝试/12交付、known input32,038,537/output136,921，最终未知量单列。425核心/29研究及类型通过，完整重放本次未通过、隔离定位准备阶段；本次授权结束，完整队列与研究仍未达，见§7.63。

- **2026-10-10 / BC规划：** 核对BB最后fresh和原包输入后，选择任务性质准备、跨调用定向修复与准备阶段性能定位。复用v7、原包字节和严格对象检查；新Download有限队列、OWUI离线迁移。新鲜51tests/362断言通过；未运行新模型或生产修改，见§7.64。

## 12. 后续追加规则

1. 研究结论统一维护在本文件。更新对应主题和本轮 §7.x 记录时，同时更新第 1 节当前综合判断及第 11 节问题表，避免新结果只出现在文末。
2. 每个问题记录触发、根因、解决、验证和未决项，链接最窄原始证据。日常重复验证、派发计数和发布流水留在机器状态、任务书与 Git。
3. 一轮开发只保留一处主要复盘；不再在本节复制同轮的逐步骤日志，也不另建日期化研究正文。结束后的长记录按主题收束，原分母、失败和方法变化保留。
4. 原始来源、任务卡、模型响应、评阅、脚本与 fixtures 放在 `results/skill-ir/skill-dsl-research/`。日期/identity 用于区分证据，不生成第二套当前结论。
5. current-status 只写当前状态和恢复指针，plan 只写未完成队列，spec 写方法合同，开发指南写接口/模块/测试。classification-and-routing 继续承载既有工程路由和历史发放接口。
6. 2026-10-04 已将本节重复的 E/T/V/W/X/AL 步骤流水收束到下表。治理前完整文本在 Git 提交 `23f0f976` 的本文件中；原始证据和 §7 阶段记录保持。文档整理没有重跑实验、改分数或建立新效果证据。

| 历史记录 | 正文中的保留位置 | 原始依据 |
|---|---|---|
| S/D 合并、E 外部发现与选类 | §3–§7.7、§8–§9 | 本文 §13 的来源、任务卡、方法对照与探针 |
| T 语义、真实案例与原型就绪 | §7.8–§7.18 | [T 状态](../../results/skill-ir/skill-dsl-research/targeted-study-status.json)、[原型决定](../../results/skill-ir/skill-dsl-research/prototype-readiness-decision.json) |
| V 声明、输入、宿主、评价与 exact-ID 修订 | §7.19 | [V 状态](../../results/skill-ir/skill-dsl-research/development/authorization-v0/status.json)、[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-v0/summary.json) |
| W 引用归一化、窄 wire、迟到请求与交付分层 | §7.20 | [W 状态](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/status.json)、[汇总](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/summary.json) |
| X 关系、coverage、普通输入、标签修订与默认选择 | §7.21 | [X 状态](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/status.json)、[普通使用复验](../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/usage-verification-v1.json) |
| AL 位置恢复和普通作者闭环 | §7.31 | [AL 汇总](../../results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3/summary.json) |

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

AU第八次实际ShareLink复验在`50d321ec`完成13请求/13响应，累计118/118、无未知完成。来源metadata修复在seq6/9/11实际采用；7个current单元已包括APIView.initial、create/perform_create和精确文档validator，后者保留user存在、全局view、owner-aware exact-document调用，但owner-aware helper本身未接受/连接。全问没有终答，状态transport-failed。主SHA裁定纠正独立AI的遗漏initial单元、BasePermission来源span（126–130而非233–246）、仅末请求token计量；实际全量input210039/output11045/cache5632，美元未知。seq5的业务callee放进source calls保持拒绝；seq12的额外reason允许typed原文保留并零调用重放，错误target仍由focus-link-target拒绝，seq13伪tool仍不合格。联合797pass/1平台skip/5123断言；只证工程回归。AU14同输入配对和partial依赖材料薄接线已实现，尚无真实变化使用或净收益证据。
第九次ShareLink在`2a911229`实际8请求/8响应，累计126/126。模型自行保留1操作/4原职责问题，10个current来源单元含owner-aware helper及PassUserMixin，终答仍缺失；本次未实际发出link，不能把上一轮reason修复当实测link效果。seq7仅省略固定focused version；seq8纯来源步骤带typed说明。由此统一direct metadata规则并通过五阶段正反例与两原payload零调用证明，显式错误内容不修补。独立`au_share_ninth_review`未交付请求的完整SHA/计量，主按原件补足：input102506/output6833/cache2816，USD未知。联合802pass/1平台skip/5170断言，类型修正后主/AU通过。新AU计量器从9个闭合原件重算fresh input2103261/cache107008/output93847，记录普通捕获一次计量和作者raw审查未知边界；仅是工程与已付调用归档，尚未形成完整原skill链、实际变化复用或同版质量成本收益。
第十轮actual在`278bc5cd`运行542264ms后request16网络timeout：16dispatch/15response，1未知completion/usage，已知input262585/output13518/cache12672。16个current来源单元、顺利通过的typed source reason和更多中间解释均不能算终答；省略version在这轮未被实际采用。seq9是合法interpret动作多出reason被strict格式拒绝，主裁定纠正探子称动作名错误的说法。原始unknown请求封存全部16个Share逻辑位置，其他15未派位置零调用写明；已有范围裁定只允许另外三个独立task的16个首位置，并不repair或release未知原task。全部原件重算142派发/141响应，fresh2365846/cache119680/output107365为known subtotal，美元未知，研究目标与有限队列未完成。
