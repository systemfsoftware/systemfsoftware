import * as S from 'effect/Schema'

export const RequireTestContribution = S.NullOr(S.Array(S.String)).pipe(
  S.annotate({
    description:
      'Fail the run when a test file whose name ends with one of these suffixes kills no mutant that another test file does not also kill. Such a file could be deleted without leaving a single mutant alive, so a passing mutation score is no evidence it earns its place. Set to null to disable the check. The gate only applies to file classes the mutation operators can express — workflow, policy, and kernel property tests today; schema refusal tests are gated by refutation adequacy rather than by mutation. Documented default suffixes: .workflow.property.test.ts, .policy.property.test.ts, .kernel.property.test.ts.',
  }),
)

export const TestContributionOptions = S.Struct({
  requireTestContribution: S.optional(RequireTestContribution),
})
