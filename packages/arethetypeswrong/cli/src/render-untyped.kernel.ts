import * as Doc from '@effect/printer/Doc'

export type UntypedContext = {
  readonly packageName: string
  readonly packageVersion: string
  readonly typesPackageName: string | null
}

export const renderUntyped = (ctx: UntypedContext): Doc.Doc<never> => {
  const lines: Doc.Doc<never>[] = []
  lines.push(Doc.text(`Package ${ctx.packageName}@${ctx.packageVersion} has no types.`))
  if (ctx.typesPackageName !== null) {
    lines.push(Doc.text(`Install @types/${ctx.typesPackageName} for TypeScript support.`))
  } else {
    lines.push(Doc.text('No @types package found.'))
  }
  return Doc.vsep(lines)
}
