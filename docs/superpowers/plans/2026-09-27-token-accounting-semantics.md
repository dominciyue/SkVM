# AG0–AG8：统一 token 计量语义与可复用比较

> 使用executing-plans/TDD，Astra ultra、Fast宿主priority。完整独立任务，零业务模型调用；不参与AE语义评分。AE负责最终共享文档/Git集成。

**Goal:** 在报告中明确非缓存输入、缓存读取/写入、完整输入、输出及未知值，防止把不同provider和作者日志口径混加，并给AB提供可复算的独立更正。

**Architecture:** 新增纯计量模块消费明确声明来源语义的记录，提供确定性归一/聚合/比较；只读现有provider映射和日志，不重写provider/raw telemetry。用一个显式输入脚本输出新报告，旧AB报告保持原字节。

**Tech Stack:** TypeScript/Bun、现有TokenUsage及已安装校验库，无新依赖、数据库或价格抓取。

- 状态authorized-for-execution；基线2525d387及本规划提交。
- 结果根`results/skill-ir/token-accounting-semantics-20260927/`。
- 新写范围：`src/measurement/token-accounting.ts`及测试、`scripts/token-accounting/`脚本/fixtures/README、本任务书及AG结果根。
- AE/AF、既有provider/telemetry/core types、AB所有旧文件、共享docs/catalog、package/lock与七项旧脏源码只读。不做Git写入，ready交AE。

## 1. 先读与避免重复

读AGENTS/current-status、本书、`src/core/types.ts` TokenUsage、provider实际映射（openai-compatible/openrouter/anthropic及本项目其它已用适配器）、授权telemetry汇总、`src/benchmarks/skill-ir/optimization-cost-accounting.ts`现有missing值设计。旧成本模型是AOT/生产账本，不直接拿来假填humanMinutes/quality；能复用的类型原则复用，不复制一套旧系统。

如果需要确认外部usage字段含义，只查对应provider官方API文档；源码映射已知与网关是否遵守规范分开记录。不要读取凭据、不发provider探针、不购买价格表。

## 2. 明确输入语义

输入必须显式区分：
1. `skvm-disjoint`：input是非缓存部分，cacheRead/cacheWrite为分列部分；完整prompt为有效已知分量之和。
2. `inclusive-input`：input已含缓存子集（如作者会话input_tokens），完整prompt为input，不能再次加cache。
3. `unknown`：没有足够来源依据，只展示原字段，完整prompt/比例为null并给理由。

`output`不再另加reasoning subset；0是真实0，缺字段/null不造0。完整total只在完整prompt和output均有依据时产生。cacheWrite是否与input或cacheRead重叠必须有映射依据，没有就unknown；不要按字段名盲加。费用独立，actualUSD未报告继续null，不用token估算收费。

建议稳定接口：

```ts
export type InputTokenSemantics = "skvm-disjoint" | "inclusive-input" | "unknown";
export interface UsageObservation {
  id: string;
  semantics: InputTokenSemantics;
  input: number | null; output: number | null;
  cacheRead: number | null; cacheWrite: number | null;
  evidence: string;
}
export function normalizeTokenObservation(value: UsageObservation): NormalizedTokenObservation;
```

实现前定义`NormalizedTokenObservation`：raw保留、完整prompt/total可空、字段依据、diagnostics。聚合输出knownSubtotal、complete记录数、unknown记录数；有缺项时不可把已知小计标为总体。相同id重复是错误而非重复加和，零基线比值为null+原因。比较只接匹配语义和明确分组，不能把作者、分析、开发代理账目塞成一个“节省率”。

## 3. AB更正的固定验收数字

从归档16条provider结果复算并与summary数值交叉：
- MD fresh input69,011、output8,572、cacheRead6,528；完整prompt75,539；prompt+output84,111。
- DSL input77,875、output8,994、cache0；prompt+output86,869。
- 完整prompt+output差`(86869/84111-1)*100 = 3.2790003685605917%`。
- 原fresh input+output差11.969116945722647%保留并清楚命名，响应时长差-8.492489676207594%原样。
- `todo-task-original-markdown`input720/cache6528说明完整prompt7,248；不是720。
- 作者MD input774,416/output14,714/cached706,560已有total789,130，cache是input子集；DSL作者同理，不可用同一个无语义求和公式。

新`ab-accounting-clarification.json`记录来源指针、原指标名、澄清口径与完整数值、质量原结论不变、gateway字段语义的实际限制。旧summary/panel/raw bytes完全不改。当前用户文档的更正由AE合并，不让两个任务同时改同一段。

## 4. 队列

### AG0 映射表
- [ ] 建status，整理本轮相关provider适配与作者日志两类输入口径，引用源码行号/字段；缺证据明确unknown。

### AG1 纯函数红绿
- [ ] disjoint/inclusive/unknown、无cache/有read/有write、缺值/0、negative/NaN/Infinity、cache大于inclusive input、duplicate id、零比较分母等反例。

```ts
const a = normalizeTokenObservation({id:"a",semantics:"skvm-disjoint",input:720,output:1059,cacheRead:6528,cacheWrite:0,evidence:"fixture"});
expect(a.promptTokens).toBe(7248);
expect(a.totalTokens).toBe(8307);
```

- [ ] 实现纯模块，错误不夹带一个可误用的“完整总量”。不能用clamp隐藏负数或不一致字段。

### AG2 聚合与比较
- [ ] 分账聚合、unknown计数、完整vs已知小计、可复算百分比；缓存金额与token总量不混同。
- [ ] 测试input顺序无关与分组稳定，重复记录明确拒绝。不新增复杂ledger/digest链。

### AG3 显式脚本入口
- [ ] `bun ./scripts/token-accounting/cli.ts --input=./observations.json --out=./comparison.json`，不提供out时输出stdout；输出存在拒绝覆盖。
- [ ] 输入版本、来源/分组、语义明确；不递归扫描全仓，不自动加载run中的密钥/环境，不调用网络。

### AG4 AB离线澄清
- [ ] 只读AB summary/panel及16条必要usage，产出本结果根observations与澄清JSON，复算上述数字并保存质量结果未动。
- [ ] 作者账与分析账分别处理，未记录provider次数或人工分钟保持未知；不以工具字符数填token。

### AG5 接入建议
- [ ] 给AE一个可直接调用纯模块的例子和应填写的semantics来源，确保新AE报告避免同类误标。
- [ ] 给现有catalog增补建议但不改其JSON/renderer；不以修旧报告为由重跑旧实验。

### AG6 验证
- [ ] `bun test ./src/measurement/token-accounting.test.ts ./scripts/token-accounting`；脚本类型检查按仓内runtime可用工具执行。
- [ ] 原输入前后字节一致、独立重算数值一致，输出无凭据，真实USD仍unknown。

### AG7 文档与ready
- [ ] README解释三种语义、字段重叠、缺值与真实命令；共享研究/usage更正文案放integration-notes。
- [ ] 最后原子写ready.json列ownedFiles/接口/测试/限制，通知AE，停止写文件。全仓验证与Git由AE负责。

### AG8 集成反馈
- [ ] AE指出本模块问题时在白名单内修复；不修改其host/evaluator或AF文件。没有反馈则完成。

## 5. 完成边界

本模块证明计量/比较行为正确且AB口径可解释，不证明新模型效果、成本节省或历史所有报告都正确。与AE/AF独立并行，零业务付费调用、零保护输入读取，保留七项旧修改和所有历史材料。
