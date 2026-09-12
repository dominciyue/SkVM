# API 合同任务引擎：接口设计与执行入口

**状态：active，N0/N1 completed / N2 next，2026-09-12。** 已有 request/schema/response/pytest 能力见 [审查依据](skill-family-plan-review-20260912.md)；实际执行按 [N0–N15 任务书](../superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md)，机器状态在 `results/skill-ir/skill-family-current-v2-source-repair-001/`。

## 目标和接口

普通用户提供 OpenAPI 3.0.x JSON/YAML 文件及 task.json；可附本地依赖、response observations、独立 loopback oracle。任务描述需要哪些操作、最小/完整请求、遗漏/约束负例、响应校验及 request-json/pytest 输出。不得要求用户先写研究 selection/ledger/identity。

拟定 task.json 示例（假设 api.yaml 已由用户提供；不表示该文件随本组件交付）：

~~~json
{
  "schemaVersion": "skvm-api-task/v1",
  "taskId": "request-smoke",
  "profile": "oas30-offline-test/v1",
  "input": { "path": "api.yaml", "format": "yaml", "dialect": "oas3.0" },
  "dependencyManifest": null,
  "operationKeys": "all",
  "requirements": [
    {
      "id": "minimal-request",
      "kind": "valid-minimal",
      "required": true,
      "scope": "each-selected-operation",
      "sourceLocator": "user-declared:task.json/requirements/0"
    }
  ],
  "output": "request-json",
  "observations": null,
  "execution": { "mode": "offline-validation" },
  "mapping": {
    "origin": "user-declared",
    "sourceSkill": null,
    "unresolvedRequirementIds": []
  }
}
~~~

计划先校验 task，再枚举每项 requirement 对应的 operation/case，通过现有共享构造和独立 checker 输出 bundle。来自 SKILL.md 的映射必须带原文定位与完整剩余职责；声明未知就返回待审核，不隐式转为已支持任务。

## 产物与语义

包包含任务、来源依赖、计划、请求数据、checker 结果及所选输出后端所需文件。request-json 可离线检查；pytest 包额外包含既有 Python runtime、suite data、依赖说明，按明确 oracle 在本地运行。

taskComplete 表示全部适用必需义务已满足并按要求导出；executionComplete 单独反映真实运行。无法构造、未支持、依赖缺失和 skip 分列。没有业务 oracle 时不能猜测状态码；response observations 只证明提供的响应与合同一致。

source closure 以 URI/pointer 图解析，response ref 是否必需由 task 决定。合法递归可以解析成功而有限 witness 构造未解决。profile/version 不支持时返回明确原因，不把 OAS3.1 当 OAS3.0。

## 状态与恢复入口

N0 新增 `scripts/skill-ir/skill-family-current-v2-prospective.ts`。它严格读取 `stage-manifest.json` 与 `execution-status.json`，核对任务集合、依赖无环、完成顺序、证据相对路径和保护计数，再派生工程、研究、维护三条状态。`status` 不写文件；`resume` 只返回首个可运行任务及其验收/证据目标。N1 已接入 `--step=n1`：先用同一构建器重核归档输入摘要，再以 write-once-or-byte-identical 方式写三份 corpus 账本，最后才推进持久状态；部分写入不会被误记为阶段完成。

~~~powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=resume
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n1
~~~

当前 `status`/`resume` 均定位 N2；再次运行 `--step=n1` 只重核已归档字节和已有输出，不回退状态或覆盖不同证据。持久状态同时记录实际 base commit、Bun/Node、公开曝光、历史 `0/6`、held-out/Q1/prospective 计数、成本分栏、未解决事项和下一动作。`completed-with-limitation` 的维护任务不会阻止依赖已满足的工程任务；不可能的完成顺序、绝对证据路径和依赖环 fail closed。

## N1 语料账本

`src/skill-ir/skill-family-current-v2-corpus.ts` 从已提交 class-proof/source-input 归档读取正文、直接资源、职责清单、metadata-only 候选和 API 文档。它不靠仓库名改变成功语义；逐项核对长度/SHA-256、职责 locator、旧计数、来源数、metadata 暴露状态和 API 解析结果。输出位于 `corpus/{source-ledger,duty-matrix,exposure-ledger}.json`。

本批次为 12 份正文、6 个仓库来源、42 个直接资源、498 项职责；4 个 N2 映射候选来自 4 个仓库并保留 residual scope。12 份 API 合同覆盖 6 个 provider，但均是同一 aggregator repository 的镜像；原始 upstream URL 没有旧证据，因此保持 null/unresolved。5 个 metadata-only 候选没有读取正文。该账本是有目的的 development corpus，不是随机生态样本，也不支持谱系独立率、whole-skill 或人工节省结论。

## 实施与验证

复用 api-skill-mapping、api-schema-witness/checker、request/form/body-negative、response-observation/header 和 api-pytest-*。新增 api-task-contract/plan/run 的职责分别为任务 schema、构造前义务计划、普通输入编排；旧 API Tester v2 保持兼容。

N2 验证需求变化驱动内容、仓库名变化不驱动内容；N5 验证包在研究 runner 外实际消费和八类故障检出；N10 固定多 provider 输入；N14 验证一次代码候选 clean replay。N0 的聚焦测试命令为：

~~~powershell
bun test ./scripts/skill-ir/skill-family-current-v2-prospective.test.ts
bun test ./src/skill-ir/skill-family-current-v2-corpus.test.ts
bunx tsc --noEmit --pretty false --module preserve --moduleResolution bundler --target es2022 --types bun scripts/skill-ir/skill-family-current-v2-prospective.ts scripts/skill-ir/skill-family-current-v2-prospective.test.ts
~~~

历史恢复诊断仍为 `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status`；它属于旧 identity，不代替上述当前状态。计划中的普通任务命令为 `bun ./bin/skvm.js artifact task --task=task.json --out=out`；N8 必须实测并把这里更新成最终实际命令。在 N8 完成前不能将设计示例计作成功样本。
