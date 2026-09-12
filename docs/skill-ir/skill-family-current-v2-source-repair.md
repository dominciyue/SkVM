# API 合同任务引擎：接口设计与执行入口

**状态：design-only / planned-not-started，2026-09-12。** 本文描述 revision 2 要实现的组件，不宣称新入口已存在。已有 request/schema/response/pytest 能力见 [审查依据](skill-family-plan-review-20260912.md)；实际执行按 [N0–N15 任务书](../superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md)。

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

## 实施与验证

复用 api-skill-mapping、api-schema-witness/checker、request/form/body-negative、response-observation/header 和 api-pytest-*。新增 api-task-contract/plan/run 的职责分别为任务 schema、构造前义务计划、普通输入编排；旧 API Tester v2 保持兼容。

N2 验证需求变化驱动内容、仓库名变化不驱动内容；N5 验证包在研究 runner 外实际消费和八类故障检出；N10 固定多 provider 输入；N14 验证一次代码候选 clean replay。没有实施前不运行不存在的命令。

当前可用恢复诊断：bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status。
计划中的新命令为 bun ./bin/skvm.js artifact task --task=task.json --out=out；N8 必须实测并把这里更新成最终实际命令。实施尚未开始，不能将此设计示例计作成功样本。
