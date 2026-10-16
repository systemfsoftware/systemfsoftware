import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'

import { acceptTaggedCommand, TaggedCmd } from './__fixtures__/accept-tagged-command.workflow.js'

const Feature = makeFeature({ it })

interface Probe {
  readonly events: Effect.Effect<ReadonlyArray<string>>
  readonly record: (line: string) => Effect.Effect<void>
}

class ProbeService extends Context.Service<ProbeService, Probe>()('ProbeService') {}

interface Vault {
  readonly use: Effect.Effect<string>
}

class VaultService extends Context.Service<VaultService, Vault>()('VaultService') {}

const readingCell = Sandwich.named('cell.vault.reading')((request: { readonly kind: string }) =>
  Effect.succeed(new TaggedCmd({ value: request.kind.length }))
).decide(acceptTaggedCommand).write({
  DecisionOne: (decision) => Effect.flatMap(VaultService, (vault) => Effect.as(vault.use, `ok:${decision.value}`)),
  DecisionTwo: (decision) => Effect.flatMap(VaultService, (vault) => Effect.as(vault.use, `no:${decision.reason}`)),
  CommandRefused: (refusal) => Effect.succeed(`refused:${refusal.why}`),
  CommandRejected: (rejected) => Effect.succeed(`away:${rejected.issue}`),
})

Feature('Binding the vault once for many readings')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Two readings share one vault, and the vault closes only when the last reading ends',
      Gherkin.Do.pipe(
        When('two readings run against the same bound vault')(
          'bound',
          () =>
            Effect.gen(function*() {
              const events: string[] = []
              const probeMemory = Layer.succeed(ProbeService, {
                events: Effect.sync(() => [...events]),
                record: (line: string) =>
                  Effect.sync(() => {
                    events.push(line)
                  }),
              })
              const vaultBinding = Layer.effect(
                VaultService,
                Effect.flatMap(ProbeService, (probe) =>
                  Effect.acquireRelease(
                    Effect.as(probe.record('opened'), { use: Effect.succeed('gold') }),
                    () => probe.record('closed'),
                  )),
              )
              const boundVault = Layer.provideMerge(vaultBinding, probeMemory)
              const scope = yield* Scope.make()
              const context = yield* Layer.buildWithScope(boundVault, scope)
              const bound = Cell.provideContext(readingCell, context)
              const first = yield* bound.run({ kind: 'gold' })
              const second = yield* bound.run({ kind: 'ag' })
              const probe = Context.get(context, ProbeService)
              const eventsWhileOpen = yield* probe.events
              yield* Scope.close(scope, Exit.void)
              const eventsAfterClose = yield* probe.events
              return { first, second, eventsWhileOpen, eventsAfterClose }
            }),
        ),
        Then('both readings draw on one vault, which opened once and closed only when they were done')((s, expect) =>
          expect({
            first: s.bound.first,
            second: s.bound.second,
            eventsWhileOpen: s.bound.eventsWhileOpen,
            eventsAfterClose: s.bound.eventsAfterClose,
          }).toEqual({
            first: 'ok:4',
            second: 'ok:2',
            eventsWhileOpen: ['opened'],
            eventsAfterClose: ['opened', 'closed'],
          })
        ),
      ),
    )
  })
