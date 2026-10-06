#!/usr/bin/env node
import { NodeHttpServer, NodeRuntime, NodeServices } from '@effect/platform-node'
import { Cause, Console, Effect, Exit, Layer, Option, Runtime, Schema } from 'effect'
import { CliError, Command, Flag } from 'effect/cli'
import { createServer } from 'node:http'
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

const USAGE_ERROR = 2

const stopIsSuccess: Runtime.Teardown = (exit, onExit) =>
  Exit.match(exit, {
    onSuccess: () => Runtime.defaultTeardown(exit, onExit),
    onFailure: (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? onExit(0)
        : Option.exists(
            Cause.findErrorOption(cause),
            (error) => CliError.isCliError(error) && !(error instanceof CliError.UserError),
          )
        ? onExit(USAGE_ERROR)
        : Runtime.defaultTeardown(exit, onExit),
  })

Command.run(cli, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ teardown: stopIsSuccess }),
)
