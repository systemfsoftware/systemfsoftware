import { describe, it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect'
import { isAmbiguousHeadChar, isTaskIdPrefixShape, isTaskIdShape, normalizeTaskIdInput } from '../task-id.kernel.js'
import { TaskId } from '../task.schema.js'

refutes(TaskId, {
  NotShape: fc.constantFrom('AAAAA', 'k3v8i', '1a2b3', '', 'k3v8'),
})

describe('task-id kernel — Crockford shape and normalisation', () => {
  it.prop('∀t_TaskId_=Canonical', [TaskId], ([t]) => normalizeTaskIdInput(t) === t)

  it.prop('∀t_TaskId_∈Shapes', [TaskId], ([t]) => isTaskIdShape(t))

  it.prop('∀p_Prefix_∈Shapes', [TaskId, fc.integer({ min: 1, max: 5 })], ([t, n]) => isTaskIdPrefixShape(t.slice(0, n)))

  it.prop('∀t_TaskId_⊆CleanHead', [TaskId], ([t]) => !isAmbiguousHeadChar(t.charAt(0)))

  it.prop(
    '∀s_Input_≡Idempotent',
    [fc.string({ maxLength: 32 })],
    ([s]) => normalizeTaskIdInput(normalizeTaskIdInput(s)) === normalizeTaskIdInput(s),
  )

  it.prop('∀s_Input_⊆Clean', [fc.string({ maxLength: 32 })], ([s]) => {
    const normalized = normalizeTaskIdInput(s)
    return !normalized.includes('-') &&
      !normalized.includes('I') &&
      !normalized.includes('L') &&
      !normalized.includes('O') &&
      !normalized.includes('i') &&
      !normalized.includes('l') &&
      !normalized.includes('o')
  })

  it.prop(
    '∀s_AmbiguousHead_→Digit',
    [fc.constantFrom('i3v8h', 'l3v8h', 'o3v8h', 'I3V8H')],
    ([s]) => /^[0-9]/.test(normalizeTaskIdInput(s)),
  )
})
