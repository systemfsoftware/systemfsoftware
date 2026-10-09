---
title: A preset's ignorePatterns do not reach a config that extends it
category: build-errors
module: oxlint preset wiring
date: 2026-10-08
problem_type: logic_error
component: lint_plugin_delivery
severity: medium
symptoms:
  - "a file matched by a preset's ignorePatterns is still linted in a package whose config extends that preset"
  - "deleting an entry from a preset's ignorePatterns changes no finding in a consumer whose config only extends that preset"
root_cause: config_error
resolution_type: config_change
framework_version: oxlint 1.82.0
retire_when: "oxlint documents or implements inheritance of ignorePatterns through extends; re-run the two-directory probe below on the new version"
tags:
  - oxlint
  - preset
  - extends
  - ignore-patterns
  - config-merge
  - silent-gate
---

# A Preset's ignorePatterns Do Not Reach A Config That Extends It

## Problem and context

Before this change, `oxlint-config-rule-authoring`, `oxlint-config-dmmf`, `oxlint-config-cell-architecture` and `oxlint-config-recommended` each put an `ignorePatterns` list on their default config object, and the first three also exported it by name. Every package config in the tree, including each preset's own, consumes a preset as `defineConfig({ extends: [preset] })`, and no package config sets `ignorePatterns` itself. The lists looked like they kept `**/*.mjs`, `**/*.d.ts`, `**/lib/**` and others out of every package's lint run.

They kept nothing out. On oxlint 1.82.0, `extends` merges rules, plugins and overrides, but not `ignorePatterns`. A scratch `debugger` appended to the hand-written `check-dts.mjs` script in the `storybook-gherkin` package was reported by that package's `lint` script (`eslint(no-debugger)`, exit 1) while `**/*.mjs` was still in the extended preset's list. A historical measurement, taken while dmmf and cell-architecture each still held their own list: deleting the 16 dead entries from those two lists changed no finding in an 86-task tree lint.

## Failure mechanism

1. **`ignorePatterns` is resolved per config file.** The option's own documentation says its globs are "rooted at the directory containing the configuration file". The extended config object has no directory of its own, and oxlint does not carry its `ignorePatterns` into the extending file.
2. **Default ignores hide the gap.** `oxlint .` already skips `.gitignore`d paths, so build output, installed packages and coverage reports stay out regardless. The preset list looks effective for the entries that matter most.
3. **Nothing reports the inert key.** A config whose ignore list applies to nothing parses and lints exactly like one whose list applies.

Measured with the repo's own `oxlint` binary, one base config and two consumer directories, each holding a nested ES module script and a top-level JS file, both containing a `debugger` statement:

| Consumer config                                                       | nested ES module script reported |
| --------------------------------------------------------------------- | -------------------------------- |
| `{ ignorePatterns: ['**/*.mjs'], rules: { 'no-debugger': 'error' } }` | no                               |
| `{ extends: [base] }`, base carrying the same two keys                | yes                              |

The top-level JS file is reported in both, so the rule is loaded in both.

## Architectural invariants

**An ignore entry is only as present as the config file that declares it.** Rules, plugins and overrides are properties of a rule set and travel through `extends`; ignore globs are properties of a directory and stay with the file that names them. A preset can ship rules to its consumers, but it cannot ship a file-selection decision through `extends`.

```
effective_ignores(consumer) = consumer.ignorePatterns ∪ gitignore(consumer.dir)
                              # preset.ignorePatterns is absent from this union under extends
```

## Guidance

- To keep a path out of a package's lint run, set `ignorePatterns` in that package's own `oxlint.config.ts`. A preset's list only applies when the preset object is the top-level config, or when a consumer spreads it into its own `ignorePatterns`.
- Before trusting or editing an ignore entry, probe it: put a known violation in a file the entry should hide, run the consumer's own `lint` script, and check whether the diagnostic appears. Reading the config is not evidence.
- A preset's `ignorePatterns` is still published surface. Consumers outside this repository spread `recommended.ignorePatterns` into their own list, and that form honours it: a scratch file under a `repos/` directory is hidden by the spread config and reported by the `extends`-only config. Changing the list is a consumer-visible change for spreaders even when it changes nothing for `extends` consumers.

## Decision

Because spreading consumers exist, the lists are kept, not deleted, and there is one: `oxlint-config-rule-authoring` owns `ignorePatterns`, the only preset with no preset dependency, and `oxlint-config-dmmf`, `oxlint-config-cell-architecture` and `oxlint-config-recommended` import it onto their default configs. Two hand-copied lists drift on the next one-sided edit; one imported list cannot.

## Applicability

Applies to any oxlint config composed through `extends`. The sibling learning `oxlint-preset-overrides-are-replaced-by-a-spread.md` covers the opposite form: a spread replaces the preset's `overrides`, while `extends` merges them. Together: `overrides` survive `extends` and die under a spread; `ignorePatterns` die under `extends` and survive only where they are spread or written locally.

## Related

- `docs/solutions/build-errors/oxlint-preset-overrides-are-replaced-by-a-spread.md`: the same preset wiring, failing in the other direction.
- `docs/solutions/build-errors/a-disable-comment-names-the-config-key.md`: lint configuration that parses, matches nothing, and reports nothing.
