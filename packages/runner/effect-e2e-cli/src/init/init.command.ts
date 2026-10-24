import * as Command from 'effect/cli/Command'
import * as Flag from 'effect/cli/Flag'
import * as Prompt from 'effect/cli/Prompt'

import { ENGINES, GATEWAYS } from '../templates/answers.js'
import { init } from './init.js'

const dir = Flag.String('dir').pipe(
  Flag.withDescription('The suite root to scaffold, created when missing; defaults to the current package root'),
  Flag.optional,
)

const engine = Flag.Literals('engine', ENGINES).pipe(
  Flag.withDescription('The engine the suite drives'),
  Flag.withFallbackPrompt(
    Prompt.Select({ message: 'Engine', choices: ENGINES.map((value) => ({ title: value, value })) }),
  ),
)

const gateway = Flag.Literals('gateway', GATEWAYS).pipe(
  Flag.withDescription("The model gateway the suite's agent calls"),
  Flag.withFallbackPrompt(
    Prompt.Select({ message: 'Model gateway', choices: GATEWAYS.map((value) => ({ title: value, value })) }),
  ),
)

const model = Flag.String('model').pipe(
  Flag.withDescription("The agent's model id; defaults to the gateway's default model"),
  Flag.optional,
)

const installFlag = Flag.Boolean('install').pipe(
  Flag.withDescription("Install the suite's dev dependencies after writing; --no-install skips it"),
  Flag.withDefault(true),
)

const force = Flag.Boolean('force').pipe(
  Flag.withDescription('Replace files that already exist instead of refusing'),
  Flag.withDefault(false),
)

export const initCommand = (manifestUrl: URL) =>
  Command.make(
    'init',
    { dir, engine, gateway, model, install: installFlag, force },
    (flags) => init({ ...flags, manifestUrl }),
  ).pipe(Command.withDescription('Scaffold an effect-e2e suite: config, Vitest config, runner and two example tests'))
