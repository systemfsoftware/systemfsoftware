/**
 * Augments ImportMeta with the vitest marker so `deno check` type-checks the
 * in-source `if (import.meta.vitest)` property blocks. The member type matches
 * vitest's own `vitest/importMeta` declaration, so the interfaces merge cleanly
 * when both are in a program.
 */
declare global {
  interface ImportMeta {
    readonly vitest: boolean
  }
}

export {}
