/**
 * The attribution contract of the conformance runtime, tested directly because
 * the reporter's verdict is derived from it: a site is credited to a check only
 * when the check's kernel executed it.
 *
 * The scenario is the one the gate has to get right under concurrency — a plain
 * test hammers site A while a conformance check explores a program that never
 * touches A. The check's run is pending across an await, so the plain test's hit
 * lands inside the check's window; only the kernel's step phase separates them.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { at, drain, during } from '../lib/conformance-runtime.js'

const CHECK = 'conformance-spec/linearizable'

const kernelThat = (stepping) => ({ isStepping: () => stepping.inside })

const checkedRun = (stepping) => async () => {
  stepping.inside = true
  at('src/b.ts:1:1', 'value', 'check step one')
  stepping.inside = false
  await Promise.resolve()
  at('src/a.ts:1:1', 'value', 'plain test hit')
  stepping.inside = true
  at('src/b.ts:1:1', 'value', 'check step two')
  stepping.inside = false
}

afterEach(() => {
  drain()
})

describe('conformance attribution', () => {
  it('credits a site only to the check whose kernel executed it', async () => {
    const stepping = { inside: false }
    await during(CHECK, kernelThat(stepping), checkedRun(stepping))
    const tallies = drain()
    expect(tallies['src/b.ts:1:1'].checks).toEqual({ [CHECK]: 2 })
    expect(tallies['src/a.ts:1:1']).toEqual({ ran: 1, checks: {} })
  })

  it('credits nothing outside a check, however often a plain test hits the site', async () => {
    at('src/a.ts:1:1', 'value', 'plain one')
    at('src/a.ts:1:1', 'value', 'plain two')
    expect(drain()['src/a.ts:1:1']).toEqual({ ran: 2, checks: {} })
  })

  it('accepts a module transformed before the kernel was handed over', async () => {
    const tallies = await during(CHECK, async () => {
      at('src/a.ts:1:1', 'value', 'stale transform hit')
    }).then(() => drain())
    expect(tallies['src/a.ts:1:1'].checks).toEqual({ [CHECK]: 1 })
  })
})
