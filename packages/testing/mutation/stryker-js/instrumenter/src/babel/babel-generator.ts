import generator from '@babel/generator'

/**
 * `@babel/generator` is CommonJS. Under Node's own ESM interop a default import
 * of it is the module's `exports` object, so the code generator sits behind
 * `.default` — the shape upstream reaches for, because upstream ships one
 * emitted file per source file. This package ships a bundle, where the default
 * import is already the function and `.default` is `undefined`, which fails at
 * the first mutant with `generator is not a function` rather than at build
 * time. Resolving both shapes once keeps the printers and the mutant's
 * replacement code identical under either layout.
 */
export const generate = typeof generator === 'function'
  ? generator
  : generator.default
