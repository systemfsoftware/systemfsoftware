import {
  Action,
  ActionFailed,
  AppNotOpen,
  AppUnreachable,
  type AutomationUnsupported,
  type ConsoleLevel,
  Engine,
  type EngineCapability,
  type Locator,
  LocatorAmbiguous,
  LocatorNotFound,
  type LogEntry,
  type Observation,
  ReadRequest,
  type ReadResult,
  type Route,
} from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import { type DOMWindow, JSDOM, requestInterceptor, VirtualConsole } from 'jsdom'

import { resolveIn, textOf, undeclared, unimplemented } from './dom-locator.js'
import { type DomEntry, domTreeOf } from './dom-tree.js'

/** How a tap and a fill change the DOM. Tests swap it to prove the engine laws notice a wrong change. */
export interface DomMutation {
  readonly fill: (window: DOMWindow, field: HTMLInputElement | HTMLTextAreaElement, value: string) => void
  readonly click: (element: HTMLElement) => void
}

export const realMutation: DomMutation = {
  fill: (window, field, value) => {
    field.value = value
    field.dispatchEvent(new window.Event('input', { bubbles: true }))
    field.dispatchEvent(new window.Event('change', { bubbles: true }))
  },
  click: (element) => element.click(),
}

// jsdom renders nothing and cannot drag, so it declares neither screenshot nor drag.
export const PORT_FAKE_CAPABILITIES: ReadonlyArray<EngineCapability> = ['web', 'network']

interface OpenPage {
  readonly dom: JSDOM
  readonly logs: Ref.Ref<ReadonlyArray<LogEntry>>
  readonly revision: number
}

type Session = Option.Option<OpenPage>

type ActFailure = LocatorNotFound | LocatorAmbiguous | ActionFailed | AutomationUnsupported | AppUnreachable

const logEvidence = (text: string) => [{ _tag: 'LogEvidence', text }] as const

const notOpen = (): AppNotOpen =>
  new AppNotOpen({ message: 'no page is open', evidence: logEvidence('no page is open') })

const unreachable = (url: string, reason: string): AppUnreachable =>
  new AppUnreachable({ message: `${url} could not be loaded: ${reason}`, evidence: logEvidence(url) })

const labelOf = ({ node }: DomEntry): string => Option.getOrElse(Option.fromNullishOr(node.name), () => node.ref.id)

const describe = (locator: Locator): string => `${locator.label} (${JSON.stringify(locator.expression)})`

const notFound = (route: Route, locator: Locator): LocatorNotFound =>
  new LocatorNotFound({
    message: `no element matches ${describe(locator)}`,
    evidence: [{ _tag: 'RouteEvidence', route }],
  })

const ambiguous = (locator: Locator, matches: Arr.NonEmptyReadonlyArray<DomEntry>): LocatorAmbiguous =>
  new LocatorAmbiguous({
    message: `${matches.length} elements match ${describe(locator)}: ${matches.map(labelOf).join(', ')}`,
    evidence: Arr.map(matches, ({ node }) => ({ _tag: 'NodeEvidence', ref: node.ref }) as const),
  })

const inoperable = (entry: DomEntry, reason: string): ActionFailed =>
  new ActionFailed({
    message: `${labelOf(entry)} cannot be used: ${reason}`,
    evidence: [{ _tag: 'NodeEvidence', ref: entry.node.ref }],
  })

const routeOf = (window: DOMWindow): Route => {
  const url = new URL(window.location.href)
  return { origin: url.origin, path: url.pathname, query: [...url.searchParams] }
}

const recorder = (logs: Ref.Ref<ReadonlyArray<LogEntry>>) => (entry: LogEntry): void =>
  Effect.runSync(Ref.update(logs, (entries) => [...entries, entry]))

const isUncaught = (error: Error): boolean =>
  Predicate.hasProperty(error, 'type') && error.type === 'unhandled-exception'

const consoleRecording = (record: (entry: LogEntry) => void): VirtualConsole => {
  const forward = (level: ConsoleLevel) => (...data: Array<string>): void =>
    record({ _tag: 'Console', level, text: data.join(' ') })
  return new VirtualConsole()
    .on('debug', forward('debug'))
    .on('log', forward('log'))
    .on('info', forward('info'))
    .on('warn', forward('warning'))
    .on('error', forward('error'))
    .on('jsdomError', (error) => {
      if (isUncaught(error)) record({ _tag: 'PageError', message: error.message })
    })
}

// The engine fetches every request itself, so it sees each status the server answers.
const answering = (record: (entry: LogEntry) => void) =>
  requestInterceptor((request) =>
    fetch(request).then((response) => {
      if (response.status >= 400) {
        record({ _tag: 'Network', method: request.method, url: request.url, status: response.status })
      }
      return response
    })
  )

const loadEvent = (window: DOMWindow): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    if (window.document.readyState === 'complete') {
      resume(Effect.void)
      return
    }
    window.addEventListener('load', () => resume(Effect.void), { once: true })
  })

const loaded = (url: string, logs: Ref.Ref<ReadonlyArray<LogEntry>>): Effect.Effect<JSDOM, AppUnreachable> => {
  const record = recorder(logs)
  return Effect.tryPromise({
    try: () =>
      JSDOM.fromURL(url, {
        runScripts: 'dangerously',
        virtualConsole: consoleRecording(record),
        resources: { interceptors: [answering(record)] },
      }),
    catch: (cause) => unreachable(url, Predicate.isError(cause) ? cause.message : 'the request was refused'),
  }).pipe(Effect.tap((dom) => loadEvent(dom.window)))
}

const closed = (session: Session): Effect.Effect<void> =>
  Option.match(session, { onNone: () => Effect.void, onSome: ({ dom }) => Effect.sync(() => dom.window.close()) })

const entriesOf = (page: OpenPage): ReadonlyArray<DomEntry> => domTreeOf(page.dom.window)(String(page.revision)).entries

const exactlyOne = (route: Route, locator: Locator) =>
(
  matches: ReadonlyArray<DomEntry>,
): Result.Result<DomEntry, LocatorNotFound | LocatorAmbiguous> =>
  Arr.match(matches, {
    onEmpty: () => Result.fail(notFound(route, locator)),
    onNonEmpty: (found) =>
      found.length === 1 ? Result.succeed(Arr.headNonEmpty(found)) : Result.fail(ambiguous(locator, found)),
  })

const picked = (page: OpenPage, locator: Locator) =>
  Effect.fromResult(
    Result.flatMap(resolveIn(entriesOf(page))(locator.expression), exactlyOne(routeOf(page.dom.window), locator)),
  )

const operable = (entry: DomEntry): Effect.Effect<DomEntry, ActionFailed> =>
  entry.node.states.disabled ? Effect.fail(inoperable(entry, 'it is disabled')) : Effect.succeed(entry)

type Read = Effect.Effect<ReadResult, ActionFailed>

const readOf = (request: ReadRequest) => (entry: DomEntry): Read =>
  ReadRequest.match(request, {
    Text: (): Read => Effect.succeed({ _tag: 'Text', text: textOf(entry.node) }),
    Value: (): Read =>
      Option.match(Option.fromNullishOr(entry.node.value), {
        onNone: () => Effect.fail(inoperable(entry, 'it holds no value')),
        onSome: (value) => Effect.succeed({ _tag: 'Value', value }),
      }),
    Attribute: ({ name }): Read => Effect.succeed({ _tag: 'Attribute', name, value: entry.element.getAttribute(name) }),
    Visible: (): Read => Effect.succeed({ _tag: 'Visible', visible: !entry.node.states.hidden }),
    Enabled: (): Read => Effect.succeed({ _tag: 'Enabled', enabled: !entry.node.states.disabled }),
    Checked: (): Read =>
      Option.match(Option.fromNullishOr(entry.node.states.checked), {
        onNone: () => Effect.fail(inoperable(entry, 'it has no checked state')),
        onSome: (checked) => Effect.succeed({ _tag: 'Checked', checked }),
      }),
    // jsdom lays nothing out, so no element has bounds.
    Bounds: (): Read => Effect.succeed({ _tag: 'Bounds', bounds: null }),
  })

/**
 * An `Engine` over jsdom: `open` fetches the page and its subresources from the real server, and
 * every observe, query and read rebuilds the tree from the DOM as it is at that call. A tap or a
 * fill goes through `mutation`; a tap on a link loads its target, since jsdom does not navigate.
 */
export const portFake = (mutation: DomMutation): Layer.Layer<Engine> =>
  Layer.effect(Engine)(
    Effect.gen(function*() {
      const session = yield* Ref.make<Session>(Option.none())
      yield* Effect.addFinalizer(() => Effect.flatMap(Ref.get(session), closed))
      const opened = Effect.flatMap(Ref.get(session), (current) => Effect.mapError(Effect.fromOption(current), notOpen))
      const changed = Ref.update(session, Option.map((page) => ({ ...page, revision: page.revision + 1 })))

      const navigated = (page: OpenPage, url: string): Effect.Effect<void, AppUnreachable> =>
        Effect.flatMap(loaded(url, page.logs), (dom) =>
          Effect.andThen(
            closed(Option.some(page)),
            Ref.set(session, Option.some({ dom, logs: page.logs, revision: page.revision + 1 })),
          ))

      const mutated = (run: () => void): Effect.Effect<void> => Effect.andThen(Effect.sync(run), changed)

      const tapped = (page: OpenPage) => (entry: DomEntry): Effect.Effect<void, ActFailure> => {
        const { element } = entry
        const window = page.dom.window
        if (element instanceof window.HTMLAnchorElement && element.hasAttribute('href')) {
          return navigated(page, element.href)
        }
        return element instanceof window.HTMLElement
          ? mutated(() => mutation.click(element))
          : Effect.fail(inoperable(entry, 'it cannot be clicked'))
      }

      const filled = (page: OpenPage, value: string) => (entry: DomEntry): Effect.Effect<void, ActFailure> => {
        const { element } = entry
        const window = page.dom.window
        return element instanceof window.HTMLInputElement || element instanceof window.HTMLTextAreaElement
          ? mutated(() => mutation.fill(window, element, value))
          : Effect.fail(inoperable(entry, 'it holds no value to fill'))
      }

      const onTarget = (
        page: OpenPage,
        locator: Locator,
        then: (entry: DomEntry) => Effect.Effect<void, ActFailure>,
      ): Effect.Effect<void, ActFailure> => picked(page, locator).pipe(Effect.flatMap(operable), Effect.flatMap(then))

      const refused = (what: string) => (): Effect.Effect<void, ActFailure> => Effect.fail(unimplemented(what))

      const actOn = (page: OpenPage) => (action: Action): Effect.Effect<void, ActFailure> =>
        Action.match(action, {
          Navigate: ({ url }) => navigated(page, url),
          Tap: ({ target }) => onTarget(page, target, tapped(page)),
          Fill: ({ target, value }) =>
            Predicate.isString(value)
              ? onTarget(page, target, filled(page, value))
              : Effect.fail(unimplemented('secret or credential fills')),
          Drag: () => Effect.fail(undeclared('drag')),
          Check: refused('checking'),
          Type: refused('typing'),
          Press: refused('key presses'),
          Select: refused('option selection'),
          Hover: refused('hovering'),
          Swipe: refused('swipes'),
          SwipePath: refused('swipe paths'),
          TapAt: refused('point taps'),
          TypeAt: refused('point typing'),
          Screenshot: refused('screenshot actions'),
          WaitFor: refused('waits'),
        })

      return Engine.of({
        capabilities: PORT_FAKE_CAPABILITIES,
        open: (url) =>
          Effect.gen(function*() {
            yield* Effect.flatMap(Ref.getAndSet(session, Option.none()), closed)
            const logs = yield* Ref.make<ReadonlyArray<LogEntry>>([])
            const dom = yield* loaded(url, logs)
            yield* Ref.set(session, Option.some({ dom, logs, revision: 0 }))
          }),
        observe: Effect.map(opened, (page): Observation => ({
          route: routeOf(page.dom.window),
          revision: String(page.revision),
          tree: domTreeOf(page.dom.window)(String(page.revision)).tree,
        })),
        query: (locator) =>
          Effect.flatMap(opened, (page) =>
            Effect.fromResult(
              Result.map(resolveIn(entriesOf(page))(locator.expression), Arr.map(({ node }) => node)),
            )),
        act: (action) => Effect.flatMap(opened, (page) => actOn(page)(action)),
        read: (locator, request) =>
          Effect.flatMap(opened, (page) => Effect.flatMap(picked(page, locator), readOf(request))),
        screenshot: () => Effect.fail(undeclared('screenshot')),
        route: Effect.map(opened, (page) => routeOf(page.dom.window)),
        logs: Effect.flatMap(opened, (page) => Ref.get(page.logs)),
        close: Effect.flatMap(Ref.getAndSet(session, Option.none()), closed),
      })
    }),
  )
