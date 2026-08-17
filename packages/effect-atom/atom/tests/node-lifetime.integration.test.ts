// Behaviour lane for the node-lifetime fate decision: a pure observation of a
// node's lifetime state covered as scenarios that check every generated draw,
// because the package exposes no module binding under src/ a property suite may
// colocate with (and no workflow owns the decision).
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as fc from 'effect/testing/FastCheck'
import { expect } from 'vitest'
import { decideNodeFate, type NodeLifetimeInput } from '../src/internal/node-lifetime.observer.js'

const Feature = makeFeature({ it, layer })

const arbInput: fc.Arbitrary<NodeLifetimeInput> = fc.record({
  keepAlive: fc.boolean(),
  listenerCount: fc.nat({ max: 10 }),
  childCount: fc.nat({ max: 10 }),
  isLive: fc.boolean(),
  isWaiting: fc.boolean(),
  idleTTL: fc.option(fc.nat({ max: 60_000 }), { nil: undefined }),
  defaultIdleTTL: fc.option(fc.nat({ max: 60_000 }), { nil: undefined }),
})

const arbPositiveTTL = fc.integer({ min: 1, max: 60_000 })

const eligible = (overrides: Partial<NodeLifetimeInput>): NodeLifetimeInput => ({
  keepAlive: false,
  listenerCount: 0,
  childCount: 0,
  isLive: true,
  isWaiting: false,
  idleTTL: undefined,
  defaultIdleTTL: undefined,
  ...overrides,
})

Feature('Deciding the fate of an idle node')
  .body(({ scenario }) => {
    scenario(
      'An eligible node without any idle TTL is removed right away',
      Gherkin.Do.pipe(
        Given('an otherwise eligible node with no idle TTL configured')(
          'input',
          () => Effect.sync(() => eligible({ idleTTL: undefined, defaultIdleTTL: undefined })),
        ),
        When('its fate is decided')('fate', (s) => Effect.sync(() => decideNodeFate(s.input))),
        Then('the verdict is RemoveNow')((s) => {
          expect(s.fate['_tag']).toBe('RemoveNow')
        }),
      ),
    )

    scenario(
      'Every sampled lifetime state is decided into one of the three fates',
      Gherkin.Do.pipe(
        Given('a batch of generated lifetime states')('samples', () => Effect.sync(() => fc.sample(arbInput, 8))),
        When('the fate of every sample is decided')('ok', (s) =>
          Effect.sync(() =>
            s.samples.every((input) => {
              const fate = decideNodeFate(input)
              return fate['_tag'] === 'Alive' || fate['_tag'] === 'RemoveNow' || fate['_tag'] === 'RemoveAfterTtl'
            })
          )),
        Then('every sample maps to a known fate')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'An in-flight node is kept alive no matter what else the state says',
      Gherkin.Do.pipe(
        Given('a batch of generated lifetime states')('samples', () => Effect.sync(() => fc.sample(arbInput, 8))),
        When('the fate of each waiting-marked sample is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((input) => decideNodeFate({ ...input, isWaiting: true })['_tag'] === 'Alive')
            ),
        ),
        Then('every waiting state is kept alive')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'A keep-alive flag keeps the node alive whatever else the state says',
      Gherkin.Do.pipe(
        Given('a batch of generated lifetime states')('samples', () => Effect.sync(() => fc.sample(arbInput, 8))),
        When('the fate of each keep-alive state is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((input) => decideNodeFate({ ...input, keepAlive: true })['_tag'] === 'Alive')
            ),
        ),
        Then('every keep-alive state is kept alive')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'A listener or a child keeps the node alive whatever the rest of the state says',
      Gherkin.Do.pipe(
        Given('a batch of generated lifetime states')('samples', () => Effect.sync(() => fc.sample(arbInput, 8))),
        When('the fate of each referenced state is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((input) =>
                decideNodeFate({ ...input, listenerCount: input.listenerCount + 1 })['_tag'] === 'Alive' &&
                decideNodeFate({ ...input, childCount: input.childCount + 1 })['_tag'] === 'Alive'
              )
            ),
        ),
        Then('every referenced state is kept alive')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'A node that is not live is kept alive',
      Gherkin.Do.pipe(
        Given('a batch of generated lifetime states')('samples', () => Effect.sync(() => fc.sample(arbInput, 8))),
        When('the fate of each not-live state is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((input) => decideNodeFate({ ...input, isLive: false })['_tag'] === 'Alive')
            ),
        ),
        Then('every not-live state is kept alive')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'An eligible node with a zero idle TTL is removed right away whatever the default is',
      Gherkin.Do.pipe(
        Given('generated default TTLs')(
          'samples',
          () => Effect.sync(() => fc.sample(fc.option(fc.nat({ max: 60_000 }), { nil: undefined }), 8)),
        ),
        When('the fate of each zero-TTL state is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((defaultTTL) =>
                decideNodeFate(eligible({ idleTTL: 0, defaultIdleTTL: defaultTTL }))['_tag'] === 'RemoveNow'
              )
            ),
        ),
        Then('every zero-TTL state is removed right away')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'A per-node TTL overrides the default idle TTL',
      Gherkin.Do.pipe(
        Given('pairs of per-node and default TTLs')(
          'samples',
          () => Effect.sync(() => fc.sample(fc.tuple(arbPositiveTTL, arbPositiveTTL), 8)),
        ),
        When('the fate of each pair is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([perAtom, defaultTTL]) => {
                const fate = decideNodeFate(eligible({ idleTTL: perAtom, defaultIdleTTL: defaultTTL }))
                return fate['_tag'] === 'RemoveAfterTtl' && fate.ttlMillis === perAtom
              })
            ),
        ),
        Then('the per-node TTL is used')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )

    scenario(
      'The default idle TTL is used when no per-node TTL is set',
      Gherkin.Do.pipe(
        Given('generated positive default TTLs')('samples', () => Effect.sync(() => fc.sample(arbPositiveTTL, 8))),
        When('the fate of each default-only state is checked')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((defaultTTL) => {
                const fate = decideNodeFate(eligible({ idleTTL: undefined, defaultIdleTTL: defaultTTL }))
                return fate['_tag'] === 'RemoveAfterTtl' && fate.ttlMillis === defaultTTL
              })
            ),
        ),
        Then('the default TTL is used')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
  })
