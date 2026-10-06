import { Effect, Match, Schema } from 'effect'
import { Contract } from '../../mod.js'
import { pathOf } from './api.js'

export interface HttpReply {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export interface ReplyDeclaration {
  readonly contract: Contract.Any
  readonly answer: Contract.Answer
}

const prepared = (status: number, body: string, headers: Readonly<Record<string, string>> = {}): HttpReply => ({
  status,
  headers,
  body,
})

const operationLocation = (operation: string): string => `${pathOf('getOperation')}?operation=${operation}`

export const replyOf = (declaration: ReplyDeclaration): Effect.Effect<HttpReply, Schema.SchemaError> =>
  Match.value(declaration.answer).pipe(
    Match.tag('Completed', (completed) =>
      Effect.map(
        Schema.encodeUnknownEffect(Schema.toCodecJson(declaration.contract.output))(completed.output),
        (output) => prepared(200, JSON.stringify({ output, next: completed.next })),
      )),
    Match.tag('Refused', (refused) =>
      Effect.map(
        Schema.encodeUnknownEffect(Schema.toCodecJson(declaration.contract.refusals))(refused.refusal),
        (refusal) => prepared(422, JSON.stringify(refusal)),
      )),
    Match.tag('Rejected', (rejected) => Effect.succeed(prepared(400, JSON.stringify({ issue: rejected.issue })))),
    Match.tag('Accepted', (accepted) =>
      Effect.succeed(
        prepared(202, JSON.stringify({ operation: accepted.operation, next: accepted.next }), {
          location: operationLocation(accepted.operation),
        }),
      )),
    Match.exhaustive,
  )
