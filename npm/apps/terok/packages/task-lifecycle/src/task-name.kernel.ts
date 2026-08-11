export const TASK_NAME_MAX_LENGTH = 60 as const

export const TASK_NAME_PATTERN = new RegExp('^[a-z0-9_](?:[a-z0-9_-]{0,58}[a-z0-9_])?$')

const STRIP_INVALID_RE = /[^a-z0-9_-]/g

const HYPHEN_RUN_RE = /-{2,}/g

const TRAILING_HYPHENS_RE = /-+$/g

export const sanitizeTaskName = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(STRIP_INVALID_RE, '')
    .replace(HYPHEN_RUN_RE, '-')
    .replace(TRAILING_HYPHENS_RE, '')
    .slice(0, TASK_NAME_MAX_LENGTH)

export const isValidTaskName = (name: string): boolean => name.length > 0 && !name.startsWith('-')

export const isValidTaskNameShape = (name: string): boolean => TASK_NAME_PATTERN.test(name)
