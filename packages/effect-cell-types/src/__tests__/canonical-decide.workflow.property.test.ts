import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'

import { canonicalDecide } from '../canonical-decide.workflow.js'
import * as Workflow from '../Workflow.js'

describe('canonicalDecide', () => {
  it.prop('∀d_AnyInput_≡SucceedUndefined', [fc.anything()], ([input]) => {
    const r = canonicalDecide(input)
    return Result.isSuccess(r)
  })

  // The make carries the Workflow.Tagged phantom on its error channel.
  // Assert by assignment (the brand conjunct), never by `as`.
  const _phantomCheck: (
    decoded: unknown,
  ) => Result.Result<undefined, Workflow.Tagged> = canonicalDecide
})
