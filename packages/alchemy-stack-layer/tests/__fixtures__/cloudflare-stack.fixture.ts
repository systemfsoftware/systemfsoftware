import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Core from '@alchemy.run/test/Core'
import * as Alchemy from 'alchemy'
import { Stage } from 'alchemy/Stage'
import { Effect } from 'effect'
import { join } from 'node:path'

export const CLOUD_STACK_NAME = 'CloudProbe'

export const probeWorkerName = (stage: string): string => `cloud-probe-${stage.toLowerCase().replaceAll('_', '-')}`

export const cloudProbeOptions: Required<Pick<Core.MakeOptions, 'providers' | 'state'>> = {
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
}

export const cloudProbeStack = Alchemy.Stack(
  CLOUD_STACK_NAME,
  cloudProbeOptions,
  Effect.gen(function*() {
    const stage = yield* Stage
    const worker = yield* Cloudflare.Worker('Probe', {
      name: probeWorkerName(stage),
      main: join(import.meta.dirname, 'probe-worker.fixture.ts'),
    })
    return { url: worker.url.as<string>(), stage }
  }),
)
