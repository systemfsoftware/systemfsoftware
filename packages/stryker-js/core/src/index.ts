import { reporterPluginsFileUrl, strykerPlugins } from './reporters/index.js'
import { runStrykerCli } from './stryker-cli.js'
import { Stryker } from './stryker.js'

export { runStrykerCli, Stryker }
export { reporterPluginsFileUrl, strykerPlugins }

// One default export for backward compatibility
export default Stryker
