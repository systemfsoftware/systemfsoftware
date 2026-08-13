import { Effect, ParseResult, Schema as S } from 'effect'

const SubmittedPromptSchema = S.Struct({
  prompt: S.optionalWith(S.String, { default: () => '' }),
})

type SubmittedPrompt = S.Schema.Type<typeof SubmittedPromptSchema>

const PromptSubmissionFromStdin = S.transformOrFail(S.String, SubmittedPromptSchema, {
  strict: true,
  decode: (stdin) =>
    Effect.mapError(S.decodeUnknown(S.parseJson(SubmittedPromptSchema))(stdin), (error) => error.issue),
  encode: (submission, _options, ast) =>
    ParseResult.fail(new ParseResult.Forbidden(ast, submission, 'Decode-only: a prompt submission is never encoded')),
})

export const decodeSubmission = S.decodeUnknown(PromptSubmissionFromStdin)

export type { SubmittedPrompt }
