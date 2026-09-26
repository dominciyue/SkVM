# AD0–AD7：实验目录查询与维护工具实施任务书

> 使用`superpowers:executing-plans`与`superpowers:test-driven-development`连续执行。模型`gpt-6-astra / ultra`，用户请求Fast，继承priority并如实记录。此任务是项目结果基础设施开发，独立于AB研究，不替AB评分、汇总或归档16条运行。

**Goal:** 让维护者通过一个零模型工具找到实验入口、发现失效路径、导出带来源和未知项的紧凑摘要，减少每轮手写和翻阅大目录。

**Architecture:** 只读解析现有`skill-ir-experiment-catalog/v1`，保留原条目与异构指标。显式列出的artifact路径做有界存在性检查，按ID/stage筛选并输出文本或JSON。默认不重写catalog，不扫描全部历史runs，不重新评价模型回答。

**Tech Stack:** TypeScript、Bun、node:path/fs，沿用仓内已安装校验库。不上数据库、网页、新模型调用或生产CLI平台。

- 状态ready-for-integration；起点`c51e9b8b`及任务书提交`69118798`。AD0–AD7已执行，Git发布与共享文档由AB统一处理。
- 工作区`D:/skill优化/SkVM`、分支`skill-ir-aot`。
- 独立结果根`results/skill-ir/experiment-catalog-tooling-20260926/`。
- 当前目录人工维护AB、U、F三项，包含不同scope/effect和unknown费用。原路径和原始报告仍权威，工具输出是可再生导航。

## 1. 阅读与独占范围

读AGENTS、current-status、本书、`results/skill-ir/experiment-catalog.json`及`docs/skill-ir/evidence-index.md`的导航合同。必要时参考`scripts/check_skill_ir_doc_links.py`路径语义，但不改它或重复全仓扫描器。

只允许写：
- `scripts/experiment-catalog/model.ts`、`io.ts`、`render.ts`、`cli.ts`、`catalog.test.ts`、`README.md`与该目录内synthetic fixtures（均新）。
- AD结果根status/verification/integration-notes/ready及本任务书。

只读既有catalog与其显式artifact路径。禁止修改生产src、AB目录、root package/lock、catalog原件、共享docs或七项旧脏代码。不能执行git add/commit/push，Git写入由AB统一负责；不清理目录、不改全局config。其他任务在开发，不要覆盖他人文件。

## 2. 接口与行为

提供脚本入口，保持项目主CLI不变：

```powershell
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
bun ./scripts/experiment-catalog/cli.ts show --root=. --catalog=results/skill-ir/experiment-catalog.json --id=authorization-external-reuse-v1
bun ./scripts/experiment-catalog/cli.ts show --root=. --catalog=results/skill-ir/experiment-catalog.json --stage=U --format=json
bun ./scripts/experiment-catalog/cli.ts export --root=. --catalog=results/skill-ir/experiment-catalog.json --out=./catalog-summary.json
```

check输出结构、duplicate-id和显式artifact存在性诊断；show只显示catalog登记事实，未评价状态必须显示未评价。export默认拒绝覆盖现有文件，明确输出只是一份摘要。所有相对路径以root解释；导出目标按调用方明确提供的路径解释并记录，不能覆盖输入catalog或任何列出的artifact。无需force参数。

建议类型先用于测试：

```ts
export interface CatalogDiagnostic {
  code: string; entryId?: string; path: string; message: string;
}
export function parseExperimentCatalog(value: unknown): {
  valid: boolean; entries: ReadonlyArray<Record<string, unknown>>;
  diagnostics: CatalogDiagnostic[];
};
export function renderExperimentEntry(entry: Record<string, unknown>): string;
```

schemaVersion只接收已知v1，entries每项要求非空且唯一id/stage/status以及artifacts对象；scope/provider/effect/limits及未来扩展字段按原值保留，拒绝坏核心结构但不把各轮异构指标强塞成同一评分。

原样区分unknown、null、0和缺字段；input/output/cache-read/cache-write独立显示，不默认求“总token”或跨实验平均质量。token字段可以是number也可缺失，坏类型报告诊断不强制转0。actualUSD数值0表示已知0，unknown/null表示未知，不按模型价格推算账单。

artifact路径要求repo内相对路径，支持当前目录类型root/changeReports；不解析文件文本中任意像路径的字符串，不跟随外链、绝对盘符或逃逸junction。只读显式文件/目录的存在性，不递归解析数千份run。路径缺失列诊断，不删除catalog条目。对输入长度、JSON错误、读取期间变化作明确诊断，可记录catalog单文件前后stat并有限重读一次；不可锁住AB整段运行。

退出：0成功；1资料/路径无效；2参数错误。help/show/check/import库均不得创建结果目录或provider。导出是唯一明确写操作；先完整验证再写新文件。

## 3. 连续工作队列

### AD0 设计现状与样例
- [x] 记录catalog v1三种条目形状、当前导航需求与文件白名单，建立自己status。
- [x] 构造纯synthetic测试fixtures，不复制AB真实答案、oracle或历史大包。

### AD1 parser红绿
- [x] 测试schemaVersion错误、entries缺失、重复id、空核心字段、artifact类型错与扩展字段保留。
- [x] 实现`parseExperimentCatalog`，不猜实验状态、不推导质量。

```ts
const parsed = parseExperimentCatalog(fixtureWithUnknownCost);
expect(parsed.valid).toBe(true);
expect(parsed.entries[0]?.provider).toEqual(fixtureWithUnknownCost.entries[0].provider);
```

### AD2 路径与只读合同
- [x] 临时目录测试文件/目录存在、缺失、../逃逸、盘符、NUL、symlink/junction逃逸与空catalog。
- [x] 实现root真实路径约束，只检查artifact键值，不把limits文字当链接，也不访问网络。
- [x] 测试check前后输入字节不变、无额外输出；不要把保护历史的hash写入所有层。

### AD3 查询与摘要
- [x] id/stage筛选、未命中、JSON/text两种输出、顺序稳定。unknown与0有独立断言。
- [x] 明确schema/transport/semantic review状态来自各字段，禁止从rawOutcome推质量；费用和作者tokens分区显示。
- [x] 用户未要求的复杂嵌套字段保留在JSON，文本摘要给清楚提示而不静默丢原值。

### AD4 明确导出
- [x] 测试输出已存在时不覆盖、输出等于catalog/artifact时拒绝、父目录不可写诊断、参数错误退出2。
- [x] 实现export最小新文件写入；无默认位置，不用HTML。输出标明catalog来源、导出schema版本和原始artifact入口。

### AD5 当前目录试用
- [x] 对当前真实catalog只读check/show一次，保留实际缺失与unknown，不修或覆盖它。AB期间catalog可变化，记录读取版本及时间，勿声称是最终AB结论。
- [x] 在自己结果根导出一份snapshot用于使用验收；复验工具完全离线、无provider，原catalog字节未被本工具修改。

### AD6 验证与文档
- [x] README给真实命令、错误/退出码、数据更新责任和unknown例子。
- [x] 执行：

```powershell
bun test ./scripts/experiment-catalog/catalog.test.ts
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
```

若真实catalog有既有缺失，工具应正确退出1并保留诊断；不能为让演示绿而放松校验。自己的fixture测试必须通过。全仓文档扫描与typecheck由AB发布者集中执行。

### AD7 交接与停止
- [x] 写verification、ownedFiles、导航增补建议，最后原子写ready.json为`ready-for-integration`或明确partial。向协调表AB任务发送ready路径后停止修改。
- [x] 不等待AB评分再完成本工具，不替AB生成panel summary，不自行新增全项目实验登记或新研究样本。AB发布者按范围合并README导航并分别提交。

## 4. 验收

工具能读取现有异构目录、明确报告无效位置、检索ID/stage、导出可再生摘要，零模型调用且不改原记录。成功依据是确定性行为和真实目录试用；没有跨实验质量排名、自动审查或成本收益主张。

## 5. AD执行记录（2026-09-26）

- AD1/AD2/AD3/AD4分别先见到预期失败，再实现通过；最终24测试、147断言通过。已有本地TypeScript编译器对五个脚本文件的严格检查通过；首次检查发现并修正一处测试期望值类型标注。全仓检查仍由AB发布者负责。
- 真实目录的check、AB ID show、U stage JSON show及显式snapshot export均退出0；check为3 entries、0 diagnostics。读取前后catalog字节相同，SHA-256为`ce6c7313679b58f0466bc418984643682cd835718ff2090dacb13d679890831a`。时间与输出原文见独占结果根`verification.json`，snapshot为`catalog-summary.json`。
- 细化合同：show仅解析catalog，不验证artifact存在性，以便定位缺失证据；check/export检查全部登记路径。export不写登记artifact目录内部，使用独占新文件创建。文件I/O失败可能留下新建的部分文件，返回明确诊断，不自动删除或覆盖。
- 为保留未知项，已知token维度与费用允许非负有限number、`null`或`"unknown"`，缺字段继续缺失；数字字符串等坏类型报告诊断。复杂扩展按JSON原值输出，不强制统一度量。
- 读取最多4 MiB（另有一个增长检测字节），单文件stat变化只重读一次。成功读取后以时间/哈希识别快照；后续catalog变化不使先前快照失效，不提供全树原子快照或运行期锁。两份独立只读复核已处理，具体判断见verification。
- 当前任务运行上下文观察到`gpt-6-astra / ultra`；宿主配置为`service_tier="priority"`，但任务日志未包含实际service tier字段，保持未观察，不宣称实测1.5倍速度。未修改全局配置。
- 仅白名单文件修改；provider/付费调用、新研究样本、AB评分、artifact内容读取、Git写操作均为0。交接由AB任务`01a0de62-39d6-7883-89da-4123cb8327f0`负责，发布前不再由AD改文件。
