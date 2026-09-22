/// <reference types="vitest/importMeta" />
import type * as FileSystem from 'effect/FileSystem'

export interface AccessConstants {
  readonly F_OK: number
  readonly R_OK: number
  readonly W_OK: number
}

export interface AccessOptions {
  readonly ok?: boolean | undefined
  readonly readable?: boolean | undefined
  readonly writable?: boolean | undefined
}

export interface MakeDirectoryOptions {
  readonly recursive?: boolean | undefined
  readonly mode?: number | undefined
}

export interface CopyOptions {
  readonly overwrite?: boolean | undefined
  readonly preserveTimestamps?: boolean | undefined
}

export interface RemoveOptions {
  readonly recursive?: boolean | undefined
  readonly force?: boolean | undefined
}

export interface OpenOptions {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

export interface WriteFileOptions {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

export interface GlobOptions {
  readonly root?: string | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
}

export interface TempOptions {
  readonly directory?: string | undefined
  readonly prefix?: string | undefined
  readonly suffix?: string | undefined
}

const withReadable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.readable === true) {
    return mode | constants.R_OK
  }
  return mode
}

const withWritable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.writable === true) {
    return mode | constants.W_OK
  }
  return mode
}

const accessModeFromOptions = (constants: AccessConstants, options: AccessOptions): number =>
  withWritable(withReadable(constants.F_OK, constants, options), constants, options)

export const accessModeOf = (constants: AccessConstants, options?: AccessOptions): number => {
  if (options === undefined) {
    return constants.F_OK
  }
  return accessModeFromOptions(constants, options)
}

const modeOrDefault = (mode: number | undefined): number => {
  if (mode === undefined) {
    return 0o755
  }
  return mode
}

const isRecursive = (options?: MakeDirectoryOptions | RemoveOptions): boolean =>
  options !== undefined && options.recursive === true

const makeDirectoryMode = (options?: MakeDirectoryOptions): number => {
  if (options === undefined) {
    return 0o755
  }
  return modeOrDefault(options.mode)
}

export const makeDirectoryArgsOf = (
  options?: MakeDirectoryOptions,
): { readonly recursive: boolean; readonly mode: number } => ({
  recursive: isRecursive(options),
  mode: makeDirectoryMode(options),
})

const isOverwrite = (options?: CopyOptions): boolean => options !== undefined && options.overwrite === true

const isPreserveTimestamps = (options?: CopyOptions): boolean =>
  options !== undefined && options.preserveTimestamps === true

export const copyArgsOf = (
  options?: CopyOptions,
): { readonly force: boolean; readonly preserveTimestamps: boolean; readonly recursive: true } => ({
  force: isOverwrite(options),
  preserveTimestamps: isPreserveTimestamps(options),
  recursive: true,
})

const isForce = (options?: RemoveOptions): boolean => options !== undefined && options.force === true

export const removeArgsOf = (
  options?: RemoveOptions,
): { readonly recursive: boolean; readonly force: boolean } => ({
  recursive: isRecursive(options),
  force: isForce(options),
})

const flagOrDefault = (flag: FileSystem.OpenFlag | undefined): FileSystem.OpenFlag => {
  if (flag === undefined) {
    return 'r'
  }
  return flag
}

const openArgsWithMode = (
  flag: FileSystem.OpenFlag,
  mode: number | undefined,
): { readonly flag: FileSystem.OpenFlag; readonly mode?: number } => {
  if (mode === undefined) {
    return { flag }
  }
  return { flag, mode }
}

const openOptionsFlag = (options?: OpenOptions): FileSystem.OpenFlag | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.flag
}

const openOptionsMode = (options?: OpenOptions): number | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.mode
}

export const openArgsOf = (
  options?: OpenOptions,
): { readonly flag: FileSystem.OpenFlag; readonly mode?: number } => {
  const flag = flagOrDefault(openOptionsFlag(options))
  const mode = openOptionsMode(options)
  return openArgsWithMode(flag, mode)
}

const withWriteFileMode = (
  args: { readonly flag?: FileSystem.OpenFlag },
  mode: number | undefined,
): { readonly flag?: FileSystem.OpenFlag; readonly mode?: number } => {
  if (mode === undefined) {
    return args
  }
  return { ...args, mode }
}

const writeFileBaseArgs = (
  flag: FileSystem.OpenFlag | undefined,
): { readonly flag?: FileSystem.OpenFlag } => {
  if (flag === undefined) {
    return {}
  }
  return { flag }
}

const writeFileOptionsFlag = (options?: WriteFileOptions): FileSystem.OpenFlag | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.flag
}

const writeFileOptionsMode = (options?: WriteFileOptions): number | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.mode
}

export const writeFileArgsOf = (
  options?: WriteFileOptions,
): { readonly flag?: FileSystem.OpenFlag; readonly mode?: number } => {
  const flag = writeFileOptionsFlag(options)
  const mode = writeFileOptionsMode(options)
  return withWriteFileMode(writeFileBaseArgs(flag), mode)
}

const withGlobExclude = (
  args: { readonly cwd?: string },
  exclude: ReadonlyArray<string> | undefined,
): { readonly cwd?: string; readonly exclude?: Array<string> } => {
  if (exclude === undefined) {
    return args
  }
  return { ...args, exclude: [...exclude] }
}

const globBaseArgs = (root: string | undefined): { readonly cwd?: string } => {
  if (root === undefined) {
    return {}
  }
  return { cwd: root }
}

const globOptionsRoot = (options?: GlobOptions): string | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.root
}

const globOptionsExclude = (options?: GlobOptions): ReadonlyArray<string> | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.exclude
}

export const globArgsOf = (
  options?: GlobOptions,
): { readonly cwd?: string; readonly exclude?: Array<string> } => {
  const root = globOptionsRoot(options)
  const exclude = globOptionsExclude(options)
  return withGlobExclude(globBaseArgs(root), exclude)
}

const directoryOrDefault = (directory: string | undefined): string => {
  if (directory === undefined) {
    return '/tmp'
  }
  return directory
}

const suffixOrEmpty = (suffix: string | undefined): string => {
  if (suffix === undefined) {
    return ''
  }
  return suffix
}

const prefixOrDefault = (prefix: string | undefined): string => {
  if (prefix === undefined) {
    return ''
  }
  return prefix
}

const tempFileNameOf = (prefix: string, entropy: string, suffix?: string): string =>
  prefix + entropy + suffixOrEmpty(suffix)

const tempEntryForKind = (
  kind: 'file' | 'directory',
  parent: string,
  prefix: string,
  entropy: string,
  suffix?: string,
): string => {
  if (kind === 'directory') {
    return parent + prefix
  }
  return parent + tempFileNameOf(prefix, entropy, suffix)
}

const tempDirectory = (options?: TempOptions): string => {
  if (options === undefined) {
    return '/tmp'
  }
  return directoryOrDefault(options.directory)
}

const tempPrefix = (options?: TempOptions): string => {
  if (options === undefined) {
    return ''
  }
  return prefixOrDefault(options.prefix)
}

const tempSuffix = (options?: TempOptions): string | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.suffix
}

const tempParentOf = (options?: TempOptions): string => tempDirectory(options) + '/.'

export const tempEntryOf = (
  kind: 'file' | 'directory',
  options?: TempOptions,
  entropy: string = '',
): string => {
  const parent = tempParentOf(options)
  const prefix = tempPrefix(options)
  const suffix = tempSuffix(options)
  return tempEntryForKind(kind, parent, prefix, entropy, suffix)
}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

  const CONSTANTS = { F_OK: 0, R_OK: 4, W_OK: 2 }

  const bit = (on: boolean, value: number): number => (on ? value : 0)

  const OPEN_FLAGS = ['r', 'r+', 'w', 'wx', 'w+', 'wx+', 'a', 'ax', 'a+', 'ax+'] as const

  const ACCESS_OPTS = Schema.Struct({
    readable: Schema.optional(Schema.Boolean),
    writable: Schema.optional(Schema.Boolean),
  })

  const MKDIR_OPTS = Schema.Struct({ mode: Schema.optional(Schema.Finite) })

  const COPY_OPTS = Schema.Struct({
    overwrite: Schema.optional(Schema.Boolean),
    preserveTimestamps: Schema.optional(Schema.Boolean),
  })

  const REMOVE_OPTS = Schema.Struct({
    recursive: Schema.optional(Schema.Boolean),
    force: Schema.optional(Schema.Boolean),
  })

  const OPEN_OPTS = Schema.Struct({
    flag: Schema.optional(Schema.Literals(OPEN_FLAGS)),
    mode: Schema.optional(Schema.Finite),
  })

  const GLOB_OPTS = Schema.Struct({
    root: Schema.optional(Schema.String),
    exclude: Schema.optional(Schema.Array(Schema.String)),
  })

  const TEMP_OPTS = Schema.Struct({
    directory: Schema.optional(Schema.String),
    prefix: Schema.optional(Schema.String),
    suffix: Schema.optional(Schema.String),
  })

  it.prop('∀rw_AccessMode_≡RequestedBits', [ACCESS_OPTS], ([opts]) =>
    accessModeOf(CONSTANTS, opts) ===
      CONSTANTS.F_OK + bit(opts.readable === true, CONSTANTS.R_OK) + bit(opts.writable === true, CONSTANTS.W_OK))

  it.prop('∀m_MkdirMode_≡OrDefault', [MKDIR_OPTS], ([opts]) => makeDirectoryArgsOf(opts).mode === (opts.mode ?? 0o755))

  it.prop('∀m_MkdirRecursive_≡AlwaysFalse', [MKDIR_OPTS], ([opts]) => makeDirectoryArgsOf(opts).recursive === false)

  it.prop('∀o_CopyForce_≡Overwrite', [COPY_OPTS], ([opts]) => copyArgsOf(opts).force === (opts.overwrite ?? false))

  it.prop(
    '∀o_CopyPreserve_≡TimestampsFlag',
    [COPY_OPTS],
    ([opts]) => copyArgsOf(opts).preserveTimestamps === (opts.preserveTimestamps ?? false),
  )

  it.prop(
    '∀o_RemoveRecursive_≡Forwarded',
    [REMOVE_OPTS],
    ([opts]) => removeArgsOf(opts).recursive === (opts.recursive ?? false),
  )

  it.prop('∀o_RemoveForce_≡Forwarded', [REMOVE_OPTS], ([opts]) => removeArgsOf(opts).force === (opts.force ?? false))

  it.prop('∀o_OpenFlag_≡OrDefault', [OPEN_OPTS], ([opts]) => openArgsOf(opts).flag === (opts.flag ?? 'r'))

  it.prop('∀o_OpenMode_≡Forwarded', [OPEN_OPTS], ([opts]) => openArgsOf(opts).mode === opts.mode)

  it.prop('∀o_WriteFlag_≡Forwarded', [OPEN_OPTS], ([opts]) => writeFileArgsOf(opts).flag === opts.flag)

  it.prop('∀o_WriteMode_≡Forwarded', [OPEN_OPTS], ([opts]) => writeFileArgsOf(opts).mode === opts.mode)

  it.prop('∀o_GlobCwd_≡Root', [GLOB_OPTS], ([opts]) => globArgsOf(opts).cwd === opts.root)

  it.prop(
    '∀o_GlobExclude_≡CopiedJson',
    [GLOB_OPTS],
    ([opts]) => JSON.stringify(globArgsOf(opts).exclude) === JSON.stringify(opts.exclude),
  )

  it.prop(
    '∀o_DirectoryEntry_≡ParentPlusPrefix',
    [TEMP_OPTS],
    ([opts]) => tempEntryOf('directory', opts) === `${tempDirectory(opts)}/.${tempPrefix(opts)}`,
  )

  it.prop(
    '∀oe_FileEntry_≡ParentPlusName',
    [TEMP_OPTS, Schema.String],
    ([opts, entropy]) =>
      tempEntryOf('file', opts, entropy) ===
        `${tempDirectory(opts)}/.${tempFileNameOf(tempPrefix(opts), entropy, tempSuffix(opts))}`,
  )
}
