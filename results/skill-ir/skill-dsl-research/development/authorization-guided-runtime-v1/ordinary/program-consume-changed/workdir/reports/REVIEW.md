# 🔐 Security Review Report

## Findings summary

| Severity | Count |
|---|---:|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 1 |
| 🟡 MEDIUM | 2 |
| 🔵 LOW | 0 |
| ⚪ INFO | 0 |
| **TOTAL** | **3** |

- **Scope:** `review-inputs/workflows/**/*.yml` and `*.yaml` only
- **Files reviewed:** 2 (`release.yml`, `nested/previous.yml`)
- **Lines reviewed:** 268
- **Jobs inventoried:** 6
- **Action references inventoried:** 16
- **Method:** Offline static inventory followed by direct semantic review
- **Dependency/action audit:** Action references were inventoried, but no live advisory, CVE, marketplace, tag-resolution, or publisher verification was performed.
- **Secrets scan:** No hardcoded credentials or direct secret-printing expressions were found in the scoped workflow files.
- **Source changes:** None. Workflows were not executed and no patches were applied.

The machine-readable evidence is in [`workflows.json`](workflows.json). It records each workflow-level and job-level permission declaration, including distinct `omitted` and `explicit_empty` states, plus every `uses:` reference with file, job, line number, and source-line evidence.

## Permission inventory interpretation

| Workflow | Scope | Declared state | Values / effect requiring review | Evidence |
|---|---|---|---|---|
| `release.yml` | Workflow | `omitted` | Repository/organization default token permissions apply unless a job declares permissions. | No declaration |
| `release.yml` | `build` | `explicit_empty` | All `GITHUB_TOKEN` permissions are disabled for this job. | Line 11: `permissions: {}` |
| `release.yml` | `release` | `omitted` | Inherits the workflow/default setting; the effective grant depends on external repository/organization configuration. | Job at line 69; no job declaration |
| `release.yml` | `npm-publish` | `declared` | `contents: read`, `id-token: write`; other permissions become `none`. | Lines 97–99 |
| `nested/previous.yml` | Workflow | `declared` | `contents: write`, `id-token: write`; undeclared permissions become `none`. | Lines 8–10 |
| `nested/previous.yml` | `build` | `omitted` | Inherits workflow-level `contents: write` and `id-token: write`. | Job at line 13 |
| `nested/previous.yml` | `release` | `omitted` | Inherits workflow-level `contents: write` and `id-token: write`. | Job at line 71 |
| `nested/previous.yml` | `npm-publish` | `declared` | Job override restricts the token to `contents: read`, `id-token: write`. | Lines 99–101 |

`omitted` does **not** mean empty: it means permissions are inherited from the workflow declaration or, if that is also omitted, from GitHub's repository/organization defaults. `explicit_empty` (`permissions: {}`) intentionally disables all token permissions for that scope.

# Findings by category

## Authentication and access control: workflow token permissions

### 🟠 HIGH — Build job receives repository write and OIDC-token privileges it does not need

**Confidence: High**

**Location:** `review-inputs/workflows/nested/previous.yml`, lines 8–10 and job starting at line 13

**Evidence:**

```yaml
permissions:
  contents: write    # create GH Release + upload assets
  id-token: write    # npm provenance

jobs:
  build:
```

The `build` job omits a job-level declaration, so it inherits both workflow-level grants. That job runs third-party action code and repository-controlled package lifecycle/build commands, including:

- Line 23: `uses: actions/checkout@v4`
- Line 28: `uses: oven-sh/setup-bun@v2`
- Line 33: `run: SKVM_SKIP_POSTINSTALL=1 bun install --frozen-lockfile`
- Line 36: `run: bun run typecheck`
- Line 58: `run: bun run build:all`
- Line 63: `uses: actions/upload-artifact@v4`

**Risk:** A compromised action, dependency install path, or build script executing in this job could use the job's `GITHUB_TOKEN` for repository-content writes and could request a GitHub OIDC token. The tag-only trigger reduces exposure to untrusted pull-request content, but it does not remove supply-chain or compromised-release-branch risk. Neither privilege is required by the visible build operations.

The `release` job also inherits `id-token: write` although its visible purpose only requires release-related repository access.

**Recommended fix:** Move permissions to the jobs that require them. Give `build` an explicitly empty permission map, `release` only `contents: write`, and retain `contents: read` plus `id-token: write` for `npm-publish`.

**Reference:** GitHub Actions least-privilege guidance; OWASP CI/CD Security Risks — Insufficient Credential Hygiene.

---

### 🟡 MEDIUM — Release job relies on external default token permissions

**Confidence: High for the configuration issue; Medium for runtime impact**

**Location:** `review-inputs/workflows/release.yml`, job at line 69; release action at line 85

**Evidence:**

```yaml
jobs:
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # ...
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
```

The workflow-level `permissions` key is omitted and the `release` job also omits it. Consequently, the job's effective token grant is controlled by repository or organization defaults that are not present in the offline scope.

**Risk:** The release action needs repository write access to create a release and upload assets. Under a restricted default, the workflow may fail. Under a permissive legacy default, the job may receive additional permissions beyond those required. This makes the security boundary dependent on external configuration and harder to audit from source.

**Recommended fix:** Declare the exact job grant:

```yaml
release:
  needs: build
  runs-on: ubuntu-latest
  permissions:
    contents: write # Required only to create the release and upload assets
```

Keep `build` at `permissions: {}` and retain the existing narrow `npm-publish` declaration.

**Reference:** GitHub Actions `GITHUB_TOKEN` permission configuration and least privilege.

## Supply-chain integrity: action references

### 🟡 MEDIUM — Actions are pinned to mutable major-version tags rather than immutable commits

**Confidence: High**

**Locations:** Both scoped workflows; all 16 `uses:` entries

Every external action reference uses a mutable major tag:

| Workflow | Job | Line | Reference |
|---|---|---:|---|
| `release.yml` | `build` | 21 | `actions/checkout@v4` |
| `release.yml` | `build` | 26 | `oven-sh/setup-bun@v2` |
| `release.yml` | `build` | 61 | `actions/upload-artifact@v4` |
| `release.yml` | `release` | 74 | `actions/checkout@v4` |
| `release.yml` | `release` | 79 | `actions/download-artifact@v4` |
| `release.yml` | `release` | 85 | `softprops/action-gh-release@v2` |
| `release.yml` | `npm-publish` | 110 | `actions/checkout@v4` |
| `release.yml` | `npm-publish` | 115 | `actions/setup-node@v4` |
| `nested/previous.yml` | `build` | 23 | `actions/checkout@v4` |
| `nested/previous.yml` | `build` | 28 | `oven-sh/setup-bun@v2` |
| `nested/previous.yml` | `build` | 63 | `actions/upload-artifact@v4` |
| `nested/previous.yml` | `release` | 76 | `actions/checkout@v4` |
| `nested/previous.yml` | `release` | 81 | `actions/download-artifact@v4` |
| `nested/previous.yml` | `release` | 87 | `softprops/action-gh-release@v2` |
| `nested/previous.yml` | `npm-publish` | 112 | `actions/checkout@v4` |
| `nested/previous.yml` | `npm-publish` | 117 | `actions/setup-node@v4` |

**Risk:** A major tag can be moved to different code. If an action publisher account or release process is compromised, later workflow runs may execute changed code without a workflow-file change. This matters most in jobs holding `contents: write` or `id-token: write`, and for third-party actions such as `oven-sh/setup-bun` and `softprops/action-gh-release`.

**Recommended fix:** Resolve each approved action version to a reviewed full 40-character commit SHA and pin `uses:` to that SHA, retaining the release tag in a comment for maintainability. SHA values must be obtained and verified separately; this offline review did not resolve tags or contact GitHub.

Example form only:

```yaml
uses: actions/checkout@<reviewed-40-character-commit-sha> # v4
```

**Reference:** GitHub Actions secure-use guidance; OWASP CI/CD Security Risks — Dependency Chain Abuse.

# Action reference inventory notes

- No local actions (`./path`) or reusable workflow calls were present; all collected `uses:` entries are external action references.
- No action is pinned to an immutable full commit SHA.
- `bun-version: "1.3.11"` and `node-version: "24"` are action inputs, not action-reference pins.
- No live checks were made to determine whether the tags currently resolve to expected commits, whether publisher accounts are trustworthy, or whether the referenced action versions have advisories.

# Secrets and exposure scan

No exposed credentials were found in the two workflow files. The text references GitHub's automatically supplied token/OIDC mechanism conceptually, but it does not embed a token. The workflows do not use `${{ secrets.* }}` and do not directly print a secret expression.

This conclusion is limited to the workflow YAML in scope. Repository settings, environments, organization secrets, action internals, logs from prior runs, and files outside `review-inputs/workflows` were not inspected.

# Dependency audit

The scoped files contain action dependencies but no package manifest or lockfile. The action references were reviewed for pinning and permission exposure only.

**No claim is made that any action has or lacks a CVE.** Live advisory databases, GitHub Marketplace metadata, repository histories, tag targets, release signatures, and current upstream versions were not queried.

# Self-verification

Each finding was rechecked against both source files and the generated inventory:

1. **Broad inherited permissions:** Confirmed that `nested/previous.yml` declares workflow-level `contents: write` and `id-token: write`, while `build` and `release` omit job overrides. Confirmed that `npm-publish` does have a narrower override, so the finding does not incorrectly attribute the broad workflow grant to that job.
2. **Default-dependent release permission:** Confirmed that `release.yml` omits workflow permissions and its `release` job has no declaration. The report does not assert the effective repository default; runtime impact is therefore qualified.
3. **Mutable references:** Confirmed all 16 references use `@v2` or `@v4`, not full commit SHAs. No claim is made that the currently referenced action code is malicious or vulnerable.
4. **Explicitly empty versus omitted:** Confirmed that `release.yml` line 11 is `permissions: {}` and is represented as `explicit_empty`, while absent declarations are represented as `omitted`.
5. **YAML inventory boundary:** The files use ordinary block-style YAML within the supplied inventory tool's supported subset. No anchors, aliases, merge keys, tags, flow permission mappings other than `{}`, multi-document syntax, or tab indentation were observed.

# Patch proposal for the HIGH finding

> **Review each patch before applying. Nothing has been changed yet.**

## Patch 1 — Scope token privileges by job in `nested/previous.yml`

**Before:**

```yaml
permissions:
  contents: write    # create GH Release + upload assets
  id-token: write    # npm provenance

jobs:
  build:
    runs-on: macos-latest
```

**After:**

```yaml
jobs:
  build:
    permissions: {} # Security: build does not require GITHUB_TOKEN capabilities
    runs-on: macos-latest

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write # Security: grant only release creation/upload access

  npm-publish:
    needs: [build, release]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Security: required for npm Trusted Publishing OIDC
```

This removes repository-write and OIDC privileges from the build job and removes OIDC issuance from the release job while preserving the declared publishing design. Operational testing would still be required by maintainers after review; no workflow was executed here.

# Remaining review limits

- This was intentionally **not** a whole-repository audit. Application source, package manifests/lockfiles, scripts invoked by `run:`, artifact contents, and other CI/CD/IaC files remain outside scope.
- The review did not execute workflows, actions, package managers, build scripts, or generated artifacts.
- Repository and organization settings were unavailable, including default `GITHUB_TOKEN` permissions, protected tags, rulesets, environments, required reviewers, runner policies, and allowed-action policies.
- npm Trusted Publishing configuration and the stated package identity were not verified. OIDC audience, subject constraints, and deployment-side trust policy were not inspected.
- Artifact provenance and integrity across `upload-artifact`/`download-artifact` were assessed only from YAML structure. Runtime artifact IDs, attestations, and contents were not examined.
- GitHub-hosted runner image contents and the behavior of action implementations were not inspected.
- No live CVE, advisory, deployment, publisher, tag, or commit verification was performed or claimed.
- The inventory is line-oriented evidence rather than a complete YAML semantic parser. Direct review found no unsupported syntax in these two files, but external GitHub configuration can still alter effective behavior.

# Conclusion

The current `release.yml` shows an improvement by explicitly removing token permissions from `build` and narrowly granting OIDC to `npm-publish`. Its `release` job should still declare `contents: write` explicitly instead of depending on external defaults. The older/nested workflow materially over-grants its build job through workflow-level permissions. Across both files, immutable commit pinning would reduce action supply-chain risk.
