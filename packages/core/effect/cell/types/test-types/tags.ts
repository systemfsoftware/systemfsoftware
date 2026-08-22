/**
 * Tag carriers for the type-test fixtures. They live here, beside the `.tst.ts`
 * files rather than inside one, because a type-test fixture must contain no
 * runtime values — a `import type` of these aliases emits nothing — while the
 * fixtures still need real discriminants and may not hand-declare a `_tag`
 * member. `tstyche.json` matches only `*.tst.ts`, so this module is a plain
 * import rather than a test file.
 */
export const CmdTag = { _tag: 'Cmd' } as const
export type CmdTag = typeof CmdTag

export const DecTag = { _tag: 'Dec' } as const
export type DecTag = typeof DecTag

export const AltTag = { _tag: 'Alt' } as const
export type AltTag = typeof AltTag

export const ErrTag = { _tag: 'Err' } as const
export type ErrTag = typeof ErrTag
