# Superhackers for Codex

Guide for using Superhackers with OpenAI Codex via native skill discovery.

## Quick Install

Tell Codex:

```
Fetch and follow instructions from https://raw.githubusercontent.com/narlyseorg/superhackers/refs/heads/main/.codex/INSTALL.md
```

## Manual Installation

### Prerequisites

- OpenAI Codex CLI
- Git

### Steps

1. Clone the repo:
   ```bash
   git clone https://github.com/narlyseorg/superhackers.git ~/.codex/superhackers
   ```

2. Create the skills symlink:
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/superhackers/skills ~/.agents/skills/superhackers
   ```

3. Restart Codex.

### Windows

Use a junction instead of a symlink (works without Developer Mode):

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\superhackers" "$env:USERPROFILE\.codex\superhackers\skills"
```

## How It Works

Codex has native skill discovery — it scans `~/.agents/skills/` at startup, parses SKILL.md frontmatter, and loads skills on demand. Superhackers skills are made visible through a single symlink:

```
~/.agents/skills/superhackers/ → ~/.codex/superhackers/skills/
```

The `using-superhackers` skill is discovered automatically and enforces skill usage discipline — no additional configuration needed.

## Usage

Skills are discovered automatically. Codex activates them when:
- You mention a skill by name (e.g., "use recon-and-enumeration")
- The task matches a skill's description
- The `using-superhackers` skill directs Codex to use one

### Personal Skills

Create your own skills in `~/.agents/skills/`:

```bash
mkdir -p ~/.agents/skills/my-skill
```

Create `~/.agents/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when [condition] - [what it does]
---

# My Skill

[Your skill content here]
```

The `description` field is how Codex decides when to activate a skill automatically — write it as a clear trigger condition.

## Updating

```bash
cd ~/.codex/superhackers && git pull
```

Skills update instantly through the symlink.

## Uninstalling

```bash
rm ~/.agents/skills/superhackers
```

**Windows (PowerShell):**
```powershell
Remove-Item "$env:USERPROFILE\.agents\skills\superhackers"
```

Optionally delete the clone: `rm -rf ~/.codex/superhackers` (Windows: `Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\superhackers"`).

## Troubleshooting

### Skills not showing up

1. Verify the symlink: `ls -la ~/.agents/skills/superhackers`
2. Check skills exist: `ls ~/.codex/superhackers/skills`
3. Restart Codex — skills are discovered at startup

### Windows junction issues

Junctions normally work without special permissions. If creation fails, try running PowerShell as administrator.

## Getting Help

- Report issues: https://github.com/narlyseorg/superhackers/issues
- Main documentation: https://github.com/narlyseorg/superhackers

## Security Tools

Superhackers skills require security tools (nmap, nuclei, sqlmap, etc.) to function. See [SETUP.md](../SETUP.md) for installation options.
