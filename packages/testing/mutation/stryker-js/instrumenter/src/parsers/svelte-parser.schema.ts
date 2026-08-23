import * as S from 'effect/Schema'

export class SvelteVersionNotSupported extends S.TaggedError<SvelteVersionNotSupported>()('SvelteVersionNotSupported', {
  version: S.String,
  fileName: S.String,
  cause: S.Unknown,
}) {
  readonly exitClass = 'SvelteVersionNotSupported' as const
}

export class SvelteWalkerNotFound extends S.TaggedError<SvelteWalkerNotFound>()('SvelteWalkerNotFound', {
  fileName: S.String,
  cause: S.Unknown,
}) {
  readonly exitClass = 'SvelteWalkerNotFound' as const
}

export class SvelteParseFailed extends S.TaggedError<SvelteParseFailed>()('SvelteParseFailed', {
  fileName: S.String,
  cause: S.Unknown,
}) {
  readonly exitClass = 'SvelteParseFailed' as const
}
