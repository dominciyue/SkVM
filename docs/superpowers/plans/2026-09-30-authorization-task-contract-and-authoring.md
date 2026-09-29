# AN0–AN16：当前任务合同、领域声明展开与一致回答

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐项执行。一个开发任务负责代码、共享文档、实验和发布；子代理仅按 AGENTS 做明确边界的只读探索与核验。用户已授权连续推进，常规检查点记录后继续，无须再次确认。

**Goal:** 让作者围绕当前授权任务表达政策、场景和条件，由程序展开重复结构与引用；让模型只接收一套适用的输出要求，并交付与源码行为、声明政策一致的回答。

**Architecture:** 保留 authoring/v2、analysisContract/v1、wire/v6、现有局部编辑和材料复用。增加窄领域作者前端和显式当前任务快照，编译到已有 v2；统一领域要求与输出协议的渲染边界，用已有宿主比较生成政策摘要，原始模型解释及矛盾继续留存。

**Tech Stack:** TypeScript、Bun、Zod、现有 authorization CLI、renderer/normalizer、provider/telemetry 与文档工具。复用现有 compose、workspace 和 local-edit，不另建 CLI 平台或统一 IR。

---

## 1. 执行范围与恢复

- 日期：2026-09-30；初始状态：`planned-not-started`。
- 基线：`af6a2cd0b823d771828308248fb274e0539d8019`；AN0记录规划提交之后的实际启动 HEAD。
- 分支：`skill-ir-aot`，唯一发布目标为用户 `origin/skill-ir-aot`。不开新分支，不写 upstream，不清理历史 raw/cache/未跟踪材料。
- 开发任务：`gpt-6-sol / max`；被测 provider 沿用 `xty/gpt-5.6-sol`，真实配置逐请求记录。
- 新结果根：`results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/`，AN0开始时创建status/journal。
- 研究总文档持续维护[§7.33](../../skill-ir/skill-dsl-research.md#733-an-当前任务合同与领域声明展开)，不另造分散的研究报告。当前入口为[current-status](../../skill-ir/current-status.md)。
- 质量约60%、编写和复用约40%，两组结论分别报告。网络、认证gh及必要付费调用已授权，无用户美元上限；执行本书有目的的规模，不按分数反复抽样。
- 继续当前单repo/ref、显式入口/政策和允许源码的任务类。复用公开development材料；不读新held-out/Q1/prospective、不执行目标、不扩大源码发现范围或做HTML层。
- 连续完成AN0–AN16后交付；未完成工程不能以实验negative结算为全部完成。确有外部阻塞的子流记清原因，继续其余可做工作。不等待、重复审计或追加无关任务凑时长。

**必读顺序：** 根/仓库AGENTS → 当前状态 → 本书 → spec第14.34节及文末AN合同 → 研究§7.32–7.33与相关当前方法 → usage/developer-guide。AM任务书与结果只作已关闭历史。跨线程恢复时读根conversation_log的2026-09-30 AM父任务复核；需要durable决定再读handoff/communication。

## 2. 已确认问题与研究假设

父任务确认AM最终头与origin一致、工作区干净；分组回归459 pass/1平台skip、3013断言，另补研究计数测试2/2、12断言；typecheck和零provider评价重放通过。

### 2.1 旧输出指令仍进入v6实际提示

AM q06、q08、q16的真实`run.json`提示同时包含：

```text
Required analysis: return source_supported_failure, source_refuted, or unknown ...
Result contract: Do not output conclusion ... return decision {kind:"observed", ...}
```

对应Markdown材料提示没有旧返回标签要求。`render.ts::collectFacts`保留requiredAnalysis，v6渲染仅删除allowedConclusions，旧输出要求仍随任务进入。三条错误中源码decision与宿主映射正确，自由文本却称source_supported_failure，和accepted deny expectation矛盾。提示冲突是已观察事实，是否解释全部错误尚待本轮受控比较。不要先声称DSL表达本身导致错误，也不要删掉错误文字后计成功。

### 2.2 原任务作者同时拿到未来政策

AM `authors.ts:114`将整个brief用于original稿，包含originalPolicy/changedPolicy、originalExpectations/changedExpectations和changeRequest。Memos唯一修订恰好采用未来政策，原任务语义失效。当前任务与将来的变更应分别组织；修类型/引用时不让整个领域声明被自由重写。

### 2.3 作者还在重复构造运行结构

两份DSL原稿都把atEntry写成boolean；Paperless修订又用自然语言说明代替condition key。AM的宿主生成主要覆盖元数据，scenarios、premises、branches与引用仍由模型重复填写。最终guide补充是在生成结束之后，尚无真实效果证据。已有v2 lowerer会生成canonical IDs，本轮复用它，重点减少上游重复结构和显式跨层引用。

### 2.4 研究入口错误已经修过，下一轮需在派发前覆盖真实参数组合

AM四条入口阻塞源于研究runner错误instructionOrigin，零provider；后来按普通independent-author入口修复并单列4/4结果。AN不能复用错误参数，也不必重建一套研究运行平台。生成前对本轮全部行的实际入口参数做一次零付费检查。

**本轮假设：** 当前任务隔离和机械展开可减少作者错版/错引用；统一输出要求与宿主政策摘要可减少正确源码判断后的解释反转。二者都要在真实普通消费中验证，代码通过不预填正向结论。

## 3. 设计合同

### 3.1 当前任务快照与变更分离

共享生产模块表达两个职责：当前任务快照与显式change-set。

- 当前快照只含现在要执行的policy、expectations、premises、来源及要求；没有未来的changedPolicy或changeRequest。
- 请求变更时提供旧快照和具名变更，只生成新快照及差异；原快照不修改。
- 作者首稿/修订使用同一当前快照。诊断修订只接收本稿、相关诊断和允许修订字段；政策与期待已给定时保持不变。
- 字段缺失或自然语言歧义保留needs-input；不从源码反推出规范政策、补owner非空前提或自行接受未确认的政策。
- 快照与change-set是普通产品接口，不把AM的packageId、项目名、未来版本命名写入成功分支。
- 转换研究brief只做公开字段映射，输出当前快照供两种表示和全部作者路线共用；旧原文和映射来源可查。

### 3.2 窄领域作者前端，编译到现有v2

新增可选`authorization-task-authoring/v1`前端，用嵌套的case表达“谁、对什么、做什么、期望是什么、在什么入口/前提下、需要哪些分支”。只处理当前任务，不要求作者同时填scenarios和analysisContract的重复结构。

建议形状如下，AN1亲读代码后固定精确schema；示例为合成任务，不是研究答案：

```json
{
  "schemaVersion": "authorization-task-authoring/v1",
  "policy": {
    "text": "Only a record owner may update that record.",
    "location": "task requirement",
    "revision": "current",
    "acceptance": "accepted",
    "reason": "Explicit requirement supplied by the task author."
  },
  "cases": [{
    "name": "other-user",
    "entry": "update-record",
    "principal": {"role": "authenticated member"},
    "resource": {"type": "record"},
    "relation": "not-owner",
    "operation": "update",
    "expectation": "deny",
    "boundary": "declared-entry",
    "premises": [{"name": "ownership", "statement": "The caller is not the record owner."}],
    "conditions": {"owner-present": {"basis": "Whether the record has an owner."}},
    "branches": [
      {"name": "absent", "assumptions": {"owner-present": false}},
      {"name": "present", "assumptions": {"owner-present": true}}
    ],
    "responseDetails": ["Explain the decisive source control and both requested branches."]
  }]
}
```

上下文沿AM context提供repo/ref/sourceRoot/taskId/request/入口。一个case显式绑定一个入口，宿主由该作用域生成premise.atEntry、同场景condition引用、canonical映射和branch IDs。多入口需求使用多个显式case或保留原v2能力；不猜唯一入口、不自动做条件笛卡尔积。

conditions只声明一次、branches引用同一作用域里的名称；名称可由作者选择，评审依据语义和有效引用，不能以隐藏的固定owner-present键拒绝等价声明。非法名称、引用、重复case和冲突赋值在模型分析前给准确路径。

编译器复用lowerAuthorizationAuthoringV2、既有normalizer和来源校验。输出普通v2和字段来源映射，区分user-explicit/model-authored/host-derived。名称重排不改变语义，编译不读取evaluator或源码答案。

已作为结构化输入明确给出的政策/前提可以由宿主复制。把自然语言brief转成结构化事实仍需作者/模型，不能伪称全部是宿主推导。对完整输入可零模型编译；缺领域字段的草稿保持needs-input。

普通接线建议扩展现有`authorization init --context=<context> --task=<task-authoring.json> --out=<assessment.json>`；省略task保持AM草稿。输出字段来源sidecar及已知entry seed，发布前沿普通check。变更沿现有edit/compose，不新建第二套变更引擎；通过字段来源映射将具名任务变更编成local-edit或重新编译新快照，原/变case身份稳定。AN1在本书写定真实命令，再开始实现。

### 3.3 有界修订代替整稿自由重写

模型可以提出缺字段内容或具名修订，宿主校验范围并合并。只修类型/引用时，已确认policy/expectation/premise不会被附带修改。明确的领域变更走change-set，和纠错分开。

既有local-edit只接受已有效v2，不能直接拿它修非法草稿。先实现作用于作者草稿的窄修订服务：只允许已登记字段路径、保留未知/未修复字段、合并后重新走schema/normalizer；原候选与修订原文存档。不要新增任意对象路径写入工具或自动忽略非法字段。

用户已提供的结构化事实可直接恢复；从自然语言推断的值由模型提出并记录。语义修订不得伪装成纯格式修复。一次诊断机会后仍无效，原实验行保留失败。

### 3.4 输出协议只有一个权威来源

领域义务与机器返回格式分别组织。新可选合同模式建议为`--task-contract=current-v1`，只先支持plain/explicit-v1/wire=v6；省略时原路径兼容。该模式同时适用于Markdown/DSL，进入session身份和compare依赖。AN1固定参数名后更新普通help与文档。

- 识别项目自身已知的旧输出格式要求，按来源/版本迁移到协议层；记录迁移项和原文，原输入文件不改。
- 保留所有领域问题、前提、政策和source数据；禁止对全部字符串全局删除旧标签，禁止改写引用的源码、示例数据或未知自定义义务。
- 对不能可靠拆分的自定义格式冲突给出具体诊断及当前合同优先级，不猜用户的领域意思。
- 实际provider prompt中的有效指令只有当前返回协议；不能只是模板单测通过，实际请求仍夹带旧要求。
- 原要求和编译后的有效要求都可查看。模型输出的源码行为、条件判断、证据及未知责任继续保留，不用“统一合同”减少任务分母。

### 3.5 源码解释与宿主政策摘要

复用conclusionFromObservedDecision，针对明确allow/deny expectation生成自然可读的“声明要求／源码行为／政策是否满足”摘要。模型解释聚焦为何出现该源码行为及证据；conditional expectation继续保留模型条件推理和请求分支。

原始解释原样保存并展示归属。明确相反的机器标签或结构化政策断言可产生具名矛盾诊断；一般自然语言矛盾仍由语义评价识别，不把正则当通用语义checker。普通展示不能用宿主摘要遮盖错误解释。

生成前优先减少矛盾要求。若将矛盾诊断接入已有一次repair，计入原repair上限并保留首答，不增加第二轮自评调用。分别评价raw answer和最终交付；不能靠删除错误文字或改变评分规则得到正向结论。

## 4. 文件与职责

| 职责 | 实现位置 | 验证位置 |
|---|---|---|
| 当前任务/作者前端/展开 | 新`src/benchmarks/authorization-dsl/authoring-task.ts`，复用`authoring-v2.ts`、`authoring-assist.ts` | 新`authoring-task.test.ts`、现有authoring tests |
| 草稿局部修订 | `authoring-assist.ts`或独立小模块`authoring-draft-repair.ts`，已有local-edit保持有效v2职责 | 对应聚焦tests |
| 普通init/edit/compose | `src/cli/authorization.ts`、`authorization-edit.ts`及必要的compose接线 | 对应CLI tests，新增`authorization-an.test.ts` |
| 当前有效输出合同 | 新`src/task-dsl/authorization/task-contract.ts`、`render.ts`、必要的local-run选项/身份 | 新`task-contract.test.ts`、render/local-run tests |
| 政策摘要和矛盾记录 | `outcome-result.ts`、`local-run.ts`及现有inspect输出 | outcome-result/local-run/CLI tests |
| 研究生成/评价 | 新结果根`study.ts`、`authors.ts`、`evaluate.ts`、`study.test.ts`、`tsconfig.json` | 零provider check/replay，实际全部入口参数检查 |
| 例子和文档 | 现有`examples/authorization-assessment/editor-support/`、`task-semantics/`、usage/developer-guide、研究§7.33 | example tests及一次仓外复制 |

新模块先检查现有职责，有等价实现则复用。编译器与普通指南进入生产模块，研究runner负责登记、调用和存档；不得把实验专用字段提示或源码答案藏进生产实现。

## 5. 研究安排与成本

### 5.1 固定材料，16个质量session

复用AM四项已发布的新材料：owui-file、paperless-download、memos-get-shared、paperless-share-create。源文件、gap元数据、公开政策、前提和分支保持，主质量阶段不再调用定位模型重新准备。

四任务×Markdown/DSL×旧兼容合同/当前统一合同，共16个fresh session。四臂都用当前同一分析实现、同provider、plain/explicit-v1/wire=v6，修复机会相同；只改变登记的合同编排。新模式的宿主摘要是派生展示，不作为独立模型作答。按任务交错顺序，保存实际发出的prompt及字段差异。

新模式对已知旧格式要求的处理对两表示一视同仁。Markdown原本无冲突也保留在面板里；不人为添加冲突。新旧prompt必须有相同领域事实、义务、分支和source，允许输出协议指令差异逐项列明。

沿AM两个维度评估：answerFidelity与resolution；另列source decision正确、政策解释一致、交付完整、过度弃答、未知原因、首答/最终。原评分标准在生成前固定，评价oracle不进入任何生成输入。

### 5.2 两包三条作者路线：12稿、12次消费

固定Memos政策变更与Paperless owner前提变更。每包使用三条普通作者路线：Markdown、现有完整authoring/v2、新领域作者前端。每条路线原/变各一份，共12计划作者稿、12计划消费、24项声明义务。

- 三路线共用隔离后的当前brief。原稿不看到未来政策；改稿才看到change-set。旧v2路线也得到最新版普通字段指南，避免用已知坏提示压低基线。
- 全部已知事实、作者生成字段和宿主生成字段在派发前登记；MD宿主的运行骨架贡献也计入。新前端少写机械引用是待测机制，不通过多给答案来取胜。
- 模型每首稿最多一次具名诊断修订；新前端使用共享有界合并，旧v2沿公开普通方式，差异写明。若现有普通修订服务也改善旧v2，公平地开放给旧v2，不人为保留缺陷。
- 原稿无效则依赖的变稿/消费blocked，不手工补稿替代作者。结构有效、公开事实一致、语义等价与自然消费结果分别评价。
- 条件名/中间ID只要求合法、作用域正确和语义等价；不能以未向作者声明的内部键名评分。评价不能只字符串比对就宣布语义等价，也不能用语义判断放过引用失效。
- 两包复用AM共享author-material，通过普通reuse保留source及所有pending gaps。只改政策或前提，材料与gap不变；四个已有效MD消费的历史答案不拼入本轮。
- 每条路线原/变都fresh分析并compare旧结果，总计最多12 session、24义务。记录用户/作者需要输入的字段数、重复事实出现次数、诊断/修订次数和全阶段tokens；真人分钟未测则unknown。

### 5.3 预算、失败和一次共享修订

正常规模为16质量+12作者首稿+12消费；作者各最多一次诊断修订，分析沿已有一次mechanical/domain repair总上限。沿300秒单调用、900秒session、6000输出token；若实际项目配置不同，真实生成前统一登记，对比较路线公平。

材料复用应零provider。若旧材料缺普通复用所需元数据，先尝试从已验证原源和登记request进行确定性重建并证明同材料；确需定位调用时最多两项共享作者准备，先记录原因，不将新材料混入原定固定材料质量面板。

发现可重复共享实现bug，先确定性红例修复，原结果保留；允许一次至多8个受影响session的修订区块，具体行与选择规则在派发前登记。普通低分、预期外unknown不触发重抽。

所有失败/超时/修订保留成本。dispatch完成未知不自动重发；连续两次基础设施失败先推进离线工程，最多两次有理由的连通性检查，仍不可用则准确关闭该付费子流并继续其余交付。目的明确的小配置调整自主记录后继续，不设额外用户审批仪式。

完整prompt中cache计一次；fresh/cache/output、调用数、累计响应时间、实际墙钟和USD分别记。没有provider费用字段则unknown，宿主代理用量与真人时间不估成零。不将历史开发成本并入本轮运行节省。

## 6. AN0–AN16执行队列

每个实现任务按具名反例先红、共享实现、聚焦转绿、文档同步执行。以下新函数名为拟实施接口，AN1按实际代码固定后落入tests，不能只留下未接线示意。

### AN0 基线与状态

- [ ] 读取上下文、确认当前分支/规划提交/其他改动，建立新status/journal和逐行恢复记录。
- [ ] 定位AM四份材料、两包共享材料、三条错误原响应及两个作者失败，登记实际路径和版本；不扫描全历史。
- [ ] 记录本轮唯一写者、nextAction和完整恢复命令；禁止对已派发paid行重复执行。

### AN1 反例与接口定稿

- [ ] 用真实归档确认新旧格式指令同时存在、original brief暴露changed值、atEntry/condition错误；只读取必要的完整prompt。
- [ ] 亲读作者/compose/workspace/render/outcome代码，固定前端schema、init参数、具名修订操作、task-contract开关和来源字段；同步研究§7.33和本书。
- [ ] 以重命名的合成授权任务定义三个接口反例，不使用Memos/Paperless名称决定分支。

### AN2 当前任务投影

- [ ] 写当前/变更隔离红例：给同时包含旧/新值的研究brief，original有效prompt中只出现当前政策和期待；changed通过显式变更得到新快照。
- [ ] 实现共享当前快照生成/校验，返回公开事实来源；未知字段和缺政策保持诊断。
- [ ] 测试原对象不变、变更路径外字段不变、case身份稳定、未来政策不进入原版或其修订。

```ts
const original = projectCurrentTask(brief, "original");
expect(original.policy.text).toBe(brief.originalPolicy);
expect(JSON.stringify(original)).not.toContain(brief.changedPolicy);
const changed = applyTaskChange(original, explicitChange);
expect(changed.current.policy.text).toBe(brief.changedPolicy);
expect(original.policy.text).toBe(brief.originalPolicy);
```

这里的original/changed投影适配研究brief；产品输入本身直接是current task/change-set，不要求普通用户提供历史实验字段。

### AN3 领域作者前端与确定性展开

- [ ] 定义前端schema，先覆盖一个case、不同条件名、两个case、缺政策、重复case、错误入口、跨case条件引用、explicit unknown及未请求分支。
- [ ] 实现compileAuthorizationTaskAuthoring，生成普通v2、来源映射与诊断；复用现有lowerer，不从目标代码生成政策/期待。
- [ ] 核验反事实只按显式branches展开，premise.atEntry来自case入口，条件字典生成一次；改变内部生成ID不改变领域含义。

```ts
const built = compileAuthorizationTaskAuthoring(context, taskAuthoring);
expect(built.status).toBe("ready");
expect(built.authoring.analysisContract.scenarios["other-user"].premises[0].atEntry).toBe("update-record");
expect(normalizeAuthorizationAuthoringInput(built.authoring).status).toBe("ready");
expect(built.provenance.hostDerived).toContain("premise entry references");
```

- [ ] 运行新authoring-task tests与authoring-v2/assessment-contract tests；补一个已有v2复杂输入仍正常的兼容用例。

### AN4 普通init与变化入口

- [ ] 新init选项调用AN3生产函数，schema错误先诊断，文件冲突不覆盖；零模型生成assessment、entry seed和字段来源。
- [ ] 当前task/change-set编译后通过现有edit/compose继续，保存原/变任务和差异；相对sourceRoot与搬移行为沿现有规则。
- [ ] CLI红例验证编译稿真实进入check/prepare/reuse，入口数/义务数不因helper或展开层增加；旧init保持。
- [ ] 运行`bun test ./src/cli/authorization-an.test.ts ./src/cli/authorization.test.ts ./src/cli/authorization-edit.test.ts`。

### AN5 有界作者修订

- [ ] 测试非法草稿的类型/引用诊断可形成允许字段清单，合并后再检查；不要求先有valid v2才能修复。
- [ ] 测试模型修atEntry却附带修改policy/expectation时具名拒绝附带变更，已确认值保持；未知路径、重复赋值和prototype路径拒绝。
- [ ] 当前brief、输出形式和字段约束首/修共用；合理修订能到ready，未修完仍needs-input，不自动删除问题字段。
- [ ] 用原AM两种失败形状和重命名合成版本回归；不把离线修复后的旧响应当新作者成功。

### AN6 唯一当前输出合同

- [ ] 从AM q06构造红例，旧返回标签要求与v6同时进入实际prompt；正确迁移后保留领域分析内容，输出指令只有v6。
- [ ] 实现task-contract模块，已知格式迁移记录原文/来源/原因。未知自定义内容不擅删；源码或引文中出现旧标签仍原样保留。
- [ ] 同时测试Markdown/DSL两条路径、legacy/v4/v5兼容、conditional语义及case/domain facts不变；任务内容本来无冲突时不增加冗长说明。
- [ ] 精确捕获provider mock收到的完整请求进行断言，不只测试renderer片段。

### AN7 普通运行、政策摘要与矛盾归属

- [ ] 新task-contract选项经普通run进入renderer、session恢复身份和compare依赖；不支持组合在provider前给清楚诊断。
- [ ] 复用现有observed比较生成摘要，测试allow/deny四组合和unknown；conditional保留原分析及明确的不确定性。
- [ ] 模型解释与宿主摘要分字段保存。明确相反标签触发具名矛盾记录，原解释不改；一般自然语言由后续语义评审判定。
- [ ] 若接已有repair，只用原一次机会并保存首答。测试无新循环、无额外自评调用、原费用保留。

### AN8 全部真实入口预检与实验登记

- [ ] 建16质量、12作者、12消费行清单，固定源码/政策/前提/branches、主评价和首答/终答口径；实际作者host贡献逐字段登记。
- [ ] 让每种真实参数组合进入普通入口的零provider mock，验证instructionOrigin、wire/method/contract、compare --previous、局部修订和引用；不是只检查参数字符串。
- [ ] 比对四臂有效prompt的领域事实/义务/材料相同，只允许登记合同差异。两个作者current brief不含未来内容。
- [ ] 提交工程及协议，登记一次生成实现身份和恢复命令。评价oracle隔离，所有check/replay必须零provider。

### AN9 固定材料质量运行

- [ ] 执行16个fresh session，交错四臂顺序，保存实际prompt、首答、修复和最终产物；所有失败进入分母。
- [ ] 不重新定位源码，不按效果手工裁剪材料；原AM回答保持历史。
- [ ] 生成关闭后匿名评审源码decision、政策解释、所有要求分支和完整交付，两维统计及差异单列。

### AN10 三路线作者原/变稿

- [ ] 两包三路线共12首稿，按当前任务隔离和公开普通指南编写；每稿至多一次诊断修订。
- [ ] 记录结构、事实一致、语义等价、宿主展开范围；合法条件命名不要求暗含的固定字符串。
- [ ] 原稿无效保留依赖阻塞，主代理不代填领域字段；所有模型修订/host机械合并单列。

### AN11 十二次普通消费与复用

- [ ] 有效原/变稿走普通check/reuse/run，最多12session、24计划义务；实际展开及阻塞另列。
- [ ] 原/变source、ranges和pending gaps一致；政策/前提只按change-set变更，旧结果compare需复查。
- [ ] 当前模式对三路线相同，不给新前端额外源码或分析调用；分别评价作者有效和消费解决，不因宿主编译成功跳过真实分析。

### AN12 有界修订与普通示例

- [ ] 确认是否存在可复现共享实现缺陷；没有则关闭修订区块，不为低分追加。若有，先红绿修复，登记至多8个受影响session，保留主结果。
- [ ] 更新现有editor-support/task-semantics例子，展示当前任务→编译→准备/复用→运行→具名变更→再运行；清楚区分零调用和付费步骤。
- [ ] 一次仓外复制验证源路径和身份、差异以及普通命令；不重复付费演示，不处理旧被拒删除目录。

### AN13 效果与实现归因

- [ ] 分开报告合同清理、机械展开、领域判断、作者修改和消费质量；共享helper收益与DSL表示收益分开。
- [ ] 逐路线记录作者字段/重复事实/修订次数、编译是否减少引用负担；有效稿率不代替语义消费。
- [ ] 汇总全部调用和成本，raw回答与最终展示分开评分；说明当前模式适用条件，未测真人时间/USD维持unknown。

### AN14 统一研究与文档

- [ ] 在研究§7.33追加问题—根因—合同选择—反例—真实结果—剩余项；同步usage、developer-guide、spec/plan/current-status及本书checkbox。
- [ ] 更新实验目录和实际验证命令；AM验证中旧protocol.test.ts名称与现有study.test.ts的差异在新记录中明确，不覆写历史证据。
- [ ] 每阶段追加根conversation_log；必要durable决定才同步handoff/communication，避免重复整份改写。

### AN15 一次有限验证和独立核验

- [ ] 运行相关回归、类型、新研究脚本类型和零provider重放。新tests在目录中被实际发现，检查运行文件数及测试数，不用不存在的路径冒充覆盖。

```powershell
bun test ./src/task-dsl/authorization ./src/benchmarks/authorization-dsl ./src/cli/authorization.test.ts ./src/cli/authorization-am.test.ts ./src/cli/authorization-an.test.ts ./src/cli/authorization-compose.test.ts ./src/cli/authorization-prepare.test.ts ./src/cli/authorization-edit.test.ts ./src/providers/structured.test.ts ./src/measurement/token-accounting.test.ts ./scripts/token-accounting ./results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/study.test.ts
bun run typecheck
bunx tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/tsconfig.json
python ./scripts/check_skill_ir_doc_links_test.py
python ./scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

- [ ] 做一次只读独立核验：当前/未来隔离、编译未猜政策、修订权限、真实prompt单合同、原解释不隐藏、评价公平和全成本。只修具体缺陷并定向复验。
- [ ] 核对待提交文件归属与敏感信息；历史runner实现身份不兼容时说明，不改旧freeze刷绿，不追加历史全量审计。

### AN16 发布和交付

- [ ] 按工程、证据、文档分职责提交；仅本轮归属文件，推送origin/skill-ir-aot并核对远端SHA与工作区。
- [ ] 给出普通可运行命令、16质量行及12稿/12消费真实结果、成本、已解决/剩余问题；工程与效果各自结论清楚。
- [ ] 全部适用工程、可执行研究与交付完成才关闭本任务。结束后不自动扩样或启动下一方向。

## 7. 自主调整边界

执行者可依据源码修正小接口、模块拆分和测试布局，先同步本书/研究再继续；不因常规确定性修改增加批准点。保持当前任务类、原公开事实、固定材料和公平比较。普通分析默认保持，新前端与合同模式先显式使用。若发现新前端重复了现有workspace/compose功能，优先复用并说明减少的代码，不以新增schema数量作为成果。
