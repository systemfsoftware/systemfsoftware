package linthost

import (
  "strings"
  "testing"
)

// TestWebsiteRuleAnchorAuditNamesAFamilyWithNoPage verifies a deleted or
// renamed family page fails the audit for every rule in that family.
//
// The page path is implied by the family name, so this is the one failure that
// breaks a whole family's links at once instead of a single anchor. Reporting
// it per rule rather than once per family keeps the message actionable: the
// reader learns which links are dead, not only that a file moved.
//
//  1. Point the audit at a loader that reports the page missing.
//  2. Run it over two rules of that family.
//  3. Assert both are reported, naming the file that does not exist.
func TestWebsiteRuleAnchorAuditNamesAFamilyWithNoPage(t *testing.T) {
  rules := []string{"boundaries/element-types", "boundaries/entry-point"}
  for _, name := range rules {
    if !strings.HasPrefix(ruleDocumentationURL(name), websiteRuleDocsBaseURL) {
      t.Fatalf("rule %q no longer carries a ttsc.dev link; pick another fixture rule", name)
    }
  }

  gaps, checked := auditWebsiteRuleAnchors(rules, func(string) (string, bool) { return "", false })
  if checked != len(rules) {
    t.Fatalf("audit checked %d rules, want %d", checked, len(rules))
  }
  if len(gaps) != len(rules) {
    t.Fatalf("audit reported %d gaps, want one per rule: %+v", len(gaps), gaps)
  }
  for i, gap := range gaps {
    if gap.Rule != rules[i] {
      t.Fatalf("gap %d names %q, want %q", i, gap.Rule, rules[i])
    }
    want := "website/src/content/docs/lint/rules/boundaries.mdx does not exist"
    if gap.Reason != want {
      t.Fatalf("gap %d reason = %q, want %q", i, gap.Reason, want)
    }
  }
}
