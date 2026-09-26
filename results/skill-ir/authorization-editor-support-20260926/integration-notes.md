# AC editor support integration notes

完成日期：2026-09-27（Asia/Shanghai）。结果目录保留任务书规定的20260926身份。
发布任务：`01a0de62-39d6-7883-89da-4123cb8327f0`，host `local`。

## 交付与边界

提供authoring/v2的本地draft-07编辑资产、Ajv检查API、结构漂移/有限差分验证器、完整synthetic例子与示例私有VS Code配置。现有runtime parser/lowering/check继续权威；核心v2、普通CLI、包依赖、锁文件、根编辑器配置、AB材料和七项旧脏源码均未修改。

精确`ownedFiles`及冻结hash见`ready.json`。共有13个路径：schema 1、editor-support代码/测试3、示例4、AC任务书1、本结果根status/verification/integration-notes/ready 4。没有需要发布的临时复制目录。共享docs和外层conversation_log由AB统一合并，AC没有写入它们。

## 验证

完整记录见`verification.json`，包括先红后绿证据、各命令输出、expected runtime-only诊断和独立核验范围。

| 检查 | 结果 |
| --- | --- |
| `bun test ./src/benchmarks/authorization-dsl/editor-support` | 9通过，0失败，517断言 |
| `bun test ./src/benchmarks/authorization-dsl/authoring-v2.test.ts` | 4通过，0失败，41断言 |
| `bun ./src/benchmarks/authorization-dsl/editor-support/verify.ts` | 退出0；105结构用例与实际parser一致，12个预期runtime-only反例检出 |
| `bun ./src/index.ts authorization check --input=./examples/authorization-assessment/editor-support/authoring.json` | valid，0 diagnostics；显式condition请求沿用当前conditions行为 |
| 普通目录复制后的check/locate | 源文件6–12行通过；locate唯一命中第6行；provider factory计数0；原输入/源码字节未变 |
| 有界运行时反例 | sourceRoot越界、缺文件、endLine越界都被现有check拒绝 |
| 两项独立只读复核 | schema合同、API/漂移检查、例子/路径/README均无阻断发现 |

本任务业务provider调用0、目标执行0、安装依赖0、Git写操作0。开发代理运行成本未计量；不把它当作业务provider费用。没有作者或模型收益试验，没有真人时间或节省主张。没有读取AB答案/oracle，亦无共享核心bug需要AB修复。

## 实现要点与维护

- `schemas/authorization/authoring-v2.schema.json`：全部公开字段、required/optional、enum、非空字符串、严格对象、具名dictionary、数组数量、整数行号和maxBranches 1–12。政策和expectation由作者提供；sourceRoot相对声明文件；locations为当前提供的源码行号。
- `schema.ts`：`loadAuthoringEditorSchema()`返回本地JSON副本；`checkEditorStructure(unknown)`返回`valid`及JSON Pointer诊断。Ajv strict/allErrors/ownProperties，不变异输入，无provider/远端schema请求。损坏资产/编译失败抛错；输入结构错误返回diagnostics。
- `verify.ts`：直接遍历当前Zod树比对嵌套字段与基础约束，并做有限的正反差分；未知Zod节点报告不支持。Zod 3.25.76未提供`toJSONSchema`，没有添加转换依赖。Zod整数`>0`与JSON Schema整数`>=1`按实际边界比较。
- `runtimeOnlyChecks`保留行号顺序、引用存在、引用重复、政策就绪、Unicode良构、真实路径/文件和真实源码范围。不能声称完整语义等价；字段覆盖也不能发现任意新refinement。有限反例给可解释边界，不做海量fuzz。
- `README.md`说明三类责任：编辑schema发现字段和结构错；check检查引用与源码范围；locate按字面量找实际行号。README含原场景、owner/supervisor改写步骤及checkout/单独目录关联方法。
- 示例声明没有`$schema`字段。私有`.vscode/settings.json`仅对把示例目录本身打开为workspace时生效；全仓workspace和复制目录的合法配置分别说明。未实测VS Code UI，不声称在线schema/npm发布。

## 建议由AB合并的共享文档增补

请从各共享文件的最新字节合并下列内容，不覆盖同轮其他修改。不新增`docs/skill-ir/`长期文档；推荐阅读集合不增加成员。

**developer-guide的授权authoring小节：**

> authoring/v2可使用仓内`schemas/authorization/authoring-v2.schema.json`获取字段说明、合法选项和结构诊断；完整可复制例子见`examples/authorization-assessment/editor-support/README.md`。严格声明不能添加`$schema`，应通过编辑器的`json.schemas`关联本地资产。`bun ./src/benchmarks/authorization-dsl/editor-support/verify.ts`检查编辑schema与当前parser的有限结构合同，退出0不表示语义就绪。引用、政策接受状态、Unicode名称和实际路径/源码范围继续交给`authorization check`；`authorization locate`返回所提供文件的实际行号。

**current-status的AC条目：**

> AC编辑支持已交付本地draft-07 schema、字段/结构差分检查、完整synthetic样例及私有编辑器关联。105结构用例与parser一致，12个预期runtime-only反例检出；自身9测试/517断言及既有v2回归4测试/41断言通过，普通目录check valid且零provider。runtime仍权威，没有新增模型试验或效率结论；全仓类型检查和发布结果由AB统一记录。

**研究§7.25工程后续说明：**

> AC针对作者未知字段问题补充编辑时字段发现与结构反馈，没有改变v2或本轮AB材料。仅验证确定性工具行为，不把该工程完成计作独立作者成功率或时间节省的证据。

**外层conversation_log简报：**

> 2026-09-27，AC0–AC7编辑支持：新增本地schema、独立检查器/测试与synthetic编辑例子，按白名单更新AC任务书与独立结果根；先红后绿，105/12有限用例与9+4测试通过，零provider/目标执行。源码、共享docs、AB评价材料及Git由对应任务维护。实际服务tier未观测，已确认宿主priority配置且未改全局配置；不宣称1.5×实测。全仓typecheck和发布由AB集中处理。

## 发布者仍需完成

1. 集中运行全仓typecheck；本任务按分工未运行。若发现AC范围问题，发具体位置，AC在原白名单内修订并更新ready版本。
2. 合并必要共享文档/日志与治理入口；AC不承担AB研究评价或验收项。
3. 只对ready列出的精确文件做统一Git提交/推送，不把历史untracked或他人修改混入AC归属。根`.gitignore:33`的`.vscode`规则会忽略本例私有settings；发布时需仅对`examples/authorization-assessment/editor-support/.vscode/settings.json`精确强制加入，不改全局ignore规则。该路径已经列入ready所有权和hash清单。

`git diff --check`对AC任务书退出0；Git提示将来可能按现有设置把LF转成CRLF，没有改Git配置。ready的SHA-256绑定当前工作区字节，发布者若做换行转换应记录其差异。

原子写ready后AC停止写文件；不保持空转。没有待用户批准项。
