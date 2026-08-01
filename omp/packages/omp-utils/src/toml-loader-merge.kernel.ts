/**
 * Kernel cell — pure per-key merge for the layered TOML config.
 *
 * Vocabulary-free: operates on any `Record<string, readonly V[]>`. The
 * adapter wraps it with `TomlConfig` to apply it to the branded domain
 * type.
 *
 * Precedence (gitconfig model): a later layer replaces a key's whole
 * value; arrays are NEVER concatenated. Folded left-to-right so `user →
 * project → local` gives `local` the final word.
 */
export const mergeByOverride = <V>(
  layers: ReadonlyArray<Readonly<Record<string, readonly V[]>>>,
): Record<string, readonly V[]> => {
  const out: Record<string, readonly V[]> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer) as ReadonlyArray<readonly [string, readonly V[]]>) {
      out[key] = value
    }
  }
  return out
}
