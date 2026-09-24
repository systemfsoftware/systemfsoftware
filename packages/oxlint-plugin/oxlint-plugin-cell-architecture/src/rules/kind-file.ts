export const BLUEPRINT_FILE_SUFFIX = '.blueprint.ts'
export const RETIRED_RESOURCE_FILE_SUFFIX = '.resource.ts'
export const HANDLE_FILE_SUFFIX = '.handle.ts'
export const TYPE_TEST_SUFFIX = '.tst.ts'

export type KindFileKind = 'blueprint' | 'handle'

export const basenameOf = (filename: string): string => {
  const segments = filename.split(/[/\\]/)
  return segments[segments.length - 1] ?? filename
}

export const isBlueprintFile = (filename: string): boolean => basenameOf(filename).endsWith(BLUEPRINT_FILE_SUFFIX)

export const isRetiredResourceFile = (filename: string): boolean =>
  basenameOf(filename).endsWith(RETIRED_RESOURCE_FILE_SUFFIX)

export const isHandleFile = (filename: string): boolean => basenameOf(filename).endsWith(HANDLE_FILE_SUFFIX)

export const kindOfFile = (filename: string): KindFileKind | null => {
  if (isBlueprintFile(filename)) return 'blueprint'
  if (isHandleFile(filename)) return 'handle'
  return null
}

export const isTypeTestFile = (filename: string): boolean => filename.endsWith(TYPE_TEST_SUFFIX)
