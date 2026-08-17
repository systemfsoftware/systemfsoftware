## Residual Review Findings

Source run: ce-code-review mode:agent, run `20260816-192143-f31af405`, branch `effect-atom-cycle` @ `830671e3c37`, plan `docs/plans/2026-08-16-001-fix-effect-atom-no-cycle-plan.md`. Reviewers: correctness, project-standards, maintainability, adversarial, learnings.

All actionable findings (standards P0 — six dropped public names in shipped dts; adversarial P1 — dual Result namespace divergence) were applied in the working tree and landed in commit `830671e3c37`:

- re-export imported bindings instead of an `export { ... } from` clause (tsgo drops the clause from bundled dts),
- single-sourced the merged `Result` namespace in `internal/result-values.ts` (removed the alias + local namespace workaround),
- restored `internal/` placement per plan KTD-3,
- restored the `isAsyncResult` upstream-alias note and documented the ResultProto/wire-codec coupling.

Advisory residuals filed (not applied — confidence 50/advisory or testing gap):

- P1 (advisory, human) — `packages/effect-atom/atom/src/internal/result-schema.ts:127` — Schema roundtrip silently couples to the `success` timestamp default; a changed default breaks every pre-existing wire blob. Suggested: hardcoded-wire-blob roundtrip test or a stubbable `currentTimestamp()`. → https://github.com/systemfsoftware/systemfsoftware/issues/176
- P2 (testing gap, `dist/Result.d.ts`) — no in-repo gate asserts the shipped dts named-export surface (`TypeId`, `failure`, `initial`, `success`, `isResult`, `isAsyncResult`); the 2026-08-16 regression passed lint/typecheck/tests/attw/dts:check. Suggested: strict-consumer compile or golden named-export comparison over the built entry types. → https://github.com/systemfsoftware/systemfsoftware/issues/177

Testing gaps not filed as tickets (covered by issue 177's gate): no hardcoded-wire-blob roundtrip test; no `isResult === isAsyncResult` identity assertion; no golden test of the emitted dts merged-namespace members.
