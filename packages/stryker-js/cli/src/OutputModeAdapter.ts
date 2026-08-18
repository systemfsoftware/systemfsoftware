import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'

import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'

import { resolveMode, TOOL_VARIABLES } from './OutputMode.js'

/**
 * The one impure adapter over `resolveMode` (U3): reads the process
 * environment so callers with no CLI-parsed flags — the library entry point,
 * the reporters — cannot drift into private copies of the probe and disagree
 * about the mode. Shell, never a kernel: it reads `process.stdout.isTTY` and
 * `process.env`, and the pure decision (`resolveMode`) stays downstream of
 * these reads.
 *
 * The tool-variable probe is derived from the kernel's `TOOL_VARIABLES`
 * constant, so the known-variable list has exactly one declaration.
 */
// The interface is the type consumers index into (`OutputModeProbe['detectMode']`),
// the Tag class the value the layers are built on — one exported name for both.
export interface OutputModeProbe {
  readonly detectMode: () => ResolvedMode
}

class OutputModeProbeTag extends Context.Service<OutputModeProbeTag, OutputModeProbe>()(
  '@systemfsoftware/stryker-js-cli/OutputModeAdapter/OutputModeProbeTag',
) {}

const OutputModeProbe = OutputModeProbeTag

export { OutputModeProbe }

export const OutputModeProbeLive: Layer.Layer<OutputModeProbeTag> = Layer.succeed(
  OutputModeProbe,
  OutputModeProbe.of({
    // The probe never sets the two mutually-exclusive flags, so the kernel's
    // `failure` is unreachable; getOrThrow keeps the port total.
    detectMode: () => {
      const envMode = process.env['STRYKER_MODE']
      const agent = process.env['AGENT']
      return Result.getOrThrow(
        resolveMode({
          stdoutIsTTY: process.stdout.isTTY === true,
          ...(envMode !== undefined ? { envMode } : {}),
          ...(agent !== undefined ? { agent } : {}),
          toolVars: Object.fromEntries(
            TOOL_VARIABLES.map((variable) => [variable, process.env[variable]]),
          ),
        }),
      )
    },
  }),
)
