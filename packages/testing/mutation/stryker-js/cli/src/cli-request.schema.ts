/**
 * The request a command handler leaves for the executor to run: the parsed
 * options of a `run` (the `survivors` flag is carried separately — the
 * survivor admission consumes it and it must not reach the pipeline as an
 * option) or the pre-rendered manifest document of `--llms`. The help path
 * leaves no request; the executor's finalizer turns the framework-rendered
 * help into the `help` terminal event instead.
 *
 * The schema's `options`/`document` fields are `S.Any`: no schema exists for
 * `PartialStrykerOptions` or `ManifestRendered` in `@systemfsoftware/stryker-js-plugin-api/core`,
 * and the request is never decoded from external bytes — the handler builds it
 * from `@effect/cli`-parsed values. The exported type therefore carries the
 * fields' real types rather than the schema's `any`, so consumers (the
 * executor's `Match.tag` arms) stay typed; the two must not drift into a
 * decode path. The types are derived from the named variant schemas instead —
 * `Omit` swaps each `S.Any` field for its real type — so the `_tag`
 * discriminants come from `S.TaggedStruct` rather than a hand-declared member.
 */
import { type ManifestRendered } from '@systemfsoftware/stryker-js-mutation-run'
import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as S from 'effect/Schema'

const RunRequestSchema = S.TaggedStruct('run', { options: S.Any, survivors: S.Boolean })
const LlmsRequestSchema = S.TaggedStruct('llms', { document: S.Any })

export const CliRequest = S.Union([RunRequestSchema, LlmsRequestSchema])
export type RunRequest = Omit<typeof RunRequestSchema['Type'], 'options'> & {
  readonly options: PartialStrykerOptions
}
export type LlmsRequest = Omit<typeof LlmsRequestSchema['Type'], 'document'> & {
  readonly document: ManifestRendered
}
export type CliRequest = RunRequest | LlmsRequest
