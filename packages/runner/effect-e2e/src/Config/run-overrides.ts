import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { ConfigInvalid, type PathSegment } from './config-invalid.schema.js'
import { BooleanFlag, CacheMode, type E2EConfigInput, Trace } from './config.schema.js'

/**
 * The environment variables `effect-e2e run` maps its flags to (design §15.2). The CLI writes them into its own
 * process before starting Vitest; the composition root's environment — the same `process.env` the generated
 * `e2e.config.ts` hands `RunnerOptions.env` — carries them to every runner instance and the global setup.
 */
export const RUN_OVERRIDE_ENV = {
  target: 'E2E_TARGET',
  agent: 'E2E_AGENT',
  cache: 'E2E_CACHE',
  timeout: 'E2E_TIMEOUT',
  output: 'E2E_OUTPUT',
  trace: 'E2E_TRACE',
  aiTrace: 'E2E_AI_TRACE',
} as const

/** What an override reads: the suite's environment, as the composition root hands the runner. */
export type RunOverrideEnvironment = Readonly<Record<string, string | undefined>>
const isSetValue = (value: string | undefined): value is string => typeof value === 'string' && value !== ''

const overrideOf = (env: RunOverrideEnvironment, name: string): Option.Option<string> =>
  Option.liftPredicate(env[name], isSetValue)

const refused = (path: ReadonlyArray<PathSegment>, expected: string): ConfigInvalid =>
  new ConfigInvalid({ path: [...path], expected })

/** The override an unset or blank variable produces: none. */
const UNSET: Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> = Effect.succeed({})

const targetOf = (
  config: E2EConfigInput,
  env: RunOverrideEnvironment,
): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.target), {
    onNone: () => UNSET,
    onSome: (name) =>
      Arr.match(config.targets.filter((each) => each.name === name), {
        onEmpty: () => Effect.fail(refused(['targets'], `a target named ${JSON.stringify(name)}`)),
        onNonEmpty: (targets) => Effect.succeed({ targets }),
      }),
  })

const agentsNamedBy = (
  config: E2EConfigInput,
  name: string,
): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(Option.fromNullishOr(config.agents?.[name]), {
    onNone: () => Effect.fail(refused(['agents', name], 'an agent the config carries')),
    onSome: (named) => Effect.succeed({ agents: { default: named } }),
  })

const agentsOf = (
  config: E2EConfigInput,
  env: RunOverrideEnvironment,
): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.agent), {
    onNone: () => UNSET,
    onSome: (name) => agentsNamedBy(config, name),
  })

const cacheOf = (env: RunOverrideEnvironment): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.cache), {
    onNone: () => UNSET,
    onSome: (value) =>
      Schema.decodeUnknownEffect(CacheMode)(value).pipe(
        Effect.mapError(() => refused(['cache', 'mode'], 'one of "off", "read-only", "read-write"')),
        Effect.map((mode) => ({ cache: { mode } })),
      ),
  })

const traceOf = (env: RunOverrideEnvironment): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.trace), {
    onNone: () => UNSET,
    onSome: (value) =>
      Schema.decodeUnknownEffect(Trace)(value).pipe(
        Effect.mapError(() => refused(['trace'], 'one of "off", "on", "retain-on-failure"')),
        Effect.map((trace) => ({ trace })),
      ),
  })

const aiTraceOf = (env: RunOverrideEnvironment): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.aiTrace), {
    onNone: () => UNSET,
    onSome: (value) =>
      Schema.decodeUnknownEffect(BooleanFlag)(value).pipe(
        Effect.mapError(() => refused(['aiTrace'], 'one of "true", "false"')),
        Effect.map((flag) => ({ aiTrace: flag === 'true' })),
      ),
  })

const timeoutOf = (env: RunOverrideEnvironment): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.timeout), {
    onNone: () => UNSET,
    onSome: (value) => Effect.succeed({ timeout: Number(value) }),
  })

const outputOf = (env: RunOverrideEnvironment): Effect.Effect<Partial<E2EConfigInput>, ConfigInvalid> =>
  Option.match(overrideOf(env, RUN_OVERRIDE_ENV.output), {
    onNone: () => UNSET,
    onSome: (output) => Effect.succeed({ output }),
  })

const withRunOverridesWith = (
  config: E2EConfigInput,
  env: RunOverrideEnvironment,
): Result.Result<E2EConfigInput, ConfigInvalid> =>
  Effect.gen(function*() {
    const target = yield* targetOf(config, env)
    const agents = yield* agentsOf(config, env)
    const cache = yield* cacheOf(env)
    const timeout = yield* timeoutOf(env)
    const output = yield* outputOf(env)
    const trace = yield* traceOf(env)
    const aiTrace = yield* aiTraceOf(env)
    return { ...config, ...target, ...agents, ...cache, ...timeout, ...output, ...trace, ...aiTrace }
  }).pipe(Effect.result, Effect.runSync)

/**
 * Applies the run overrides the suite's environment carries to its config, ahead of the one decode
 * (design §15.2): `E2E_TARGET` narrows the targets to the one it names, `E2E_AGENT` rekeys the named agent as
 * the `default` agent the runner reads, `E2E_AI_TRACE` turns ai-trace on or off, and the rest overwrite their
 * single config fields. An override that names nothing the config carries, or a cache, trace or ai-trace value
 * outside its literals, is refused with its key path; a malformed timeout or output passes through, and
 * `decodeConfig` refuses it with the path it would name were the value written in the config file.
 */
export const withRunOverrides: {
  (env: RunOverrideEnvironment): (config: E2EConfigInput) => Result.Result<E2EConfigInput, ConfigInvalid>
  (config: E2EConfigInput, env: RunOverrideEnvironment): Result.Result<E2EConfigInput, ConfigInvalid>
} = Function.dual(2, withRunOverridesWith)
