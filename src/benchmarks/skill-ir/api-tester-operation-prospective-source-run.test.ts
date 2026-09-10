import { describe, expect, test } from "bun:test";
import {
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR,
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH,
  parseApiTesterOperationProspectiveSourceCommand,
} from "./api-tester-operation-prospective-source-run";

describe("API Tester prospective source command", () => {
  test("accepts only the frozen acquisition and verification surfaces", () => {
    expect(parseApiTesterOperationProspectiveSourceCommand([
      "--mode=acquire",
      "--root=D:/repository",
      `--freeze=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`,
      "--freeze-commit=e4c006fe32a6321ce5e4696758d53024c160f6db",
      `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`,
      "--selected-at=2026-09-10T13:00:00.000Z",
      "--node=C:/Program Files/nodejs/node.exe",
      "--git=git",
    ])).toMatchObject({
      mode: "acquire",
      outputDir: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR,
      selectedAt: "2026-09-10T13:00:00.000Z",
    });

    expect(parseApiTesterOperationProspectiveSourceCommand([
      "--mode=verify",
      "--root=.",
      `--freeze=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`,
      "--freeze-commit=e4c006fe32a6321ce5e4696758d53024c160f6db",
      `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`,
      "--node=node",
      "--git=git",
    ])).toMatchObject({ mode: "verify", selectedAt: undefined });

    expect(() => parseApiTesterOperationProspectiveSourceCommand([
      "--mode=acquire", "--root=.", `--freeze=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`,
      "--freeze-commit=e4c006fe32a6321ce5e4696758d53024c160f6db", `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`,
      "--node=node", "--git=git",
    ])).toThrow(/selected-at.*required/iu);
    expect(() => parseApiTesterOperationProspectiveSourceCommand([
      "--mode=acquire", "--root=.", `--freeze=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`,
      "--freeze-commit=e4c006fe32a6321ce5e4696758d53024c160f6db", "--out=results/alternate",
      "--selected-at=2026-09-10T13:00:00.000Z", "--node=node", "--git=git",
    ])).toThrow(/--out must be/iu);
    expect(() => parseApiTesterOperationProspectiveSourceCommand([
      "--mode=verify", "--root=.", `--freeze=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`,
      "--freeze-commit=e4c006fe32a6321ce5e4696758d53024c160f6db", `--out=${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`,
      "--node=node", "--git=git", "--query=topic:changed",
    ])).toThrow(/unknown argument/iu);
  });
});
