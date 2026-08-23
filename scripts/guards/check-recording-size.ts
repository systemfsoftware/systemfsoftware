#!/usr/bin/env -S deno run --allow-read --allow-env --allow-write=/tmp
import { dirname, join, relative, resolve } from '@std/path'
import ts from 'typescript'

const CEILING = 50

type Finding = {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly kind: 'oversize' | 'unmeasurable'
  readonly message: string
}

const MATCHERS: Record<string, true> = {
  toMatchFileSnapshot: true,
  toMatchInlineSnapshot: true,
  toMatchSnapshot: true,
}
const isMatcher = (name: string): boolean => Object.hasOwn(MATCHERS, name)
const countLines = (text: string): number => {
  if (text.length === 0) return 0
  const parts = text.split('\n')
  return text.endsWith('\n') ? parts.length - 1 : parts.length
}

const literalValue = (node: ts.Expression): string | null => {
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

const templateValue = (node: ts.Expression): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return (node as ts.StringLiteral | ts.NoSubstitutionTemplateLiteral).text
  }
  if (ts.isTemplateExpression(node)) {
    const te = node as ts.TemplateExpression
    return te.head.text + te.templateSpans.map((s) => s.literal.text).join('')
  }
  return null
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): { line: number; column: number } => {
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  return { line: pos.line + 1, column: pos.character + 1 }
}

const selectInlineRecording = (
  args: readonly ts.Expression[],
): { literal: ts.Expression } | { unmeasurable: string } => {
  if (args.length === 0) return { unmeasurable: 'UNMEASURABLE: no string-shaped argument (auto-fill form)' }
  const first = args[0]
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) || ts.isTemplateExpression(first)) {
    return { literal: first }
  }
  if (ts.isObjectLiteralExpression(first)) {
    if (args.length >= 2) {
      const second = args[1]
      if (ts.isStringLiteral(second) || ts.isNoSubstitutionTemplateLiteral(second) || ts.isTemplateExpression(second)) {
        return { literal: second }
      }
      return { unmeasurable: 'UNMEASURABLE: propertyMatchers form with non-literal snapshot argument' }
    }
    return { unmeasurable: 'UNMEASURABLE: propertyMatchers form with no snapshot argument' }
  }
  return { unmeasurable: 'UNMEASURABLE: first argument is not string-shaped' }
}

const findingsInSource = async (filePath: string, text: string): Promise<readonly Finding[]> => {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const pending: Promise<Finding | null>[] = []
  const immediate: Finding[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text
      if (isMatcher(name)) {
        const loc = lineOf(sf, node)
        if (name === 'toMatchFileSnapshot') {
          const arg = node.arguments[0] as ts.Expression | undefined
          if (!arg) {
            immediate.push({
              file: filePath,
              line: loc.line,
              column: loc.column,
              kind: 'unmeasurable',
              message: `${filePath}:${loc.line}:${loc.column}: UNMEASURABLE toMatchFileSnapshot has no argument`,
            })
          } else {
            const val = literalValue(arg)
            if (val === null) {
              immediate.push({
                file: filePath,
                line: loc.line,
                column: loc.column,
                kind: 'unmeasurable',
                message:
                  `${filePath}:${loc.line}:${loc.column}: UNMEASURABLE toMatchFileSnapshot argument is not a string literal`,
              })
              if (ts.isTemplateExpression(arg)) {
                const prefix = (arg as ts.TemplateExpression).head.text
                const lastSpan =
                  (arg as ts.TemplateExpression).templateSpans[(arg as ts.TemplateExpression).templateSpans.length - 1]
                const suffix = lastSpan ? lastSpan.literal.text : ''
                const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : ''
                const dirResolved = resolve(dirname(filePath), dirPart || '.')
                pending.push(
                  (async () => {
                    try {
                      for await (const entry of Deno.readDir(dirResolved)) {
                        if (!entry.isFile) continue
                        if (suffix && !entry.name.endsWith(suffix)) continue
                        const candidate = join(dirResolved, entry.name)
                        try {
                          const content = await Deno.readTextFile(candidate)
                          const lines = countLines(content)
                          if (lines > CEILING) {
                            const relCandidate = relative(Deno.cwd(), candidate)
                            immediate.push({
                              file: filePath,
                              line: loc.line,
                              column: loc.column,
                              kind: 'oversize',
                              message:
                                `${relCandidate} has ${lines} lines (ceiling ${CEILING}) — via ${filePath}:${loc.line}:${loc.column}`,
                            })
                          }
                        } catch { /* ignore */ }
                      }
                    } catch { /* dir not readable */ }
                    return null
                  })(),
                )
              }
            } else {
              const resolved = resolve(dirname(filePath), val)
              const relResolved = relative(Deno.cwd(), resolved)
              pending.push(
                Deno.readTextFile(resolved).then((content) => {
                  const lines = countLines(content)
                  if (lines > CEILING) {
                    return {
                      file: filePath,
                      line: loc.line,
                      column: loc.column,
                      kind: 'oversize' as const,
                      message:
                        `${filePath}:${loc.line}:${loc.column}: oversize recording toMatchFileSnapshot -> ${relResolved} has ${lines} lines (ceiling ${CEILING})`,
                    }
                  }
                  return null
                }).catch(() => ({
                  file: filePath,
                  line: loc.line,
                  column: loc.column,
                  kind: 'unmeasurable' as const,
                  message:
                    `${filePath}:${loc.line}:${loc.column}: UNMEASURABLE toMatchFileSnapshot target not readable: ${relResolved}`,
                })),
              )
            }
          }
        } else {
          const sel = selectInlineRecording(node.arguments as readonly ts.Expression[])
          if ('unmeasurable' in sel) {
            immediate.push({
              file: filePath,
              line: loc.line,
              column: loc.column,
              kind: 'unmeasurable',
              message: `${filePath}:${loc.line}:${loc.column}: ${sel.unmeasurable} at ${name}`,
            })
          } else {
            const val = templateValue(sel.literal)
            if (val === null) {
              immediate.push({
                file: filePath,
                line: loc.line,
                column: loc.column,
                kind: 'unmeasurable',
                message: `${filePath}:${loc.line}:${loc.column}: UNMEASURABLE ${name} snapshot not a string literal`,
              })
            } else {
              const lines = countLines(val)
              if (lines > CEILING) {
                immediate.push({
                  file: filePath,
                  line: loc.line,
                  column: loc.column,
                  kind: 'oversize',
                  message:
                    `${filePath}:${loc.line}:${loc.column}: oversize ${name} has ${lines} lines (ceiling ${CEILING})`,
                })
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const resolved = await Promise.all(pending)
  const fromPending = resolved.filter((f): f is Finding => f !== null)
  return [...immediate, ...fromPending]
}

const findingsInSnap = (filePath: string, text: string): readonly Finding[] => {
  const findings: Finding[] = []
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const seen: Record<string, true> = {}
  const visit = (node: ts.Node): void => {
    if (
      ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = node.expression.left
      const right = node.expression.right
      if (
        ts.isElementAccessExpression(left) && ts.isIdentifier(left.expression) && left.expression.text === 'exports'
      ) {
        const val = templateValue(right as ts.Expression)
        if (val !== null) {
          const lines = countLines(val)
          if (lines > CEILING) {
            const keyText = left.argumentExpression.getText(sf)
            const key = `${filePath}:${keyText}`
            if (!seen[key]) {
              seen[key] = true
              const loc = lineOf(sf, node)
              findings.push({
                file: filePath,
                line: loc.line,
                column: loc.column,
                kind: 'oversize',
                message:
                  `${filePath}:${loc.line}:${loc.column}: oversize .snap entry ${keyText} has ${lines} lines (ceiling ${CEILING})`,
              })
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

const isExcluded = (p: string): boolean => p.startsWith('repos/') || p.includes('/repos/')

const collectFiles = async (root: string): Promise<readonly string[]> => {
  const out: string[] = []
  const stack: string[] = [root]
  const skipDirs: Record<string, true> = {
    'node_modules': true,
    '.git': true,
    'dist': true,
    '.turbo': true,
    'repos': true,
  }
  while (stack.length > 0) {
    const dir = stack.pop()!
    for await (const entry of Deno.readDir(dir)) {
      const full = join(dir, entry.name)
      const rel = relative(Deno.cwd(), full).replaceAll('\\', '/')
      if (isExcluded(rel)) continue
      if (entry.isDirectory) {
        if (skipDirs[entry.name]) continue
        stack.push(full)
      } else if (entry.isFile) {
        if (rel.endsWith('.snap')) out.push(full)
        else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full)
      }
    }
  }
  return out
}

const scan = async (): Promise<readonly Finding[]> => {
  const root = Deno.cwd()
  const files = await collectFiles(root)
  const findings: Finding[] = []
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/')
    if (isExcluded(rel)) continue
    const text = await Deno.readTextFile(file)
    if (file.endsWith('.snap')) {
      findings.push(...findingsInSnap(rel, text))
    } else {
      findings.push(...await findingsInSource(rel, text))
    }
  }
  return findings
}

const selftest = async (): Promise<number> => {
  const tmp = await Deno.makeTempDir()
  try {
    const write = async (p: string, c: string): Promise<void> => {
      await Deno.mkdir(dirname(p), { recursive: true })
      await Deno.writeTextFile(p, c)
    }
    const long = Array.from({ length: 51 }, (_, i) => `line${i}`).join('\n')
    const short = 'a\nb\nc'
    const overFile = join(tmp, 'over.json')
    const underFile = join(tmp, 'under.json')
    await write(overFile, long)
    await write(underFile, short)

    type Case = {
      label: string
      file: string
      content: string
      expectKind: 'oversize' | 'unmeasurable' | 'pass'
      expectContains?: string
    }
    const cases: Case[] = [
      {
        label: 'toMatchFileSnapshot over ceiling fails',
        file: join(tmp, 'a.ts'),
        content: `expect(x).toMatchFileSnapshot(${JSON.stringify(overFile)})`,
        expectKind: 'oversize',
        expectContains: '51',
      },
      {
        label: 'toMatchFileSnapshot under ceiling passes',
        file: join(tmp, 'b.ts'),
        content: `expect(x).toMatchFileSnapshot(${JSON.stringify(underFile)})`,
        expectKind: 'pass',
      },
      {
        label: 'toMatchInlineSnapshot long fails',
        file: join(tmp, 'c.ts'),
        content: 'expect(x).toMatchInlineSnapshot(`' + long + '`)',
        expectKind: 'oversize',
      },
      {
        label: 'toMatchInlineSnapshot short passes',
        file: join(tmp, 'd.ts'),
        content: 'expect(x).toMatchInlineSnapshot(`short`)',
        expectKind: 'pass',
      },
      {
        label: 'propertyMatchers overload measured on second arg',
        file: join(tmp, 'e.ts'),
        content: 'expect(x).toMatchInlineSnapshot({ id: expect.any(Number) }, `' + long + '`)',
        expectKind: 'oversize',
      },
      {
        label: 'toMatchInlineSnapshot no arg unmeasurable',
        file: join(tmp, 'f.ts'),
        content: 'expect(x).toMatchInlineSnapshot()',
        expectKind: 'unmeasurable',
      },
      {
        label: 'non-literal path unmeasurable',
        file: join(tmp, 'g.ts'),
        content: 'expect(x).toMatchFileSnapshot(someVar)',
        expectKind: 'unmeasurable',
      },
      {
        label: 'non-literal template with interpolation unmeasurable',
        file: join(tmp, 'h.ts'),
        content: 'expect(x).toMatchFileSnapshot(`./${name}.json`)',
        expectKind: 'unmeasurable',
      },
      { label: 'no matcher passes', file: join(tmp, 'i.ts'), content: 'const x = 1;', expectKind: 'pass' },
      {
        label: 'recording outside __fixtures__ still found',
        file: join(tmp, 'outside.ts'),
        content: 'expect(x).toMatchInlineSnapshot(`' + long + '`)',
        expectKind: 'oversize',
      },
      {
        label: 'toMatchSnapshot overload propertyMatchers',
        file: join(tmp, 'j.ts'),
        content: 'expect(x).toMatchSnapshot({ a: expect.any(String) }, `' + long + '`)',
        expectKind: 'oversize',
      },
      {
        label: 'toMatchSnapshot no arg unmeasurable',
        file: join(tmp, 'k.ts'),
        content: 'expect(x).toMatchSnapshot()',
        expectKind: 'unmeasurable',
      },
    ]

    const fails: string[] = []
    for (const c of cases) {
      const f = await findingsInSource(c.file, c.content)
      const hasOversize = f.some((x) => x.kind === 'oversize')
      const hasUnmeas = f.some((x) => x.kind === 'unmeasurable')
      if (c.expectKind === 'oversize' && !hasOversize) {
        fails.push(`  expected oversize: ${c.label} got ${JSON.stringify(f)}`)
      }
      if (c.expectKind === 'unmeasurable' && !hasUnmeas) {
        fails.push(`  expected unmeasurable: ${c.label} got ${JSON.stringify(f)}`)
      }
      if (c.expectKind === 'pass' && (hasOversize || hasUnmeas)) {
        fails.push(`  expected pass: ${c.label} got ${JSON.stringify(f)}`)
      }
      if (c.expectContains && !f.some((x) => x.message.includes(c.expectContains!))) {
        fails.push(`  expected contains ${c.expectContains}: ${c.label}`)
      }
    }

    const snapSmall = 'small'
    const snapLong = long
    const snapContent = 'exports[`small entry`] = `' + snapSmall + '`;\nexports[`big entry`] = `' + snapLong +
      '`;\nexports[`another small`] = `hi`;\n'
    const snapFindings = findingsInSnap('test.snap', snapContent)
    if (snapFindings.length !== 1 || !snapFindings[0].message.includes('big entry')) {
      fails.push(`  expected snap single big entry: got ${JSON.stringify(snapFindings)}`)
    }

    if (fails.length > 0) {
      const text = `check-recording-size: selftest FAILED\n${fails.join('\n')}`
      await Deno.stderr.write(new TextEncoder().encode(text + '\n'))
      return 1
    }
    await Deno.stdout.write(new TextEncoder().encode(`check-recording-size: selftest ok (${cases.length + 1} cases)\n`))
    return 0
  } finally {
    await Deno.remove(tmp, { recursive: true }).catch(() => {})
  }
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) {
    Deno.exit(await selftest())
  }
  const findings = await scan()
  if (findings.length > 0) {
    const enc = new TextEncoder()
    for (const f of findings) await Deno.stderr.write(enc.encode(f.message + '\n'))
    await Deno.stderr.write(enc.encode(`\n${findings.length} recording size violation(s) (ceiling ${CEILING} lines)\n`))
    Deno.exit(1)
  }
  Deno.exit(0)
}
