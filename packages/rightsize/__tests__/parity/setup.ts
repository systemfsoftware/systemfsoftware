/**
 * The parity lane's global setup (RS-LANE): two responsibilities, both
 * "fail, never skip".
 *
 * 1. Preflight the runtime: resolve the docker selection through the
 *    library's own discovery + selection workflow (`layerAuto` over a
 *    docker-pinned config — the exact seam the lane layer uses). When no
 *    socket answers, the selection fails with the library's
 *    `BackendUnreachableError` naming every probed candidate; that named
 *    error is thrown here so the lane busts before a single test runs —
 *    a dead daemon is a red lane, not a skipped one (RS-LANE).
 * 2. Record the `/dev/kvm` observation: the msb-conditional lane is gated
 *    on `RIGHTSIZE_MSB_IT`, and whether this runner can ever host
 *    microVMs is a machine fact the lane's environment note must state
 *    truthfully. The note is written once per distinct observation (the
 *    committed file records this host; a different verdict appends a dated
 *    line rather than rewriting history).
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Effect, Layer, Schema } from 'effect'

import type { RightsizeConfigService } from '../../src/runtime/config.js'
import { RightsizeConfig } from '../../src/runtime/config.js'
import { layerRuntimeDiscovery } from '../../src/runtime/discovery/discovery.adapter.js'
import { BackendUnreachableError, layerAuto, Selection } from '../../src/runtime/selection.workflow.js'

/** The same docker-pinned config the lane layer uses (backend: 'docker', reaper off). */
const preflightConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: path.join(os.tmpdir(), `rightsize-parity-preflight-${process.pid}`),
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

/** The docker-pinned selection layer — resolves exactly like the lane layer; fails with the library's named errors. */
const selectionLayer = layerAuto({ msbSupported: false }).pipe(
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, preflightConfig()), layerRuntimeDiscovery)),
)

/** Runs the selection workflow once; the rejection value IS the typed failure. */
const resolveSelection = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const selection = yield* Selection
      return selection
    }).pipe(Effect.provide(selectionLayer)),
  ).then(() => undefined)

const KVM_PATH = '/dev/kvm'

/** Appends a dated observation line when the committed note doesn't already state the current verdict. */
const recordKvmObservation = (): void => {
  const notePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env-note.md')
  const kvmAvailable = fs.existsSync(KVM_PATH)
  const verdictLine = kvmAvailable ? 'kvm: present' : 'kvm: absent'
  let note = ''
  try {
    note = fs.readFileSync(notePath, 'utf8')
  } catch {
    note = ''
  }
  if (note.includes(`- ${verdictLine}`)) {
    return
  }
  const observation = `- ${verdictLine} (observed by the lane setup)`
  fs.appendFileSync(notePath, note.length === 0 ? `${observation}\n` : `\n${observation}\n`)
}

export default function setup(): Promise<void> {
  recordKvmObservation()
  return resolveSelection().catch((error: unknown) => {
    if (Schema.is(BackendUnreachableError)(error)) {
      // The lane's named failure: recites every probed candidate. A failing
      // globalSetup is a broken run — never a skip (RS-LANE).
      throw new Error(
        `rightsize parity lane: no container runtime answered the discovery probe.\n` +
          `requested=${error.requested}\n` +
          `probes=${JSON.stringify(error.probes, null, 2)}\n` +
          `(the lane fails — it never skips; RS-LANE)`,
      )
    }
    throw error
  })
}
