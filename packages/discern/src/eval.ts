import { calibrate, sweep } from './eval-measure.js'
import { run } from './measure-pattern.cell.js'

/** The evaluation entry point: run one pattern, sweep thresholds, or calibrate. */
export const Eval = {
  run,
  sweep,
  calibrate,
} as const
