#!/usr/bin/env node
/**
 * Postinstall script: patches @stryker-mutator/core's ts-config-preprocessor.js
 * to replace the two removed TS6 API calls with inline implementations:
 *   ts.parseConfigFileTextToJson → inline string-aware JSON comment stripper
 *   ts.resolveProjectReferencePath → inline path resolver
 *
 * Runs after every `pnpm install` to survive reinstall.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'

const pnpmDir = new URL('../node_modules/.pnpm/', import.meta.url)
const entries = readdirSync(pnpmDir)
const coreDirs = entries.filter(e => e.startsWith('@stryker-mutator+core@9.6.1') && !e.includes('patch_hash'))

/** Replace `import('typescript'); const { config } = ts.parseConfigFileTextToJson(...)` with inline parser */
function patchParseConfigFileTextToJson(content) {
  const old = `                const { default: ts } = await import('typescript');\n                const { config } = ts.parseConfigFileTextToJson(tsconfigFileName, await tsconfigFile.readContent());`
  const repl = `                let config;\n                try {\n                    const content = await tsconfigFile.readContent();\n                    let stripped = '';\n                    let inStr = false, strCh = null;\n                    for (let i = 0; i < content.length; i++) {\n                        const ch = content[i], nxt = content[i + 1];\n                        if (inStr) { stripped += ch; if (ch === '\\\\' && strCh) { stripped += content[++i]; continue; } if (ch === strCh) { inStr = false; strCh = null; } continue; }\n                        if (ch === '"' || ch === "'") { inStr = true; strCh = ch; stripped += ch; continue; }\n                        if (ch === '/' && nxt === '/') { while (i < content.length && content[i] !== '\\n') i++; continue; }\n                        if (ch === '/' && nxt === '*') { i += 2; while (i < content.length) { if (content[i] === '*' && content[i + 1] === '/') { i += 2; break; } i++; } continue; }\n                        stripped += ch;\n                    }\n                    config = JSON.parse(stripped);\n                } catch { config = void 0; }`
  return content.includes(old) ? content.replace(old, repl) : null
}

/** Replace `import('typescript'); ts.resolveProjectReferencePath(reference)` with inline resolver */
function patchResolveProjectReferencePath(content) {
  const old = `        const { default: ts } = await import('typescript');\n        if (Array.isArray(config.references)) {\n            for (const reference of config.references) {\n                const referencePath = ts.resolveProjectReferencePath(reference);`
  const repl = `        if (Array.isArray(config.references)) {\n            for (const reference of config.references) {\n                const referencePath = reference.path.endsWith('.json') ? reference.path : reference.path + '/tsconfig.json';`
  return content.includes(old) ? content.replace(old, repl) : null
}

let totalPatched = 0
for (const dir of coreDirs) {
  const jsPath = `${pnpmDir}${dir}/node_modules/@stryker-mutator/core/dist/src/sandbox/ts-config-preprocessor.js`
  if (!existsSync(jsPath)) continue

  let content = readFileSync(jsPath, 'utf8')

  // Skip if already fully patched (both replacements applied)
  if (content.includes('let stripped =') && !content.includes('ts.resolveProjectReferencePath')) continue

  const r1 = patchParseConfigFileTextToJson(content)
  if (r1) content = r1

  const r2 = patchResolveProjectReferencePath(content)
  if (r2) content = r2

  if (r1 || r2) {
    writeFileSync(jsPath, content)
    totalPatched++
    console.log(`[postinstall] Patched ${dir} (parse:${!!r1}, resolve:${!!r2})`)
  }
}

if (totalPatched === 0) {
  console.log('[postinstall] @stryker-mutator/core already fully patched')
} else {
  console.log(`[postinstall] Patched ${totalPatched} @stryker-mutator/core copies for TS7 compatibility`)
}
