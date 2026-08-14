import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect } from 'effect'
import { expect } from 'vitest'
import * as AtomRef from '../src/AtomRef.js'

const Feature = makeFeature({ it, layer })

Feature('Keeping a piece of shared local state in sync across several parts of the page')
  .body(({ scenario }) => {
    scenario(
      'A derived read-only value only notifies when its own computed value actually changes',
      Gherkin.Do.pipe(
        Given('shared state with a derived value showing whether it is over a threshold')(
          'ctx',
          () =>
            Effect.sync(() => {
              const count = AtomRef.make(0)
              const isOverFive = count.map((n) => n > 5)
              const notifications: Array<boolean> = []
              const cancel = isOverFive.subscribe((v) => notifications.push(v))
              return { count, notifications, cancel }
            }),
        ),
        When('the count changes several times without crossing the threshold, then crosses it')(
          'ctx',
          (s) =>
            Effect.sync(() => {
              s.ctx.count.set(1)
              s.ctx.count.set(2)
              s.ctx.count.set(3)
              s.ctx.count.set(6)
              s.ctx.cancel()
              return s.ctx
            }),
        ),
        Then('the derived value only reports the one real change')((s) => {
          expect(s.ctx.notifications).toEqual([true])
        }),
      ),
    )

    scenario(
      'Editing one item in a list of shared items does not affect the others',
      Gherkin.Do.pipe(
        Given('a list of three shared items, with a view into the middle one')('ctx', () =>
          Effect.sync(() => {
            const list = AtomRef.make([10, 20, 30])
            const middleItem = list.prop(1)
            return { list, middleItem }
          })),
        When('the middle item is set to a new value')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.middleItem.set(99)
            return s.ctx
          })),
        Then('only the middle item changed, its neighbours are untouched')((s) => {
          expect(s.ctx.list.value).toEqual([10, 99, 30])
        }),
      ),
    )

    scenario(
      'Removing an item from a shared collection stops it from affecting the collection, and the remaining items are unchanged',
      Gherkin.Do.pipe(
        Given('a shared collection of three items, being watched by a listener')('ctx', () =>
          Effect.sync(() => {
            const items = AtomRef.collection([1, 2, 3])
            let notifications = 0
            const cancel = items.subscribe(() => {
              notifications++
            })
            return { items, getNotifications: () => notifications, cancel }
          })),
        When('the middle item is removed, then the removed item is changed on its own')(
          'result',
          (s) =>
            Effect.sync(() => {
              const removed = s.ctx.items.value[1]!
              s.ctx.items.remove(removed)
              const afterRemoveNotifications = s.ctx.getNotifications()
              removed.set(999)
              const afterStaleEditNotifications = s.ctx.getNotifications()
              s.ctx.cancel()
              return { afterRemoveNotifications, afterStaleEditNotifications, remaining: s.ctx.items.toArray() }
            }),
        ),
        Then('the collection reflects the removal, and editing the removed item no longer notifies the collection')(
          (s) => {
            expect(s.result.remaining).toEqual([1, 3])
            expect(s.result.afterStaleEditNotifications).toBe(s.result.afterRemoveNotifications)
          },
        ),
      ),
    )

    scenario(
      'A listener that leaves the middle of the chain stops hearing, while the others keep hearing',
      Gherkin.Do.pipe(
        Given('a shared value being watched by three listeners')('ctx', () =>
          Effect.sync(() => {
            const value = AtomRef.make(0)
            const first: Array<number> = []
            const second: Array<number> = []
            const third: Array<number> = []
            value.subscribe((v) => first.push(v))
            const cancelSecond = value.subscribe((v) => second.push(v))
            value.subscribe((v) => third.push(v))
            return { value, first, second, third, cancelSecond }
          })),
        When('the middle listener leaves and the value changes')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.cancelSecond()
            s.ctx.value.set(1)
            return s.ctx
          })),
        Then('the departed listener heard nothing while the others heard the change')((s) => {
          expect(s.ctx.first).toEqual([1])
          expect(s.ctx.second).toEqual([])
          expect(s.ctx.third).toEqual([1])
        }),
      ),
    )

    scenario(
      'A view into a key that only appears later stays quiet until the key exists',
      Gherkin.Do.pipe(
        Given('a shared record with no name yet, and a view into its name')('ctx', () =>
          Effect.sync(() => {
            const record = AtomRef.make<{ name?: string; other?: string }>({ other: 'o' })
            const name = record.prop('name')
            const heard: Array<string | undefined> = []
            name.subscribe((v) => heard.push(v))
            return { record, heard }
          })),
        When('an unrelated key changes, then the name appears')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.record.set({ other: 'changed' })
            s.ctx.record.set({ other: 'changed', name: 'arrived' })
            return s.ctx
          })),
        Then('the view stayed quiet until the name existed, then reported it')((s) => {
          expect(s.ctx.heard).toEqual(['arrived'])
        }),
      ),
    )

    scenario(
      'Updating one item in a list with a function changes just that item',
      Gherkin.Do.pipe(
        Given('a list of three shared items, with a view into the middle one')('ctx', () =>
          Effect.sync(() => {
            const list = AtomRef.make([10, 20, 30])
            const middleItem = list.prop(1)
            return { list, middleItem }
          })),
        When('the middle item is updated by adding one')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.middleItem.update((n) => n + 1)
            return s.ctx
          })),
        Then('only the middle item changed, its neighbours are untouched')((s) => {
          expect(s.ctx.list.value).toEqual([10, 21, 30])
        }),
      ),
    )

    scenario(
      'Removing an item that is not in the collection leaves the collection untouched',
      Gherkin.Do.pipe(
        Given('a shared collection, being watched by a listener')('ctx', () =>
          Effect.sync(() => {
            const items = AtomRef.collection([1, 2, 3])
            const stranger = AtomRef.collection([9]).value[0]!
            let notifications = 0
            const cancel = items.subscribe(() => {
              notifications++
            })
            return { items, stranger, getNotifications: () => notifications, cancel }
          })),
        When('an item that belongs to another collection is removed from this one')('result', (s) =>
          Effect.sync(() => {
            s.ctx.items.remove(s.ctx.stranger)
            const result = { remaining: s.ctx.items.toArray(), notifications: s.ctx.getNotifications() }
            s.ctx.cancel()
            return result
          })),
        Then('the collection is unchanged and its listener heard nothing')((s) => {
          expect(s.result.remaining).toEqual([1, 2, 3])
          expect(s.result.notifications).toBe(0)
        }),
      ),
    )

    scenario(
      'Updating one field of a shared record with a function changes just that field',
      Gherkin.Do.pipe(
        Given('a shared record with a view into one of its fields')('ctx', () =>
          Effect.sync(() => {
            const record = AtomRef.make({ name: 'ada', other: 'x' })
            const name = record.prop('name')
            return { record, name }
          })),
        When('that field is updated by turning it uppercase')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.name.update((n) => n.toUpperCase())
            return s.ctx
          })),
        Then('only that field changed, its neighbour is untouched')((s) => {
          expect(s.ctx.record.value).toEqual({ name: 'ADA', other: 'x' })
        }),
      ),
    )

    scenario(
      'A nested view into an item of a shared collection keeps the collection in sync while the item changes, and goes quiet once the item is removed',
      Gherkin.Do.pipe(
        Given('a shared collection of object items, with nested views into the first one, being watched by a listener')(
          'ctx',
          () =>
            Effect.sync(() => {
              const items = AtomRef.collection([
                { name: 'ada', address: { city: 'london' } },
                { name: 'grace', address: { city: 'paris' } },
              ])
              const firstName = items.value[0]!.prop('name')
              const city = items.value[0]!.prop('address').prop('city')
              let notifications = 0
              const cancel = items.subscribe(() => {
                notifications++
              })
              return { items, firstName, city, getNotifications: () => notifications, cancel }
            }),
        ),
        When('the nested views change the first item, then that item is removed and changed again')(
          'result',
          (s) =>
            Effect.sync(() => {
              s.ctx.firstName.set('bob')
              const afterFieldSet = { notifications: s.ctx.getNotifications(), city: s.ctx.city.value }
              s.ctx.city.update((c) => c.toUpperCase())
              const afterNestedUpdate = { notifications: s.ctx.getNotifications(), items: s.ctx.items.toArray() }
              const removed = s.ctx.items.value[0]!
              s.ctx.items.remove(removed)
              removed.prop('name').set('zed')
              const afterRemoval = { notifications: s.ctx.getNotifications(), items: s.ctx.items.toArray() }
              s.ctx.cancel()
              return { afterFieldSet, afterNestedUpdate, afterRemoval }
            }),
        ),
        Then(
          'the collection heard each change while the item was present, the nested views stayed in sync, and silence returned after the removal',
        )((s) => {
          expect(s.result.afterFieldSet.notifications).toBe(1)
          expect(s.result.afterFieldSet.city).toBe('london')
          expect(s.result.afterNestedUpdate.notifications).toBe(2)
          expect(s.result.afterNestedUpdate.items).toEqual([
            { name: 'bob', address: { city: 'LONDON' } },
            { name: 'grace', address: { city: 'paris' } },
          ])
          expect(s.result.afterRemoval.notifications).toBe(3)
          expect(s.result.afterRemoval.items).toEqual([{ name: 'grace', address: { city: 'paris' } }])
        }),
      ),
    )

    scenario(
      'Setting a shared value to what it already holds leaves its listeners quiet',
      Gherkin.Do.pipe(
        Given('a shared value being watched by a listener')('ctx', () =>
          Effect.sync(() => {
            const value = AtomRef.make(5)
            const heard: Array<number> = []
            value.subscribe((v) => heard.push(v))
            return { value, heard }
          })),
        When('the value is set to the number it already holds, then set to a different number')(
          'result',
          (s) =>
            Effect.sync(() => {
              const sameRef = s.ctx.value.set(5)
              s.ctx.value.set(6)
              return { heard: s.ctx.heard, sameRef, value: s.ctx.value }
            }),
        ),
        Then('the listener only heard the real change, and setting the same value handed back the same reference')(
          (s) => {
            expect(s.result.heard).toEqual([6])
            expect(s.result.sameRef).toBe(s.result.value)
          },
        ),
      ),
    )

    scenario(
      'A view into a field that appears later reflects the field once it exists, and keeps following it',
      Gherkin.Do.pipe(
        Given('a shared record that has no name yet, with a view into its name')('ctx', () =>
          Effect.sync(() => {
            const record = AtomRef.make<{ name?: string; other?: string }>({ other: 'x' })
            const name = record.prop('name')
            const heard: Array<string | undefined> = []
            name.subscribe((v) => heard.push(v))
            return { record, name, heard }
          })),
        When('the record is updated to add the name, then the name is read and changed')(
          'result',
          (s) =>
            Effect.sync(() => {
              s.ctx.record.update((r) => ({ ...r, name: 'ada' }))
              const afterAppearing = s.ctx.name.value
              s.ctx.record.update((r) => ({ ...r, name: 'bob' }))
              return { heard: s.ctx.heard, afterAppearing, current: s.ctx.name.value }
            }),
        ),
        Then('the view reported the name when it appeared and always reads the current name')((s) => {
          expect(s.result.heard).toEqual(['ada', 'bob'])
          expect(s.result.afterAppearing).toBe('ada')
          expect(s.result.current).toBe('bob')
        }),
      ),
    )

    scenario(
      'A view into one field of a shared record stays quiet while other fields change around it',
      Gherkin.Do.pipe(
        Given('a shared record with several fields, being watched through a view into one of them')(
          'ctx',
          () =>
            Effect.sync(() => {
              const record = AtomRef.make({ name: 'ada', other: 'x' })
              const name = record.prop('name')
              const heard: Array<string> = []
              name.subscribe((v) => heard.push(v))
              return { record, name, heard }
            }),
        ),
        When('the record changes without touching the watched field, then changes the watched field')(
          'result',
          (s) =>
            Effect.sync(() => {
              s.ctx.record.set({ name: 'ada', other: 'y' })
              const afterUnrelatedChange = [...s.ctx.heard]
              s.ctx.record.set({ name: 'bob', other: 'y' })
              return { afterUnrelatedChange, heard: s.ctx.heard }
            }),
        ),
        Then('the view stayed quiet for the unrelated change and only reported the watched field changing')((s) => {
          expect(s.result.afterUnrelatedChange).toEqual([])
          expect(s.result.heard).toEqual(['bob'])
        }),
      ),
    )
  })
