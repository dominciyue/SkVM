# BI0–BI23：自动编写主链、有序修稿与保真消费

> **For the executing agent:** 使用 `superpowers:executing-plans`，按本任务书连续实施。用户已授权新线程用 `gpt-6.1-sol / max` 开发；普通可逆开发、定向验证和已授权实验不在常规检查点等待确认。工作量按约12小时设计，时间用于解决问题，不用等待、重复审计或重抽样凑时长。

**Goal:** 让普通 author 入口从完整原 skill、自然任务和允许源码自动形成真正接管 Download 资源选择的程序；同一自动原稿在原输入与变化输入下实际运行。与此同时，修复增量编辑的顺序能力，保留 compact 消费需要的未完成职责、分支规则和源码线索，用同期对照判断是否在质量保持的情况下减少开销。

**Architecture:** 复用现有 inquiry/native/structured-provider、executable-contract、resourceWorkflow、source binding、previous 和账号通道。增加薄的作者进度投影、显式步骤排序及面向完整任务的消费投影，仍由同一个编译器与求值器执行。宿主管理身份、顺序、数据依赖和当前结果，模型从源码提供领域含义；评阅答案与开发者参考程序留在评价侧。

**Tech stack:** TypeScript、Bun、Zod、现有 SkVM CLI、PowerShell 示例、官方账号实验通道。开发模型 `gpt-6.1-sol/max`；实验模型沿用 `gpt-5.6-sol/high`。

**状态：** completed-with-unmet-criteria（八首位置全部交付，无活动/未知；工程与有限队列完成，自动主链未达，P0 tradeoff/P1 negative）。2026-10-13实际接管 `fde04c26f35635366d4a7e6eddbfce15f309cd1c`，`skill-ir-aot`及origin一致、工作区干净；共享工程提交00053b32、c9749483，实质成果3cce2d02已推用户origin并核对同SHA。记录接管至实质成果远端核对约2.6小时，未凑约12小时估算。复核基线 `8745aee0e1133e2a783de75aa75946617854e462`。identity：`authorization-authoring-closure-v1`。结果统一放到 `results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/`；不在旧 BH 目录补行或修改原件。

## 一、这轮要解决的具体问题

BH 已有可运行开发者程序、逐步编译、草稿持久化和实际模型消费。其自动作者三稿均只保留4步，计算 requested/root/owner shortcut 和两个ID，版本、最终文件及表示选择仍来自自然解释。六次运行均交付，compact 首对降低成本但遗漏原职责；规则补充确认仍未完整。这是本轮的起点。

发布后复核定位到三个共享接点，实施者先用当前代码复现，不能把推断直接当作已证实的单一原因：

1. `inquiry-native.ts` 的 compact 分支在出现 executableContract 后便发送“程序已运行，使用其结果完成剩余职责”的消费指令，未按 `programMode=edit` 保留作者目标。BH作者三次整稿之后仍有探索预算，没有使用 patch。需要区分“活动程序存在”“可局部运行”“编写职责完成”。
2. `resource-program-draft.ts` 对已有步骤原位替换、对新步骤追加。BH合同原本如此设计；真实补齐现在需要改变该合同。复核中新增 guard 被放在已有 return 后，schemaValid 且无诊断，运行已提前返回；新增值放在 return 后则产生未定义引用。仅让 patch 接收成功不能满足修稿需求。
3. `program-consumption-context.ts` 已带当前规则，但 native compact 提前返回同时省略了 full 分支中的当前阶段、源码窗口和候选线索。BH首答漏掉空串version、root失查回退、follow_formatting等；确认件还误述路由/继承。需要同时保留程序内备选分支与程序外剩余职责，不能只压缩一份执行报告。

本轮继续开发通用机制，禁止按 Download/ShareLink/仓库名写成功分支。不建设 Python/Go 全语义、不新造 CLI/agent 框架、不做 HTML 层。质量约六成、编写复用约四成是精力安排；所有原任务要求都保留。

## 二、接管必读与修改责任

执行者亲自阅读基础文档，不用探子转述替代：

1. `D:/skill优化/AGENTS.md`、`D:/skill优化/SkVM/AGENTS.md`。
2. `docs/skill-ir/current-status.md`、本任务书全文、spec §14.48、研究总文档 §1/§7.69/§7.70/§11。
3. `D:/skill优化/project_handoff.md`、`D:/skill优化/project_communication.md` 的当前恢复记录；无需通读全部历史日志。
4. BH `summary.json`、`accounting.json`、`authoring/automatic-program.json` 及相关首答/确认评阅；大原件只按工具名、阶段和调用定位读取。
5. 下表涉及的实际实现与测试。旧 BH 任务书只读增量顺序、作者隔离和成本合同相关段落。

| 责任 | 已有代码/文件 |
|---|---|
| 草稿、revision、patch | `src/task-dsl/authorization/resource-program-draft.ts` 与相应测试 |
| 有限资源计算、顺序与屏障 | `src/task-dsl/authorization/resource-relations.ts`、`executable-contract.ts` 与相应测试 |
| 当前活动/候选、导入与恢复 | `src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts` |
| 作者与消费者实际上下文 | `src/benchmarks/authorization-dsl/inquiry-native.ts`、`inquiry-run.ts`、`question-workflow-wire.ts` |
| compact/full与按需详情 | `src/task-dsl/authorization/program-consumption-context.ts` |
| 普通会话与归档 | `src/benchmarks/authorization-dsl/inquiry-local.ts`、`executable-contract-entrypoints.test.ts` |
| 可运行例 | `examples/authorization-assessment/download-workflow/run.ps1`、`README.md`、`inputs/`；ShareLink例仅离线 |
| 研究执行器参考 | BH `study.ts`、`offline-cases.ts`、`summarize.ts`、`tsconfig.json`；新运行写入BI目录 |

当前开发线程是代码、共享方法文档和Git唯一写者。继续 `skill-ir-aot`，只推用户 origin，不创建新分支/worktree。探子只做边界清楚的只读核验，按AGENTS执行；设计、改代码、最终裁决由主线程负责。其他线程既有修改保留，新增非本任务差异先辨认归属。

## 三、实现合同

### 3.1 作者状态与自然结束

- `programMode=edit` 在任何消费视图下始终保留编写目标。出现局部活动程序后仍显示：当前草稿/活动revision、实际已执行输出、未覆盖问题、数据/控制缺口、可继续使用的编辑工具。
- 复用既有问题和缺口数据形成薄的 authoring progress；如需提取共享模块，可新增 `src/task-dsl/authorization/program-authoring-context.ts`。不要再建设一套独立任务状态机或每轮大账本。
- “current”只表示当前来源/输入下的版本关系；“computed”只表示执行过。都不能自动转成“作者完成”或“语义正确”。
- 作者可交付 partial 程序与自然答案。若还有可处理的主链缺口，反馈明确下一步应继续编写；模型最终选择带缺口结束时保存原因和预算。不得强迫无限循环直到 full，也不得悄悄改成 consume。
- 宿主只提出问题、展示机械错误和可访问源码。禁止把评价侧的正确资源ID、分支答案、开发者程序或历史修复文字灌给隔离作者。输出需要哪些描述字段可作为任务合同；这些字段的正确值和选择逻辑由模型读源码获得。
- final 交付与 program draft 保存分开：即使自然答先结束，也保存模型原稿、最新有效部分和尚未采用的候选；不能用自然答案替代程序关系。

### 3.2 显式有序 patch

在已有 patch 上增加可选 `stepOrder: string[]`，表示 upsert/remove 后**全部剩余步骤ID的明确排列**。这是本轮选择的最小兼容设计：不重新提交表达式，不猜测控制顺序，也不新增另一套编辑语言。

```json
{
  "baseRevision": "current-draft-revision",
  "upsertSteps": [{"id": "permission", "op": "guard", "test": {"op": "eq", "left": {"literal": 1}, "right": {"literal": 2}}, "failure": "denied", "source": {"path": "fixture.py", "startLine": 1}}],
  "stepOrder": ["value", "permission", "result"]
}
```

此片段展示匿名fixture中的编辑；运行时使用详情工具返回的当前revision，并由红测建立fixture.py对应来源。它不包含真实任务答案，也不是可以直接提交到Download的程序。

- `stepOrder` 长度沿用128步上限；必须是合并后ID的精确排列。重复、缺项、未知ID、removed ID、过期revision均拒绝整个patch，原稿/活动结果不变。
- 缺省 `stepOrder` 维持BH原位替换/新步追加兼容性。新增步骤落在无条件return后时必须给出可操作的不可达诊断；保留既有return行为，不自动把步骤搬到前面。
- 不通过拓扑排序擅自移动guard/return，不删除坏控制来求成功，不让错误排序应用一半。
- 草稿序列、编译序列、真实执行事件与保存/恢复后序列一致。修改已有值、移动guard、删除值导致引用失效，各自产生准确影响。
- 暂不增加插入/移动/排序三套并存接口；若实测完整ID排列存在明确摩擦，再在本任务内解释并更新合同，不做无证据扩展。

### 3.3 任务完整性与消费上下文

- compact保留当前程序规则、实际事件、来源定位、前提、具名缺口和全部原问题；同时提供当前阶段、剩余问题、已读证据索引及必要源码窗口/可调用详情入口。
- 内容可以紧凑表达、按当前revision去重；不因“有程序”便把程序之外的框架权限、路径、返回行为和条件解释从任务里消失。
- source候选只是定位线索，已读只是阅读记录，程序输出只是计算结果。投影不得把它们自动升级为已验证语义覆盖。
- 按需工具必须实际返回同revision内容，支持问题/步骤/来源定位；过期引用有明确反馈。不要要求用户手工打开巨大JSON才能继续运行。
- 比较full/compact时同时核对**完整待办事实与规则是否保留**和真实发送量；如果选择了不同材料，报告这是上下文选择策略变化，不把效果全归为JSON变短。
- 普通CLI默认保持兼容。Download示例脚本当前默认compact，先改为full；compact仍可显式使用。只有本轮同条件质量保持证据成立后才另记是否推荐compact，不自动升级项目全局默认。

### 3.4 来源、复用与允许放宽

保留渐进执行：不要求整个旧性质层 checked 才能运行资源程序、保存结果或自然交付。每个computed/denied/unknown输出显示来源和剩余假设。缺无关说明可继续，缺决定性guard/对象关系则只影响相关输出。

已有开发者25步程序继续作为普通可用示例和独立消费对照；自动作者看不到它。作者产物可比参考程序少或多，不以25步/固定算子数量验收。验收的是关系和变化行为。运行同程序的场景期望保留在评价侧，不能用expected值回填程序。

来源变化、输入变化、草稿变化分别触发已有失效和重算机制；previous只恢复合格当前材料/草稿，不恢复旧答案或评价。ShareLink与OWUI历史未知继续封存，本轮ShareLink只用于零模型共享机制检验。

## 四、约12小时主队列

下列时间是工作量分配，不是保证的墙钟时长。阶段有行动结果即可推进，不等待用户逐项确认。按BI12尽早跑一次真实作者，避免把全部时间耗在离线工程后才发现实际接口仍不好用。

| 阶段 | 预计投入 | 重点 |
|---|---:|---|
| BI0–BI2 | 0.75h | 接管、原始失败定位、共享红测 |
| BI3–BI7 | 3h | 作者模式、有序patch、候选/活动与真实入口 |
| BI8–BI11 | 2h | 剩余职责、compact、保存恢复、有限fixture |
| BI12–BI16 | 3.5h | 真实自动作者、现场修复、同包变化与同期消费比较 |
| BI17–BI21 | 1.75h | 第二任务离线检验、问题驱动补强、评价与文档 |
| BI22–BI23 | 1h | 必要联合验证、可用交付、提交推送 |

### BI0 — 接管与可恢复状态

以下勾选记录实施与核验动作已经执行，不表示每项研究效果达标。自动主链和稳定收益的未达依据见本书状态、BI summary/acceptance及逐题评阅。

- [x] 核对分支、HEAD、diff、origin；不重复历史全量审计。
- [x] 建立BI `status.json`、`attempts.json` 和实际接管记录；将验收目标与实测状态分开，未测值为null/not-run，不预填true。
- [x] 保存BH首稿/首配对/确认的定位路径；不复制整套历史结果。

### BI1 — 三个问题的可复现证据

- [x] 定点读取BH A1的三次program调用、最终原稿与最后预算，记录首次从作者转成消费者指导的实际发送上下文。
- [x] 在匿名程序中复现“新guard追加到return之后”及“return引用新追加值”的行为。
- [x] 对同一报告比较full与compact的阶段、问题、来源窗口/索引、规则和详情入口；列出确定遗漏和待验证因果，不将所有质量差异归到一个分支。

### BI2 — 先写能抓住真实问题的失败测试

新增/扩展相关测试，至少覆盖以下行为；先红后绿，失败原因记录到BI verification：

- [x] edit + compact + 已有partial活动程序仍要求补编写，consume不收到作者指令。
- [x] value→return后补guard，经显式stepOrder变为value→guard→return；false guard使return不执行。
- [x] 新value被排到return前后分别得到计算结果/具名缺口；无隐式排序。
- [x] order漏项/重复/未知/删除冲突、过期revision原子拒绝，原稿及活动版本不变。
- [x] 三个原问题没有绑定到程序时仍在compact，来源线索可实际打开；当前执行未走到的分支规则保留。
- [x] raw draft、candidate preview、active program三者不同的情况下，恢复不会拿错版本继续patch。

匿名fixture不使用真实项目名、不复制Download答案，测试需验证实际事件/返回/拒绝行为，不只比较提示字符串。

### BI3 — 作者进度的共享投影

- [x] 从既有问题、草稿、活动执行和诊断形成有界authoring context；没有依据的覆盖状态保留unknown。
- [x] 明确当前模式和下一项机械动作；缺语义时提出需要读源码的问题，不给正确答案。
- [x] 避免每轮重复整份草稿；显示revision、改变内容和未完成部分，详情工具可取全稿。

### BI4 — 原子有序编辑

- [x] 实现stepOrder验证与应用；复用原编译器重算，不创建另一份排序求值器。
- [x] 旧patch行为保持；新增不可达步骤反馈包含step ID和终止点。
- [x] 把红测中的guard真实执行、失败停止、引用重算做绿。

### BI5 — 无效候选与局部有效稿的继续修复

- [x] 验证对当前raw draft修复不会误以旧active revision为基准。
- [x] 错序/坏表达式的候选保留供修复，旧可用结果与新预览分开标明。
- [x] 省略workflow仍保留、显式删除才删除；修source不丢步骤，修步骤不偷偷重用旧source结果。

### BI6 — native与结构化provider共核接线

- [x] native accountContext先按edit/consume分流，再按full/compact投影；edit不在首个可运行结果出现后降为consume。
- [x] `question-workflow-wire.ts`提供简短、与当前schema一致的patch/order用法；通用例不含真实答案。
- [x] `inquiry-run.ts`使用同一模式与编辑语义；用mock实际工具回合验证program→patch→details→最终结果，不能只测直接函数。

### BI7 — 普通author/patch/run/inspect走通

- [x] 从普通入口导入故意不完整的匿名草稿，在当前会话修补并执行；保存后重新打开，继续patch和inspect。
- [x] Download `run.ps1`默认full，author明确输出草稿/程序/执行过程位置和未达职责，consume保持只读。
- [x] 用确定性命令先看到一条完整的“提交→诊断→修稿→采用→执行→保存”轨迹。

### BI8 — 原问题与剩余工作的保真表达

- [x] 复用问题ID及已有source/diagnostic索引建立每题的computed部分、模型仍需判断部分、缺口；无手写成功标签。
- [x] computed只能覆盖实际产生的字段和关系；只返回两个ID时，文件/表示仍是待办。
- [x] 来源线索丢失、引用过期、无可读窗口均有可操作反馈；不会因为相同文本出现就判同一来源。

### BI9 — compact消费保留质量所需信息

- [x] 保留当前有效规则及未走到的备选分支、完整原问题、阶段与剩余职责，以及决定性来源的索引/必要窗口。
- [x] 按revision减少重复协议和大历史；详情工具读取计入真实调用/字节，不能把转移到工具里的成本当作消失。
- [x] full路径不变；投影差异有字段级验证。输入集合是否省略根据实际依赖和可取回性处理，禁止删掉任务所需事实。

### BI10 — 保存、变化和恢复的实际接线

- [x] 同raw draft保存恢复后order/revision一致；拒绝过期patch不会污染下一次有效patch。
- [x] 同程序输入version变化重算，previous不带旧自然答案；source副本变化撤回有关结果，无关独立部分继续。
- [x] 检查中断后可恢复状态：原稿、活动程序、待办、已完成请求均有明确位置；不为归档重跑模型。

### BI11 — 离线验证面与实验准备

- [x] 运行已有Download八变体及ShareLink六变体；只在新缺陷需要时增加错误排序、空/缺值、source变化等具名变体。
- [x] 编写BI研究执行器和独立评价输入。沿用BH普通入口，不拷贝其“所有A/C都compact”的隐含设置。
- [x] 固定以下真实队列、共同预算和输入隔离，登记代码epoch。确定性验证通过即可进入BI12，不等待全历史回归。

### BI12 — A1：真实隔离作者尽早运行

- [x] 原完整skill、原四问、允许源码、root-default任务事实、通用工具例进入作者；不提供开发者program、历史答案、评阅或定向正确分支提示。
- [x] 使用普通edit入口、full上下文。保持真实工具提案、patch、发送上下文、结果和最终自然答案。
- [x] 逐项查明哪些输出真由程序算出，哪些只存在于自然答；不要按步骤数判成功。

### BI13 — 现场修复与A2恢复

- [x] A1失败或遗漏后先读实际原件：是模式/信息/顺序/工具错误，还是模型语义未补全。
- [x] 明确共享缺陷就立即红测→修复→绿测，停止继续派发受同缺陷影响的位置；模型语义缺口只给已有诊断/源码和通用支持，不由主代理填答案。
- [x] A1留下不完整草稿时，A2从其自己保存的会话恢复编写；独立记为恢复/修订，不能当第二次独立成功。A1已完成则A2零调用转离线恢复测试。
- [x] 同根因两次无进展，转本地设计诊断或具名剩余边界；其他任务继续。工程修复不受任意全局“一次修复”配额限制。

### BI14 — C1/C2：冻结自动原稿后实际消费

- [x] 在看到消费者答案前选择A1或具名A2的最新原字节，固定同一程序用于C1 root-default及C2 empty-version；不得分别挑更有利稿件。
- [x] C1/C2均走普通consume/full入口；C2可带C1 previous，但不得编辑程序，也不得恢复旧答案。
- [x] 有局部资源程序就带缺口运行，不因性质unknown全盘阻断；没有可执行程序则C具名零调用结束，P队列照常。
- [x] 独立检查请求对象、授权对象、最终文件与表示的实际事件。变化只在自然答出现而程序未计算，记“自然解释完成，自动主链未完成”。

### BI15 — 两组固定材料full/compact对照

- [x] 使用同一个现有开发者program固定材料，避免作者失败把消费工程一起卡住。结果与自动轨分别记账。
- [x] root-default按full→compact，empty-version按compact→full各一次；同一组保持代码epoch、原skill、原四问、程序、输入、来源、模型、预算和修复机会一致。
- [x] 首个共享缺陷立即修，不要求继续跑坏位置；已运行的一臂保留为旧epoch，必要时在新epoch重新登记该对的两个臂，旧成本计入开发修复，不拿跨版本件凑配对。
- [x] 对照回答是否保留完整条件、反事实和作用对象；只比最终ID正确不够。保留失败及修复确认，不反复重抽追胜。

### BI16 — 成本、语义与调用原因一起判断

- [x] 原四题逐题评阅，完整回答的必要条件从独立源码/用户政策导出；机器computed、source-supported、自然答案full分别报告。
- [x] 核对读源码是否用于剩余任务、确认来源还是重复取回已提供内容。不能把必要核对全部算浪费。
- [x] 记录完整input（含cache一次）、output、工具、发送字节、耗时；author/consume/修复分账。USD/隐藏/开发代理/真人时间未知保留。
- [x] 结论可为improvement/tradeoff/no-observed-difference/negative/inconclusive。两对支持开发观察，不宣称稳定跨任务收益；若质量下降，compact继续显式使用。

### BI17 — 第二任务的共享机制检验

- [x] 在现有ShareLink离线例上执行同一patch/排序/保存恢复/缺口投影机制，覆盖允许、拒绝及缺授权事实；不增加任何模型请求。
- [x] 验证程序域的共享对象/资源/guard/return逻辑，禁止按任务名修投影或生成固定答案。
- [x] 结果明确标开发者离线程序，不能当自动作者迁移成功或第二个独立skill效果样本。

### BI18 — 自动稿主链的可用交付

- [x] 提供一条普通命令读取自动原稿并显示execution.md、JSON结果和剩余职责；未完成时同样能看到实际采用的局部内容。
- [x] 明确developer-reference与model-authored两条路径，默认展示不能偷偷换回参考程序。
- [x] 对版本选择、非owner授权、root回退及文件/表示关系逐项说明：自动实现/自然解释/未完成，以及相应证据位置。

### BI19 — 生产接口收敛

- [x] 清理本轮造成的重复context/patch解析；归并到现有公共模块，不重构无关历史系统。
- [x] 检查错误分类能让使用者知道是草稿语法、顺序、source失效、领域缺口或通道失败；保留已有消费者兼容。
- [x] 检查run.ps1参数、CLI帮助和真实工具schema一致；无不生效的开关和只在研究runner有效的接线。

### BI20 — 依据实际失败完成补强

- [x] 从下节补充队列按未覆盖且最有价值的责任继续开发，优先处理中断恢复、详情可取和作者上下文的实际问题。
- [x] 每项留下确定性反例、生产修复或明确无需修改的依据；不是新增一批同义测试充数量。
- [x] 若主链成功，优先完善同稿修改/搬移及第二任务离线复用；若失败，优先解释失败位置并修共享接口，不转做报告装饰。

### BI21 — 唯一研究正文与普通说明

- [x] 更新研究§1/§7.70/§11、spec§14.48、current-status和当前计划；开发中发现/解决的问题按因果简记到§7.70。
- [x] 更新已有usage/developer-guide及例子README；不新增长期组件文档，不扩散新的“最终报告md”到docs/skill-ir。
- [x] results中保留summary、acceptance、accounting、attempts、逐题评阅、自动稿及可读执行过程。用量未知值不填0。

### BI22 — 一次必要联合验证

- [x] 改动相关红绿/主类型/BI研究类型/普通入口场景通过后，运行一次受影响授权联合回归；后续只因新改动扩大验证。
- [x] 文档单测、当前改动的链接/锚点与diff检查；不重跑全历史或为通过而修改旧锁/104项历史失败。
- [x] 复核归档的真实采用、原稿来源、同程序变化、配对条件和费用分轴；无需再建多层摘要/归档锁。

### BI23 — 发布与明确交付

- [x] 聚焦提交本轮实现/测试/方法/证据，推用户origin并核对live HEAD；保留其他线程差异及历史材料。
- [x] 最终先给可运行的自动稿命令和实际结果，再给四轴状态：工程、自动主链、完整原任务质量、成本收益。每个未达项写具体模块/缺口和下一责任。
- [x] 同步本地handoff/communication/conversation_log。只有全部必需交付实际达成才能说研究目标完成；有限队列结束可如实为completed-with-unmet-criteria。

## 五、提前完成或通道暂停时的实质补充队列

不因模型暂不可用就结束开发，也不等待账号恢复凑时长。按顺序处理确有缺口的项目；已被主线证明的项不重复做。补充队列不授权新增付费面板或读取保护样本。

1. **恢复与revision矩阵：** 程序已采用但草稿更晚、patch被拒后恢复、source已变化、旧详情请求、输出目录搬移；修真实状态错配。
2. **多次有序编辑：** 插入guard后再次增值/删除依赖/替换return、不可达步骤诊断消除；保持原子性与旧patch兼容。
3. **两种工具入口一致：** native和结构化provider的同操作顺序、候选预览和上下文mode一致；用真实mock回合，不复制大量快照断言。
4. **发送计量核验：** 对已归档BH/BI消息按实际payload定位重复状态与source字节，核对accountSent分类是否遗漏；若有记账缺陷修生产计量，历史只追加派生更正。
5. **当前例子的可搬移性：** 从新普通输出目录恢复自动稿和源身份、实际运行变化输入；保留失败不删用户材料，不创建Git worktree。
6. **共享表达的最小补充：** 仅当两个已暴露任务共同缺同一种现有表达能力时扩有限算子或工具帮助；先给两个反例，再改共有实现。禁止为了凑12小时扩语言语义。

主队列及适用补充项完成后即收束，报告实际用时；不承诺持续活跃恰好12小时。若平台中断，在status写清最后完成步骤、未完成代码与下一条具体命令，恢复后接着执行。

## 六、有限真实队列与模型隔离

| 位置 | 输入与产物 | 模式 | 目的 |
|---|---|---|---|
| A1 | 完整原skill+root-default+允许源码，无给定程序 | edit/full | 独立自动编写首件 |
| A2 | 仅A1自己的草稿/来源材料；仅A1未完成时派发 | edit/full、恢复 | 验证真实修稿与继续编写 |
| C1 | 固定A轨自动原字节+root-default | consume/full | 自动程序实际原任务消费 |
| C2 | 与C1同程序+empty-version | consume/full、可previous | 单输入变化实际重算 |
| P0-full | 现有开发者program+root-default | consume/full | 固定材料首对第一臂 |
| P0-compact | 与P0-full完全同条件 | consume/compact | 首对第二臂 |
| P1-compact | 同开发者program+empty-version | consume/compact | 变化输入反序对第一臂 |
| P1-full | 与P1-compact完全同条件 | consume/full | 反序对第二臂 |

A2条件不满足、C缺程序、通道关闭均登记具体原因和0派发，不虚构完成。此表是计划位置而非成功目标；最多8个首位置，不为填满而派发。发现新的共享缺陷可登记具名修复确认；同根因无改善不反复重抽。不得给只修提示的第三稿换名当新独立作者。

共同默认执行预算沿BH：64个工具单位、源码读取33554432字节、显示786432字节、45分钟会话上限。这是可调整运行参数，不是质量结论的硬门槛。若原件证明实际被预算截断，可记录理由调整，并同步同配对两臂；不能用无限预算掩盖重复协议。费用记录每次实际回执，cache包含于input时不重复相加。

原件入口：

- 完整原skill：`results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md`及其伴随资源。
- 当前允许源码：`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/source/`，原ref `126ec414a8b65158368653a2604ae58415e43103`；使用已有input中的scope解析，不扩大源码范围。
- 输入：`examples/authorization-assessment/download-workflow/inputs/root-default.json`、`empty-version.json`及其他已暴露离线变体。
- 固定材料对照：`examples/authorization-assessment/download-workflow/program.json`。它、BH自动稿/答案/评阅及scenario expected均隔离在A1之外。
- 账号边界：`results/skill-ir/skill-dsl-research/development/authorization-executable-contract-v1/account-boundary.json`，只读取非凭据运行合同，不回显凭据。

原四问ID保持：`requested-document-and-returned-file`、`authorization-and-selection-order`、`alternate-version-authorized-resource`、`missing-facts-and-conditional-conclusions`。所有质量件保留四问；局部程序成功和整题完整分别计数。

通道规则：官方账号授权无需重问，第三方API保持暂停。明确routing失败允许一次具名恢复，连续两次或累计三次恢复仍失败暂停本轮外部派发；quota/auth立即暂停。未知完成只核查原生命周期，不自动重发。旧OWUI/ShareLink未知不解除。模型停用时继续确定性实现、历史原件派生分析与文档，不转用未经授权的付费通道。

## 七、关键验证命令与验收方式

在 `D:/skill优化/SkVM` 执行，路径前保留 `./`，避免Bun将其当不匹配的过滤器：

```powershell
bun test ./src/task-dsl/authorization/resource-program-draft.test.ts ./src/task-dsl/authorization/resource-relations.test.ts ./src/task-dsl/authorization/program-consumption-context.test.ts ./src/task-dsl/authorization/executable-contract.test.ts ./src/benchmarks/authorization-dsl/executable-contract-entrypoints.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
git diff --check
```

新增共享authoring模块时为其补实际行为测试并加入上述集合；研究类型配置复用BH结构，在BI目录创建后运行：

```powershell
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/tsconfig.json
& './examples/authorization-assessment/download-workflow/run.ps1' -Mode zero -Variant root-default
& './examples/authorization-assessment/download-workflow/run.ps1' -Mode zero -Variant empty-version
```

第二组命令使用已有开发者示例，只验证旧可用链没有退化；自动稿的公开命令由BI18针对真实产物写明，不能拿这两条当自动作者验收。真实模型通过BI研究执行器调用普通入口，每次记录确切命令、输入与输出路径。

| 轴 | 成功需要的证据 | 未达时照样交付什么 |
|---|---|---|
| 共享工程 | edit持续、排序原子、普通工具采用、恢复与详情实际通过 | 具体失败反例与剩余模块 |
| 自动主链 | 无参考程序的模型稿计算授权对象、最终文件及表示；原/变同稿真实重算 | 局部程序、未实现关系、自然补答部分 |
| 完整任务 | 独立源码逐题评阅原四问，条件/对象/返回正确且不超证据 | 每题缺口，不用单个computed冒充full |
| 消费改进 | 同期同条件质量保持，实际token/工具/耗时有可解释变化 | tradeoff/negative/inconclusive，默认不升 |
| 可维护交付 | 公共入口、文档、有限验证、原件、origin同步 | 归档未达责任，方便下一轮继续 |

这里要求争取完整可用成果，不预先保证正向实验。遇到限制先判断是否只是工程摩擦；可以让局部结果先执行和交付，但不能补造来源、删除原问题或把unknown改成许可来换通过。
