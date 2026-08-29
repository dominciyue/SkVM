---
name: package-inventory
description: Create a deterministic public dependency inventory from a package manifest.
---

# Package inventory

## When to use

Use this skill when a user needs a stable summary of the production and development dependencies declared by a public `package.json` file.

## Workflow

### 1. Read public inputs

1. Read `package.json` without modifying it.
2. Read `package-inventory-interface.json` as the public output contract.

### 2. Derive the inventory

1. Use the keys of `dependencies` as production dependency names.
2. Use the keys of `devDependencies` as development dependency names.
3. Sort each name list lexicographically and remove duplicates from the combined list.
4. Derive production, development, and unique counts from those lists.

### 3. Write the result

1. Produce exactly the output path declared by the public interface.
2. Write a JSON object with `packageName`, `productionDependencies`, `developmentDependencies`, `allDependencies`, and `counts`.

## Rules

- Treat missing dependency maps as empty objects.
- Preserve the package name exactly as declared.
- Never include dependency versions, lockfile content, installed package state, or network data.
- Do not modify or delete any initial workspace file.
- Do not create files other than the declared inventory output.
- Keep output ordering deterministic.

## Output

- A deterministic dependency inventory at the public interface's declared output path.
