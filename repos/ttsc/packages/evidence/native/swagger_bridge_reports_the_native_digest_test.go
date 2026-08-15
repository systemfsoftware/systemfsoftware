package evidence

import (
  "os"
  "path/filepath"
  "strings"
  "testing"
)

// swaggerBridgeRoot materializes a project the real Node bridge can load from.
//
// The directory lives under `tests/test-evidence` rather than in the system
// temp area, because the bridge resolves `@ttsc/evidence` by
// name from the root it is handed. That name resolves in exactly one place in
// this workspace — the feature suite's `node_modules`, which pnpm links to this
// package — and a directory outside the workspace cannot see it at all.
func swaggerBridgeRoot(t *testing.T, document string) string {
  t.Helper()
  suite := filepath.Join("..", "..", "..", "tests", "test-evidence")
  if _, err := os.Stat(filepath.Join(suite, "node_modules", "@ttsc", "evidence")); err != nil {
    t.Fatalf("the feature suite must link this package before the bridge can be exercised; run `pnpm install`: %v", err)
  }
  if _, err := os.Stat(filepath.Join("..", "lib", "internal", "loadSwaggerOperations.js")); err != nil {
    t.Fatalf("the bridge normalizer must be compiled before it can be exercised; run `pnpm build`: %v", err)
  }
  created, err := os.MkdirTemp(suite, "swagger-bridge-")
  if err != nil {
    t.Fatal(err)
  }
  t.Cleanup(func() { _ = os.RemoveAll(created) })
  // Absolute, because the bridge builds a `createRequire` base from this and
  // Node rejects a relative one. Every production caller resolves the project
  // root through `filepath.Abs` for the same reason.
  root, err := filepath.Abs(created)
  if err != nil {
    t.Fatal(err)
  }
  if err := os.WriteFile(filepath.Join(root, "swagger.json"), []byte(document), 0o644); err != nil {
    t.Fatal(err)
  }
  return root
}

/**
 * Verifies the normalizer reports the same digest the native side computes for
 * the same file.
 *
 * This is the one part of the cache that fails in total silence. The two halves
 * hash in different languages — Go over the bytes it read, Node over the bytes
 * it read — and if they ever disagree, every lookup misses, every cycle spawns,
 * and every result stays correct. Nothing goes red; the feature simply stops
 * existing, and no test of either half alone would notice.
 *
 * It runs the real bridge rather than a stand-in, because a stand-in would be
 * this repository agreeing with itself about an encoding question that only the
 * two real implementations can settle.
 *
 *  1. Normalize one document through the actual Node bridge.
 *  2. Compute the same file's digest natively.
 *  3. Assert the two agree and are not empty.
 */
func TestSwaggerBridgeReportsTheNativeDigest(t *testing.T) {
  root := swaggerBridgeRoot(t, `{"openapi":"3.1.0","info":{"title":"B","version":"1"},"paths":{"/members":{"post":{"responses":{"200":{"description":"OK"}}}}}}`)
  result, err := normalizeSwaggerSources(root, []string{"swagger.json"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 {
    t.Fatalf("expected one normalized document, got %d (%v)", len(result.Documents), result.Problems)
  }
  native := swaggerContentDigest(root, "swagger.json")
  if native == "" {
    t.Fatal("the native side must hash a readable document")
  }
  if result.Documents[0].Digest != native {
    t.Fatalf(
      "the bridge and the native side must hash the same bytes identically\n  bridge: %q\n  native: %q",
      result.Documents[0].Digest,
      native,
    )
  }
}

/**
 * Verifies a rejected document still reports its digest.
 *
 * A rejection is remembered under the bytes that produced it, so a normalizer
 * that returned a digest only on success would leave every broken document
 * re-normalized on every cycle — the state where the edit loop is tightest and
 * the spawn hurts most. The failure would be invisible, because the diagnostic
 * is identical either way.
 *
 *  1. Normalize a document whose OpenAPI version is unsupported.
 *  2. Assert it comes back as a problem rather than an inventory.
 *  3. Assert the problem carries the same digest the native side computes.
 */
func TestSwaggerBridgeReportsADigestForARejectedDocument(t *testing.T) {
  root := swaggerBridgeRoot(t, `{"openapi":"4.0.0","info":{"title":"B","version":"1"},"paths":{}}`)
  result, err := normalizeSwaggerSources(root, []string{"swagger.json"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Problems) != 1 {
    t.Fatalf("expected one rejected document, got %d (%v)", len(result.Problems), result.Documents)
  }
  native := swaggerContentDigest(root, "swagger.json")
  if result.Problems[0].Digest != native {
    t.Fatalf(
      "a rejection must be attributable to the bytes that caused it\n  bridge: %q\n  native: %q",
      result.Problems[0].Digest,
      native,
    )
  }
}

/**
 * Verifies a document the bridge cannot read at all reports no digest.
 *
 * There are no bytes to attribute an outcome to, so remembering one would key a
 * result on a file that was never read. The native side already declines to
 * hash a missing file; this pins the other end of the same rule, so neither
 * side is the only thing standing between an unreadable source and the cache.
 *
 *  1. Normalize a source that does not exist.
 *  2. Assert it comes back as a problem.
 *  3. Assert its digest is empty.
 */
func TestSwaggerBridgeReportsNoDigestForAnUnreadableDocument(t *testing.T) {
  root := swaggerBridgeRoot(t, `{"openapi":"3.1.0","paths":{}}`)
  result, err := normalizeSwaggerSources(root, []string{"absent.json"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Problems) != 1 {
    t.Fatalf("expected one rejected source, got %d", len(result.Problems))
  }
  if result.Problems[0].Digest != "" {
    t.Fatalf("an unread source must carry no digest, got %q", result.Problems[0].Digest)
  }
  if swaggerContentDigest(root, "absent.json") != "" {
    t.Fatal("the native side must decline to hash a missing file")
  }
}

/**
 * Verifies one normalizer run answers a mixed request for both outcomes.
 *
 * The loader sends every miss in one request, so a bridge that stopped at the
 * first rejection would leave the healthy documents beside it unresolved — and
 * they would be reported as "returned no result", a diagnostic that blames the
 * installation rather than the broken file the author actually has to fix.
 *
 *  1. Normalize one valid document and one unsupported document together.
 *  2. Assert each lands on its own side of the result.
 *  3. Assert both carry the digest of their own bytes.
 */
func TestSwaggerBridgeAnswersEverySourceInOneRequest(t *testing.T) {
  root := swaggerBridgeRoot(t, `{"openapi":"3.1.0","info":{"title":"B","version":"1"},"paths":{"/members":{"post":{"responses":{"200":{"description":"OK"}}}}}}`)
  if err := os.WriteFile(
    filepath.Join(root, "broken.json"),
    []byte(`{"openapi":"4.0.0","info":{"title":"B","version":"1"},"paths":{}}`),
    0o644,
  ); err != nil {
    t.Fatal(err)
  }
  result, err := normalizeSwaggerSources(root, []string{"swagger.json", "broken.json"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 || result.Documents[0].Source != "swagger.json" {
    t.Fatalf("the valid document must normalize, got %+v", result.Documents)
  }
  if len(result.Problems) != 1 || result.Problems[0].Source != "broken.json" {
    t.Fatalf("the unsupported document must be rejected, got %+v", result.Problems)
  }
  if result.Documents[0].Digest != swaggerContentDigest(root, "swagger.json") ||
    result.Problems[0].Digest != swaggerContentDigest(root, "broken.json") {
    t.Fatal("each source must carry the digest of its own bytes, not of the request")
  }
  if strings.TrimSpace(result.Problems[0].Message) == "" {
    t.Fatal("a rejection must carry the reason the author has to act on")
  }
}
