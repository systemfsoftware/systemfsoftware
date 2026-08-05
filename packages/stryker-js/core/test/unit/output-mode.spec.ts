import * as ValidationError from '@effect/cli/ValidationError'
import { describe, expect, it } from 'vitest'

import { isProgressEnabled, resolveMode, TOOL_VARIABLES } from '../../src/output-mode.js'
import type { ModeInput } from '../../src/output-mode.js'

const ttyInput = (overrides: Partial<ModeInput> = {}): ModeInput => ({
  stdoutIsTTY: true,
  ...overrides,
})

describe('resolveMode', () => {
  it('resolves human for a TTY with no agent variables', () => {
    expect(resolveMode(ttyInput())).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('resolves machine for a non-TTY stdout regardless of detection env', () => {
    const resolved = resolveMode({
      stdoutIsTTY: false,
      agent: '1',
      toolVars: { CLAUDECODE: '1' },
    })
    expect(resolved.mode).toBe('machine')
    expect(resolved.signal).toBe('tty')
    expect(resolved.stdoutIsTTY).toBe(false)
  })

  it('lets STRYKER_MODE=human beat a non-TTY stdout', () => {
    expect(resolveMode({ stdoutIsTTY: false, envMode: 'human' })).toEqual({
      mode: 'human',
      signal: 'env',
      stdoutIsTTY: false,
    })
  })

  it('resolves machine when AGENT is set to a non-empty value on a TTY', () => {
    expect(resolveMode(ttyInput({ agent: '1' }))).toEqual({
      mode: 'machine',
      signal: 'agent',
      stdoutIsTTY: true,
    })
  })

  it('resolves human when AGENT is set but empty on a TTY', () => {
    expect(resolveMode(ttyInput({ agent: '' }))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('resolves machine when a known tool variable is set on a TTY', () => {
    expect(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } }))).toEqual({
      mode: 'machine',
      signal: 'tool',
      stdoutIsTTY: true,
    })
  })

  it('resolves human for --format text even on a pipe', () => {
    expect(resolveMode({ stdoutIsTTY: false, text: true })).toEqual({
      mode: 'human',
      signal: 'flag',
      stdoutIsTTY: false,
    })
  })

  it('resolves machine for --json even on a TTY', () => {
    expect(resolveMode(ttyInput({ json: true }))).toEqual({
      mode: 'machine',
      signal: 'flag',
      stdoutIsTTY: true,
    })
  })

  it('rejects --json combined with --format text as a ValidationError', () => {
    let thrown: unknown
    try {
      resolveMode(ttyInput({ json: true, text: true }))
    } catch (error) {
      thrown = error
    }
    expect(ValidationError.isValidationError(thrown)).toBe(true)
  })

  it('lets STRYKER_MODE=human beat a set AGENT', () => {
    expect(resolveMode(ttyInput({ envMode: 'human', agent: '1' }))).toEqual({
      mode: 'human',
      signal: 'env',
      stdoutIsTTY: true,
    })
  })

  it('lets STRYKER_MODE=machine beat a TTY', () => {
    expect(resolveMode(ttyInput({ envMode: 'machine' }))).toEqual({
      mode: 'machine',
      signal: 'env',
      stdoutIsTTY: true,
    })
  })

  it('lets an explicit flag beat STRYKER_MODE', () => {
    expect(resolveMode(ttyInput({ text: true, envMode: 'machine' }))).toEqual({
      mode: 'human',
      signal: 'flag',
      stdoutIsTTY: true,
    })
    expect(resolveMode(ttyInput({ json: true, envMode: 'human' }))).toEqual({
      mode: 'machine',
      signal: 'flag',
      stdoutIsTTY: true,
    })
  })

  it('resolves human when stdin is redirected from /dev/null on a TTY (regression — no stdin condition)', () => {
    expect(resolveMode(ttyInput())).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('treats a set-but-empty STRYKER_MODE like an unset one', () => {
    expect(resolveMode(ttyInput({ envMode: '' }))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('treats a set-but-empty tool variable like an unset one', () => {
    expect(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '' } }))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })
})

describe('TOOL_VARIABLES', () => {
  it('is exactly the narrow plan list', () => {
    expect(TOOL_VARIABLES).toEqual(['CLAUDECODE', 'CODEX_SANDBOX'])
  })
})

describe('isProgressEnabled', () => {
  it('enables the bar only in human mode on a TTY', () => {
    expect(isProgressEnabled(resolveMode(ttyInput()))).toBe(true)
    expect(isProgressEnabled(resolveMode({ stdoutIsTTY: false }))).toBe(false)
    expect(isProgressEnabled(resolveMode({ stdoutIsTTY: false, text: true }))).toBe(false)
    expect(isProgressEnabled(resolveMode(ttyInput({ agent: '1' })))).toBe(false)
  })
})
