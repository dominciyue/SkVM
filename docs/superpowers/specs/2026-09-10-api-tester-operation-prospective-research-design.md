# API Tester 操作级未见输入研究设计

**日期：** 2026-09-10

**分支：** `api-tester-operation-unseen-prospective-001`

**基线：** `47efb148fb98288c173493c95582ed47d4fbdd3d`

## 1. 研究问题与执行顺序

本阶段保持 `api-tester-openapi-subset-v2`、操作级枚举/准入/构造算法和候选 001 的历史字节不变，回答三个层次的问题：

1. 新的候选运行身份是否完整绑定了普通输入入口实际会加载的生产依赖；
2. 同一冻结方法在按来源规则选择、执行前未被候选试跑的 `12 real + 6 synthetic` 输入上实际得到什么结果；
3. 首轮之后，公开结构驱动离线转换家族的覆盖范围、40-skill 责任分布、三个 API skill 的可接入性和关键机制消融支持什么有限结论。

执行顺序固定为 `1 → 2 → 3 → 4 → 5 → 7 → 8 → 9 → 10 → 6`。Task 6 是总收口，不得因编号靠前而提前写结论。

## 2. 不变量与保护边界

- 候选 001、历史 v1/v2、001/002、六份 operation development 输入和报告、旧 clean 缺档说明均只读。
- 不修改支持合同、operation universe、admission、projection、generator 或 checker 的可观察语义；Task 1 只修候选/运行依赖绑定。
- Task 2 提交并推送 freeze 之前，不读取、下载、选择或试跑任何未见候选文档。
- Task 3 每行最多一次、`retries=0`、无 replacement、无后验修复；所有 rejection、unresolved、checker 或 infrastructure failure 留在分母。
- 不读取 Q1 reserved、held-out 或任何待定 prospective source；不进入第二 profile、Q4，不改变 portfolio/readiness。
- 候选 runner 和项目运行链不调用模型、业务 API、远端 API 或付费服务。公开来源的只读检索/下载只服务于来源冻结和离线归档。
- development-agent 消耗与项目运行的 model/API/paid accounting 分开记录；不声称人工节省、生态接纳率或真实 API 行为。
- Meilisearch 缺失 local ref 与 Bangumi external response advisories 作为既有公开边界保留，不在本阶段修支持面。

## 3. Task 1：生产依赖绑定

候选 001 的 `implementation` 是人工枚举的文件集合，不能证明普通入口在运行时没有从列表外加载生产模块。新 identity 保留候选 001，只新增：

- 把既有 `src/skill-ir/api-tester-production-contract.ts` 纳入候选生产闭包；它是 v2 contract 实际加载的本地运行模块，而不是 type-only dependency；
- 把既有 `src/benchmarks/skill-ir/source-fixture.ts` 纳入候选生产闭包；v2 artifact 在运行时使用其 `sha256Bytes`；
- 一个 additive candidate/binding schema 与 verifier，完整绑定入口的本地运行模块、锁定第三方依赖、内置模块边界、runtime 和外层实验 verifier，并在任何输入读取/执行前拒绝 missing、extra、digest drift、runtime/lock drift 和 entry drift。

闭包只覆盖生产运行依赖；测试、文档、历史报告和开发 runner 不是候选运行依赖。动态 import、无法静态解析的加载或条件分支必须显式列为 unresolved 并阻止冻结，不能默认为已覆盖。

TDD 的最低反例为：从新绑定中删除真实依赖、修改真实依赖、伪造摘要、遗漏上述两个已存在模块，均在输入执行前失败；未修改的新候选控制组通过。Task 1 只在新 candidate/binding identity 上闭合，不改候选 001 或生产算法文件。

## 4. Task 2：预注册和离线输入包

Task 2 在读取未见来源前冻结：

- 目标分母：12 份真实公开 OpenAPI 文档，理想为 12 个独立仓库；另有 6 个确定性 synthetic boundary。
- 搜索空间、查询、允许的来源站点、许可证规则、OpenAPI 3.x 格式门、文件大小/操作数资源上限、仓库与 lineage 去重、排序键、配额和不足时的停止方式。
- 选择只依据来源、许可证、格式、重复与资源规则；禁止依据候选接纳、拒绝、checker 结果或 operation count 筛样。
- 对 Q1 reserved、held-out、旧 exposed 六份、旧 prospective/derivative、fork/mirror 的排除规则。
- 先仅用 synthetic 开发 strict manifest、prediction、first-run state/prefix/report/validator 和 stop-loss；真实输入选择发生在 freeze commit/push 之后。

每个真实输入归档原始字节、许可证证据、仓库 URL、上游 commit、path/blob、发现/暴露时间和 SHA-256。预测在候选执行前写入，允许预测 operation-level aggregate outcome，但不能通过 candidate parser 或 runner 预看。

## 5. Task 3--5：唯一首轮、分析和干净复现

Task 3 由前景串行 owner 执行固定 `12+6` 行。每行 dispatch 前原子写入状态；terminal evidence 先落盘，再推进连续 prefix。`dispatched` 后没有 terminal 的行令整项 fail closed，不能重发。候选完整性、输入包闭包或覆盖 verifier 失败时在第 0 行前停止。

Task 4 只从机器首轮报告派生：文档级与 operation-level 计数、macro averages、拒绝码/多缺口共现、source advisory/constructive obligation、预测比较、资源和运行成本。旧六份 development 只能作观察性背景，不并入 prospective 分母。

Task 5 从 Task 3 的精确执行提交建立 detached 干净检出，使用锁定依赖和仓库内 archived input bundle 离线复现。比较 normalized semantic result、operation coverage、artifact/checker digests 与统计；路径、时间戳、耗时和 OS/runtime 单列。删除 worktree 前必须验证 archive exact closure、Git commit/detached 和 clean 状态。

## 6. Task 7--10：首轮后的扩展研究

Task 7 把 `public-structure-driven offline conversion/reporting` 定义为可证伪的 responsibility family，而不是把当前实现等同于家族。机器矩阵至少分开输入结构、输出、构造、验证、依赖/引用、副作用和外部决策，并区分 `verifiable` 与 `constructible`。

Task 8 先预注册 40 个真实公开 skill、至少 8 个仓库的 scope/order/dedup/quota/unit 规则，再阅读全文和直接链接的脚本、模板、参考文件。分析单位是 responsibility；skill 聚合不能掩盖同一 skill 内混合可构造/不可构造职责。样本排除 Q1/held-out/任何待运行 prospective。

Task 9 必须从 Task 8 的冻结选择中按规则选 3 个独立仓库的 API 相关 skill。只对已暴露的普通 API 输入，以新的 development identity 运行现有入口；不能增加 skill/path 分支或修改 candidate。负结果是合法结果。

Task 10 在 exposed/synthetic 输入上比较：whole-document vs operation-level、缺少独立 dependency verifier vs full verifier、完整 responsibilities vs accepted-only。先写共同 operation/responsibility universe 和预期变化；历史证据可复用时不重跑，不能把不同 identity/denominator 的差异写成因果效应。

## 7. 证据、提交与恢复

每个 task 至少有一个聚焦提交；Task 2 freeze 必须先 push 到 `origin`，Task 3 结果无论正负都提交。所有机器报告 write-once，并绑定 schema、identity、parent commit、输入/实现/依赖摘要和 accounting。`docs/skill-ir/api-tester-operation-prospective-research-status.md` 是唯一恢复入口，始终记录当前阶段、最近提交、证据路径、开放问题和下一条具体命令。

若需要人工决策，只暂停依赖该决策的分支，先保存现场并完成其余独立工作。任何 source blocker、infrastructure failure 或负结果都不得通过替换输入、重试、扩支持或删除分母修饰。

## 8. 完成标准

只有 Task 1、2、3、4、5、7、8、9、10、6 全部具有机器/文档证据、fresh verification 和提交，Task 5 clean reproduction 可独立运行，并且没有未解决的实现正确性缺陷时，本总目标才完成。来源本身的保守 blocker 可以保留，但必须限定可靠性结论。最终只判断是否具备“筹备下一轮 prospective”的条件；即使具备，也不自动选择或读取新样本。
