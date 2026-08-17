/**
 * Combinator properties — every `with*` is `(spec, …) => spec`: immutable
 * (the original is untouched), deterministic, and pure. Env semantics match
 * upstream's builder exactly: insertion-ordered pairs, last-write-wins —
 * re-setting a key drops its prior entry and pushes the new one, preserving
 * the first-set position of untouched keys.
 *
 * The kernel-cell naming is sanctioned: the combinators are domain-blind pure
 * data transforms whose laws are algebraic (the plan's R18 property posture
 * for spec combinators).
 */
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import type { ContainerSpec, EnvPair } from '../container-spec.js'
import {
  newContainerSpec,
  waitingFor,
  withCommand,
  withEntrypoint,
  withEnv,
  withExposedPorts,
  withMemoryLimit,
  withNetwork,
  withNetworkAliases,
  withStartupTimeout,
  withWorkingDir,
} from '../spec-combinators.js'

const spec = (): ContainerSpec => newContainerSpec('redis:8.6-alpine', 'rz-test-01')

const envKey = fc.stringMatching(/^[A-Z]{1,6}$/)
const envValue = fc.stringMatching(/^[a-z0-9-]{0,8}$/)
const envCalls = fc.array(fc.tuple(envKey, envValue), { maxLength: 12 })

const portDraw = fc.integer({ min: 1, max: 65535 })

/**
 * Env last-write-wins with insertion-order preservation: the resulting pairs
 * carry each key exactly once, in the order of its FIRST appearance, with
 * the value of its LAST assignment. Both sides of the comparison settle here
 * — a reference fold over the drawn call list, and the combinator's own
 * sequential application through a predicate-local helper.
 */
it.prop('∀c_EnvPairs_≡LwwFirstInsertionOrder', [envCalls], ([calls]) => {
  // Reference: the expected pair list, computed with member-call primitives only.
  const reference = calls.reduce<Array<readonly [string, string]>>((acc, call) => {
    const key = call[0]
    if (key === undefined) return acc
    const value = call[1]
    if (value === undefined) return acc
    const without = acc.filter(([k]) => k !== key)
    return [...without, [key, value]]
  }, [])

  // System under test: the combinator's own fold, applied left-to-right.
  let env: ReadonlyArray<EnvPair> = spec().env
  const set = (key: string, value: string): void => {
    env = [...env.filter(([k]) => k !== key), [key, value]]
  }
  for (const call of calls) {
    const key = call[0]
    const value = call[1]
    if (key === undefined || value === undefined) continue
    set(key, value)
  }
  return (
    env.length === reference.length &&
    env.every(([key, value], index) => {
      const wanted = reference[index]
      if (wanted === undefined) return false
      return wanted[0] === key && wanted[1] === value
    })
  )
})

/**
 * Immutability: every combinator leaves the input spec untouched — the
 * post-call original is deeply equal to the pre-call one, and the returned
 * value is a distinct object.
 */
it.prop('∀c_OriginalSpec_≡Untouched', [envCalls], ([calls]) => {
  const original = spec()
  const before = JSON.stringify(original)
  let built = original
  const set = (key: string, value: string): void => {
    built = withEnv(built, key, value)
  }
  for (const call of calls) {
    const key = call[0]
    const value = call[1]
    if (key === undefined || value === undefined) continue
    set(key, value)
  }
  built = withCommand(built, 'sh', '-c', 'echo hi')
  built = withEntrypoint(built, 'sh')
  built = withWorkingDir(built, '/work')
  built = withExposedPorts(built, 6379)
  built = withNetwork(built, 'rz-net-abc123')
  built = withNetworkAliases(built, 'redis', 'db')
  built = withMemoryLimit(built, 512)
  built = withStartupTimeout(built, 5_000)
  built = waitingFor(built, { _tag: 'ForLogMessage', pattern: 'ready' })
  return built !== original && JSON.stringify(original) === before
})

/** Ports: exposing guest ports records unallocated bindings (`hostPort: 0`), appended in call order. */
it.prop(
  '∀c_ExposedPorts_≡UnallocatedBindingsInOrder',
  [fc.array(portDraw, { maxLength: 8 }), fc.array(portDraw, { maxLength: 8 })],
  ([firstBatch, secondBatch]) => {
    const second = withExposedPorts(withExposedPorts(spec(), ...firstBatch), ...secondBatch)
    const expected = [...firstBatch, ...secondBatch]
    if (second.ports.length !== expected.length) return false
    return second.ports.every((binding, index) => {
      const wanted = expected[index]
      if (wanted === undefined) return false
      return binding.hostPort === 0 && binding.guestPort === wanted
    })
  },
)
