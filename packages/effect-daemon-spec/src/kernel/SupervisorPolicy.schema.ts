/// <reference types="vitest/importMeta" />
import { Array as Arr, Match, Option, Result, Schema, SchemaAST, SchemaGetter } from 'effect'
import { Ceiling, ChildId, Intensity, Millis, PositiveMillis, ProbeThreshold } from './SupervisionLimits.schema.js'

export const RestartStrategy = Schema.Literals(['one_for_one', 'one_for_all', 'rest_for_one'])
export type RestartStrategy = typeof RestartStrategy.Type

export const RestartType = Schema.Literals(['permanent', 'transient', 'temporary'])
export type RestartType = typeof RestartType.Type

export const AutoShutdown = Schema.Literals(['never', 'any_significant', 'all_significant'])
export type AutoShutdown = typeof AutoShutdown.Type

export const BrutalShutdown = Schema.TaggedStruct('Brutal', {})
export type BrutalShutdown = typeof BrutalShutdown.Type

export const GracefulShutdown = Schema.TaggedStruct('Graceful', { millis: PositiveMillis })
export type GracefulShutdown = typeof GracefulShutdown.Type

export const InfinityShutdown = Schema.TaggedStruct('Infinity', {})
export type InfinityShutdown = typeof InfinityShutdown.Type

export const ShutdownMode = Schema.Union([BrutalShutdown, GracefulShutdown, InfinityShutdown])
export type ShutdownMode = typeof ShutdownMode.Type

export const BackoffSchedule = Schema.Struct({
  baseMillis: Millis,
  multiplier: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 4 }))),
  capMillis: Millis,
})
export type BackoffSchedule = typeof BackoffSchedule.Type

export const ChildDeclaration = Schema.Struct({
  childId: ChildId,
  restartType: RestartType,
  shutdown: ShutdownMode,
  significant: Schema.Boolean,
  startTimeoutMillis: PositiveMillis,
  probeFailureThreshold: ProbeThreshold,
})
export type ChildDeclaration = typeof ChildDeclaration.Type

export const NoDynamicChildren = Schema.TaggedStruct('NoDynamicChildren', {})
export type NoDynamicChildren = typeof NoDynamicChildren.Type

export const DynamicChildren = Schema.TaggedStruct('DynamicChildren', {
  ceiling: Ceiling,
  restartType: RestartType,
  shutdown: ShutdownMode,
  startTimeoutMillis: PositiveMillis,
  probeFailureThreshold: ProbeThreshold,
})
export type DynamicChildren = typeof DynamicChildren.Type

export const DynamicKind = Schema.Union([NoDynamicChildren, DynamicChildren])
export type DynamicKind = typeof DynamicKind.Type

export const NoCoolDown = Schema.TaggedStruct('NoCoolDown', {})
export type NoCoolDown = typeof NoCoolDown.Type

export const CoolDownAfter = Schema.TaggedStruct('CoolDownAfter', { millis: PositiveMillis })
export type CoolDownAfter = typeof CoolDownAfter.Type

export const CoolDownSetting = Schema.Union([NoCoolDown, CoolDownAfter])
export type CoolDownSetting = typeof CoolDownSetting.Type

const policyFields = {
  strategy: RestartStrategy,
  intensity: Intensity,
  periodMillis: PositiveMillis,
  autoShutdown: AutoShutdown,
  coolDown: CoolDownSetting,
  backoff: BackoffSchedule,
  dynamic: DynamicKind,
  livenessTickMillis: PositiveMillis,
  childDeclarations: Schema.Array(ChildDeclaration),
}

type PolicyShape = {
  readonly autoShutdown: AutoShutdown
  readonly childDeclarations: ReadonlyArray<ChildDeclaration>
}

const SignificantPermanentChild = Schema.TaggedStruct('SignificantPermanentChild', {})
type SignificantPermanentChild = typeof SignificantPermanentChild.Type

const SignificantChildUnderNever = Schema.TaggedStruct('SignificantChildUnderNever', {})
type SignificantChildUnderNever = typeof SignificantChildUnderNever.Type

type PolicyRefusal = SignificantPermanentChild | SignificantChildUnderNever

const significantPermanentRefusal: PolicyRefusal = { _tag: 'SignificantPermanentChild' }
const significantUnderNeverRefusal: PolicyRefusal = { _tag: 'SignificantChildUnderNever' }

const POLICY_REFUSAL_MESSAGE =
  'a significant child must be transient or temporary, and a supervisor that declares one must auto-shutdown on significance'

const permanentRefusalOf = (child: ChildDeclaration): Option.Option<PolicyRefusal> =>
  Match.value(child.restartType).pipe(
    Match.when('permanent', () => Option.some(significantPermanentRefusal)),
    Match.orElse(() => Option.none()),
  )

const autoRefusalOf = (child: ChildDeclaration, autoShutdown: AutoShutdown): Option.Option<PolicyRefusal> =>
  Match.value(autoShutdown).pipe(
    Match.when('never', () => Option.some(significantUnderNeverRefusal)),
    Match.orElse(() => permanentRefusalOf(child)),
  )

const childRefusalOf = (child: ChildDeclaration, autoShutdown: AutoShutdown): Option.Option<PolicyRefusal> =>
  Match.value(child.significant).pipe(
    Match.when(false, () => Option.none()),
    Match.orElse(() => autoRefusalOf(child, autoShutdown)),
  )

const policyRefusalOf = (policy: PolicyShape): Option.Option<PolicyRefusal> => {
  const offending = Arr.findFirst(
    policy.childDeclarations,
    (child) => Option.isSome(childRefusalOf(child, policy.autoShutdown)),
  )
  return Option.flatMap(offending, (child) => childRefusalOf(child, policy.autoShutdown))
}

const policyIsDecodable = (policy: PolicyShape): boolean => Option.isNone(policyRefusalOf(policy))

const ChildSeed = Schema.Struct({
  restartType: RestartType,
  significantBit: Schema.Boolean,
  shutdown: ShutdownMode,
  startTimeoutMillis: PositiveMillis,
  probeFailureThreshold: ProbeThreshold,
})
type ChildSeed = typeof ChildSeed.Type

const PolicyGenerated = Schema.Struct({
  strategy: RestartStrategy,
  intensity: Intensity,
  periodMillis: PositiveMillis,
  autoShutdown: AutoShutdown,
  coolDown: CoolDownSetting,
  backoff: BackoffSchedule,
  dynamic: DynamicKind,
  livenessTickMillis: PositiveMillis,
  childSeeds: Schema.Array(ChildSeed),
})
type PolicyGenerated = typeof PolicyGenerated.Type

const decodable = (holds: readonly boolean[]): boolean => holds.every((single) => single)

const declarationOf = (seed: ChildSeed, index: number, autoShutdown: AutoShutdown): ChildDeclaration => ({
  childId: `c${index}`,
  restartType: seed.restartType,
  shutdown: seed.shutdown,
  significant: decodable([seed.significantBit, seed.restartType !== 'permanent', autoShutdown !== 'never']),
  startTimeoutMillis: seed.startTimeoutMillis,
  probeFailureThreshold: seed.probeFailureThreshold,
})

const seedOf = (declaration: ChildDeclaration): ChildSeed => ({
  restartType: declaration.restartType,
  significantBit: declaration.significant,
  shutdown: declaration.shutdown,
  startTimeoutMillis: declaration.startTimeoutMillis,
  probeFailureThreshold: declaration.probeFailureThreshold,
})

const policyOf = (generated: PolicyGenerated): SupervisionPolicy =>
  new SupervisionPolicy({
    strategy: generated.strategy,
    intensity: generated.intensity,
    periodMillis: generated.periodMillis,
    autoShutdown: generated.autoShutdown,
    coolDown: generated.coolDown,
    backoff: generated.backoff,
    dynamic: generated.dynamic,
    livenessTickMillis: generated.livenessTickMillis,
    childDeclarations: Arr.map(
      generated.childSeeds,
      (seed, index) => declarationOf(seed, index, generated.autoShutdown),
    ),
  })

const generatedFromPolicy = (policy: SupervisionPolicy): PolicyGenerated => ({
  strategy: policy.strategy,
  intensity: policy.intensity,
  periodMillis: policy.periodMillis,
  autoShutdown: policy.autoShutdown,
  coolDown: policy.coolDown,
  backoff: policy.backoff,
  dynamic: policy.dynamic,
  livenessTickMillis: policy.livenessTickMillis,
  childSeeds: Arr.map(policy.childDeclarations, seedOf),
})

const encodedDeclarationOf = (seed: ChildSeed, index: number) => ({
  childId: `c${index}`,
  restartType: seed.restartType,
  shutdown: seed.shutdown,
  significant: seed.significantBit,
  startTimeoutMillis: seed.startTimeoutMillis,
  probeFailureThreshold: seed.probeFailureThreshold,
})

const encodedFromDraft = (draft: PolicyGenerated) => ({
  strategy: draft.strategy,
  intensity: draft.intensity,
  periodMillis: draft.periodMillis,
  autoShutdown: draft.autoShutdown,
  coolDown: draft.coolDown,
  backoff: draft.backoff,
  dynamic: draft.dynamic,
  livenessTickMillis: draft.livenessTickMillis,
  childDeclarations: Arr.map(draft.childSeeds, (seed, index) => encodedDeclarationOf(seed, index)),
})

const refuseSeedOf = (kind: string, significantBit: boolean): ChildSeed => ({
  restartType: kind === 'permanent' ? 'permanent' : 'transient',
  significantBit,
  shutdown: { _tag: 'Brutal' },
  startTimeoutMillis: 50,
  probeFailureThreshold: 2,
})

const significantChildRefused = (kind: string, autoShutdown: AutoShutdown): boolean =>
  Match.value(autoShutdown).pipe(
    Match.when('never', () => true),
    Match.orElse(() => kind === 'permanent'),
  )

const refusedWhenDrawn = (
  kind: string,
  significantBit: boolean,
  autoShutdown: AutoShutdown,
): boolean =>
  Match.value(significantBit).pipe(
    Match.when(false, () => false),
    Match.when(true, () => significantChildRefused(kind, autoShutdown)),
    Match.exhaustive,
  )

export class SupervisionPolicy extends Schema.Class<SupervisionPolicy>('SupervisionPolicy')(
  Schema.Struct(policyFields).check(Schema.makeFilter(policyIsDecodable, { message: POLICY_REFUSAL_MESSAGE })),
  {
    toCodecArbitrary: (): SchemaAST.Link =>
      Schema.link<SupervisionPolicy>()(PolicyGenerated, {
        decode: SchemaGetter.transform((generated) => policyOf(generated)),
        encode: SchemaGetter.transform(generatedFromPolicy),
      }),
  },
) {}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and a static import would enter the published
  // module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const decodePolicy = Schema.decodeResult(SupervisionPolicy)

  const decodesAsDrawn = (decode: typeof decodePolicy, draft: PolicyGenerated): boolean => {
    const encoded = encodedFromDraft(draft)
    const decoded = decode(encoded)
    return Option.match(policyRefusalOf(encoded), {
      onNone: () => Result.isSuccess(decoded),
      onSome: () => Result.isFailure(decoded),
    })
  }

  const refusesDrawn = (
    decode: typeof decodePolicy,
    kind: string,
    significantBit: boolean,
    autoShutdown: AutoShutdown,
  ): boolean => {
    const draft = {
      strategy: 'one_for_one' as const,
      intensity: 1 as const,
      periodMillis: 100 as const,
      autoShutdown,
      coolDown: { _tag: 'NoCoolDown' } as const,
      backoff: { baseMillis: 0 as const, multiplier: 2 as const, capMillis: 0 as const },
      dynamic: { _tag: 'NoDynamicChildren' } as const,
      livenessTickMillis: 10 as const,
      childSeeds: [refuseSeedOf(kind, significantBit)],
    }
    return Result.isFailure(decode(encodedFromDraft(draft))) ===
      refusedWhenDrawn(kind, significantBit, autoShutdown)
  }

  it.prop(
    '∀d_PolicyDecode_≡Refusal',
    { of: [PolicyGenerated], subject: decodePolicy },
    (subject, [draft]) => decodesAsDrawn(subject, draft),
  )

  it.prop(
    '∀k_PolicyViolation_=Refusal',
    {
      of: [Schema.Literals(['never', 'permanent', 'transient']), Schema.Boolean, AutoShutdown],
      subject: decodePolicy,
    },
    (subject, [kind, significantBit, autoShutdown]) => refusesDrawn(subject, kind, significantBit, autoShutdown),
  )
}
