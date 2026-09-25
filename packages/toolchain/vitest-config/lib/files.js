/**
 * The file helpers the config and the gate share. Every call is asynchronous, so a config that reads a
 * manifest, resolves a guard or scans a source set never blocks the event loop it shares.
 */
import { access, readFile } from 'node:fs/promises'

/**
 * Whether a path exists, as a value rather than a throw.
 *
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export const exists = (path) => access(path).then(() => true, () => false)

/**
 * The first path that exists, or undefined when none does.
 *
 * @param {ReadonlyArray<string>} paths
 * @returns {Promise<string | undefined>}
 */
export const firstExisting = async (paths) =>
  (await Promise.all(paths.map(async (path) => ((await exists(path)) ? path : undefined)))).find(
    (path) => path !== undefined,
  )

/**
 * @param {string} path
 * @returns {Promise<unknown>}
 */
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
