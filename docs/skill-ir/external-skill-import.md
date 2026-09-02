# External Skill Import Staging Bundle

本文定义 P2 的通用 external-skill import 合同。该合同把用户已经准备好的本地 skill source closure、review 资产和显式成本证据冻结为可移植 staging bundle，再交给现有 verified-artifact product CLI。它不实现第二套 runtime，也不声称 bundle 离开 SkVM 后可以独立执行。

## 1. 目标

P2 提供：

- 可执行的通用 library/CLI；
- 机器可读、digest-bound 的 import recipe 与 import manifest；
- `--root=<bundle>` 下完全自洽的 `workflow-config.json`；
- 对 source、license、review plan/patch/dependency、可选 checker 和 compact cost evidence 的显式闭包；
- 一个 Magpie shadow case 和一个非 Magpie fixture，证明 importer 没有 skill-id 分支。

P2 只证明 staging 合同和现有 product CLI 的组合可工作。**Bundle 不是独立运行时**；运行解释器仍是当前 SkVM checkout 中的 product CLI/library，搬走 bundle 本身不能脱离 SkVM 执行。

## 2. 非目标

P2 不执行 Git clone/fetch，不访问网络，不自动发现 `SKILL.md` 引用，不递归猜 patch/checker dependency，不调用模型/API，不读取 held-out，不打包 raw/model-run/workdir，不修改 P1、portfolio、readiness 或 `src/index.ts`。

Importer 不生成 review 逻辑，不判断 semantic parity，不推测人工时间，不从 evidence 重算 token break-even。Recipe 仍是人工审核的显式文件清单，因此 P2 不是 automatic optimizer 或 live-source import claim。

## 3. 备选方案

### 3.1 采用：可移植 staging bundle

Importer 将显式输入复制到新目录，重写 workflow config 为 bundle 内相对路径，并生成可独立复核的 closure manifest。该方案能离开原 source checkout 保存输入证据，同时保持 import 与 product execution 分层。

### 3.2 不采用：只索引本地 checkout

只保存原目录路径的实现更小，但目录移动后不可重放，并会重复 P1 的仓库内路径绑定问题。

### 3.3 不采用：import 后立即执行 product

单命令同时 import、执行 checker 和生成质量/成本结论会把来源冻结与产品声明混在一起，难以区分 staging failure 与 product failure。

## 4. 输入合同

CLI 接受：

```text
--recipe=<external-skill-import-recipe.json>
--source-root=<prepared-local-source-directory>
--asset-root=<prepared-local-review-asset-directory>
--out=<new-empty-bundle-directory>
```

`source-root` 和 `asset-root` 只存在于进程参数，不写入 manifest。Recipe 中所有文件路径都相对各自 root，并使用 POSIX `/`。Recipe 至少声明：

- `importId` 与 `workflowId`；
- upstream repository、40 位 commit、upstream skill path；
- SPDX license expression、license 文件与主 `SKILL.md`；
- source closure 的每个文件；
- task description、automatic plan、review patch 和 patch dependency；
- review public interface、LOC、human minutes 或明确 missing reason；
- production one-time token 与 original runtime measured/missing 字段；
- measured original runtime 使用的 compact evidence 文件；
- B-default `user-accepted` 或 A-optional `machine-checked`；A 模式显式列出 checker 入口及其 dependency closure。

文件声明包含输入相对路径、bundle 目标相对路径和角色。Importer 不扫描未声明文件来补闭包。Patch/checker dependency 的目标布局必须保持其相对 import 可在 bundle 内解析；recipe 作者负责把所有静态依赖列全。

## 5. 输出布局

```text
<bundle>/
  source/
    SKILL.md
    ...explicit source closure...
  recipe/
    task-description.json
    automatic-plan.json
    review/
      patch.ts
      ...explicit patch dependencies...
    checker/
      checker.ts
      ...explicit checker dependencies...
    evidence/
      ...compact evidence only...
  workflow-config.json
  import-manifest.json
```

具体子路径由 recipe 显式给出，但必须位于 `source/` 或 `recipe/`。`workflow-config.json` 通过现有 `VerifiedArtifactWorkflowConfigSchema`，其中所有 path 都是 bundle 内相对路径。执行时使用：

```powershell
bun run ./src/skill-ir/verified-artifact-cli.ts `
  --root=<bundle> --config=workflow-config.json `
  --workdir=<prepared-workdir> --out=<empty-product-directory>
```

上述命令中的 CLI 来自 SkVM；bundle 不是独立 runtime。

## 6. Import manifest

`import-manifest.json` 使用 `skill-ir-external-skill-import-manifest/v1`，至少绑定：

- import/workflow identity 与 upstream provenance；
- primary skill、license、source、review、checker、evidence 的逐文件 role/path/bytes/SHA-256；
- `workflow-config.json` 的 path/SHA-256；
- 对排序后的全部 production records 计算的 closure SHA-256；
- `networkAccesses=0`、`modelCalls=0`、`apiCalls=0`、`paidCalls=0`、`heldOutAccesses=0`；
- `runtime="existing-skvm-product-cli-required"`；
- `automaticDiscovery=false`、`costRecomputed=false`。

Manifest 不保存本机绝对路径、secret、模型正文、raw observation、workdir 或 evaluator payload。

## 7. 路径与闭包安全

Importer 和 verifier 均须 fail closed：

1. 拒绝空路径、绝对路径、反斜线、`.`、`..`、NUL、重复输入和重复目标；
2. 输入文件及其路径祖先必须是 regular non-symlink directory/file；
3. 拒绝目录、symlink 和特殊文件作为声明文件；
4. 主 `SKILL.md` 与 license 必须属于 source closure；
5. bundle 输出路径在 v1 中必须尚不存在；importer 在同级临时目录构建，失败时删除部分输出，验证通过后原子 rename；
6. verifier 重新枚举 bundle，任何缺失、额外或 digest 漂移均失败；
7. workflow config 的全部 file reference 必须指向 manifest 中相应角色的文件；
8. patch 与 checker 分别在自己的声明 closure 中解析静态相对 import，不能互相借文件；动态 import/require 被拒绝。Node builtin 可由现有 SkVM runtime 提供，review patch 的第三方 package 仍受 product audit 限制为 `zod`；
9. evidence 角色只接受 recipe 明确声明的 compact JSON 文件，路径或内容命中 raw/model-run/workdir 禁区即拒绝。

## 8. 数据流

```text
prepared local source + reviewed recipe assets
-> parse strict recipe
-> preflight every declared input/path/type
-> copy exact bytes into temporary staging directory
-> compute file digests
-> derive bundle-relative VerifiedArtifact workflow config
-> validate workflow config and static dependency closure
-> write import manifest
-> verify exact bundle closure
-> atomically publish output directory

explicit later action:
bundle + existing SkVM product CLI + prepared workdir
-> artifact product closure
```

Import 阶段不 import/execute checker 或 patch。它们只在后来显式运行 product CLI 时由既有审计和 runtime 消费。

## 9. Magpie shadow

P1 的配置、runner、九份 product closure 与 compact report保持逐字节不变。P2 新增 Magpie import recipe，并在临时目录：

1. 从现有固定 public source 和 review/checker/evidence 资产构建 staging bundle；
2. 证明 bundle manifest 没有原 checkout 绝对路径，workflow config 的 file reference 全部位于 bundle；
3. 只物化 `step-0-preflight/case-1-clean-pass` 一个公开 workdir；
4. 使用现有 product CLI 的 `--root=<bundle>` 跑完五阶段并调用 product validator；
5. 将最终 `release-audit-output.json` SHA-256 与 P1 同 case 的冻结输出 digest 比较；
6. 记录本阶段 original rerun、model/API/paid、held-out 均为 0。

该 shadow 不创建新的九案例实验身份，不重跑 original，不修改 P1 report。**P2 checker 只是 P1 output-digest 回归检查，不是 P1 独立 machine-checked 语义 checker 的搬迁**；它用于确认当前薄适配与冻结输出字节未漂移，不扩张语义主张。

Shadow 的 `report.md` 是用户输入 fixture，**不在 bundle 内**；bundle 只承载 skill source、review 资产、显式 checker/evidence 闭包，workdir 仍由后续 product 运行准备。因此该验证不是“整任务目录可搬运”。

## 10. 非 Magpie fixture

仓库内 fixture 位于 `src/skill-ir/fixtures/external-import-basic/`，包含 source、MIT license、task description、automatic plan、review patch 和手写 recipe。测试通过同一个 public importer API 生成 bundle，将 bundle 移到另一个临时目录后以现有 product workflow 执行并通过 product validator。测试还扫描 importer production source，确保没有 Magpie/known skill id 分支。

该 fixture 证明通用路径与路径安全，不构成外部项目泛化或质量研究证据。

## 11. 测试与验证

实现严格使用 TDD：

- recipe/manifest schema 和路径拒绝测试；
- symlink、missing/extra/digest drift、非空输出目录测试；
- patch/checker 显式 dependency closure 测试；
- workflow config 全 bundle-relative 与 `--root=<bundle>` 测试；
- compact evidence allowlist/denylist 测试；
- 非 Magpie import/verify 集成测试；
- Magpie 单 case shadow product test；
- focused tests、相关 verified-artifact tests、typecheck、文档链接、`git diff --check`；
- staged-index 或等价 archive 验证，保证测试不意外依赖未跟踪文件。

## 12. 修改边界

已新增 `external-skill-import.ts`、`external-skill-import-cli.ts`、对应 tests、checked-in 非 Magpie fixture、Magpie recipe/shadow runner/checker 与 compact report。现有 product bundler 只增加了 project-external entrypoint 对 SkVM 自带 `zod` 的窄 resolver，并在失败时报告具体节点；`src/index.ts`、P1 冻结输入/结果、portfolio/readiness 均未修改。

## 13. 已实现 API 与 CLI（2026-09-02）

Library exports：

- `ExternalSkillImportRecipeSchema` / `ExternalSkillImportManifestSchema`；
- `importExternalSkill({ recipe, sourceRoot, assetRoot, out })`；
- `verifyExternalSkillImportBundle(bundleDir)`；
- `ExternalSkillImportRelativePathSchema` 与对应 TypeScript types。

CLI 位于 `src/skill-ir/external-skill-import-cli.ts`。成功时 stdout 只写一行 JSON，包含 `status=complete`、bundle 绝对位置（只作为本次进程结果，不写入 bundle）、import/workflow id、manifest/config 相对路径和 closure digest；失败时只向 stderr 写简洁诊断并以非零退出。CLI 不自动执行 product。

Manifest v1 记录每个 production file 的 id、role、bundle-relative path、bytes、SHA-256，并记录 workflow config digest、排除 manifest 自身后的 production closure digest、五类零活动计数、`runtime=existing-skvm-product-cli-required`、`automaticDiscovery=false` 与 `costRecomputed=false`。Verifier 重新枚举 exact file set，重验 file/config/closure digest、workflow role binding、patch/checker 分离闭包和 compact evidence。

Magpie recipe 的 production bundle 为 8 个显式文件：主 `SKILL.md`、license、task description、reviewed plan、薄 patch、patch 的相对实现依赖、self-contained one-case digest checker、003 compact report。该 checker 只做 P1 output-digest 回归，不等于 P1 的独立语义 checker。Shadow 只物化 `step-0-preflight/case-1-clean-pass`，其中 `report.md` 留在外部 workdir fixture，不进入 bundle；调用 `runVerifiedArtifactCli` 五阶段和 `validateVerifiedArtifactProduct`，输出 digest 为 `3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e`。机器报告位于 `results/skill-ir/external-skill-import-magpie-shadow-v1/report.json`；它记录 original rerun/model/API/paid/network/held-out 均为 0，研究资格仍为 `not-eligible`。

未来修改 recipe/schema 时必须保持 v1 fail-closed：新增角色、自动发现、额外 package resolver、成本推导或独立 runtime 声明都属于合同扩张，不能作为无版本的兼容修补。
