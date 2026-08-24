import * as S from 'effect/Schema'

export class SvelteVersionNotSupported extends S.TaggedError<SvelteVersionNotSupported>(
  '@systemfsoftware/stryker-js-instrumenter/SvelteVersionNotSupported',
)('SvelteVersionNotSupported', {
  version: S.String,
  fileName: S.String,
  cause: S.Defect(),
}) {
  override get message(): string {
    return `Svelte version ${this.version} is not supported for ${this.fileName} (expected >=3.30)`
  }
}

export class SvelteWalkerNotFound
  extends S.TaggedError<SvelteWalkerNotFound>('@systemfsoftware/stryker-js-instrumenter/SvelteWalkerNotFound')(
    'SvelteWalkerNotFound',
    {
      fileName: S.String,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `Svelte walker not found for ${this.fileName}`
  }
}

export class SvelteParseFailed
  extends S.TaggedError<SvelteParseFailed>('@systemfsoftware/stryker-js-instrumenter/SvelteParseFailed')(
    'SvelteParseFailed',
    {
      fileName: S.String,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `Failed to parse Svelte component ${this.fileName}`
  }
}
