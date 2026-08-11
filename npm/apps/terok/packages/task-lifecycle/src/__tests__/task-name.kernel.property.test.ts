import { describe, it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import * as S from 'effect/Schema'
import { isValidTaskName, isValidTaskNameShape, sanitizeTaskName, TASK_NAME_MAX_LENGTH } from '../task-name.kernel.js'
import { TaskName } from '../task.schema.js'

refutes(TaskName, {
  NotShape: fc.constantFrom('UPPER', '-leading', 'has space', '', 'x'.repeat(61)),
})

describe('task-name kernel — sanitisation and validity', () => {
  it.prop('∀s_Name_⊆Allowed', [fc.string({ maxLength: 80 })], ([s]) => !/[^a-z0-9_-]/.test(sanitizeTaskName(s)))

  it.prop('∀s_Name_≤Max', [fc.string({ maxLength: 80 })], ([s]) => sanitizeTaskName(s).length <= TASK_NAME_MAX_LENGTH)

  it.prop(
    '∀s_Name_≡Idempotent',
    [fc.string({ maxLength: 80 })],
    ([s]) => sanitizeTaskName(sanitizeTaskName(s)) === sanitizeTaskName(s),
  )

  it.prop('∀s_Name_→Shapes', [fc.string({ maxLength: 80 })], ([s]) => {
    const sanitized = sanitizeTaskName(s)
    return !isValidTaskName(sanitized) || isValidTaskNameShape(sanitized)
  })

  it.prop('∀s_Name_⊥Accepted', [fc.string({ maxLength: 80 })], ([s]) => {
    const sanitized = sanitizeTaskName(s)
    return !sanitized.startsWith('-') || Either.isLeft(S.decodeEither(TaskName)(sanitized))
  })

  it.prop('∀n_TaskName_∈Valid', [TaskName], ([n]) => isValidTaskNameShape(n))
})
