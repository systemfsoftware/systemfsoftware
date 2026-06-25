import {
  Continue,
  type DecideInput,
  Exhausted,
  Restart,
  type RestartDecision,
  type RestartStrategy,
} from './restart-decision.schema.js'

export {
  Continue,
  DecideInput,
  Exhausted,
  Restart,
  RestartDecision,
  RestartDecisionTypeId,
  RestartStrategy,
} from './restart-decision.schema.js'

export const restartIndicesFor = (
  strategy: RestartStrategy,
  failedIndex: number,
  total: number,
): readonly [number, ...ReadonlyArray<number>] => {
  if (strategy === 'one_for_one') return [failedIndex]
  if (strategy === 'one_for_all') {
    const rest = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 1)
    return [0, ...rest]
  }
  const rest = Array.from({ length: Math.max(0, total - failedIndex - 1) }, (_, i) => failedIndex + 1 + i)
  return [failedIndex, ...rest]
}

export const decideRestart = (input: DecideInput): RestartDecision => {
  if (input.exitSuccess) return new Continue()
  if (input.intensityExceeded) return new Exhausted()
  const indices = restartIndicesFor(input.strategy, input.failedIndex, input.totalChildren)
  return new Restart({ indices })
}
