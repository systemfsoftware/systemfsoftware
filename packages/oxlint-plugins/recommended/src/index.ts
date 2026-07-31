const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-recommended'

const PURE_CELLS = [
  '**/*.schema.ts',
  '**/*.shape.ts',
  '**/*.acl.ts',
  '**/*.registry.ts',
  '**/*.workflow.ts',
] as const
const KERNEL_CELLS = ['**/*.kernel.ts'] as const
const FRONT_HALF_CELLS = ['**/*.middleware.ts'] as const
const TERMINUS_CELLS = ['**/*.handler.ts'] as const
const OBSERVER_FILES = ['**/*.test.ts', '**/tests/**', '**/__tests__/**'] as const

const IMPURE_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'localStorage',
  'sessionStorage',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  '__dirname',
  '__filename',
] as const

const IMPURE_PROPERTIES = [
  {
    object: 'Math',
    property: 'random',
    message: 'I.1: randomness is ambient impurity. Take it as a command field or through a port.',
  },
  {
    object: 'Date',
    property: 'now',
    message: 'I.1: the clock is ambient impurity. Read it in the shell and pass the instant in.',
  },
  {
    object: 'performance',
    property: 'now',
    message: 'I.1: the clock is ambient impurity. Read it in the shell and pass the instant in.',
  },
  {
    object: 'crypto',
    property: 'randomUUID',
    message: 'I.1: randomness is ambient impurity. Generate the id in the shell.',
  },
  {
    object: 'crypto',
    property: 'getRandomValues',
    message: 'I.1: randomness is ambient impurity. Generate the bytes in the shell.',
  },
  {
    object: 'process',
    property: 'env',
    message: 'I.1: the environment is ambient impurity. Decode config at the composition root.',
  },
] as const

const IO_MODULES = [
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:dgram',
  'node:cluster',
  'node:readline',
  'node:worker_threads',
  'node:process',
] as const

const EFFECT_RUNTIME_IMPORT = {
  name: 'effect',
  importNames: ['Effect', 'Layer', 'Runtime', 'Fiber', 'Ref', 'Queue', 'Stream'],
  allowTypeImports: true,
  message: 'I.1 / II.2: a pure cell describes no effects. Borrow the type, run it in the shell.',
} as const

const ADAPTER_MODULES = ['**/*.adapter', '**/*.adapter.js', '**/*.adapter.ts'] as const
const WORKFLOW_MODULES = ['**/*.workflow', '**/*.workflow.js', '**/*.workflow.ts'] as const
const EXECUTOR_MODULES = ['**/*.executor', '**/*.executor.js', '**/*.executor.ts'] as const
const STORE_MODULES = ['**/*.store', '**/*.store.js', '**/*.store.ts'] as const
const SCHEMA_MODULES = ['**/*.schema', '**/*.schema.js', '**/*.schema.ts'] as const
const ACL_MODULES = ['**/*.acl', '**/*.acl.js', '**/*.acl.ts'] as const
const SHAPE_MODULES = ['**/*.shape', '**/*.shape.js', '**/*.shape.ts'] as const
const HANDLER_MODULES = ['**/*.handler', '**/*.handler.js', '**/*.handler.ts'] as const

const ADAPTER_GROUP = {
  group: [...ADAPTER_MODULES],
  allowTypeImports: true,
  message: 'The technology cell is bound at the composition root. A domain cell never names a driver.',
} as const

const SHELL_GROUP_FOR_FRONT_HALF = {
  group: [...EXECUTOR_MODULES, ...WORKFLOW_MODULES, ...STORE_MODULES],
  message: 'Atlas: the transport front-half attaches facts, never decisions. Move the call to the terminus.',
} as const

const BYPASS_GROUP_FOR_TERMINUS = {
  group: [...WORKFLOW_MODULES, ...STORE_MODULES],
  message: 'Atlas: the terminus calls exactly one executor. Reaching past it splits the I/O sandwich.',
} as const

const DOMAIN_GROUP_FOR_KERNEL = {
  group: [
    ...SCHEMA_MODULES,
    ...WORKFLOW_MODULES,
    ...ACL_MODULES,
    ...SHAPE_MODULES,
    ...STORE_MODULES,
    ...EXECUTOR_MODULES,
    ...HANDLER_MODULES,
    ...ADAPTER_MODULES,
  ],
  message:
    'The kernel is domain-blind: it cannot name a domain type. Move the function to the cell that owns the vocabulary.',
} as const

/**
 * Built-in namespaces the recommended rules key on. Spread into `plugins`;
 * a rule whose namespace is absent is reported as unknown, not applied.
 *
 * @public
 */
export const plugins = ['typescript', 'import', 'unicorn', 'vitest'] as const

/**
 * Type-aware rules produce no diagnostics at all when type awareness is off.
 * Spread into `options` or half this preset is inert without saying so.
 *
 * @public
 */
export const options = { typeAware: true } as const

/**
 * The cell-scoped tiers. Spread into `overrides`.
 *
 * The two regimes (B4) are the reason these are overrides and not flat rules:
 * the core is one path, the shell is imperative, and a rule that binds one
 * regime fires on correct code in the other.
 *
 * @public
 */
export const overrides = [
  {
    files: [...PURE_CELLS],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-imports': ['error', { paths: [...IO_MODULES, EFFECT_RUNTIME_IMPORT], patterns: [ADAPTER_GROUP] }],
    },
  },
  {
    files: [...KERNEL_CELLS],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-imports': ['error', { paths: [...IO_MODULES], patterns: [DOMAIN_GROUP_FOR_KERNEL] }],
    },
  },
  {
    files: [...FRONT_HALF_CELLS],
    rules: { 'no-restricted-imports': ['error', { patterns: [SHELL_GROUP_FOR_FRONT_HALF] }] },
  },
  {
    files: [...TERMINUS_CELLS],
    rules: { 'no-restricted-imports': ['error', { patterns: [BYPASS_GROUP_FOR_TERMINUS] }] },
  },
  {
    files: [...OBSERVER_FILES],
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-standalone-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-identical-title': 'error',
    },
  },
] as const

const universalRules = {
  'typescript/no-explicit-any': 'error',
  'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'typescript/no-unsafe-argument': 'error',
  'typescript/no-unsafe-assignment': 'error',
  'typescript/no-unsafe-call': 'error',
  'typescript/no-unsafe-member-access': 'error',
  'typescript/no-unsafe-return': 'error',
  'typescript/no-non-null-assertion': 'error',
  'typescript/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
  'unicorn/no-abusive-eslint-disable': 'error',
  'typescript/no-floating-promises': 'error',
  'typescript/no-misused-promises': 'error',
  'typescript/await-thenable': 'error',
  'typescript/only-throw-error': 'error',
  'no-throw-literal': 'error',
  'typescript/no-unnecessary-condition': 'error',
  'typescript/strict-boolean-expressions': 'error',
  'typescript/no-unnecessary-type-assertion': 'error',
  'typescript/switch-exhaustiveness-check': [
    'error',
    { allowDefaultCaseForExhaustiveSwitch: false, considerDefaultExhaustiveForUnions: false },
  ],
  'typescript/no-base-to-string': 'error',
  'typescript/explicit-module-boundary-types': 'error',
  'import/no-cycle': 'error',
  'import/no-mutable-exports': 'error',
  'no-var': 'error',
} as const

export default {
  meta: { name: PLUGIN_NAME },
  rules: {},
  configs: {
    recommended: {
      rules: universalRules,
    },
  },
}
