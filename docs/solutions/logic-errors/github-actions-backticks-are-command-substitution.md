---
title: "GitHub Actions backtick markdown around matrix values is command substitution"
date: "2026-08-30"
category: logic-errors
module: .github/workflows/mutation.yml
problem_type: logic_error
component: ci
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - github-actions
  - shell-injection
  - workflow
  - matrix
  - command-substitution
related_components:
  - github-actions
  - mutation-workflow
symptoms:
  - "Markdown backticks around `${{ matrix.package }}` inside a workflow run: script are parsed by the shell as command substitution after Actions substitutes the value"
  - "A value containing backticks or `$()` executes with workflow privilege"
framework_version: "bash (GitHub Actions runner)"
---

# GitHub Actions backtick markdown around matrix values is command substitution

## Problem

In a GitHub Actions `run:` block, markdown backticks around an Actions expression become

shell command substitution. Actions substitutes `${{ matrix.package }}` into the shell

command text **before** bash parses it, so the value's backticks and `$()` are parsed as

executable code, not rendered as formatting.

## Symptoms

A workflow step that renders the matrix value as markdown code:

```yaml
run: echo "#### Mutation · `${{ matrix.package }}`"
```

Empirically verified: with `matrix.package='pkg$(echo INJECTED)'` the shell printed

`INJECTED` (the expression executed); with `'pkg`echo INJECTED`'` it printed

`pkgINJECTED`. The value is treated as a command.

## What Didn't Work

- Replacing backticks with bold asterisks (`**${{ matrix.package }}**`) does **not**

  neutralize `$()`: `echo "**pkg$(echo PWNED)**"` still executes the substitution inside

  the double-quoted literal. The reviewer's suggested fix was incomplete on this axis.

## Solution

Pass the value through an env var and reference the variable. Actions substitutes the

value when assigning the env var; bash does not re-parse metacharacters inside an

already-expanded variable when it is later referenced:

```yaml
env:
  PACKAGE: ${{ matrix.package }}
  STREAM: ${{ matrix.package }}/reports/mutation-stream.jsonl
run: |
  echo "- **Result**: ... Stream: **$STREAM**"
```

Verified: `PACKAGE='pkg$(touch /tmp/pwned)'` rendered literally and created no file.

Single-quoting the whole `echo '...${{ matrix.package }}...'` argument is the other safe

form (the workflow's Require step uses it).

## Why This Works

The injection happens because two substitutions happen in sequence: Actions replaces the

expression with its string value, then bash parses the resulting text as a command. An

env var assignment moves the value across that parse boundary as data — the later

`$PACKAGE` reference expands the variable's value without re-parsing it.

## Prevention

- Never put `${{ ... }}` inside backticks or `$()` in a `run:` script.
- Prefer env-var routing for every expression the run body needs; it also keeps the

  script readable and consistent.
- Treat workflow-shell code as a trust boundary: a matrix or input value that reaches

  the shell unquoted is attacker-controlled text.
