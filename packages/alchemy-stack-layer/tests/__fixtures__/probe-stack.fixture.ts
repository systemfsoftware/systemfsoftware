import { AlchemyContext } from 'alchemy/AlchemyContext'
import * as Provider from 'alchemy/Provider'
import { Resource } from 'alchemy/Resource'
import { Stack } from 'alchemy/Stack'
import { Stage } from 'alchemy/Stage'
import * as State from 'alchemy/State'
import { Duration, Effect, Layer, Schema } from 'effect'

export interface LedgerEntry {
  readonly op: 'create' | 'delete'
  readonly id: string
  readonly stage: string
  readonly dev: boolean
}

export class ProbeDeleteRefused
  extends Schema.TaggedError<ProbeDeleteRefused, { readonly brand: unique symbol }>()('ProbeDeleteRefused', {
    id: Schema.String,
  })
{}

export class ProbeCreateRefused
  extends Schema.TaggedError<ProbeCreateRefused, { readonly brand: unique symbol }>()('ProbeCreateRefused', {
    id: Schema.String,
  })
{}

export interface ProbeBehaviour {
  readonly createDelay: Duration.Input
  readonly refuseCreate: ReadonlySet<string>
  readonly refuseDelete: boolean
}

export interface Ledger {
  readonly entries: Array<LedgerEntry>
  readonly records: Parameters<typeof State.InMemoryService>[0] & object
  readonly behaviour: ProbeBehaviour
}

export const makeLedger = (behaviour: Partial<ProbeBehaviour> = {}): Ledger => ({
  entries: [],
  records: {},
  behaviour: { createDelay: 0, refuseCreate: new Set(), refuseDelete: false, ...behaviour },
})

interface Probe extends Resource<'StackLayerFixture.Probe', { readonly label: string }, { readonly label: string }> {}

const Probe = Resource<Probe>('StackLayerFixture.Probe')

const record = (ledger: Ledger, op: LedgerEntry['op'], id: string) =>
  Effect.gen(function*() {
    const stage = yield* Stage
    const context = yield* AlchemyContext
    ledger.entries.push({ op, id, stage, dev: context.dev })
  })

const refuseCreate = (ledger: Ledger, id: string) =>
  ledger.behaviour.refuseCreate.has(id) ? Effect.fail(new ProbeCreateRefused({ id })) : Effect.void

const refuseDelete = (ledger: Ledger, id: string) =>
  ledger.behaviour.refuseDelete ? Effect.fail(new ProbeDeleteRefused({ id })) : Effect.void

const probeProvider = (ledger: Ledger) =>
  Provider.succeed(Probe, {
    list: () => Effect.succeed([]),
    diff: () => Effect.undefined,
    reconcile: ({ id, news }) =>
      Effect.gen(function*() {
        yield* Effect.sleep(ledger.behaviour.createDelay)
        yield* refuseCreate(ledger, id)
        yield* record(ledger, 'create', id)
        return { label: news.label }
      }),
    delete: ({ id }) => Effect.flatMap(refuseDelete(ledger, id), () => record(ledger, 'delete', id)),
  })

export const durableFixtureState = (ledger: Ledger) =>
  Layer.succeed(
    State.State,
    Effect.map(State.InMemoryService(ledger.records), (store) => ({ ...store, id: 'fixture-durable' })),
  )

export interface ProbeStackInput {
  readonly ledger: Ledger
  readonly stackName: string
  readonly state?: Layer.Layer<State.State>
}

export const probeStack = ({ ledger, stackName, state = durableFixtureState(ledger) }: ProbeStackInput) =>
  Stack(
    stackName,
    { providers: probeProvider(ledger), state },
    Effect.map(Probe(`${stackName}-probe`, { label: stackName }), (probe) => ({ label: probe.label })),
  )
