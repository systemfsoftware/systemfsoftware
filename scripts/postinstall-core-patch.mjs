/**
 * Postinstall script: patches @stryker-mutator/core's ts-config-preprocessor.js
 * to replace the removed `ts.parseConfigFileTextToJson` call with an inline
 * JSON comment-stripping parser (for TS7 compatibility).
 *
 * This runs after every `pnpm install` to ensure the patch stays applied.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Resolve the actual installed path of @stryker-mutator/core
function resolveCorePreprocessor() {
  // Try the supports-color variant first
  const pnpmDir = new URL('../node_modules/.pnpm/', import.meta.url);
  const { readdirSync } = await import('node:fs');
  // ... we'll use a simpler approach
}

// Simpler approach: resolve from the package's own module path
function patchCore() {
  const cwd = process.cwd();
  const pnpmDir = `${cwd}/node_modules/.pnpm`;
  const { readdirSync, existsSync } = await import('node:fs');

  const entries = readdirSync(pnpmDir);
  const coreDirs = entries.filter(e =>
    e.startsWith('@stryker-mutator+core@9.6.1')
  );

  let patchedCount = 0;
  for (const dir of coreDirs) {
    const jsPath = `${pnpmDir}/${dir}/node_modules/@stryker-mutator/core/dist/src/sandbox/ts-config-preprocessor.js`;
    if (!existsSync(jsPath)) continue;

    let content = readFileSync(jsPath, 'utf8');

    // Skip if already patched
    if (content.includes('let stripped =')) {
      continue;
    }

    const oldCode = `                const { default: ts } = await import('typescript');
                const { config } = ts.parseConfigFileTextToJson(tsconfigFileName, await tsconfigFile.readContent());`;

    const newCode = `                let config;
                try {
                    const content = await tsconfigFile.readContent();
                    let stripped = '';
                    let inStr = false, strCh = null;
                    for (let i = 0; i < content.length; i++) {
                        const ch = content[i], nxt = content[i + 1];
                        if (inStr) { stripped += ch; if (ch === '\\\\' && strCh) { stripped += content[++i]; continue; } if (ch === strCh) { inStr = false; strCh = null; } continue; }
                        if (ch === '"' || ch === "'") { inStr = true; strCh = ch; stripped += ch; continue; }
                        if (ch === '/' && nxt === '/') { while (i < content.length && content[i] !== '\\n') i++; continue; }
                        if (ch === '/' && nxt === '*') { i += 2; while (i < content.length) { if (content[i] === '*' && content[i + 1] === '/') { i += 2; break; } i++; } continue; }
                        stripped += ch;
                    }
                    config = JSON.parse(stripped);
                } catch { config = void 0; }`;

    if (content.includes(oldCode)) {
      content = content.replace(oldCode, newCode);
      writeFileSync(jsPath, content);
      patchedCount++;
    }
  }
  console.log(`[postinstall] Patched ${patchedCount} @stryker-mutator/core dist copies for TS7 compatibility`);
}

patchCore();
