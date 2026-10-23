import { LawSite } from '@systemfsoftware/effect-e2e-conformance'
import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { createServer, type Server, type ServerResponse } from 'node:http'

const LOOPBACK = '127.0.0.1'

const HOME_PAGE = `<!doctype html>
<html>
  <head><title>Engine law site</title></head>
  <body>
    <h1>Engine law site</h1>
    <a href="${LawSite.form}">${LawSite.linkFromHomeToForm}</a>
  </body>
</html>`

const FORM_PAGE = `<!doctype html>
<html>
  <head>
    <title>Signup</title>
    <link rel="stylesheet" href="${LawSite.assetAnsweringNotFoundOnFormOpen}">
    <script>console.log(${JSON.stringify(LawSite.consoleTextOnFormOpen)})</script>
  </head>
  <body>
    <form aria-label="Signup">
      <label>${LawSite.emptyTextbox} <input type="email"></label>
      <label><input type="checkbox"> ${LawSite.uncheckedCheckbox}</label>
      <button type="button">${LawSite.button}</button>
      <button type="button">${LawSite.twoButtonsNamed}</button>
      <button type="button">${LawSite.twoButtonsNamed}</button>
      <button type="button" disabled>${LawSite.disabledButton}</button>
    </form>
  </body>
</html>`

const PAGES: Readonly<Record<string, string>> = { [LawSite.home]: HOME_PAGE, [LawSite.form]: FORM_PAGE }

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

const answer = (response: ServerResponse, page: string | undefined): void => {
  if (page === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(page)
}

export const servedLawSite: Effect.Effect<string, never, Scope.Scope> = Effect.gen(function*() {
  const server = createServer((request, response) =>
    answer(response, PAGES[new URL(request.url ?? '/', `http://${LOOPBACK}`).pathname])
  )
  const port = yield* Effect.acquireRelease(listened(server), () => closed(server))
  return `http://${LOOPBACK}:${port}`
})
