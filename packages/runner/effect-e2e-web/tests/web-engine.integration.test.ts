import { web } from '@systemfsoftware/effect-e2e'
import { layer } from '@systemfsoftware/effect-e2e-web'
import {
  Engine,
  type EngineShape,
  type EnvironmentUnavailable,
  type Locator,
  LogEntry,
  type ReadResult,
  type SemanticNode,
} from '@systemfsoftware/effect-e2e/engine'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import {
  refusedOrigin,
  SECRET_HEADER,
  type SeenRequest,
  type WebSite,
  webSite,
} from './__fixtures__/web-site.fixture.js'

const Feature = makeFeature({ it })

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const chromium = (headers: Readonly<Record<string, string>> = {}): Layer.Layer<Engine, EnvironmentUnavailable> =>
  layer({
    spec: web({ browser: 'chromium' }),
    contextHeaders: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, Redacted.make(value)])),
  })

const byRole = (role: string, name: string, exact = true): Locator => ({
  expression: { kind: 'ByRole', role, name: { value: name, exact } },
  label: `the ${name} ${role}`,
})

const byTestId = (testId: string): Locator => ({ expression: { kind: 'ByTestId', testId }, label: testId })

const email = byRole('textbox', 'Email')
const agree = byRole('checkbox', 'Agree')

const nodesIn = (tree: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  tree.flatMap((node) => [node, ...nodesIn(node.children)])

const summaryOf = (tree: ReadonlyArray<SemanticNode>, role: string, name: string) =>
  nodesIn(tree)
    .filter((node) => node.role === role && node.name === name)
    .map((node) => ({ value: node.value, checked: node.states.checked, disabled: node.states.disabled }))

/** Runs `use` against a fresh Chromium engine over a fresh local site, both closed afterwards. */
const onSite = <A, E>(
  use: (engine: EngineShape, site: WebSite) => Effect.Effect<A, E>,
  headers: Readonly<Record<string, string>> = {},
): Effect.Effect<A, E | EnvironmentUnavailable> =>
  Effect.scoped(
    Effect.gen(function*() {
      const site = yield* webSite
      return yield* Effect.flatMap(Engine, (engine) => use(engine, site)).pipe(Effect.provide(chromium(headers)))
    }),
  )

const opened = (engine: EngineShape, site: WebSite) => engine.open(`${site.origin}/form`)

Feature('Driving a real browser through the web engine')
  .withLayer(Layer.empty)
  .live('every scenario launches Chromium against a node:http site on a loopback socket')
  .body(({ scenario }) => {
    scenario(
      'Opening a page reads its semantic tree and its route',
      Gherkin.Do.pipe(
        When('the order form is opened and observed')(
          'observed',
          () => onSite((engine, site) => Effect.andThen(opened(engine, site), engine.observe)),
        ),
        Then('the tree holds the empty Email box and the unchecked Agree box, at /form')((s, expect) =>
          expect({
            path: s.observed.route.path,
            email: summaryOf(s.observed.tree, 'textbox', 'Email'),
            agree: summaryOf(s.observed.tree, 'checkbox', 'Agree'),
            archive: summaryOf(s.observed.tree, 'button', 'Archive'),
          }).toEqual({
            path: '/form',
            email: [{ value: '', checked: undefined, disabled: false }],
            agree: [{ value: undefined, checked: false, disabled: false }],
            archive: [{ value: undefined, checked: undefined, disabled: true }],
          })
        ),
      ),
    )

    scenario(
      'Queries by role, name and test id find exactly what they name',
      Gherkin.Do.pipe(
        When('the form is queried by test id, by exact and loose names, and for two equal names')(
          'counts',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.all({
                  testId: Effect.map(engine.query(byTestId('submit-order')), (nodes) => nodes.map((node) => node.name)),
                  save: Effect.map(engine.query(byRole('button', 'Save')), (nodes) => nodes.length),
                  exactPrefix: Effect.map(engine.query(byRole('button', 'Sav')), (nodes) => nodes.length),
                  loose: Effect.map(engine.query(byRole('button', 'sav', false)), (nodes) => nodes.length),
                  deletes: Effect.map(
                    engine.query(byRole('button', 'Delete')),
                    (nodes) => new Set(nodes.map((node) => node.ref.id)).size,
                  ),
                }),
              )
            ),
        ),
        Then('each query matches its own elements, and the two Delete buttons carry distinct refs')((s, expect) =>
          expect(s.counts).toEqual({ testId: ['Place order'], save: 1, exactPrefix: 0, loose: 1, deletes: 2 })
        ),
      ),
    )

    scenario(
      'Filling and checking change what reads return',
      Gherkin.Do.pipe(
        When('Email is filled and Agree is checked')('reads', () =>
          onSite((engine, site) =>
            Effect.gen(function*() {
              yield* opened(engine, site)
              yield* engine.act({ _tag: 'Fill', target: email, value: 'ada@example.com' })
              yield* engine.act({ _tag: 'Check', target: agree, checked: true })
              return [
                yield* engine.read(email, { _tag: 'Value' }),
                yield* engine.read(agree, { _tag: 'Checked' }),
              ] satisfies ReadonlyArray<ReadResult>
            })
          )),
        Then('the reads return the filled address and the checked state')((s, expect) =>
          expect(s.reads).toEqual([{ _tag: 'Value', value: 'ada@example.com' }, { _tag: 'Checked', checked: true }])
        ),
      ),
    )

    scenario(
      'Tapping a link navigates, and the route keeps the query pairs in order',
      Gherkin.Do.pipe(
        When('the Next link is tapped')('route', () =>
          onSite((engine, site) =>
            Effect.andThen(
              Effect.andThen(opened(engine, site), engine.act({ _tag: 'Tap', target: byRole('link', 'Next') })),
              engine.route,
            )
          )),
        Then('the route is /next with tab=open then tab=all')((s, expect) =>
          expect({ path: s.route.path, query: s.route.query }).toEqual({
            path: '/next',
            query: [['tab', 'open'], ['tab', 'all']],
          })
        ),
      ),
    )

    scenario(
      'An ambiguous, a missing and a disabled target each fail with their own engine failure',
      Gherkin.Do.pipe(
        When('the test taps Delete, taps Nowhere and taps the disabled Archive')(
          'failures',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.all({
                  ambiguous: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Delete') })),
                  missing: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Nowhere') })),
                  disabled: Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Archive') })),
                }),
              )
            ),
        ),
        Then('each failure is the engine code for what went wrong')((s, expect) =>
          expect({
            ambiguous: s.failures.ambiguous,
            missing: s.failures.missing,
            disabled: s.failures.disabled,
            missingNamesTheQuery: s.failures.missing.message.includes('Nowhere'),
          }).toMatchObject({
            ambiguous: { _tag: 'LOCATOR_AMBIGUOUS', evidence: [{ _tag: 'NodeEvidence' }, { _tag: 'NodeEvidence' }] },
            missing: { _tag: 'LOCATOR_NOT_FOUND' },
            disabled: { _tag: 'ACTION_FAILED', evidence: [{ _tag: 'NodeEvidence' }] },
            missingNamesTheQuery: true,
          })
        ),
      ),
    )

    scenario(
      'Opening an address nothing serves fails as unreachable and leaves no page open',
      Gherkin.Do.pipe(
        Given('an origin that refuses connections')('origin', () => refusedOrigin),
        When('the engine opens it and then observes')('outcome', ({ origin }) =>
          onSite((engine) =>
            Effect.all({
              open: Effect.flip(engine.open(`${origin}/`)),
              observe: Effect.flip(engine.observe),
            })
          )),
        Then('the open fails APP_UNREACHABLE naming the address, and the observe APP_NOT_OPEN')((s, expect) =>
          expect({
            open: s.outcome.open._tag,
            namesTheAddress: s.outcome.open.message.includes(s.origin),
            observe: s.outcome.observe._tag,
          }).toEqual({ open: 'APP_UNREACHABLE', namesTheAddress: true, observe: 'APP_NOT_OPEN' })
        ),
      ),
    )

    scenario(
      'A secret fill is refused until the secret store can hand the engine its value',
      Gherkin.Do.pipe(
        When('the test fills Email with the secret "password"')(
          'failure',
          () =>
            onSite((engine, site) =>
              Effect.andThen(
                opened(engine, site),
                Effect.flip(engine.act({ _tag: 'Fill', target: email, value: { secret: 'password' } })),
              )
            ),
        ),
        Then('the fill fails AUTOMATION_UNSUPPORTED naming secret fills')((s, expect) =>
          expect({ tag: s.failure._tag, namesSecrets: s.failure.message.includes('secret') }).toEqual({
            tag: 'AUTOMATION_UNSUPPORTED',
            namesSecrets: true,
          })
        ),
      ),
    )

    scenario(
      'A screenshot masks its targets, even one that matches nothing, and returns a PNG',
      Gherkin.Do.pipe(
        When('a screenshot masks Email and Nowhere')(
          'png',
          () =>
            onSite((engine, site) =>
              Effect.andThen(opened(engine, site), engine.screenshot({ mask: [email, byRole('button', 'Nowhere')] }))
            ),
        ),
        Then('the bytes start with the PNG signature')((s, expect) =>
          expect(Array.from(s.png.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE)
        ),
      ),
    )

    scenario(
      'The console line and the missing stylesheet are in the logs once open returns',
      Gherkin.Do.pipe(
        When('the form is opened and its logs are read')(
          'logs',
          () =>
            onSite((engine, site) =>
              Effect.map(Effect.andThen(opened(engine, site), engine.logs), (logs) => ({ logs, origin: site.origin }))
            ),
        ),
        Then('they hold "form ready" and a 404 for /missing.css')((s, expect) =>
          expect({
            ready: s.logs.logs.filter(LogEntry.guards.Console).filter((entry) => entry.text === 'form ready').length,
            missing: s.logs.logs.filter(LogEntry.guards.Network),
          }).toEqual({
            ready: 1,
            missing: [{ _tag: 'Network', method: 'GET', url: `${s.logs.origin}/missing.css`, status: 404 }],
          })
        ),
      ),
    )

    scenario(
      'A context header reaches every request and appears in no engine output',
      Gherkin.Do.pipe(
        Given('a secret header value')('secret', () => Effect.succeed(`s3cr3t-${crypto.randomUUID()}`)),
        When('a session observes, queries, fails, reads logs and the route, and fails to open an unserved address')(
          'session',
          ({ secret }) =>
            onSite(
              (engine, site) =>
                Effect.gen(function*() {
                  yield* opened(engine, site)
                  const outputs = [
                    yield* engine.observe,
                    yield* engine.query(byRole('button', 'Delete')),
                    yield* Effect.flip(engine.act({ _tag: 'Tap', target: byRole('button', 'Delete') })),
                    yield* engine.logs,
                    yield* engine.route,
                    yield* Effect.flip(engine.open(`${yield* refusedOrigin}/`)),
                  ]
                  return { outputs: JSON.stringify(outputs), seen: yield* site.seen }
                }),
              { [SECRET_HEADER]: secret },
            ),
        ),
        Then('the page and its stylesheet carried the header, and no output holds its value')((s, expect) =>
          expect({
            carried: s.session.seen
              .filter((request: SeenRequest) => request.path === '/form' || request.path === '/style.css')
              .map((request: SeenRequest) => [request.path, request.secretHeader === s.secret]),
            leaked: s.session.outputs.includes(s.secret),
          }).toEqual({ carried: [['/form', true], ['/style.css', true]], leaked: false })
        ),
      ),
    )
  })
