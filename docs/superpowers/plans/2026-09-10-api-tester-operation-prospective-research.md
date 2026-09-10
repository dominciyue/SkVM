# API Tester 操作级未见输入与扩展研究实施计划

> **恢复规则：** 每次继续工作先读 `docs/skill-ir/api-tester-operation-prospective-research-status.md`，核对其中 branch/HEAD/evidence/nextCommand，再只执行当前未完成 task。

**目标：** 在不改变 v2 支持合同和 operation 算法的前提下，补齐候选生产依赖绑定，冻结并执行一次 `12 real + 6 synthetic` 未见输入首轮，完成分析/clean reproduction，再完成家族、40-skill、三 API skill 和机制消融研究，最后统一收口。

**设计：** [研究设计](../specs/2026-09-10-api-tester-operation-prospective-research-design.md)

**固定顺序：** `1 → 2 → 3 → 4 → 5 → 7 → 8 → 9 → 10 → 6`

## 全局依赖图

```text
Task 1 candidate closure
  -> Task 2 prereg + synthetic-only runner freeze + push
    -> Task 3 immutable 12+6 first run
      -> Task 4 analysis
      -> Task 5 detached offline reproduction
      -> Task 7 family definition
        -> Task 8 preregistered 40-skill study
          -> Task 9 three API skills
      -> Task 10 mechanism ablations
        -> Task 6 final synthesis and verification
```

Task 4/5 依赖 Task 3 的实际报告；Task 7 原计划也消费该报告，但在 Task 2 外部 push 门阻塞时依总目标例外，只用已暴露证据先完成并保持
prospective evidence pending。Task 8 依赖 Task 7 的责任定义；Task 9 依赖 Task 8 的冻结选择；Task 10 依赖 Task 1/3/7 的共同 universe 与现有
证据。Task 6 等待全部前项。

## Task 0：计划与恢复基线

- [x] 完整读取根 `AGENTS.md`、handoff、communication、spec、plan、candidate、delivery/component 文档和机器 readiness 状态。
- [x] 核对基线 `47efb148fb98288c173493c95582ed47d4fbdd3d`、历史未跟踪文件与 `origin/skill-ir-aot` ahead/behind。
- [x] 创建分支 `api-tester-operation-unseen-prospective-001`。
- [x] 添加本设计、计划、状态文件；同步 spec/主 plan、handoff、communication、conversation log。
- [x] 运行文档链接、diff/secret/path 检查，白名单提交 planning checkpoint `71b589f`。

验收：在任何 unseen source 被搜索/读取前，完整任务、依赖、验收、停止线和恢复入口已进入 tracked plan；tracked tree 只包含本阶段计划变更。

## Task 1：候选运行依赖闭包

**前置：** Task 0 planning commit。

**身份：** 新 candidate/binding identity；候选 001 只读。

- [x] 完整读取即将修改的 candidate freeze/verifier、ordinary input entry、其静态 import closure 和测试。
- [x] RED：missing dependency、dependency byte drift 和缺模块；首轮因新模块不存在得到 expected RED。
- [x] GREEN：把既有 `src/skill-ir/api-tester-production-contract.ts` 纳入新 candidate/binding；它是实际本地运行依赖，不是 type-only import。
- [x] GREEN：把既有 `src/benchmarks/skill-ir/source-fixture.ts` 纳入新 candidate/binding；它提供 v2 artifact 实际调用的 `sha256Bytes`。
- [x] 建立 additive candidate snapshot、freeze/verify CLI 和机器绑定报告；所有 gate 在输入读取与运行前执行。
- [x] fresh focused + relevant broad + typecheck + docs + frozen-history byte diff。
- [x] 更新 status/component/spec/plan/log，提交 Task 1 文档收口。

验收：本地运行模块、type-only import、内置模块和锁定第三方依赖已明确分账；所有真实生产 import 均在闭包中且摘要可从 Git/working bytes 独立重算；缺失/漂移在 pre-run 指定层拒绝；候选 001 字节不变；support id 和算法不变；未接触 unseen。

## Task 2：预注册、synthetic runner 与 freeze

**前置：** Task 1 commit。

**禁止：** freeze commit 推送前不得读取候选真实来源。

- [x] 先写 source protocol schema/test：search space、query、排序、license/format/size/operation limits、repo/lineage dedup、12-repo preference、shortfall policy、排除集合。
- [x] 写 `12 real + 6 synthetic` denominator、row order、resource/timeout、stop-loss、0 retry/replacement/fix 合同。
- [x] 只用 deterministic synthetic RED/GREEN first-run state/prefix、prediction、report、strict verifier、binding/coverage tamper。
- [x] 冻结 source discovery protocol、synthetic bytes、候选闭包、runner implementation 和 execution environment。初版 freeze 保留为 archive-incomplete 失败；revision 已在写入前证明 validation closure 与 execution commit 的 path/bytes 完全一致。
- [x] 运行 focused/broad/typecheck/docs/frozen/secret/path/diff；更新 status 和台账。
- [x] 白名单提交并 push Task 2 freeze 到 `origin/api-tester-operation-unseen-prospective-001`；remote-aware strict verifier 已返回 `remote-frozen`，freeze=`e4c006fe`、execution=`fb106838`。
- [x] 用 synthetic TDD 实现固定来源入口、write-once raw/source/license/input archive 与独立 replay verifier；覆盖 blob OID 协同重签、原始 search 候选静默删项、HTTP terminal 归档和不放宽 shortfall，真实来源读取仍为 0。
- [x] push 后只执行一次固定来源 acquisition；实际在 request 150 因 GitHub HTTP 403/rate remaining=0 终止。离线 audit 绑定 150 responses、331 files/22,409,115 bytes、10 non-authoritative partial bundles；selection/prediction/candidate trial 均为 0，不重试、不替换。
- [ ] 最终 input bundle/selection/prediction closure 与 pre-run input identity 因没有 authoritative selection 阻塞；Task 3 不启动。后续只有新预注册 identity 才能改变认证或来源获取方法，当前阶段不自行创建。

验收：选择规则可机械重放且不消费候选结果；12 real ideally 12 repos，任何不足有预注册 shortfall outcome；6 synthetic 不计真实样本；每份 input/license/lineage 有 exact digest；candidate 尚未运行。

## Task 3：唯一 12+6 首轮

**前置：** Task 2 freeze 已 push，input/prediction commit clean。

**唯一入口：** first-run CLI 的 `execute` 模式。

- [ ] 第 0 行前重新验证 candidate/import closure、Git commit、lock/runtime、input/license bundle、prediction、row order 和 output absence。
- [ ] 串行执行 18 行；dispatch journal、terminal、strict prefix 原子保存；每行一次，0 retry/replacement/fix。
- [ ] coverage/admission/artifact/checker/infrastructure 全部保留；失败和 unresolved 仍占固定分母。
- [ ] 运行 strict verifier；若 candidate integrity/evidence coverage fail，停止后续可靠性主张并记录 blocker。
- [ ] 提交 immutable first-run evidence，无论正负。

验收：报告恰含冻结 18 行且无遗漏/重复/替换；真实/合成分账；每行 source/candidate/prediction/result binding 完整；项目 runtime model/API/paid 为 0。

## Task 4：机器派生分析

- [ ] strict-read Task 3 实际报告，不从预测或聊天推断正例。
- [ ] 生成 JSON/CSV：document/operation totals、accepted/rejected/unresolved/checked、macro averages、拒绝共现、advisory/obligation、预测比较、耗时/资源。
- [ ] 写中文分析；旧六 development 仅观察性对照，synthetic 不进入真实统计。
- [ ] 验证所有表格可由机器报告重算；提交 Task 4。

验收：局部 operation success 不写成 document/live API success；所有分母清楚；成本分账完整；negative result 有完整诊断。

## Task 5：detached clean 离线复现

- [ ] 从 Task 3 精确执行提交创建短路径 detached worktree。
- [ ] `bun install --frozen-lockfile --offline`，仅使用 tracked archive 和声明依赖；禁止外部 cache/绝对开发路径。
- [ ] 重新运行候选 closure verifier、18-row replay/reproduction 和 semantic comparison；不重发任何远端调用。
- [ ] 归档 input/output/log index/file digests、OS/Bun/Node 和环境字段。
- [ ] 主 checkout strict-read clean report 并比较 semantics/coverage/artifact/checker digests。
- [ ] 核对 worktree commit/detached/tracked-clean 与 archive closure 后移除、prune；提交 Task 5。

验收：公开复现命令从干净检出离线成功；语义与 Task 3 一致，环境差异单列；若失败保留原始现场且不得称 reproducible。

## Task 7：家族定义与责任矩阵

- [x] 按总目标的独立工作例外，只用现有公开能力和已暴露证据建立 family definition、examples/counterexamples、rejection taxonomy；Task 3
  仍未发生且没有被假设为成功。
- [x] 分开 task/public evidence/current implementation；分开 verifiable/constructible。
- [x] 建立 criteria-source-implementation-verification 机器矩阵和 responsibility-to-skill aggregation。
- [x] consistency tests + component/spec/plan 更新；独立复核的 evidence-kind、output containment、dependency-propagated expected-assessment
  三项 false acceptance 已修复并保留。最终修订提交 `4b7b7abf47417eef356c5d11c3fef96c1db5fc29`，机器报告 SHA-256
  `d2860261a1bbe0dae45c531d8c1b733ba177dbf23a97e5684473cda0562cc8ee`。

验收：家族标准可在不运行候选的情况下应用；每个判定有 locator/evidence；不把当前 API 子集等同于整个家族。

## Task 8：40-skill 公开责任研究

- [ ] 在阅读新 skill 前冻结 scope/order/dedup/quota/unit/license 和至少 8 repo 规则；排除 Q1/held-out/pending prospective。
- [ ] 按规则选择 40 skills，保存 repo/commit/path/license/digest/exposure time；先提交 selection identity。
- [ ] 完整读取每个 SKILL 与直接链接的 scripts/templates/references；逐 responsibility 记录输入/输出/依赖/副作用、分类依据、locator、missing。
- [ ] 生成 machine index、duplicate/coverage/consistency verifier、skill/responsibility/source counts 与限制。
- [ ] AI analysis/review 成本标为 development-agent，非人类标注；提交 Task 8。

验收：40 distinct skill、>=8 repositories 或明确预注册 shortfall；每项 selected responsibility 恰有一个分类；不存在共同漏项或悬空 source locator；不报告真人一致率。

## Task 9：三个 API skill 的既有入口映射

- [ ] 严格按 Task 8 预注册选择 3 个独立 repo 的 API-related skills，冻结相关 responsibilities。
- [ ] 映射 ordinary inputs、semantic requirements、当前 supported/unsupported 与证据缺口。
- [ ] 只在已暴露 API inputs 上建立新 development identity 并运行现有入口；禁止 per-skill/path 分支和 candidate 修改。
- [ ] 生成正/负结果、checker/coverage、未支持责任和成本报告；提交 Task 9。

验收：选择可从 Task 8 机器索引重算；三 skill 全责任不因已有 accepted operation 被裁剪；negative result 不被排除。

## Task 10：机制消融

- [x] 预登记共同 operation/responsibility universe、三类对照、适用条件、比较字段和混杂；Task 3/8/9 unavailable 明确不填补，prospective failure 只作 availability gate。
- [x] whole-document vs operation-level：同一 exposed operation universe；Task 3 synthetic/prospective evidence unavailable 不插补。
- [x] no independent dependency verifier vs full verifier：按 Task 2 指定 synthetic faults 比较检出，真实 blocker/advisory 只作 context。
- [x] complete responsibilities vs accepted-only：分别量化 operation 与 family 中被隐藏的 unsupported/unresolved 责任。
- [x] 复用 Task 1/2/7 已有证据；使用独立 development control，不运行历史 unique runner。
- [x] 输出机器报告和中文结论；提交 Task 10 为 `a1727b92928e1a32ce21b4bf21dc61bd80e3415e`。

验收：每项效应与其 denominator/identity 对齐；检出率只代表设计 fault set；不将非随机、跨 identity 比较写成总体因果结论。

## Task 6：总收口

- [ ] 建 claims-evidence-limitations 表、中文研究总报告、clean reproduction 手册和下一决策建议。
- [ ] 分别汇总 Task 1/2/3/4/5/7/8/9/10 的实际结果、入口、提交、证据、remaining issues 和成本。
- [ ] 判断是否具备“筹备新 prospective”条件；即使 yes，也只写下一轮设计建议，不选择/读取/运行新样本。
- [ ] 同步 spec/plan/component/status/README/handoff/communication/conversation log。
- [ ] fresh focused、`src/skill-ir`、相关 benchmark、typecheck、doc tests/link scan、frozen history、secret/path、`git diff --check`。
- [ ] 独立只读审查；对 finding 用 TDD 修复并重新验证。
- [ ] 白名单 final commits，push 开发分支；确认不触碰 `main`/`upstream`。
- [ ] 只有所有完成门闭合后才将总目标标为 complete。

验收：最终报告可从仓库内 committed evidence 重验；没有 implementation correctness blocker；所有保护边界和历史负结果保持；恢复状态指向完成提交和复现命令。
