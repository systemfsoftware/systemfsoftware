import type { RuleMeta } from '@oxlint/plugins'

/** A directory segment that names a layer, not the capability it holds. */
export const LAYER_SEGMENTS: Record<string, true> = {
  core: true,
  shell: true,
}

/** A directory segment that names a junk drawer - where files go when nobody knows where they belong. */
export const JUNK_DRAWER_SEGMENTS: Record<string, true> = {
  util: true,
  utils: true,
  service: true,
  services: true,
  manager: true,
  managers: true,
  helper: true,
  helpers: true,
  common: true,
  shared: true,
  misc: true,
  lib: true,
}

/** A directory segment that names the mechanism, not the capability it serves. */
export const MECHANISM_SEGMENTS: Record<string, true> = {
  di: true,
  fs: true,
  impl: true,
}

export const BANNED_SEGMENTS: Record<string, true> = {
  ...LAYER_SEGMENTS,
  ...JUNK_DRAWER_SEGMENTS,
  ...MECHANISM_SEGMENTS,
}

/**
 * Test roots and generated, installed, or vendored subtrees are out of scope. A test helper is
 * reached from the test that imports it, not by navigating the product tree, so the harm the
 * naming doctrine names does not occur there. `repos/` is vendored and read-only.
 */
export const SKIPPED_SEGMENTS: Record<string, true> = {
  __tests__: true,
  test: true,
  tests: true,
  __mocks__: true,
  testResources: true,
  fixtures: true,
  node_modules: true,
  dist: true,
  '.stryker-tmp': true,
  repos: true,
}

/** One exemption: a repo-relative directory prefix, and the reason it is exempt. An exemption without a reason is itself a defect. */
export type ExemptPrefix = {
  readonly prefix: string
  readonly reason: string
}

export const EXEMPT: readonly ExemptPrefix[] = []

export const EXPECTED = 'a path whose directory segments name the capability they hold' as const

export const ACTUAL = 'a directory segment that names a layer, mechanism, or junk drawer' as const

export const FIX =
  "rename the directory after the capability it holds; if it holds no capability, delete it; if the debt is tracked, exempt the repo-relative prefix with a reason in this rule's exempt option" as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta: RuleMeta = {
  type: 'problem',
  docs: {
    description:
      'A directory segment must name the capability it holds - layer names, mechanism names, and junk drawers are forbidden.',
  },
  schema: [
    {
      type: 'object',
      properties: {
        exempt: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              prefix: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['prefix', 'reason'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  ],
  defaultOptions: [{ exempt: [...EXEMPT] }],
  messages: {
    bannedDirectory: MESSAGE,
  },
}
