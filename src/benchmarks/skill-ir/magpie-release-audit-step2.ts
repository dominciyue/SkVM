import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const UPSTREAM_COMMIT = "453dd9f20bdebe9d4458d84682bd707be1414f80";
const SLICE_ROOT = "benchmarks/skill-ir/pilots/magpie-release-audit";

type ImportedRole = "public-input" | "checker-only";

type ImportedFileSeed = {
  upstreamPath: string;
  gitBlobSha: string;
  sha256: string;
};

export type MagpieImportedFile = ImportedFileSeed & {
  localPath: string;
  role: ImportedRole;
  bytes: number;
};

export const MAGPIE_RELEASE_AUDIT_CASE_IDS = [
  "step-0-preflight/case-1-clean-pass",
  "step-0-preflight/case-2-audit-log-path-missing",
  "step-0-preflight/case-3-planning-issue-not-found",
  "step-1-gather-record/case-1-all-data-present",
  "step-1-gather-record/case-2-partial-data",
  "step-2-assemble-record/case-1-full-record",
  "step-2-assemble-record/case-2-missing-fields",
  "step-2-assemble-record/case-3-injection-in-planning-issue",
  "step-2-assemble-record/case-4-all-required-missing",
] as const;

export type MagpieReleaseAuditCaseId = typeof MAGPIE_RELEASE_AUDIT_CASE_IDS[number];

const FILES: readonly ImportedFileSeed[] = [
  { upstreamPath: "LICENSE", gitBlobSha: "de106cd2b55bb72df9325557f160aa7220437993", sha256: "849cf7a6cd2a1a7ef40ae7159255e9c73f9bc75cc93474993791dfe4b71340aa" },
  { upstreamPath: "skills/release-audit-report/SKILL.md", gitBlobSha: "5a9740001a7a12886bcdf9b50581e53118f7580d", sha256: "750e114c6954d0982cd1090c2d06723934c91be31df612cfb58e13abc7f04f93" },
  { upstreamPath: "skills/release-audit-report/audit-record-schema.md", gitBlobSha: "a692eb289c6cae70c9b828342a9a0fcf843d87e4", sha256: "7d66edadc52e0b6f13f0ab4135dff4d6415a9a4d4ec6a41bdca2c735539fc8d4" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/README.md", gitBlobSha: "b4395b9e2bbc3471d66ec6cc5e2355c803c6410e", sha256: "647b5af2d8d3ab355b4845fe098e30b07adf574ec7e438659e6de037620524bd" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/step-config.json", gitBlobSha: "e31e661a88c33d151dbf5807d2895e6392439f8f", sha256: "75970974c07d3b3f9a7a12bd529f1a47824fc9c246481bf2683515ccdd243dbc" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/output-spec.md", gitBlobSha: "64e51dfecb40af2956028650397acf9bbafe29ba", sha256: "49763071d0a647bda37c7319b9564244e8a6021962e0e60ebbf7cb88d44791dc" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/assertions.json", gitBlobSha: "6918e88692e9909222dd3a17087a8589c014977a", sha256: "1589ab5eb35c3aacf1d1dcc004a5941c85d5db0330f92703b0fbcfdd74276d34" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-1-clean-pass/report.md", gitBlobSha: "c25e5e13f9d3b2bc9c8c88ced2ce451d385d555d", sha256: "730f3bad2b63871734e6b04b5ff3d2bb696f7edb33af2696f663ca1c34bdc717" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-1-clean-pass/expected.json", gitBlobSha: "7d76cdb7c8a81c7bbc424889002117e8924f9b8f", sha256: "3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-2-audit-log-path-missing/report.md", gitBlobSha: "3b1783e5f7818eaeb5f9a7633febe28f4d4adb82", sha256: "aedd25113541a348c5c03496485fd1852948b5f566c455e128d1ee9cfd3e5524" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-2-audit-log-path-missing/expected.json", gitBlobSha: "5b89e8397a217299cf5c35f8607d87cdbfbdfafb", sha256: "6ca4574e33d2f8710a22686670f0ad970637af5aeb597246744f9c65edbd88ad" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-3-planning-issue-not-found/report.md", gitBlobSha: "14b13784628fc97d2757cfaaca5ed0f67325eadb", sha256: "ab33886b4216122134db796ce6a309d92e904d2e21e01ac396f27b2171fe422f" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-0-preflight/fixtures/case-3-planning-issue-not-found/expected.json", gitBlobSha: "18a004ae0edef323bd8ec3e9eac6681e1d69bccc", sha256: "e631cc519233100e23c6316f67c3272f4fdcb966404efdef07649a3ae99e0810" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/step-config.json", gitBlobSha: "2d6948b33ba5b2320122d8cf5d9fd2f8ddd2e9df", sha256: "0ae031510a7ea5404bcab6683b41b58c3060162fa2b24153a76fc881cf95fe4c" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/output-spec.md", gitBlobSha: "d3b336de19cb40bfa9078aee21768fea236cc1b0", sha256: "7cbc3ebc8aa642ca115da12952bf08fbe78d2347222d17f6d0548d36045f9edc" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/assertions.json", gitBlobSha: "ce41fc67e0ba38da50661a332eb6989975229b1a", sha256: "f8d6a45bbba2875c79adaff99917ba7aaa0b1ef223fd9313cc88514e72110d60" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/case-1-all-data-present/report.md", gitBlobSha: "ea0c1fd9a6bbdf9b5ef5f4ad0332985b93e3e382", sha256: "7d0ce024bf45de1d51f2bc959daaf8afaf2dc0b170de65e5e554758f7cfaf1ac" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/case-1-all-data-present/expected.json", gitBlobSha: "89a3985d1790d402dcefc30599631caa30f4f49d", sha256: "83af1182c4240ded0f79ff2a645a0b72790443c8cc77b56e950798ac5714a338" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/case-2-partial-data/report.md", gitBlobSha: "d3fd148b7baa4e43e1b13303e1436ddd3c6ca2ac", sha256: "1170cbb8b2cca5f3d5810282cc6bee9c34e6958999e77b5afe4b8fd58b06ba78" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-1-gather-record/fixtures/case-2-partial-data/expected.json", gitBlobSha: "ddc64f0134b61dee5e8b18c6f57f16f2134b5da1", sha256: "504083daba461549a35253b112c9b74946b76b9def8b305ff0cc375e4e7aa30a" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/step-config.json", gitBlobSha: "4b2ce8e87cede2ab9d05fce3df54e176627afef1", sha256: "62f745cbbd46d9e148e333a57cca26f0df5d291e09196749e9c6e48ba49c66f4" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/output-spec.md", gitBlobSha: "8165afeb7209134f2737fc48dc34c27d8d177a8a", sha256: "f9c09a07f45c7aa5067ef81ad547acf2a88ff6e640f8473519a4e301e35a3e1c" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/assertions.json", gitBlobSha: "04ba2436bd9632fb0c7b7fb28f8f89a30598a70e", sha256: "5fa801e577cb7e2f36b7865f5845cc9451babbc3d3a36ff526b3bdbe0d1bb0a4" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-1-full-record/report.md", gitBlobSha: "bd8299e3ceb67d2f6e549fce07640f683ec37882", sha256: "400d750a3f2a1a073841da252dd5f805622d866a2707ebdde22e0b09b35fe1f2" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-1-full-record/expected.json", gitBlobSha: "df18d2e227655fc97bb2e8acfaf5fbc2963b2c36", sha256: "aa004bb4ff242f610d2b1099e6c08c4c5cf1cc4e09ef58acc4ec82dce56badb3" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-2-missing-fields/report.md", gitBlobSha: "3a9318fe07c96563cc442dea584eb2da6502a653", sha256: "2c686579ab55bb9745d248438f99ccc93b99cc9c49e7b9f35d699e8c57c89393" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-2-missing-fields/expected.json", gitBlobSha: "eb3238830d894cbc44ebdcc101cfb763e49be5a1", sha256: "7f486731161f3cb484309794a5bae50d97e925e1fd4c39c9753375d741148efc" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-3-injection-in-planning-issue/report.md", gitBlobSha: "2ee124bb93a2978faa06379796a75a70faf3b6de", sha256: "b6cd907daf4b5d5b0d49cc67a6c661d5764cf3a80982648761d48d3e14e1edf3" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-3-injection-in-planning-issue/expected.json", gitBlobSha: "557326dbc5907db387aae622a60be1b778189f0b", sha256: "be4fb4c0127ae24dfee0a425164f18c66af87823853b2c0af6b79e525ae1c3b1" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-4-all-required-missing/report.md", gitBlobSha: "3d1133a8e9676d8f8a0f2536a36e40398b750571", sha256: "1e999974fb7348978849344eb6d219579fc66db96bb78886943d93b0fb03e7a4" },
  { upstreamPath: "tools/skill-evals/evals/release-audit-report/step-2-assemble-record/fixtures/case-4-all-required-missing/expected.json", gitBlobSha: "0c232109a117aa993dbfb49a35f1a777b6ddd693", sha256: "49fbc3defc3065ea7b2597076ad2a315882061adf2fa35bd8b5b71882bc6794a" },
];

const STEP_HEADINGS = {
  "step-0-preflight": "## Step 0 — Pre-flight check",
  "step-1-gather-record": "## Step 1 — Gather release record data",
  "step-2-assemble-record": "## Step 2 — Assemble audit record",
} as const;

const USER_PROMPT_TEMPLATE = [
  "## Existing open trackers (corpus)",
  "",
  "{corpus}",
  "",
  "## Reporter roster (existing trackers mapped to reporter email)",
  "",
  "{roster}",
  "",
  "## Incoming report",
  "",
  "{report}",
  "",
  "Apply the semantic sweep and reporter-identity check. Return JSON only.",
  "",
].join("\n");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function localFile(seed: ImportedFileSeed): { localPath: string; role: ImportedRole } {
  const prefix = "tools/skill-evals/evals/release-audit-report/";
  if (seed.upstreamPath === "LICENSE") return { localPath: `${SLICE_ROOT}/public/LICENSE.upstream`, role: "public-input" };
  if (seed.upstreamPath === "skills/release-audit-report/SKILL.md") return { localPath: `${SLICE_ROOT}/public/SKILL.md`, role: "public-input" };
  if (seed.upstreamPath === "skills/release-audit-report/audit-record-schema.md") return { localPath: `${SLICE_ROOT}/public/audit-record-schema.md`, role: "public-input" };
  if (seed.upstreamPath === `${prefix}README.md`) return { localPath: `${SLICE_ROOT}/public/eval-README.md`, role: "public-input" };
  const match = seed.upstreamPath.match(/^tools\/skill-evals\/evals\/release-audit-report\/(step-[^/]+)\/fixtures\/(.+)$/u);
  if (!match) throw new Error(`Unknown Magpie import path: ${seed.upstreamPath}`);
  const step = match[1]!;
  const tail = match[2]!;
  const checkerOnly = tail === "assertions.json" || tail.endsWith("/expected.json");
  return {
    localPath: `${SLICE_ROOT}/${checkerOnly ? "checker-oracle" : "public"}/${step}/${tail}`,
    role: checkerOnly ? "checker-only" : "public-input",
  };
}

async function readVerified(rootDir: string, seed: ImportedFileSeed): Promise<MagpieImportedFile> {
  const mapped = localFile(seed);
  const absolute = resolve(rootDir, mapped.localPath);
  const fromRoot = relative(resolve(rootDir), absolute);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`Magpie import escapes repository: ${mapped.localPath}`);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Magpie import is not a regular file: ${mapped.localPath}`);
  const bytes = await readFile(absolute);
  const actual = sha256(bytes);
  if (actual !== seed.sha256) throw new Error(`Magpie import digest drift: ${mapped.localPath}`);
  return { ...seed, ...mapped, bytes: bytes.byteLength };
}

function fatalUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Magpie imported text is not UTF-8: ${path}`);
  }
}

function extractSkillSection(skill: string, heading: string): string {
  const lines = skill.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start < 0) throw new Error(`Magpie heading not found: ${heading}`);
  const headingLevel = heading.match(/^#+/u)?.[0].length;
  if (!headingLevel) throw new Error(`Invalid Magpie heading: ${heading}`);
  let inFence = false;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) inFence = !inFence;
    if (inFence) continue;
    const level = line.match(/^(#{1,6}) /u)?.[1]?.length;
    if (level !== undefined && level <= headingLevel) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

export async function loadAndValidateMagpieReleaseAuditSlice(rootDir: string) {
  const files = await Promise.all(FILES.map((seed) => readVerified(rootDir, seed)));
  return {
    upstream: { repository: "https://github.com/apache/magpie" as const, commit: UPSTREAM_COMMIT, license: "Apache-2.0" as const },
    rootDir: resolve(rootDir),
    files,
    cases: MAGPIE_RELEASE_AUDIT_CASE_IDS.map((caseId) => ({ caseId, split: "public-development" as const })),
    accounting: {
      importedFiles: files.length,
      publicInputFiles: files.filter((file) => file.role === "public-input").length,
      checkerOnlyFiles: files.filter((file) => file.role === "checker-only").length,
      publicCases: MAGPIE_RELEASE_AUDIT_CASE_IDS.length,
      heldOutAccesses: 0,
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
    },
  };
}

export type MagpieSlice = Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditSlice>>;

function fileByLocalSuffix(slice: MagpieSlice, suffix: string): MagpieImportedFile {
  const found = slice.files.find((file) => file.localPath.endsWith(suffix));
  if (!found) throw new Error(`Magpie imported file not found: ${suffix}`);
  return found;
}

async function readImportedText(slice: MagpieSlice, file: MagpieImportedFile): Promise<string> {
  return fatalUtf8(await readFile(resolve(slice.rootDir, file.localPath)), file.localPath);
}

export async function readMagpieReleaseAuditPublicFile(slice: MagpieSlice, suffix: string) {
  const file = fileByLocalSuffix(slice, suffix);
  if (file.role !== "public-input" || file.localPath.includes("checker-oracle")) {
    throw new Error(`Checker-only Magpie bytes cannot enter public input: ${file.localPath}`);
  }
  return { file, text: await readImportedText(slice, file) };
}

export async function buildMagpieReleaseAuditPrompt(slice: MagpieSlice, caseId: MagpieReleaseAuditCaseId) {
  if (!MAGPIE_RELEASE_AUDIT_CASE_IDS.includes(caseId)) throw new Error(`Unknown Magpie case: ${caseId}`);
  const [step] = caseId.split("/") as [keyof typeof STEP_HEADINGS];
  const configFile = fileByLocalSuffix(slice, `/public/${step}/step-config.json`);
  const outputSpecFile = fileByLocalSuffix(slice, `/public/${step}/output-spec.md`);
  const reportFile = fileByLocalSuffix(slice, `/public/${caseId}/report.md`);
  const skillFile = fileByLocalSuffix(slice, "/public/SKILL.md");
  const inputFiles = [skillFile, configFile, outputSpecFile, reportFile];
  if (inputFiles.some((file) => file.role !== "public-input" || file.localPath.includes("checker-oracle"))) {
    throw new Error("Checker-only Magpie bytes cannot enter prompt construction");
  }
  const config = JSON.parse(await readImportedText(slice, configFile)) as { step_heading?: unknown };
  const heading = config.step_heading;
  if (typeof heading !== "string" || heading !== STEP_HEADINGS[step]) throw new Error(`Magpie step heading drift: ${step}`);
  const section = extractSkillSection(await readImportedText(slice, skillFile), heading);
  const systemPrompt = `${section}\n\n${await readImportedText(slice, outputSpecFile)}`;
  const report = await readImportedText(slice, reportFile);
  const userPrompt = USER_PROMPT_TEMPLATE
    .replace("{corpus}", "")
    .replace("{roster}", "(none)")
    .replace("{report}", report);
  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  return { caseId, prompt, sha256: sha256(Buffer.from(prompt, "utf8")), inputFiles };
}
