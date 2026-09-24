/**
 * Browser scenarios for the two page-owned event sources a watched value can
 * follow: whether the page is in view, and what the page's web address says.
 *
 * These run in the browser Vitest project, so the events are real dispatches
 * on the real document and address. Every outcome is read off the values in a
 * registry through the core package alone; no event source is replaced and no
 * React hook is involved.
 *
 * @since 4.0.0
 */
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import { Effect, Layer, Option, Schema } from 'effect'

const Feature = makeFeature({ it })

let pageIsInView: DocumentVisibilityState = document.visibilityState

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => pageIsInView,
})

const showThePage = (): void => {
  pageIsInView = 'visible'
}

const hideThePage = (): void => {
  pageIsInView = 'hidden'
}

const announceThePageCameIntoView = (): void => {
  window.dispatchEvent(new Event('visibilitychange'))
}

const announceTheAddressChanged = (): void => {
  window.dispatchEvent(new Event('popstate'))
}

const visit = (search: string): void => {
  window.history.replaceState({}, '', `${window.location.pathname}${search}`)
}

const readLog = () => {
  let reads = 0
  return {
    record: (): void => {
      reads += 1
    },
    seen: (): number => reads,
    counted: (): number => {
      reads += 1
      return reads
    },
  }
}

const pages: Array<Atom.Registry.Registry> = []
const recordings: Array<() => void> = []

const openPage = (options?: Parameters<typeof Atom.Registry.make>[0]): Atom.Registry.Registry => {
  const page = Atom.Registry.make(options)
  pages.push(page)
  return page
}

/**
 * A page whose deferred address-bar rewrites wait for the scenario to flush
 * them, so batching is observed without racing the real rewrite timer.
 */
const heldBackPage = (heldBack: Array<() => void>): Atom.Registry.Registry =>
  openPage({
    scheduleTimer: (rewrite) => {
      heldBack.push(rewrite)
      return () => {
        heldBack.splice(heldBack.indexOf(rewrite), 1)
      }
    },
  })

const recordAddressBarWrites = () => {
  const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  recordings.push(() => pushState.mockRestore())
  return {
    writtenAddresses: (): ReadonlyArray<string> => pushState.mock.calls.map((call) => String(call[2])),
  }
}

/**
 * Counts `visibilitychange` registrations on `window`, where
 * `windowFocusSignal` installs its listener, so a scenario can prove the
 * listener is gone after the last watcher leaves.
 */
const watchVisibilityListeners = () => {
  const added = vi.spyOn(window, 'addEventListener')
  const removed = vi.spyOn(window, 'removeEventListener')
  recordings.push(() => {
    added.mockRestore()
    removed.mockRestore()
  })
  const visibilityChanges = <Call extends { readonly 0: string }>(calls: ReadonlyArray<Call>): number =>
    calls.filter((call) => call[0] === 'visibilitychange').length
  return {
    added: (): number => visibilityChanges(added.mock.calls),
    removed: (): number => visibilityChanges(removed.mock.calls),
  }
}

/** The query a rewritten address carries, keyed by name. */
const addressQuery = (address: string): Record<string, string> =>
  Object.fromEntries(new URL(address, window.location.href).searchParams)

const waitUntilRegistryEmpties = (registry: Atom.Registry.Registry) =>
  vi.waitFor(() => {
    const nodes = Atom.Registry.getNodes(registry).size
    if (nodes !== 0) {
      throw new Error(`the page still holds ${nodes} nodes`)
    }
  })

const clearBrowserState = (): void => {
  for (const stopRecording of recordings.splice(0)) {
    stopRecording()
  }
  for (const page of pages.splice(0)) {
    Atom.Registry.dispose(page)
  }
  document.querySelector('[data-testid="page-marker"]')?.remove()
  visit('')
}

const browserCleanupLayer = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.sync(clearBrowserState)),
)

Feature('Keeping watched values in step with the browser page')
  .live('dispatches real browser events and waits on the registry timer to sweep idle values')
  .withLayer(Layer.empty)
  .withScenarioLayer(browserCleanupLayer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A count of page visits rises only when the page is in view',
      Gherkin.Do.pipe(
        Given('a registry counting how often the page has come into view, with the page out of view')(
          'ctx',
          () =>
            Effect.sync(() => {
              hideThePage()
              const page = openPage()
              const focusCount = Atom.windowFocusSignal
              Atom.Registry.subscribe(page, focusCount, () => {})
              return { focusCount, page }
            }),
        ),
        When('the page comes into view, leaves, then comes into view again')('readings', (s) =>
          Effect.sync(() => {
            showThePage()
            announceThePageCameIntoView()
            const afterFirstVisit = Atom.Registry.get(s.ctx.page, s.ctx.focusCount)
            hideThePage()
            announceThePageCameIntoView()
            const whileAway = Atom.Registry.get(s.ctx.page, s.ctx.focusCount)
            showThePage()
            announceThePageCameIntoView()
            const afterSecondVisit = Atom.Registry.get(s.ctx.page, s.ctx.focusCount)
            return { afterFirstVisit, afterSecondVisit, whileAway }
          })),
        Then('the count rose once per visit and never while the page was away')(
          (s, expect) =>
            expect({
              afterFirstVisit: s.readings.afterFirstVisit,
              whileAway: s.readings.whileAway,
              afterSecondVisit: s.readings.afterSecondVisit,
            }).toEqual({ afterFirstVisit: 1, whileAway: 1, afterSecondVisit: 2 }),
        ),
      ),
    )

    scenario(
      'A value following page focus is reread on every return to the page',
      Gherkin.Do.pipe(
        Given('a registry holding a value that follows page focus')('ctx', () =>
          Effect.sync(() => {
            const reads = readLog()
            const followed = Atom.refreshOnWindowFocus(Atom.make(reads.counted))
            const page = openPage()
            Atom.Registry.subscribe(page, followed, () => {})
            return { followed, page, reads }
          })),
        When('the page comes into view, leaves, then comes into view again')('readings', (s) =>
          Effect.sync(() => {
            const before = s.ctx.reads.seen()
            showThePage()
            announceThePageCameIntoView()
            const afterFirstVisit = s.ctx.reads.seen()
            hideThePage()
            announceThePageCameIntoView()
            const whileAway = s.ctx.reads.seen()
            showThePage()
            announceThePageCameIntoView()
            const afterSecondVisit = s.ctx.reads.seen()
            return { afterFirstVisit, afterSecondVisit, before, whileAway }
          })),
        Then('the value was reread once per visit and never while the page was away')(
          (s, expect) =>
            expect({
              afterFirstVisit: s.readings.afterFirstVisit,
              whileAway: s.readings.whileAway,
              afterSecondVisit: s.readings.afterSecondVisit,
            }).toEqual({
              afterFirstVisit: s.readings.before + 1,
              whileAway: s.readings.before + 1,
              afterSecondVisit: s.readings.before + 2,
            }),
        ),
      ),
    )

    scenario(
      'A value following page focus stops listening once nobody watches it',
      Gherkin.Do.pipe(
        Given('a registry holding a value that follows page focus, watched by one listener')(
          'ctx',
          () =>
            Effect.sync(() => {
              const watching = watchVisibilityListeners()
              const reads = readLog()
              const followed = Atom.refreshOnWindowFocus(Atom.make(reads.counted))
              const page = openPage()
              const stopWatching = Atom.Registry.subscribe(page, followed, () => {})
              return { followed, page, reads, stopWatching, watching }
            }),
        ),
        When('the listener leaves and the page comes into view again')('observed', (s) =>
          Effect.gen(function*() {
            const readsWhileWatched = s.ctx.reads.seen()
            s.ctx.stopWatching()
            yield* Effect.promise(() => waitUntilRegistryEmpties(s.ctx.page))
            const added = s.ctx.watching.added()
            const removed = s.ctx.watching.removed()
            showThePage()
            announceThePageCameIntoView()
            return { added, readsAfterLeaving: s.ctx.reads.seen(), readsWhileWatched, removed }
          })),
        Then('the page no longer listens for visibility changes and the value stays put')(
          (s, expect) =>
            expect({
              readsWhileWatched: s.observed.readsWhileWatched,
              readsAfterLeaving: s.observed.readsAfterLeaving,
              added: s.observed.added,
              removed: s.observed.removed,
            }).toSatisfy(
              ({ readsWhileWatched, readsAfterLeaving, added, removed }) =>
                readsWhileWatched > 0 && readsAfterLeaving === readsWhileWatched && added > 0 && removed === added,
              'the page stopped listening for visibility changes and the value stayed put',
            ),
        ),
      ),
    )

    scenario(
      'A value refreshed from a custom signal changes on each signal change',
      Gherkin.Do.pipe(
        Given('a registry holding a base value refreshed from a separate custom signal')(
          'ctx',
          () =>
            Effect.sync(() => {
              const reads = readLog()
              const signal = Atom.make(0)
              const refreshed = Atom.makeRefreshOnSignal(signal)(Atom.make(reads.counted))
              const page = openPage()
              Atom.Registry.subscribe(page, refreshed, () => {})
              return { page, reads, refreshed, signal }
            }),
        ),
        When('the custom signal changes twice')('readings', (s) =>
          Effect.sync(() => {
            const before = s.ctx.reads.seen()
            Atom.Registry.set(s.ctx.page, s.ctx.signal, 1)
            const afterFirstChange = s.ctx.reads.seen()
            Atom.Registry.set(s.ctx.page, s.ctx.signal, 2)
            const afterSecondChange = s.ctx.reads.seen()
            return {
              afterFirstChange,
              afterSecondChange,
              before,
              value: Atom.Registry.get(s.ctx.page, s.ctx.refreshed),
            }
          })),
        Then('the value refreshed once per signal change')(
          (s, expect) =>
            expect({
              afterFirstChange: s.readings.afterFirstChange,
              afterSecondChange: s.readings.afterSecondChange,
              value: s.readings.value,
            }).toEqual({
              afterFirstChange: s.readings.before + 1,
              afterSecondChange: s.readings.before + 2,
              value: s.readings.before + 2,
            }),
        ),
      ),
    )

    scenario(
      'A choice written to the address bar updates the address without reloading the page',
      Gherkin.Do.pipe(
        Given('a registry tracking a choice in the address, with the address naming page 7')(
          'ctx',
          () =>
            Effect.sync(() => {
              visit('?page=7')
              const page = openPage()
              const chosenPage = Atom.searchParam('page')
              Atom.Registry.subscribe(page, chosenPage, () => {})
              const marker = document.createElement('span')
              marker.setAttribute('data-testid', 'page-marker')
              document.body.append(marker)
              return { chosenPage, marker, page }
            }),
        ),
        When('the choice is read, then set to page 8')('seen', (s) =>
          Effect.gen(function*() {
            const readFromAddress = Atom.Registry.get(s.ctx.page, s.ctx.chosenPage)
            Atom.Registry.set(s.ctx.page, s.ctx.chosenPage, '8')
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                const page = new URLSearchParams(window.location.search).get('page')
                if (page !== '8') {
                  throw new Error(`the address still names page ${page ?? 'nothing'}`)
                }
              }, { interval: 25, timeout: 5_000 })
            )
            return {
              readFromAddress,
              search: new URLSearchParams(window.location.search).get('page'),
            }
          })),
        Then('the address first named page 7, now names page 8, and the page never reloaded')((s, expect) =>
          expect({
            readFromAddress: s.seen.readFromAddress,
            search: s.seen.search,
            markerAttached: s.ctx.marker.isConnected,
          }).toEqual({ readFromAddress: '7', search: '8', markerAttached: true })
        ),
      ),
    )

    scenario(
      'Two choices written at once reach the address bar in a single update',
      Gherkin.Do.pipe(
        Given('a registry tracking a size choice and a colour choice, with address updates held back')(
          'ctx',
          () =>
            Effect.sync(() => {
              const heldBack: Array<() => void> = []
              const recording = recordAddressBarWrites()
              const page = heldBackPage(heldBack)
              const size = Atom.searchParam('size')
              const colour = Atom.searchParam('colour')
              Atom.Registry.subscribe(page, size, () => {})
              Atom.Registry.subscribe(page, colour, () => {})
              return { colour, heldBack, page, recording, size }
            }),
        ),
        When('both choices change in the same instant, then the held-back updates run')(
          'written',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.page, s.ctx.size, '1')
              Atom.Registry.set(s.ctx.page, s.ctx.colour, '2')
              for (const rewrite of s.ctx.heldBack) {
                rewrite()
              }
              return { addresses: s.ctx.recording.writtenAddresses() }
            }),
        ),
        Then('the address bar is rewritten once and names both choices')(
          (s, expect) => expect(s.written.addresses.map(addressQuery)).toEqual([{ size: '1', colour: '2' }]),
        ),
      ),
    )

    scenario(
      'An address change announced by the browser reaches the tracked choice',
      Gherkin.Do.pipe(
        Given('a registry tracking the page number in the address, naming page 1')('ctx', () =>
          Effect.sync(() => {
            visit('?page=1')
            const page = openPage()
            const chosenPage = Atom.searchParam('page')
            Atom.Registry.subscribe(page, chosenPage, () => {})
            return { chosenPage, page }
          })),
        When('the browser moves to page 2 and announces the change')('seen', (s) =>
          Effect.sync(() => {
            const before = Atom.Registry.get(s.ctx.page, s.ctx.chosenPage)
            window.history.pushState({}, '', `${window.location.pathname}?page=2`)
            announceTheAddressChanged()
            return { after: Atom.Registry.get(s.ctx.page, s.ctx.chosenPage), before }
          })),
        Then('the tracked choice follows the new address')(
          (s, expect) => expect({ before: s.seen.before, after: s.seen.after }).toEqual({ before: '1', after: '2' }),
        ),
      ),
    )

    scenarioOutline(
      'A page number written as <written> in the address reads as <read>',
      [
        { expected: Option.some(42), read: 'page 42', search: '?page=42', written: 'a number' },
        {
          expected: Option.none(),
          read: 'no page at all',
          search: '?page=not-a-number',
          written: 'not a number',
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a registry reading the page number from the address')('ctx', () =>
            Effect.sync(() => {
              visit(row.search)
              const page = openPage()
              const chosenPage = Atom.searchParam('page', { schema: Schema.FiniteFromString })
              return { chosenPage, page }
            })),
          When('the page number is read')('read', (s) =>
            Effect.sync(() => Atom.Registry.get(s.ctx.page, s.ctx.chosenPage))),
          Then('the reading matches the address')((s, expect) =>
            expect(s.read).toEqual(row.expected)
          ),
        ),
    )

    scenario(
      'A value chosen in the address with a schema survives a round trip back to the address',
      Gherkin.Do.pipe(
        Given('a registry reading a numeric page number from the address')(
          'ctx',
          () =>
            Effect.sync(() => {
              visit('?page=42')
              const heldBack: Array<() => void> = []
              const recording = recordAddressBarWrites()
              const page = heldBackPage(heldBack)
              const pageNumber = Atom.searchParam('page', { schema: Schema.FiniteFromString })
              Atom.Registry.subscribe(page, pageNumber, () => {})
              return { heldBack, page, pageNumber, recording }
            }),
        ),
        When('the page number is read back, written as a number, then the held-back update runs')(
          'written',
          (s) =>
            Effect.sync(() => {
              const readBack = Atom.Registry.get(s.ctx.page, s.ctx.pageNumber)
              Atom.Registry.set(s.ctx.page, s.ctx.pageNumber, Option.some(7))
              for (const rewrite of s.ctx.heldBack) {
                rewrite()
              }
              return { addresses: s.ctx.recording.writtenAddresses(), readBack }
            }),
        ),
        Then('the value read was the decoded number and the rewrite carries its encoding')(
          (s, expect) =>
            expect({ readBack: s.written.readBack, addresses: s.written.addresses.map(addressQuery) }).toEqual({
              readBack: Option.some(42),
              addresses: [{ page: '7' }],
            }),
        ),
      ),
    )

    scenario(
      'An address update ignores an announcement that arrives while it is being written',
      Gherkin.Do.pipe(
        Given('a registry tracking a size choice, with the address bar waiting on its held-back update')(
          'ctx',
          () =>
            Effect.sync(() => {
              visit('?size=1')
              const heldBack: Array<() => void> = []
              const recording = recordAddressBarWrites()
              const page = heldBackPage(heldBack)
              const size = Atom.searchParam('size')
              Atom.Registry.subscribe(page, size, () => {})
              Atom.Registry.set(page, size, '2')
              return { heldBack, page, recording, size }
            }),
        ),
        When('the held-back update runs while a stale announcement arrives mid-write')(
          'written',
          (s) =>
            Effect.sync(() => {
              const pushState = vi.spyOn(window.history, 'pushState')
              recordings.push(() => pushState.mockRestore())
              pushState.mockImplementationOnce(() => {
                announceTheAddressChanged()
              })
              for (const rewrite of s.ctx.heldBack) {
                rewrite()
              }
              return {
                addresses: s.ctx.recording.writtenAddresses(),
                value: Atom.Registry.get(s.ctx.page, s.ctx.size),
              }
            }),
        ),
        Then('the value written wins and the announcement changes nothing')(
          (s, expect) =>
            expect({ addresses: s.written.addresses.map(addressQuery), value: s.written.value }).toEqual({
              addresses: [{ size: '2' }],
              value: '2',
            }),
        ),
      ),
    )

    scenario(
      'A choice recorded on one page is never written by another page',
      Gherkin.Do.pipe(
        Given('two registries sharing the address bar, each remembering its own size choice')(
          'ctx',
          () =>
            Effect.sync(() => {
              visit('')
              const recording = recordAddressBarWrites()
              const firstHeldBack: Array<() => void> = []
              const secondHeldBack: Array<() => void> = []
              const firstPage = heldBackPage(firstHeldBack)
              const secondPage = heldBackPage(secondHeldBack)
              const size = Atom.searchParam('size')
              Atom.Registry.subscribe(firstPage, size, () => {})
              Atom.Registry.subscribe(secondPage, size, () => {})
              return { firstHeldBack, firstPage, recording, secondHeldBack, secondPage, size }
            }),
        ),
        When('each page records its own choice in the same instant, then each catches up in turn')(
          'written',
          (s) =>
            Effect.sync(() => {
              Atom.Registry.set(s.ctx.firstPage, s.ctx.size, '1')
              Atom.Registry.set(s.ctx.secondPage, s.ctx.size, '2')
              for (const rewrite of s.ctx.firstHeldBack) {
                rewrite()
              }
              const firstWrite = s.ctx.recording.writtenAddresses()
              for (const rewrite of s.ctx.secondHeldBack) {
                rewrite()
              }
              return { addresses: s.ctx.recording.writtenAddresses(), firstWrite }
            }),
        ),
        Then('each page wrote only its own choice, once each')(
          (s, expect) =>
            expect({
              addresses: s.written.addresses.map(addressQuery),
              firstWrite: s.written.firstWrite.map(addressQuery),
            }).toEqual({ addresses: [{ size: '1' }, { size: '2' }], firstWrite: [{ size: '1' }] }),
        ),
      ),
    )
  })
