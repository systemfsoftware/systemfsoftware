Rules for CI that earns its runners: when a check gets its own job, how a run avoids wasted work, and how to tell a check worth keeping from a cargo-culted one.

## What it covers

| Rule file | Decides |
|---|---|
| `a-check-gets-its-own-runner-only-for-a-named-reason.md` | separate job/runner vs a step in an existing job |
| `superseded-runs-are-cancelled.md` | concurrency and cancel-in-progress |
| `skipped-work-still-reports-its-required-check.md` | path skips, required checks, merge_group |
| `every-check-names-the-defect-it-catches.md` | whether a check is worth having |

`jev/ci-check-verdict.md` is storage, not a rule. It holds a Jev checklist that classifies one existing check as keep, merge or drop, for audits.

This pack extends `ci-workflows` in systemfsoftware/systemfsoftware `compound-packs/` and does not repeat it. Lanes, cache writes, frozen installs, timeouts, failure reporting and local-gate parity stay there. Enrol both packs.

Known conflicts (CE has no cross-pack conflict detection, `docs/guides/packs.md:312`, and asks for disjoint rules within a pack, `:116`). Fix each in the same PR that adds this pack:

1. `ci-workflows/pull-request-jobs-check-after-a-frozen-install.md:11` says commit-message, changeset and PR-title checks "run their pinned tool in their own job". The owner ruled that commitlint runs in the fast-checks job (engram #789), while "changeset-check still waits on the owner". This PR changes that line to: "Commit-message checks run as a step in the lint-and-typecheck job; changeset and PR-title checks run their pinned tool in their own job with no workspace install, dev shell or needs:".
2. The same file, line 9, allows "one pinned tool fetch" before the verdict step. The runner rule folds a check into the fast job only when its tool arrives with the frozen install or with that one fetch.
3. `ci-workflows/each-suite-runs-in-its-lane.md:10` names merge_group, while the fleet queues through Mergify drafts (`pull_request` with head_ref `mergify/merge-queue/*`, younna-ai .mergify.yml:2, workstation .mergify.yml:5). This pack's rules say "queue draft"; the lane rule is left to its owner.

All four rules end `Gate: judge`, matching the 7 ci-workflows rules, since one reviewer reads both packs. CE does not define the value; it is a fleet convention.

## Enrol

Each consuming repo already has a `packs:` entry for the systemfsoftware source (workstation: `source: https://github.com/systemfsoftware/systemfsoftware`, `ref: 6456eba811f220d5a82bcac45773a760e94c35b5`, `pack: [ci-workflows, package-surface, schema-modelling, testing]`). Append this pack's id, `ci-compound-pack`, to that entry's `pack:` list and bump that entry's `ref` to a full sha that contains both this pack and the ci-workflows line change. A second entry naming `ci-workflows` is a "duplicate pack id ... ignored" error (CE `packs.md:249`), and per-pack pinning inside one source is not built (`packs.md:312`).

The pack id is the directory name, `ci-compound-pack`.

## How review cites it

ce-code-review, on its full spine and in local reviews only, reads each rule's `title` and `applies_when`. A diff line that contradicts a matched rule becomes a `learnings` finding citing `(pack: <id>, <rule file>)`. Severity is not set in the rule. Review derives it from the rule's Consequence line via `action-class-rubric.md` (P0-P3). A violation on an unchanged line is reported as pre-existing.

Sources: every rule cites a URL or file inline. "engram #N" means an owner ruling recorded in the fleet's engram memory, observation N.

Read for this pack, from https://github.com/muratcankoylan/agent-skills-for-context-engineering (commit 9ff0c991), and how each item applies:

- `skills/tool-design/SKILL.md:31` (consolidation: one purpose per tool). An analogy for checks.
- `skills/harness-engineering/SKILL.md:145` (known good and known bad). An analogy; the PR-time proof requirement was removed because it adds an evidence requirement.
- `skills/evaluation/SKILL.md:34` (deterministic validation before LLM judgment): why the Jev facts are code. `:147` and `:243` (overfitting to surface patterns): the basis for Q7.
- `skills/advanced-evaluation/SKILL.md:367` and `:369` (rubric drift, wording sensitivity): why question text is versioned and calibration reruns.

Osmani:

- https://addyosmani.com/blog/agentic-engineering/ (module quote): an analogy for the defect-comment rule.
- https://addyosmani.com/blog/code-agent-orchestra/ (flaky-test quote; "Three quality gates ... plan approval ... hooks ... AGENTS.md"): the flaky rule and step 0 of the runner rule.
