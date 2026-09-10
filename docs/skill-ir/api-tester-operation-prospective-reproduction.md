# API Tester 操作级研究离线复现手册

## 复现范围

本手册从干净 Git checkout 复核已经提交的候选闭包、synthetic pre-source 归档、两项来源失败归档、机制消融和总机器报告。它不会重发 GitHub 请求、运行 prospective row、读取 held-out/Q1 reserve 或覆盖 write-once 报告。

Task 3 从未运行，因此不存在可以复现的 prospective first run。这里复现的是“已完成证据与失败现场的离线可核验性”，不是补做 Task 5，也不是首轮重试。

## 固定环境

- 分支：`api-tester-operation-unseen-prospective-001`
- evidence commit：由最终机器报告的 Git 历史自动解析（见下方命令），不依赖手工占位符。
- Bun：`1.3.14`
- Node.js：`v23.8.0`
- package manager lock：仓库根 `bun.lock`
- 输入：全部来自该提交内的固定相对路径和 SHA-256；不依赖开发目录缓存或绝对路径。

## 建立干净检出

在已有仓库旁创建一个新的 detached worktree；不要复用当前开发目录：

```powershell
$ReportPath = "results/skill-ir/api-tester-operation-prospective-research-synthesis-development-001/report.json"
$EvidenceCommit = git log -1 --format=%H -- $ReportPath
if (-not $EvidenceCommit) { throw "committed synthesis report not found" }
$CleanRoot = Join-Path (Split-Path (Get-Location) -Parent) "SkVM-api-operation-synthesis-clean"
git worktree add --detach $CleanRoot $EvidenceCommit
Set-Location $CleanRoot
git status --short --branch
```

准备锁定依赖。离线安装要求本机 Bun cache 已包含 `bun.lock` 中的包；缺 cache 是环境准备失败，不能联网静默补依赖后仍称离线：

```powershell
bun install --frozen-lockfile --offline
bun --version
node --version
```

预期版本为 Bun `1.3.14`、Node `v23.8.0`。版本不同应先报告环境差异，不修改证据。

## 逐层核验

PowerShell 中若 Node 路径含空格，把整个 `--node=...` 参数放在引号内。以下示例假定 `node` 可直接解析；需要时替换为完整路径。

### 1. 候选运行依赖闭包

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-candidate-binding-run.ts --mode=verify --root=. --node=node --git=git --binding=benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json
```

预期：`status=verified`、`runtimeModules=11`、`addedRuntimeDependencies=2`、`prospectiveRuns=0`。

### 2. 六项 synthetic pre-source 归档

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-synthetic --root=. --out=results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation --node=node
```

预期：`syntheticDocuments=6`、`expectedSourceCoverageFailures=1`、`prospectiveRuns=0`。这里的 source-coverage failure 是预登记边界被正确发现，不是 infrastructure failure。

### 3. Prospective 来源失败现场

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-source-failure-audit.ts --mode=verify --root=. --out=results/skill-ir/api-tester-operation-prospective-001/source-selection
```

预期：`requestsAttempted=150`、`partialInputBundles=10`、`authoritativeSelections=0`、`terminalStatusCode=403`。不要运行 `acquire`，不要把 partial bundle 制成 selection。

### 4. Responsibility family

```powershell
bun test ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
```

预期：12 tests 全部通过；测试会读取和核验实际 contract/counterexample/report closure，并验证已知 tamper 被拒绝。

### 5. Public-skill metadata 失败现场

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-failure-audit-run.ts --mode=verify --root=. --audit=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/failure-audit.json
```

预期：`metadataRequestsAttempted=7`、`archivedSuccessfulResponses=7`、`publicSkillBodyRequests=0`。不要运行 discovery 或 selection。

### 6. 机制消融

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.ts --mode=verify --root=. --protocol=benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json --out=results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json
```

预期：`operations=562`、`faults=9`、`responsibilities=7`。

### 7. 总报告

```powershell
bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts --mode=verify --root=. --out=results/skill-ir/api-tester-operation-prospective-research-synthesis-development-001/report.json --git=git
```

预期：`status=verified-incomplete-development-synthesis`、`completed=4`、`blockedOrFailed=6`、`eligibleToPrepare=true`、`eligibleToExecute=false`。

## 完整开发检查

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.test.ts ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.test.ts ./src/skill-ir/api-tester-operation-development.test.ts ./src/skill-ir/api-tester-operation-validation-development.test.ts ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts ./src/benchmarks/skill-ir/api-tester-operation-prospective-source-failure-audit.test.ts ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-failure-audit.test.ts
bun run typecheck
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

## 失败解释

- `digest drift`、`schema`、`derived report drift`：证据字节或语义绑定不一致，停止；不要重签报告掩盖。
- Node/Bun 版本不一致：环境差异；先记录，不修改冻结 runtime 字段。
- synthetic expected source-coverage failure：预期通过的错误检出关系，不是候选 infrastructure failure。
- prospective `403` 与 public-skill rate-limit failure：本次真实终止结果；核验成功表示失败现场可重验，不表示实验成功。
- 缺 selection/lock/first-run：Task 3/4/5/9 保持未运行，不能创建空报告代替。
- 历史 `clean-002` 缺失：永久证据限制；本手册和 additive evidence 不恢复原件。

复核完毕后先保存输出和确认 worktree clean，再由复核者自行决定是否移除 worktree；本手册不自动删除任何目录。
