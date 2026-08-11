export const HEAD_CHARS = 'ghjkmnpqrstvwxyz' as const

export const BODY_CHARS = '0123456789abcdefghjkmnpqrstvwxyz' as const

export const TASK_ID_LENGTH = 5 as const

export const TASK_ID_PREFIX_MAX_LENGTH = 5 as const

export const TASK_ID_PATTERN = new RegExp(`^[${HEAD_CHARS}][0-9][${BODY_CHARS}]{3}$`)

export const TASK_ID_PREFIX_PATTERN = new RegExp(`^[${HEAD_CHARS}][${BODY_CHARS}]{0,4}$`)

export const isHeadChar = (char: string): boolean => char.length === 1 && HEAD_CHARS.includes(char)

export const isBodyChar = (char: string): boolean => char.length === 1 && BODY_CHARS.includes(char)

export const isTaskIdShape = (value: string): boolean => TASK_ID_PATTERN.test(value)

export const isTaskIdPrefixShape = (value: string): boolean => TASK_ID_PREFIX_PATTERN.test(value)

export const stripTaskIdHyphens = (input: string): string => input.replace(/-/g, '')

export const normalizeTaskIdInput = (input: string): string =>
  stripTaskIdHyphens(input).toLowerCase().replace(/[ilo]/g, (char) => (char === 'o' ? '0' : '1'))

export const isAmbiguousHeadChar = (char: string): boolean =>
  char.length === 1 && (char === 'i' || char === 'l' || char === 'o')
