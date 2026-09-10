import { test, expect } from "bun:test";
import { verifySupplementBlob, supplementIndexNames } from "./skill-family-supplement";
import { createHash } from "node:crypto";

test("supplementary resource must match pinned tree byte size and Git blob identity", () => {
  const body = Buffer.from("public resource\n");
  const oid = createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
  expect(verifySupplementBlob({ type: "blob", mode: "100644", sha: oid, size: body.length }, body)).toBe(true);
  expect(() => verifySupplementBlob({ type: "blob", mode: "100644", sha: "0".repeat(40), size: body.length }, body)).toThrow();
  expect(() => verifySupplementBlob({ type: "blob", mode: "120000", sha: oid, size: body.length }, body)).toThrow();
});

test("supplement revisions preserve prior indices and reject escaping or identical destinations", () => {
  expect(supplementIndexNames("sources-with-supplements.json", "sources-with-supplements-2.json")).toEqual({ source: "sources-with-supplements.json", output: "sources-with-supplements-2.json" });
  expect(() => supplementIndexNames("sources.json", "../escape.json")).toThrow();
  expect(() => supplementIndexNames("sources.json", "sources.json")).toThrow();
});
