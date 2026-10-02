/// <reference types="vitest/importMeta" />
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

export const LogLevel = Schema.Literals(['error', 'warning', 'info', 'verbose', 'none'] as const)
export type LogLevel = typeof LogLevel.Type

export const ExtractorMessageCategorySchema = Schema.Literals(
  [
    'Compiler',
    'TSDoc',
    'Extractor',
    'console',
  ] as const,
)
export type ExtractorMessageCategory = typeof ExtractorMessageCategorySchema.Type

export class MessageRuleError extends Schema.TaggedError<MessageRuleError>()('MessageRuleError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

const logLevelTags: ReadonlyArray<string> = ['error', 'warning', 'info', 'verbose', 'none']
const categoryTags: ReadonlyArray<string> = ['Compiler', 'TSDoc', 'Extractor', 'console']

const decodesLogLevel = (level: string): boolean => Result.isSuccess(Schema.decodeUnknownResult(LogLevel)(level))

const decodesCategory = (category: string): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(ExtractorMessageCategorySchema)(category))

const refusalSeeds = ['', 'error', 'console', 'Compiler', 'unknown']

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀l_LogLevelRefusal_≡Membership',
    { of: [Schema.String], subject: decodesLogLevel },
    (subject, [level]) =>
      Arr.every(
        Arr.append(refusalSeeds, level),
        (candidate) => subject(candidate) === logLevelTags.includes(candidate),
      ),
  )

  it.prop(
    '∀c_ExtractorMessageCategoryRefusal_≡Membership',
    { of: [Schema.String], subject: decodesCategory },
    (subject, [category]) =>
      Arr.every(
        Arr.append(refusalSeeds, category),
        (candidate) => subject(candidate) === categoryTags.includes(candidate),
      ),
  )
}
