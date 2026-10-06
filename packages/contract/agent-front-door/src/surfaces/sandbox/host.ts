import { Contract, Sandbox } from '@systemfsoftware/effect-contract'
import { Duration, Effect, Layer, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import type { Fetcher } from './egress-gateway.js'
import { FacetPrepare, ProgramOutcome, SandboxHostFailed } from './lifetime.schema.js'
import { programModule } from './program-supervisor.js'

export { SandboxHostFailed } from './lifetime.schema.js'

const COMPATIBILITY_DATE = '2026-10-05'

export interface DurableObjectIdLike {
  readonly name?: string | undefined
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike
  get(id: DurableObjectIdLike): DurableObjectStubLike
}

export interface WorkerCodeLike {
  readonly compatibilityDate: string
  readonly mainModule: string
  readonly modules: Readonly<Record<string, string>>
  readonly env: Readonly<Record<string, Fetcher>>
  readonly globalOutbound: Fetcher
  readonly limits?: { readonly cpuMs: number } | undefined
}

export interface WorkerStubLike {
  getEntrypoint(): Fetcher
}

export interface WorkerLoaderLike {
  get(id: string, code: () => WorkerCodeLike): WorkerStubLike
}

export type PrincipalEncoded = Schema.Codec.Encoded<typeof Contract.Principal>

export interface SandboxHostOptions {
  readonly loader: WorkerLoaderLike
  readonly supervisor: DurableObjectNamespaceLike
  readonly egress: (allow: ReadonlyArray<Contract.Host>) => Fetcher
  readonly tools: (programId: string, principal: PrincipalEncoded) => Fetcher
  readonly state: (programId: string) => Fetcher
  readonly allow: ReadonlyArray<Contract.Host>
  readonly catalogVersion: string
  readonly principal: Contract.Principal
  readonly timeoutMs: number
  readonly cpuMs: number
}

const succeeded = (outcome: ProgramOutcome): Effect.Effect<Schema.Json, Sandbox.SandboxError> =>
  Match.value(outcome).pipe(
    Match.tag('Completed', (completed) => Effect.succeed(completed.value)),
    Match.tag('EgressDenied', (denied) => Effect.fail(new Sandbox.SandboxEgressDenied({ host: denied.host }))),
    Match.tag('TimedOut', () => Effect.fail(new Sandbox.SandboxTimeout({}))),
    Match.tag('Threw', (threw) => Effect.fail(new Sandbox.SandboxThrew({ message: threw.message }))),
    Match.tag(
      'Refused',
      (refused) => Effect.fail(new Sandbox.SandboxThrew({ message: JSON.stringify(refused.refusal) })),
    ),
    Match.exhaustive,
  )

const decodeOutcome = (text: string): ProgramOutcome =>
  Option.getOrElse(
    Schema.decodeOption(Schema.fromJsonString(ProgramOutcome))(text),
    (): ProgramOutcome => ({ _tag: 'Threw', message: text.slice(0, 512) }),
  )

const rejectionOutcome = (message: string): ProgramOutcome =>
  /exceeded|limit|cpu|subrequest|hung|cancel/i.test(message) ? { _tag: 'TimedOut' } : { _tag: 'Threw', message }

const attempt = (entrypoint: Fetcher, timeoutMs: number): Effect.Effect<ProgramOutcome> =>
  Effect.gen(function*() {
    const raced = yield* Effect.timeoutOption(
      Effect.result(
        Effect.tryPromise({
          try: () => entrypoint.fetch('http://program/').then((response) => response.text()),
          catch: (cause) => ({ message: cause instanceof Error ? cause.message : 'the program could not be reached' }),
        }),
      ),
      Duration.millis(timeoutMs),
    )
    return Option.match(raced, {
      onNone: (): ProgramOutcome => ({ _tag: 'TimedOut' }),
      onSome: (result) =>
        Result.match(result, {
          onFailure: (failure): ProgramOutcome => rejectionOutcome(failure.message),
          onSuccess: decodeOutcome,
        }),
    })
  })

const ttlSecondsOf = (lifetime: Sandbox.Lifetime): number =>
  Match.value(lifetime).pipe(
    Match.tag('Request', () => 0),
    Match.tag('Session', (session) => session.ttlSeconds),
    Match.exhaustive,
  )

const principalKeyOf = (principal: PrincipalEncoded): string =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => 'anonymous'),
    Match.tag('Person', (person) => person.subject),
    Match.exhaustive,
  )

const stateOf = (
  stateful: boolean,
  programId: string,
  state: (programId: string) => Fetcher,
): Option.Option<Fetcher> => stateful ? Option.some(state(programId)) : Option.none()

const envOf = (
  stateful: boolean,
  tools: Fetcher,
  state: Option.Option<Fetcher>,
): Readonly<Record<string, Fetcher>> => stateful ? { TOOLS: tools, STATE: Option.getOrThrow(state) } : { TOOLS: tools }

const prepareFacet = (
  stateful: boolean,
  module: string,
  input: Sandbox.SandboxInput,
  supervisor: DurableObjectStubLike,
): Effect.Effect<void, SandboxHostFailed | Schema.SchemaError> =>
  Match.value(stateful).pipe(
    Match.when(true, () =>
      Effect.gen(function*() {
        const body = yield* Schema.encodeEffect(Schema.fromJsonString(FacetPrepare))({
          programId: input.programId,
          classCode: module,
          ttlSeconds: ttlSecondsOf(input.lifetime),
        })
        const response = yield* Effect.tryPromise({
          try: () =>
            supervisor.fetch('http://supervisor/prepare', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            }),
          catch: () => new SandboxHostFailed({ message: 'the sandbox supervisor is unreachable' }),
        })
        return yield* response.ok
          ? Effect.void
          : Effect.fail(new SandboxHostFailed({ message: 'the sandbox supervisor refused the facet prepare' }))
      })),
    Match.when(false, () => Effect.void),
    Match.exhaustive,
  )

const sha256Hex = (text: string): Effect.Effect<string> =>
  Effect.promise(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buffer) =>
      Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
    )
  )

const isolateIdOfPath = (
  input: Sandbox.SandboxInput,
  options: SandboxHostOptions,
  principalKey: string,
): Effect.Effect<string> =>
  sha256Hex([
    input.program,
    options.catalogVersion,
    [...options.allow].sort().join(','),
    input.programId,
    principalKey,
  ].join('\u0000'))

export const layer = (options: SandboxHostOptions): Layer.Layer<Sandbox.Sandbox> =>
  Layer.succeed(Sandbox.Sandbox, {
    run: (input) =>
      Effect.gen(function*() {
        const stateful = Schema.is(Sandbox.Session)(input.lifetime)
        const principal = yield* Schema.encodeEffect(Contract.Principal)(options.principal)
        const module = programModule({ program: input.program, allow: options.allow })
        const isolateId = yield* isolateIdOfPath(input, options, principalKeyOf(principal))
        yield* prepareFacet(
          stateful,
          module,
          input,
          options.supervisor.get(options.supervisor.idFromName(input.programId)),
        )
        const tools = options.tools(input.programId, principal)
        const state = stateOf(stateful, input.programId, options.state)
        const stub = options.loader.get(isolateId, () => ({
          compatibilityDate: COMPATIBILITY_DATE,
          mainModule: 'program.js',
          modules: { 'program.js': module },
          env: envOf(stateful, tools, state),
          globalOutbound: options.egress(options.allow),
          limits: { cpuMs: options.cpuMs },
        }))
        const outcome = yield* attempt(stub.getEntrypoint(), options.timeoutMs)
        return yield* succeeded(outcome)
      }).pipe(
        Effect.catchTags({
          SchemaError: () =>
            Effect.fail(new Sandbox.SandboxThrew({ message: 'the sandbox run request is not well formed' })),
          SandboxHostFailed: (error) => Effect.fail(new Sandbox.SandboxThrew({ message: error.message })),
        }),
      ),
  })
