# compound-packs dataset

Inputs `pack-eval` needs to evaluate this repo's compound packs. The evaluator itself is in `evals/pack-eval`.

| File                        | Contents                                                                                                                                    | Who writes it                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `selector-instruction.json` | The rule-selection instruction replayed against the model, with its provenance (consumer, plugin version, source path)                      | Copied from the CE plugin      |
| `dimensions.json`           | Dimensions and values that tasks are generated from                                                                                         | Owner                          |
| `tasks.json`                | Accepted tasks, each assigned to the `dev` or `test` split                                                                                  | Owner, through the review page |
| `routing-labels.json`       | For each task and pack, the rules that govern the task                                                                                      | Owner, through the review page |
| `pair-labels.json`          | For each rule pair two rules govern on one task: Pass or Fail, the owner's critique, the split, and whether the pair is observed or planted | Owner, through the review page |
| `judge-prompt.json`         | The contradiction judge's criterion, its Pass and Fail definitions, and the `train` pairs used as few-shot examples                         | Owner                          |

## Labelling question

For each task and each rule, ask: **does this rule constrain the work this task requires?** Answer from the rule's body. Do not answer from its `applies_when`: that field is what the selector sees, and the labels are what the selector is scored against.

A rule is labelled blind. The review page does not show which rules the selector loaded until the task is labelled for that pack.

## Splits

Accepting a task assigns it to whichever of `dev` and `test` holds fewer tasks. Ties go to `dev`. A rule gets rates in a split only once that split holds enough governed and not-governed tasks for it to clear the evidence floor, which is a run parameter. Below the floor the rule is reported as insufficient evidence.

Rule pairs are split separately, by verdict. Once a verdict holds three pairs, its pairs are apportioned about 15/45/40 across `train`, `dev`, and `test`, ordered by pair id. Until then every new pair goes to `dev`. A pair named in `judge-prompt.json` as a few-shot example always stays in `train`, and `tune-judge` reads `dev` pairs only, so the judge is never tuned on the pairs that validate it.

## Change rules

- Labels are the owner's work. The evaluator and its agents never write labels.
- Commit label changes on their own: never in the same commit as a pack file or evaluator code.
- Before generating any tasks, review 20 draft tuples from `dimensions.json`.
- Model answers, traces, candidates, caches, and reports stay under `.pack-eval/`, which is gitignored. None of them are committed.

## Running

```sh
pnpm --filter @systemfsoftware/pack-eval build
node evals/pack-eval/dist/main.mjs evaluate \
  --pack compound-packs/cell-architecture --pack compound-packs/boundary-testing \
  --dataset evals/compound-packs --selector-model <openrouter model id> --report .pack-eval/report.json
```

`OPENROUTER_API_KEY` must be set. There is no default model.
