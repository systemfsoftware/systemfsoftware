import { it } from '@systemfsoftware/effect-gherkin-spec'
import { DecideInput } from '../restart-decision.schema.js'

it.prop('∀i_DecideInput_∈Bounds', [DecideInput], ([input]) =>
  input.failedIndex < input.totalChildren &&
  input.totalChildren >= 1 &&
  input.totalChildren <= 10 &&
  input.failedIndex >= 0)
