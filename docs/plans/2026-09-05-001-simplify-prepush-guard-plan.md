---
title: Simplify pre-push remote-main guard
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Plan: simplify pre-push remote-main guard

## Objective

Replace `scripts/guards/check-remote-main.ts` (245 lines, arktype, Deno, stdin parsing) with a shell script inlined into `.husky/pre-push` (22 lines of POSIX shell) — identical logic, no runtime dependency, no stdin complexity.

## Authority

worktrunk-scripts `.husky/pre-push` as reference implementation.

## Requirements

- R1: gate refuses when HEAD is not an ancestor of remote `origin/main` SHA.
- R2: new repo (no remote main) — allow.
- R3: remote SHA not present locally — fetch before ancestry check.
- R4: error message includes remote SHA and rebasing instruction.

## Units

- U1: inline the guard logic into `.husky/pre-push` — no separate guard file.
- U2: delete `scripts/guards/check-remote-main.ts`.

## Verification

- `sh -n .husky/pre-push` — syntax OK.
- push a behind branch — hook refuses with message.
- push with remote main ahead — hook refuses.
- fresh clone, no remote main — hook allows.
