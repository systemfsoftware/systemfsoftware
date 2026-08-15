package banner_test

import (
  "path/filepath"
  "testing"
)

// TestConfigToolAnchorsListsTheConfigThenTheProjectRoot verifies the anchor
// list is the config file first and the resolution root's manifest second.
//
// Anchor order is the whole policy, and it is shared with the JS evaluator's
// `resolveConfigTsgo` / `resolveTtsxLauncher`: the config file decides, because
// its own installation carries the toolchain its imports were written against;
// the resolution root answers only for a config the project tree does not
// contain. Both entries are dropped when blank rather than contributing a walk
// that starts wherever the process happens to be.
//
//  1. Build the list from a config path and a resolution root.
//  2. Assert the order and the manifest suffix on the second entry.
//  3. Assert a blank config path and a blank root each contribute nothing.
func TestConfigToolAnchorsListsTheConfigThenTheProjectRoot(t *testing.T) {
  root := filepath.Join("project", "root")
  config := filepath.Join(root, "packages", "app", "banner.config.ts")

  anchors := bannerConfigToolAnchors(config, root)
  want := []string{config, filepath.Join(root, "package.json")}
  if len(anchors) != len(want) {
    t.Fatalf("configToolAnchors = %v, want %v", anchors, want)
  }
  for i, anchor := range want {
    if anchors[i] != anchor {
      t.Fatalf("configToolAnchors[%d] = %q, want %q (full: %v)", i, anchors[i], anchor, anchors)
    }
  }

  // The negative twins: a blank entry is absent, not an empty-string anchor
  // that would make the walk start from the process working directory.
  if only := bannerConfigToolAnchors("   ", root); len(only) != 1 || only[0] != filepath.Join(root, "package.json") {
    t.Fatalf("configToolAnchors with a blank config = %v, want the root manifest alone", only)
  }
  if only := bannerConfigToolAnchors(config, "   "); len(only) != 1 || only[0] != config {
    t.Fatalf("configToolAnchors with a blank root = %v, want the config alone", only)
  }
  if none := bannerConfigToolAnchors("", ""); len(none) != 0 {
    t.Fatalf("configToolAnchors with nothing to anchor on = %v, want an empty list", none)
  }
}
