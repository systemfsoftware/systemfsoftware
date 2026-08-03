import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BANNED_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'core',
  'shell',
  'utils',
  'util',
  'helpers',
  'entities',
  'components',
  'hooks',
  'controllers',
  'jobs',
  'db',
  'migrations',
  'service',
  'services',
  'manager',
  'use-case',
  'use-cases',
  'repository',
  'repositories',
])

export const SRC_DIR = 'src' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban *.policy.ts files from junk-drawer path segments (core, shell, utils, helpers, entities, components, hooks, controllers, jobs, db, migrations, service, manager, use-case, repository). A policy belongs under its capability.',
  },
  schema: [Options],
  messages: {
    junkDrawerPath: MESSAGE,
  },
} as const
