import { Context, Effect, Layer, Match, Option, Ref } from 'effect'
import { Miniflare, type MiniflareOptions, type RequestInfo, type RequestInit, type Response } from 'miniflare'
import type { BundledWorker } from './bundle.js'
import {
  DurableObjectExport,
  HarnessBinding,
  HarnessBindingMissing,
  HarnessClosed,
  HarnessDispatchFailed,
  HarnessStartFailed,
} from './harness.schema.js'

export {
  DurableObjectBinding,
  DurableObjectExport,
  HarnessBinding,
  PlainTextBinding,
  ServiceBindingReference,
  WorkerLoaderBinding,
} from './harness.schema.js'

export interface HarnessService {
  readonly name: string
  readonly worker: BundledWorker | string
}

export interface HarnessOptions {
  readonly worker: BundledWorker | string
  readonly name?: string
  readonly compatibilityDate?: string
  readonly compatibilityFlags?: ReadonlyArray<string>
  readonly durableObjects?: ReadonlyArray<DurableObjectExport>
  readonly bindings?: ReadonlyArray<HarnessBinding>
  readonly services?: ReadonlyArray<HarnessService>
  readonly fetchTriggers?: ReadonlyArray<string>
  readonly port?: number | undefined
  readonly host?: string | undefined
}

export interface ServiceBinding {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>
}

export type DispatchInput = RequestInfo
export type DispatchResponse = Response

export interface HarnessShape {
  readonly url: URL
  readonly dispatchFetch: (
    input: DispatchInput,
    init?: RequestInit,
  ) => Effect.Effect<DispatchResponse, HarnessClosed | HarnessDispatchFailed>
  readonly service: (name: string) => Effect.Effect<ServiceBinding, HarnessClosed | HarnessBindingMissing>
}

export class Harness
  extends Context.Service<Harness, HarnessShape>()('@systemfsoftware/effect-workerd-harness/Harness')
{}

type WorkerConfigInput = NonNullable<MiniflareOptions['workers']>[number]['config']
type EnvInput = NonNullable<WorkerConfigInput['env']>
type EnvValueInput = EnvInput[string]
type ExportsInput = NonNullable<WorkerConfigInput['exports']>
type ExportValueInput = ExportsInput[string]
type TriggerInput = NonNullable<WorkerConfigInput['triggers']>[number]

interface EsmModule {
  readonly type: 'esm'
  readonly contents: string
}

const DEFAULT_NAME = 'harness'
const DEFAULT_COMPATIBILITY_DATE = '2026-10-05'

const orDefault = <A>(value: A | undefined, fallback: A): A =>
  Option.getOrElse(Option.fromUndefinedOr(value), () => fallback)

const asBundle = (worker: BundledWorker | string): BundledWorker =>
  typeof worker === 'string' ? { mainModule: 'index.mjs', modules: { 'index.mjs': worker } } : worker

const manifestOf = (worker: BundledWorker): WorkerConfigInput['manifest'] => ({
  mainModule: worker.mainModule,
  modules: Object.fromEntries(
    Object.entries(worker.modules).map(([name, contents]): [string, EsmModule] => [name, { type: 'esm', contents }]),
  ),
})

const exportOf = (durableObject: DurableObjectExport): ExportValueInput => ({
  type: 'durable-object',
  storage: durableObject.storage,
})

const envBindingOf = (binding: HarnessBinding, workerName: string): EnvValueInput =>
  Match.value(binding).pipe(
    Match.tag('PlainText', (plainText): EnvValueInput => ({ type: 'text', value: plainText.value })),
    Match.tag('DurableObject', (durableObject): EnvValueInput => ({
      type: 'durable-object',
      worker: workerName,
      exportName: durableObject.className,
    })),
    Match.tag('WorkerLoader', (): EnvValueInput => ({ type: 'worker-loader' })),
    Match.tag('Service', (service): EnvValueInput => ({ type: 'worker', worker: service.worker })),
    Match.exhaustive,
  )

const triggerOf = (pattern: string): TriggerInput => ({ type: 'fetch', pattern })

const LOOPBACK_HOST = '127.0.0.1'

const listenerOptionsOf = (options: HarnessOptions): Pick<MiniflareOptions, 'port' | 'host'> => ({
  port: orDefault(options.port, 0),
  host: orDefault(options.host, LOOPBACK_HOST),
})

const miniflareOf = (options: HarnessOptions): MiniflareOptions => {
  const name = orDefault(options.name, DEFAULT_NAME)
  const compatibilityDate = orDefault(options.compatibilityDate, DEFAULT_COMPATIBILITY_DATE)
  const compatibilityFlags = orDefault(options.compatibilityFlags, [])
  const durableObjects = orDefault(options.durableObjects, [])
  const bindings = orDefault(options.bindings, [])
  const services = orDefault(options.services, [])
  const fetchTriggers = orDefault(options.fetchTriggers, [])
  return {
    ...listenerOptionsOf(options),
    workers: [
      {
        config: {
          name,
          compatibilityDate,
          compatibilityFlags: [...compatibilityFlags],
          manifest: manifestOf(asBundle(options.worker)),
          exports: Object.fromEntries(
            durableObjects.map((durableObject) => [durableObject.className, exportOf(durableObject)]),
          ),
          env: Object.fromEntries(bindings.map((binding) => [binding.name, envBindingOf(binding, name)])),
          triggers: fetchTriggers.map(triggerOf),
        },
      },
      ...services.map((service) => ({
        config: {
          name: service.name,
          compatibilityDate,
          manifest: manifestOf(asBundle(service.worker)),
        },
      })),
    ],
  }
}

const harnessOf = (
  instance: Miniflare,
  closed: Ref.Ref<boolean>,
  workerName: string,
  url: URL,
): HarnessShape => ({
  url,
  dispatchFetch: (input, init) =>
    Effect.gen(function*() {
      const isClosed = yield* Ref.get(closed)
      if (isClosed) {
        return yield* new HarnessClosed({ reason: 'the enclosing scope has already closed' })
      }
      return yield* Effect.tryPromise({
        try: () => instance.dispatchFetch(input, init),
        catch: (cause) => new HarnessDispatchFailed({ cause }),
      })
    }),
  service: (name) =>
    Effect.gen(function*() {
      const isClosed = yield* Ref.get(closed)
      if (isClosed) {
        return yield* new HarnessClosed({ reason: 'the enclosing scope has already closed' })
      }
      const bindings = yield* Effect.promise(() => instance.getBindings<Record<string, ServiceBinding>>(workerName))
      return yield* Effect.fromOption(Option.fromUndefinedOr(bindings[name]), () => new HarnessBindingMissing({ name }))
    }),
})

export const layer = (options: HarnessOptions): Layer.Layer<Harness, HarnessStartFailed> =>
  Layer.effect(
    Harness,
    Effect.gen(function*() {
      const closed = yield* Ref.make(false)
      const instance = yield* Effect.acquireRelease(
        Effect.try({
          try: () => new Miniflare(miniflareOf(options)),
          catch: (cause) => new HarnessStartFailed({ cause }),
        }),
        (running) =>
          Effect.gen(function*() {
            yield* Ref.set(closed, true)
            yield* Effect.promise(() => running.dispose())
          }),
      )
      const url = yield* Effect.promise(() => instance.ready)
      return harnessOf(instance, closed, options.name ?? DEFAULT_NAME, url)
    }),
  )
