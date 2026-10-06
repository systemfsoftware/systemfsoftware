import { it } from '@systemfsoftware/vitest'
import { Match, Option, Result, Schema } from 'effect'
import { Access } from '../../Contract/access.schema.js'
import { Exposure, Scope } from '../../Contract/exposure.schema.js'
import { type AuthorizationVerdict } from '../authorization-verdict.schema.js'
import { AuthorizeRequest, authorizeRequest } from '../authorize-request.workflow.js'
import { Person, Principal } from '../principal.schema.js'

type VerdictTag = AuthorizationVerdict['_tag']

/**
 * The oracle is a predicate written from KTD6's table, not derived from the workflow: a write
 * needs the `write` scope, a `Restricted` exposure needs every scope it names, and an anonymous
 * caller can satisfy neither requirement.
 */
const write = Option.getOrThrow(Schema.decodeOption(Scope)('write'))

const isWriteAccess = (access: Access): boolean =>
  Match.value(access).pipe(
    Match.tag('Read', () => false),
    Match.tag('Write', () => true),
    Match.tag('DurableWrite', () => true),
    Match.exhaustive,
  )

const exposureScopes = (exposure: Exposure): ReadonlyArray<Scope> =>
  Match.value(exposure).pipe(
    Match.tag('Public', () => []),
    Match.tag('Restricted', (restricted) => restricted.scopes),
    Match.exhaustive,
  )

const isRestricted = (exposure: Exposure): boolean =>
  Match.value(exposure).pipe(
    Match.tag('Public', () => false),
    Match.tag('Restricted', () => true),
    Match.exhaustive,
  )

const holds = (person: Person, scopes: ReadonlyArray<Scope>): boolean =>
  scopes.every((scope) => person.scopes.includes(scope))

const oracleVerdict = (exposure: Exposure, access: Access, principal: Principal): VerdictTag =>
  Match.value(principal).pipe(
    Match.tag(
      'Anonymous',
      (): VerdictTag => isWriteAccess(access) || isRestricted(exposure) ? 'Unauthenticated' : 'Admit',
    ),
    Match.tag('Person', (person): VerdictTag => {
      const required = isWriteAccess(access) ? [write, ...exposureScopes(exposure)] : exposureScopes(exposure)
      return holds(person, required) ? 'Admit' : 'Forbidden'
    }),
    Match.exhaustive,
  )

const decidedTag = (verdict: AuthorizationVerdict): VerdictTag =>
  Match.value(verdict).pipe(
    Match.tag('Admit', (): VerdictTag => 'Admit'),
    Match.tag('Unauthenticated', (): VerdictTag => 'Unauthenticated'),
    Match.tag('Forbidden', (): VerdictTag => 'Forbidden'),
    Match.exhaustive,
  )

it.prop(
  '∀x_AuthorizeRequest_≡ExposureAccessPrincipalTable',
  { of: [Exposure, Access, Principal], subject: authorizeRequest },
  (authorize, [exposure, access, principal]) =>
    decidedTag(Result.getOrThrow(authorize(new AuthorizeRequest({ exposure, access, principal })))) ===
      oracleVerdict(exposure, access, principal),
)
