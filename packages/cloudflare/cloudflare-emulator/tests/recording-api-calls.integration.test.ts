import { NodeHttpServer, NodeServices } from '@effect/platform-node'
import { CloudflareApiRequestLine, layerOn, requestLogFileLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'

const Feature = makeFeature({ it, layer })

const ACCOUNT = '0123456789abcdef0123456789abcdef'

const decodeLogLine = Schema.decodeEffect(CloudflareApiRequestLine)

const callAndReadLog = (target: string) =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const requestLog = path.join(yield* fs.makeTempDirectoryScoped(), 'requests.jsonl')
      const served = yield* Layer.build(
        layerOn(requestLogFileLayer(requestLog).pipe(Layer.provideMerge(NodeHttpServer.layerTest))),
      )
      const client = Context.get(served, HttpClient.HttpClient)
      const response = yield* client.get(target)
      const body = yield* response.text
      const lines = (yield* fs.readFileString(requestLog)).split('\n').filter((line) => line.length > 0)
      const records = yield* Effect.forEach(lines, (line) => decodeLogLine(line))
      return { body, records }
    }),
  )

Feature('Recording each Cloudflare API call the emulator answers')
  .live('serves the emulator on a loopback port and writes its request log to a temporary file')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A listing called with a cursor and a token is recorded by its path alone',
      Gherkin.Do.pipe(
        Given('a request listing the account\'s event streams with a cursor and a token in its query')(
          'target',
          () => Effect.succeed(`/accounts/${ACCOUNT}/k2/streams?cursor=c0ffee&token=tok_s3cr3t`),
        ),
        When('the emulator answers it')(
          'answered',
          (s) => callAndReadLog(s.target),
        ),
        Then('the request log holds that one successful call as its method, its path without the query, and its status')((
          s,
          expect,
        ) =>
          expect(s.answered.records, s.answered.body).toEqual([
            { method: 'GET', path: `/accounts/${ACCOUNT}/k2/streams`, status: 200 },
          ])
        ),
      ),
    )
  })
