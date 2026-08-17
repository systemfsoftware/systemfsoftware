import { Effect, Schema as S } from 'effect'
import { MESSAGE } from './path.config.js'

export const NO_SHELL_IMPORT_NAME = 'a *.integration.test.ts that imports no shell entry' as const
export const NO_SHELL_IMPORT_EXPECTED =
  'an import of an executor/handler/adapter/store/middleware, the package main/mod/index, or a non-foundation package' as const
export const NO_SHELL_IMPORT_ACTUAL =
  'a behaviour file that only imports gherkin, vitest, effect, and the pure cells under test' as const
export const NO_SHELL_IMPORT_FIX =
  'a behaviour test drives a real use case through the I/O sandwich. If the file imports no shell entry it is testing nothing that composes. Before adding one, ask whether the assertion is testing anything at all — if it restates a pure cell literal, delete the scenario; if it states an invariant that holds over generated inputs, move it to a *.property.test.ts beside the workflow, policy, or schema cell. Only when a real use case remains should an executor/handler/adapter/store/middleware import land here.' as const

export const Options = S.Struct({
  /**
   * Satisfies the shell-entry requirement with ANY relative import of the
   * package's own source (a specifier starting with `.`) — for a consumer
   * that has dismantled its suffix taxonomy, where the sandwich driver is a
   * plain-named module (a facade, a client, an executor renamed by domain).
   * The guarantee the rule actually owns survives: the file must reach the
   * package's own code, not just gherkin, vitest, effect, and the pure
   * cells under test.
   */
  admitSrcImports: S.Boolean.pipe(S.withDecodingDefaultType(Effect.succeed(false as const))),
})

export const meta = {
  type: 'problem',
  docs: {
    description:
      "A *.integration.test.ts must reach at least one shell entry — an executor/handler/adapter/store/middleware, the package main/mod/index, or a non-foundation package — so it actually drives a use case through the I/O sandwich rather than asserting in isolation. admitSrcImports (default false) additionally satisfies the requirement with any relative import of the package's own source, for a consumer that has dismantled its suffix taxonomy.",
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    noShellImport: MESSAGE,
  },
} as const
