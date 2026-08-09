export type AnsiColor =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'gray'
  | 'white'

export type AnsiAnnotation = {
  readonly color?: AnsiColor
  readonly bold?: boolean
}

const colorCode = (c: AnsiColor): string => {
  switch (c) {
    case 'red':
      return '31'
    case 'green':
      return '32'
    case 'yellow':
      return '33'
    case 'blue':
      return '34'
    case 'magenta':
      return '35'
    case 'cyan':
      return '36'
    case 'gray':
      return '90'
    case 'white':
      return '37'
  }
}

export const annotate = (text: string, anno: AnsiAnnotation): string => {
  if (anno.color === undefined && !anno.bold) return text
  const parts: Array<string> = []
  if (anno.bold) parts.push('1')
  if (anno.color !== undefined) parts.push(colorCode(anno.color))
  return `\u001b[${parts.join(';')}m${text}\u001b[0m`
}

export const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '')

export const colorizeCell = (
  cell: string,
  color: boolean,
  annotations: Record<string, AnsiAnnotation>,
): string => {
  if (!color) return cell
  let out = cell
  for (const [marker, anno] of Object.entries(annotations)) {
    if (out.includes(marker)) {
      out = out.split(marker).join(annotate(marker, anno))
    }
  }
  return out
}
