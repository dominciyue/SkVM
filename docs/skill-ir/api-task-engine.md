# API Task Engine

本页是 API TaskContract、请求构造、pytest/loopback、生产 binding 与 checker 的当前接口说明。它是 U3 可复用后端，
不是 U0–U7 路线的默认入口。

## 1. CLI 与 TaskContract

API 任务从公开 OpenAPI 3.x 或已验证 TaskContract 进入。通用生产入口：

```powershell
bun run ./src/cli/artifact.ts `
  --preset=api-tester `
  --binding=<binding.json> `
  --root=. `
  --workdir=<input-workdir> `
  --out=<new-empty-output> `
  --completed-at=<ISO-8601>
```

binding v1/v2 只声明安全相对输入、格式和 plan/report 输出。`--binding` 与历史 `--variant` 互斥；未知版本、
路径逃逸、symlink、输入/输出碰撞或非空输出目录在写文件前拒绝。

核心入口位于 `src/skill-ir/api-task-*.ts`、`src/skill-ir/api-tester-production-*.ts` 和
`src/cli/artifact.ts`。扩展必须保持通用数据驱动，不按 fixture、task 或 skill id 分支。

## 2. Source closure

- 原始 OpenAPI/TaskContract 字节及其 SHA-256 是 authority；规范化 public contract 是派生输入。
- v1 支持明确 operation、inline primitive parameter、有限 JSON object body、bearer/header API key 和显式状态码。
- v2 增加受限同文档 local component ref、primitive array 与确定性 query array encoding。
- 外部/循环/错类型 ref、未支持组合或嵌套 schema、歧义 security、不可构造约束稳定 fail closed。
- description、示例和历史模型输出不能替代公开 schema 或 source obligation。

详细 schema 与稳定拒绝码以 `src/skill-ir/api-tester-production-contract*.ts` 的类型和测试为准。

## 3. Request JSON、wire 与 pytest

请求构造保留 operation 和 case 完整分母：成功 witness、字段负例、body/form、header、schema branch 与 response
义务分别记录。无法构造的 case 必须是 `unresolved` 或带原因拒绝，不能从报告中消失。

原生 pytest/httpx 路径只执行固定 runtime 和数据，不把 source prose 插进 Python。没有显式 oracle 的 case
必须 SKIP；合成 loopback oracle 只证明字节、header、URL、状态和响应断言的物理执行，不证明真实 API 正确。
HTTP 客户端禁用环境代理、隐式认证、cookie、redirect 与 retry，并保持请求体和 raw target 字节一致。

## 4. Checker

checker 与 generator 使用不同程序和摘要。checker 从不可变 binding 与 normalized public contract 独立验证：

- operation 与 method/path coverage；
- 字段约束、有效 witness 和负例；
- security、error response、case 独立性与完整计数；
- plan/report/binding/input digest；
- v2 array encoding、长度、唯一性与 item constraint。

checker 不读取 gold、prompt、held-out、evaluator payload，也不导入 generator。当前 checker 共享规范化 parser，
因此不能外推为双解析器一致性。

## 5. 支持面与当前证据

- v1 production binding：两份公开 development 输入 2/2 通过，0 模型/API/付费调用。
- v2 successor：已暴露 Open-Meteo 输入 1 个 operation、23 fields 通过；它不是 unseen/prospective。
- v2 feature migration：6 个真实来源与 4 个边界均未接纳，10/10 exact rejection，checker 均 not-run。
- 历史 9-task 基线：4/9 task、8/18 run 通过，10 个失败待归因；native runner 4 pass / 5 skip。

这些结果只说明各自 development 身份和明确子集，不证明任意 OpenAPI、真实服务执行、跨模型或人工节省。
结果路径见[evidence-index.md](evidence-index.md)。

## 6. 已知缺口与 claim 边界

- operation-sequence public-answer parity 只比较公开顺序与结构，不是完整 agent trace 或计划质量。
- 已冻结 paid smoke 首行虽 parity exact，但独立 scorer 三项失败；该 identity 不补跑。
- 人工投入 successor 仍为 `design-only-not-authorized`：2 人、4 个新 development task、8-row 平衡交叉；
  两臂均禁用模型，需实际参与者、前瞻 active minutes、失败尝试和修改量后才能谈人工差异。
- native/loopback、schema 构造与 package validation 不能冒充 live API、业务状态或 whole-skill correctness。

## 7. 测试入口

```powershell
bun test ./src/skill-ir/api-task
bun test ./src/skill-ir/api-tester-production-contract.test.ts `
  ./src/skill-ir/api-tester-production-programs.test.ts `
  ./src/skill-ir/api-tester-production-artifact.test.ts
bun test ./src/skill-ir/api-tester-production-contract-v2.test.ts `
  ./src/skill-ir/api-tester-production-programs-v2.test.ts `
  ./src/skill-ir/api-tester-production-artifact-v2.test.ts
bun run typecheck
```

被脚本或冻结 JSON 按原路径读取的 API specimen 文档属于版本化材料；即使正文已合并到本页，也不得改写或删除。
