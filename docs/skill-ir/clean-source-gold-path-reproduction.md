# 干净源码金路径复现

**状态：** `passed`

**identity：** `skill-ir-clean-source-gold-path-reproduction-2026-09-06`

**绑定提交：** `3bd76188736a019e65e2a1f945a0d4bc307ca955`

## 1. 证明了什么

在 Windows x64 的一个全新 detached Git worktree 中，先确认 tracked 状态为空，再按 `bun.lock` 安装依赖，随后从源码入口分别执行：

- API Tester `openapi-json` preset；
- Env Manager `machine-checked` preset。

两条路径均生成 `status=passed` 的 `cli-report.json`，`modelCalls/apiCalls/paidCalls=0`，且
`coreBranchDelta=0`。机器汇总和两份原始 CLI 报告位于：

```text
results/skill-ir/clean-source-gold-path-reproduction-2026-09-06/
  report.json
  api-cli-report.json
  env-cli-report.json
```

这证明绑定提交上的两条冻结 source-checkout preset 可以在同机新检出环境复现；它不是独立外部操作者观测、
npm/standalone clean-install、跨平台、任意新 skill 或新研究质量结果。

## 2. 复现环境

- Git：fresh detached worktree，初始 tracked state clean；
- Bun：`1.3.14`；
- Node：`23.8.0`；
- 依赖：`bun install --ignore-scripts --frozen-lockfile`，236 packages；
- `postinstall`：未运行，因为本验收只验证 source checkout 路径，不验证发布包安装；
- held-out、API key、模型/API：均未读取或调用。

## 3. 从干净 checkout 运行

下面命令假设当前目录是绑定提交的干净 checkout。两个 workdir/out 必须不存在或为空，且彼此不同。

```powershell
bun install --ignore-scripts --frozen-lockfile

bun run ./src/cli/artifact.ts `
  --preset=api-tester `
  --variant=openapi-json `
  --root=. `
  --workdir=.skvm/repro/api-work `
  --out=.skvm/repro/api-out `
  --completed-at=<ISO-8601>

$env:SKVM_BUN_BIN=(Get-Command bun).Source
bun run ./src/cli/artifact.ts `
  --preset=env-manager `
  --root=. `
  --workdir=.skvm/repro/env-work `
  --out=.skvm/repro/env-out `
  --completed-at=<ISO-8601>
```

验收两份 `cli-report.json`：

```text
status = passed
accounting.modelCalls = 0
accounting.apiCalls = 0
accounting.paidCalls = 0
coreBranchDelta = 0
quality.mode = machine-checked
quality.result = pass
```

## 4. 暴露并修复的 checkout 字节问题

第一次全新 worktree 在模型或 artifact runtime 前 fail closed：Env source lock 绑定 CRLF 字节，而新 checkout
产出 LF。把该源文件精确固定为 CRLF 后，第二次 worktree 又暴露 evaluator 的相反问题：它的 authority digest
绑定 LF，而未声明属性的 Windows checkout 产出 CRLF。

最终只在 `.gitattributes` 增加两条精确路径规则：

```gitattributes
/benchmarks/skill-ir/pilots/env-manager/source/SKILL.md text eol=crlf
/src/bench/evaluators/env-manager-grade-v3.ts text eol=lf
```

旧 lock、checker、artifact、scorer 和结果均未改写；digest 比较没有放宽。回归测试同时验证属性声明和实际
工作树 SHA-256：

```text
source    1da53ec17fadccd3f72644cb4e0b8db1cc250ce01c414aa125ed6cd6e76dad6c
evaluator d5343795f00b9cc866111e5da049686d9b4f1566d810805ebb580a174b446382
```

## 5. 最终报告摘要

| preset | workflow | artifact manifest | checker | CLI report |
|---|---|---|---|---|
| API Tester JSON | `api-tester-openapi-json-verified-artifact` | `8ebab757...ea1eb` | `f3730969...9c8a5` | `d93b62ac...b4c12` |
| Env Manager | `env-manager-verified-artifact-machine-checked` | `8ba25154...a2197` | `e33a2748...06dbe` | `4af7f015...03d53` |

报告的 `repairEvidence` 保留两次失败提交和最终通过提交，不能把修复前失败从历史中删除。

## 6. 验证与未来修改

```powershell
bun test ./src/benchmarks/skill-ir/verified-artifact-product-e1.test.ts `
  ./src/benchmarks/skill-ir/clean-source-gold-path-reproduction.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
git diff --check
```

若未来修改上述两个 digest-bound 文本，必须创建新 evidence identity；不得悄悄改旧 SHA。若要扩成产品安装
主张，应另做 npm/standalone clean-install；若要扩成迁移主张，应由独立操作者和另一平台复现。
