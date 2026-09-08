import { FileName } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

export const SvelteVersion = S.NonEmptyString.pipe(S.brand('SvelteVersion'))
export type SvelteVersion = typeof SvelteVersion.Type

export class ParseFailed
  extends S.TaggedError<ParseFailed>('@systemfsoftware/stryker-js-instrumenter/ParseFailed')('ParseFailed', {
    fileName: FileName,
    message: S.String,
    location: S.Struct({ line: S.Finite, column: S.Finite }),
    cause: S.Defect(),
  })
{
  override get message(): string {
    return `Failed to parse ${this.fileName} at ${this.location.line}:${this.location.column}: ${this.message}`
  }
}

export class ParserNotFound
  extends S.TaggedError<ParserNotFound>('@systemfsoftware/stryker-js-instrumenter/ParserNotFound')('ParserNotFound', {
    fileName: FileName,
    extension: S.String,
    cause: S.Defect(),
  })
{
  override get message(): string {
    return `No parser registered for ${this.fileName} (extension "${this.extension}")`
  }
}

export class SvelteVersionNotSupported extends S.TaggedError<SvelteVersionNotSupported>(
  '@systemfsoftware/stryker-js-instrumenter/SvelteVersionNotSupported',
)('SvelteVersionNotSupported', {
  version: SvelteVersion,
  fileName: FileName,
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
      fileName: FileName,
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
      fileName: FileName,
      cause: S.Defect(),
    },
  )
{
  override get message(): string {
    return `Failed to parse Svelte component ${this.fileName}`
  }
}
