import path from "node:path"
import { runGeneralSkillDevelopment } from "../../../../src/jit-optimize/general-skill-development.ts"

const h11Dir = path.resolve(import.meta.dir)
const packageDir = path.resolve(process.argv[2] ?? path.join(h11Dir, "package-attempt-001-revision-001"))
const runDir = path.resolve(process.argv[3] ?? path.join(h11Dir, "natural-consumption-run-001"))

const report = await runGeneralSkillDevelopment({
  skillDir: packageDir,
  runDir,
  model: "xty/gpt-5.6-sol",
  timeoutMs: 600_000,
  resources: [],
  fixtures: {
    "incoming/renamed-statute.txt": [
      "中华人民共和国示例消费者权益法",
      "第一章 总则",
      "第一条 为了保护消费者合法权益，制定本法。",
      "（一）诚实信用；（二）公平交易。",
      "第二条 经营者应当依法履行义务。",
      "",
    ].join("\n"),
  },
  protectedFixturePaths: ["incoming/renamed-statute.txt"],
  task: [
    "把 ./incoming/renamed-statute.txt 转换为 Markdown；这是一份法律文本。",
    "把转换程序的输出根目录设为 ./outputs，并使用最小产物级别。不得修改输入、安装依赖或联网。",
    "命令完成后，读取生成的审核报告和最终成果，确认审核结论、标题层级及输入字符是否完整保留。",
    "最后写 ./completion-audit.json，内容必须是 JSON 对象并记录 classification、commandSucceeded、reviewApproved、deliverableInspected、inputPreserved 五项。",
  ].join(" "),
  expectedFiles: [
    {
      path: "outputs/renamed-statute/renamed-statute+审核报告.md",
      includes: ["最终审核结论：通过", "是否可交付：是"],
    },
    {
      path: "outputs/renamed-statute/renamed-statute+最终成果.md",
      includes: ["# 中华人民共和国示例消费者权益法", "##### 第一条", "##### 第二条"],
    },
    { path: "completion-audit.json" },
  ],
  residualEvidenceFiles: ["completion-audit.json"],
})

console.log(JSON.stringify(report, null, 2))
if (report.status !== "passed") process.exitCode = 1
