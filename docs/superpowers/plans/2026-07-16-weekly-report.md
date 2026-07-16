# 本周 Skill IR 汇报稿实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一份覆盖 2026-07-13 至 2026-07-16 全部工作的中文汇报稿，可直接照稿讲解并完成现场文件演示。

**Architecture:** 采用“研究问题校准 + 三条技术主线 + 逐日核对”的混合结构。正文只新增一个权威周报文件，所有数字回指现有提交、结果 JSON/CSV 和组件文档；文档压缩作为周报之后的独立工作，不在本阶段删除证据。

**Tech Stack:** Markdown、PowerShell、Git、Bun、TypeScript、Python。

---

### Task 1: 冻结本周事实清单

**Files:**
- Read: `D:\skill优化\conversation_log.md`
- Read: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Read: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Read: `docs/skill-ir/*run.md`
- Read: `results/skill-ir/env-manager-*/**/*summary.json`

- [x] **Step 1: 核对提交时间范围**

运行：

```powershell
git log --since='2026-07-13 00:00:00 +0800' --until='2026-07-16 23:59:59 +0800' --date=iso-local --pretty=format:'%h %ad %s'
```

预期：周一 3 个、周三 36 个、周四 26 个，共 65 个本周成果提交；周二无提交，不虚构当日开发成果。

- [x] **Step 2: 核对五轮 env-manager 数值**

逐一读取 calibration、static、dual-source、artifact v1、semantic artifact v2 的 committed summary。预期：每轮数字与汇报稿实验表一致，held-out 均未被误写成已执行。

- [x] **Step 3: 核对真实 skill 来源与数量**

读取 `benchmarks/skill-ir/corpus/real-skill-intake.json` 和 `docs/skill-ir/real-skill-intake.md`。预期：来源优先级、候选数量、6 个 pilot 与 3+3 Wave 划分准确。

### Task 2: 编写中文逐步汇报稿

**Files:**
- Create: `docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md`

- [x] **Step 1: 写会前准备和窗口布局**

明确 GitHub Desktop、编辑器、PowerShell 的打开顺序，预展开目录，以及哪些大文件和 raw 结果不现场打开。

- [x] **Step 2: 写完整版本和可压缩版本的逐分钟讲稿**

每个环节包含：时间、屏幕操作、文件路径、建议说法、要证明的结论、衔接语和可跳过项。

- [x] **Step 3: 写三条技术主线**

完整覆盖：

```text
真实 skill / provenance / no-skill
env-manager calibration -> static -> dual-source Final IR
artifact v1 -> semantic artifact v2 -> frozen failed gate
```

- [x] **Step 4: 插入必要命令**

只加入 status/log、package verify、focused tests/typecheck、dry-run、analyzer 和可选 route probe。每条命令写工作目录、前置条件、预期输出、结果解释和现场替代方案；禁止出现 API key 明文或付费重跑命令。

- [x] **Step 5: 写实验结果、限制与下周计划**

明确 engineering mechanism、local activation、paid development evidence、held-out evidence 四层边界。把文档压缩列为周报后的第一项工程治理任务。

- [x] **Step 6: 写追问预案和附录**

覆盖为什么只竖切一个 skill、为什么失败仍有价值、PGO 静态/动态关系、为什么不能跑 held-out、token 主张、跨模型/跨 OS 边界、8.5 MiB bundle、65 个提交和目录导航。

### Task 3: 证据与可运行性验证

**Files:**
- Verify: `docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `D:\skill优化\conversation_log.md`

- [x] **Step 1: 扫描占位符和英文正文漂移**

运行：

```powershell
rg -n 'TBD|TODO|待补充|placeholder' docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md
```

预期：无占位符。英文只用于文件名、命令、schema/catalog 和代码术语。

- [x] **Step 2: 校验所有本地路径**

从汇报稿提取关键路径并用 `Test-Path` 核对。预期：现场要求打开的文件全部存在；本地 raw/workdir 明确标成不提交证据。

- [x] **Step 3: 校验数字和 claim**

用 committed summary 反向核对汇报表，确认 v2 为 0/4、0.625、2 次 repair、0 repaired-to-pass、gate=false、heldOut=false。

- [x] **Step 4: 记录后续文档治理任务**

在主计划增加“文档审计、合并、归档”后续项，规则为先建立引用图和权威入口，再移动或合并历史文档，不直接删除。

- [x] **Step 5: 完成验证和留痕**

运行：

```powershell
git diff --check
rg -n 'sk-[A-Za-z0-9_-]{16,}' docs/skill-ir/weekly-report-2026-07-13-to-2026-07-16.md
```

预期：diff 检查通过，汇报稿无 API-key-like 字符串。随后追加 conversation log、提交并推送。
