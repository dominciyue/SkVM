# API Tester operation-level development 总报告

日期：2026-09-09

状态：`passed-with-source-blocker-after-dependency-verifier-revision`

分支：`api-tester-operation-admission-dev`

## 1. 范围与结论

本阶段严格复用 v2 migration 已暴露的六份真实文档和确定性合成 detector fixture。冻结 v1/v2 product、001/002
输入/预测/锁/报告、whole-document `0/6` 与 readiness 均未修改；没有 prospective、held-out/Q1 reserved、第二 profile、Q4、
模型、远端 API 或付费调用。

Task 1 和 Task 2 的历史报告保持原样。后续审计发现旧 dependency verifier 的三类漏检，现已由独立 revision identity 修复并复现；
修订后的实现正确性在当前 bounded development 范围通过。原 Meilisearch 文档的一个
缺失 parameter reference 仍使 source correctness blocked。因此本结论不是完整文档接纳、任意 OpenAPI、真实 API 行为、人工节省、
生态接纳率、跨 profile/平台或 readiness 证据。

## 2. Task 1：清单、准入与局部产物

- 六份文档均完整枚举 operation universe，共 `562` 项。
- 准入结果为 `112 accepted + 449 rejected + 1 unresolved`。
- 五个按文档聚合的 artifact 中，`112/112` accepted operations 通过未修改的 v2 checker；Box 为 `0/297`，不运行 artifact。
- 合同内验证义务覆盖 `575/575`；source coverage、admission consistency、artifact correctness 三项分门通过。
- 唯一 unresolved 是 Meilisearch `GET /tasks` 在 `#/paths/~1tasks/get/parameters/0` 引用不存在的
  `#/components/parameters/total`。实现不猜测参数身份，故 Task 1 总 correctness 保持 fail。
- Task 1 提交：`f92e8a1f95a061af921fe476aa90016b2b627153`。

权威机器报告：`results/skill-ir/api-tester-operation-admission-development-001/report.json`

文件 SHA-256：`d2fbe27a27b5d7d94f8ab2aeb45c0fb23c610f0bd47d82cdd04ee4bd4c37b2c6`

portable semantic SHA-256：`1a14ed36ebc185befcb4f3d2c03f95d89bd1e8a1a89da560a9c6eb35b89a1e87`

## 3. Task 2：变形、错误检出与 clean reproduction

Task 2 strict-read Task 1 实际提交、报告、六份 inventory 和五份 artifact closure 后，因 `112` 个真实 checker-pass operation
自动选择 `real-positive`；调用方不能覆盖分支。

- 六类预登记变换 × 六份文档形成 `36` 个派生输入；`34/34` applicable relation 通过。
- Box/HFS 的 local-ref/inline 因不满足登记条件，明确为 `2` 个 typed not-applicable；派生输入不增加真实样本。
- operation omission/duplicate、parameter/ref/security loss、summary drift、false acceptance、artifact endpoint/witness loss 共 `9/9`
  在预登记 detector layer/code 被捕获；detector fixtures 为 synthetic，不计真实成功率。
- detached Task 1 worktree 经锁定离线安装后从零运行；portable digest、计数、gates、`575/575` obligations 和全部
  inventory/artifact digests 与 Task 1 完全一致。
- 独立只读审查发现 strict verifier 对 transform 状态/比较字段和 fault detector/code 映射约束不足；新增 RED 后已用实现注册表
  闭合并通过回归。真实报告及其结果未改变。
- Task 2 实现与证据提交：`40b24c174983afe074438c8855d0094c7078ca8c`。

Task 2 机器报告：`results/skill-ir/api-tester-operation-validation-development-001/report.json`

文件 SHA-256：`7c49bf346d564fcfdaaa80ebc9ef6a8ea678cb2197411286b8e4093dac0d2bbd`

portable semantic SHA-256：`d9a97e917179927437ea5a2aea547652ac3899feea1ec179f0b0c5d2d8ee02a0`

总机器报告：`results/skill-ir/api-tester-operation-development-001/report.json`

文件 SHA-256：`dbba70c008acfd523733308e800cf1adbd5a4fb337fd2ff00ff638d776626c31`

portable semantic SHA-256：`bbf927bf6f3f29c75a70bf1fcbe2074373ce43255dafe202e8889a2e14960e61`

## 4. 可运行入口

不依赖外部 cache 的静态复核：

```powershell
bun test ./src/skill-ir/api-tester-operation-development.test.ts `
  ./src/skill-ir/api-tester-operation-validation.test.ts `
  ./src/skill-ir/api-tester-operation-validation-development.test.ts
```

完整离线复现须从 Task 1 commit 建 detached worktree，使用同一 digest-bound 已暴露 cache，并为 exclusive-create runner 提供新输出：

```powershell
git worktree add --detach .worktree/api-operation-task1-repro `
  f92e8a1f95a061af921fe476aa90016b2b627153

Push-Location .worktree/api-operation-task1-repro
bun install --frozen-lockfile --offline
bun ./src/skill-ir/api-tester-operation-development-run.ts `
  --root=. --cache-root=<digest-bound-offline-cache> --node=<node> `
  --out=results/skill-ir/api-tester-operation-admission-development-001-clean-reproduction
Pop-Location

bun ./src/skill-ir/api-tester-operation-validation-run.ts `
  --root=. --cache-root=<digest-bound-offline-cache> `
  --clean-root=.worktree/api-operation-task1-repro --node=<node> --git=git `
  --validation-out=<fresh-task2-output> --combined-out=<fresh-combined-output>
```

以上命令不应指向已提交结果目录；runner 会拒绝覆盖。不得运行冻结的 `api-tester-v2-feature-migration-first-run.ts`。

## 5. 验证证据、成本与下一步

- API Tester operation + v1/v2 回归：`56/56`，278 assertions；独立审查修复后聚焦：`11/11`，67 assertions。
- 当前 `src/skill-ir`：`160/160`，899 assertions；TypeScript typecheck 通过。
- 文档检查器单测 `8/8`；3120 个 tracked 文件链接扫描为 0 broken/legacy。
- full live strict replay：36 derivatives、34/34 applicable pass、2 N/A、9/9 detected、clean reproduction pass。
- frozen product/001/002 与 Task 1 evidence diff guard、结果绝对路径、secret-like assignment、source-specific success branch、
  `git diff --check` 均通过。
- runtime model/API/paid=`0/0/0`；development-agent usage=`host-external-not-measured-by-runner`，两者没有混记。

## 6. 后续 dependency-verifier 修订与最终判断

旧 Task 2 的 `9/9` fault 事实不改写，但其 fault set 没有覆盖 response component target、parameter target 内 nested ref target，以及同名
security requirement 对应的 scheme body。review baseline `d2e748868a3c5e88b49cb940d4cd495f7b4dcf68` 对这三项均 false-pass；修订提交
`a359c0c68862637153b98a7f7ae797de35e0564c` 以 TDD 将它们在 dependency-verifier 层 `3/3` 检出，同时 unchanged、shared/cyclic controls
通过。独立只读审查随后发现 strict verifier 尚未把 report revision 与当前 checkout 绑定；新增 RED 用例后，`a359c0c` 同时要求 live Git
commit 与 detached 状态完全匹配报告。旧报告继续是时间序列中的历史证据，不再单独支持“没有剩余 dependency-verifier defect”的主张。

新机器报告：`results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json`

- 文件 SHA-256：`a61e19359d735880593f15c96c6d0789da3e37f0098e92b31544a51e2bd186e8`；
- portable semantic SHA-256：`206bdea5809c322fa01bf10ffe6af408abf0a081f9ed8813d0cdda1a347cc98c`；
- run semantic SHA-256：`5e296dbce15421298f0d5ba298b7de220ccc7ac712a8ecaa44996c7201e4f036`；
- old/fresh aggregate checks：operation universe、admission、dependency、checker-pass、obligation coverage 全部为 true；
- old/fresh totals：均为 562 operations、112 accepted、449 rejected、1 unresolved、112 checker-pass、575/575 obligations；
- clean checkout：Windows x64、Bun 1.3.14、Node v23.8.0，`bun.lock` SHA-256
  `b6814f09782eecf544fca3c7426a706afe8793c750064d67bdb7b937a91cadfb`，`--frozen-lockfile --offline` 安装和新入口通过。
- 修订聚焦测试 `15/15`、45 assertions；`src/skill-ir` `171/171`、935 assertions；typecheck 通过。benchmark broad 为
  `1183 pass / 6 skip / 63 fail`，63 项仍是交接中已登记的冻结 digest/registry/Windows compatibility 历史簇，本修订路径新增 failure 为 0，
  因而不宣称仓库 broad 全绿。

新维度显示 112 个 accepted operation 的 projection preservation 和 construction obligations 全部通过；19 个 Bangumi operation 因 standalone
source 引用 32 次外部 response components 而 source-validity unverified。它们是 non-construction response dependencies，未被伪装成 v2
构造义务；Meilisearch `GET /tasks` 缺失本地 parameter ref 仍是唯一 blocking source issue。

结论：已具备冻结一个同 v2 支持合同、显式保留上述 source blocker 与 source-validity advisories 的新 operation candidate 的 development
条件。冻结只应提交候选、合同、输入选择规则与执行前预测；本阶段没有选择、读取或执行 unseen input，也不改变 readiness。真正启动新
prospective 仍需独立 identity、冻结分母和明确授权。

若要消除 source blocker，下一步应另行核实或修复
上游 Meilisearch 文档并建立新的 digest-bound identity，而不是猜测该参数、改写本阶段报告、放宽 checker 或重跑冻结 002。若要扩展支持面、
进入新 prospective、跨 profile/平台或 readiness，均须另立授权与分母。

Task 2 的本地提交与恢复状态也记录在[执行状态](api-tester-operation-development-status.md)。
