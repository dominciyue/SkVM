# AD integration notes

Date: 2026-09-26. Owner task: `01a0de61-6b8d-78a2-8293-c6f7108cf803`. Publisher: `01a0de62-39d6-7883-89da-4123cb8327f0` (local).

Delivered `scripts/experiment-catalog/{model,io,render,cli}.ts`, `catalog.test.ts` and `README.md`, plus the AD taskbook and this result directory. See `ready.json` for the exact owned-file list and hashes. No Git write operations were performed. The shared branch/workspace and existing unrelated modifications remain owned by their original tasks.

The tool supplies read-only check/show and explicit new-file export. It retains heterogeneous entries, unknown/null/zero/absence, raw artifact entrances and extension fields. It checks only explicit path metadata; it never opens AB answers/oracles or runs a provider. All summaries are navigation snapshots, not evaluation summaries or new experiment registrations.

Validation: `bun test ./scripts/experiment-catalog/catalog.test.ts` passed 24 tests / 147 assertions; script-only strict TypeScript check passed using the installed compiler. Real catalog check (3 entries, 0 diagnostics), AB ID text query, U JSON query and snapshot export all exited 0. Before/after catalog bytes matched SHA-256 `ce6c7313679b58f0466bc418984643682cd835718ff2090dacb13d679890831a`. Commands, times and outputs are in `verification.json`. Full repository typecheck and documentation scan are intentionally left to the sole publisher; its normal typecheck excludes scripts, so retain the explicit script check documented in README.

Two independent read-only reviews examined path/I/O and parser/query contracts. One requested synchronization to catalog changes after its stable read; this was not adopted because the task explicitly requires version/time identified snapshots without locking AB. README explains that `source` identifies the observed version and artifact metadata is not an atomic tree snapshot. Public-process invalid-data exit coverage was added. Whole-entry equality already verifies nested fields and artifact entrance preservation.

Recommended shared-document/log changes for AB to apply from current bytes:

1. Add one navigation link beside the machine-readable experiment catalog in `docs/skill-ir/README.md` or `evidence-index.md` to `../../scripts/experiment-catalog/README.md`; do not create another long-lived component document or duplicate experimental results.
2. In `current-status.md`, mark AD tooling ready/delivered separately from AB's research evaluation. Describe it as offline navigation with source-version snapshots, not experiment scoring.
3. Append a short `conversation_log.md` stage record: new owned scripts/README/taskbook/result files; 24/147 deterministic tests plus local script typecheck; real catalog check/query/export success; zero provider, paid calls and new research samples; original catalog unchanged during trial.
4. Commit this exact AD file set separately from AC and AB research outputs. Keep original catalog, seven old source modifications, historical untracked material, and all other tasks' files outside the AD commit. This tool does not require a new entry in experiment-catalog.json.

Limitations: evidence semantic validity is not checked; snapshot is from the documented read time and is not a final AB conclusion. Permission-denial tests inject EACCES because Windows/admin chmod is unreliable. Tests exercise Windows junctions and hardlinks on this host; no other-platform reliability claim. An I/O error after exclusive file creation can leave a new partial export; it is reported, retained for inspection and never overwritten by retry. The tool is not an OS sandbox against hostile concurrent filesystem mutation.

Model/tier observation: current task turn context reports `gpt-6-astra`, effort `ultra`. Host config was read-only and contains `service_tier="priority"`. The turn-context record does not expose service tier; actual dispatched tier/1.5x speed is unobserved. No global settings were changed.

AD stops writing immediately after atomic `ready.json` publication. No outstanding shared defect or AB evaluation work is assigned to AD.
