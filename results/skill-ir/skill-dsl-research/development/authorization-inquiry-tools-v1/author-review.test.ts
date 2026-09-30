import { test, expect } from "bun:test"
import { authorArtifactReview, authorDigest } from "./author-review.ts"
test("wording variants are accepted by independent semantic review rather than token equality", () => {
  for (const markdown of ["Deny.", "Access denied!", "Only administrators may remove other members."]) {
    const review = authorArtifactReview(markdown, "MD", { artifactSha256: authorDigest(markdown), reviewer: "development-agent", status: "equivalent", rationale: "Reviewed actor, action, negation and current policy against the natural brief.", obligations: [{ requirement: "Administrator-only member removal", candidateExcerpt: markdown, status: "preserved" }], errors: [] })
    expect(review.valid).toBe(true)
    expect(review.semanticStatus).toBe("equivalent")
  }
})
test("actor, negation and policy-version reversals are semantic failures even with valid text", () => {
  for (const kind of ["actor", "negation", "policy-version"] as const) {
    const markdown = "Members may remove administrators under the old policy."
    const review = authorArtifactReview(markdown, "MD", { artifactSha256: authorDigest(markdown), reviewer: "development-agent", status: "incorrect", rationale: "Current user requirement was reversed.", obligations: [{ requirement: "Current administrator-only removal", candidateExcerpt: markdown, status: "changed" }], errors: [{ kind, detail: "Contradicts current natural brief" }] })
    expect(review.valid).toBe(false)
    expect(review.structuralValid).toBe(true)
  }
  expect(authorArtifactReview("Deny", "MD").semanticStatus).toBe("unreviewed")
})
