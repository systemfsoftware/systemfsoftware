import * as Argument from 'effect/cli/Argument'
import * as Command from 'effect/cli/Command'
import * as Flag from 'effect/cli/Flag'

import { REPORTERS, TRACE_MODES } from './flags.js'
import { run } from './run.js'

const dir = Flag.String('dir').pipe(
  Flag.withDescription('The suite root; defaults to the nearest directory holding e2e.config.ts'),
  Flag.optional,
)

const target = Flag.String('target').pipe(Flag.withDescription('Run only the named target'), Flag.optional)

const agent = Flag.String('agent').pipe(
  Flag.withDescription('Run with the named agent as the default agent'),
  Flag.optional,
)

const tag = Flag.String('tag').pipe(
  Flag.withDescription('Run only tests carrying the tag; the suite must declare it'),
  Flag.optional,
)

const reporter = Flag.Literals('reporter', REPORTERS).pipe(
  Flag.withDescription('The report the terminal shows; junit writes junit.xml and markdown writes summary.md'),
  Flag.withDefault('list'),
)

const cache = Flag.Boolean('cache').pipe(
  Flag.withDescription('Replay recorded steps; --no-cache runs every step against the model'),
  Flag.withDefault(true),
)

const strictCache = Flag.Boolean('strict-cache').pipe(
  Flag.withDescription('Only read the replay cache, never write it'),
  Flag.withDefault(false),
)

const workers = Flag.Int('workers').pipe(
  Flag.withDescription("Vitest's worker count (maxWorkers); the config's own workers value is not consulted"),
  Flag.optional,
)

const retries = Flag.Int('retries').pipe(Flag.withDescription('Retries per failed test'), Flag.optional)

const timeout = Flag.Int('timeout').pipe(
  Flag.withDescription('Milliseconds a whole test may take, the session budget included'),
  Flag.optional,
)

const output = Flag.String('output').pipe(
  Flag.withDescription('The directory the report and artifacts are written to, relative to the suite root'),
  Flag.optional,
)

const trace = Flag.Literals('trace', TRACE_MODES).pipe(
  Flag.withDescription('When the trace page is kept'),
  Flag.optional,
)

const lastFailed = Flag.Boolean('last-failed').pipe(
  Flag.withDescription("Rerun only the tests the previous run's report did not pass"),
  Flag.withDefault(false),
)

const files = Argument.String('files').pipe(
  Argument.withDescription('Run only test files whose path contains one of these'),
  Argument.variadic(),
)

export const runCommand = Command.make(
  'run',
  {
    dir,
    target,
    agent,
    tag,
    reporter,
    cache,
    strictCache,
    workers,
    retries,
    timeout,
    output,
    trace,
    lastFailed,
    files,
  },
  ({ dir: root, cache: useCache, ...flags }) => run({ dir: root, flags: { ...flags, noCache: !useCache } }),
).pipe(
  Command.withDescription(
    'Run an effect-e2e suite under Vitest, print one report, and exit with its code (0 passed, 1 failed, 2 refused, 3 blocked, 4 error)',
  ),
)
