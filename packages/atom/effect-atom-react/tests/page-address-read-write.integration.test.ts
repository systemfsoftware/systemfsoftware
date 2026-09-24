import { expect, vi } from '@effect/vitest'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { constVoid } from 'effect/Function'
import * as Layer from 'effect/Layer'

const Feature = makeFeature({ it })

/**
 * A registry whose deferred address-bar rewrites are held back so a scenario
 * can flush them at a chosen moment.
 */
const heldBackRegistry = (heldBack: Array<() => void>): Atom.Registry.Registry =>
  Atom.Registry.make({
    scheduleTimer: (rewrite) => {
      heldBack.push(rewrite)
      return constVoid
    },
  })

const recordAddressBarWrites = () => {
  const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  return {
    writtenAddresses: () => pushState.mock.calls.map((call) => String(call[2])),
    stopRecording: () => pushState.mockRestore(),
  }
}

Feature('Remembering page choices in the address bar')
  .live('renders real components in Chromium and reads the address bar')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Two choices changed at once are written into the address bar together',
      Gherkin.Do.pipe(
        Given('a page remembering two choices in the address bar, with its rewrites held back')(
          'ctx',
          () =>
            Effect.sync(() => {
              const heldBack: Array<() => void> = []
              const recording = recordAddressBarWrites()
              const registry = heldBackRegistry(heldBack)
              return {
                heldBack,
                recording,
                registry,
                sizeChoice: Atom.searchParam('size'),
                colourChoice: Atom.searchParam('colour'),
              }
            }),
        ),
        When('both choices are changed in the same instant, then the page catches up')(
          'result',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.registry, s.ctx.sizeChoice, '1')
              Atom.Registry.set(s.ctx.registry, s.ctx.colourChoice, '2')
              for (const rewrite of s.ctx.heldBack) {
                rewrite()
              }
              const writtenAddresses = s.ctx.recording.writtenAddresses()
              s.ctx.recording.stopRecording()
              return { writtenAddresses }
            }),
        ),
        Then('the address bar is rewritten once and carries both choices')((s) => {
          expect(s.result.writtenAddresses).toHaveLength(1)
          expect(s.result.writtenAddresses[0]).toContain('size=1')
          expect(s.result.writtenAddresses[0]).toContain('colour=2')
        }),
      ),
    )
    scenario(
      'A page never writes another page pending address bar change',
      Gherkin.Do.pipe(
        Given('two pages sharing the address bar, each remembering a different value for the same choice')(
          'ctx',
          () =>
            Effect.sync(() => {
              const recording = recordAddressBarWrites()
              const firstHeldBack: Array<() => void> = []
              const secondHeldBack: Array<() => void> = []
              const firstPage = heldBackRegistry(firstHeldBack)
              const secondPage = heldBackRegistry(secondHeldBack)
              const choice = Atom.searchParam('size')
              return {
                choice,
                firstHeldBack,
                firstPage,
                recording,
                secondPage,
              }
            }),
        ),
        When('both pages record their choice in the same instant, then only the first page catches up')(
          'result',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.firstPage, s.ctx.choice, '1')
              Atom.Registry.set(s.ctx.secondPage, s.ctx.choice, '2')
              for (const rewrite of s.ctx.firstHeldBack) {
                rewrite()
              }
              const writtenAddresses = s.ctx.recording.writtenAddresses()
              s.ctx.recording.stopRecording()
              return { writtenAddresses }
            }),
        ),
        Then('the address bar carries only the choice the first page recorded itself')((s) => {
          expect(s.result.writtenAddresses).toHaveLength(1)
          expect(s.result.writtenAddresses[0]).toContain('size=1')
        }),
      ),
    )
  })
