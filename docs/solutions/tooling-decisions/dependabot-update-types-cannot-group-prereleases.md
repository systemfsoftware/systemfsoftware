---
title: Dependabot update-types cannot group prerelease bumps
date: "2026-08-19"
category: "tooling-decisions"
module: dependabot
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Editing .github/dependabot.yml group rules
  - A dependency line ships prereleases (4.0.0-rc.*, beta, next) and you want its updates grouped
root_cause: config_error
resolution_type: config_change
related_components:
  - .github/dependabot.yml
tags:
  - dependabot
  - prerelease
  - grouping
  - semver
  - update-types
---

# Dependabot group update-types cannot group prerelease bumps

## Context

This repo's dependabot config grouped effect-ecosystem dependencies into `effect-minor-patch` (patterns `@effect/*`, `effect`; update-types minor+patch) and `effect-major` (same patterns; update-types major). `effect` and `@effect/*` ship only `4.0.0-rc.*` prereleases. Observed: every rc-to-rc bump (`4.0.0-rc.108` -> `4.0.0-rc.109`) opened as its own PR (e.g. #192, #193), while the one stable bump in the family (`@effect/tsgo` 0.36.0 -> 0.36.5) grouped correctly into `effect-minor-patch` (#189).

## Root cause

Dependabot's group-level `update-types` accepts only `major`, `minor`, and `patch` (GitHub Docs, `update-types` (`groups`) option). At PR-assembly time, `Dependabot::Updater::GroupUpdateCreation#semver_rules_allow_grouping?` (dependabot/dependabot-core, released tag v0.392.0) classifies the bump by comparing major.minor.patch of the current and latest versions; when all three are equal — exactly the rc-to-rc case — it returns `false` with the comment "anything lower gets individual for now", and the update is raised as an individual PR. No group that sets `update-types` can ever take a prerelease bump, because no value covers it.

## Guidance

- **Invariant: a dependabot group either sets `update-types` (and silently forfeits every prerelease bump to an individual PR) or it does not — no `update-types` value admits prereleases.** There is no middle configuration; restoring the split later means accepting individual PRs for every rc bump again.
- To group a dependency whose updates move only the prerelease segment, define the group **without** `update-types`. A group with no `update-types` includes every update type, prerelease included.
- A group that sets `update-types` silently loses every prerelease bump to individual PRs. The loss is silent: nobody reads individual dependabot PRs as a config failure.
- Prefer this shape:

```yaml
effect:
  patterns:
    - "@effect/*"
    - "effect"
```

- The catch-all sibling groups (`other-minor-patch`, `major-updates`, patterns `"*"`) still pattern-match `effect`; the literal `effect` pattern in the dedicated group is strictly more specific, so Dependabot's specificity resolution assigns the update to the `effect` group.

## When to Apply

- Any ecosystem pinned to a prerelease line (rc/beta/alpha) where grouped updates are wanted.
- Re-evaluate when the effect line goes stable: a group without `update-types` then also merges future effect majors into the group PR. If majors should stay isolated, restore a split at that point — but never attach `update-types` to the group that must catch prereleases.

## Related

- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` (how this repo keys release gates)
- dependabot-core `Dependabot::Updater::GroupUpdateCreation#semver_rules_allow_grouping?` (the classifier)
- GitHub Docs, `update-types` (`groups`) option reference
