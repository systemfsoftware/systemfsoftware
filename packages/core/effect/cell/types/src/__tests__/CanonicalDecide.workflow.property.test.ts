import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { CanonicalDecideError } from '../CanonicalDecide.schema.js'
import { CanonicalCommand, canonicalDecide } from '../CanonicalDecide.workflow.js'

describe('canonicalDecide', () => {
  // The law is that the decider is constant: for any command it yields success
  // carrying `undefined`. Deciding only `isSuccess` would leave the returned
  // value unread, so the name would outrun the predicate.
  //
  // The command is a schema, so the schema is the arbitrary rather than a
  // hand-built record. Its domain is a single member — the canonical command
  // carries no fields — and that member is the whole domain, not a sample of it.
  it.prop(
    '∀c_AnyCommand_≡SucceedUndefined',
    [S.toArbitrary(CanonicalCommand)(fc)],
    ([command]) =>
      Result.match(canonicalDecide(command), {
        onFailure: () => false,
        onSuccess: (value) => value === undefined,
      }),
  )

  // The make carries the uninhabited CanonicalDecideError on its error channel and
  // the command class on its command channel. Asserted by assignment — the brand
  // conjunct has to be satisfied, never cast into place — so widening either
  // channel is a compile error in a file the type gate reads.
  const _phantomCheck: (
    command: CanonicalCommand,
  ) => Result.Result<undefined, CanonicalDecideError> = canonicalDecide
})
