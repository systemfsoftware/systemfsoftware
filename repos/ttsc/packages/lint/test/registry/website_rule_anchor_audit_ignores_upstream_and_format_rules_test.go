package linthost

import (
  "sort"
  "testing"
)

// TestWebsiteRuleAnchorAuditIgnoresUpstreamAndFormatRules verifies the audit
// asks for no local page outside the website-documented families.
//
// The boundary the existing corpus sweep already pins from the other side.
// `format` carries no link at all, because its 17 rules have no per-rule page,
// and the upstream-linked families plus bare core rules resolve to eslint.org,
// typescript-eslint.io, and the eslint-plugin-unicorn repository. Asserting on
// the families the audit asked for, rather than only on the absence of gaps,
// is what catches an audit that reads the wrong file and finds it by accident.
//
//  1. Run the audit over a format rule, both upstream families, and a core rule.
//  2. Assert it reported no gap.
//  3. Assert it requested no page at all.
func TestWebsiteRuleAnchorAuditIgnoresUpstreamAndFormatRules(t *testing.T) {
  // An unregistered fixture rule would also derive no ttsc.dev link, and would
  // let this pass for the wrong reason. `format/semi` is the one that must
  // derive nothing at all; the other three must derive a real upstream page.
  if got := ruleDocumentationURL("format/semi"); got != "" {
    t.Fatalf("format/semi now derives %q; the format boundary moved", got)
  }
  for _, name := range []string{"unicorn/no-null", "typescript/no-explicit-any", "no-alert"} {
    if got := ruleDocumentationURL(name); got == "" {
      t.Fatalf("rule %q derives no documentation URL; pick another fixture rule", name)
    }
  }

  requested := []string{}
  gaps, checked := auditWebsiteRuleAnchors(
    []string{"format/semi", "unicorn/no-null", "typescript/no-explicit-any", "no-alert"},
    func(family string) (string, bool) {
      requested = append(requested, family)
      return "", false
    },
  )
  if len(gaps) != 0 {
    t.Fatalf("audit reported gaps for rules with no ttsc.dev page: %+v", gaps)
  }
  if checked != 0 {
    t.Fatalf("audit checked %d rules, want 0 outside the website-documented families", checked)
  }
  if len(requested) != 0 {
    sort.Strings(requested)
    t.Fatalf("audit read local pages for %v, which are documented upstream or not at all", requested)
  }
}
