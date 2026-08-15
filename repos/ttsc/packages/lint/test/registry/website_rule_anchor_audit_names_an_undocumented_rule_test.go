package linthost

import (
  "strings"
  "testing"
)

// TestWebsiteRuleAnchorAuditNamesAnUndocumentedRule verifies the audit fails,
// by name, for a rule whose heading is missing from its family's page.
//
// The negative twin of the corpus sweep, and the reason the sweep is worth
// having: removing a heading and adding a rule to a documented family produce
// the same state, a required anchor with no heading behind it, and both must
// break loudly enough to say what to write. The page also hides a heading for
// the missing rule inside a fenced code block, because a fenced example is
// markup the renderer never assigns an id to; counting it would let a page
// document a rule by quoting it.
//
//  1. Build a page documenting one rule and fencing the other's heading.
//  2. Run the audit over both rules.
//  3. Assert only the undocumented rule is reported, with its anchor.
func TestWebsiteRuleAnchorAuditNamesAnUndocumentedRule(t *testing.T) {
  documented := "boundaries/element-types"
  missing := "boundaries/entry-point"
  for _, name := range []string{documented, missing} {
    if !strings.HasPrefix(ruleDocumentationURL(name), websiteRuleDocsBaseURL) {
      t.Fatalf("rule %q no longer carries a ttsc.dev link; pick another fixture rule", name)
    }
  }

  page := "# Architecture boundaries\n\n" +
    "### `" + documented + "`\n\nProse.\n\n" +
    "```md\n### `" + missing + "`\n```\n"
  gaps, checked := auditWebsiteRuleAnchors(
    []string{documented, missing},
    func(string) (string, bool) { return page, true },
  )
  if checked != 2 {
    t.Fatalf("audit checked %d rules, want 2", checked)
  }
  if len(gaps) != 1 {
    t.Fatalf("audit reported %d gaps, want exactly the undocumented rule: %+v", len(gaps), gaps)
  }
  if gaps[0].Rule != missing {
    t.Fatalf("audit reported %q, want the undocumented %q", gaps[0].Rule, missing)
  }
  if want := websiteRuleAnchor(missing); gaps[0].Anchor != want {
    t.Fatalf("audit reported anchor %q, want %q", gaps[0].Anchor, want)
  }
  if !strings.Contains(gaps[0].Reason, "### `"+missing+"`") {
    t.Fatalf("audit reason %q does not say which heading to add", gaps[0].Reason)
  }
}
