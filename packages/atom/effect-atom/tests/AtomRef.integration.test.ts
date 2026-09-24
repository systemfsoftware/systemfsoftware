import { AtomRef } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Equal, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

interface RefBundle {
  readonly value: AtomRef.AtomRef<number>
  readonly record: AtomRef.AtomRef<{ readonly name: string; readonly other: string }>
  readonly items: AtomRef.Collection<number>
}

interface Call {
  readonly direct: PairValue
  readonly piped: PairValue
}

type PairValue =
  | number
  | string
  | ReadonlyArray<number>
  | ReadonlyArray<ReadonlyArray<number>>

interface RefCall {
  readonly operation: string
  readonly attempt: (refs: RefBundle) => Call
}

Feature('Keeping a piece of shared local state in sync across several parts of the page')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A derived read-only value only notifies when its own computed value actually changes',
      Gherkin.Do.pipe(
        Given('shared state with a derived value showing whether it is over a threshold')(
          'ctx',
          () =>
            Effect.sync(() => {
              const count = AtomRef.make(0)
              const isOverFive = AtomRef.map(count, (n) => n > 5)
              const notifications: boolean[] = []
              const cancel = AtomRef.subscribe(isOverFive, (v) => notifications.push(v))
              return { count, notifications, cancel }
            }),
        ),
        When('the count changes several times without crossing the threshold, then crosses it')(
          'ctx',
          (s) =>
            Effect.sync(() => {
              AtomRef.set(s.ctx.count, 1)
              AtomRef.set(s.ctx.count, 2)
              AtomRef.set(s.ctx.count, 3)
              AtomRef.set(s.ctx.count, 6)
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
            const middleItem = AtomRef.prop(list, 1)
            return { list, middleItem }
          })),
        When('the middle item is set to a new value')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.set(s.ctx.middleItem, 99)
            return s.ctx
          })),
        Then('only the middle item changed, its neighbours are untouched')((s) => {
          expect(AtomRef.get(s.ctx.list)).toEqual([10, 99, 30])
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
            const cancel = AtomRef.subscribe(items, () => {
              notifications++
            })
            return { items, getNotifications: () => notifications, cancel }
          })),
        When('the middle item is removed, then the removed item is changed on its own')(
          'result',
          (s) =>
            Effect.sync(() => {
              const removed = AtomRef.get(s.ctx.items)[1]
              if (removed === undefined) throw new Error('expected a middle item')
              AtomRef.remove(s.ctx.items, removed)
              const afterRemoveNotifications = s.ctx.getNotifications()
              AtomRef.set(removed, 999)
              const afterStaleEditNotifications = s.ctx.getNotifications()
              s.ctx.cancel()
              return {
                afterRemoveNotifications,
                afterStaleEditNotifications,
                remaining: AtomRef.toArray(s.ctx.items),
              }
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
            const first: number[] = []
            const second: number[] = []
            const third: number[] = []
            AtomRef.subscribe(value, (v) => first.push(v))
            const cancelSecond = AtomRef.subscribe(value, (v) => second.push(v))
            AtomRef.subscribe(value, (v) => third.push(v))
            return { value, first, second, third, cancelSecond }
          })),
        When('the middle listener leaves and the value changes')('ctx', (s) =>
          Effect.sync(() => {
            s.ctx.cancelSecond()
            AtomRef.set(s.ctx.value, 1)
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
            const name = AtomRef.prop(record, 'name')
            const heard: (string | undefined)[] = []
            AtomRef.subscribe(name, (v) => heard.push(v))
            return { record, heard }
          })),
        When('an unrelated key changes, then the name appears')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.set(s.ctx.record, { other: 'changed' })
            AtomRef.set(s.ctx.record, { other: 'changed', name: 'arrived' })
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
            const middleItem = AtomRef.prop(list, 1)
            return { list, middleItem }
          })),
        When('the middle item is updated by adding one')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.update(s.ctx.middleItem, (n) => n + 1)
            return s.ctx
          })),
        Then('only the middle item changed, its neighbours are untouched')((s) => {
          expect(AtomRef.get(s.ctx.list)).toEqual([10, 21, 30])
        }),
      ),
    )
    scenario(
      'Removing an item that is not in the collection leaves the collection untouched',
      Gherkin.Do.pipe(
        Given('a shared collection, being watched by a listener')('ctx', () =>
          Effect.sync(() => {
            const items = AtomRef.collection([1, 2, 3])
            const stranger = AtomRef.get(AtomRef.collection([9]))[0]
            if (stranger === undefined) throw new Error('expected an item in the other collection')
            let notifications = 0
            const cancel = AtomRef.subscribe(items, () => {
              notifications++
            })
            return { items, stranger, getNotifications: () => notifications, cancel }
          })),
        When('an item that belongs to another collection is removed from this one')('result', (s) =>
          Effect.sync(() => {
            AtomRef.remove(s.ctx.items, s.ctx.stranger)
            const result = { remaining: AtomRef.toArray(s.ctx.items), notifications: s.ctx.getNotifications() }
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
            const name = AtomRef.prop(record, 'name')
            return { record, name }
          })),
        When('that field is updated by turning it uppercase')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.update(s.ctx.name, (n) => n.toUpperCase())
            return s.ctx
          })),
        Then('only that field changed, its neighbour is untouched')((s) => {
          expect(AtomRef.get(s.ctx.record)).toEqual({ name: 'ADA', other: 'x' })
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
              const first = AtomRef.get(items)[0]
              if (first === undefined) throw new Error('expected a first item')
              const firstName = AtomRef.prop(first, 'name')
              const address = AtomRef.prop(first, 'address')
              const city = AtomRef.prop(address, 'city')
              let notifications = 0
              const cancel = AtomRef.subscribe(items, () => {
                notifications++
              })
              return { items, firstName, city, getNotifications: () => notifications, cancel }
            }),
        ),
        When('the nested views change the first item, then that item is removed and changed again')(
          'result',
          (s) =>
            Effect.sync(() => {
              AtomRef.set(s.ctx.firstName, 'bob')
              const afterFieldSet = { notifications: s.ctx.getNotifications(), city: AtomRef.get(s.ctx.city) }
              AtomRef.update(s.ctx.city, (c) => c.toUpperCase())
              const afterNestedUpdate = {
                notifications: s.ctx.getNotifications(),
                items: AtomRef.toArray(s.ctx.items),
              }
              const removed = AtomRef.get(s.ctx.items)[0]
              if (removed === undefined) throw new Error('expected a first item')
              AtomRef.remove(s.ctx.items, removed)
              AtomRef.set(AtomRef.prop(removed, 'name'), 'zed')
              const afterRemoval = { notifications: s.ctx.getNotifications(), items: AtomRef.toArray(s.ctx.items) }
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
            const heard: number[] = []
            AtomRef.subscribe(value, (v) => heard.push(v))
            return { value, heard }
          })),
        When('the value is set to the number it already holds, then set to a different number')(
          'result',
          (s) =>
            Effect.sync(() => {
              const sameRef = AtomRef.set(s.ctx.value, 5)
              AtomRef.set(s.ctx.value, 6)
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
            const name = AtomRef.prop(record, 'name')
            const heard: (string | undefined)[] = []
            AtomRef.subscribe(name, (v) => heard.push(v))
            return { record, name, heard }
          })),
        When('the record is updated to add the name, then the name is read and changed')(
          'result',
          (s) =>
            Effect.sync(() => {
              AtomRef.update(s.ctx.record, (r) => ({ ...r, name: 'ada' }))
              const afterAppearing = AtomRef.get(s.ctx.name)
              AtomRef.update(s.ctx.record, (r) => ({ ...r, name: 'bob' }))
              return { heard: s.ctx.heard, afterAppearing, current: AtomRef.get(s.ctx.name) }
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
              const name = AtomRef.prop(record, 'name')
              const heard: string[] = []
              AtomRef.subscribe(name, (v) => heard.push(v))
              return { record, name, heard }
            }),
        ),
        When('the record changes without touching the watched field, then changes the watched field')(
          'result',
          (s) =>
            Effect.sync(() => {
              AtomRef.set(s.ctx.record, { name: 'ada', other: 'y' })
              const afterUnrelatedChange = [...s.ctx.heard]
              AtomRef.set(s.ctx.record, { name: 'bob', other: 'y' })
              return { afterUnrelatedChange, heard: s.ctx.heard }
            }),
        ),
        Then('the view stayed quiet for the unrelated change and only reported the watched field changing')((s) => {
          expect(s.result.afterUnrelatedChange).toEqual([])
          expect(s.result.heard).toEqual(['bob'])
        }),
      ),
    )
    scenario(
      'Two equally valued pieces of shared state keep their own identity',
      Gherkin.Do.pipe(
        Given('two pieces of shared state holding the same number, created one after the other')(
          'ctx',
          () =>
            Effect.sync(() => {
              const first = AtomRef.make(7)
              const second = AtomRef.make(7)
              return { first, second }
            }),
        ),
        When('the two pieces are compared and their identities are read')('result', (s) =>
          Effect.sync(() => ({
            firstKey: s.ctx.first.key,
            secondKey: s.ctx.second.key,
            equal: Equal.equals(s.ctx.first, s.ctx.second),
          }))),
        Then('each piece has its own identity while equal values still compare as equal')((s) => {
          expect(s.result.firstKey).not.toBe(s.result.secondKey)
          expect(s.result.equal).toBe(true)
        }),
      ),
    )
    scenario(
      'Changing a shared value notifies every listener exactly once with the new value',
      Gherkin.Do.pipe(
        Given('a shared value being watched by two listeners')('ctx', () =>
          Effect.sync(() => {
            const value = AtomRef.make(0)
            const first: number[] = []
            const second: number[] = []
            AtomRef.subscribe(value, (v) => first.push(v))
            AtomRef.subscribe(value, (v) => second.push(v))
            return { value, first, second }
          })),
        When('the value changes for real')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.set(s.ctx.value, 9)
            return s.ctx
          })),
        Then('each listener heard the new value exactly once')((s) => {
          expect(s.ctx.first).toEqual([9])
          expect(s.ctx.second).toEqual([9])
        }),
      ),
    )
    scenario(
      'Changing a nested field updates its parent and notifies whoever watches the parent',
      Gherkin.Do.pipe(
        Given('a shared record whose whole content is being watched')('ctx', () =>
          Effect.sync(() => {
            const record = AtomRef.make({ name: 'ada', other: 'x' })
            const heard: { name: string; other: string }[] = []
            AtomRef.subscribe(record, (v) => heard.push(v))
            return { record, heard }
          })),
        When('the nested field is changed through its own view')('ctx', (s) =>
          Effect.sync(() => {
            AtomRef.set(AtomRef.prop(s.ctx.record, 'name'), 'grace')
            return s.ctx
          })),
        Then('the parent carries the new field and its watchers heard the whole parent')((s) => {
          expect(AtomRef.get(s.ctx.record)).toEqual({ name: 'grace', other: 'x' })
          expect(s.ctx.heard).toEqual([{ name: 'grace', other: 'x' }])
        }),
      ),
    )
    scenario(
      'Adding and removing items of a shared collection notifies whoever watches the collection',
      Gherkin.Do.pipe(
        Given('a shared collection of two items, being watched by a listener')('ctx', () =>
          Effect.sync(() => {
            const items = AtomRef.collection([1, 2])
            const heard: number[][] = []
            AtomRef.subscribe(items, (refs) => heard.push(refs.map((ref) => AtomRef.get(ref))))
            return { items, heard }
          })),
        When('an item is added and then removed again')('result', (s) =>
          Effect.sync(() => {
            AtomRef.push(s.ctx.items, 3)
            const added = AtomRef.get(s.ctx.items)[2]
            if (added === undefined) throw new Error('expected an added item')
            AtomRef.remove(s.ctx.items, added)
            return { heard: s.ctx.heard, remaining: AtomRef.toArray(s.ctx.items) }
          })),
        Then('the listener heard the addition and the removal, and only the original items remain')((s) => {
          expect(s.result.heard).toEqual([[1, 2, 3], [1, 2]])
          expect(s.result.remaining).toEqual([1, 2])
        }),
      ),
    )
    scenarioOutline(
      'Reading and changing shared state with the <operation> helper gives the same answer however it is called',
      [
        {
          operation: 'read',
          attempt: (refs: RefBundle): Call => ({
            direct: AtomRef.get(refs.value),
            piped: refs.value.pipe(AtomRef.get),
          }),
        },
        {
          operation: 'view a field',
          attempt: (refs: RefBundle): Call => ({
            direct: AtomRef.get(AtomRef.prop(refs.record, 'name')),
            piped: refs.record.pipe(AtomRef.prop('name'), AtomRef.get),
          }),
        },
        {
          operation: 'derive a value',
          attempt: (refs: RefBundle): Call => ({
            direct: AtomRef.get(AtomRef.map(refs.value, (n) => n + 1)),
            piped: refs.value.pipe(AtomRef.map((n) => n + 1), AtomRef.get),
          }),
        },
        {
          operation: 'replace the value',
          attempt: (refs: RefBundle): Call => {
            AtomRef.set(refs.value, 5)
            return { direct: AtomRef.get(refs.value), piped: AtomRef.get(refs.value) }
          },
        },
        {
          operation: 'update the value',
          attempt: (refs: RefBundle): Call => {
            AtomRef.update(refs.value, (n) => n + 1)
            return { direct: AtomRef.get(refs.value), piped: AtomRef.get(refs.value) }
          },
        },
        {
          operation: 'listen',
          attempt: (refs: RefBundle): Call => {
            const first: Array<number> = []
            const second: Array<number> = []
            const cancelFirst = AtomRef.subscribe(refs.value, (v) => first.push(v))
            const cancelSecond = refs.value.pipe(AtomRef.subscribe((v) => second.push(v)))
            AtomRef.set(refs.value, 9)
            cancelFirst()
            cancelSecond()
            return { direct: first, piped: second }
          },
        },
      ],
      (row: RefCall) =>
        Gherkin.Do.pipe(
          Given('a shared value, a shared record, and a shared collection')('ctx', () =>
            Effect.sync(() => ({
              value: AtomRef.make(4),
              record: AtomRef.make({ name: 'ada', other: 'x' }),
              items: AtomRef.collection([1]),
            }))),
          When('the helper is called directly and through a pipe')('result', (s) =>
            Effect.sync(() => row.attempt(s.ctx))),
          Then('both calls agreed with each other')((s) => {
            expect(s.result.piped).toEqual(s.result.direct)
          }),
        ),
    )
  })
