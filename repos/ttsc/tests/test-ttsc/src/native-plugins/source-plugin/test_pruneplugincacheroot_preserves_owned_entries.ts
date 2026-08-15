import { TestProject } from "@ttsc/testing";

import {
  acquirePluginBuildLock,
  assert,
  fs,
  path,
  prunePluginCacheRoot,
  releasePluginBuildLock,
} from "../../internal/source-build";

/** Active generations and the just-returned binary survive an LRU pass. */
export const test_pruneplugincacheroot_preserves_owned_entries = (): void => {
  const root = path.join(
    TestProject.tmpdir("ttsc-plugin-cache-owned-"),
    "plugins",
  );
  fs.mkdirSync(root, { recursive: true });
  const now = Date.now();
  const old = now - 31 * 24 * 60 * 60 * 1000;
  const seed = (name: string): string => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "plugin"), name, "utf8");
    fs.writeFileSync(path.join(directory, ".last-used"), `${old}\n`, "utf8");
    return directory;
  };
  const activeLegacy = seed("active-legacy");
  const activeV2 = seed("active-v2");
  const returned = seed("returned");
  const evictable = seed("evictable");

  // A young metadata-less legacy holder cannot yet be disproven alive.
  fs.mkdirSync(`${activeLegacy}.lock`);
  const legacyNow = new Date(now);
  fs.utimesSync(`${activeLegacy}.lock`, legacyNow, legacyNow);
  const lease = acquirePluginBuildLock(`${activeV2}.lock`);
  assert.ok(lease, "fixture failed to acquire an active v2 generation");
  try {
    prunePluginCacheRoot(root, {
      force: true,
      maxBytes: 1,
      now,
      protectedAgeMs: 0,
      protectedEntries: [returned],
      targetBytes: 0,
    });
    assert.equal(fs.existsSync(activeLegacy), true);
    assert.equal(fs.existsSync(activeV2), true);
    assert.equal(fs.existsSync(returned), true);
    assert.equal(fs.existsSync(evictable), false);
  } finally {
    releasePluginBuildLock(`${activeV2}.lock`, lease);
  }
};
