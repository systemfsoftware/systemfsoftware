// Run the Go rule tests for `@ttsc/evidence`.
//
// This runner is deliberately thinner than `test-go-lint.cjs`. That one has to
// materialize a scratch module because the lint tests reach unexported
// `linthost` internals and must sit beside the library sources. The evidence
// rules are an ordinary Go package with its own tests, and the package already
// carries a `go.mod` whose `replace` directives point at the sibling packages
// in this workspace, so `go test ./native/` compiles them against the `ttsc`
// and `@ttsc/lint` sources in this tree rather than a published release.
//
// That `go.mod` sits one level above `native/` on purpose: ttsc copies the
// directory a contributor's `source` names into `@ttsc/lint`'s own module and
// rejects a `go.mod` inside it. The file exists for tooling like this runner
// and `gopls`, never for the build.

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageDir = path.join(root, "packages", "evidence");

function main() {
  if (!fs.existsSync(path.join(packageDir, "native"))) {
    console.error(
      "test-go-evidence: packages/evidence/native is missing; nothing to run.",
    );
    process.exit(1);
  }
  const result = cp.spawnSync("go", ["test", "-count=1", "./native/"], {
    cwd: packageDir,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      `test-go-evidence: failed to run go: ${result.error.message}`,
    );
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
