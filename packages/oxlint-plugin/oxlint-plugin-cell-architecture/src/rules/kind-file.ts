export const RESOURCE_FILE_SUFFIX = '.resource.ts'
export const HANDLE_FILE_SUFFIX = '.handle.ts'
export const CELL_FILE_SUFFIX = '.cell.ts'
export const TYPE_TEST_SUFFIX = '.tst.ts'

export const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

export const isResourceFile = (filename: string): boolean => basenameOf(filename).endsWith(RESOURCE_FILE_SUFFIX)

export const isHandleFile = (filename: string): boolean => basenameOf(filename).endsWith(HANDLE_FILE_SUFFIX)

export const isCellFile = (filename: string): boolean => basenameOf(filename).endsWith(CELL_FILE_SUFFIX)

export const isTypeTestFile = (filename: string): boolean => filename.endsWith(TYPE_TEST_SUFFIX)
