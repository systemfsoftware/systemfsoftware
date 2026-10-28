import { InvalidRangeError, InvalidThresholdError } from './DiscernError.schema.js'
import type { PatternRefusal } from './pattern.blueprint.js'

export const refusalErrorOf = (refusal: PatternRefusal): InvalidThresholdError | InvalidRangeError =>
  refusal.kind === 'threshold'
    ? new InvalidThresholdError({
      threshold: refusal.threshold,
      value: refusal.value,
      limit: refusal.limit,
      message: refusal.message,
    })
    : new InvalidRangeError({
      range: refusal.range,
      low: refusal.low,
      high: refusal.high,
      message: refusal.message,
    })
