import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { Stage } from 'alchemy/Stage'
import { Effect } from 'effect'

export const CLOUD_STACK_NAME = 'CloudProbe'

export const probeWorkerName = (stage: string): string => `cloud-probe-${stage.toLowerCase().replaceAll('_', '-')}`

export const cloudProbeStack = Alchemy.Stack(
  CLOUD_STACK_NAME,
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function*() {
    const stage = yield* Stage
    const worker = yield* Cloudflare.Worker('Probe', {
      name: probeWorkerName(stage),
      main: new URL('probe-worker.fixture.ts', import.meta.url).pathname,
    })
    return { url: worker.url.as<string>() }
  }),
)
