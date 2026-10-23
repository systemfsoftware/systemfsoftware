import type {
  AppUnreachable,
  FillValue,
  Locator as EngineLocator,
  SwipeDirection,
  SwipeMomentum,
  ViewportPoint,
} from '@systemfsoftware/effect-e2e/engine'
import { Action, type AutomationUnsupported, SelectOption } from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import type { Locator } from 'playwright'

import { pointerFailed, type TargetFailure, unreachable, unsupported } from './failure.js'
import { playwrightLocator } from './locator.js'
import { attempt, failedOn, onTarget, type OpenSession, type Targeted } from './session.js'

export type ActFailure = TargetFailure | AutomationUnsupported | AppUnreachable

type Acted = Effect.Effect<void, ActFailure>

const SWIPE_DISTANCE: Readonly<Record<SwipeMomentum, number>> = { none: 200, slow: 600, fast: 1200 }

const SWIPE_WHEEL: Readonly<Record<SwipeDirection, readonly [number, number]>> = {
  up: [0, 1],
  down: [0, -1],
  left: [1, 0],
  right: [-1, 0],
}

export const located = (open: OpenSession) => (target: EngineLocator): Effect.Effect<Targeted, AutomationUnsupported> =>
  Effect.map(Effect.fromResult(playwrightLocator(open.page)(target.expression)), (locator) => ({
    open,
    target,
    locator,
  }))

const onLocated = <A>(open: OpenSession, target: EngineLocator, run: (locator: Locator) => Promise<A>): Acted =>
  Effect.asVoid(Effect.flatMap(located(open)(target), (targeted) => onTarget(targeted)(run)))

const pointer = <A>(run: () => Promise<A>): Acted => Effect.asVoid(Effect.mapError(attempt(run), pointerFailed))

const plainText = (value: FillValue, run: (text: string) => Acted): Acted =>
  Predicate.isString(value) ? run(value) : Effect.fail(unsupported('secret or credential fills'))

const navigated = (open: OpenSession, url: string): Acted =>
  Effect.asVoid(Effect.mapError(attempt(() => open.page.goto(url)), unreachable(url)))

const dragFailure = (source: Targeted, destination: Targeted) => (reason: string): Effect.Effect<TargetFailure> =>
  Effect.filterOrElse(
    failedOn(source)(reason),
    (failure) => !Predicate.isTagged(failure, 'ACTION_FAILED'),
    (failure) =>
      Effect.map(
        failedOn(destination)(reason),
        (other) => (Predicate.isTagged(other, 'ACTION_FAILED') ? failure : other),
      ),
  )

const dragged = (open: OpenSession, from: EngineLocator, to: EngineLocator): Acted =>
  Effect.gen(function*() {
    const source = yield* located(open)(from)
    const destination = yield* located(open)(to)
    yield* attempt(() => source.locator.dragTo(destination.locator)).pipe(
      Effect.catch((reason) => Effect.flip(dragFailure(source, destination)(reason))),
    )
  })

const swiped = (open: OpenSession, direction: SwipeDirection, momentum: SwipeMomentum): Acted =>
  pointer(() =>
    open.page.mouse.wheel(
      SWIPE_WHEEL[direction][0] * SWIPE_DISTANCE[momentum],
      SWIPE_WHEEL[direction][1] * SWIPE_DISTANCE[momentum],
    )
  )

const tracedPath = (open: OpenSession, [first, ...rest]: Arr.NonEmptyReadonlyArray<ViewportPoint>): Acted =>
  pointer(async () => {
    await open.page.mouse.move(first.x, first.y)
    await open.page.mouse.down()
    await rest.reduce((moved, point) => moved.then(() => open.page.mouse.move(point.x, point.y)), Promise.resolve())
    await open.page.mouse.up()
  })

const swipedAlong = (open: OpenSession, path: ReadonlyArray<ViewportPoint>): Acted =>
  Arr.match(path, {
    onEmpty: () => Effect.fail(pointerFailed('a swipe path needs at least one point')),
    onNonEmpty: (points) => tracedPath(open, points),
  })

const typedAt = (open: OpenSession, point: ViewportPoint) => (text: string): Acted =>
  pointer(async () => {
    await open.page.mouse.click(point.x, point.y)
    await open.page.keyboard.type(text)
  })

const performed = (open: OpenSession) => (action: Action): Acted =>
  Action.match(action, {
    Navigate: ({ url }) => navigated(open, url),
    Tap: ({ target }) => onLocated(open, target, (locator) => locator.click()),
    Fill: ({ target, value }) => plainText(value, (text) => onLocated(open, target, (locator) => locator.fill(text))),
    Type: ({ target, text }) => onLocated(open, target, (locator) => locator.pressSequentially(text)),
    Press: ({ target, key }) => onLocated(open, target, (locator) => locator.press(key)),
    Select: ({ target, option }) =>
      onLocated(open, target, (locator) =>
        locator.selectOption(
          SelectOption.match(option, { ByValue: ({ value }) => ({ value }), ByLabel: ({ label }) => ({ label }) }),
        )),
    Check: ({ target, checked }) => onLocated(open, target, (locator) => locator.setChecked(checked)),
    Hover: ({ target }) => onLocated(open, target, (locator) => locator.hover()),
    Drag: ({ from, to }) => dragged(open, from, to),
    Swipe: ({ direction, momentum }) => swiped(open, direction, momentum),
    SwipePath: ({ path }) => swipedAlong(open, path),
    TapAt: ({ point }) => pointer(() => open.page.mouse.click(point.x, point.y)),
    TypeAt: ({ point, text }) => plainText(text, typedAt(open, point)),
    Screenshot: () => Effect.fail(unsupported('screenshot actions; take the bytes through screenshot()')),
    WaitFor: ({ locator, state, timeout }) =>
      onLocated(open, locator, (located) => located.waitFor({ state, timeout })),
  })

/** Performs the action, then marks the page as changed so later nodes carry a new revision. */
export const actOn = (open: OpenSession) => (action: Action): Acted =>
  Effect.andThen(performed(open)(action), Ref.update(open.revision, (revision) => revision + 1))
