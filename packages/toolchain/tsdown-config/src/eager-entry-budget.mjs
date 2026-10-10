const FORBIDDEN_EXTERNAL = /^(effect|@effect\/)/

/**
 * Fails the build when an omp plugin entry would cost too much at startup.
 *
 * The host awaits `import(entry)` and runs a scoped Bun `onLoad` hook over every
 * module in the graph, so startup pays for the entry's *static* closure only —
 * dynamic imports are deferred and deliberately not counted. Two ways to blow it:
 * leaving `effect` external (~400 unbundled modules, measured ~30s), or statically
 * reaching a heavy chunk from the entry (e.g. importing a barrel).
 *
 * Its consumer-facing types live in `eager-entry-budget.d.mts`; the JSDoc here
 * borrows them, so the two cannot drift apart unnoticed.
 *
 * @param {{ readonly maxBytes?: number }} [options]
 * @returns {import('./eager-entry-budget.mjs').EagerEntryBudgetPlugin}
 */
export function eagerEntryBudget({ maxBytes = 32 * 1024 } = {}) {
  return {
    name: 'omp-eager-entry-budget',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        /** @returns {c is import('./eager-entry-budget.mjs').BudgetedChunk} */ (c) => c.type === 'chunk',
      )
      const entries = chunks.filter((c) => c.isEntry && /(?:^|\/)index\.js$/.test(c.fileName))

      if (entries.length === 0) return

      /** @type {Set<string>} */
      const externals = new Set()
      for (const chunk of chunks) {
        for (const specifier of chunk.imports) {
          if (!bundle[specifier] && FORBIDDEN_EXTERNAL.test(specifier)) externals.add(specifier)
        }
      }
      if (externals.size > 0) {
        this.error(
          `[omp] externalized ${[...externals].sort().join(', ')} — the host taxes every module in ` +
            `the graph, so these must be bundled via deps.alwaysBundle in tsdown.config.ts`,
        )
      }

      for (const entry of entries) {
        /** @type {Set<string>} */
        const seen = new Set()
        /** @param {string} fileName */
        const walk = (fileName) => {
          if (seen.has(fileName)) return
          const chunk = bundle[fileName]
          if (!chunk || chunk.type !== 'chunk') return
          seen.add(fileName)
          for (const next of chunk.imports) walk(next)
        }
        walk(entry.fileName)

        let bytes = 0
        for (const fileName of seen) {
          const chunk = bundle[fileName]
          if (chunk?.type === 'chunk') bytes += Buffer.byteLength(chunk.code, 'utf8')
        }
        if (bytes > maxBytes) {
          this.error(
            `[omp] ${entry.fileName} statically pulls ${bytes} bytes (budget ${maxBytes}) via ` +
              `${[...seen].join(', ')} — this is paid on every startup; defer it behind a dynamic import`,
          )
        }
      }
    },
  }
}
