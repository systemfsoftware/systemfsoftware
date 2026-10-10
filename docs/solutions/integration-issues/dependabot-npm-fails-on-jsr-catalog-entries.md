---
title: Dependabot's npm job fails on jsr catalog entries and reports it as an authentication failure
date: "2026-10-10"
category: integration-issues
module: systemfsoftware
problem_type: integration_issue
component: dependabot
symptoms:
  - "Every scheduled `Dependabot Updates (npm)` run fails"
  - "The log labels `@std/*` as `private_source_authentication_failure` with `source: npm.jsr.io`"
  - "Other catalog dependencies end in `Dependabot::NpmAndYarn::FileUpdater::NoChangeError`"
root_cause: config_error
resolution_type: config_change
severity: medium
---

# Dependabot's npm job fails on jsr catalog entries

## Problem

`pnpm-workspace.yaml` declared `@std/jsonc`, `@std/path` and `@std/fs` in the `catalog:` as `jsr:` specifiers. No `package.json` consumed them: every `@std/*` import in the repository is Deno code resolved through `deno.jsonc` import maps, and `pnpm-lock.yaml` held no `@jsr/std__*` entry.

Dependabot's pnpm parser reads every key of `catalog` and `catalogs`, consumed or not (dependabot-core `npm_and_yarn/file_parser.rb`, `workspace_catalog_dependencies`), and asks `https://npm.jsr.io/@std%2Fjsonc` for metadata. JSR's npm mirror only serves those packages under the `@jsr/std__<name>` name, so the request 404s. Dependabot reports that 404 as `private_source_authentication_failure` (Dependabot run 38008718912, log lines 4795-4820), which reads like a missing credential. It is not one; no secret fixes it.

## Fix

Delete catalog entries that no workspace manifest references (`git grep -F '"<name>": "catalog:'` outside `repos/**` returns nothing). Keep Deno-only packages in Deno import maps, never in the pnpm catalog.

## Prevention

Each line is `review`-gated: the reviewer of a catalog or Dependabot change confirms it.

- A `private_source_authentication_failure` against `npm.jsr.io` means the mirror does not serve that name, not an auth problem. Wrong: add a registry secret. Right: delete or rename the entry.
- A catalog entry has at least one `catalog:` consumer outside `repos/**` (`git grep -F '"<name>": "catalog:' -- ':!repos'` prints a line). Wrong: keep a Deno-only `@std/*` in the catalog. Right: pin it in `deno.jsonc`.
- Dependabot reads `catalog`/`catalogs`, never root `overrides` (same parser method), so an override neither suppresses nor explains a proposal.
