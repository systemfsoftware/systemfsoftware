import { Match, Schema } from 'effect'

export const RegistryCommand = Schema.Union([
  Schema.TaggedStruct('GetSource', {}),
  Schema.TaggedStruct('GetDerived', {}),
  Schema.TaggedStruct('SetSource', { value: Schema.Literals([0, 1, 2]) }),
  Schema.TaggedStruct('UpdateSource', { by: Schema.Literals([1, 2]) }),
  Schema.TaggedStruct('ModifySource', {}),
  Schema.TaggedStruct('RefreshDerived', {}),
  Schema.TaggedStruct('Reset', {}),
])

export type RegistryCommand = Schema.Schema.Type<typeof RegistryCommand>

export const RegistryState = Schema.Struct({ source: Schema.Finite, derived: Schema.Finite })

export type RegistryState = Schema.Schema.Type<typeof RegistryState>

export const doubled = (source: number): number => source * 2

export const initialRegistryState: RegistryState = { source: 0, derived: 0 }

const written = (source: number): RegistryState => ({ source, derived: doubled(source) })

const unchanged = (state: RegistryState): readonly [RegistryState, number | undefined] => [state, undefined]

const observed = (state: RegistryState, value: number): readonly [RegistryState, number | undefined] => [state, value]

const graphStepped = (
  state: RegistryState,
  command: RegistryCommand,
): readonly [RegistryState, number | undefined] =>
  Match.value(command).pipe(
    Match.tag('GetSource', () => observed(state, state.source)),
    Match.tag('GetDerived', () => observed(state, state.derived)),
    Match.tag('SetSource', (set) => unchanged(written(set.value))),
    Match.tag('UpdateSource', (update) => unchanged(written(state.source + update.by))),
    Match.tag('ModifySource', () => observed(written(state.source + 1), state.source)),
    Match.tag('RefreshDerived', () => unchanged(state)),
    Match.tag('Reset', () => unchanged(initialRegistryState)),
    Match.exhaustive,
  )

export const registryModel = {
  state: RegistryState,
  initial: initialRegistryState,
  step: graphStepped,
}

export const DerivedCommand = Schema.Union([
  Schema.TaggedStruct('GetDerived', {}),
  Schema.TaggedStruct('SetSource', { value: Schema.Literals([0, 1, 2]) }),
])

export type DerivedCommand = Schema.Schema.Type<typeof DerivedCommand>

const derivedStepped = (
  state: RegistryState,
  command: DerivedCommand,
): readonly [RegistryState, number | undefined] =>
  Match.value(command).pipe(
    Match.tag('GetDerived', () => observed(state, state.derived)),
    Match.tag('SetSource', (set) => unchanged(written(set.value))),
    Match.exhaustive,
  )

export const derivedModel = {
  state: RegistryState,
  initial: initialRegistryState,
  step: derivedStepped,
}

export const SubscriptionCommand = Schema.Union([
  Schema.TaggedStruct('Subscribe', {}),
  Schema.TaggedStruct('SetSource', { value: Schema.Literals([0, 1, 2]) }),
])

export type SubscriptionCommand = Schema.Schema.Type<typeof SubscriptionCommand>

export const SubscriptionState = Schema.Struct({
  subscribed: Schema.Boolean,
  source: Schema.Finite,
  materialized: Schema.Boolean,
  delivered: Schema.Array(Schema.Finite),
})

export type SubscriptionState = Schema.Schema.Type<typeof SubscriptionState>

export const initialSubscriptionState: SubscriptionState = {
  subscribed: false,
  source: 0,
  materialized: false,
  delivered: [],
}

const subscriptionMayRun = (state: SubscriptionState, command: SubscriptionCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Subscribe', () => !state.subscribed),
    Match.tag('SetSource', () => state.subscribed),
    Match.exhaustive,
  )

const deliveredAfterSet = (
  state: SubscriptionState,
  value: number,
): readonly [SubscriptionState, ReadonlyArray<number>] => {
  if (state.materialized && value === state.source) {
    return [state, state.delivered]
  }
  const delivered = [...state.delivered, value]
  return [{ ...state, source: value, materialized: true, delivered }, delivered]
}

const subscriptionStepped = (
  state: SubscriptionState,
  command: SubscriptionCommand,
): readonly [SubscriptionState, ReadonlyArray<number>] =>
  Match.value(command).pipe(
    Match.tag(
      'Subscribe',
      (): readonly [SubscriptionState, ReadonlyArray<number>] => [{ ...state, subscribed: true }, state.delivered],
    ),
    Match.tag('SetSource', (set) => deliveredAfterSet(state, set.value)),
    Match.exhaustive,
  )

export const subscriptionModel = {
  state: SubscriptionState,
  initial: initialSubscriptionState,
  precondition: subscriptionMayRun,
  step: subscriptionStepped,
}

export const LifetimeCommand = Schema.Union([
  Schema.TaggedStruct('Mount', {}),
  Schema.TaggedStruct('Unmount', {}),
  Schema.TaggedStruct('AwaitDeadline', {}),
  Schema.TaggedStruct('Observe', {}),
])

export type LifetimeCommand = Schema.Schema.Type<typeof LifetimeCommand>

export const LifetimeState = Schema.Struct({ mounted: Schema.Boolean, evicted: Schema.Boolean })

export type LifetimeState = Schema.Schema.Type<typeof LifetimeState>

export const initialLifetimeState: LifetimeState = { mounted: false, evicted: false }

const lifetimeMayRun = (state: LifetimeState, command: LifetimeCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('Mount', () => !state.mounted),
    Match.tag('Unmount', () => state.mounted),
    Match.tag('AwaitDeadline', () => !state.mounted && !state.evicted),
    Match.tag('Observe', () => state.mounted || state.evicted),
    Match.exhaustive,
  )

const lifetimeStepped = (
  state: LifetimeState,
  command: LifetimeCommand,
): readonly [LifetimeState, void | boolean] =>
  Match.value(command).pipe(
    Match.tag('Mount', (): readonly [LifetimeState, void | boolean] => [{ mounted: true, evicted: false }, undefined]),
    Match.tag('Unmount', (): readonly [LifetimeState, void | boolean] => [{ ...state, mounted: false }, undefined]),
    Match.tag(
      'AwaitDeadline',
      (): readonly [LifetimeState, void | boolean] => [{ ...state, evicted: true }, undefined],
    ),
    Match.tag('Observe', (): readonly [LifetimeState, void | boolean] => [state, state.mounted]),
    Match.exhaustive,
  )

export const lifetimeModel = {
  state: LifetimeState,
  initial: initialLifetimeState,
  precondition: lifetimeMayRun,
  step: lifetimeStepped,
}
