# AQ 授权领域执行结果

2026-10-02，本轮 48 个首轮会话和唯一预登记的 8 个共享修订会话已经关闭。工程实现与有限验证完成；研究结论为 **negative / benefit-not-established**，原生技能的完整机制验收仍有缺口。没有追加采样或改写原始回答。

## 分母、实现与评价

主面板为四项目八个已暴露 development 任务，M（自然 Markdown）/D1（声明）与 legacy/domain-evidence-v1 两轴交叉。每臂 8 原任务加 2 个预选反序重复，共 40；消融 4、两来源技能原/变普通 native 消费 4，首轮总 48。首轮绑定 `3d4ba68173f8ebde6b58fcef539212bbafcbd8a9`。共享 Schema 缺陷先以红例证实，修订在语义评价前固定 4 对、8 行，另绑定 `04b1b220f20e0e151b42f40a37f32ed22e1e9b39`，不替换原分母。见 [manifest](manifest.json)、[共享修订](shared-revision.json)和两份 generation-closed 文件。

6 位独立首评者收到隐藏臂/成本的原始答案、当前政策和原源码范围；表示可能被推知。随后 3 位定向二审和 2 位图/动作审查提供只读建议。因发现 ShareLink helper 缺口与首评分数矛盾，另 2 位只读核验者定向检查三个 ShareLink 和其余三个未争议 full 答案。主开发者已暴露历史案例，负责沿具体源码和记录裁定；首轮裁定先于汇总揭示，最后定向修正发生在汇总揭示之后，**最终裁定不是完全独立盲评**。所有评语原文均保留；图审一份 JSON 的三个括号只作格式恢复，未改判断文字。

初审中有把无 prose 的有效 raw 答案记为未交付、把未知请求事实记为决定性错误、把手工读取记为自动调度，以及把传输 Schema 失败记为领域检查发现的误判。裁定分开保存运行终态、答案语义、提取图和宿主验收；条件分支完整可为 full。逐条出处和原/新评语见 [adjudications](evaluator/adjudications.json)，最终分账见 [evaluation-summary](evaluation-summary.json)。所有 56 行均保留。

## 质量与开销

首答和终答在本轮的等级统计相同；两份原文分别评价和保存。下表分母含失败，over-unknown 只计可读但未读的决定性源码缺口。

| 主质量臂 | 会话 | 交付 | 首/终 full | 首/终决定性错误 | 首/终过度 unknown | provider 调用 | 完整 prompt tokens | output tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| M-L | 10 | 9 | 1/1 | 0/0 | 8/8 | 64 | 1,029,274 | 39,861 |
| D-L | 10 | 10 | 1/1 | 0/0 | 9/9 | 73 | 1,252,177 | 64,597 |
| M-E | 10 | 3 | 1/1 | 0/0 | 2/2 | 62 | 1,192,116 | 47,357 |
| D-E | 10 | 4 | 1/1 | 0/0 | 3/3 | 79 | 1,621,984 | 79,796 |

原任务块 32 行交付 20/full 3，预选重复块 8 行交付 6/full 1。领域臂未交付较多且首轮共享 Schema 有缺陷，不能把本表解释成对正确实现的纯语义因果比较；同样不能隐藏这些失败后只比较幸存答案。未观察到稳定质量或 token 净收益，旧默认保留。

ShareLink 三份原 full 评语已纠正为 partial：两份显式未读 owner-aware helper，另一份读过该 helper 但未读 `PassUserMixin` 的 actor-to-serializer 绑定，仍直接假设 validator 的 `self.user` 是当前 caller。任务明确要求相关 inherited/serializer 控制；`views.py:406-428`、`serialisers.py:2873-2885` 和 `permissions.py:624-635` 给出具体可补路径。定向核验建议其中一份 full，主裁定沿该未读 actor 绑定保留 partial，分歧原文和依据均保留；不从 Notes 的独立政策移植“ownership 不得替代 grant”到 ShareLink 政策。

| 消融 | 会话 | 最终语义 | 调用 | 自动读取 |
|---|---|---|---:|---:|
| OWUI scheduler-off | 1 | partial | 12 | 0 |
| OWUI checks-off | 1 | not-delivered | 8 | 0 |
| Notes scheduler-off | 1 | full | 7 | 0 |
| Notes checks-off | 1 | incorrect | 8 | 0 |

Notes checks-off 答案把未给定 object grants 当成缺失；修订 Notes M-E 把“非 owner 且无 grant”直接判 deny，漏掉 null-owner 同样可通过的情况。两处源锚为 `src/documents/permissions.py:624-635`、`views.py:1857-1892`。消融样本小且有协议失败，不能单独建立 checker/scheduler 的净质量因果收益。

共享修订 8 行另列：M-E 交付 1/4、full 0/4、决定性错误 1；D-E 交付 2/4、full 1/4、决定性错误 0。合计 76 调用，2 completed-with-diagnostics、3 transport-failed、2 timeout-unknown、1 budget-exhausted。修复使部分真实控制提议和补读能走通，但仍没有稳定完整交付，不能替代原 48 行或声称修订成功率。

## 三个机制与普通技能

确定性测试证明调度器使用已读调用位置、共同预算和源身份，条件引擎实现 null/missing、三值短路与 residual，检查器核对显式控制顺序、类型化对象和独立政策。两入口共享同一核心；实际 sourceBound/checked 仍不证明提取意义。

56 会话中 11 次成功自动读取分布在 7 个会话：原主面板 1 次，修订 10 次，消融/native 均 0。没有失败自动读取或完全重复的区间。实际命中包括 Memos `requireCurrentSpaceUser`、成员资源 resolver，Notes `has_perms_owner_aware`，Gitea `reqToken`，OWUI owner-constrained file lookup、`process_file` 与 vector save body。后两函数各有非重叠续读；读取父函数正文是有用补证，但不是额外发现一个 helper。原审查把 `reqToken` 写成权限 helper、把 file lookup 写成 `process_file` 的地方已按 action/evidence ID 更正。

实际宿主记录未出现 inapplicable path/dependency，未证明明确 null-owner 在原生会话触发程序分支排除。7 个会话能沿实际规则/谓词检查确认类型绑定或表达式合同诊断；这些不是对全部源码提取意义的独立验证。所有非空图按完整请求的类型/条件/路径表示记 partial；没有图的 legacy 观测记 none。未建立语义误拒、错误接受或提取错误被后续程序放大的具体事件，也不据此宣称检查器无漏检。

两来源技能保留完整原文和直接引用，普通 loader 的加载、reference、compile、observe/check 均有实际记录；Cloudflare `security-audit` 接 Notes 原/owner=null，GitHub `security-review` 接 Memos 原/policy-v2，合计 4 会话。Captured raw 语义为 full 3/4、partial 1/4，3 份另有最终 prose。Memos 原任务虽然读完三个 backend，仍未读范围内的 current-user 与成员 resolver，不能把这项上游主体/资源绑定缺口写成部署事实；变化任务实际读了这两处正文。GitHub 变化会话在达到预算后 adapter-crashed，raw 首/终仍保留。四者 **checked delivery 均为 false、自动补读均为 0**。因此普通技能确实消费了当前入口，但 AQ13 要求的完整自动调度/条件处理/checked 交付链未满足，不能把语义 full、工具注册或 compile 调用当作通过该验收。

AQ8 变化接口能报告 policy/premise/source/strategy 和机械索引复用适用性；当前变化任务使用 fresh 分析，不自动继承旧语义 slice。政策单独重算的复用收益未实现、未测。

## 调用、字节与未知项

全轮 **56 会话 / 434 实际 provider 调用 / 0 目标执行**；作者、分析、fallback、修复都在调用分母内。已知 input 6,609,885、cache-read 1,673,088、cache-write 0、output 388,229 tokens；完整 prompt 为 8,282,973。4 次 usage 未知，434 次 actual USD 均未报告，实际费用总数为 null，而不是零。实际返回模型、底层 transport attempts、开发代理 tokens/USD、真人分钟未知。请求模型为 `xty/gpt-5.6-sol`；开发请求 `gpt-6.1-sol / max / Flash`，Flash 未确认。累计会话墙钟 19,391,890 ms（并发会话相加，不是研究实际历时）。

分阶段源码字节合计：index 103,011,150、physical read 361,969,155、tool display 1,116,705、cumulative model source 4,116,030、resent source 3,012,441。它们是每会话各阶段累加，含重复索引/读取；不能合并成一个“独有源码大小”，也不等于 token。逐会话值在 summary rows。主 48 行 dispatch 审计与报告 358 次一致，另 8 修订为 76 次。

## 验证和重放

相关运行代码回归 481 pass / 1 平台 skip / 0 fail，3,208 断言；主 typecheck 通过。最终研究类型和 8 个研究边界测试（52 断言）通过；新增红例确认评价 replay 会拒绝裁定变化后未更新的旧分数。普通配置、源隔离、两技能 loader/reference 在生成前完成零调用预检。最终文档/凭据/历史保护/归属检查和发布身份见 [verification](verification.json) 与 [status](status.json)。

从仓库根重放（只读现有证据，零 provider）：

```powershell
bun ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/study.ts replay
bun ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/evaluate.ts replay
bun test ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/study.test.ts
bun x tsc --noEmit -p ./results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/tsconfig.json
```

`adjudicate.ts` 按固定 source-grounded 决定重新生成派生评语，`evaluate.ts summarize` 重新生成分账；都不派发模型。`study.ts` 的生成命令仅用于原登记运行，研究已关闭，不自动重发 timeout/失败。普通使用、零调用 check、inspect、edit/compare 见 [usage](../../../../../docs/usage.md)和[可搬移示例](../../../../../examples/authorization-assessment/reusable-skill/README.md)。

本轮停止。保留可选工程能力，提取合同、协议负担和原生自动调度采用率仍是明确缺口；不追加项目或付费调用寻找正结果，不提升 readiness。
