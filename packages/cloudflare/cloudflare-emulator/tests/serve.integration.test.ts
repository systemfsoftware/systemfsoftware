import { NodeServices } from '@effect/platform-node'
import { CloudflareApiRequestLine, EmulatorReadyLine } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer, Option, Path, Schema, Stream } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'

const decodeReady = Schema.decodeEffect(EmulatorReadyLine)
const decodeLogLine = Schema.decodeEffect(CloudflareApiRequestLine)

const serveCallAndStop = (query: string) =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const requestLog = path.join(yield* fs.makeTempDirectoryScoped(), 'requests.jsonl')
      const bin = path.join(import.meta.dirname, '..', 'dist', 'bin', 'cloudflare-emulator.mjs')
      const emulator = yield* spawner.spawn(
        ChildProcess.make(process.execPath, [bin, 'serve', '--port', '0', '--request-log', requestLog], {
          env: { NODE_OPTIONS: '' },
          extendEnv: false,
        }),
      )
      const firstLine = yield* emulator.stdout.pipe(Stream.decodeText(), Stream.splitLines, Stream.runHead)
      const ready = yield* decodeReady(Option.getOrElse(firstLine, () => ''))
      const origin = `http://127.0.0.1:${ready.port}`
      const response = yield* HttpClient.get(`${origin}/accounts/${ACCOUNT}/k2/streams${query}`)
      const body = yield* response.text
      yield* emulator.kill({ killSignal: 'SIGTERM' })
      const exitCode = yield* emulator.exitCode
      const lines = (yield* fs.readFileString(requestLog)).split('\n').filter((line) => line.length > 0)
      const records = yield* Effect.forEach(lines, (line) => decodeLogLine(line))
      const stillListening = yield* HttpClient.get(origin).pipe(Effect.as(true), Effect.orElseSucceed(() => false))
      return { body, exitCode, records, stillListening }
    }),
  ).pipe(Effect.timeout('30 seconds'))

Feature('Serving the Cloudflare API emulator as a process')
  .live('spawns the built cloudflare-emulator bin on a free loopback port')
  .withLayer(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))
  .body(({ scenario }) => {
    scenario(
      'A served emulator records a call by its path alone and stops cleanly when asked',
      Gherkin.Do.pipe(
        Given("a listing of the account's event streams with a cursor and a token in its query")(
          'query',
          () => Effect.succeed('?cursor=c0ffee&token=tok_s3cr3t'),
        ),
        When('the emulator is started, answers that call, and is asked to stop')(
          'run',
          (s) => serveCallAndStop(s.query),
        ),
        Then(
          'its request log holds that one call by method, path without the query, and status, and it exits successfully and stops listening',
        )((
          s,
          expect,
        ) =>
          expect({ exitCode: s.run.exitCode, records: s.run.records, stillListening: s.run.stillListening }, s.run.body)
            .toEqual({
              exitCode: 0,
              records: [{ method: 'GET', path: `/accounts/${ACCOUNT}/k2/streams`, status: 200 }],
              stillListening: false,
            })
        ),
      ),
    )
  })
