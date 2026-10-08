import { Effect, Schema as S } from 'effect'

export interface FakeApi {
  readonly object: string
  readonly members: readonly string[]
}

export const DEFAULT_FAKE_APIS: ReadonlyArray<FakeApi> = [
  { object: 'vi', members: ['mock', 'doMock', 'fn', 'spyOn', 'stubGlobal'] },
  { object: 'sb', members: ['mock'] },
]

export const Options = S.Struct({
  fakeApis: S.Array(S.Struct({ object: S.String, members: S.Array(S.String) })).pipe(
    S.annotate({
      description:
        "Test-double APIs to refuse: the global object a test calls a double on, and the members of that object (e.g. `vi.mock`, `vi.fn`). Defaults to Vitest's `vi` doubles and the `sb` storybook-global mock; name another harness's global here.",
    }),
    S.withDecodingDefaultType(Effect.succeed(DEFAULT_FAKE_APIS)),
  ),
  bannedModules: S.Array(S.String).pipe(
    S.annotate({
      description:
        'Modules whose import means the test faked the product: mock servers and DOM emulators. A bare name also bans its subpaths, so `msw` bans `msw/node`.',
    }),
    S.withDecodingDefaultType(Effect.succeed(['msw', 'jsdom', 'happy-dom', '@happy-dom'] as const)),
  ),
  bannedEnvironments: S.Array(S.String).pipe(
    S.annotate({
      description:
        "Values of vitest's `test.environment` that emulate a DOM instead of running a real browser. Defaults to the DOM emulator packages a mock server or DOM emulator ships.",
    }),
    S.withDecodingDefaultType(Effect.succeed(['jsdom', 'happy-dom'] as const)),
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const FAKE_API_MESSAGE =
  '`{{name}}` is a test double: a mock, spy or stub replaces real behavior, so the test proves the double, not the product. Exercise the real platform through its real handler instead.' as const

export const BANNED_IMPORT_MESSAGE =
  '`{{module}}` is a banned test dependency: a mock server or a DOM emulator lets a test run without the real product. Tests run in a real browser against the real stack; delete this import and use the real handler.' as const

export const BANNED_ENVIRONMENT_MESSAGE =
  "`environment: '{{environment}}'` runs vitest in an emulated DOM instead of a real browser. Use a real-browser environment so tests exercise the product." as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test never fakes the product with a mock, a DOM emulator or a mock server. The double APIs, the banned modules and the emulated environments are the fakeApis, bannedModules and bannedEnvironments options; each defaults to the harness this repo runs.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    fakeApi: FAKE_API_MESSAGE,
    bannedImport: BANNED_IMPORT_MESSAGE,
    bannedEnvironment: BANNED_ENVIRONMENT_MESSAGE,
  },
} as const
