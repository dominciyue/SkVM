# 2026-09-12 任务书审查：从职责映射走向可用的合同任务引擎

审查基线：skill-ir-aot，3c37f7fed6af0620e8b227d2c2d19752e4efd972。范围为代码、既有 development 证据和公开资料；未执行新研究批次。
修订后唯一执行计划：[任务书 revision 2](../superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md)。

## 1. 判断与取舍

推荐继续 API 合同任务类，优先接通已有模块与实际消费。两种替代路线都不宜作为截止前主线：
- 先补齐所有历史引用和归档：能提高证据整洁度，不能保证获得新可用能力。
- 同时扩展 Env/config、静态审查和所有 OpenAPI dialect：增加设计面，在已有 API 执行链未闭合时风险更大。

类的定义不应是“我们支持的那些 API”。应是输入合同和任务要求可明确、核心职责可离线验证的任务族；当前支持 profile 是这个任务族的子集。类内不支持者保留。对有限语法/资源预算的自动化可以验收，任意自然语言 skill、任意 schema 的完备自动构造不能由有限案例保证。

截至本轮，没有证据说明严格满足全部定义的 skill 在生态里“很多”。项目已获取 31 份、深读 7 份，其余不能自动当作合格成员；多个仓库存在同类职责，有继续工程化的实际依据。短期用 12–20 份方便样本形成需求表即可，不花时间做生态总量普查。

## 2. 代码事实与关键区别

| 位置（基线版本） | 事实 | 计划后果 |
|---|---|---|
| scripts/skill-ir/skill-family-class-proof.ts:418 | selectDevelopmentInputs 取归档索引前两项 | 后续需独立 API provider/document 分母 |
| 同文件:432 | primary 输入绑定要求和 development 共享同组 bytes/hash | 旧多成员结果不等于独立新输入泛化 |
| src/skill-ir/skill-family-class-construction.ts:54 | buildClassConstruction 只收 source/format | 新任务 requirement 应进入独立计划层 |
| 同文件:98 | deriveObligationOutcomes 在构造后映射 duty/case kind | 不能仅凭事后匹配声称需求驱动生成 |
| 同文件:150 | accepted 允许存在一个 constructed outcome | 新 taskComplete 必须逐项完成必需义务 |
| src/skill-ir/api-skill-mapping.ts:28 | 已有多个 profile、output format、来源 obligation 绑定 | 不能泛称全仓没有映射/分发；优先适配已有实现 |
| src/skill-ir/api-schema-witness.ts:79 | 受限组合 schema，最多 64 次候选搜索 | 不重写已支持能力；失败不是不可满足证明 |
| src/skill-ir/api-schema-checker.ts:79 | allOf/anyOf/oneOf 与 OAS3.0 约束适配已存在 | 不能拿 primitive production v2 代表全仓上限 |
| src/skill-ir/api-response-observation.ts:12 | 检查提供的响应，不执行请求或预测状态触发 | 区分 observation conformance 与业务正确性 |
| src/skill-ir/api-pytest-suite.ts:12 | 已生成 Python/data 包，声明 explicit-loopback-oracle | 复用已有 exporter，不再新造演示包装 |
| src/skill-ir/api-pytest-wire-runtime.test.ts:7 | 有真实本地 native wire 测试，明确 pass 与 skip | 把已有执行能力接到普通 task，不宣称 native 从未运行 |

旧 class-proof 的 14/15 核心义务和 21 checked artifact 有界结果保留；216 unresolved source duties 等剩余分母不能被“核心通过”消除。
已有某批 native suite 全部 skip，与专门 loopback fixture 实际执行通过可以同时成立；必须按批次/模式说明，不能择一代表整个项目。

## 3. 为什么任务书需要方法修改

必须修改的是需求到执行的接口、完整性判定、输入取样以及依赖的任务相关性，不是推倒 generator/checker 重写。

建议标准为 TaskContract + ConstructionPlan + ArtifactBundle：
- 任务合同描述输入 dialect、选定 operation、必需覆盖要求、输出格式、可选 observations、mapping 来源及 unresolved 要求。
- 计划在构造前枚举义务；同一输入不同需求应产生不同计划/导出包，仓库名变化不影响语义。
- bundle 可以在研究 runner 外检查/消费，真实执行与 skip 分列。
- 自然语言原文的完整性仍需来源核读。模型提取的 schema 合法性不能代替语义正确性；agent-reviewed 不能记成人类审核。

三条旧流程问题需明确修正：未读正文时无法填写具体责任预测；冻结后 calibration 又修实现会破坏方法锁；使用一个全局 sourceReady 会让无关历史失败阻止所有输入。

新增两阶段时序：先锁方法/抽样，再读取允许的新正文/输入，再锁具体预测，最后运行。
修订后有用性与研究成功分开：可用工程并不依赖一定采到三个新 skill；新样本失败也不能让工程只交零执行报告。

## 4. 公开资料：需求存在与已有技术边界

以下页面在 2026-09-12 通过公开网页检索读取。网页可能使用滚动 main，支持需求分析，不构成版本锁定的实验数据；实施时需要再归档确切版本。未测总体数量或安装量。

| 一手资料 | 支持的有限事实 | 对本项目的启示 |
|---|---|---|
| [LambdaTest API to testcase skill](https://github.com/LambdaTest/agent-skills/blob/main/api-skill/api-to-testcase-generator/SKILL.md) | 描述从 API 定义生成测试，并区分框架与覆盖类型 | 必须保留输出与覆盖要求，JSON 样本不自动等于完整测试任务 |
| [Pactflow OpenAPI parser skill](https://github.com/pactflow/pactflow-agent-skills/blob/main/plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md) | 包含 schema 组合、response variants 和 Drift 输出职责 | response 不能永久是 advisory；请求样本与完整 Drift 任务应分开 |
| [borghei API test suite builder](https://github.com/borghei/Claude-Skills/blob/main/engineering/api-test-suite-builder/SKILL.md) | 包含 OpenAPI 输入、测试脚本与覆盖分析工具说明 | 是新增需求线索，未核完资源，不直接认定类成员/独立实现 |
| [event4u API testing skill](https://github.com/event4u-app/agent-config/blob/main/src/skills/api-testing/SKILL.md) | 涉及控制器、数据准备和服务状态 | API 标签本身不足以判定离线合同构造类 |
| [Agent Skills specification](https://agentskills.io/specification) | 定义 SKILL.md 与可选资源组织；正文并无统一任务语义格式 | 新增 sidecar task contract，保持原 skill 格式 |
| [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3) | 描述 HTTP 接口与该版本 schema/reference 语义 | 本轮按实际 OAS3.0 profile 实现，不声称所有版本 |
| [JSON Schema 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core) | 定义 URI、引用与 schema evaluation 规则 | 后续适配需明确 dialect 与 base URI，不能简单展开所有 ref |
| [Schemathesis checks](https://schemathesis.readthedocs.io/en/stable/reference/checks/) | 已有 status/content/header/schema 等检查 | 用它比较限定覆盖和故障检出，不能把测试生成本身称原创 |
| [Schemathesis 论文](https://arxiv.org/abs/2112.10328) | 描述由 API schemas 推导 fuzzers 的方法 | 新贡献应证明职责合同与可验证产物之间的连接 |
| [Dredd 文档](https://dredd.io/en/latest/) | 文档列 OAS3 支持为 experimental | 选择 Schemathesis 优先，Dredd 不作为必跑门 |

从资料推断，潜在用途包括合同回归、fixture 准备、请求参数边界样本与响应一致性检查；这是需求归纳，不是已交付能力列表，也不是生态规模估计。

## 5. 本轮曝光记录

为避免下轮称 unseen，本次已看到的公开正文/关键片段按 development-exposed 处理：
- LambdaTest/agent-skills：api-to-testcase-generator，以及搜索返回的 skills_index 中 API 相关描述。
- pactflow/pactflow-agent-skills：openapi-parser、pactflow，及 contract-testing-flywheel 的公开说明；skills.re 镜像同源，不算新成员。
- borghei/Claude-Skills：engineering/api-test-suite-builder。
- event4u-app/agent-config：src/skills/api-testing。
- laurigates/claude-plugins：configure-api-tests 的公开索引/正文片段；只作曝光记录，技术论据不引用该第三方索引。
- he8um/api-design-skills：搜索返回描述，未核正文；因已有关键内容曝光，本轮主样本保守排除。

这些记录不增加正式 corpus acquisition 分母。搜索还含论文/工具/讨论项，它们不是 skill 样本。N0 将上述来源及原开发池合并入曝光账本；来源曝光不确定者不标 body-unseen。未读取本地 Q1/held-out reserve，未生成新 prospective selection、预测或运行数据。

## 6. 截止前实际闭环

优先交付：明确 task + 普通合同 → 共用引擎 → 独立检查 → 原生包消费；以跨 provider 输入和差异需求评测，保留失败。
把找档/修旧 upstream 限时为支线；把多 dialect、多原生后端和新大语料放到闭环以后。
零运行时模型成本、完整任务比例、真实 native 执行、故障检出与重复调用耗时分别实测。没有真人 active minutes，不声称节省人工。

9 月 14 日前有条件交付一个有用的有界引擎；无法保证任意新 skill 全自动或任何预设正向研究结论。延期风险主要是任务合同接入、输出消费和真实输入适配，不是缺一份历史 clean 文件。
