import { TestProject } from "@ttsc/testing";

import { assert, fs, path, resolveNodeBinary } from "../../internal/project";

/**
 * Verifies relative runtime capability probes use current executable state.
 *
 * Two embedders can use the same `./node` spelling from different roots, and a
 * long-lived host can see an absolute candidate replaced after a successful
 * probe. Cached capability must never authorize either different executable.
 */
export const test_resolvenodebinary_scopes_relative_capability_cache_to_cwd =
  (): void => {
    const root = TestProject.tmpdir("ttsc-relative-node-capability-");
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    const name =
      process.platform === "win32" ? "candidate-node.exe" : "candidate-node";
    const candidate = path.join(first, name);
    try {
      fs.linkSync(process.execPath, candidate);
    } catch {
      fs.copyFileSync(process.execPath, candidate);
    }
    if (process.platform !== "win32") fs.chmodSync(candidate, 0o755);
    const relative = `./${name}`;
    const env = { ...process.env, TTSC_NODE_BINARY: relative };

    assertSameAbsoluteFile(resolveNodeBinary(env, first), candidate);
    assert.equal(resolveNodeBinary(env, second), process.execPath);

    const absoluteEnv = { ...process.env, TTSC_NODE_BINARY: candidate };
    assertSameAbsoluteFile(resolveNodeBinary(absoluteEnv, first), candidate);
    fs.rmSync(candidate);
    fs.writeFileSync(candidate, "not a JavaScript runtime\n", "utf8");
    if (process.platform !== "win32") fs.chmodSync(candidate, 0o755);
    assertSameAbsoluteFile(
      resolveNodeBinary(absoluteEnv, first),
      process.execPath,
    );

    const late = path.join(
      second,
      process.platform === "win32" ? "late-node.exe" : "late-node",
    );
    const lateEnv: NodeJS.ProcessEnv = {
      TTSC_NODE_BINARY: `.${path.sep}${path.basename(late)}`,
    };
    assert.equal(resolveNodeBinary(lateEnv, second), process.execPath);
    fs.copyFileSync(process.execPath, late);
    if (process.platform !== "win32") fs.chmodSync(late, 0o755);
    assertSameAbsoluteFile(resolveNodeBinary(lateEnv, second), late);
  };

function assertSameAbsoluteFile(
  actual: string | undefined,
  expected: string,
): void {
  assert.ok(actual !== undefined && path.isAbsolute(actual), String(actual));
  const actualStats = fs.statSync(actual);
  const expectedStats = fs.statSync(expected);
  assert.equal(actualStats.dev, expectedStats.dev);
  assert.equal(actualStats.ino, expectedStats.ino);
}
