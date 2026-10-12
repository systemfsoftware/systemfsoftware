---
title: Storybook screenshot evidence rule and story capture ban - Plan
type: feat
date: 2026-10-12
topic: storybook-screenshot-evidence
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Storybook screenshot evidence rule and story capture ban - Plan

## Goal Capsule

- **Objective:** When an agent adds screenshots or other visual evidence to stories, or a CI step that collects UI evidence, planning and ce-code-review in every repo that enrolls `storybook-testing` steer it to the test runner's own capture path and refuse hand-rolled per-step capture and bespoke collection.
- **Means:** one new rule, `compound-packs/storybook-testing/visual-evidence-comes-from-the-runner.md`, plus one error-level `page.screenshot` ban for story files in `@systemfsoftware/oxlint-config-recommended`.
- **Product authority:** the root's follow-up intent of 2026-10-12, which supplied the incident and a candidate mechanism to test. This brainstorm tested that candidate against primary sources and narrowed it (Key Decisions).
- **Open blockers:** none. PR #746 merged as `763fd66399`, so the fetch ban this lint composes with and `boundary-testing/expected-values-never-come-from-the-subjects-output.md` are on `main`. This branch is cut from `763fd66399`.

## Product Contract

### Summary

`storybook-testing` gains a rule that visual evidence comes from the runner. Each story's image comes from one capture hook in a setup file the Storybook Vitest project registers, and failure images come from Vitest. Both folders are gitignored run output that CI uploads as it is. The shared oxlint preset bans `page.screenshot` in story files, which is the part of the rule a linter can see.

### Problem Frame

A product repo (2026-10-12) captured images by calling `page.screenshot` inside story steps and gathered them with a custom CI collection step. No pack rule refused either. An unnamed reference app shows the alternative: a single `afterEach` in `.storybook/vitest.setup.ts` calls `@storycap-testrun/browser`'s `screenshot(page, context)` and writes to a gitignored `__screenshots__/<viewport>/<story>/` folder. The project sets `screenshotFailures: true`, and CI uploads the folder.

The repo has no story that captures images today. `git grep` on `origin/main` (`02bf9653b1`) finds no `page.screenshot`, `storycap` or `screenshotFailures` outside vendored `repos/`. The only Storybook setup, `packages/gherkin/storybook-gherkin`, runs through `@storybook/addon-vitest` with no `setupFiles` entry. Root `.gitignore:6` ignores `.vitest/`, which `.gitignore:5` labels as holding "browser failure screenshots"; `__screenshots__/` is ignored only in `packages/atom/effect-atom-react/.gitignore:3`.

### Key Decisions

- **The rule goes in `storybook-testing`, not a new pack or `boundary-testing`.** The pack's README already owns "where stories run and what fails them" (`real-browser-axe-as-error`) and what a story claims at a viewport (`pin-the-viewport-a-claim-needs`). A one-rule pack would duplicate that scope. `boundary-testing` owns oracles, not capture mechanics. Governs R1, R5, R6, R7, R8.
- **The mechanism is the runner's, and no capture library is mandated.** Storybook core ships no screenshot API. Its Vitest addon docs document none, and Storybook's own visual testing is Chromatic, which needs a cloud account and project token (https://storybook.js.org/docs/writing-tests/visual-testing). Vitest owns failure capture (`browser.screenshotFailures`), but the Storybook addon sets it to `false` whenever the project has a `test.browser` config and leaves the flag unset (Storybook `v10.6.1`, `code/addons/vitest/src/vitest-plugin/index.ts:433-440`), so the project must set it to `true`. A setup file is the one place for a per-story hook, but the addon never discovers one: it prepends its internal setup files to the project's own `setupFiles` (same file, lines 371-376). The capture library's own Vitest plugin (`storycap(...)`) supplies the context its `screenshot()` needs. `@storycap-testrun/browser` 3.1.2 (reg-viz, MIT) is the cited example of the hook, not a requirement. Chromatic is rejected because public CI gets no cloud accounts or tokens. Governs R1, R3.
- **Committed reference images are refused by citation, not restated.** Vitest's visual-regression guide says to commit `toMatchScreenshot` references ("Commit them to your repository."). A reference recorded from the component's own render is a golden file from the subject, which CONST-T10 and #746's `expected-values-never-come-from-the-subjects-output.md` already refuse. Admitting baselines per the Vitest guide was rejected for that reason. `toMatchScreenshot` references and `page.screenshot` output share the `__screenshots__` default (pinned `vitest` 5.0.1 `plugin.d.ts:694-699,984-990`). Failure captures go elsewhere, to `<attachmentsDir>/failure-screenshots/<file>/<test>.png` (Vitest `v5.0.1`, `packages/browser/src/client/tester/runner.ts:187-204`). Governs R2.
- **One story, one image.** The setup-file hook captures after a story's play function finishes, so it cannot evidence an intermediate step. A state worth evidencing is its own story, as `journeys-are-embedded-gherkin` already gives each journey one When. Hand-rolled mid-journey capture has no compliant form. Governs R1.
- **E2E journeys are out of scope.** Playwright journeys against a running app use the server-side `page`, which Vitest documents as a different object (https://vitest.dev/api/browser/context). The public `systemfsoftware/effect-endgame-starter-kit` at `375e468` captures one full-page image per scenario in `apps/site-e2e/tests/__fixtures__/browser.fixture.ts:59-60` and uploads `apps/site-e2e/artifacts/` with `if: always()` (`.github/workflows/ci.yml:74-81`). That is not the story shape, and the rule does not reach it. Governs R4.
- **Lint covers story files only.** A glob cannot tell a Vitest browser test from a Playwright e2e test, so banning `page.screenshot` in `*.test.*` would be stricter than R4. `vitest/no-restricted-matchers` on `toMatchScreenshot` was rejected: it maps to `boundary-testing`, not this rule, and `@systemfsoftware/vitest` owns matcher refusals (`packages/runner/vitest/src/internal/refusals.ts`). Governs R9.
- **`major` for the preset.** The preset is published publicly, so its consumers cannot be enumerated, and a new error-level ban fails lint on existing consumer code. #746 shipped its bans at `major` for the same reason. A conditional level that waits on a consumer census was rejected. Governs R12.
- **Separate PR after #746** (session-settled: user-directed — chosen over amending #746: the root keeps #746's scope closed and orders this unit after its merge). Governs R12.

### Requirements

**The rule (`compound-packs/storybook-testing/visual-evidence-comes-from-the-runner.md`)**

- R1. Each story's evidence image comes from one `afterEach` hook in a setup file listed in the Storybook Vitest project's `test.setupFiles`, and failure images come from Vitest's `browser.screenshotFailures`, which the Storybook Vitest project sets to `true` explicitly. No story, play function, step handler or Vitest browser test calls `page.screenshot`, directly or through a helper.
- R2. Evidence images are run output in two folders: the hook's output folder (default `__screenshots__`) and Vitest's attachments folder (default `.vitest/attachments`, ignored as `.vitest/`). Both are in the repository's ignore list, and no image or reference screenshot is committed (cite `boundary-testing/expected-values-never-come-from-the-subjects-output.md` for references).
- R3. CI collects visual evidence with one `actions/upload-artifact` step over the two folders R2 names. The step names both folders relative to the Storybook project and also runs when tests fail (`if: ${{ !cancelled() }}`, per GitHub's status-check-function docs), with `if-no-files-found: warn`. No step re-captures, copies, renames or post-processes images, and no step calls a cloud visual-testing service.
- R4. The rule governs stories and tests run in Vitest browser mode. Playwright journeys against a running app are named as outside it.
- R5. The rule file follows the pack's shape on `main`: frontmatter `title`, situational `applies_when` and `tags`; a prose intro; numbered clauses; one `tsx` block with `// WRONG:` and `// RIGHT:`; a `Grounds:` line; and a closing ``Gate: `review` —`` line whose question is answerable from the diff.
- R6. `applies_when` names four situations: adding screenshots or visual evidence to stories, a CI step that collects UI evidence, `page.screenshot` in a story or browser test, and a PR that commits images under a screenshot folder. `tags` carry `storybook`, `screenshots`, `visual-evidence`, `ci` and `artifacts`.
- R7. The incident is stated only as "a product repo, 2026-10-12", and the RIGHT reference only as "an unnamed reference app". The WRONG block shows `page.screenshot` in a story step. The RIGHT block shows the setup-file `afterEach` and its `setupFiles` entry, and it keeps axe running per `real-browser-axe-as-error.md` clause 4.
- R8. The pack README gains one bullet for the rule.

**The lint (`@systemfsoftware/oxlint-config-recommended`)**

- R9. `no-restricted-properties` reports `page.screenshot` at `error` in `**/*.stories.ts` and `**/*.stories.tsx`, with a message beginning `storybook-testing/visual-evidence-comes-from-the-runner:`. It is no stricter than R1: it bans only `page.screenshot` in story files, and the aliased and helper forms stay with review.
- R10. No file loses or gains another ban. `*.stories.tsx` keeps #746's `.tsx` fetch property ban, and `*.stories.ts` does not gain it, because `ui-state/components-perform-no-io` governs `.tsx` modules only. The ban's value is exported, like #746's, so a consumer override can spread it.
- R11. The preset's own tests prove it with planted cases and a clean case:
  - planted: a direct and a destructured `page.screenshot` in a `.stories.tsx` and in a `.stories.ts`, each reported once at `error` naming the rule;
  - clean: a story using only `canvas`, a setup file calling `screenshot(page, context)`, a `fetch` in a `.stories.ts`, and a non-story helper calling `page.screenshot`, all unreported (the last pins the lint to story files);
  - composition: a `.stories.tsx` calling `window.fetch` is still reported by the fetch ban.

**Release**

- R12. One PR from a fresh branch cut from post-#746 `main`, with a changeset for the preset at `major`. Dependents' intents are whatever the repo's changeset gate requires at that head.

### Acceptance Examples

- AE1. **Covers R1, R9.** A story whose `play` calls `await page.screenshot({ path })` fails `oxlint` with `storybook-testing/visual-evidence-comes-from-the-runner`, and the Gate refuses it.
- AE2. **Covers R1.** A browser test helper `captureStep(page)` that wraps `page.screenshot` and is called per step is not linted, but the Gate refuses it.
- AE3. **Covers R1.** A setup file with the capture `afterEach` that no `test.setupFiles` entry lists is refused at review.
- AE4. **Covers R2.** A diff adding `__screenshots__/Button.stories.tsx/primary-chromium-linux.png` is refused at review, and so is a capture hook added without an ignore entry for its folder.
- AE5. **Covers R3.** A workflow step that runs a script to find, rename and zip PNGs before uploading is refused. A single `upload-artifact` of both R2 folders with `if: ${{ !cancelled() }}` passes.
- AE6. **Covers R4.** A Playwright e2e fixture that captures one image per journey scenario is not governed by this rule.
- AE7. **Covers R10, R11.** On a `.stories.tsx` file both bans apply, so `window.fetch` and `page.screenshot` are both reported.
- AE8. **Covers R1.** A Storybook Vitest project that sets `browser: { enabled: true }` without `screenshotFailures: true` is refused at review: the addon turns failure capture off.

### Scope Boundaries

- No change to the merged `packs/ui-state` branch.
- No rule for per-story capture settings (skip, delay, mask). No incident names them, the parameters belong to whichever capture library a repo picks, and a story's viewport is already owned by `pin-the-viewport-a-claim-needs` through `globals.viewport`.
- No `toMatchScreenshot` refusal in `@systemfsoftware/vitest`. That fork omits `toMatchScreenshot` from its refusals, and #667 (2026-10-08) made it resolve inside storybook-gherkin step handlers. Whether the fork should refuse it as it refuses `toMatchSnapshot` is the root's call.
- The ban reaches every consumer of the public preset, including repos that do not enroll `storybook-testing`, as #746's bans do. Narrowing the preset's audience is the root's call, not this unit's.
- No change to this repo's CI, `turbo.json` or scripts, and no new pack or enrollment (`storybook-testing` is enrolled in `.compound-engineering/config.yaml` on `main`).
- **Turbo:** this unit does not touch build speed, cache misses, CI task scope, affected work or the task graph. It edits pack markdown and one preset package whose `lint`/`test` inputs are `$TURBO_DEFAULT$`-based. R2 is consistent with Turbo's defaults: inputs are "all files in the package that are checked into source control" (https://turborepo.dev/docs/reference/configuration), so ignored images never enter a task hash.

### Dependencies / Assumptions

- Both are on `main` at `763fd66399`: the preset exports `fetchInComponentsProperties` (`src/index.ts:184-191`), and the boundary-testing rule exists. A probe on oxlint 1.82.0 showed that a separate `**/*.stories.{ts,tsx}` override replaces the `**/*.tsx` fetch entries for story files (`window.fetch` went unreported). Only the composed value kept both bans.
- Name-based matching: `no-restricted-properties` matches any object named `page`. The same probe showed it misses `import { page as p }` (narrower, acceptable) and reports a destructured `const { screenshot } = page`.

### Outstanding Questions

**Resolve Before Planning**

- None.

**Deferred to Planning**

- None. KTD1 and KTD3 resolve the two questions the requirements deferred.

### Sources / Research

- Primary-source dossier (scratch): `@storycap-testrun/browser` README and `examples/v11-react-vite/.storybook/vitest.setup.ts` (https://github.com/reg-viz/storycap-testrun); Vitest browser config, context API and visual-regression guide (https://vitest.dev/config/browser/screenshotfailures, https://vitest.dev/api/browser/context, https://vitest.dev/guide/browser/visual-regression-testing); Storybook Vitest addon and visual testing docs; `actions/upload-artifact` README and GitHub status-check functions.
- Pinned tool facts: `vitest` and `@vitest/browser` 5.0.1, `storybook` and `@storybook/addon-vitest` ^10.6.0, resolved 10.6.0 (`pnpm-workspace.yaml:27,47-52`), oxlint 1.82.0. Where the current Vitest docs and the pinned source differ, the pinned source wins (failure-capture path).
- Pack format and neighbours: `compound-packs/storybook-testing/pin-the-viewport-a-claim-needs.md`, `stories-are-the-ui-integration-tests.md`, `real-browser-axe-as-error.md` (clause 4, Gate) and `journeys-are-embedded-gherkin.md` on `origin/main`.
- Overfit gate: independent public shapes outside stories only. Besides the starter kit, `systemfsoftware/xstate` at `c8c376c` offers `screenshots: 'every-step'` in `packages/xstate-test/src/playwright.ts:246,623-624`, a model-based e2e library feature. No story-level incident exists outside the 2026-10-12 product repo.
- Report-only document review (2026-10-12): coherence, feasibility, scope-guardian (re-run after a malformed first return) and adversarial lenses, served by `minimax-code/MiniMax-M3.1-Flash-Preview` and `openrouter/deepseek/deepseek-v4.1-flash`. Three P1s were confirmed at source and applied; one P2 (conditional `major`) was rejected in Key Decisions.

## Planning Contract

- KTD1. **Two exported values and two overrides.** `storyScreenshotProperties` carries the capture ban alone and sets `**/*.stories.ts`. `fetchAndStoryScreenshotProperties` carries #746's three fetch entries then the capture entry and sets `**/*.stories.tsx`. Both overrides sit after `fetchInComponentsOverride`. Composing one exported value keeps the consumer recipe to one spread per glob, as #746's exports do. Governs R9, R10.
- KTD2. **Lint proof follows #746's fixture.** New files under `ui-state-fixture/src/screenshot/` and `ui-state-fixture/.storybook/vitest.setup.ts` are linted by the real oxlint binary through `tests/__fixtures__/oxlint-diagnostics.ts`. A new `tests/story-screenshot.test.ts` asserts the reported rule ids and severity per file, with expected values written as literals in the test. `capture-modules.d.ts` declares `@storycap-testrun/browser` so the setup fixture typechecks without installing it. `consumer-spread.config.ts` gains a `**/*.stories.tsx` override that spreads `fetchAndStoryScreenshotProperties`. Governs R11.
- KTD5. **One test file, admitted as a contract test.** `tests/story-screenshot.test.ts` proves a published consumer contract (the preset reports the capture ban and keeps the fetch ban) through the real oxlint binary and the built config, the layer #746's preset tests use. No other test is proposed: the pack text is graded by review. Governs R11.
- KTD3. **One new intent, `major`, for the preset alone.** `changeset-management check` at `8cd6e83009` passes against `763fd66399` with no new file, because #746's pending intents already name the preset (`major`) and its dependents (`patch`). The new ban still needs its own changelog entry, and the cycle's bump is `major` either way, so no dependent gains a row. Governs R12.
- KTD4. **No change to this repo's ignore list or CI.** Nothing here installs a capture hook. The rule governs repos that add one (R2, R3). Governs R2, R3.

## Implementation Units

### U1. Rule and README

**Goal:** `compound-packs/storybook-testing/visual-evidence-comes-from-the-runner.md` and one README bullet. **Requirements:** R1-R8. **Files:** the rule file, `compound-packs/storybook-testing/README.md`. **Approach:** the pack's shape on `main` (`pin-the-viewport-a-claim-needs.md`). The RIGHT setup file composes the a11y preview as a namespace import, because `@storybook/addon-a11y` `v10.6.1` `src/preview.tsx` has only named exports. **Verification:** `./bin/dprint check`; the CE resolver loads the pack without warnings; the privacy grep finds no private name.

### U2. Preset ban, fixtures, test, changeset

**Goal:** R9-R12. **Files:** `packages/oxlint-presets/oxlint-config-recommended/src/index.ts`, `tests/story-screenshot.test.ts`, `ui-state-fixture/{src/screenshot/*,.storybook/vitest.setup.ts,capture-modules.d.ts,consumer-spread.config.ts}`, `.changeset/quiet-lenses-capture.md`. **Verification:** the new test fails against the base preset and passes with U2 (Verification Contract).

## Verification Contract

- With `src/index.ts` at the base, `pnpm exec vitest run tests/story-screenshot.test.ts` fails the six capture assertions and passes the four clean cases. With U2 it passes.
- `pnpm turbo run build typecheck lint test --filter=@systemfsoftware/oxlint-config-recommended --force` exits 0, uncached.
- The author-changesets validator and `changeset-management check 763fd66399` exit 0.
- Full-path ce-code-review, report-only, with every loaded pack rule marked COMPLY or VIOLATE with file:line, and a cross-model pass on DeepSeek or MiniMax; a timed-out reviewer is rerun.
- The privacy grep over files, names, commit messages and the PR body finds nothing before every push.

## Definition of Done

Every R-ID holds, AE1-AE8 read true against the rule text and the preset's test output, CI is green on the pushed head, and the PR body carries the review receipt and the named cross-model model.
