# 项目工作区与文档治理任务书

> **For agentic workers:** 使用 `superpowers:executing-plans` 按本任务书推进。主进程负责取舍、文件修改和 Git；子代理仅做只读盘点或独立点验。文档修改采用精确 diff；只有修改治理工具行为时才执行相应失败测试和实现。常规可逆整理无需重复确认。

**Goal:** 清除可重建的历史工作树和重复输出，把本地研究原件收存到可恢复的位置，让当前开发通过简短入口找到最新方法、代码和未完成任务。

**Architecture:** 沿用现有 15 份当前文档、14 份版本化材料、experiment-catalog 和外层 project-maintenance。运行原件保存在本地，当前说明按职责重写；Git 保留普通文档历史，版本化验证材料保持原字节。治理不新建研究正文或并行业务实现。

**Tech Stack:** Git worktree、PowerShell、Python 标准库、现有文档与实验目录检查工具。

**状态：** completed-published-with-retained-empty-directories。2026-10-04。两批累计退出22个旧工作树、收存39个材料目录和2个旧环境；另压缩16个关闭实验日志并归并开发自有正文。AR 进程结束后，用户授权本线程完成治理及发布，再派发 [AS 开发任务书](2026-10-04-authorization-semantic-lowering-and-delivery.md)。三个此前删除被拒绝的空目录保留。下面 G0–G10 为当时执行记录，关于“AR 仍在运行/暂缓发布”的描述由 G11–G12 接管。

## 1. 已核实的问题

- 22 个额外工作树共 9.59 GB 逻辑文件字节、527,779 文件；HEAD 均包含在主开发历史。15 个无本地差异（6.61 GB），7 个有差异。
- 主 checkout 排除 .worktrees 后约 6.23 GB，主要为 .skvm、results 与临时运行目录。src 13.76 MB，docs 3.54 MB；代码和文档数量不是磁盘占用的主因。
- C8/C9 临时目录保留真实输入输出、失败现场与原始 trace。五套 compact proposal、四份 session 摘要已归档，原始日志完整替代关系尚未建立。
- 两份 AGENTS 的下一步分别停在 C/F，README 的状态说明停在 AB。研究正文已有 10 月 4 日记录，但当前结论仍以 AH 开头，当前计划复制了多轮已完成队列。
- 现有链接检查通过只说明路径等机械条件成立；它不检查摘要是否过时。当前有 15 份阅读入口、14 份版本化材料和一个本地个人笔记，不需要靠增加更多状态文档解决问题。

## 2. 所有权与最小保护

文档范围按用户后续要求限定为本项目开发新增的文件及扩写章节，原项目已有且未改内容不治理。当前本地 main/origin/main/upstream/main 与开发分支的共同基点均为 `73c0cda3`（2026-07-06），只用作 Git 来源参照，不冒充准确 clone 时点。`docs/skill-ir` 与现有 `docs/superpowers` 为参照后新增；`docs/usage.md`、`docs/jit-boost.md` 只整理本项目扩写；未改的 `docs/architecture.md` 等保持原样。

1. G0–G10 期间 AR 开发线程 `01a10284-8c65-7eb3-baef-4aacb5dee945` 独占业务实现与发布；2026-10-04 用户确认该进程结束，G11–G12 由治理线程接管发布，然后将唯一写入权交给 AS。AR checkpoint 可以发布保存，验收未达状态和原始实验保持。
2. 用户授权执行后，将文档工作缩到可独立核对的导航与历史重复段落：从最新字节编辑，保存本地修改前副本，保留研究 §7.36 和当前 spec 方法正文。共享文档发生并发变化时重读相应段落再合并，不整份覆盖旧副本。发布交由唯一 Git 写者归属处理。
3. 删除只针对逐路径处置表中的确切目录；先验证解析后的绝对路径、登记状态和非 Git 文件。未知文件保留，不执行全仓 `git clean -fdx`、D 盘通配删除或强制回滚。
4. 不以是否 tracked/ignored、名字含 temp 或时间较早作为删除依据。明确区分“可由 Git/锁文件重建”“仅本地的原始证据”“个人报告”。
5. 不新增冻结层、逐文件签名、重复全库审计或付费文档检查。每批一次针对性核对；清理不触发模型实验、历史重跑、held-out 或 readiness 变更。
6. 所有大小为逻辑字节；硬链接、压缩与共享 Git 对象使实际释放容量可能不同，执行后测量再报告。

## G0 — 盘点与处置表（已完成）

- [x] 读取现有治理设计、当前状态和活动开发任务书。
- [x] 覆盖用户点名的 33 目录，补齐 22 个旧工作树，逐项登记共 44 目录；统计主仓与外层主要类别。
- [x] 点验旧工作树本地差异、C8/C9 归档、实习报告版本、README/研究首屏及检查器能力。
- [x] 保存本地 `inventory.json` 与同目录 README；记录无删除、无搬移、无研究调用。
- [x] 确认 `fmc96e41be` 唯一未跟踪 report 与主仓同路径文件逐字节相同。

## G1 — 修正启动导航（本轮完成）

文件：`D:/skill优化/AGENTS.md`、仓内 `AGENTS.md`、`docs/skill-ir/README.md`。

两份 AGENTS 均是本地工作规则；仓内 AGENTS 已由 `.git/info/exclude` 排除。本次继续保持本地文件，不强制纳入 Git。可发布变更另含 G5 的导航整理、实验目录登记和 G6 的文档检查器；具体归属清单保存在本地治理记录中。

- [x] 移除 C/F 的固定 planned-not-started 下一步，用 current-status 及其活动任务书路由；保留 Git、费用、来源及未完成代码保护规则。
- [x] README 不再复制 AB 的完成状态，说明 catalog 是登记快照而非实时状态。
- [x] 明确研究总文档首屏是当前综合判断，阶段细节在同文档相应记录及结果中；旧记录不因压缩而改分母。
- [ ] 发布由当时唯一 Git 写者精确归属处理，不借治理推送开发过程中的未验收提交。

## G2 — 退出可重建的旧工作树

输入：本地 inventory 中 `decision=retire-after-use-check` 的 15 项。它们是：

```text
D:/cp-clean-ext-9d95faa
D:/cp-clean-ext-aa57d74
D:/cp-clean-ext-fbeccd5
D:/cp-clean-operation-3ebe606
D:/cp-clean-r12
D:/cp-clean-r12b
D:/cp-clean-r12c
D:/cv2-n14-5450662-a1
D:/cv2-n14-b10cdce-a2
D:/fm-b29500c
D:/fmb29500c
D:/fmfinal0d754a2
D:/fmfinal8abbd1c
D:/skill优化/SkVM-api-operation-synthesis-clean
D:/skill优化/SkVM/.worktrees/family-request-clean-20260911
```

- [x] 在删除当刻复查本批路径的 Git 状态和使用情况；inventory 保留原 HEAD、路径和重建说明。
- [x] 15 个无本地差异工作树通过 Git 正常退出；逐项 outcome 已登记。
- [x] 在本地确认确切路径后使用命令；以第一项为例：

```powershell
git -C D:/skill优化/SkVM worktree remove D:/cp-clean-ext-9d95faa
git -C D:/skill优化/SkVM worktree list --porcelain
```

- [x] 无差异批次未使用批量 force。G3 的七项在差异归档完成后才逐路径使用强制退出；旧账户所有权仅通过命令级精确 safe.directory 处理，未改全局配置。
- [x] 恢复使用已登记 HEAD 和差异归档；本轮不重建整套依赖或重新运行历史实验。

## G3 — 收存七处差异，再退出其检出副本

本地唯一归档根：`D:/skill优化/project-maintenance/archives/`；索引继续由本次 inventory 维护。归档留在本机，不进 Git，不上传。

| 目录 | 先保留的内容 |
|---|---|
| cp-clean-20260912 | 修改后的 execution-status.json 及原 HEAD |
| cp-clean-operation-65216d8 | package.json、bun.lock 原字节；普通文本 diff 为空不代表 CRLF 字节相同 |
| fmc96e41be | report 与主仓相同的对应记录；清理当刻若变了则收存变化 |
| family-current-clean-20260911 | 112 个未跟踪复现输出 |
| family-extended-clean-20260911 | 26 个未跟踪复现输出 |
| family-header-decimal-clean-20260911 | 10 个未跟踪复现输出 |
| family-request-clean-lf-20260911 | 7 个未跟踪复现输出 |

- [x] 七项非 Git 差异分别保存为本地 ZIP，登记原路径、HEAD、文件列表和用途；未压缩整个 checkout 或 node_modules。
- [x] 一次 CRC 及文件目录核对通过后退出七个工作树，原行尾字节保留。
- [x] 旧报告路径、摘要和结论保持原样；恢复映射指向归档及原 HEAD。
- [x] 每项退出前检查 ignored 内容；未知输出纳入收存，不按依赖删除。

## G4 — 整理运行材料和个人文件

- [x] C8/C9 的 raw trace、proposal/context、输入输出和失败现场完整归档，compact 报告留在 Git 原路径。
- [x] 35 个材料目录已迁入 `project-maintenance/archives/20261004/originals/`；包括 C8/C9、来源快照、cv2 replay、报告加工目录、恢复补丁及旧 trace 生成材料。原目录和 ZIP 均保留，映射可恢复。
- [x] 两个 .tmp-api 来源目录保留上游原始字节与 revision；两个 cv2 输出目录整体收存，未把独有输出当缓存删除。
- [x] 根目录全部用户报告版本保持原位。四个报告加工目录整体收存，没有代选唯一终稿或删除可编辑版本。
- [x] 恢复补丁与既有 project-maintenance 记录保留；无项目归属证据的空 `csgodemocache` 保持原位。
- [x] `.skvm` 的提案、runtime、外部来源和当前 AR 结果保留；既有 raw 证据缺少完整替代关系的部分不清空。
- **保留项：** 自动审批拒绝已归档原目录批量删除；随后采用可恢复迁移完成归拢。包含两个旧 venv 收存和空 `.worktrees` 清理的命令也被拒绝，整批未执行；约 146.7 MB 旧环境和空目录暂留。拒绝信息为 `blocked by policy`，未尝试绕过删除限制。

## G5 — 整理当前阅读路径（已执行）

文件：现有 current-status、plan、research、spec、developer-guide、evidence-index/history，以及 experiment-catalog。不新增第二份研究总文档。

- [x] current-status 归纳到约 47 行，保留能力、未解决问题、活动任务书和机器恢复指针。
- [x] 当前 plan 归纳到约 53 行，移出已完成 AQ 至 AB 等重复表格；保留 AR 队列、失败处理和边界。
- [x] research 首屏、当前未决问题与决策时间线更新至 AR，分类及方法主题继续留在同一正文。
- [x] 研究 §7.19–§7.35 的历史记录折叠显示，原正文及锚点保留；§12 重复开发流水改为历史索引。活动 §7.36 保留原字节。
- [x] developer-guide 按实际代码模块归并接口与验证入口；spec、evaluation、artifacts、pilots 增补适用范围，防止旧 IR/AOT 规则误作当前 DSL 规则。长期合同正文保留，篇幅软警告不通过放宽阈值消除。
- [x] history 登记本地材料的新恢复位置；外层大日志保留历史，治理完成只追加短记录。
- [x] catalog 新增 AP/AQ/AR；AR 仅登记进行中入口，旧条目不改统计。
- [x] 14 份 versionedMaterials 原路径、原字节保留；本地个人笔记 `1.md` 保留。
- [x] 核对导航锚点，旧开发指南标题保留显式别名；未建立第二份研究正文或 docs/archive 副本。

## G6 — 防止再次堆积与必要验证

今后新临时运行默认集中于 `D:/skill优化/project-maintenance/runs/<task-id>/`；既有路径保留，逐批迁移。任务结束标清保留的原件、归档位置和可重建环境，退出临时工作树。相同环境优先复用现有安装，不为每次检查长期留一套 checkout。

- [x] README 和开发指南明确研究首屏同步、状态替换、临时目录集中与收尾规则。
- [x] 检查器增加当前阅读集的章节锚点检查和唯一 current-status 角色检查；不以旧日期拒绝历史，也不尝试判断语义结论真假。
- [x] 先复现三类失败再实现，15 项文档工具测试通过；业务代码未改，不跑全量业务测试或付费实验。
- [x] 受影响链接和治理 diff 检查通过；收尾使用：

```powershell
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
git diff --check
git worktree list --porcelain
```

- [x] 开发进程仍活跃，保留明确归属的治理工作区 diff，未暂存或提交任何文件；整合发布仍交由 AR 的唯一 Git 写者。AR 原始数据、用户报告、local archive 和 .skvm 未纳入治理发布。
- [x] 本地 README/inventory 已写清实际数量、归档、保留项及容量口径。抽查恢复 package.json 共 1,563 字节、63 个 CRLF；未重跑历史研究。

### 实际验证

- 文档工具 15/15；26,604 文件链接扫描 broken/legacy/governance error 均为 0，保留五条篇幅软提醒。
- catalog 检查 17 条记录、0 诊断；治理 diff 格式检查通过；14 份版本化材料无差异。
- 13 份 ZIP 在创建时通过 CRC 检查；35 个迁入目录的 5,401 个登记文件存在且长度一致；Git 仅余主 checkout。
- 两项独立只读点验分别检查导航/活动 AR 保留和归档/恢复映射，无需修正的问题。业务代码未改，无模型实验或业务全量审计。
- 本地逐路径结果与恢复说明：`D:/skill优化/project-maintenance/20261004-governance/README.md`、`inventory.json`、`archive-index.json`。治理不宣称活动 AR 工作区已经干净或远端同步。

## 验收

1. 当前入口能迅速找到真实活动任务、最新方法和待解决问题，研究首屏与后文一致。
2. 退出的工作树有 HEAD 恢复记录，本地差异和唯一证据已保存；历史报告和方法结论不变。
3. 当前开发未被覆盖或误推送；旧绝对路径的证据可通过索引恢复。
4. 没有为了“整洁”抹掉真实失败，没有把目录数变少当成研究进展。

## 后续盘点补充（2026-10-04，未执行代码迁移或新删除）

用户新增目录盘点及源码/results结构判断统一记在本地治理 README/inventory，没有另建治理正文。本轮已完成入口与旧目录收拢，深层内容归并和 Git 发布仍有后续工作：

- `research-checkouts`、单数 `.worktree`、复数 `.worktrees` 均为空；两旧 venv 可重建，仍保持上次清理拒绝后的原位状态。
- Q1 AI 修订目录被历史合同按路径引用；CSV 试用保留启动器/源 skill/输入与运行记录；project-maintenance 已承载 AR 活动 runs。新点名的三个 C9 source/variation 目录不在上一批35个归档映射内，保留待补归档对应关系。
- results/skill-ir 快照约3.8万文件、2.54GB，其中约1.11GB为原始 .log。ignored 大文件不能自动视为可重建缓存。优先准备按实验身份收存原件、保留 compact 导航和恢复路径；历史报告及费用/失败不覆盖。
- src/benchmarks/skill-ir 的668个已跟踪TS中285个为测试；非测试包含研究runner和被普通产物代码导入的运行时模块。后续先区分职责和依赖，再小批抽离共享实现；旧冻结入口按原字节/原提交复现，不修改历史摘要迁就重构。
- 当前长文档仍有方法、接口与分轮过程混杂。下一步在现有文档内按主题归并本项目内容，活动AR段落待开发者形成稳定结论后整理；不另建平行研究文档，也不把长篇幅本身当删除理由。

## 第二批执行 G7–G10

### G7 — 收存剩余本地材料

- [x] 三个C9 source/variation目录和review_artifacts已归档并迁移。新增 ZIP 的74个原文件/479355字节在迁入目录中核对一致，清单和恢复映射已保存。
- [x] 两个旧venv未发现运行进程，已按确切路径迁入environments区，保留完整环境。恢复时复制回原路径或按原依赖记录重建，移动副本不当作直接可运行的新环境。
- [x] 三个目录确认为空；删除命令被自动审批以 blocked by policy 拒绝，整批未执行，保持原位。不改工具绕过。
- [x] Q1、CSV、project-maintenance/runs保持原位。补充盘点发现的Y10源码缓存仍由来源记录引用；共享Schemathesis环境和离线依赖包登记为保留，不把缓存名字当作删除依据。

### G8 — 旧日志与结果导航

- [x] F阶段16个大日志在原路径作NTFS透明压缩，Windows文件占用接口记录1084844571→630267904字节；所有长度/mtime及64KiB首尾字节抽查一致。未触碰AR活动日志，也未重新全文件哈希。
- [x] 现有catalog补入G阶段，保留报告原status并明确effect=mixed；证据索引增加结果材料类型与查询规则。原17条记录原义保留。
- [x] 开发指南§3.1补实际生产/benchmark依赖和冻结路径说明；未搬业务模块、改历史摘要或删除代码。

### G9 — 开发自有正文归并

- [x] evaluation-system、optimization-and-artifacts、real-skill-pilots分别从1292/1138/489行归并为1217/951/228行，累计减少523行；长期合同和原章节锚点保留。原“实验数值见已退出文档”改为现有证据索引。
- [x] 原项目未改文档不动，14份版本化材料未改。AR实时方法正文由开发者写入；对共享指南只插入职责导航。
- [x] 未新建研究正文。第二批精确副本留在同一维护目录before-docs-second-pass，旧流水转为结果链接与Git恢复。

### G10 — 一次针对性核验与记录

- [x] 新归档/迁入文件由只读核验确认74/74一致；透明压缩结果记入同一inventory，抽查恢复一份review原文。没有重跑历史研究。
- [x] 文档工具15/15、链接/章节扫描与18条catalog检查通过；保留四条篇幅软提醒。独立内容复核未发现关键结论或合同损失，14份版本化材料无治理差异。
- [x] 同一README/inventory、history、current-status和短conversation_log同步实际处置与恢复；AR仍作为唯一Git写者，治理不推送其未验收提交。

## 第三批 G11–G12：AR 退出后的收口

### G11 — 当前文档与残留缓存

- [x] 核实 AR 最后 turn 已结束、最后实现 cc88bfb2，本地尚有63个未推送提交；原机器状态的 in-progress 按停止快照保留。
- [x] 更新 current-status/当前计划/研究首屏/开发指南/spec/catalog，不再将 AR 写作活动进程；研究旧过程折叠但保留原文和锚点，当前根因与 AS 设计放在可见正文。
- [x] 将本地 handoff 从仍指向9月H阶段的旧流水改为当前跨线程恢复说明；完整旧325行在 before-finalization/project_handoff.md 保留。通信台账只校正启动规则并追加本次决定，不整本重写历史。
- [x] 只删除已核验可重建的五份 .pyc，保留程序源文件及原始运行；标准 Python 缓存加入 .gitignore。三个原审批拒绝的空目录不重复尝试。
- [x] 原项目未改文档与14份版本化材料保持；不修改业务实现、AR评分、未知封存或冻结结果。

### G12 — 验证、发布和唯一写者移交

- [x] 文档单测15/15；27,275文件扫描 broken/legacy/governance error 全为0，5条篇幅软提醒保留；catalog 18条、0诊断；主 typecheck 和 staged diff 检查通过。14份版本化材料、AR原件及生产源码无本轮差异，凭据模式扫描0命中。两项定向只读复核完成，AS任务映射/封存/native及预选变化任务说明已补齐；无模型业务实验。
- [x] 治理与 AS 计划提交 `b1a8d6aabe313b9260fd1f3427eb0088af3b8333` 已推送用户 origin，并通过 ls-remote 核对；当时工作区干净。AR 的63个历史checkpoint一并发布保存，仍明确验收未完成。本次状态收口提交继续同一发布流程。

AS 派发使用 gpt-6.1-sol/max，创建回执保存在本地维护目录。状态收口推送后再创建线程；新线程接管共享文档和 Git，治理线程只保存自己的本地派发回执，不再修改仓库。当前状态页与 AS0 负责记录启动后的真实进度。
