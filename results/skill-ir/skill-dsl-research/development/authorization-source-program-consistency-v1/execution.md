# BQ：源码一致性修复与真实产物维护

有限队列已执行，发布收尾中。两个已知缺陷已在模型原稿中修复，真实多输入采用和普通消费成立；完整自然交付与稳定执行增量未达。本轮是一个公开 development 源码任务，使用有限 fixture，没有运行 Paperless 服务或数据库。开发 gpt-6-astra/high，实验官方 gpt-5.6-sol/high，第三方暂停。

## 实际任务链

1. 从 `a0e306cb` 接管，BP 0 活动；固定 BP A0 的原始52步稿（SHA `e0110eabf60abd088f062b7f2c9bab5fb9d2cd032106cfeabca92db4e04738ac`），保留所有 claims。
2. 工程 `c0b5ccf8` 提供真实调用边、词法包围条件、有界caller、当前源码与当前revision试跑反馈；普通rules/execute静态对账一致，规则侧无执行结果。复用when/field.default，不合成业务谓词。
3. 首次调用前固定18历史、8额外、7原扰动和2组合边界，共35输入，量规与expected不进入模型边界。初稿32/35字段及局部轨迹匹配，匿名激活、缺version键和二者组合失败。
4. T-R与T-E各从同一原稿、任务、完整skill/四问、源码、模型及总预算启动；模型自主修改，主开发代理不编辑业务raw。
5. T-E主动先试4案例，实际暴露缺键和匿名缺口；提交1次patch后复试4+3案例，7案例均对应最终revision。最终当前55步raw与首有效稿字节相同，SHA `c8eef5ceba0ac9baeabd39b81b0e9bb097a041132731424ae44c4082eb7bc744`，依预注册规则固定，未按分数选择。
6. U-E以同一字节普通execute/consume解释组合输入。实际55事件，constructor/has_perm均skipped，返回document11/original/`v1-original.pdf`；程序不可编辑。消费者没有主动trial，准确采用的是普通当前执行上下文。

## 自动程序结果

| 原稿 | 历史18 字段/局部 | 额外8 | 扰动7 | 边界2 |
|---|---|---|---|---|
| 初始BP A0 | 18/18 | 7/8 | 6/7 | 1/2 |
| T-R首有效/最终55步 | 18/18 | 8/8 | 7/7 | 2/2 |
| T-E首有效/最终55步 | 18/18 | 8/8 | 7/7 | 2/2 |

首/终稿全部保留。T-E首终字节相同，公共执行器只计算一次并关联两件，不能当两个独立成功。完整矩阵为[初稿](evaluation/initial/matrix.json)、[T-R首稿](evaluation/tr-first/matrix.json)、[T-R终稿](evaluation/tr-final/matrix.json)、[T-E固定稿](evaluation/te-final/matrix.json)。字段别名映射经实际return表达式核对，不填任何expected值。

匿名输入现在跳过两项外部权限调用；缺version键显式default为null，空串仍保留；组合输入返回11/original。正常、拒绝、未知外部路径没有登记范围内的关键退步。已知false/null构造器正常返回不被当grant，缺少外部事实仍是条件。记录包含作者未审覆盖声明，因此局部计算成功仍不认证完整HTTP操作。

## 自然交付与采用

| 用途 | 源码决策四问 | 原四问完整性 | 实际试跑 | 终态/交付 |
|---|---|---|---|---|
| T-R | F/F/F/F | F/P/F/F | 0 | completed / delivered，4观察turn |
| T-E | P/P/P/F | P/P/P/P | 3批11案例，其中7当前revision | interrupted / delivered，2观察turn |
| U-E | F/F/F/F | F/P/F/F | 0，普通执行55事件 | completed / delivered，2观察turn |

F=full，P=partial。原四问6/12 full，整题0/3 full；源码决策9/12 full。BP原分数不变。[逐题评阅](evaluation/quality-reviews.json)保留独立意见和主线程出处裁定。T-E未解释根查找失败回退和构造器先于owner短路；其malformed version残余unknown描述也不符合登记invalid-version的实际not-found/无条件结果。三份交付都未完整说明已知false/null正常返回与truthiness的区别，不能靠修好raw自动给说明加分。U-E正确区分literal框架声明、实际局部值和真实HTTP边界。

T-E首轮完成并交付，后续修订因探索预算保留中断，当前raw没有变化，delivery仍current；不中断原件、不重发。U-E工具阶段达到预算保留后，已知终态下无工具final-child完成交付。所有首件、续作、中断和费用保留；没有额外确认attempt、quota/auth或unknown。[事件链](evaluation/actual-use.json)区分收到执行上下文、主动trial、修稿及验收。

## 成本与同条件比较

| 用途 | input（含cache一次） | output | 工具单位 | 观察耗时ms |
|---|---:|---:|---:|---:|
| T-R | 5,492,081 | 29,810 | 59 | 1,182,880 |
| T-E | 2,472,370 | 14,520 | 60 | 661,564 |
| U-E | 775,481 | 7,997 | 60 | 459,462 |

合计input8,739,932（含cache7,810,432）/output52,327，8观察turn，179工具单位。USD、隐藏provider请求、开发/探子与真人成本unknown，不能填0。详见[accounting](accounting.json)。两臂同源码树`d143dbeac576cf6ba4b7cf062b3cfb5a486bd97b`，公共信息与初始raw相同。程序修复持平，执行参与成立但说明遗漏更多；T-E观察token/时间更低且保留续作中断。这一对只作有界描述，不建立重复质量优势或稳定净收益，见[comparison](comparison.json)。

## 普通运行与可重放证据

从仓库根运行：

```powershell
$bq = './results/skill-ir/skill-dsl-research/development/authorization-source-program-consistency-v1'
./examples/authorization-assessment/download-workflow/run.ps1 -Mode zero -ProgramContext directed -ProgramFile "$bq/authoring/automatic-program.json" -InputFile "$bq/inputs/consume.json"
./examples/authorization-assessment/download-workflow/run.ps1 -Mode account -ProgramContext directed -ProgramFile "$bq/authoring/automatic-program.json" -InputFile "$bq/inputs/consume.json"
```

零模型命令已实际执行；后者是同一普通官方账号消费入口。[U-E原答](evaluation/answers/U-E-first.txt)、[T-E原答](evaluation/answers/T-E-first.txt)、[T-R原答](evaluation/answers/T-R-first.txt)均保留。模型试跑的11个输入按原值导出为普通inquiry文件，见[regression index](authoring/regression-input-index.json)；历史revision与最终稿重放分别标注。T-R回归表是原答段落机械提取，没有开发者补语义。

[搬移与失效](verification/portability.json)验证复制会话/源码后的inspect、普通重放和归档；只在副本目标函数去掉权限条件中的not，旧返回被撤回，原源码与raw哈希不变。首次副本改动因相同文本跨函数出现6次被断言阻止，收窄目标函数后一次修复通过，未改共享生产实现。

[完整原件包](archives/full-evidence.tar.gz)无损保存363个原会话/派生大文件，逐文件读回哈希核对，原文件仍保留本地；[清单](verification/evidence-bundle.json)给出每件路径/字节/哈希。新checkout可将该包解压至本BQ目录后使用普通inspect。研究入口、原始/最终raw、回答、回归输入、全部矩阵和简明记录直接纳入Git，所有原始生命周期亦在压缩包中，不因文件过大丢弃。

## 验证与停止

匿名红绿、普通静态parity、缺键/default、当前revision与trial归档通过；最近定向52测试354断言，另有fake/恢复42测试342断言。主/研究类型和15文档单测通过；全部三真实会话ordinary inspect及冻结身份零调用核验通过。未重跑旧全src，历史失败不称已修。见[工程](verification/engineering.json)、[收束](verification/zero-call-closeout.json)、[分轴验收](verification/acceptance-matrix.json)。

两个已知缺陷和实际采用已解决；完整自然质量、未审源含义与稳定增量保持未达。项目默认不变，显式BQ可用于已说明范围。只推用户origin/skill-ir-aot，发布核对后结束，不自动创建BR或追加模型实验。
