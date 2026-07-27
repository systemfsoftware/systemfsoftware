import { it } from '@systemfsoftware/effect-gherkin-spec'
import { FastCheck as fc } from 'effect'
import { failedIndexOf } from '../supervise-index.js'

it.prop(
  '∀ab_FailedIndex_=Sum',
  [fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 })],
  ([startIdx, failedOffset]) => failedIndexOf(startIdx, failedOffset) === startIdx + failedOffset,
)
