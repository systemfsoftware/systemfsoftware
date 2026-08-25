import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'

const KNOWN_EMOJI: Record<string, true> = {
  '✅': true,
  '🙈': true,
  '🤥': true,
  '👽': true,
  '⏰': true,
  '⌛': true,
  '💥': true,
}

export function plural(items: number): string {
  if (items > 1) {
    return 's'
  } else {
    return ''
  }
}

export function getEmojiForStatus(status: schema.MutantStatus): string {
  switch (status) {
    case 'Killed':
      return '✅'
    case 'NoCoverage':
      return '🙈'
    case 'Ignored':
      return '🤥'
    case 'Survived':
      return '👽'
    case 'Timeout':
      return '⏰'
    case 'Pending':
      return '⌛'
    case 'RuntimeError':
    case 'CompileError':
      return '💥'
  }
}

export function stringWidth(input: string): number {
  let width = 0
  for (const char of input) {
    if (KNOWN_EMOJI[char]) {
      width += 2
    } else {
      const cp = char.codePointAt(0) ?? 0
      if (cp > 0xffff) {
        width += 2
      } else {
        width += 1
      }
    }
  }
  return width
}
