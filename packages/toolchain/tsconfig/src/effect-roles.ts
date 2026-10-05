// Typed source of the two Effect Language Service role presets and the preset's own opt-ins,
// rendered to effect.json, effect-entrypoint.json and opt-ins.json by scripts/render.ts.

import type { PresetOptIn, Role } from './effect-preset-opt-ins.schema.js'

export type RoleName = Role

export interface DiagnosticBlock {
  readonly id: string
  readonly comments: ReadonlyArray<string>
  readonly keys: ReadonlyArray<string>
}

export interface RoleSpec {
  readonly name: RoleName
  readonly headerComments: ReadonlyArray<string>
  readonly unstableApiComments: ReadonlyArray<string>
  readonly allowedUnstableApis: ReadonlyArray<string>
  readonly commentOverrides: Readonly<Record<string, ReadonlyArray<string>>>
  readonly droppedKeys: ReadonlyArray<string>
}

// Every diagnostic @effect/tsgo@0.48.1 ships, grouped by the intent of the rule family.
// The union of `keys` across these blocks must equal the schema's 118 keys exactly; the
// schema-coverage test enforces it.
export const diagnosticBlocks: ReadonlyArray<DiagnosticBlock> = [
  {
    id: 'reject',
    comments: ['Effect values and services the type system must reject.'],
    keys: [
      'classSelfMismatch',
      'effectFnImplicitAny',
      'effectInFailure',
      'effectInVoidSuccess',
      'extendsNativeError',
      'genericEffectServices',
      'globalErrorInEffectCatch',
      'globalErrorInEffectFailure',
      'nonObjectEffectServiceType',
      'overriddenSchemaConstructor',
      'promiseInEffectSuccess',
      'schemaLiteralNonFinite',
      'schemaNumber',
      'schemaOpaqueInstanceMember',
      'schemaStructWithTag',
      'schemaUnionOfLiterals',
      'unknownInEffectCatch',
    ],
  },
  {
    id: 'obsolete',
    comments: ['Removed upstream packages are reached through `effect` again.'],
    keys: ['obsoleteMatchImport', 'obsoleteSchemaImport'],
  },
  {
    id: 'globals',
    comments: [
      'Library code reads no clock, randomness, environment, network, or console; the runner supplies those.',
    ],
    keys: [
      'abortControllerInEffect',
      'asyncFunction',
      'cryptoRandomUUID',
      'cryptoRandomUUIDInEffect',
      'globalConsole',
      'globalConsoleInEffect',
      'globalDate',
      'globalDateInEffect',
      'globalFetch',
      'globalFetchInEffect',
      'globalRandom',
      'globalRandomInEffect',
      'globalTimers',
      'globalTimersInEffect',
      'processEnvInEffect',
      'schemaSync',
      'schemaSyncInEffect',
      'tryCatchInEffectGen',
    ],
  },
  {
    id: 'lazy',
    comments: [
      'Effects are lazy descriptions, run once at the edge; nothing here starts work by itself.',
    ],
    keys: [
      'effectFnIife',
      'effectGenUsesAdapter',
      'floatingEffect',
      'floatingEffectInVitest',
      'lazyEffect',
      'lazyPromiseInEffectSync',
      'missingReturnYieldStar',
      'missingStarInYieldEffectGen',
      'newPromise',
      'returnEffectInGen',
      'runEffectInsideEffect',
    ],
  },
  {
    id: 'dependencies',
    comments: ['Dependencies are declared and wired at one composition point.'],
    keys: [
      'duplicatePackage',
      'layerMergeAllWithDependencies',
      'leakingRequirements',
      'missingEffectContext',
      'missingEffectServiceDependency',
      'missingLayerContext',
      'multipleEffectProvide',
      'scopeInLayerEffect',
      'serviceNotAsClass',
      'strictEffectProvide',
    ],
  },
  {
    id: 'schema',
    comments: ['Outside data enters through a schema, not a cast.'],
    keys: [
      'instanceOfSchema',
      'missingEffectError',
      'newSchemaClass',
      'preferSchemaOverJson',
      'preferSchemaTypeProperty',
      'unsafeEffectTypeAssertion',
    ],
  },
  {
    id: 'keys',
    comments: ['A key or tag must answer "of what?".'],
    keys: ['deterministicKeys', 'redundantSchemaTagIdentifier'],
  },
  {
    id: 'smaller',
    comments: ['Prefer the smaller construct.'],
    keys: [
      'acquireReleaseDisposable',
      'allOfMapToForEach',
      'catchAllTagDispatchToCatchTag',
      'catchAllToMapError',
      'catchChainToFirstSuccessOf',
      'catchConditionalRefailToCatchIf',
      'catchDieToOrDie',
      'catchIfTagToCatchTag',
      'catchRefailToTapError',
      'catchTagToCatchReason',
      'catchToIgnore',
      'catchToOrElseSucceed',
      'catchUnfailableEffect',
      'effectDoNotation',
      'effectFnOpportunity',
      'effectMapFlatten',
      'effectMapVoid',
      'effectSucceedWithVoid',
      'flatMapConditionalToFilterOrFail',
      'flatMapIgnoredParamToAndThen',
      'flatMapToMap',
      'mapSomeToAsSome',
      'matchEffectToMapBoth',
      'matchEffectToMatch',
      'multipleCatchTag',
      'nestedEffectGenYield',
      'optionMatchToFromOption',
      'outdatedApi',
      'preferSucceedSomeOrNone',
      'preferTypedSchemaDecoder',
      'preferUnsafeConstructor',
      'provideLayerSucceedToProvideService',
      'raceFirstWithSleepToTimeout',
      'redundantMapError',
      'redundantOrDie',
      'runOfExitToRunExit',
      'syncToSucceed',
      'timeoutCatchTagToTimeoutOrElse',
      'unnecessaryArrowBlock',
      'unnecessaryEffectGen',
      'unnecessaryFailYieldableError',
      'unnecessaryPipe',
      'unnecessaryPipeChain',
      'unnecessaryTypeofType',
    ],
  },
  {
    id: 'stability',
    comments: [
      'Effect APIs tagged @stability are reached only through a declared opt-in; an ungranted import is an error.',
    ],
    keys: ['experimentalApiUsage', 'unstableApiUsage'],
  },
  {
    id: 'boolean',
    comments: ['A condition states its comparison, not its truthiness.'],
    keys: ['strictBooleanExpressions'],
  },
  {
    id: 'pipeable',
    comments: [
      'Exported combinators take a data-last form beside the data-first form, so they compose in .pipe.',
    ],
    keys: ['missingPipeableSignature'],
  },
  {
    id: 'pipe-opportunity',
    comments: ['Nested call chains are written as .pipe.'],
    keys: ['missedPipeableOpportunity'],
  },
  {
    id: 'process-env',
    comments: ['Configuration is injected, never read from process.env.'],
    keys: ['processEnv'],
  },
  {
    id: 'node-builtin',
    comments: ['Node builtins are reached through their Effect-native counterparts.'],
    keys: ['nodeBuiltinImport'],
  },
  {
    id: 'error-context',
    comments: ['Failures carry typed errors, never any or unknown.'],
    keys: ['anyUnknownInErrorContext'],
  },
]

const KEY_PATTERNS: ReadonlyArray<string> = [
  '          { "target": "service", "pattern": "default", "skipLeadingPath": ["src/"] },',
  '          { "target": "error", "pattern": "default", "skipLeadingPath": ["src/"] }',
]

const roleHeaderLibrary: ReadonlyArray<string> = [
  'Effect Language Service policy (@effect/tsgo) for shipped library code. Every diagnostic',
  'the plugin ships is listed explicitly: a rule missing here would fall back to its upstream',
  'default severity instead of ours.',
]

const roleHeaderEntrypoint: ReadonlyArray<string> = [
  'Effect Language Service policy (@effect/tsgo) for entry points: tests, runnable examples,',
  'and composition packages that wire layers together. nodeBuiltinImport is the one rule absent',
  'here, because choosing the runtime\u2019s platform is the job of these files.',
]

const unstableCommentLibrary: ReadonlyArray<string> = [
  'effect/http and effect/observability are @stability unstable in Effect 4.0.1; shipped library',
  'code uses both, so the library role declares them here (opt-in `unstable-effect-http`,',
  '`unstable-effect-observability`, owner @ryanleecode, in opt-ins.json).',
]

const unstableCommentEntrypoint: ReadonlyArray<string> = [
  'The entry role declares the two library grants plus effect/testing, whose TestClock the test',
  'harness needs (opt-ins.json: `unstable-effect-http`, `unstable-effect-observability`,',
  '`unstable-effect-testing`; owner @ryanleecode).',
]

export const libraryRole: RoleSpec = {
  name: 'library',
  headerComments: roleHeaderLibrary,
  unstableApiComments: unstableCommentLibrary,
  allowedUnstableApis: ['effect/http', 'effect/observability'],
  commentOverrides: {},
  droppedKeys: [],
}

export const entrypointRole: RoleSpec = {
  name: 'test',
  headerComments: roleHeaderEntrypoint,
  unstableApiComments: unstableCommentEntrypoint,
  allowedUnstableApis: ['effect/http', 'effect/observability', 'effect/testing'],
  commentOverrides: {
    globals: ['Even where a real read is allowed, inside a generator it goes through Effect\u2019s services.'],
    lazy: ['Effects are lazy descriptions, run once at the edge.'],
    'process-env': [
      'Configuration is injected; process.env is read only where the program\u2019s configuration is built.',
    ],
  },
  droppedKeys: ['nodeBuiltinImport'],
}

export const roles: ReadonlyArray<RoleSpec> = [libraryRole, entrypointRole]

// The preset's own exceptions, published as `opt-ins.json` for the debt ledger. The shape
// mirrors `@systemfsoftware/opt-in`'s `OptIn` exactly so the ledger decodes it without the
// preset taking a runtime dependency on the contract.
export const presetOptIns: ReadonlyArray<PresetOptIn> = [
  {
    name: 'unstable-effect-http',
    reason: 'Effect 4.0.1 tags effect/http unstable; shipped library code serves and consumes HTTP.',
    owner: '@ryanleecode',
    grant: { _tag: 'UnstableApi', api: 'effect/http' },
  },
  {
    name: 'unstable-effect-observability',
    reason: 'Effect 4.0.1 tags effect/observability unstable; libraries emit metrics and traces through it.',
    owner: '@ryanleecode',
    grant: { _tag: 'UnstableApi', api: 'effect/observability' },
  },
  {
    name: 'unstable-effect-testing',
    reason: 'Effect 4.0.1 tags effect/testing unstable; entry points drive TestClock and the test harness.',
    owner: '@ryanleecode',
    grant: { _tag: 'UnstableApi', api: 'effect/testing', role: 'test' },
  },
  {
    name: 'entrypoint-node-builtin-import',
    reason: 'Choosing the runtime platform is the job of an entry point, so nodeBuiltinImport is excluded there.',
    owner: '@ryanleecode',
    grant: { _tag: 'DiagnosticExclusion', diagnostic: 'nodeBuiltinImport', role: 'test' },
  },
]

const indent = (depth: number): string => ' '.repeat(depth)

const commentLines = (comments: ReadonlyArray<string>, depth: number): ReadonlyArray<string> =>
  comments.map((comment) => `${indent(depth)}// ${comment}`)

const blockKeysFor = (role: RoleSpec, block: DiagnosticBlock): ReadonlyArray<string> =>
  block.keys.filter((key) => !role.droppedKeys.includes(key))

const blocksFor = (role: RoleSpec): ReadonlyArray<DiagnosticBlock> =>
  diagnosticBlocks
    .map((block) => ({
      id: block.id,
      comments: role.commentOverrides[block.id] ?? block.comments,
      keys: blockKeysFor(role, block),
    }))
    .filter((block) => block.keys.length > 0)

const offsetsFor = (blocks: ReadonlyArray<DiagnosticBlock>): ReadonlyArray<number> =>
  blocks.map((_, index) => blocks.slice(0, index).reduce((total, block) => total + block.keys.length, 0))

const commaSuffix = (isLast: boolean): string => isLast ? '' : ','

const leadingBreak = (isFirst: boolean): string => isFirst ? '' : '\n'

const severityLine = (key: string, isLast: boolean): string => `${indent(10)}"${key}": "error"${commaSuffix(isLast)}`

const blockBody = (block: DiagnosticBlock, base: number, total: number): string =>
  [
    ...commentLines(block.comments, 10),
    ...block.keys.map((key, index) => severityLine(key, base + index === total - 1)),
  ].join('\n')

const renderSeverity = (role: RoleSpec): string => {
  const blocks = blocksFor(role)
  const offsets = offsetsFor(blocks)
  const total = blocks.reduce((sum, block) => sum + block.keys.length, 0)
  return blocks
    .map((block, blockIndex) => `${leadingBreak(blockIndex === 0)}${blockBody(block, offsets[blockIndex] ?? 0, total)}`)
    .join('\n')
}

const inlineList = (values: ReadonlyArray<string>): string => `[${values.map((value) => `"${value}"`).join(', ')}]`

export const renderEffectJson = (role: RoleSpec): string =>
  `{
  "$schema": "https://json.schemastore.org/tsconfig",
${commentLines(role.headerComments, 2).join('\n')}
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "keyPatterns": [
${KEY_PATTERNS.join('\n')}
        ],
${commentLines(role.unstableApiComments, 8).join('\n')}
        "allowedUnstableApis": ${inlineList(role.allowedUnstableApis)},
        "diagnosticSeverity": {
${renderSeverity(role)}
        }
      }
    ]
  }
}
`

export const renderOptInsJson = (): string => `${JSON.stringify(presetOptIns, null, 2)}\n`

export const diagnosticKeysOf = (role: RoleSpec): ReadonlyArray<string> =>
  blocksFor(role).flatMap((block) => block.keys)
