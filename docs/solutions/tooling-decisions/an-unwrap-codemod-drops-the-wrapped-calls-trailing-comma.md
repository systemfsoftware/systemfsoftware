---
title: An unwrap codemod strips the wrapped call's trailing comma into the output
date: 2026-09-11
category: tooling-decisions
module: workspace codemods
problem_type: logic_error
component: tooling
symptoms:
  - "dprint fails with `Expected ident` at the statement after a rewritten call"
  - "oxlint reports `Argument expression expected` and a cascade of `',' expected` from one file"
  - "a multi-line call site loses its closing structure: the expression ends in a bare `,`"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [codemod, text-transform, trailing-comma, mechanical-edit]
---

# An unwrap codemod strips the wrapped call's trailing comma into the output

## Problem

A balanced-paren codemod that removes a wrapper call (`wrapper(arg) -> arg`) captures everything between the wrapper's parentheses as the replacement — including the trailing comma of the wrapper's own argument list. Every multi-line call site it rewrites is left with a dangling comma where a complete expression belongs, and the file no longer parses.

## Symptoms

- `dprint`: `Expected ident` at the line following the first rewritten site.
- `oxlint`/`tsc`: `Argument expression expected`, then a `',' expected` cascade for the rest of the file.
- The rewritten region reads `const X =<newline>  InnerCall(...),<newline>` — the `,` is the wrapper's argument-list comma, not part of any list that still exists.

## What Didn't Work

- Matching only `wrapper(` and its balanced `)`: correct for single-line, arity-one calls whose argument ends without a trailing comma; silently corrupts any call formatted with a trailing comma (`wrapper(\n  arg,\n)`), which is exactly what prettier-style formatting produces for multi-line calls.
- Trusting the transform's success count: the codemod reports per-site success because the paren balance is genuinely balanced — the damage is syntactic, not paren-metric.

## Solution

Hand-fix each affected multi-line site after the codemod pass (fold the dangling comma into the surrounding construct, restoring `const X = InnerCall({...})`), and gate the codemod's output: run the formatter and the type checker immediately after the transform, before anything else touches the tree. In this workspace `dprint` caught all three corrupted files (`Schema.schema.ts`, `Worker.schema.ts`, `CheckMutants.schema.ts`) on the first post-transform pass.

## Why This Works

A wrapper call's argument list is allowed a trailing comma, so the byte range "inside the wrapper's parentheses" is not the same as "the argument expression". The codemod's invariant must be stated over the argument's grammar, not the parentheses: when the captured content ends with `,` immediately before the wrapper's closer, that comma belongs to the wrapper and must be dropped, not emitted.

## Prevention

- After any paren-based text transform, run the formatter and type checker in the same step as the transform — a parse failure is the cheap detector for this entire defect class.
- Treat multi-line call sites as the codemod's special case up front: audit for `,\n<closer>` inside the captured range and strip that trailing comma from the output.

## Related Issues

- `docs/solutions/architecture-patterns/deleting-a-consumer-leaves-its-requirement-standing.md` — the same deletion discipline at the syntax level: what the removed construct consumed is part of the removal.
