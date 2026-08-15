import fs from "node:fs";
import path from "node:path";

import { suiteRoot } from "./suiteRoot";

/**
 * Pins the ttsc plugin build cache to one suite-owned directory.
 *
 * The default location is `<workspaceRoot>/node_modules/.cache/ttsc`, and every
 * workspace here is a fresh temporary tree with a fresh `node_modules` — so the
 * default makes every prepared workspace pay the cold Go link that statically
 * links this plugin into the lint binary, which ttsc itself warns "can take
 * several minutes on a cold Go cache". Pointing every workspace at one stable
 * cache means the first run pays once and the rest are seconds.
 *
 * The cache is keyed by content, so sharing it is not a stale-result risk:
 * editing a rule changes the key and the affected runs relink. The feature
 * suite in `tests/test-evidence` pins its own cache the same way.
 */
export const pluginCacheDirectory = (): string => {
  const location: string = path.join(suiteRoot, ".cache", "ttsc");
  fs.mkdirSync(location, { recursive: true });
  return location;
};
