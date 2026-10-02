/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

/** The line a source coordinate names: an integer, since positions come from the scanner. */
const SourceLine = Schema.Int

export class UnsupportedSyntaxError extends Schema.TaggedError<UnsupportedSyntaxError>()(
  'UnsupportedSyntaxError',
  {
    file: Schema.String,
    line: SourceLine,
    message: Schema.String,
  },
) {}

export class UnsupportedStarExportError extends Schema.TaggedError<UnsupportedStarExportError>()(
  'UnsupportedStarExportError',
  {
    namespaceName: Schema.String,
    moduleSpecifier: Schema.String,
  },
) {
  override get message(): string {
    return `The "${this.namespaceName}" namespace import includes a star export, which is not supported:\n${this.moduleSpecifier}`
  }
}

export class MissingMainEntryPointError extends Schema.TaggedError<MissingMainEntryPointError>()(
  'MissingMainEntryPointError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `Unable to load file: ${this.filePath}`
  }
}

const decodesSourceLine = (line: number): boolean => Result.isSuccess(Schema.decodeResult(SourceLine)(line))

const lineRefusalSeeds = [
  -1,
  0,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_SourceLineRefusal_≡SafeInteger',
    { of: [Schema.Finite], subject: decodesSourceLine },
    (subject, [line]) =>
      Arr.every(
        Arr.append(lineRefusalSeeds, line),
        (candidate) => subject(candidate) === Number.isSafeInteger(candidate),
      ),
  )
}
