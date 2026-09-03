# 答案可得性分类学与七案例证据表

**最后更新：** 2026-09-03
**证据范围：** 现有 7 个 method-portfolio pilot 的冻结 registry、authority report 和已提交结果；本表不创建新实验，不重评分，不补写历史人工成本。

## 1. 分类轴

本项目把 skill 按“判断对错的标准答案从哪里来”排成三档。分类对象不是 skill 的主题，而是一个任务的
**可判定答案来源**：在不读取 hidden gold、不调用模型、不依赖未声明专家直觉的前提下，系统能否从公开
产物或用户输入重建判定标准。

| 档位 | 名称 | 判定标准 | 预期 AOT/自动化边界 |
|---|---|---|---|
| 1 | 公开产物可得 | 答案已存在于公开、机器可读的 schema/spec/artifact 中，deterministic checker 可直接重算 | 最接近 deterministic AOT；可把运行时模型从热路径移出，但仍需记录 source audit、构造和审核成本 |
| 2 | 输入结构可得 | 答案可从用户可见的配置、仓库、源码、locale 或 manifest 结构推导；需要有限 mapping，但不需要开放式专家裁决 | 可做结构化 IR/plan/package；领域映射和低置信度部分仍可能需要 review |
| 3 | 专家判断可得 | 公开输入不足以唯一确定答案，正确性依赖法律、科学、审查严重度或其他专家语义 | 不强行全自动；诚实目标是 review-required、可审计边界和明确停止原因 |

这条轴给出一个可检验的单调性假设：答案越可得，deterministic scorer/AOT 固化和 trace 可挖掘空间越大，
人工判断越少。它是研究组织原则，不是由 7 个案例单独证明的因果定律；表中“结果”必须和“假设”分开报告。

## 2. 七案例总表

“人工成本”只记录冻结证据中真实测过的 scope。`未测`、`历史不可得` 和 `0` 不等价；`0 LOC` 只表示
该字段在 registry 中没有记录 adapter 代码，不表示全流程不需要人工。

| Skill | 档位 | 答案来源（当前证据解释） | AOT/自动化达成度 | 人工 LOC / 时间证据 | 当前冻结结论 | 权威证据 |
|---|---:|---|---|---|---|---|
| `api-tester` | 1 | OpenAPI schema、公开 endpoint/test-plan contract 与 deterministic evaluator | `quality-positive`；validated artifact 4/4、mean 1.0、0 infrastructure/regression、runtime model tokens 0；direct-deterministic-artifact | adapter 38 LOC；human minutes 未测；coreBranchDelta 0 | 第一档的可复现正例；尚未证明最低人工、held-out 或跨模型 | `results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |
| `env-manager` | 2 | 用户可见的环境配置、JSON/schema 结构和输入/输出关系 | reviewed-AOT `efficiency-positive`；4/4 quality-equivalent pairs、original 202010 tokens vs reviewed 0、break-even=1；direct-deterministic-artifact | reviewed-AOT patch 125 LOC / 8 min；更宽的历史 adaptation 214 min / 25 LOC，不能与前者相加或互换 | 第二档中最完整的产品化证据，但仍是 review-required，人工成本不是 0 | `results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/paired-quality-evidence.json`；`results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json` |
| `zh-readme` | 2 | 仓库文件、manifest、入口源码、已有文档和许可证等 repository facts | contract candidate 可构造，但 baseline 因 scorer-authority `measurement-invalid`；未进入 base IR/package | registry 为 0 LOC；时间历史不可得；不能解释为自动化 | 输入事实可得，但 measurement authority 先于 AOT 失败；保留为分类负证据 | `results/skill-ir/zrm-pi-v2/measurement-validity.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |
| `i18n-helper` | 2 | 源码/locale key 结构、placeholder/plural 公开语义和 task output ABI | contribution-v2 base IR/source audit 通过；static v4 因 1 个 paired quality regression 失败，artifact/held-out 关闭 | registry 为 0 LOC；时间历史不可得；不代表无人工 | 输入结构足以支持静态分析，但当前静态质量负结果阻止 AOT 晋级 | `results/skill-ir/i18n-helper-contribution-development-v2/gate-report.json`；`results/skill-ir/ihc-static-v4/gate-report.json` |
| `law-to-markdown` | 3 | 法律分类、交付语义和审核结果不能由公开格式唯一决定，需领域判断 | baseline regression；stopped-before-dynamic；旧 artifact/held-out 结果被 benchmark contract invalidated | LOC/时间历史不可得；不应从旧 artifact 的 0 runtime token 反推人工为 0 | 专家判断档的停止/无效证据；不把结构化 Markdown 误写成已自动化法律判断 | `results/skill-ir/law-to-markdown-v3-public-output-abi-calibration-v1/measurement-validity.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |
| `experimental-design` | 3 | 研究设计、分配策略和报告语义依赖科学方法判断；skill-unique slice 仍不能替代专家 oracle | baseline-saturation；stopped-before-dynamic；无付费 optimized evidence | LOC/时间历史不可得 | 专家判断档的饱和负结果；公开合同合格不等于答案已可机械重建 | `results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |
| `zh-code-reviewer` | 3 | 源码事实可抽取，但 finding 的严重度、证据充分性和修复判断仍需 reviewer 语义 | static-sufficient；static fidelity 通过，但 optimized development 未运行 | registry 为 0 LOC；时间历史不可得 | 结构事实可读不等于审查结论唯一；停止在 static，保持 review-required 边界 | `results/skill-ir/zcr-static-fidelity-v1/gate-report.json`；`benchmarks/skill-ir/corpus/method-portfolio.json` |

## 3. 当前可辩护结论

1. **第一档已经有一条可复现 AOT 正例。** API Tester 的公开 OpenAPI 语义被固化为 deterministic artifact，
   development 16/16 行完整、artifact 4/4、mean 1.0、runtime model tokens 为 0。它证明“公开答案可得”
   可以支撑 AOT 热路径移除模型，不证明整个构造流程已最低人工或已跨模型泛化。
2. **第二档显示结构可得性带来不同程度的自动化，但不能混成一个成功率。** Env Manager 已有完整
   reviewed-AOT efficiency evidence；zh-readme 被 scorer authority 阻断，i18n-helper 被静态质量回归阻断。
   这组差异正是分类学要保留的负结果，而不是需要补跑来抹平的噪声。
3. **第三档不应被强行改写成全自动目标。** Law、Experimental Design、zh-code-reviewer 的冻结证据都说明
   公开结构、格式或源码事实不足以唯一给出领域判断；合理产品目标是可审计的 review-required 路径和明确
   `not-established`/`blocked` 停止原因。
4. **最低人工结论目前只能写成“已测下界”，不能写成全流程最小值。** API Tester 的 38 adapter LOC、Env
   reviewed-AOT 的 125 LOC/8 min 是不同 scope 的真实测量；其余案例的历史人工成本不可得。后续主线 B
   才负责在第一档 API Tester 上建立 trace + public-answer 的可复现提炼，并前瞻测量人工从作者降为审核者的
   真实分钟数和 LOC。

## 4. 与跨模型实验的关系

Stage N 只作为这条轴的类内子证据：它用于观察同一答案可得性档位在不同模型族上的 execution/quality 方差，
不重新定义分类轴。当前 Stage N smoke qualification 已失败（仅 GPT eligible，Claude/DeepSeek 出局），matrix
未创建；因此现在没有跨模型主表，也不能把 smoke 结果写成“优化后的 LLM 更稳”。Stage M 的 Magpie identity
继续保持 fail-closed 预注册合同，不复活。

## 5. 证据来源与维护规则

- 基础 case identity、phenotype、optimization path、adapter LOC、human minutes 和 `coreBranchDelta`：
  `benchmarks/skill-ir/corpus/method-portfolio.json`。
- 当前 authority 分类与成本完整性：
  `benchmarks/skill-ir/corpus/method-portfolio-authoritative.json`、
  `benchmarks/skill-ir/corpus/method-portfolio-authoritative-efficiency.json`、
  `results/skill-ir/method-portfolio-authoritative-efficiency-readiness.json`。
- 自动化组件是否 authority-qualified：
  `benchmarks/skill-ir/corpus/method-portfolio-authoritative-automation.json` 与
  `results/skill-ir/method-portfolio-authoritative-automation-readiness.json`。
- 若新增案例或重分类，必须使用新 identity/版本化文档，保留旧结果；不得因为想让某一档出现正例而修改
  scorer、lock、artifact 或历史人工成本。
