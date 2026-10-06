#!/usr/bin/env node
import { createServer } from 'node:http'
import { NodeHttpServer, NodeRuntime, NodeServices } from '@effect/platform-node'
import { Cause, Console, Effect, Exit, Layer, Runtime, Schema } from 'effect'
import { Command, Flag } from 'effect/cli'
import packageJson from '../package.json' with { type: 'json' }
import { Emulator, EmulatorReadyLine, layerOn, requestLogFileLayer } from '../src/mod.js'

const encodeReadyLine = Schema.encodeEffect(EmulatorReadyLine)

const LOOPBACK = '127.0.0.1'

const serve = Command.make(
  'serve',
  {
    port: Flag.Int('port').pipe(Flag.withDescription('TCP port on 127.0.0.1; 0 binds a free port')),
    requestLog: Flag.String('request-log').pipe(
      Flag.withDescription('file truncated at start, then one {"method","path","status"} JSON line per API call'),
    ),
  },
  ({ port, requestLog }) =>
    Effect.gen(function*() {
      const emulator = yield* Emulator
      const readyLine = yield* encodeReadyLine({ ready: true, port: Number(new URL(emulator.baseUrl).port) })
      yield* Console.log(readyLine)
      return yield* Effect.never
    }).pipe(
      Effect.provide(
        layerOn(
          requestLogFileLayer(requestLog).pipe(
            Layer.provideMerge(NodeHttpServer.layer(createServer, { port, host: LOOPBACK })),
          ),
        ),
      ),
    ),
).pipe(Command.withDescription('Serve the Cloudflare API emulator until SIGTERM or SIGINT'))

const cli = Command.make('cloudflare-emulator').pipe(Command.withSubcommands([serve]))

const stopIsSuccess: Runtime.Teardown = (exit, onExit) =>
  Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) ? onExit(0) : Runtime.defaultTeardown(exit, onExit)

Command.run(cli, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ teardown: stopIsSuccess }),
)
