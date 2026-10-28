import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

export const SECRET_HEADER = 'x-monitor-bypass'

export const FORM_PAGE = `<!doctype html>
<html>
  <head>
    <title>Order form</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/missing.css">
    <script>console.log('form ready')</script>
  </head>
  <body>
    <a href="/next?tab=open&tab=all">Next</a>
    <form aria-label="Order">
      <label>Email <input type="email" name="email"></label>
      <label><input type="checkbox" name="agree"> Agree</label>
      <button type="button">Save</button>
      <button type="button">Delete</button>
      <button type="button">Delete</button>
      <button type="button" disabled>Archive</button>
      <button type="button" data-testid="submit-order">Place order</button>
    </form>
    <p><span data-testid="total">Subtotal</span> <span data-testid="total">Total</span></p>
  </body>
</html>`

const NEXT_PAGE = `<!doctype html>
<html>
  <head>
    <title>Next</title>
    <style>@view-transition{navigation:auto}</style>
  </head>
  <body><h1>Next</h1></body>
</html>`

export const PREFETCH_PAGE = `<!doctype html>
<html>
  <head>
    <title>Prefetch</title>
    <style>@view-transition{navigation:auto}</style>
    <script type="speculationrules">
      {"prefetch":[{"source":"document","where":{"href_matches":"/next"},"eagerness":"immediate"}]}
    </script>
  </head>
  <body><a href="/next">Next</a></body>
</html>`

export const FORGED_PAGE = `<!doctype html>
<html>
  <head><title>Forged</title></head>
  <body>
    <script type="module">
      await window.__e2eReportPage({ _tag: 'Console', level: 'error', text: 'forged' })
    </script>
  </body>
</html>`

export const CONTROLS_PAGE = `<!doctype html>
<html>
  <head>
    <title>Controls</title>
    <style>
      body { margin: 8px; min-height: 3000px; }
      [draggable], #bin, #pad { width: 160px; height: 60px; margin: 8px 0; background: #ddd; }
    </style>
  </head>
  <body>
    <ol aria-label="Events"></ol>
    <label for="plan">Plan</label>
    <select id="plan"><option value="basic">Basic</option><option value="pro">Pro</option></select>
    <input aria-label="Note" placeholder="Write a note">
    <input aria-label="Memo">
    <button type="button" id="hover-target">Hover me</button>
    <button type="button" id="tap-target">Tap here</button>
    <div data-testid="card" draggable="true">Card</div>
    <div id="bin">Bin</div>
    <div id="pad"></div>
    <ul aria-label="Fruit"><li>Apple <button type="button">Remove</button></li><li>Pear <button type="button">Remove</button></li></ul>
    <iframe title="Help" src="/help"></iframe>
    <script>
      const logged = new Set()
      const log = (text) => {
        if (logged.has(text)) return
        logged.add(text)
        const item = document.createElement('li')
        item.textContent = text + ';'
        document.querySelector('ol').append(item)
      }
      const on = (selector, type, listener) => document.querySelector(selector).addEventListener(type, listener)
      on('[aria-label="Note"]', 'keydown', (event) => { if (event.key === 'Enter') log('pressed Enter') })
      on('#hover-target', 'mouseenter', () => log('hovered'))
      on('#tap-target', 'click', () => log('tapped'))
      on('[draggable]', 'dragstart', (event) => event.dataTransfer.setData('text/plain', 'card'))
      on('#bin', 'dragover', (event) => event.preventDefault())
      on('#bin', 'drop', (event) => { event.preventDefault(); log('dropped') })
      on('#pad', 'pointerdown', () => log('pad down'))
      on('#pad', 'pointerup', () => log('pad up'))
      window.addEventListener('wheel', () => log('swiped'))
    </script>
  </body>
</html>`

const HELP_PAGE = '<!doctype html><html><body><button type="button">Help</button></body></html>'

export interface SeenRequest {
  readonly path: string
  readonly secretHeader: string
}

export interface WebSite {
  readonly origin: string
  readonly seen: Effect.Effect<ReadonlyArray<SeenRequest>>
  readonly prefetchSeen: Effect.Effect<void>
}

const ROUTES: Readonly<Record<string, { readonly type: string; readonly body: string }>> = {
  '/form': { type: 'text/html', body: FORM_PAGE },
  '/next': { type: 'text/html', body: NEXT_PAGE },
  '/prefetch': { type: 'text/html', body: PREFETCH_PAGE },
  '/forged': { type: 'text/html', body: FORGED_PAGE },
  '/controls': { type: 'text/html', body: CONTROLS_PAGE },
  '/help': { type: 'text/html', body: HELP_PAGE },
  '/style.css': { type: 'text/css', body: 'body { font-family: sans-serif; }' },
}

const portOf = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

const listened = (server: Server): Effect.Effect<number> =>
  Effect.callback<number>((resume) => {
    server.listen(0, LOOPBACK, () => resume(Effect.succeed(portOf(server))))
  })

const closed = (server: Server): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    server.closeAllConnections()
    server.close(() => resume(Effect.void))
  })

const answer = (response: ServerResponse, path: string): void => {
  const route = ROUTES[path]
  if (route === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': route.type })
  response.end(route.body)
}

/** A local static site that records, per request, the value of the secret context header. */
export const webSite: Effect.Effect<WebSite, never, Scope.Scope> = Effect.gen(function*() {
  const seen: Array<SeenRequest> = []
  const prefetched = yield* Deferred.make<void>()
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://${LOOPBACK}`).pathname
    const header = request.headers[SECRET_HEADER]
    seen.push({ path, secretHeader: typeof header === 'string' ? header : '' })
    const purpose = request.headers['sec-purpose']
    const purposes = Array.isArray(purpose) ? purpose : typeof purpose === 'string' ? [purpose] : []
    if (path === '/next' && purposes.some((value) => value.includes('prefetch'))) {
      Deferred.doneUnsafe(prefetched, Effect.void)
    }
    answer(response, path)
  })
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return {
    origin: `http://${LOOPBACK}:${port}`,
    seen: Effect.sync(() => [...seen]),
    prefetchSeen: Deferred.await(prefetched),
  }
})

export const refusedOrigin: Effect.Effect<string> = Effect.gen(function*() {
  const server = createServer()
  const port = yield* listened(server)
  yield* closed(server)
  return `http://${LOOPBACK}:${port}`
})
