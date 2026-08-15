# Frontend Review Scope

The scope is the frontend: every active acknowledgement in the `frontend-hooks`, `frontend-screens`, and `frontend-journeys` claims.

## Configuration

Raise `evidence/review` to `"error"` in `packages/frontend/lint.config.ts`. Every acknowledgement then reports itself as unreviewed, and one still reporting is one this scope has not reached.

That is this scope's one permitted edit. Compare that file with the baseline afterwards, and the backend's two as well since this is the last scope that reviews anything: `packages/api/lint.config.ts` and `packages/backend/test/lint.config.ts`, where the rule is already `"error"`. Every other difference is a finding.

## Exclusion Carriers

The rule lists every unreviewed exclusion, but reading a carrier whole is what shows two entries deferring one requirement to each other. Read both:

- `packages/frontend/src/components/SCREEN_EVIDENCE_EXCLUDE.ts`
- `packages/frontend/tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts`

`frontend-hooks` has no carrier, and `frontend-screens` accepts an exclusion for a requirement only. An entry excusing an unconsumed operation or an unrendered hook is a finding, and so is one standing in for a screen or journey the requirements ask for.

## Deferrals Across The Two Layers

Frontend Review runs after Backend Final, so it is the one scope that can see both layers finished. Read every backend carrier entry that names the frontend as the owner — `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts`, `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts`, `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` — and check each against what this layer actually delivers. A backend entry deferring a requirement to a screen is a finding unless a screen or journey delivers it.

Ask the same of this scope's own entries as you read them above: one deferring a requirement to the backend is a finding unless an operation and its test carry it, and both are now built.

Neither layer alone can make this check, which is why it sits here rather than in a scope of its own. What you find on the other side is what each `@evidenceExcludeReview` states.

## Gates

Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`. Their output must contain no diagnostics after the last file change.

Run `pnpm plan` from `packages/frontend`. The claim proves a screen cites a requirement; this proves no requirement section is left without one, which is the direction coverage from the evidence side cannot see.

After the last correction, run `pnpm test:e2e` from `packages/frontend`, which builds live and fix every failure. A clean reload proves the bundle compiles, not that a journey still completes.
