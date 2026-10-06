import { Array, Context, Effect, Layer, Match, Option, SynchronizedRef } from 'effect'
import type { Schema } from 'effect'
import type { EmulatorState } from './state/emulator-state.js'
import { EmulatorStore } from './state/emulator-store.js'
import type { EntitlementSeed, GateProduct } from './state/entitlement.schema.js'
import { CommitThenResetFault, InjectedStatusFault, VisibilityWindowFault } from './state/faults.schema.js'
import type { OperationFault } from './state/faults.schema.js'

export type EmulatorProduct = 'k2-stream' | 'pipelines-sink' | 'r2-bucket' | 'kv-namespace'

export interface EmulatorAdminShape {
  readonly armInjectedStatus: (options: {
    readonly operation: string
    readonly status: number
    readonly retryAfterSeconds: number
    readonly calls: number
  }) => Effect.Effect<void>
  readonly armCommitThenReset: (options: { readonly operation: string; readonly calls: number }) => Effect.Effect<void>
  readonly armVisibilityWindow: (options: { readonly operation: string; readonly reads: number }) => Effect.Effect<void>
  readonly clearFaults: Effect.Effect<void>
  readonly seedEntitlement: (
    options: { readonly product: GateProduct; readonly entitled: boolean },
  ) => Effect.Effect<void>
  readonly deleteObject: (options: { readonly product: EmulatorProduct; readonly id: string }) => Effect.Effect<void>
  readonly mutateObject: (options: {
    readonly product: EmulatorProduct
    readonly id: string
    readonly merge: Readonly<Record<string, Schema.Json>>
  }) => Effect.Effect<void>
  readonly writeCount: (options: { readonly operation: string }) => Effect.Effect<number>
}

export class EmulatorAdmin extends Context.Service<EmulatorAdmin, EmulatorAdminShape>()(
  '@systemfsoftware/cloudflare-emulator/EmulatorAdmin',
) {}

const setFault = (
  faults: ReadonlyArray<OperationFault>,
  operation: string,
  fault: OperationFault,
): ReadonlyArray<OperationFault> =>
  Array.append(Array.filter(faults, (candidate) => candidate.operation !== operation), fault)

const setEntitlement = (seeds: ReadonlyArray<EntitlementSeed>, seed: EntitlementSeed): ReadonlyArray<EntitlementSeed> =>
  Array.append(Array.filter(seeds, (candidate) => candidate.product !== seed.product), seed)

const mergeById = <A extends { readonly id: string }>(
  list: ReadonlyArray<A>,
  id: string,
  merge: Readonly<Record<string, Schema.Json>>,
): ReadonlyArray<A> => Array.map(list, (item): A => (item.id === id ? Object.assign({}, item, merge) : item))

const mergeByName = <A extends { readonly name: string }>(
  list: ReadonlyArray<A>,
  name: string,
  merge: Readonly<Record<string, Schema.Json>>,
): ReadonlyArray<A> => Array.map(list, (item): A => (item.name === name ? Object.assign({}, item, merge) : item))

const withoutId = <A extends { readonly id: string }>(list: ReadonlyArray<A>, id: string): ReadonlyArray<A> =>
  Array.filter(list, (item) => item.id !== id)

const withoutName = <A extends { readonly name: string }>(list: ReadonlyArray<A>, name: string): ReadonlyArray<A> =>
  Array.filter(list, (item) => item.name !== name)

export const layer = Layer.effect(
  EmulatorAdmin,
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return {
      armInjectedStatus: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState => ({
          ...state,
          faults: setFault(
            state.faults,
            options.operation,
            InjectedStatusFault.make({
              operation: options.operation,
              status: options.status,
              retryAfterSeconds: options.retryAfterSeconds,
              remaining: options.calls,
            }),
          ),
        })),
      armCommitThenReset: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState => ({
          ...state,
          faults: setFault(
            state.faults,
            options.operation,
            CommitThenResetFault.make({ operation: options.operation, remaining: options.calls }),
          ),
        })),
      armVisibilityWindow: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState => ({
          ...state,
          faults: setFault(
            state.faults,
            options.operation,
            VisibilityWindowFault.make({ operation: options.operation, remainingReads: options.reads }),
          ),
        })),
      clearFaults: SynchronizedRef.update(store, (state): EmulatorState => ({ ...state, faults: [] })),
      seedEntitlement: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState => ({
          ...state,
          entitlements: setEntitlement(state.entitlements, { product: options.product, entitled: options.entitled }),
        })),
      deleteObject: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState =>
          Match.value(options.product).pipe(
            Match.when('k2-stream', () => ({ ...state, k2Streams: withoutId(state.k2Streams, options.id) })),
            Match.when(
              'pipelines-sink',
              () => ({ ...state, pipelinesSinks: withoutId(state.pipelinesSinks, options.id) }),
            ),
            Match.when('r2-bucket', () => ({ ...state, r2Buckets: withoutName(state.r2Buckets, options.id) })),
            Match.when('kv-namespace', () => ({ ...state, kvNamespaces: withoutId(state.kvNamespaces, options.id) })),
            Match.exhaustive,
          )),
      mutateObject: (options) =>
        SynchronizedRef.update(store, (state): EmulatorState =>
          Match.value(options.product).pipe(
            Match.when(
              'k2-stream',
              () => ({ ...state, k2Streams: mergeById(state.k2Streams, options.id, options.merge) }),
            ),
            Match.when(
              'pipelines-sink',
              () => ({ ...state, pipelinesSinks: mergeById(state.pipelinesSinks, options.id, options.merge) }),
            ),
            Match.when(
              'r2-bucket',
              () => ({ ...state, r2Buckets: mergeByName(state.r2Buckets, options.id, options.merge) }),
            ),
            Match.when(
              'kv-namespace',
              () => ({ ...state, kvNamespaces: mergeById(state.kvNamespaces, options.id, options.merge) }),
            ),
            Match.exhaustive,
          )),
      writeCount: (options) =>
        Effect.map(
          SynchronizedRef.get(store),
          (state) =>
            Option.getOrElse(
              Option.map(
                Array.findFirst(state.writes, (write) => write.operation === options.operation),
                (write) => write.count,
              ),
              () => 0,
            ),
        ),
    }
  }),
)
