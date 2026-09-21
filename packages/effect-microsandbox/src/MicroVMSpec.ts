/// <reference types="vitest/importMeta" />
import type { Effect, Layer } from 'effect'
import { Exit, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import type { MicroVMError } from './MicroVMError.schema.js'
import { layer as sandboxLayer, scoped as sandboxScoped } from './MicroVMSandbox.js'
import {
  GuestPort,
  HttpWait,
  ImageReference,
  LogWait,
  MicroVMSpec,
  type Mount,
  PortWait,
  type WaitStrategy,
} from './MicroVMSpec.schema.js'
import type { RunningVM } from './RunningVM.js'

export { GuestPort, HttpWait, ImageReference, LogWait, MicroVMSpec, type Mount, PortWait, type WaitStrategy }

export const Wait = {
  forHttp: (path: string, port: number): WaitStrategy => ({ _tag: 'Http', path, port }),
  forPort: (port: number): WaitStrategy => ({ _tag: 'Port', port }),
  forLog: (pattern: string): WaitStrategy => ({ _tag: 'Log', pattern }),
}
export interface MicroVMConfigured {
  readonly value: MicroVMSpec
  withExposedPorts(ports: ReadonlyArray<number>): MicroVMConfigured
  withEnv(env: Record<string, string>): MicroVMConfigured
  withMount(mount: Mount): MicroVMConfigured
  withMemoryLimit(memoryMb: number): MicroVMConfigured
  withWaitStrategy(waitStrategy: WaitStrategy): MicroVMConfigured
  readonly scoped: Effect.Effect<
    RunningVM,
    MicroVMError,
    Scope.Scope | Crypto.Crypto | FileSystem.FileSystem
  >
  readonly layer: Layer.Layer<RunningVM, MicroVMError, Crypto.Crypto | FileSystem.FileSystem>
}

const makeConfigured = (raw: MicroVMSpec): MicroVMConfigured => ({
  value: raw,
  withExposedPorts: (ports) => makeConfigured(withExposedPorts(raw, ports)),
  withEnv: (env) => makeConfigured(withEnv(raw, env)),
  withMount: (mount) => makeConfigured(withMount(raw, mount)),
  withMemoryLimit: (mb) => makeConfigured(withMemoryLimit(raw, mb)),
  withWaitStrategy: (strategy) => makeConfigured(withWaitStrategy(raw, strategy)),
  get scoped() {
    return sandboxScoped(raw)
  },
  get layer() {
    return sandboxLayer(raw)
  },
})

export const spec = (
  target:
    | string
    | {
      readonly image: string
      readonly env?: Record<string, string>
      readonly ports?: ReadonlyArray<number>
      readonly mounts?: ReadonlyArray<Mount>
      readonly memoryMb?: number
      readonly vCPUs?: number
      readonly workdir?: string
      readonly cmd?: ReadonlyArray<string>
      readonly waitStrategy?: WaitStrategy
    },
): MicroVMConfigured => {
  const raw: MicroVMSpec = typeof target === 'string'
    ? { image: target, env: {}, ports: [], mounts: [] }
    : { env: {}, ports: [], mounts: [], ...target }
  return makeConfigured(raw)
}

export const withEnv: {
  (env: Record<string, string>): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec => ({
  ...spec,
  env: { ...spec.env, ...env },
}))

export const withExposedPorts: {
  (ports: ReadonlyArray<number>): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec => ({
  ...spec,
  ports,
}))

export const withMount: {
  (mount: Mount): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, mount: Mount): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, mount: Mount): MicroVMSpec => ({
  ...spec,
  mounts: [...spec.mounts, mount],
}))

export const withMemoryLimit: {
  (memoryMb: number): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, memoryMb: number): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, memoryMb: number): MicroVMSpec => ({ ...spec, memoryMb }))

export const withWaitStrategy: {
  (waitStrategy: WaitStrategy): (spec: MicroVMSpec) => MicroVMSpec
  (spec: MicroVMSpec, waitStrategy: WaitStrategy): MicroVMSpec
} = dual(2, (spec: MicroVMSpec, waitStrategy: WaitStrategy): MicroVMSpec => ({
  ...spec,
  waitStrategy,
}))

const applyAll = (spec: MicroVMSpec): MicroVMSpec =>
  withEnv({ K: 'V' })(
    withExposedPorts([6379])(
      withMount({ host: '/tmp/a', guest: '/data' })(withMemoryLimit(512)(withWaitStrategy(Wait.forPort(8080))(spec))),
    ),
  )

const decodeSucceeds = (spec: MicroVMSpec): boolean => Exit.isSuccess(Schema.decodeExit(MicroVMSpec)(spec))

const applyEnv = (spec: MicroVMSpec, env: Record<string, string>): MicroVMSpec => withEnv(spec, env)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Arbitrary = await import('effect/unstable/arbitrary/Arbitrary')

  const specEq = Schema.toEquivalence(MicroVMSpec)

  it.prop('∀spec_Combinators_=Pure', [MicroVMSpec], ([spec]) => {
    const next = applyAll(spec)
    return Exit.match(Schema.decodeExit(MicroVMSpec)(spec), {
      onSuccess: (twin) => specEq(applyAll(twin), next) && !Object.is(next, spec),
      onFailure: () => false,
    })
  })

  // Key domain: any string, including ''. Distinctness is constructed, never
  // filtered: the suffixed twin is strictly longer than its base.
  const keyDraw = Arbitrary.schema(Schema.String)
  const distinctKeyPair = Arbitrary.flatMap(
    keyDraw,
    (k1) => Arbitrary.map(keyDraw, (k2) => [k1, `${k2}#${k1}`] as const),
  )

  it.prop('≤kk_EnvMerge_≡Assoc', [MicroVMSpec, distinctKeyPair], ([spec, [k1, k2]]) => {
    const sequential = applyEnv(applyEnv(spec, { [k2]: 'v2' }), { [k1]: 'v1' })
    const merged = applyEnv(spec, { [k1]: 'v1', [k2]: 'v2' })
    return specEq(sequential, merged)
  })

  // A spec assembled from an invalid part must fail decode at the engine
  // boundary — typed ParseError, never a silent repair.
  it.prop('∀spec_NegLimit_⊥', [MicroVMSpec], ([spec]) => !decodeSucceeds(withMemoryLimit(-1)(spec)))
  it.prop('∀spec_RangePort_⊥', [MicroVMSpec], ([spec]) => !decodeSucceeds(withExposedPorts([70_000])(spec)))
  it.prop(
    '∀spec_BlankMount_⊥',
    [MicroVMSpec],
    ([spec]) => !decodeSucceeds(withMount({ host: '', guest: '/data' })(spec)),
  )
  it.prop('∀spec_LowPort_⊥', [MicroVMSpec], ([spec]) => !decodeSucceeds(withWaitStrategy(Wait.forPort(0))(spec)))
}
