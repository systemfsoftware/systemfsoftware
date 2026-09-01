const codes = {
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  grey: '\u001b[90m',
  cyan: '\u001b[36m',
  greenBright: '\u001b[92m',
  redBright: '\u001b[91m',
  blueBright: '\u001b[94m',
} as const

export type AnsiColor = keyof typeof codes

const reset = '\u001b[39m'

function wrap(color: AnsiColor, text: string): string {
  return `${codes[color]}${text}${reset}`
}

export const ansi = {
  wrap,
  red: (text: string): string => wrap('red', text),
  green: (text: string): string => wrap('green', text),
  yellow: (text: string): string => wrap('yellow', text),
  grey: (text: string): string => wrap('grey', text),
  cyan: (text: string): string => wrap('cyan', text),
  greenBright: (text: string): string => wrap('greenBright', text),
  redBright: (text: string): string => wrap('redBright', text),
  blueBright: (text: string): string => wrap('blueBright', text),
}

export function colorEnabled(enabled: boolean, color: AnsiColor, text: string): string {
  if (enabled) {
    return wrap(color, text)
  }
  return text
}
