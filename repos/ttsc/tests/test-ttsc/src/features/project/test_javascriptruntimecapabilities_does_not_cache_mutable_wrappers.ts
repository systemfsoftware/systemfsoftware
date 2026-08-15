import { TestProject } from "@ttsc/testing";

import {
  assert,
  fs,
  javascriptRuntimeCapabilities,
  path,
} from "../../internal/project";

/**
 * Verifies runtime capability caching excludes mutable executable wrappers.
 *
 * An absolute wrapper has stable filesystem identity while its environment can
 * redirect execution from Node to Bun. Caching the first child's capabilities
 * by wrapper identity alone pins the wrong descriptor runtime in a long-lived
 * host.
 *
 * 1. Point one stable POSIX wrapper at the current Node executable and probe it.
 * 2. Redirect the unchanged wrapper to a Bun-shaped executable response.
 * 3. Assert the second probe observes the new runtime instead of cached Node.
 */
export const test_javascriptruntimecapabilities_does_not_cache_mutable_wrappers =
  (): void => {
    if (process.platform === "win32") return;
    const root = TestProject.tmpdir("ttsc-runtime-wrapper-capability-");
    const wrapper = path.join(root, "runtime-wrapper");
    const alternate = path.join(root, "alternate-runtime");
    fs.writeFileSync(
      wrapper,
      '#!/bin/sh\nexec "$TTSC_TEST_RUNTIME_TARGET" "$@"\n',
      "utf8",
    );
    fs.writeFileSync(
      alternate,
      [
        "#!/usr/bin/env node",
        "process.stdout.write(JSON.stringify({",
        "  bun: true,",
        "  executable: process.argv[1],",
        "  registerHooks: false,",
        "}));",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.chmodSync(wrapper, 0o755);
    fs.chmodSync(alternate, 0o755);

    const first = javascriptRuntimeCapabilities(
      wrapper,
      { ...process.env, TTSC_TEST_RUNTIME_TARGET: process.execPath },
      root,
    );
    assert.equal(first.bun, false);
    assert.equal(first.registerHooks, true);

    const second = javascriptRuntimeCapabilities(
      wrapper,
      { ...process.env, TTSC_TEST_RUNTIME_TARGET: alternate },
      root,
    );
    assert.equal(second.bun, true);
    assert.equal(second.registerHooks, false);
  };
