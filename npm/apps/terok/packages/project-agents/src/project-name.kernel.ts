export const SLUG_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

export const isValidSlugName = (raw: string): boolean => SLUG_NAME_PATTERN.test(raw)

export const slugifyName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')

export const isReservedName = (name: string, reserved: ReadonlySet<string>): boolean => reserved.has(name)
