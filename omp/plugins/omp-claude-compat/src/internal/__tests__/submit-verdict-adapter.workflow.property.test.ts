import { describe, it } from '@effect/vitest'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { InterpretHookCommand } from '../../hook-verdict.workflow.js'
import { submitVerdictAdapter } from '../submit-verdict-adapter.workflow.js'

describe('submitVerdictAdapter', () => {
  it.prop('∀cs_SubmitVerdictAdapter_≡Context', [fc.integer(), fc.string()], ([code, stdout]) => {
    const cmd = new InterpretHookCommand({ result: { code: 0, stdout: '', stderr: '' }, event: 'UserPromptSubmit' })
    const result = submitVerdictAdapter({ cmd, code, stdout })
    return Result.match(result, {
      onFailure: (error) => error.code === code && error.stdout === stdout,
      onSuccess: (outcome) => outcome.code === code && outcome.stdout === stdout,
    })
  })
})
