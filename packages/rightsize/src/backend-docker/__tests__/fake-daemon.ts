/**
 * A scripted docker-daemon double for backend-docker unit tests — a real
 * unix-domain socket standing in for the daemon, serving one scripted
 * response per connection (which matches `DockerClient`'s
 * one-connection-per-request behavior: `agent: false`) and recording every
 * request's method/URL/headers/body. Structurally POSIX-only, like the
 * transport it doubles.
 *
 * Two response shapes:
 * - buffered: `{ status, body }` — the headers + body are written and the
 *   connection closes (unary calls);
 * - `streamOpen: true` — the body is written and the connection is KEPT
 *   open until the client destroys it (`followLogs`'s long-lived stream).
 *
 * The script is indexed across ALL connections a test drives, so a
 * multi-request operation (exec create → start → inspect) passes the
 * responses in wire order.
 */
import { mkdtempSync } from 'node:fs'
import * as net from 'node:net'
import type { Server, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** One recorded client request, fully read (headers + body). */
export interface FakeRequest {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

/** One scripted response. `body` may be an HTTP status + optional headers; `streamOpen` keeps the connection alive after the body. */
export interface FakeResponse {
  readonly status: number
  readonly body: string | Buffer
  readonly headers?: Record<string, string>
  /** Write the body then keep the connection open until the client closes it. */
  readonly streamOpen?: boolean
}

export interface FakeDaemon {
  /** The unix socket path the client dials. */
  readonly socketPath: string
  /** Every request received, in order. */
  readonly requests: ReadonlyArray<FakeRequest>
  /** Close the server and every live connection. */
  readonly close: () => Promise<void>
}

/**
 * Runs one fake-daemon scenario: starts the daemon, runs `body`, and closes
 * the daemon on every path. Deliberately promise-chained (no `async`
 * keyword): this package's effect tsconfig profile bans async function
 * declarations even in test files.
 */
export const withDaemon = <A>(
  responses: ReadonlyArray<FakeResponse>,
  body: (daemon: FakeDaemon) => PromiseLike<A>,
): Promise<A> =>
  fakeDaemon(responses).then((daemon) =>
    body(daemon).then(
      (value) => daemon.close().then(() => value),
      (error: unknown) => daemon.close().then(() => Promise.reject(error)),
    )
  )

const STATUS_REASON: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  304: 'Not Modified',
  404: 'Not Found',
  500: 'Internal Server Error',
}

const freshSocketPath = (): string => join(mkdtempSync(join(tmpdir(), 'rzd-fake-')), 'd.sock')

/** Cross-connection request counter so sequential requests share the script. */
export const fakeDaemon = (responses: ReadonlyArray<FakeResponse>): Promise<FakeDaemon> => {
  const { promise, resolve, reject } = Promise.withResolvers<FakeDaemon>()
  const socketPath = freshSocketPath()
  const requests: FakeRequest[] = []
  const sockets: Socket[] = []
  let next = 0

  const server: Server = net.createServer((socket: Socket) => {
    sockets.push(socket)
    let buffer = ''
    let bodyLength = -1
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('binary')
      if (bodyLength === -1) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) {
          return
        }
        const headerBlock = buffer.slice(0, headerEnd)
        const lines = headerBlock.split('\r\n')
        const [requestLine] = lines
        const [method, url] = (requestLine ?? '').split(' ')
        const headers: Record<string, string> = {}
        for (const line of lines.slice(1)) {
          const colon = line.indexOf(':')
          if (colon === -1) {
            continue
          }
          headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
        }
        const declared = headers['content-length']
        if (declared !== undefined) {
          bodyLength = Number.parseInt(declared, 10)
        } else {
          bodyLength = 0
        }
        const received = Buffer.byteLength(buffer.slice(headerEnd + 4), 'binary')
        if (received < bodyLength) {
          return
        }
        const body = buffer.slice(headerEnd + 4, headerEnd + 4 + bodyLength)
        buffer = ''
        bodyLength = -1
        requests.push({
          method: method ?? '',
          url: url ?? '',
          headers,
          body: Buffer.from(body, 'binary').toString('utf8'),
        })
        const scripted = responses[next] ?? { status: 500, body: '' }
        next += 1
        const bodyBuf = Buffer.isBuffer(scripted.body) ? scripted.body : Buffer.from(scripted.body)
        const reason = STATUS_REASON[scripted.status] ?? 'Error'
        const headerLines = Object.entries(scripted.headers ?? {})
          .map(([name, value]) => `${name}: ${value}`)
          .join('\r\n')
        const head = `HTTP/1.1 ${scripted.status} ${reason}\r\nContent-Length: ${bodyBuf.length}\r\n${headerLines}${
          headerLines.length > 0 ? '\r\n' : ''
        }\r\n`
        socket.write(head)
        socket.write(bodyBuf)
        if (!scripted.streamOpen) {
          socket.end()
        }
      }
    })
  })

  server.on('error', reject)
  server.listen(socketPath, () => {
    const { promise: closePromise, resolve: resolveClose } = Promise.withResolvers<void>()
    resolve({
      socketPath,
      requests,
      close: () => {
        for (const socket of sockets) {
          socket.destroy()
        }
        server.close(() => resolveClose())
        return closePromise
      },
    })
  })
  return promise
}
