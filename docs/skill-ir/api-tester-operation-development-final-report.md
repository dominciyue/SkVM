# API Tester operation-level development 总报告

日期：2026-09-09

状态：`completed-with-source-blocker`

分支：`api-tester-operation-admission-dev`

## 1. 范围与结论

本阶段严格复用 v2 migration 已暴露的六份真实文档和确定性合成 detector fixture。冻结 v1/v2 product、001/002
输入/预测/锁/报告、whole-document `0/6` 与 readiness 均未修改；没有 prospective、held-out/Q1 reserved、第二 profile、Q4、
模型、远端 API 或付费调用。

Task 1 和 Task 2 的 bounded development 目标均已实现并验证。实现正确性和有限范围可靠性通过；原 Meilisearch 文档的一个
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
- 文档检查器单测 `8/8`；3110 个 tracked 文件链接扫描为 0 broken/legacy。
- full live strict replay：36 derivatives、34/34 applicable pass、2 N/A、9/9 detected、clean reproduction pass。
- frozen product/001/002 与 Task 1 evidence diff guard、结果绝对路径、secret-like assignment、source-specific success branch、
  `git diff --check` 均通过。
- runtime model/API/paid=`0/0/0`；development-agent usage=`host-external-not-measured-by-runner`，两者没有混记。

剩余问题只有上述 source-bound missing ref；它不是未修复的 implementation correctness defect。若要消除它，下一步应另行核实或修复
上游 Meilisearch 文档并建立新的 digest-bound identity，而不是猜测该参数、改写本阶段报告、放宽 checker 或重跑冻结 002。若要扩展支持面、
进入新 prospective、跨 profile/平台或 readiness，均须另立授权与分母。

Task 2 的本地提交 SHA 记录在[执行状态](api-tester-operation-development-status.md)。
