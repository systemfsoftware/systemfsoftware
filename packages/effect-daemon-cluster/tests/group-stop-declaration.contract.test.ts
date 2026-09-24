import { expect } from '@effect/vitest'
import { ClusterMedium } from '@systemfsoftware/effect-daemon-cluster'
import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match } from 'effect'

const Feature = makeFeature({ it, layer })

const atomicDeclaration: Supervisor.Medium.MediumDeclaration = { reporting: 'inferred', groupStop: 'atomic' }

const groupRestart = Conformance.Scenarios.flatMap((entry) =>
  entry.name === 'one-for-all-group-stop' ? entry.children.map((child) => child.childId) : []
)
const first = groupRestart[0] ?? 'alpha'
const second = groupRestart[1] ?? 'beta'

const childRef = (childId: string): Conformance.ChildRef => ({ childId, generation: 0 })
const groupStopped: Conformance.ObservedEvent = { kind: 'ChildStopped', child: childRef(second), reason: null }
const stopAll = (order: ReadonlyArray<string>): Conformance.ObservedStep => ({
  event: groupStopped,
  decision: {
    kind: 'StopChildren',
    commands: order.map((childId): Conformance.ObservedCommand => ({ kind: 'StopChild', child: childRef(childId) })),
  },
})

const referenceTrace: Conformance.ConformanceTrace = {
  scenario: 'one-for-all-group-stop',
  medium: 'fiber',
  steps: [stopAll([second, first])],
}

const candidateTrace: Conformance.ConformanceTrace = {
  scenario: 'one-for-all-group-stop',
  medium: 'cluster-atomic',
  steps: [stopAll([first, second])],
}

const divergedAt = (comparison: Conformance.TraceComparison): number =>
  Match.value(comparison).pipe(
    Match.tag('TracesDiverge', (diverge) => diverge.index),
    Match.orElse(() => -1),
  )

Feature('Holding a medium to the group-stop guarantee it claims')
  .body(({ scenario }) => {
    scenario(
      'A group restart whose stops finish in a different order conforms only under the eventual guarantee',
      Gherkin.Do.pipe(
        Given('the reference trace of a group restart that stops its children in reverse order')(
          'reference',
          () => Effect.succeed(referenceTrace),
        ),
        Given('a candidate trace that stops the same children in declaration order')(
          'candidate',
          () => Effect.succeed(candidateTrace),
        ),
        When('both traces are compared under an atomic guarantee')(
          'atomicComparison',
          (s) => Effect.succeed(Conformance.compare(s.reference, s.candidate, atomicDeclaration)),
        ),
        Then('the atomic comparison names the first diverging step')((s) => {
          expect(divergedAt(s.atomicComparison)).toBe(0)
        }),
        And('the same traces conform under the cluster medium')((s) => {
          const comparison = Conformance.compare(s.reference, s.candidate, ClusterMedium.declaration)
          expect(comparison).toMatchObject({
            _tag: 'TracesConform',
            scenario: 'one-for-all-group-stop',
            medium: 'cluster-atomic',
            compared: 1,
          })
        }),
      ),
    )
  })
