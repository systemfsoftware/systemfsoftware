---
title: An @internal tag lives on the comment, not the declaration text
date: 2026-08-23
category: logic-errors
module: oxlint-plugin
problem_type: logic_error
component: tooling
symptoms:
  - "A tagged export silences the next untagged export in the same file"
  - "A string that mentions @internal is treated as a tag"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - oxlint
  - jsdoc
  - internal
  - strip-internal
---

# An @internal tag lives on the comment, not the declaration text

## Problem

A lint rule that decides whether an export is tagged `@internal` by scanning `getText(node)` (or a window of text before the node) will treat neighboring comments and string literals as tags. The require arm then stays silent on an untagged export. The forbid arm reports a tag the export does not have.

## Symptoms

- `/** @internal */ export const a = 1` followed by `export const b = 2` produces zero findings for `b`.
- `export const MESSAGE = 'the @internal surface'` is treated as tagged.

## What Didn't Work

- A 200-character lookbehind on `getText(node, 200, 0)` recovered a missing comment attachment, but it also attributed the previous export's tag to the next one. Consecutive exports are the normal shape of an internal folder.
- Scanning the declaration text itself matches `@internal` inside import specifiers and string literals.

## Solution

Read only comments attached before the node (`getCommentsBefore`). The require arm matches the exact spelling `@internal`. The forbid arm also matches `@Internal`. Do not scan declaration text.

## Why This Works

`getCommentsBefore` returns comments between the previous token and this node. That is the JSDoc that belongs to this export. Declaration text is source, not a tag.

## Prevention

Pin both arms with a tagged-then-untagged pair and with a string literal that mentions `@internal` but has no tag.

## Related Issues

- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md` — a tagged public re-export is a different strip-class failure.
