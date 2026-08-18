export type UntypedContext = {
  readonly packageName: string
  readonly packageVersion: string
  readonly typesPackageName: string | null
}

export const renderUntyped = (ctx: UntypedContext): string => {
  const lines: string[] = []
  lines.push(`Package ${ctx.packageName}@${ctx.packageVersion} has no types.`)
  if (ctx.typesPackageName !== null) {
    lines.push(`Install @types/${ctx.typesPackageName} for TypeScript support.`)
  } else {
    lines.push('No @types package found.')
  }
  return lines.join('\n')
}
