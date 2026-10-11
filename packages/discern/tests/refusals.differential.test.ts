import { Differential } from '@systemfsoftware/differential-spec'
import { Discern } from '@systemfsoftware/discern'
import { Effect } from 'effect'
import * as fc from 'fast-check'

type Status = 'Match' | 'Miss' | 'Uncertain'

const statusArb: fc.Arbitrary<Status> = fc.constantFrom('Match', 'Miss', 'Uncertain')

Differential.compare({
  name: 'an uncertain-match refusal names the case and the reason',
  reference: (input: { caseId: string; reason: string }) =>
    Effect.succeed(`Semantic case "${input.caseId}" was uncertain: ${input.reason}`),
  candidate: (input: { caseId: string; reason: string }) =>
    Effect.succeed(new Discern.UncertainMatchError(input).message),
})
  .on(fc.record({ caseId: fc.string(), reason: fc.string() }))
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a collision refusal names the shared id and an impossible-case refusal names its kind',
  reference: (decisionId: string) =>
    Effect.succeed(
      `A supposedly exhaustive semantic classification had no matching case|` +
        `Decision id collision for "${decisionId}": definitions differ`,
    ),
  candidate: (decisionId: string) =>
    Effect.succeed(
      `${new Discern.ExhaustiveMatchError({}).message}|` +
        `${new Discern.DecisionIdCollisionError({ decisionId }).message}`,
    ),
})
  .on(fc.string())
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a policy-command refusal lists the cases it evaluated',
  reference: (caseIds: ReadonlyArray<string>) =>
    Effect.succeed(`The policy run rejected its command for the cases [${caseIds.join(', ')}]`),
  candidate: (caseIds: ReadonlyArray<string>) => Effect.succeed(new Discern.PolicyCommandRejected({ caseIds }).message),
})
  .on(fc.array(fc.string(), { minLength: 1, maxLength: 3 }))
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a measure-command refusal names the status it scored',
  reference: (status: Status) => Effect.succeed(`The eval run rejected its command for the example scored ${status}`),
  candidate: (status: Status) =>
    Effect.succeed(
      new Discern.MeasureCommandRejected({ record: { input: 'x', expected: true, status } }).message,
    ),
})
  .on(statusArb)
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'an unencodable-example refusal names what the example expected',
  reference: (expected: boolean) =>
    Effect.succeed(
      `The labelled example the measurement expected to ${expected ? 'match' : 'miss'} is not encodable as JSON`,
    ),
  candidate: (expected: boolean) => Effect.succeed(new Discern.MeasureInputRefused({ expected }).message),
})
  .on(fc.boolean())
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a routing-uncertainty refusal names its reason',
  reference: (reason: string) => Effect.succeed(`Could not route the request confidently: ${reason}`),
  candidate: (reason: string) =>
    Effect.succeed(new Discern.Procedure.RoutingUncertainError({ reason, ranked: [] }).message),
})
  .on(fc.string())
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a procedure-command refusal names the registry membership and the issue',
  reference: (input: { membership: ReadonlyArray<string>; issue: string }) =>
    Effect.succeed(`Routing rejected the command for a registry of ${input.membership.join(', ')}: ${input.issue}`),
  candidate: (input: { membership: ReadonlyArray<string>; issue: string }) =>
    Effect.succeed(new Discern.Procedure.ProcedureCommandRejectedError(input).message),
})
  .on(fc.record({ membership: fc.array(fc.string(), { minLength: 1, maxLength: 3 }), issue: fc.string() }))
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'a depth refusal names the depth reached and the limit',
  reference: (input: { depth: number; limit: number }) =>
    Effect.succeed(`Procedure routing reached depth ${input.depth}, at the limit of ${input.limit}`),
  candidate: (input: { depth: number; limit: number }) =>
    Effect.succeed(new Discern.Procedure.DepthExceededError(input).message),
})
  .on(fc.record({ depth: fc.integer(), limit: fc.integer({ min: 1 }) }))
  .assert((reference, candidate) => reference === candidate)

Differential.compare({
  name: 'the reason read off an uncertain verdict is the reason it was built with',
  reference: (reason: string) => Effect.succeed(reason),
  candidate: (reason: string) => Effect.succeed(Discern.reasonOf(Discern.uncertain(reason))),
})
  .on(fc.string())
  .assert((reference, candidate) => reference === candidate)
