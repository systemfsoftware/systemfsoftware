import type { ScenarioFn } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

declare const scenario: ScenarioFn

// Compile-time denial: a DAMP title must not typecheck. The functions are never
// invoked — the @ts-expect-error directives are verified by `pnpm typecheck`, so
// any regression that lets a DAMP title compile surfaces as an unused-directive
// error.

const denyUnderscoreTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never DAMP Should_[Behavior]_When_[Condition]
  scenario('Should_CreditASoleKill_When_OnlyOneFileKilledTheMutant', Effect.succeed('x'))
}

const denySpaceTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never DAMP Should_[Behavior]_When_[Condition]
  scenario('Should add binding when Given step succeeds', Effect.succeed('x'))
}

const denyConcatenatedDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a concatenated-token DAMP shape
  scenario('Reports_A_Regression_When_Check_Fails', Effect.succeed('x'))
}

const denyCamelCaseDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a CamelCase DAMP shape
  scenario('ACheckThatFailsIsReportedAsARegression', Effect.succeed('x'))
}

const denySnakeCaseDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a snake_case DAMP shape
  scenario('reports_a_regression_when_check_fails', Effect.succeed('x'))
}

const denySingleWordTitle = (): void => {
  // @ts-expect-error scenario titles are prose, at least one space separates words
  scenario('Login', Effect.succeed('x'))
}

void denyUnderscoreTitle
void denySpaceTitle
void denyConcatenatedDampTitle
void denyCamelCaseDampTitle
void denySnakeCaseDampTitle
void denySingleWordTitle
