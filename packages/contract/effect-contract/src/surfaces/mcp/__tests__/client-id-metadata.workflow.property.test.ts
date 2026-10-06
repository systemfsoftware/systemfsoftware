import { it } from '@systemfsoftware/vitest'
import { Option, Result, Schema } from 'effect'
import type { ClientIdMetadataVerdict } from '../client-id-metadata.schema.js'
import { clientIdMetadata, ClientIdMetadataRequest } from '../client-id-metadata.workflow.js'

type CaseTag = 'Accepted' | 'Pathless' | 'Mismatch' | 'Unlisted'

interface Scenario {
  readonly case: CaseTag
  readonly token: string
}

/**
 * A plain-data description of one client-id-metadata request: the URL the client
 * presents, the client_id its document names, the redirect URIs it registers,
 * and the redirect URI (if any) it asks to use. Built constructively from a
 * scenario tag, so each class the rules can refuse is generated, never left to a
 * derived arbitrary that may never reach it.
 */
interface Witness {
  readonly clientId: string
  readonly documentClientId: string
  readonly redirectUris: ReadonlyArray<string>
  readonly redirectUri: string | undefined
}

const slugOf = (token: string): string => {
  const cleaned = token.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return cleaned.length === 0 ? 'aaaa' : cleaned.slice(0, 12)
}

const pathedUrl = (owner: string, slug: string): string => `https://${owner}-${slug}/mcp`

const pathlessUrl = (slug: string): string => `https://client-${slug}`

const callbackUrl = (owner: string, slug: string): string => `https://${owner}-${slug}/callback`

const witnessOf = (scenario: Scenario): Witness => {
  const slug = slugOf(scenario.token)
  return {
    Accepted: () => ({
      clientId: pathedUrl('client', slug),
      documentClientId: pathedUrl('client', slug),
      redirectUris: [callbackUrl('client', slug)],
      redirectUri: callbackUrl('client', slug),
    }),
    Pathless: () => ({
      clientId: pathlessUrl(slug),
      documentClientId: pathlessUrl(slug),
      redirectUris: [],
      redirectUri: undefined,
    }),
    Mismatch: () => ({
      clientId: pathedUrl('client', slug),
      documentClientId: pathedUrl('document', slug),
      redirectUris: [],
      redirectUri: undefined,
    }),
    Unlisted: () => ({
      clientId: pathedUrl('client', slug),
      documentClientId: pathedUrl('client', slug),
      redirectUris: [callbackUrl('client', slug)],
      redirectUri: callbackUrl('other', slug),
    }),
  }[scenario.case]()
}

/**
 * The spec's client-id-metadata document rules, reimplemented independently of
 * the workflow: a client-id URL must carry a path; the document's client_id must
 * equal the URL; a requested redirect URI must be registered.
 */
const specVerdictTagOf = (witness: Witness): string => {
  if (witness.clientId.slice('https://'.length).includes('/') === false) return 'PathlessClientIdUrl'
  if (witness.documentClientId !== witness.clientId) return 'ClientIdUrlMismatch'
  if (witness.redirectUri !== undefined && witness.redirectUris.includes(witness.redirectUri) === false) {
    return 'RedirectUriNotListed'
  }
  return 'ClientIdMetadataAccepted'
}

const requestOf = (witness: Witness): ClientIdMetadataRequest =>
  Option.getOrThrowWith(
    Schema.decodeOption(ClientIdMetadataRequest)({
      _tag: 'ClientIdMetadataRequest',
      clientId: witness.clientId,
      document: { client_id: witness.documentClientId, redirect_uris: [...witness.redirectUris] },
      ...(witness.redirectUri === undefined ? {} : { redirectUri: witness.redirectUri }),
    }),
    () => new Error(`the generated witness for ${witness.clientId} did not decode as a client-id-metadata request`),
  )

const tagOf = (decided: Result.Result<ClientIdMetadataVerdict, never>): string => Result.getOrThrow(decided)._tag

const scenarioCases = ['Accepted', 'Pathless', 'Mismatch', 'Unlisted'] as const

const scenarioGen = (): Schema.Struct<
  { readonly case: Schema.Literals<typeof scenarioCases>; readonly token: Schema.String }
> => Schema.Struct({ case: Schema.Literals(scenarioCases), token: Schema.String })

it.prop(
  '∀x_ClientIdMetadataUrl_≡ClientIdentifierUrlDocumentRules',
  { of: [scenarioGen()], subject: clientIdMetadata },
  (decide, [scenario]) => {
    const witness = witnessOf(scenario)
    return tagOf(decide(requestOf(witness))) === specVerdictTagOf(witness)
  },
)

it.prop(
  '∀x_ClientIdMetadataDocument_≡ClientIdentifierUrlDocumentRules',
  { of: [scenarioGen()], subject: clientIdMetadata },
  (decide, [scenario]) => {
    const witness = witnessOf(scenario)
    const fromDocument: Witness = { ...witness, clientId: witness.documentClientId }
    return tagOf(decide(requestOf(fromDocument))) === specVerdictTagOf(fromDocument)
  },
)
