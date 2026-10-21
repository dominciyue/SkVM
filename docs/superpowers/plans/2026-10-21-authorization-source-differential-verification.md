# BU0–BU19：源码差分核验与反例驱动的自动修稿

> **执行：gpt-6-astra / high。** 用户已授权本轮任务书与新线程执行。连续推进有限队列，常规可逆工作不等待确认。接管时读取并应用已安装的 `stop-that-shit` Skill；使用现有计划执行、调试和TDD流程，避免重复审批、无消费者的校验文件及为了填满队列而追加调用。

**Goal：** 让普通 SkVM 使用者能把生成程序与固定源码的实际局部行为进行比较，得到可复现的具体反例，并让模型在正常作者流程中修复程序。回答“检查器发现了哪些真实翻译错误、修订后是否消失、正确程序是否被误伤”，同时保留原任务中尚未检查的职责。

**Architecture：** 复用现有可执行合同、inquiry/native、持久作者、trial、事件与结果投影。增加一个由任务确定的核验要求和一个共享差分比较器；源码侧通过显式选择的隔离观察适配器提供实际事件，程序侧复用当前执行器。原函数使用假存储，不运行真实服务。研究者参考程序、模型原稿、源码观察、用户政策分别保留来源。

**Tech Stack：** TypeScript/Bun/Zod、已有 Go 工具链、Python 抽取脚本、官方账号 `gpt-5.6-sol/high`。没有新服务、平行CLI、通用Go/Python解释器或新的消费者大面板。

## 一、接管与当前事实

- 仓库 `D:\skill优化\SkVM`，继续 `skill-ir-aot`，仅用户 `origin`，不建分支/worktree。
- 基线 `491812b4ade0751ad6dc8989d12677e5d0d4a870`；实际从包含本任务书的最新提交接管。规划复核时 tracked 干净，既存 `.tmp/` 保留。
- identity：`authorization-source-differential-v1`。脚本和结果各使用既有 research/development 目录中的同名子目录，不创建第二套当前文档。
- 必读：[当前状态](../../skill-ir/current-status.md)、本任务书、[spec §14.60](../../skill-ir/skill-ir-aot-optimization-spec.md#1460-bu-source-differential-verification)、[研究 §7.82](../../skill-ir/skill-dsl-research.md#782-bt-复核与-bu-源码差分核验)，及父/仓库 AGENTS。按需读原题、现有组件和即将修改的源码。handoff/communication只读最新接管段。
- BT证据：[执行记录](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/execution.md)、[验收](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/verification/acceptance-matrix.json)、[原稿](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/automatic)、[源码评阅](../../../results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/evaluation)。BT已关闭全部10用途，9派发/15观察turn；预算预留中断和随后终答均保留，无BT活动/未知请求。

### 已核实的根因

1. `program-relations.ts`只检查作者coverage中存在的relation。漏声明就没有检查结果。`consistent`表示有限轨迹自洽，尚无源码侧独立依据。
2. `guard-effect`当前只比较相等对象，effect只认external；真实的返回、同根版本和持久写入需要分别解释。直接把value改标external不能产生源码依据。
3. BT的Memos fake忽略FindUser/FindSpace/FindSpaceMember参数，只返回预置对象。八子案例支持局部顺序和策略分支，发现不了查询参数导致的错对象。
4. M实际修稿恢复了上下文解析先于策略拒绝的顺序。旧unknown-audience/viewer-error案例的viewer为0，原期望不成立；BT用另一个活动viewer案例确认。BU保留这项fixture纠正，不再把旧期望直接当真值。
5. G末稿把converter loader失败当成阻止201；源码converter返回空api.Issue，handler仍201。作者只取得函数候选、未读converter正文。候选索引和调用点引用不足以支撑这条失败规则。
6. BT参考RR/RE在M持平，G多一域且来自额外源码调查；29/48域、0/8整题不能证明执行增量。BU暂停同形N/R/E面板，将主要实验改成错误发现、误报与实际修稿。

这些缺口支持一次定向修改。保留已有程序执行、恢复和失效机制；不再通过增加通用语法或整题门槛来推动队列。

## 二、核验合同与范围

### 2.1 三项判断独立报告

| 判断 | 依据 | 本轮输出 |
|---|---|---|
| 程序是否忠实于源码 | 同输入的原函数观察与DSL轨迹 | `matched-on-cases` / `counterexample` / `unknown`，附具名输入和首个差异 |
| 当前行为是否符合用户政策 | 独立政策、主体/资源关系与已取得行为 | 政策满足、违反或缺证据；源码原有漏洞也可能被忠实翻译 |
| 原skill任务回答是否完整 | 原问题和源码评阅 | 原题逐项结果；局部检查通过不代填完整答案 |

差分一致仅适用于已运行的输入、函数和边界。不要命名为safe、源码已证明或完整HTTP成功；也不要用全部unknown取得零误报的好看数字。每类同时报告可检查数、发现数、误报数和未知数。

### 2.2 检查责任独立于作者

在修稿前，从原任务和独立政策登记必要关系，复用question/operation身份。声明回答“核验什么”，不提供正确step、最终答案或评分标签。作者只提供程序位置映射，不能删除要求、改成更宽松关系或隐藏实际相关事件。

最小内容为要求ID、原问题、核验种类、源码观察范围、允许对象关系、程序映射及缺口。缺映射给该要求具名unknown，其他有证据的要求继续。优先扩展已有输入/obligation类型；只有确有独立生命周期时才新增小型 `program-verification.ts`，不得再建统一IR。

对象相等仅用于任务明确要求的同对象关系。若要求是“版本属于已授权根”，必须有独立政策和源码/输入中的根关系证据，不能由作者为过检查自行选择。BU主线是Memos同memo关系；root-descendant在缺依据时明确unsupported，可用匿名测试说明边界，不扩Download实测。

核验种类限定为：决策/返回值、查询与对象绑定、调用及首错顺序、已观察的效果请求与后续错误。返回资源、外部请求、函数返回和持久提交分别标识。无真实提交证据时不发明durable结果。

### 2.3 独立源码观察

- 首要真实范围：固定 `usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4` 的 `core/access/memo.go`、`memo_resolve.go`，以及无需改写控制流就能纳入的既有调用边界。
- 改进BT抽取路径：原函数保持原字节，显式列出类型shim；fake按查询参数选择记录，主体、创建者、memo、share、space、member身份可独立变化。记录函数调用、实参、返回/错误、先后与最终决策，不用DSL结果填fake返回。
- 原函数与DSL共同接收同一输入世界。转换只做类型/字段映射，不提前计算授权答案。对参数映射本身写一个错误映射反例，防止两边一起错。
- 观察来自宿主选择的可信适配器。作者不能提供任意命令替换观察器、伪造source事件或修改核验要求。普通用户显式选择本地核验配置；模型仍只读源码和调用受限现有工具。
- 允许宿主在隔离工作目录运行固定原函数和fake存储，限制执行时间/输出，禁用目标服务、真实数据库和业务网络；沿用BT已授权边界。隔离执行单列计数，不能写目标代码执行总数为0。
- Gitea固定 `fc28937a8d772fe9e4025c9b5f24d5db4d86610b` 的converter错误作为第二种错误结构。先检查可直接调用的最窄原函数；一次依赖修复后仍需大规模框架移植则停止搭环境，以源码评阅明确报告。手写G模拟器不能充当独立源码执行依据。
- 同commit缺失源码可联网补齐，沿用已有来源和失效消费者；不增加重复哈希清单。Go深层语义不由Python结构索引冒充。

## 三、共享实现责任与必要红测

先直接阅读下列实际代码，BU1记录最终改动范围。允许为贯通调用者扩展必要文件，禁止按仓库名、skill名或已知案例ID写成功分支。

| 责任 | 起点 | 交付 |
|---|---|---|
| 独立要求与比较 | `src/task-dsl/authorization/program-coverage.ts`、`program-relations.ts`、`program-obligations.ts` | 要求不受作者coverage控制；共享事件/返回比较、首差异、未知原因 |
| 源码观察适配 | BT `source-tests/run_memos_extract.py`、`memos_access_test.go`；新BU适配脚本/fixture | 参数敏感fake、可搬移原函数观察、单一JSON事件输出；BT文件不回填 |
| 当前稿试跑与反馈 | `program-trial.ts`、`program-outcome.ts`、`program-authoring-context.ts`、`program-consumption-context.ts` | 在原有trial/details中送回真实反例，保留当前revision和原题职责，简短摘要按需细节 |
| 普通宿主接线 | `inquiry-domain-runtime.ts`、`inquiry-local.ts`、`src/cli/authorization-inquiry.ts` | check/run使用同一个比较器；复用现有输入，确实缺配置入口时才加显式核验选项 |
| 示例/研究 | Memos、Gitea现有README；BU结果/脚本 | 一条零模型检查命令、一条真实自动修稿与同稿使用流程 |

必须先失败后实现的行为：

1. 作者不声明关系、删除映射或换宽松关系，原要求仍在，不能得matched。
2. 源码检查A、效果作用B；程序错误地两处都写B，自洽检查通过，但A/B权限不同的见证输入必须产生源码差异。
3. fake收到错误UserID/SpaceID/MemberID，必须查询不同记录或报缺记录，不能仍返回同一个preset行。
4. 提前拒绝与先查询再拒绝返回相同，事件比较指出顺序/错误差异；合法匿名分支无需查询member时不能误报缺调用。
5. 原源码效果发生后refetch/converter失败，与程序“从未发生效果”分开；没有持久化证据不推提交成功。
6. 同一对象与授权根关系不可混用；缺根依据unknown。纯value返回能核对返回值，却不会凭声明生成外部写入事件。
7. 源码观察/类型映射失败、来源变化、旧revision反馈分别具名；不能把失败变空事件并判match。
8. 反例在当前作者details/trial中可见；模型正常patch后重新比较，原始错误保留，过期反例不污染新稿。
9. 正确程序及中性改动不报语义差异；源码改动先撤回旧依据，重新观察后才判断语义是否相同。

至少两个匿名结构覆盖共享比较器：受保护读取、写请求之后发生后续错误。它们是单元测试，真实方法成绩仍来自固定原函数与实际模型稿。

## 四、实验与评价

### 4.1 零模型主实验

先清点BT M初/末稿、G末稿及相关参考的主张：计算结果、静态源码断言、授权关系断言、外部未知。按原问题/关系计数，不按可随意拆分的value步骤算“机械覆盖率”。无消费者的字面量在BU副本中可清晰标记；不修改历史程序。

真实错误首先取BT `automatic/M-initial.json` 与 `M-final.json`，以及 `G-final.json` 的converter反例。参考材料明确标记为开发者辅助，不计自动成功。以实际原函数区分原/错程序；旧手写期望只作待核对线索。

再登记一组小型变异：错对象、检查/调用次序、提前退出、错误传播各一个有区分输入的语义变异；配四个中性控制。每个变异先证明源码或程序在具体输入上的差异；等价、未触达和不适用单列，不能自动当真阳性。变化只作用于新副本。保留允许文件中未引用位置变化的失效回归，但不重做整个失效系统。

报告自然错误、构造变异、中性控制各自结果。反例须包含输入、源码观察、程序观察、首差异和范围，而不是只给失败码。同一已知错误用于调试后不能再被称为独立泛化测试。

### 4.2 十个正常模型用途，至多两个具名确认

| 用途 | 数量 | 目的 |
|---|---:|---|
| L-M-bad / L-M-control / L-G-bad / L-G-control | 4 | 新上下文LLM复核：同源码、同程序和同任务要求，找错或说明证据不足；隐藏历史评分和正确/错误标签 |
| A-M-base / A-M-check | 2 | 从相同M错误原稿做修复；base用源码与普通trial，check另外可取源码差分反例 |
| A-G-base / A-G-check | 2 | 从相同G错误原稿修复；若G没有可执行源码观察，check只可获明确标记的源码评阅反馈，单列，不能计机械核验优势 |
| U-M / U-G | 2 | 按时间固定check臂末稿，经普通原skill入口使用一次，要求说明实际检查范围及原题剩余职责 |

M先base后check，G反向；四个LLM复核包顺序在首次调用前固定。正确/错误身份仅评价侧保留，不在路径名/提示里泄漏。控制程序须先由源码依据确认对应范围；无法确认则记unqualified，不伪造正确参考。

开发模型gpt-6-astra/high；实验官方账号gpt-5.6-sol/high，第三方继续暂停。共用原skill、任务、原稿、允许源码、模型与宿主预算，check增加的反例和计算成本如实计入方法。禁止给任一臂参考程序、正确patch、最终答案或隐藏评价案例。

复用BT实际预算但减少无用输出：每用途64工具、786432展示字节、33554432读取字节、2700000ms为上限，修稿续作共享累计上限；无需用满。作者首回合后最多两次有针对性的正常修订，已知关闭才继续，不重置预算。源码差分以摘要+按需事件提供，禁止把全部案例/历史工具输出反复灌入上下文。

两次额外确认仅用于可操作共享缺陷的修后验证；影响配对时两臂同修订确认，否则标明比较失效。已知错误可在普通试用中诊断，但U不得把错误稿作为可信认证；严重已知误导时记该用途未合格，原计划分母仍保留。

### 4.3 判断与停止

- 主指标：独立依据检出的真实翻译错误、正确控制的误报、具名unknown、模型实际修正数、修正后未展示输入的行为和关系。每个要求都在分母，不用步骤百分比。
- LLM复核与宿主核验同表。记录二者独有/共同发现和误报；小样本没有独有发现时不宣布技术无效，但停止“更强检测”的主张和同形扩样，按实际可靠性与复用价值决定保留范围。
- 原题质量继续按原题记录；修复一个局部错误可以形成正向证据，不能被0整题掩盖，也不能改写为整个skill已优化。
- 任何已知错误被机械结论判matched，立即修该比较/映射；同根因两次修复无改善则该关系保持实验/unknown，继续独立责任。不能把unsupported改为match收口。
- 若M普通入口无法形成任何非平凡源码反例与修后确认，停止扩大适配器和新消费者，交付具体原因。若M成立而G不具执行条件，交付单结构能力和G边界，不追加完整框架或新项目。
- 本轮对每类关系给 `supported-in-tested-scope`、`not-supported` 或具名`inconclusive`。工程/自动修稿/答案/成本分别总结，不预设正向，也不把所有结果压成一个“未达”。
- active/unknown请求只读核查，不重发。额度/路由问题按已有有界恢复暂停对应通道，继续离线责任；旧未知原件/费用保持。

## 五、BU0–BU19队列

- [x] **BU0 接管与Guard。** 核对当前分支/提交、写入线程、BT已关闭状态。读取STS Skill并用首行change指令启用；不为证明插件再开模型测试。记录本轮文件责任。
- [x] **BU1 定义要求。** 原任务→必要关系→独立依据→程序映射。先读实际模块，确定最小类型和普通入口，不另造平台。
- [x] **BU2 主张清点。** 对三个代表性原稿作紧凑清点，区分计算/断言/外部，定位真正需核验的授权关系。
- [x] **BU3 参数敏感源码观察红测。** 使BT fake忽略ID的问题在新副本测试失败；设计不同creator/viewer/resource的见证输入。
- [x] **BU4 源码观察落地。** 复用固定原函数与本地Go，导出带实参/错误/返回的事件；校验转换层，留明shim边界。
- [x] **BU5 独立要求与共享比较红测。** 覆盖漏声明、错对象、合法跳过、错误前后效果和未观察情形。
- [x] **BU6 共享比较实现。** 不依赖仓库名，返回逐要求差异与具名unknown，原自洽检查继续兼容。
- [x] **BU7 普通入口接线。** 原有check/run/trial/details共用比较和当前反馈；源码观察由宿主管理并计数。
- [x] **BU8 真实错误回放。** 对M初末原稿和G反例运行已具备依据的检查；G只评阅范围明确单列。
- [x] **BU9 变异与正确控制。** 登记四语义变异、四中性控制及区分输入，等价/不适用单列；不根据模型结果挑保留案例。
- [x] **BU10 修复缺正文的通路。** 依据G具体失败修候选/正文来源投影和按需读取反馈；无需强迫读完所有callee或把未读全部变成硬拒绝。
- [ ] **BU11 有限实验准备。** 固定十用途、四复核包、两修稿配对、共同预算、分轴指标；沿用已有归档，只有消费者需要的来源绑定保留。
- [ ] **BU12 LLM复核基线。** 四包新上下文复核，与宿主发现/误报对照，保存第一次结果。
- [ ] **BU13 M实际自动修稿。** 两臂从相同原稿出发，check收到真正反例，开发者不补程序；当前与未展示输入验证。
- [ ] **BU14 G实际自动修稿。** 明确正文取得及converter返回含义是否进入raw；机械/评阅反馈分别标记，检查链不具备时不冒充。
- [ ] **BU15 当前稿真实使用。** U-M/U-G原skill普通入口使用当前稿，记录工具结果实际使用和剩余原题职责；不重开N/R/E面板。
- [ ] **BU16 有据确认与变化。** 必要共享错误当场修复并用有限确认验证；同包新输入、搬移、源码变化撤回及再核验。无错误时不耗确认名额。
- [ ] **BU17 集成验证。** 相关红绿/回归、主与BU类型、零模型普通命令及文档检查。只验证本轮责任，不重跑历史全仓审计。
- [ ] **BU18 文档收束。** 更新研究§1/7.82/11、spec、现有使用说明；current-status只留当前摘要与历史表，旧长段移入已有history并保留必要锚点。不新建综合报告入口，不删除原件或.tmp，不迁benchmarks。
- [ ] **BU19 发布与决定。** 按关系列支持/否定/未知、真实修稿与实际使用、全部成本；提交推用户origin，记录恢复入口并停止，不自动BV。

## 六、普通交付与验证

2026-10-22阶段记录：BU0–BU10已实施。接管HEAD为`9ac569b188df0fe791a68528ce3197d7ee7c9add`；STS实际线程状态为observing/unconfirmed，与安装测试armed不同，不手改插件状态。新增独立`program-verification.ts`、可信宿主`source-verification.ts`及原有check/run/trial/details接线；M参数敏感原函数13案回放发现自然提前拒绝、4/4语义变异，4/4中性控制无反例，决策缺映射和错误结果缺观察单列unknown。G窄原函数仍依赖数据库模型图，采用明确source-review-only；没有G模拟器。主张清点、来源边界和红绿记录见[BU执行记录](../../../results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1/execution.md)。已通过122项受影响回归/851断言、随后13项比较器/33断言、主/BU类型与2项调度测试；八实验入口零调用预备通过，付费十用途尚未开始。当前读取文档数量不增加。

交付必须包含一条在普通现有入口触发源码差分的零模型命令，输出一个真实错误的区分输入与事件差异；另给当前修后程序及同输入结果。编写者走同一个公开接口取得反馈，不能只在research runner中偷偷校验。

新配置选项如果必要，应限定在现有 `authorization inquiry check/run`，先写CLI失败测试；README在实现完成后填写实际可复制命令，不把尚不存在的参数写成已交付。Memos共享示例为主要入口，G仅追加准确能力说明；Download默认保持现状。

起始验证命令（新增测试由BU1补入同一任务书）：

```powershell
Set-Location 'D:\skill优化\SkVM'
bun test ./src/task-dsl/authorization/program-relations.test.ts ./src/task-dsl/authorization/program-trial.test.ts
bun test ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts --timeout 30000
bun run typecheck
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
git diff --check
```

新增适配器/研究脚本有自己的短测试和tsconfig。最终联合验证只跑受影响集合；插件只需读取实际状态，不增加安装审计。不得删除有效防护、放宽身份/源码失效来制造通过。

结果沿用一个execution.md和一份summary/状态，必要原稿、观察、反例与费用分文件，杜绝为检查新manifest再造一层manifest。完整prompt计cache一次，输出、观察器时间/执行、修稿与失败、准备/开发/人工未知分别记；实际美元未知就保留unknown。

工程完成应对应普通入口确实发现错误并反馈；研究结论对应范围明确的实际比较。原有历史结果、held-out/Q1/prospective与readiness保持，本轮不承诺一般授权安全或净收益。
