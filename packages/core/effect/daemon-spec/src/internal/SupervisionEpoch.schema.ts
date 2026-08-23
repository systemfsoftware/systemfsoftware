import { Schema as S } from 'effect'

const EpochStepTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/EpochStep')
type EpochStepTypeId = typeof EpochStepTypeId

/** @internal */
export class StopEpoch extends S.TaggedClass<StopEpoch>()('StopEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

/** @internal */
export class RestartEpoch extends S.TaggedClass<RestartEpoch>()('RestartEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

/** @internal */
export class CooldownEpoch extends S.TaggedClass<CooldownEpoch>()('CooldownEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

/** @internal */
export const EpochStep = S.Union([StopEpoch, RestartEpoch, CooldownEpoch])
/** @internal */
export type EpochStep = typeof EpochStep.Type

const SupervisionEpochResultTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/SupervisionEpochResult')
type SupervisionEpochResultTypeId = typeof SupervisionEpochResultTypeId

/** @internal */
export class StopSupervision extends S.TaggedClass<StopSupervision>()('StopSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

/** @internal */
export class ContinueSupervision extends S.TaggedClass<ContinueSupervision>()('ContinueSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

/** @internal */
export const SupervisionEpochResult = S.Union([StopSupervision, ContinueSupervision])
/** @internal */
export type SupervisionEpochResultType = typeof SupervisionEpochResult.Type
