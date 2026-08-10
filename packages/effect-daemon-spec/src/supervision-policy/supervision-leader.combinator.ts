import { Context, Duration, Effect } from 'effect'
import { UnboundedIntensity } from '../daemon-spec/daemon-policy.schema.js'
import type { SupervisionConfig, SupervisionPolicy } from '../daemon-spec/daemon-spec.schema.js'
import { leaderKernel } from './supervision-leader.kernel.js'

export class LeaderConfig extends Context.Reference<LeaderConfig>()(
  '@systemfsoftware/effect-daemon-spec/LeaderConfig',
  {
    defaultValue: (): SupervisionConfig => ({
      backoffBase: Duration.seconds(1),
      intensity: new UnboundedIntensity(),
      cooldown: Duration.zero,
    }),
  },
) {}

export const leader = (cap: Duration.DurationInput): Effect.Effect<SupervisionPolicy> =>
  Effect.flatMap(LeaderConfig, (config) => leaderKernel(config, cap))
