# API Tester v2 特性分层新输入迁移

本文档说明固定输入集 `skill-ir-api-tester-v2-feature-migration-001` 与可执行 successor panel
`skill-ir-api-tester-v2-feature-migration-002` 的冻结和唯一首轮执行合同。它验证同一份
development-only v2 构造器能否通过统一产品 CLI 迁移到新的公开 OpenAPI 输入；它不扩展构造器能力，也不把定向样本解释成
OpenAPI 生态接纳率。

## 1. 当前状态与身份

001 在远端冻结后的首次入口调用被 EOL preflight 于第 0 行前拦截，未读取所选输入、未创建首次报告。该失败已冻结为
机器记录，旧 lock 和结果路径均未覆盖。候选、来源、10 份 binding、4 个边界和预测不变；只修正 Git 规范化表示检查的
002 已形成新的 `resultState=not-run` 机器锁，所选输入仍未经过 v2 parser、artifact、preset 或 CLI。

| 对象 | 身份或路径 |
|---|---|
| candidate | `skill-ir-api-tester-constructor-candidate-v2-001` |
| fixed input set / failed preflight | `skill-ir-api-tester-v2-feature-migration-001` |
| executable successor panel | `skill-ir-api-tester-v2-feature-migration-002` |
| candidate snapshot | `benchmarks/skill-ir/classification/api-tester-constructor-candidate-v2.json` |
| source selection | `benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001/source-selection.json` |
| 001 immutable lock | `benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001/experiment-lock.json` |
| 001 preflight record | `results/skill-ir/api-tester-v2-feature-migration-001/preflight-failure.json` |
| 002 experiment lock | `benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-002/experiment-lock.json` |
| 002 immutable result | `results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json` |

结果路径使用 exclusive create；一旦存在不得覆盖。行执行后的失败保留在原 10 行分母；产品候选缺陷只能另建
development 记录与新 candidate，执行 harness 的 preflight 缺陷则保留旧记录并另建 panel identity。

## 2. 候选冻结面

candidate 绑定真实调用链，而不只绑定 v2 算法文件：

1. `bin/skvm.js` 与 `bin/skvm-route.js` 顶层入口；
2. `src/cli/artifact.ts` 与 `verified-artifact-presets.ts` 的 CLI/preset 分发；
3. v2 binding contract、program generator/checker 与 artifact runner；
4. v1 共享拒绝类型、safe-relative path 和 SHA-256 helper；
5. `package.json`、`bun.lock` 与实际 Bun/Node 版本。

每个文件都记录 byte length 与 SHA-256。这是本候选明确声明的执行面，不是通用 JavaScript module graph 审计。候选的
支持/拒绝范围与 [`api-tester-production-binding.md`](api-tester-production-binding.md) 的 v2 合同一致；本阶段不加入复杂嵌套、
外部引用、组合 schema 或新的 serialization。

## 3. 真实输入选择

真实分母固定为 6 个输入、6 个独立公开仓库，primary stratum 精确为 2/2/2。选样只读取公开结构与许可证，不调用候选；
一个输入覆盖多项特性仍只计一次。

| 行 | 仓库 | primary stratum | 执行前预测 |
|---|---|---|---|
| `real-opengrok-api` | Oracle OpenGrok | local component ref | `MISSING_REQUIRED_ERROR_RESPONSE` |
| `real-box-openapi` | Box OpenAPI | local component ref | `UNSUPPORTED_RESPONSE` |
| `real-meilisearch-api` | Meilisearch specifications | body primitive array | `UNSUPPORTED_REQUEST_BODY` |
| `real-bangumi-api` | Bangumi server | body primitive array | `UNSUPPORTED_SECURITY` |
| `real-deepl-openapi` | DeepL OpenAPI | query form-explode | `UNSUPPORTED_SCHEMA` |
| `real-hfs-openapi` | HFS | query form-explode | `UNSUPPORTED_REQUEST_BODY` |

`source-selection.json` 保存每份来源的 repository、完整 commit、repository path、raw URL、content/license byte length 和
SHA-256、结构计数、纳入理由、排除理由与预测依据。输入字节保存在仓库外离线 cache，lock 只绑定摘要和相对 cache path；
运行器不会联网补取或替换来源。

这 6 份输入不复用已暴露的 Open-Meteo、DPP、OpenWrt、SignalK，也不占用已有 fixture、held-out 或原 Q1 prospective
预留位。它们是 purposive feature sample，不是随机总体样本。

## 4. 合成边界与分母

另有 4 个仓库内合成拒绝边界：external schema ref、nested object array item、space-delimited query array 和 composed
request body。它们用于确认既有 fail-closed 边界，不计入真实输入接纳率。

```text
real public inputs       6
synthetic boundary cases 4
total logical rows      10
attempts per row         1
retries/replacements     0/0
candidate fixes          0
```

每行使用普通 v2 binding，只声明 workdir-relative input 和 plan/report 输出；没有 task id、gold、逐来源模板或特殊分支。

## 5. 冻结与执行顺序

candidate 已由 001 冻结；002 freeze 复核 candidate 未漂并只生成新的 `not-run` lock：

```powershell
bun run ./src/benchmarks/skill-ir/api-tester-v2-feature-migration-freeze-run.ts `
  --root=D:/skill优化/SkVM `
  --candidate-out=D:/skill优化/SkVM/benchmarks/skill-ir/classification/api-tester-constructor-candidate-v2.json `
  --lock-out=D:/skill优化/SkVM/benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-002/experiment-lock.json `
  --bun=<absolute-bun-executable> `
  --node=<absolute-node-executable>
```

freeze 文件必须单独白名单提交并推到 `origin/skill-ir-aot`。只有完整 freeze commit 已在远端，且 candidate、lock、selection、
执行器、binding、boundary、cache input 与 license 摘要全部匹配，才可执行唯一首轮：

```powershell
bun run ./src/benchmarks/skill-ir/api-tester-v2-feature-migration-first-run.ts `
  --root=D:/skill优化/SkVM `
  --cache-root=D:/skill优化/.tmp-api-v2-feature-migration-20260908 `
  --freeze-commit=<full-40-char-freeze-commit> `
  --out=D:/skill优化/SkVM/results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json `
  --bun=<absolute-bun-executable> `
  --node=<absolute-node-executable> `
  --completed-at=<ISO-8601>
```

入口在任何行前打印唯一的预算与 stop-loss 确认行。每一行都从 `node bin/skvm.js artifact --preset=api-tester
--binding=...` 进入实际产品路径。运行器不读取 API key、不调用模型/API/网络，也不允许 retry、replacement 或 candidate fix。

001 的根因是 candidate 正确绑定了 Windows 实际 mixed-EOL checkout 字节，而旧 preflight 又把该摘要直接与 Git 中规范化的
LF blob 比较。002 仍逐字节检查实际 checkout 是否匹配 candidate，但用 Git tracked diff 证明该表示属于远端 freeze commit；
它不会把所有文件强行规范化为 LF/CRLF，也不会放松 candidate digest。

## 6. 结果与成本字段

每行记录：

- 冻结 prediction 与 `exact | outcome-only | mismatch` parity；
- `accepted | rejected | checker-failed | infrastructure-failed` 结果；
- rejection code，或通过行的 CLI/package/generator/checker/plan/report/validation 摘要；
- checker 是否执行以及结果；
- 是否需要额外 code/template/rule/human modification；
- input materialization、construction、generation、checking、CLI end-to-end 和 evidence analysis 毫秒。

阶段里程碑以 5 ms 轮询观察；无法拆分或同一轮观察到的阶段会保留 `null`/`coalescedMilestones`，不能伪造更精确时间。
运行时 `modelCalls=apiCalls=paidCalls=0`。用户报告的 `467,220` development-agent tokens 作为一次性历史开发成本单列，
不得用运行时零 token 抵消。

## 7. 验证与修改边界

冻结前的最小验证：

```powershell
bun test ./src/benchmarks/skill-ir/api-tester-v2-feature-migration.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

focused test 只做 schema、digest、分母、外部 cache 和报告构造验证；它不会在所选真实输入上运行候选。改变 product
contract/parser/generator/checker/artifact、重新选样、补行、覆盖结果、读取 held-out、进入第二 profile/Q4/portfolio/readiness
或声称人工节省，都超出本组件维护范围。
