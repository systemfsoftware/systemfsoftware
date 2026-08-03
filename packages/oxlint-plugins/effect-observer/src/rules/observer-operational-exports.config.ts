import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * Whitelist stems for exported observer names. Matching is case-insensitive
 * prefix matching, so verb stems also cover their morphological variants
 * (run -> runner, record -> recording). UPPER_SNAKE constants are exempt as
 * configuration, not domain vocabulary. The whitelist is the only mechanical
 * gate that reports article-prefixed fixture names like `anOrder`.
 */
export const OPERATIONAL_PREFIXES = [
  'step',
  'span',
  'effect',
  'context',
  'layer',
  'fixture',
  'harness',
  'test',
  'tool',
  'observ',
  'expect',
  'assert',
  'run',
  'make',
  'build',
  'create',
  'emit',
  'record',
  'collect',
  'track',
  'wrap',
  'compose',
  'spawn',
  'schedule',
  'report',
  'serve',
  'start',
  'stop',
  'open',
  'close',
  'reset',
  'provide',
  'using',
  'with',
  'to',
  'from',
  'into',
  'of',
  'as',
  'map',
  'zip',
  'merge',
  'chain',
  'tap',
  'catch',
  'retry',
  'timeout',
  'interrupt',
  'drain',
  'settle',
  'wait',
  'all',
  'first',
  'last',
  'fold',
  'reduce',
  'filter',
  'take',
  'put',
  'push',
  'pull',
  'get',
  'set',
  'init',
  'watch',
  'probe',
  'sample',
  'measure',
  'bench',
  'time',
  'event',
  'log',
  'metr',
  'tick',
] as const

export const UPPER_SNAKE_NAME = /^[A-Z][A-Z0-9_]*$/u

export const OPERATIONAL_EXPORT_EXPECTED =
  'an exported name in operational vocabulary (Step, Effect, Span, Fixture, Harness, run*, make*, …) or an UPPER_SNAKE constant' as const
export const OPERATIONAL_EXPORT_FIX =
  'rename it verb- or token-led (e.g. makeHarness, runSteps); a domain-shaped name does not belong in observer machinery' as const

export const OPERATIONAL_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'suggestion',
  docs: {
    description:
      'Require operational-vocabulary export names in *.observer.ts files. Exported names must be verb- or token-led (runSteps, makeHarness, StepRunner) or UPPER_SNAKE constants — a domain noun like anOrder encodes domain assumptions the domain never declared.',
  },
  schema: [Options],
  messages: {
    nonOperationalExport: OPERATIONAL_EXPORT_MESSAGE,
  },
} as const
