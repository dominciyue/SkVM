# Skill IR 开发与实验上手指南

这份指南面向第一次亲手操作本项目的人。目标不是让你记住全部实现，而是让你能够：

1. 看懂项目当前在解决什么问题；
2. 找到需要修改的文件；
3. 安全地运行本地测试、dry-run 和正式实验；
4. 修改参数、增加任务或接入一个真实 skill；
5. 看懂 raw、scored、gate 和 audit 结果；
6. 按项目规则留下可复现的代码、文档和实验记录。

本文件是操作手册。研究边界以 `skill-ir-aot-optimization-spec.md` 为准，执行顺序以
`skill-ir-aot-optimization-plan.md` 为准，数值结论以 `experiment-results.md` 为准。三者与本文件不一致时，
不要凭记忆继续做，先核对 Git 提交和最近一次 conversation log。

## 1. 先建立正确的项目认识

### 1.1 项目最终要交付什么

项目不是把 `SKILL.md` 改写得更长，也不是为每个模型维护一套 prompt。北向目标是把真实 skill 编译为
可验证、可复用的产物包：

```text
optimized_skill/
  skill_ir.json              权威语义
  skill.md                   给人和 agent 阅读的视图
  artifacts/
    checks/                  确定性检查
    schemas/                 输出和输入结构
    scripts/                 可复用程序
    templates/               稳定模板
    tool-plans/              固定工具计划
  manifest/provenance        来源、digest、版本和运行合同
  validation notes           验证范围、结果和未覆盖风险
```

其中：

- 静态阶段从 skill 正文、资源闭包和公开任务合同提取流程、规则、环境需求和可固化部分；
- 动态阶段只使用 development 执行中的合法失败证据，补充检查、恢复或产物；
- runtime 负责保护输入、执行产物、验证输出，并在允许的实验中至多修复一次；
- 离线 deterministic scorer 检查最终 workdir，才是任务是否成功的权威；
- held-out 只用于验证已经冻结的方法，不能反过来参与优化。

### 1.2 “优化成功”不是单一分数上涨

项目按以下顺序判断：

1. 基础设施运行有效，不能把路由、超时或进程崩溃记成 skill 失败；
2. benchmark 合同有效，不拒绝合理的 alternative-valid 输出；
3. optimized 相对 no-skill、original 和 ir-static 不发生不可接受回归；
4. 成功率、平均质量或跨重复稳定性提高；
5. 前四项通过后，再计算多次调用的摊销 Token 和 break-even。

因此，某个 artifact 在本地能运行，只代表机制成立；某个 development gate 通过，只代表方法开发案例成立；
没有 untouched replication、固定模型面板和 held-out 证据时，不能声称跨模型、跨 agent 或跨环境泛化。

### 1.3 现在已经做到哪里

截至 2026-08-09：

- IR schema、parser、validator、profile annotation、静态 pass、lowering、真实 runner、scorer、gate 和
  paired analyzer 已具备；
- Benchmark v2 已显著降低 v1 的私有措辞、唯一算法和 alternative-valid false reject，可用于方法开发；
- API Tester 的 source-audited schema-derived artifact 在冻结 development 中达到 4/4、mean 1.0，且
  runtime model tokens 为 0；它仍只是 method-development 证据；
- Env、Law、Experimental Design、Reviewer、zh-readme 分别暴露了基础设施分母、held-out 回归、任务饱和、
  residual failure 和 scorer 合同错误等不同问题；
- portfolio 当前登记 7 个真实 case，其中 5 个 contract-qualified、0 个 untouched replication，readiness
  尚未通过；
- Task 17.11 已把重复的 package assembly 抽为技能无关模块，并在 API Tester 与 Experimental Design v1
  两种 phenotype 上完成逐字节 shadow parity；新的 Experimental Design v2 compiler 已接入公共 assembly，
  本地 2/2 fixture 通过，但同一任务基线饱和，因此没有创建付费 optimized lock。

## 2. 第一次进入项目

### 2.1 打开正确目录和分支

在 PowerShell 中执行：

```powershell
cd D:\skill优化\SkVM
git status --short --branch
```

第一行应显示当前分支为 `skill-ir-aot`。不要在 `main` 上开发。仓库有本地未跟踪实验结果是正常现状，
不要为了“干净”而删除它们，也不要执行 `git add .`。

如果 Git 报目录所有权问题，可以对单条命令使用：

```powershell
git -c safe.directory=D:/skill优化/SkVM status --short --branch
```

### 2.2 每次工作前必须阅读的文件

按顺序打开：

1. `D:\skill优化\AGENTS.md`：项目工作规则；
2. `D:\skill优化\project_communication.md`：你与开发者之间已经确认的决策；
3. `docs/skill-ir/README.md`：权威入口和最新结论；
4. `docs/skill-ir/skill-ir-aot-optimization-spec.md`：研究和证据契约；
5. `docs/skill-ir/skill-ir-aot-optimization-plan.md`：当前任务和文件级 TDD；
6. 将要修改的组件文档。

不要从旧聊天记忆直接实现。历史过程在 `history.md` 和 Git history 中，当前行为只看权威组件文档。

### 2.3 检查开发环境

```powershell
bun --version
node --version
python --version
git --version
```

项目要求 Node.js 18 或更高版本，日常 TypeScript 测试和脚本主要使用 Bun。如果 `bun` 在当前终端找不到，
本机可直接使用：

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' --version
```

首次克隆或依赖缺失时运行：

```powershell
bun install
```

不要每次工作都重新安装依赖。`bun install` 可能改变 lockfile，执行后要检查 `git status`。

### 2.4 本地 cache 和自动探测

项目实验建议把运行数据放在仓库的 `.skvm`，它不应提交：

```powershell
New-Item -ItemType Directory -Force -Path .skvm | Out-Null
$env:SKVM_CACHE = (Resolve-Path .skvm).Path
$env:SKVM_AUTO_PROBE = '0'
```

Law pilot 使用独立 Python 环境时，再设置：

```powershell
$env:SKVM_PYTHON = (Resolve-Path .skvm\law-runtime\Scripts\python.exe).Path
```

只有运行 Law 相关 compiler/runtime 时才需要这一项。

### 2.5 配置项目 API，但不要把 key 写进文件

本地 `.skvm/skvm.config.json` 可以保存路由和环境变量名：

```json
{
  "providers": {
    "routes": [
      {
        "match": "xty/*",
        "kind": "openai-compatible",
        "apiKeyEnv": "SKVM_XTY_API_KEY",
        "baseUrl": "https://svip.xty.app/v1"
      }
    ]
  }
}
```

key 只放进当前 PowerShell 进程的环境变量。下面的写法不会回显 key，并会拒绝空输入：

```powershell
$secure = Read-Host 'Paste SKVM_XTY_API_KEY' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw 'SKVM_XTY_API_KEY is empty'
  }
  $env:SKVM_XTY_API_KEY = $value
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable value -ErrorAction SilentlyContinue
}

if ([string]::IsNullOrWhiteSpace($env:SKVM_XTY_API_KEY)) {
  throw 'SKVM_XTY_API_KEY missing'
} else {
  'SKVM_XTY_API_KEY=set'
}
```

关闭该终端后环境变量会消失，这是有意的安全边界。不要把真实 key 写入 Markdown、JSON、脚本、测试、
conversation log 或 Git commit，也不要使用会打印全部环境变量的命令。

## 3. 项目文件地图

### 3.1 顶层目录

```text
D:\skill优化\
  AGENTS.md                       项目规则，不提交到学校仓库
  project_communication.md       已确认问题和答案，不保存秘密
  conversation_log.md            每个阶段的工作留痕
  SkVM\                           Git 仓库
```

仓库内部：

```text
SkVM/
  src/skill-ir/                  IR schema、parser、validator、passes、lowering
  src/profiler/                  trace 和 profile annotation
  src/benchmarks/skill-ir/       matrix、runner、artifact、lock、gate、audit
  src/bench/evaluators/          确定性离线 scorer
  benchmarks/skill-ir/corpus/    corpus registry、intake、portfolio
  benchmarks/skill-ir/pilots/    每个真实 skill 的冻结输入和产物
  results/skill-ir/              实验结果与本地 raw workdir
  docs/skill-ir/                 权威文档
  scripts/                       结果分析和文档链接检查
  .skvm/                         本地配置、cache、日志和资源，不提交
```

### 3.2 一个真实 pilot 里面有什么

以 `benchmarks/skill-ir/pilots/<skill-id>/` 为例，通常包含：

```text
source/                          上游 SKILL.md、scripts、references、assets
tasks/                           2 development + 2 held-out 等公开任务
public-task-contract.json        用户可见输入输出合同
resource-contract.json           允许使用的脚本、路径、运行时和资源
task-split-freeze.json           development/held-out 身份冻结
base-ir.json                     静态分析形成的基础 IR
base-ir-source-audit.json        IR 是否可追溯到公开来源
artifact-adapter.json            声明式的 skill 特有配置，若该 pilot 已支持
packages/                        编译后的 artifact package
*.lock.json                      正式实验的模型、任务、digest、次数和 gate
```

不是每个历史 pilot 都已经有全部文件。缺失项代表当前成熟度，不要复制空文件假装完成。

### 3.3 最值得参考的三个案例

- API Tester：当前最清晰的声明式 schema-derived adapter 和 development 正向案例；
- Experimental Design v2：公开语义合同、alternative-valid 与 held-out 隔离的 benchmark 参考；旧 v1
  compiler 保留为历史，新 `experimental-design-v2-artifact-compiler.ts` 已绑定公开 v2 contract 并通过本地
  2/2 qualification，但尚无付费质量改进证据；
- Law to Markdown：脚本资源闭包和 held-out 回归案例，说明 development 通过不等于可晋升。

## 4. 必须掌握的术语

| 术语 | 含义 |
|---|---|
| `skill` | 有来源的自然语言流程、规则及其资源闭包。 |
| `pilot` | 围绕一个真实 skill 建立的任务、scorer、IR、artifact 和实验身份。 |
| `benchmark` | 对某个 skill 的可判分任务与确定性评分合同；v2 是协议方向，不是所有 skill 共用一个答案。 |
| `no-skill` | agent 只看用户任务，不看 skill。 |
| `original` | agent 看精确的原始 skill 正文及允许资源。 |
| `ir-static` | 只使用静态分析得到的 IR/视图，不消费动态失败。 |
| `optimized` | 经编译并受 provenance 绑定的 artifact package；历史脚本中也可能叫 `ir-pgo` 或 artifact arm。 |
| `development` | 允许用于方法构造、调试和 gate 的任务集合。 |
| `held-out` | 冻结后只用于最终验证，禁止进入 compiler、repair、prompt 或调参。 |
| `lock` | 固定模型、adapter、任务、次数、digest、gate 和实验身份的机器可读文件。 |
| `plan` | runner 将要执行的行；不代表已经运行。 |
| `raw` | 模型输出、运行状态、token 和 workdir 引用；尚未由任务 scorer 判定。 |
| `scored` | deterministic evaluator 对最终 workdir 的评分结果。 |
| `gate` | 预注册的通过条件及其机器判定。 |
| `audit` | 检查 benchmark 合同、来源、泄漏、materialization 或失败归因。 |
| `infrastructure failure` | 路由、鉴权、spawn、timeout、Bun crash、资源缺失等没有完成有效语义执行的失败。 |
| `semantic failure` | 进程正常执行，但最终产物违反公开任务合同或 scorer 准则。 |

## 5. 最安全的第一次实操

以下命令不会执行付费模型调用。

### 5.1 生成 pilot matrix

```powershell
bun ./src/benchmarks/skill-ir/run.ts --corpus=pilot | Set-Content -Encoding UTF8 .skvm\pilot-matrix.json
```

它读取 corpus registry 并生成矩阵，用来确认有哪些 runnable skill、task 和 system。完整 pilot matrix 当前
有数百行，写入 `.skvm/pilot-matrix.json` 比直接刷满终端更容易阅读。这里的 `run.ts` 只接受
`--corpus=calibration|pilot`，不要给它加模型或 artifact 参数。

### 5.2 生成真实 runner 的 dry-run plan

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  --corpus=pilot `
  --skills=api-tester `
  --systems=no-skill,original `
  --contexts=clean `
  --agents=skvm `
  --environments=windows `
  --limit=4 `
  --out-dir=results/skill-ir/manual-dry-run
```

没有 `--execute` 时只生成 plan，不调用模型。第一次先打开
`results/skill-ir/manual-dry-run/plan.json`，检查行数、task、system、模型和输出目录。

注意：正式冻结实验不要直接套用这条通用命令。应使用对应的 lock-specific runner，由它检查 digest、
任务集合、模型和次数。

### 5.3 查看 method portfolio readiness

```powershell
bun ./src/benchmarks/skill-ir/method-portfolio-run.ts
```

默认输出 `results/skill-ir/method-portfolio-readiness.json`。重点看：

- `passed`；
- `contractQualifiedCount`；
- `untouchedReplicationCount`；
- `passedDevelopmentPhenotypeCount`；
- `missingPhenotypes`；
- 每个 case 的 `blockers` 和 `unautomatedSteps`。

### 5.4 查看 partial-benefit re-entry policy

```powershell
bun ./src/benchmarks/skill-ir/partial-benefit-reentry-run.ts
```

它判断一个 original 尚未 full success 的 skill 是否仍有合法、公开、可复现的部分收益，是否允许进入方法开发。
它不会自动证明该 skill 已优化成功。

### 5.5 跑最基本的验证

```powershell
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
bun run typecheck
git diff --check
```

`bun test` 的作用是运行项目测试，防止新功能破坏已有合同。开发一个小组件时先跑 focused test；阶段完成前再跑
相关目录或全套测试。历史冻结测试与当前 HEAD 回归目前存在分层问题，所以全套失败时不要立刻重写旧 lock，
先确认失败属于历史 digest 漂移还是新代码回归。

## 6. PowerShell 和命令参数写法

### 6.1 多行命令

PowerShell 用反引号 `` ` `` 续行，它必须是该行最后一个字符，后面不能有空格：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  --corpus=pilot `
  --skills=api-tester
```

如果不确定续行是否正确，先把命令写成一行。

### 6.2 参数形式

项目脚本主要使用：

```text
--name=value
--boolean-flag
```

逗号分隔多值时不要在逗号后加空格：

```text
--systems=no-skill,original,ir-static
--contexts=clean,noisy
```

Windows 路径和包含中文或空格的参数建议整体加单引号。不要在单引号内部使用 PowerShell 变量展开。

### 6.3 `--execute` 是明确边界

- 没有 `--execute`：生成 plan 或做本地检查；
- 有 `--execute`：可能调用真实模型并生成 raw workdir；
- 正式实验前必须已有冻结 lock、dry-run、route/resource probe 和 qualification；
- 不要用 bypass flag 绕过 development、artifact 或 tasks-authored 护栏。

## 7. 常用实验参数

| 参数 | 作用 | 新手是否可改 | 正式实验注意事项 |
|---|---|---|---|
| `--corpus` | 选择 `calibration` 或 `pilot` registry | 可 | 必须与 lock 一致 |
| `--skills` | skill id 列表 | dry-run 可 | 改动会改变实验身份 |
| `--systems` | no-skill/original/ir-static/optimized 等臂 | dry-run 可 | 主表只放真实可执行系统 |
| `--tasks` | task id 列表 | 谨慎 | development/held-out 不得混用 |
| `--contexts` | clean/noisy/long 等上下文 | dry-run 可 | 需预注册，不能看结果后增减 |
| `--agents` | agent/harness 标签 | dry-run 可 | 标签必须对应真实执行方式 |
| `--environments` | windows/linux/macOS 标签 | dry-run 可 | 标签不是实测 OS 证据 |
| `--model` | 如 `xty/<route>` | 正式前冻结 | 必须 route probe；不要事后换模型 |
| `--model-family` | 分析用模型族标签 | 可 | 必须与实际模型一致 |
| `--adapter` | agent adapter | 谨慎 | 需与 lock 和 runtime 一致 |
| `--adapter-version` | adapter 版本 | 谨慎 | 应绑定可复现版本 |
| `--panel-config-id` | 固定模型面板/实验配置身份 | 正式前冻结 | pooled 证据必须预注册 panel |
| `--repetitions` | 每格重复次数 | dry-run 可 | 不能失败后临时加跑 |
| `--limit` | 截断计划行数 | 仅 smoke/dry-run | 正式分母不能靠 limit 截断 |
| `--out-dir` | 输出目录 | 可 | 每轮使用唯一目录，不覆盖旧结果 |
| `--retries` | 失败重试次数 | dry-run 可 | 冻结实验固定为 0 |
| `--retry-delay-ms` | 重试等待 | 可 | 正式实验通常因 retries=0 不生效 |
| `--outer-watchdog-ms` | 外部超时 | 谨慎 | 改动会影响 infra 判定，需写入 lock |
| `--require-env` | 要求环境变量存在 | 建议使用 | 只写变量名，不写值 |
| `--ir-override-dir` | 显式 IR overlay | 高风险 | 只用于已冻结的 development artifact 流程 |
| `--artifact-package-dir` | artifact package 路径 | 高风险 | 必须通过 manifest/digest/preflight |
| `--artifact-lock` | artifact 实验 lock | 正式必需 | 不得修改旧 lock |
| `--artifact-repair-mode` | `check-only` 或 `one-repair` | 实验设计决定 | 两臂须预注册，repair 成本分列 |

调试参数可以在 CLI 临时修改；一旦结果要进入报告，参数必须进入新 lock、新 `panelConfigId` 和新输出目录。
不要修改旧 lock 来“修复”历史实验。

## 8. 一轮正式实验如何运行

不同 pilot 有不同 lock-specific runner，具体命令以 `evaluation-system.md` 和对应 pilot 文件为准。统一顺序是：

```text
1. contract/schema focused tests
2. source closure、task split、scorer/oracle audit
3. lock digest validation
4. dry-run plan
5. resource probe 和 route probe
6. runtime qualification
7. retries=0 的唯一正式 execute
8. deterministic scoring
9. gate evaluation
10. compact evidence 和 conversation log
```

### 8.1 通用真实 runner 示例

下面只是结构示例，不是冻结实验命令：

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts `
  --corpus=pilot `
  --skills=<skill-id> `
  --systems=no-skill,original,ir-static `
  --contexts=clean `
  --agents=skvm `
  --environments=windows `
  --model=xty/<model-route> `
  --model-family=<family> `
  --adapter=bare-agent `
  --adapter-version=workspace `
  --panel-config-id=<new-id> `
  --repetitions=1 `
  --out-dir=results/skill-ir/<new-run-id> `
  --retries=0 `
  --require-env=SKVM_XTY_API_KEY
```

确认 plan 后，只有 lock-specific 流程允许时才加 `--execute`。不要把 `<...>` 原样执行。

### 8.2 raw 转 scored

通用 scoring layer 的典型形态是：

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts `
  --raw=results/skill-ir/<run-id>/raw-runs.jsonl `
  --corpus=pilot `
  --out=results/skill-ir/<experiment-id>/scored-runs.jsonl
```

正式 pilot 可能还要求 `--tasks`、`--manifest`、root 路径或 lock-specific scorer。不要只因文件生成成功就认为
评分有效；先看 evaluator 是否匹配 task id、workdir 是否持久化、所有预注册行是否都进入 scored 分母。

### 8.3 生成结果表

```powershell
python scripts/analyze_skill_ir_results.py `
  results/skill-ir/<experiment-id>/scored-runs.jsonl `
  results/skill-ir/<experiment-id>/table.csv
```

需要按 model、context、skill 等切片时使用：

```powershell
python scripts/analyze_skill_ir_slices.py --help
```

先查看脚本帮助再填写参数，不要从旧实验复制不兼容的命令。

## 9. 如何读实验结果

### 9.1 `plan.json`

检查：

- 实际行数是否等于预注册分母；
- 每个 task 是否出现正确的 system、context 和 repetition；
- development 与 held-out 是否隔离；
- model、adapter、environment 标签是否真实；
- 输出目录是否为本轮新目录。

### 9.2 `raw-runs.jsonl`

每行先看运行状态和失败类型，再看内容：

- 是否执行完成；
- 是否超时、spawn 失败、鉴权失败或 route 不支持；
- 最终 workdir 在哪里；
- 模型输入/输出 token；
- artifact validator 是否触发；
- one-repair 是否真的发生，以及二验后为何停止。

raw 不是任务得分。模型说“完成了”也不能代替 scorer。

### 9.3 `scored-runs.jsonl`

重点字段通常包括：

- `success`：是否通过 hard gate；
- `score`：多个公开准则的聚合质量；
- `criteria` 或 `failedCriteria`：具体失败；
- `infrastructureFailure`：该行是否不应作为正常语义结果解释；
- system/model/context/task/repetition：配对维度；
- token 与 runtime 成本字段。

比较 system 时必须按同一 task、model、context 和 repetition 配对。只比较两个均值会隐藏分母缺失和单任务回归。

### 9.4 `gate-report.json` 和 audit

gate 是“预先写好的条件是否满足”，不是结果说明文字。出现 `passed=false` 时：

1. 不开放 held-out；
2. 不调低旧阈值；
3. 不删除失败行；
4. 先用 audit 区分基础设施、benchmark 合同、skill 方法和随机生成噪声；
5. 新方法必须使用新 identity、lock 和输出目录。

### 9.5 Token 怎么算

当前优先保证质量和稳定性。成本至少分为：

```text
一次性成本 = 静态分析 + development 调用 + compiler/人工审核
单次运行成本 = runtime 输入/输出 token + repair token + 工具执行成本
N 次总成本 = 一次性成本 + N * 单次运行成本
```

只有 optimized 质量门槛通过后，才计算它相对 original 的 break-even 次数。artifact 中确定性脚本为 0 runtime
model tokens，不代表整个优化流程零成本。

## 10. 如何增加一个真实 skill

不要一次导入几十个候选。一个 skill 先完成竖切，再决定是否扩展。

### 10.1 建立来源闭包

记录：

- 上游 URL、commit、license 和原始路径；
- `SKILL.md`；
- 它引用的 script、reference、asset；
- 每个文件 digest；
- Python/Node/系统工具、环境变量和网络需求。

目标目录：

```text
benchmarks/skill-ir/pilots/<skill-id>/source/
```

不得把网上内容只复制进来却丢失 provenance，也不得把私有 key 或本机绝对路径写进 source closure。

### 10.2 先写 benchmark，不急着写 IR

为 pilot 设计至少 2 个 development 和 2 个 held-out task。任务应满足：

- no-skill 可以执行，但 skill 可能带来可判定的增益；
- 不把答案或私有 expected 集合塞进 prompt；
- 最终结果落在 workdir，可由文件、JSON schema 或脚本确定性检查；
- 接受多个语义等价输出，不绑定唯一措辞、唯一算法或无来源 enum；
- infrastructure 与 semantic failure 可区分；
- development/held-out 在 scorer 和 artifact 开发前冻结。

先证明 benchmark 有区分度。no-skill 和 original 全部满分时，不要继续构建 optimized artifact；这通常说明任务
太容易或 skill 没有可测独特价值。

### 10.3 编写 deterministic evaluator

代码放在：

```text
src/bench/evaluators/<skill-id>.ts
```

实现后通过 `registerCustomEvaluator` 注册，并在 evaluator 入口加入 side-effect import。随后更新任务路径/digest
registry 和测试。scorer 只能读取：

- 用户可见任务输入；
- 最终 workdir；
- 冻结的公开评分合同。

它不能把 held-out gold、私有 expected payload 或 scorer 内部字面量反馈给 compiler/runtime。

### 10.4 做 benchmark contract audit

测试至少包含：

- canonical valid；
- 多种 alternative-valid；
- 明确 invalid；
- 删除公开证据后，相应约束应消失的 reverse-evidence；
- canary/leak 检查；
- materialization 后的真实路径和文件编码。

通过 audit 才能写 base IR。benchmark 无效时继续调模型没有研究意义。

### 10.5 写 base IR 和 source audit

base IR 的每条 rule、step、tool、environment assumption 都要能回指公开 skill/source。不要把 scorer failure
或 held-out 答案伪装成静态规则。动态反馈应另存 typed evidence，并明确来自哪一臂、哪个 development task。

### 10.6 生成 artifact package

当前方向是由统一 core 消费声明式 adapter，而不是在 compiler 中写：

```typescript
if (skillId === "some-skill") {
  // 特殊逻辑
}
```

skill 的差异应落在公开 contract/adapter：输入 schema、允许资源、execution DAG、checker、template 和 provenance。
通用 runtime 负责 materialize、protect、execute 和 validate。

### 10.7 只在 development 通过后开放 held-out

顺序不可反转。held-out 一旦用于诊断或修改 artifact，这一批任务就失去 held-out 身份，必须创建新任务身份。

## 11. 如何修改 benchmark 或 scorer

### 11.1 什么时候可以原地修改

只有尚未冻结、没有正式结果引用的开发文件可以直接修。以下对象一旦冻结就不可原地修改：

- source/task/public contract；
- scorer/oracle；
- base IR/package；
- lock/gate；
- raw/scored/summary。

旧版本有问题时，保留它作为失败证据，新建版本身份。版本不是为了堆数量，而是为了保证旧结论可复现。

### 11.2 v2 相比 v1 改了什么

v1 的主要问题不是代码跑不起来，而是测量合同会拒绝合理答案，例如私有 schema、固定 report 字面量、唯一
method enum 或唯一 allocation 算法。v2 的重点是：

- 由公开任务和 source 推导可检查语义；
- 用结构化 evidence 判断等价性；
- 接受 alternative-valid；
- 冻结 held-out 并做 leak/reverse-evidence 测试；
- scorer 检查行为和结果，不检查模型是否复述标准答案。

每个 skill 仍需要自己的任务语义和 evaluator，但它们共享同一套 benchmark 设计原则、审计工具和实验 runner。

### 11.3 修改后的最小验证

```powershell
bun test ./src/bench/evaluators/<对应测试文件>
bun test ./src/benchmarks/skill-ir/<对应测试文件>
bun run typecheck
git diff --check
```

不要通过放宽测试掩盖语法错误或 scorer 合同问题。先确认失败原因，再修改最小实现。

## 12. 如何修改 IR、pass 和 artifact

### 12.1 IR 层

先读 `ir-core.md`，再进入：

```text
src/skill-ir/schema.ts             IR 数据结构
src/skill-ir/parser.ts             自然语言到 IR
src/skill-ir/validate.ts           静态合法性
src/skill-ir/passes/               normalization、guard 等 pass
src/skill-ir/lowering/             controller/checker/adapter 视图
src/profiler/                      trace/profile annotation
```

修改 schema 时要同时考虑 parser、validator、序列化、fixture、lowering 和旧 artifact 的兼容性。不要只让类型检查通过。

### 12.2 artifact 层

先读 `optimization-and-artifacts.md`，重点代码包括：

```text
src/benchmarks/skill-ir/validated-artifact-catalog.ts
src/benchmarks/skill-ir/validated-artifact-runtime.ts
src/benchmarks/skill-ir/validated-artifact-assembly.ts
src/benchmarks/skill-ir/api-tester-artifact-compiler.ts
src/benchmarks/skill-ir/experimental-design-artifact-compiler.ts
src/benchmarks/skill-ir/experimental-design-v2-artifact-compiler.ts
src/benchmarks/skill-ir/law-artifact-compiler.ts
```

catalog 定义 package/manifest；compiler 生成文件与 digest；runtime 按 execution DAG 运行并保护输入。runtime
validator 只负责运行时合同，它与离线 scorer 不是同一个东西。

### 12.3 当前 Task 17.11 的接手点

公共 assembly 和 Experimental Design v2 本地 qualification 已完成。相关无模型命令是：

```powershell
cd D:\skill优化\SkVM
bun ./src/benchmarks/skill-ir/validated-artifact-assembly-parity-run.ts
bun ./src/benchmarks/skill-ir/experimental-design-v2-artifact-qualification-run.ts
```

已提交的 v2 package 不允许原地覆盖；需要重编译时使用
`experimental-design-v2-artifact-compile-run.ts --out=<empty-directory>`。下一阶段从以下顺序接手：

1. 保持旧 package/lock/result 与公共 assembly parity report 不变；
2. 选择通过公开 contract audit、且 `no-skill | original` 基线有区分度的新任务或 skill；
3. 先做无付费 source/task/scorer/materialization audit，再生成 domain compiler 与公共 assembly 输入；
4. 用本地 fixture 验证 package、protected input、execution order 和 deterministic scorer；
5. 只有仍有可归因观察空间时，才冻结新 development lock、dry-run 与 qualification；
6. 若目标只是证明质量不降时的成本差，必须单独预注册 quality-parity efficiency ablation，不能冒充质量改进。

重要边界：现有 `experimental-design-artifact-compiler.ts` 仍是冻结 v1 历史实现；新 v2 compiler 没有修改
它。公共 assembly 只解决 package 组装，领域 generator/checker 仍需从公开 contract 构造。v2 本地 2/2
qualification 不能写成 paid development、held-out、跨模型或质量改进。

## 13. 第一次写 TypeScript 测试

项目采用 Bun test。一个最小测试形态如下：

```typescript
import { describe, expect, test } from "bun:test";

describe("artifact adapter", () => {
  test("rejects an undeclared resource", () => {
    expect(() => parseArtifactAdapter({
      resources: ["../outside.txt"],
    })).toThrow();
  });
});
```

TDD 顺序：

1. 写一个表达真实合同的失败测试；
2. 运行该测试，确认它因缺少行为而失败，不是因导入或语法错误失败；
3. 写最小实现；
4. 重跑 focused test；
5. 增加反向、边界和泄漏测试；
6. 跑相关目录测试和 typecheck。

JSON 文件不能写注释或尾逗号。路径优先使用仓库相对路径和 `/`，代码及文档使用 UTF-8。代码注释只解释
不明显的约束，不重复代码表面行为。

## 14. 常见故障排查

### 14.1 先判断是 infrastructure 还是 semantic

按以下顺序查：

```text
git 状态、branch、lock identity、digest
-> Bun/Node/Python 路径与版本
-> 必需环境变量是否存在（只检查存在，不打印值）
-> route/resource/qualification probe
-> dry-run plan 和 source materialization
-> retries=0 execute 的 process status
-> deterministic scorer/audit
-> paired delta 和 gate
```

常见 infrastructure failure：

- `SKVM_XTY_API_KEY` 没有进入当前 PowerShell；
- model route 不存在或网关不支持目标 tool call；
- 子进程 spawn、watchdog timeout、Bun crash；
- Python/Node 路径错误；
- source/resource 没有复制到临时 workdir；
- Windows 路径、UTF-16、symlink 或权限问题。

常见 semantic failure：

- 任务要求的文件没生成；
- JSON 可解析但字段、类型或关联语义错误；
- 产物引用不存在路径或错误 symbol；
- 修改了 protected input；
- skill 的独特步骤没有被执行；
- runtime validator 通过，但离线 scorer 发现任务语义错误。

### 14.2 key 明明输入了却提示 missing

先检查输入是否为空：

```powershell
if ([string]::IsNullOrWhiteSpace($env:SKVM_XTY_API_KEY)) {
  'missing'
} else {
  'set'
}
```

不要输出 `$env:SKVM_XTY_API_KEY` 本身。重新打开 PowerShell 后必须重新注入环境变量。

### 14.3 scoring 提示 raw 文件不存在

上一步执行失败时不会生成 raw。不要继续连续运行 scorer 和 analyzer；回到 runner 输出，先修复前置错误。

### 14.4 全量测试失败很多

先跑本次修改的 focused test。当前仓库部分历史 lock 固定了 live implementation digest，而 HEAD 已继续开发，
因此旧冻结验证和当前回归需要分层。不要通过修改旧 lock、删除新 corpus 注册或回滚现有实现来让数字变绿。

## 15. Git 工作方式

### 15.1 修改前后都看状态

```powershell
git status --short --branch
git diff -- docs/skill-ir/developer-guide.md
git diff --check
```

### 15.2 只暂存明确文件

```powershell
git add docs/skill-ir/developer-guide.md
git add docs/skill-ir/README.md
git add docs/skill-ir/skill-ir-aot-optimization-plan.md
git diff --cached
```

禁止 `git add .`。当前有许多尚未治理完的本地 raw/scored/result，批量暂存会把调试数据和可能的敏感内容带入提交。

### 15.3 提交和远端

```powershell
git commit -m "docs(skill-ir): add developer and experiment guide"
git remote -v
```

- `origin` 是你的 fork，可以推送；
- `upstream` 是学校仓库，只用于拉取，不应直接 push；
- 给老师看阶段成果时优先让老师看 fork 中的 `skill-ir-aot` 分支或基于该分支创建 PR；
- 不要在没有确认范围时把大量历史 raw results 一起提交。

## 16. 每个阶段的工作清单

### 16.1 开始开发前

- [ ] 确认 `skill-ir-aot` 分支和 dirty worktree；
- [ ] 阅读规则、communication、spec、plan 和组件文档；
- [ ] 写清本阶段目标、非目标和文件范围；
- [ ] 确认是否触碰冻结 identity；
- [ ] 先写失败测试。

### 16.2 付费实验前

- [ ] source closure 与 license/digest 完整；
- [ ] task split 已冻结；
- [ ] scorer 的 valid/alternative-valid/invalid/leak/materialization audit 通过；
- [ ] lock 已在结果之前提交并验证 digest；
- [ ] model、adapter、task、context、repetitions、gate 已冻结；
- [ ] dry-run 行数正确；
- [ ] route/resource/runtime qualification 通过；
- [ ] `retries=0`；
- [ ] 新输出目录不会覆盖旧证据。

### 16.3 实验完成后

- [ ] 检查完整分母和 infrastructure failure；
- [ ] raw 全部经过正确 evaluator；
- [ ] 生成 scored、gate、paired/slice summary；
- [ ] 披露每个模型和每个 task 的回归；
- [ ] 未过 development gate 时不开放 held-out；
- [ ] compact evidence 更新到 `experiment-results.md`；
- [ ] 组件文档、plan 和 `D:\skill优化\conversation_log.md` 同步；
- [ ] 只提交明确文件。

## 17. 你现在可以接着做什么

建议下一次实际开发从“有区分度的新 public-contract case”开始，不在 Experimental Design 的同一饱和
分母上付费：

```text
第一步：从 portfolio 中挑选信息互补、公开合同可审计且基线未饱和的任务/skill
第二步：冻结 source/task split，完成 scorer differential、reverse-evidence 与 materialization audit
第三步：将领域 contract 编译为公共 assembly 输入，不增加 runtime/catalog 版本
第四步：运行本地 package/runtime/scorer qualification，并记录人工分钟、adapter LOC 与 coreBranchDelta
第五步：只有观察空间和前置门禁都成立，才冻结新的付费 development identity
第六步：通过 development gate 后再讨论 held-out、跨模型和摊销 Token
```

这个阶段服务于项目最核心的问题：让使用者未来只需导入 skill/source 和少量可审计声明，系统自动生成稳定
artifact，而不是要求使用者亲自阅读失败、手写专用程序。方法开发期仍允许人工审核 adapter，但必须记录
`humanMinutes`、`adapterLoc`、`artifactKinds`、`coreBranchDelta` 和 `unautomatedSteps`，用这些指标判断自动化
程度是否真的提高。

## 18. 继续阅读

- 项目入口与最新状态：`docs/skill-ir/README.md`
- 研究目标和成功条件：`docs/skill-ir/skill-ir-aot-optimization-spec.md`
- 当前文件级任务：`docs/skill-ir/skill-ir-aot-optimization-plan.md`
- IR 实现：`docs/skill-ir/ir-core.md`
- runner/scorer/gate：`docs/skill-ir/evaluation-system.md`
- Final IR 与 artifact：`docs/skill-ir/optimization-and-artifacts.md`
- 新 skill 竖切：`docs/skill-ir/real-skill-pilots.md`
- 已冻结实验数值：`docs/skill-ir/experiment-results.md`
- 阶段历史：`docs/skill-ir/history.md`

遇到拿不准的设计问题时，先追加到 `D:\skill优化\project_communication.md` 的开放问题区；确认后再同步回
spec、plan 或组件文档。不要让聊天中的新决定只存在于聊天里。
