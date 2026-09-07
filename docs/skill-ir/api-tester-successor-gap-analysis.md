# API Tester successor 缺口清单

**日期：** 2026-09-07

**身份：** `skill-ir-api-tester-successor-gap-analysis-001`
**性质：** development-only、只读结构盘点；不是 prospective、held-out 或 readiness 证据

## 1. 输入边界

本清单只使用 `skill-ir-api-tester-constructor-prospective-001` 首轮已经公开并冻结的四份真实输入。它们自首轮执行后均已暴露，只能作为 development 材料，不能再次计作 unseen input。输入字节、上游 commit、路径和许可证摘要继续以旧 lock 为准；旧 candidate、lock、runner 和 `first-run-report.json` 不修改。

首轮 0/4 real admission 的三行 `$ref` 拒绝发生在 v1 的全局预检阶段，五行 `checkerStatus` 均为 `not-run`。因此它证明的是 v1 的第一拒绝面，不是 checker 失败，也没有展示 `$ref` 之后的全部阻塞。

## 2. 只读结构结果

| 已暴露输入 | 结构事实 | v2 决定 |
|---|---|---|
| Open-Meteo forecast | OpenAPI 3.1；1 operation；23 parameters；5 个 query string array，均为 `form` 且 `explode:false`；另有 3 个 number/`float`、2 个 string/`date`；显式 200/400；无 `$ref`、无 request body | 作为唯一真实 development 端到端正例；需要 primitive array、明确编码、`float` 和 `date` |
| DPP REST API | 14 operations；15 个 `$ref` key，其中 5 个外部 schema ref；两个写入 body 直接依赖外部 schema；另有 `pattern`，并存在仅 303 response 的 operation | 继续拒绝；不下载或内联外部 schema，不扩 3xx-only、pattern |
| OpenWrt uAPI | 266 operations；4206 个同文档 `$ref` key、132 个 unique target；110 个 request body，含组合 schema、nullable、嵌套对象/数组和 42 个多 media-type body | 继续拒绝；不把 successor 扩成完整 JSON Schema/OpenAPI 引擎 |
| SignalK polar performance | 19 operations；73 个同文档 `$ref` key、23 个 unique target；9 个 parameter ref；4 个 request body 含嵌套对象、数组和组合关系 | parameter ref 本身属于 v2 合法形态，但整份输入仍因嵌套 body 超界而拒绝 |

计数来自对冻结字节的只读结构遍历，不是新的运行分母。响应 body schema 不进入当前计划构造或 checker 义务；v2 不再因未消费的 response-body `$ref` 全局拒绝，但仍要求显式三位数字 status 和至少一个 2xx。

## 3. 特性—能力—缺口

| 特性 | v1 | successor v2 | 稳定拒绝边界 |
|---|---|---|---|
| 同文档 `$ref` | 任意 `$ref` 全局拒绝 | 仅在实际消费的 parameter、requestBody、schema、securityScheme 位置解析对应 `#/components/...` target | 外部、悬空、循环、错误 component kind、带语义 sibling 的 ref 均 `UNSUPPORTED_REFERENCE` |
| primitive array | 不支持 | body property 的 primitive array；query parameter 的 primitive array | path/header array、嵌套 array、object item、组合 item、无显式 primitive item 均拒绝 |
| query array encoding | 不表达 | 只支持 `style=form`；默认/显式 `explode=true` 规范化为 repeated-value，`explode=false` 为 comma-separated，并写入 plan | 其他 style 或非布尔 explode 拒绝 |
| scalar format | email、uri | 保留 email/uri；新增 string/date；number/integer 的 float/double 作为类型兼容注解 | 类型不匹配或其他 format 拒绝 |
| array constraints | 无 | `minItems`、`maxItems`、`uniqueItems`，以及 primitive item 的既有 scalar 约束 | 矛盾、无法构造、过大展开或未支持 key 拒绝 |
| checker | v1 normalized contract | 独立 v2 checker 校验 operation、array encoding、array/item witness、status/security、report grounding | checker 不重解析 OpenAPI，不生成 gold plan，不证明完整 OpenAPI 语义 |

## 4. 版本与证据结论

successor 使用新的 binding/public-contract/program/package/run-report schema、support-contract 与 implementation identity；v1 文件和冻结 source closure 不作重构。先用合成 fixture 覆盖 local ref、数组、循环/外部/编码拒绝和 checker mutation，再用已经暴露的 Open-Meteo 字节完成一次 parse → package → generate → checker 的 development 路径。

该路径若通过，只能说明 v2 在声明子集内消除了 runtime 模型并覆盖这一个已暴露真实输入。它不把旧 0/4 改写成成功，不产生新的 prospective denominator，不证明 human savings、可靠性、跨 profile、held-out 或 readiness。
