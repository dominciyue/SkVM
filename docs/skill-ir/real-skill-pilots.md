# 真实 Skill Corpus 与 Pilot

本文档记录真实 skill 来源、provenance、Wave A/B 设计和 `env-manager` 纵向契约。
实验结果见 `docs/skill-ir/experiment-results.md`。

## 1. 为什么重启真实 Corpus

早期六个 deep benchmark skill 是本地 synthetic seed，适合构造受控失败和验证
runner/scorer，但不足以证明任意 public skill 泛化。当前报告规则：

```text
synthetic-seed -> calibration-low
real/adapted/upstream/user skill -> main/support evidence
```

主结论必须报告 provenance 和 evidence weight，并保留 no-skill baseline。

## 2. 来源审计

原始 checkout 位于 ignored `.skvm/external-skills/`，仓库只提交选中 source closure
和机器可读 intake。

| 来源 | 固定 commit | SKILL.md | License 结论 |
|---|---|---:|---|
| `anbeime/skill` | `ddad6073e07addfe3690dc3de978b2e73ca8cf02` | 70 | 根目录 mixed；逐 artifact 判断。 |
| `laolaoshiren/claude-code-skills-zh` | `1e221579b0504082d25d5548b194399a7785f10f` | 20 | Repository MIT。 |
| `travisvn/awesome-claude-skills` | `1da55aa810f206d3fe2005e7e3989b15a275d942` | 0 | Discovery index，不是 artifact。 |
| `K-Dense-AI/claude-scientific-skills` | `fc0b9f692459ea7d9e5a5c64948a5878e1bce274` | 149 | Repository MIT。 |

权威快照：

```text
benchmarks/skill-ir/corpus/real-skill-intake.json
```

README 中的 skill 名不等于 checkout 中存在 artifact。License badge、根 LICENSE、
nested LICENSE 和资源完整性都需要实际文件审计。

## 3. 3+3 Pilot

### Wave A，方法开发

| Skill | 来源 | 覆盖 | 风险 |
|---|---|---|---|
| `law-to-markdown` | anbeime | 文档、脚本、依赖、fallback | Python 依赖和输入格式。 |
| `env-manager` | Chinese skills | 环境、安全、schema、tool use | 必须使用 synthetic secret。 |
| `experimental-design` | scientific skills | 非编码科学工作流 | 语义 scorer 难度较高。 |

### Wave B，冻结 replication

```text
zh-code-reviewer
api-tester
zh-readme
```

Wave B 在 Wave A 方法冻结后运行，不能用于回调同一份主结果配置。

## 4. Source Closure

```text
benchmarks/skill-ir/pilots/law-to-markdown/source/
benchmarks/skill-ir/pilots/env-manager/source/
benchmarks/skill-ir/pilots/experimental-design/source/
```

`benchmarks/skill-ir/corpus/corpora/pilot.json` 固定：

- repository URL 和 commit；
- upstream path；
- license；
- source/resource 相对路径；
- 每文件 SHA-256；
- provenance/evidence weight/status。

Source-imported 不等于 runnable。每个 pilot 必须有 task、scorer、base IR 和 split
audit 才能进入主矩阵。

## 5. Env-manager 选择理由

`env-manager` 首先竖切，因为公开规则、安全约束、输出文件和 schema 边界明确，
适合隔离基础设施问题。Law-to-markdown 依赖更重，experimental-design 的 semantic
scoring 更难，不适合与 runner/scorer 同时调试。

Exact original：

```text
benchmarks/skill-ir/pilots/env-manager/source/SKILL.md
```

Base IR：

```text
benchmarks/skill-ir/pilots/env-manager/base-ir.json
```

## 6. Task Split

任务定义：

```text
benchmarks/skill-ir/pilots/env-manager/tasks.json
```

Development：

```text
env-manager-node-audit-dev-001
env-manager-vite-audit-dev-002
```

Held-out：

```text
env-manager-python-audit-heldout-001
env-manager-nextjs-audit-heldout-002
```

每个 task 要求保留输入，并生成：

```text
.env.example
.env.schema.json
env-report.json
```

Report 恰好包含：

```text
definedAndUsed[]
definedUnconfirmedUnused[]
usedUndefined[]
hardcodedSecrets[]
exposureRisks[]
```

Development 用于静态/动态方法构造和门禁；held-out 不进入 compiler、overlay、
runtime contract 或调参。

## 7. Deterministic Scorer

实现：

```text
src/bench/evaluators/env-manager-grade.ts
```

| Criterion | Weight | Hard gate |
|---|---:|---:|
| protected files | 0.20 | 是 |
| no secret leak | 0.20 | 是 |
| required artifacts | 0.15 | 是 |
| exact classification | 0.20 | 否 |
| env example safety | 0.15 | 否 |
| schema rules | 0.10 | 否 |

成功条件：weighted score 至少 0.85，且三个 hard gate 全部通过。

Scorer 读取最终 workdir，处理：

- JSON parse/shape；
- protected file digest；
- synthetic secret content/path；
- symlink/reparse/path escape；
- NTFS alternate data stream；
- UTF-16/unsupported encoding；
- exact set 和 schema vocabulary。

`TEST_ONLY_` 值只存在 fixture/evaluator，不进入 prompt answer、runtime contract 或
repair report。

## 8. Pre-IR Calibration

`tasks-authored` 状态没有 `irPath`。显式 calibration guard 运行时合成最小 source
envelope，只授权：

```text
one pilot
development tasks
clean context
no-skill | original
```

它不创建 fake base IR，也不允许 static/PGO/artifact system。

## 9. Base IR Source Audit

Base IR 由公开 `SKILL.md` 和用户可见 task contract 构造，审计：

- inputs/outputs/preconditions；
- environment/tool assumptions；
- steps/rules/checks/recovery；
- source line/section 支持；
- 无 evaluator expected、threshold 或 held-out。

Static lowering 后，env-manager 能稳定完成 protected inputs、secret safety、required
artifacts 和 example safety，主要残差是 classification 和 schema。

## 10. Resource Contract

Heavy-script skill 必须在 task 设计前声明：

- agent 是否应执行 bundled script；
- interpreter/package 是否存在；
- network/API 是否允许；
- script failure 是 infrastructure 还是 semantic；
- original 与 IR/package 是否获得相同 resource closure。

Env-manager 当前使用 JS/TS/dotenv fixture，无 package install 和 network。

## 11. Pilot 晋升门禁

每个 deep pilot 需要：

1. Exact licensed source 和 integrity metadata。
2. 可判分 no-skill task。
3. Deterministic 或预注册 semi-deterministic scorer。
4. Source-audited base IR。
5. Development/held-out split。
6. Development-only feedback 和 Final IR provenance。
7. 冻结 development gate。
8. Gate 通过后的四系统 held-out result。
9. Regression、scorer limit 和 artifact opportunity 说明。

Corpus 不因 intake 表变大而自动扩大。完成一个 pilot 的证据闭环后再加入下一个。

## 12. 当前状态

| Pilot | Source | Tasks/scorer | Base IR | Real run |
|---|---|---|---|---|
| env-manager | 完成 | 2+2 / deterministic | 完成 | Development completed，gate failed。 |
| law-to-markdown | 完成 | 未完成 | 未完成 | 未执行。 |
| experimental-design | 完成 | 未完成 | 未完成 | 未执行。 |
| Wave B 3 skills | intake 完成 | 未开始 | 未开始 | 阻断。 |

## 13. 修改注意

1. 新 source 必须先 license/resource/digest 审计。
2. Scorer 在 optimization 前冻结，不根据模型输出改 expected。
3. Prompt 只包含用户可见 contract，不泄漏 evaluator payload。
4. Held-out 从不进入 feedback/compiler。
5. 新 pilot 更新本文档和 corpus JSON，不再新增独立 intake/pilot Markdown。
