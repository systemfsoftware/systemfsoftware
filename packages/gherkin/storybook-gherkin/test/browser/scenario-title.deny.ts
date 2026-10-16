import type { Feature } from '../../src/Feature.js'

declare const feature: Feature<never>

// Compile-time denial: a DAMP title must not typecheck. The functions are never
// invoked — the @ts-expect-error directives are verified by `pnpm typecheck`.
const denyDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never DAMP Should_[Behavior]_When_[Condition]
  feature.scenario('Should_ReportARegression_When_ACheckStartsFailing', [])
}

const denyDampTitleWithOptions = (): void => {
  // @ts-expect-error scenario titles are prose, never DAMP Should_[Behavior]_When_[Condition]
  feature.scenario('Should_ReportARegression_When_ACheckStartsFailing', {}, [])
}

const denyConcatenatedDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a concatenated-token DAMP shape
  feature.scenario('Reports_A_Regression_When_Check_Fails', [])
}

const denyCamelCaseDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a CamelCase DAMP shape
  feature.scenario('ACheckThatFailsIsReportedAsARegression', [])
}

const denySnakeCaseDampTitle = (): void => {
  // @ts-expect-error scenario titles are prose, never a snake_case DAMP shape
  feature.scenario('reports_a_regression_when_check_fails', [])
}

const denySingleWordTitle = (): void => {
  // @ts-expect-error scenario titles are prose, at least one space separates words
  feature.scenario('Login', [])
}

void denyDampTitle
void denyDampTitleWithOptions
void denyConcatenatedDampTitle
void denyCamelCaseDampTitle
void denySnakeCaseDampTitle
void denySingleWordTitle
