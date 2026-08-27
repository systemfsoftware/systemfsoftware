/**
 * What the CLI parser hands the dispatcher.
 *
 * A request never crosses a boundary: `makeStrykerCommand` builds one as an
 * object literal from flags Effect's CLI has already parsed and typed, and the
 * dispatcher reads it out of a `Ref` in the same process. Nothing decodes it, so
 * the bases below exist only to derive the `_tag` members rather than to
 * hand-write them, and neither is exported.
 *
 * That non-export is load-bearing. The law generator walks every refinement
 * reachable from an *exported* schema, so the previous
 * `export const CliRequest = S.Union([...])` — whose `run` arm declared
 * `options: StrykerOptionsSchema` — pulled the entire option tree into the
 * generated suite, to prove things about a codec nobody runs.
 *
 * `options` is also PARTIAL, which is the substantive point the old schema got
 * wrong. These are only the options this invocation named on the command line;
 * `readConfig` later merges them onto the config file's values and the defaults.
 * Declaring the resolved `StrykerOptions` described a value this type never
 * holds, which is why its `Type` had to be discarded and patched by hand.
 */
import { ManifestRendered as ManifestRenderedSchema } from '@systemfsoftware/stryker-js/Run'
import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as S from 'effect/Schema'

const RunRequestBase = S.TaggedStruct('run', { survivors: S.Boolean })
const LlmsRequestBase = S.TaggedStruct('llms', { document: ManifestRenderedSchema })

export type RunRequest = S.Schema.Type<typeof RunRequestBase> & {
  readonly options: PartialStrykerOptions
}
export type LlmsRequest = S.Schema.Type<typeof LlmsRequestBase>
export type CliRequest = RunRequest | LlmsRequest
