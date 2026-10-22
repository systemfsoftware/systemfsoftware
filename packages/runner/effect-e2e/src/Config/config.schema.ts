import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import { EngineSpec, type Platform, platformOf } from './engine-spec.schema.js'
import { ConfigName, EnvVarName } from './names.schema.js'

/**
 * The facts a config's defaults depend on that the core cannot read itself: whether the run is
 * in CI, the suite's package name, and the machine's core count. The composition root supplies them.
 */
export interface ConfigDefaults {
  readonly ci: boolean
  readonly projectId: string
  readonly cores: number
}

/** The suite's test globs when config names none. */
const DEFAULT_TESTS: readonly [string, ...Array<string>] = ['tests/**/*.e2e.ts']

const ProjectId = Schema.String.check(
  Schema.isMinLength(1, { message: 'a project id is between 1 and 256 characters' }),
  Schema.isMaxLength(256, { message: 'a project id is between 1 and 256 characters' }),
).pipe(Schema.brand('ProjectId'))

const TargetName = ConfigName.pipe(Schema.brand('TargetName'))

const NonBlank = Schema.String.check(
  Schema.isPattern(/\S/u, { message: 'a value with at least one non-space character' }),
)

const AbsoluteUrl = Schema.String.check(
  Schema.isPattern(/^https?:\/\/[^\s/?#]+[^\s]*$/u, { message: 'an absolute http(s) URL' }),
)

const Glob = Schema.String.check(Schema.isPattern(/\S/u, { message: 'a glob is a non-blank string' }))

/** One glob or a non-empty list of them; decoded to the list. */
const TestGlobs = Schema.Union([Glob, Glob.pipe(Schema.NonEmptyArray)]).pipe(
  Schema.decodeTo(
    Schema.toType(Glob.pipe(Schema.NonEmptyArray)),
    SchemaTransformation.transform({
      decode: (globs) => (typeof globs === 'string' ? [globs] as const : globs),
      encode: (globs) => globs,
    }),
  ),
)

/** A whole number of milliseconds greater than zero, decoded to a `Duration`. */
const Timeout = Schema.Int.check(
  Schema.isGreaterThan(0, { message: 'a timeout is a whole number of milliseconds greater than zero' }),
).pipe(Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromMillis))

const Retries = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 10 }, { message: 'retries is a whole number between 0 and 10' }),
)

const Workers = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 1024 }, { message: 'workers is a whole number between 1 and 1024' }),
)

const StepBudget = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, { message: 'a step budget is a whole number of at least 1' }),
)

/** A path inside the suite root: relative, and never climbing out with `..`. */
const SuitePath = Schema.String.check(
  Schema.isPattern(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))\S.*$/u, {
    message: 'an output directory is a relative path inside the suite root',
  }),
)

const App = Schema.Struct({
  url: AbsoluteUrl,
  identity: NonBlank,
  environment: Schema.optionalKey(NonBlank),
})

const TargetFields = Schema.Struct({ name: TargetName, engine: EngineSpec, app: App })

const ResolvedTarget = Schema.Struct({
  name: TargetName,
  platform: Schema.Literal('web' satisfies Platform),
  engine: EngineSpec,
  app: App,
})

/** A target as written, decoded with the platform its engine implies. */
export const Target = TargetFields.pipe(
  Schema.decodeTo(
    Schema.toType(ResolvedTarget),
    SchemaTransformation.transform({
      decode: (target) => ({ ...target, platform: platformOf(target.engine) }),
      encode: ({ platform: _platform, ...target }) => target,
    }),
  ),
)
export type Target = typeof Target.Type

const OpenRouterModel = Schema.Struct({
  gateway: Schema.Literal('openrouter').pipe(Schema.withDecodingDefaultKey(Effect.succeed('openrouter' as const))),
  model: NonBlank.pipe(Schema.withDecodingDefaultKey(Effect.succeed('deepseek/deepseek-flash-latest'))),
  apiKeyEnv: EnvVarName.pipe(Schema.withDecodingDefaultKey(Effect.succeed('OPENROUTER_API_KEY'))),
})

const OpenAiCompatibleModel = Schema.Struct({
  gateway: Schema.Literal('openai-compatible'),
  baseURL: AbsoluteUrl,
  model: NonBlank,
  apiKeyEnv: EnvVarName,
})

const ModelSpec = Schema.Union([OpenAiCompatibleModel, OpenRouterModel])

export const AgentConfig = Schema.Struct({
  model: ModelSpec,
  system: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(''))),
  context: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(''))),
  maxSteps: StepBudget.pipe(Schema.withDecodingDefaultKey(Effect.succeed(25))),
  maxModelCalls: StepBudget.pipe(Schema.withDecodingDefaultKey(Effect.succeed(25))),
})
export type AgentConfig = typeof AgentConfig.Type

const CacheMode = Schema.Literals(['off', 'read-only', 'read-write'])

export const SecretConfig = Schema.Struct({ env: EnvVarName })
export type SecretConfig = typeof SecretConfig.Type

export const CredentialConfig = Schema.Struct({ username: NonBlank, password: SecretConfig })
export type CredentialConfig = typeof CredentialConfig.Type

const Reporter = Schema.Literals(['list', 'json', 'junit', 'markdown'])

export const ReporterConfig = Schema.NonEmptyArray(Reporter)
export type ReporterConfig = typeof ReporterConfig.Type

const Trace = Schema.Literals(['off', 'on', 'retain-on-failure'])

const workersOf = (defaults: ConfigDefaults): number => Math.min(1024, Math.max(1, Math.floor(defaults.cores / 2)))

const CI_RUN_SHAPE = { retries: 1, workers: 1, cacheMode: 'read-only' } as const

const runShapeOf = (defaults: ConfigDefaults) =>
  defaults.ci === true ? CI_RUN_SHAPE : { retries: 0, workers: workersOf(defaults), cacheMode: 'read-write' } as const

const cacheConfigOf = (mode: typeof CacheMode.Type) =>
  Schema.Struct({ mode: CacheMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed(mode))) })

const configSchemaFor = (defaults: ConfigDefaults, shape: ReturnType<typeof runShapeOf>) =>
  Schema.Struct({
    projectId: ProjectId.pipe(Schema.withDecodingDefaultKey(Effect.succeed(defaults.projectId))),
    targets: Schema.NonEmptyArray(Target),
    tests: TestGlobs.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_TESTS))),
    timeout: Timeout.pipe(Schema.withDecodingDefaultKey(Effect.succeed(120_000))),
    launchTimeout: Timeout.pipe(Schema.withDecodingDefaultKey(Effect.succeed(60_000))),
    actionTimeout: Timeout.pipe(Schema.withDecodingDefaultKey(Effect.succeed(30_000))),
    assertionTimeout: Timeout.pipe(Schema.withDecodingDefaultKey(Effect.succeed(5_000))),
    cleanupTimeout: Timeout.pipe(Schema.withDecodingDefaultKey(Effect.succeed(30_000))),
    retries: Retries.pipe(Schema.withDecodingDefaultKey(Effect.succeed(shape.retries))),
    workers: Workers.pipe(Schema.withDecodingDefaultKey(Effect.succeed(shape.workers))),
    agents: Schema.Record(ConfigName, AgentConfig).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    cache: cacheConfigOf(shape.cacheMode).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    secrets: Schema.Record(ConfigName, SecretConfig).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    credentials: Schema.Record(ConfigName, CredentialConfig).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    reporters: ReporterConfig.pipe(Schema.withDecodingDefaultKey(Effect.succeed(['list'] as const))),
    output: SuitePath.pipe(Schema.withDecodingDefaultKey(Effect.succeed('.e2e'))),
    trace: Trace.pipe(Schema.withDecodingDefaultKey(Effect.succeed('retain-on-failure' as const))),
  })

/** The config schema under one run's defaults (requirements §3.2, design §3.1); `decodeConfig` decodes with it. */
export const e2eConfigSchema = (defaults: ConfigDefaults) => configSchemaFor(defaults, runShapeOf(defaults))

/** A decoded suite config: every default filled, every value refined. */
export type E2EConfig = ReturnType<typeof e2eConfigSchema>['Type']

/** A suite config as `e2e.config.ts` writes it, before decode. */
export type E2EConfigInput = ReturnType<typeof e2eConfigSchema>['Encoded']

export type CacheConfig = E2EConfig['cache']
