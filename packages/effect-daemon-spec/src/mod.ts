import { poll } from './daemon-poll.combinator.js'
import { stream } from './daemon-stream.combinator.js'
import { subscription } from './daemon-subscription.combinator.js'
import { worker } from './daemon-worker.executor.js'
import { dynamic as dynamicRuntime } from './internal/build-dynamic.executor.js'
import { supervisor } from './internal/supervisor-body.executor.js'
import { custom, leader, supervision, task } from './supervision-policy/supervision-policy.combinator.js'

export { DynamicLimitExceeded } from './daemon-health/daemon-health.schema.js'
export { healthStateGauge } from './daemon-metrics/daemon-metrics.kernel.js'

export const Daemon = {
  poll,
  stream,
  subscription,
} as const
export const run = {
  worker,
  supervisor,
  dynamic: dynamicRuntime,
} as const
export const Supervision = {
  leader,
  worker: supervision,
  task,
  custom,
} as const
