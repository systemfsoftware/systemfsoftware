import { Array as Arr, Match, Option, Schema } from 'effect'
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

export const SupervisionPolicy = Schema.Struct(policyFields).check(
  Schema.makeFilter(policyIsDecodable, { message: POLICY_REFUSAL_MESSAGE }),
)
export type SupervisionPolicy = typeof SupervisionPolicy.Type

export interface SupervisionPolicyParts {
  readonly strategy: RestartStrategy
  readonly intensity: Intensity
  readonly periodMillis: PositiveMillis
  readonly autoShutdown: AutoShutdown
  readonly coolDownMillis: number | undefined
  readonly backoff: BackoffSchedule
  readonly dynamic: DynamicKind
  readonly livenessTickMillis: PositiveMillis
  readonly declarations: ReadonlyArray<ChildDeclaration>
}

export const supervisionPolicyOf = (parts: SupervisionPolicyParts): SupervisionPolicy => ({
  strategy: parts.strategy,
  intensity: parts.intensity,
  periodMillis: parts.periodMillis,
  autoShutdown: parts.autoShutdown,
  coolDown: Match.value(parts.coolDownMillis).pipe(
    Match.when(undefined, (): CoolDownSetting => ({ _tag: 'NoCoolDown' })),
    Match.orElse((millis: number): CoolDownSetting => ({ _tag: 'CoolDownAfter', millis })),
  ),
  backoff: parts.backoff,
  dynamic: parts.dynamic,
  livenessTickMillis: parts.livenessTickMillis,
  childDeclarations: parts.declarations,
})

const workerShutdown: ShutdownMode = { _tag: 'Graceful', millis: 5_000 }

const supervisorShutdown: ShutdownMode = { _tag: 'Infinity' }

export const childShutdownOf = (nested: boolean): ShutdownMode =>
  Match.value(nested).pipe(
    Match.when(true, (): ShutdownMode => supervisorShutdown),
    Match.when(false, (): ShutdownMode => workerShutdown),
    Match.exhaustive,
  )
