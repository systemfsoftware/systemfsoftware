package evidence

import "testing"

/**
 * Verifies glob matching: the three documented wildcards retain their segment
 * boundaries across nested paths.
 *
 * The superseded matcher made a bare directory recursive, contradicting every
 * public files property. These positive and negative twins make the documented
 * path language the executable oracle.
 *
 *  1. Compile `*`, `**`, and `?` patterns.
 *  2. Match adjacent root, nested, and suffix-length cases.
 *  3. Assert only the documented paths are selected.
 */
func TestGlobHonorsWildcardAndBareDirectorySemantics(t *testing.T) {
  cases := []struct {
    pattern string
    path    string
    want    bool
  }{
    {"docs/*.md", "docs/spec.md", true},
    {"docs/*.md", "docs/nested/spec.md", false},
    {"docs/**/*.md", "docs/spec.md", true},
    {"docs/**/*.md", "docs/nested/spec.md", true},
    {"scripts/check-?.ts", "scripts/check-a.ts", true},
    {"scripts/check-?.ts", "scripts/check-ab.ts", false},
    {"docs", "docs/spec.md", false},
    {"docs/", "docs/spec.md", false},
    {"docs/**", "docs/spec.md", true},
  }
  for _, entry := range cases {
    globs, err := newGlobSet([]string{entry.pattern})
    if err != nil {
      t.Fatal(err)
    }
    if got := globs.matches(entry.path); got != entry.want {
      t.Errorf("%q matching %q = %v, want %v", entry.pattern, entry.path, got, entry.want)
    }
  }
}

/**
 * Verifies glob portability: slash normalization, case-sensitive identity, and
 * ordered exclusions behave the same on Windows and POSIX.
 *
 * Configuration commonly crosses developer and CI hosts. Normalizing separators
 * without normalizing case preserves portable spelling while keeping one true
 * path identity.
 *
 *  1. Mix backslash and slash patterns.
 *  2. Exclude a subtree and re-include one file.
 *  3. Assert separators normalize, order applies, and case does not.
 */
func TestGlobNormalizesSeparatorsAndAppliesOrderedExclusions(t *testing.T) {
  globs, err := newGlobSet([]string{
    `docs\**\*.md`,
    `!docs/private/**`,
    `docs/private/public.md`,
  })
  if err != nil {
    t.Fatal(err)
  }
  for _, path := range []string{"docs/spec.md", `docs\nested\spec.md`, "docs/private/public.md"} {
    if !globs.matches(path) {
      t.Errorf("expected %q to be included", path)
    }
  }
  if globs.matches("docs/private/secret.md") {
    t.Fatal("excluded subtree remained selected")
  }
  if globs.matches("Docs/spec.md") {
    t.Fatal("case-insensitive match changed path identity")
  }
}

/**
 * Verifies directory pruning follows positive glob prefixes instead of a
 * hard-coded list of ignored folder names.
 *
 * The filesystem walk may skip a subtree only when no configured positive
 * pattern can match a file below it. Names such as `lib` and `node_modules` are
 * ordinary project-relative segments when the public config selects them.
 *
 *  1. Compile one exact subtree glob and one `**` glob.
 *  2. Check matching and impossible directory prefixes.
 *  3. Assert configured folder names remain traversable.
 */
func TestGlobDirectoryPruningRespectsConfiguredPrefixes(t *testing.T) {
  scoped, err := newGlobSet([]string{"lib/contracts/**"})
  if err != nil {
    t.Fatal(err)
  }
  if !scoped.couldMatchDescendant("lib") ||
    !scoped.couldMatchDescendant("lib/contracts") {
    t.Fatal("configured lib subtree was pruned")
  }
  if scoped.couldMatchDescendant("docs") ||
    scoped.couldMatchDescendant("lib/other") {
    t.Fatal("impossible subtree remained traversable")
  }

  broad, err := newGlobSet([]string{"**/*.md"})
  if err != nil {
    t.Fatal(err)
  }
  if !broad.couldMatchDescendant("node_modules/package") {
    t.Fatal("a documented ** glob was narrowed by directory name")
  }
}

/**
 * Verifies files patterns reject every Windows path form that carries a drive
 * identity, including drive-relative paths.
 *
 * `C:docs/spec.md` is not absolute according to the Windows path API, but it is
 * still resolved against drive C rather than the project root. Accepting it
 * would violate the project-relative contract while looking superficially safe.
 *
 *  1. Compile an ordinary project-relative pattern.
 *  2. Compile drive-absolute and drive-relative patterns.
 *  3. Assert only the project-relative form is accepted.
 */
func TestGlobRejectsWindowsDrivePaths(t *testing.T) {
  if _, err := newGlobSet([]string{"docs/**/*.md"}); err != nil {
    t.Fatalf("project-relative glob was rejected: %v", err)
  }
  for _, pattern := range []string{`C:\docs\**\*.md`, `C:docs\**\*.md`} {
    if _, err := newGlobSet([]string{pattern}); err == nil {
      t.Fatalf("drive path %q was accepted", pattern)
    }
  }
}

/**
 * Verifies empty glob matches respect claim activation and reference health.
 *
 * A healthy claim with no selected host is inactive, including when its glob
 * matches no file. An active claim's empty reference is different: the host
 * exists and its configured proof population must therefore diagnose emptiness.
 *
 *  1. Point one claim glob at no TypeScript file and require silence.
 *  2. Activate its twin with one selected export and match no reference file.
 *  3. Assert only the active claim reports its empty reference population.
 */
func TestGlobEmptyClaimIsInactiveWhileEmptyReferenceReports(t *testing.T) {
  claimMessages := runIndexRule(t, map[string]string{
    "docs/spec.md": "## Spec",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
  }]}`)
  assertNoProblems(t, claimMessages)

  referenceMessages := runIndexRule(t, map[string]string{
    "src/ref.ts": "export interface Ref {}",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
  }]}`)
  assertProblemContains(t, referenceMessages, "reference 1")
  assertProblemContains(t, referenceMessages, "matched no markdown files")
}
