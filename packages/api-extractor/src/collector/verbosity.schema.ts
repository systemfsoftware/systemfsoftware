/// <reference types="vitest/importMeta" />
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

export const Verbosity = Schema.Literals(['silent', 'normal', 'verbose', 'diagnostics'])
export type Verbosity = typeof Verbosity.Type

export const CliFlags = Schema.Struct({
  quiet: Schema.optional(Schema.Boolean),
  verbose: Schema.optional(Schema.Boolean),
  diagnostics: Schema.optional(Schema.Boolean),
})
export type CliFlags = typeof CliFlags.Type

export const VerbosityRequest = Schema.Struct({
  cliFlags: CliFlags,
  configQuiet: Schema.optional(Schema.Boolean),
})
export type VerbosityRequest = typeof VerbosityRequest.Type

const verbosityTags: ReadonlyArray<string> = ['silent', 'normal', 'verbose', 'diagnostics']

const decodesVerbosity = (verbosity: string): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(Verbosity)(verbosity))

const refusalSeeds = ['', 'normal', 'silent', 'loud']

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀v_VerbosityRefusal_≡Membership',
    { of: [Schema.String], subject: decodesVerbosity },
    (subject, [verbosity]) =>
      Arr.every(
        Arr.append(refusalSeeds, verbosity),
        (candidate) => subject(candidate) === verbosityTags.includes(candidate),
      ),
  )
}
