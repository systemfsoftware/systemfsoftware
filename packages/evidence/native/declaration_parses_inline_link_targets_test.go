package evidence

import "testing"

/**
 * Verifies the braced grammar: an inline link target is consumed through its
 * closing brace, and the prose after it is the reason.
 *
 * A whitespace-delimited token would stop at `{@link`, leaving the symbol name
 * in the reason and reporting a repair the author cannot make. The brace is the
 * boundary that a code target needs and a path target never did.
 *
 *  1. Parse an `@evidence` tag whose target is an inline link.
 *  2. Read back the target and the reason.
 *  3. Assert the interior is the target and the rest is the reason.
 */
func TestDeclarationParsesInlineLinkTarget(t *testing.T) {
  parsed := parseDeclarations(
    "/** @evidence {@link api.functional.questions.get} Renders this operation. */",
  )
  if len(parsed) != 1 {
    t.Fatalf("expected one declaration, got %d", len(parsed))
  }
  if !isInlineLinkTarget(parsed[0].Target) {
    t.Fatalf("expected an inline link target, got %q", parsed[0].Target)
  }
  if inlineLinkTarget(parsed[0].Target) != "api.functional.questions.get" {
    t.Fatalf("target: %q", inlineLinkTarget(parsed[0].Target))
  }
  if parsed[0].Reason != "Renders this operation." {
    t.Fatalf("reason: %q", parsed[0].Reason)
  }
}

/**
 * Verifies every inline link spelling opens a target.
 *
 * `{@linkcode}` and `{@linkplain}` resolve names exactly as `{@link}` does, so
 * accepting only the shortest spelling would reject a citation TypeScript is
 * perfectly happy to count as a use.
 *
 *  1. Parse each supported inline link spelling.
 *  2. Read back each target.
 *  3. Assert all three resolve to the same symbol.
 */
func TestDeclarationAcceptsEveryInlineLinkSpelling(t *testing.T) {
  for _, comment := range []string{
    "/** @evidence {@link ISale} Mirrors the contract. */",
    "/** @evidence {@linkcode ISale} Mirrors the contract. */",
    "/** @evidence {@linkplain ISale} Mirrors the contract. */",
  } {
    parsed := parseDeclarations(comment)
    if len(parsed) != 1 || inlineLinkTarget(parsed[0].Target) != "ISale" {
      t.Fatalf("comment %q parsed as %+v", comment, parsed)
    }
  }
}

/**
 * Verifies a path target is untouched by the braced grammar.
 *
 * The negative twin that keeps the extension an extension. Markdown and Swagger
 * targets stay one whitespace-delimited token, and a change that quietly
 * reinterpreted them would break every existing citation.
 *
 *  1. Parse Markdown and Swagger targets.
 *  2. Read back each target and reason.
 *  3. Assert neither is treated as an inline link.
 */
func TestDeclarationKeepsPathTargetsWhitespaceDelimited(t *testing.T) {
  for comment, want := range map[string]string{
    "/** @evidence docs/spec.md#pricing Derives from this section. */": "docs/spec.md#pricing",
    "/** @evidence POST:/members Follows this operation. */":           "POST:/members",
  } {
    parsed := parseDeclarations(comment)
    if len(parsed) != 1 {
      t.Fatalf("comment %q parsed as %+v", comment, parsed)
    }
    if isInlineLinkTarget(parsed[0].Target) {
      t.Fatalf("comment %q became an inline link target", comment)
    }
    if parsed[0].Target != want {
      t.Fatalf("target: %q, want %q", parsed[0].Target, want)
    }
  }
}

/**
 * Verifies the two-token Swagger hazard does not recur through the brace path.
 *
 * `POST /members` must still parse as the target `POST` with the rest as its
 * reason, because the parser has no reference context to tell a Swagger path
 * from a TypeScript symbol named `POST`. The brace is what supplies a boundary
 * where one is genuinely needed.
 *
 *  1. Parse a space-separated Swagger-looking target.
 *  2. Read back the target.
 *  3. Assert the first token alone is the target.
 */
func TestDeclarationPreservesTheSingleTokenRuleWithoutBraces(t *testing.T) {
  parsed := parseDeclarations("/** @evidence POST /members Creates a member. */")
  if len(parsed) != 1 || parsed[0].Target != "POST" {
    t.Fatalf("parsed as %+v", parsed)
  }
  if parsed[0].Reason != "/members Creates a member." {
    t.Fatalf("reason: %q", parsed[0].Reason)
  }
}

/**
 * Verifies an unterminated link is malformed rather than silently retargeted.
 *
 * Falling back to whitespace splitting would produce the target `{@link`, whose
 * diagnostic names a symbol nobody wrote. Leaving it to the malformed-
 * declaration path reports the tag the author actually typed.
 *
 *  1. Parse a tag whose inline link is never closed.
 *  2. Read back the target.
 *  3. Assert it is not an inline link target.
 */
func TestDeclarationRejectsUnterminatedInlineLinks(t *testing.T) {
  parsed := parseDeclarations("/** @evidence {@link ISale Mirrors the contract. */")
  if len(parsed) != 1 {
    t.Fatalf("parsed as %+v", parsed)
  }
  if isInlineLinkTarget(parsed[0].Target) {
    t.Fatalf("an unterminated link became a link target: %q", parsed[0].Target)
  }
}

/**
 * Verifies an empty or multi-word link interior is not a target.
 *
 * `{@link }` names nothing and `{@link A B}` names two things, and a target
 * identity that accepted either would resolve against a symbol name containing
 * a space, which no declaration can have.
 *
 *  1. Parse an empty link and a two-word link.
 *  2. Read back each target.
 *  3. Assert neither becomes an inline link target.
 */
func TestDeclarationRejectsEmptyAndMultiWordInlineLinks(t *testing.T) {
  for _, comment := range []string{
    "/** @evidence {@link } Mirrors the contract. */",
    "/** @evidence {@link ISale IShoppingSale} Mirrors the contract. */",
  } {
    parsed := parseDeclarations(comment)
    if len(parsed) == 1 && isInlineLinkTarget(parsed[0].Target) {
      t.Fatalf("comment %q became an inline link target", comment)
    }
  }
}

/**
 * Verifies `@evidenceExclude` shares the grammar.
 *
 * The exclusion tag has the same target identity as `@evidence`, so a grammar
 * that extended only the positive form would make an exclusion unable to name
 * the very target it excludes.
 *
 *  1. Parse an exclusion whose target is an inline link.
 *  2. Read back the tag kind and the target.
 *  3. Assert both survive.
 */
func TestDeclarationParsesInlineLinkExclusions(t *testing.T) {
  parsed := parseDeclarations(
    "/** @evidenceExclude {@link ISale} This screen intentionally omits it. */",
  )
  if len(parsed) != 1 || parsed[0].Tag != tagExclude {
    t.Fatalf("parsed as %+v", parsed)
  }
  if inlineLinkTarget(parsed[0].Target) != "ISale" {
    t.Fatalf("target: %q", inlineLinkTarget(parsed[0].Target))
  }
}
