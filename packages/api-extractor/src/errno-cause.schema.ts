import { Match, Schema, SchemaTransformation } from 'effect'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

/**
 * The Node `ErrnoException` a filesystem call raises: the symbolic name the OS reports under
 * `code`, the number it reports under `errno`, the call under `syscall`, and the paths Node
 * attaches. Node owns that shape, so it stays the encoded side byte for byte; the decoded side is
 * the cases the failure text distinguishes (see `filesystem-error-text.ts`).
 */

/** `ENOENT`: the path does not name anything. */
export const FileDoesNotExist = Schema.TaggedStruct('FileDoesNotExist', {
  path: Schema.optionalKey(Schema.String),
  message: Schema.String,
})
export type FileDoesNotExist = typeof FileDoesNotExist.Type

/** `ENOTDIR`: a component of the path is a file where a folder is required. */
export const FolderDoesNotExist = Schema.TaggedStruct('FolderDoesNotExist', {
  path: Schema.optionalKey(Schema.String),
  message: Schema.String,
})
export type FolderDoesNotExist = typeof FolderDoesNotExist.Type

/** `EEXIST`: the destination names something already present. */
export const FileOrFolderAlreadyExists = Schema.TaggedStruct('FileOrFolderAlreadyExists', {
  dest: Schema.optionalKey(Schema.String),
  message: Schema.String,
})
export type FileOrFolderAlreadyExists = typeof FileOrFolderAlreadyExists.Type

/** `EPERM` raised by `unlink`: the link could not be removed. */
export const FileOrFolderCouldNotBeDeleted = Schema.TaggedStruct('FileOrFolderCouldNotBeDeleted', {
  path: Schema.optionalKey(Schema.String),
  message: Schema.String,
})
export type FileOrFolderCouldNotBeDeleted = typeof FileOrFolderCouldNotBeDeleted.Type

/** `EISDIR`: the path names a folder where a file is required. */
export const TargetIsAFolderNotAFile = Schema.TaggedStruct('TargetIsAFolderNotAFile', {
  path: Schema.optionalKey(Schema.String),
  message: Schema.String,
})
export type TargetIsAFolderNotAFile = typeof TargetIsAFolderNotAFile.Type

/** A raise whose `code` is not one of the cases above: the report falls back to Node's message. */
export const UnrecognizedErrno = Schema.TaggedStruct('UnrecognizedErrno', {
  message: Schema.String,
})
export type UnrecognizedErrno = typeof UnrecognizedErrno.Type

/** The cases a Node filesystem raise decodes into: the code it carried and the paths it named. */
export const ErrnoCase = Schema.Union([
  FileDoesNotExist,
  FolderDoesNotExist,
  FileOrFolderAlreadyExists,
  FileOrFolderCouldNotBeDeleted,
  TargetIsAFolderNotAFile,
  UnrecognizedErrno,
])
export type ErrnoCase = typeof ErrnoCase.Type

/** Node's ErrnoException shape, the encoded side of every case. */
interface NodeErrnoShape {
  readonly code?: string | undefined
  readonly errno?: number | undefined
  readonly syscall?: string | undefined
  readonly path?: string | undefined
  readonly dest?: string | undefined
  readonly message: string
}

const pathEntryOf = (path: string | undefined): { readonly path?: string } =>
  Option.match(Option.fromNullishOr(path), {
    onNone: () => ({}),
    onSome: (present) => ({ path: present }),
  })

const destEntryOf = (dest: string | undefined): { readonly dest?: string } =>
  Option.match(Option.fromNullishOr(dest), {
    onNone: () => ({}),
    onSome: (present) => ({ dest: present }),
  })

const errnoCaseOf = (errno: NodeErrnoShape): ErrnoCase =>
  Match.value(errno).pipe(
    Match.when(
      { code: 'ENOENT' },
      (raised): FileDoesNotExist => FileDoesNotExist.make({ ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.when(
      { code: 'ENOTDIR' },
      (raised): FolderDoesNotExist => FolderDoesNotExist.make({ ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.when(
      { code: 'EEXIST' },
      (raised): FileOrFolderAlreadyExists =>
        FileOrFolderAlreadyExists.make({ ...destEntryOf(raised.dest), message: raised.message }),
    ),
    Match.when(
      { code: 'EPERM', syscall: 'unlink' },
      (raised): FileOrFolderCouldNotBeDeleted =>
        FileOrFolderCouldNotBeDeleted.make({ ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.when(
      { code: 'EISDIR' },
      (raised): TargetIsAFolderNotAFile =>
        TargetIsAFolderNotAFile.make({ ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.orElse((raised): UnrecognizedErrno => UnrecognizedErrno.make({ message: raised.message })),
  )

const nodeErrnoShapeOf = (errnoCase: ErrnoCase): NodeErrnoShape =>
  Match.value(errnoCase).pipe(
    Match.tag(
      'FileDoesNotExist',
      (raised): NodeErrnoShape => ({ code: 'ENOENT', ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.tag(
      'FolderDoesNotExist',
      (raised): NodeErrnoShape => ({ code: 'ENOTDIR', ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.tag(
      'FileOrFolderAlreadyExists',
      (raised): NodeErrnoShape => ({ code: 'EEXIST', ...destEntryOf(raised.dest), message: raised.message }),
    ),
    Match.tag(
      'FileOrFolderCouldNotBeDeleted',
      (raised): NodeErrnoShape => ({
        code: 'EPERM',
        syscall: 'unlink',
        ...pathEntryOf(raised.path),
        message: raised.message,
      }),
    ),
    Match.tag(
      'TargetIsAFolderNotAFile',
      (raised): NodeErrnoShape => ({ code: 'EISDIR', ...pathEntryOf(raised.path), message: raised.message }),
    ),
    Match.tag('UnrecognizedErrno', (raised): NodeErrnoShape => ({ message: raised.message })),
    Match.exhaustive,
  )

export const ErrnoCause = Schema.Struct({
  code: Schema.optional(Schema.String),
  errno: Schema.optional(Schema.Finite),
  syscall: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  dest: Schema.optional(Schema.String),
  message: Schema.String,
}).pipe(
  Schema.decodeTo(
    ErrnoCase,
    SchemaTransformation.transform({ decode: errnoCaseOf, encode: nodeErrnoShapeOf }),
  ),
)
export type ErrnoCause = typeof ErrnoCause.Type

interface DistinguishableRaise {
  readonly label: string
  readonly raise: NodeErrnoShape
  readonly tag: string
}

/** Every Node raise the failure text distinguishes, with the case it must decode into. */
const DISTINGUISHED_RAISES: ReadonlyArray<DistinguishableRaise> = [
  { label: 'enoent', raise: { code: 'ENOENT', path: '/p/a.ts', message: 'no such file' }, tag: 'FileDoesNotExist' },
  {
    label: 'enoent-without-path',
    raise: { code: 'ENOENT', message: 'no such file' },
    tag: 'FileDoesNotExist',
  },
  {
    label: 'enotdir',
    raise: { code: 'ENOTDIR', path: '/p/a.ts', message: 'not a directory' },
    tag: 'FolderDoesNotExist',
  },
  {
    label: 'eexist',
    raise: { code: 'EEXIST', dest: '/p/b', message: 'already exists' },
    tag: 'FileOrFolderAlreadyExists',
  },
  {
    label: 'eexist-without-dest',
    raise: { code: 'EEXIST', message: 'already exists' },
    tag: 'FileOrFolderAlreadyExists',
  },
  {
    label: 'eperm-unlink',
    raise: { code: 'EPERM', syscall: 'unlink', path: '/p/a.ts', message: 'not permitted' },
    tag: 'FileOrFolderCouldNotBeDeleted',
  },
  {
    label: 'eperm-other-syscall',
    raise: { code: 'EPERM', syscall: 'open', path: '/p/a.ts', message: 'not permitted' },
    tag: 'UnrecognizedErrno',
  },
  {
    label: 'eisdir',
    raise: { code: 'EISDIR', path: '/p/a.ts', message: 'is a directory' },
    tag: 'TargetIsAFolderNotAFile',
  },
  {
    label: 'eacces',
    raise: { code: 'EACCES', path: '/p/a.ts', message: 'permission denied' },
    tag: 'UnrecognizedErrno',
  },
  { label: 'bare-message', raise: { message: 'a raise with no code' }, tag: 'UnrecognizedErrno' },
]

const raiseFor = (label: string): NodeErrnoShape =>
  Option.getOrElse(
    Option.map(
      Option.fromNullishOr(DISTINGUISHED_RAISES.find((candidate) => candidate.label === label)),
      (candidate) => candidate.raise,
    ),
    (): NodeErrnoShape => ({ message: '' }),
  )

const expectedCaseTagOf = (label: string): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.fromNullishOr(DISTINGUISHED_RAISES.find((candidate) => candidate.label === label)),
      (candidate) => candidate.tag,
    ),
  )

/** The case a labelled Node raise decodes into, or `undefined` when it is refused. */
const caseTagOf = (label: string): string | undefined =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(ErrnoCause)(raiseFor(label)), (decoded) => decoded._tag),
  )

const ERRNO_SEEDS: ReadonlyArray<number> = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  0,
  2,
]

const errnoAcceptedOf = (value: number): boolean =>
  Option.isSome(Schema.decodeOption(ErrnoCause)({ message: 'a raise', errno: value }))

const finiteErrno = (value: number): boolean => Number.isFinite(value)

const RAISE_LABELS = DISTINGUISHED_RAISES.map((candidate) => candidate.label)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀l_RaiseCase_≡Distinguished',
    { of: [Schema.Literals(RAISE_LABELS)], subject: caseTagOf },
    (subject, [label]) => subject(label) === expectedCaseTagOf(label),
  )

  it.prop(
    '∀n_ErrnoRefusal_≡Finite',
    { of: [Schema.Finite], subject: errnoAcceptedOf },
    (subject, [value]) =>
      Arr.every(
        Arr.append(ERRNO_SEEDS, value),
        (candidate) => subject(candidate) === finiteErrno(candidate),
      ),
  )
}
