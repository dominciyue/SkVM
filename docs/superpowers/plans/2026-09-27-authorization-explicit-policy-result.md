# AE0–AE11：明确政策结论与协议效果验证

> 使用`superpowers:executing-plans`连续执行，代码采用`superpowers:test-driven-development`。主任务`gpt-6-astra / ultra`，继承用户要求的Fast/priority配置；可观察到model/effort时记录，服务未暴露的精确1.5倍速度不伪报。用户授权完成后推送origin/skill-ir-aot，常规检查点不等确认。

**Goal:** 减少授权回答“推理正确却选反标签”的问题，交付明确政策状态的可选wire/v5，在相同材料的Markdown/DSL两臂上检验它是否带来实际改善。

**Architecture:** canonical v0、authoring/v2、旧wire和默认不变；模型在v5返回`policyStatus`，程序确定性映射旧canonical conclusion，仍由模型负责源代码判断、证据和unknown。现有host/repair/引用/计量/CLI统一接通，不能仅在结果展示层改字。

**Tech Stack:** TypeScript、Bun、Zod、现有provider和授权验证模块。付费调用只用于登记的协议面板，美元无用户上限，次数按问题有界。

- 日期2026-09-27；状态authorized-for-execution；基线`2525d3877e1e740ba1955d93f7096fd825492747`及规划提交。
- 结果根`results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/`。
- 研究正文继续`docs/skill-ir/skill-dsl-research.md`，新增§7.26维护本批设计和复盘，不另写每轮研究正文。
- AE完整研究与交付由一个主任务负责；AF场景复用、AG计量是另外两个独立任务，不分担AE的验收或实验评价。

## 1. 复核依据

AB已完成，MD8/8 full、DSL6/8 full，两条DSL错误在linkding changed输入，正文政策推理正确，标签错误；原始答案和评价不回写。主线程新鲜跑过202授权测试/1919断言、24目录测试/147断言和typecheck。当前v4 `compact-transport.ts`第15/69行要求模型直接写旧enum并原样传到canonical；render已解释旧enum含义。因此这是一项降低模型表达负担的设计假设，不能把它说成已查明旧normalizer bug。

规划文档单测12/12通过。一次全仓链接扫描发现旧AB归档`document-scan.txt`内4条已退役文档路径，当前7份规划/状态文档没有新断链；governance errors为0。保留历史扫描原件，最终核验区分这4条既有发现与本轮新增问题，不为全绿重写旧日志。

发现AB分析token口径：OpenAI-compatible把prompt总量减cached_tokens作为`input`，cacheRead单列。MD完整输入75,539、加输出84,111；DSL完整输入77,875、加输出86,869，差3.279%；旧11.969%是fresh input+output口径。AG独立完成来源核验和版本化更正；AB原summary/run/旧评分字节保留。新面板按字段记录，收费仍unknown。

## 2. 阅读与所有权

亲读AGENTS、current-status、本书、研究§1–4/7.25–7.26、spec14.34。读`compact-transport.ts`、`transport.ts`、`render.ts`、`host.ts`、`local-run.ts`、`markdown-study.ts`、`change-report.ts`、`src/cli/authorization.ts`及对应测试。设计和即将改的代码亲读；重日志和独立点验可交default/fork-none只读子代理。

AE可修改：
- `src/task-dsl/authorization/policy-result.ts`及测试（新），既有compact/render/transport必要接线与测试。
- `src/benchmarks/authorization-dsl/{host,local-run,markdown-study,change-report}.ts`及测试，必要wire类型记录。
- `src/cli/authorization.ts`及测试；共享docs/usage、研究、spec、plan、current-status、catalog导航与根conversation_log。
- 本任务书、AE结果根、必要普通v5使用例子。旧研究结果目录只读。

AF独占`authoring-workspace/`新目录、`src/cli/authorization-compose.ts`及测试、`examples/authorization-assessment/scenario-workspace/`、AF结果根/任务书；AG独占`src/measurement/`内本轮新token文件、`scripts/token-accounting/`、AG结果根/任务书。AE不要编辑侧任务在写文件。七项原脏源码及所有历史untracked继续保护。

## 3. wire/v5合同

```ts
type PolicyStatus = "satisfied" | "violated" | "undetermined";
const POLICY_CONCLUSION = {
  satisfied: "source_refuted",
  violated: "source_supported_failure",
  undetermined: "unknown",
} as const;
```

v5单条结果用`policyStatus`替代模型填写`conclusion`，不得同时接收两者。其它obligationId、facts/citations、explanation、missingFacts、coverage/conditions保持v4含义。`satisfied`表示声明的规范期待被源码执行，既可为allow也可deny；`violated`表示期待被源码违反；`undetermined`须说明决定性缺失事实。conditional期待仍逐声明条件判断，不靠expectation字段自动推真值。

新增`policy-result.ts`负责严格schema与映射，尽量复用v4的fact/sidecar验证，不复制完整transport。v4原有行为和默认不动；必要抽出共享schema时以旧fixtures证明不变。未知值、重复字段、错义务、跨义务fact、非法引用等按原检查拒绝；不解析解释中的英语猜正确答案，不自动把未知改为satisfied，不为减少错误放松semantic review。

宿主保存模型原始v5、normalizerVersion、确定性canonical，inspect显示两层身份。CLI显式`--wire=v5`；plain/ledger/conditions都通过确定性接线测试，真实比较限plain。check/run/inspect/compare/resume与MD研究入口贯穿实际版本。MD可显式v4/v5、默认仍v4；repair保留该臂材料和同wire，未知完成不重发。兼容普通默认与原v4命令。

## 4. 有界效果面板

研究身份为新的development机制验证，不扩AB分母。读既有公开材料，不获取新repo、不访问保护集。

固定6任务状态：AB linkding remove original/changed、asset original/changed四例；已有Open WebUI `owui-process-file-write`正例和`owui-trusted-header-deployment`未知例。每例MD/DSL×v4/v5，共24首轮单元。四个AB材料沿用作者原文和同源码；Open WebUI两例优先复用后续Z/AA现成正常输入和公开问题，若需MD说明则从中立brief独立编写一次，oracle不进入输入。材料不合资格保留原因和缩小分母，不换成预计易成功的新案例。

实现、材料、公共问题、rubric、预算和顺序在真实调用前存config。两协议只改变结果表达/相应schema，两个表示共享源码、事实、v4/v5条件和output要求；样例禁止包含真实案例答案。每例交替协议和表示顺序，fresh context，保留旧AB成绩与本轮新v4成绩两个身份。`xty/gpt-5.6-sol`、temperature0、auto-probe off，180秒/call、600秒/unit、6000输出、最多4dispatch/1domain repair。24首轮，只有明确共享代码缺陷允许一次修订、最多2配对/4追加；总最多28单元。无美元cap但不为满额重复请求。AG不发业务调用，AF也不做模型面板。

评价维度：首答/最终完整交付、canonical政策判断、实际allow/deny/unknown推理、必要控制、证据、解释、合理unknown、调用/完整prompt与output/cache/time。对satisfied/violated/undetermined使用同一已有语义rubric，机械映射通过不计语义加分。评价在生成终结后进行，错误与unknown全保留；现有oracle只在评价侧读取。新v5即使全对，也只报告当前development面板效果，默认推广另作依据。

## 5. 连续队列

### AE0 基线与工作区
- [ ] 确认新规划提交、写范围和原脏文件；建单一status/journal。复用已完成复核，不再审计全部历史。
- [ ] 保存待运行面板语义状态类别与数据来源，原AB只读。

### AE1 合同红测
- [ ] 三状态映射分别断言；satisfied遇allow/deny期待均映射refuted；undetermined依旧missingFacts规则。
- [ ] v5拒绝旧conclusion、两字段同时出现、未知状态；v4继续接原enum、拒绝policyStatus。

```ts
expect(mapPolicyStatus("satisfied")).toBe("source_refuted");
expect(mapPolicyStatus("violated")).toBe("source_supported_failure");
expect(mapPolicyStatus("undetermined")).toBe("unknown");
```

### AE2 schema与normalizer
- [ ] 实现明确版本的schema/map与fact/sidecar复用；错误不漏出canonical success。
- [ ] 旧v4离线fixtures语义快照不变，新v5字段来源可解释，原始wire保留。

### AE3 完整接线
- [ ] host/render/local-run/MD/CLI/check/inspect/compare/resume显式v5，修复只沿同协议走。避免`!==v4`把v5落进legacy。
- [ ] mock覆盖正常、一次结构repair、unknown、timeout无重发；plain/ledger/conditions逐一通过。ordinary help列新opt-in，默认不变。

AE0–AE3于2026-09-27已执行：基线803dc754，独占文件及原脏状态见AE结果status/journal；合同3红测与接线5红测先失败，实施后23 focused/223断言及211授权回归/2004断言通过。AF所需value loader/显式相对sourceRoot协调由AE实现，8/35通过，详见研究§7.26。当前进入AE4，实际模型调用0。

### AE4 材料与预运行配置
- [ ] 准备6例及24单元，列公共事实对照与评价依据；需要的MD材料单独保留作者来源，不拿DSL renderer冒充。
- [ ] 一次零provider检查，固定实施revision与真实顺序即可，不叠加新的多层冻结链。

### AE5 首轮真实运行
- [ ] 按原顺序执行，逐单元记terminal/usage；响应未知不自动重复，网络初始化失败区分dispatch前后。
- [ ] 不为良好样本替换旧行，不把后继结果覆盖原始AB。

### AE6 评价与一次修订
- [ ] 全部生成后评价；独立点验状态误报、未知和收益决定项，具体指针裁决。
- [ ] 共享实现bug才修订，机械问题能离线验证就不额外付费；模型没答好只记录，不重试追分。

### AE7 机制与使用决定
- [ ] 同表示v4/v5、同协议MD/DSL分组报告，不把两个因素混为DSL成功。
- [ ] 是否减少反向标签错误、是否引入新误判、质量与token代价逐项说明。成功、mixed或负向均可完成任务。
- [ ] 留明确可运行plain/v5命令与当前推荐，保留既有默认直到证据足够。

### AE8 普通入口验收
- [ ] 仓外普通目录通过已有v2输入check、记录回放/inspect/compare；付费复用面板已运行身份，不额外造demo调用。
- [ ] 重点回归现有202项及新增测试，原样检查旧v4路径。类型检查集中一次。

### AE9 独立AF/AG集成
- [ ] 两个任务写ready并停止后再读其清单；先核变更范围、focused结果、类型兼容，再串行接公共compose命令和AG摘要助手（对新AE报告使用），不改旧AB机器报告。
- [ ] AF导出`runAuthorizationComposeCli(args:string[]):Promise<number>`，AE只在主CLI路由compose到该函数；先加公共路由测试。
- [ ] AG更正说明链接进当前研究/状态/catalog，明确12%与3.279%的不同指标。AF/AG工程结果不计入AE研究样本。

### AE10 文档、验证与归属
- [ ] 研究§7.26维护设计→实际问题→解决→结果；更新usage/guide/current-status/spec/plan和catalog导航。AF/AG原始建议只合并必要段落。
- [ ] 相关测试、typecheck、文档12测试/一次链接检查、新结果JSON解析与定向敏感检查。旧冻结证据不重审。

### AE11 发布
- [ ] AE是唯一Git写者。三个任务分别归属提交，只推origin/skill-ir-aot。侧任务partial如实独立记录，不因等待侧任务篡改AE实验状态。
- [ ] 最终报告实际结果、可运行命令与下一未决问题，完成停止，不自动扩样或重跑凑时长。

## 6. 不挤卡的并行合同

AF/AG与AE同时开发，独占路径如下。只有AE改共享docs、CLI主文件、根conversation_log和Git索引；侧任务不装依赖、不改package/lock、不全仓格式化，不修改彼此文件。所有人都应保留其他开发者改动。

| 完整任务 | 独立交付 | 专属结果根 |
|---|---|---|
| AE本书 | 明确结果协议及真实效果验证 | `skill-dsl-research/development/authorization-explicit-policy-v1/` |
| [AF](2026-09-27-authorization-scenario-workspace.md) | 多场景声明生成和变化预览工具 | `authorization-scenario-workspace-20260927/` |
| [AG](2026-09-27-token-accounting-semantics.md) | token口径模块、独立AB更正及新报告复用入口 | `token-accounting-semantics-20260927/` |

侧任务最后原子写各自ready.json：status、ownedFiles、验证、限制、共享文档建议与接口；ready后停止写。AE可先完成自己的面板，不等待侧任务实施；最终通过wait_threads等终态/需关注事件再集成，避免轮询。共享核心问题由侧任务在integration-notes给出反例，AE负责取舍和代码修复，不能并发抢文件。侧任务未稳定时不跑扫描其半成品的聚合测试。

三任务均Astra ultra与Fast宿主配置，实际1.5倍率未暴露就保持unknown。被测Sol不换成开发模型。用户未要求goal，不另建goal；任何中断保存明确nextAction和文件清单，新的恢复授权优先于旧阶段“停止”记录。
