package linthost

import (
  "os"
  "path/filepath"
  "runtime"
  "strings"
  "testing"
)

// TestWebsiteRulePagesDocumentEveryLinkedRule verifies every rule whose
// diagnostic links at ttsc.dev has the heading that link anchors on.
//
// TestRuleDocumentationURLsCoverTheBuiltinCorpus proves the derivation and
// stops there: it never opens an .mdx file, so the day a rule joins a
// documented family without its heading, every editor gets a deep link to an
// anchor that does not exist and the suite stays green. This reads the pages the
// links point at, and derives the anchor through websiteRuleAnchor rather than
// reimplementing the slug, so the check cannot drift from the thing it guards.
//
//  1. Collect every built-in rule whose documentation URL is a ttsc.dev link.
//  2. Read website/src/content/docs/lint/rules/<family>.mdx for each family.
//  3. Assert every carried anchor exists as a level-3 heading on that page.
func TestWebsiteRulePagesDocumentEveryLinkedRule(t *testing.T) {
  docs := websiteRuleDocsDir(t)
  gaps, checked := auditWebsiteRuleAnchors(builtInRuleNamesForDocs(), func(family string) (string, bool) {
    data, err := os.ReadFile(filepath.Join(docs, family+".mdx"))
    if err != nil {
      return "", false
    }
    return string(data), true
  })
  for _, gap := range gaps {
    t.Errorf(
      "rule %q links to %s.mdx#%s, but %s",
      gap.Rule, gap.Family, gap.Anchor, gap.Reason,
    )
  }
  if checked == 0 {
    t.Fatal("no rule resolved to a ttsc.dev documentation link; the sweep proved nothing")
  }
}

// builtInRuleNamesForDocs lists the registered built-in rule names the
// documentation audit runs over. Contributor adapters and retired ledger names
// are excluded by ruleDocumentationURL itself, so the audit takes the whole
// registry and lets the runtime decide what carries a link.
func builtInRuleNamesForDocs() []string {
  names := make([]string, 0, len(builtInRuleCodes))
  for _, name := range AllRuleNames() {
    if _, builtIn := builtInRuleCodes[name]; builtIn {
      names = append(names, name)
    }
  }
  return names
}

// websiteRuleAnchorGap is one rule whose documentation link points at a heading
// the website does not carry. It names the rule and the anchor because that is
// the whole point of the check: a summary count would not say what to write.
type websiteRuleAnchorGap struct {
  Rule   string
  Family string
  Anchor string
  Reason string
}

// auditWebsiteRuleAnchors compares each rule's documentation link against the
// page it points at, and returns the gaps plus the number of rules checked.
//
// Only ttsc.dev links are audited. `format` carries no link at all (its 17
// rules have no per-rule page), and the upstream-linked families resolve to
// eslint.org, typescript-eslint.io, or the eslint-plugin-unicorn repository, so
// no local file could answer for them. Family and anchor are read back out of
// the URL rather than recomputed, so the audit asserts against the bytes that
// actually reach the editor.
//
// `page` returns the MDX source for a family and whether that page exists,
// which lets the synthetic cases drive the audit without touching the tree.
func auditWebsiteRuleAnchors(
  rules []string,
  page func(family string) (string, bool),
) ([]websiteRuleAnchorGap, int) {
  gaps := []websiteRuleAnchorGap{}
  anchorsByFamily := map[string]map[string]struct{}{}
  missingPages := map[string]bool{}
  checked := 0
  for _, name := range rules {
    href := ruleDocumentationURL(name)
    if !strings.HasPrefix(href, websiteRuleDocsBaseURL) {
      continue
    }
    checked++
    family, anchor, _ := strings.Cut(strings.TrimPrefix(href, websiteRuleDocsBaseURL), "#")
    if _, seen := anchorsByFamily[family]; !seen {
      source, exists := page(family)
      missingPages[family] = !exists
      anchorsByFamily[family] = websiteRuleAnchorsIn(source)
    }
    if missingPages[family] {
      gaps = append(gaps, websiteRuleAnchorGap{
        Rule:   name,
        Family: family,
        Anchor: anchor,
        Reason: "website/src/content/docs/lint/rules/" + family + ".mdx does not exist",
      })
      continue
    }
    if _, documented := anchorsByFamily[family][anchor]; !documented {
      gaps = append(gaps, websiteRuleAnchorGap{
        Rule:   name,
        Family: family,
        Anchor: anchor,
        Reason: "that page carries no level-3 heading with this anchor; add \"### `" + name + "`\" to it",
      })
    }
  }
  return gaps, checked
}

// websiteRuleAnchorsIn returns the anchor id of every level-3 heading in an MDX
// page.
//
// The heading text is unwrapped from its code span and slugged through
// websiteRuleAnchor, the same transform ruleDocumentationURL emits, so the two
// sides cannot drift. Prose headings (`### Disallow`) contribute an anchor no
// rule name can produce and are simply never matched. Headings inside a fenced
// code block are skipped: a fenced example is documentation of markup, not a
// heading the renderer assigns an id to.
func websiteRuleAnchorsIn(page string) map[string]struct{} {
  anchors := map[string]struct{}{}
  fence := ""
  for _, raw := range strings.Split(page, "\n") {
    line := strings.TrimSuffix(raw, "\r")
    if marker := markdownFenceMarker(line); marker != "" {
      switch {
      case fence == "":
        fence = marker
      case strings.TrimSpace(line) == marker && strings.HasPrefix(marker, fence):
        fence = ""
      }
      continue
    }
    if fence != "" || !strings.HasPrefix(line, "### ") {
      continue
    }
    heading := strings.Trim(strings.TrimSpace(strings.TrimPrefix(line, "### ")), "`")
    if heading == "" {
      continue
    }
    anchors[websiteRuleAnchor(heading)] = struct{}{}
  }
  return anchors
}

// markdownFenceMarker returns the backtick or tilde run that opens or closes a
// fenced code block on `line`, or "" when the line is not a fence.
func markdownFenceMarker(line string) string {
  for _, char := range []byte{'`', '~'} {
    length := 0
    for length < len(line) && line[length] == char {
      length++
    }
    if length >= 3 {
      return line[:length]
    }
  }
  return ""
}

// websiteRuleDocsDir returns the repository's
// website/src/content/docs/lint/rules directory.
//
// scripts/test-go-lint.cjs copies packages/lint into a scratch module and
// flattens packages/lint/test/**.go into scratch/linthost, so runtime.Caller
// points inside that copy and no path relative to this file reaches the
// website. The scratch go.work is the anchor that survives the copy: the runner
// writes it with an absolute `use` entry for packages/ttsc and one per in-tree
// shim module, so walking upward from any absolute entry lands on the
// repository root. Failing rather than skipping is deliberate, because a silent
// skip is the same hole this check exists to close.
func websiteRuleDocsDir(t *testing.T) string {
  t.Helper()
  _, thisFile, _, ok := runtime.Caller(0)
  if !ok {
    t.Fatal("runtime.Caller(0) returned ok=false; cannot locate the scratch module root")
  }
  work := filepath.Join(filepath.Dir(filepath.Dir(thisFile)), "go.work")
  data, err := os.ReadFile(work)
  if err != nil {
    t.Fatalf("read scratch go.work %s: %v", work, err)
  }
  for _, line := range strings.Split(string(data), "\n") {
    entry := strings.TrimSpace(line)
    if rest, found := strings.CutPrefix(entry, "use"); found {
      entry = strings.TrimSpace(rest)
    }
    // Only an absolute entry is a usable anchor. test-go-lint.cjs writes the
    // scratch module itself as "." (Go's workspace membership check rejects the
    // absolute temp path on Windows); test-go-coverage.cjs writes it
    // absolutely, and that entry simply walks up without finding the tree
    // unless its scratch dir is inside the repository, in which case it finds
    // the same one.
    candidate := filepath.FromSlash(strings.Trim(entry, `"`))
    if !filepath.IsAbs(candidate) {
      continue
    }
    for dir := candidate; ; {
      docs := filepath.Join(dir, "website", "src", "content", "docs", "lint", "rules")
      if stat, statErr := os.Stat(docs); statErr == nil && stat.IsDir() {
        return docs
      }
      parent := filepath.Dir(dir)
      if parent == dir {
        break
      }
      dir = parent
    }
  }
  t.Fatalf("no `use` entry in %s reaches website/src/content/docs/lint/rules:\n%s", work, data)
  return ""
}
