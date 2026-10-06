import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Access } from '../Contract/access.schema.js'
import { Exposure, Scope } from '../Contract/exposure.schema.js'
import { Admit, AuthorizationVerdict, Forbidden, Unauthenticated } from './authorization-verdict.schema.js'
import { Person, Principal } from './principal.schema.js'

export class AuthorizeRequest extends Schema.TaggedClass<AuthorizeRequest>()('AuthorizeRequest', {
  exposure: Exposure,
  access: Access,
  principal: Principal,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const writeScope = Option.getOrThrow(Schema.decodeOption(Scope)('write'))

const holdsEveryScope = (person: Person, required: ReadonlyArray<Scope>): boolean =>
  required.every((scope) => person.scopes.includes(scope))

const readVerdict = (exposure: Exposure, principal: Principal): AuthorizationVerdict =>
  Match.value(exposure).pipe(
    Match.tag('Public', () => new Admit()),
    Match.tag('Restricted', (restricted) =>
      Match.value(principal).pipe(
        Match.tag('Anonymous', () => new Unauthenticated()),
        Match.tag('Person', (person) =>
          Match.value(holdsEveryScope(person, restricted.scopes)).pipe(
            Match.when(true, () => new Admit()),
            Match.when(false, () => new Forbidden()),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const writeVerdict = (exposure: Exposure, principal: Principal): AuthorizationVerdict =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => new Unauthenticated()),
    Match.tag('Person', (person) =>
      Match.value(person.scopes.includes(writeScope)).pipe(
        Match.when(true, () => readVerdict(exposure, person)),
        Match.when(false, () => new Forbidden()),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const verdictOf = (exposure: Exposure, access: Access, principal: Principal): AuthorizationVerdict =>
  Match.value(access).pipe(
    Match.tag('Read', () => readVerdict(exposure, principal)),
    Match.tag('Write', () => writeVerdict(exposure, principal)),
    Match.tag('DurableWrite', () => writeVerdict(exposure, principal)),
    Match.exhaustive,
  )

export const authorizeRequest = Workflow.make({
  command: AuthorizeRequest,
  decision: AuthorizationVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<AuthorizationVerdict, never> =>
    Result.succeed(verdictOf(command.exposure, command.access, command.principal)),
})
