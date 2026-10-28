import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'

import {
  ActionFailed,
  AppNotOpen,
  AppUnreachable,
  AutomationUnsupported,
  LocatorAmbiguous,
  LocatorNotFound,
} from '../verdict/failure.schema.js'
import { Action } from './action.schema.js'
import type { EngineCapability } from './capability.schema.js'
import { LogEntry, ReadRequest, type ReadResult } from './engine.schema.js'
import type { EngineShape } from './engine.service.js'
import type { ByRole, Locator, LocatorExpression, NthIndex, TextPattern } from './locator.schema.js'
import { type MemoryPage, MemorySession, type MemorySite, type OpenPage } from './memory-site.schema.js'
import type { Route } from './route.schema.js'
import type { SemanticNode } from './semantic-node.schema.js'

type OpenSession = typeof MemorySession.cases.Open.Type

type ActFailure = LocatorNotFound | LocatorAmbiguous | ActionFailed | AutomationUnsupported | AppUnreachable

interface History {
  readonly logs: ReadonlyArray<LogEntry>
  readonly revision: number
}

const SCREENSHOT: ReadonlyArray<number> = [
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1f,
  0x15,
  0xc4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0a,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9c,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0d,
  0x0a,
  0x2d,
  0xb4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]

const NO_HISTORY: History = { logs: [], revision: 0 }

const logEvidence = (text: string) => [{ _tag: 'LogEvidence', text }] as const

const declares = (site: MemorySite) => (capability: EngineCapability): boolean => site.capabilities.includes(capability)

const undeclared = (capability: EngineCapability): AutomationUnsupported =>
  new AutomationUnsupported({
    message: `the engine does not declare the ${capability} capability`,
    evidence: logEvidence(capability),
  })

const unimplemented = (what: string): AutomationUnsupported =>
  new AutomationUnsupported({
    message: `the in-memory engine does not implement ${what}`,
    evidence: logEvidence(what),
  })

const requiring = (site: MemorySite, capability: EngineCapability, what: string): AutomationUnsupported =>
  declares(site)(capability) ? unimplemented(what) : undeclared(capability)

const unreachable = (url: string): AppUnreachable =>
  new AppUnreachable({ message: `${url} is not a page of the site`, evidence: logEvidence(url) })

const notOpen = (): AppNotOpen =>
  new AppNotOpen({ message: 'no page is open', evidence: logEvidence('no page is open') })

const labelOf = (node: SemanticNode): string => Option.getOrElse(Option.fromNullishOr(node.name), () => node.ref.id)

const nameOf = (node: SemanticNode): string => Option.getOrElse(Option.fromNullishOr(node.name), () => '')

const textOf = (node: SemanticNode): string =>
  Option.fromNullishOr(node.text).pipe(
    Option.orElse(() => Option.fromNullishOr(node.name)),
    Option.getOrElse(() => ''),
  )

const describe = (locator: Locator): string => `${locator.label} (${JSON.stringify(locator.expression)})`

const notFound = (route: Route, locator: Locator): LocatorNotFound =>
  new LocatorNotFound({
    message: `no element matches ${describe(locator)}`,
    evidence: [{ _tag: 'RouteEvidence', route }],
  })

const ambiguous = (locator: Locator, matches: Arr.NonEmptyReadonlyArray<SemanticNode>): LocatorAmbiguous =>
  new LocatorAmbiguous({
    message: `${matches.length} elements match ${describe(locator)}: ${matches.map(labelOf).join(', ')}`,
    evidence: Arr.map(matches, (node) => ({ _tag: 'NodeEvidence', ref: node.ref }) as const),
  })

const inoperable = (node: SemanticNode, reason: string): ActionFailed =>
  new ActionFailed({
    message: `${labelOf(node)} cannot be used: ${reason}`,
    evidence: [{ _tag: 'NodeEvidence', ref: node.ref }],
  })

const parsedUrl = Option.liftThrowable((url: string, base: string) => new URL(url, base))

const pageAt = (site: MemorySite, url: string): Option.Option<{ readonly route: Route; readonly page: MemoryPage }> =>
  Option.flatMap(parsedUrl(site.origin, site.origin), (home) =>
    parsedUrl(url, home.origin).pipe(
      Option.filter((target) => target.origin === home.origin),
      Option.flatMap((target) =>
        Option.map(Option.fromNullishOr(site.pages[target.pathname]), (page) => ({
          route: { origin: target.origin, path: target.pathname, query: Array.from(target.searchParams.entries()) },
          page,
        }))
      ),
    ))

const isNetworkEvidence = LogEntry.isAnyOf(['Network', 'RequestFailed'])

const isPageReport = LogEntry.isAnyOf(['Navigation', 'Reveal', 'LayoutShift'])

const withoutUndeclaredPageReports = (site: MemorySite) =>
(
  logs: ReadonlyArray<LogEntry>,
): ReadonlyArray<LogEntry> => declares(site)('navigation-timing') ? logs : logs.filter(Predicate.not(isPageReport))

const withoutUndeclaredNetwork = (site: MemorySite) =>
(
  logs: ReadonlyArray<LogEntry>,
): ReadonlyArray<LogEntry> => declares(site)('network') ? logs : logs.filter(Predicate.not(isNetworkEvidence))

const declaredLogs = (site: MemorySite, logs: ReadonlyArray<LogEntry>): ReadonlyArray<LogEntry> =>
  withoutUndeclaredNetwork(site)(withoutUndeclaredPageReports(site)(logs))

const loadPage = (site: MemorySite, history: History) => (url: string): Result.Result<OpenSession, AppUnreachable> =>
  Option.match(pageAt(site, url), {
    onNone: () => Result.fail(unreachable(url)),
    onSome: ({ route, page }) =>
      Result.succeed<OpenSession>({
        _tag: 'Open',
        page: { route, tree: page.tree, links: page.links, revision: history.revision + 1 },
        logs: [...history.logs, ...declaredLogs(site, page.logs)],
      }),
  })

const historyOf = (session: OpenSession): History => ({ logs: session.logs, revision: session.page.revision })

const normalized = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

const matchesText = (pattern: TextPattern, text: string): boolean =>
  pattern.exact ? text === pattern.value : normalized(text).includes(normalized(pattern.value))

const visibleNodes = (tree: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  tree.flatMap((node) => (node.states.hidden ? [] : [node, ...visibleNodes(node.children)]))

const mentions = (pattern: TextPattern) => (node: SemanticNode): boolean =>
  [node.text, node.name].some((text) => text !== undefined && matchesText(pattern, text)) ||
  node.children.some(mentions(pattern))

const isControl = (node: SemanticNode): boolean => node.value !== undefined || node.states.checked !== undefined

const named = (pattern: TextPattern | undefined, node: SemanticNode): boolean =>
  pattern === undefined || matchesText(pattern, nameOf(node))

const hasRole = (locator: ByRole) => (node: SemanticNode): boolean =>
  node.role === locator.role && named(locator.name, node)

const labelled = (pattern: TextPattern) => (node: SemanticNode): boolean =>
  isControl(node) && matchesText(pattern, nameOf(node))

const nthOf = (index: NthIndex) => (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  Match.value(index).pipe(
    Match.when('first', () => nodes.slice(0, 1)),
    Match.when('last', () => nodes.slice(-1)),
    Match.orElse((at) =>
      Option.match(Arr.get(nodes, at < 0 ? nodes.length + at : at), {
        onNone: () => [],
        onSome: (node) => [node],
      })
    ),
  )

type Resolved = Result.Result<ReadonlyArray<SemanticNode>, AutomationUnsupported>

const resolveIn = (site: MemorySite, tree: ReadonlyArray<SemanticNode>) => (expression: LocatorExpression): Resolved =>
  Match.value(expression).pipe(
    Match.discriminatorsExhaustive('kind')({
      ByRole: (locator): Resolved => Result.succeed(visibleNodes(tree).filter(hasRole(locator))),
      ByText: ({ text }): Resolved =>
        Result.succeed(visibleNodes(tree).filter((node) => matchesText(text, textOf(node)))),
      ByLabel: ({ text }): Resolved => Result.succeed(visibleNodes(tree).filter(labelled(text))),
      Filter: ({ inner, text }): Resolved =>
        Result.map(resolveIn(site, tree)(inner), (nodes) => nodes.filter(mentions(text))),
      Nth: ({ inner, index }): Resolved => Result.map(resolveIn(site, tree)(inner), nthOf(index)),
      Frame: (): Resolved => Result.fail(requiring(site, 'frames', 'frame locators')),
      ByPlaceholder: (): Resolved => Result.fail(unimplemented('placeholder locators')),
      ByTestId: (): Resolved => Result.fail(unimplemented('test-id locators')),
      Selector: (): Resolved => Result.fail(unimplemented('CSS selector locators')),
    }),
  )

const exactlyOne = (route: Route, locator: Locator) =>
(
  matches: ReadonlyArray<SemanticNode>,
): Result.Result<SemanticNode, LocatorNotFound | LocatorAmbiguous> =>
  Arr.match(matches, {
    onEmpty: () => Result.fail(notFound(route, locator)),
    onNonEmpty: (found) =>
      found.length === 1 ? Result.succeed(Arr.headNonEmpty(found)) : Result.fail(ambiguous(locator, found)),
  })

const pickIn = (site: MemorySite, page: OpenPage) =>
(
  locator: Locator,
): Result.Result<SemanticNode, LocatorNotFound | LocatorAmbiguous | AutomationUnsupported> =>
  Result.flatMap(resolveIn(site, page.tree)(locator.expression), exactlyOne(page.route, locator))

const withNode = (id: string, change: (node: SemanticNode) => SemanticNode) =>
(
  tree: ReadonlyArray<SemanticNode>,
): ReadonlyArray<SemanticNode> =>
  tree.map((node) =>
    node.ref.id === id ? change(node) : Object.assign({}, node, { children: withNode(id, change)(node.children) })
  )

const changed = (session: OpenSession, id: string, change: (node: SemanticNode) => SemanticNode): OpenSession => ({
  ...session,
  page: { ...session.page, tree: withNode(id, change)(session.page.tree), revision: session.page.revision + 1 },
})

const withChecked = (checked: boolean) => (node: SemanticNode): SemanticNode =>
  Object.assign({}, node, { states: { ...node.states, checked } })

const withValue = (value: string) => (node: SemanticNode): SemanticNode => Object.assign({}, node, { value })

const operable = (node: SemanticNode): Result.Result<SemanticNode, ActionFailed> =>
  node.states.disabled ? Result.fail(inoperable(node, 'it is disabled')) : Result.succeed(node)

type Acted = Result.Result<OpenSession, ActFailure>

const onTarget = (
  site: MemorySite,
  session: OpenSession,
  locator: Locator,
  then: (node: SemanticNode) => Acted,
): Acted => pickIn(site, session.page)(locator).pipe(Result.flatMap(operable), Result.flatMap(then))

const toggled = (session: OpenSession, node: SemanticNode): Acted =>
  Option.match(Option.fromNullishOr(node.states.checked), {
    onNone: () => Result.succeed(session),
    onSome: (checked) => Result.succeed(changed(session, node.ref.id, withChecked(!checked))),
  })

const tapped = (site: MemorySite, session: OpenSession) => (node: SemanticNode): Acted =>
  Option.match(Option.fromNullishOr(session.page.links[node.ref.id]), {
    onNone: () => toggled(session, node),
    onSome: loadPage(site, historyOf(session)),
  })

const filled = (session: OpenSession, value: string) => (node: SemanticNode): Acted =>
  Option.match(Option.fromNullishOr(node.value), {
    onNone: () => Result.fail(inoperable(node, 'it holds no value to fill')),
    onSome: () => Result.succeed(changed(session, node.ref.id, withValue(value))),
  })

const checkedTo = (session: OpenSession, checked: boolean) => (node: SemanticNode): Acted =>
  Option.match(Option.fromNullishOr(node.states.checked), {
    onNone: () => Result.fail(inoperable(node, 'it has no checked state')),
    onSome: () => Result.succeed(changed(session, node.ref.id, withChecked(checked))),
  })

const refused = (what: string) => (): Acted => Result.fail(unimplemented(what))

const actOn = (site: MemorySite, session: OpenSession) => (action: Action): Acted =>
  Action.match(action, {
    Navigate: ({ url }): Acted => loadPage(site, historyOf(session))(url),
    Tap: ({ target }) => onTarget(site, session, target, tapped(site, session)),
    Fill: ({ target, value }) =>
      Predicate.isString(value)
        ? onTarget(site, session, target, filled(session, value))
        : Result.fail(unimplemented('secret or credential fills')),
    Check: ({ target, checked }) => onTarget(site, session, target, checkedTo(session, checked)),
    Drag: (): Acted => Result.fail(requiring(site, 'drag', 'drags')),
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

type Read = Result.Result<ReadResult, ActionFailed | AutomationUnsupported>

const readOf = (request: ReadRequest) => (node: SemanticNode): Read =>
  ReadRequest.match(request, {
    Text: (): Read => Result.succeed({ _tag: 'Text', text: textOf(node) }),
    Value: (): Read =>
      Option.match(Option.fromNullishOr(node.value), {
        onNone: () => Result.fail(inoperable(node, 'it holds no value')),
        onSome: (value) => Result.succeed({ _tag: 'Value', value }),
      }),
    Attribute: (): Read => Result.fail(unimplemented('attribute reads')),
    Visible: (): Read => Result.succeed({ _tag: 'Visible', visible: !node.states.hidden }),
    Enabled: (): Read => Result.succeed({ _tag: 'Enabled', enabled: !node.states.disabled }),
    Checked: (): Read =>
      Option.match(Option.fromNullishOr(node.states.checked), {
        onNone: () => Result.fail(inoperable(node, 'it has no checked state')),
        onSome: (checked) => Result.succeed({ _tag: 'Checked', checked }),
      }),
    Bounds: (): Read => Result.succeed({ _tag: 'Bounds', bounds: Option.getOrNull(Option.fromNullishOr(node.bounds)) }),
  })

const reopened =
  (site: MemorySite, url: string) => (session: MemorySession): Result.Result<OpenSession, AppUnreachable> =>
    MemorySession.match(session, {
      Idle: () => loadPage(site, NO_HISTORY)(url),
      Open: (open) => loadPage(site, historyOf(open))(url),
    })

export const memoryEngine = (site: MemorySite): Effect.Effect<EngineShape> =>
  Effect.map(Ref.make<MemorySession>({ _tag: 'Idle' }), (session) => {
    const opened = Ref.get(session).pipe(Effect.filterOrFail(MemorySession.guards.Open, notOpen))
    const settle = (next: Result.Result<OpenSession, ActFailure>) =>
      Effect.flatMap(Effect.fromResult(next), (open) => Ref.set(session, open))
    return {
      capabilities: site.capabilities,
      open: (url) =>
        Ref.get(session).pipe(
          Effect.map(reopened(site, url)),
          Effect.flatMap(Effect.fromResult),
          Effect.flatMap((open) => Ref.set(session, open)),
        ),
      observe: Effect.map(
        opened,
        ({ page }) => ({ route: page.route, revision: String(page.revision), tree: page.tree }),
      ),
      query: (locator) =>
        Effect.flatMap(opened, ({ page }) => Effect.fromResult(resolveIn(site, page.tree)(locator.expression))),
      act: (action) => Effect.flatMap(opened, (open) => settle(actOn(site, open)(action))),
      read: (locator, request) =>
        Effect.flatMap(
          opened,
          ({ page }) => Effect.fromResult(Result.flatMap(pickIn(site, page)(locator), readOf(request))),
        ),
      screenshot: () =>
        declares(site)('screenshot')
          ? Effect.as(opened, Uint8Array.from(SCREENSHOT))
          : Effect.fail(undeclared('screenshot')),
      route: Effect.map(opened, ({ page }) => page.route),
      logs: Effect.map(opened, ({ logs }) => logs),
      close: Ref.set(session, { _tag: 'Idle' }),
    }
  })
