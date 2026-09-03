---
title: A disable comment names the config key, never the plugin constant
category: build-errors
module: oxlint rule delivery and suppression
date: 2026-09-03
problem_type: logic_error
component: lint_plugin_delivery
severity: high
symptoms:
  - "lint passes on lines whose disable comment names an unregistered rule id"
  - "removing one disable comment in a file suddenly surfaces violations other comments were believed to excuse"
root_cause: config_error
resolution_type: code_fix
tags:
  - oxlint
  - disable-comments
  - rule-namespacing
  - aggregate-plugins
---

# A Disable Comment Names The Config Key, Never The Plugin Constant

## Problem and context

A lint suppression comment can be dead on arrival and nothing warns. Four per-line disable comments in a test file named the rule as `@systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api` — the plugin's own registration constant — and suppressed nothing. The same file also carried a file-level disable naming `@systemfsoftware/effect-dmmf/tests-import-public-api`, which is the id the runtime actually matches. The file-level comment did all the work for months; the per-line comments were theater. When the file-level comment was removed during a cleanup, lint went red on imports everyone believed were excused, and the per-line comments were exposed as no-ops.

## Failure mechanism

1. **Two names for one rule.** An aggregate plugin registers rules under one name internally (its registration constant reads `@systemfsoftware/oxlint-plugin-effect-dmmf`) while the config layer that turns the rules on publishes them under another (`@systemfsoftware/effect-dmmf`, documented by the lint-config package and confirmed by live probe). Both names appear in source; only one matches at suppression time.
2. **Silent acceptance of unknown ids.** The linter does not error — or warn at any gate-visible level — when a disable directive names a rule id no config registers. The directive parses, matches nothing, and suppresses nothing. Green gates cannot distinguish "suppressed on purpose" from "suppression never worked".
3. **Redundancy masks the defect.** Where a dead per-line disable exists, a live broader disable (file-level) usually sits nearby. The broad one hides the narrow one's no-op status until the broad one is deleted — typically during an unrelated hygiene pass.

## Architectural invariants

**A suppression comment is executable configuration; its id must be verified against the runtime, not read off a constant.** The only evidence that a disable works is differential: with the offending line present and the disable removed, lint fails; with the disable restored, lint passes. A disable that has never been differentially tested is an unfalsified hypothesis — the same polarity trap this corpus records in `an-escape-hatch-is-an-unfalsified-hypothesis.md`, and the reason `a-port-beat-every-exemption-for-banned-imports.md` vetoes disables as fixes.

Corollary: when a rule is delivered through an aggregate that renames rule ids, the disable id is the **config key** (what the enabled-rules map spells), never the plugin object's self-reported name and never the npm package name.

## Verification and prevention

- Differential probe before trusting any disable: delete the offending import (or the disable) in a scratch check and confirm lint output flips. Cost: seconds. The probe in this session flipped the answer that static reading got backwards.
- Sweep shape: search the workspace for `oxlint-disable` comments naming the rule and require each id to equal the id the linter echoes in its own error messages — the namespace the linter prints in violations is the runtime truth.
- Treat "disable comments that reference the rule" as part of the rule's own test surface: a rule whose escape hatch is dead is stricter than intended, and one that is dead in the other direction is stricter than anyone knows.

## Application note

Applies to any linter with comment-based suppression and any plugin aggregation layer that re-namespaces rules (oxlint aggregates, ESLint flat-config re-exports, custom rule re-export barrels). The failure class is silent, so verification must be differential — tooling will not report it.
