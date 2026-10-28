Rules for CI that earns its runners: when a check gets its own job, how a run avoids wasted work, and how to tell a check worth keeping from a cargo-culted one.

## What it covers

| Rule file | Decides |
|---|---|
| `a-check-gets-its-own-runner-only-for-a-named-reason.md` | separate job/runner vs a step in an existing job |
| `superseded-runs-are-cancelled.md` | concurrency and cancel-in-progress |
| `skipped-work-still-reports-its-required-check.md` | path skips, required checks, merge queues |
| `every-check-names-the-defect-it-catches.md` | whether a check is worth having |

`jev/ci-check-verdict.md` is storage, not a rule. It holds a Jev checklist that classifies one existing check as keep, merge or drop, for audits. It is not calibrated yet and is not ready to hand verdicts to reviewers.

This pack extends `ci-workflows` in `compound-packs/` and does not repeat it. Lanes, cache writes, frozen installs, timeouts, failure reporting and local-gate parity stay there. Enrol both packs.

## Known overlaps with ci-workflows

The compound-engineering pack guide has no cross-pack conflict detection and asks for disjoint rules within a pack, so overlaps are fixed in the same change that adds a pack:

1. `ci-workflows/pull-request-jobs-check-after-a-frozen-install.md` used to say commit-message, changeset and PR-title checks all run their pinned tool in their own job. The rule is now: commit-message checks run as a step in the lint-and-typecheck job; changeset and PR-title checks run their pinned tool in their own job with no workspace install, dev shell or needs:. This change edits that line.
2. The same file allows "one pinned tool fetch" before the verdict step. The runner rule folds a check into the fast job only when its tool arrives with the frozen install or with that one fetch.
3. `ci-workflows/each-suite-runs-in-its-lane.md` names merge_group. A repository that queues through Mergify draft pull requests (`pull_request` with a head_ref such as `mergify/merge-queue/*`) has no merge_group event. This pack's rules say "queue draft"; the lane rule is left as it is.

All four rules end `Gate: judge`, matching the rules in ci-workflows, since one reviewer reads both packs. The value is a convention of this repository's packs.

## Enrol

Append this pack's id, `ci-compound-pack`, to the existing `pack:` list of the source entry that already names `ci-workflows`, and bump that entry's `ref` to a full sha that contains this pack. A second entry naming `ci-workflows` is reported as a duplicate pack id and ignored, and per-pack pinning inside one source is not built. In this repository the pack is enrolled by a `source: compound-packs/ci-compound-pack` entry in `.compound-engineering/config.yaml`.

The pack id is the directory name, `ci-compound-pack`.

## How review cites it

ce-code-review, on its full spine and in local reviews only, reads each rule's `title` and `applies_when`. A diff line that contradicts a matched rule becomes a `learnings` finding citing `(pack: <id>, <rule file>)`. Severity is not set in the rule. Review derives it from the rule's Consequence line via `action-class-rubric.md` (P0-P3). A violation on an unchanged line is reported as pre-existing.

Sources: every rule cites a public URL inline.

Read for this pack, from https://github.com/muratcankoylan/agent-skills-for-context-engineering (commit 9ff0c991), and how each item applies:

- `skills/tool-design/SKILL.md:31` (consolidation: one purpose per tool). An analogy for checks.
- `skills/harness-engineering/SKILL.md:145` (known good and known bad). An analogy; a proof-at-PR-time requirement was left out because it adds an evidence requirement.
- `skills/evaluation/SKILL.md:34` (deterministic validation before LLM judgment): why the Jev facts are code. `:147` and `:243` (overfitting to surface patterns): the basis for Q7.
- `skills/advanced-evaluation/SKILL.md:367` and `:369` (rubric drift, wording sensitivity): why question text is versioned and calibration reruns.

Osmani:

- https://addyosmani.com/blog/agentic-engineering/ (module quote): an analogy for the defect-comment rule.
- https://addyosmani.com/blog/code-agent-orchestra/ (flaky-test quote; "Three quality gates ... plan approval ... hooks ... AGENTS.md"): the flaky rule and step 0 of the runner rule.
