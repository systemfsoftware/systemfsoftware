import * as S from 'effect/Schema'

export class SimulatedFailure extends S.TaggedError<SimulatedFailure>()('SimulatedFailure', {}) {}
