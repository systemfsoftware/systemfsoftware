package evidence

import (
  "os"
  "path/filepath"
  "testing"
)

const packageManifest = `{
  "name": "@org/api",
  "main": "./lib/index.js",
  "exports": { ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" } }
}`

/**
 * Verifies a package reference materializes a symbol nothing imports.
 *
 * This is the reason the population is read from disk rather than the Program.
 * An operation the frontend never called is absent from `ctx.Sources` by
 * definition, and it is exactly the operation an obligation has to name — a
 * graph that could only see imported symbols would report full coverage of the
 * work already done.
 *
 *  1. Install a package declaring two operations and import neither.
 *  2. Select the package as evidence.
 *  3. Assert both are demanded, including the one nothing references.
 */
func TestGraphMaterializesPackageSymbolsNothingImports(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": packageManifest,
    "node_modules/@org/api/lib/index.d.ts": `
export declare function get(): void;
export declare function erase(): void;
`,
    "src/views/detail.ts": "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","symbol":"function"}
  }]}`)
  assertProblemContains(t, messages, "Missing acknowledgement for 'get'")
  assertProblemContains(t, messages, "Missing acknowledgement for 'erase'")
}

/**
 * Verifies the package entry comes from the `types` condition, not from `main`.
 *
 * `main` names the JavaScript a consumer runs; a citation addresses
 * declarations. Following `main` would resolve to a file with no types at all
 * and report an empty population as a satisfied obligation.
 *
 *  1. Point `main` at a JavaScript file and `types` at the declarations.
 *  2. Select the package and acknowledge what its declarations expose.
 *  3. Assert silence, which is only reachable through the `types` condition.
 */
func TestGraphReadsThePackageEntryFromItsTypesCondition(t *testing.T) {
  assertNoProblems(t, runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json":   packageManifest,
    "node_modules/@org/api/lib/index.js":   "export function get() {}\n",
    "node_modules/@org/api/lib/index.d.ts": "export declare function get(): void;\n",
    "src/views/detail.ts": `
import type * as api from "@org/api";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","symbol":"function"}
  }]}`))
}

/**
 * Verifies a bare `types` field is honored when there is no exports map.
 *
 * Older packages ship exactly this shape, and a resolver that only understood
 * `exports` would silently reach nothing for them.
 *
 *  1. Publish a package whose manifest carries only `types`.
 *  2. Select it as evidence.
 *  3. Assert its symbol is demanded.
 */
func TestGraphReadsThePackageEntryFromABareTypesField(t *testing.T) {
  assertProblemContains(t, runIndexRule(t, map[string]string{
    "node_modules/legacy-api/package.json": `{"name":"legacy-api","types":"./index.d.ts"}`,
    "node_modules/legacy-api/index.d.ts":   "export declare function get(): void;\n",
    "src/views/detail.ts":                  "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"legacy-api","symbol":"function"}
  }]}`), "Missing acknowledgement for 'get'")
}

/**
 * Verifies globs inside a package resolve against the package root.
 *
 * Narrowing a large SDK to one area is the difference between an obligation a
 * team can adopt and one they switch off. Resolving those globs against the
 * project root instead would match nothing and read as a satisfied population.
 *
 *  1. Publish a package with two areas, both reachable from its entry.
 *  2. Narrow the reference to one of them with a package-relative glob.
 *  3. Assert only that area is demanded, under the address the entry gives it.
 */
func TestGraphResolvesPackageGlobsAgainstThePackageRoot(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": packageManifest,
    "node_modules/@org/api/lib/index.d.ts": `
export * as questions from "./questions/get.js";
export * as reviews from "./reviews/erase.js";
`,
    "node_modules/@org/api/lib/questions/get.d.ts": "export declare function get(): void;\n",
    "node_modules/@org/api/lib/reviews/erase.d.ts": "export declare function erase(): void;\n",
    "src/views/detail.ts":                          "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/questions/**"],"symbol":"function"}
  }]}`)
  assertProblemContains(t, messages, "Missing acknowledgement for 'questions.get'")
  if countProblemsContaining(messages, "Missing acknowledgement for 'reviews.erase'") != 0 {
    t.Fatalf("a package glob leaked outside the area it selected:\n%v", messages)
  }
}

/**
 * Verifies a package glob carries in what its matched barrel re-exports.
 *
 * A generated SDK narrowed to one area is a barrel plus the modules under it,
 * and the barrel is what a consumer imports. Taking only the declarations that
 * happen to sit in a matched `.d.ts` would leave the area's own surface partly
 * outside its obligation while the glob still reads as selecting that area.
 *
 *  1. Publish an area whose barrel re-exports a module beside it.
 *  2. Narrow the reference to the area alone.
 *  3. Assert the re-exported operation is demanded under the address the package
 *     entry gives it, and a neighbouring area still stays out.
 */
func TestGraphPackageGlobsCarryTheirBarrelReExports(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": packageManifest,
    "node_modules/@org/api/lib/index.d.ts": `
export * as questions from "./questions/index.js";
`,
    "node_modules/@org/api/lib/questions/index.d.ts": `
export * from "./get.js";
export * as details from "./detail.js";
`,
    "node_modules/@org/api/lib/questions/get.d.ts":    "export declare function get(): void;\n",
    "node_modules/@org/api/lib/questions/detail.d.ts": "export declare function detail(): void;\n",
    "node_modules/@org/api/lib/reviews/erase.d.ts":    "export declare function erase(): void;\n",
    "src/views/detail.ts":                             "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/questions/index.d.ts"],"symbol":"function"}
  }]}`)
  assertProblemContains(t, messages, "Missing acknowledgement for 'questions.get'")
  assertProblemContains(t, messages, "Missing acknowledgement for 'questions.details.detail'")
  if countProblemsContaining(messages, "Missing acknowledgement for 'erase'") != 0 {
    t.Fatalf("a barrel traversal reached outside the area its glob selected:\n%v", messages)
  }
}

/**
 * Verifies an uninstalled package is reported rather than silently empty.
 *
 * A population that resolves to nothing produces no obligations, and coverage
 * would then pass. Naming the resolution order tells the author which of the
 * three manifest fields to correct.
 *
 *  1. Select a package that is not installed.
 *  2. Evaluate the graph.
 *  3. Assert the failure names the package and the entry resolution order.
 */
func TestGraphReportsAnUnresolvablePackageReference(t *testing.T) {
  assertProblemContains(t, runIndexRule(t, map[string]string{
    "src/views/detail.ts": "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/absent","symbol":"function"}
  }]}`), "could not resolve the declaration entry of package '@org/absent'")
}

// nestedAccessorPackage is the shape a generated SDK installs: an entry that
// nests its surface one namespace segment at a time, so the address a consumer
// writes is several segments longer than the module that declares the symbol.
func nestedAccessorPackage() map[string]string {
  return map[string]string{
    "node_modules/@org/api/package.json": packageManifest,
    "node_modules/@org/api/lib/index.d.ts": `
export * as functional from "./functional/index.js";
`,
    "node_modules/@org/api/lib/functional/index.d.ts": `
export * as health from "./health/index.js";
export * as reviews from "./reviews/index.js";
`,
    "node_modules/@org/api/lib/functional/health/index.d.ts":  "export declare function get(): void;\n",
    "node_modules/@org/api/lib/functional/reviews/index.d.ts": "export declare function erase(): void;\n",
    "src/views/detail.ts": `import type * as api from "@org/api";

/** @evidence {@link api.functional.health.get} Renders this operation's response. */
export function detail(): void {}
`,
  }
}

/**
 * Verifies a narrowed package reference keeps the address its units are cited
 * by.
 *
 * `files` exists to make a large SDK adoptable, and it defeated itself: every
 * matched module became a traversal entry, so `functional.health.get` collapsed
 * to `get` while an inline link still resolved under the package entry, the only
 * module a consumer has a specifier for. No spelling of the target resolved, so
 * a reference could be adoptable or citable and never both.
 *
 *  1. Install a package that nests its surface two segments below the entry.
 *  2. Cite its operations by the addresses a consumer can write, once with the
 *     reference narrowed to one subtree and once with no narrowing at all.
 *  3. Assert both are silent, so the narrowing changed the population and not
 *     the address.
 */
func TestGraphNarrowedPackageReferenceKeepsEntryAddresses(t *testing.T) {
  assertNoProblems(t, runIndexRule(t, nestedAccessorPackage(), `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/functional/health/**"],"symbol":"function"}
  }]}`))

  wide := nestedAccessorPackage()
  wide["src/views/detail.ts"] = `import type * as api from "@org/api";

/**
 * @evidence {@link api.functional.health.get} Renders this operation's response.
 * @evidence {@link api.functional.reviews.erase} Removes a review.
 */
export function detail(): void {}
`
  assertNoProblems(t, runIndexRule(t, wide, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","symbol":"function"}
  }]}`))
}

/**
 * Verifies the narrowing still narrows.
 *
 * Publishing every address from the entry would be equally silent if the glob
 * had quietly stopped filtering, and that is worse than the defect it replaces:
 * the whole package surface would owe acknowledgement while the configuration
 * still read as adoptable.
 *
 *  1. Narrow the same package to one of its two areas.
 *  2. Cite neither operation.
 *  3. Assert the selected area is owed under its entry address and the other
 *     area is not owed at all.
 */
func TestGraphNarrowedPackageReferenceStillFiltersMembership(t *testing.T) {
  files := nestedAccessorPackage()
  files["src/views/detail.ts"] = "export function detail(): void {}\n"
  messages := runIndexRule(t, files, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/functional/health/**"],"symbol":"function"}
  }]}`)
  assertProblemContains(t, messages, "Missing acknowledgement for 'functional.health.get'")
  if countProblemsContaining(messages, "Missing acknowledgement") != 1 {
    t.Fatalf("the glob stopped narrowing the population:\n%v", messages)
  }
}

/**
 * Verifies a glob matching only modules the entry does not publish is reported.
 *
 * Such a unit has no address a consumer can write, so demanding an
 * acknowledgement for it would demand one nobody can discharge. Selecting
 * nothing is the honest answer and has to be a loud one, because an empty
 * population otherwise reads exactly like a satisfied obligation.
 *
 *  1. Install a package whose entry publishes one area and not another.
 *  2. Narrow the reference to the unpublished area.
 *  3. Assert the empty population names the entry as the reason.
 */
func TestGraphReportsAPackageGlobOutsideTheEntrySurface(t *testing.T) {
  assertProblemContains(t, runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": packageManifest,
    "node_modules/@org/api/lib/index.d.ts": `
export * as questions from "./questions/get.js";
`,
    "node_modules/@org/api/lib/questions/get.d.ts": "export declare function get(): void;\n",
    "node_modules/@org/api/lib/internal/tool.d.ts": "export declare function tool(): void;\n",
    "src/views/detail.ts":                          "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/internal/**"],"symbol":"function"}
  }]}`), "reachable from the package entry")
}

/**
 * Verifies a package glob sees a package installed as a link.
 *
 * A workspace dependency is a link on every platform a package manager
 * supports: pnpm links by default, and npm and Yarn do the same for a linked
 * package. Enumerating the spelled path with a walker that treats a link as a
 * plain entry finds nothing, so the reference reports an empty population
 * instead of an unresolvable one — and an empty population demands nothing,
 * which reads as full coverage of work that was never checked.
 *
 *  1. Install the package outside `node_modules` and link it into place.
 *  2. Select it with a glob, exactly as a monorepo consumer does.
 *  3. Assert the operation behind the link is still demanded.
 */
func TestGraphPackageGlobsFollowALinkedInstall(t *testing.T) {
  root := t.TempDir()
  store := filepath.Join(root, "packages", "api")
  if err := os.MkdirAll(filepath.Join(store, "lib"), 0o755); err != nil {
    t.Fatal(err)
  }
  for name, content := range map[string]string{
    "package.json":           packageManifest,
    "lib/index.d.ts":         "export * as questions from \"./questions/get.js\";\n",
    "lib/questions/get.d.ts": "export declare function get(): void;\n",
  } {
    absolute := filepath.Join(store, filepath.FromSlash(name))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  linked := filepath.Join(root, "node_modules", "@org", "api")
  if err := os.MkdirAll(filepath.Dir(linked), 0o755); err != nil {
    t.Fatal(err)
  }
  if err := linkDirectory(store, linked); err != nil {
    t.Skipf("this platform refuses directory links to unprivileged callers: %v", err)
  }
  assertProblemContains(t, runIndexRuleAtRoot(t, root, map[string]string{
    "src/views/detail.ts": "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["lib/**"],"symbol":"function"}
  }]}`), "Missing acknowledgement for 'questions.get'")
}

/**
 * Verifies a source-first workspace package resolves its entry from `exports`.
 *
 * A pnpm TypeScript monorepo links a package that has no emit: its `exports`
 * target and `main` both name `./src/index.ts`, which is at once what a
 * consumer imports and where the declarations are. Refusing that target leaves
 * the reference with no entry, and units then publish under the module that
 * matched rather than under the specifier a citation can spell — the state that
 * turns `functional.health.get` into `get`.
 *
 *  1. Install a package whose `exports` names TypeScript source directly.
 *  2. Select it through a glob, so membership and addressing differ.
 *  3. Assert the obligation is addressed from the entry, not from the module.
 */
func TestGraphResolvesTheEntryOfASourceFirstPackage(t *testing.T) {
  assertProblemContains(t, runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": `{
  "name": "@org/api",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}`,
    "node_modules/@org/api/src/index.ts": `
export * as functional from "./functional/index";
`,
    "node_modules/@org/api/src/functional/index.ts": `
export * as health from "./health";
`,
    "node_modules/@org/api/src/functional/health.ts": `
export function get(): void {}
`,
    "src/views/detail.ts": "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["src/**"],"symbol":"function"}
  }]}`), "Missing acknowledgement for 'functional.health.get'")
}

/**
 * Verifies a declared `types` still wins over a TypeScript runtime entry.
 *
 * Following the runtime entry is the last resort, not a preference. A package
 * that names its declarations has said where they are, and reading its source
 * entry instead would address a different file than the one it publishes.
 *
 *  1. Declare `types` beside an `exports` target that names TypeScript source.
 *  2. Acknowledge only what the declarations expose.
 *  3. Assert silence, which is reachable only through `types`.
 */
func TestGraphPrefersDeclaredTypesOverATypeScriptRuntimeEntry(t *testing.T) {
  assertNoProblems(t, runIndexRule(t, map[string]string{
    "node_modules/@org/api/package.json": `{
  "name": "@org/api",
  "types": "./lib/index.d.ts",
  "exports": { ".": "./src/index.ts" }
}`,
    "node_modules/@org/api/lib/index.d.ts": "export declare function get(): void;\n",
    "node_modules/@org/api/src/index.ts":   "export function get(): void {}\nexport function erase(): void {}\n",
    "src/views/detail.ts": `
import type * as api from "@org/api";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/views/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","symbol":"function"}
  }]}`))
}

/**
 * Verifies a nested Program resolves a package installed above it.
 *
 * `packages/backend/test` is its own ttsc project, but the package manager
 * installed into `packages/backend/node_modules` one level up. Looking only
 * beside the project root leaves that Program unable to read the manifest of a
 * package it imports, and a reference with no resolved entry addresses its
 * units through the module that matched instead of the specifier a citation can
 * spell.
 *
 *  1. Install the package one directory above the project root.
 *  2. Select it from the nested project.
 *  3. Assert the obligation carries the address the entry gives it.
 */
func TestGraphResolvesAPackageInstalledAboveTheProject(t *testing.T) {
  root := t.TempDir()
  project := filepath.Join(root, "test")
  if err := os.MkdirAll(project, 0o755); err != nil {
    t.Fatal(err)
  }
  for name, content := range map[string]string{
    "node_modules/@org/api/package.json": `{
  "name": "@org/api",
  "exports": { ".": "./src/index.ts" }
}`,
    "node_modules/@org/api/src/index.ts":  "export * as health from \"./health\";\n",
    "node_modules/@org/api/src/health.ts": "export function get(): void {}\n",
  } {
    absolute := filepath.Join(root, filepath.FromSlash(name))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  assertProblemContains(t, runIndexRuleAtRoot(t, project, map[string]string{
    "features/detail.ts": "export function detail(): void {}\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["features/**"],
    "symbol":"function",
    "reference":{"type":"typescript","package":"@org/api","files":["src/**"],"symbol":"function"}
  }]}`), "Missing acknowledgement for 'health.get'")
}
