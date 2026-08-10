# Residual Review Findings — refactor-storybook-gherkin-effect-composition (`377d4bf` → working tree)

**Run context.** ce-code-review (mode:agent, run dir `/tmp/compound-engineering/ce-code-review/sbg-1786304581/`)
against the uncommitted working tree on `fix/storybook-gherkin-tsgo-async` (BASE=HEAD=`377d4bf`), scope 5 files
(`packages/storybook-gherkin/{AGENTS.md,src/errors.ts,src/feature.observer.ts,src/index.ts,src/steps.observer.ts}`),
EXEC_LINES 173 → adversarial mode fired. Plan judged `implementation-ready` (R1–R7, U1–U4, DoD). Reviewers
dispatched onto the harness roster after the generic `task` agent proved disabled; correctness-reviewer returned
**0 findings**. Validator wave: **10/10 findings validated TRUE**. Cross-model review skipped: no
codex/grok/composer CLI on this host — no different-provider peer reachable.

No tracker sink is used in this repo; this committed file is the durable record, per the convention set by
`test-contribution-gate.md`.

## Applied

| Severity | Finding                                                                                                       | Fix                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P2       | AGENTS.md does not record the tsgo policy binding (leaf omits the extends-policy/lint:tsgo facts)             | leaf Verification block + tsgo-policy bullet                                                           |
| P3       | `feature()` JSDoc undersells the runtime requirement (consumer-supplied `Runtime`)                            | extended JSDoc                                                                                         |
| P3       | `StepContext.abortSignal` undocumented (the R6 break)                                                         | documented, with the abandon-not-cancel contract                                                       |
| P3       | Exit-classification duplicated across the two run sites                                                       | `squashExit` helper extracted, both sites delegate                                                     |
| P3       | caps loop guarded `undefined` where base had no guard (silent key-shape change on `Right(undefined)` decodes) | `Arr.zip(model.captures, decoded)` — restores base behavior                                            |
| P3       | leaf edge-entry undercounts run sites (bridge + interpretPlay)                                                | reworded, names both sites                                                                             |
| P3       | child-fiber orphan path: parent exit other than join (success/failure) left the child running                 | `Effect.ensuring(Fiber.interrupt(fiber).pipe(Effect.asVoid))` — every parent exit interrupts the child |

## Residual

- **P2 — api-contract — exported `Step.run` signature changed.** The `Step` interface's `run` moved from
  `(values, ctx) => Promise<void>` to `(values, ctx) => Effect.Effect<void, CaptureDecodeFailed>` — a public d.ts
  break with no in-repo consumers and no published-semver mechanism yet (package is ALPHA per REPO-R1). Recorded
  for the commit: `BREAKING CHANGE:` footer covering both this and the R6 abort-semantics break. Deliberately not
  softened with a compat shim — REPO-R1 says the better API wins.

- **P2 — reliability/manual — debug-mode step nesting.** In debug mode the instrumenter defers the step's
  `invoke` and pushes it to the ancestor stack only on "Next", so a step handler awaited inside another step's
  handler would not re-enter until then. **Accepted + documented**, not fixed: zero consumers, debug-mode-only,
  scheduler-dependent. Validator correction: the sync-scheduler mechanism is imprecise — `SyncScheduler` only
  executes on flush, so a nested child would hang rather than defer — the documented claim (defer until "Next")
  holds only under the instrumenter's debug-mode flow.

- **P3 — reliability — aborted step records green.** On abort, the step's own promise is abandoned, not
  cancelled; when it later settles, its step row is written as a pass. Accepted: the step's work genuinely
  completed; the story is torn down. The abandon-not-cancel contract is documented on `StepContext.abortSignal`.

- **P3 — adversarial/human — `decodeCapture` Either contract untested.** No package test suite exists by
  design (leaf M1: the package is 100% behavioural surface exercised by consumers; no `mutate` glob). The
  schema-decode error path (`CaptureDecodeFailed`) is the only pure decision in the package; if a suite is ever
  introduced, property-test it (schema law + error channel, cf.
  `docs/solutions/architecture-patterns/workflow-error-channel-gates.md` — Gate C: every error variant needs a
  producer the tests reach).

- **P2 — single-edge guard, dropped by author decision.** The one-interpretation-edge invariant (exactly one
  `Runtime.runPromiseExit` in `interpretPlay` + one `Effect.runPromiseExit` in the bridge) was proposed as a
  `scripts/check-edges.mjs` gate, then removed after consultation: the gate duplicated prose, guarded a
  property with zero consumers, and REPO-S6 cautions against doctrine gates with no published artifact to carry
  them. Remains: leaf AGENTS.md prose + review-time verification (validated by grep in this review).

- **Authoring discoveries (consumer exercise, P1 #9 — all three verified via
  `@storybook/addon-vitest` browser mode).** Recorded for the package's future authoring docs:
  1. Storybook 10 static indexer rejects `export default feature({...})` — `NoMetaError: CSF: default export
     must be an object`. The spread form `export default { ...f, title }` works.
  2. Play-only stories need `render: () => null` in the default export, or the react renderer shows
     "The component failed to render properly".
  3. **String holes are literal step text, not captures.** `${'name'}` renders `name` into the step text;
     captures are object holes `${ { name: 'name' } }` and reach the handler in its **second** argument
     (`(ctx, caps)`). A string hole intended as a capture fails silently at declaration time (no
     `UnresolvedCapture`, because a literal needs no value) — a candidate for a declaration-time guard or a
     docs note.
  4. `@storybook/test` has no v10 line; import from `storybook/test` (same as the package source).
  5. addon-vitest ignores `test.include` (deliberate — warning in plugin source); component-test files join
     via the `STORYBOOK_COMPONENT_PATHS` env var.

- **Learnings synthesis (repo corpus).** `docs/solutions/tooling-decisions/tsgo-lsp-linter-in-lint-pipeline.md`
  documents the exact `lint:tsgo`/turbo integration this package opted into (plugin name `@effect/language-service`,
  extends-array activation, `TSGO_FORMAT=github-actions` in CI, turbo task declaration requirement) — the leaf's
  tsgo-policy bullet now points at the same facts. `workflow-error-channel-gates.md` supplied the error-channel
  framing used above for the `decodeCapture` residual. `generated-schema-laws-are-tautological.md` is the
  background for why the plan chose schema-derived laws over hand-rolled ones where applicable.

## Consumer-exercise outcome (finding #9)

Exercise completed at `/tmp/sbg-consumer` (scratch, outside repo — plan-sanctioned):
`STORYBOOK_COMPONENT_PATHS=src/demo.test.ts vitest run` → **5 passed / 1 expected story-level fail**
(log: `/tmp/sbg-consumer/sanity-run.log`):

- R4: `Failing.play` rejects with `AssertionError` (name asserted) and message `expected 2 to be 3
  // Object.is equality` — original error identity survives the play edge and the instrumenter; the addon's
  story-run reports the same raw matcher diff.
- R6: aborting the 6s Slow play settles it promptly and silently (`resolves.toBeUndefined()`).
- R7: the Passing scenario (Given → Then) plays green; steps settle before play resolves.

The one red is the Failing story itself under the addon — the play rejecting is the point; the addon's report
carries the original AssertionError rather than a wrapper.
