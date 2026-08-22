import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'

import { CanonicalDecideError } from '../CanonicalDecide.schema.js'
import { canonicalDecide } from '../CanonicalDecide.workflow.js'

describe('canonicalDecide', () => {
  // The law is that the decider is constant: for *any* decoded input it yields
  // success carrying `undefined`. Deciding only `isSuccess` would leave the
  // returned value unread, so the name would outrun the predicate.
  it.prop('∀d_AnyInput_≡SucceedUndefined', [fc.anything()], ([input]) =>
    Result.match(canonicalDecide(input), {
      onFailure: () => false,
      onSuccess: (value) => value === undefined,
    }))

  // The make carries the uninhabited CanonicalDecideError on its error channel.
  // Assert by assignment (the brand conjunct), never by `as`.
  const _phantomCheck: (
    decoded: unknown,
  ) => Result.Result<undefined, CanonicalDecideError> = canonicalDecide
})
