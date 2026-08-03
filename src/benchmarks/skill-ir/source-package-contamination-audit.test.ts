import { describe, expect, test } from "bun:test"
import { auditSourcePackageContamination } from "./source-package-contamination-audit.ts"

describe("source package contamination audit", () => {
  test("treats unreferenced skill resources as exposure rather than semantic failure", () => {
    const report = auditSourcePackageContamination({
      taskFiles: [{ path: "document.txt", sha256: "task-document" }],
      skillFiles: [
        { path: "LICENSE.upstream", sha256: "skill-license" },
        { path: "scripts/convert.py", sha256: "skill-script" },
      ],
      outputs: [{ path: "result.md", text: "# Result\n\nNo resource link.\n" }],
      allowedOutputResourceRefs: [],
    })
    expect(report.status).toBe("exposure")
    expect(report.skillOnlyFiles).toEqual(["LICENSE.upstream", "scripts/convert.py"])
    expect(report.collisions).toEqual([])
    expect(report.outputReferences).toEqual([])
    expect(report.confirmedFindings).toEqual([])
  })

  test("detects a generated task artifact that links a skill-only resource", () => {
    const report = auditSourcePackageContamination({
      taskFiles: [{ path: "README.md", sha256: "task-readme" }],
      skillFiles: [{ path: "LICENSE.upstream", sha256: "skill-license" }],
      outputs: [{
        path: "docs/README.zh-CN.md",
        text: "许可证见 [LICENSE](../LICENSE.upstream)。\n",
      }],
      allowedOutputResourceRefs: [],
    })
    expect(report.status).toBe("contaminated")
    expect(report.outputReferences).toEqual([{
      outputPath: "docs/README.zh-CN.md",
      targetPath: "LICENSE.upstream",
      allowed: false,
    }])
    expect(report.confirmedFindings).toContainEqual({
      code: "OUTPUT_REFERENCES_SKILL_ONLY_RESOURCE",
      path: "LICENSE.upstream",
    })
  })

  test("allows an explicitly public resource reference and ignores external links", () => {
    const report = auditSourcePackageContamination({
      taskFiles: [],
      skillFiles: [{ path: "references/guide.md", sha256: "skill-guide" }],
      outputs: [{
        path: "README.md",
        text: "[Guide](references/guide.md) [Web](https://example.org/guide)\n",
      }],
      allowedOutputResourceRefs: ["references/guide.md"],
    })
    expect(report.status).toBe("exposure")
    expect(report.outputReferences).toEqual([{
      outputPath: "README.md",
      targetPath: "references/guide.md",
      allowed: true,
    }])
    expect(report.confirmedFindings).toEqual([])
  })

  test("separates identical provenance ambiguity from a blocking overwrite collision", () => {
    const identical = auditSourcePackageContamination({
      taskFiles: [{ path: "LICENSE", sha256: "same" }],
      skillFiles: [{ path: "LICENSE", sha256: "same" }],
      outputs: [],
      allowedOutputResourceRefs: [],
    })
    expect(identical.status).toBe("risk")
    expect(identical.collisions).toEqual([{ path: "LICENSE", sameDigest: true }])
    expect(identical.confirmedFindings).toEqual([])

    const overwrite = auditSourcePackageContamination({
      taskFiles: [{ path: "config.json", sha256: "task" }],
      skillFiles: [{ path: "config.json", sha256: "skill" }],
      outputs: [],
      allowedOutputResourceRefs: [],
    })
    expect(overwrite.status).toBe("contaminated")
    expect(overwrite.confirmedFindings).toContainEqual({
      code: "SKILL_RESOURCE_OVERWRITES_TASK_INPUT",
      path: "config.json",
    })
  })
})
