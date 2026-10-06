import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Boolean as Bool, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  ClientIdMetadata,
  ClientIdMetadataAccepted,
  ClientIdMetadataVerdict,
  ClientIdUrl,
  ClientIdUrlMismatch,
  PathlessClientIdUrl,
  RedirectUriNotListed,
} from './client-id-metadata.schema.js'

export class ClientIdMetadataRequest extends Schema.TaggedClass<ClientIdMetadataRequest>()(
  'ClientIdMetadataRequest',
  {
    clientId: ClientIdUrl,
    document: ClientIdMetadata,
    redirectUri: Schema.optional(Schema.String),
  },
) {
  static readonly [Workflow.InstrumentationBrand] = { clientId: 'mcp.client_id' } as const
}

type Refusal = 'PathlessClientIdUrl' | 'ClientIdUrlMismatch' | 'RedirectUriNotListed' | 'None'

const firstDelimiter = (clientId: string): Option.Option<string> =>
  Arr.findFirst(
    Array.from(clientId.slice('https://'.length)),
    (char) => Bool.some([char === '/', char === '?', char === '#']),
  )

const pathless = (command: ClientIdMetadataRequest): boolean =>
  Option.match(firstDelimiter(command.clientId), {
    onNone: () => true,
    onSome: (delimiter) => delimiter !== '/',
  })

const mismatched = (command: ClientIdMetadataRequest): boolean => command.document.client_id !== command.clientId

const redirectNotListed = (command: ClientIdMetadataRequest): boolean =>
  Option.match(Option.fromUndefinedOr(command.redirectUri), {
    onNone: () => false,
    onSome: (redirectUri) => !command.document.redirect_uris.includes(redirectUri),
  })

const refusalOf = (command: ClientIdMetadataRequest): Refusal =>
  Match.value({
    pathless: pathless(command),
    mismatched: mismatched(command),
    redirect: redirectNotListed(command),
  }).pipe(
    Match.when({ pathless: true }, (): Refusal => 'PathlessClientIdUrl'),
    Match.when({ mismatched: true }, (): Refusal => 'ClientIdUrlMismatch'),
    Match.when({ redirect: true }, (): Refusal => 'RedirectUriNotListed'),
    Match.orElse((): Refusal => 'None'),
  )

const verdictOf = (command: ClientIdMetadataRequest): ClientIdMetadataVerdict =>
  Match.value({ refusal: refusalOf(command) }).pipe(
    Match.when({ refusal: 'PathlessClientIdUrl' }, () => new PathlessClientIdUrl({})),
    Match.when({ refusal: 'ClientIdUrlMismatch' }, () => new ClientIdUrlMismatch({})),
    Match.when({ refusal: 'RedirectUriNotListed' }, () => new RedirectUriNotListed({})),
    Match.orElse(() => new ClientIdMetadataAccepted({})),
  )

export const clientIdMetadata = Workflow.make({
  command: ClientIdMetadataRequest,
  decision: ClientIdMetadataVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<ClientIdMetadataVerdict, never> => Result.succeed(verdictOf(command)),
})
