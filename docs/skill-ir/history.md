# Skill IR 研究历史

本文只保存决策级演进，不复制旧 spec、plan 或实验全文。历史原文通过 Git 恢复：

```powershell
git log -- docs/skill-ir
git show <commit>:docs/skill-ir/<file>
```

## 1. 阶段演进

### 2026-07-04 至 07-06：定位与 IR 基础

- 将项目定位为 SkVM 内部的 Skill IR / AOT pass，而非独立替代 SkVM。
- 建立 schema、parser、validator、trace/profile annotation、静态 pass 与 lowering。
- 工程北向目标从“更好的 prompt”明确为 provenance-bound executable artifact package。

### 2026-07-07 至 07-10：Synthetic Task 11

- 建立 matrix、real-agent runner、scoring、paired analyzer、context slices 和 result persistence。
- 接入真实 OpenAI-compatible provider，完成多模型/上下文 smoke。
- Synthetic skill 后来降为 `calibration-low`，不再承担主 claim。

### 2026-07-13 至 07-16：真实 Corpus、Final IR 与 Artifact

- 从公开仓库冻结真实 skill source closure 与许可证。
- Env-manager 完成 pre-IR、base IR、static、dual-source feedback、Final IR 与 executable/semantic artifact。
- Runtime 固定为 preflight -> generate -> validate -> at most one repair -> revalidate -> scorer。
- 结构 validator pass 但 scorer fail，促成公开语义 evidence 与 scorer-authority 隔离。

### 2026-07-21 至 07-22：强模型诊断与确定性 Repair

- GPT-4.1 诊断证明模型能力影响基础产物质量，但不能解决 classification/schema 核心残差。
- V4 把公开 schema residual 固化为 deterministic repair，3 个完整 pair 0.90 -> 1.00。
- 一条 Bun infrastructure 留在冻结分母，development gate 失败；停止为结果堆 runtime 版本。

### 2026-07-23 至 07-24：Law 纵切与 Held-out

- Law artifact 以 script/template/checker 的 L3 形态在 development 达到 4/4、mean 0.925。
- 唯一 held-out 在 manual boundary 回归，2/4、mean 0.725，package 不晋升。
- 该负结果明确了“开发集正向”与“跨 task 稳定”不能混写。

### 2026-07-25 至 07-31：Experimental Design Benchmark v2 与 Stable Pi

- Wave A v1 contract audit 暴露私有 enum、唯一算法、唯一措辞与 materialization 缺失。
- Experimental Design v2 形成公开语义合同、alternative-valid、reverse-evidence、held-out isolation 和
  production materialization，达到 42/42 + 36/36。
- 多轮 runtime diagnosis 最终收敛到 direct Node Pi package + short path；不再继续堆 transport 版本。
- 普通、harder 与 skill-unique baseline 都饱和，按预注册停止规则关闭。

### 2026-07-31 至 08-01：API Tester 与 Portfolio 方法

- API Tester 建立 OpenAPI oracle、五项 deterministic scorer、18/18 contract audit、36/36 materialization。
- 唯一 baseline 8/8、0 infra、4 differing；original 有局部改善但两个 task 都不成功，旧 gate failed。
- 决定采用 prospective partial-benefit re-entry：API Tester 转 method-development，另选 untouched skill。
- 方法案例至少 6 个起步但不设固定终止数，以 portfolio readiness 决定何时冻结方法。
- 用户侧目标固定为自动 optimizer；人工只审核声明式适配和低置信度边界。

### 2026-08-01 至 08-03：方法组合、公共 Assembly 与资源命名空间

- 建立 machine-readable method portfolio/readiness；方法案例至少 6 个起步，是否进入 replication 由能力
  gate 决定。
- API Tester 经 prospective re-entry 生成 schema-derived artifact，冻结 development 为 4/4、mean 1.0，
  成为第一个 optimized development-passed phenotype。
- 对 6 个真实案例审计 skill bundle，区分 exposure、collision 与 output-reference；建立 namespaced resource
  package、完整性验证和双案例 canary。
- Namespaced 四臂真实矩阵 16/16、0 infra，但 optimized 1/4、mean 0.5625、2 regressions；结果冻结为机制已
  接入但质量 gate failed。
- 抽取技能无关公共 assembly，在 API Tester 与 Experimental Design 两种 phenotype 上完成 byte parity；领域
  compiler/checker 仍由公开合同负责。

### 2026-08-09：真实输出反向审计与 Public Output ABI

- Law、i18n 与 reviewer 的真实模型输出连续暴露 scorer 私有字段类型、数组顺序和执行可观测性问题，证明预制
  canary 通过仍不等于 measurement-valid。
- 建立 `public-output-abi/v1/v2`、scorer dependency closure 和 post-run authority audit；旧结果不重分，修复
  使用新 identity。
- Law v3 恢复 measurement-valid，但 baseline 回归；reviewer v2 恢复 measurement-valid 并完成 static fidelity；
  zh-readme v1/v2 保持 measurement-invalid。
- i18n v3 最终恢复 8/8 execution observable 与 8/8 ABI pass，但旧任务 no-skill/original 同时满分，冻结为
  baseline saturation。

### 2026-08-10：Skill Contribution Identifiability 与 i18n Successor

- 新增通用 `skill-contribution-identifiability/v1`，把 benchmark contract 合法与 skill 增量可识别分开；静态
  audit 不用真实分数倒推资格。
- 旧 Experimental Design v2 和 i18n v3 被判为 benchmark-underidentified；Experimental Design skill-unique
  贡献面合格，但历史强模型结果仍是 capability saturation。
- i18n contribution-v1 移除 answer-bearing recipe 后完成真实运行，却暴露未公开 placeholder/plural 语义；
  5/8 false reject，冻结 measurement-invalid。
- contribution-v2 公开 `{name}`、`{{name}}` 与 i18next v4 plural family，唯一 8-row paired baseline 为
  0 infra、4/4 differing、3 positive，original/no-skill mean 0.925/0.525。该结果只开放 base IR audit，
  未形成静态、artifact、held-out 或 Token 优化结论。

### 2026-08-12：i18n Source-audited Base IR

- contribution-v2 的 profile-empty base IR 只绑定 exact skill source、development prompt、public contract 与
  report semantics；逐节点 audit 排除 evaluator、held-out、runtime output 与 profile feedback。
- IR/lowering 保留用户可见文本扫描、稳定 key、插值/复数、已有翻译、protected input 与声明输出边界；后验
  `nul` 文件名未进入静态语义。
- Corpus 晋升 `runnable`，只开放 `no-skill | original | ir-static` development；artifact、held-out、优化与
  Token claim 仍关闭。

## 2. 关键冻结决策

1. No-skill 是主 baseline，不能只比较 original 与 IR。
2. Original 使用 exact source closure，不能只给路径或摘要。
3. Development/held-out 文件与身份隔离；held-out 不回流。
4. Deterministic scorer 是成功权威；runtime validator 只负责运行期可行动检查。
5. 动态 overlay 使用 original lineage + ir-static residual 双源，禁止 evaluator gold。
6. Final IR 是带 provenance 的编译候选；`ir-pgo` 只消费通过 gate 的 held-out。
7. Token 是质量门槛通过后的双目标之一，必须包含一次性成本和 break-even。
8. 通用 core 禁止 skill-id branch；适配差异进入 declarative contract/adapter/artifact。
9. 旧 gate failure 不事后改判；新方向使用新 policy/identity。
10. 有效负结果进入论文正文。

## 3. 文档治理

早期每个 task/design/experiment 都建立独立 Markdown，导致入口漂移。第一次治理建立了权威入口，但把大量
阶段全文直接合并进 spec/plan/evaluation/results，仍然过重。

2026-08-01 第二次治理采用内容重建：

- README 只做入口与当前状态；
- spec 只保留当前研究契约；
- plan 只保留当前 ledger 与活跃 TDD；
- evaluation/optimization/IR/pilots 各管一个组件边界；
- results 只保留冻结 evidence ledger；
- related work 并入 spec；
- 历史全文不复制，使用 Git 恢复。

## 4. 恢复旧设计

常用入口：

```powershell
git log --oneline --all -- docs/skill-ir
git show <commit>:docs/skill-ir/skill-ir-aot-optimization-spec.md
git show <commit>:docs/skill-ir/skill-ir-aot-optimization-plan.md
```

冻结代码和结果仍保持原路径。旧实现细节应从对应 commit、lock、test 和 result 中核验，不能用历史文字
覆盖当前合同。

## 5. 使用边界

- 本文不参与运行时 digest 或实验 gate。
- 当前开发以 README、spec、plan 和对应组件文档为准。
- 若历史描述与冻结 lock/result 冲突，以机器可读证据为准，并在 evidence ledger 更正。
- 新阶段完成后只追加决策摘要，不粘贴实施计划或命令日志。
