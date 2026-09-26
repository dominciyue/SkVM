# AF0–AF8：可复用场景工作区与声明生成

> 使用executing-plans/TDD，Astra ultra、Fast/priority。独立于AE的协议实验，连续完成工具、示例和验证后交统一发布者。禁止抢写主CLI或共享文档。

**Goal:** 让使用者维护一份共同声明和每场景明确变化，直接生成可check/run的普通v2输入，减少复制整份任务文件。

**Architecture:** 复用已有`composeAuthorizationAuthoring`的整字段替换和来源记录。新增只负责文件读取、输出规划、语义check与非覆盖发布的工作区工具；不发明嵌套patch表达式，不调用模型猜政策。生成物仍是现有authoring/v2，后续run选择何种wire与本工具独立。

**Tech Stack:** TypeScript/Bun/Zod，已有composer与check；不增加依赖或改v2 schema。

- 基线2525d387及本规划提交，状态authorized-for-execution。
- 工作区`D:/skill优化/SkVM`、skill-ir-aot；结果根`results/skill-ir/authorization-scenario-workspace-20260927/`。
- 先读AGENTS/current-status、本书、研究§7.25作者重复部分、`authoring-compose.ts`/测试、`authoring-v2.ts`、现有check和AC编辑示例。

## 1. 文件归属

可新增：`src/benchmarks/authorization-dsl/authoring-workspace/{schema,plan,materialize}.ts`及测试；`src/cli/authorization-compose.ts`及独立测试；`examples/authorization-assessment/scenario-workspace/`完整例子/README；本任务书/AF结果。

只读既有composer/parser/local-run，不改`src/cli/authorization.ts`、host、wire、AE/AG结果、root package/lock、共享docs和七项旧脏源码。主CLI最终路由由AE整合。Git写入和conversation_log由AE处理，你只给ready清单与共享文档增补稿。

## 2. 输入与安全发布合同

工作区配置只表达文件装配，不充当另一层任务语义：

```json
{
  "schemaVersion": "authorization-scenario-workspace/v1",
  "base": "base.json",
  "variants": [
    {"id": "owner", "replacements": "owner-replacements.json"},
    {"id": "outsider", "replacements": "outsider-replacements.json"}
  ]
}
```

替换文件原样复用`{field,value,origin}[]`；只有已有白名单顶层整体替换，禁止深merge、隐式继承、自动补政策或期待。base与替换相对配置文件定位，目标id只允许可携带普通文件名段、唯一且无Windows设备名；输出每场景`<id>.json`和非语义provenance sidecar。配置/manifest绝不被当成模型答案。

命令：

```powershell
bun ./src/cli/authorization-compose.ts --workspace=./workspace.json --out=./generated --check-only
bun ./src/cli/authorization-compose.ts --workspace=./workspace.json --out=./generated
```

同时导出`runAuthorizationComposeCli(args:string[]):Promise<number>`，由AE接入`skvm authorization compose`。省略check-only时先验证全部变体再一次发布新输出目录；已有目录拒绝覆盖。失败不得留下半套可运行输出。临时目录限定输出父目录，发布失败只清理由本调用创建且验证过的精确临时路径，绝不清理用户out/base/source。

sourceRoot语义相对**生成后的输入文件**。从base位置解出effective source root，输出时确定性重写为相对out的路径并记来源，保持指向同一源码；替换sourceRoot时规定相对workspace文件，不能随调用cwd改变。不复制或修改目标源码，不把本地sourceRoot误写成模型真值。policy location文字保留作者给定来源，机械重定位不改政策正文/期望。

check-only只返回规划、变化字段、来源及诊断，零写入/零provider；所有variant语义与source bounds共用现有check，可以用进程内临时物化受控字节，但对用户可见目录无写且临时精确清理。若可直接调用现有loader纯接口，优先复用。schema过但引用缺失时给具体variant+字段，不静默产出成功。

退出0通过，1输入/语义/输出状态失败，2参数失败。规模限50显式变体防误操作，超限明确说明，不做组合笛卡尔积生成。

## 3. 队列

### AF0 基线
- [ ] 记录已有composer语义和外部文件坐标，建立status与ownedFiles；不重复开发已有替换算法。

### AF1 红测工作区合同
- [ ] config版本、base缺失、重复id/非法名、替换文件类型/未知field/重复field/空origin全部有明确反例。
- [ ] 原base/替换不变，scenarios中错误引用在语义check检出。

### AF2 装配规划
- [ ] 实现`planAuthorizationWorkspace(workspaceFile,outDir)`返回input/provenance/diagnostics。逐variant复用composer，不伪造ID或规范。
- [ ] 验证从不同cwd运行输出计划相同，sourceRoot坐标正确；optional缺省不被补成虚假事实。

### AF3 原子新目录发布
- [ ] 写测试：第二variant坏时out不存在、已存在目录不覆盖、创建竞争拒绝、正确sourceRoot、原文件未变。
- [ ] 实现同父目录临时写→全部check→非覆盖发布，保留真正的错误原因。Windows路径和CRLF fixtures都运行。

### AF4 CLI与预览
- [ ] 独立handler支持上述两个命令，check-only不建provider；具体`variant/field`诊断直接给作者。
- [ ] tests调用handler，run之外不导入provider初始化。给AE主CLI两三行接线建议及测试用例，不能自己改主CLI。

### AF5 完整复用示例
- [ ] 一个synthetic源码项目，owner/outsider/role-override三个变体；共同base一次维护，变化文件明确填写所有相关事实，不自动从名称推allow/deny。
- [ ] 生成三份输入普通check全部通过；逐份lowering与人工准备的独立期望v2语义相等，证明文件装配没有改变任务。
- [ ] 展示修改一处共同政策如何出现在所有新变体，旧生成目录保留，输出需换新目录；不宣称自动复用旧答案。

### AF6 ordinary目录验收
- [ ] 复制整个workspace到仓外普通目录，再generate/check；不依赖D盘固定路径、AB结果或oracle。
- [ ] 记录维护文件/公共字段复用、生成输入语义，不以文件更少推断真人分钟或运行token收益。

### AF7 测试与交接
- [ ] `bun test ./src/benchmarks/authorization-dsl/authoring-workspace ./src/cli/authorization-compose.test.ts`通过。
- [ ] README写真实命令、坐标规则、失败场景、剩余作者责任；共享docs稿放integration-notes。
- [ ] 最后原子ready.json，包含ownedFiles、接口、focused测试和局限，通知AE后停止写。无需等待AE面板结束才交付。

### AF8 集成修订
- [ ] AE给具体本范围问题时修复并更新ready；不越界修改他的运行/协议代码。无返工则完成。

## 4. 边界

零业务模型、零目标执行、零新skill/保护样本读取。不得改所有者/角色等事实来凑正确结果；完整性依靠用户显式字段与现有validator。你与AE/AG并行，不装依赖、不做Git写入、不改共享文档或他人的计划。仅AE统一发布origin。
