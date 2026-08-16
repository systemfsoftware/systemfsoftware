/**
 * Reuse-adopt workflow properties (R14): the gate order (opt-in before
 * compat, network before checkpoint) and the registry state table — over
 * generated facts.
 *
 * Predicates are pure booleans — no `expect` inside a property.
 */
import { it } from '@effect/vitest'
import { Result, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

import { ContainerSpec } from '../../model/container-spec.js'
import { decideReuseAdopt } from '../adopt.workflow.js'
import type { RegistryReadResult } from '../registry.js'

const registryArb: fc.Arbitrary<RegistryReadResult> = fc.oneof(
  fc.constant<RegistryReadResult>({ kind: 'missing' }),
  fc.constant<RegistryReadResult>({ kind: 'corrupt' }),
  fc.constant<RegistryReadResult>({
    kind: 'found',
    entry: {
      name: 'found-entry',
      image: 'redis:8.6-alpine',
      ports: { '6379/tcp': 6379 },
      createdIso: '2026-08-16T00:00:00.000Z',
      backend: 'docker',
    },
  }),
)

const factsArb = fc.record({
  spec: S.toArbitrary(ContainerSpec)(fc),
  reuseOptIn: fc.boolean(),
  networkId: fc.option(fc.string(), { nil: undefined }),
  checkpointRef: fc.option(fc.string(), { nil: undefined }),
  registry: registryArb,
  running: fc.boolean(),
  name: fc.string({ minLength: 1 }),
  cacheDir: fc.string({ minLength: 1 }),
  hash: fc.string({ minLength: 1, maxLength: 16 }),
})

it.prop('∀facts_NoOptIn_→Ignored', [factsArb], ([facts]) => {
  if (facts.reuseOptIn) {
    return true
  }
  const outcome = decideReuseAdopt({
    _tag: 'DecideReuseAdopt',
    ...facts,
    registry: undefined,
    running: undefined,
  })
  return Result.isSuccess(outcome) && outcome.success._tag === 'Ignored'
})

it.prop('∀facts_OptInWithNetwork_→ReuseWithNetworkError', [factsArb], ([facts]) => {
  if (!facts.reuseOptIn || facts.networkId === undefined) {
    return true
  }
  const outcome = decideReuseAdopt({
    _tag: 'DecideReuseAdopt',
    ...facts,
    registry: undefined,
    running: undefined,
  })
  return Result.isFailure(outcome) && outcome.failure._tag === 'ReuseWithNetworkError'
})

it.prop('∀facts_OptInWithCheckpoint_→ReuseFromCheckpointError', [factsArb], ([facts]) => {
  if (!facts.reuseOptIn || facts.networkId !== undefined || facts.checkpointRef === undefined) {
    return true
  }
  const outcome = decideReuseAdopt({
    _tag: 'DecideReuseAdopt',
    ...facts,
    registry: undefined,
    running: undefined,
  })
  return Result.isFailure(outcome) && outcome.failure._tag === 'ReuseFromCheckpointError'
})

it.prop('∀facts_RegistryTable_→TableDecision', [factsArb], ([facts]) => {
  if (!facts.reuseOptIn || facts.networkId !== undefined || facts.checkpointRef !== undefined) {
    return true
  }
  const outcome = decideReuseAdopt({
    _tag: 'DecideReuseAdopt',
    ...facts,
    running: facts.running ? { id: 'rz-running', spec: facts.spec } : undefined,
  })
  if (!Result.isSuccess(outcome)) {
    return false
  }
  const decision = outcome.success
  // The state table, written here independently of the kernel:
  // found + running → Adopt; found/corrupt without both → Cleanup(both);
  // missing + not running → Fresh; missing + running → Cleanup(removeByName only).
  if (facts.registry.kind === 'found' && facts.running) {
    return decision._tag === 'Adopt'
  }
  if (facts.registry.kind === 'found' || facts.registry.kind === 'corrupt') {
    return decision._tag === 'Cleanup' && decision.removeByName && decision.removeRegistry
  }
  if (facts.running) {
    return decision._tag === 'Cleanup' && decision.removeByName && !decision.removeRegistry
  }
  return decision._tag === 'Fresh'
})
