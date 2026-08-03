import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ENTRYPOINT_FILE = /(?:^|[\\/])main\.ts$/u

export const RUN_MAIN = 'runMain' as const

export const QUALIFIED_EDGE_CALLEES: ReadonlySet<string> = new Set([
  'Effect.runPromise',
  'Effect.runPromiseExit',
  'Effect.runSync',
  'Effect.runSyncExit',
  'Effect.runFork',
  'Effect.runCallback',
  'ManagedRuntime.make',
  'Layer.toRuntime',
])

export const MISSING_EDGE_NAME = 'an entrypoint that interprets nothing' as const
export const MISSING_EDGE_EXPECTED =
  'exactly one interpretation edge - runMain, ManagedRuntime.make, Layer.toRuntime, or a top-level Effect.run*' as const
export const MISSING_EDGE_ACTUAL = 'a main.ts containing no interpretation edge' as const
export const MISSING_EDGE_FIX =
  'interpret the program here - runMain for a terminating process, Layer.launch inside runMain for one that never returns, ManagedRuntime.make for a promise-native host; a main.ts that interprets nothing is a module wearing the entrypoint name' as const

export const MULTIPLE_EDGES_EXPECTED = 'exactly one interpretation edge in the entrypoint' as const
export const MULTIPLE_EDGES_ACTUAL = 'a second interpretation edge in the same entrypoint' as const
export const MULTIPLE_EDGES_FIX =
  'collapse the program into one Effect and interpret it once; a second edge starts fibers the outer edge cannot interrupt and whose finalizers it never runs' as const

export const INTERPRETS_ONCE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Require exactly one interpretation edge in main.ts. An Effect value is a description; the entrypoint is the single place it is interpreted. Zero edges means the file is a module wearing the entrypoint name; two means the outer edge cannot interrupt or finalize the fibers the inner one started.',
  },
  schema: [Options],
  messages: {
    missingEdge: INTERPRETS_ONCE_MESSAGE,
    multipleEdges: INTERPRETS_ONCE_MESSAGE,
  },
} as const
