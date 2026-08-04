# Residual Review Findings — `fix/jsonc-tsconfig-parsing`

**Run context.** `ce-code-review mode:agent` run `20260803-210124-d9d8a1b8`, eight
reviewer personas (correctness, adversarial, security, generalist, testing,
maintainability, project-standards, api-contract) against
`git diff main...HEAD` at `751e9e0d6f`. 14 findings; 9 applied on this branch,
1 found already resolved, 4 residual and recorded below.

No tracker sink was used: this repository has no issue-tracker convention for
review residuals, so this committed file is the durable record.

## Applied on this branch (not residual)

| Severity | Finding                                                                                      | Commit                     |
| -------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| P0       | Published manifests carried `npm:@jsr/std__jsonc@^1.0.2`, which 404s on registry.npmjs.org   | `f8793d1dbd`               |
| P1       | Core preprocessor `SyntaxError` fallback path had no integration test                        | `afad6bd65f`               |
| P2       | Guard went green on a charCode / `slice`+`includes` comment scanner                          | `74d81a9c72`               |
| P3       | Plan U2 promised a `{ config } \| { error }` shape the implementation replaced with `Either` | `751e9e0d6f`               |
| P3       | Guard-vs-decode divergence documented on the core side only                                  | `edbb52866c`               |
| P3       | Plan U6 promised a `stripLiterals` reorder the diff did not deliver                          | `74d81a9c72`, `751e9e0d6f` |
| P3       | `guard-no-behavior.mjs` ordering defect parked without a declaration                         | `74d81a9c72`               |
| P3       | Core warning said "Could not use tsconfig file" when the file is still used                  | `9ec0ba32c0`               |
| P3       | Tautological test: `typeof x === 'boolean'` asserted against a constant                      | `afad6bd65f`               |

**Resolved before triage.** P3 project-standards, `packages/stryker-js/typescript-checker/src/tsconfig-helpers.ts:40`
— "unchecked cast on `JSON.parse` output survives" (CONSTITUTION §II.5). The
finding was raised against the pre-refactor file; `parseTsConfig` now returns
`Either` from `S.decodeUnknownEither` and the file contains no cast. Verified by
scanning the current source for `as any`, `as unknown`, `as <Type>`, `!.` and
`@ts-` suppressions: zero matches.

## Residual

- **P2 — testing — `packages/stryker-js/typescript-checker/test/integration/tsconfig-helpers.it.spec.ts:180`**
  — _No test exercises `determineBuildModeEnabled` with a `references` config
  whose paths carry string escapes._ **Declined with reason, not deferred.**
  `determineBuildModeEnabled` calls `parseTsConfig` and tests
  `references !== undefined`; it holds no parsing of its own. Escape survival is
  already pinned one layer down at `:39` ("should round-trip a Windows path and
  an escaped quote unchanged"). A copy of that assertion reached through
  `determineBuildModeEnabled` fails on exactly the same bugs, so by USER-V5's
  deletion test it defends nothing new. The defect class it gestures at — a
  second, hand-rolled parse path appearing inside the function — is covered
  repo-wide and structurally by `scripts/guard-no-hand-rolled-jsonc.mjs`, which
  is a stronger guarantee than one example test.

- **P3 — project-standards — `AGENTS.md:198` (REPO-C1)** — _Two of the thirteen
  branch commits omit the required scope:_ `442bf04228 docs: record the jsonc
  tsconfig parsing plan` and `fed5cfe9c0 chore: gate hand-rolled jsonc parsing
  repo-wide`. Not corrected here: the fix is a history rewrite of already-made
  commits, which needs the author's approval (USER-H1) and is not something to
  do unattended. `commitlint` passes on both — the configured `scope-enum` does
  not require a scope — so this is a convention gap between `AGENTS.md` and the
  enforcing gate, not a failing check. **Two candidate remedies:** reword the two
  subjects on rebase before merge, or tighten `commitlint.config.ts` to require
  a scope so the rule stops depending on author discipline.

- **P3 — project-standards — `packages/oxlint-plugins/recommended/scripts/guard-no-behavior.mjs:18`**
  — _The file is a Locked-class evaluation gate but is not named in the root
  `AGENTS.md` Surface Classes table_, which lists `scripts/test-contribution.mjs`
  as its evaluation-script exemplar. The same applies to the sibling guards
  (`scripts/guard-mutate-scope.mjs`, `scripts/check-lint-coverage.mjs`,
  `scripts/guard-no-hand-rolled-jsonc.mjs`). Not corrected here: `AGENTS.md` is
  itself a Locked surface, and editing it to widen the definition of Locked
  during a review-fix pass is exactly the self-authorising edit the class
  forbids. **Proposal for the author:** replace the single-file exemplar with the
  pattern `scripts/guard-*.mjs`, `scripts/check-*.mjs`,
  `scripts/test-contribution.mjs`.

- **P3 — project-standards — `packages/stryker-js/typescript-checker/src/typescript-compiler.ts:396`**
  — _A non-null assertion survives_ (`sourcePath!`), CONSTITUTION §II.5.
  Pre-existing at `main`, outside every hunk this branch touched, and in a code
  path (source-map resolution) unrelated to tsconfig parsing. Left alone under
  REPO-W2 scope discipline. The reviewer also flagged an unchecked cast in this
  file; that one is gone — the current source has no `as any` / `as unknown` /
  `@ts-` suppression, leaving the single assertion above as the whole residual.
