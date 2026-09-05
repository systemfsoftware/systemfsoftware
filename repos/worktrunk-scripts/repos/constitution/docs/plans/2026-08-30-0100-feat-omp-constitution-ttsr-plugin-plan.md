---
title: "feat(plugin): create OMP constitution TTSR rules plugin"
date: 2026-08-30
category: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan
---

# Goal Capsule

Add a standard OMP plugin package (`@systemfsoftware/omp-plugin-constitution` under `packages/omp-plugin/` or `plugins/constitution/`) that defines Time-Traveling Stream Rules (TTSR) in markdown (`rules/*.md`). The rules trigger on edits/writes to source code and tests, enforcing strict adherence to the Supreme Engineering Constitution (`CONSTITUTION.md` and `CONSTITUTION-ARTICLES.md` Articles I–V). Any violation in review or source generation is flagged immediately with automatic P0 severity and actionable remediation.

# Product Contract

## 1. Scope and Objective
- Package an OMP plugin adhering to Claude/OMP plugin discovery specifications (`.omp-plugin/plugin.json`, `rules/`, `package.json`, `README.md`).
- Define targeted TTSR stream rules (`rules/*.md`) covering:
  1. `constitution-pure-core.md`: Enforces Article I (purity, tagged error variants, branded types, cyclomatic complexity 1, no primitive obsession, no boolean/status string errors, no null states).
  2. `constitution-boundary.md`: Enforces Article II (functional core / imperative shell, effects as lazy values, I/O sandwich order, inward dependencies, decode never unchecked cast `as any`/`as unknown`).
  3. `constitution-verification.md`: Enforces Article III (public export API testing, mutation testing on decisions, narrow property grants, independent oracles, no mocked intermediate single-implementation glue code, no tautological/characterization tests).
  4. `constitution-conduct-and-review.md`: Enforces Article V & Governance (automatic P0 on constitutional breaches with zero appeals unless declared under CONST-W3, root cause over expedient patch, subtract before add, scope discipline).
- Each rule carries frontmatter with `condition`, `scope` (`tool:edit(...)`, `tool:write(...)`, `tool:ast_edit(...)`), and `interruptMode: tool-only` or `always`.
- Update project manifest (`package.json`) and root test validation to ensure all rules are valid YAML frontmatter and tested against `omp ttsr test` (or regex validator).

## 2. Requirements & Invariants
- **R1 (Plugin Discovery)**: Plugin manifest `.omp-plugin/plugin.json` and `.claude-plugin/plugin.json` properly identify the plugin name, version, and author metadata.
- **R2 (TTSR Rule Format)**: Every rule file in `rules/` has valid YAML frontmatter with `description`, `condition`, `scope`, and markdown instructions quoting the exact rule IDs (`CONST-P1`, `CONST-D1`, `CONST-B1`, `CONST-T8`, `CONST-G3`, etc.).
- **R3 (Zero Hallucination / Grounded)**: Rule text cites exact IDs and principles from the repository's `CONSTITUTION.md` and `CONSTITUTION-ARTICLES.md`.
- **R4 (Verification)**: `pnpm test` (and any new plugin test scripts) must execute cleanly, validating all YAML blocks across the repository.

# Implementation Units

- [ ] **U1: Scaffold OMP Plugin Manifest & Directory Structure**
  - **Goal**: Create the plugin layout under `plugins/constitution/` or root plugin metadata with `.omp-plugin/plugin.json`, `.claude-plugin/plugin.json`, and `package.json`.
  - **Files**: `plugins/constitution/.omp-plugin/plugin.json`, `plugins/constitution/.claude-plugin/plugin.json`, `plugins/constitution/package.json`, `plugins/constitution/README.md`.

- [ ] **U2: Implement Article I & II TTSR Rules (Core & Boundary)**
  - **Goal**: Author `rules/constitution-pure-core.md` and `rules/constitution-boundary.md` with precise regex and ast conditions for unchecked casts (`as any`, `as unknown`), eager async promises on domain signatures, mutable control flow in pure core, and missing error tagging.
  - **Files**: `plugins/constitution/rules/constitution-pure-core.md`, `plugins/constitution/rules/constitution-boundary.md`.

- [ ] **U3: Implement Article III & V TTSR Rules (Verification & Review P0)**
  - **Goal**: Author `rules/constitution-verification.md` and `rules/constitution-conduct-review.md` covering mocked single implementations, tautological assertions, private helper unit tests, and the mandatory P0 automatic review rejection.
  - **Files**: `plugins/constitution/rules/constitution-verification.md`, `plugins/constitution/rules/constitution-conduct-review.md`.

- [ ] **U4: Wire Validation, Test Battery, and Documentation**
  - **Goal**: Update root `scripts/validate-constitution.ts` (or add plugin test scripts) to validate the plugin rules, update `README.md` and `AGENTS.md` to document the OMP plugin installation and usage.
  - **Files**: `scripts/validate-constitution.ts`, `README.md`, `AGENTS.md`, `package.json`.
