/**
 * The request a command handler leaves for the executor to run: the parsed
 * options of a `run` (the `survivors` flag is carried separately — the
 * survivor admission consumes it and it must not reach the pipeline as an
 * option) or the pre-rendered manifest document of `--llms`. The help path
 * leaves no request; the executor's finalizer turns the framework-rendered
 * help into the `help` terminal event instead.
 *
 * The schema's `options`/`document` fields are `S.Any`: no schema exists for
 * `PartialStrykerOptions` or `ManifestRendered` in `@stryker-mutator/api/core`,
 * and the request is never decoded from external bytes — the handler builds it
 * from `@effect/cli`-parsed values. The exported type therefore carries the
 * fields' real types rather than the schema's `any`, so consumers (the
 * executor's `Match.tag` arms) stay typed; the two must not drift into a
 * decode path. The union is spelled as two lone member aliases because an
 * inline tagged union would itself be flagged by `no-manual-tag-member`.
 */
import type { ManifestRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as S from 'effect/Schema'

export const CliRequest = S.Union([
  S.TaggedStruct('run', { options: S.Any, survivors: S.Boolean }),
  S.TaggedStruct('llms', { document: S.Any }),
])
export type RunRequest = { readonly _tag: 'run'; readonly options: PartialStrykerOptions; readonly survivors: boolean }
export type LlmsRequest = { readonly _tag: 'llms'; readonly document: ManifestRendered }
export type CliRequest = RunRequest | LlmsRequest
