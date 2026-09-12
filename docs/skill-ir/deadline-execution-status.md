# API 合同任务引擎：唯一执行恢复状态

- 当前持续目标 active，identity=`skill-family-current-v2-source-repair-001`，分支=`skill-ir-aot`，权威计划为 `docs/superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md` revision 2。
- N0–N3、N5 已完成：baseCommit=`edd5a94198ee8b66d30f823de30895b72b97e920`；N1=`bfbc4c8`，N2=`9ae5f59`，N3=`70f36b7`，N5=`0658306bfa5f85b188887572c19d1593509fe371`。职责/输入、完整计划、task-scoped source closure 与原生消费闭环已绑定。
- 唯一机器恢复状态为 `results/skill-ir/skill-family-current-v2-source-repair-001/execution-status.json`；主线下一动作是 N8 普通 TaskContract 统一入口、bundle 和 consumer 编排。
- 工程/研究/维护分轨；历史 `0/6`、readiness、Q1/held-out、旧候选/报告不变。clean-002 缺档、Meilisearch blocker、Bangumi advisory 已登记但不全局阻塞。
- 网络/API/付费已授权并按实际用途分账；本 identity 当前 source/business/model/paid=`0/0/0/0`，native loopback HTTP=`4`。平台安全控制未关闭，确定性证据核验仍生效。

以下 D 系列与旧 class-proof 内容均为历史检查点，不是当前恢复入口。

## 已交付主线

- D1/D2：31正文/8仓库/137文件，d42b390；深读7份和完整职责分析。证据skill-family-deepening-20260911/。
- D3/D4：声明式源职责映射，agent-reviewed非自动NL编译。3成员×12文档（6提供方、1聚合仓库）；唯一303操作，旧v2每成员8pass/295reject。e6fa621/9fae902。
- D5：递归schema构造、独立Ajv+shape+义务核验、wire编码及独立逆向checker。e75c8d7/17b9633；每成员261正向schema/250wire，2937/3371义务，3枚举不完整；完整原生输出/业务职责未完成。
- D6：6匹配模型任务，确定性12/12、模型11/12；6HTTP、24999输入/1827输出token，金额未返回。model-comparison-first/。开发代理费用/人工时间未测，不能声称节省。
- D7首轮17b9633冻结：8+6+1正文、2获取失败，nntan新通用成员12输入首跑局部pass，只有1新适用成员，3成员目标短缺保留；2fff7ac归档。
- D8：5f518da有界内容编译缓存，12完整语义相同、2405hits/109compiles，Front单次6184→2144ms；25/25测试134断言/typecheck。

## 后续修复与新成员

- d07d00f：精确schemaPath/required属性负例归属，RED旧checker误接纳；真实12旧报告重核pass、用例未变。
- eecdbe7：通用oneOf full区分候选，Adatree新增4义务至2941/3371，minimal仍unresolved。原17b首跑不覆盖。
- 77c97b7：r4不确定成员保留；r5取得7正文/1截断树失败、9关键补充资源全文读完。4通用复合职责候选，无精确旧正文复制，完整谱系独立性未证实。
  - r5 anhtester首尝试12pass；另3成员代理行数漏计末尾空行而拒绝。首跑和原analysis保留，修3个元数据字段后各12pass，核心0改动。
  - 每成员303操作/261schema/250wire/2941义务，2386编码，完整skill/native均未完成；r5 acquisition121请求，模型0。
- 019a53c：数值合法窄区间候选，22测试211断言/typecheck，实际12用例变化0。
- ddd9a90：wire参数名未转义结构字符漏检，14测试240断言/typecheck，12旧产物只重核pass。

## 当前能力：离线请求装配

- 设计1e88252；首版88b5c79保留方法/body错误及首跑；修复6e50d32，POST/PUT/PATCH之外的body声明整操作样本unresolved，不删源义务制造通过。
- 模块 api-request-specimens.ts / independent checker；开发入口scripts/skill-ir/api-request-specimens-development.ts；组件docs/skill-ir/api-request-specimens-development.md。
- 12文档/303操作/628planned/576constructed/52unresolved/24presence-negative/2清单不完整；268操作全计划样本构造。不是旧字段级指标，认证/服务器选择/响应/原生输出均residual。
- 证据skill-family-request-specimens-development-20260911/：first-run保持；method-revision-run替代Front-core/Visier-analytics；method-recheck所有原始输入核验，旧受影响2报告fail，当前12pass。
- 18测试286断言/typecheck；新api-request-specimens/v1已接声明映射，7测试29断言，主/脚本typecheck通过。
- 原LambdaTest/Jeremy/Pactflow三成员各12任务实际pass，全部同一576/628局部结果。d088f4e已提交cross-member/；这是已暴露成员新能力，不是D7首跑。

## 下一条具体动作

1. 已归档：JSON重复键3b26b3b；body负例a7cf0ce/92a2fca；合成变形729d9c4/真实键序ccfee09；响应方向/清单dc0015f–0e6aabd；三源响应职责b003133/4ece8b6；loopback9521a68。
2. be89a50现有54正文/1431pair关系核验：2flags都是原来已排除的已知派生；原分类/首跑不改，低重合不证明谱系独立。
3. 569620c完整clean证据：.worktrees/family-extended-clean-20260911@be89a50，已核验离线依赖，24/24全文档产物相同，26原输出全归档；35tests/216assertions、主/脚本tsc通过。命令longpaths/测试名/tsc标志修正留记录，没有改candidate。
4. D9当前结果导航skill-family-current-results.md已写，根plan/spec的旧当前入口已同步；提交推送并记录。
5. 1e51d61已完成UTF-8输入绑定修复：两类新batch和四个新映射profile都先TDD证明误接纳，后19tests/94assertions及strict affected tsc通过；原12文本/摘要完全相同，未再生成产物。旧v2 dispatch不变。
6. 3011413/24e47aa分支负例改进已归档：971/1414（+20，443unresolved），字段2961/3371，原成功值/正向基线/source字段不变，完整12报告和6跨成员结果保留。25tests/245assertions及主tsc通过；修primitive-parent实际异常，不改独立checker。
7. e12c587/44a8329完成有限oracle：3016比较无checker分歧，5种合成构造修复；31tests/3788assertions及tsc通过，原12产物字节不变。证据skill-family-composition-development-20260911。
9. c78fd85独立form profile完成：578/628（+2full Visier）、50unresolved，旧JSON12报告完全相同；原三成员×2输入6集成产物全同。36tests/262assertions与主/脚本tsc通过，证据skill-family-form-development-20260911。最新clean仍be89a50。
10. 原生pytest c2f10b3/ff01f99：源绑定suite/独立verifier、固定httpx runtime、显式fixture oracle；22tests/172assertions及主tsc，映射/batch17tests/80assertions及explicit tsc通过。首次Response context manager失败原件保留。12文档630collected/630skipped（628计划+2不完整占位）、0真实HTTP；4Lambda/Jeremy源职责产物与panel字节相同。
11. 9931b2f独立本机fixture完整归档：3positive、3no-oracle skip、15/15设计错误在指定层检出，15次本机HTTP、重定向不跟随。native阶段累计93本机调用（含测试/失败/归档），0远端/模型/付费。证据skill-family-pytest-development-20260911。
12. 3109c3b修-B防pyc和旧native XML归档字节，883c85e固定13Python依赖356文件离线包。最新独立clean@883c85e四profile完成，36文档+24native文件字节同，630收集全skip，fixture15/15检出；24tests/3697assertions、6Python测试、主/脚本tsc通过。完整112输出在skill-family-current-clean-20260911/clean-archive-r1；初次collector字段错误现场保留。native累计123本机HTTP，0真实API新增。
13. d3ffbbb最新clean已推送，112归档Git字节精确；553e428中文诊断修复2tests/16assertions通过。5d405b9 native wire fixture已实现并完整归档：2pass/8skip，cookie5unresolved、minimal数组形状3unresolved均保留，真实httpx验证form/query/header。1test/9assertions、主/脚本tsc通过，native累计144本机HTTP。下一具体动作：检查native传输边界（尤其header字符限制）的独立合成拒绝行为；如出现实际异常，先明确现有合同再修新模块。当前10:30，约8h，尚未10h，无后台进程。
14. header现有编码明确拒绝非ASCII/控制字符，无需猜测修复。随后505整数分单位oracle发现multipleOf22误拒绝；精确BigInt十进制整除修复后0不一致。负-0.3单点候选也有RED并修复；31tests/3778assertions、主tsc通过。12旧文档递归摘要核对扫描0multipleOf，因此不重跑无影响panel。完整before/after与RED在skill-family-decimal-development-20260911。
15. 下一具体动作：提交推送decimal修复后，按D9整理当前技术恢复导航与逐任务验收缺口（非历史重写），核对新增复现命令/证据链接；优先发现残余正确性问题，不为时长增加功能或来源。
16. D6原始证据复核已派生automation-measurement.json：4成员各7职责，13/12/10/20义务；12输入执行3080/2409/2367/3139ms，0项目模型调用。修复差异为3行数元数据+revision说明；模型6任务只有2独立操作/3源上下文。历史提取耗时/token及费用未测仍null，不能据配置字段数推人工节省。下一核对真实panel响应header缺口与源职责依据，只有确有跨成员义务/实例才设计后续能力。
17. 9295358 D6派生测量已提交。8a0917e设计+4d62376响应header独立checker已推送：两源明确header职责，12文档4声明/2文档；3源例子观测、4字段checked。10tests/65assertions与主/脚本tsc通过。TDD源名称冲突时丢清单已修，保留冲突行；optional缺失/Content-Type忽略/unknown值和refs问题分列。旧body checker不改，0live/模型/付费。
18. header mapping已实现：新独立profile api-response-header-observations/v1，源+观测路径/摘要分开绑定，旧profile拒绝新增字段且旧报告列不变。28tests/154断言、主/脚本tsc通过；Lambda emit-test-code与Jeremy response-validation两成员×两个旧1Password输入4报告与原core相同。mappings-first/完整归档，0live/模型/付费新增。
19. e9d6dde独立LF clean增量完成：Node依赖18944文件前后核验，header两完整报告语义同，decimal505报告字节同；35tests/186断言+numeric6/150、主/脚本tsc通过，tracked clean。clean-e9d6dde-r1完整10原输出归档，初始collector把Bun兼容版本写成Node版本的元数据错误保留并修，未重跑candidate。0HTTP/模型/付费新增。
20. de40836 clean已推送，Git index20原输出字节核验通过。header关系核验6/6成立（键/观测顺序、格式、JSON/YAML、case/prose、本地ref、不支持兄弟操作），三字面期望字段独立核对，新增兄弟自身unresolved也报告。6tests/36断言、主/脚本tsc通过；初始缺模块与fixture语法失败、target-only早期报告保留。核心0改动，无新增真实样本；错误检出复用已有core/mapping测试，不编新总体检出率。
21. 下一具体动作：提交上述关系证据后，对当前D1–D9逐项验收核对并压缩恢复入口的陈旧“下一步”；重点区分D7固定方法首尝试/元数据修订后、D6未测一次性提取成本、已实现原生格式与未验证业务职责。只在发现实际证据缺口时继续技术工作，不空跑或为10h扩样。目标active。
22. 当前D6实际缺口：旧提取成本未测不可追补。按skill-duty-extraction-development.md新增三已暴露原成员的前瞻性职责草稿提取测量，完整正文/资源、原文定位、独立结构核验与单列语义复核。先TDD并提交实现，再每成员一次模型调用；不自动批准mapping、不重跑原基准、不把开发样本叫unseen。当前下一动作为写validator/prompt失败测试。
23. 76235c7设计+0900958实现/测试已推送：5tests/16断言、主/脚本tsc通过；提示词JSON序列化错误有RED修复。最初外发审核拒绝；只读匿名核对8个GitHub原件，HTTP200且全部摘要同后，相同命令重新审核获准。public-source-proof.json记录8次来源复核请求，未增加独立来源。first-run已启动Lambda请求，后续Jeremy/Pactflow各一次物理请求；不能沿用旧0付费调用结论。下一等待同一session5042结果，阅读完整实际草稿并单列结构/语义遗漏与新测量费用。
24. 提取实际完成：3物理请求，Jeremy1份定位通过（16职责/53义务，2790in/5297out，178749ms）；Lambda/Pactflow约242秒无响应失败，不重试，服务端完成/用量/费用未知。Jeremy主代理全文/全部草稿语义复核发现认证状态冲突未标明、host/tool元数据遗漏；不自动批准mapping。summary.ts离线重核source/prompt/response绑定通过，summary.json单列已知token非完整总量。下一保存stage提交及根handoff，再核对D2仍为draft的fishzjp直接资源是否构成尚未关闭的类职责缺口；不再追加相同模型重试。
25. fishzjp主正文+11直接资源+2已归档间接资源全文复核完成；skill-family-fishzjp-review-20260911/report.json保留9发现、3原missing-resource误报分类、4尚未归档间接规范。离线14原件SHA/定位及脚本tsc通过。原analysis不改；completeScope=false，httpx不冒充源requests格式。下一具体动作：只查该固定提交的coverage/test-type-matrix/state-machine/case-format四引用，另identity保存结果后审阅，不扩样、不执行源脚本。
26. b58f926已推送。四个固定commit间接规范4GET均200，原字节和7项主代理语义发现保存在skill-family-fishzjp-closure-20260911；4源绑定核对通过。源策略明确mode适用、禁止跨轴双计数、环境不足保留blocked而不删义务。四引用已闭合，但整个QA框架仍有策略validator/信号scanner/兄弟workflow，不虚称全闭合，也不为读更多文件递归扩张。下一实际动作：对D1–D9与追加队列作逐项当前证据审计，优先找真正未满足项；已有源职责审阅不再重复。
27. 616a56a已推送。已启动skill-family-requirement-audit.md，直接核读权威263行任务书及r5 method/outcome/membership/revision。七原/新成员仓库元数据7GH请求全部成功，当前均非fork、不同owner，raw+SHA保留skill-family-origin-metadata-20260911；不等同完整谱系证明。下一按audit剩余五项核对具体历史绑定、共享代码、完整分母/效果与fresh回归，不再重复来源审阅。
28. D1–D9最终闭环审计已生成：skill-family-final-audit-20260911/d1-d9-final-audit.json；9项均complete-bounded，wholeSkillComplete=false。当前分支fresh回归99tests/4355assertions、主/脚本tsc exit0；历史绑定22项中20 Git对象精确、2项工作树混合行尾归一化后匹配，r5仅3个bodyLines元数据差异。D1–D9完成后按用户最新指令停止追加队列，进入总结；不运行旧001/002、不读取held-out、不启动prospective。
29. D1–D9 payload提交 b50ffcc4e5a50ddd014777f867a0a82e5b1acabe 已推送；随后同步记录提交更新了delivery-verification.json。当前HEAD与origin须按该文件命令核对，D系列可交付总结，开发分支保留供复核。
8. 文档检查实际2旧计划产物引用缺失（deadline-demo.md/deadline-research-report.md），无新链接问题；诊断在branch-negative run-evidence.json。不创建占位假交付。完整skill/native/自动职责抽取和实际代理费用仍未测或未完成；持续目标active。

### 最新检查点（2026-09-11 06:00前后）

- d088f4e已提交源映射和三成员装配结果，0bee387提交clean计划。两个新worktree保留；有效检出为.worktrees/family-request-clean-lf-20260911@d088f4e，初始默认autocrlf差异已另存诊断，不清理。
- 显式离线包D:/skill优化/SkVM-offline-packages/family-request-20260911/dependencies.tgz，36MB；18944文件逐字节核验。三成员36任务完整语义/独立核验/义务相同，15测试88断言，干净主typecheck pass。证据skill-family-request-clean-20260911完整归档，不只留汇总。
- package.json原始混合换行与LF检出raw摘要不同，normalized/parsed相同；bun.lock及核心源码匹配。费用无新增，未声明零供应链风险。
- offline-dependencies工具/测试、旧clean完整证据2a8722d只绑定d088f4e；新clean569620c绑定be89a50。新代码后续变化不自动继承旧clean证明。无运行中进程，未达10h，目标active。

## 现场/限制

- Bun C:/Users/14182/AppData/Roaming/npm/node_modules/bun/bin/bun.exe 1.3.14；Node C:/Program Files/nodejs/node.exe v23.8.0。
- 原始未跟踪历史结果/cache保留，不git add -A。所有当前长进程已结束。
- 原生pytest/Go/Pact、完整认证HTTP执行、业务状态、OAS3.1和自动语义提取仍未覆盖；不声称整个skill/生态/人工效果。

## 88. 2026-09-11 最小交付下一阶段任务书（revision 1）

- D1-D9 已按有界 source-mapped development slice 收口；本条只登记后续路线，不表示新实验已启动。
- 下一执行计划为 `docs/superpowers/plans/2026-09-11-skill-family-minimum-delivery.md`（revision 2）。
- 先完成 M0/M1、P0 calibration、P1 development shadow 和 G freeze gate，再读取 held-out 正文；目标仍是三名通过谱系审查的 development 成员、完整 class-scoped 职责分母、三名 repository-distinct held-out 成员和独立 checker 结果。
- 首跑失败与后续共享修订必须分目录保存。校准或 shadow 未通过时状态为 `method-not-ready`，不进入 held-out；不得把旧 D7 修订结果当作 held-out 首跑，也不得重写历史 `0/6`、Q1、readiness、001/002 或 D1-D9 证据。
- 计划允许有目的的 GitHub、模型和付费调用，但每次都要登记用途和实际返回成本；没有返回的计费写 `unknown`。不做 HTML、用户入口、演示包装或重复全历史审计。
- 当前阶段状态：`planned-not-started`。执行时先重读本状态、任务书和实际 Git 分支，不假定本记录中的旧 HEAD 仍然有效。

## 2026-09-11 最小交付 M0-M6 实际检查点

- 本阶段已从 `fcfcca5c6f3af26e47b2721b236019476a245eb3` 继续，修复 manifest 验证器与 runner 的顶层 await 循环并保留枚举诊断 RED；修复提交为 `b29500ca36f36936b8f6cdc44e14e81a3dfe33f2`。
- M0/M1、P0 calibration、P1 shadow、G freeze gate、M2/M3/M4/M5/M6 均有机器证据。manifest 当前为 `reported`，`bodyReadCount=3`，冻结方法在读取三名 held-out 正文后没有再改变。
- 最终机器报告：`results/skill-ir/skill-family-minimum-delivery-20260911/report.json`；决策为 `insufficient-evidence`。三名 selected 成员独立性通过，但 43 duties/98 obligations 中 0 名成员完成 class scope，95 unresolved、3 outside-class，0 input-qualified、0 accepted artifact；原始负结果不被包装成成功。
- 账本：source API `13`、model `3`、paid `3`，已知 input/output tokens `6165/15305`，billing `unknown`，development-agent cost `unmeasured`。reserve 未读，未启动新的 prospective 或历史 runner。
- 干净复现从 `96e41beacaacfbc7eb91819f9c17e5a699a06397` 的短路径 detached checkout 完成；Bun `1.3.14`，`bun install --frozen-lockfile --offline` 安装 236 packages，semantic snapshot 与 evidence/checker bindings 一致，外部调用 `0/0/0`。报告在 `clean-reproduction/report.json`，摘要由最终报告绑定。
- 两次失败保留为 `clean-reproduction/clean-attempt-001.json` 与 `clean-attempt-002.json`：一次是长路径/行尾导致的 tracked dirty checkout，一次是 CRLF contract digest 与 committed LF digest 漂移。旧 decision/candidate 原字节归档为 `decision-pre-clean-001.json` 与 `report-candidate-pre-clean-001.json`，未覆盖失败证据。
- 新增 manifest side-effect-free 模块，CLI 与 runner 共用同一 validator；聚焦回归 `82/82`、`467` assertions，项目 `bun run typecheck` 通过，脚本 bundle/typecheck route 通过。全仓文档扫描仍只报告既有 deadline 缺档 4 项，不创建占位文档；改动文档本身无新增 broken link。
- 恢复入口：在 `SkVM` 运行 `bun ./scripts/skill-ir/skill-family-minimum-delivery.ts --step=status`，再按组件文档的 `m5/m6` 或 clean reproduction 命令继续。当前结论仍限 development class slice；不改变旧 `0/6`、readiness、Q1、v1/v2 或 prospective 边界。
- 最终交付提交 `0d754a2b5090ea1d5530f73676110c31541684cd` 已推送 `origin/skill-family-minimum-delivery-001`；从该提交的 detached clean checkout 复核 `status`/`m6` 通过，远端与本地 HEAD 一致。当前任务书在本 identity 下停止扩展。

## 2026-09-11 类证明恢复任务书（planned-not-started）

- 新 identity：`skill-family-class-proof-002`；计划：`docs/superpowers/plans/2026-09-11-skill-family-class-proof-recovery.md`；当前仅登记，没有读取新来源或启动模型/业务 API。
- 执行分支固定为 `skill-ir-aot`，后续不再创建新的 feature branch；`identity` 仅隔离证据批次。
- 首要修复是 model-free eligibility preflight。它在固定候选池上确认 API 合同、离线测试产物责任和至少两个适用输入；筛选行记为 `screened-reserve`，方法锁后才可记为 `primary-heldout`，避免再次得到 `0/0` 输入分母。
- 主切片固定为 `openapi-contract-to-offline-request-specimen`，主队列 R0–R12，完成后可继续 E1–E6。机器状态拆为 `protocolReady`、`inputReady`、`capabilityReady`、`transferDecision`；旧 minimum-delivery 结果、D1-D9、Q1、readiness 和历史材料保持不变。
- 预注册最低正向条件：三个独立 primary、每名至少两个适用输入、核心义务覆盖不低于 90%、至少 2/3 首跑 accepted、accepted checker 100% 通过且无 repository-specific 分支。达不到时如实报告 `bounded-negative` 或 `insufficient-evidence`。
- 允许认证 GitHub CLI、远端 API 和有目的的付费模型调用；缓存、有限退避和候选隔离使单个 403/429/无响应不终止队列。按 AGENTS 的最小必要约束执行，不做 HTML、展示包装或重复全量审计。
- 恢复命令：`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status`；实际分支与 HEAD 由 R0 在执行时重新记录。

## 2026-09-11 项目分支统一与合并后验证

- 研究路线的 `api-tester-operation-admission-dev`、`api-tester-operation-unseen-prospective-001` 和 `skill-family-minimum-delivery-001` 均已确认是 `skill-ir-aot` 的线性祖先；主分支通过 fast-forward 到 `7e38674`，并已推送 `origin/skill-ir-aot`，ahead/behind=`0/0`。
- 三个专用本地分支已删除；远端存在的两个专用分支已删除，`api-tester-operation-admission-dev` 远端原已不存在。无关历史远端分支和 detached 证据 worktree 保留。
- 合并后必要检查：`bun run typecheck` 通过，文档链接测试 `8/8` 通过，Skill IR 回归 `343` 个测试中 `342` 通过。唯一失败是旧 operation-delivery 报告测试在当前工作树重新生成候选时发现已冻结的 CRLF/旧依赖字节与后续依赖提交不一致；冻结候选和历史报告未改写，需单独维护修复。

## 2026-09-12 Class-proof recovery R11-R12

- R11 final report is bound to the class-proof method lock, primary selection, responsibility/development ledgers, validation, first-run, no-revision decision, and the historical API Tester `0/6` report. The bounded primary slice is 3 members, 6/6 inputs, 15 core obligations (14 constructed), 21/21 checker-checked accepted artifacts, and 57 operations (36 rejected, 0 unresolved); four gates are protocol/input/capability `true` and transfer `bounded-positive`.
- R12 first clean replay at `2877b77` correctly failed because the committed output closure omitted twelve already-generated generator/checker programs. The failure remains archived; verifier predicates and v2 contract were not relaxed. After explicit archival (`1663d4f`), detached `D:\cp-clean-r12c` at `3e33dfc` replayed offline with 236 packages: 19/19 evidence files and 6/6 runs verified, with 57/21/21 operations/accepted/checked and semantic denominators matching.
- Focused regression is `27/27` (95 assertions), repository typecheck passes, and class-proof-specific diagnostics are zero. External model/API/paid calls for replay are `0/0/0`; status binding records both declared and actual detached HEAD. Prospective preparation remains `not-ready`; old `0/6`, readiness, Q1 and held-out boundaries are unchanged.

## 2026-09-12 Class-proof recovery E1-E6

- E1-E6 are complete for `skill-family-class-proof-002`; `execution-status.json` now reports `currentStep=extension-complete`. E1 is `not-applicable` because the actual R10 `strict-extra-fields` gap occurs in one member only, so no shared repair was attempted.
- Corrected E2 evidence selects five `decision=eligible`, repository-distinct, already exposed non-primary members and runs the two locked inputs: 10 runs, 95 operations, 35 accepted, 35 checked, 15/15 core obligations, and 10/10 independent verifiers. The first selector error admitted excluded candidate-001..005; `extension-e2-attempt-001.json` and its complete run directory remain preserved, while `extension-runs/e2-revision-001/` is canonical. These are not new independent real samples.
- E3 records official OpenAPI 3.0.3 and JSON Schema references with retrieval metadata; the result is `boundary-clarified-no-code-change`, and no missing `additionalProperties` instance is synthesized. E4 verifies idempotent status-driven resumption. E5 has 18/18 synthetic capability cases passing across canonical/reversed/combined representations. E6 verifies code, plan, component/results/recovery documents, and E1-E5 plus failed-attempt evidence.
- New commands are `--step=extension-e1` through `--step=extension-e6`, `--step=resume`, and `--step=extension-clean-replay`. Main-tree extension replay verified 10/10 runs and `resume` executed zero tasks with external model/API/paid `0/0/0`; a detached clean replay is required after the extension commit is archived.
- Boundaries remain unchanged: historical API Tester `0/6`, readiness, Q1/held-out isolation, v1/v2 surfaces, and prospective eligibility are not modified. The class result is development-only and does not establish whole-skill or live API behavior.

## 2026-09-12 Class-proof extension detached clean replay

- Extension commit `aa57d74910be5ab09e175d9cd507ed897d0b9e92` was pushed to `origin/skill-ir-aot`. A new detached checkout at `D:\cp-clean-ext-aa57d74` installed Bun `1.3.14` dependencies offline (236 packages) and ran `--step=extension-clean-replay`.
- The replay passed: 10/10 E2 run roots were independently verified, E5 was 18/18, `resume` executed no task, and model/API/paid calls were `0/0/0`. The external run output remains at `D:\cp-clean-ext-report-aa57d74.json`; the committed archive is `results/skill-ir/skill-family-class-proof-20260911/extension-clean-replay.json`, 2371 bytes, SHA-256 `72f3adf8226ae7d91c6e9d43203fe958f6b568f45c1314b0a04e41f8690110e7`.
- This is an offline development evidence replay only. It adds no real sample and does not alter the historical `0/6`, readiness, Q1/held-out, v1/v2, or prospective boundaries. The next action is to update the final status binding to the archive commit and run the final verification set.

## 2026-09-12 Class-proof extension final-HEAD replay

- Status-binding commit `9d95faa742978579ccd0ae24b68c990d1b1ba69e` was replayed in detached checkout `D:\cp-clean-ext-9d95faa` after the archive/status commits. Offline dependency installation again used 236 packages under Bun `1.3.14`.
- Supplemental output `D:\cp-clean-ext-report-9d95faa.json` passed with 10/10 E2 run verifications, 18/18 E5 cases, zero resume executions, and model/API/paid `0/0/0`. It is archived as `results/skill-ir/skill-family-class-proof-20260911/extension-clean-replay-final.json` (2371 bytes, SHA-256 `f7c284a0a52d6411ac5f9dc62ce85265b6f4925ab354c34980cfdfa32f34bea4`); the prior canonical archive is unchanged.
- Final verification remains limited to committed development evidence. No new sample, protected read, prospective run, readiness change, or automatic external audit service was invoked.

## 2026-09-12 API Tester delivery verification retry

- The historical delivery verifier was rerun from a later verifier host at commit `65216d878760f7fac3bd561fed9443a2f3b20d22`, with candidate binding `3ebe60613bab0375047fcb51337d35b3c1830430`.
- The default LF materialization retained the expected `package.json` blob mismatch. Under process-local `core.autocrlf=true`, with the archived CRLF dependency bytes materialized, the same verifier returned `verified`; `prospectiveRuns=0` and portable semantic digest remained `f423485bf08cbbe53908d82df5b0d09a8adab3b1072184e1736cae7dfe7f3177`.
- This additive retry proves that the historical evidence closure can be reconstructed under the recorded host and line-ending conditions. It does not prove that candidate `3ebe606...` can run the verifier from its own commit (the verifier was added later), and it does not change source correctness, the missing clean-002 archive, Meilisearch/Bangumi advisories, readiness, the historical `0/6`, or any prospective boundary.
- Evidence: `results/skill-ir/api-tester-operation-delivery-freeze-retry-20260912.json` and `docs/skill-ir/api-tester-operation-delivery-verification-retry.md`, committed at `0c264900100ca96d5a37c672d0f03af2b6965692`.
- Next action: prepare a new prospective identity bound to the current `skill-ir-aot` v2 implementation and dependency closure. Freeze its input-selection, prediction, and stop rules before any unseen read or execution; do not mutate the old candidate or reuse its inputs.

## 2026-09-12 API Tester retry review closeout

- The historical retry review was recorded in documentation commit `075881d`; the actual current HEAD must be read from Git rather than copied from this historical snapshot.
- The branch remains aligned with `origin/skill-ir-aot`; no tracked implementation or frozen evidence changed. The next work item is preparation of a new current-v2 prospective identity, with selection and prediction locked before any unseen access.

## 2026-09-12 Current-v2 source repair and prospective plan

- Active plan: [source repair/prospective revision 2](../superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md); rationale: [plan review](skill-family-plan-review-20260912.md). Base reviewed at 3c37f7f; branch is skill-ir-aot.
- State remains planned-not-started: no N0–N15 execution, candidate/prediction/selection or protected local reserve read. Public web research exposed the sources listed in the review; those cannot be called body-unseen.
- Main scope: TaskContract → requirement-driven plan → existing shared construction/checkers → consumable request/pytest package. Engineering delivery and new-requirement/new-input outcomes are separate.
- Schedule: N0/N1/N2, then N3/N5/N8/N10, then N7/N9/N11/N12; N13 can follow N10. N4/N6 are time-limited maintenance, not prerequisites. N14 performs one code-candidate clean replay and N15 delivers actual outcomes.
- Protocol order: lock method/selection rules, acquire authorized bodies/inputs, lock concrete predictions, execute. Calibration precedes freeze. Required response refs are task-dependent; recursive resolution is not construction success.
- Historical 0/6, old readiness/Q1/held-out and frozen records remain as recorded. Read current HEAD from Git at recovery; metadata-only commits do not trigger another clean replay.

## 2026-09-12 Current-v2 N1 corpus checkpoint

- N1 payload is committed as `bfbc4c885efaa11ae27aaddd380dbb75cf59fe50`. Its three machine ledgers reuse committed development archives and verify every body/resource/API-input byte before emitting deterministic output.
- Actual denominator: 12 complete skill bodies, 6 repository origins, 42 direct resources, and 498 duties (38 constructible, 79 in-class unsupported, 46 outside-class, 335 unmapped/unresolved). Four repository-distinct mappings remain candidates for N2; no whole-skill conclusion is made.
- API input identity is 12 documents / 6 providers / 1 aggregator mirror. Original upstream URLs were absent from the prior ledger and remain explicitly unknown. Five repository-distinct metadata-only candidates retain `bodyRead=false`.
- Focused N0+N1 regression is 10/10 with 34 assertions; full typecheck passes. Acquisition, protected reads, prospective runs, source/business/model/paid/native calls remain zero for this stage. Resume at N2 with the current-v2 status command.

## 2026-09-12 Current-v2 N2 TaskContract checkpoint

- N2 payload is `9ae5f59f4003daea5d32fd09e6701bf084eb8e35`; machine gap matrix SHA-256 is `f8d6b4ca9d92ce6b836bc49b2d8c63124cf177897e7bdf536809a4e48f30cafe`.
- Strict task parsing, public JSON Schema, read-only legacy mapping adaptation, pre-construction obligation planning, independent source/task enumeration and all-required completion evaluation are implemented. Unknown fields fail; valid-but-unavailable output and insufficient inputs remain explicit.
- Three source-grounded demonstrations on the same exposed 1Password operation produce distinct plans. The broad fishzjp pytest/fuzzing mapping remains unresolved rather than being narrowed silently. Renaming member/repository provenance leaves semantic plan identity unchanged.
- Focused N2 set is 17/17 tests and 69 assertions; repository typecheck passes. Construction/native execution has not run, and protected/external call counts remain zero. Resume at N3.

## 2026-09-12 Current-v2 N3 source-closure checkpoint

- N3 payload is `70f36b796d0afe2c0348a014a5439b1184100c61`; report SHA-256 is `c5d6eb08a24393653129c6a2b4cac7afcf964f710ae27125c2798fc384a1feb6` (81,655 bytes).
- Three real N2 tasks pass source closure with 12 reference occurrences. Eight deterministic cases / thirteen relations cover missing local and unaffected operations, pinned external roles, nested relative URI bases, shared-resource deduplication, structural recursion versus pure reference cycles, task-dependent response severity, pointer/sibling distinctions and OAS dialect rejection.
- External resources are digest-bound data under fixed byte/node/depth budgets and are never executed. Source validity, witness constructibility, live service behavior and original-upstream validity remain separate.
- Focused current-v2 set is 26/26 tests with 90 assertions; full typecheck passes. External/protected counters remain zero. Resume at N5.

## 2026-09-12 Current-v2 N5 native-consumer checkpoint

- N5 payload is `0658306bfa5f85b188887572c19d1593509fe371`; `integration/consumer-report.json` SHA-256 is `a2990694bba9d84cbcccdd071f34cf5629cf6c7e9332cf16052faa5c95c269b2` (20,368 bytes).
- TaskContract now binds plan, source closure, request/form specimens, JSON body negatives, conditional response checks and either request-json or the complete existing pytest suite/runtime. An independent checker reconstructs the obligation universe and all bindings from the original task/source.
- Two synthetic but semantically distinct consumers each passed two selected native rows. Aggregate JUnit is 4 passed, 0 failed/errors, 5 skipped, with four hand-checked loopback exchanges. Eight preregistered faults were detected at their assigned layers with zero miss.
- Pytest constraint-negative rows, path omission, parameter-negative assembly and absent business oracle remain explicit unresolved boundaries. Focused N5 regression is 53/53 with 281 assertions; final subset 11/11 with 50 assertions; full typecheck passes. Resume at N8; protected reads/runs remain zero.
