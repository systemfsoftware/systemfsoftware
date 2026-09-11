---
title: A preset's overrides are replaced by a local spread, not merged
category: build-errors
module: oxlint preset wiring
date: 2026-09-11
problem_type: logic_error
component: lint_plugin_delivery
severity: high
symptoms:
  - "lint exits 0 in a package whose shared preset's overrides never applied"
  - "a rule added to the shared preset fires in every consumer except the ones that spread it"
root_cause: config_error
resolution_type: config_change
tags:
  - oxlint
  - preset
  - extends
  - overrides
  - config-merge
  - silent-gate
---

# A Preset's Overrides Are Replaced By A Local Spread, Never Merged

## Problem and context

A shared lint preset has two ways to reach a consumer, and only one of them merges. `k` packages consumed `@systemfsoftware/all` with `extends: [all]`; one consumed it by spreading the preset object into `defineConfig({ ...all, … })` and then declaring its own `overrides`. A spread copies the preset's top-level keys into a fresh object, and the local `overrides` key is assigned after the spread, so it **replaced** the preset's entire `overrides` array instead of merging with it.

The consequence was invisible. That package's lint stayed green while every rule living in the preset's `overrides` never ran: the preset's test-hygiene tier was inert, and the cyclomatic-complexity ceiling added in the same change would have been inert too. Nothing distinguishes "this package has no violations" from "this package's gate is not loaded" — both are exit 0.

## Failure mechanism

1. **Spread is assignment, not inheritance.** `{ ...preset, overrides: [local] }` evaluates the spread first and then sets `overrides`, so the preset's array is discarded wholesale. Arrays do not concatenate; `rules`, `plugins`, and `overrides` all behave this way.
2. **`extends` is the merging path.** `defineConfig({ extends: [preset], overrides: [local] })` asks the linter to merge the preset into this config: the preset's overrides survive beside the local one, in order.
3. **Both consumers look identical in review.** The two configs differ by one line and both read as "this package uses the shared preset". Only a differential reveals which one still carries the preset's overrides.

Measured at the introducing commit, with one file holding a function of cyclomatic complexity 5 under a `**/src/**` override of `complexity: max 2`:

| Consumer config                          | Result                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `{ ...all, overrides: [local] }`         | no diagnostic, exit 0                                                             |
| `{ extends: [all], overrides: [local] }` | `error eslint(complexity): function has a complexity of 5. Maximum allowed is 2.` |

The local override survives under `extends` — the same package's own `vitest/no-standalone-expect` override still applies to its Given/When/Then tests, which pass.

## Architectural invariants

**A gate that is inherited is only as present as the syntax that inherits it.** When a preset's strength lives in a key the consumer can also set, the consumer's config syntax decides whether the gate is loaded, and the decision leaves no trace in the output. Reading the config is not evidence; the only evidence is differential — introduce a violation the gate claims to catch and watch the diagnostic appear.

Corollary for review: "the gate fires in the other consumers" is not evidence it fires in this one. Consumers of one preset are not interchangeable, because the merge happens per config file, not per preset.

## Verification and prevention

- Probe shape, seconds to run: put a known violator under the glob the gate claims, run the consumer's own lint command, and require the diagnostic. Delete the probe file. A gate whose binding has never been probed is an unfalsified hypothesis — the same polarity trap recorded in `an-escape-hatch-is-an-unfalsified-hypothesis.md` and `a-disable-comment-names-the-config-key.md`.
- Sweep shape: `grep` every consumer config for the preset's spread (`...all`, `...base`) and require a probe in each file that also declares the same key (`overrides`, `rules`, `plugins`).
- Never reach for the spread when the preset supplies `overrides`. `extends` is the only form that cannot silently drop a tier.
- The preset's globs are config-relative, and `**/src/**` matches a path with an empty prefix, so the same override text works from any consumer directory — the glob is not what varies between consumers; the merge is.

## Application note

Applies to every layered-config linter and any inheritance expressed as an object spread rather than a merge directive: oxlint `extends`, ESLint flat-config re-exports, tsconfig `extends` (which merges, and whose inherited compiler options are a separate trap recorded in `install-time-tool-resolution-must-not-use-path.md`), Stryker and Vitest config presets. The failure class is silent in both directions — a dropped override disables checks nobody notices, and a dropped `off` re-enables checks nobody expected.

## Related

- `docs/solutions/build-errors/a-disable-comment-names-the-config-key.md` — the sibling silent-suppression learning; both are lint-configuration that parses, matches nothing, and reports nothing.
- `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md` — the rule this preset replaced, and the ceiling's current values.
