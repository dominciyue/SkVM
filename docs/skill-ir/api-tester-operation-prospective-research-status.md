# API Tester 操作级未见输入研究执行状态

- `updatedAt`: 2026-09-10
- `branch`: `api-tester-operation-unseen-prospective-001`
- `baselineCommit`: `47efb148fb98288c173493c95582ed47d4fbdd3d`
- `currentStage`: `task-2-revision-freeze-pending-push; task-8-metadata-discoverer-freeze`
- `stageStatus`: `in-progress`
- `lastCompletedCommit`: `a9a601e`
- `currentCommit`: `a9a601e`
- `prospectiveInputsRead`: `0`
- `candidatePredictionsAuthored`: `0`
- `prospectiveRowsExecuted`: `0`
- `publicSkillMetadataRequests`: `0`
- `publicSkillBodiesRead`: `0`
- `runtimeAccounting`: `model=0, api=0, paid=0`
- `developmentAgentUsage`: `host-external-not-measured-by-project-runner`

## 当前证据

- 基线候选：`benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json`
- 交付冻结：`results/skill-ir/api-tester-operation-delivery-freeze-development-001/report.json`
- 新阶段设计：`docs/superpowers/specs/2026-09-10-api-tester-operation-prospective-research-design.md`
- 新阶段计划：`docs/superpowers/plans/2026-09-10-api-tester-operation-prospective-research.md`
- Task 1 RED：新候选 binding 模块缺失，`0 pass / 1 fail / 1 error`。
- Task 1 GREEN：聚焦 `5/5`，相关 operation/v2 回归与 typecheck 通过。
- Task 1 实现提交：`74338e73a4f6dae389c9d62ce84173c2d1672906`。
- Task 1 机器绑定：`benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json`，冻结提交 `13c5d79`。
- Task 1 live verify：`verified`，11 个本地运行模块、2 个新增生产依赖、0 unresolved import、0 prospective run。
- Task 1 fresh verification：focused `5/5`；operation/v2 `40/40`；`src/skill-ir` `189/189`、990 assertions；typecheck；docs `8/8`；3664-file link scan；frozen-history diff；`git diff --check` 全通过。
- Task 2 初始 RED：prospective module 不存在，`0 pass / 1 fail / 1 error`；随后为 source shortfall、CLI strict verify、18 行调用/lock/output tamper 分别保留预期 RED。
- Task 2 synthetic-only GREEN：协议固定 2 个 GitHub search query、12 real + 6 synthetic、12-repo/lineage/source 去重、许可/格式/100B–2MiB/1–2000 operation、0 retry/replacement/fix 和明确 shortfall。
- Task 2 focused：`11/11`、47 assertions；18 行通过 ordinary CLI 子进程，逐行保存 invocation/stdout/stderr/exit/terminal，per-row=120000ms、aggregate=2160000ms；strict verifier 可检出 lock、candidate output，以及同步重签 manifest 后的 journal 语义漂移。
- Task 2 独立审查最初发现 aggregate timeout 未实施、journal 只做自描述摘要两项风险；修订后分别由累计预算测试和协同重签 invocation tamper 测试闭合。
- Task 2 synthetic-only 实现提交：`8a6ed12da5c16f1dca0f18e40e6c3152d9565a0b`。
- Task 2 正式 synthetic validation：`results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation/report.json`，SHA-256=`8fd612c8ff9c5fcd149f31b89ba35686e0c2a74dd99f3a59d146106d5009b8df`；6/6 rows 达到预期、其中 1 个预期 source-coverage fail 被正确识别，strict verifier=`verified`，prospective/model/API/paid/real-read 均为 0。
- Task 2 synthetic evidence 提交：`591765a01005acf94106c02030deedd454b9adb1`。
- Task 2 pre-source freeze：`benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze.json`，状态 `frozen-pending-push`，绑定 execution commit `591765a01005acf94106c02030deedd454b9adb1`、Bun 1.3.14、Node v23.8.0、候选/runner/protocol/6 synthetic/validation closure；source state 五项均为 0。
- Task 2 freeze 提交：`532c7c0dbbbf34f0e99aeed55779330e34fc30d0`；focused `11/11`、47 assertions 与 typecheck 通过。
- 向 `git@github.com:dominciyue/SkVM.git` 推送 `api-tester-operation-unseen-prospective-001` 的尝试被安全审查拒绝，原因是当前授权未被视为明确允许向该外部目的地发送整个分支。没有采用替代或绕过方式。
- remote-aware strict verification 按预期失败为 `commit is not present on origin/api-tester-operation-unseen-prospective-001`；这确认本地 freeze 已到远端门，不能进入 source discovery。当前仍未访问真实来源。
- 重新读取完整目标原文后确认用户已明确授权向用户 `origin` 的开发/实验分支推送；分支随后成功推送，未接触 `upstream`。
- 推送后的 remote-aware verification 发现更深层的真实失败：validation output manifest 引用 6 个 generator/checker 脚本，但 `.gitignore` 的 `results/skill-ir/**/artifacts/` 规则使它们未进入 execution commit。失败以 `pre-source-freeze-attempt-001/failure.json` 保存；旧 freeze 保留且不得用于 source discovery。
- 新 RED 首次因缺少 Git archive verifier export 得到 `0 pass / 1 fail / 1 error`。GREEN 新增 pre-write gate：精确比较 validation working closure 与 execution commit path set，并逐文件比较 checkout-filtered Git bytes；focused=`12/12`、48 assertions。尚需提交 6 个已有的 digest-bound ignored files 并创建 revision freeze。
- Git archive gate、6 个 manifest-bound 生成文件、初版失败证据和文档修订已提交为 `fb1068384177c00b11c836ce8d0f1b9fdecf59b6`；synthetic archive strict verifier 仍为 6/6 verified，typecheck 通过。
- 新 freeze 为 `benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze-revision-001.json`，SHA-256=`4f48859aac73f1d9ec6ea896ed4e1f3a0a06b33aaf1fb3bb517e476334cc07c2`，execution commit=`fb1068384177c00b11c836ce8d0f1b9fdecf59b6`；pre-write Git archive gate 已通过，source state 仍全零。
- revision freeze 已提交为 `e4c006fe32a6321ce5e4696758d53024c160f6db`；第二次向 origin 推送被安全审查要求新的对话内明确授权，未绕过，故 remote-aware gate 仍未满足。
- 按总目标“前置实验被阻塞时继续可独立家族定义/语料/文档”的条款完成 Task 7，未假设 Task 3 结果。新合同严格分离 family、公开证据、
  verifiable/constructible 和 current support；9 criteria、9 evidence files、7 examples、6 skill aggregates 全部由摘要和 locator 现场核验。
- Task 7 首份机器报告和 `revision-development-001` 均保留但已 superseded；独立复核失败记录为 `results/skill-ir/public-structure-offline-family-contract-review-001/failure.json`。
- Task 7 最终机器报告：`results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json`，SHA-256=`d2860261a1bbe0dae45c531d8c1b733ba177dbf23a97e5684473cda0562cc8ee`，portable=`db5c27e2441a427b1a6ac3d53b809b45ad29ede81bc9747ddd696686fccc90c9`；复核修订提交=`4b7b7abf47417eef356c5d11c3fef96c1db5fc29`；focused=`12/12`、25 assertions，typecheck 通过。
- Task 7 二次独立复核范围 `dc8eece..d5249d7` 无 Critical/Important/Minor，Ready=Yes。
- Task 8 pre-source 设计：`docs/superpowers/specs/2026-09-10-public-skill-responsibility-corpus-design.md`；实施计划：`docs/superpowers/plans/2026-09-10-public-skill-responsibility-corpus.md`。在设计和 protocol/selector 提交前，new public skill body exposure 仍为 0。
- Task 8 protocol/selector TDD：依次保存缺 module、discovery 原始文件绑定、固定 repository prefix、license missing/ambiguous 的 RED；当前聚焦 `9/9`、23 assertions，typecheck 和协议 CLI 均通过。协议在任何公开 metadata request 前固定 8 个 search page、前 25 个唯一 repository、每 repository 2 个追加请求、总上限 58；实际 metadata/body request 仍为 `0/0`。
- Task 8 组件文档：`docs/skill-ir/public-skill-responsibility-corpus.md`，明确当前只含 pre-metadata protocol/selector/CLI，正文读取门仍关闭。
- Task 8 pre-metadata protocol/selector 提交：`e6902a2`。提交时 public skill metadata/body request=`0/0`；这是 discoverer 真实联网前置，但不是 selection commit，仍不允许读取 `SKILL.md` blob。
- Task 8 metadata discoverer 已完成 synthetic TDD，待提交：固定八个 search + 前 25 repository 的 branch/tree 请求，归档原始 response 及 HTTP status/content-type/rate-limit metadata sidecar，独立重建核验，HTTP 失败写现场，CLI 不接受任意 URL。首轮只读审查的 API URL origin、失败归档静默丢失和 junction 逃逸均已有 RED/GREEN；后续审查的 redirect、响应头不可复核、事后 byte cap、协同 `incomplete_results=true` 错误接纳，以及非终结请求 rate-limit 时序空隙均已闭合。默认 transport 禁止 redirect、流式中止超过 64 MiB 的响应；当前 focused=`16/16`、50 assertions，typecheck 通过；真实 metadata/body request 仍为 `0/0`。
- `failure.json` 在首个请求前以 `wx` 预留，失败时通过既有句柄写入并 `sync`；归档或成功清理出错均显式失败。路径层逐组件拒绝 symlink/junction，并在读写前核对 realpath。受控单进程之外的敌对并发 TOCTOU 不在当前承诺内，已作为明确限制记录。
- Task 8 metadata discoverer 最终只读 preflight 无剩余 Critical/Important/Minor，Ready for first public metadata run=Yes。最终 focused=`16/16`、50 assertions，typecheck 通过；提交门前 public metadata/body request 仍为 `0/0`。

## 保留问题

- Meilisearch `GET /tasks` 缺失 `#/components/parameters/total`：既有 source blocker，不在本阶段修复。
- Bangumi 19 个 operation 的 external response reference：source-validity advisory，非 v2 construction obligation。
- 历史 dependency `clean-002` 原件缺失：永久证据限制；新运行不得冒充恢复原件。
- readiness 仍为 false；本阶段没有改变它的授权。

## 下一条具体动作

从提交 `a9a601e` 运行固定的 58-request-or-less
公开 metadata discovery。selection identity 提交前仍不得读取任何 `SKILL.md` blob；必须排除
pending prospective、Q1 reserve 和 held-out。只有在用户于对话中再次
明确允许向 `git@github.com:dominciyue/SkVM.git` 推送整个当前分支后，才执行 Task 2 push 并运行 remote-aware strict verification；通过前仍不得
搜索或读取 prospective unseen OpenAPI source。
