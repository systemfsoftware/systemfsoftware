import * as Data from 'effect/Data'
import type { ReadonlyRecord } from 'effect/Record'

export const wrapReactivityKeys = (
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
) => {
  if (Array.isArray(keys)) {
    return Data.array(keys)
  }
  const obj: Record<string, ReadonlyArray<unknown>> = Object.create(Data.Structural.prototype)
  for (const [key, val] of Object.entries(keys)) {
    if (Array.isArray(val)) {
      obj[key] = Data.array(val)
    }
  }
  return obj
}
