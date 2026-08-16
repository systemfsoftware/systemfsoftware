import { Schema as S } from 'effect'

const EpochStepTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/EpochStep')
type EpochStepTypeId = typeof EpochStepTypeId

export class StopEpoch extends S.TaggedClass<StopEpoch>()('StopEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

export class RestartEpoch extends S.TaggedClass<RestartEpoch>()('RestartEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

export class CooldownEpoch extends S.TaggedClass<CooldownEpoch>()('CooldownEpoch', {}) {
  readonly [EpochStepTypeId] = EpochStepTypeId
}

export const EpochStep = S.Union([StopEpoch, RestartEpoch, CooldownEpoch])
export type EpochStep = typeof EpochStep.Type

const SupervisionEpochResultTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/SupervisionEpochResult')
type SupervisionEpochResultTypeId = typeof SupervisionEpochResultTypeId

export class StopSupervision extends S.TaggedClass<StopSupervision>()('StopSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

export class ContinueSupervision extends S.TaggedClass<ContinueSupervision>()('ContinueSupervision', {}) {
  readonly [SupervisionEpochResultTypeId] = SupervisionEpochResultTypeId
}

export const SupervisionEpochResult = S.Union([StopSupervision, ContinueSupervision])
export type SupervisionEpochResultType = typeof SupervisionEpochResult.Type
