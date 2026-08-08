import { reporterPluginsFileUrl, strykerPlugins } from './reporters/index.js'
import { Stryker, type StrykerHostOptions } from './stryker.js'

export { Stryker }
export type { StrykerHostOptions }
export { reporterPluginsFileUrl, strykerPlugins }

// One default export for backward compatibility
export default Stryker
