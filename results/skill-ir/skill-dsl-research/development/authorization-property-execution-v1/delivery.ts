import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import assert from "node:assert/strict"
import { prepareConsumerInput } from "./consumer.ts"
import { loadSkill, copySkillBundle } from "../../../../../src/core/skill-loader.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
async function inventory(directory: string, prefix = ""): Promise<Array<{ path: string; bytes: number; sha256: string }>> {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name, file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await inventory(file, relative))
    else if (entry.isFile()) { const bytes = await readFile(file); files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) }) }
    else throw new Error("Unexpected link in deliverable")
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** Artifact packaging only. Public CLI checks are zero-inference; no run command is executed. */
export async function buildDelivery(destination: string, root = import.meta.dir) {
  const repo = path.resolve(root, "../../../../.."), dest = path.resolve(destination), rows: any[] = [], commands: any[] = []
  await mkdir(path.dirname(dest), { recursive: true })
  try { await mkdir(dest, { recursive: false }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; assert.deepEqual(await readdir(dest), [], "Destination must be new or empty") }
  const cli = (args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(repo, "src/index.ts"), "authorization", "inquiry", ...args], { cwd: dest, encoding: "utf8", env: { ...process.env, SKVM_AUTO_PROBE: "0" }, maxBuffer: 32 * 1024 * 1024 })
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout)
    commands.push({ arguments: args, exitCode: result.status, stdoutSha256: sha(result.stdout), stderr: result.stderr, providerCalls: 0 })
    return args[0] === "--help" ? result.stdout : JSON.parse(result.stdout)
  }
  cli(["--help"])
  for (const [name, attempt] of [["download", "author-download"], ["owui", "author-owui"]]) {
    const author = path.join(root, "attempts", attempt!, "original"), claim = await json(path.join(author, "claim.json")), out = path.join(dest, name!)
    const prepared = await prepareConsumerInput({ originalInputFile: claim.inputFile, authorAttempt: author, destination: out }), input = await loadInquiryInput(claim.inputFile)
    const skill = await loadSkill(claim.skillFile), skillDir = path.join(out, "skill"), skillFiles = []
    await mkdir(skillDir); await copyFile(skill.skillPath, path.join(skillDir, "SKILL.md")); await copySkillBundle(skill, skillDir)
    for (const relative of ["SKILL.md", ...skill.bundleFiles].sort()) {
      const bytes = await readFile(path.join(skillDir, relative)), identity = claim.skillIdentity.find((f: any) => f.file === relative)
      assert.ok(identity); assert.equal(sha(bytes), identity.sha256); assert.equal(bytes.length, identity.bytes)
      skillFiles.push({ path: relative, sha256: sha(bytes), bytes: bytes.length })
    }
    assert.equal(skillFiles.length, claim.skillIdentity.length)
    assert.ok(input.value.brief)
    await writeFile(path.join(out, "original-task.txt"), input.value.brief, { flag: "wx" })
    await save(path.join(out, "natural-input.json"), { ...input.value, sourceRoot: "source" })
    await mkdir(path.join(out, "provenance")); await copyFile(claim.inputFile, path.join(out, "provenance", "input-original.json"))
    await save(path.join(out, "provenance", "source-files.json"), prepared.sourceFiles)
    if (name === "owui") {
      await copyFile(path.join(input.context.sourceRoot, "LICENSE"), path.join(out, "provenance", "SOURCE-LICENSE"))
      await copyFile(path.join(input.context.sourceRoot, "source.json"), path.join(out, "provenance", "source-manifest-original.json"))
    }
    const checked = cli(["check", "--input=" + prepared.inputFile, "--method=M", "--strategy=operation-evidence-v4"])
    assert.equal(checked.status, "valid"); assert.deepEqual(checked.sourceFiles, prepared.sourceFiles)
    const clone = path.join(out, "declared-copy.json")
    cli(["init", "--from=" + prepared.inputFile, "--out=" + clone]); assert.deepEqual(await json(clone), await json(prepared.inputFile))
    rows.push({ name, sourceInputSha256: claim.inputSha256, authoredInputSha256: prepared.authoredInputSha256, authoredUsageSha256: sha(await readFile(path.join(out, "USAGE.md"))), sourceFiles: prepared.sourceFiles, skillFiles, originalNaturalTaskField: "brief (exact text)", publicCheck: "valid", actualConsumerModelRun: false, semanticRepair: false })
  }
  const download = path.join(dest, "download"), base = await json(path.join(download, "inquiry.json")), registered = path.resolve(root, "../authorization-source-assisted-closure-v1/model/inputs")
  const policy = await loadInquiryInput(path.join(registered, "paperless-download-policy.json")), premise = await loadInquiryInput(path.join(registered, "paperless-download-premise.json")), source = await loadInquiryInput(path.join(registered, "paperless-download-source.json")), changes = path.join(download, "changes")
  await mkdir(changes)
  await save(path.join(changes, "policy.json"), { ...structuredClone(base), sourceRoot: "../source", inquiry: { ...structuredClone(base.inquiry), mode: "conformance", policy: policy.value.inquiry!.policy } })
  const texts = [...new Set(premise.value.inquiry!.questions.flatMap(q => q.premises).map(p => p.text).filter(t => t.startsWith("The authenticated caller owns the requested document.")))]; assert.equal(texts.length, 1)
  const edit = { schemaVersion: "authorization-inquiry-edit/v1", reason: "Apply the registered ownership fact to the complete unchanged task; supersede only the original unspecified ownership premise.", operations: base.inquiry.questions.map((q: any) => ({ kind: "premises", questionId: q.id, premises: [...q.premises.filter((p: any) => p.text !== "Ownership and object grants are unspecified."), { text: texts[0], origin: "user" }] })) }
  await save(path.join(changes, "premise-edit.json"), edit)
  cli(["edit", "--input=" + path.join(download, "inquiry.json"), "--edit=" + path.join(changes, "premise-edit.json"), "--out=" + path.join(changes, "premise.json")])
  const changedFiles = await copySourceSnapshot({ ...source.context, maxReadBytes: 33554432 }, path.join(download, "source-changed"))
  assert.equal(changedFiles.length, rows[0].sourceFiles.length)
  const diff = changedFiles.filter(f => rows[0].sourceFiles.find((g: any) => g.path === f.path)?.sha256 !== f.sha256)
  assert.equal(diff.length, 1); assert.equal(diff[0]!.path, "src/documents/views.py")
  await save(path.join(changes, "source.json"), { ...structuredClone(base), sourceRoot: "../source-changed" })
  for (const kind of ["policy", "premise", "source"]) {
    const checked = cli(["check", "--input=" + path.join(changes, kind + ".json"), "--method=M", "--strategy=operation-evidence-v4"])
    assert.equal(checked.status, "valid"); assert.deepEqual(checked.sourceFiles, kind === "source" ? changedFiles : rows[0].sourceFiles)
    assert.deepEqual(checked.input.inquiry.questions.map((q: any) => q.id), base.inquiry.questions.map((q: any) => q.id))
  }
  const historical = await json(path.join(root, "attempts/inquiry-download-original/material-reactivation/report.json"))
  assert.equal(cli(["inspect", "--out=" + historical.sessionPath]).status, "completed")
  const comparison = cli(["compare", "--input=" + path.join(changes, "premise.json"), "--previous=" + historical.sessionPath, "--strategy=operation-evidence-v4"])
  assert.equal(comparison.providerCalls, 0); assert.equal(comparison.answerReused, false)
  await save(path.join(changes, "change-provenance.json"), { schemaVersion: "authorization-portable-changes/v1", policyInputSha256: policy.inputSha256, premiseInputSha256: premise.inputSha256, sourceInputSha256: source.inputSha256, originalAuthoredInputSha256: rows[0].authoredInputSha256, policyModeChange: "behavior to conformance required for independent policy", premiseUpdate: "Replace unspecified ownership with registered fact; retain all other premises and all four original questions.", sourceChange: diff, sourceFiles: changedFiles, previousSessionSupplied: false, actualChangedModelRuns: 0 })
  await copyFile(path.join(root, "account-boundary.json"), path.join(dest, "account-boundary.this-machine.json"))
  await writeFile(path.join(dest, "README.md"), [
    "# AX 完整授权任务包", "",
    "本包包含Download和OWUI两个完整原skill、模型作者声明及原Usage、完整原自然任务和允许范围的全源码快照。Download原/变各95文件；OWUI允许范围173文件，原LICENSE及174项来源清单另存provenance。每个skill含SKILL.md及生产loader列出的全部附属文件，身份见manifest.json。", "",
    "五份原/变声明的公开check及init/edit/inspect/compare在仓库外零推理执行。两份作者声明尚未经真实模型消费者执行；三变化仅准备与结构检查通过，不构成新版本复用或质量成功。", "",
    "打开COMMANDS.md，从已有SkVM checkout执行。依赖为Bun1.3.14与SkVM提交9039fd3ff92c0498a7a758ce632939b8d5fc140b、src tree6042b79e0971f6f84e8737e48ea56ad6b5d94a7a。本包不要求在包目录安装依赖。", "",
    "原作者USAGE.md和inquiry.json字节不改；COMMANDS.md补核实接口。natural-input.json仅重定位sourceRoot；original-task.txt取原input完整brief，不从生成问题反推任务。provenance/input-original.json保留原件，其中历史相对路径不直接运行。", "",
    "Download policy显式转为conformance并采用登记独立政策；premise只更新登记所有权，source只转向单文件改变的完整副本，原作者四题全部保留。未注入开发者正确答案或授权图。", "",
    "gpt-5.6-sol/high官方实验通道已返回usageLimitExceeded，最后原状态completion-unknown保留。普通应用使用元数据不能证明此通道恢复；先检查裁定未决尝试再恢复实验。本包不自动重发、切换模型、购买或重置额度。", "",
    "account-boundary.this-machine.json只适用于原机器已审阅通用指令的path/SHA；迁移后按当前实际配置审阅并提供boundary，不能自动信任别的机器政策。账号命令经静态合同核实，本轮未实际调用。", "",
    "完整skill其余调查、覆盖、验证和报告职责继续适用。真实部署、目标执行、完整质量、净收益及人工耗时尚未建立。", ""
  ].join("\n"), { flag: "wx" })
  await writeFile(path.join(dest, "COMMANDS.md"), [
    "# 已核实命令", "", "在本包根目录打开PowerShell，使用已有SkVM与Bun。以下check/init/edit均零模型调用。", "",
    "    $SkVM = 'D:\\skill优化\\SkVM'", "    $Package = (Get-Location).Path", "    $Input = Join-Path $Package 'download\\inquiry.json'", "    $Skill = Join-Path $Package 'download\\skill\\SKILL.md'", "    $Boundary = Join-Path $Package 'account-boundary.this-machine.json'", "",
    '    bun "$SkVM\\src\\index.ts" authorization inquiry check "--input=$Input" --method=M --strategy=operation-evidence-v4',
    '    bun "$SkVM\\src\\index.ts" authorization inquiry init "--from=$Input" "--out=$Package\\download\\my-declaration.json"',
    '    bun "$SkVM\\src\\index.ts" authorization inquiry edit "--input=$Input" "--edit=$Package\\download\\changes\\premise-edit.json" "--out=$Package\\download\\my-premise.json"', "",
    "原/变检查选择download/changes/policy.json、premise.json、source.json；OWUI替换Input和Skill为owui目录。init/edit输出新JSON文件，已有目标拒绝覆盖。inquiry edit使用authorization-inquiry-edit/v1；policy edit只适用conformance声明。", "",
    "额度通道恢复且未决请求完成检查/裁定后，以下账号命令才可执行。模型固定gpt-5.6-sol，effort在适配器固定high，无effort参数。选择新的输出目录。", "",
    '    bun "$SkVM\\src\\index.ts" authorization inquiry run "--input=$Input" "--skill=$Skill" "--out=$Package\\account-runs\\download" --method=M --strategy=operation-evidence-v4 --harness=codex-account --model=gpt-5.6-sol "--account-boundary=$Boundary" --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --session-timeout-ms=2700000', "",
    "    $Previous = '绝对路径到实际新会话的sessions子目录'",
    '    bun "$SkVM\\src\\index.ts" authorization inquiry inspect "--out=$Previous"',
    '    bun "$SkVM\\src\\index.ts" authorization inquiry compare "--input=$Package\\download\\changes\\premise.json" "--previous=$Previous" --strategy=operation-evidence-v4',
    '    bun "$SkVM\\src\\index.ts" authorization inquiry run "--input=$Package\\download\\changes\\premise.json" "--skill=$Skill" "--out=$Package\\account-runs\\premise-previous" "--previous=$Previous" --method=M --strategy=operation-evidence-v4 --harness=codex-account --model=gpt-5.6-sol "--account-boundary=$Boundary" --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --session-timeout-ms=2700000', "",
    "compare零模型调用、不复用旧答案；只有生产入口实际判可复用后才加previous。fresh不传previous，policy/source选择对应变化文件。不同生产版本不合并为同版本效果。", "",
    '    $Task = Get-Content -LiteralPath "$Package\\download\\original-task.txt" -Raw -Encoding UTF8',
    '    bun "$SkVM\\src\\index.ts" run "--skill=$Skill" "--prompt=$Task" "--authorization-scope=$Input" --authorization-domain-tools=true --authorization-method=M --authorization-strategy=operation-evidence-v4 --adapter=codex-account --model=gpt-5.6-sol "--authorization-account-boundary=$Boundary" --authorization-max-tool-calls=64 --authorization-max-display-bytes=786432 --authorization-max-read-bytes=33554432 --authorization-session-timeout-ms=2700000', "",
    "inspect/compare本轮在现存历史会话验证，只证明公共命令和零调用行为；该partial baseline问题结构与作者稿不同，不能据此声称消费、复用或当前模型质量通过。", ""
  ].join("\n"), { flag: "wx" })
  const files = await inventory(dest), manifest = { schemaVersion: "authorization-portable-package/v1", date: "2026-10-07", runtimeTree: execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), packages: rows, files, newInference: 0, targetExecutions: 0, actualModelConsumers: 0, actualChangedModelRuns: 0 }
  await save(path.join(dest, "manifest.json"), manifest)
  const verification = { schemaVersion: "authorization-ax-portable-verification/v1", destination: dest, manifestSha256: sha(await readFile(path.join(dest, "manifest.json"))), fileCountIncludingManifest: files.length + 1, commands, sourceTree: manifest.runtimeTree, packages: rows.map(r => ({ name: r.name, indexedSourceFiles: r.sourceFiles.length, skillFiles: r.skillFiles.length, authoredInputSha256: r.authoredInputSha256, publicCheck: r.publicCheck, actualConsumerModelRun: false })), changedSourceFiles: diff, newInference: 0, targetExecutions: 0, scoutCorrections: ["inquiry edit outputs JSON and uses authorization-inquiry-edit/v1; local-edit belongs to a different CLI.", "Original natural task is input brief, not generated question text.", "OWUI LICENSE is outside allowed backend paths, retained with original174-entry source manifest."] }
  await writeFile(path.join(root, "verification/portable-package.json"), JSON.stringify(verification, null, 2) + "\n")
  return verification
}
if (import.meta.main) { const result = await buildDelivery(process.argv[2] ?? "D:/skill优化/deliverables/authorization-property-execution-v1-2026-10-07"); console.log(JSON.stringify({ destination: result.destination, files: result.fileCountIncludingManifest, commands: result.commands.length, packages: result.packages, newInference: 0 })) }
