import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const ObservationSchema = z.object({
  reportText: z.string().min(1),
  injectionFlagged: z.boolean(),
}).strict();

const ArtifactSchema = z.object({ filename: z.string(), sha512: z.string(), sig: z.string() }).strict();

const MissingFields = [
  "rc_label", "vote_thread_url", "result_thread_url", "artefacts", "promote_revision",
  "announce_archive_url", "vote_binding_plus1", "vote_binding_minus1", "binding_voters",
] as const;

function capture(report: string, pattern: RegExp, label: string): string {
  const value = report.match(pattern)?.[1]?.trim();
  if (!value) throw new Error(`release-audit artifact could not parse ${label}`);
  return value;
}

function canonicalIssue(value: string): string {
  if (value.startsWith("https://")) return value;
  const short = value.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/u);
  if (!short) throw new Error(`release-audit artifact cannot canonicalize issue: ${value}`);
  return `https://github.com/${short[1]}/${short[2]}/issues/${short[3]}`;
}

function bracketList(value: string, stripAt = false): string[] {
  const text = value.trim();
  if (text === "[]") return [];
  if (!text.startsWith("[") || !text.endsWith("]")) throw new Error(`release-audit artifact invalid list: ${value}`);
  return text.slice(1, -1).split(",").map((entry) => {
    const trimmed = entry.trim();
    return stripAt ? trimmed.replace(/^@/u, "") : trimmed;
  }).filter(Boolean);
}

function preflight(report: string) {
  const version = capture(report, /Trigger:\s*\/release-audit-report\s+([^\s]+)/u, "trigger version");
  const issue = report.match(/^Planning issue:\s+([^\s(]+)/mu)?.[1];
  const auditPath = report.match(/^\s{2}audit_log_path:\s*(\S+)/mu)?.[1] ?? null;
  const blockers: string[] = [];
  if (!issue) blockers.push(`No planning issue found for ${version}; supply --planning-issue with the canonical issue URL`);
  if (!auditPath) blockers.push("audit_log_path is not configured in release-management-config.md");
  return {
    verdict: blockers.length === 0 ? "proceed" : "blocked",
    blockers,
    planning_issue_url: issue ? canonicalIssue(issue) : null,
    audit_log_path: auditPath,
  };
}

function gather(report: string, injectionFlagged: boolean) {
  const artefacts = [...report.matchAll(/^\s{4}-\s+(.+?)\s{2,}sha512:\s*(\S+)\s{2,}sig:\s*(\S+)/gmu)]
    .map((match) => ArtifactSchema.parse({ filename: match[1]!.trim(), sha512: match[2]!, sig: match[3]! }));
  const plus = report.match(/^\s{2}Binding \+1:\s*(\d+)/mu)?.[1];
  const minus = report.match(/^\s{2}Binding -1:\s*(\d+)/mu)?.[1];
  const handles = [...new Set([...report.matchAll(/@([A-Za-z0-9_-]+)/gu)].map((match) => match[1]!))];
  const output: Record<string, unknown> = {
    version: capture(report, /^Title:\s+"Release .+? ([0-9][^"\s]+)"/mu, "release version"),
    planning_issue_url: capture(report, /^Planning issue:\s+(https:\/\/[^\s]+)/mu, "planning issue URL"),
    rc_label: capture(report, /^\s{2}RC:\s*(\S+)/mu, "RC label"),
    vote_thread_url: capture(report, /^\s{2}\[VOTE\] thread:\s*(\S+)/mu, "vote thread URL"),
    result_thread_url: report.match(/^\s{2}\[RESULT\] thread:\s*(\S+)/mu)?.[1] ?? "MISSING",
    artefacts: artefacts.length > 0 ? artefacts : "MISSING",
    promote_revision: report.match(/^\s{2}SVN promote revision:\s*(\S+)/mu)?.[1] ?? "MISSING",
    announce_archive_url: report.match(/^\s{2}\[ANNOUNCE\] archive URL:\s*(\S+)/mu)?.[1] ?? "MISSING",
    vote_binding_plus1: plus === undefined ? "MISSING" : Number(plus),
    vote_binding_minus1: minus === undefined ? "MISSING" : Number(minus),
    binding_voters: handles.length > 0 ? handles : "MISSING",
  };
  return {
    ...output,
    fields_missing: MissingFields.filter((field) => output[field] === "MISSING"),
    fields_redacted: MissingFields.filter((field) => output[field] === "REDACTED"),
    injection_flagged: injectionFlagged,
  };
}

type RecordData = {
  version: string;
  productName: string;
  issue: string;
  rc: string;
  vote: string;
  result: string;
  artefacts: Array<{ filename: string; sha512: string; sig: string }> | "MISSING";
  promote: string;
  announce: string;
  plus: string;
  minus: string;
  voters: string[] | "MISSING";
  missing: string[];
  redacted: string[];
  injection: boolean;
};

function assembledData(report: string, injectionFlagged: boolean): RecordData {
  const artefacts = /^\s{2}artefacts:\s*MISSING\s*$/mu.test(report)
    ? "MISSING" as const
    : [...report.matchAll(/^\s{4}- filename:\s*(.+?)\s{2,}sha512:\s*(\S+)\s{2,}sig:\s*(\S+)/gmu)]
      .map((match) => ArtifactSchema.parse({ filename: match[1]!.trim(), sha512: match[2]!, sig: match[3]! }));
  const voters = capture(report, /^\s{2}binding_voters:\s*(.+)$/mu, "binding voters");
  return {
    version: capture(report, /^\s{2}version:\s*(\S+)/mu, "version"),
    productName: capture(report, /^product_name:\s*(.+)$/mu, "product name"),
    issue: capture(report, /^\s{2}planning_issue_url:\s*(\S+)/mu, "planning issue URL"),
    rc: capture(report, /^\s{2}rc_label:\s*(\S+)/mu, "RC label"),
    vote: capture(report, /^\s{2}vote_thread_url:\s*(\S+)/mu, "vote thread URL"),
    result: capture(report, /^\s{2}result_thread_url:\s*(\S+)/mu, "result thread URL"),
    artefacts,
    promote: capture(report, /^\s{2}promote_revision:\s*(\S+)/mu, "promote revision"),
    announce: capture(report, /^\s{2}announce_archive_url:\s*(\S+)/mu, "announce URL"),
    plus: capture(report, /^\s{2}vote_binding_plus1:\s*(\S+)/mu, "binding +1"),
    minus: capture(report, /^\s{2}vote_binding_minus1:\s*(\S+)/mu, "binding -1"),
    voters: voters === "MISSING" ? "MISSING" : bracketList(voters, true),
    missing: bracketList(capture(report, /^\s{2}fields_missing:\s*(.+)$/mu, "fields_missing")),
    redacted: bracketList(capture(report, /^\s{2}fields_redacted:\s*(.+)$/mu, "fields_redacted")),
    injection: injectionFlagged,
  };
}

function display(value: string): string {
  return value === "MISSING" ? "_MISSING_" : value;
}

function renderRecord(data: RecordData): string {
  const voters = data.voters === "MISSING" ? "_MISSING_" : data.voters.map((value) => `@${value}`).join(", ");
  const artefacts = data.artefacts === "MISSING" ? "_MISSING_" : data.artefacts
    .map((item) => `| ${item.filename} | ${item.sha512} | ${item.sig} |`).join("\n");
  const notes = [
    ...data.missing.map((field) => `- ${field}: _MISSING_ at report time.`),
    ...data.redacted.map((field) => `- ${field}: _REDACTED_.`),
    ...(data.injection ? ["A prompt-injection attempt was detected in the planning issue and treated as data only."] : []),
  ];
  return [
    `# Release audit: ${data.productName} ${data.version}`, "", "| Field | Value |", "|---|---|",
    `| Version | \`${data.version}\` |`, `| RC | ${display(data.rc)} |`, `| Vote thread | ${display(data.vote)} |`,
    `| Result thread | ${display(data.result)} |`, `| Binding +1 | ${display(data.plus)} |`,
    `| Binding -1 | ${display(data.minus)} |`, `| Binding voters | ${voters} |`,
    `| Promote revision | ${display(data.promote)} |`, `| Announcement | ${display(data.announce)} |`,
    "", "## Artefacts", "", "| File | SHA-512 | Signature |", "|---|---|---|", artefacts,
    "", "## Notes", "", ...(notes.length ? notes : ["No gaps or anomalies detected."]),
    "", "---", "_Generated by `release-audit-report` (magpie-release-audit-report).",
    `Source: planning issue ${data.issue}._`,
  ].join("\n");
}

function assemble(report: string, injectionFlagged: boolean) {
  const data = assembledData(report, injectionFlagged);
  const requiredMissing = MissingFields.filter((field) => data.missing.includes(field));
  return {
    version: data.version,
    record_markdown: renderRecord(data),
    has_missing_fields: data.missing.length > 0,
    has_redacted_fields: data.redacted.length > 0,
    fields_missing: data.missing,
    fields_redacted: data.redacted,
    schema_violations: requiredMissing.map((field) => `${field} — required field is MISSING`),
    injection_flagged: data.injection,
  };
}

export async function applyMagpieReleaseAuditArtifactPatch(options: {
  workDir: string;
  observationsPath: string;
  outputPath: string;
}) {
  const observations = ObservationSchema.parse(JSON.parse(await readFile(resolve(options.workDir, options.observationsPath), "utf8")));
  const report = observations.reportText;
  const output = /\nTrigger:\s*\/release-audit-report/u.test(report)
    ? preflight(report)
    : /Gathered record data \(from Step 1/u.test(report)
      ? assemble(report, observations.injectionFlagged)
      : gather(report, observations.injectionFlagged);
  const outputPath = resolve(options.workDir, options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.next`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, outputPath);
  return { outputPath: options.outputPath, output };
}
