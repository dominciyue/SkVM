# Skill IR 当前状态

更新于 2026-09-26。工作分支为 `skill-ir-aot`，仅发布到用户 origin。本页是唯一实时状态入口；历史任务书保存当时的执行记录。

## 当前方向与任务

当前研究范围是单 repo/ref、源码可见的授权与信任边界评估。领域声明表达主体、资源关系、操作、条件、政策来源和入口；程序展开检查义务，模型分析控制路径，宿主检查引用与覆盖，评价者复核语义。

[V0–V10](../superpowers/plans/2026-09-20-authorization-dsl-prototype-development.md)、[W0–W9](../superpowers/plans/2026-09-21-authorization-dsl-transport-and-evaluation.md)、[X0–X13](../superpowers/plans/2026-09-21-authorization-dsl-capability-delivery.md)和[Y0–Y14](../superpowers/plans/2026-09-22-authorization-dsl-transfer-and-value.md)均已结束发布，Y最终提交`70906261`。后续复核确认Y主体工程可用，但公共`--method`选择曾有漏项，已在Z补齐；历史机器summary保留。

**当前授权任务：** [AB0–AB13 外部复用与普通说明对照](../superpowers/plans/2026-09-22-authorization-external-reuse-and-baseline.md)已完成16/16个真实生成单元，状态为`generation-complete`，AB9评价待执行。被测模型为`xty/gpt-5.6-sol`，16次调用全部响应、0个completion-unknown、0个目标执行；原始canonical label为14个`source_refuted`与2个`source_supported_failure`，保留原文等待冻结评价。结果入口为[实验目录](../../results/skill-ir/experiment-catalog.json)、[AB状态](../../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/status.json)和[原始阅读稿](../../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/answer-reading.txt)。研究设计见[研究§7.25](skill-dsl-research.md#725-ab-外部复用与普通说明对照)。

**9月26日恢复与独立并行：** AB中断原因为执行账户用量限制，16条结果齐全，恢复从AB9开始，完整AB仍由一个`gpt-6-astra / ultra`任务负责。另授权[AC编辑支持](../superpowers/plans/2026-09-26-authorization-authoring-editor-support.md)和[AD实验目录工具](../superpowers/plans/2026-09-26-experiment-catalog-maintenance.md)两个独立开发任务；它们不分担AB验收项，分别独占新editor-support/schema/example目录和新catalog工具目录。AB拥有共享文档和唯一Git发布权，侧任务ready后统一集成。速度按用户要求使用Fast，宿主默认priority已确认，实际每任务tier另核。详见AB任务书revision 2第八节。本轮运行原始证据有未跟踪文件，保留并由AB精确归档；既有七项源码修改继续保护。

**文档治理：** 日常阅读集中到本页、[文档入口](README.md)、[证据索引](evidence-index.md)和[实验目录](../../results/skill-ir/experiment-catalog.json)；版本化验证材料继续按治理清单保留原路径和原字节。历史长文档不再复制实验流水，结果只在最窄证据位置链接。

**前轮结果：** [AA0–AA13 作者声明、修改复用与领域价值](../superpowers/plans/2026-09-22-authorization-authoring-reuse-and-value.md)已完成并发布到origin/skill-ir-aot，代码与证据提交`529cf0b3`已核对远端。authoring/v2、完整执行依赖、只读compare与作者定位诊断已交付；183测试/1337断言及typecheck通过。独立模型作者首稿1/2 valid，一次行号修订后2/2完成，原/变4次运行均源码支持deny→allow。五组plain/ledger均5/5 full，ledger开销更高；header conditions解释更完整但初轮需一次修复，过严unknown检查已离线修正，历史成本保留。16分析单元/17调用，actualUSD未知，追加单元0。普通任务建议显式plain/v4，ledger/conditions按覆盖或分支需求选择，兼容默认不改。见[AA状态](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/status.json)、[AA汇总](../../results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/summary.json)与[研究§7.24](skill-dsl-research.md#724-aa-作者声明修改复用与领域价值)。只用已暴露development材料，保留七项已有源码修改。

**前轮结果：** [Z0–Z12 输出减负与实际使用](../superpowers/plans/2026-09-22-authorization-dsl-protocol-and-usability.md)已完成并发布到用户origin，交付提交`e48db7de`，远端已核对。公共plain/ledger/conditions、紧凑v4与响应细节分层评价已接通；首轮legacy/v4首答完整交付1/4与3/4，最终均3/4，已交付决策与必要控制全正确，full为1/4与3/4。legacy结构失败与v4 header超时均保留。一次共享strict-schema修订配对均full，旧协议仍需fallback。作者plain原/变任务实际得到deny/allow，各一次调用。全轮12单元/16调用，actualUSD未知；175测试/1229断言和typecheck通过。legacy保持默认，v4显式选择，省略method兼容；研究价值mixed，不追加调用。见[Z状态](../../results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/status.json)、[Z汇总](../../results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/summary.json)及[研究§7.23](skill-dsl-research.md#723-z-输出减负与实际使用)。

Y 同轮推进：条件wire/v3、authoring/v1与顶层`skvm authorization init/check/run/inspect`均已接通；init不覆盖，check/inspect零provider，run默认B/新session，条件请求显式opt-in。Y7把P/L/C与历史N/B/D分开：三者均固定render B，P没有ledger/coverage，L增加ledger，C再增加condition sidecar；实现revision `4524bfe`后冻结五任务15单元配置（SHA `b0aa6278...7140b`）。Y8完成15/15，25次provider调用与已知input 122,593/output 56,192/cache-read 10,368 tokens完整保留，实际USD均未报告。Y9的hash-bound评价得到15/15结论、必要语义和task decision正确，12 full/3 partial；匿名独立复核确认只有C在trusted-header案例补齐四类条件结果。解释criterion缺口P/L/C为2/2/1，因此按预定规则选择C用于迁移比较，但C的11次调用/101,151 known tokens高于L的8次/59,952；未发现共享生成缺陷，追加单元0，默认仍为B/L、C保持opt-in。Y10按冻结候选顺序纳入首个合格项目`go-gitea/gitea@fc28937`：MIT、公开、非fork/归档；三任务分别覆盖跨用户自查例外、repository issue-write、route-level repo/site admin。三个普通authoring输入只用派生`authorization-core-v1`六类要求，同一泛化requiredAnalysis文本，CLI check均valid；七个模型可见source snapshot与evaluator-only的18项criterion物理分开，六个代码范围逐行一致。assessment仍诚实写`sourceRefVerification=authored`，固定git ref证据另存；选择含开发代理专业判断，目标执行和保护集读取均为0。离线replay重现Y9 summary SHA `41fd0b9...b45c`。新设计与结果见[研究 §7.22](skill-dsl-research.md#722-y-条件表达默认迁移与价值验证)。继续当前任务类别与fixed-context范围；CLI是opt-in development能力，不声称npm已发布或生产安全决策。开发模型为`gpt-5.6-sol / max`，被测provider配置单列。旧受保护held-out/Q1 reserve不读。

Y11用向后兼容experiment/v2把三份普通normalized assessment接到同一local invocation；冻结配置SHA为`b5477832...88bfa`，12个P/C fresh-context单元全部completed。冻结评价为12/12决策正确、8 full/4 partial；lock四答均漏答案级HTTP 403。P/C各4 full、2 partial且解释缺口相同；C为12次调用、109,743 known tokens、919,329ms，P为8次、37,489、388,763ms。变化输入从different-user/deny到self-query/allow后，声明与P/C prompt SHA都确定性变化且固定代码字节不变。Y12总体判定`mixed`：C仅在Y9一个development任务上补一项条件枚举，未形成迁移质量增益且运行负担更高；ordinary继续默认B/L，C只在明确需要有界条件分支时opt-in。共同helper建立工程价值但未隔离模型正确率因果；专业编写与human time/savings仍未测。两个面板共45次provider调用，actual USD全部unknown，目标执行0。

Y13新鲜验证为授权/benchmark/CLI 167/167、1137 assertions，typecheck与三个真实入口通过；迁移check为3 cases/12 units/0 diagnostics，离线replay重现SHA`66dfb36...946`且无provider/目标调用。文档测试12/12，治理扫描10,628文件无broken/legacy/governance error；Y结果树416个JSON与54个JSONL中的171条记录全部解析，定向敏感信息扫描0命中。Y14只发布这些已冻结结果，不追加研究单元或默认扩展。

用户在 W 复核后确认按完整能力阶段推进：评价要求校准、可选/分支关系、普通自备输入、第二项目 development 与小型对照放入同一轮。第二项目提前检验共性，旧三例不必先全部满分；内部仍小步测试和提交。研究与开发复盘统一维护在[研究总文档 §7.21](skill-dsl-research.md#721-x-完整能力阶段设计)。

X1 已冻结 evaluator-only v2：必要语义、解释完整性、可选细节分别报告，接受逻辑等价表述但不以代码引用替代未陈述因果。旧 W B/D 只读重评后均保持结论正确；共同缺完整条件枚举而为 partial，可选 signup/default 不再改写结论正确性。X2 选择 `fastapi/full-stack-fastapi-template@cb740b6`，以普通用户更新他人 item 的 deny 与 superuser 读取他人 item 的 allow 作为两项新义务；官方源码、测试、MIT 许可证及 development 暴露状态已分账归档，目标未执行。

X5 的 wire/v2 只在显式 analysis requirements 时加入 coverage sidecar，canonical result 继续是 v0。宿主机械核对 requirement、expanded obligation、状态、理由和同义务 fact pointer，并把语义支持保留为 `unreviewed`；无效 coverage 只沿用一次修复，持续失败不会成为完整交付。旧 wire/v1 与 replay 保持兼容。

X6 的 `authorization-assessment-input/v1` 接受任意 taskId/repository、相对 sourceRoot、普通 `src/...` 文件及默认或显式 profile，不需要 manifest/oracle。check/inspect 零 provider；run 每次创建新的不可覆盖 session，并保存 JSON、事件 JSONL 与文本摘要。sourceRoot/path、junction/symlink、task/ref、声明位置及 ledger 都在 provider factory 前 fail closed；未知完成不自动重发。

X7 增加显式 N/B/D renderer 与本地 `--arm`。三臂共用事实、公开 requirements、源码、wire/v2 和输出合同；N 自然化全部 canonical facts，B/D 共用 JSON declaration，D 增加领域因果方法。字符分项与 provider-reported token 分开保存。仓内 synthetic 例子已通过三臂 provider-free check；两份固定外部 skill 的授权职责映射与剩余职责分开记录，作者变化 trace 实际得到两项 pre-provider 诊断，不含真人耗时或节省主张。

X8 已让五个任务、四种 synthetic 变化和临时普通目录通过共同 parser/ledger/source/mock-host/coverage/evaluator-template 路径。experiment-only runner 的实现固定为 `dccd830`；配置 SHA-256 `23e22d8...57fec` 在 provider-free check 中得到 5 cases、23 units、0 diagnostics。终态或已 dispatch 的未知完成单元不自动重发；仅 initialized 且无 dispatch 的 session 可安全继续，恢复时交叉核验 unit/session/dispatch/run/result。授权回归 129/129、813 assertions 和 typecheck 通过；截至 X8 真实 provider 与目标执行仍为 0。

X9 按冻结顺序完成 23/23 fresh-context 单元，全部为 `completed`，没有 completion-unknown、timeout 或 domain repair，也没有目标执行。共 30 次 provider 调用：23 次 schema-tool 与 7 次 schema-tool 失败后的 prompt-parse transport fallback；fallback 按原任务重新请求模型，不是离线格式转换。已知 token 为 input 102,579、output 61,942、cache-read 45,824，30 次费用均未由 provider 报告，实际 USD 保持 unknown。全部生成结束后才开始 evaluator-only X10；原始生成字节与初轮身份保持不变。

X10 的 hash-bound v2 评价得到 14 full、5 partial、4 incorrect；23/23 necessary semantics supported、coverage valid、scope accepted、transport valid、delivery complete。四个 incorrect 都是解释正确描述 deny control、却把 `source_refuted` 写成相反的 `source_supported_failure`：text B 一次、FastAPI update D 两次及 N 一次。B 汇总为 7/2/1，D 为 6/2/2；两臂 necessary/coverage 都是 10/10，D 未显示额外关系收益，且观察到更多调用和 token。三个 N 单元无重复，只说明当前自然说明形状下的机制表现，不能作稳定性或整个 SkVM 对原始 agent 的因果比较。离线 replay 摘要哈希一致；独立只读复核确认上述结论。X11 只修共同输出合同中未解释 conclusion enum 的缺陷，不改初轮身份。

X11 先以失败测试固定三臂共同缺少标签方向定义，再只在 result contract 说明：结论相对 declared policy expectation，`source_supported_failure` 表示期待失败，`source_refuted` 表示期待被执行，`unknown` 表示固定上下文不足；事实、requirements、源码、rubric 与 B/D 方法差异均未改。预先冻结的 text B/D 与 FastAPI update D/B 四单元各一次，全部为 `source_refuted`、full-success、necessary supported、coverage valid；3/4 first response accepted，FastAPI B 另有一次 prompt-parse，无 domain repair。共 5 次调用、input 25,674、output 9,836，实际 USD 仍 unknown。一次 `SKVM_CACHE` 未传入导致的 provider-unavailable 发生在创建 provider/dispatch 前，原 session 保留后安全继续。revision 与初轮分开，支持共享合同诊断但不替代初轮失败或证明一般可靠性；不再追加调用。

X12 复用同一 ordinary entry 与 X11 同 revision 的既有 session，离线 inspect Open WebUI controlled-text B 和 FastAPI foreign-update B；两者均 completed、`source_refuted`、coverage valid，新增 provider 与目标执行为零，且 inspection 不依赖 evaluator。省略 arm 的 synthetic check 返回 B、六项默认要求和零诊断；作者四步 trace 的两项错误继续得到精确字段/路径诊断。普通入口默认已从 D 改为 B，N/D 显式模式和旧接口仍保留：冻结初轮中 B/D necessary semantics 与 coverage 都为 10/10，而 D 没有额外收益并观察到更多调用/token。当前能力判定为 bounded development capability，只推荐单 repo/ref、显式源码、声明义务的 source-visible 评估；不包含仓库发现、目标执行、部署验证、patch 或生产默认安全决策。

X13 新鲜验证为授权测试 131/131、836 assertions，typecheck 通过；初轮离线 replay 重现相同 summary digest。文档单测 12/12，10,074 文件链接/治理扫描无 broken、legacy 或 governance error，X 结果根 409 JSON 与 56 JSONL/166 records 全部可解析。精确归属与敏感信息检查通过；交付提交 `5297071` 已推送，状态提交为 `abe470f`。Y0 已建立恢复状态并重现同一 131/836 基线；Y1 已用红绿测试把公开 check/run 省略 arm 从 D 统一为 B，显式 D 与历史接口不变。X 当时建议薄命令加新项目；2026-09-22 用户确认扩大为上述 Y 完整方法与使用阶段，X 历史结果保留。

## W 阶段实际结果

- 工程闭环稳定运行：窄 wire、宿主引用归一化、schema/fallback/repair 计量、关闭与迟到事件、分层评价、恢复和离线 replay 均有确定性测试；任一 error 级 wire 归一化诊断都不会产生 canonical result。
- 三个既有 Open WebUI development 案例共六个 fresh-context 单元全部 completed。`transportValid`、`deliveryComplete` 和 `semanticDecisionCorrect` 均为 6/6；没有 completion-unknown。
- file 与 controlled-text 的 B/D 四单元均为 full-success。trusted-header 两臂都正确返回 `unknown`，但严格 review 均为 partial：两臂都没有明确列出四种条件结果，D 还漏掉可选 signup 路径，B 的密码认证关闭分支也没有明确写出 403。
- B 共 5 次 provider dispatch、15,866 input、6,116 output、3,456 cache-read tokens；D 共 3 次 dispatch、7,013 input、3,302 output、3,456 cache-read tokens。总计 8 次调用，实际 USD 全部未报告，保持 unknown。
- D 在本小样本中少两次调用、少 8,853 input 和 2,814 output tokens，没有比 B 更高的语义或证据完整性。W 当时决定先研究关系缺口；后续复核还发现评价的显式表达要求需要校准，关系层是待验证解释。X 保留这一正向开销观察并增加第二项目检查。W9 的 invalid wire 交付缺陷已以红绿回归修复，六个存档最终结果不变。

证据：[W status](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/status.json)、[W summary](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/summary.json)、[W evaluation](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/runs/initial-wire-v1/evaluation-summary.json)、[V replay](../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/v-replay-initial.json)。V 原始结果继续保存在 `authorization-v0`。

## 已有工程能力

| 路线 | 当前可用能力 | 当前效果记录 |
|---|---|---|
| 授权领域 DSL 有界开发能力 | canonical JSON、显式义务、关系/coverage、可选condition sidecar、authoring、顶层init/check/run/inspect、编号源码、窄wire、宿主引用绑定、关闭/迟到计量、分层评价与可恢复研究入口 | Z补齐三method与v4，初轮首答交付legacy/v4为1/4与3/4，最终均3/4；作者原/变任务真实deny/allow。mixed，legacy默认、v4与conditions显式选择；省略method保持兼容，仍非生产安全默认 |
| Trace 驱动 skill 包优化 | bare-agent 自动捕获、日志导入、模型修改说明和脚本、局部验证与修复、原子包导出、自然消费记录 | F 后继包三次实际消费通过；配对工具调用 62→64、输入 token 58,828→190,516，效果 negative |
| 既有确定性基础 | IR parser/validator、lowering、API Tester/Env 后端、artifact 与显式 recipe import | 保留各自有界案例及原评价口径 |

普通使用入口：

```powershell
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

优化模型默认沿用 `--model`；具体选项、已有日志与恢复见[使用说明](../usage.md)。授权能力的opt-in顶层命令见同一使用说明，研究复现与类型见[开发指南](developer-guide.md)。

## 文档与历史入口

- [当前计划](skill-ir-aot-optimization-plan.md)：近期队列与验收。
- [研究总文档](skill-dsl-research.md)：分类依据、当前设计、开发问题及方法变化。
- [spec 14.34](skill-ir-aot-optimization-spec.md#1434-按-skilltask-范围设计领域-dsl)：持续适用的方法合同。
- [证据索引](evidence-index.md)与[历史](history.md)：旧阶段结果、限制和恢复路径。
- [F 完成记录](../../results/skill-ir/general-generation-reinforcement-20260914/completion-audit.json)：既有通用生成路线的详细交付。

S/D/E/T 的来源、分类和设计保留在研究正文与原始证据中；本地化 I1 暂缓。新 development 工作沿用各历史身份的原始结果，不修改 Q1、held-out、prospective 或 readiness。工作树中的无关源码与本地实验材料由各自任务处理。
