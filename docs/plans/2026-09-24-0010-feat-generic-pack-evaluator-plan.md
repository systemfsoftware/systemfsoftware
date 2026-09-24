---
title: "Generic compound pack evaluator (`evals/pack-eval`)"
date: 2026-09-24
type: feat
topic: compound-pack-semantic-evaluator
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
supersedes: docs/plans/2026-09-23-0501-feat-compound-pack-semantic-evaluator-plan.md
---

## Goal Capsule

- **Objective**: For any compound pack directory it is given, the repo owner learns whether two of its rules contradict each other on a real task, and whether each rule's `applies_when` fires on the tasks it governs and stays quiet on the rest.
- **Means**: A private workspace tool at `evals/pack-eval`, written as plain Effect code, that asks a decision model through `@systemfsoftware/discern`. It runs as a daily, fingerprint-gated GitHub Actions job.
- **Supersedes**: `docs/plans/2026-09-23-0501-feat-compound-pack-semantic-evaluator-plan.md`. Its product intent carries over, and its structure is replaced (Key Decisions below).
- **Stop conditions**: Stop if `@effect/ai-openrouter` or `@effect/ai-typesafe` at the catalog `effect` version cannot be installed.

---

## Product Contract

### Key Decisions

- **Packs are a runtime parameter** (session-settled: user-directed; rejected: evaluating the two packs named in code). The tool takes pack directories and a scenario file as arguments, and a pack's id is its directory name. No source file, test, or fixture names `cell-architecture`, `boundary-testing`, or `compound-packs`.
- **Plain Effect, not cells** (session-settled: user-directed; rejected: `@systemfsoftware/effect-cell-types` `Workflow`/`Sandwich`, command classes with instrumentation brands, cell role file suffixes, and the `recommended` oxlint preset that forces them). Modules are named by what they do. Lint is a plain oxlint config. Pure logic is ordinary functions over data.
- **Domain-neutral tests** (session-settled: user-directed; rejected: fixtures and examples drawn from the cell-architecture pack). Fixture packs describe a made-up domain, and property tests generate pack ids, rule stems, and task text.
- **Lives in `evals/`** (session-settled: user-directed; rejected: `packages/`). `evals/*` is a workspace glob, and the package is private.
- **Carried from the superseded plan** (session-settled: user-directed or user-approved there): semantic checks only; discern with a Jev-class model; a curated labelled scenario set; a daily scheduled job that skips unchanged fingerprints; provider-agnostic with OpenRouter as the default; advisory, never a merge gate; two-tier contradiction verdicts; labels judged from rule bodies.

### Requirements

- R1. `pack-eval evaluate --pack <dir>... --scenarios <file> [--report <path>]` evaluates every distinct pair of rules within each given pack.
- R2. Each pair is classified `disjoint`, `overlap_shared_fix`, `contradictory`, or `unclear`. A contradiction is **confirmed** only when some scenario expects both rules to govern it. Otherwise it is a **candidate** needing review.
- R3. Each confirmed or candidate finding names both rule files, its witnessing scenario ids (none for a candidate), and a remediation line.
- R4. For every rule and split (`dev`, `test`), the report gives TP/FN/FP/TN/uncertain counts plus recall and specificity. A rule with fewer than 3 positives or 3 negatives in a split is marked insufficient evidence and gets no rates.
- R5. An uncertain routing answer is counted as uncertain, never as a hit or a miss.
- R6. The report is a markdown card on stdout, plus a schema-versioned JSON file when `--report` is given. Exit codes: 0 means no confirmed contradiction, 1 means at least one confirmed contradiction, 2 means an input or provider failure.
- R7. `PACK_EVAL_PROVIDER` (`openrouter` | `typesafe`, default `openrouter`) and `PACK_EVAL_MODEL` choose the model. The default model is `typesafe/jev-1.13` on OpenRouter and `jev-1.13.0` on TypeSafe. Answers are cached under `PACK_EVAL_CACHE_DIR` (default `.pack-eval-cache`), in one file per provider and model, and are never committed.
- R8. `pack-eval fingerprint --pack <dir>... --scenarios <file> [--input <path>...]` prints one hex digest. It covers every file under each pack, the scenario file, every extra `--input` path, and the provider and model.
- R9. Malformed input is refused before any model call. That covers: a rule file with no frontmatter, a missing title, or `applies_when` that is not a non-empty list; a scenario file that fails its schema, has duplicate ids, names an unknown pack, or names an unknown rule. The refusal names the file or scenario.

### Scope Boundaries

- Deferred: conflicts across packs; the scheduled workflow file (lands after this tool is on main, in its own Evaluator commit); the owner-approved scenario labels for this repo's packs (data, owner approval required, own commit); a Vercel AI Gateway adapter.
- Out: snippet compilation, frontmatter style linting, auto-fixing rules, blocking PRs.

### Acceptance Examples

- AE1. A pair classified disjoint yields no finding.
- AE2. A pair classified contradictory, with a scenario expecting both rules, yields a confirmed finding naming both files and that scenario, and the exit code is 1.
- AE3. A no-rule scenario that the judge routes to a rule counts as that rule's false positive and lowers its specificity. The exit code stays 0.
- AE4. A contradictory pair with no co-governing scenario is a candidate, and the exit code is 0.
- AE5. The fingerprint is stable across runs. It changes when a pack byte, a scenario byte, an `--input` byte, or the model changes. It does not change for a file outside those inputs.

---

## Planning Contract

### Structure

```text
evals/pack-eval/
  package.json          # private, bin pack-eval -> dist/main.mjs, built by tsdown
  oxlint.config.ts      # plain oxlint: correctness + typescript/import/unicorn, no cell or DMMF presets
  src/
    rules.ts            # PackRule schema, frontmatter parse, loadPack(dir)
    scenarios.ts        # ScenarioSet schema, cross-reference check against loaded packs
    scoring.ts          # pure: rule pairs, routing metrics, collision findings, outcome
    report.ts           # EvalReport schema, markdown card
    judge.ts            # RuleJudge service: route(task, rule) and relate(ruleA, ruleB) over DecisionModel
    model.ts            # provider selection from Config, persistent per-model discern cache
    fingerprint.ts      # digest over sorted (path, bytes) plus provider and model
    evaluate.ts         # load -> judge -> score -> report
    main.ts             # effect/unstable/cli commands, NodeRuntime.runMain, exit codes
  test/
    fixtures/           # made-up domain packs + scenario sets
    *.test.ts
```

### Decisions

- The routing question sees only the task text plus the rule's title and `applies_when`. The relation question sees both rule titles and bodies. Labels come from rule bodies and live outside the tool, so the judge never scores a key against itself.
- A routing answer is a discern probability read with a band. At or above 0.85 is a match, at or below 0.30 is a miss, and anything between is uncertain.
- The cache wraps whichever provider layer is chosen with discern `Model.intercept([Model.caching(store)])`. The store is loaded from `<cacheDir>/<provider>/<model>.json` before the run and written back afterwards, even when the run fails.
- Tests use a scripted `Discern.Model.provider`. No test reaches the network.

### Verification

- `pnpm --filter @systemfsoftware/pack-eval typecheck`, `lint`, `test`, and `build` pass. `pnpm check:local` exits 0.
- A smoke run of the built CLI against the fixture packs exits 1 on the contradiction fixture and 0 on the leak fixture.
- `fingerprint` is stable across two runs over the same inputs.

### Tests (admitted by the test-layer gate)

| Test                       | Layer                                     | Defends                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/scoring.test.ts`     | property, pure                            | pair count n(n-1)/2 with no self-pairs; count conservation (TP+FN+FP+TN+uncertain = cells); uncertain never moves recall or specificity; insufficient-evidence floor; `Confirmed` iff contradictory and co-governed; outcome `Fail` iff some `Confirmed` |
| `test/loading.test.ts`     | deterministic refusals over temp files    | each R9 refusal names its file or scenario; a pack dir's `README.md` is not a rule                                                                                                                                                                       |
| `test/judge.test.ts`       | in-process, scripted provider             | band thresholds give Match/Miss/Uncertain; the cache answers a repeat without a provider call; the same input under two models writes two stores and does not share answers; an unknown provider is a config error                                       |
| `test/evaluate.test.ts`    | in-process integration over fixture packs | AE1-AE4, exit outcome, JSON report decodes and agrees with the scored findings                                                                                                                                                                           |
| `test/fingerprint.test.ts` | in-process over temp dirs                 | AE5                                                                                                                                                                                                                                                      |

Refused: tests of markdown wording, schema round-trip laws on report shapes, and anything spawning the CLI. The CLI gets a smoke run of the built binary.

## Appendix: destructive review (carried from the superseded plan, still binding)

- **Assumptions**: (1) a pinned decision model reading `applies_when` approximates how a planning agent selects rules; (2) labels judged from rule bodies are independent of the `applies_when` text under test; (3) a pair's conflict can be judged from the two bodies alone.
- **Lens**: Substitution. The rejected radical alternative is to run the real planning agent per scenario. It stays deferred as a sampled consumer-agreement check.
- **Delta kept**: candidate plus witness verdicts (answers assumption 3, per WIRE, arXiv 2605.27784); body-based labels (answers assumption 2); per-model cache; insufficient-evidence marking.
