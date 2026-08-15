package evidence

import (
  "path/filepath"
  "strings"
  "testing"
)

/**
 * Verifies the containment shortcut answers exactly what `filepath.Rel` would.
 *
 * `relativeProjectPath` decides which files belong to a population, and it is
 * asked once per source file per configured base on every rebuild — which is
 * why a shortcut exists at all. A shortcut that answers differently from the
 * form it stands in for does not make the rule faster, it makes the population
 * different, and a file admitted or dropped there is an obligation appearing or
 * disappearing with no diagnostic to notice it.
 *
 * Case is the trap, and the shortcut's one rule is what disarms it: declining is
 * always safe, accepting is not. `filepath.Rel` compares path elements the way
 * the platform does — case-insensitively on Windows, case-sensitively
 * everywhere else — so a shortcut that folds case accepts a differently-cased
 * sibling that POSIX rejects. Comparing exactly can only ever decline early,
 * which the general form below then answers correctly on both.
 *
 * The case rows therefore agree on Windows by construction and only bite on a
 * case-sensitive filesystem. They are not redundant there; they are the reason
 * CI runs Linux and macOS.
 *
 *  1. Take roots and paths that sit below, beside, above, and beyond each other.
 *  2. Answer each through `relativeProjectPath`.
 *  3. Assert the answer matches the general form's, shortcut or not.
 */
func TestPathShortcutAgreesWithTheGeneralForm(t *testing.T) {
  cases := []struct {
    name     string
    root     string
    absolute string
  }{
    {name: "below", root: "/repo", absolute: "/repo/src/x.ts"},
    {name: "directly below", root: "/repo", absolute: "/repo/x.ts"},
    {name: "unclean segment", root: "/repo", absolute: "/repo/./src/x.ts"},
    {name: "ascending", root: "/repo", absolute: "/repo/../other/x.ts"},
    {name: "beside", root: "/repo", absolute: "/other/x.ts"},
    {name: "case-different root", root: "/repo/API", absolute: "/repo/api/x.ts"},
    {name: "case-different file", root: "/repo", absolute: "/REPO/x.ts"},
    {name: "prefix without separator", root: "/repo", absolute: "/repository/x.ts"},
    {name: "equal", root: "/repo", absolute: "/repo"},
    {name: "empty root", root: "", absolute: "/repo/x.ts"},
    {name: "empty path", root: "/repo", absolute: ""},
  }
  for _, test := range cases {
    t.Run(test.name, func(t *testing.T) {
      relative, ok := relativeProjectPath(test.root, test.absolute)
      wantRelative, wantOk := generalRelativeProjectPath(
        test.root,
        test.absolute,
      )
      if ok != wantOk || relative != wantRelative {
        t.Fatalf(
          "relativeProjectPath(%q, %q) = (%q, %v), general form = (%q, %v)",
          test.root,
          test.absolute,
          relative,
          ok,
          wantRelative,
          wantOk,
        )
      }
    })
  }
}

// generalRelativeProjectPath is the form the shortcut stands in for, kept here
// so the comparison is against the rule rather than against a remembered answer.
func generalRelativeProjectPath(root string, absolute string) (string, bool) {
  if root == "" || absolute == "" {
    return "", false
  }
  relative, err := filepath.Rel(root, absolute)
  if err != nil {
    return "", false
  }
  relative = strings.ReplaceAll(relative, "\\", "/")
  if relative == ".." || strings.HasPrefix(relative, "../") {
    return "", false
  }
  return strings.TrimPrefix(relative, "./"), true
}

/**
 * Verifies the loader's normalization shortcut answers what the general form
 * would.
 *
 * `projectPath` is the identity every module candidate and Program source is
 * keyed by, so two spellings that normalize differently become two modules. The
 * shortcut returns a path unchanged when it is already that identity; anything
 * else has to fall through.
 *
 *  1. Take clean, unclean, absolute, and separator-mixed spellings.
 *  2. Normalize each through the loader.
 *  3. Assert the shortcut and the general form agree.
 */
func TestLoaderNormalizationShortcutAgreesWithTheGeneralForm(t *testing.T) {
  loader := &typeScriptLoader{root: "/repo"}
  for _, value := range []string{
    "src/x.ts",
    "node_modules/@org/api/lib/index.d.ts",
    "./src/x.ts",
    "src/../src/x.ts",
    "src\\x.ts",
    "/repo/src/x.ts",
    "",
  } {
    t.Run(value, func(t *testing.T) {
      shortcut := loader.projectPath(value)
      if isCleanProjectRelativePath(value) && shortcut != value {
        t.Fatalf("a clean path was rewritten to %q", shortcut)
      }
      general := generalProjectPath(loader.root, value)
      if value != "" && shortcut != general {
        t.Fatalf(
          "projectPath(%q) = %q, general form = %q",
          value,
          shortcut,
          general,
        )
      }
    })
  }
}

func generalProjectPath(root string, relative string) string {
  local := filepath.FromSlash(relative)
  absolute := local
  if !filepath.IsAbs(local) {
    absolute = filepath.Join(filepath.FromSlash(root), local)
  }
  projectRelative, err := filepath.Rel(
    filepath.FromSlash(root),
    filepath.Clean(absolute),
  )
  if err != nil {
    return filepath.ToSlash(filepath.Clean(absolute))
  }
  return strings.TrimPrefix(filepath.ToSlash(projectRelative), "./")
}
